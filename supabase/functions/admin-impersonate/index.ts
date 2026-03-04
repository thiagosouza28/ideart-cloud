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
    req.headers.get("x-supabase-authorization") ??
      req.headers.get("X-Supabase-Authorization"),
  );
  const authorization = extractToken(
    req.headers.get("authorization") ?? req.headers.get("Authorization"),
  );

  // Prefer the user JWT when available.
  if (isLikelyJwt(xSupabaseAuthorization)) return xSupabaseAuthorization;
  if (isLikelyJwt(authorization)) return authorization;

  return xSupabaseAuthorization ?? authorization ?? null;
};

const getAuthenticatedUser = async (
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  token: string,
) => {
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (!authError && authData.user) {
    return { user: authData.user, errorDetail: null as string | null };
  }

  const publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    "";
  if (!publicKey) {
    return {
      user: null,
      errorDetail: authError?.message ?? "Invalid session",
    };
  }

  const userClient = createClient(supabaseUrl, publicKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: fallbackAuthData, error: fallbackAuthError } = await userClient.auth.getUser();
  if (!fallbackAuthError && fallbackAuthData.user) {
    return { user: fallbackAuthData.user, errorDetail: authError?.message ?? null };
  }

  const detail = [
    authError?.message,
    fallbackAuthError?.message,
  ].filter(Boolean).join(" | ");

  return {
    user: null,
    errorDetail: detail || "Invalid session",
  };
};

const getRequestIp = (req: Request) => {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const direct = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip");
  return direct?.trim() || null;
};

const findUserByEmail = async (
  supabase: ReturnType<typeof createClient>,
  email: string,
) => {
  const admin = supabase.auth?.admin as {
    getUserByEmail?: (
      email: string,
    ) => Promise<{ data?: { user?: { id: string; email?: string | null } | null }; error?: { message: string } | null }>;
    listUsers?: (
      params?: { page?: number; perPage?: number },
    ) => Promise<{ data?: { users?: { id: string; email?: string | null }[] }; error?: { message: string } | null }>;
  } | undefined;

  if (!admin) {
    return { user: null, error: "Supabase admin API is unavailable" };
  }

  if (admin.getUserByEmail) {
    const { data, error } = await admin.getUserByEmail(email);
    if (error) {
      return { user: null, error: error.message };
    }
    return { user: data?.user ?? null, error: null };
  }

  if (!admin.listUsers) {
    return { user: null, error: "Supabase admin lookup by email is unavailable" };
  }

  const normalizedEmail = email.toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error) {
      return { user: null, error: error.message };
    }

    const users = data?.users ?? [];
    const match = users.find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (match) {
      return { user: match, error: null };
    }

    if (users.length < perPage) {
      break;
    }
  }

  return { user: null, error: null };
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

    const token = getRequestAccessToken(req);
    if (!token) {
      return jsonResponse(corsHeaders, 401, { error: "No authorization header" });
    }

    const { user: authUser, errorDetail } = await getAuthenticatedUser(
      supabase,
      supabaseUrl,
      token,
    );
    if (!authUser) {
      return jsonResponse(corsHeaders, 401, {
        error: "Invalid session",
        detail: errorDetail,
      });
    }

    const { data: roleFromRpc } = await supabase.rpc("get_user_role", {
      _user_id: authUser.id,
    });

    const { data: roleData } = roleFromRpc === "super_admin"
      ? { data: { id: authUser.id } }
      : await supabase
        .from("super_admin_users")
        .select("id")
        .eq("user_id", authUser.id)
        .maybeSingle();

    if (!roleData) {
      return jsonResponse(corsHeaders, 403, { error: "Not authorized" });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!email) {
      return jsonResponse(corsHeaders, 400, { error: "email is required" });
    }

    const rawRedirectTo = String(body?.redirect_to ?? "").trim();
    let redirectTo: string | undefined;
    if (rawRedirectTo) {
      try {
        const parsed = new URL(rawRedirectTo);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
          redirectTo = rawRedirectTo;
        }
      } catch {
        return jsonResponse(corsHeaders, 400, { error: "Invalid redirect_to URL" });
      }
    }

    const { user: targetUser, error: targetLookupError } = await findUserByEmail(supabase, email);
    if (targetLookupError) {
      return jsonResponse(corsHeaders, 400, { error: targetLookupError });
    }

    if (!targetUser) {
      return jsonResponse(corsHeaders, 404, { error: "User not found" });
    }

    if (targetUser.id === authUser.id) {
      return jsonResponse(corsHeaders, 400, { error: "Cannot impersonate yourself" });
    }

    const { data: targetRole } = await supabase
      .from("super_admin_users")
      .select("id")
      .eq("user_id", targetUser.id)
      .maybeSingle();

    if (targetRole) {
      return jsonResponse(corsHeaders, 403, { error: "Target user is not allowed" });
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      ...(redirectTo ? { options: { redirectTo } } : {}),
    });

    if (linkError) {
      return jsonResponse(corsHeaders, 400, { error: linkError.message });
    }

    const tokenValue = linkData?.properties?.email_otp;
    const actionLink = linkData?.properties?.action_link;
    const tokenHash = linkData?.properties?.hashed_token ?? null;
    const verificationType = linkData?.properties?.verification_type ?? "magiclink";
    if (!tokenValue) {
      return jsonResponse(corsHeaders, 400, { error: "Failed to generate impersonation token" });
    }

    const ip = getRequestIp(req);
    const { error: logError } = await supabase
      .from("admin_access_logs")
      .insert({
        admin_id: authUser.id,
        client_id: targetUser.id,
        client_email: email,
        ip,
      });

    if (logError) {
      console.error("[admin-impersonate] audit log insert failed", logError);
    }

    return jsonResponse(corsHeaders, 200, {
      email,
      user_id: targetUser.id,
      token: tokenValue,
      action_link: actionLink ?? null,
      token_hash: tokenHash,
      verification_type: verificationType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(corsHeaders, 400, { error: message });
  }
});
