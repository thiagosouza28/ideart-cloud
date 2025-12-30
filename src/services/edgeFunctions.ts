import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const invalidSessionError = () => new Error('Sessao invalida. Faca login novamente.');

const readResponsePayload = async (response: Response) => {
  const contentType = response.headers.get('Content-Type')?.split(';')[0]?.trim();
  if (contentType === 'application/json') {
    return response.json().catch(() => null);
  }
  return response.text().catch(() => null);
};

type EdgeFunctionOptions = {
  method?: string;
  path?: string;
};

export async function invokeEdgeFunction<T>(
  name: string,
  body?: Record<string, unknown>,
  options: EdgeFunctionOptions = {}
): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase URL ou chave anônima não configurada.');
  }

  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !data.session?.access_token) {
    throw invalidSessionError();
  }

  let session = data.session;
  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
  if (expiresAtMs && expiresAtMs <= Date.now() + 60_000) {
    const refresh = await supabase.auth.refreshSession();
    if (refresh.error || !refresh.data.session?.access_token) {
      console.warn('Failed to refresh session', refresh.error);
      throw invalidSessionError();
    }
    session = refresh.data.session;
  }

  if (!session?.access_token) {
    throw invalidSessionError();
  }

  const method = options.method?.toUpperCase() ?? 'POST';
  const path = options.path
    ? options.path.startsWith('/')
      ? options.path
      : `/${options.path}`
    : '';
  const hasBody = method !== 'GET' && method !== 'HEAD';

  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/${name}${path}`, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      },
      body: hasBody ? JSON.stringify(body ?? {}) : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Edge Function request failed: ${message}`);
  }

  const payload = await readResponsePayload(response);

  if (!response.ok) {
    const wrapped = new Error(
      payload?.error || payload?.message || `Edge Function error (${response.status})`
    ) as Error & { status?: number; payload?: unknown };
    wrapped.status = response.status;
    wrapped.payload = payload;
    throw wrapped;
  }

  return payload as T;
}

