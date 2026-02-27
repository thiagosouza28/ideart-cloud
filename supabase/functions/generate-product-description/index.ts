import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// Manual auth so preflight requests are handled cleanly.
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

const extractToken = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^bearer\s+/i.test(trimmed)) {
    return trimmed.replace(/^bearer\s+/i, "").trim();
  }
  return trimmed;
};

const isLikelyJwt = (token?: string | null) =>
  Boolean(token && token.split(".").length === 3);

const getAuthToken = (req: Request) => {
  // Prefer x-supabase-authorization because some gateways may rewrite Authorization.
  const xSupabaseAuth = extractToken(
    req.headers.get("x-supabase-authorization") ??
      req.headers.get("X-Supabase-Authorization"),
  );
  const authorization = extractToken(
    req.headers.get("authorization") ?? req.headers.get("Authorization"),
  );

  if (isLikelyJwt(xSupabaseAuth)) return xSupabaseAuth;
  if (isLikelyJwt(authorization)) return authorization;
  return xSupabaseAuth ?? authorization ?? null;
};

const stripCodeFences = (value: string) =>
  value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

const truncateText = (value: string, maxLength: number) =>
  value.length > maxLength ? value.slice(0, maxLength).trim() : value.trim();

const rateBucket: Record<string, { count: number; resetAt: number }> = {};
const RATE_LIMIT = 20;
const WINDOW_MS = 60 * 60 * 1000;
const ALLOWED_ROLES = ["super_admin", "admin", "atendente"];

type DescriptionRequest = {
  name?: string;
  category?: string;
  productType?: string;
  unit?: string;
  personalizationEnabled?: boolean;
  existingDescription?: string;
};

