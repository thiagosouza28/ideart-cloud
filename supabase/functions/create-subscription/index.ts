import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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
  console.log(`[CAKTO/CREATE-SUB] ${step}${detailsStr}`);
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

type CustomerPayload = {
  name?: string;
  email?: string;
  cpf?: string;
};

type CreateSubscriptionRequest = {
  plan_id?: string;
  company_id?: string;
  customer?: CustomerPayload;
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (req.method !== "POST") return jsonResponse(corsHeaders, 405, { error: "Método inválido" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse(corsHeaders, 400, { error: "Configuração do Supabase ausente" });
    }

    const authHeader = req.headers.get("x-supabase-authorization") ?? req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(corsHeaders, 401, { error: "No authorization header" });
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return jsonResponse(corsHeaders, 401, { error: "Sessão inválida" });

    const body = (await req.json().catch(() => ({}))) as CreateSubscriptionRequest;
    const planId = body.plan_id;
    const companyId = body.company_id;
    const customer = body.customer;

    if (!planId || !companyId || !customer?.email) {
      return jsonResponse(corsHeaders, 400, { error: 'plan_id, company_id ou customer.email ausente' });
    }

    // Fetch plan to get cakto_plan_id
    const { data: plan } = await supabase.from('plans').select('*').eq('id', planId).maybeSingle();
    if (!plan || !plan.cakto_plan_id) {
      return jsonResponse(corsHeaders, 400, { error: 'Plano não encontrado ou não vinculado ao CAKTO' });
    }

    const checkoutUrl = buildCheckoutUrl(plan.cakto_plan_id);
    if (!checkoutUrl) return jsonResponse(corsHeaders, 400, { error: 'Checkout URL indisponível' });

    const { data: inserted, error: insertError } = await supabase.from('subscriptions').insert({
      company_id: companyId,
      user_id: authData.user.id,
      plan_id: planId,
      status: 'pending',
      gateway: 'cakto',
      gateway_subscription_id: null,
    }).select('*').single();

    if (insertError) {
      log('Falha ao salvar assinatura localmente', { message: insertError.message });
    }

    const token = crypto.randomUUID();
    const { error: checkoutError } = await supabase.from('subscription_checkouts').insert({
      token,
      plan_id: planId,
      email: customer.email,
      full_name: customer.name ?? null,
      company_name: null,
      status: 'pending',
      user_id: authData.user.id,
      company_id: companyId,
    });
    if (checkoutError) {
      log('Falha ao criar registro de checkout', { message: checkoutError.message });
    }

    return jsonResponse(corsHeaders, 200, { subscription: inserted ?? null, checkout_url: checkoutUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('ERROR', { message });
    return jsonResponse(corsHeaders, 400, { error: message });
  }
});
