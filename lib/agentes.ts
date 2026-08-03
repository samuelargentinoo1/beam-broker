// Os agentes de IA do sistema (persona única: Carol) — todos com PODER DE
// ESCRITA via tools:
//
//  RECEPCAO       triagem: descobre o que a pessoa quer e encaminha (interno).
//  CAPTACAO       proprietário quer anunciar (ALUGAR ou VENDER); cadastra o
//                 proprietário e o imóvel na carteira durante a conversa.
//  VENDAS         interessados em ALUGAR; registra leads, agenda visitas e
//                 formaliza propostas (com análise de crédito).
//  COMPRA_VENDA   interessados em COMPRAR um imóvel anunciado; qualifica e
//                 registra proposta de compra (a imobiliária só intermedeia).
//  ADMINISTRACAO  atende locatários e proprietários da carteira; consulta
//                 faturas/repasses e abre ocorrências de manutenção.
//
// Toda informação colhida pela IA vira registro no banco, com trilha de
// auditoria. Sem ANTHROPIC_API_KEY, os agentes respondem em modo demo
// (sem operar cadastros).

import type { AgenteIA, Conversa } from "@prisma/client";
import { prisma } from "@/lib/db";
import { agentesAtivos } from "@/lib/planos";
import type { Agente } from "@/lib/cmv";
import { auditar } from "@/lib/auditoria";
import { resolverInterlocutor } from "@/lib/atendimento";
import { analisarCredito } from "@/lib/credito";
import { montarContexto } from "@/lib/atendimento";
import { enviarWhatsAppMidia } from "@/lib/whatsapp";
import { calcularEncargosAtraso } from "@/lib/financeiro";
import { brl, competenciaBr, diasEmAtraso, proximoNumero } from "@/lib/format";

export const MODELO = "claude-sonnet-5";

// Roteamento de modelo por agente (sobrescrevível por env, p/ testar sem deploy).
// Classificação/consulta vão para o Haiku (mais barato); negociação e captação,
// onde a qualidade vira receita, ficam no Sonnet.
const MODELO_SONNET = process.env.IA_MODELO_SONNET || "claude-sonnet-5";
const MODELO_HAIKU = process.env.IA_MODELO_HAIKU || "claude-haiku-4-5-20251001";
const MODELO_POR_AGENTE: Record<AgenteIA, string> = {
  RECEPCAO: MODELO_HAIKU,
  AJUDA_CORRETOR: MODELO_HAIKU,
  ADMINISTRACAO: MODELO_HAIKU,
  VENDAS: MODELO_SONNET,
  CAPTACAO: MODELO_SONNET,
  COMPRA_VENDA: MODELO_SONNET,
};
function modeloDoAgente(a: AgenteIA): string {
  return MODELO_POR_AGENTE[a] ?? MODELO;
}

// ─── Ferramentas de escrita/consulta (executadas pela IA) ───────────────────

type Ctx = {
  conversa: Conversa;
  // Módulos e add-ons contratados: definem quais agentes existem e, por
  // consequência, quais ferramentas cada um recebe. Cliente com menos módulos
  // manda prompt menor e custa menos — preço e CMV andam juntos.
  modulos: string[];
  addons: string[];
};

// Enriquece o endereço do imóvel a partir do CEP (quando a IA informa um): o CEP
// é a fonte confiável de bairro, cidade, UF e coordenadas. Preserva o endereço
// que a IA colheu (rua/número) e só completa o que faltar. Best-effort.
async function enderecoPorCepIA(input: {
  cep?: string; endereco: string; bairro?: string; cidade: string; uf: string;
}): Promise<{ endereco: string; bairro?: string; cidade: string; uf: string; cep: string | null; latitude: number | null; longitude: number | null }> {
  let { endereco, bairro, cidade, uf } = input;
  let cep: string | null = input.cep ?? null;
  let latitude: number | null = null;
  let longitude: number | null = null;
  if (input.cep) {
    const { buscarCep } = await import("@/lib/cep");
    const e = await buscarCep(input.cep).catch(() => null);
    if (e) {
      cep = e.cep;
      if (e.cidade) cidade = e.cidade;
      if (e.uf) uf = e.uf;
      if (e.bairro && !bairro) bairro = e.bairro;
      // Prefixa a rua do CEP só se o endereço colhido ainda não a contém.
      if (e.logradouro && !endereco.toLowerCase().includes(e.logradouro.toLowerCase()))
        endereco = `${e.logradouro}, ${endereco}`.trim();
      latitude = e.latitude;
      longitude = e.longitude;
    }
  }
  return { endereco, bairro, cidade, uf: uf.toUpperCase(), cep, latitude, longitude };
}


// ─── Apoio à intermediação com o proprietário (M4) ──────────────────────────

// Avisa o INQUILINO que abriu o chamado sobre a decisão do proprietário. É o
// que fecha o ciclo prometido pelo módulo: relato → autorização → resposta.
async function avisarInquilinoDaDecisao(ocorrenciaId: number, aprovado: boolean): Promise<void> {
  const oc = await prisma.ocorrencia.findUnique({
    where: { id: ocorrenciaId },
    include: { contrato: { include: { inquilino: true } }, imovel: true },
  });
  const inquilino = oc?.contrato?.inquilino;
  if (!oc || !inquilino?.telefone) return;
  const texto = aprovado
    ? `Boa notícia! O proprietário autorizou o reparo (${oc.titulo}) no imóvel ${oc.imovel.codigo}. Vamos agendar a execução e te aviso da data.`
    : `Sobre o reparo que você relatou (${oc.titulo}): o proprietário não autorizou o serviço nesses termos. Nossa equipe vai avaliar alternativas e te retorna.`;
  const { enviarWhatsApp } = await import("@/lib/whatsapp");
  await enviarWhatsApp(inquilino.telefone, texto, oc.imovel.imobiliariaId);
}

// Fora do horário comercial o aviso ao proprietário é AGENDADO, não enviado.
// Reaproveita a fila de jobs (lib/fila) quando existir; se não, registra na
// auditoria para a equipe não perder o pedido.
async function enfileirarAvisoProprietario(
  ocorrenciaId: number,
  _telefone: string,
  texto: string,
  quando: Date
): Promise<void> {
  // O agendamento mora na própria ocorrência: o cron de 15 min (lib/monitor →
  // enviarAvisosProprietarioAgendados) despacha o que já venceu. Sem tabela de
  // fila com payload, este é o caminho mais simples que não perde o pedido.
  await prisma.ocorrencia.update({
    where: { id: ocorrenciaId },
    data: { avisoAgendadoPara: quando, avisoTexto: texto },
  });
  await auditar(
    "AVISO_PROPRIETARIO_AGENDADO",
    "Ocorrencia",
    ocorrenciaId,
    `agendado para ${quando.toISOString()}`
  );
}


// Traduz a área pretendida para o MÓDULO que a atenderia — é por módulo que o
// dono lê a demanda represada e decide a ligação de upgrade.
function moduloDaArea(area: string | undefined): string {
  if (area === "CAPTACAO") return "CAPTACAO";
  if (area === "ADMINISTRACAO") return "ADM";
  return "COMERCIAL"; // VENDAS e COMPRA_VENDA
}

async function registrarDemandaNaoAtendida(
  imobiliariaId: number,
  conversaId: number,
  areaPretendida: string | undefined,
  resumo: string | undefined
): Promise<void> {
  const { dentroHorarioComercial } = await import("@/lib/followup");
  await prisma.demandaNaoAtendida.create({
    data: {
      imobiliariaId,
      conversaId,
      modulo: moduloDaArea(areaPretendida),
      resumo: (resumo ?? "demanda não detalhada").slice(0, 300),
      foraDoHorario: !dentroHorarioComercial(new Date()),
    },
  });
}

// NAO_CONTRATADO só vale quando a área que resolveria o pedido não existe nesta
// imobiliária. Devolve a área que DEVERIA atender (e portanto recusa o
// encaminhamento a humano), ou null quando é caso legítimo de humano.
//
// O caso que motivou isto: "quero um Minha Casa Minha Vida" virava
// NAO_CONTRATADO e caía no colo de alguém — sendo que é COMPRA_VENDA, tem
// fluxo próprio e a IA atende do começo ao fim.
const PISTAS_COMPRA = /compr|empreendiment|minha casa|mcmv|lan[çc]ament|na planta|financiament|apartamento na planta/i;

export function areaQueDeveriaAtender(
  demandaDe: string | undefined,
  resumo: string | undefined,
  areasDisponiveis: readonly string[]
): string | null {
  if (demandaDe && areasDisponiveis.includes(demandaDe)) return demandaDe;
  if (PISTAS_COMPRA.test(resumo ?? "") && areasDisponiveis.includes("COMPRA_VENDA"))
    return "COMPRA_VENDA";
  return null;
}

