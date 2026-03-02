/// <reference path="../deno-types.d.ts" />
import { createClient } from "@supabase/supabase-js";

export const config = { verify_jwt: false };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_PUBLIC_KEY =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente");
}

const PIX_GATEWAYS = new Set(["MercadoPago", "PagSeguro", "PixManual"]);
const PIX_KEY_TYPES = new Set(["CPF", "CNPJ", "Email", "Telefone", "ChaveAleatoria"]);

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

const extractToken = (value: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(trimmed);
  return (bearerMatch?.[1] ?? trimmed).trim();
};

const isLikelyJwt = (token: string | null) => {
  if (!token) return false;
  return token.split(".").length === 3;
};

const getRequestAccessToken = (req: Request) => {
  const xSupabaseAuthorization = extractToken(
    req.headers.get("x-supabase-authorization") ?? req.headers.get("X-Supabase-Authorization"),
  );
  const authorization = extractToken(
    req.headers.get("authorization") ?? req.headers.get("Authorization"),
  );

  // Prefer x-supabase-authorization when present, but fall back to Authorization.
  if (isLikelyJwt(xSupabaseAuthorization)) return xSupabaseAuthorization;
  if (isLikelyJwt(authorization)) return authorization;

  return xSupabaseAuthorization ?? authorization ?? null;
};

const normalizeNullableText = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeOptionalBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value;
  return undefined;
};

const maskToken = (token: string | null) => {
  if (!token) return null;
  if (token.length <= 8) return "********";
  return `${token.slice(0, 4)}********${token.slice(-4)}`;
};

const verifyUserPassword = async (email: string, password: string) => {
  if (!SUPABASE_PUBLIC_KEY) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY/SUPABASE_ANON_KEY ausente para validar senha");
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLIC_KEY,
    },
    body: JSON.stringify({ email, password }),
  });

  return response.ok;
};

