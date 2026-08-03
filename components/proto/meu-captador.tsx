"use client";

import { useMemo, useState } from "react";
import { IMOVEIS, brl, mil } from "@/lib/proto/base";
import { Bloco, Botao, TopoTela } from "./ui";

// Demanda reprimida por bairro: procuras contra estoque. O gap é o que decide
// onde o captador bate porta hoje.
const DEMANDA = [
  { bairro: "Jardim São Paulo", perfil: "2 quartos até R$ 2.200", procuras: 47, estoque: 2 },
  { bairro: "Jardim Aclimação", perfil: "3 quartos até R$ 500 mil", procuras: 31, estoque: 3 },
  { bairro: "Bosque", perfil: "2 quartos que aceitem pet", procuras: 24, estoque: 2 },
  { bairro: "Centro", perfil: "studio até R$ 280 mil", procuras: 19, estoque: 4 },
  { bairro: "Vila Xavier", perfil: "casa 3 quartos com quintal", procuras: 14, estoque: 5 },
  { bairro: "Vila Harmonia", perfil: "2 quartos até R$ 330 mil", procuras: 12, estoque: 4 },
  { bairro: "Parque Residencial Damha", perfil: "4 quartos condomínio", procuras: 11, estoque: 6 },
  { bairro: "Carmo", perfil: "casa para locação", procuras: 9, estoque: 5 },
  { bairro: "Jardim América", perfil: "3 quartos até R$ 420 mil", procuras: 8, estoque: 6 },
  { bairro: "Vila Melhado", perfil: "2 quartos até R$ 300 mil", procuras: 7, estoque: 5 },
  { bairro: "Santa Angelina", perfil: "terreno", procuras: 5, estoque: 4 },
  { bairro: "Vila Furlan", perfil: "1 quarto locação", procuras: 4, estoque: 5 },
].map((d) => ({ ...d, gap: d.procuras / Math.max(1, d.estoque) }));

const ETAPAS_CAPTACAO = ["Contato", "Visita técnica", "Autorização", "Fotos", "Publicado"];

const PIPELINE = [
  { id: "cp1", titulo: "Casa Jd. São Paulo", proprietario: "Helena Castilho", etapa: "Contato", dias: 2 },
  { id: "cp2", titulo: "Apto Vila Xavier", proprietario: "Sérgio Maia", etapa: "Visita técnica", dias: 4 },
  { id: "cp3", titulo: "Sobrado Damha", proprietario: "Família Bergamo", etapa: "Autorização", dias: 6 },
  { id: "cp4", titulo: "Apto Centro 71", proprietario: "Elaine Cordeiro", etapa: "Fotos", dias: 9 },
  { id: "cp5", titulo: "Casa Vila Harmonia", proprietario: "Otávio Rangel", etapa: "Fotos", dias: 14 },
  { id: "cp6", titulo: "Apto Bosque 22", proprietario: "Nelson Peixoto", etapa: "Publicado", dias: 1 },
  { id: "cp7", titulo: "Terreno Damha", proprietario: "WT Investimentos", etapa: "Visita técnica", dias: 3 },
  { id: "cp8", titulo: "Apto Jd. América", proprietario: "Cláudia Vasques", etapa: "Autorização", dias: 11 },
];

// O tempo morto que ninguém mede: da autorização assinada até o anúncio no ar.
const LIMBO_DIAS = 11.4;

