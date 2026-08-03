"use client";

// Painel de WhatsApp em Configurações: cria a instância na uazapi + gera o QR
// Code para conectar o número, verifica a conexão e envia mensagem de teste —
// tudo pelo servidor (Vercel), que alcança a uazapi mesmo quando o navegador não.

import { useEffect, useState } from "react";

type Status = {
  ok: boolean;
  conectado?: boolean;
  detalhe: string;
  numero?: string;
  servidor?: string;
  origemServidor?: string;
} | null;
type Envio = { ok: boolean; detalhe: string } | null;
type WebhookLog = { recebidoEm: string; resultado: string; telefone: string | null; corpo: string };
type Criacao = {
  ok: boolean;
  detalhe: string;
  qrcode?: string;
  paircode?: string;
  instanciaMascarada?: string;
} | null;

async function chamar<T>(body: object): Promise<T> {
  const res = await fetch("/api/whatsapp/diagnostico", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export default function TesteWhatsApp() {
  const [status, setStatus] = useState<Status>(null);
  const [envio, setEnvio] = useState<Envio>(null);
  const [numero, setNumero] = useState("");
  const [carregando, setCarregando] = useState<
    "status" | "envio" | "criar" | "reconectar" | "webhook" | "ia" | null
  >(null);
  const [reconexao, setReconexao] = useState<Criacao>(null);
  const [webhook, setWebhook] = useState<Envio>(null);
  const [ia, setIa] = useState<Envio>(null);

  // criar instância
  const [serverUrl, setServerUrl] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [nomeInst, setNomeInst] = useState("");
  const [criacao, setCriacao] = useState<Criacao>(null);

  // chamadas recebidas (webhook) — atualiza sozinho a cada 3s
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  useEffect(() => {
    const carregar = async () => {
      if (document.visibilityState !== "visible") return;
      const d = await chamar<{ logs: WebhookLog[] }>({ acao: "webhooks" });
      setLogs(d.logs ?? []);
    };
    carregar();
    const id = setInterval(carregar, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      {/* 1) Criar instância + QR */}
      <p className="text-sm font-semibold text-[#C9CFD8] mb-1">📲 Conectar um número (criar instância)</p>
      <p className="text-[11px] text-[#7A828F] mb-3">
        Cria uma <b>nova</b> instância no seu servidor uazapi e gera o QR Code — não mexe nas instâncias
        existentes. O <b>Admin Token</b> é usado só para criar e <b>não fica salvo</b> (guardamos apenas o
        token da nova instância). Depois de conectar, escaneie o QR no WhatsApp em <i>Aparelhos conectados</i>.
      </p>
      <div className="grid gap-2 mb-2 max-w-[520px]">
        <label className="block">
          <span className="label-caps !text-[9px] tracking-[.1em] text-[#9AA2AF]">Servidor (Server URL)</span>
          <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://seuservidor.uazapi.com" className="input-ds mt-1.5" />
        </label>
        <label className="block">
          <span className="label-caps !text-[9px] tracking-[.1em] text-[#9AA2AF]">Admin Token (não é salvo)</span>
          <input value={adminToken} onChange={(e) => setAdminToken(e.target.value)} placeholder="admin token do servidor uazapi" className="input-ds mt-1.5" />
        </label>
        <label className="block">
          <span className="label-caps !text-[9px] tracking-[.1em] text-[#9AA2AF]">Nome da instância</span>
          <input value={nomeInst} onChange={(e) => setNomeInst(e.target.value)} placeholder="ex.: administrativo-beam" className="input-ds mt-1.5" />
        </label>
      </div>
      <button
        type="button"
        onClick={async () => {
          setCarregando("criar");
          setCriacao(null);
          setCriacao(await chamar<Criacao>({ acao: "criar-instancia", serverUrl, adminToken, nome: nomeInst }));
          setCarregando(null);
        }}
        disabled={carregando !== null || !adminToken.trim()}
        className="inline-flex items-center gap-2 rounded-full bg-[#34C46A] text-[#06210F] text-[13px] font-[520] px-4 py-2 hover:bg-[#8CF0B0] transition-colors disabled:opacity-50 cursor-pointer"
      >
        {carregando === "criar" ? "Criando instância…" : "Criar instância e gerar QR Code"}
      </button>
      {criacao && (
        <div className="mt-3">
          <p className={`text-[12.5px] ${criacao.ok ? "text-[#34C46A]" : "text-[#FF5C7A]"}`}>
            {criacao.ok ? "✓ " : "✕ "}
            {criacao.detalhe}
          </p>
          {criacao.qrcode && (
            <img
              src={criacao.qrcode}
              alt="QR Code para conectar o WhatsApp"
              className="mt-3 w-52 h-52 rounded-xl border border-[#1E222B] bg-[#12141A] p-2"
            />
          )}
          {criacao.paircode && (
            <p className="mt-2 text-[13px] text-[#C9CFD8]">
              Código de pareamento: <b className="font-data">{criacao.paircode}</b>
            </p>
          )}
        </div>
      )}

      {/* 2) Ativar recebimento (configurar webhook automaticamente) */}
      <div className="border-t border-[#1E222B] mt-5 pt-4">
        <p className="text-sm font-semibold text-[#C9CFD8] mb-1">📡 Ativar recebimento de mensagens</p>
        <p className="text-[11px] text-[#7A828F] mb-3">
          Configura o webhook da sua instância apontando para este sistema, automaticamente
          (o app faz pela uazapi). Salve o servidor e o token da instância acima antes.
        </p>
        <button
          type="button"
          onClick={async () => {
            setCarregando("webhook");
            setWebhook(null);
            setWebhook(await chamar<Envio>({ acao: "configurar-webhook" }));
            setCarregando(null);
          }}
          disabled={carregando !== null}
          className="inline-flex items-center gap-2 rounded-full bg-[#34C46A] text-[#06210F] text-[13px] font-[520] px-4 py-2 hover:bg-[#8CF0B0] transition-colors disabled:opacity-50 cursor-pointer"
        >
          {carregando === "webhook" ? "Configurando…" : "Configurar webhook automaticamente"}
        </button>
        {webhook && (
          <p className={`text-[12.5px] mt-2 ${webhook.ok ? "text-[#34C46A]" : "text-[#FF5C7A]"}`}>
            {webhook.ok ? "✓ " : "✕ "}
            {webhook.detalhe}
          </p>
        )}
      </div>

      {/* 3) Verificar conexão */}
      <div className="border-t border-[#1E222B] mt-5 pt-4">
        <p className="text-sm font-semibold text-[#C9CFD8] mb-1">🔌 Verificar a conexão</p>
        <p className="text-[11px] text-[#7A828F] mb-3">Usa o token da instância salvo nas configurações acima.</p>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <button
            type="button"
            onClick={async () => {
              setCarregando("status");
              setStatus(await chamar<Status>({ acao: "status" }));
              setCarregando(null);
            }}
            disabled={carregando !== null}
            className="inline-flex items-center gap-2 rounded-full border border-[#2A303B] text-[#C9CFD8] text-[13px] font-[520] px-4 py-2 hover:bg-[#07080B] transition-colors disabled:opacity-50 cursor-pointer"
          >
            {carregando === "status" ? "Verificando…" : "Verificar conexão"}
          </button>
          <button
            type="button"
            onClick={async () => {
              setCarregando("reconectar");
              setReconexao(null);
              setReconexao(await chamar<Criacao>({ acao: "reconectar" }));
              setCarregando(null);
            }}
            disabled={carregando !== null}
            className="inline-flex items-center gap-2 rounded-full bg-[#34C46A] text-[#06210F] text-[13px] font-[520] px-4 py-2 hover:bg-[#8CF0B0] transition-colors disabled:opacity-50 cursor-pointer"
          >
            {carregando === "reconectar" ? "Gerando QR…" : "Reconectar número (novo QR)"}
          </button>
          {status && (
            <span
              className={`inline-flex items-center gap-1.5 text-[12.5px] rounded-full px-3 py-1.5 ${
                status.conectado ? "bg-[rgba(52,196,106,.1)] text-[#34C46A]" : "bg-[rgba(255,92,122,.08)] text-[#FF5C7A]"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${status.conectado ? "bg-[#34C46A]" : "bg-[#FF5C7A]"}`} />
              {status.conectado ? "Conectado" : "Não conectado"}
              {status.numero ? ` · ${status.numero}` : ""}
            </span>
          )}
        </div>
        {status && <p className="text-[12px] text-[#9AA2AF]">{status.detalhe}</p>}
        {status?.servidor && (
          <p className="text-[11.5px] text-[#9AA2AF] mt-1">
            Servidor em uso:{" "}
            <b className={status.servidor.includes("free.uazapi") ? "text-[#FF5C7A]" : "text-[#F4F5F7]"}>
              {status.servidor}
            </b>{" "}
            <span className="text-[#7A828F]">({status.origemServidor})</span>
            {status.servidor.includes("free.uazapi") && (
              <span className="text-[#FF5C7A]">
                {" "}— ⚠️ se sua instância é o beambroker, a env UAZAPI_URL não foi aplicada (falta REDEPLOY).
              </span>
            )}
          </p>
        )}
        {reconexao && (
          <div className="mt-2">
            <p className={`text-[12.5px] ${reconexao.ok ? "text-[#34C46A]" : "text-[#FF5C7A]"}`}>
              {reconexao.ok ? "✓ " : "✕ "}
              {reconexao.detalhe}
            </p>
            {reconexao.qrcode && (
              <img
                src={reconexao.qrcode}
                alt="QR Code para reconectar o WhatsApp"
                className="mt-3 w-52 h-52 rounded-xl border border-[#1E222B] bg-[#12141A] p-2"
              />
            )}
            {reconexao.paircode && (
              <p className="mt-2 text-[13px] text-[#C9CFD8]">
                Código de pareamento: <b className="font-data">{reconexao.paircode}</b>
              </p>
            )}
          </div>
        )}
      </div>

      {/* 3) Enviar teste */}
      <div className="border-t border-[#1E222B] mt-5 pt-4">
        <p className="text-sm font-semibold text-[#C9CFD8] mb-3">✉️ Enviar mensagem de teste</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="label-caps !text-[9px] tracking-[.1em] text-[#9AA2AF]">Enviar para</span>
            <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="17 99117-0597" className="input-ds mt-1.5 !w-56" />
          </label>
          <button
            type="button"
            onClick={async () => {
              setCarregando("envio");
              setEnvio(await chamar<Envio>({ acao: "enviar", numero }));
              setCarregando(null);
            }}
            disabled={carregando !== null || !numero.trim()}
            className="inline-flex items-center gap-2 rounded-full border border-[#2A303B] text-[#C9CFD8] text-[13px] font-[520] px-4 py-2 hover:bg-[#07080B] transition-colors disabled:opacity-50 cursor-pointer"
          >
            {carregando === "envio" ? "Enviando…" : "Enviar teste"}
          </button>
        </div>
        {envio && (
          <p className={`text-[12.5px] mt-2 ${envio.ok ? "text-[#34C46A]" : "text-[#FF5C7A]"}`}>
            {envio.ok ? "✓ " : "✕ "}
            {envio.detalhe}
          </p>
        )}
      </div>

      {/* 3.5) Testar a IA (por que a IA "não responde") */}
      <div className="border-t border-[#1E222B] mt-5 pt-4">
        <p className="text-sm font-semibold text-[#C9CFD8] mb-1">🤖 Testar a inteligência artificial</p>
        <p className="text-[11px] text-[#7A828F] mb-3">
          Confirma se a <code>ANTHROPIC_API_KEY</code> está valendo no servidor e se o modelo responde.
          Se a IA “não responde” no WhatsApp, o motivo aparece aqui.
        </p>
        <button
          type="button"
          onClick={async () => {
            setCarregando("ia");
            setIa(null);
            setIa(await chamar<Envio>({ acao: "ia" }));
            setCarregando(null);
          }}
          disabled={carregando !== null}
          className="inline-flex items-center gap-2 rounded-full border border-[#2A303B] text-[#C9CFD8] text-[13px] font-[520] px-4 py-2 hover:bg-[#07080B] transition-colors disabled:opacity-50 cursor-pointer"
        >
          {carregando === "ia" ? "Testando IA…" : "Testar IA agora"}
        </button>
        {ia && (
          <p className={`text-[12.5px] mt-2 ${ia.ok ? "text-[#34C46A]" : "text-[#FF5C7A]"}`}>
            {ia.ok ? "✓ " : "✕ "}
            {ia.detalhe}
          </p>
        )}
      </div>

      {/* 4) Chamadas recebidas (webhook) — diagnóstico */}
      <div className="border-t border-[#1E222B] mt-5 pt-4">
        <p className="text-sm font-semibold text-[#C9CFD8] mb-1">📥 Mensagens recebidas (webhook)</p>
        <p className="text-[11px] text-[#7A828F] mb-3">
          Toda chamada que a uazapi faz aparece aqui (atualiza sozinho). Mande um “oi” de outro
          número: se <b>nada aparecer</b>, o webhook da instância não está apontando para
          <code> /api/webhooks/uazapi</code>; se aparecer “ignorado”, me mande o texto que ajusto o parser.
        </p>
        {logs.length === 0 ? (
          <p className="text-[12.5px] text-[#7A828F] bg-[#171B22] rounded-lg px-3 py-2">
            Nenhuma chamada recebida ainda. Configure o webhook da instância na uazapi para
            <code> https://SEU-APP/api/webhooks/uazapi</code> (evento de mensagens) e mande um “oi”.
          </p>
        ) : (
          <div className="grid gap-1.5">
            {logs.map((l, i) => {
              const falhou =
                l.resultado.includes("FALHA") ||
                l.resultado.includes("NÃO enviada") ||
                l.resultado.startsWith("erro");
              const ok = l.resultado.startsWith("processado") && !falhou;
              return (
                <div key={i} className="border border-[#1E222B] rounded-lg px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-medium ${ok ? "text-[#34C46A]" : falhou ? "text-[#FF5C7A]" : "text-[#9AA2AF]"}`}>
                      {ok ? "✓ " : falhou ? "✕ " : "• "}
                      {l.resultado}
                    </span>
                    <span className="text-[#7A828F] whitespace-nowrap">
                      {new Date(l.recebidoEm).toLocaleTimeString("pt-BR")}
                      {l.telefone ? ` · ${l.telefone}` : ""}
                    </span>
                  </div>
                  <pre className="mt-1 text-[10.5px] text-[#9AA2AF] whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                    {l.corpo}
                  </pre>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Marcador de versão: confirma que o deploy novo entrou no ar */}
      <p className="mt-5 pt-3 border-t border-[#1E222B] text-[10.5px] text-[#7A828F]">
        diagnóstico WhatsApp <b>v23</b> · nome e voz de cada IA por imobiliária · preview de voz em pt-BR · idioma travado em português ·
        carrossel de fotos · fotos sem Blob · build 2026-07-24
      </p>
    </div>
  );
}
