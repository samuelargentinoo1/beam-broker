// Gateway de cobrança (boleto registrado + PIX + link de pagamento).
// Com ASAAS_API_KEY configurada, emite cobranças reais na API do Asaas;
// sem chave, opera em modo demo com códigos simulados — o fluxo do sistema
// (webhook de baixa, telas, repasse) é idêntico nos dois modos.

import type { Fatura, Pessoa } from "@prisma/client";
import { modoDemoAtivo, exigirCredencial } from "@/lib/demo";

export type CobrancaEmitida = {
  gatewayId: string;
  pixCopiaECola: string;
  linhaDigitavel: string;
  linkPagamento: string;
};

const ASAAS_BASE = process.env.ASAAS_BASE_URL ?? "https://api.asaas.com/v3";

export async function emitirCobranca(
  fatura: Pick<Fatura, "id" | "valorTotal" | "vencimento" | "competencia">,
  cliente: Pick<Pessoa, "nome" | "cpfCnpj" | "email" | "telefone">,
  // token do Asaas desta imobiliária (Configurações); se vazio, cai na env global
  apiKey?: string | null
): Promise<CobrancaEmitida> {
  const chave = apiKey || process.env.ASAAS_API_KEY;
  if (chave) {
    return emitirAsaas(fatura, cliente, chave);
  }
  // Sem credencial: só simula em modo demo EXPLÍCITO. Em produção sem DEMO=1,
  // lança erro claro — nunca emite uma cobrança que não existe no gateway.
  if (modoDemoAtivo()) return emitirDemo(fatura);
  exigirCredencial("ASAAS_API_KEY", "emitir cobrança");
}

async function emitirAsaas(
  fatura: Pick<Fatura, "id" | "valorTotal" | "vencimento" | "competencia">,
  cliente: Pick<Pessoa, "nome" | "cpfCnpj" | "email" | "telefone">,
  apiKey: string
): Promise<CobrancaEmitida> {
  const headers = {
    "Content-Type": "application/json",
    access_token: apiKey,
  };

  // Cliente no Asaas (idempotente por CPF/CNPJ)
  const cpfCnpj = cliente.cpfCnpj.replace(/\D/g, "");
  const busca = await fetch(`${ASAAS_BASE}/customers?cpfCnpj=${cpfCnpj}`, { headers }).then((r) => r.json());
  let customerId: string = busca.data?.[0]?.id;
  if (!customerId) {
    const novo = await fetch(`${ASAAS_BASE}/customers`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: cliente.nome, cpfCnpj, email: cliente.email, mobilePhone: cliente.telefone }),
    }).then((r) => r.json());
    customerId = novo.id;
  }

  // Cobrança com boleto + PIX
  const pagamento = await fetch(`${ASAAS_BASE}/payments`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      customer: customerId,
      billingType: "UNDEFINED", // boleto, PIX ou cartão — o cliente escolhe
      value: fatura.valorTotal,
      dueDate: new Date(fatura.vencimento).toISOString().slice(0, 10),
      description: `Aluguel — competência ${fatura.competencia}`,
      externalReference: String(fatura.id),
    }),
  }).then((r) => r.json());

  const [pix, boleto] = await Promise.all([
    fetch(`${ASAAS_BASE}/payments/${pagamento.id}/pixQrCode`, { headers }).then((r) => r.json()),
    fetch(`${ASAAS_BASE}/payments/${pagamento.id}/identificationField`, { headers }).then((r) => r.json()),
  ]);

  return {
    gatewayId: pagamento.id,
    pixCopiaECola: pix.payload ?? "",
    linhaDigitavel: boleto.identificationField ?? "",
    linkPagamento: pagamento.invoiceUrl ?? "",
  };
}

// ─── Repasse ao proprietário via PIX (Asaas transfers) ──────────────────────

export type ResultadoTransferencia = {
  ok: boolean;
  modo: "asaas" | "manual";
  transferId?: string;
  detalhe: string;
};

