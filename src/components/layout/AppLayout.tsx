import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Loader2, Menu, Moon, Sun, Trash2 } from 'lucide-react';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { useLocation, useNavigate } from 'react-router-dom';
import { useOrderNotifications } from '@/hooks/useOrderNotifications';
import { useExpenseAlerts } from '@/hooks/useExpenseAlerts';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AppRole } from '@/types/database';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { useTheme } from 'next-themes';
import { useCompanyTheme } from '@/contexts/CompanyThemeContext';

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
    user,
    getLoggedCompany,
    isImpersonating,
    stopImpersonation,
  } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const {
    companyTheme,
    resolvedCompanyThemeMode,
    savingCompanyThemeMode,
    setCompanyThemeMode,
  } = useCompanyTheme();
  const [isBannerHidden, setIsBannerHidden] = useState(
    () => localStorage.getItem('subscriptionBannerHidden') === 'true',
  );
  const [restoringAdmin, setRestoringAdmin] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const company = getLoggedCompany();
  const canPersistThemeMode = role === 'admin' || role === 'super_admin';
  const currentThemeMode = companyTheme
    ? resolvedCompanyThemeMode
    : resolvedTheme === 'dark'
      ? 'dark'
      : 'light';
  const logoFromCompany = ensurePublicStorageUrl('product-images', company?.logo_url);
  const logoFromUser = user.user_metadata?.company_logo as string | undefined;
  const logoUrl = logoFromCompany || logoFromUser || null;
  const fallbackText = (company?.name || user.user_metadata?.full_name || user.email || 'Empresa')
    .toString()
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0])
    .join('')
    .toUpperCase();

  const {
    unreadNotificationsCount,
    notifications,
    isLoadingNotifications,
    isUpdatingNotifications,
    isClearingNotifications,
    refreshNotifications,
    markNotificationAsRead,
    markUnreadOrdersAsRead,
    clearNotifications,
  } = useOrderNotifications();
  const { summary: expenseAlertsSummary, loading: loadingExpenseAlerts, refreshExpenseAlerts } =
    useExpenseAlerts();
  const totalHeaderAlerts = unreadNotificationsCount + expenseAlertsSummary.total;

  useEffect(() => {
    refreshCompany();
  }, [location.pathname, refreshCompany]);

  useEffect(() => {
    document.body.classList.add('app-locked');
    return () => {
      document.body.classList.remove('app-locked');
    };
  }, []);

  const formatDate = (value: Date | null) => {
    if (!value || Number.isNaN(value.getTime())) return null;
    return value.toLocaleDateString('pt-BR');
  };

  const formatNotificationDateTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('pt-BR');
  };

  const handleNotificationsOpenChange = (open: boolean) => {
    setIsNotificationsOpen(open);
    if (!open) return;
    void refreshNotifications();
    void refreshExpenseAlerts();
  };

  const handleThemeToggle = async () => {
    const nextMode = currentThemeMode === 'dark' ? 'light' : 'dark';

    if (!companyTheme) {
      setTheme(nextMode);
      return;
    }

    await setCompanyThemeMode(nextMode, { persist: canPersistThemeMode });
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
      <div className="fixed bottom-4 left-4 right-4 z-50 sm:bottom-6 sm:left-auto sm:right-6 sm:w-full sm:max-w-md">
        <Alert
          variant={isExpired ? 'destructive' : 'default'}
          className={
            !isExpired
              ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-100'
              : undefined
          }
        >
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
    <Alert className="mb-4 border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-100">
      <AlertTitle>Modo administrador</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>Você está acessando esta conta como administrador.</span>
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
              <Menu className="hidden h-5 w-5 text-muted-foreground" />
            </div>
            <div className="ml-auto flex items-center gap-4">
              <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground sm:flex">
                <span className="h-2 w-2 rounded-full bg-success" />
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
                onClick={() => void handleThemeToggle()}
                disabled={savingCompanyThemeMode}
                className="hidden h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground sm:flex"
                aria-label={currentThemeMode === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
                title={
                  companyTheme?.theme_mode === 'system'
                    ? 'Modo automático ativo. Clique para alternar manualmente.'
                    : currentThemeMode === 'dark'
                      ? 'Ativar modo claro'
                      : 'Ativar modo escuro'
                }
              >
                {savingCompanyThemeMode ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : currentThemeMode === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
              <Popover open={isNotificationsOpen} onOpenChange={handleNotificationsOpenChange}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="relative hidden h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground sm:flex"
                    aria-label={
                      totalHeaderAlerts > 0
                        ? `${totalHeaderAlerts} alerta(s) ativo(s)`
                        : 'Notificacoes'
                    }
                    title={
                      totalHeaderAlerts > 0
                        ? `${totalHeaderAlerts} alerta(s) ativo(s)`
                        : 'Sem alertas'
                    }
                  >
                    <Bell className="h-4 w-4" />
                    {totalHeaderAlerts > 0 && (
                      <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
                        {totalHeaderAlerts > 99 ? '99+' : totalHeaderAlerts}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[min(92vw,420px)] overflow-hidden p-0">
                  <div className="flex h-[min(78vh,34rem)] max-h-[min(78vh,34rem)] flex-col overflow-hidden">
                    <div className="shrink-0 border-b border-border px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">Alertas e notificacoes</p>
                          <p className="text-xs text-muted-foreground">Acompanhe pedidos e despesas que exigem atencao.</p>
                        </div>
                        <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          {totalHeaderAlerts}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={unreadNotificationsCount === 0 || isUpdatingNotifications}
                          onClick={() => void markUnreadOrdersAsRead()}
                        >
                          {isUpdatingNotifications ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCheck className="mr-2 h-4 w-4" />
                          )}
                          Marcar todas como lidas
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={notifications.length === 0 || isClearingNotifications}
                          onClick={() => void clearNotifications()}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {isClearingNotifications ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                          )}
                          Limpar
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="min-h-0 flex-1">
                      {loadingExpenseAlerts || isLoadingNotifications ? (
                        <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Carregando alertas...
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          <div className="px-4 py-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Financeiro
                              </p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => {
                                  setIsNotificationsOpen(false);
                                  navigate('/financeiro/despesas');
                                }}
                              >
                                Ver despesas
                              </Button>
                            </div>
                            {expenseAlertsSummary.total === 0 ? (
                              <p className="text-sm text-muted-foreground">Nenhuma conta em alerta.</p>
                            ) : (
                              <div className="space-y-2">
                                {expenseAlertsSummary.items.slice(0, 5).map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    className="w-full rounded-xl border border-border px-3 py-2 text-left transition hover:bg-muted/50"
                                    onClick={() => {
                                      setIsNotificationsOpen(false);
                                      navigate('/financeiro/despesas');
                                    }}
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {item.dueStatus === 'vencida' ? 'Conta vencida' : 'Vence em ate 5 dias'}
                                          {item.dueDate ? ` • ${new Date(`${item.dueDate}T00:00:00`).toLocaleDateString('pt-BR')}` : ''}
                                        </p>
                                      </div>
                                      <span className="text-xs font-semibold text-foreground">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amount)}
                                      </span>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="px-4 py-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Pedidos
                            </p>
                            {notifications.length === 0 ? (
                              <div className="text-sm text-muted-foreground">
                                Nenhuma notificacao de pedido.
                              </div>
                            ) : (
                              <div className="divide-y divide-border rounded-xl border border-border">
                          {notifications.map((notification) => (
                            <button
                              key={notification.id}
                              type="button"
                              onClick={() => {
                                if (!notification.order_id) return;
                                void markNotificationAsRead(notification.id);
                                setIsNotificationsOpen(false);
                                navigate(`/pedidos/${notification.order_id}`);
                              }}
                              className={`w-full px-4 py-3 text-left transition-colors ${
                                notification.order_id ? 'hover:bg-muted/50' : ''
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground">
                                    {notification.title}
                                  </p>
                                  {notification.body && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {notification.body}
                                    </p>
                                  )}
                                  <p className="mt-2 text-[11px] text-muted-foreground">
                                    {formatNotificationDateTime(notification.created_at)}
                                  </p>
                                </div>
                                {!notification.read_at && (
                                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                                )}
                              </div>
                            </button>
                          ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </PopoverContent>
              </Popover>
              <div className="hidden flex-col items-end leading-tight sm:flex">
                <span className="text-sm font-semibold text-foreground">{company?.name || 'Ideart Cloud'}</span>
                <span className="text-[11px] font-semibold text-muted-foreground">{role ? roleLabels[role] : 'ADMIN'}</span>
              </div>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={company?.name || 'Logo da empresa'}
                  className="h-9 w-9 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground">
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
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
