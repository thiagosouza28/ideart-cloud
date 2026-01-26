import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export const config = { verify_jwt: false };

const getCorsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
});

const jsonResponse = (headers: HeadersInit, status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });

const getRequestIp = (req: Request) => {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const direct = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip");
  return direct?.trim() || null;
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== "POST") {
    return jsonResponse(corsHeaders, 405, { error: "Invalid method" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse(corsHeaders, 400, { error: "Missing Supabase configuration" });
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
      return jsonResponse(corsHeaders, 401, { error: "Invalid session" });
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return jsonResponse(corsHeaders, 403, { error: "Not authorized" });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!email) {
      return jsonResponse(corsHeaders, 400, { error: "email is required" });
    }

    const { data: targetData, error: targetError } = await supabase.auth.admin.getUserByEmail(email);
    if (targetError) {
      return jsonResponse(corsHeaders, 400, { error: targetError.message });
    }

    const targetUser = targetData?.user;
    if (!targetUser) {
      return jsonResponse(corsHeaders, 404, { error: "User not found" });
    }

    if (targetUser.id === authData.user.id) {
      return jsonResponse(corsHeaders, 400, { error: "Cannot impersonate yourself" });
    }

    const { data: targetRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", targetUser.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (targetRole) {
      return jsonResponse(corsHeaders, 403, { error: "Target user is not allowed" });
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkError) {
      return jsonResponse(corsHeaders, 400, { error: linkError.message });
    }

    const tokenValue = linkData?.properties?.email_otp;
    const actionLink = linkData?.properties?.action_link;
    if (!tokenValue) {
      return jsonResponse(corsHeaders, 400, { error: "Failed to generate impersonation token" });
    }

    const ip = getRequestIp(req);
    const { error: logError } = await supabase
      .from("admin_access_logs")
      .insert({
        admin_id: authData.user.id,
        client_id: targetUser.id,
        client_email: email,
        ip,
      });

    if (logError) {
      return jsonResponse(corsHeaders, 400, { error: "Failed to write audit log" });
    }

    return jsonResponse(corsHeaders, 200, {
      email,
      user_id: targetUser.id,
      token: tokenValue,
      action_link: actionLink ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(corsHeaders, 400, { error: message });
  }
});
