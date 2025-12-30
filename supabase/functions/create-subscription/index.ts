import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCaktoConfig, createCustomer as caktoCreateCustomer, createSubscription as caktoCreateSubscription } from "../_shared/cakto.ts";

export const config = { verify_jwt: false };

const defaultAllowedOrigins = [
  "http://192.168.0.221:8080",
  "http://localhost:8080",
  "https://ideart-cloud.vercel.app",
  "https://ideartcloud.com.br",
  "https://www.ideartcloud.com.br"
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

const getCorsHeaders = (origin: string | null) => {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
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

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (req.method !== "POST") return jsonResponse(corsHeaders, 405, { error: "Invalid method" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse(corsHeaders, 400, { error: "Missing Supabase config" });
    }

    const authHeader = req.headers.get("x-supabase-authorization") ?? req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(corsHeaders, 401, { error: "No authorization header" });
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return jsonResponse(corsHeaders, 401, { error: "Invalid session" });

    const body = (await req.json().catch(() => ({}))) as CreateSubscriptionRequest;
    const planId = body.plan_id;
    // company_id and customer are now fetched from DB for security/convenience

    if (!planId) {
      return jsonResponse(corsHeaders, 400, { error: 'Missing plan_id' });
    }

    // Fetch user profile and company
    const { data: profile } = await supabase
      .from('profiles')
      .select('*, company:companies(*)')
      .eq('id', authData.user.id)
      .single();

    if (!profile || !profile.company_id) {
      return jsonResponse(corsHeaders, 400, { error: 'Usuario sem empresa vinculada' });
    }

    const companyId = profile.company_id;
    const email = authData.user.email; // reliable email from auth
    const fullName = profile.full_name || authData.user.user_metadata?.full_name || 'Cliente';
    // cpf could be in profile or company, assume for now we don't strict require it for simple creation or fetch from profile if exists
    // const cpf = profile.cpf ... 

    // Fetch plan to get cakto_plan_id
    const { data: plan } = await supabase.from('plans').select('*').eq('id', planId).maybeSingle();
    if (!plan || !plan.cakto_plan_id) {
      return jsonResponse(corsHeaders, 400, { error: 'Plano nao encontrado ou nao vinculado ao CAKTO' });
    }

    log('Creating customer in CAKTO', { email });
    const cfg = getCaktoConfig();
    let caktoCustomer: any = null;
    try {
      const custPayload: Record<string, unknown> = {
        name: fullName,
        email: email,
        // cpf: ... 
      };
      caktoCustomer = await caktoCreateCustomer(cfg, custPayload);
    } catch (e) {
      log('CAKTO create customer failed', { message: e instanceof Error ? e.message : String(e) });
      return jsonResponse(corsHeaders, 400, { error: 'Falha ao criar cliente na CAKTO' });
    }

    const caktoCustomerId = caktoCustomer?.id ?? caktoCustomer?.customer_id ?? null;
    if (!caktoCustomerId) return jsonResponse(corsHeaders, 400, { error: 'CAKTO nao retornou customer id' });

    // Create subscription at CAKTO
    try {
      const subPayload: Record<string, unknown> = {
        customer_id: caktoCustomerId,
        plan_id: plan.cakto_plan_id,
        metadata: { company_id: companyId },
      };

      const caktoSub = await caktoCreateSubscription(cfg, subPayload);
      const caktoSubId = caktoSub?.id ?? caktoSub?.subscription_id ?? null;
      const checkoutUrl = caktoSub?.checkout_url ?? caktoSub?.payment_url ?? caktoSub?.checkoutUrl ?? null;

      // Save subscription locally as pending
      const { data: inserted, error: insertError } = await supabase.from('subscriptions').insert({
        company_id: companyId,
        user_id: authData.user.id,
        plan_id: planId,
        cakto_subscription_id: caktoSubId,
        status: 'pending',
      }).select('*').single();

      if (insertError) {
        log('Failed to save subscription locally', { message: insertError.message });
      }

      return jsonResponse(corsHeaders, 200, { subscription: inserted ?? null, checkout_url: checkoutUrl });
    } catch (e) {
      log('CAKTO create subscription failed', { message: e instanceof Error ? e.message : String(e) });
      return jsonResponse(corsHeaders, 400, { error: 'Falha ao criar assinatura na CAKTO' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('ERROR', { message });
    return jsonResponse(corsHeaders, 400, { error: message });
  }
});
