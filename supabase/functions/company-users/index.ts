// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export const config = { verify_jwt: false };

const defaultAllowedOrigins = [
  "http://192.168.0.221:8080",
  "http://localhost:8080",
  "https://ideartcloud.com.br",
  "https://www.ideartcloud.com.br",
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

  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": requestHeaders ??
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

const getSupabaseClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

type CreateUserPayload = {
  email?: string;
  password?: string;
  full_name?: string;
  role?: string;
  company_id?: string;
};

const allowedRoles = new Set(["admin", "atendente", "caixa", "producao"]);

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  if (req.method !== "POST") {
    return jsonResponse(corsHeaders, 405, { error: "Invalid method" });
  }

  const body = (await req.json().catch(() => ({}))) as CreateUserPayload;
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const fullName = body.full_name?.trim();
  const role = body.role?.trim();
  const requestedCompanyId = body.company_id?.trim();

  if (!email || !password || !fullName || !role) {
    return jsonResponse(corsHeaders, 400, { error: "Dados obrigatorios ausentes" });
  }

  if (password.length < 6) {
    return jsonResponse(corsHeaders, 400, { error: "Senha deve ter pelo menos 6 caracteres" });
  }

  if (!allowedRoles.has(role)) {
    return jsonResponse(corsHeaders, 400, { error: "Cargo invalido" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse(corsHeaders, 400, { error: "Missing Supabase config" });
    }

    const authHeader = req.headers.get("x-supabase-authorization") ??
      req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(corsHeaders, 401, { error: "No authorization header" });
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(
      token,
    );
    if (authError || !authData.user) {
      return jsonResponse(corsHeaders, 401, { error: "Invalid session" });
    }

    const requesterId = authData.user.id;
    const { data: requesterRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", requesterId)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();

    if (!requesterRole) {
      return jsonResponse(corsHeaders, 403, { error: "Not authorized" });
    }

    const { data: requesterProfile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", requesterId)
      .maybeSingle();

    const companyId = requesterProfile?.company_id;
    if (!companyId) {
      return jsonResponse(corsHeaders, 400, { error: "Empresa nao encontrada" });
    }

    if (requestedCompanyId && requestedCompanyId !== companyId) {
      return jsonResponse(corsHeaders, 403, { error: "Empresa invalida" });
    }

    // Cria o usuario e ja vincula a empresa/role para evitar contas orfas.
    const { data: createdUser, error: createError } = await supabase.auth.admin
      .createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

    if (createError || !createdUser.user?.id) {
      return jsonResponse(corsHeaders, 400, {
        error: createError?.message ?? "Falha ao criar usuario",
      });
    }

    const newUserId = createdUser.user.id;

    // Helper for rollback
    const rollbackUser = async (reason: string) => {
      console.log(`Rolling back user ${newUserId} due to: ${reason}`);
      await supabase.auth.admin.deleteUser(newUserId);
    };

    // 1. Vincula na tabela profiles (usada pelo AuthContext principal)
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: newUserId,
        full_name: fullName,
        company_id: companyId,
      }, { onConflict: "id" });

    if (profileError) {
      await rollbackUser("Profile update failed: " + profileError.message);
      return jsonResponse(corsHeaders, 400, { error: "Falha ao criar perfil do usuário" });
    }

    // 2. Define o cargo em user_roles
    await supabase.from("user_roles").delete().eq("user_id", newUserId);
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({ user_id: newUserId, role });

    if (roleError) {
      await rollbackUser("Role assignment failed: " + roleError.message);
      return jsonResponse(corsHeaders, 400, { error: "Falha ao definir cargo do usuário" });
    }

    // 3. Garante vínculo na tabela company_users (redundância e permissão explicita)
    // Tenta inserir, ignorando erro se a tabela não existir (mas deveria existir)
    const { error: joinError } = await supabase
      .from("company_users")
      .insert({ company_id: companyId, user_id: newUserId });

    if (joinError) {
      // Se for erro de constraint, talvez já tenha inserido via trigger (se houver). 
      // Se for outro erro, logamos, mas não cancelamos tudo só por isso se o profile já está certo.
      console.error("Warning: Failed to insert into company_users", joinError);
      // Não faz rollback aqui para não ser destrutivo se o profile.company_id já funcionou
    }

    return jsonResponse(corsHeaders, 200, { user_id: newUserId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(corsHeaders, 400, { error: message });
  }
});