type PaymentSettingsPayload = {
  pix_enabled?: boolean;
  pix_gateway?: "MercadoPago" | "PagSeguro" | "PixManual" | null;
  pix_key_type?: "CPF" | "CNPJ" | "Email" | "Telefone" | "ChaveAleatoria" | null;
  pix_key?: string | null;
  pix_beneficiary_name?: string | null;
  mp_access_token?: string | null;
  pagseguro_token?: string | null;
  admin_password?: string;
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== "GET" && req.method !== "PATCH") {
    return jsonResponse(corsHeaders, 405, { error: "Metodo invalido" });
  }

  try {
    const supabase = getSupabaseClient();
    const token = getRequestAccessToken(req);

    if (!token) {
      return jsonResponse(corsHeaders, 401, { error: "No authorization header" });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      return jsonResponse(corsHeaders, 401, { error: "Sessao invalida" });
    }

    const userId = authData.user.id;
    const userEmail = authData.user.email;

    const { data: roleData, error: roleError } = await supabase.rpc("get_user_role", {
      _user_id: userId,
    });

    if (roleError) {
      return jsonResponse(corsHeaders, 400, { error: roleError.message });
    }

    if (roleData !== "admin") {
      return jsonResponse(corsHeaders, 403, {
        error: "Apenas administrador da loja pode configurar PIX",
      });
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      return jsonResponse(corsHeaders, 400, { error: profileError.message });
    }

    const companyId = profileData?.company_id ?? null;
    if (!companyId) {
      return jsonResponse(corsHeaders, 400, { error: "Empresa nao encontrada" });
    }

    if (req.method === "GET") {
      const [companyResult, tokensResult] = await Promise.all([
        supabase
          .from("companies")
          .select(
            "id, pix_enabled, pix_gateway, pix_key_type, pix_key, pix_beneficiary_name, mp_access_token, pagseguro_token, updated_at",
          )
          .eq("id", companyId)
          .maybeSingle(),
        supabase
          .from("company_payment_tokens")
          .select("mp_access_token, pagseguro_token")
          .eq("company_id", companyId)
          .maybeSingle(),
      ]);

      if (companyResult.error) {
        return jsonResponse(corsHeaders, 400, { error: companyResult.error.message });
      }

      const company = companyResult.data;
      if (!company) {
        return jsonResponse(corsHeaders, 404, { error: "Empresa nao encontrada" });
      }

      const mpToken = normalizeNullableText(tokensResult.data?.mp_access_token);
      const pagseguroToken = normalizeNullableText(tokensResult.data?.pagseguro_token);

      return jsonResponse(corsHeaders, 200, {
        id: company.id,
        pix_enabled: Boolean(company.pix_enabled),
        pix_gateway: company.pix_gateway,
        pix_key_type: company.pix_key_type,
        pix_key: company.pix_key,
        pix_beneficiary_name: company.pix_beneficiary_name,
        mp_access_token_masked: maskToken(mpToken) || company.mp_access_token || null,
        pagseguro_token_masked: maskToken(pagseguroToken) || company.pagseguro_token || null,
        mp_access_token_set: Boolean(mpToken),
        pagseguro_token_set: Boolean(pagseguroToken),
        updated_at: company.updated_at,
      });
    }

    const body = (await req.json().catch(() => ({}))) as PaymentSettingsPayload;

    if (body.pix_gateway !== undefined && body.pix_gateway !== null && !PIX_GATEWAYS.has(body.pix_gateway)) {
      return jsonResponse(corsHeaders, 400, { error: "Gateway PIX invalido" });
    }

    if (
      body.pix_key_type !== undefined &&
      body.pix_key_type !== null &&
      !PIX_KEY_TYPES.has(body.pix_key_type)
    ) {
      return jsonResponse(corsHeaders, 400, { error: "Tipo de chave PIX invalido" });
    }

    const tokenChangeRequested =
      Object.prototype.hasOwnProperty.call(body, "mp_access_token") ||
      Object.prototype.hasOwnProperty.call(body, "pagseguro_token");

    if (tokenChangeRequested) {
      const adminPassword = normalizeNullableText(body.admin_password);
      if (!adminPassword || !userEmail) {
        return jsonResponse(corsHeaders, 400, {
          error: "Senha atual do administrador obrigatoria para atualizar token",
        });
      }

      const passwordOk = await verifyUserPassword(userEmail, adminPassword);
      if (!passwordOk) {
        return jsonResponse(corsHeaders, 401, {
          error: "Senha do administrador invalida",
        });
      }
    }

    const companyUpdate: Record<string, unknown> = {};

    const maybePixEnabled = normalizeOptionalBoolean(body.pix_enabled);
    if (maybePixEnabled !== undefined) companyUpdate.pix_enabled = maybePixEnabled;

    if (body.pix_gateway !== undefined) {
      companyUpdate.pix_gateway = body.pix_gateway;
    }

    if (body.pix_key_type !== undefined) {
      companyUpdate.pix_key_type = body.pix_key_type;
    }

    if (Object.prototype.hasOwnProperty.call(body, "pix_key")) {
      companyUpdate.pix_key = normalizeNullableText(body.pix_key);
    }

    if (Object.prototype.hasOwnProperty.call(body, "pix_beneficiary_name")) {
      companyUpdate.pix_beneficiary_name = normalizeNullableText(body.pix_beneficiary_name);
    }

    const { data: existingTokens } = await supabase
      .from("company_payment_tokens")
      .select("mp_access_token, pagseguro_token")
      .eq("company_id", companyId)
      .maybeSingle();

    const currentMp = normalizeNullableText(existingTokens?.mp_access_token);
    const currentPagseguro = normalizeNullableText(existingTokens?.pagseguro_token);

    const nextMp = Object.prototype.hasOwnProperty.call(body, "mp_access_token")
      ? normalizeNullableText(body.mp_access_token)
      : currentMp;

    const nextPagseguro = Object.prototype.hasOwnProperty.call(body, "pagseguro_token")
      ? normalizeNullableText(body.pagseguro_token)
      : currentPagseguro;

    if (Object.prototype.hasOwnProperty.call(body, "mp_access_token")) {
      companyUpdate.mp_access_token = maskToken(nextMp);
    }

    if (Object.prototype.hasOwnProperty.call(body, "pagseguro_token")) {
      companyUpdate.pagseguro_token = maskToken(nextPagseguro);
    }

    if (Object.keys(companyUpdate).length > 0) {
      const { error: updateCompanyError } = await supabase
        .from("companies")
        .update(companyUpdate)
        .eq("id", companyId);

      if (updateCompanyError) {
        return jsonResponse(corsHeaders, 400, { error: updateCompanyError.message });
      }
    }

    if (tokenChangeRequested) {
      if (!nextMp && !nextPagseguro) {
        const { error: deleteTokenError } = await supabase
          .from("company_payment_tokens")
          .delete()
          .eq("company_id", companyId);

        if (deleteTokenError) {
          return jsonResponse(corsHeaders, 400, { error: deleteTokenError.message });
        }
      } else {
        const { error: upsertTokenError } = await supabase
          .from("company_payment_tokens")
          .upsert(
            {
              company_id: companyId,
              mp_access_token: nextMp,
              pagseguro_token: nextPagseguro,
              updated_by: userId,
            },
            { onConflict: "company_id" },
          );

        if (upsertTokenError) {
          return jsonResponse(corsHeaders, 400, { error: upsertTokenError.message });
        }
      }
    }

    const [companyResult, tokensResult] = await Promise.all([
      supabase
        .from("companies")
        .select(
          "id, pix_enabled, pix_gateway, pix_key_type, pix_key, pix_beneficiary_name, mp_access_token, pagseguro_token, updated_at",
        )
        .eq("id", companyId)
        .maybeSingle(),
      supabase
        .from("company_payment_tokens")
        .select("mp_access_token, pagseguro_token")
        .eq("company_id", companyId)
        .maybeSingle(),
    ]);

    if (companyResult.error || !companyResult.data) {
      return jsonResponse(corsHeaders, 400, {
        error: companyResult.error?.message || "Falha ao carregar configuracao",
      });
    }

    const mpToken = normalizeNullableText(tokensResult.data?.mp_access_token);
    const pagseguroToken = normalizeNullableText(tokensResult.data?.pagseguro_token);

    return jsonResponse(corsHeaders, 200, {
      id: companyResult.data.id,
      pix_enabled: Boolean(companyResult.data.pix_enabled),
      pix_gateway: companyResult.data.pix_gateway,
      pix_key_type: companyResult.data.pix_key_type,
      pix_key: companyResult.data.pix_key,
      pix_beneficiary_name: companyResult.data.pix_beneficiary_name,
      mp_access_token_masked: maskToken(mpToken) || companyResult.data.mp_access_token || null,
      pagseguro_token_masked: maskToken(pagseguroToken) || companyResult.data.pagseguro_token || null,
      mp_access_token_set: Boolean(mpToken),
      pagseguro_token_set: Boolean(pagseguroToken),
      updated_at: companyResult.data.updated_at,
    });
  } catch (error) {
    console.error("company-payment-settings error:", error);
    return jsonResponse(corsHeaders, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
