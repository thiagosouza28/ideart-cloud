import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { sendSmtpEmail } from "../_shared/email.ts";

export const config = { verify_jwt: false };

type AccountType = "store" | "customer";

const allowedOrigins = new Set([
  "http://192.168.0.221:8080",
  "http://localhost:8080",
]);

const getAppOrigin = () => {
  const appUrl = Deno.env.get("APP_PUBLIC_URL");
  if (!appUrl) return null;

  try {
    return new URL(appUrl).origin;
  } catch {
    return null;
  }
};

const appOrigin = getAppOrigin();
if (appOrigin) {
  allowedOrigins.add(appOrigin);
}

const getCorsHeaders = (origin: string | null) => {
  const allowOrigin = origin && allowedOrigins.has(origin) ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
};

const jsonResponse = (headers: HeadersInit, status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });

const normalizeAppUrl = () => {
  const appUrl = Deno.env.get("APP_PUBLIC_URL")?.trim();
  if (!appUrl) return "https://ideartcloud.com.br";

  try {
    return new URL(appUrl).toString();
  } catch {
    return "https://ideartcloud.com.br";
  }
};

const getDefaultRecoveryPath = (accountType: AccountType) =>
  accountType === "customer" ? "/minha-conta/alterar-senha" : "/alterar-senha";

const resolveRedirectTo = (rawRedirectTo: string | undefined, accountType: AccountType) => {
  const fallback = new URL(getDefaultRecoveryPath(accountType), normalizeAppUrl()).toString();

  const envRedirectTo = Deno.env.get("PASSWORD_RESET_REDIRECT_URL")?.trim();
  const candidate = rawRedirectTo?.trim() || envRedirectTo;
  if (!candidate) return fallback;

  try {
    const parsed = new URL(candidate);
    return parsed.toString();
  } catch {
    return fallback;
  }
};

const getActionLink = (linkData: unknown): string | null => {
  const data = linkData as Record<string, any> | null;
  return data?.action_link ??
    data?.properties?.action_link ??
    data?.properties?.actionLink ??
    null;
};

const sendRecoveryEmail = async ({
  email,
  actionLink,
  fullName,
}: {
  email: string;
  actionLink: string;
  fullName?: string | null;
}) => {
  const displayName = fullName?.trim();
  const greeting = displayName ? `Ola ${displayName},` : "Ola,";

  const text = [
    "Solicitacao de recuperacao de senha",
    "",
    greeting,
    "",
    `Clique no link para criar uma nova senha: ${actionLink}`,
    "",
    "Se voce nao solicitou, ignore este e-mail.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial, sans-serif;color:#0f172a;">
      <h2>Recuperacao de senha</h2>
      <p>${greeting}</p>
      <p>Clique no botao abaixo para criar uma nova senha.</p>
      <p>
        <a href="${actionLink}" style="display:inline-block;padding:12px 18px;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px;">
          Criar nova senha
        </a>
      </p>
      <p style="font-size:12px;color:#64748b;">Se voce nao solicitou, ignore este e-mail.</p>
    </div>
  `;

  const sent = await sendSmtpEmail({
    to: email,
    subject: "Recuperacao de senha - IDEART CLOUD",
    text,
    html,
  });

  if (!sent) {
    throw new Error("Falha ao enviar e-mail de recuperacao por SMTP");
  }
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== "POST") {
    return jsonResponse(corsHeaders, 400, { error: "Metodo invalido" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse(corsHeaders, 400, { error: "Configuracao do Supabase ausente" });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get("x-supabase-authorization") ??
      req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(corsHeaders, 401, { error: "No authorization header" });
    }

    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return jsonResponse(corsHeaders, 401, { error: "Sessao invalida" });
    }

    const { data: roleData } = await supabase
      .from("super_admin_users")
      .select("id")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (!roleData) {
      return jsonResponse(corsHeaders, 403, { error: "Not authorized" });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "list") {
      const companyId = body?.companyId as string | undefined;
      if (!companyId) {
        return jsonResponse(corsHeaders, 400, { error: "companyId is required" });
      }

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, created_at")
        .eq("company_id", companyId)
        .order("full_name");

      if (profilesError) {
        return jsonResponse(corsHeaders, 400, { error: profilesError.message });
      }

      const users = await Promise.all(
        (profiles ?? []).map(async (profile) => {
          const { data: userData } = await supabase.auth.admin.getUserById(profile.id);
          return {
            id: profile.id,
            full_name: profile.full_name,
            created_at: profile.created_at,
            email: userData?.user?.email ?? null,
          };
        }),
      );

      return jsonResponse(corsHeaders, 200, { users });
    }

    if (action === "reset") {
      const companyId = body?.companyId as string | undefined;
      const userId = body?.userId as string | undefined;
      if (!companyId || !userId) {
        return jsonResponse(corsHeaders, 400, { error: "companyId and userId are required" });
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", userId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (!profile) {
        return jsonResponse(corsHeaders, 404, { error: "Usuario nao encontrado para esta empresa" });
      }

      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      const email = userData?.user?.email;
      if (!email) {
        return jsonResponse(corsHeaders, 400, { error: "E-mail do usuario nao encontrado" });
      }

      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
      });

      if (linkError) {
        return jsonResponse(corsHeaders, 400, { error: linkError.message });
      }

      const link = getActionLink(linkData);
      if (!link) {
        return jsonResponse(corsHeaders, 400, { error: "Falha ao gerar link de redefinicao" });
      }

      return jsonResponse(corsHeaders, 200, { link, email });
    }

    if (action === "reset_email") {
      const companyId = body?.companyId as string | undefined;
      const userId = body?.userId as string | undefined;
      const accountType: AccountType = body?.accountType === "customer" ? "customer" : "store";
      const rawRedirectTo = typeof body?.redirectTo === "string" ? body.redirectTo : undefined;

      if (!companyId || !userId) {
        return jsonResponse(corsHeaders, 400, { error: "companyId and userId are required" });
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", userId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (!profile) {
        return jsonResponse(corsHeaders, 404, { error: "Usuario nao encontrado para esta empresa" });
      }

      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      const email = userData?.user?.email;
      if (!email) {
        return jsonResponse(corsHeaders, 400, { error: "E-mail do usuario nao encontrado" });
      }

      const redirectTo = resolveRedirectTo(rawRedirectTo, accountType);
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });

      if (linkError) {
        return jsonResponse(corsHeaders, 400, { error: linkError.message });
      }

      const actionLink = getActionLink(linkData);
      if (!actionLink) {
        return jsonResponse(corsHeaders, 400, { error: "Falha ao gerar link de redefinicao" });
      }

      await sendRecoveryEmail({
        email,
        actionLink,
        fullName: profile.full_name,
      });

      return jsonResponse(corsHeaders, 200, { status: "sent" });
    }

    return jsonResponse(corsHeaders, 400, { error: "Invalid action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(corsHeaders, 400, { error: message });
  }
});
