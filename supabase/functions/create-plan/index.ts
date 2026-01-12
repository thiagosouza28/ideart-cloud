import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCaktoConfig, createPlan as caktoCreatePlan } from "../_shared/cakto.ts";

// Disable automatic JWT verification - we'll verify manually
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
  console.log(`[CAKTO/CREATE-PLAN] ${step}${detailsStr}`);
};

const getSupabaseClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

type CreatePlanRequest = {
  name?: string;
  description?: string | null;
  price?: number;
  interval?: "month" | "year" | string;
  interval_count?: number;
  billing_period?: "monthly" | "yearly" | string;
  period_days?: number;
  features?: string[] | null;
  max_users?: number | null;
  is_active?: boolean;
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

    // Log all headers for debugging (mask sensitive data)
    const allHeaders: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      allHeaders[key] = key.toLowerCase().includes('authorization') ? (value.slice(0, 20) + '...') : value;
    });
    log('Request headers', allHeaders);

    // Try multiple header formats that Supabase Client might use
    const authHeader = req.headers.get("authorization") ?? 
                      req.headers.get("Authorization") ??
                      req.headers.get("x-supabase-authorization") ??
                      req.headers.get("X-Supabase-Authorization");
    
    log('Auth header check', {
      hasAuth: !!authHeader,
      authHeaderPrefix: authHeader ? authHeader.substring(0, 20) : 'none'
    });
    
    if (!authHeader) {
      log('ERROR: No authorization header found');
      return jsonResponse(corsHeaders, 401, { error: "No authorization header" });
    }
    
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return jsonResponse(corsHeaders, 401, { error: "Sessão inválida" });

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id)
      .in("role", ["super_admin", "admin"])
      .maybeSingle();

    if (!roleData) {
      return jsonResponse(corsHeaders, 403, { error: "Not authorized" });
    }

    const body = (await req.json().catch(() => ({}))) as CreatePlanRequest;
    const name = body.name?.trim();
    if (!name) return jsonResponse(corsHeaders, 400, { error: "Nome do plano obrigatório" });

    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) return jsonResponse(corsHeaders, 400, { error: "Preço inválido" });

    const billingPeriodRaw = (body.billing_period || body.interval || 'month').toString().toLowerCase();
    const billingPeriod = billingPeriodRaw === 'year' || billingPeriodRaw === 'yearly'
      ? 'yearly'
      : 'monthly';
    const intervalCount = Number(body.interval_count) || 1;
    const providedPeriodDays = Number(body.period_days);
    const periodDaysBase = billingPeriod === 'yearly' ? 365 : 30;
    const periodDays = Number.isFinite(providedPeriodDays) && providedPeriodDays > 0
      ? providedPeriodDays
      : periodDaysBase * intervalCount;
    const features = Array.isArray(body.features) ? body.features : [];
    const maxUsers = Number.isFinite(Number(body.max_users)) ? Number(body.max_users) : null;
    const isActive = body.is_active ?? true;

    log('Plan payload', { name, price, billingPeriod, intervalCount, periodDays });

    // Insert local plan record
    const { data: insertedPlan, error: insertError } = await supabase
      .from('plans')
      .insert({
        name,
        description: body.description ?? null,
        price,
        billing_period: billingPeriod,
        period_days: periodDays,
        features,
        max_users: maxUsers,
        is_active: isActive,
      })
      .select('*')
      .single();

    if (insertError || !insertedPlan) {
      return jsonResponse(corsHeaders, 400, { error: insertError?.message || 'Falha ao criar plano local' });
    }

    // Create plan in CAKTO
    try {
      const cfg = getCaktoConfig();
      const caktoPayload = {
        name,
        description: body.description ?? null,
        price: Math.round(price * 100),
        status: isActive ? 'active' : 'inactive',
        type: 'recurring',
        intervalType: billingPeriod === 'yearly' ? 'year' : 'month',
        interval: intervalCount,
        recurrence_period: periodDays,
      } as Record<string, unknown>;

      const caktoResp = await caktoCreatePlan(cfg, caktoPayload);
      const caktoId = (caktoResp && (caktoResp.id || caktoResp.plan_id || caktoResp.cakto_id)) ?? null;

      if (!caktoId) {
        throw new Error('A CAKTO não retornou o ID do plano');
      }

      const { data: updatedPlan, error: updateError } = await supabase
        .from('plans')
        .update({ cakto_plan_id: caktoId })
        .eq('id', insertedPlan.id)
        .select('*')
        .single();

      if (updateError || !updatedPlan) throw new Error(updateError?.message || 'Falha ao vincular plano CAKTO');

      return jsonResponse(corsHeaders, 200, { plan: updatedPlan });
    } catch (err) {
      log('Falha ao criar plano na CAKTO', { message: err instanceof Error ? err.message : String(err) });
      // rollback local plan
      await supabase.from('plans').delete().eq('id', insertedPlan.id);
      return jsonResponse(corsHeaders, 400, { error: 'Falha ao criar plano na CAKTO. Tente novamente.' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('ERROR', { message });
    return jsonResponse(corsHeaders, 400, { error: message });
  }
});
