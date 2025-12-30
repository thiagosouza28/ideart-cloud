// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCaktoConfig, createPlan as caktoCreatePlan } from "../_shared/cakto.ts";

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
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 200 });
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
    if (!name) return jsonResponse(corsHeaders, 400, { error: "Nome do plano obrigatorio" });

    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) return jsonResponse(corsHeaders, 400, { error: "Preco invalido" });

    const interval = (body.interval || 'month').toString().toLowerCase();
    const intervalCount = Number(body.interval_count) || 1;

    log('Plan payload', { name, price, interval, intervalCount });

    // Insert local plan record
    const { data: insertedPlan, error: insertError } = await supabase
      .from('plans')
      .insert({
        name,
        description: body.description ?? null,
        price,
        billing_period: interval === 'year' || interval === 'yearly' ? 'yearly' : 'monthly',
        period_days: interval === 'year' || interval === 'yearly' ? 365 : 30 * intervalCount,
        is_active: true,
      })
      .select('*')
      .single();

    if (insertError || !insertedPlan) {
      return jsonResponse(corsHeaders, 400, { error: insertError?.message || 'Falha ao criar plano local' });
    }

    // Create plan in CAKTO
    try {
      const cfg = getCaktoConfig();
      // Ensure interval is strictly 'month' or 'year' for Cakto
      const caktoInterval = interval === 'yearly' || interval === 'year' ? 'year' : 'month';

      const caktoPayload: Record<string, unknown> = {
        name,
        description: body.description ?? null,
        price: Math.round(price * 100), // cents
        interval: caktoInterval,
        interval_count: intervalCount,
      };

      if (body.trial_days && Number(body.trial_days) > 0) {
        caktoPayload.trial_days = Number(body.trial_days);
      }

      const caktoResp = await caktoCreatePlan(cfg, caktoPayload);
      const caktoId = (caktoResp && (caktoResp.id || caktoResp.plan_id || caktoResp.cakto_id)) ?? null;

      if (!caktoId) {
        throw new Error('CAKTO did not return plan id');
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
      log('CAKTO create failed', { message: err instanceof Error ? err.message : String(err) });
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
