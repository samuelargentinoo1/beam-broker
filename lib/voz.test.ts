// A fala da IA passou do ElevenLabs para a MiniMax. Os dois provedores falam
// linguagens diferentes de expressividade: o ElevenLabs lia tags no meio do
// texto, a MiniMax tem um parâmetro `emotion`. Estes testes travam a tradução.
import { describe, expect, it } from "vitest";

import {
  audioAmigavel,
  corpoMinimax,
  emocaoDoTexto,
  limparTagsAudio,
  ordenarVozes,
  escolherVozPadrao,
  corpoGetVoice,
  deveMandarAudio,
  tagsParaFala,
  grupoDaChave,
  explicarErro,
} from "@/lib/voz";

describe("a tag deixa de ser lida e passa a escolher a emoção", () => {
  it("a tag NUNCA vai no texto enviado — a MiniMax leria em voz alta", () => {
    const corpo = corpoMinimax("Achei um que combina! [laughs] Quer ver?");
    expect(corpo.text).not.toContain("[laughs]");
    // Minúscula no início porque o marcador de fala pode abrir a frase
    // ("Então, achei um que combina!") — o conteúdo é o que precisa sobreviver.
    expect(corpo.text.toLowerCase()).toContain("achei um que combina!");
  });

  it("cada tag vira uma emoção da voz", () => {
    expect(emocaoDoTexto("Achei! [laughs] Olha só")).toBe("happy");
    expect(emocaoDoTexto("[excited] Saiu a aprovação")).toBe("happy");
    expect(emocaoDoTexto("[sighs] esse já foi vendido")).toBe("sad");
    expect(emocaoDoTexto("[sarcastic] claro que sim")).toBe("neutral");
  });

  it("sem tag, a voz fica neutra em vez de inventar emoção", () => {
    expect(emocaoDoTexto("Tem sim. Costuma ser 3 aluguéis de depósito.")).toBe("neutral");
  });

  it("código entre colchetes não é confundido com tag", () => {
    // "[AP-0001]" tem maiúscula e número: limparTagsAudio preserva.
    expect(limparTagsAudio("O [AP-0001] está livre")).toContain("[AP-0001]");
    expect(emocaoDoTexto("O [AP-0001] está livre")).toBe("neutral");
  });
});

describe("o corpo que vai para a MiniMax", () => {
  it("pede PCM mono e força português", () => {
    // PCM e não MP3: com amostras cruas dá para mixar a sala e o caráter de
    // microfone sem precisar decodificar (o que exigiria ffmpeg). O MP3 é
    // gerado no fim, por lib/mp3.ts.
    const corpo = corpoMinimax("Oi, aqui é a Carol.");
    expect(corpo.audio_setting.format).toBe("pcm");
    expect(corpo.audio_setting.channel).toBe(1);
    expect(corpo.language_boost).toBe("Portuguese");
    // Não streaming: precisamos do arquivo inteiro para mandar como nota de voz.
    expect(corpo.stream).toBe(false);
  });

  it("a taxa de amostragem é uma das aceitas pela MiniMax", () => {
    // Os aceitos são 16000, 22050, 32000, 44100 e 48000. Um valor fora da lista
    // (esteve 24000 aqui) devolve 2013 e derruba o áudio inteiro, calado.
    expect([16000, 22050, 32000, 44100, 48000]).toContain(
      corpoMinimax("oi").audio_setting.sample_rate
    );
  });

  it("usa a voz da imobiliária, e NÃO inventa uma quando não tem", () => {
    // O voice_id de sistema da MiniMax tem formato próprio. Um ID chutado é
    // recusado com HTTP 200 — o áudio some sem erro nenhum. Melhor sair vazio e
    // a tela dizer "escolha uma voz" do que fingir um padrão que não existe.
    expect(corpoMinimax("oi", "Voz_Escolhida").voice_setting.voice_id).toBe("Voz_Escolhida");
    expect(corpoMinimax("oi", "  ").voice_setting.voice_id).toBe("");
    expect(corpoMinimax("oi", null).voice_setting.voice_id).toBe("");
  });

  it("a velocidade e a emoção vêm do QUE a frase diz, não de uma constante", () => {
    // Antes era speed 0.95 fixo para tudo. Ritmo idêntico em toda mensagem é a
    // assinatura sonora de robô — e 0.95 é ritmo de locução, não de conversa.
    const pergunta = corpoMinimax("Quer ver hoje?").voice_setting;
    const ruim = corpoMinimax("Infelizmente esse já foi vendido.").voice_setting;
    expect(pergunta.speed).toBeGreaterThan(ruim.speed);
    expect(ruim.emotion).toBe("sad");
  });

  it("o texto chega FALÁVEL na MiniMax, não como foi escrito na tela", () => {
    const corpo = corpoMinimax("Sai por R$ 189.900,00 com 2 vagas");
    expect(corpo.text).toContain("cento e oitenta e nove mil e novecentos reais");
    expect(corpo.text).toContain("duas vagas");
    expect(corpo.text).not.toMatch(/R\$|\d/);
  });
});

