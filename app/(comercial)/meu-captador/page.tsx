import MeuCaptador from "@/components/proto/meu-captador";

export const dynamic = "force-dynamic";

// Tela de gestão comercial. Os dados vivem em memória (lib/proto) — é protótipo
// navegável, não CRUD: o objetivo é validar a operação antes de ligar no banco.
export default function Pagina() {
  return <MeuCaptador />;
}
