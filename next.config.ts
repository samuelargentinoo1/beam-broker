import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // opus-decoder é WebAssembly e traz um carregador de worker com import
  // dinâmico que o empacotador não consegue resolver. Ele só roda no servidor
  // (converter a nota de voz do WhatsApp antes de clonar), então fica FORA do
  // bundle e é carregado pelo Node em tempo de execução.
  serverExternalPackages: ["opus-decoder"],
  // Server Actions (como o "Salvar" das Configurações) são bloqueadas quando a
  // origem não bate com o host — o que acontece atrás de domínio próprio/proxy
  // (ex.: adm.beambroker.com.br via Vercel/Cloudflare). Liberamos as origens
  // conhecidas. APP_URL cobre o domínio configurado no deploy.
  experimental: {
    serverActions: {
      allowedOrigins: [
        "adm.beambroker.com.br",
        "*.vercel.app",
        ...(process.env.APP_URL
          ? [process.env.APP_URL.replace(/^https?:\/\//, "").replace(/\/$/, "")]
          : []),
      ],
      // O padrão do Next é 1 MB — o que estoura ao enviar várias fotos no
      // cadastro do imóvel. As fotos são comprimidas no navegador antes de subir
      // (ver components/upload-fotos), então este teto folgado cobre até 20 fotos.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
