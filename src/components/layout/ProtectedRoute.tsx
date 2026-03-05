import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppRole } from '@/types/database';
import { Loader2 } from 'lucide-react';
import { AppModuleKey } from '@/lib/modulePermissions';
import {
  canSuperAdminAccessPath,
  getAccessScope,
  SUPER_ADMIN_HOME_PATH,
} from '@/lib/access-control';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
  moduleKey?: AppModuleKey;
}

export function ProtectedRoute({ children, allowedRoles, moduleKey }: ProtectedRouteProps) {
  const { user, role, loading, hasPermission, hasModulePermission, needsOnboarding, subscription, profile, company } = useAuth();
  const location = useLocation();
  const isSubscriptionRoute = location.pathname.startsWith('/assinatura');
  const isOnboardingRoute = location.pathname.startsWith('/onboarding');
  const isPasswordChangeRoute = location.pathname === '/alterar-senha';
  const accessScope = getAccessScope(user, role);
  const mustChangePassword = Boolean(profile?.must_change_password || profile?.force_password_change);
  const mustCompleteCompany = Boolean(profile?.must_complete_company);
  const companyCompleted = Boolean(company?.completed);
  const passwordDefined = Boolean(profile?.password_defined);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Customer accounts should use the dedicated public area only.
  if (accessScope === 'customer') {
    return <Navigate to="/minha-conta/pedidos" replace />;
  }

  // Super admin can only access management/testing pages directly.
  // To use store screens, they must impersonate a store user.
  if (accessScope === 'super_admin' && !canSuperAdminAccessPath(location.pathname)) {
    return <Navigate to={SUPER_ADMIN_HOME_PATH} replace />;
  }

  // Redirect to onboarding if needed (except if already on onboarding page)
  if (role !== 'super_admin' && !companyCompleted && (needsOnboarding || mustCompleteCompany) && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  if (!passwordDefined && mustChangePassword && !isPasswordChangeRoute) {
    return <Navigate to="/alterar-senha" replace />;
  }

  if (
    !isOnboardingRoute &&
    role !== 'super_admin' &&
    subscription?.isExpired &&
    !isSubscriptionRoute
  ) {
    return <Navigate to="/assinatura" replace />;
  }

  if (allowedRoles && !hasPermission(allowedRoles)) {
    const fallbackPath = role === 'super_admin' ? SUPER_ADMIN_HOME_PATH : '/dashboard';
    if (location.pathname === fallbackPath) {
      return <Navigate to="/auth" replace />;
    }
    return <Navigate to={fallbackPath} replace />;
  }

  if (moduleKey && !hasModulePermission(moduleKey)) {
    const fallbackPath = role === 'super_admin' ? SUPER_ADMIN_HOME_PATH : '/dashboard';
    if (location.pathname === fallbackPath) {
      return <Navigate to="/auth" replace />;
    }
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
}
