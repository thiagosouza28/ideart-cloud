import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  createPaymentLink,
  createSubscriptionProduct,
  getYampiConfig,
} from "../_shared/yampi.ts";

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

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[PLANS] ${step}${detailsStr}`);
};

const safeHeaders = (req: Request) => ({
  origin: req.headers.get("origin"),
  referer: req.headers.get("referer"),
  "content-type": req.headers.get("content-type"),
  "user-agent": req.headers.get("user-agent"),
  "x-forwarded-for": req.headers.get("x-forwarded-for"),
  "cf-connecting-ip": req.headers.get("cf-connecting-ip"),
});

const getSupabaseClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

const normalizeBillingPeriod = (value: string | null | undefined) => {
  const normalized = (value || "").toLowerCase();
  return normalized === "yearly" ? "yearly" : "monthly";
};

const resolvePeriodDays = (
  periodDays: number | null | undefined,
  billingPeriod: string | null | undefined,
) => {
  if (Number.isFinite(periodDays) && (periodDays as number) > 0) {
    return Math.round(periodDays as number);
  }
  return normalizeBillingPeriod(billingPeriod) === "yearly" ? 365 : 30;
};

type PlanCreateRequest = {
  name?: string;
  description?: string | null;
  price?: number;
  billing_period?: string;
  period_days?: number;
  max_users?: number | null;
  is_active?: boolean;
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== "POST") {
    return jsonResponse(corsHeaders, 405, { error: "Invalid method" });
  }

  try {
    const url = new URL(req.url);
    logStep("Request received", {
      method: req.method,
      path: url.pathname,
      headers: safeHeaders(req),
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse(corsHeaders, 400, { error: "Missing Supabase config" });
    }

    const authHeader = req.headers.get("x-supabase-authorization") ??
      req.headers.get("Authorization");
    logStep("Auth header present", { present: Boolean(authHeader) });
    if (!authHeader) {
      return jsonResponse(corsHeaders, 401, { error: "No authorization header" });
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(
      token,
    );
    if (authError || !authData.user) {
      return jsonResponse(corsHeaders, 401, { error: "Invalid session" });
    }
    logStep("Authenticated user", { userId: authData.user.id });

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id)
      .in("role", ["super_admin", "admin"])
      .maybeSingle();

    if (!roleData) {
      return jsonResponse(corsHeaders, 403, { error: "Not authorized" });
    }

    const body = (await req.json().catch(() => ({}))) as PlanCreateRequest;
    const name = body.name?.trim();
    if (!name) {
      return jsonResponse(corsHeaders, 400, { error: "Nome do plano obrigatorio" });
    }

    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) {
      return jsonResponse(corsHeaders, 400, { error: "Preco invalido" });
    }

    const billingPeriod = normalizeBillingPeriod(body.billing_period);
    const periodDays = resolvePeriodDays(body.period_days, billingPeriod);
    const maxUsers = body.max_users ?? null;
    const isActive = body.is_active ?? true;

    logStep("Plan payload received", {
      name,
      price,
      billing_period: billingPeriod,
      period_days: periodDays,
      max_users: maxUsers,
      is_active: isActive,
      description_len: body.description?.length ?? 0,
    });

    const { data: existingPlan } = await supabase
      .from("plans")
      .select("id")
      .eq("name", name)
      .eq("period_days", periodDays)
      .maybeSingle();

    if (existingPlan) {
      return jsonResponse(corsHeaders, 409, {
        error: "Plano ja existe para este periodo",
      });
    }

    const { data: insertedPlan, error: insertError } = await supabase
      .from("plans")
      .insert({
        name,
        description: body.description ?? null,
        price,
        billing_period: billingPeriod,
        period_days: periodDays,
        max_users: maxUsers,
        is_active: isActive,
      })
      .select("*")
      .single();

    if (insertError || !insertedPlan) {
      return jsonResponse(corsHeaders, 400, {
        error: insertError?.message || "Falha ao criar plano",
      });
    }

    const yampiConfig = getYampiConfig();
    logStep("Creating Yampi product", { planId: insertedPlan.id });

    try {
      const yampiProduct = await createSubscriptionProduct(yampiConfig, {
        name,
        description: body.description ?? null,
        price,
        periodDays,
        active: isActive,
      });

      let checkoutUrl = yampiProduct.checkoutUrl;
      if (!checkoutUrl && yampiProduct.skuId) {
        const skuId = Number(yampiProduct.skuId);
        if (Number.isFinite(skuId)) {
          const link = await createPaymentLink(yampiConfig, {
            name,
            skus: [{ id: skuId, quantity: 1 }],
          });
          checkoutUrl = link.link_url;
        }
      }

      if (!checkoutUrl) {
        checkoutUrl =
          `https://${yampiConfig.alias}.pay.yampi.com.br/checkout/${yampiProduct.productId}`;
      }

      const { data: updatedPlan, error: updateError } = await supabase
        .from("plans")
        .update({
          yampi_product_id: yampiProduct.productId,
          yampi_checkout_url: checkoutUrl,
        })
        .eq("id", insertedPlan.id)
        .select("*")
        .single();

      if (updateError || !updatedPlan) {
        throw new Error(updateError?.message || "Falha ao vincular plano");
      }

      return jsonResponse(corsHeaders, 200, { plan: updatedPlan });
    } catch (error) {
      logStep("Yampi create failed", {
        planId: insertedPlan.id,
        message: error instanceof Error ? error.message : String(error),
      });
      await supabase.from("plans").delete().eq("id", insertedPlan.id);
      return jsonResponse(corsHeaders, 400, {
        error: "Falha ao criar plano na Yampi. Tente novamente.",
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    return jsonResponse(corsHeaders, 400, { error: message });
  }
});