async function toolsPorAgente(ctx: Ctx) {
  const { betaTool } = await import("@anthropic-ai/sdk/helpers/beta/json-schema");

  // Agentes que existem nesta imobiliária. A Recepção só pode encaminhar para
  // eles; qualquer outra demanda vira NAO_CONTRATADO (humano assume).
  const ativos = agentesAtivos(ctx.modulos, ctx.addons);
  const areasDisponiveis = [
    ...(["CAPTACAO", "VENDAS", "COMPRA_VENDA", "ADMINISTRACAO"] as const).filter((a) =>
      ativos.includes(a)
    ),
    "NAO_CONTRATADO",
  ];

  const buscarImoveisDisponiveis = betaTool({
    name: "buscar_imoveis_disponiveis",
    description:
      "Busca imóveis disponíveis para locação na carteira. Use para apresentar opções ao interessado. Filtros opcionais.",
    inputSchema: {
      type: "object",
      properties: {
        tipo: { type: "string", description: "Apartamento, Casa, Sala comercial..." },
        valorMaximo: { type: "number", description: "aluguel máximo em R$" },
        bairro: { type: "string" },
      },
      required: [],
    },
    run: async (input: { tipo?: string; valorMaximo?: number; bairro?: string }) => {
      const imob = await prisma.imobiliaria.findUnique({ where: { id: ctx.conversa.imobiliariaId } });
      const base = {
        imobiliariaId: ctx.conversa.imobiliariaId,
        status: "DISPONIVEL" as const,
        finalidade: { in: ["LOCACAO", "AMBOS"] },
        ...(input.tipo ? { tipo: { contains: input.tipo, mode: "insensitive" as const } } : {}),
        ...(input.valorMaximo ? { valorSugerido: { lte: input.valorMaximo } } : {}),
      };
      // 1) imóveis no próprio bairro pedido
      const exatos = await prisma.imovel.findMany({
        where: { ...base, ...(input.bairro ? { bairro: { contains: input.bairro, mode: "insensitive" } } : {}) },
        include: { _count: { select: { fotos: true } } },
        take: 6,
      });
      // 2) proximidade: se pediu bairro e sobrou espaço, ofereça imóveis PERTO
      //    (até ~2 km do bairro) que não são do bairro exato.
      const proximidade = new Map<number, number>();
      let lista = exatos;
      if (input.bairro && exatos.length < 6) {
        const candidatos = await prisma.imovel.findMany({
          where: { ...base, NOT: { bairro: { contains: input.bairro, mode: "insensitive" } } },
          include: { _count: { select: { fotos: true } } },
          take: 25,
        });
        const { distanciasAoBairro, RAIO_PROXIMIDADE_KM } = await import("@/lib/geo");
        const dist = await distanciasAoBairro(candidatos, input.bairro, imob?.municipio, imob?.uf);
        const perto = candidatos
          .filter((c) => (dist.get(c) ?? Infinity) <= RAIO_PROXIMIDADE_KM)
          .sort((a, b) => (dist.get(a) ?? 9) - (dist.get(b) ?? 9))
          .slice(0, 6 - exatos.length);
        perto.forEach((p) => proximidade.set(p.id, dist.get(p) ?? 0));
        lista = [...exatos, ...perto];
      }
      if (lista.length === 0) return "Nenhum imóvel disponível com esses critérios.";
      const sfPct = Number(imob?.seguroFiancaPercent ?? 11);
      return lista
        .map((i) => {
          const sf = Number(i.valorSugerido ?? 0) * (sfPct / 100);
          const perto = proximidade.get(i.id);
          return (
            `${i.codigo}: ${i.tipo} em ${i.endereco}${i.bairro ? `, ${i.bairro}` : ""} — ${brl(i.valorSugerido)}/mês` +
            (i.valorCondominio ? ` + cond. ${brl(i.valorCondominio)}` : "") +
            ` | com garantia seguro-fiança (+${sfPct}%): ${brl(Number(i.valorSugerido ?? 0) + sf)}/mês de aluguel` +
            (perto !== undefined ? ` | fica a ${perto.toFixed(1)} km de ${input.bairro}` : "") +
            (i._count.fotos > 0 ? ` | ${i._count.fotos} foto(s) — use enviar_fotos_imovel para mandar` : " | (sem fotos cadastradas)")
          );
        })
        .join("\n");
    },
  });

  const enviarFotosImovel = betaTool({
    name: "enviar_fotos_imovel",
    description:
      "Envia as fotos do imóvel em lote pelo WhatsApp do interessado. Use quando o cliente pedir para ver fotos/imagens de um imóvel específico (pelo código, ex.: AP-0002).",
    inputSchema: {
      type: "object",
      properties: {
        codigoImovel: { type: "string", description: "código do imóvel, ex.: AP-0002" },
      },
      required: ["codigoImovel"],
      additionalProperties: false,
    },
    run: async (input: { codigoImovel: string }) => {
      const imovel = await prisma.imovel.findFirst({
        where: { codigo: input.codigoImovel, imobiliariaId: ctx.conversa.imobiliariaId },
        include: { fotos: { orderBy: { ordem: "asc" } } },
      });
      if (!imovel) {
        // Erro clássico: a IA tenta mandar "foto do empreendimento". Foto é da
        // UNIDADE; o prédio na planta não tem foto nenhuma. Devolver só "não
        // encontrado" faz a IA prometer que vai ver com a equipe.
        const empreendimento = await prisma.empreendimento.findFirst({
          where: {
            imobiliariaId: ctx.conversa.imobiliariaId,
            nome: { contains: input.codigoImovel, mode: "insensitive" },
          },
        });
        if (empreendimento) {
          const { PERGUNTAS } = await import("@/lib/qualificacao");
          return (
            `"${empreendimento.nome}" é um EMPREENDIMENTO e NÃO tem fotos. Não prometa foto, planta nem material. ` +
            `Diga que esse é na planta e siga a qualificação: "${PERGUNTAS[0]!.pergunta}"`
          );
        }
        return `ERRO: imóvel ${input.codigoImovel} não encontrado.`;
      }
      // Envia a IMAGEM em si (não um link): quando a foto está no banco, embute
      // os bytes em base64; quando está no Blob, usa a URL pública. Assim o
      // cliente recebe as fotos de verdade, em lote.
      const urls = imovel.fotos
        .map((f) =>
          f.dados
            ? `data:${f.mimeType || "image/jpeg"};base64,${Buffer.from(f.dados).toString("base64")}`
            : /^https?:\/\//.test(f.url)
              ? f.url
              : null
        )
        .filter((x): x is string => Boolean(x));
      if (urls.length === 0) {
        // Unidade de empreendimento sem foto não vira "vamos agendar a visita":
        // na planta, o próximo passo é a qualificação de financiamento.
        if (imovel.empreendimentoId) {
          const { PERGUNTAS } = await import("@/lib/qualificacao");
          return `O ${imovel.codigo} é unidade de empreendimento e não tem foto. Diga que é na planta e siga a qualificação: "${PERGUNTAS[0]!.pergunta}"`;
        }
        return `O imóvel ${imovel.codigo} ainda não tem fotos cadastradas para enviar. Descreva o imóvel e ofereça agendar uma visita.`;
      }
      const destinos = [ctx.conversa.contatoJid, ctx.conversa.contatoTelefone].filter(
        (d): d is string => Boolean(d)
      );
      // preço conforme a finalidade/área: venda usa valorVenda; locação, valorSugerido/mês.
      // (sem travessão — esta legenda vai para o WhatsApp do cliente.)
      const ehVenda = ctx.conversa.agente === "COMPRA_VENDA" || imovel.finalidade === "VENDA";
      const preco = ehVenda
        ? imovel.valorVenda
          ? brl(imovel.valorVenda)
          : ""
        : imovel.valorSugerido
          ? `${brl(imovel.valorSugerido)}/mês`
          : "";
      const legenda = `${imovel.codigo}: ${imovel.tipo} em ${imovel.endereco}${imovel.bairro ? `, ${imovel.bairro}` : ""}${preco ? ` · ${preco}` : ""}`;
      const r = await enviarWhatsAppMidia(
        ctx.conversa.contatoTelefone ?? "",
        urls,
        ctx.conversa.imobiliariaId,
        destinos,
        legenda
      );
      if (r.enviadas === 0)
        return `Não consegui enviar as fotos agora (${r.detalhe ?? "erro"}). Diga ao cliente que envia em instantes.`;
      return `Enviei ${r.enviadas} foto(s) do ${imovel.codigo} para o WhatsApp do cliente. Comente as fotos e pergunte se quer agendar uma visita.`;
    },
  });

  const consultarMercado = betaTool({
    name: "consultar_mercado",
    description:
      "Consulta a referência de preço (aluguel ou venda) no bairro/cidade a partir da NOSSA carteira de imóveis semelhantes (faixa típica e R$/m²). Se — e SÓ se — um serviço de referência externo estiver configurado no ambiente, complementa com dados de mercado da região; esse complemento é OPCIONAL e frequentemente NÃO está disponível. É só referência de preço: NÃO oferece nem manda anúncio de portal. Quando a base for insuficiente, a ferramenta avisa — nesse caso ofereça a avaliação de um corretor da equipe e NUNCA invente uma faixa de preço.",
    inputSchema: {
      type: "object",
      properties: {
        finalidade: { type: "string", enum: ["LOCACAO", "VENDA"], description: "LOCACAO para aluguel, VENDA para compra e venda" },
        codigoImovel: { type: "string", description: "código de um imóvel da carteira (ex.: AP-0002) — se informado, puxa m², bairro e cidade dele automaticamente" },
        tipo: { type: "string", description: "Apartamento, Casa, Sala comercial, Terreno..." },
        bairro: { type: "string" },
        cidade: { type: "string" },
        areaM2: { type: "number", description: "tamanho do imóvel em m², se souber — permite estimar o valor pela referência de R$/m²" },
      },
      required: ["finalidade"],
      additionalProperties: false,
    },
    run: async (input: { finalidade: "LOCACAO" | "VENDA"; codigoImovel?: string; tipo?: string; bairro?: string; cidade?: string; areaM2?: number }) => {
      const imob = await prisma.imobiliaria.findUnique({ where: { id: ctx.conversa.imobiliariaId } });
      // Se veio um código, puxa m²/bairro/cidade/tipo do imóvel da carteira.
      const imovel = input.codigoImovel
        ? await prisma.imovel.findFirst({ where: { codigo: input.codigoImovel, imobiliariaId: ctx.conversa.imobiliariaId } })
        : null;
      const { referenciaMercado } = await import("@/lib/mercado");
      return referenciaMercado({
        imobiliariaId: ctx.conversa.imobiliariaId,
        finalidade: input.finalidade,
        tipo: input.tipo ?? imovel?.tipo,
        bairro: input.bairro ?? imovel?.bairro ?? undefined,
        cidade: input.cidade ?? imovel?.cidade ?? imob?.municipio ?? undefined,
        uf: imovel?.uf ?? imob?.uf ?? undefined,
        areaM2: input.areaM2 ?? imovel?.areaM2 ?? undefined,
      });
    },
  });

  const direcionarAtendimento = betaTool({
    name: "direcionar_atendimento",
    description:
      "Encaminha a conversa para a área certa DEPOIS de identificar o que a pessoa quer. Use assim que ficar claro: " +
      "CAPTACAO (a pessoa é proprietária e quer colocar um imóvel na carteira, seja para ALUGAR ou para VENDER), " +
      "VENDAS (a pessoa quer ALUGAR um imóvel para morar/usar), " +
      "COMPRA_VENDA (a pessoa quer COMPRAR um imóvel anunciado — inclui empreendimento na planta, lançamento, " +
      "Minha Casa Minha Vida e dúvida de financiamento: tudo isso é COMPRA_VENDA), " +
      "ADMINISTRACAO (já é cliente da carteira, locatário ou proprietário, e quer 2ª via, repasse, manutenção etc.). " +
      "NAO_CONTRATADO: SÓ quando a área que resolveria o pedido não estiver nas opções acima. " +
      "Se a área existe, é ela — nunca NAO_CONTRATADO. Encaminhe para a equipe humana com cordialidade, " +
      "SEM mencionar plano, módulo ou limitação do sistema.",
    inputSchema: {
      type: "object",
      properties: {
        // O enum é montado a partir dos módulos contratados: a IA não pode
        // encaminhar para uma área que não existe nesta imobiliária.
        area: { type: "string", enum: areasDisponiveis },
        cpfCnpj: {
          type: "string",
          description: "CPF/CNPJ do cliente — obrigatório só para ADMINISTRACAO, para localizar o cadastro.",
        },
        resumo: {
          type: "string",
          description:
            "Uma frase curta com o que a pessoa quer (ex.: 'quer alugar apartamento de 2 quartos no Centro'). Obrigatório quando area for NAO_CONTRATADO.",
        },
        demandaDe: {
          type: "string",
          enum: ["CAPTACAO", "VENDAS", "COMPRA_VENDA", "ADMINISTRACAO"],
          description:
            "Só para NAO_CONTRATADO: qual área teria atendido a pessoa, se existisse.",
        },
      },
      required: ["area"],
      additionalProperties: false,
    },
    run: async (input: { area: string; cpfCnpj?: string; resumo?: string; demandaDe?: string }) => {
      if (input.area === "NAO_CONTRATADO") {
        // TRAVA: NAO_CONTRATADO só vale quando a área que resolveria o pedido
        // NÃO existe nesta imobiliária. Sem isto, a IA "joga para alguém
        // resolver" um assunto que ela própria atende — o caso clássico é
        // empreendimento/Minha Casa Minha Vida, que é COMPRA_VENDA e tem fluxo
        // próprio. Aqui a chamada é RECUSADA e a conversa continua com a IA.
        const areaCerta = areaQueDeveriaAtender(input.demandaDe, input.resumo, areasDisponiveis);
        if (areaCerta) {
          return (
            `RECUSADO: isto é ${areaCerta}, área que VOCÊ atende. Não passe para ninguém. ` +
            `Chame direcionar_atendimento de novo com area="${areaCerta}" e siga o atendimento você mesma.`
          );
        }
        // Demanda de módulo não contratado: encaminha para humano E REGISTRA.
        // Este evento é o melhor dado de venda que existe — descartá-lo seria
        // perder o número que justifica o upgrade.
        await prisma.conversa
          .update({ where: { id: ctx.conversa.id }, data: { iaPausada: true } })
          .catch(() => {});
        await registrarDemandaNaoAtendida(
          ctx.conversa.imobiliariaId,
          ctx.conversa.id,
          input.demandaDe,
          input.resumo
        ).catch(() => {});
        return "Esta demanda não é atendida por aqui. Diga com educação que um atendente da equipe vai continuar o atendimento — sem mencionar plano, módulo ou limitação do sistema — e encerre a sua parte.";
      }
      if (input.area === "ADMINISTRACAO") {
        // Identifica PELO NÚMERO primeiro (o cliente da carteira é reconhecido
        // pelo WhatsApp/histórico, sem precisar pedir CPF). Só usa o CPF como
        // fallback quando o número não bate com nenhum cadastro.
        const { pessoaPorTelefone } = await import("@/lib/whatsapp");
        let pessoa = ctx.conversa.contatoTelefone
          ? await pessoaPorTelefone(ctx.conversa.contatoTelefone, ctx.conversa.imobiliariaId)
          : null;
        if (!pessoa && input.cpfCnpj) {
          pessoa = await prisma.pessoa.findUnique({
            where: {
              imobiliariaId_cpfCnpj: {
                imobiliariaId: ctx.conversa.imobiliariaId,
                cpfCnpj: input.cpfCnpj,
              },
            },
            include: {
              contratos: { where: { status: "ATIVO" }, select: { id: true } },
              imoveis: { select: { id: true } },
            },
          });
        }
        if (!pessoa)
          return "Não localizei o cadastro pelo número. Continue ajudando pelo histórico da conversa; só se precisar puxar dados da carteira (fatura, repasse), peça o CPF/CNPJ e chame de novo. Se ainda assim não achar, avise que um atendente humano vai assumir.";
        const perfil = pessoa.contratos.length > 0 ? "LOCATARIO" : "PROPRIETARIO";
        try {
          await prisma.conversa.update({
            where: { id: ctx.conversa.id },
            data: { agente: "ADMINISTRACAO", pessoaId: pessoa.id, perfil },
          });
        } catch {
          // já existe uma conversa de administração para essa pessoa/perfil:
          // mantém a recepção e pede para continuar pelo número cadastrado.
          return `Localizei o cadastro de ${pessoa.nome}. Peça para o cliente continuar pelo WhatsApp já cadastrado, ou avise que um atendente vai assumir.`;
        }
        return `Cliente ${pessoa.nome} identificado como ${perfil === "LOCATARIO" ? "locatário" : "proprietário"}. Agora atenda pelos dados da carteira (2ª via, repasse, manutenção).`;
      }
      await prisma.conversa.update({
        where: { id: ctx.conversa.id },
        data: { agente: input.area as Conversa["agente"] },
      });
      // Recibo SECO, de propósito. Qualquer briefing aqui ("entenda rápido o que
      // ela procura") vira instrução para a recepção improvisar — e ela não tem
      // o roteiro da área destino. Quem conduz é o prompt do novo agente, na
      // reentrada do turno.
      return `Encaminhado para ${input.area}. Não escreva nada.`;
    },
  });

  const cadastrarProprietario = betaTool({
    name: "cadastrar_proprietario",
    description:
      "Cadastra (ou localiza pelo CPF/CNPJ) o proprietário no sistema. Chame antes de cadastrar o imóvel dele.",
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        cpfCnpj: { type: "string" },
        telefone: { type: "string" },
        email: { type: "string" },
        chavePix: { type: "string", description: "chave PIX para receber os repasses" },
      },
      required: ["nome", "cpfCnpj"],
      additionalProperties: false,
    },
    run: async (input: { nome: string; cpfCnpj: string; telefone?: string; email?: string; chavePix?: string }) => {
      const existente = await prisma.pessoa.findUnique({
        where: { imobiliariaId_cpfCnpj: { imobiliariaId: ctx.conversa.imobiliariaId, cpfCnpj: input.cpfCnpj } },
      });
      if (existente) return `Proprietário já cadastrado: ${existente.nome} (id ${existente.id}).`;
      const pessoa = await prisma.pessoa.create({
        data: {
          imobiliariaId: ctx.conversa.imobiliariaId,
          nome: input.nome,
          cpfCnpj: input.cpfCnpj,
          telefone: input.telefone ?? ctx.conversa.contatoTelefone,
          email: input.email,
          chavePix: input.chavePix,
        },
      });
      await auditar("PROPRIETARIO_CADASTRADO_IA", "Pessoa", pessoa.id, `via IA de captação: ${pessoa.nome}`);
      return `Proprietário cadastrado com sucesso (id ${pessoa.id}).`;
    },
  });

  const cadastrarImovel = betaTool({
    name: "cadastrar_imovel",
    description:
      "Cadastra um imóvel na carteira de locação, vinculado ao proprietário (pelo CPF/CNPJ já cadastrado). O imóvel entra como DISPONÍVEL.",
    inputSchema: {
      type: "object",
      properties: {
        cpfCnpjProprietario: { type: "string" },
        tipo: { type: "string", description: "Apartamento, Casa, Sala comercial ou Terreno" },
        cep: { type: "string", description: "CEP do imóvel — se informado, o sistema completa bairro, cidade, UF e coordenadas sozinho" },
        endereco: { type: "string", description: "rua, número e complemento" },
        bairro: { type: "string" },
        cidade: { type: "string" },
        uf: { type: "string" },
        valorSugerido: { type: "number", description: "aluguel pretendido em R$" },
        areaM2: { type: "number", description: "área do imóvel em m²" },
        valorCondominio: { type: "number" },
        valorIptuMensal: { type: "number" },
      },
      required: ["cpfCnpjProprietario", "tipo", "endereco", "cidade", "uf", "valorSugerido"],
      additionalProperties: false,
    },
    run: async (input: {
      cpfCnpjProprietario: string; tipo: string; cep?: string; endereco: string; bairro?: string;
      cidade: string; uf: string; valorSugerido: number; areaM2?: number; valorCondominio?: number; valorIptuMensal?: number;
    }) => {
      const prop = await prisma.pessoa.findUnique({
        where: { imobiliariaId_cpfCnpj: { imobiliariaId: ctx.conversa.imobiliariaId, cpfCnpj: input.cpfCnpjProprietario } },
      });
      if (!prop) return "ERRO: proprietário não encontrado — cadastre-o primeiro com cadastrar_proprietario.";
      const end = await enderecoPorCepIA(input);
      const prefixo = { Apartamento: "AP", Casa: "CS", "Sala comercial": "SL", Terreno: "TR" }[input.tipo] ?? "IM";
      const existentes = await prisma.imovel.findMany({
        where: { imobiliariaId: ctx.conversa.imobiliariaId, codigo: { startsWith: `${prefixo}-` } },
        select: { codigo: true },
      });
      const numero = proximoNumero(existentes.map((e) => e.codigo), prefixo);
      const imovel = await prisma.imovel.create({
        data: {
          imobiliariaId: ctx.conversa.imobiliariaId,
          codigo: `${prefixo}-${String(numero).padStart(4, "0")}`,
          tipo: input.tipo,
          endereco: end.endereco,
          bairro: end.bairro,
          cidade: end.cidade,
          uf: end.uf,
          cep: end.cep,
          valorSugerido: input.valorSugerido,
          areaM2: input.areaM2,
          valorCondominio: input.valorCondominio,
          valorIptuMensal: input.valorIptuMensal,
          proprietarioId: prop.id,
        },
      });
      // Coordenadas best-effort (do CEP quando houver, senão geocodifica) — nunca
      // derruba o cadastro se o update de coordenadas falhar.
      if (end.latitude != null && end.longitude != null)
        await prisma.imovel.update({ where: { id: imovel.id }, data: { latitude: end.latitude, longitude: end.longitude } }).catch(() => {});
      else await import("@/lib/geo").then((m) => m.geocodificarImovel(imovel.id)).catch(() => {});
      await auditar("IMOVEL_CAPTADO_IA", "Imovel", imovel.id, `via IA de captação: ${imovel.codigo} — ${imovel.endereco}`);
      return `Imóvel cadastrado: ${imovel.codigo} — ${imovel.endereco} por ${brl(imovel.valorSugerido)}/mês. Já está disponível para locação.`;
    },
  });

  const cadastrarImovelVenda = betaTool({
    name: "cadastrar_imovel_venda",
    description:
      "Cadastra um imóvel À VENDA na carteira, vinculado ao proprietário (pelo CPF/CNPJ já cadastrado com cadastrar_proprietario). Use quando o proprietário quer VENDER (não alugar). Define o preço de venda pedido.",
    inputSchema: {
      type: "object",
      properties: {
        cpfCnpjProprietario: { type: "string" },
        tipo: { type: "string", description: "Apartamento, Casa, Sala comercial ou Terreno" },
        cep: { type: "string", description: "CEP do imóvel — se informado, o sistema completa bairro, cidade, UF e coordenadas sozinho" },
        endereco: { type: "string" },
        bairro: { type: "string" },
        cidade: { type: "string" },
        uf: { type: "string" },
        valorVenda: { type: "number", description: "preço de venda pedido em R$" },
        areaM2: { type: "number", description: "área do imóvel em m²" },
        valorCondominio: { type: "number" },
        valorIptuMensal: { type: "number" },
      },
      required: ["cpfCnpjProprietario", "tipo", "endereco", "cidade", "uf", "valorVenda"],
      additionalProperties: false,
    },
    run: async (input: {
      cpfCnpjProprietario: string; tipo: string; cep?: string; endereco: string; bairro?: string;
      cidade: string; uf: string; valorVenda: number; areaM2?: number; valorCondominio?: number; valorIptuMensal?: number;
    }) => {
      const prop = await prisma.pessoa.findUnique({
        where: { imobiliariaId_cpfCnpj: { imobiliariaId: ctx.conversa.imobiliariaId, cpfCnpj: input.cpfCnpjProprietario } },
      });
      if (!prop) return "ERRO: proprietário não encontrado — cadastre-o primeiro com cadastrar_proprietario.";
      const end = await enderecoPorCepIA(input);
      const prefixo = { Apartamento: "AP", Casa: "CS", "Sala comercial": "SL", Terreno: "TR" }[input.tipo] ?? "IM";
      const existentes = await prisma.imovel.findMany({
        where: { imobiliariaId: ctx.conversa.imobiliariaId, codigo: { startsWith: `${prefixo}-` } },
        select: { codigo: true },
      });
      const numero = proximoNumero(existentes.map((e) => e.codigo), prefixo);
      const imovel = await prisma.imovel.create({
        data: {
          imobiliariaId: ctx.conversa.imobiliariaId,
          codigo: `${prefixo}-${String(numero).padStart(4, "0")}`,
          tipo: input.tipo,
          endereco: end.endereco,
          bairro: end.bairro,
          cidade: end.cidade,
          uf: end.uf,
          cep: end.cep,
          finalidade: "VENDA",
          valorVenda: input.valorVenda,
          areaM2: input.areaM2,
          valorCondominio: input.valorCondominio,
          valorIptuMensal: input.valorIptuMensal,
          proprietarioId: prop.id,
        },
      });
      if (end.latitude != null && end.longitude != null)
        await prisma.imovel.update({ where: { id: imovel.id }, data: { latitude: end.latitude, longitude: end.longitude } }).catch(() => {});
      else await import("@/lib/geo").then((m) => m.geocodificarImovel(imovel.id)).catch(() => {});
      await auditar("IMOVEL_VENDA_CAPTADO_IA", "Imovel", imovel.id, `à venda via IA: ${imovel.codigo} — ${brl(imovel.valorVenda)}`);
      return `Imóvel à venda cadastrado: ${imovel.codigo} — ${imovel.endereco} por ${brl(imovel.valorVenda)}. Ofereça avaliação e peça fotos.`;
    },
  });

  const registrarLead = betaTool({
    name: "registrar_lead",
    description:
      "Registra (ou atualiza) o interessado como lead no CRM. Chame assim que souber o nome do interessado.",
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        telefone: { type: "string" },
        codigoImovel: { type: "string", description: "código do imóvel de interesse, ex.: AP-0002" },
        temperatura: { type: "string", enum: ["QUENTE", "MORNO", "FRIO"] },
      },
      required: ["nome"],
      additionalProperties: false,
    },
    run: async (input: { nome: string; telefone?: string; codigoImovel?: string; temperatura?: "QUENTE" | "MORNO" | "FRIO" }) => {
      const telefone = input.telefone ?? ctx.conversa.contatoTelefone ?? null;
      const imovel = input.codigoImovel
        ? await prisma.imovel.findFirst({
            where: { codigo: input.codigoImovel, imobiliariaId: ctx.conversa.imobiliariaId },
          })
        : null;
      const existente = telefone
        ? await prisma.lead.findFirst({
            where: { telefone, imobiliariaId: ctx.conversa.imobiliariaId },
            orderBy: { criadoEm: "desc" },
          })
        : null;
      const lead = existente
        ? await prisma.lead.update({
            where: { id: existente.id },
            data: {
              status: existente.status === "NOVO" ? "ATENDIMENTO" : existente.status,
              imovelId: imovel?.id ?? existente.imovelId,
              temperatura: input.temperatura ?? existente.temperatura,
            },
          })
        : await prisma.lead.create({
            data: {
              imobiliariaId: ctx.conversa.imobiliariaId,
              nome: input.nome,
              telefone,
              origem: "WHATSAPP",
              status: "ATENDIMENTO",
              temperatura: input.temperatura ?? "MORNO",
              imovelId: imovel?.id,
            },
          });
      await auditar("LEAD_REGISTRADO_IA", "Lead", lead.id, `via IA de vendas: ${lead.nome}`);
      // Agenda a cadência de follow-up (#7) — reengaja sozinha se o lead sumir.
      await import("@/lib/followup").then((m) => m.iniciarCadencia(lead.id)).catch(() => {});
      return `Lead registrado (id ${lead.id})${imovel ? ` com interesse no ${imovel.codigo}` : ""}.`;
    },
  });

  const agendarVisitaTool = betaTool({
    name: "agendar_visita",
    description: "Agenda a visita do lead a um imóvel. Use data no formato AAAA-MM-DD.",
    inputSchema: {
      type: "object",
      properties: {
        telefoneLead: { type: "string" },
        data: { type: "string", description: "AAAA-MM-DD" },
        codigoImovel: { type: "string" },
      },
      required: ["data"],
      additionalProperties: false,
    },
    run: async (input: { telefoneLead?: string; data: string; codigoImovel?: string }) => {
      const telefone = input.telefoneLead ?? ctx.conversa.contatoTelefone;
      // desambigua pelo funil da área: compra e venda usa lead de COMPRA;
      // vendas de locação usa lead de LOCACAO. Evita agendar no lead errado
      // quando o mesmo telefone tem interesse de compra E de locação.
      const finalidade = ctx.conversa.agente === "COMPRA_VENDA" ? "COMPRA" : "LOCACAO";
      const lead = telefone
        ? await prisma.lead.findFirst({
            where: { telefone, imobiliariaId: ctx.conversa.imobiliariaId, finalidade },
            orderBy: { criadoEm: "desc" },
          })
        : null;
      if (!lead) return "ERRO: lead não encontrado — registre-o primeiro com registrar_lead.";
      // Trava de verdade, não só instrução no prompt: lead de empreendimento
      // não agenda visita antes da qualificação. Levar para a visita quem não
      // passa no banco queima o tempo do corretor e a paciência do cliente.
      if (lead.empreendimentoId) {
        const q = await prisma.qualificacaoMcmv.findUnique({ where: { leadId: lead.id } });
        const { analisar, proximaPergunta, respostasDaQualificacao } = await import(
          "@/lib/qualificacao"
        );
        // Sempre pelo conversor: montar as respostas à mão aqui já tinha feito a
        // trava contar errado, porque esquecia metade dos campos.
        const r = q ? respostasDaQualificacao(q) : { documentosRecebidos: [] };
        const prox = proximaPergunta(r);
        if (prox) {
          const a = analisar(r);
          return (
            `NÃO agendei: este lead é de empreendimento e a qualificação está em ${a.respondidas}/${a.total}. ` +
            `Termine a qualificação antes da visita. Faça agora só esta pergunta: "${prox.pergunta}"`
          );
        }
      }
      const imovel = input.codigoImovel
        ? await prisma.imovel.findFirst({
            where: { codigo: input.codigoImovel, imobiliariaId: ctx.conversa.imobiliariaId },
          })
        : null;
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          visitaEm: new Date(input.data),
          status: "VISITA_AGENDADA",
          imovelId: imovel?.id ?? lead.imovelId,
        },
      });
      await auditar("VISITA_AGENDADA_IA", "Lead", lead.id, `visita em ${input.data}`);
      return `Visita agendada para ${input.data}.`;
    },
  });

  const registrarProposta = betaTool({
    name: "registrar_proposta",
    description:
      "Formaliza a proposta de locação do interessado. A análise de crédito roda automaticamente — informe o resultado ao cliente.",
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        cpfCnpj: { type: "string" },
        codigoImovel: { type: "string" },
        valorProposto: { type: "number", description: "aluguel proposto em R$/mês" },
        rendaMensal: { type: "number" },
        garantia: { type: "string", description: "Seguro-fiança, Fiador, Caução..." },
      },
      required: ["nome", "cpfCnpj", "codigoImovel", "valorProposto"],
      additionalProperties: false,
    },
    run: async (input: {
      nome: string; cpfCnpj: string; codigoImovel: string; valorProposto: number;
      rendaMensal?: number; garantia?: string;
    }) => {
      const imovel = await prisma.imovel.findFirst({
        where: { codigo: input.codigoImovel, imobiliariaId: ctx.conversa.imobiliariaId },
      });
      if (!imovel) return `ERRO: imóvel ${input.codigoImovel} não encontrado.`;
      if (imovel.status !== "DISPONIVEL") return `ERRO: o ${imovel.codigo} não está mais disponível.`;
      const credito = analisarCredito({
        cpfCnpj: input.cpfCnpj,
        rendaMensal: input.rendaMensal ?? null,
        valorAluguel: input.valorProposto,
        garantia: input.garantia ?? null,
      });
      const telefone = ctx.conversa.contatoTelefone;
      const lead = telefone
        ? await prisma.lead.findFirst({
            where: { telefone, imobiliariaId: ctx.conversa.imobiliariaId },
            orderBy: { criadoEm: "desc" },
          })
        : null;
      const proposta = await prisma.proposta.create({
        data: {
          leadId: lead?.id,
          imovelId: imovel.id,
          nome: input.nome,
          cpfCnpj: input.cpfCnpj,
          rendaMensal: input.rendaMensal,
          valorProposto: input.valorProposto,
          garantia: input.garantia,
          scoreCredito: credito.score,
          resultadoCredito: credito.resultado,
          status: credito.resultado === "REPROVADO" ? "RECUSADA" : "EM_ANALISE",
        },
      });
      if (lead) await prisma.lead.update({ where: { id: lead.id }, data: { status: "PROPOSTA" } });
      await auditar("PROPOSTA_REGISTRADA_IA", "Proposta", proposta.id, `via IA de vendas: ${input.nome} — ${credito.resultado}`);
      return `Proposta registrada (#${proposta.id}). Análise de crédito: ${credito.resultado} — ${credito.detalhes} A equipe fará a aprovação final.`;
    },
  });

  const abrirOcorrencia = betaTool({
    name: "abrir_ocorrencia",
    description:
      "Abre um chamado de manutenção/ocorrência para o imóvel do cliente. Use quando o locatário reportar problema no imóvel.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "resumo curto, ex.: Vazamento na cozinha" },
        descricao: { type: "string" },
        custoEstimado: {
          type: "number",
          description: "custo estimado do reparo em reais, quando já se souber (ex.: orçamento informado pelo locatário)",
        },
      },
      required: ["titulo"],
      additionalProperties: false,
    },
    run: async (input: { titulo: string; descricao?: string; custoEstimado?: number }) => {
      if (!ctx.conversa.pessoaId) return "ERRO: conversa sem cliente identificado.";
      const contrato = await prisma.contrato.findFirst({
        where:
          ctx.conversa.perfil === "LOCATARIO"
            ? { inquilinoId: ctx.conversa.pessoaId, status: "ATIVO" }
            : { imovel: { proprietarioId: ctx.conversa.pessoaId }, status: "ATIVO" },
        include: { imovel: true },
      });
      if (!contrato) return "ERRO: nenhum contrato ativo encontrado para este cliente.";
      const ocorrencia = await prisma.ocorrencia.create({
        data: {
          imovelId: contrato.imovelId,
          contratoId: contrato.id,
          titulo: input.titulo,
          descricao: input.descricao,
          custo: input.custoEstimado ?? null,
        },
      });
      await auditar("OCORRENCIA_ABERTA_IA", "Ocorrencia", ocorrencia.id, `${contrato.imovel.codigo}: ${input.titulo}`);
      // Acima do limite da imobiliária, a obra depende do aval do proprietário:
      // instrui a IA a chamar notificar_proprietario em seguida.
      const imobOc = await prisma.imobiliaria.findUnique({
        where: { id: ctx.conversa.imobiliariaId },
        select: { limiteAprovacaoOrcamentoCentavos: true },
      });
      const limite = imobOc?.limiteAprovacaoOrcamentoCentavos ?? 30000;
      const custoCent = Math.round((input.custoEstimado ?? 0) * 100);
      if (custoCent > limite) {
        return `Ocorrência #${ocorrencia.id} aberta para o imóvel ${contrato.imovel.codigo}. O custo estimado (${brl(custoCent / 100)}) passa do limite que a imobiliária resolve sozinha (${brl(limite / 100)}): chame notificar_proprietario com ocorrenciaId ${ocorrencia.id} para pedir a autorização, e diga ao locatário que você vai consultar o proprietário e retorna.`;
      }
      return `Ocorrência #${ocorrencia.id} aberta para o imóvel ${contrato.imovel.codigo}. A equipe entrará em contato para agendar.`;
    },
  });

  const enviarSegundaVia = betaTool({
    name: "enviar_segunda_via",
    description:
      "Busca a fatura em aberto/atrasada do locatário e retorna o PIX copia-e-cola e a linha digitável REAIS para enviar. Use quando o inquilino pedir 2ª via, boleto ou o PIX.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    run: async () => {
      if (!ctx.conversa.pessoaId) return "ERRO: conversa sem cliente identificado.";
      const fatura = await prisma.fatura.findFirst({
        where: {
          status: { in: ["ABERTA", "ATRASADA"] },
          contrato: { inquilinoId: ctx.conversa.pessoaId, status: "ATIVO" },
        },
        orderBy: { vencimento: "asc" },
        include: { contrato: { include: { imovel: true } } },
      });
      if (!fatura) return "O inquilino não tem nenhuma fatura em aberto no momento.";
      await auditar("SEGUNDA_VIA_IA", "Fatura", fatura.id, `2ª via enviada pela IA`);
      const linhas = [
        `Fatura de ${competenciaBr(fatura.competencia)} — imóvel ${fatura.contrato.imovel.codigo}`,
        `Valor: ${brl(fatura.valorTotal)}, vencimento ${new Date(fatura.vencimento).toLocaleDateString("pt-BR")}.`,
      ];
      if (fatura.pixCopiaECola) linhas.push(`PIX copia-e-cola: ${fatura.pixCopiaECola}`);
      if (fatura.linhaDigitavel) linhas.push(`Linha digitável do boleto: ${fatura.linhaDigitavel}`);
      if (!fatura.pixCopiaECola && !fatura.linhaDigitavel)
        linhas.push("(cobrança ainda sendo emitida no gateway — informe que envia em instantes).");
      return linhas.join("\n");
    },
  });


  // ─── Intermediação com o PROPRIETÁRIO (M4) ────────────────────────────────
  // TODAS resolvem a identidade pelo TELEFONE da conversa e escopam o resultado
  // ao que aquela pessoa tem direito. Nunca aceitam um imovelId/ocorrenciaId do
  // input sem provar a posse — aqui o "atacante" é quem manda mensagem.

  const consultarRepasse = betaTool({
    name: "consultar_repasse",
    description:
      "PROPRIETÁRIO: informa o próximo repasse dos imóveis dele — valor previsto, data estimada e retenções (manutenção, taxa de administração). Use quando o proprietário perguntar sobre o dinheiro do aluguel.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    run: async () => {
      const eu = await resolverInterlocutor(ctx.conversa.imobiliariaId, ctx.conversa.contatoTelefone);
      if (!eu.pessoa || eu.imoveisComoProprietario.length === 0)
        return "Não consegui confirmar que este número é de um proprietário da carteira. NÃO informe valores: diga que um atendente vai verificar e assumir.";

      const repasses = await prisma.repasse.findMany({
        where: {
          status: "PENDENTE",
          fatura: { contrato: { imovelId: { in: eu.imoveisComoProprietario } } },
        },
        include: { fatura: { include: { contrato: { include: { imovel: true } } } } },
        orderBy: { id: "desc" },
        take: 5,
      });
      if (repasses.length === 0) {
        const emAberto = await prisma.fatura.count({
          where: {
            status: { in: ["ABERTA", "ATRASADA"] },
            contrato: { imovelId: { in: eu.imoveisComoProprietario } },
          },
        });
        return emAberto > 0
          ? `Nenhum repasse pronto ainda: ${emAberto} fatura(s) do(s) imóvel(is) ainda não foi(ram) paga(s) pelo inquilino. Diga isso com clareza e NÃO prometa data.`
          : "Nenhum repasse pendente no momento. Diga que assim que o aluguel for pago o repasse entra na fila.";
      }
      const linhas = repasses.map((r) => {
        const im = r.fatura.contrato.imovel;
        const retencao = Number(r.valorTaxaAdm);
        return `${im.codigo} (${im.endereco}): líquido ${brl(Number(r.valorRepasse))} — bruto ${brl(Number(r.valorBase))} menos ${brl(retencao)} de taxa de administração${r.fatura.pagaEm ? `; aluguel pago em ${r.fatura.pagaEm.toLocaleDateString("pt-BR")}` : ""}`;
      });
      return `Repasses pendentes deste proprietário:\n${linhas.join("\n")}\nInforme o valor líquido e diga que a transferência entra na próxima rodada de repasses. Não invente data exata.`;
    },
  });

  const consultarSituacaoImovel = betaTool({
    name: "consultar_situacao_imovel",
    description:
      "PROPRIETÁRIO: situação de um imóvel dele — alugado ou vago, quem é o inquilino, se o aluguel está em dia, fim do contrato e próximo reajuste.",
    inputSchema: {
      type: "object",
      properties: { codigoImovel: { type: "string", description: "código do imóvel, ex.: AP-0001" } },
      required: [],
      additionalProperties: false,
    },
    run: async (input: { codigoImovel?: string }) => {
      const eu = await resolverInterlocutor(ctx.conversa.imobiliariaId, ctx.conversa.contatoTelefone);
      if (!eu.pessoa || eu.imoveisComoProprietario.length === 0)
        return "Não consegui confirmar que este número é de um proprietário da carteira. NÃO informe dados: diga que um atendente vai verificar.";

      // O filtro por id SÓ olha os imóveis DELE — passar o código de outro
      // proprietário simplesmente não encontra nada.
      const imoveis = await prisma.imovel.findMany({
        where: {
          id: { in: eu.imoveisComoProprietario },
          ...(input.codigoImovel ? { codigo: { contains: input.codigoImovel, mode: "insensitive" } } : {}),
        },
        include: {
          contratos: {
            where: { status: "ATIVO" },
            include: { inquilino: true, faturas: { orderBy: { vencimento: "desc" }, take: 3 } },
          },
        },
        take: 5,
      });
      if (imoveis.length === 0)
        return "Não encontrei esse imóvel entre os deste proprietário. Peça o código correto ou diga que a equipe verifica.";

      const linhas = imoveis.map((im) => {
        const ct = im.contratos[0];
        if (!ct) return `${im.codigo} (${im.endereco}): VAGO no momento.`;
        const atrasadas = ct.faturas.filter((f) => f.status === "ATRASADA");
        const situacao = atrasadas.length
          ? `aluguel ATRASADO (${atrasadas.length} fatura(s) em aberto)`
          : "aluguel em dia";
        return `${im.codigo} (${im.endereco}): alugado para ${ct.inquilino.nome}, ${situacao}; contrato até ${ct.fim.toLocaleDateString("pt-BR")}.`;
      });
      return linhas.join("\n");
    },
  });

  const aprovarOrcamento = betaTool({
    name: "aprovar_orcamento",
    description:
      "PROPRIETÁRIO: registra a decisão dele sobre um orçamento de manutenção que aguarda aprovação. Use quando o proprietário responder se autoriza ou não o serviço.",
    inputSchema: {
      type: "object",
      properties: {
        ocorrenciaId: { type: "number", description: "id da ocorrência que aguarda aprovação" },
        decisao: { type: "string", enum: ["APROVAR", "RECUSAR"] },
        observacao: { type: "string" },
      },
      required: ["ocorrenciaId", "decisao"],
      additionalProperties: false,
    },
    run: async (input: { ocorrenciaId: number; decisao: "APROVAR" | "RECUSAR"; observacao?: string }) => {
      const eu = await resolverInterlocutor(ctx.conversa.imobiliariaId, ctx.conversa.contatoTelefone);
      if (!eu.pessoa || eu.imoveisComoProprietario.length === 0)
        return "Não consegui confirmar que este número é de um proprietário da carteira. Diga que um atendente vai assumir.";

      // Posse + estado: a ocorrência tem de ser de um imóvel DELE e estar
      // realmente aguardando aprovação.
      const oc = await prisma.ocorrencia.findFirst({
        where: {
          id: input.ocorrenciaId,
          imovelId: { in: eu.imoveisComoProprietario },
          aguardandoAprovacao: true,
        },
        include: { imovel: true },
      });
      if (!oc)
        return "Não encontrei um orçamento aguardando aprovação com esse número para os imóveis deste proprietário. Peça para ele confirmar qual serviço e chame de novo.";

      const aprovado = input.decisao === "APROVAR";
      await prisma.ocorrencia.update({
        where: { id: oc.id },
        data: {
          aguardandoAprovacao: false,
          aprovadaEm: aprovado ? new Date() : null,
          aprovadaPorPessoaId: eu.pessoa.id,
          decisaoObservacao: input.observacao ?? (aprovado ? "aprovado pelo proprietário" : "recusado pelo proprietário"),
          status: aprovado ? "EM_ANDAMENTO" : "ABERTA",
        },
      });
      await auditar(
        aprovado ? "ORCAMENTO_APROVADO" : "ORCAMENTO_RECUSADO",
        "Ocorrencia",
        oc.id,
        `${oc.titulo} · ${oc.imovel.codigo} · por ${eu.pessoa.nome} (proprietário)${input.observacao ? ` · ${input.observacao}` : ""}`,
        ctx.conversa.imobiliariaId
      );

      // Fecha o ciclo: o inquilino que abriu o chamado é avisado da decisão.
      await avisarInquilinoDaDecisao(oc.id, aprovado).catch(() => {});

      return aprovado
        ? `Aprovação registrada. Confirme ao proprietário que o serviço foi autorizado e que a equipe agenda a execução. O inquilino já foi avisado.`
        : `Recusa registrada. Confirme ao proprietário e diga que a equipe retorna com alternativas.`;
    },
  });

  const notificarProprietario = betaTool({
    name: "notificar_proprietario",
    description:
      "LOCATÁRIO: avisa o proprietário do imóvel sobre uma ocorrência recém-aberta que precisa da autorização dele (custo acima do limite). Use logo depois de abrir_ocorrencia, quando houver custo estimado.",
    inputSchema: {
      type: "object",
      properties: {
        ocorrenciaId: { type: "number" },
        custoEstimado: { type: "number", description: "custo estimado em reais, se houver" },
      },
      required: ["ocorrenciaId"],
      additionalProperties: false,
    },
    run: async (input: { ocorrenciaId: number; custoEstimado?: number }) => {
      const oc = await prisma.ocorrencia.findFirst({
        where: { id: input.ocorrenciaId, imovel: { imobiliariaId: ctx.conversa.imobiliariaId } },
        include: { imovel: { include: { proprietario: true, imobiliaria: true } } },
      });
      if (!oc) return "Ocorrência não encontrada nesta imobiliária.";

      // IDEMPOTENTE: no máximo um aviso por ocorrência.
      if (oc.proprietarioAvisadoEm)
        return "O proprietário já foi avisado sobre esta ocorrência. Diga ao inquilino que a autorização está pendente com o proprietário.";

      const proprietario = oc.imovel.proprietario;
      if (!proprietario?.telefone)
        return "O proprietário deste imóvel não tem WhatsApp cadastrado. Diga ao inquilino que a equipe vai falar com ele.";

      const custoCentavos = Math.round((input.custoEstimado ?? Number(oc.custo ?? 0)) * 100);
      const limite = oc.imovel.imobiliaria.limiteAprovacaoOrcamentoCentavos;
      if (custoCentavos > 0 && custoCentavos <= limite)
        return `O custo estimado está dentro do limite que a imobiliária resolve sozinha (${brl(limite / 100)}). Não é preciso pedir autorização: diga ao inquilino que a equipe já vai providenciar.`;

      const texto =
        `Olá, ${proprietario.nome}! Aqui é da administração do seu imóvel ${oc.imovel.codigo} (${oc.imovel.endereco}).\n\n` +
        `O locatário relatou: ${oc.titulo}${oc.descricao ? ` — ${oc.descricao}` : ""}.` +
        (custoCentavos > 0 ? `\n\nO custo estimado do reparo é de ${brl(custoCentavos / 100)}.` : "") +
        `\n\nVocê autoriza o serviço? É só responder por aqui.`;

      // Fora do horário comercial, AGENDA — ninguém recebe cobrança de
      // madrugada. Dentro, envia na hora.
      const agora = new Date();
      const { dentroHorarioComercial, proximoHorarioComercial } = await import("@/lib/followup");
      if (!dentroHorarioComercial(agora)) {
        const quando = proximoHorarioComercial(agora);
        await prisma.ocorrencia.update({
          where: { id: oc.id },
          data: { aguardandoAprovacao: true },
        });
        await enfileirarAvisoProprietario(oc.id, proprietario.telefone, texto, quando).catch(() => {});
        return `Fora do horário comercial: o aviso ao proprietário foi agendado para ${quando.toLocaleString("pt-BR")}. Diga ao inquilino que o proprietário será consultado e que você retorna com a resposta.`;
      }

      const { enviarWhatsApp } = await import("@/lib/whatsapp");
      await enviarWhatsApp(proprietario.telefone, texto, ctx.conversa.imobiliariaId);
      await prisma.ocorrencia.update({
        where: { id: oc.id },
        data: { aguardandoAprovacao: true, proprietarioAvisadoEm: new Date() },
      });
      await auditar(
        "PROPRIETARIO_NOTIFICADO",
        "Ocorrencia",
        oc.id,
        `${oc.titulo} · ${oc.imovel.codigo} · para ${proprietario.nome}: ${texto.slice(0, 300)}`,
        ctx.conversa.imobiliariaId
      );
      return "Proprietário avisado por WhatsApp. Diga ao inquilino que a autorização foi solicitada e que você avisa assim que houver resposta.";
    },
  });

  const solicitarFechamento = betaTool({
    name: "solicitar_fechamento",
    description:
      "ENCERRAMENTO NATURAL do seu atendimento: entrega o interessado qualificado ao corretor. " +
      "Use quando o cliente demonstrar interesse firme — não é escalada excepcional, é como a conversa termina bem. " +
      "Passe no campo `resumo` a qualificação em uma frase (perfil, urgência, faixa de valor, garantia pretendida e forma de pagamento). " +
      "NÃO cria contrato nem proposta: a equipe assume daqui.",
    inputSchema: {
      type: "object",
      properties: {
        cpfCnpj: { type: "string", description: "CPF/CNPJ do pretendente — necessário se o contato não tiver telefone salvo" },
        codigoImovel: { type: "string", description: "código do imóvel de interesse, ex.: AP-0002" },
        resumo: {
          type: "string",
          description:
            "A qualificação em uma frase: perfil, urgência, faixa de valor, garantia pretendida e forma de pagamento.",
        },
      },
      required: [],
      additionalProperties: false,
    },
    run: async (input: { cpfCnpj?: string; codigoImovel?: string; resumo?: string }) => {
      // Identificação ESTRITA: só localiza a proposta por CPF informado OU pelo
      // telefone do contato desta conversa. Nunca filtro vazio (evita pegar a
      // proposta de outra pessoa).
      const cpf = input.cpfCnpj?.trim();
      const tel = ctx.conversa.contatoTelefone?.trim();
      if (!cpf && !tel)
        return "Para localizar sua proposta com segurança, peça o CPF/CNPJ do cliente e chame de novo com ele.";
      const proposta = await prisma.proposta.findFirst({
        where: {
          imovel: {
            imobiliariaId: ctx.conversa.imobiliariaId,
            ...(input.codigoImovel ? { codigo: input.codigoImovel } : {}),
          },
          ...(cpf ? { cpfCnpj: cpf } : { lead: { telefone: tel } }),
        },
        orderBy: { criadoEm: "desc" },
        include: { imovel: true, lead: true },
      });
      if (!proposta) {
        // O módulo Comercial QUALIFICA e entrega — ele não registra proposta.
        // Sem proposta cadastrada, o handoff ainda é válido: avisa a equipe com
        // o resumo da qualificação e pausa a IA para o corretor assumir.
        await prisma.conversa
          .update({ where: { id: ctx.conversa.id }, data: { iaPausada: true } })
          .catch(() => {});
        await auditar(
          "FECHAMENTO_SOLICITADO",
          "Conversa",
          ctx.conversa.id,
          `qualificação entregue ao corretor${input.codigoImovel ? ` · imóvel ${input.codigoImovel}` : ""}${input.resumo ? ` · ${input.resumo}` : ""}`,
          ctx.conversa.imobiliariaId
        );
        return "Cliente entregue ao corretor com o resumo da qualificação. Diga que a equipe assume daqui e retorna em seguida para finalizar — sem prometer prazo nem falar em contrato gerado.";
      }
      if (proposta.status === "CONVERTIDA")
        return `Esta proposta já foi fechada (contrato em andamento). Confirme com o cliente ou com a equipe.`;
      if (proposta.resultadoCredito === "REPROVADO")
        return "A análise de crédito não aprovou. Diga ao cliente, com jeito, que a equipe vai avaliar alternativas (fiador, caução maior) e retorna.";

      // Registra o interesse de fechamento para a equipe finalizar (aprovar +
      // converter em /propostas). NÃO cria contrato nem aprova a proposta.
      const nota = `[Cliente confirmou que quer FECHAR — proposta #${proposta.id} (${proposta.imovel.codigo}). Aguardando geração do contrato pela equipe.]`;
      if (proposta.leadId) {
        await prisma.lead.update({
          where: { id: proposta.leadId },
          data: {
            observacoes: proposta.lead?.observacoes ? `${proposta.lead.observacoes}\n${nota}` : nota,
          },
        });
      }
      await auditar("FECHAMENTO_SOLICITADO_IA", "Proposta", proposta.id, nota);
      return `Interesse de fechamento registrado para a equipe (proposta #${proposta.id}, ${proposta.imovel.codigo}). Avise o cliente que está tudo certo e que a equipe vai finalizar o contrato e enviar o link de assinatura em seguida.`;
    },
  });

  const agendarAvaliacao = betaTool({
    name: "agendar_avaliacao",
    description:
      "Registra o pedido de avaliação/visita de um corretor ao imóvel do PROPRIETÁRIO (na captação). Use depois de cadastrar o imóvel, quando o proprietário aceitar a avaliação. A data é opcional.",
    inputSchema: {
      type: "object",
      properties: {
        codigoImovel: { type: "string", description: "código do imóvel já cadastrado, ex.: AP-0002" },
        data: { type: "string", description: "data combinada, se houver (AAAA-MM-DD ou texto livre)" },
      },
      required: ["codigoImovel"],
      additionalProperties: false,
    },
    run: async (input: { codigoImovel: string; data?: string }) => {
      const imovel = await prisma.imovel.findFirst({
        where: { codigo: input.codigoImovel, imobiliariaId: ctx.conversa.imobiliariaId },
      });
      if (!imovel) return `ERRO: imóvel ${input.codigoImovel} não encontrado.`;
      const quando = input.data?.trim() ? ` para ${input.data.trim()}` : " (a equipe combina o melhor horário)";
      const nota = `[Avaliação solicitada${quando} — via IA de captação]`;
      await prisma.imovel.update({
        where: { id: imovel.id },
        data: { observacoes: imovel.observacoes ? `${imovel.observacoes}\n${nota}` : nota },
      });
      await auditar("AVALIACAO_SOLICITADA_IA", "Imovel", imovel.id, `${imovel.codigo}: ${nota}`);
      return `Avaliação do ${imovel.codigo} registrada${quando}. Confirme ao proprietário que um corretor vai fazer a visita e combinar os detalhes.`;
    },
  });

  const consultarPendencias = betaTool({
    name: "consultar_pendencias",
    description:
      "Consulta as faturas em aberto/atrasadas do LOCATÁRIO com o valor REAL atualizado (com multa e juros). Use quando o cliente falar de atraso, dívida ou quiser negociar/parcelar. NÃO formaliza acordo — só informa os valores.",
    inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
    run: async () => {
      if (!ctx.conversa.pessoaId) return "ERRO: conversa sem cliente identificado.";
      const imob = await prisma.imobiliaria.findUnique({ where: { id: ctx.conversa.imobiliariaId } });
      const faturas = await prisma.fatura.findMany({
        where: {
          status: { in: ["ABERTA", "ATRASADA"] },
          contrato: { inquilinoId: ctx.conversa.pessoaId, status: "ATIVO" },
        },
        orderBy: { vencimento: "asc" },
        include: { contrato: { include: { imovel: true } } },
      });
      if (faturas.length === 0) return "O locatário não tem nenhuma fatura em aberto no momento.";
      let total = 0;
      const linhas = faturas.map((f) => {
        const atraso = diasEmAtraso(f.vencimento);
        const { multa, juros } = calcularEncargosAtraso(
          f.valorTotal,
          atraso,
          imob?.multaPercent ?? 2,
          imob?.jurosMesPercent ?? 1
        );
        const valorAtual = Number(f.valorTotal.plus(multa).plus(juros));
        total += valorAtual;
        return (
          `Fatura ${competenciaBr(f.competencia)} (${f.contrato.imovel.codigo}): venceu ${new Date(f.vencimento).toLocaleDateString("pt-BR")}` +
          (atraso > 0
            ? `, ${atraso} dias de atraso — original ${brl(f.valorTotal)} + multa ${brl(multa)} + juros ${brl(juros)} = ${brl(valorAtual)}`
            : `, valor ${brl(valorAtual)}`)
        );
      });
      return (
        `${faturas.length} fatura(s) em aberto, total atualizado ${brl(total)}:\n` +
        linhas.join("\n") +
        `\nInforme esses valores ao cliente. Você pode propor um parcelamento; a formalização do acordo é feita por um atendente humano.`
      );
    },
  });

  // ─── Compra e venda (4ª IA) ──────────────────────────────────────────────

  const buscarImoveisVenda = betaTool({
    name: "buscar_imoveis_venda",
    description:
      "Busca imóveis À VENDA na carteira (para compradores). Filtros opcionais por tipo, preço máximo e bairro.",
    inputSchema: {
      type: "object",
      properties: {
        tipo: { type: "string", description: "Apartamento, Casa, Sala comercial, Terreno..." },
        valorMaximo: { type: "number", description: "preço de venda máximo em R$" },
        bairro: { type: "string" },
        quartos: { type: "number", description: "mínimo de quartos" },
        banheiros: { type: "number", description: "mínimo de banheiros" },
      },
      required: [],
    },
    run: async (input: {
      tipo?: string;
      valorMaximo?: number;
      bairro?: string;
      quartos?: number;
      banheiros?: number;
    }) => {
      const imob = await prisma.imobiliaria.findUnique({ where: { id: ctx.conversa.imobiliariaId } });
      const base = {
        imobiliariaId: ctx.conversa.imobiliariaId,
        finalidade: { in: ["VENDA", "AMBOS"] },
        status: { not: "INATIVO" as const },
        ...(input.tipo ? { tipo: { contains: input.tipo, mode: "insensitive" as const } } : {}),
        ...(input.valorMaximo ? { valorVenda: { lte: input.valorMaximo } } : {}),
        ...(input.quartos ? { quartos: { gte: Math.trunc(input.quartos) } } : {}),
        ...(input.banheiros ? { banheiros: { gte: Math.trunc(input.banheiros) } } : {}),
      };
      const exatos = await prisma.imovel.findMany({
        where: { ...base, ...(input.bairro ? { bairro: { contains: input.bairro, mode: "insensitive" } } : {}) },
        include: { _count: { select: { fotos: true } } },
        take: 6,
      });
      const proximidade = new Map<number, number>();
      let lista = exatos;
      if (input.bairro && exatos.length < 6) {
        const candidatos = await prisma.imovel.findMany({
          where: { ...base, NOT: { bairro: { contains: input.bairro, mode: "insensitive" } } },
          include: { _count: { select: { fotos: true } } },
          take: 25,
        });
        const { distanciasAoBairro, RAIO_PROXIMIDADE_KM } = await import("@/lib/geo");
        const dist = await distanciasAoBairro(candidatos, input.bairro, imob?.municipio, imob?.uf);
        const perto = candidatos
          .filter((c) => (dist.get(c) ?? Infinity) <= RAIO_PROXIMIDADE_KM)
          .sort((a, b) => (dist.get(a) ?? 9) - (dist.get(b) ?? 9))
          .slice(0, 6 - exatos.length);
        perto.forEach((p) => proximidade.set(p.id, dist.get(p) ?? 0));
        lista = [...exatos, ...perto];
      }
      if (lista.length === 0) return "Nenhum imóvel à venda com esses critérios.";
      return lista
        .map(
          (i) =>
            `${i.codigo}: ${i.tipo} em ${i.endereco}${i.bairro ? `, ${i.bairro}` : ""} — ${brl(i.valorVenda)}` +
            (i.valorCondominio ? ` | cond. ${brl(i.valorCondominio)}` : "") +
            (proximidade.get(i.id) !== undefined ? ` | fica a ${proximidade.get(i.id)!.toFixed(1)} km de ${input.bairro}` : "") +
            (i._count.fotos > 0 ? ` | ${i._count.fotos} foto(s) — use enviar_fotos_imovel` : " | (sem fotos)")
        )
        .join("\n") + (await avisoQualificacaoPendente());
    },
  });

  const registrarInteresseCompra = betaTool({
    name: "registrar_interesse_compra",
    description:
      "Registra (ou atualiza) o COMPRADOR como lead de compra no CRM. Chame assim que souber o nome do interessado.",
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        telefone: { type: "string" },
        codigoImovel: { type: "string", description: "código do imóvel de interesse, ex.: AP-0002" },
        nomeEmpreendimento: {
          type: "string",
          description: "nome do empreendimento de interesse (imóvel na planta), quando for o caso",
        },
        temperatura: { type: "string", enum: ["QUENTE", "MORNO", "FRIO"] },
      },
      required: ["nome"],
      additionalProperties: false,
    },
    run: async (input: { nome: string; telefone?: string; codigoImovel?: string; nomeEmpreendimento?: string; temperatura?: "QUENTE" | "MORNO" | "FRIO" }) => {
      const telefone = input.telefone ?? ctx.conversa.contatoTelefone ?? null;
      const imovel = input.codigoImovel
        ? await prisma.imovel.findFirst({ where: { codigo: input.codigoImovel, imobiliariaId: ctx.conversa.imobiliariaId } })
        : null;
      // Na planta não existe unidade ainda: o interesse aponta para o prédio.
      const empreendimento = input.nomeEmpreendimento
        ? await prisma.empreendimento.findFirst({
            where: {
              imobiliariaId: ctx.conversa.imobiliariaId,
              nome: { contains: input.nomeEmpreendimento, mode: "insensitive" },
            },
          })
        : null;
      const existente = telefone
        ? await prisma.lead.findFirst({
            where: { telefone, imobiliariaId: ctx.conversa.imobiliariaId, finalidade: "COMPRA" },
            orderBy: { criadoEm: "desc" },
          })
        : null;
      const lead = existente
        ? await prisma.lead.update({
            where: { id: existente.id },
            data: {
              status: existente.status === "NOVO" ? "ATENDIMENTO" : existente.status,
              imovelId: imovel?.id ?? existente.imovelId,
              empreendimentoId: empreendimento?.id ?? existente.empreendimentoId,
              temperatura: input.temperatura ?? existente.temperatura,
            },
          })
        : await prisma.lead.create({
            data: {
              imobiliariaId: ctx.conversa.imobiliariaId,
              nome: input.nome,
              telefone,
              origem: "WHATSAPP",
              status: "ATENDIMENTO",
              finalidade: "COMPRA",
              temperatura: input.temperatura ?? "MORNO",
              imovelId: imovel?.id,
              empreendimentoId: empreendimento?.id,
            },
          });
      await auditar("LEAD_COMPRA_REGISTRADO_IA", "Lead", lead.id, `comprador via IA: ${lead.nome}`);
      await import("@/lib/followup").then((m) => m.iniciarCadencia(lead.id)).catch(() => {});
      // Registrado o comprador, a escada de qualificação abre SEMPRE — é ela
      // que decide o que apresentar. A IA recebe aqui a primeira pergunta, para
      // não improvisar a ordem nem sair mostrando imóvel antes da hora.
      const onde = empreendimento
        ? ` no empreendimento ${empreendimento.nome}`
        : imovel
          ? ` com interesse no ${imovel.codigo}`
          : "";
      return (
        `Comprador registrado (id ${lead.id})${onde}. QUALIFIQUE ANTES DE APRESENTAR. ` +
        (await situacaoDaQualificacao(lead.id))
      );
    },
  });

  // ─── Empreendimento na planta: qualificação de financiamento ─────────────
  //
  // Vender na planta é vender FINANCIAMENTO. As três ferramentas abaixo existem
  // para a conversa seguir a escada certa: mostrar o empreendimento, colher as
  // 7 respostas que decidem se a pessoa compra, e só então pedir documento.

  const buscarEmpreendimentos = betaTool({
    name: "buscar_empreendimentos",
    description:
      "Busca EMPREENDIMENTOS (prédios na planta ou em obras) da carteira, com construtora, entrega, metragem, preço e faixas do Minha Casa Minha Vida. Use quando a pessoa perguntar de lançamento, imóvel na planta, ou quando a renda dela couber no MCMV.",
    inputSchema: {
      type: "object",
      properties: {
        cidade: { type: "string" },
        bairro: { type: "string" },
        precoMaximo: { type: "number", description: "preço de avaliação máximo em R$" },
        faixaMcmv: { type: "number", description: "1, 2, 3 ou 4 — filtra os que atendem a faixa" },
        quartos: { type: "number", description: "mínimo de quartos" },
        banheiros: { type: "number", description: "mínimo de banheiros" },
        parcelaEntrada: {
          type: "boolean",
          description:
            "true = só obras NÃO ENTREGUES, as únicas que parcelam a entrada com a construtora",
        },
      },
      required: [],
      additionalProperties: false,
    },
    run: async (input: {
      cidade?: string;
      bairro?: string;
      precoMaximo?: number;
      faixaMcmv?: number;
      quartos?: number;
      banheiros?: number;
      parcelaEntrada?: boolean;
    }) => {
      const { whereSituacao } = await import("@/lib/empreendimentos");
      const lista = await prisma.empreendimento.findMany({
        where: {
          imobiliariaId: ctx.conversa.imobiliariaId,
          ...(input.cidade ? { cidade: { contains: input.cidade, mode: "insensitive" as const } } : {}),
          ...(input.bairro ? { bairro: { contains: input.bairro, mode: "insensitive" as const } } : {}),
          ...(input.precoMaximo ? { precoAvaliacao: { lte: input.precoMaximo } } : {}),
          ...(input.faixaMcmv ? { faixasMcmv: { has: Math.trunc(input.faixaMcmv) } } : {}),
          // Produto: >= porque quem pede 2 quartos aceita 3, nunca 1.
          ...(input.quartos ? { quartos: { gte: Math.trunc(input.quartos) } } : {}),
          ...(input.banheiros ? { banheiros: { gte: Math.trunc(input.banheiros) } } : {}),
          // Filtra no BANCO, antes do take — senão a página vem torta.
          ...(input.parcelaEntrada ? whereSituacao("PARCELA_ENTRADA") : {}),
        },
        take: 6,
        orderBy: { nome: "asc" },
        include: {
          // Foto é da UNIDADE (Imovel), não do empreendimento. Precisamos saber
          // se existe alguma para não oferecer o que não existe.
          imoveis: { select: { codigo: true, _count: { select: { fotos: true } } }, take: 20 },
        },
      });
      if (lista.length === 0) return "Nenhum empreendimento com esses critérios.";
      const { fichaParaIA } = await import("@/lib/empreendimentos");
      const { PERGUNTAS } = await import("@/lib/qualificacao");

      const fichas = lista.map((e) =>
        fichaParaIA(
          {
            ...e,
            precoAvaliacao: e.precoAvaliacao ? Number(e.precoAvaliacao) : null,
          },
          {
            entrega: e,
            unidadesComFoto: e.imoveis.filter((i) => i._count.fotos > 0).map((i) => i.codigo),
          }
        )
      );

      return (
        fichas.join("\n") +
        `\n\nCOMO APRESENTAR: a construtora é empresa. Diga "da ${lista[0]!.construtora}", nunca "no ${lista[0]!.construtora}". ` +
        `Localização é o bairro e a cidade, não a construtora.` +
        `\nPRÓXIMO PASSO OBRIGATÓRIO: empreendimento vai para a qualificação de financiamento. ` +
        `Depois de apresentar, NÃO ofereça foto nem visita: registre com registrar_interesse_compra (nomeEmpreendimento) ` +
        `e faça a primeira pergunta: "${PERGUNTAS[0]!.pergunta}"` +
        (await avisoQualificacaoPendente())
      );
    },
  });

  const enviarBookEmpreendimento = betaTool({
    name: "enviar_book_empreendimento",
    description:
      "Envia o BOOK (PDF) do empreendimento pelo WhatsApp do interessado. Só use quando a ficha do empreendimento disser que o book está DISPONÍVEL, e só do empreendimento que você já apresentou para este perfil.",
    inputSchema: {
      type: "object",
      properties: {
        nomeEmpreendimento: { type: "string", description: "nome do empreendimento" },
      },
      required: ["nomeEmpreendimento"],
      additionalProperties: false,
    },
    run: async (input: { nomeEmpreendimento: string }) => {
      const emp = await prisma.empreendimento.findFirst({
        where: {
          imobiliariaId: ctx.conversa.imobiliariaId,
          nome: { contains: input.nomeEmpreendimento, mode: "insensitive" },
        },
      });
      if (!emp) return `ERRO: não achei o empreendimento "${input.nomeEmpreendimento}".`;
      // Sem book não existe material NENHUM deste empreendimento. Prometer que
      // vai mandar depois é a mentira que a regra do prompt existe para evitar.
      if (!emp.bookUrl) {
        return `${emp.nome} NÃO tem book cadastrado. Não prometa material. Descreva o empreendimento com o que você já tem e siga a conversa.`;
      }
      const { enviarWhatsAppDocumento } = await import("@/lib/whatsapp");
      const destinos = [ctx.conversa.contatoJid, ctx.conversa.contatoTelefone].filter(
        (d): d is string => Boolean(d)
      );
      const r = await enviarWhatsAppDocumento(
        ctx.conversa.contatoTelefone ?? "",
        emp.bookUrl,
        emp.bookNome || `${emp.nome}.pdf`,
        ctx.conversa.imobiliariaId,
        destinos
      );
      if (!r.enviado) {
        return `Não consegui enviar o book agora (${r.detalhe ?? "erro"}). Siga a conversa sem prometer o envio.`;
      }
      await auditar("BOOK_ENVIADO_IA", "Empreendimento", emp.id, `book de ${emp.nome}`);
      return `Book do ${emp.nome} enviado. Comente em UMA frase o que mais combina com o perfil dela e siga a qualificação.`;
    },
  });

  // O lead de compra desta conversa — as ferramentas de qualificação sempre
  // gravam no lead certo (o do telefone que está falando), nunca "no último".
  async function leadDeCompraDaConversa() {
    const telefone = ctx.conversa.contatoTelefone ?? null;
    if (!telefone) return null;
    return prisma.lead.findFirst({
      where: { telefone, imobiliariaId: ctx.conversa.imobiliariaId, finalidade: "COMPRA" },
      orderBy: { criadoEm: "desc" },
      include: { qualificacao: true, empreendimento: true },
    });
  }

  // Texto que a IA lê depois de gravar: onde a escada parou e o que já dá para
  // concluir. Devolvido às ferramentas para ela nunca repetir pergunta.
  async function situacaoDaQualificacao(leadId: number) {
    const q = await prisma.qualificacaoMcmv.findUnique({ where: { leadId } });
    const { analisar, proximaPergunta, documentosPendentes } = await import("@/lib/qualificacao");
    // Sempre pelo conversor: campo novo na qualificação entra aqui sozinho, em
    // vez de ficar faltando em três lugares diferentes.
    const { respostasDaQualificacao } = await import("@/lib/qualificacao");
    const r = q ? respostasDaQualificacao(q) : { documentosRecebidos: [] };
    const a = analisar(r);
    const partes = [`Qualificação: ${a.respondidas}/${a.total} respondidas.`];
    if (a.faixa) {
      partes.push(
        `Enquadra na ${a.faixa.rotulo} (renda até ${brl(a.faixa.rendaAte)}, imóvel até ${brl(a.faixa.tetoImovel)}, ~${a.faixa.jurosAnoPct}% a.a.).`
      );
    }
    if (a.parcelaMaxima) partes.push(`Parcela máxima aceita pelo banco: ${brl(a.parcelaMaxima)} (30% da renda).`);
    if (a.prazoMaximoMeses != null) partes.push(`Prazo máximo pela idade: ${a.prazoMaximoMeses} meses.`);
    if (a.podeUsarFgts === true) partes.push("Pode usar o FGTS na entrada.");
    for (const i of a.impeditivos) partes.push(`IMPEDITIVO: ${i}`);
    for (const t of a.atencoes) partes.push(`Atenção: ${t}`);

    // Nome restrito sem outro titular: a conversa PARA aqui. Nem pergunta, nem
    // imóvel, nem "vou te mandar umas opções enquanto isso".
    if (a.bloqueio) {
      const quando = a.bloqueio.retomarEm
        ? a.bloqueio.retomarEm.toLocaleDateString("pt-BR")
        : null;
      return (
        `PARE A QUALIFICAÇÃO. Nome restrito e sem outro titular. NÃO faça mais perguntas, NÃO apresente imóvel, NÃO insista. ` +
        (quando
          ? `Diga com educação que sem o nome limpo o banco não aprova, que você anotou e volta a falar em ${quando}, e encerre.`
          : `Pegue a previsão de quitação e encerre dizendo que volta nessa data.`)
      );
    }

    const prox = proximaPergunta(r);
    if (prox) {
      partes.push(
        `NÃO apresente imóvel ainda. PRÓXIMA PERGUNTA (faça só esta agora): "${prox.pergunta}"`
      );
    } else {
      // Qualificação fechada: agora sim apresenta, e apresenta só o que cabe.
      // O teto é o do PROGRAMA (não é promessa de crédito aprovado).
      const filtros = [
        a.quartos != null ? `quartos=${a.quartos}` : null,
        a.banheiros != null ? `banheiros=${a.banheiros}` : null,
        a.localizacao ? `bairro="${a.localizacao}"` : null,
        a.somenteNaPlanta ? "parcelaEntrada=true" : null,
      ].filter(Boolean);
      if (a.faixa) {
        partes.push(
          `AGORA APRESENTE, só o que cabe: busque com precoMaximo=${a.tetoComEntrada ?? a.faixa.tetoImovel}, faixaMcmv=${a.faixa.faixa}` +
            (filtros.length ? `, ${filtros.join(", ")}` : "") +
            "."
        );
      } else {
        partes.push(
          `AGORA APRESENTE. Fora do MCMV: use a renda para julgar o que faz sentido mostrar` +
            (filtros.length ? `, com ${filtros.join(", ")}` : "") +
            "."
        );
      }
      if (a.somenteNaPlanta) {
        partes.push(
          "SEM ENTRADA E QUER PARCELAR: só empreendimento NÃO ENTREGUE serve — pronto exige entrada à vista. E o FGTS dela é o caminho da entrada."
        );
      }
      const faltam = documentosPendentes(r);
      partes.push(
        faltam.length === 0
          ? "Perguntas e documentos completos. Avise que a equipe assume a análise."
          : `Perguntas completas. Peça agora os documentos que faltam: ${faltam
              .map((d) => d.titulo + (d.detalhe ? ` (${d.detalhe})` : ""))
              .join("; ")}.`
      );
      for (const d of faltam) {
        if (d.soComCarteira && d.alternativa && !["CLT", "SERVIDOR", "APOSENTADO"].includes(String(r.vinculo)))
          partes.push(`No lugar de "${d.titulo}", peça: ${d.alternativa}.`);
      }
    }
    return partes.join(" ");
  }

  // Anexado ao resultado das buscas: apresentar antes de qualificar é o erro
  // que faz o cliente se apaixonar pelo que não consegue comprar. A busca não
  // é bloqueada (a IA às vezes precisa responder um preço direto), mas o
  // resultado vem com a ordem de voltar para a pergunta que falta.
  async function avisoQualificacaoPendente(): Promise<string> {
    const lead = await leadDeCompraDaConversa();
    if (!lead) return "\n\nAINDA NÃO qualificou este contato. Registre com registrar_interesse_compra e qualifique ANTES de apresentar.";
    const { proximaPergunta, analisar } = await import("@/lib/qualificacao");
    const q = lead.qualificacao;
    // Sempre pelo conversor: campo novo na qualificação entra aqui sozinho, em
    // vez de ficar faltando em três lugares diferentes.
    const { respostasDaQualificacao } = await import("@/lib/qualificacao");
    const r = q ? respostasDaQualificacao(q) : { documentosRecebidos: [] };
    const prox = proximaPergunta(r);
    if (!prox) return "";
    const a = analisar(r);
    return (
      `\n\nQUALIFICAÇÃO INCOMPLETA (${a.respondidas}/${a.total}). Mostre no MÁXIMO uma opção, ` +
      `e termine a mensagem com esta pergunta: "${prox.pergunta}"`
    );
  }

  const qualificarComprador = betaTool({
    name: "qualificar_comprador",
    description:
      "Grava as respostas da qualificação de financiamento do comprador (empreendimento/financiamento). Envie SÓ os campos que a pessoa acabou de responder — os outros ficam como estão. Devolve o enquadramento calculado e a PRÓXIMA pergunta a fazer.",
    inputSchema: {
      type: "object",
      properties: {
        primeiroImovel: { type: "boolean", description: "true se for o primeiro imóvel; false se já tem algum no nome" },
        vinculo: {
          type: "string",
          enum: ["CLT", "AUTONOMO", "MEI", "EMPRESARIO", "SERVIDOR", "APOSENTADO"],
          description: "CLT = registrado em carteira",
        },
        tresAnosRegistro: { type: "boolean", description: "tem 3 anos ou mais de carteira assinada (somando empregos)" },
        dependentes: { type: "number", description: "quantidade de dependentes (0 se não tiver)" },
        rendaBrutaMensal: { type: "number", description: "renda bruta familiar mensal em R$" },
        dataNascimento: { type: "string", description: "data de nascimento no formato AAAA-MM-DD" },
        temFgts: { type: "boolean" },
        estadoCivil: {
          type: "string",
          enum: ["SOLTEIRO", "CASADO", "UNIAO_ESTAVEL", "DIVORCIADO", "VIUVO"],
        },
        rendaDeclaradaIr: {
          type: "boolean",
          description: "a renda informada foi declarada no último imposto de renda",
        },
        conjugeNome: { type: "string", description: "só quando casado ou em união estável" },
        conjugeVinculo: {
          type: "string",
          enum: ["CLT", "AUTONOMO", "MEI", "EMPRESARIO", "SERVIDOR", "APOSENTADO"],
        },
        conjugeRendaBrutaMensal: { type: "number", description: "renda bruta mensal do cônjuge em R$" },
        conjugeDataNascimento: { type: "string", description: "AAAA-MM-DD" },
        conjugeImovelProprio: {
          type: "boolean",
          description: "o cônjuge já tem imóvel no nome dele (tira o CASAL do MCMV)",
        },
        quartosDesejados: { type: "number", description: "quantos quartos ela precisa" },
        banheirosDesejados: { type: "number", description: "quantos banheiros" },
        localizacaoDesejada: { type: "string", description: "bairro ou região onde quer morar" },
        nomeRestrito: { type: "boolean", description: "tem restrição no nome (Serasa/SPC)" },
        previsaoQuitacao: { type: "string", description: "AAAA-MM-DD — quando espera quitar" },
        temOutroTitular: {
          type: "boolean",
          description: "tem outra pessoa para entrar no financiamento no lugar dela",
        },
        nomeAlternativo: { type: "string", description: "nome dessa outra pessoa" },
        entradaDisponivel: {
          type: "number",
          description: "quanto tem de entrada, em R$. Mande 0 quando ela disser que não tem nada.",
        },
        querParcelarEntrada: { type: "boolean", description: "sem entrada, quer parcelar" },
        parcelaDesejada: { type: "number", description: "parcela mensal que espera pagar, em R$" },
        observacoes: { type: "string" },
      },
      required: [],
      additionalProperties: false,
    },
    run: async (input: Record<string, unknown>) => {
      const lead = await leadDeCompraDaConversa();
      if (!lead) return "Ainda não há lead de compra para este contato. Chame registrar_interesse_compra antes.";

      const dataOuIndefinida = (v: unknown) =>
        typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
          ? new Date(`${v}T12:00:00.000Z`)
          : undefined;
      const nascimento = dataOuIndefinida(input.dataNascimento);
      // undefined = não mexe no campo; a IA manda só o que acabou de descobrir.
      const dados = {
        primeiroImovel: typeof input.primeiroImovel === "boolean" ? input.primeiroImovel : undefined,
        vinculo: typeof input.vinculo === "string" ? input.vinculo : undefined,
        tresAnosRegistro: typeof input.tresAnosRegistro === "boolean" ? input.tresAnosRegistro : undefined,
        dependentes: typeof input.dependentes === "number" ? Math.max(0, Math.trunc(input.dependentes)) : undefined,
        rendaBrutaMensal: typeof input.rendaBrutaMensal === "number" ? input.rendaBrutaMensal : undefined,
        dataNascimento: nascimento,
        temFgts: typeof input.temFgts === "boolean" ? input.temFgts : undefined,
        estadoCivil: typeof input.estadoCivil === "string" ? input.estadoCivil : undefined,
        rendaDeclaradaIr:
          typeof input.rendaDeclaradaIr === "boolean" ? input.rendaDeclaradaIr : undefined,
        conjugeNome: typeof input.conjugeNome === "string" ? input.conjugeNome : undefined,
        conjugeVinculo: typeof input.conjugeVinculo === "string" ? input.conjugeVinculo : undefined,
        conjugeRendaBrutaMensal:
          typeof input.conjugeRendaBrutaMensal === "number" ? input.conjugeRendaBrutaMensal : undefined,
        conjugeDataNascimento: dataOuIndefinida(input.conjugeDataNascimento),
        conjugeImovelProprio:
          typeof input.conjugeImovelProprio === "boolean" ? input.conjugeImovelProprio : undefined,
        quartosDesejados:
          typeof input.quartosDesejados === "number" ? Math.trunc(input.quartosDesejados) : undefined,
        banheirosDesejados:
          typeof input.banheirosDesejados === "number" ? Math.trunc(input.banheirosDesejados) : undefined,
        localizacaoDesejada:
          typeof input.localizacaoDesejada === "string" ? input.localizacaoDesejada : undefined,
        nomeRestrito: typeof input.nomeRestrito === "boolean" ? input.nomeRestrito : undefined,
        previsaoQuitacao: dataOuIndefinida(input.previsaoQuitacao),
        temOutroTitular:
          typeof input.temOutroTitular === "boolean" ? input.temOutroTitular : undefined,
        nomeAlternativo:
          typeof input.nomeAlternativo === "string" ? input.nomeAlternativo : undefined,
        entradaDisponivel:
          typeof input.entradaDisponivel === "number" ? input.entradaDisponivel : undefined,
        querParcelarEntrada:
          typeof input.querParcelarEntrada === "boolean" ? input.querParcelarEntrada : undefined,
        parcelaDesejada:
          typeof input.parcelaDesejada === "number" ? input.parcelaDesejada : undefined,
        observacoes: typeof input.observacoes === "string" ? input.observacoes : undefined,
      };
      await prisma.qualificacaoMcmv.upsert({
        where: { leadId: lead.id },
        update: dados,
        create: { leadId: lead.id, ...dados },
      });
      // Qualificação em andamento é lead quente: quem responde renda e
      // nascimento não está passeando.
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: lead.status === "NOVO" ? "ATENDIMENTO" : lead.status },
      });
      await auditar("QUALIFICACAO_ATUALIZADA_IA", "Lead", lead.id, `qualificação de financiamento`);

      // Nome restrito sem outro titular: a Carol some até a data da quitação.
      // Deixar a cadência de 5 toques rodando em cima de quem não pode financiar
      // é o "a IA insiste" na veia — então followUpEm zera e retomarEm assume.
      const q = await prisma.qualificacaoMcmv.findUnique({ where: { leadId: lead.id } });
      const { bloqueadoPorRestricao, respostasDaQualificacao } = await import("@/lib/qualificacao");
      if (q && bloqueadoPorRestricao(respostasDaQualificacao(q))) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            retomarEm: q.previsaoQuitacao,
            retomarMotivo: "nome restrito: aguardando quitação",
            followUpEm: null,
          },
        });
        await auditar(
          "LEAD_AGUARDANDO_QUITACAO",
          "Lead",
          lead.id,
          q.previsaoQuitacao ? `retomar em ${q.previsaoQuitacao.toISOString().slice(0, 10)}` : "sem data"
        );
      } else if (q && lead.retomarEm) {
        // Destravou (apareceu outro titular ou a restrição caiu): volta ao normal.
        await prisma.lead.update({
          where: { id: lead.id },
          data: { retomarEm: null, retomarMotivo: null },
        });
      }
      return situacaoDaQualificacao(lead.id);
    },
  });

  const registrarDocumentos = betaTool({
    name: "registrar_documentos",
    description:
      "Marca os documentos que o comprador JÁ ENVIOU. Só chame depois das 7 perguntas respondidas. Devolve o que ainda falta.",
    inputSchema: {
      type: "object",
      properties: {
        recebidos: {
          type: "array",
          description: "chaves dos documentos recebidos",
          items: {
            type: "string",
            enum: [
              "IDENTIDADE",
              "ESTADO_CIVIL",
              "RESIDENCIA",
              "CTPS",
              "HOLERITE",
              "EXTRATO_FGTS",
              "CONJUGE",
            ],
          },
        },
      },
      required: ["recebidos"],
      additionalProperties: false,
    },
    run: async (input: { recebidos: string[] }) => {
      const lead = await leadDeCompraDaConversa();
      if (!lead) return "Ainda não há lead de compra para este contato. Chame registrar_interesse_compra antes.";
      const { normalizarDocumentos } = await import("@/lib/qualificacao");
      const novos = normalizarDocumentos(input.recebidos ?? []);
      const atuais = lead.qualificacao?.documentosRecebidos ?? [];
      const juntos = [...new Set([...atuais, ...novos])];
      await prisma.qualificacaoMcmv.upsert({
        where: { leadId: lead.id },
        update: { documentosRecebidos: juntos },
        create: { leadId: lead.id, documentosRecebidos: juntos },
      });
      await auditar("DOCUMENTOS_RECEBIDOS_IA", "Lead", lead.id, juntos.join(", "));
      return situacaoDaQualificacao(lead.id);
    },
  });

  const registrarPropostaCompra = betaTool({
    name: "solicitar_fechamento",
    description:
      "Formaliza a PROPOSTA DE COMPRA (oferta de preço) do interessado por um imóvel à venda. Sinaliza a negociação para a equipe fechar. NÃO gera contrato nem aceita a proposta sozinha.",
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        cpfCnpj: { type: "string" },
        codigoImovel: { type: "string" },
        valorOfertado: { type: "number", description: "valor oferecido em R$" },
        formaPagamento: { type: "string", description: "A_VISTA, FINANCIAMENTO, FGTS, PERMUTA..." },
        entrada: { type: "number", description: "valor de entrada (financiamento), se houver" },
        observacoes: { type: "string", description: "detalhes da oferta; se for PERMUTA, descreva o bem oferecido e o valor estimado dele" },
      },
      required: ["nome", "codigoImovel", "valorOfertado"],
      additionalProperties: false,
    },
    run: async (input: {
      nome: string; cpfCnpj?: string; codigoImovel: string; valorOfertado: number;
      formaPagamento?: string; entrada?: number; observacoes?: string;
    }) => {
      const imovel = await prisma.imovel.findFirst({
        where: { codigo: input.codigoImovel, imobiliariaId: ctx.conversa.imobiliariaId, finalidade: { in: ["VENDA", "AMBOS"] } },
      });
      if (!imovel) return `ERRO: imóvel ${input.codigoImovel} não encontrado entre os que estão à venda.`;
      const telefone = ctx.conversa.contatoTelefone;
      const lead = telefone
        ? await prisma.lead.findFirst({
            where: { telefone, imobiliariaId: ctx.conversa.imobiliariaId, finalidade: "COMPRA" },
            orderBy: { criadoEm: "desc" },
          })
        : null;
      const proposta = await prisma.propostaCompra.create({
        data: {
          imobiliariaId: ctx.conversa.imobiliariaId,
          leadId: lead?.id,
          imovelId: imovel.id,
          nome: input.nome,
          cpfCnpj: input.cpfCnpj,
          telefone: telefone ?? null,
          valorOfertado: input.valorOfertado,
          formaPagamento: input.formaPagamento,
          entrada: input.entrada,
          observacoes: input.observacoes,
        },
      });
      if (lead) await prisma.lead.update({ where: { id: lead.id }, data: { status: "PROPOSTA" } });
      await auditar("PROPOSTA_COMPRA_REGISTRADA_IA", "PropostaCompra", proposta.id, `${input.nome} ofertou ${brl(input.valorOfertado)} no ${imovel.codigo}`);
      const pedido = Number(imovel.valorVenda ?? 0);
      const nota =
        pedido > 0 && input.valorOfertado < pedido * 0.9
          ? " A oferta está bem abaixo do pedido; diga que leva ao proprietário mas pode haver contraproposta."
          : " Diga que leva a oferta ao proprietário e retorna com a resposta.";
      return `Proposta de compra registrada (#${proposta.id}) — ${brl(input.valorOfertado)} no ${imovel.codigo} (pedido ${brl(pedido)}).${nota} A equipe conduz a negociação e a documentação.`;
    },
  });

  // ─── Ajuda Corretor (assistente interno da equipe) ───────────────────────

  const buscarImoveisCorretor = betaTool({
    name: "buscar_imoveis_corretor",
    description:
      "Consulta a carteira de imóveis para o CORRETOR (uso interno). Lista por cidade, bairro, tipo, finalidade (locação/venda) e status. Use quando o corretor perguntar o que temos em tal lugar (ex.: 'quais imóveis temos em Dianópolis?').",
    inputSchema: {
      type: "object",
      properties: {
        cidade: { type: "string" },
        bairro: { type: "string" },
        tipo: { type: "string", description: "Apartamento, Casa, Sala comercial, Terreno..." },
        finalidade: { type: "string", enum: ["LOCACAO", "VENDA"], description: "filtra por locação ou venda" },
        valorMaximo: { type: "number" },
        status: { type: "string", enum: ["DISPONIVEL", "ALUGADO", "EM_REFORMA", "INATIVO"], description: "por padrão traz os DISPONÍVEIS" },
      },
      required: [],
      additionalProperties: false,
    },
    run: async (input: {
      cidade?: string; bairro?: string; tipo?: string;
      finalidade?: "LOCACAO" | "VENDA"; valorMaximo?: number; status?: string;
    }) => {
      const finFiltro =
        input.finalidade === "VENDA" ? ["VENDA", "AMBOS"] : input.finalidade === "LOCACAO" ? ["LOCACAO", "AMBOS"] : undefined;
      const imoveis = await prisma.imovel.findMany({
        where: {
          imobiliariaId: ctx.conversa.imobiliariaId,
          status: (input.status as "DISPONIVEL" | "ALUGADO" | "EM_REFORMA" | "INATIVO") ?? "DISPONIVEL",
          ...(finFiltro ? { finalidade: { in: finFiltro } } : {}),
          ...(input.cidade ? { cidade: { contains: input.cidade, mode: "insensitive" } } : {}),
          ...(input.bairro ? { bairro: { contains: input.bairro, mode: "insensitive" } } : {}),
          ...(input.tipo ? { tipo: { contains: input.tipo, mode: "insensitive" } } : {}),
          ...(input.valorMaximo
            ? input.finalidade === "VENDA"
              ? { valorVenda: { lte: input.valorMaximo } }
              : { valorSugerido: { lte: input.valorMaximo } }
            : {}),
        },
        include: { _count: { select: { fotos: true } } },
        orderBy: { codigo: "asc" },
        take: 20,
      });
      if (imoveis.length === 0) return "Nenhum imóvel na carteira com esses critérios.";
      const linhas = imoveis.map((i) => {
        const preco = i.valorVenda ? `venda ${brl(i.valorVenda)}` : "";
        const aluguel = i.valorSugerido ? `aluguel ${brl(i.valorSugerido)}/mês` : "";
        const valores = [aluguel, preco].filter(Boolean).join(" · ") || "valor a definir";
        return `${i.codigo} · ${i.tipo} em ${i.endereco}${i.bairro ? `, ${i.bairro}` : ""} (${i.cidade}) · ${valores} · ${i.status}${i._count.fotos > 0 ? ` · ${i._count.fotos} foto(s)` : " · sem fotos"}`;
      });
      return `${imoveis.length} imóvel(is):\n${linhas.join("\n")}\nPasse a lista ao corretor de forma organizada. Se ele pedir as fotos ou detalhes de um, use enviar_fotos_imovel / detalhes_imovel pelo código.`;
    },
  });

  const detalhesImovel = betaTool({
    name: "detalhes_imovel",
    description: "Detalhes completos de um imóvel da carteira pelo código, para o corretor (inclui proprietário e situação).",
    inputSchema: {
      type: "object",
      properties: { codigoImovel: { type: "string", description: "ex.: AP-0002" } },
      required: ["codigoImovel"],
      additionalProperties: false,
    },
    run: async (input: { codigoImovel: string }) => {
      const i = await prisma.imovel.findFirst({
        where: { codigo: input.codigoImovel, imobiliariaId: ctx.conversa.imobiliariaId },
        include: { proprietario: true, contratos: { where: { status: "ATIVO" }, include: { inquilino: true } }, _count: { select: { fotos: true } } },
      });
      if (!i) return `Imóvel ${input.codigoImovel} não encontrado na carteira.`;
      const partes = [
        `${i.codigo} · ${i.tipo} · ${i.status}`,
        `Endereço: ${i.endereco}${i.bairro ? `, ${i.bairro}` : ""} - ${i.cidade}/${i.uf}`,
        i.areaM2 ? `Área: ${i.areaM2} m²` : "",
        i.valorSugerido ? `Aluguel: ${brl(i.valorSugerido)}/mês` : "",
        i.valorVenda ? `Venda: ${brl(i.valorVenda)}` : "",
        i.valorCondominio ? `Condomínio: ${brl(i.valorCondominio)}` : "",
        i.valorIptuMensal ? `IPTU: ${brl(i.valorIptuMensal)}/mês` : "",
        `Proprietário: ${i.proprietario.nome}${i.proprietario.telefone ? ` (${i.proprietario.telefone})` : ""}`,
        i.contratos[0] ? `Locado por: ${i.contratos[0].inquilino.nome}` : "",
        `Fotos: ${i._count.fotos}`,
        i.observacoes ? `Obs: ${i.observacoes}` : "",
      ].filter(Boolean);
      return partes.join("\n") + "\nRepasse ao corretor de forma organizada. Fotos: enviar_fotos_imovel pelo código.";
    },
  });

  return {
    RECEPCAO: [direcionarAtendimento],
    CAPTACAO: [cadastrarProprietario, cadastrarImovel, cadastrarImovelVenda, agendarAvaliacao, consultarMercado],
    // REMOÇÕES INTENCIONAIS (não são esquecimento): registrar_proposta saiu de
    // VENDAS e solicitar_fechamento de COMPRA_VENDA — o módulo Comercial
    // QUALIFICA e entrega ao corretor, não fecha negócio. E consultar_mercado
    // ficou só em CAPTACAO: discutir se o preço está justo é conversa de
    // captação. As funções continuam no arquivo, usadas pela UI; só saíram do
    // array de tools destes agentes.
    VENDAS: [buscarImoveisDisponiveis, enviarFotosImovel, registrarLead, agendarVisitaTool, solicitarFechamento],
    ADMINISTRACAO: [enviarSegundaVia, abrirOcorrencia, consultarPendencias, consultarRepasse, consultarSituacaoImovel, aprovarOrcamento, notificarProprietario],
    COMPRA_VENDA: [
      buscarImoveisVenda,
      buscarEmpreendimentos,
      enviarFotosImovel,
      registrarInteresseCompra,
      qualificarComprador,
      registrarDocumentos,
      enviarBookEmpreendimento,
      agendarVisitaTool,
    ],
    AJUDA_CORRETOR: [buscarImoveisCorretor, detalhesImovel, enviarFotosImovel],
  };
}

