import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppRole } from '@/types/database';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, role, loading, hasPermission, needsOnboarding, subscription, profile, company } = useAuth();
  const location = useLocation();
  const isSubscriptionRoute = location.pathname.startsWith('/assinatura');
  const isOnboardingRoute = location.pathname.startsWith('/onboarding');
  const isPasswordChangeRoute = location.pathname === '/alterar-senha';
  const isCustomerAccount = String(user?.user_metadata?.account_type || '').toLowerCase() === 'customer';
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
  if (isCustomerAccount) {
    return <Navigate to="/minha-conta/pedidos" replace />;
  }

  // Redirect to onboarding if needed (except if already on onboarding page)
  if (!companyCompleted && (needsOnboarding || mustCompleteCompany) && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  if (!passwordDefined && mustChangePassword && !isPasswordChangeRoute) {
    return <Navigate to="/alterar-senha" replace />;
  }

  if (
    !isOnboardingRoute &&
    role !== 'super_admin' &&
    (!subscription || !subscription.hasAccess) &&
    !isSubscriptionRoute
  ) {
    return <Navigate to="/assinatura" replace />;
  }

  if (allowedRoles && !hasPermission(allowedRoles)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
