// Envio de e-mail transacional (verificação de conta, redefinição de senha).
// Provedor: Resend (RESEND_API_KEY + EMAIL_FROM). Sem provedor configurado, o
// e-mail NÃO é enviado — logamos e devolvemos false. Os fluxos que dependem de
// e-mail só ENFORÇAM quando emailConfigurado() é true (senão nada trava).

export function emailConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function enviarEmail(opts: {
  para: string;
  assunto: string;
  html: string;
  texto?: string;
}): Promise<boolean> {
  if (!emailConfigurado()) {
    console.warn(
      `[email não configurado] para=${opts.para} assunto="${opts.assunto}" — não enviado ` +
        `(defina RESEND_API_KEY e EMAIL_FROM).`
    );
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: opts.para,
        subject: opts.assunto,
        html: opts.html,
        text: opts.texto,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error("Resend falhou:", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error("enviarEmail:", e);
    return false;
  }
}