// Descobre o tipo da chave PIX para a API do Asaas.
function tipoChavePix(chave: string): "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP" {
  const c = chave.trim();
  if (/@/.test(c)) return "EMAIL";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return "EVP";
  const digitos = c.replace(/\D/g, "");
  // Telefone quando: veio com "+", com DDI 55 (12-13 díg.), ou com formatação de
  // telefone (parênteses/hífen no padrão de DDD). 11 dígitos "limpos" fica como
  // CPF (a chave de celular deve ser cadastrada como +55DDDNÚMERO); 10 dígitos
  // não é CPF/CNPJ, então é telefone fixo.
  const temFormatoTelefone = /[()]/.test(c) || /^\+/.test(c);
  if (temFormatoTelefone) return "PHONE";
  if (/^55\d{10,11}$/.test(digitos) || digitos.length === 12 || digitos.length === 13) return "PHONE";
  if (digitos.length === 10) return "PHONE";
  if (digitos.length === 11) return "CPF";
  if (digitos.length === 14) return "CNPJ";
  return "EVP";
}

// Transfere o repasse ao proprietário. Com Asaas configurado e chave PIX do
// proprietário, dispara a transferência PIX real; senão, opera em modo MANUAL
// (o operador faz o PIX na mão — o aviso ao proprietário já traz a chave).
export async function transferirRepassePix(params: {
  valor: number;
  chavePix?: string | null;
  descricao: string;
  apiKey?: string | null;
}): Promise<ResultadoTransferencia> {
  const chave = params.apiKey || process.env.ASAAS_API_KEY;
  if (!chave || !params.chavePix) {
    return { ok: false, modo: "manual", detalhe: "transferência manual (sem Asaas ou sem chave PIX do proprietário)" };
  }
  try {
    const res = await fetch(`${ASAAS_BASE}/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", access_token: chave },
      body: JSON.stringify({
        value: params.valor,
        operationType: "PIX",
        pixAddressKey: params.chavePix,
        pixAddressKeyType: tipoChavePix(params.chavePix),
        description: params.descricao,
      }),
    });
    const dados = await res.json().catch(() => ({}));
    if (!res.ok) {
      const erro = dados?.errors?.[0]?.description ?? `HTTP ${res.status}`;
      return { ok: false, modo: "asaas", detalhe: `Asaas recusou a transferência: ${erro}` };
    }
    return { ok: true, modo: "asaas", transferId: dados.id, detalhe: `transferência PIX Asaas iniciada (${dados.status ?? "PENDING"})` };
  } catch (e) {
    return { ok: false, modo: "asaas", detalhe: `erro ao transferir via Asaas: ${(e as Error).message}` };
  }
}

// Modo demo: gera códigos com formato realista, determinísticos por fatura.
function emitirDemo(fatura: Pick<Fatura, "id" | "valorTotal" | "competencia">): CobrancaEmitida {
  const id = `demo_pay_${fatura.id.toString().padStart(8, "0")}`;
  const valor = fatura.valorTotal.toFixed(2).replace(".", "");
  const digitos = (s: string, n: number) => s.replace(/\D/g, "").padEnd(n, "7").slice(0, n);

  const linhaDigitavel = [
    "23790",
    digitos(String(fatura.id * 41), 5),
    digitos(String(fatura.id * 13), 5),
    digitos(String(fatura.id * 89), 6),
    digitos(String(fatura.id * 7), 5),
    digitos(valor, 6),
    "1",
    digitos(valor, 14),
  ].join("");

  // Estrutura EMV do PIX copia-e-cola (payload simulado para demonstração)
  const pixCopiaECola =
    `00020126580014BR.GOV.BCB.PIX0136demo-${fatura.id}-${fatura.competencia}` +
    `520400005303986540${fatura.valorTotal.toFixed(2)}5802BR5920ADMINISTRADORA DEMO6009SAO PAULO62070503***6304ABCD`;

  return {
    gatewayId: id,
    pixCopiaECola,
    linhaDigitavel,
    linkPagamento: `https://pagamento.demo/fatura/${id}`,
  };
}