describe("o que NUNCA vira áudio", () => {
  it("PIX, link e textão continuam em texto", () => {
    expect(audioAmigavel("Segue o PIX: 00020126580014BR.GOV.BCB.PIX0136 1234 5678 9012 3456")).toBe(
      false
    );
    expect(audioAmigavel("Assina aqui: https://exemplo.test/abc")).toBe(false);
    expect(audioAmigavel("a".repeat(400))).toBe(false);
  });

  it("frase curta e conversada pode virar voz", () => {
    expect(audioAmigavel("Tem sim. Costuma ser 3 aluguéis de depósito.")).toBe(true);
  });
});

// O catálogo da MiniMax vem com centenas de vozes, quase todas de outros
// idiomas. Sem ordenar, quem configura rola uma lista gigante procurando as de
// português — e no ERP só português interessa.
describe("catálogo de vozes: português primeiro", () => {
  const catalogo = [
    { id: "Chinese (Mandarin)_News_Anchor", nome: "News Anchor" },
    { id: "English_Confident_Woman", nome: "Confident Woman" },
    { id: "Portuguese (Brazilian)_Calm_Woman", nome: "Calm Woman" },
    { id: "Japanese_Gentle_Man", nome: "Gentle Man" },
    { id: "Portuguese (Brazilian)_Warm_Man", nome: "Warm Man" },
  ];

  it("sobe as brasileiras para o topo, sem perder as outras", () => {
    const ordenadas = ordenarVozes(catalogo);
    expect(ordenadas.slice(0, 2).map((v) => v.id)).toEqual([
      "Portuguese (Brazilian)_Calm_Woman",
      "Portuguese (Brazilian)_Warm_Man",
    ]);
    expect(ordenadas).toHaveLength(catalogo.length);
  });

  it("reconhece o português pelo nome ou pela descrição, não só pelo id", () => {
    const ordenadas = ordenarVozes([
      { id: "voz_002", nome: "Voz A" },
      { id: "voz_001", nome: "Ana", detalhe: "português do Brasil" },
    ]);
    expect(ordenadas[0]!.id).toBe("voz_001");
  });

  it("catálogo sem nenhuma portuguesa não quebra nem reordena à toa", () => {
    const so = [{ id: "English_A", nome: "A" }, { id: "English_B", nome: "B" }];
    expect(ordenarVozes(so).map((v) => v.id)).toEqual(["English_A", "English_B"]);
  });
});

