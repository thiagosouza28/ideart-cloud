import type { User } from '@supabase/supabase-js';
import type { AppRole } from '@/types/database';

export type AccessScope = 'customer' | 'super_admin' | 'store' | 'unknown';

export const STORE_ROLES: AppRole[] = ['admin', 'financeiro', 'atendente', 'caixa', 'producao'];
export const SUPER_ADMIN_HOME_PATH = '/super-admin/empresas';

const SUPER_ADMIN_ALLOWED_EXACT_PATHS = new Set([
  '/super-admin',
  '/super-admin/empresas',
  '/super-admin/planos',
  '/admin/entrar-como-cliente',
  '/super-admin/entrar-como-cliente',
  '/usuarios',
]);

const SUPER_ADMIN_ALLOWED_PREFIX_PATHS = ['/usuarios/', '/super-admin/planos/'];

const normalizePathname = (pathname: string) => {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
};

export const isCustomerAccount = (candidate?: User | null) =>
  String(candidate?.user_metadata?.account_type || '').toLowerCase() === 'customer';

export const isSuperAdminRole = (role?: AppRole | null) => role === 'super_admin';

export const isStoreRole = (role?: AppRole | null) =>
  Boolean(role && STORE_ROLES.includes(role));

export const getAccessScope = (
  userá: User | null,
  role?: AppRole | null,
): AccessScope => {
  if (isCustomerAccount(user)) return 'customer';
  if (isSuperAdminRole(role)) return 'super_admin';
  if (isStoreRole(role)) return 'store';
  return 'unknown';
};

export const canSuperAdminAccessPath = (pathname: string) => {
  const normalized = normalizePathname(pathname);
  if (SUPER_ADMIN_ALLOWED_EXACT_PATHS.has(normalized)) return true;
  return SUPER_ADMIN_ALLOWED_PREFIX_PATHS.some((prefix) => normalized.startsWith(prefix));
};