// ─── System prompts ─────────────────────────────────────────────────────────

const PROMPT_BASE = `Você é a CAROL, atendente de uma administradora de imóveis brasileira, atendendo pelo WhatsApp. Você é sempre a mesma pessoa (Carol), só muda o assunto conforme o que o cliente precisa.

JEITO DE FALAR (vale para tudo):
- OBJETIVA acima de tudo: vá direto ao ponto, com o mínimo de palavras. Sem enrolação, sem repetir o que o cliente disse, sem frases de preenchimento ("que ótimo!", "perfeito!", "fico feliz em ajudar"). Corte tudo que não for necessário.
- NÃO use emoji. Nenhum, nunca.
- NÃO use travessão nem hífen longo (— ou –) em NENHUMA mensagem. Se precisar separar ideias, use ponto final e outra frase, ou vírgula. Nada de "certo — vamos lá": escreva "certo, vamos lá" ou duas frases.
- Informal e leve, como você falaria de verdade no WhatsApp com um conhecido. Pode usar "pra", "tá", "cê"/"você", contrações. Nada de tom formal, corporativo ou robótico, e nada de vendedor animado.
- UMA BOLHA. A resposta padrão é uma bolha curta, de 1 ou 2 frases. Duas bolhas só quando a segunda carrega um link ou um código (que precisa ficar inteiro). Três, nunca. Nada de textão.
- RESPONDA O QUE FOI PERGUNTADO, e pare. Não emende explicação que ninguém pediu, não liste as outras opções, não repita o que já disse antes. Se o cliente perguntou de UMA coisa, fale daquela coisa; se ele quiser saber das outras, ele pergunta.
  Ex.: "esse ape tem caução?" → "Tem sim. Costuma ser 3 aluguéis de depósito." E ACABOU. Não emende fiador, seguro-fiança e "qual dessas te interessa?" na mesma resposta.
- MENSAGENS PICADAS: o cliente costuma quebrar o raciocínio em várias mensagens seguidas ("tem caução" / "ou só seguro fiança" / "?"). Elas chegam juntas para você, como um bloco. Trate como UMA pergunta só e dê UMA resposta só — nunca uma resposta para cada linha.
- NÃO PAPAGAIE O CLIENTE. Nunca devolva o que ele acabou de dizer para confirmar. Nada de "Entendi, você quer comprar uma casa e tem restrição no nome, certo?" — ele sabe o que escreveu. Responda ou pergunte, direto.
- UMA pergunta por vez, no fim da bolha. Se você tem duas dúvidas, faça a mais importante e guarde a outra para a próxima mensagem.
- Apresente-se como Carol só na PRIMEIRA mensagem, e de forma curta ("Oi, aqui é a Carol.").
- Mantenha códigos/links (PIX copia-e-cola, linha digitável, URL) SEMPRE inteiros, no mesmo parágrafo, sem quebrar no meio.
- ÁUDIO (nota de voz): parte das suas respostas pode virar áudio automaticamente (o sistema decide). Escreva SEMPRE como quem FALA de verdade, no tom de uma corretora tranquila e desenrolada, à vontade, nada robótica. Regras do jeito falado:
  · CURTO: 1 ou 2 frases (5 a 8 segundos de fala). Nada de textão falado.
  · Descontraída e informal: pode usar "tipo", "beleza", "e aí", "fechou", "olha", "então". Entonação viva, expressiva, mas leve e sem pressa (nada de vendedora afobada).
  · Respiração e naturalidade: pode começar com uma muleta natural ("Então...", "Olha...", "Ó,") e usar reticências pra dar uma pausa/respiro. Soa gente, não locução.
  · Risada e ironia SEMPRE que couber, sem medo: pra isso, inclua uma tag de emoção em inglês entre colchetes minúsculos SÓ onde faz sentido: [laughs], [laughs softly], [sighs], [sarcastic], [excited]. Essas tags só valem na voz e SOMEM no texto exibido. Use com naturalidade, sem exagerar (no máximo uma por áudio).
  · NOME: se você já sabe o nome da pessoa, abra o áudio chamando pelo nome ("Oi, João!"). Se ainda não sabe, dê um oi caloroso sem inventar nome e já pergunte o nome na sequência.
  · Não use tags nem áudio em conteúdo sério (PIX, valores exatos, documento, link) — isso SEMPRE vai em texto. Mantenha o profissionalismo e o contexto da conversa.

REGRAS:
- CONTINUIDADE: você tem o histórico desta conversa (e um resumo de longo prazo). Use o que já foi dito — NUNCA repita perguntas já respondidas nem peça de novo dados que já tem. Ao mudar de assunto/área, aproveite tudo que o cliente já falou.
- NÃO REPITA (regra literal): nunca mande duas vezes a mesma frase, nem na mesma mensagem nem na seguinte. Quando o cliente traz uma objeção, o padrão é UM movimento só: responda a objeção e emende a próxima pergunta, na mesma mensagem. Não repita a informação que você já deu antes da objeção, não reapresente o imóvel, não refaça a pergunta que ele acabou de responder. Se a ferramenta te devolver de novo uma pergunta que você já fez nesta mensagem, ignore: ela já foi feita.
- COERÊNCIA (não se contradiga, não repita): decida UMA vez e mantenha. Não diga a mesma coisa duas vezes em mensagens seguidas, e NUNCA se contradiga (ex.: falar que um imóvel é longe e não vai oferecer e, logo depois, oferecer o mesmo imóvel). Não narre seu raciocínio nem fique "pensando alto" — dê a resposta final, limpa e decidida. Se for citar um imóvel, é porque VAI oferecer; se não vai oferecer, nem mencione.
- Use as ferramentas para registrar TODA informação colhida — nada fica só na conversa.
- Nunca invente dados; o que não souber, pergunte ou diga que confirma com a equipe.
- Colete as informações de forma natural, uma por vez, sem parecer formulário.
- ENCAMINHAMENTO INTERNO INVISÍVEL: quando o assunto muda de área (recepção → captação/vendas/administração), isso é SÓ no sistema. Você é sempre a Carol, então NUNCA diga nada como "nossa equipe de captação assume", "vou te encaminhar", "vou passar/transferir", "pra encaminhar". PROIBIDO mencionar equipe/área/setor nessa troca. Apenas continue a conversa e já faça a próxima pergunta do assunto. Ex.: se a pessoa diz que tem um imóvel pra alugar, responda direto "Certo. É casa ou apartamento?" — nada de anunciar transferência.
- ÚNICA EXCEÇÃO (humano real): assuntos genuinamente sensíveis — rescisão de contrato, reclamação grave, questão jurídica, negociação/desconto que exige aprovação. Aí sim avise, com educação, que um atendente da equipe vai continuar.
- Os textos que as ferramentas te devolvem são instruções internas para você — nunca repasse esse texto ao cliente.

OFERTA (regra absoluta): você só oferece, mostra ou envia imóveis que estão CADASTRADOS na NOSSA carteira (use buscar_imoveis_disponiveis / buscar_imoveis_venda). NUNCA ofereça um imóvel de portal ou de outra imobiliária, nem invente imóvel. Se não temos algo que sirva, diga com sinceridade e ofereça avisar quando entrar, ou agende para a equipe buscar.

PREÇO / MERCADO:
- Quando o cliente perguntar sobre valor/preço, use consultar_mercado (bairro/cidade certos; se for um imóvel específico, passe o codigoImovel). A base é a NOSSA carteira de imóveis semelhantes (e, quando houver, uma referência de mercado externa OPCIONAL). Responda com o que ela trouxer, no tom de quem conhece a região: cite a faixa e, se fizer sentido, o valor por m². Se ela disser que não há base suficiente, ofereça a avaliação de um corretor — NUNCA invente uma faixa.
- A referência de mercado é SÓ pra você precificar com mais noção e soar segura sobre a região. Ela NÃO é catálogo: você NUNCA oferece, descreve ou manda link de um anúncio de portal. Oferecer, mostrar foto e enviar imóvel é SEMPRE e SÓ da nossa carteira.
- Se não vier base nenhuma (nem carteira, nem mercado), NÃO invente preço nem chute "média de mercado": diga com sinceridade que a avaliação do corretor crava o valor, e ofereça agendar.
- Seja precisa com localização: ao falar de um bairro ou cidade, trate o lugar certo (não confunda bairros de nomes parecidos). Quando não tiver imóvel no bairro exato pedido, você pode oferecer opções da carteira PERTO, mas só até no máximo 1 a 2 km do bairro (a busca já te diz a distância de cada um). Ao oferecer algo de outro bairro, deixe claro que fica pertinho e a quantos km é.`;

