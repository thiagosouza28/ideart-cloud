import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { sendSmtpEmail } from '../_shared/email.ts';

export const config = { verify_jwt: false };

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

const getDefaultRecoveryPath = (accountType: 'store' | 'customer') =>
  accountType === 'customer' ? '/minha-conta/alterar-senha' : '/alterar-senha';

const resolveRedirectTo = (
  rawRedirectTo: string | null,
  accountType: 'store' | 'customer',
) => {
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
    const accountType = body.accountType?.trim().toLowerCase() === 'customer' ? 'customer' : 'store';
    if (!email) return jsonResponse(corsHeaders, 400, { error: 'E-mail obrigatório' });

    const redirectTo = resolveRedirectTo(body.redirectTo?.trim() || null, accountType);
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });

    if (error) {
      console.warn('[password-recovery] generateLink error', error.message);
      return jsonResponse(corsHeaders, 200, { ok: true });
    }

    const actionLink =
      (data as any)?.action_link ??
      (data as any)?.properties?.action_link ??
      (data as any)?.properties?.actionLink ??
      null;

    if (!actionLink) {
      console.warn('[password-recovery] action link missing');
      return jsonResponse(corsHeaders, 200, { ok: true });
    }

    const text = [
      'Solicitação de recuperação de senha',
      '',
      `Clique no link para criar uma nova senha: ${actionLink}`,
      '',
      'Se você não solicitou, ignore este e-mail.',
    ].join('\n');

    const html = `
      <div style="font-family:Arial, sans-serif;color:#0f172a;">
        <h2>Recuperação de senha</h2>
        <p>Clique no botão abaixo para criar uma nova senha.</p>
        <p>
          <a href="${actionLink}" style="display:inline-block;padding:12px 18px;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px;">
            Criar nova senha
          </a>
        </p>
        <p style="font-size:12px;color:#64748b;">Se você não solicitou, ignore este e-mail.</p>
      </div>
    `;

    await sendSmtpEmail({
      to: email,
      subject: 'Recuperação de senha - IDEART CLOUD',
      text,
      html,
    });

    return jsonResponse(corsHeaders, 200, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(corsHeaders, 500, { error: message });
  }
});
