import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export const config = { verify_jwt: false };

const getSupabaseClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

const jsonResponse = (headers: HeadersInit, status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers: { ...headers, "Content-Type": "application/json" } });

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get("origin");
  const requestHeaders = req.headers.get("access-control-request-headers");
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers":
      requestHeaders ??
        "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Max-Age": "86400",
  };
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse(corsHeaders, 405, { error: "Invalid method" });
  }

  try {
    const url = new URL(req.url);
    const token =
      req.method === "GET"
        ? url.searchParams.get("token")
        : (await req.json().catch(() => ({})))?.token;

    if (!token) {
      return jsonResponse(corsHeaders, 400, { error: "Missing token" });
    }

    const supabase = getSupabaseClient();
    const { data: checkout } = await supabase
      .from("subscription_checkouts")
      .select("id, token, user_id, status")
      .eq("token", token)
      .maybeSingle();

    if (!checkout) {
      return jsonResponse(corsHeaders, 404, { error: "Checkout not found" });
    }

    if (!checkout.user_id) {
      return jsonResponse(corsHeaders, 202, { error: "Checkout not ready" });
    }

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(checkout.user_id);
    if (userError || !userData?.user?.email) {
      return jsonResponse(corsHeaders, 404, { error: "User not found" });
    }

    const appUrl = Deno.env.get("APP_PUBLIC_URL") ?? "";
    if (!appUrl) {
      return jsonResponse(corsHeaders, 400, { error: "Missing APP_PUBLIC_URL" });
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email,
      options: { redirectTo: `${appUrl.replace(/\/$/, "")}/dashboard` },
    });

    if (linkError) {
      return jsonResponse(corsHeaders, 400, { error: linkError.message || "Failed to generate link" });
    }

    const actionLink = linkData?.properties?.action_link ?? (linkData as any)?.action_link ?? null;
    if (!actionLink) {
      return jsonResponse(corsHeaders, 400, { error: "Missing action link" });
    }

    await supabase.from("subscription_checkouts").update({
      status: "active",
    }).eq("id", checkout.id);

    if (req.method === "GET") {
      return Response.redirect(actionLink, 302);
    }

    return jsonResponse(corsHeaders, 200, { redirect_url: actionLink });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(corsHeaders, 400, { error: message });
  }
});
