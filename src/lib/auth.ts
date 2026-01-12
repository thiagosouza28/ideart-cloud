import { supabase } from '@/integrations/supabase/client';

type ResetAuthOptions = {
  reason?: string;
  redirectTo?: string;
  skipSignOut?: boolean;
};

const AUTH_RESET_WINDOW_MS = 2000;
const SUPABASE_AUTH_KEY_REGEX = /^sb-[a-z0-9-]+-auth-token$/i;

let authResetInProgress = false;
let lastAuthResetAt = 0;

const getSupabaseStorageKey = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return null;

  try {
    const hostname = new URL(supabaseUrl).hostname;
    const projectRef = hostname.split('.')[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
};

const collectSupabaseAuthKeys = (storage: Storage, storageKey: string | null) => {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) continue;
    if (key === storageKey || SUPABASE_AUTH_KEY_REGEX.test(key)) {
      keys.push(key);
    }
  }
  return keys;
};

export const clearSupabaseStorage = () => {
  if (typeof window === 'undefined') return;

  const storageKey = getSupabaseStorageKey();
  const storages: Storage[] = [window.localStorage, window.sessionStorage];

  storages.forEach((storage) => {
    try {
      const keys = collectSupabaseAuthKeys(storage, storageKey);
      keys.forEach((key) => storage.removeItem(key));
    } catch (error) {
      console.warn('[auth] Failed to clear storage', error);
    }
  });
};

export const redirectToLogin = (path = '/auth') => {
  if (typeof window === 'undefined') return;
  if (window.location.pathname !== path) {
    window.location.replace(path);
  }
};

export const isInvalidRefreshTokenError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const message = String((error as { message?: string }).message ?? '');
  const status = Number((error as { status?: number; statusCode?: number }).status ?? (error as { statusCode?: number }).statusCode ?? 0);
  const mentionsRefresh = /refresh token/i.test(message);
  const isInvalid = /invalid|not found|revoked|expired/i.test(message);

  return (mentionsRefresh && isInvalid) || (status === 400 && mentionsRefresh);
};

export const wasAuthResetRecently = () => Date.now() - lastAuthResetAt < AUTH_RESET_WINDOW_MS;

export const resetAuthSession = async (options: ResetAuthOptions = {}) => {
  if (authResetInProgress) return;
  authResetInProgress = true;
  lastAuthResetAt = Date.now();

  const { reason, redirectTo = '/auth', skipSignOut = false } = options;
  if (reason) {
    console.warn('[auth] Resetting session', { reason });
  }

  if (!skipSignOut) {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      console.error('[auth] signOut failed', error);
    }
  }

  clearSupabaseStorage();
  redirectToLogin(redirectTo);
  authResetInProgress = false;
};
