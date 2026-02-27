const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const decodeJwtPayload = (token?: string) => {
  if (!token || !token.includes('.')) return null;
  try {
    const payload = token.split('.')[1] ?? '';
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as { role?: string } | null;
  } catch {
    return null;
  }
};

const isServiceRoleToken = (token?: string) => {
  const payload = decodeJwtPayload(token);
  return payload?.role === 'service_role';
};

const resolvePublicKey = () => {
  if (SUPABASE_PUBLISHABLE_KEY) return SUPABASE_PUBLISHABLE_KEY;
  if (SUPABASE_ANON_KEY && !isServiceRoleToken(SUPABASE_ANON_KEY)) return SUPABASE_ANON_KEY;
  return '';
};

const SUPABASE_PUBLIC_KEY = resolvePublicKey();
const shouldSendAuthorization = SUPABASE_PUBLIC_KEY.includes('.');

if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) {
  throw new Error('Supabase URL ou chave publica invalida nao configuradas.');
}

export async function invokePublicFunction<T>(
  name: string,
  body?: Record<string, unknown>,
  options?: { method?: 'GET' | 'POST' },
): Promise<T> {
  const method = options?.method ?? (body ? 'POST' : 'GET');
  const headers: Record<string, string> = {
    apikey: SUPABASE_PUBLIC_KEY,
  };

  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
  }

  if (shouldSendAuthorization) {
    headers.Authorization = `Bearer ${SUPABASE_PUBLIC_KEY}`;
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    console.error('Public function error:', {
      status: res.status,
      body: json ?? text,
    });
    throw new Error(json?.error || json?.message || 'Erro ao chamar funcao publica');
  }

  return json as T;
}