// "MiniMax recusou (1004): token not match group" sozinho não diz a ninguém
// qual dos dois campos está errado. A chave é um JWT e carrega o GroupID
// dentro — dá para responder isso na hora.
describe("erro 1004: a chave e o GroupId não batem", () => {
  // JWT de mentira: só a carga importa, a assinatura nunca é verificada aqui.
  function chaveFalsa(carga: Record<string, unknown>): string {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    return `${b64({ alg: "HS256" })}.${b64(carga)}.assinatura`;
  }

  it("lê o GroupID de dentro da chave", () => {
    expect(grupoDaChave(chaveFalsa({ GroupID: "1948", GroupName: "Imobiliaria" }))).toBe("1948");
    expect(grupoDaChave(chaveFalsa({ GroupID: 1948 }))).toBe("1948");
    expect(grupoDaChave(chaveFalsa({ group_id: "77" }))).toBe("77");
  });

  it("chave em outro formato não quebra — só não diagnostica", () => {
    expect(grupoDaChave("sk-abc123")).toBeNull();
    expect(grupoDaChave("")).toBeNull();
    expect(grupoDaChave("a.b.c")).toBeNull(); // três partes, mas carga ilegível
  });

  it("quando os dois grupos divergem, diz QUAL é qual", () => {
    const m = explicarErro(1004, "token not match group", "999", "1948");
    expect(m).toContain("1948");
    expect(m).toContain("999");
    expect(m).toContain("deixe em branco");
  });

  it("sem divergência, manda conferir a plataforma (global x minimaxi)", () => {
    expect(explicarErro(1004, "token not match group", "1948", "1948")).toContain(
      "platform.minimax.io"
    );
  });

  it("chave inutilizável manda gerar outra, em vez de repetir o código", () => {
    // "token is unusable" é o que a MiniMax devolve quando o que está salvo nem
    // é uma chave dela — o caso de o navegador ter gravado a senha do usuário.
    const m = explicarErro(1004, "token is unusable", null, null);
    expect(m).toContain("Create new API key");
    expect(m).toContain("eyJ");
  });

  it("quando a MiniMax pede o grupo e não temos nenhum, aponta o campo UID", () => {
    // A chave "sk-api-..." não carrega grupo dentro. Em vez de exigir o GroupId
    // por precaução, o sistema tenta sem — e só pede quando a MiniMax pede.
    const m = explicarErro(1004, "invalid group", null, null);
    expect(m).toContain("UID");
    expect(m).toContain("Your Profile");
  });

  it("2013 é erro de INTEGRAÇÃO, e a mensagem diz para não mexer na chave", () => {
    // 2013 só acontece depois de a autenticação passar. Sem dizer isso, o erro
    // genérico manda caçar credencial e crédito que estão certos — foi
    // exatamente o que aconteceu quando o voice_type ia errado.
    const m = explicarErro(2013, "invalid params", null, null);
    expect(m).toContain("erro de integração");
    expect(m).toContain("não adianta mexer");
  });

  it("saldo e voz têm recado próprio; o resto passa cru", () => {
    expect(explicarErro(1008, "insufficient balance", null, null)).toContain("sem saldo");
    expect(explicarErro(2013, "invalid voice_id", null, null)).toContain("não reconheceu a voz");
    expect(explicarErro(9999, "algo novo", null, null)).toContain("algo novo");
  });
});

// Ninguém escolhe voz na tela. O sistema pergunta à conta MiniMax quais existem
// e usa a padrão — foi o voice_id escolhido à mão que gerou o erro que a
// MiniMax recusa sem explicar.
describe("a voz padrão sai da conta, não de um palpite", () => {
  it("prefere uma voz feminina em português — é a Carol", () => {
    const escolhida = escolherVozPadrao([
      { id: "English_Confident_Woman", nome: "Confident Woman" },
      { id: "Portuguese (Brazilian)_Warm_Man", nome: "Warm Man" },
      { id: "Portuguese (Brazilian)_Calm_Woman", nome: "Calm Woman" },
    ]);
    expect(escolhida?.id).toBe("Portuguese (Brazilian)_Calm_Woman");
  });

  it("sem feminina em português, fica com a primeira portuguesa", () => {
    const escolhida = escolherVozPadrao([
      { id: "English_A_Woman", nome: "A" },
      { id: "Portuguese (Brazilian)_Warm_Man", nome: "Warm Man" },
    ]);
    expect(escolhida?.id).toBe("Portuguese (Brazilian)_Warm_Man");
  });

  it("sem portuguesa nenhuma, ainda escolhe algo em vez de falhar", () => {
    expect(escolherVozPadrao([{ id: "English_A", nome: "A" }])?.id).toBe("English_A");
  });

  it("catálogo vazio devolve null — e NÃO um id inventado", () => {
    expect(escolherVozPadrao([])).toBeNull();
  });
});

