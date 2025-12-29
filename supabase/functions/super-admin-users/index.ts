import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export const config = { verify_jwt: false };

const allowedOrigins = new Set([
  "http://192.168.0.221:8080",
  "http://localhost:8080",
]);

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get("origin");
  const requestHeaders = req.headers.get("access-control-request-headers");
  const allowOrigin = origin && allowedOrigins.has(origin) ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": requestHeaders ??
      "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
};

const jsonResponse = (headers: HeadersInit, status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== "POST") {
    return jsonResponse(corsHeaders, 400, { error: "Invalid method" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse(corsHeaders, 400, { error: "Missing Supabase config" });
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
    const action = body?.action;

    if (action === "list") {
      const companyId = body?.companyId as string | undefined;
      if (!companyId) {
        return jsonResponse(corsHeaders, 400, { error: "companyId is required" });
      }

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, created_at")
        .eq("company_id", companyId)
        .order("full_name");

      if (profilesError) {
        return jsonResponse(corsHeaders, 400, { error: profilesError.message });
      }

      const users = await Promise.all(
        (profiles ?? []).map(async (profile) => {
          const { data: userData } = await supabase.auth.admin.getUserById(profile.id);
          return {
            id: profile.id,
            full_name: profile.full_name,
            created_at: profile.created_at,
            email: userData?.user?.email ?? null,
          };
        }),
      );

      return jsonResponse(corsHeaders, 200, { users });
    }

    if (action === "reset") {
      const companyId = body?.companyId as string | undefined;
      const userId = body?.userId as string | undefined;
      if (!companyId || !userId) {
        return jsonResponse(corsHeaders, 400, { error: "companyId and userId are required" });
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", userId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (!profile) {
        return jsonResponse(corsHeaders, 404, { error: "User not found for this company" });
      }

      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      const email = userData?.user?.email;
      if (!email) {
        return jsonResponse(corsHeaders, 400, { error: "User email not found" });
      }

      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
      });

      if (linkError) {
        return jsonResponse(corsHeaders, 400, { error: linkError.message });
      }

      const link = linkData?.properties?.action_link;
      if (!link) {
        return jsonResponse(corsHeaders, 400, { error: "Failed to generate reset link" });
      }

      return jsonResponse(corsHeaders, 200, { link, email });
    }

    if (action === "reset_email") {
      const companyId = body?.companyId as string | undefined;
      const userId = body?.userId as string | undefined;
      if (!companyId || !userId) {
        return jsonResponse(corsHeaders, 400, { error: "companyId and userId are required" });
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", userId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (!profile) {
        return jsonResponse(corsHeaders, 404, { error: "User not found for this company" });
      }

      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      const email = userData?.user?.email;
      if (!email) {
        return jsonResponse(corsHeaders, 400, { error: "User email not found" });
      }

      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      if (!anonKey) {
        return jsonResponse(corsHeaders, 400, { error: "SUPABASE_ANON_KEY is not set" });
      }

      const publicClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false },
      });

      const redirectTo = Deno.env.get("PASSWORD_RESET_REDIRECT_URL") ??
        Deno.env.get("SITE_URL") ??
        undefined;

      const { error: resetError } = redirectTo
        ? await publicClient.auth.resetPasswordForEmail(email, { redirectTo })
        : await publicClient.auth.resetPasswordForEmail(email);

      if (resetError) {
        return jsonResponse(corsHeaders, 400, { error: resetError.message });
      }

      return jsonResponse(corsHeaders, 200, { status: "sent" });
    }

    return jsonResponse(corsHeaders, 400, { error: "Invalid action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(corsHeaders, 400, { error: message });
  }
});