const PROMPTS: Record<string, string> = {
  RECEPCAO: `${PROMPT_BASE}

Agora você está na RECEPÇÃO (triagem). Seu trabalho é UM SÓ: descobrir a área e chamar direcionar_atendimento. Você não conduz assunto nenhum.
A SAUDAÇÃO DE TRIAGEM É CONDICIONAL. Use só quando a pessoa NÃO disse o que quer (ex.: mandou apenas "Oi"): "Oi, aqui é a Carol. Você procura um imóvel pra alugar, quer anunciar um imóvel seu, ou já é cliente da gente?"
Se ela JÁ DISSE o que quer — mesmo que junto com o "oi", mesmo que em outra mensagem —, NÃO faça essa pergunta. Ela já respondeu. Encaminhe direto.
Assim que der pra deduzir o objetivo (não precisa de certeza absoluta), chame direcionar_atendimento com a área (isso é SÓ interno):
- proprietário querendo anunciar o imóvel dele, para ALUGAR ou para VENDER: CAPTACAO
- quer ALUGAR um imóvel para morar/usar: VENDAS
- quer COMPRAR um imóvel: COMPRA_VENDA. Isto INCLUI empreendimento na planta, lançamento, Minha Casa Minha Vida e dúvida de financiamento. Nada disso é assunto de humano: é seu, e tem fluxo próprio.
- já é cliente da carteira: ADMINISTRACAO (não precisa pedir CPF de cara, a identificação é pelo número e pelo histórico; só peça CPF se realmente não der pra seguir)
Se a pessoa tem mais de um assunto (ex.: veio alugar mas também quer comprar), resolva o assunto atual primeiro e só depois migre pro outro, sem perder o histórico.
DEPOIS DE CHAMAR A FERRAMENTA, NÃO ESCREVA NADA. Nem saudação, nem confirmação, nem pergunta. O atendimento continua sozinho, no assunto certo, com quem conhece o roteiro daquela área. Qualquer frase sua aqui é descartada e só atrapalha.
NUNCA invente uma pergunta para "adiantar" o assunto: você não conhece o roteiro da área de destino. Encaminhar É a sua resposta.
Casos de borda (aí sim é humano de verdade): busca parceria ou tem reclamação grave: diga com educação que um atendente da equipe vai ajudar.
NAO_CONTRATADO é SÓ para pedido cuja área não está na lista de opções da ferramenta. Se a área existe, é ela. NUNCA use NAO_CONTRATADO para comprar, empreendimento, Minha Casa Minha Vida ou financiamento quando COMPRA_VENDA estiver disponível.
Se a área que resolveria o pedido NÃO estiver na lista de opções da ferramenta, chame direcionar_atendimento com NAO_CONTRATADO. Nesse caso, diga apenas que um atendente da equipe vai continuar o atendimento — com cordialidade e SEM mencionar plano, módulo, sistema ou qualquer limitação. O cliente final da imobiliária nunca deve perceber que existe um limite comercial.`,
  CAPTACAO: `${PROMPT_BASE}

Agora o assunto é CAPTAÇÃO: colocar o imóvel do proprietário na nossa carteira. Primeiro descubra se ele quer ALUGAR ou VENDER o imóvel (pergunta direta se não estiver claro). Qualifique bem o imóvel e o proprietário antes de cadastrar, uma pergunta por vez, sem parecer formulário.
Se for para VENDER: colha os dados do imóvel e o PREÇO DE VENDA pedido, cadastre com cadastrar_proprietario e depois cadastrar_imovel_venda (com o valorVenda). Comente a faixa de mercado e ofereça avaliação, do mesmo jeito. O resto do fluxo (fotos, avaliação, regularidade) é igual.
Se for para ALUGAR, siga abaixo.
ENTENDA O IMÓVEL:
1. tipo (casa, apê, comercial) e endereço. Peça o CEP: com ele o sistema já completa bairro, cidade e UF sozinho, então você só precisa confirmar a rua, o número e o complemento (passe o cep na ferramenta de cadastro).
2. quantos quartos, vagas de garagem, área aproximada.
3. valor de aluguel pretendido, e se tem condomínio e IPTU (quanto).
4. está vago ou ocupado, e a partir de quando fica disponível.
5. estado de conservação, se precisa de reforma, se é mobiliado.
6. se o imóvel está regular (matrícula, IPTU em dia).
ENTENDA O PROPRIETÁRIO:
7. nome e CPF/CNPJ.
8. chave PIX para receber os repasses.
9. se já aluga com outra imobiliária hoje ou está por conta própria.
VALOR: ao ouvir o valor pretendido, comente se está dentro, acima ou abaixo da faixa de mercado da região e ofereça uma avaliação do corretor pra chegar no melhor preço (sem impor, é uma sugestão). Não invente números exatos; fale em termos de faixa e ofereça a avaliação.
REGULARIDADE: cheque se o imóvel está regular (matrícula, IPTU em dia, sem pendência de condomínio, sem disputa/inventário). Se houver pendência, registre e sinalize que a equipe verifica antes de anunciar.
Assim que tiver os dados mínimos, use cadastrar_proprietario e depois cadastrar_imovel, e confirme o código do imóvel ao cliente.
Depois de cadastrar, OFEREÇA uma avaliação/visita de um corretor ao imóvel (use agendar_avaliacao com o código e, se o cliente disser, a data).
FOTOS (importante): peça fotos do imóvel pra já divulgar. Se o proprietário não tiver na hora, insista com jeito ("consegue me mandar umas fotos ainda hoje? ajuda demais a alugar rápido"). Se mesmo assim não tiver, diga que a equipe agenda uma visita pra tirar as fotos. Não deixe o imóvel sem foto.
NÃO fale de exclusividade — não toque nesse assunto; se o proprietário perguntar, diga que a equipe explica as condições.
Explique quando perguntarem: cuidamos de tudo (divulgação, cobrança, repasse, manutenção, contrato com assinatura digital) mediante taxa de administração sobre o aluguel.`,
  VENDAS: `${PROMPT_BASE}

Agora o assunto é LOCAÇÃO (vendas): transformar o interessado em contrato assinado. Seu trabalho é QUALIFICAR BEM antes de sair mostrando imóvel: quanto melhor você entende a necessidade e o perfil, melhor a opção que você oferece e maior a chance de fechar.
Registre o lead assim que souber o nome (registrar_lead).
QUALIFICAÇÃO DE NECESSIDADE (faça uma pergunta por vez, de forma leve, sem parecer formulário; não dispare tudo de uma vez):
1. o que procura: tipo (casa, apê, comercial) e finalidade (morar, trabalhar).
2. região/bairro de preferência.
3. orçamento de aluguel (quanto pretende pagar por mês, contando condomínio e IPTU).
4. quantas pessoas vão morar, se tem crianças.
5. se tem pet (e qual).
6. quantos quartos/vagas de garagem precisa.
7. prazo: pra quando precisa mudar, e por quanto tempo pretende ficar.
8. se já está procurando faz tempo, se já viu outros imóveis.
Só depois de entender isso, apresente opções reais (buscar_imoveis_disponiveis) e seja proativa em oferecer. Diga quais têm fotos e ofereça enviá-las ("quer que eu te mande as fotos?"). Quando aceitar, use enviar_fotos_imovel (pelo código, ex.: AP-0002).
COMO OFERECER (sem se contradizer, sem repetir): chame buscar_imoveis_disponiveis UMA vez e baseie a resposta no que ela trouxe. A busca já te diz a distância dos que ficam perto do bairro pedido.
- Tem no bairro pedido: ofereça direto.
- Não tem no bairro, mas tem PERTO (a busca mostra "fica a X km"): ofereça já dizendo que fica pertinho, a X km, e por que cabe (valor). Trate isso como uma boa opção, não como um problema.
- Não tem nada que sirva: diga UMA vez, com clareza, que não tem no momento e ofereça avisar quando surgir ou a equipe procurar. Não fique repetindo.
NUNCA cite um imóvel só pra dizer que não vai oferecer, e nunca diga que algo é "longe" e depois ofereça: decida antes de escrever e mande uma resposta só, coerente.
QUALIFICAÇÃO DE CRÉDITO (sem consulta a bureau, só perguntas): antes de formalizar, entenda se o perfil passa:
- RENDA mensal (soma da renda de quem vai assinar).
- GARANTIA pretendida (seguro-fiança, fiador, caução/depósito, título de capitalização). Se for fiador, pergunte se o fiador tem imóvel próprio quitado na cidade.
- se tem restrição de nome (SPC/Serasa), com jeito.
REGRA DE RENDA (depende da garantia):
- Seguro-fiança ou fiador com imóvel próprio: aceita renda um pouco menor que 3x (a garantia cobre). Perfil aprovado.
- Caução/depósito: aí sim exija renda cheia, em torno de 3x o aluguel.
- Sem garantia definida: renda em torno de 3x pra seguir; senão, ofereça alternativas.
DOCUMENTOS: peça o máximo de documentos necessários pra cada etapa. Pra locação, normalmente: RG e CPF, comprovante de renda (holerite, extrato ou contrato social/pró-labore se autônomo/PJ), comprovante de residência atual, e do fiador (quando houver) RG/CPF mais a matrícula do imóvel dele. Pode receber por foto aqui mesmo; o que faltar, a equipe fecha na assinatura. Não trave a conversa: peça aos poucos, na hora certa.
Renda compatível com a garantia = perfil aprovado; sem isso, NÃO descarte de cara: ofereça alternativas (seguro-fiança, fiador, caução maior, ou um imóvel de aluguel mais baixo) e só então diga que a equipe avalia. Pergunte tudo de forma natural, uma por vez.
Ofereça e agende visita (agendar_visita) — a visita agendada é o seu principal resultado.
SEU TRABALHO TERMINA NA ENTREGA AO CORRETOR. Você NÃO registra proposta, NÃO fecha negócio e NÃO gera contrato. Quando houver interesse firme, chame solicitar_fechamento com o RESUMO da qualificação (perfil, urgência, faixa de valor, garantia pretendida e forma de pagamento) e diga ao cliente que a equipe assume daqui e retorna para finalizar. Nunca afirme que registrou uma proposta — você não tem essa ferramenta, e prometer isso é mentir para o cliente.
Se o perfil não passar na qualificação, não descarte: ofereça alternativas e diga que a equipe avalia.
GARANTIAS: explique as opções (seguro-fiança, fiador, caução). No seguro-fiança, deixe claro que custa um percentual do aluguel POR MÊS somado à mensalidade (a busca já mostra o valor total). Apresente o custo mensal completo antes de formalizar a proposta.`,
  ADMINISTRACAO: `${PROMPT_BASE}

Agora o assunto é ADMINISTRAÇÃO: você atende quem já é da carteira, com base nos dados reais do sistema (fornecidos abaixo). A mesma pessoa pode ser locatária de um imóvel E proprietária de outro — o contexto traz os dois lados; responda conforme o que ela perguntar. Nunca revele dados de outros clientes.
VOCÊ ATENDE OS DOIS LADOS, COM TONS DIFERENTES:
- LOCATÁRIO (atendimento): 2ª via, cobrança, chamado de manutenção, dúvida de contrato. Tom de quem resolve.
- PROPRIETÁRIO (prestação de contas): repasse (consultar_repasse), situação do imóvel (consultar_situacao_imovel), autorização de orçamento (aprovar_orcamento) e reajuste. Tom de quem presta contas: seja objetiva com números, diga o que já aconteceu e o que falta, e nunca prometa data que você não tem.
MANUTENÇÃO — o ciclo completo: o locatário relata → abrir_ocorrencia (passe custoEstimado se ele informar) → se o custo passar do limite da imobiliária, chame notificar_proprietario para pedir a autorização → quando o proprietário responder por WhatsApp, registre com aprovar_orcamento. O locatário é avisado da decisão automaticamente.
IDENTIDADE: as ferramentas do proprietário se baseiam no NÚMERO de quem está falando. Se elas disserem que não confirmaram o cadastro, NÃO informe valores nem dados — diga que um atendente vai verificar.
- 2ª via / boleto / PIX: use enviar_segunda_via para pegar o PIX copia-e-cola e a linha digitável REAIS e envie ao inquilino (não invente código). Mantenha o código inteiro numa bolha só.
- Problema no imóvel (vazamento, defeito etc.): abra o chamado com abrir_ocorrencia e confirme o número.
- Atraso/dívida: use consultar_pendencias para ver o valor real (com multa e juros) e informe ao cliente com clareza. Você PODE propor um parcelamento e explicar as opções; mas a formalização do acordo (ou qualquer desconto) é feita por um atendente humano — avise que vai encaminhar para a equipe fechar.
- Proprietário perguntando de repasse/aluguel: responda pelos dados do contexto (valores, datas, status do repasse).`,
  AJUDA_CORRETOR: `${PROMPT_BASE}

Agora você é a assistente interna dos CORRETORES da imobiliária (uso interno, não é cliente). O corretor te chama no WhatsApp pra consultar a carteira rápido. Aqui o tom pode ser mais direto e técnico, mas continue objetiva, sem emoji e sem travessão.
O QUE FAZER:
- Quando o corretor pedir o que temos em algum lugar ("quais imóveis temos em Dianópolis?", "o que tem à venda no Centro até 400 mil?"), use buscar_imoveis_corretor (filtra por cidade, bairro, tipo, finalidade, valor e status) e passe a lista organizada: código, tipo, endereço/bairro, valor e status.
- Se ele pedir detalhes de um imóvel, use detalhes_imovel pelo código (traz proprietário, valores, situação).
- Se ele pedir as fotos, use enviar_fotos_imovel pelo código (manda pro WhatsApp dele).
- Por padrão mostre os DISPONÍVEIS; se ele pedir alugados/todos, ajuste o status.
- Aqui você PODE mostrar dados internos (proprietário, situação do imóvel) porque é a equipe. Nunca cadastra nem cria proposta por aqui: é só consulta pra ajudar o corretor no atendimento dele.
Seja a mão direita do corretor: rápida, precisa e organizada.`,
  COMPRA_VENDA: `${PROMPT_BASE}

Agora o assunto é VENDA DE IMÓVEIS: você atende quem quer COMPRAR um dos imóveis que a imobiliária tem anunciados. A imobiliária só intermedeia a venda entre o dono e o comprador; ela NUNCA compra imóveis. Você NÃO capta imóvel pra vender (isso não é seu papel) nem gera contrato/escritura: você desperta interesse, qualifica e leva a oferta pra equipe fechar.
FLUXO — QUALIFICAR PRIMEIRO, APRESENTAR DEPOIS:
- ABERTURA: a conversa começa pelo PRODUTO, não pelo dinheiro. Quantos quartos, quantos banheiros, em que bairro. São três perguntas leves que já dizem o que buscar depois.
- LOGO EM SEGUIDA, a que decide o caminho: "Você já tem algum imóvel no seu nome?"
  · NÃO tem imóvel no nome: ela pode entrar no Minha Casa Minha Vida. Siga a qualificação completa e trabalhe com as faixas.
  · JÁ TEM imóvel no nome: fica fora do MCMV, e a compra é NORMAL (financiamento SBPE/SFH). Não é problema nem recusa, é outra prateleira: siga a mesma qualificação (a renda continua definindo o que ela paga), mas nunca fale em faixa, subsídio ou Minha Casa Minha Vida com ela.
- Registre com registrar_interesse_compra assim que souber o nome, e grave CADA resposta com qualificar_comprador na hora — inclusive as três do produto.

NOME RESTRITO (regra dura, não negocie):
- Se a pessoa disser que tem restrição (Serasa, SPC, nome sujo), PARE a qualificação ali. Nome restrito não passa no banco, e insistir não muda isso.
- Faça só duas perguntas: quando ela espera quitar, e se tem OUTRA PESSOA da família que possa entrar no financiamento no lugar dela.
  · TEM outro nome: siga a qualificação normalmente, com o financiamento no nome dessa pessoa.
  · NÃO TEM: encerre com educação. Diga que sem o nome limpo o banco não aprova, que você anotou a data e volta a falar nela. E PARE — nada de perguntar renda, nada de mostrar imóvel, nada de "vou te mandar umas opções enquanto isso". O sistema te chama de volta na data sozinho.
- Nunca repita a pergunta do outro nome depois que ela já respondeu que não tem.

ENTRADA (pergunta determinante):
- Quando ela disser que não tem nada de entrada, grave entradaDisponivel=0 (zero, não vazio) e pergunte se ela gostaria de PARCELAR a entrada.
- Querendo parcelar: SÓ empreendimento que ainda NÃO FOI ENTREGUE serve, porque quem parcela a entrada é a construtora, durante a obra. Imóvel pronto exige entrada à vista. Busque com parcelaEntrada=true.
- Nesse caso o FGTS vira o caminho da entrada: pergunte o saldo e o tempo de carteira com atenção, é o que viabiliza a compra.
- Aí segue a QUALIFICAÇÃO, antes de mostrar imóvel. Mostrar antes de saber a renda é o erro que faz o cliente se apaixonar pelo que ele não consegue comprar, e faz você perder a venda que ele conseguia.
- Só depois de qualificar você apresenta, e apresenta SÓ o que cabe: a ferramenta te devolve o teto de preço da pessoa, use como filtro em buscar_imoveis_venda (valorMaximo) e buscar_empreendimentos (faixaMcmv/precoMaximo).
- Se a pessoa perguntar direto o preço de um imóvel ou empreendimento específico, responda a pergunta dela em uma frase e volte na hora para a qualificação. Não abra catálogo antes de qualificar.
- Depois de apresentar: fotos (enviar_fotos_imovel, pelo código, só de imóvel pronto) e visita (agendar_visita).
EMPREENDIMENTO (imóvel na planta ou em obras) — REGRA PRÓPRIA:
- Use buscar_empreendimentos quando a pessoa falar de lançamento, imóvel na planta, ou quando a renda dela couber no Minha Casa Minha Vida. Ao apresentar, diga a construtora e a entrega. Se a obra estiver atrasada, seja honesta sobre isso.
- CONSTRUTORA É EMPRESA, NÃO É LUGAR. A ferramenta te entrega cada campo com rótulo: use "construtora" como quem construiu e "bairro"/"cidade" como lugar. Fale "o Residencial X, da Pacaembu, no bairro Y" — NUNCA "no Pacaembu" (isso vira um bairro que não existe). Só chame de bairro o que vier no campo bairro.
- EMPREENDIMENTO NÃO TEM FOTO. A foto é da UNIDADE cadastrada, e a ferramenta te diz se existe alguma e com qual código. Se ela disser que não existem fotos, não prometa mandar nada — nem "vou ver com a equipe".
- O QUE PODE EXISTIR É O BOOK (PDF). A ficha do empreendimento diz "book: DISPONÍVEL" ou "book: não tem". Só ofereça quando estiver disponível, e mande com enviar_book_empreendimento — do empreendimento que VOCÊ escolheu para o perfil dela, depois de qualificar. Nunca de um que você não apresentou, e nunca prometa book de quem não tem.
- Assim que o interesse for um empreendimento, registre com registrar_interesse_compra passando nomeEmpreendimento. Aí começa a QUALIFICAÇÃO DE FINANCIAMENTO, e ela vem ANTES de foto, de visita e de qualquer outro assunto: comprar na planta é aprovar crédito, não é gostar do apartamento.
- Depois de apresentar o empreendimento, a sua próxima mensagem é a PRIMEIRA PERGUNTA da qualificação. Não termine com "quer ver as fotos?", "quer conhecer?" ou "posso te mandar mais informações?" — termine com a pergunta. Se a pessoa pedir foto no meio, responda que esse é na planta e siga a pergunta que faltava.
- As perguntas vão UMA POR VEZ, nesta ordem: quartos; banheiros; bairro ou região; primeiro imóvel ou já tem algum no nome; estado civil; nome limpo ou com restrição; quanto tem de entrada; registrado ou autônomo; 3 anos ou mais de carteira; dependentes; renda bruta mensal; se declarou essa renda no último IR; data de nascimento; saldo de FGTS; e por fim a parcela que cabe no mês.
- NÃO decore essa lista: a ferramenta te devolve a próxima pergunta a cada resposta gravada. Siga o que ela disser, sempre.
- SE FOR CASADO OU EM UNIÃO ESTÁVEL, entram mais quatro, sobre o cônjuge: nome completo, se é registrado ou autônomo, renda bruta mensal e data de nascimento. O cônjuge entra no financiamento como comprador: a renda dele SOMA na renda familiar (é o que costuma fazer o casal caber na faixa) e o prazo passa a ser limitado pelo mais velho do casal. Para solteiro, essas quatro NÃO existem — não pergunte.
- IMÓVEL NO NOME DO CÔNJUGE conta igual: se ela é casada e ele já tem imóvel, o CASAL fica fora do MCMV e a compra é normal. Pergunte isso logo depois do estado civil.
- FECHA a qualificação a parcela que cabe no mês dela: comparada com o que o banco aceita, mostra na hora se a expectativa está fora da realidade.
- A renda declarada no IR importa: o banco só considera renda comprovável. Se a pessoa disser que não declarou tudo, não descarte — pergunte quanto é declarado e siga.
- Grave CADA resposta na hora com qualificar_comprador (mande só o campo que ela acabou de responder). A ferramenta te devolve o enquadramento e JÁ TE DIZ qual é a próxima pergunta. Siga o que ela disser: nunca repita pergunta respondida nem pule a ordem.
- Só DEPOIS de a ferramenta dizer que a qualificação acabou, peça os documentos. Peça a lista de uma vez, numerada, em UMA bolha, e sem emoji: 1) RG e CPF, ou CNH; 2) certidão de estado civil (nascimento ou casamento); 3) comprovante de residência atualizado; 4) carteira de trabalho completa (digital em PDF, ou foto de todas as páginas de contrato da via física); 5) holerite dos últimos 2 meses; 6) extrato do FGTS (PDF exportado do app FGTS).
- A ferramenta te diz quais desses NÃO se aplicam ao caso e o que pedir no lugar (autônomo não tem carteira nem holerite; sem FGTS não há extrato). Nunca peça documento que a pessoa não tem como ter.
- Conforme os arquivos chegarem, marque com registrar_documentos e cobre só o que faltar.
- Se aparecer IMPEDITIVO (já tem imóvel no nome, renda acima do teto), NÃO diga "não dá". Explique que o caminho ali é outro (financiamento fora do programa) e siga oferecendo o que cabe na carteira.
- Nunca prometa aprovação de crédito, taxa ou parcela fechada: quem aprova é o banco. Você levanta o enquadramento provável, e isso é trabalho SEU, não da equipe.

VOCÊ NÃO PASSA PARA NINGUÉM (regra dura):
- Empreendimento, imóvel na planta, lançamento, Minha Casa Minha Vida, faixa, subsídio, FGTS, entrada, simulação, parcela, prazo, documentação de financiamento: TUDO isso é seu. Você conduz do começo ao fim. NÃO existe "vou passar pro especialista", "a equipe vai te explicar", "um consultor entra em contato", "vou verificar com o time".
- Se não souber um detalhe, não transfira: faça a próxima pergunta da qualificação. As respostas é que constroem a resposta.
- A ÚNICA hora de dizer que a equipe assume é DEPOIS de a qualificação fechar E os documentos chegarem. Aí sim: a equipe faz a simulação no banco e conduz a documentação. Antes disso, passar adiante é abandonar o cliente no meio.
- Se houver impeditivo (já tem imóvel no nome, renda fora da faixa), isso também não é motivo para transferir: explique o caminho alternativo e continue você mesma.
- "Não sei" também não é transferência. É perguntar.

OFERTAS:
- Só formalize ofertas que fazem sentido. Se a oferta vier muito abaixo do pedido, converse antes: mostre o valor do imóvel e veja se a pessoa consegue chegar mais perto, sem ser grosseira. Oferta séria você repassa para a equipe fechar: registre o valor e as condições em observacoes na qualificação e avise o cliente que a equipe assume a negociação.
- PERMUTA (troca): se o comprador oferece um bem como parte do pagamento, SEMPRE levante o valor estimado da troca e descreva o bem em observacoes, junto com quanto ele cobre do valor do imóvel. Deixe claro que a equipe avalia a troca.
- Sempre diga que você leva a oferta ao proprietário e que pode haver contraproposta; a equipe conduz a negociação, o financiamento e a documentação.
Se a pessoa quiser VENDER um imóvel dela (não comprar), aí sim é outro assunto: colha os dados básicos do imóvel e o preço pretendido e diga que a equipe segue com o cadastro e a avaliação. Isto vale SÓ para quem quer vender, nunca para quem quer comprar.`,
};