// O corpo do get_voice ia com `voice_type: "system_voice"` — que é o nome do
// campo NA RESPOSTA, não um valor aceito na requisição. A MiniMax devolvia
// "2013 invalid params" e a lista de vozes nunca vinha. Passou despercebido
// porque só o corpo da FALA tinha teste; o do catálogo, não.
describe("o corpo do get_voice", () => {
  const ACEITOS = ["all", "system", "voice_cloning", "voice_generation", "music_generation"];

  it("manda um voice_type que a MiniMax aceita", () => {
    expect(ACEITOS).toContain(corpoGetVoice().voice_type);
  });

  it("NUNCA manda \"system_voice\" — esse é campo de resposta", () => {
    expect(corpoGetVoice().voice_type).not.toBe("system_voice");
  });
});

// A "% das respostas em áudio" das Configurações vivia solta dentro do webhook,
// sem nenhum teste: ninguém sabia se o número configurado era respeitado. Aqui
// a frequência é MEDIDA.
describe("a frequência configurada é respeitada", () => {
  const CURTO = "Tem sim, pode vir ver quando quiser.";
  // Horário fixo dentro da janela: sem isto o teste passaria de dia e falharia
  // de madrugada, que é o pior tipo de teste que existe.
  const MEIO_DIA = new Date(Date.UTC(2026, 6, 28, 15, 0, 0)); // 12h em São Paulo

  // Sorteio determinístico e uniforme: 0.00, 0.01, ... 0.99. Serve para contar
  // exatamente quantas de 100 respostas virariam áudio.
  function medir(pct: number, texto = CURTO): number {
    let i = 0;
    const sorteio = () => (i++ % 100) / 100;
    let audios = 0;
    for (let n = 0; n < 100; n++) {
      if (deveMandarAudio({ pct, texto, temChave: true, sorteio, agora: MEIO_DIA })) audios++;
    }
    return audios;
  }

  it("40 configurado = 40 em cada 100 respostas", () => {
    expect(medir(40)).toBe(40);
  });

  it("acompanha o valor escolhido, seja ele qual for", () => {
    expect(medir(10)).toBe(10);
    expect(medir(80)).toBe(80);
    expect(medir(100)).toBe(100);
  });

  it("zero DESLIGA de verdade — sem áudio nenhum", () => {
    // `pct ?? 40` e não `pct || 40`: com `||`, o zero viraria 40 e o
    // desligamento não funcionaria.
    expect(medir(0)).toBe(0);
  });

  it("imobiliária sem o campo preenchido cai no padrão de 40", () => {
    const base = { pct: null, texto: CURTO, temChave: true, agora: MEIO_DIA };
    expect(deveMandarAudio({ ...base, sorteio: () => 0.3 })).toBe(true);
    expect(deveMandarAudio({ ...base, sorteio: () => 0.5 })).toBe(false);
  });

  it("sem chave da MiniMax, nunca sai áudio — mesmo com 100%", () => {
    expect(deveMandarAudio({ pct: 100, texto: CURTO, temChave: false, agora: MEIO_DIA })).toBe(false);
  });

  it("conversa em modo só-texto ignora a frequência", () => {
    expect(
      deveMandarAudio({ pct: 100, texto: CURTO, temChave: true, soTexto: true, agora: MEIO_DIA })
    ).toBe(false);
  });

  it("o percentual é TETO, não taxa: PIX, link e textão nunca viram áudio", () => {
    // Mesmo com 100% configurado, esses saem em texto. Quem olhar o número na
    // tela precisa saber que a taxa observada fica ABAIXO dele.
    expect(medir(100, "Segue o link: https://exemplo.test/abc")).toBe(0);
    expect(medir(100, "a".repeat(400))).toBe(0);
  });
});

