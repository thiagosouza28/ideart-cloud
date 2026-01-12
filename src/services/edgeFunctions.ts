import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { isInvalidRefreshTokenError, resetAuthSession, wasAuthResetRecently } from '@/lib/auth';

type InvokeOptions = {
  method?: string;
  path?: string;
  requireAuth?: boolean;
};

const SESSION_EXPIRY_BUFFER_MS = 60_000;
const REFRESH_FAILURE_COOLDOWN_MS = 30_000;

let refreshPromise: Promise<Session | null> | null = null;
let lastRefreshFailureAt = 0;

const decodeJwtPayload = (token: string) => {
  try {
    const payload = token.split('.')[1] ?? '';
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
};

const isSessionExpiring = (session: Session) => {
  if (!session.expires_at) return false;
  return Date.now() > session.expires_at * 1000 - SESSION_EXPIRY_BUFFER_MS;
};

const refreshSessionSafely = async () => {
  if (Date.now() - lastRefreshFailureAt < REFRESH_FAILURE_COOLDOWN_MS) {
    return null;
  }
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      lastRefreshFailureAt = Date.now();
      console.error('[auth] refreshSession failed', error);
      if (isInvalidRefreshTokenError(error)) {
        await resetAuthSession({ reason: 'invalid_refresh_token' });
        return null;
      }
      throw new Error('Não foi possível atualizar a sessão. Tente novamente.');
    }
    return data.session ?? null;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
};

const getActiveSession = async (supabaseUrl: string) => {
  if (wasAuthResetRecently()) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[auth] getSession failed', error);
    if (isInvalidRefreshTokenError(error)) {
      await resetAuthSession({ reason: 'invalid_refresh_token' });
    }
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  let session = data.session ?? null;
  if (!session) {
    return null;
  }

  if (isSessionExpiring(session)) {
    const refreshed = await refreshSessionSafely();
    if (!refreshed) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    session = refreshed;
  }

  if (!session.access_token) {
    return null;
  }

  const payload = decodeJwtPayload(session.access_token);
  if (payload?.iss && !String(payload.iss).startsWith(supabaseUrl)) {
    throw new Error('Sessão inválida para este projeto. Saia e entre novamente.');
  }

  return session;
};

/**
 * Invoke a Supabase Edge Function with optional authentication and error handling.
 */
export async function invokeEdgeFunction<T>(
  name: string,
  body?: Record<string, unknown>,
  options: InvokeOptions = {}
): Promise<T> {
  const method = (options.method?.toUpperCase() as any) || 'POST';
  const functionName = options.path
    ? `${name}${options.path.startsWith('/') ? options.path : `/${options.path}`}`
    : name;
  const requireAuth = options.requireAuth ?? true;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? (supabase as any).supabaseKey;

  if (!supabaseUrl) {
    throw new Error('Variável do Supabase ausente: VITE_SUPABASE_URL.');
  }

  let activeSession: Session | null = null;

  if (requireAuth) {
    activeSession = await getActiveSession(supabaseUrl);
    if (!activeSession?.access_token) {
      throw new Error('Sessão não encontrada. Faça login novamente.');
    }
  }

  try {
    const authHeader = activeSession?.access_token ? `Bearer ${activeSession.access_token}` : undefined;
    const headers: Record<string, string> = {};

    if (anonKey) headers.apikey = anonKey;
    if (authHeader) {
      headers.Authorization = authHeader;
      headers['x-supabase-authorization'] = authHeader;
    }

    const hasBody = Boolean(body && Object.keys(body).length);
    if (method !== 'GET' && method !== 'HEAD' && hasBody) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method,
      headers,
      body: method !== 'GET' && method !== 'HEAD' && hasBody ? JSON.stringify(body) : undefined,
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => '');

    if (!response.ok) {
      let message = 'Erro desconhecido';
      if (payload && typeof payload === 'object') {
        message = (payload as any).error || (payload as any).message || message;
      } else if (typeof payload === 'string' && payload.trim()) {
        message = payload;
      }

      if (response.status === 401) {
        message = /sessao|session/i.test(message)
          ? message
          : 'Sessão inválida ou expirada. Saia e entre novamente.';
      } else if (response.status === 403) {
        message = /permissao|permission/i.test(message)
          ? message
          : 'Você não tem permissão para realizar esta ação.';
      } else if (response.status === 404) {
        message = 'Função não encontrada ou caminho inválido.';
      }

      console.error(`[edge] ${functionName} failed`, {
        status: response.status,
        payload,
      });

      if (response.status === 401 && requireAuth) {
        await resetAuthSession({ reason: `edge_function_401:${functionName}` });
      }

      const wrapped = new Error(message) as Error & { status?: number; payload?: unknown };
      wrapped.status = response.status;
      wrapped.payload = payload;
      throw wrapped;
    }

    return payload as T;
  } catch (err: any) {
    if (err.status) throw err;

    console.error(`Network error calling ${functionName}:`, err);
    throw new Error(err.message || 'Erro de conexão com o servidor.');
  }
}
