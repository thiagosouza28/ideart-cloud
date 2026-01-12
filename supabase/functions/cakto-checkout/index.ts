import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export const config = { verify_jwt: false };

const defaultAllowedOrigins = [
  "http://192.168.0.221:8080",
  "http://localhost:8080",
];

const getAppOrigin = () => {
  const appUrl = Deno.env.get("APP_PUBLIC_URL");
  if (!appUrl) return null;
  try {
    return new URL(appUrl).origin;
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

const log = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CAKTO/CHECKOUT] ${step}${detailsStr}`);
};

const getSupabaseClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

const buildCheckoutUrl = (caktoPlanId: string) => {
  const trimmed = caktoPlanId.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://pay.cakto.com.br/${trimmed}`;
};

type CreateCheckoutRequest = {
  plan_id?: string;
  email?: string;
  full_name?: string;
  company_name?: string;
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (req.method !== "POST") return jsonResponse(corsHeaders, 405, { error: "Método inválido" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const appUrl = Deno.env.get("APP_PUBLIC_URL") ?? "";

    if (!supabaseUrl || !serviceKey || !appUrl) {
      return jsonResponse(corsHeaders, 400, { error: "Configuração de ambiente ausente" });
    }

    const body = (await req.json().catch(() => ({}))) as CreateCheckoutRequest;
    const planId = body.plan_id?.trim();
    const email = body.email?.trim().toLowerCase();
    const fullName = body.full_name?.trim() ?? null;
    const companyName = body.company_name?.trim() ?? null;

    if (!planId || !email) {
      return jsonResponse(corsHeaders, 400, { error: "plan_id ou e-mail ausente" });
    }

    const supabase = getSupabaseClient();
    const { data: plan } = await supabase
      .from("plans")
      .select("id, cakto_plan_id, name")
      .eq("id", planId)
      .maybeSingle();

    if (!plan?.cakto_plan_id) {
      return jsonResponse(corsHeaders, 400, { error: "Plan not available for CAKTO" });
    }

    const { data: existingCheckout } = await supabase
      .from("subscription_checkouts")
      .select("id, status, created_at")
      .eq("email", email)
      .eq("plan_id", plan.id)
      .in("status", ["created", "pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingCheckout) {
      return jsonResponse(corsHeaders, 409, {
        error: "Checkout já está pendente para este e-mail e plano.",
      });
    }

    const token = crypto.randomUUID();
    const { data: checkout, error: checkoutError } = await supabase
      .from("subscription_checkouts")
      .insert({
        token,
        plan_id: plan.id,
        email,
        full_name: fullName,
        company_name: companyName,
        status: "created",
      })
      .select("*")
      .single();

    if (checkoutError || !checkout) {
      return jsonResponse(corsHeaders, 400, { error: checkoutError?.message || "Falha ao criar checkout" });
    }

    log("Building CAKTO checkout URL", { planId: plan.id });
    const checkoutUrl = buildCheckoutUrl(plan.cakto_plan_id);

    if (!checkoutUrl) {
      return jsonResponse(corsHeaders, 400, { error: "Checkout URL missing" });
    }

    await supabase.from("subscription_checkouts").update({
      status: "pending",
    }).eq("id", checkout.id);

    return jsonResponse(corsHeaders, 200, {
      checkout_url: checkoutUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("ERROR", { message });
    return jsonResponse(corsHeaders, 400, { error: message });
  }
});
