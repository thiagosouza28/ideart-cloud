import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

  const getSmtpConfig = () => {
  return {
    host: Deno.env.get("SMTP_HOST") ?? "",
    port: Number(Deno.env.get("SMTP_PORT") ?? "465"),
    user: Deno.env.get("SMTP_USER") ?? "",
    pass: Deno.env.get("SMTP_PASS") ?? "",
    emailFrom: Deno.env.get("EMAIL_FROM") ?? "",
    senderName: Deno.env.get("SMTP_SENDER_NAME") ?? "IdeartCloud",
    senderEmail: "suporte@ideartcloud.com.br",
  };
};

export const sendSmtpEmail = async (payload: EmailPayload) => {
  const cfg = getSmtpConfig();
  if (!cfg.host || !cfg.user || !cfg.pass) {
    console.warn("SMTP not configured. Skipping email.");
    return false;
  }

  const client = new SmtpClient();
  try {
    const supportEmail = "suporte@ideartcloud.com.br";
    const from = cfg.emailFrom.trim().length
      ? cfg.emailFrom.trim()
      : `${cfg.senderName} <${supportEmail}>`;
    if (cfg.port === 587) {
      await client.connect({
        hostname: cfg.host,
        port: cfg.port,
        username: cfg.user,
        password: cfg.pass,
      });
    } else {
      await client.connectTLS({
        hostname: cfg.host,
        port: cfg.port,
        username: cfg.user,
        password: cfg.pass,
      });
    }

    await client.send({
      from,
      to: payload.to,
      subject: payload.subject,
      content: payload.text,
      html: payload.html,
    });
    return true;
  } catch (error) {
    console.error("SMTP send failed", error);
    return false;
  } finally {
    try {
      await client.close();
    } catch {
      // ignore close errors
    }
  }
};
