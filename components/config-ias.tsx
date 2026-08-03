"use client";

import { useState } from "react";
import { inputClass } from "@/components/ui";

type Cfg = { nome: string };

const AGENTES: { id: string; rotulo: string }[] = [
  { id: "RECEPCAO", rotulo: "Recepção (triagem)" },
  { id: "VENDAS", rotulo: "Vendas (locação)" },
  { id: "CAPTACAO", rotulo: "Captação" },
  { id: "COMPRA_VENDA", rotulo: "Venda de imóveis" },
  { id: "ADMINISTRACAO", rotulo: "Administração" },
  { id: "AJUDA_CORRETOR", rotulo: "Ajuda Corretor" },
];

// Configura o NOME de cada IA. Salva num campo oculto (iasConfig) em JSON.
//
// A escolha de VOZ por IA saiu de propósito: era um campo de voice_id que
// ninguém tinha como preencher direito — o placeholder antigo sugeria até um ID
// no formato do ElevenLabs. Um ID errado a MiniMax recusa em SILÊNCIO, e o
// áudio some da conversa enquanto o preview da tela continua funcionando.
// Agora a voz é descoberta na conta, e o voiceId é APAGADO do JSON ao salvar:
// deixá-lo lá manteria o valor velho em uso sem nenhuma forma de limpar.
export default function ConfigIAs({ configAtual }: { configAtual: string }) {
  const inicial: Record<string, Cfg> = {};
  try {
    const o = JSON.parse(configAtual || "{}");
    for (const a of AGENTES) inicial[a.id] = { nome: o?.[a.id]?.nome ?? "" };
  } catch {
    for (const a of AGENTES) inicial[a.id] = { nome: "" };
  }

  const [cfg, setCfg] = useState<Record<string, Cfg>>(inicial);

  function set(agente: string, campo: keyof Cfg, valor: string) {
    setCfg((c) => ({ ...c, [agente]: { ...c[agente], [campo]: valor } }));
  }

  return (
    <div>
      <input type="hidden" name="iasConfig" value={JSON.stringify(cfg)} />
      <div className="space-y-2.5">
        {AGENTES.map((a) => (
          <div key={a.id} className="grid grid-cols-[160px_1fr] items-center gap-2">
            <span className="text-[12px] text-[#B4BBC5]">{a.rotulo}</span>
            <input
              value={cfg[a.id].nome}
              onChange={(e) => set(a.id, "nome", e.target.value)}
              placeholder="Carol"
              className={`${inputClass} !py-1.5 !text-[13px]`}
            />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[#7A828F] mt-2">
        Em branco, a IA usa o nome padrão <b>Carol</b>. Dica: se quer que o cliente sinta que é sempre
        a mesma pessoa, use o <b>mesmo nome</b> em todas. A voz é a mesma para todas.
      </p>
    </div>
  );
}