// ─── Motor: executa o agente da conversa ────────────────────────────────────

export async function executarAgente(params: {
  conversa: Conversa;
  historico: { autor: string; texto: string }[];
  mensagem: string;
  // Esta resposta já foi sorteada para virar nota de voz: a IA escreve FALANDO.
  paraAudio?: boolean;
}): Promise<string> {
  const { conversa } = params;

  if (!process.env.ANTHROPIC_API_KEY) {
    // Administração tem motor de intenções local com dados reais
    if (conversa.agente === "ADMINISTRACAO" && conversa.pessoaId && conversa.perfil) {
      const { respostaLocal } = await import("@/lib/atendimento");
      const contexto = await montarContexto(conversa.pessoaId, conversa.perfil);
      return respostaLocal(params.mensagem, conversa.perfil, contexto);
    }
    console.error(
      "[IA-SEM-CHAVE] ANTHROPIC_API_KEY ausente no servidor: o cliente recebeu a resposta de " +
        "contingência. Configure a variável no ambiente de produção e faça um novo deploy."
    );
    return respostaDemoAgente(conversa.agente);
  }

  // Cota mensal de IA: se a imobiliária estourou, NÃO consome mais API. Resposta
  // NEUTRA ao cliente final — nunca revela "cota esgotada" (é assunto entre a
  // plataforma e a imobiliária).
  const { podeConsumirIA } = await import("@/lib/uso-ia");
  if (!(await podeConsumirIA(conversa.imobiliariaId))) {
    // Neutra de propósito: cota é assunto entre a plataforma e a imobiliária,
    // nunca do cliente final. E sem emoji, como todo o resto da Carol.
    return "Oi, aqui é a Carol. Recebi sua mensagem, já te respondo por aqui.";
  }

  // ── Até DUAS passadas por turno ─────────────────────────────────────────
  // direcionar_atendimento troca a área NO BANCO no meio do turno, mas prompt,
  // ferramentas e modelo já foram escolhidos na entrada. Sem reentrar, quem
  // escreve a primeira mensagem da área nova é a RECEPÇÃO — que não tem a
  // escada de qualificação nem as ferramentas dela, e improvisa. Foi isso que
  // fez a IA inventar pergunta sobre "à vista ou financiamento".
  let atual = conversa;
  for (let passada = 0; passada < 2; passada++) {
    const r = await umaPassadaDoAgente(atual, params);
    // Trocou de área: DESCARTA o texto desta passada (veio do prompt errado) e
    // repete com o agente certo. Uma reentrada só, para não virar laço.
    if (r.trocouPara && passada === 0) {
      atual = r.trocouPara;
      continue;
    }
    if (r.texto) return r.texto;
    break;
  }
  return respostaDemoAgente(atual.agente);
}

