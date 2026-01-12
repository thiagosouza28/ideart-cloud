/// <reference path="../deno-types.d.ts" />
import { createClient } from "@supabase/supabase-js";

export const config = { verify_jwt: false };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente");
}

const getCorsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Access-Control-Max-Age": "86400",
});

const jsonResponse = (headers: Record<string, string>, status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });

const getSupabaseClient = () =>
  createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

type SettingsPayload = {
  whatsapp_message_template?: string | null;
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== "GET" && req.method !== "PATCH") {
    return jsonResponse(corsHeaders, 405, { error: "Método inválido" });
  }

  try {
    const supabase = getSupabaseClient();
    const authHeader =
      req.headers.get("x-supabase-authorization") ?? req.headers.get("Authorization");

    if (!authHeader) {
      return jsonResponse(corsHeaders, 401, { error: "No authorization header" });
    }

    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      return jsonResponse(corsHeaders, 401, { error: "Sessão inválida" });
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", authData.user.id)
      .maybeSingle();

    const companyId = profileData?.company_id ?? null;
    if (!companyId) {
      return jsonResponse(corsHeaders, 400, { error: "Empresa não encontrada" });
    }

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("companies")
        .select("whatsapp_message_template")
        .eq("id", companyId)
        .maybeSingle();

      if (error) {
        return jsonResponse(corsHeaders, 400, { error: error.message });
      }

      return jsonResponse(corsHeaders, 200, data ?? { whatsapp_message_template: null });
    }

    const body = (await req.json().catch(() => ({}))) as SettingsPayload;
    const templateRaw = body.whatsapp_message_template;
    const template =
      typeof templateRaw === "string" ? templateRaw.trim() || null : null;

    const { data, error } = await supabase
      .from("companies")
      .update({ whatsapp_message_template: template })
      .eq("id", companyId)
      .select("whatsapp_message_template")
      .maybeSingle();

    if (error) {
      return jsonResponse(corsHeaders, 400, { error: error.message });
    }

    return jsonResponse(corsHeaders, 200, data ?? { whatsapp_message_template: null });
  } catch (error) {
    console.error("Erro em company-settings:", error);
    return jsonResponse(corsHeaders, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
