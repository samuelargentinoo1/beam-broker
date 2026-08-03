"use client";

import { useMemo, useState } from "react";
import { MEU_DIA } from "@/lib/proto/negocios";
import { CONTATOS, compativeis } from "@/lib/proto/contatos";
import { brl, mil } from "@/lib/proto/base";
import type { ItemMeuDia, MotivoCard } from "@/lib/proto/tipos";
import { Botao, Chip, Inicial, Modal, Score, TopoTela } from "./ui";

const TOM_MOTIVO: Record<MotivoCard["tipo"], { cor: string; glifo: string }> = {
  promessa: { cor: "#FF5C7A", glifo: "⚠" },
  retorno: { cor: "#FF5C7A", glifo: "⚠" },
  silencio: { cor: "#F5B23D", glifo: "◷" },
  visita: { cor: "#8CF0B0", glifo: "📅" },
  match: { cor: "#34C46A", glifo: "✦" },
  ia: { cor: "#B98CFF", glifo: "🤖" },
  proposta: { cor: "#8CF0B0", glifo: "◆" },
};

// O card é denso: "Apartamento Parque Residencial Damha" estoura a linha.
const ABREV: Record<string, string> = { Apartamento: "Apto" };
const curto = (t: string) => ABREV[t] ?? t;
const bairroCurto = (b: string) => b.replace(/^(Jardim|Vila|Parque Residencial|Parque)\s+/, "");

const HOJE = new Date(2026, 6, 28);
const DATA_LONGA = HOJE.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

