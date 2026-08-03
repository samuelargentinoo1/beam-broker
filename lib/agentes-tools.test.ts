// Critérios de aceite do M3: o mapa de ferramentas por agente e a economia de
// contexto que ele produz. As tools são construídas dentro de toolsPorAgente
// (função interna), então aqui a verificação é sobre o ARQUIVO — é o que trava
// uma remoção intencional de voltar por descuido num merge.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { agentesAtivos, PRODUTOS } from "@/lib/planos";
import { areaQueDeveriaAtender } from "@/lib/agentes";

const fonte = readFileSync(new URL("./agentes.ts", import.meta.url), "utf8");

// Extrai o array de tools de um agente no mapa retornado por toolsPorAgente.
function toolsDe(agente: string): string[] {
  const m = fonte.match(new RegExp(`^\\s*${agente}: \\[([^\\]]*)\\]`, "m"));
  if (!m) throw new Error(`agente ${agente} não encontrado no mapa`);
  return m[1]!
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

describe("mapa de ferramentas por agente", () => {
  it("RECEPCAO só direciona", () => {
    expect(toolsDe("RECEPCAO")).toEqual(["direcionarAtendimento"]);
  });

  it("VENDAS tem exatamente 5 tools e NÃO registra proposta", () => {
    const t = toolsDe("VENDAS");
    expect(t).toHaveLength(5);
    expect(t).toEqual([
      "buscarImoveisDisponiveis",
      "enviarFotosImovel",
      "registrarLead",
      "agendarVisitaTool",
      "solicitarFechamento",
    ]);
    expect(t).not.toContain("registrarProposta");
    expect(t).not.toContain("consultarMercado");
  });

  it("COMPRA_VENDA qualifica e entrega, sem fechar negócio", () => {
    const t = toolsDe("COMPRA_VENDA");
    expect(t).toEqual([
      "buscarImoveisVenda",
      "buscarEmpreendimentos",
      "enviarFotosImovel",
      "registrarInteresseCompra",
      "qualificarComprador",
      "registrarDocumentos",
      "enviarBookEmpreendimento",
      "agendarVisitaTool",
    ]);
    expect(t).not.toContain("registrarPropostaCompra");
    expect(t).not.toContain("consultarMercado");
  });

  it("a qualificação de financiamento é SÓ do agente de compra e venda", () => {
    // Empreendimento e financiamento são conversa de compra. Locação não pede
    // holerite nem extrato de FGTS.
    for (const agente of ["RECEPCAO", "VENDAS", "CAPTACAO", "ADMINISTRACAO", "AJUDA_CORRETOR"]) {
      expect(toolsDe(agente)).not.toContain("qualificarComprador");
      expect(toolsDe(agente)).not.toContain("registrarDocumentos");
      expect(toolsDe(agente)).not.toContain("buscarEmpreendimentos");
      expect(toolsDe(agente)).not.toContain("enviarBookEmpreendimento");
    }
  });

  it("consultar_mercado existe SÓ em CAPTACAO", () => {
    for (const agente of ["RECEPCAO", "VENDAS", "COMPRA_VENDA", "ADMINISTRACAO", "AJUDA_CORRETOR"]) {
      expect(toolsDe(agente)).not.toContain("consultarMercado");
    }
    expect(toolsDe("CAPTACAO")).toContain("consultarMercado");
  });

  it("CAPTACAO capta — não vende a carteira", () => {
    const t = toolsDe("CAPTACAO");
    expect(t).toEqual([
      "cadastrarProprietario",
      "cadastrarImovel",
      "cadastrarImovelVenda",
      "agendarAvaliacao",
      "consultarMercado",
    ]);
    expect(t).not.toContain("buscarImoveisDisponiveis");
  });

  it("ADMINISTRACAO atende os DOIS lados (as 3 do locatário + as 4 do proprietário)", () => {
    // As 4 últimas são a intermediação com o proprietário (M4), que é o que o
    // módulo Administração promete e antes não existia.
    expect(toolsDe("ADMINISTRACAO")).toEqual([
      "enviarSegundaVia",
      "abrirOcorrencia",
      "consultarPendencias",
      "consultarRepasse",
      "consultarSituacaoImovel",
      "aprovarOrcamento",
      "notificarProprietario",
    ]);
  });

  it("AJUDA_CORRETOR segue o mapa", () => {
    expect(toolsDe("AJUDA_CORRETOR")).toEqual([
      "buscarImoveisCorretor",
      "detalhesImovel",
      "enviarFotosImovel",
    ]);
  });
});

describe("economia de contexto do VENDAS", () => {
  it("saíram 2 ferramentas — cerca de 370 tokens a menos por chamada", () => {
    // O doc estima ~184 tokens por schema de ferramenta; VENDAS perdeu
    // registrar_proposta e consultar_mercado.
    const TOKENS_POR_TOOL = 184;
    const antes = 7; // buscar, fotos, lead, visita, proposta, fechamento, mercado
    const agora = toolsDe("VENDAS").length;
    expect(antes - agora).toBe(2);
    expect((antes - agora) * TOKENS_POR_TOOL).toBe(368);
  });
});

describe("destinos da recepção", () => {
  it("NAO_CONTRATADO existe como destino", () => {
    expect(fonte).toContain("NAO_CONTRATADO");
  });

  it("o enum de áreas é montado a partir dos agentes ativos", () => {
    // Não pode ser uma lista fixa: cliente sem módulo não pode receber o destino.
    expect(fonte).toContain("enum: areasDisponiveis");
    expect(fonte).toMatch(/const ativos = agentesAtivos\(ctx\.modulos, ctx\.addons\)/);
  });

  it("cliente de Recepção não tem VENDAS entre os agentes ativos", () => {
    expect(agentesAtivos(PRODUTOS.RECEPCAO.modulos)).not.toContain("VENDAS");
  });

  it("cliente sem add-on não tem CAPTACAO", () => {
    expect(agentesAtivos(PRODUTOS.COMERCIAL.modulos, PRODUTOS.COMERCIAL.addons)).not.toContain(
      "CAPTACAO"
    );
    expect(agentesAtivos(PRODUTOS.COMERCIAL.modulos, ["CAPTACAO"])).toContain("CAPTACAO");
  });
});

describe("prompts não prometem ferramenta que não existe mais", () => {
  const prompts = fonte.slice(fonte.indexOf("const PROMPTS"));

  it("VENDAS não diz que registra proposta", () => {
    const vendas = prompts.slice(prompts.indexOf("VENDAS: `"), prompts.indexOf("ADMINISTRACAO: `"));
    expect(vendas).not.toContain("registrar_proposta");
    expect(vendas).toContain("solicitar_fechamento");
  });

  it("a Recepção é instruída a não revelar o limite comercial", () => {
    const recepcao = prompts.slice(prompts.indexOf("RECEPCAO: `"), prompts.indexOf("CAPTACAO: `"));
    expect(recepcao).toContain("NAO_CONTRATADO");
    expect(recepcao).toMatch(/SEM mencionar plano, módulo/);
  });
});

describe("a IA não joga para um humano o que ela mesma atende", () => {
  const TODAS = ["CAPTACAO", "VENDAS", "COMPRA_VENDA", "ADMINISTRACAO", "NAO_CONTRATADO"];

  it("Minha Casa Minha Vida e empreendimento são COMPRA_VENDA, não humano", () => {
    // O caso real: "quero um Minha Casa Minha Vida" virava NAO_CONTRATADO e
    // caía no colo de alguém — sendo que a IA atende isso do começo ao fim.
    for (const pedido of [
      "quer um Minha Casa Minha Vida",
      "quer apartamento na planta",
      "perguntou de um lançamento da construtora",
      "quer saber sobre financiamento",
      "quer comprar um apartamento de 2 quartos",
      "interesse em empreendimento no Centro",
    ]) {
      expect(areaQueDeveriaAtender(undefined, pedido, TODAS)).toBe("COMPRA_VENDA");
    }
  });

  it("quando a própria IA diz qual área resolveria, e ela existe, é ela", () => {
    expect(areaQueDeveriaAtender("COMPRA_VENDA", "qualquer coisa", TODAS)).toBe("COMPRA_VENDA");
    expect(areaQueDeveriaAtender("ADMINISTRACAO", "2ª via de boleto", TODAS)).toBe("ADMINISTRACAO");
  });

  it("sem o módulo contratado, o encaminhamento ao humano continua valendo", () => {
    // Aqui NÃO é a IA fugindo: a imobiliária realmente não tem essa área.
    const semCompra = ["VENDAS", "ADMINISTRACAO", "NAO_CONTRATADO"];
    expect(areaQueDeveriaAtender(undefined, "quer comprar um apartamento", semCompra)).toBeNull();
    expect(areaQueDeveriaAtender("COMPRA_VENDA", "quer comprar", semCompra)).toBeNull();
  });

  it("assunto que é mesmo de humano continua indo para humano", () => {
    expect(areaQueDeveriaAtender(undefined, "quer propor uma parceria comercial", TODAS)).toBeNull();
    expect(areaQueDeveriaAtender(undefined, "reclamação grave sobre um corretor", TODAS)).toBeNull();
    expect(areaQueDeveriaAtender(undefined, undefined, TODAS)).toBeNull();
  });
});

// O print do WhatsApp: depois de "/reset", o cliente escreveu "Oi" e logo
// "Quero comprar uma casa mas tenho restrição no nome". A Carol respondeu com
// três bolhas — a saudação de triagem repetida, um papagaio do que ele acabou
// de escrever e uma pergunta inventada que não existe na escada. A causa era
// estrutural: `direcionar_atendimento` trocava a área no banco, mas o turno
// continuava escrevendo com o prompt da RECEPÇÃO, que não conhece o roteiro do
// destino. Estes testes travam as três correções no arquivo.
describe("o encaminhamento não deixa a recepção improvisar", () => {
  const prompts = fonte.slice(fonte.indexOf("const PROMPTS"));
  const recepcao = prompts.slice(prompts.indexOf("RECEPCAO: `"), prompts.indexOf("CAPTACAO: `"));

  it("a saudação de triagem é CONDICIONAL, não abertura obrigatória", () => {
    expect(recepcao).toMatch(/SAUDAÇÃO DE TRIAGEM É CONDICIONAL/);
    expect(recepcao).toMatch(/JÁ DISSE o que quer/);
  });

  it("depois de encaminhar, a recepção fica calada", () => {
    expect(recepcao).toMatch(/DEPOIS DE CHAMAR A FERRAMENTA, NÃO ESCREVA NADA/);
    expect(recepcao).toMatch(/NUNCA invente uma pergunta/);
  });

  it("o recibo da tool é seco — sem briefing que a recepção tente executar", () => {
    const tool = fonte.slice(fonte.indexOf("const direcionarAtendimento"));
    const recibo = tool.slice(0, tool.indexOf("const cadastrarProprietario"));
    expect(recibo).toContain("Não escreva nada.");
    // Um briefing aqui compete com o prompt do agente de destino.
    expect(recibo).not.toMatch(/Assuma as vendas/);
    expect(recibo).not.toMatch(/entenda o que procura e apresente/);
  });

  it("o turno REENTRA com o prompt do novo agente quando a área muda", () => {
    // Sem a reentrada, quem escreve a primeira mensagem da nova área ainda é a
    // recepção — sem a escada e sem as ferramentas dela.
    expect(fonte).toMatch(/umaPassadaDoAgente/);
    expect(fonte).toMatch(/trocouPara/);
    expect(fonte).toMatch(/for \(let passada = 0; passada < 2; passada\+\+\)/);
  });

  it("o texto escrito com o prompt errado é DESCARTADO, não enviado", () => {
    const laco = fonte.slice(fonte.indexOf("for (let passada = 0"));
    expect(laco.slice(0, 600)).toMatch(/if \(r\.trocouPara && passada === 0\)/);
  });

  it("a base proíbe papagaiar o cliente", () => {
    const base = fonte.slice(fonte.indexOf("const PROMPT_BASE"), fonte.indexOf("const PROMPTS"));
    expect(base).toMatch(/NÃO PAPAGAIE O CLIENTE/);
  });
});