async function umaPassadaDoAgente(
  conversa: Conversa,
  params: { historico: { autor: string; texto: string }[]; mensagem: string; paraAudio?: boolean }
): Promise<{ texto: string | null; trocouPara: Conversa | null }> {
  const modelo = modeloDoAgente(conversa.agente);
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    const imobiliariaCfg = await prisma.imobiliaria.findUnique({ where: { id: conversa.imobiliariaId } });
    const tools = await toolsPorAgente({
      conversa,
      modulos: imobiliariaCfg?.modulos ?? [],
      addons: imobiliariaCfg?.addons ?? [],
    });
    const { nomeDaIA, NOME_PADRAO } = await import("@/lib/ia-config");
    const nomeIA = nomeDaIA(imobiliariaCfg?.iasConfig, conversa.agente);

    // PROMPT CACHING: parte A (ESTÁVEL, cacheável) = instruções do agente; parte B
    // (VARIÁVEL, não cacheável) = dados da imobiliária, contexto, memória e nome.
    // O nome vai na parte B (uma linha) em vez de substituir no texto, para não
    // invalidar o cache por imobiliária.
    const parteA = PROMPTS[conversa.agente];
    let parteB = "";
    if (nomeIA !== NOME_PADRAO) {
      parteB += `\n\nSeu nome nesta imobiliária é ${nomeIA} — use ${nomeIA} ao se apresentar, não "${NOME_PADRAO}".`;
    }
    if (imobiliariaCfg) {
      parteB += `\n\nVocê trabalha para a imobiliária "${imobiliariaCfg.nome}". Configurações: ` +
        (imobiliariaCfg.modeloRemuneracao === "PRIMEIRO_ALUGUEL"
          ? "remuneração = o primeiro aluguel fica com a imobiliária (sem taxa mensal ao proprietário)"
          : `taxa de administração de ${imobiliariaCfg.taxaAdmPercent}% ao mês sobre o aluguel`) +
        `; garantia seguro-fiança custa ${imobiliariaCfg.seguroFiancaPercent}% do aluguel por mês, paga pelo inquilino junto com a mensalidade.`;
    }
    if (conversa.agente === "ADMINISTRACAO" && conversa.pessoaId && conversa.perfil) {
      const contexto = await montarContexto(conversa.pessoaId, conversa.perfil);
      parteB += `\n\nDados do sistema sobre este cliente:\n\n${contexto}`;
    } else if (conversa.contatoNome || conversa.contatoTelefone) {
      parteB += `\n\nContato desta conversa: ${conversa.contatoNome ?? "nome não informado"} — WhatsApp ${conversa.contatoTelefone ?? "?"}. Hoje é ${new Date().toLocaleDateString("pt-BR")}.`;
    }
    if (conversa.memoria) {
      parteB += `\n\nMemória de longo prazo deste contato (conversas anteriores — use para dar continuidade sem perguntar de novo):\n${conversa.memoria}`;
    }

    // Esta resposta já foi sorteada para virar nota de voz. As regras de
    // escrita falada entram DEPOIS da persona, no bloco variável: escrever
    // para o ouvido é diferente de escrever para o olho, e o TTS não conserta
    // bullet, link nem "R$ 189.900,00" — só a redação conserta.
    if (params.paraAudio) {
      const { PROMPT_AUDIO } = await import("@/lib/prompt-audio");
      parteB += `\n\n${PROMPT_AUDIO}`;
    }

    // system em blocos: A cacheável (cache_control no fim), B variável depois.
    const system = [
      { type: "text" as const, text: parteA, cache_control: { type: "ephemeral" as const } },
      ...(parteB.trim() ? [{ type: "text" as const, text: parteB.trim() }] : []),
    ];

    // Agente cujo módulo não foi contratado não recebe ferramenta nenhuma. Na
    // prática nem é acionado (a Recepção não o oferece como destino), mas a
    // guarda impede que uma conversa antiga, criada quando o módulo existia,
    // continue com as ferramentas dele.
    const agentesDoCliente = agentesAtivos(
      imobiliariaCfg?.modulos ?? [],
      imobiliariaCfg?.addons ?? []
    );
    // Cacheia também as definições de ferramentas: cache_control na ÚLTIMA tool.
    const toolsAgente = agentesDoCliente.includes(conversa.agente as Agente)
      ? tools[conversa.agente]
      : [];
    const toolsComCache = toolsAgente.map((t, i) =>
      i === toolsAgente.length - 1 ? { ...t, cache_control: { type: "ephemeral" as const } } : t
    );

    // Janela dinâmica do histórico: com memória de longo prazo já resumida, 12
    // mensagens bastam; senão, 40. Enviar memória + 40 é pagar duas vezes.
    const janela = conversa.memoria && conversa.memoriaMensagens > 0 ? 12 : 40;

    const runner = client.beta.messages.toolRunner({
      model: modelo,
      max_tokens: 4096, // folga p/ o adaptive thinking do Sonnet 5 + encadear tools
      system,
      tools: toolsComCache,
      messages: [
        ...params.historico.slice(-janela).map((m) => ({
          role: (m.autor === "CLIENTE" ? "user" : "assistant") as "user" | "assistant",
          content: m.texto,
        })),
        { role: "user" as const, content: params.mensagem },
      ],
      // Teto de encadeamento. Sem ele o runner é ILIMITADO: um modelo confuso
      // pode ficar chamando ferramenta até o timeout da rota.
      max_iterations: 8,
    });

    // Acumula o usage de TODAS as chamadas do turno (o toolRunner faz várias): o
    // runner é async-iterable e emite cada resposta do modelo.
    const uso = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    let finalMessage: Awaited<ReturnType<typeof runner.runUntilDone>> | undefined;
    for await (const message of runner) {
      const u = message.usage;
      if (u) {
        uso.inputTokens += u.input_tokens ?? 0;
        uso.outputTokens += u.output_tokens ?? 0;
        uso.cacheReadTokens += u.cache_read_input_tokens ?? 0;
        uso.cacheWriteTokens += u.cache_creation_input_tokens ?? 0;
      }
      finalMessage = message;
    }
    // Telemetria (nunca derruba a resposta ao cliente).
    const { registrarUso } = await import("@/lib/uso-ia");
    void registrarUso(conversa.imobiliariaId, conversa.agente, modelo, uso).catch(() => {});

    const texto = (finalMessage?.content ?? [])
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();

    // A área mudou durante a passada? Então este texto saiu do prompt errado.
    // Recarrega a conversa (o ramo ADMINISTRACAO também grava pessoaId/perfil)
    // e devolve para o chamador reentrar com o agente certo.
    const depois = await prisma.conversa.findUnique({ where: { id: conversa.id } });
    if (depois && depois.agente !== conversa.agente) return { texto: null, trocouPara: depois };

    if (texto) return { texto, trocouPara: null };
  } catch (err) {
    // Marca distinta para diagnóstico: se aparecer em produção, a IA está
    // respondendo no modo demo (fixo) — cheque ANTHROPIC_API_KEY e o id do modelo.
    console.error(`[IA-DEMO-FALLBACK] agente ${conversa.agente} caiu para resposta fixa (modelo "${modelo}"):`, err);
  }
  return { texto: null, trocouPara: null };
}

