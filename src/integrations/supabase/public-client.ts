import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

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

const resolveClientKey = () => {
  if (SUPABASE_PUBLISHABLE_KEY) return SUPABASE_PUBLISHABLE_KEY;
  if (SUPABASE_ANON_KEY && !isServiceRoleToken(SUPABASE_ANON_KEY)) return SUPABASE_ANON_KEY;
  return '';
};

const SUPABASE_CLIENT_KEY = resolveClientKey();

if (!SUPABASE_URL || !SUPABASE_CLIENT_KEY) {
  throw new Error(
    'Variaveis do Supabase ausentes/invalidas. Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (ou ANON sem service_role).',
  );
}

export const publicSupabase = createClient<Database>(SUPABASE_URL, SUPABASE_CLIENT_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

