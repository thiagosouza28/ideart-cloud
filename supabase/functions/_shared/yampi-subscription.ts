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

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[YAMPI-SUBSCRIPTION] ${step}${detailsStr}`);
};

const getSupabaseClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

type SubscriptionCheckoutRequest = {
  planId?: string;
};

export const handleYampiSubscriptionCheckout = async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Invalid method" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  try {
    logStep("Function started");

    const supabaseClient = getSupabaseClient();

    const authHeader = req.headers.get("x-supabase-authorization") ??
      req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }
    logStep("Authorization header found");

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;
    const { data: userData, error: userError } = await supabaseClient.auth
      .getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const body = (await req.json()) as SubscriptionCheckoutRequest;
    const { planId } = body;
    if (!planId) {
      throw new Error("Plan ID is required");
    }

    logStep("Plan checkout requested", { planId });

    const { data: plan, error: planError } = await supabaseClient
      .from("plans")
      .select("id, name, is_active, yampi_checkout_url")
      .eq("id", planId)
      .single();

    if (planError || !plan) throw new Error("Plano nao encontrado");
    if (!plan.is_active) throw new Error("Plano indisponivel");
    if (!plan.yampi_checkout_url) {
      throw new Error("Plano sem checkout Yampi configurado");
    }

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();

    if (!profile?.company_id) throw new Error("User has no company associated");

    const { data: company } = await supabaseClient
      .from("companies")
      .select("id, name")
      .eq("id", profile.company_id)
      .single();

    if (!company) throw new Error("Company not found");

    const subscriptionPayload = {
      user_id: user.id,
      company_id: company.id,
      plan_id: plan.id,
      status: "pending",
      trial_ends_at: null,
      current_period_ends_at: null,
      gateway: "yampi",
      gateway_subscription_id: null,
      gateway_payment_link_id: null,
      payment_link_url: plan.yampi_checkout_url,
      last_payment_status: "pending",
    };

    const { data: existingSubscription } = await supabaseClient
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("plan_id", plan.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSubscription?.id) {
      const { error: subscriptionError } = await supabaseClient
        .from("subscriptions")
        .update(subscriptionPayload)
        .eq("id", existingSubscription.id);
      if (subscriptionError) throw subscriptionError;
    } else {
      const { error: subscriptionError } = await supabaseClient
        .from("subscriptions")
        .insert(subscriptionPayload);
      if (subscriptionError) throw subscriptionError;
    }

    logStep("Subscription start stored", {
      userId: user.id,
      companyId: company.id,
      planId: plan.id,
    });

    return new Response(JSON.stringify({ url: plan.yampi_checkout_url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
};
