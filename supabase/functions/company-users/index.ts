/// <reference path="../deno-types.d.ts" />
import { createClient } from "@supabase/supabase-js";
import { sendSmtpEmail } from "../_shared/email.ts";

export const config = { verify_jwt: false };

type AccountType = "store" | "customer";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente");
}

const getCorsHeaders = (origin: string | null) => {
  // Echo the origin back if it's provided, otherwise allow all
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
};

const jsonResponse = (headers: Record<string, string>, status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });

const getSupabaseClient = () =>
  createClient(
    SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

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

  // Prefer user JWT when both headers are present.
  if (isLikelyJwt(xSupabaseAuthorization)) return xSupabaseAuthorization;
  if (isLikelyJwt(authorization)) return authorization;

  return xSupabaseAuthorization ?? authorization ?? null;
};

const getAuthenticatedUser = async (
  supabase: ReturnType<typeof getSupabaseClient>,
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
    return { user: null, errorDetail: authError?.message ?? "Invalid session" };
  }

  const userClient = createClient(SUPABASE_URL!, publicKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: fallbackAuthData, error: fallbackAuthError } = await userClient.auth.getUser();
  if (!fallbackAuthError && fallbackAuthData.user) {
    return { user: fallbackAuthData.user, errorDetail: authError?.message ?? null };
  }

  const detail = [authError?.message, fallbackAuthError?.message].filter(Boolean).join(" | ");
  return { user: null, errorDetail: detail || "Invalid session" };
};

type CreateUserPayload = {
  action?: string;
  email?: string;
  password?: string;
  full_name?: string;
  role?: string;
  company_id?: string;
  user_id?: string;
  redirectTo?: string;
};

const allowedRoles = new Set(["super_admin", "admin", "financeiro", "atendente", "caixa", "producao"]);

const isAlreadyRegisteredError = (message?: string | null) => {
  const normalized = String(message || "").toLowerCase();
  return normalized.includes("already") && (normalized.includes("registered") || normalized.includes("exists"));
};

const isSuperAdminUser = async (
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string,
) => {
  const { data } = await supabase
    .from("super_admin_users")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(data?.id);
};

const findUserByEmail = async (
  supabase: ReturnType<typeof getSupabaseClient>,
  email: string,
) => {
  let page = 1;
  const perPage = 200;

  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    const found = users.find((candidate) => (candidate.email || "").toLowerCase() === email);
    if (found) return found;

    if (users.length < perPage) {
      return null;
    }
    page += 1;
  }
};