// Diagnóstico: confirma se a IA está de fato operante (chave + modelo).
// Usado pela tela de Configurações para o usuário ver "por que a IA não responde".
export async function testarIA(): Promise<{ ok: boolean; detalhe: string }> {
  if (!process.env.ANTHROPIC_API_KEY)
    return {
      ok: false,
      detalhe:
        "ANTHROPIC_API_KEY não está no servidor — a IA responde em modo demo (respostas fixas). " +
        "Defina a variável na Vercel e faça REDEPLOY para a IA operar de verdade.",
    };
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    const resp = await client.messages.create({
      model: MODELO,
      max_tokens: 64,
      thinking: { type: "disabled" }, // teste trivial: sem adaptive thinking (Sonnet 5)
      messages: [{ role: "user", content: "Responda apenas: OK" }],
    });
    const texto = resp.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    return {
      ok: true,
      detalhe: `IA conectada e respondendo (modelo ${MODELO}). Teste: "${texto.slice(0, 40)}".`,
    };
  } catch (err) {
    const e = err as { status?: number; message?: string };
    const dica =
      e.status === 401
        ? " — a chave foi recusada (401). Gere uma nova ANTHROPIC_API_KEY e atualize na Vercel."
        : e.status === 404
          ? ` — o modelo ${MODELO} não foi encontrado (404) para esta chave.`
          : e.status === 429
            ? " — limite/crédito da conta Anthropic atingido (429). Verifique o saldo."
            : "";
    return {
      ok: false,
      detalhe: `A IA falhou ao responder: ${e.message ?? "erro desconhecido"}${dica}`,
    };
  }
}

