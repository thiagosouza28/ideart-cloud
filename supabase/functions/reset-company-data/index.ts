import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export const config = { verify_jwt: true };

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

const getSupabaseClient = (authHeader: string) =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SB_ANON_KEY") ?? "",
    {
      auth: { persistSession: false },
      global: {
        headers: { Authorization: authHeader },
      },
    },
  );

const getServiceClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

type ResetRequest = {
  company_id?: string;
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (req.method !== "POST") return jsonResponse(corsHeaders, 405, { error: "Invalid method" });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return jsonResponse(corsHeaders, 401, { error: "No authorization header" });

    const supabase = getSupabaseClient(authHeader);
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return jsonResponse(corsHeaders, 401, { error: "Invalid session" });
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();

    if (!roleData) {
      return jsonResponse(corsHeaders, 403, { error: "Not authorized" });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (!profile?.company_id) {
      return jsonResponse(corsHeaders, 400, { error: "Missing company_id" });
    }

    const body = (await req.json().catch(() => ({}))) as ResetRequest;
    const targetCompanyId = body.company_id ?? profile.company_id;

    if (targetCompanyId !== profile.company_id) {
      return jsonResponse(corsHeaders, 403, { error: "Company mismatch" });
    }

    const serviceClient = getServiceClient();
    const { error: resetError } = await serviceClient.rpc("reset_company_data", {
      p_company_id: targetCompanyId,
      p_admin_id: authData.user.id,
    });

    if (resetError) {
      console.error("[reset-company-data] RPC error", resetError);
      return jsonResponse(corsHeaders, 400, { error: "Reset failed" });
    }

    return jsonResponse(corsHeaders, 200, { success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[reset-company-data] ERROR", message);
    return jsonResponse(corsHeaders, 400, { error: "Reset failed" });
  }
});
