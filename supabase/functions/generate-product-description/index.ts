import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// Manual auth handling to avoid failing preflight requests and to return clearer errors.
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

const getSupabaseClient = (supabaseUrl: string, anonKey: string, authHeader: string) =>
  createClient(
    supabaseUrl,
    anonKey,
    {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    },
  );

const getAuthHeader = (req: Request) =>
  req.headers.get("authorization") ??
  req.headers.get("Authorization") ??
  req.headers.get("x-supabase-authorization") ??
  req.headers.get("X-Supabase-Authorization");

const rateBucket: Record<string, { count: number; resetAt: number }> = {};
const RATE_LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;

type DescriptionRequest = {
  name?: string;
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (req.method !== "POST") return jsonResponse(corsHeaders, 405, { error: "Invalid method" });

  try {
    const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    if (!openAiKey) {
      return jsonResponse(corsHeaders, 400, { error: "Missing OpenAI config" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SB_ANON_KEY") ?? "";
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[AI] Missing Supabase config");
      return jsonResponse(corsHeaders, 500, { error: "Missing Supabase config" });
    }

    const authHeader = getAuthHeader(req);
    if (!authHeader) {
      console.error("[AI] No authorization header", {
        hasAuth: req.headers.has("authorization"),
        hasSupabaseAuth: req.headers.has("x-supabase-authorization"),
      });
      return jsonResponse(corsHeaders, 401, { error: "No authorization header" });
    }
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (!token || !token.includes(".")) {
      return jsonResponse(corsHeaders, 401, { error: "Invalid authorization token" });
    }

    const supabase = getSupabaseClient(supabaseUrl, supabaseAnonKey, authHeader);
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      console.error("[AI] Invalid session", authError?.message ?? authError);
      let hint: string | null = null;
      try {
        const payload = token.split(".")[1] ?? "";
        const decoded = JSON.parse(atob(payload));
        const iss = decoded?.iss ?? "";
        const expected = supabaseUrl;
        if (iss && expected && !iss.startsWith(expected)) {
          hint = "Token issuer mismatch. Check VITE_SUPABASE_URL.";
        }
      } catch {
        // ignore decode issues
      }
      return jsonResponse(corsHeaders, 401, { error: "Invalid session", hint });
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id)
      .in("role", ["super_admin", "admin"])
      .maybeSingle();

    if (!roleData) return jsonResponse(corsHeaders, 403, { error: "Not authorized" });

    const now = Date.now();
    const bucket = rateBucket[authData.user.id];
    if (!bucket || bucket.resetAt < now) {
      rateBucket[authData.user.id] = { count: 1, resetAt: now + WINDOW_MS };
    } else if (bucket.count >= RATE_LIMIT) {
      return jsonResponse(corsHeaders, 429, { error: "Rate limit exceeded" });
    } else {
      bucket.count += 1;
    }

    const body = (await req.json().catch(() => ({}))) as DescriptionRequest;
    const name = body.name?.trim();
    if (!name) return jsonResponse(corsHeaders, 400, { error: "Nome do produto obrigatorio" });

    const prompt = `Crie uma descricao comercial atrativa para catalogo de vendas do produto: ${name}. Responda apenas em JSON com as chaves short e long. O campo short deve ter no maximo 140 caracteres. O campo long deve ter ate 3 paragrafos.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Voce escreve em portugues do Brasil e usa um tom comercial claro." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("[AI] OpenAI error", response.status, text);
      return jsonResponse(corsHeaders, 400, { error: "Falha ao gerar descricao" });
    }

    const data = await response.json().catch(() => null) as {
      choices?: Array<{ message?: { content?: string } }>;
    } | null;

    const content = data?.choices?.[0]?.message?.content ?? "";
    let shortDescription = "";
    let longDescription = "";

    try {
      const parsed = JSON.parse(content);
      shortDescription = String(parsed?.short ?? "").trim();
      longDescription = String(parsed?.long ?? "").trim();
    } catch {
      longDescription = content.trim();
      shortDescription = content.trim().slice(0, 140);
    }

    if (!shortDescription && longDescription) {
      shortDescription = longDescription.slice(0, 140);
    }

    return jsonResponse(corsHeaders, 200, {
      shortDescription,
      longDescription,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[AI] ERROR", message);
    return jsonResponse(corsHeaders, 400, { error: "Falha ao gerar descricao" });
  }
});
