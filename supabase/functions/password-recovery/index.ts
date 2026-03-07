import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { sendSmtpEmail } from '../_shared/email.ts';

export const config = { verify_jwt: false };

type AccountType = 'store' | 'customer';

type AdminUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  raw_user_meta_data?: Record<string, unknown> | null;
};

const defaultAllowedOrigins = [
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5173',
  'http://192.168.0.221:8080',
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://localhost:8080',
];

const getAppOrigin = () => {
  const appUrl = Deno.env.get('APP_PUBLIC_URL');
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

const privateNetworkPattern =
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$|^192\.168\.\d{1,3}\.\d{1,3}$|^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/;

const isTrustedDevOrigin = (origin: string) => {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:') return false;
    const hostname = parsed.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || privateNetworkPattern.test(hostname);
  } catch {
    return false;
  }
};

const isAllowedOrigin = (origin: string) => allowedOrigins.has(origin) || isTrustedDevOrigin(origin);

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get('origin');
  const requestHeaders = req.headers.get('access-control-request-headers');
  const allowOrigin = origin && isAllowedOrigin(origin) ? origin : '*';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers':
      requestHeaders ??
      'authorization, x-client-info, apikey, content-type, x-supabase-authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};

const jsonResponse = (headers: HeadersInit, status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });

const normalizeAppUrl = () => {
  const appUrl = Deno.env.get('APP_PUBLIC_URL')?.trim();
  if (!appUrl) return 'https://ideartcloud.com.br';

  try {
    return new URL(appUrl).toString();
  } catch {
    return 'https://ideartcloud.com.br';
  }
};

const getDefaultRecoveryPath = (accountType: AccountType) =>
  accountType === 'customer' ? '/minha-conta/alterar-senha' : '/alterar-senha';

const resolveRedirectTo = (rawRedirectTo: string | null, accountType: AccountType) => {
  const appUrl = normalizeAppUrl();
  const fallback = new URL(getDefaultRecoveryPath(accountType), appUrl).toString();
  if (!rawRedirectTo) return fallback;

  try {
    const parsed = new URL(rawRedirectTo);
    if (!isAllowedOrigin(parsed.origin)) {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
};

const getSupabaseClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

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
    parsedRedirect.searchParams.set('token_hash', hashedToken);
    parsedRedirect.searchParams.set('type', verificationType);
    return parsedRedirect.toString();
  } catch {
    return actionLink;
  }
};

const getUserMetadata = (user: AdminUser | null | undefined) =>
  (user?.user_metadata ?? user?.raw_user_meta_data ?? {}) as Record<string, unknown>;

const getUserAccountType = (user: AdminUser | null | undefined): AccountType =>
  String(getUserMetadata(user).account_type || '').toLowerCase() === 'customer' ? 'customer' : 'store';

const getUserFullName = (user: AdminUser | null | undefined) => {
  const fullName = String(getUserMetadata(user).full_name || '').trim();
  return fullName || null;
};

const findUserByEmail = async (
  supabase: ReturnType<typeof getSupabaseClient>,
  email: string,
) => {
  const admin = supabase.auth?.admin as {
    getUserByEmail?: (
      email: string,
    ) => Promise<{ data?: { user?: AdminUser | null }; error?: { message: string } | null }>;
    listUsers?: (
      params?: { page?: number; perPage?: number },
    ) => Promise<{ data?: { users?: AdminUser[] }; error?: { message: string } | null }>;
  } | undefined;

  if (!admin) {
    return { user: null, error: 'Supabase admin API is unavailable' };
  }

  if (admin.getUserByEmail) {
    const { data, error } = await admin.getUserByEmail(email);
    if (error) {
      return { user: null, error: error.message };
    }
    return { user: data?.user ?? null, error: null };
  }

  if (!admin.listUsers) {
    return { user: null, error: 'Supabase admin lookup by email is unavailable' };
  }

  const normalizedEmail = email.toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error) {
      return { user: null, error: error.message };
    }

    const users = data?.users ?? [];
    const match = users.find((candidate) => candidate.email?.toLowerCase() === normalizedEmail);
    if (match) {
      return { user: match, error: null };
    }

    if (users.length < perPage) {
      break;
    }
  }

  return { user: null, error: null };
};

