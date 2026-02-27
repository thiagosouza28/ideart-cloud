import { useEffect, useMemo, useState } from 'react';
import { Bell, Loader2, Menu, Moon, Sun, X } from 'lucide-react';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { useLocation, useNavigate } from 'react-router-dom';
import { useOrderNotifications } from '@/hooks/useOrderNotifications';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AppRole } from '@/types/database';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { useTheme } from 'next-themes';

interface AppLayoutProps {
  children: React.ReactNode;
}

const roleLabels: Record<AppRole, string> = {
  super_admin: 'SUPER ADMIN',
  admin: 'ADMIN',
  financeiro: 'FINANCEIRO',
  atendente: 'ATENDENTE',
  caixa: 'CAIXA',
  producao: 'PRODUÇÃO',
};

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    subscription,
    refreshCompany,
    role,
    hasPermission,
    user,
    getLoggedCompany,
    isImpersonating,
    stopImpersonation,
  } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const [isBannerHidden, setIsBannerHidden] = useState(
    () => localStorage.getItem('subscriptionBannerHidden') === 'true'
  );
  const [restoringAdmin, setRestoringAdmin] = useState(false);
  const company = getLoggedCompany();
  const logoFromCompany = ensurePublicStorageUrl('product-images', company?.logo_url);
  const logoFromUser = user?.user_metadata?.company_logo as string | undefined;
  const logoUrl = logoFromCompany || logoFromUser || null;
  const fallbackText = (company?.name || user?.user_metadata?.full_name || user?.email || 'Empresa')
    .toString()
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0])
    .join('')
    .toUpperCase();

  // Enable real-time order notifications
  useOrderNotifications();
  useEffect(() => {
    refreshCompany();
  }, [location.pathname, refreshCompany]);

  useEffect(() => {
    document.body.classList.add('app-locked');
    return () => {
      document.body.classList.remove('app-locked');
    };
  }, []);

  const navItems = useMemo(() => ([
    { label: 'Início', url: '/dashboard', roles: ['super_admin', 'admin', 'financeiro', 'atendente', 'caixa', 'producao'] as AppRole[] },
    { label: 'Pedidos', url: '/pedidos', roles: ['admin', 'atendente', 'caixa'] as AppRole[] },
    { label: 'Catálogo', url: '/catalogo-admin', roles: ['admin'] as AppRole[] },
    { label: 'Financeiro', url: '/financeiro/fluxo-caixa', roles: ['super_admin', 'admin', 'financeiro', 'atendente', 'producao'] as AppRole[] },
    { label: 'Perfil', url: '/perfil', roles: ['super_admin', 'admin', 'financeiro', 'atendente', 'caixa', 'producao'] as AppRole[] },
  ]), []);

  const visibleNavItems = navItems.filter((item) => hasPermission(item.roles));

  const formatDays = (value: number | null) => {
    if (value === null) return null;
    return `${value} ${value === 1 ? 'dia' : 'dias'}`;
  };

  const formatDate = (value: Date | null) => {
    if (!value || Number.isNaN(value.getTime())) return null;
    return value.toLocaleDateString('pt-BR');
  };

  const subscriptionBanner = (() => {
    if (!subscription || role === 'super_admin' || isBannerHidden) return null;

    const isTrial = subscription.status === 'trial';
    const hasWarning = subscription.warningLevel !== 'none';
    const shouldShow =
      isTrial ||
      hasWarning ||
      (subscription.status === 'active' && subscription.daysRemaining !== null);
    if (!shouldShow) return null;

    const isExpired = subscription.warningLevel === 'danger';
    const days = subscription.daysRemaining;
    const dayLabel = days === 1 ? 'dia' : 'dias';
    const expiresAtLabel = formatDate(subscription.expiresAt);
    const title = isExpired
      ? 'Plano expirado'
      : isTrial
        ? 'Período de teste ativo'
        : subscription.warningReason === 'trial_ending'
          ? 'Período de teste terminando'
          : subscription.warningReason === 'plan_ending'
            ? 'Plano perto de vencer'
            : 'Plano ativo';
    const description = isExpired
      ? 'Seu acesso expirou. Escolha um plano para voltar a usar o sistema.'
      : days !== null
        ? `Restam ${days} ${dayLabel} para o fim do período.`
        : 'Seu plano está ativo.';

    return (
      <div className="fixed bottom-6 right-6 z-50 w-full max-w-md">
        <Alert variant={isExpired ? 'destructive' : 'default'} className={!isExpired ? 'border-amber-300 text-amber-900' : undefined}>
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription className="relative flex flex-col gap-2 pb-10">
            <div className="flex flex-col gap-1">
              <span>{description}</span>
              {expiresAtLabel && !isExpired && (
                <span className="text-xs text-muted-foreground">
                  Vencimento: {expiresAtLabel}
                </span>
              )}
            </div>
            <Button
              variant={isExpired ? 'outline' : 'secondary'}
              size="sm"
              onClick={() => navigate('/assinatura')}
              className="absolute bottom-3 right-3"
            >
              Ver planos
            </Button>
            <button
              type="button"
              className="absolute bottom-3 left-3 text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => {
                localStorage.setItem('subscriptionBannerHidden', 'true');
                setIsBannerHidden(true);
              }}
            >
              Ocultar aviso
            </button>
          </AlertDescription>
        </Alert>
      </div>
    );
  })();

  const impersonationBanner = isImpersonating ? (
    <Alert className="mb-4 border-amber-300 bg-amber-50 text-amber-900">
      <AlertTitle>Modo administrador</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>Voce esta acessando esta conta como administrador.</span>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            if (restoringAdmin) return;
            setRestoringAdmin(true);
            const restored = await stopImpersonation();
            setRestoringAdmin(false);
            if (restored) {
              navigate('/super-admin');
            }
          }}
        >
          {restoringAdmin ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Sair da conta do cliente
        </Button>
      </AlertDescription>
    </Alert>
  ) : null;

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <SidebarInset className="app-shell">
          <header className="app-header">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Menu className="hidden h-5 w-5 text-slate-500" />
            </div>
            <div className="ml-auto flex items-center gap-4">
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Plano ativo
            </div>
            {isBannerHidden && subscription && role !== 'super_admin' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  localStorage.removeItem('subscriptionBannerHidden');
                  setIsBannerHidden(false);
                }}
                className="hidden sm:inline-flex"
              >
                Mostrar aviso
              </Button>
            )}
            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="hidden h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 sm:flex"
              aria-label={resolvedTheme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
            >
              {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
              <button className="hidden h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 sm:flex">
                <Bell className="h-4 w-4" />
              </button>
              <div className="hidden flex-col items-end leading-tight sm:flex">
                <span className="text-sm font-semibold text-slate-900">{company?.name || 'Ideart Gráfica'}</span>
                <span className="text-[11px] font-semibold text-slate-400">{role ? roleLabels[role] : 'ADMIN'}</span>
              </div>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={company?.name || 'Logo da empresa'}
                  className="h-9 w-9 rounded-full object-cover border border-slate-200"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500">
                  {fallbackText || 'LG'}
                </div>
              )}
            </div>
          </header>
          <main className="app-content">
            {impersonationBanner}
            {subscriptionBanner}
            {children}
          </main>
          <nav className="app-bottom-nav md:hidden" aria-label="Navegação principal">
            {visibleNavItems.map((item) => {
              const isActive = location.pathname === item.url || location.pathname.startsWith(`${item.url}/`);
              return (
                <button
                  key={item.label}
                  type="button"
                  className={isActive ? 'bottom-nav-item bottom-nav-active' : 'bottom-nav-item'}
                  onClick={() => navigate(item.url)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="bottom-nav-label">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

