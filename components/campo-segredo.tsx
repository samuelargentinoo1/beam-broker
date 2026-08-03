"use client";

import { useState } from "react";
import { inputClass } from "@/components/ui";

// Campo de chave de API. NÃO usa type="password" de propósito.
//
// O gerenciador de senhas do navegador procura input[type=password] e preenche
// sozinho, com a senha de login do usuário. Como a tela grava "campo preenchido
// substitui, vazio mantém", cada salvar passava a senha por cima da chave que
// estava funcionando — calado. autoComplete="new-password" não segura o Chrome;
// o que segura é o campo não ser de senha.
//
// Aqui é um input de texto mascarado por CSS: parece senha para quem olha, é
// texto comum para o navegador. E ganha um "ver" — dá para conferir o que foi
// colado antes de salvar, o que com type="password" nunca deu.
export default function CampoSegredo({
  name,
  placeholder,
}: {
  name: string;
  placeholder?: string;
}) {
  const [revelado, setRevelado] = useState(false);
  const [valor, setValor] = useState("");

  return (
    <div className="flex items-center gap-2">
      <input
        name={name}
        type="text"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        data-lpignore="true"
        data-1p-ignore
        data-form-type="other"
        className={`${inputClass} campo-segredo${revelado ? " revelado" : ""}`}
      />
      {valor && (
        <button
          type="button"
          onClick={() => setRevelado((r) => !r)}
          className="shrink-0 text-[12px] font-semibold text-[#34C46A] border border-[rgba(52,196,106,.3)] rounded-full px-3 py-1.5 hover:bg-[rgba(52,196,106,.06)] cursor-pointer transition-colors"
        >
          {revelado ? "ocultar" : "ver"}
        </button>
      )}
    </div>
  );
}