// O áudio parou de sair na conversa enquanto o ▶ da tela continuava
// funcionando. A diferença: o preview NÃO passa voice_id (o sistema descobre a
// padrão da conta) e o webhook passava um voice_id guardado no iasConfig — de
// quando existia um campo de voz por agente, cujo placeholder chegava a sugerir
// um ID no formato do ElevenLabs. ID inválido a MiniMax recusa em silêncio.
describe("a conversa usa a MESMA voz que o preview da tela", () => {
  it("sem voz configurada, o corpo sai sem voice_id para o sistema resolver", () => {
    expect(corpoMinimax("oi", null).voice_setting.voice_id).toBe("");
    expect(corpoMinimax("oi", undefined).voice_setting.voice_id).toBe("");
  });

  it("não existe mais voz por agente — a função que a lia foi removida", async () => {
    const iaConfig = await import("@/lib/ia-config");
    expect("vozDaIA" in iaConfig).toBe(false);
  });
});

// O 2.8 suporta interjeição NATIVAMENTE, com sintaxe de PARÊNTESES —
// "(laughs)", não "[laughs]". A família 02 lia a tag em voz alta, e por isso
// tudo era removido. A lista é allowlist: tag fora dela volta a ser soletrada.
describe("tags de interjeição", () => {
  it("no 2.8, a tag suportada vira som — e muda de colchete para parêntese", () => {
    expect(tagsParaFala("Achei! [laughs] Quer ver?", "speech-2.8-hd")).toBe(
      "Achei! (laughs) Quer ver?"
    );
    expect(tagsParaFala("[sighs] esse já foi", "speech-2.8-hd")).toBe("(sighs) esse já foi");
  });

  it("tag FORA da allowlist é removida, não repassada", () => {
    // Tag não suportada volta a ser lida em voz alta. Na dúvida, remove.
    expect(tagsParaFala("[sarcastic] claro", "speech-2.8-hd")).toBe("claro");
    expect(tagsParaFala("[dançando] oi", "speech-2.8-hd")).toBe("oi");
  });

  it("modelo antigo continua sem tag nenhuma", () => {
    expect(tagsParaFala("Achei! [laughs] Quer ver?", "speech-02-hd")).toBe("Achei! Quer ver?");
  });

  it("código de imóvel não é confundido com tag", () => {
    expect(tagsParaFala("O [AP-0001] está livre", "speech-2.8-hd")).toContain("[AP-0001]");
  });

  it("o texto EXIBIDO nunca tem tag, em modelo nenhum", () => {
    expect(limparTagsAudio("Achei! [laughs] Quer ver?")).toBe("Achei! Quer ver?");
  });

  it("a interjeição sobrevive ao pipeline de fala", () => {
    // respiracao() transforma parêntese em vírgula — mas só quando tem FRASE
    // dentro. Parêntese de uma palavra é interjeição e fica.
    const corpo = corpoMinimax("Achei um que combina! [laughs] Quer ver?");
    expect(corpo.text).toContain("(laughs)");
  });
});

describe("a voz padrão foge de locutor", () => {
  it("prefere conversacional a narrator/anchor/executive", () => {
    const escolhida = escolherVozPadrao([
      { id: "Portuguese (Brazilian)_News_Anchor_Female", nome: "News Anchor" },
      { id: "Portuguese (Brazilian)_Calm_Woman", nome: "Calm Woman" },
    ]);
    // Voz de locução é a mais bonita do catálogo e a pior para atendimento.
    expect(escolhida?.id).toBe("Portuguese (Brazilian)_Calm_Woman");
  });

  it("descarta português de Portugal", () => {
    const escolhida = escolherVozPadrao([
      { id: "Portuguese (Portugal)_Woman", nome: "PT-PT" },
      { id: "Portuguese (Brazilian)_Woman", nome: "PT-BR" },
    ]);
    // PT-PT se entrega na primeira sílaba para um cliente daqui.
    expect(escolhida?.id).toBe("Portuguese (Brazilian)_Woman");
  });

  it("se SÓ houver voz de locução, usa mesmo assim — melhor que voz nenhuma", () => {
    const so = [{ id: "Portuguese (Brazilian)_News_Anchor", nome: "Anchor" }];
    expect(escolherVozPadrao(so)?.id).toBe("Portuguese (Brazilian)_News_Anchor");
  });
});