const buildRecoveryMessage = (
  accountType: AccountType,
  recoveryLink: string,
  fullName: string | null,
) => {
  const greeting = fullName ? `Ola ${fullName},` : 'Ola,';
  const accountLabel = accountType === 'customer' ? 'conta do cliente' : 'acesso da loja';
  const buttonLabel = accountType === 'customer' ? 'Criar nova senha da conta' : 'Criar nova senha da loja';
  const subject =
    accountType === 'customer'
      ? 'Recuperação de senha - Conta do cliente'
      : 'Recuperação de senha - Loja';

  const text = [
    'Solicitação de recuperação de senha',
    '',
    greeting,
    '',
    `Recebemos um pedido para redefinir a senha da sua ${accountLabel}.`,
    `Clique no link para criar uma nova senha: ${recoveryLink}`,
    '',
    'Se você não solicitou, ignore este e-mail.',
  ].join('\n');

  const html = `
    <div style="font-family:Arial, sans-serif;color:#0f172a;">
      <h2>Recuperação de senha</h2>
      <p>${greeting}</p>
      <p>Recebemos um pedido para redefinir a senha da sua ${accountLabel}.</p>
      <p>
        <a href="${recoveryLink}" style="display:inline-block;padding:12px 18px;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px;">
          ${buttonLabel}
        </a>
      </p>
      <p style="font-size:12px;color:#64748b;">Se você não solicitou, ignore este e-mail.</p>
    </div>
  `;

  return { subject, text, html };
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 });
  if (req.method !== 'POST') return jsonResponse(corsHeaders, 405, { error: 'Método inválido' });

  try {
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      accountType?: string;
      redirectTo?: string;
    };

    const email = body.email?.trim().toLowerCase();
    const requestedAccountType: AccountType =
      body.accountType?.trim().toLowerCase() === 'customer' ? 'customer' : 'store';
    if (!email) {
      return jsonResponse(corsHeaders, 400, { error: 'E-mail obrigatório' });
    }

    const supabase = getSupabaseClient();
    const { user, error: lookupError } = await findUserByEmail(supabase, email);

    if (lookupError) {
      console.error('[password-recovery] user lookup error', lookupError);
      return jsonResponse(corsHeaders, 500, { error: 'Falha ao processar a recuperação de senha.' });
    }

    if (!user) {
      return jsonResponse(corsHeaders, 200, { ok: true, status: 'ignored' });
    }

    const actualAccountType = getUserAccountType(user);
    if (actualAccountType !== requestedAccountType) {
      return jsonResponse(corsHeaders, 200, { ok: true, status: 'ignored' });
    }

    const redirectTo = resolveRedirectTo(body.redirectTo?.trim() || null, actualAccountType);
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });

    if (error) {
      console.warn('[password-recovery] generateLink error', error.message);
      return jsonResponse(corsHeaders, 500, { error: 'Falha ao gerar o link de recuperação.' });
    }

    const recoveryLink = buildPublicRecoveryLink(redirectTo, data);
    if (!recoveryLink) {
      console.warn('[password-recovery] action link missing');
      return jsonResponse(corsHeaders, 500, { error: 'Falha ao gerar o link de recuperação.' });
    }

    const { subject, text, html } = buildRecoveryMessage(
      actualAccountType,
      recoveryLink,
      getUserFullName(user),
    );

    const sent = await sendSmtpEmail({
      to: email,
      subject,
      text,
      html,
    });

    if (!sent) {
      return jsonResponse(corsHeaders, 500, { error: 'Falha ao enviar o e-mail de recuperação.' });
    }

    return jsonResponse(corsHeaders, 200, { ok: true, status: 'sent' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(corsHeaders, 500, { error: message });
  }
});