export default function MeuDia() {
  const [itens, setItens] = useState<ItemMeuDia[]>(MEU_DIA);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ligando, setLigando] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<ItemMeuDia | null>(null);

  const fila = useMemo(
    () => itens.filter((i) => !i.concluido && !i.adiado).sort((a, b) => a.prioridade - b.prioridade),
    [itens]
  );
  const feitos = itens.filter((i) => i.concluido).length;
  const adiados = itens.filter((i) => i.adiado).length;
  const total = itens.length;
  const pct = Math.round((feitos / total) * 100);

  const atrasadas = fila.filter(
    (i) => i.motivo.tipo === "promessa" || i.motivo.tipo === "retorno" || i.motivo.tipo === "silencio"
  ).length;
  const visitas = fila.filter((i) => i.motivo.tipo === "visita").length;
  const matches = fila.filter((i) => i.motivo.tipo === "match").length;

  const mexer = (id: string, campo: "concluido" | "adiado", texto: string) => {
    setItens((xs) => xs.map((x) => (x.id === id ? { ...x, [campo]: true } : x)));
    setAviso(texto);
    setTimeout(() => setAviso(null), 2600);
  };

  return (
    <div className="pb-20">
      <TopoTela
        titulo="Meu dia"
        legenda={DATA_LONGA}
        direita={
          <span className="text-[12.5px] tabular-nums text-[#9AA2AF]">
            {feitos} de {total} concluídas
            {adiados > 0 && <span className="text-[#7A828F]"> · {adiados} adiadas</span>}
          </span>
        }
      />

      <div className="mb-3 h-[3px] w-full overflow-hidden rounded-full bg-[#1E222B]">
        <div
          className="h-full rounded-full bg-[#34C46A] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Chip tom="vermelho">{atrasadas} atrasadas</Chip>
        <Chip tom="ambar">
          {visitas} {visitas === 1 ? "visita hoje" : "visitas hoje"}
        </Chip>
        <Chip tom="azul">{matches} matches novos</Chip>
      </div>

      {aviso && (
        <div className="mb-3 rounded-[12px] border border-[rgba(52,196,106,.3)] bg-[rgba(52,196,106,.08)] px-3.5 py-2 text-[12.5px] text-[#34C46A]">
          {aviso}
        </div>
      )}

      <div className="space-y-2.5">
        {fila.map((item) => {
          const c = CONTATOS.find((x) => x.id === item.contatoId)!;
          const tom = TOM_MOTIVO[item.motivo.tipo];
          const imoveis = compativeis(c);

          return (
            <article
              key={item.id}
              className="rounded-[18px] border border-[#1E222B] bg-[#12141A] px-4 py-3.5 transition-colors hover:border-[#2F3947]"
            >
              <div className="flex gap-3.5">
                <Inicial c={c} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-semibold text-[#F4F5F7]">{c.nome}</span>
                    <Score c={c} />
                    <span className="ml-auto text-[11px] tabular-nums text-[#7A828F]">
                      #{item.prioridade}
                    </span>
                  </div>

                  <p className="m-0 mt-1 text-[12.5px] leading-snug text-[#9AA2AF]">{c.resumo}</p>

                  <p className="m-0 mt-1.5 text-[12.5px] font-medium" style={{ color: tom.cor }}>
                    <span className="mr-1" aria-hidden>
                      {tom.glifo}
                    </span>
                    {item.motivo.texto}
                  </p>

                  {imoveis.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {imoveis.slice(0, 3).map((im) => (
                        <span
                          key={im!.id}
                          className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#1E222B] bg-[#07080B] py-1 pl-1 pr-2 text-[11.5px] text-[#9AA2AF]"
                          title={`${im!.codigo} · ${im!.quartos} quartos · ${im!.area}m² · ${im!.bairro}`}
                        >
                          <span
                            className="h-5 w-7 shrink-0 rounded-[5px]"
                            style={{ background: im!.cor }}
                            aria-hidden
                          />
                          {curto(im!.tipo)} {bairroCurto(im!.bairro)} ·{" "}
                          {im!.finalidade === "VENDA" ? mil(im!.preco) : `${brl(im!.preco)}/mês`}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Botao
                      pequeno
                      onClick={() => setAviso(`Abrindo a conversa com ${c.nome.split(" ")[0]}…`)}
                    >
                      💬 Abrir conversa
                    </Botao>
                    {item.acoes.includes("ligar") && (
                      <Botao pequeno onClick={() => setLigando(item.contatoId)}>
                        Ligar
                      </Botao>
                    )}
                    {item.acoes.includes("confirmar") && (
                      <Botao
                        pequeno
                        variante="primario"
                        onClick={() =>
                          mexer(item.id, "concluido", `Visita de ${c.nome.split(" ")[0]} confirmada às 14h.`)
                        }
                      >
                        Confirmar visita
                      </Botao>
                    )}
                    {item.acoes.includes("enviar") && (
                      <Botao pequeno variante="primario" onClick={() => setEnviando(item)}>
                        Enviar imóveis
                      </Botao>
                    )}
                    {item.acoes.includes("ia") && (
                      <Botao
                        pequeno
                        onClick={() =>
                          mexer(item.id, "adiado", `${c.nome.split(" ")[0]} devolvida para a IA reengajar.`)
                        }
                      >
                        Deixar com a IA
                      </Botao>
                    )}
                    {item.acoes.includes("concluir") && (
                      <Botao
                        pequeno
                        variante="sucesso"
                        onClick={() => mexer(item.id, "concluido", `${c.nome.split(" ")[0]} concluída.`)}
                      >
                        Concluir
                      </Botao>
                    )}
                    <Botao
                      pequeno
                      variante="fantasma"
                      onClick={() => mexer(item.id, "adiado", `${c.nome.split(" ")[0]} adiada para amanhã.`)}
                    >
                      Adiar
                    </Botao>
                  </div>
                </div>
              </div>
            </article>
          );
        })}

        {fila.length === 0 && (
          <div className="rounded-[18px] border border-[rgba(52,196,106,.3)] bg-[rgba(52,196,106,.05)] px-5 py-10 text-center">
            <p className="m-0 text-[15px] font-semibold text-[#34C46A]">Fila zerada 🎉</p>
            <p className="m-0 mt-1 text-[12.5px] text-[#9AA2AF]">
              {feitos} concluídas e {adiados} adiadas. A IA continua atendendo o que chegar.
            </p>
            <div className="mt-4 flex justify-center">
              <Botao onClick={() => setItens(MEU_DIA.map((i) => ({ ...i })))}>Recomeçar o dia</Botao>
            </div>
          </div>
        )}
      </div>

      <Modal aberto={!!ligando} titulo="Chamada" onFechar={() => setLigando(null)} largura={380}>
        {ligando &&
          (() => {
            const c = CONTATOS.find((x) => x.id === ligando)!;
            return (
              <div className="text-center">
                <div className="flex justify-center">
                  <Inicial c={c} tam={64} />
                </div>
                <p className="m-0 mt-3 text-[16px] font-semibold text-[#F4F5F7]">{c.nome}</p>
                <p className="m-0 mt-0.5 text-[13px] tabular-nums text-[#9AA2AF]">{c.telefone}</p>
                <p className="m-0 mt-4 text-[12px] text-[#7A828F]">
                  Chamando pelo ramal da imobiliária… a gravação entra no histórico do contato.
                </p>
                <div className="mt-5 flex justify-center gap-2">
                  <Botao variante="perigo" onClick={() => setLigando(null)}>
                    Encerrar
                  </Botao>
                  <Botao
                    variante="sucesso"
                    onClick={() => {
                      const item = itens.find((i) => i.contatoId === ligando);
                      setLigando(null);
                      if (item)
                        mexer(item.id, "concluido", `Ligação para ${c.nome.split(" ")[0]} registrada.`);
                    }}
                  >
                    Atendeu — concluir
                  </Botao>
                </div>
              </div>
            );
          })()}
      </Modal>

      <Modal
        aberto={!!enviando}
        titulo="Enviar imóveis pelo WhatsApp"
        onFechar={() => setEnviando(null)}
        largura={520}
      >
        {enviando &&
          (() => {
            const c = CONTATOS.find((x) => x.id === enviando.contatoId)!;
            const imoveis = compativeis(c);
            return (
              <div>
                <div className="mb-3 flex items-center gap-2.5">
                  <Inicial c={c} tam={34} />
                  <div>
                    <p className="m-0 text-[13.5px] font-medium text-[#F4F5F7]">{c.nome}</p>
                    <p className="m-0 text-[11.5px] tabular-nums text-[#7A828F]">{c.telefone}</p>
                  </div>
                </div>

                <div className="rounded-[16px] border border-[#1E222B] bg-[#07080B] p-3.5 text-[12.5px] leading-relaxed text-[#9AA2AF]">
                  <p className="m-0">Oi, {c.nome.split(" ")[0]}! Aqui é a Ana Julia, da Horizonte 🙂</p>
                  <p className="m-0 mt-2">
                    Separei {imoveis.length === 1 ? "uma opção" : `${imoveis.length} opções`} que{" "}
                    {imoveis.length === 1 ? "bate" : "batem"} com o que você procura
                    {c.bairrosDesejados[0] ? ` no ${c.bairrosDesejados[0]}` : ""}:
                  </p>
                  <ul className="m-0 mt-2 list-none space-y-1 p-0">
                    {imoveis.map((im) => (
                      <li key={im!.id}>
                        • {im!.tipo} {im!.quartos}q, {im!.area}m² — {im!.bairro} —{" "}
                        <b className="text-[#F4F5F7]">
                          {im!.finalidade === "VENDA" ? brl(im!.preco) : `${brl(im!.preco)}/mês`}
                        </b>
                      </li>
                    ))}
                  </ul>
                  <p className="m-0 mt-2">Quer que eu agende uma visita nesta semana?</p>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <Botao variante="fantasma" onClick={() => setEnviando(null)}>
                    Cancelar
                  </Botao>
                  <Botao
                    variante="primario"
                    onClick={() => {
                      const id = enviando.id;
                      setEnviando(null);
                      mexer(id, "concluido", `${imoveis.length} imóveis enviados para ${c.nome.split(" ")[0]}.`);
                    }}
                  >
                    Enviar agora
                  </Botao>
                </div>
              </div>
            );
          })()}
      </Modal>
    </div>
  );
}
