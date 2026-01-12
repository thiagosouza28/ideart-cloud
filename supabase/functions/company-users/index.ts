/// <reference path="../deno-types.d.ts" />
import { createClient } from "@supabase/supabase-js";

export const config = { verify_jwt: false };

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

type CreateUserPayload = {
  email?: string;
  password?: string;
  full_name?: string;
  role?: string;
  company_id?: string;
};

const allowedRoles = new Set(["super_admin", "admin", "atendente", "caixa", "producao"]);

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
    const authHeader = req.headers.get("x-supabase-authorization") ?? req.headers.get("Authorization");

    if (!authHeader) {
      return jsonResponse(corsHeaders, 401, { error: "No authorization header" });
    }

    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      return jsonResponse(corsHeaders, 401, { error: "Sessão inválida" });
    }

    const requesterId = authData.user.id;

    // Check requester role
    const { data: requesterRoleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", requesterId)
      .maybeSingle();

    const requesterRole = requesterRoleData?.role;
    const isSuperAdmin = requesterRole === "super_admin";
    const isAdmin = requesterRole === "admin";

    if (!isSuperAdmin && !isAdmin) {
      return jsonResponse(corsHeaders, 403, { error: "Not authorized" });
    }

    // Parse body
    const body = (await req.json().catch(() => ({}))) as CreateUserPayload;
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    const fullName = body.full_name?.trim();
    const role = body.role?.trim();
    const requestedCompanyId = body.company_id?.trim();

    if (!email || !password || !fullName || !role) {
      return jsonResponse(corsHeaders, 400, { error: "Dados obrigatórios ausentes" });
    }

    if (!allowedRoles.has(role)) {
      return jsonResponse(corsHeaders, 400, { error: "Cargo inválido" });
    }

    // Determine target company_id
    let companyIdToUse: string | null = null;

    if (isSuperAdmin) {
      // Super Admin can specify any company or none (system user)
      companyIdToUse = requestedCompanyId || null;
    } else {
      // Regular admin MUST stay in their company
      const { data: requesterProfile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", requesterId)
        .maybeSingle();

      companyIdToUse = requesterProfile?.company_id || null;

      if (!companyIdToUse) {
        return jsonResponse(corsHeaders, 400, { error: "Empresa do administrador não encontrada" });
      }

      if (requestedCompanyId && requestedCompanyId !== companyIdToUse) {
        return jsonResponse(corsHeaders, 403, { error: "Você só pode criar usuários para sua própria empresa" });
      }
    }

    // Create the user
    const { data: createdUser, error: createError } = await supabase.auth.admin
      .createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role },
      });

    if (createError || !createdUser.user?.id) {
      return jsonResponse(corsHeaders, 400, {
        error: createError?.message ?? "Falha ao criar usuário",
      });
    }

    const newUserId = createdUser.user.id;

    // 1. Link in profiles table
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: newUserId,
        full_name: fullName,
        company_id: companyIdToUse,
      });

    if (profileError) {
      await supabase.auth.admin.deleteUser(newUserId);
      return jsonResponse(corsHeaders, 400, { error: "Falha ao criar perfil do usuário: " + profileError.message });
    }

    // 2. Set role
    const { error: roleError } = await supabase
      .from("user_roles")
      .upsert({ user_id: newUserId, role }, { onConflict: "user_id,role" });

    if (roleError) {
      await supabase.auth.admin.deleteUser(newUserId);
      return jsonResponse(corsHeaders, 400, { error: "Falha ao definir cargo do usuário: " + roleError.message });
    }

    // 3. Optional join table
    if (companyIdToUse) {
      await supabase
        .from("company_users")
        .insert({ company_id: companyIdToUse, user_id: newUserId });
      // We ignore errors here as it's an optional linking
    }

    return jsonResponse(corsHeaders, 200, { user_id: newUserId });
  } catch (error) {
    console.error("Erro em company-users:", error);
    return jsonResponse(corsHeaders, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});
