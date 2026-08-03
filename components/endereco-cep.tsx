"use client";

import { useState } from "react";
import { Field, inputClass } from "@/components/ui";

type EnderecoCep = {
  logradouro: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  latitude: number | null;
  longitude: number | null;
};

// Bloco de endereço com preenchimento automático por CEP. Ao digitar um CEP
// válido (8 dígitos), busca rua/bairro/cidade/UF e preenche sozinho — deixando
// só o número/complemento (que o CEP não traz) para completar à mão. Guarda as
// coordenadas em campos ocultos, para a busca por proximidade já nascer pronta.
// Mantém os mesmos name= do form antigo, então a action não muda.
export default function EnderecoCep({
  cidadePadrao = "",
  ufPadrao = "",
}: {
  cidadePadrao?: string;
  ufPadrao?: string;
}) {
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState(cidadePadrao);
  const [uf, setUf] = useState(ufPadrao);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  function formatarCep(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  }

  async function buscar(cepValor: string) {
    const d = cepValor.replace(/\D/g, "");
    if (d.length !== 8) return;
    setBuscando(true);
    setAviso(null);
    try {
      const res = await fetch(`/api/cep/${d}`);
      if (!res.ok) {
        setAviso("CEP não encontrado. Você pode preencher o endereço à mão.");
        return;
      }
      const e = (await res.json()) as EnderecoCep;
      // Rua entra no começo do endereço; o número/complemento fica pro usuário.
      // Não sobrescreve o que a pessoa já digitou de número.
      if (e.logradouro) {
        setEndereco((atual) => {
          const jaTemRua = atual.trim().toLowerCase().startsWith(e.logradouro!.trim().toLowerCase());
          return jaTemRua ? atual : `${e.logradouro}, `;
        });
      }
      if (e.bairro) setBairro(e.bairro);
      if (e.cidade) setCidade(e.cidade);
      if (e.uf) setUf(e.uf);
      setLat(e.latitude != null ? String(e.latitude) : "");
      setLon(e.longitude != null ? String(e.longitude) : "");
      setAviso("Endereço preenchido pelo CEP. Complete o número e o complemento.");
    } catch {
      setAviso("Não consegui buscar o CEP agora. Preencha o endereço à mão.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <>
      <Field label="CEP">
        <div className="relative">
          <input
            name="cep"
            value={cep}
            onChange={(e) => {
              const v = formatarCep(e.target.value);
              setCep(v);
              if (v.replace(/\D/g, "").length === 8) buscar(v);
            }}
            onBlur={() => buscar(cep)}
            className={inputClass}
            placeholder="00000-000"
            inputMode="numeric"
            autoComplete="off"
          />
          {buscando && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#34C46A]">buscando…</span>
          )}
        </div>
      </Field>
      <div className="hidden sm:block" />

      <div className="col-span-2">
        <Field label="Endereço">
          <input
            name="endereco"
            value={endereco}
            onChange={(e) => setEndereco(e.target.value)}
            className={inputClass}
            required
            placeholder="Rua, número, complemento"
          />
        </Field>
      </div>

      <Field label="Bairro">
        <input name="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Cidade">
        <input name="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} className={inputClass} required />
      </Field>
      <Field label="UF">
        <input
          name="uf"
          value={uf}
          onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))}
          className={inputClass}
          required
          maxLength={2}
        />
      </Field>

      {aviso && <p className="col-span-2 text-[11px] text-[#9AA2AF] -mt-1">{aviso}</p>}

      {/* coordenadas do CEP (quando houver) para a busca por proximidade */}
      <input type="hidden" name="latitude" value={lat} />
      <input type="hidden" name="longitude" value={lon} />
    </>
  );
}