type OpenAiPayload = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const buildFallbackDescriptions = (body: DescriptionRequest) => {
  const name = (body.name ?? "Produto").trim() || "Produto";
  const category = body.category?.trim() ? ` da categoria ${body.category?.trim()}` : "";
  const productType = body.productType?.trim() ? ` (${body.productType?.trim()})` : "";
  const unit = body.unit?.trim() ? ` Unidade: ${body.unit?.trim()}.` : "";
  const personalization = body.personalizationEnabled
    ? " Aceita personalizacao para atender melhor o cliente."
    : "";
  const existing = body.existingDescription?.trim()
    ? ` Referencia: ${truncateText(body.existingDescription.trim(), 180)}`
    : "";

  const description = truncateText(
    `${name}${productType}${category} com acabamento de qualidade e foco em praticidade.${unit}${personalization}${existing}`.replace(/\s+/g, " "),
    320,
  );

  const shortDescription = truncateText(
    `${name}${category} com excelente custo-beneficio e qualidade.`,
    140,
  );

  const longDescription = [
    `${name}${category} foi pensado para quem busca qualidade, durabilidade e bom acabamento.`,
    `Ideal para uso no dia a dia, com foco em praticidade e apresentacao profissional.${personalization}`,
    `${unit}Produto pronto para venda e divulgacao no catalogo.`,
  ].join("\n\n");

  return { description, shortDescription, longDescription };
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== "POST") {
    return jsonResponse(corsHeaders, 405, { error: "Metodo invalido" });
  }

  try {
    const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? Deno.env.get("OPENAI_KEY") ?? "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SB_ANON_KEY") ?? "";
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[AI] Missing Supabase config");
      return jsonResponse(corsHeaders, 500, { error: "Configuracao do Supabase ausente" });
    }

    const token = getAuthToken(req);
    if (!token) {
      return jsonResponse(corsHeaders, 401, {
        error: "No authorization token",
        hint: "Envie o access token do usuario no header Authorization ou x-supabase-authorization.",
      });
    }

    if (!isLikelyJwt(token)) {
      return jsonResponse(corsHeaders, 401, {
        error: "Invalid authorization token",
        hint: "Token recebido nao e JWT de usuario.",
      });
    }

    const authHeader = `Bearer ${token}`;
    const supabase = getSupabaseClient(supabaseUrl, supabaseAnonKey, authHeader);
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      console.error("[AI] Auth getUser failed", authError?.message ?? "unknown");
      return jsonResponse(corsHeaders, 401, {
        error: "Sessao invalida",
        hint: "Faca login novamente para renovar a sessao.",
      });
    }

    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id)
      .in("role", ALLOWED_ROLES);

    if (roleError) {
      console.error("[AI] Role read error", roleError.message);
      return jsonResponse(corsHeaders, 403, { error: "Sem permissao para gerar descricao" });
    }

    if (!roleRows || roleRows.length === 0) {
      return jsonResponse(corsHeaders, 403, { error: "Sem permissao para gerar descricao" });
    }

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
    if (!name) {
      return jsonResponse(corsHeaders, 400, { error: "Nome do produto obrigatorio" });
    }

    if (!openAiKey) {
      console.error("[AI] OPENAI_API_KEY missing, using fallback description");
      return jsonResponse(corsHeaders, 200, buildFallbackDescriptions(body));
    }

    const context: string[] = [];
    if (body.category?.trim()) context.push(`Categoria: ${body.category.trim()}`);
    if (body.productType?.trim()) context.push(`Tipo: ${body.productType.trim()}`);
    if (body.unit?.trim()) context.push(`Unidade: ${body.unit.trim()}`);
    if (typeof body.personalizationEnabled === "boolean") {
      context.push(`Personalizacao: ${body.personalizationEnabled ? "sim" : "nao"}`);
    }
    if (body.existingDescription?.trim()) {
      context.push(`Descricao atual: ${body.existingDescription.trim()}`);
    }

    const prompt = [
      `Produto: ${name}`,
      ...context,
      "",
      "Gere um JSON com estas chaves obrigatorias:",
      `- description: texto comercial principal entre 180 e 320 caracteres.`,
      `- shortDescription: resumo com no maximo 140 caracteres.`,
      `- longDescription: texto de catalogo em 2 ou 3 paragrafos curtos.`,
      "",
      "Regras:",
      "- Escreva em portugues do Brasil.",
      "- Linguagem clara e objetiva.",
      "- Nao usar markdown, emojis ou listas numeradas.",
      "- Entregue somente JSON valido.",
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Voce escreve descricoes comerciais para e-commerce em portugues do Brasil. Responda somente JSON valido.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 700,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("[AI] OpenAI error", response.status, text);
      return jsonResponse(corsHeaders, 200, buildFallbackDescriptions(body));
    }

    const data = await response.json().catch(() => null) as OpenAiPayload | null;
    const rawContent = data?.choices?.[0]?.message?.content ?? "";
    const normalizedContent = stripCodeFences(rawContent);

    let description = "";
    let shortDescription = "";
    let longDescription = "";

    try {
      const parsed = JSON.parse(normalizedContent) as {
        description?: string;
        shortDescription?: string;
        longDescription?: string;
        short?: string;
        long?: string;
      };

      description = String(parsed.description ?? "").trim();
      shortDescription = String(parsed.shortDescription ?? parsed.short ?? "").trim();
      longDescription = String(parsed.longDescription ?? parsed.long ?? "").trim();
    } catch {
      longDescription = normalizedContent.trim();
      description = truncateText(longDescription, 320);
      shortDescription = truncateText(longDescription, 140);
    }

    if (!description && longDescription) {
      description = truncateText(longDescription.replace(/\s+/g, " "), 320);
    }

    if (!description) {
      description = truncateText(
        `${name} com acabamento de qualidade e foco em praticidade para o dia a dia.`,
        320,
      );
    }

    if (!longDescription && description) {
      longDescription = description;
    }

    if (!shortDescription) {
      const base = description || longDescription || name;
      shortDescription = truncateText(base.replace(/\s+/g, " "), 140);
    }

    shortDescription = truncateText(shortDescription.replace(/\s+/g, " "), 140);
    description = truncateText(description.replace(/\s+/g, " "), 320);
    longDescription = longDescription.trim();

    return jsonResponse(corsHeaders, 200, {
      description,
      shortDescription,
      longDescription,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[AI] ERROR", message);
    return jsonResponse(corsHeaders, 400, {
      error: "Falha ao gerar descricao",
      details: message,
    });
  }
});
