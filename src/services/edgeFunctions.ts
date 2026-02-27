import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { isInvalidRefreshTokenError, resetAuthSession, wasAuthResetRecently } from '@/lib/auth';

type InvokeOptions = {
  method?: string;
  path?: string;
  requireAuth?: boolean;
  resetAuthOn401?: boolean;
};

const SESSION_EXPIRY_BUFFER_MS = 60_000;
const REFRESH_FAILURE_COOLDOWN_MS = 30_000;

let refreshPromise: Promise<Session | null> | null = null;
let lastRefreshFailureAt = 0;

const decodeJwtPayload = (token: string) => {
  try {
    const payload = token.split('.')[1] ?? '';
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as { role?: string; iss?: string } | null;
  } catch {
    return null;
  }
};

const isServiceRoleToken = (token?: string) => {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  return payload?.role === 'service_role';
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
      throw new Error('Nao foi possivel atualizar a sessao. Tente novamente.');
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
    throw new Error('Sessao expirada. Faca login novamente.');
  }

  let session = data.session ?? null;
  if (!session) {
    return null;
  }

  if (isSessionExpiring(session)) {
    const refreshed = await refreshSessionSafely();
    if (!refreshed) {
      throw new Error('Sessao expirada. Faca login novamente.');
    }
    session = refreshed;
  }

  if (!session.access_token) {
    return null;
  }

  const payload = decodeJwtPayload(session.access_token);
  if (payload?.iss && !String(payload.iss).startsWith(supabaseUrl)) {
    throw new Error('Sessao invalida para este projeto. Saia e entre novamente.');
  }

  return session;
};

const shouldResetAuthForEdgeError = (status: number, message: string) => {
  if (status !== 401) return false;
  const normalized = message.toLowerCase();
  const mentionsToken = /token|jwt|sessao|session/.test(normalized);
  const invalidToken = /invalid|inval|expirad|expired|revoked|not found|nao encontrado/.test(normalized);
  return mentionsToken && invalidToken;
};

const shouldRetryWithRefresh = (status: number, payload: unknown) => {
  if (status !== 401) return false;
  if (!payload || typeof payload !== 'object') return true;

  const message = String((payload as any).error || (payload as any).message || '').toLowerCase();
  if (!message) return true;

  return /auth|token|jwt|sessao|session|authorization/.test(message);
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
  const resetAuthOn401 = options.resetAuthOn401 ?? true;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const anonCandidate = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const anonKey = publishableKey || (!isServiceRoleToken(anonCandidate) ? anonCandidate : undefined) || (supabase as any).supabaseKey;

  if (!supabaseUrl || !anonKey) {
    throw new Error('Configuracao do Supabase ausente/invalida para Edge Functions.');
  }

  let activeSession: Session | null = null;

  if (requireAuth) {
    activeSession = await getActiveSession(supabaseUrl);
    if (!activeSession?.access_token) {
      throw new Error('Sessao nao encontrada. Faca login novamente.');
    }
  }

  try {
    const hasBody = Boolean(body && Object.keys(body).length);
    let sessionForRequest = activeSession;
    let retriedAfterRefresh = false;

    for (;;) {
      const authHeader = sessionForRequest?.access_token ? `Bearer ${sessionForRequest.access_token}` : undefined;
      const headers: Record<string, string> = {};

      if (anonKey) headers.apikey = anonKey;
      if (authHeader) {
        headers.Authorization = authHeader;
        headers['x-supabase-authorization'] = authHeader;
      }

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

      if (response.ok) {
        return payload as T;
      }

      if (
        requireAuth &&
        !retriedAfterRefresh &&
        shouldRetryWithRefresh(response.status, payload)
      ) {
        const refreshedSession = await refreshSessionSafely();
        if (refreshedSession?.access_token) {
          sessionForRequest = refreshedSession;
          retriedAfterRefresh = true;
          continue;
        }
      }

      let message = 'Erro desconhecido';
      if (payload && typeof payload === 'object') {
        message = (payload as any).error || (payload as any).message || message;
      } else if (typeof payload === 'string' && payload.trim()) {
        message = payload;
      }

      if (response.status === 401) {
        message = /sessao|session/i.test(message)
          ? message
          : 'Sessao invalida ou expirada. Saia e entre novamente.';
      } else if (response.status === 403) {
        message = /permissao|permission/i.test(message)
          ? message
          : 'Voce nao tem permissao para realizar esta acao.';
      } else if (response.status === 404) {
        message = 'Funcao nao encontrada ou caminho invalido.';
      }

      console.error(`[edge] ${functionName} failed`, {
        status: response.status,
        payload,
      });

      if (requireAuth && resetAuthOn401 && shouldResetAuthForEdgeError(response.status, message)) {
        await resetAuthSession({ reason: `edge_function_401:${functionName}` });
      }

      const wrapped = new Error(message) as Error & { status?: number; payload?: unknown };
      wrapped.status = response.status;
      wrapped.payload = payload;
      throw wrapped;
    }
  } catch (err: any) {
    if (err.status) throw err;

    console.error(`Network error calling ${functionName}:`, err);
    throw new Error(err.message || 'Erro de conexao com o servidor.');
  }
}
