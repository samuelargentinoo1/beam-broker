// Leitor de OGG/Opus — o formato em que o WhatsApp manda nota de voz.
//
// Existe porque a MiniMax aceita só mp3, m4a e wav para clonagem de voz, e a
// amostra natural que alguém tem à mão é justamente uma nota de voz do
// WhatsApp. Sem conversão, a API recusa o arquivo.
//
// Aqui é só o CONTÊINER: separar as páginas OGG e extrair os pacotes Opus de
// dentro. Quem decodifica os pacotes é o opus-decoder (WebAssembly). Fazer o
// demux à mão em vez de usar uma biblioteca pronta economiza 10 MB de bundle
// numa rota que roda uma vez por imobiliária, na configuração.
//
// Formato da página (RFC 3533): "OggS", versão, flags, granulepos, serial,
// sequência, checksum, número de segmentos, tabela de tamanhos, e os dados.
// Um pacote pode atravessar páginas: segmento de 255 bytes significa
// "continua no próximo".

export type OpusOgg = {
  pacotes: Uint8Array[];
  canais: number;
  // A taxa ORIGINAL da gravação, informada no cabeçalho. O Opus sempre decodifica
  // em 48 kHz — este campo é só informativo.
  taxaOriginal: number;
  preSkip: number;
};

const MARCA = 0x4f676753; // "OggS"

export function lerOggOpus(dados: Buffer): OpusOgg {
  const pacotes: Uint8Array[] = [];
  let parcial: number[] = [];
  let canais = 1;
  let taxaOriginal = 48000;
  let preSkip = 0;
  let cabecalhosVistos = 0;

  let p = 0;
  while (p + 27 <= dados.length) {
    if (dados.readUInt32BE(p) !== MARCA) {
      // Fora de sincronia: procura a próxima página em vez de desistir. Arquivo
      // de WhatsApp às vezes traz lixo no começo.
      const proxima = dados.indexOf("OggS", p + 1, "latin1");
      if (proxima < 0) break;
      p = proxima;
      continue;
    }

    const numSegmentos = dados[p + 26]!;
    const tabela = p + 27;
    const corpo = tabela + numSegmentos;
    if (corpo > dados.length) break;

    let deslocamento = corpo;
    for (let s = 0; s < numSegmentos; s++) {
      const tamanho = dados[tabela + s]!;
      const fim = Math.min(deslocamento + tamanho, dados.length);
      for (let i = deslocamento; i < fim; i++) parcial.push(dados[i]!);
      deslocamento = fim;

      // Segmento menor que 255 fecha o pacote; 255 significa "continua".
      if (tamanho < 255) {
        const pacote = Uint8Array.from(parcial);
        parcial = [];
        if (pacote.length === 0) continue;

        // As duas primeiras páginas são cabeçalhos, não áudio: OpusHead traz
        // canais, pré-skip e taxa original; OpusTags traz metadados.
        if (cabecalhosVistos < 2) {
          if (pacote.length >= 19 && Buffer.from(pacote.subarray(0, 8)).toString() === "OpusHead") {
            canais = pacote[9]!;
            preSkip = pacote[10]! | (pacote[11]! << 8);
            taxaOriginal =
              pacote[12]! | (pacote[13]! << 8) | (pacote[14]! << 16) | (pacote[15]! << 24);
            cabecalhosVistos++;
            continue;
          }
          if (pacote.length >= 8 && Buffer.from(pacote.subarray(0, 8)).toString() === "OpusTags") {
            cabecalhosVistos++;
            continue;
          }
        }
        pacotes.push(pacote);
      }
    }
    p = deslocamento;
  }

  if (pacotes.length === 0) throw new Error("Não encontrei áudio Opus dentro do arquivo OGG.");
  return { pacotes, canais, taxaOriginal, preSkip };
}
