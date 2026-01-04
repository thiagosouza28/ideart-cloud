import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export const config = { verify_jwt: false };

const defaultAllowedOrigins = [
  "http://192.168.0.221:8080",
  "http://localhost:8080",
];

const normalizeAppUrl = (value: string) => {
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return `https://${value}`;
};

const getAppOrigin = () => {
  const appUrl = Deno.env.get("APP_PUBLIC_URL");
  if (!appUrl) return null;
  try {
    return new URL(normalizeAppUrl(appUrl) ?? appUrl).origin;
  } catch {
    return null;
  }
};

const allowedOrigins = new Set(
  [...defaultAllowedOrigins, getAppOrigin()].filter(Boolean) as string[],
);

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get("origin");
  const requestHeaders = req.headers.get("access-control-request-headers");
  const allowOrigin = origin && allowedOrigins.has(origin) ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      requestHeaders ??
        "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
};

const jsonResponse = (headers: HeadersInit, status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });

const getSupabaseClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

const normalizeCpf = (value: string) => value.replace(/\D/g, "");
const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const randomSuffix = () => {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
};

type TrialSignupPayload = {
  email?: string;
  password?: string;
  full_name?: string;
  cpf?: string;
  company_name?: string;
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (req.method !== "POST") return jsonResponse(corsHeaders, 405, { error: "Invalid method" });

  try {
    const body = (await req.json().catch(() => ({}))) as TrialSignupPayload;
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    const fullName = body.full_name?.trim();
    const cpfRaw = body.cpf?.trim() ?? "";
    const cpf = normalizeCpf(cpfRaw);
    const companyName = body.company_name?.trim() ?? null;

    if (!email || !password || !fullName || !cpf) {
      return jsonResponse(corsHeaders, 400, { error: "Dados obrigatorios ausentes" });
    }

    const supabase = getSupabaseClient();

    const { data: cpfOwner } = await supabase
      .from("profiles")
      .select("id")
      .eq("cpf", cpf)
      .maybeSingle();
    if (cpfOwner?.id) {
      return jsonResponse(corsHeaders, 409, { error: "Este CPF ja esta vinculado a outra conta." });
    }

    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + 3);
    const trialEndsAt = trialEnd.toISOString();

    const { data: createdUser, error: userError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: "admin",
        trial_active: true,
        trial_ends_at: trialEndsAt,
        has_active_subscription: false,
      },
    });

    if (userError || !createdUser.user?.id) {
      const message = userError?.message?.toLowerCase() ?? "";
      if (message.includes("already") || message.includes("exists") || message.includes("registered")) {
        return jsonResponse(corsHeaders, 409, { error: "Este e-mail ja possui uma conta." });
      }
      return jsonResponse(corsHeaders, 400, { error: userError?.message || "Falha ao criar usuario" });
    }

    const userId = createdUser.user.id;
    const baseCompanyName = companyName || fullName;
    const baseSlug = slugify(baseCompanyName || "empresa") || "empresa";
    const slug = `${baseSlug}-${randomSuffix()}`;

    const { data: createdCompany, error: companyError } = await supabase
      .from("companies")
      .insert({
        name: baseCompanyName,
        slug,
        email,
        is_active: true,
        subscription_status: "trial",
        subscription_start_date: now.toISOString(),
        subscription_end_date: trialEndsAt,
        trial_active: true,
        trial_ends_at: trialEndsAt,
        owner_user_id: userId,
        completed: false,
      })
      .select("id")
      .single();

    if (companyError || !createdCompany?.id) {
      await supabase.auth.admin.deleteUser(userId);
      return jsonResponse(corsHeaders, 400, { error: companyError?.message || "Falha ao criar empresa" });
    }

    const companyId = createdCompany.id;

    await supabase.from("profiles").upsert({
      id: userId,
      full_name: fullName,
      cpf,
      company_id: companyId,
      must_complete_company: true,
      must_complete_onboarding: true,
      password_defined: true,
    });

    await supabase.from("user_roles").upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    await supabase.from("company_users").insert({ company_id: companyId, user_id: userId });

    await supabase.from("subscriptions").insert({
      user_id: userId,
      company_id: companyId,
      plan_id: null,
      status: "trial",
      trial_ends_at: trialEndsAt,
      current_period_ends_at: trialEndsAt,
      gateway: "trial",
    });

    return jsonResponse(corsHeaders, 200, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(corsHeaders, 500, { error: message });
  }
});
