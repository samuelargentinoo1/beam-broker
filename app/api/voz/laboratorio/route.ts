import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessao } from "@/lib/sessao";
import { TAXA_AUDIO, gerarPcmCru, listarVozes } from "@/lib/voz";
import { type Camadas, produzir } from "@/lib/audio-producao";
import { pcmParaMp3 } from "@/lib/mp3";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Laboratório de voz. Ajustar ruído de fundo sem ouvir lado a lado é chute — e
// a diferença entre "tem uma sala atrás" e "que barulho é esse" são 4 dB.
//
// Faz duas coisas:
//   /api/voz/laboratorio            → as quatro versões da MESMA voz crua:
//                                     sem nada, só microfone, só ambiente,
//                                     completa. É o que mostra o que cada
//                                     camada faz.
//   /api/voz/laboratorio?vozes=1    → a mesma frase em cada voz brasileira da
//                                     conta, já produzida. É como se escolhe a
//                                     voz para fixar em MINIMAX_VOZ_PADRAO.
//
// A frase é de ATENDIMENTO REAL, não de demonstração: voz que soa bem lendo
// "the quick brown fox" pode soar péssima falando de metragem e financiamento.
const FRASE =
  "Olha, esse do Bosque tem dois quartos e uma vaga, fica bem pertinho do centro. " +
  "Sai por cento e oitenta e nove mil, e a entrada dá pra parcelar. Quer que eu te mande o book?";

const VERSOES: { chave: string; rotulo: string; camadas: Camadas }[] = [
  {
    chave: "crua",
    rotulo: "1. Crua — como a MiniMax entrega",
    camadas: { ambiente: false, microfone: false, respiro: false },
  },
  {
    chave: "microfone",
    rotulo: "2. Só microfone de celular",
    camadas: { ambiente: false, microfone: true, respiro: false },
  },
  {
    chave: "ambiente",
    rotulo: "3. Só a sala atrás",
    camadas: { ambiente: true, microfone: false, respiro: true },
  },
  { chave: "completa", rotulo: "4. Completa — o que vai para o cliente", camadas: {} },
];

function pagina(itens: { rotulo: string; src: string }[], titulo: string, nota: string): string {
  const blocos = itens
    .map(
      (i) => `<figure>
      <figcaption>${i.rotulo}</figcaption>
      <audio controls preload="none" src="${i.src}"></audio>
    </figure>`
    )
    .join("\n");
  return `<!doctype html><meta charset="utf-8"><title>${titulo}</title>
<style>
  body{font:15px/1.6 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#111}
  h1{font-size:20px;margin-bottom:4px} p.nota{color:#666;font-size:13px;margin-top:0}
  figure{margin:0 0 22px} figcaption{font-size:13px;color:#374151;margin-bottom:6px}
  audio{width:100%}
</style>
<h1>${titulo}</h1><p class="nota">${nota}</p>
${blocos}`;
}

export async function GET(req: NextRequest) {
  const sessao = await getSessao();
  if (!sessao) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const imob = await prisma.imobiliaria.findUnique({
    where: { id: sessao.imobiliaria.id },
    select: { minimaxApiKey: true, minimaxGroupId: true },
  });
  if (!imob?.minimaxApiKey)
    return NextResponse.json({ erro: "Salve a API Key da MiniMax primeiro." }, { status: 400 });

  const vozes = await listarVozes(imob.minimaxApiKey, imob.minimaxGroupId);
  if (!vozes.ok) return NextResponse.json({ erro: vozes.erro }, { status: 502 });

  const emMp3 = (pcm: Buffer, camadas: Camadas, semente: string) =>
    `data:audio/mpeg;base64,${pcmParaMp3(produzir(pcm, TAXA_AUDIO, semente, camadas).pcm, TAXA_AUDIO).toString("base64")}`;

  // ── Comparar VOZES ────────────────────────────────────────────────────────
  if (req.nextUrl.searchParams.get("vozes")) {
    const brasileiras = vozes.dados
      .filter((v) => /portug|brazil|brasil/i.test(`${v.id} ${v.nome}`))
      .slice(0, 8); // teto: cada voz é uma chamada, e a rota tem 60s
    if (brasileiras.length === 0)
      return NextResponse.json(
        { erro: "Nenhuma voz em português no catálogo desta conta." },
        { status: 404 }
      );

    const itens: { rotulo: string; src: string }[] = [];
    for (const v of brasileiras) {
      const pcm = await gerarPcmCru(FRASE, imob.minimaxApiKey, v.id, imob.minimaxGroupId);
      if (!pcm.ok) {
        itens.push({ rotulo: `${v.nome} — falhou: ${pcm.erro}`, src: "" });
        continue;
      }
      itens.push({ rotulo: `${v.nome} · ${v.id}`, src: emMp3(pcm.dados, {}, FRASE) });
    }
    return new NextResponse(
      pagina(
        itens,
        "Vozes da conta",
        "A mesma frase de atendimento em cada voz brasileira, já com a produção aplicada. " +
          "Escolha ouvindo e fixe o ID em MINIMAX_VOZ_PADRAO."
      ),
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    );
  }

  // ── Comparar CAMADAS ──────────────────────────────────────────────────────
  // UMA chamada à MiniMax, quatro tratamentos do mesmo PCM: qualquer diferença
  // que se ouvir é da produção, não de outra geração da voz.
  const voz = req.nextUrl.searchParams.get("voiceId") || vozes.dados[0]?.id;
  if (!voz) return NextResponse.json({ erro: "Nenhuma voz no catálogo." }, { status: 404 });

  const pcm = await gerarPcmCru(FRASE, imob.minimaxApiKey, voz, imob.minimaxGroupId);
  if (!pcm.ok) return NextResponse.json({ erro: pcm.erro }, { status: 502 });

  const itens = VERSOES.map((v) => ({
    rotulo: v.rotulo,
    src: emMp3(pcm.dados, v.camadas, FRASE),
  }));

  return new NextResponse(
    pagina(
      itens,
      "Camadas da produção sonora",
      `Voz: ${voz}. A mesma gravação passando por cada camada — ouça de fone, na ordem. ` +
        "Se a 4 soar amador, o ruído está alto: baixe AJUSTES em lib/audio-producao.ts."
    ),
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}