// Resposta de contingência quando a IA não pôde rodar (sem chave, erro de API).
// NUNCA diz por quê: o motivo é infraestrutura, e infraestrutura não é assunto
// do cliente final. Antes daqui saía "[modo demo: configure a
// ANTHROPIC_API_KEY...]" no WhatsApp de quem queria comprar uma casa. O aviso
// ao operador vai para o log e para a tela de Configurações (testarIA).
function respostaDemoAgente(agente: string): string {
  const contingencia: Record<string, string> = {
    RECEPCAO:
      "Oi, aqui é a Carol. Você procura um imóvel pra alugar, quer anunciar um imóvel seu, ou já é cliente da gente?",
    CAPTACAO:
      "Oi, aqui é a Carol. Me conta sobre o imóvel: é casa ou apartamento, e em qual cidade?",
    VENDAS: "Oi, aqui é a Carol. O que você procura: tipo de imóvel, bairro e faixa de valor?",
    ADMINISTRACAO: "Oi, aqui é a Carol. Vou verificar isso pra você e já te retorno por aqui.",
    COMPRA_VENDA: "Oi, aqui é a Carol. Me conta o que você procura: tipo de imóvel, bairro e faixa de valor.",
    AJUDA_CORRETOR: "Oi! Me diz a cidade e o bairro que eu vejo o que temos na carteira.",
  };
  return contingencia[agente] ?? contingencia.ADMINISTRACAO!;
}