const getRequesterCompanyId = async (
  supabase: ReturnType<typeof getSupabaseClient>,
  requesterId: string,
) => {
  const { data: requesterProfile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", requesterId)
    .maybeSingle();

  return requesterProfile?.company_id || null;
};

const canManageTargetUser = async (
  supabase: ReturnType<typeof getSupabaseClient>,
  isSuperAdmin: boolean,
  requesterCompanyId: string | null,
  targetUserId: string,
) => {
  if (isSuperAdmin) return true;
  if (!requesterCompanyId) return false;

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", targetUserId)
    .maybeSingle();

  return Boolean(targetProfile?.company_id && targetProfile.company_id === requesterCompanyId);
};

const normalizeAppUrl = () => {
  const appUrl = Deno.env.get("APP_PUBLIC_URL")?.trim();
  if (!appUrl) return "https://ideartcloud.com.br";

  try {
    return new URL(appUrl).toString();
  } catch {
    return "https://ideartcloud.com.br";
  }
};

const getDefaultRecoveryPath = (accountType: AccountType) =>
  accountType === "customer" ? "/minha-conta/alterar-senha" : "/alterar-senha";

const resolveRedirectTo = (rawRedirectTo: string | null, accountType: AccountType) => {
  const fallback = new URL(getDefaultRecoveryPath(accountType), normalizeAppUrl()).toString();
  if (!rawRedirectTo) return fallback;

  try {
    return new URL(rawRedirectTo).toString();
  } catch {
    return fallback;
  }
};

const getLinkProperties = (linkData: unknown) => {
  const data = linkData as Record<string, any> | null;
  return {
    actionLink: data?.action_link ?? data?.properties?.action_link ?? data?.properties?.actionLink ?? null,
    hashedToken: data?.hashed_token ?? data?.properties?.hashed_token ?? null,
    verificationType:
      data?.verification_type ?? data?.properties?.verification_type ?? data?.properties?.verificationType ?? null,
  };
};

const buildPublicRecoveryLink = (redirectTo: string, linkData: unknown) => {
  const { actionLink, hashedToken, verificationType } = getLinkProperties(linkData);
  if (!actionLink) return null;
  if (!hashedToken || !verificationType) return actionLink;

  try {
    const parsedRedirect = new URL(redirectTo);
    parsedRedirect.searchParams.set("token_hash", hashedToken);
    parsedRedirect.searchParams.set("type", verificationType);
    return parsedRedirect.toString();
  } catch {
    return actionLink;
  }
};

const sendRecoveryEmail = async ({
  email,
  recoveryLink,
  fullName,
}: {
  email: string;
  recoveryLink: string;
  fullName?: string | null;
}) => {
  const displayName = fullName?.trim();
  const greeting = displayName ? `Olá ${displayName},` : "Olá,";

  const text = [
    "Redefinição de senha",
    "",
    greeting,
    "",
    "Um administrador da sua loja solicitou a redefinição do seu acesso.",
    `Clique no link para criar uma nova senha: ${recoveryLink}`,
    "",
    "Se você não esperava este e-mail, ignore a mensagem.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial, sans-serif;color:#0f172a;">
      <h2>Redefinição de senha</h2>
      <p>${greeting}</p>
      <p>Um administrador da sua loja solicitou a redefinição do seu acesso.</p>
      <p>
        <a href="${recoveryLink}" style="display:inline-block;padding:12px 18px;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px;">
          Criar nova senha
        </a>
      </p>
      <p style="font-size:12px;color:#64748b;">Se você não esperava este e-mail, ignore a mensagem.</p>
    </div>
  `;

  return sendSmtpEmail({
    to: email,
    subject: "Redefinição de senha - IDEART CLOUD",
    text,
    html,
  });
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== "POST") {
    return jsonResponse(corsHeaders, 405, { error: "Método inválido" });
  }

  try {
    const supabase = getSupabaseClient();
    const token = getRequestAccessToken(req);

    if (!token) {
      return jsonResponse(corsHeaders, 401, { error: "No authorization header" });
    }

    const { user: authUser, errorDetail } = await getAuthenticatedUser(supabase, token);
    if (!authUser) {
      return jsonResponse(corsHeaders, 401, {
        error: "Sessão inválida",
        detail: errorDetail,
      });
    }

    const requesterId = authUser.id;

    // Check requester role
    const isSuperAdmin = await isSuperAdminUser(supabase, requesterId);
    const { data: requesterRoleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", requesterId)
      .maybeSingle();

    const requesterRole = requesterRoleData?.role ?? null;
    const isAdmin = requesterRole === "admin";

    if (!isSuperAdmin && !isAdmin) {
      return jsonResponse(corsHeaders, 403, { error: "Not authorized" });
    }

    // Parse body
    const body = (await req.json().catch(() => ({}))) as CreateUserPayload;
    const action = body.action?.trim().toLowerCase() || "create";
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    const fullName = body.full_name?.trim();
    const role = body.role?.trim();
    const requestedCompanyId = body.company_id?.trim();
    const targetUserId = body.user_id?.trim();
    const redirectTo = body.redirectTo?.trim() || null;

    const requesterCompanyId = isSuperAdmin
      ? null
      : await getRequesterCompanyId(supabase, requesterId);

    if (action === "send_reset_email") {
      if (!targetUserId) {
        return jsonResponse(corsHeaders, 400, { error: "Usuário é obrigatório" });
      }

      const canManage = await canManageTargetUser(
        supabase,
        isSuperAdmin,
        requesterCompanyId,
        targetUserId,
      );

      if (!canManage) {
        return jsonResponse(corsHeaders, 403, {
          error: "Você só pode enviar redefinição para usuários da sua própria loja",
        });
      }

      const { data: targetProfile } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", targetUserId)
        .maybeSingle();

      const { data: userData, error: getUserError } = await supabase.auth.admin.getUserById(targetUserId);
      if (getUserError) {
        return jsonResponse(corsHeaders, 400, { error: "Não foi possível localizar o usuário" });
      }

      const userEmail = userData?.user?.email?.trim().toLowerCase();
      if (!userEmail) {
        return jsonResponse(corsHeaders, 400, { error: "O usuário não possui e-mail cadastrado" });
      }

      const resolvedRedirectTo = resolveRedirectTo(redirectTo, "store");
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email: userEmail,
        options: { redirectTo: resolvedRedirectTo },
      });

      if (linkError) {
        return jsonResponse(corsHeaders, 400, {
          error: "Falha ao gerar link de redefinição: " + linkError.message,
        });
      }

      const recoveryLink = buildPublicRecoveryLink(resolvedRedirectTo, linkData);
      if (!recoveryLink) {
        return jsonResponse(corsHeaders, 400, { error: "Falha ao montar o link de redefinição" });
      }

      const sent = await sendRecoveryEmail({
        email: userEmail,
        recoveryLink,
        fullName: targetProfile?.full_name || String(userData?.user?.user_metadata?.full_name || "") || null,
      });

      if (!sent) {
        return jsonResponse(corsHeaders, 500, { error: "Falha ao enviar o e-mail de redefinição" });
      }

      return jsonResponse(corsHeaders, 200, {
        user_id: targetUserId,
        email: userEmail,
        email_sent: true,
      });
    }

    if (action === "reset_password") {
      if (!targetUserId || !password) {
        return jsonResponse(corsHeaders, 400, { error: "Usuário e senha são obrigatórios" });
      }

      if (password.length < 6) {
        return jsonResponse(corsHeaders, 400, { error: "A senha deve ter pelo menos 6 caracteres" });
      }

      const canManage = await canManageTargetUser(
        supabase,
        isSuperAdmin,
        requesterCompanyId,
        targetUserId,
      );

      if (!canManage) {
        return jsonResponse(corsHeaders, 403, {
          error: "Você só pode redefinir a senha de usuários da sua própria loja",
        });
      }

      const { error: resetPasswordError } = await supabase.auth.admin.updateUserById(targetUserId, {
        password,
        email_confirm: true,
      });

      if (resetPasswordError) {
        return jsonResponse(corsHeaders, 400, {
          error: "Falha ao redefinir senha: " + resetPasswordError.message,
        });
      }

      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update({
          password_defined: true,
          must_change_password: false,
          force_password_change: false,
        })
        .eq("id", targetUserId);

      if (profileUpdateError) {
        return jsonResponse(corsHeaders, 400, {
          error: "Senha redefinida, mas não foi possível atualizar o perfil: " + profileUpdateError.message,
        });
      }

      return jsonResponse(corsHeaders, 200, {
        user_id: targetUserId,
        password_changed: true,
      });
    }

    if (!email || !password || !fullName || !role) {
      return jsonResponse(corsHeaders, 400, { error: "Dados obrigatórios ausentes" });
    }

    if (!allowedRoles.has(role)) {
      return jsonResponse(corsHeaders, 400, { error: "Cargo inválido" });
    }

    if (!isSuperAdmin && role === "super_admin") {
      return jsonResponse(corsHeaders, 403, { error: "Apenas super admin pode criar outro super admin" });
    }

    // Determine target company_id
    let companyIdToUse: string | null = null;

    if (isSuperAdmin) {
      // Super Admin can specify any company or none (system user)
      companyIdToUse = requestedCompanyId || null;
    } else {
      // Regular admin MUST stay in their company
      companyIdToUse = requesterCompanyId;

      if (!companyIdToUse) {
        return jsonResponse(corsHeaders, 400, { error: "Empresa do administrador não encontrada" });
      }

      if (requestedCompanyId && requestedCompanyId !== companyIdToUse) {
        return jsonResponse(corsHeaders, 403, { error: "Você só pode criar usuários para a sua própria empresa" });
      }
    }

    // Create user (or relink/update if already exists)
    let newUserId: string | null = null;
    let createdNow = false;

    const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role,
        account_type: "store_user",
      },
    });

    if (!createError && createdUser.user?.id) {
      newUserId = createdUser.user.id;
      createdNow = true;
    } else if (isAlreadyRegisteredError(createError?.message)) {
      const existingUser = await findUserByEmail(supabase, email);
      if (!existingUser?.id) {
        return jsonResponse(corsHeaders, 400, {
          error: "Usuário já cadastrado, mas não foi possível localizá-lo.",
        });
      }

      const existingMetadata = (existingUser.user_metadata || {}) as Record<string, unknown>;
      const { error: updateUserError } = await supabase.auth.admin.updateUserById(existingUser.id, {
        password,
        email_confirm: true,
        user_metadata: {
          ...existingMetadata,
          full_name: fullName,
          role,
          account_type: "store_user",
        },
      });

      if (updateUserError) {
        return jsonResponse(corsHeaders, 400, {
          error: `Falha ao atualizar usuario existente: ${updateUserError.message}`,
        });
      }

      newUserId = existingUser.id;
    } else {
      return jsonResponse(corsHeaders, 400, {
        error: createError?.message ?? "Falha ao criar usuario",
      });
    }

    if (!newUserId) {
      return jsonResponse(corsHeaders, 400, { error: "Falha ao resolver usuario criado" });
    }

    // 1) Link profile to company
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: newUserId,
        full_name: fullName,
        email,
        company_id: companyIdToUse,
        must_complete_company: false,
        must_complete_onboarding: false,
        must_change_password: false,
        force_password_change: false,
        password_defined: true,
      }, { onConflict: "id" });

    if (profileError) {
      if (createdNow) await supabase.auth.admin.deleteUser(newUserId);
      return jsonResponse(corsHeaders, 400, { error: "Falha ao criar perfil do usuario: " + profileError.message });
    }

    // 2) Keep role stores in sync
    if (role === "super_admin") {
      const { error: clearStoreRolesError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", newUserId);

      if (clearStoreRolesError) {
        if (createdNow) await supabase.auth.admin.deleteUser(newUserId);
        return jsonResponse(corsHeaders, 400, { error: "Falha ao limpar cargos da loja: " + clearStoreRolesError.message });
      }

      const { error: upsertSuperAdminError } = await supabase
        .from("super_admin_users")
        .upsert({ user_id: newUserId }, { onConflict: "user_id" });

      if (upsertSuperAdminError) {
        if (createdNow) await supabase.auth.admin.deleteUser(newUserId);
        return jsonResponse(corsHeaders, 400, { error: "Falha ao definir super admin: " + upsertSuperAdminError.message });
      }
    } else {
      const { error: clearSuperAdminError } = await supabase
        .from("super_admin_users")
        .delete()
        .eq("user_id", newUserId);

      if (clearSuperAdminError) {
        if (createdNow) await supabase.auth.admin.deleteUser(newUserId);
        return jsonResponse(corsHeaders, 400, { error: "Falha ao limpar perfil super admin: " + clearSuperAdminError.message });
      }

      const { error: clearRoleError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", newUserId);

      if (clearRoleError) {
        if (createdNow) await supabase.auth.admin.deleteUser(newUserId);
        return jsonResponse(corsHeaders, 400, { error: "Falha ao limpar cargos existentes: " + clearRoleError.message });
      }

      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({ user_id: newUserId, role });

      if (roleError) {
        if (createdNow) await supabase.auth.admin.deleteUser(newUserId);
        return jsonResponse(corsHeaders, 400, { error: "Falha ao definir cargo do usuario: " + roleError.message });
      }
    }

    // 3) Keep company_users in sync
    if (companyIdToUse) {
      const { error: companyLinkError } = await supabase
        .from("company_users")
        .upsert({ company_id: companyIdToUse, user_id: newUserId }, { onConflict: "company_id,user_id" });

      if (companyLinkError) {
        if (createdNow) await supabase.auth.admin.deleteUser(newUserId);
        return jsonResponse(corsHeaders, 400, { error: "Falha ao vincular usuario a empresa: " + companyLinkError.message });
      }
    } else {
      const { error: unlinkCompanyError } = await supabase
        .from("company_users")
        .delete()
        .eq("user_id", newUserId);

      if (unlinkCompanyError) {
        if (createdNow) await supabase.auth.admin.deleteUser(newUserId);
        return jsonResponse(corsHeaders, 400, { error: "Falha ao remover vinculo de empresa: " + unlinkCompanyError.message });
      }
    }

    return jsonResponse(corsHeaders, 200, { user_id: newUserId, created_now: createdNow });
  } catch (error) {
    console.error("Erro em company-users:", error);
    return jsonResponse(corsHeaders, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});