export default function MeuCaptador() {
  const [sel, setSel] = useState<string | null>("Jardim São Paulo");
  const [endereco, setEndereco] = useState("");
  const [tipologia, setTipologia] = useState("3 quartos · 90–110m²");
  const [avaliado, setAvaliado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const maxGap = Math.max(...DEMANDA.map((d) => d.gap));
  const escolhido = DEMANDA.find((d) => d.bairro === sel);

  // Comparáveis para a avaliação — mostrar a conta vale mais que mostrar o número.
  const comparaveis = useMemo(
    () =>
      IMOVEIS.filter((i) => i.finalidade === "VENDA" && i.quartos === 3)
        .slice(0, 5)
        .map((i) => ({ ...i, m2: Math.round(i.preco / i.area) })),
    []
  );
  const m2s = comparaveis.map((c) => c.m2).sort((a, b) => a - b);
  const mediana = m2s[Math.floor(m2s.length / 2)] ?? 0;
  const area = 100;
  const faixa = { min: (m2s[0] ?? 0) * area, med: mediana * area, max: (m2s[m2s.length - 1] ?? 0) * area };

  const tomGap = (g: number) => (g >= 15 ? "#FF5C7A" : g >= 6 ? "#F5B23D" : g >= 2 ? "#8CF0B0" : "#7A828F");

  return (
    <div className="space-y-4 pb-12">
      <TopoTela
        titulo="Meu Captador"
        legenda="onde falta imóvel — e quanto tempo o seu leva para chegar ao anúncio"
      />

      {aviso && (
        <div className="rounded-[12px] border border-[rgba(52,196,106,.3)] bg-[rgba(52,196,106,.08)] px-3.5 py-2 text-[12.5px] text-[#34C46A]">
          {aviso}
        </div>
      )}

      {/* ── Mapa de calor da demanda reprimida ── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        <Bloco titulo="Demanda reprimida por bairro" acao={<span className="text-[11.5px] text-[#7A828F]">procuras × estoque · 30 dias</span>}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {DEMANDA.map((d) => {
              const intensidade = d.gap / maxGap;
              const ativo = sel === d.bairro;
              return (
                <button
                  key={d.bairro}
                  onClick={() => setSel(d.bairro)}
                  className="rounded-[12px] border p-2.5 text-left transition-transform hover:scale-[1.02]"
                  style={{
                    background: `rgba(255,92,122,${(0.05 + intensidade * 0.3).toFixed(3)})`,
                    borderColor: ativo ? "#34C46A" : "rgba(255,92,122,.2)",
                    outline: ativo ? "2px solid rgba(52,196,106,.2)" : "none",
                  }}
                >
                  <p className="m-0 text-[11.5px] font-medium leading-tight text-[#F4F5F7]">
                    {d.bairro}
                  </p>
                  <p className="m-0 mt-1 text-[15px] font-semibold tabular-nums" style={{ color: tomGap(d.gap) }}>
                    {d.gap.toFixed(1)}×
                  </p>
                  <p className="m-0 text-[10px] tabular-nums text-[#9AA2AF]">
                    {d.procuras} procuras · {d.estoque} imóveis
                  </p>
                </button>
              );
            })}
          </div>
          <p className="m-0 mt-3 text-[12px] text-[#7A828F]">
            Quanto mais escuro, maior a distância entre o que procuram e o que você tem.
          </p>
        </Bloco>

        <Bloco titulo="Prioridade de captação">
          <ol className="m-0 list-none space-y-2 p-0">
            {[...DEMANDA]
              .sort((a, b) => b.gap - a.gap)
              .slice(0, 5)
              .map((d, i) => (
                <li
                  key={d.bairro}
                  className="rounded-[12px] border p-2.5"
                  style={{
                    borderColor: sel === d.bairro ? "#34C46A" : "#1E222B",
                    background: sel === d.bairro ? "rgba(52,196,106,.04)" : undefined,
                  }}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] tabular-nums text-[#7A828F]">{i + 1}</span>
                    <span className="text-[12px] font-medium text-[#F4F5F7]">{d.bairro}</span>
                    <span
                      className="ml-auto shrink-0 rounded px-1.5 py-px text-[10px] font-medium"
                      style={{ background: `${tomGap(d.gap)}18`, color: tomGap(d.gap) }}
                    >
                      {d.gap >= 15 ? "gap crítico" : d.gap >= 6 ? "gap alto" : "atenção"}
                    </span>
                  </div>
                  <p className="m-0 mt-0.5 text-[11.5px] text-[#9AA2AF]">{d.perfil}</p>
                  <p className="m-0 text-[11px] tabular-nums text-[#7A828F]">
                    {d.procuras} procuras, {d.estoque}{" "}
                    {d.estoque === 1 ? "imóvel" : "imóveis"}
                  </p>
                </li>
              ))}
          </ol>
          {escolhido && (
            <div className="mt-3">
              <Botao
                variante="primario"
                onClick={() => {
                  setAviso(`Rota de captação criada para ${escolhido.bairro} — ${escolhido.perfil}.`);
                  setTimeout(() => setAviso(null), 3200);
                }}
              >
                Criar rota de captação
              </Botao>
            </div>
          )}
        </Bloco>
      </div>

      {/* ── Funil de captação ── */}
      <Bloco
        titulo="Funil de captação"
        acao={
          <span className="rounded-md border border-[rgba(245,178,61,.35)] bg-[rgba(245,178,61,.08)] px-2 py-0.5 text-[11.5px] text-[#F5B23D]">
            autorização → publicado: <b className="tabular-nums">{LIMBO_DIAS} dias</b> em média
          </span>
        }
      >
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-2.5">
            {ETAPAS_CAPTACAO.map((e) => {
              const daEtapa = PIPELINE.filter((p) => p.etapa === e);
              return (
                <section
                  key={e}
                  className="w-[210px] shrink-0 rounded-[14px] border border-[#1E222B] bg-[#07080B] p-2.5"
                >
                  <header className="mb-2 flex items-baseline justify-between px-1">
                    <span className="text-[12px] font-medium text-[#F4F5F7]">{e}</span>
                    <span className="text-[11px] tabular-nums text-[#7A828F]">{daEtapa.length}</span>
                  </header>
                  <div className="space-y-2">
                    {daEtapa.map((p) => {
                      // Parado no limbo entre autorização e publicação = dinheiro parado.
                      const limbo = (e === "Autorização" || e === "Fotos") && p.dias >= 9;
                      return (
                        <article
                          key={p.id}
                          className="rounded-[10px] border bg-[#12141A] p-2.5"
                          style={{ borderColor: limbo ? "rgba(255,92,122,.4)" : "#1E222B" }}
                        >
                          <p className="m-0 text-[12px] font-medium text-[#F4F5F7]">{p.titulo}</p>
                          <p className="m-0 mt-0.5 text-[11px] text-[#7A828F]">{p.proprietario}</p>
                          <p
                            className="m-0 mt-1 text-[11px] tabular-nums"
                            style={{ color: limbo ? "#FF5C7A" : "#7A828F" }}
                          >
                            {p.dias}d nesta etapa {limbo && "· parado"}
                          </p>
                        </article>
                      );
                    })}
                    {daEtapa.length === 0 && (
                      <p className="m-0 rounded-[10px] border border-dashed border-[#2A303B] px-2 py-4 text-center text-[11px] text-[#7A828F]">
                        vazio
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
        <p className="m-0 mt-3 text-[12px] leading-relaxed text-[#9AA2AF]">
          Imóvel com autorização assinada e sem anúncio no ar é <b className="text-[#F4F5F7]">dinheiro
          parado</b> — e é o único tempo do processo que ninguém mede. Dois estão parados há mais de 9
          dias.
        </p>
      </Bloco>

      {/* ── Avaliação: mostrar a conta importa mais que o número ── */}
      <Bloco titulo="Avaliação de imóvel">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[240px] flex-1">
            <span className="label-caps mb-1 block !text-[9px] tracking-[.12em] text-[#7A828F]">
              endereço
            </span>
            <input
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Rua das Palmeiras, 120 — Jd. Aclimação"
              className="input-ds"
            />
          </label>
          <label className="min-w-[200px]">
            <span className="label-caps mb-1 block !text-[9px] tracking-[.12em] text-[#7A828F]">
              tipologia
            </span>
            <select value={tipologia} onChange={(e) => setTipologia(e.target.value)} className="input-ds">
              <option>3 quartos · 90–110m²</option>
              <option>2 quartos · 55–75m²</option>
              <option>4 quartos · 120–160m²</option>
              <option>Studio · 28–45m²</option>
            </select>
          </label>
          <Botao variante="primario" onClick={() => setAvaliado(true)} desabilitado={!endereco.trim()}>
            Avaliar
          </Botao>
        </div>

        {avaliado && (
          <div className="mt-4">
            <div className="flex flex-wrap items-end gap-6">
              {[
                ["mínimo", faixa.min, "#7A828F"],
                ["mediana", faixa.med, "#F4F5F7"],
                ["máximo", faixa.max, "#7A828F"],
              ].map(([r, v, cor]) => (
                <div key={r as string}>
                  <p className="m-0 text-[11px] text-[#7A828F]">{r as string}</p>
                  <p
                    className="m-0 text-[22px] font-semibold leading-none tabular-nums"
                    style={{ color: cor as string }}
                  >
                    {mil(v as number)}
                  </p>
                </div>
              ))}
            </div>

            <p className="m-0 mt-4 mb-2 text-[12px] font-medium text-[#F4F5F7]">
              Comparáveis usados no cálculo
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-[#1E222B] text-left text-[10.5px] uppercase tracking-wider text-[#7A828F]">
                    <th className="py-1.5 pr-3 font-medium">Imóvel</th>
                    <th className="py-1.5 pr-3 font-medium">Bairro</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Área</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Preço</th>
                    <th className="py-1.5 text-right font-medium">R$/m²</th>
                  </tr>
                </thead>
                <tbody>
                  {comparaveis.map((c) => (
                    <tr key={c.id} className="border-b border-[#1A1E26] last:border-0">
                      <td className="py-1.5 pr-3 text-[#C9CFD8]">{c.codigo}</td>
                      <td className="py-1.5 pr-3 text-[#9AA2AF]">{c.bairro}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-[#9AA2AF]">{c.area}m²</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-[#9AA2AF]">
                        {mil(c.preco)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-[#F4F5F7]">
                        {brl(c.m2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="m-0 mt-2.5 text-[12px] leading-relaxed text-[#9AA2AF]">
              Mediana de <b className="text-[#F4F5F7]">{brl(mediana)}/m²</b> × {area}m² ={" "}
              <b className="text-[#F4F5F7]">{mil(faixa.med)}</b>. Mostrar a conta é o que sustenta a
              negociação com o proprietário — número solto ele contesta, tabela ele aceita.
            </p>
          </div>
        )}
      </Bloco>
    </div>
  );
}
