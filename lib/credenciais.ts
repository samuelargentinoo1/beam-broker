// Guarda de sanidade dos campos de segredo da tela de Configurações.
//
// O problema real que isto resolve: os campos de chave são <input
// type="password"> com valor vazio (a tela nunca reexibe um segredo). O
// gerenciador de senhas do navegador vê "campo de senha" e PREENCHE SOZINHO com
// a senha de login do usuário. Como a regra de gravação é "campo preenchido
// substitui, campo vazio mantém", um salvar comum passava a senha do usuário por
// cima da chave que estava funcionando — sem erro, sem aviso.
//
// O estrago não é só na voz: o mesmo vale para o token da uazapi, e aí o
// WhatsApp inteiro para. Por isso a verificação é do FORMATO da credencial, não
// só "veio alguma coisa".

export type TipoCredencial = "MINIMAX" | "ELEVENLABS" | "ASAAS" | "ZAPSIGN" | "UAZAPI";

const ROTULO: Record<TipoCredencial, string> = {
  MINIMAX: "MiniMax",
  ELEVENLABS: "ElevenLabs",
  ASAAS: "Asaas",
  ZAPSIGN: "ZapSign",
  UAZAPI: "uazapi",
};

// Só recusa quando dá para ter CERTEZA de que está errado. Uma validação
// apertada demais bloquearia chave nova legítima, o que é pior: aí a pessoa não
// consegue configurar de jeito nenhum.
export function validarCredencial(tipo: TipoCredencial, valor: string): string | null {
  const v = valor.trim();
  if (!v) return null; // vazio = "mantém o que está salvo", caminho normal

  if (/\s/.test(v))
    return `A chave do ${ROTULO[tipo]} tem espaço no meio. Cole a chave sozinha, sem texto em volta.`;

  // Nenhum provedor aqui usa segredo curto. Senha de gente quase sempre é.
  if (v.length < 20)
    return `Isso é curto demais para uma chave do ${ROTULO[tipo]}. Confira se colou a chave inteira — e se o navegador não preencheu o campo sozinho com sua senha.`;

  switch (tipo) {
    case "MINIMAX":
      // A MiniMax emite DOIS formatos, e os dois são legítimos:
      //   "sk-api-..."  — o que o console (Pay-as-you-go → Access) gera hoje
      //   "eyJ...."     — JWT, formato antigo, que carrega o GroupID dentro
      // Só o JWT permite descobrir o grupo sozinho; com "sk-" o GroupId precisa
      // ser preenchido à mão.
      if (!/^sk[-_]/i.test(v) && !/^ey[\w-]*\.[\w-]+\.[\w-]+$/.test(v))
        return "Isso não tem formato de chave da MiniMax (ela começa com \"sk-api-\" ou com \"eyJ\"). Confira o que foi colado.";
      return null;
    case "ELEVENLABS":
      if (!/^sk_/.test(v))
        return "A chave do ElevenLabs começa com \"sk_\". Confira o que foi colado.";
      return null;
    case "ASAAS":
      if (!/^\$?aact_/i.test(v))
        return "A chave do Asaas começa com \"$aact_\". Confira o que foi colado.";
      return null;
    // ZapSign e uazapi usam tokens opacos, sem prefixo estável: aqui valem só as
    // checagens gerais acima.
    default:
      return null;
  }
}
