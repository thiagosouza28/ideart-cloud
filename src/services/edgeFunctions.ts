import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';

type InvokeOptions = {
  method?: string;
  path?: string;
  requireAuth?: boolean;
};

const decodeJwtPayload = (token: string) => {
  try {
    const payload = token.split('.')[1] ?? '';
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
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
    throw new Error('Missing Supabase env: VITE_SUPABASE_URL.');
  }

  let activeSession: Session | null = null;

  if (requireAuth) {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error('Error getting session for Edge Function:', sessionError);
      throw new Error('Erro ao obter sessao. Faca login novamente.');
    }

    activeSession = session ?? null;
    if (activeSession?.expires_at) {
      const expiresAtMs = activeSession.expires_at * 1000;
      if (Date.now() > expiresAtMs - 60_000) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.error('Error refreshing session for Edge Function:', refreshError);
          throw new Error('Sessao expirada. Faca login novamente.');
        } else {
          activeSession = refreshed.session ?? activeSession;
        }
      }
    }

    if (!activeSession?.access_token) {
      throw new Error('Sessao nao encontrada. Faca login novamente.');
    }

    const payload = decodeJwtPayload(activeSession.access_token);
    if (payload?.iss && !String(payload.iss).startsWith(supabaseUrl)) {
      throw new Error('Sessao invalida para este projeto. Saia e entre novamente.');
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
        message = message.includes('sessao') || message.includes('session')
          ? message
          : 'Sessao invalida ou expirada. Saia e entre novamente.';
      } else if (response.status === 403) {
        message = message.includes('permissao') || message.includes('permission')
          ? message
          : 'Voce nao tem permissao para realizar esta acao.';
      } else if (response.status === 404) {
        message = 'Funcao nao encontrada ou caminho invalido.';
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
    throw new Error(err.message || 'Erro de conexao com o servidor.');
  }
}
