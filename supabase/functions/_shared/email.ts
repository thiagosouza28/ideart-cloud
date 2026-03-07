import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  emailFrom: string;
  senderName: string;
};

const isGmailHost = (host: string) => host.trim().toLowerCase() === "smtp.gmail.com";

const parseSmtpPort = () => {
  const rawPort = Deno.env.get("SMTP_PORT") ?? "587";
  const parsed = Number(rawPort);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 587;
};

const getSmtpConfig = (): SmtpConfig => {
  const host = (Deno.env.get("SMTP_HOST") ?? "").trim();
  const user = (Deno.env.get("SMTP_USER") ?? "").trim();
  const rawPass = Deno.env.get("SMTP_PASS") ?? "";
  const pass = isGmailHost(host) ? rawPass.replace(/\s+/g, "") : rawPass;

  return {
    host,
    port: parseSmtpPort(),
    user,
    pass,
    emailFrom: (Deno.env.get("EMAIL_FROM") ?? "").trim(),
    senderName: Deno.env.get("SMTP_SENDER_NAME") ?? "Ideart Cloud",
  };
};

const buildFrom = (cfg: SmtpConfig) => {
  const configured = cfg.emailFrom.trim();
  const senderName = cfg.senderName.trim() || "Ideart Cloud";

  if (!configured) {
    return `${senderName} <${cfg.user}>`;
  }

  // Keep as-is when it already follows "Name <email@domain>".
  if (configured.includes("<") && configured.includes(">")) {
    return configured;
  }

  return `${senderName} <${configured}>`;
};

const connectClient = async (cfg: SmtpConfig) => {
  const openConnection = async (client: SmtpClient, port: number, secure: boolean) => {
    if (secure) {
      await client.connectTLS({
        hostname: cfg.host,
        port,
        username: cfg.user,
        password: cfg.pass,
      });
      return;
    }

    await client.connect({
      hostname: cfg.host,
      port,
      username: cfg.user,
      password: cfg.pass,
    });
  };

  const client = new SmtpClient();

  try {
    await openConnection(client, cfg.port, cfg.port === 465);
    return client;
  } catch (primaryError) {
    try {
      await client.close();
    } catch {
      // ignore close errors
    }

    if (!isGmailHost(cfg.host) || cfg.port !== 587) {
      throw primaryError;
    }

    console.warn("SMTP connect on port 587 failed, retrying Gmail on port 465");

    const fallbackClient = new SmtpClient();
    try {
      await openConnection(fallbackClient, 465, true);
      return fallbackClient;
    } catch (fallbackError) {
      try {
        await fallbackClient.close();
      } catch {
        // ignore close errors
      }
      throw fallbackError;
    }
  }
};

export const sendSmtpEmail = async (payload: EmailPayload) => {
  const cfg = getSmtpConfig();
  if (!cfg.host || !cfg.user || !cfg.pass) {
    console.warn("SMTP is not configured. Skipping e-mail send.");
    return false;
  }

  if (!(Deno as { writeAll?: unknown }).writeAll) {
    (
      Deno as {
        writeAll?: (
          writer: { write: (p: Uint8Array) => Promise<number> },
          data: Uint8Array,
        ) => Promise<void>;
      }
    ).writeAll =
      async (writer, data) => {
        let offset = 0;
        while (offset < data.length) {
          const written = await writer.write(data.subarray(offset));
          if (!written) break;
          offset += written;
        }
      };
  }

  let client: SmtpClient | null = null;
  try {
    const from = buildFrom(cfg);
    client = await connectClient(cfg);

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
      await client?.close();
    } catch {
      // ignore close errors
    }
  }
};
