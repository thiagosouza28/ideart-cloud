import { useEffect, useMemo } from 'react';
import { ArrowLeft, BarChart3, ClipboardList, Home, Package, User } from 'lucide-react';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { useLocation, useNavigate } from 'react-router-dom';
import { useOrderNotifications } from '@/hooks/useOrderNotifications';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AppRole } from '@/types/database';

interface AppLayoutProps {
  children: React.ReactNode;
}

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/pdv': 'PDV - Ponto de Venda',
  '/pedidos': 'Pedidos',
  '/pedidos/kanban': 'Kanban de Pedidos',
  '/pedidos/novo': 'Novo Pedido',
  '/producao': 'Painel de Produção',
  '/produtos': 'Produtos',
  '/produtos/novo': 'Novo Produto',
  '/insumos': 'Gestão de Insumos',
  '/estoque': 'Controle de Estoque',
  '/clientes': 'Clientes',
  '/clientes/novo': 'Novo Cliente',
  '/relatorios': 'Relatórios',
  '/configuracoes': 'Configurações',
  '/assinatura': 'Assinatura e Catálogo',
  '/banners': 'Gerenciamento de Banners',
  '/perfil': 'Meu Perfil',
  '/super-admin': 'Super Admin',
  '/super-admin/empresas': 'Empresas SaaS',
  '/super-admin/planos': 'Planos de Assinatura',
  '/empresas/nova': 'Nova Empresa',
};

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { subscription, refreshCompany, role, hasPermission } = useAuth();
  let pageTitle = pageTitles[location.pathname];
  if (!pageTitle) {
    if (location.pathname.startsWith('/clientes/') && location.pathname.endsWith('/historico')) {
      pageTitle = 'Histórico do Cliente';
    } else if (location.pathname.startsWith('/clientes/')) {
      pageTitle = 'Editar Cliente';
    } else if (location.pathname.startsWith('/empresas/') && location.pathname.endsWith('/editar')) {
      pageTitle = 'Editar Empresa';
    } else if (location.pathname.startsWith('/pedidos/')) {
      pageTitle = 'Detalhes do Pedido';
    } else {
      pageTitle = 'Página';
    }
  }

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
    { label: 'Inicio', url: '/dashboard', icon: Home, roles: ['super_admin', 'admin', 'atendente', 'caixa', 'producao'] as AppRole[] },
    { label: 'Pedidos', url: '/pedidos', icon: ClipboardList, roles: ['admin', 'atendente', 'caixa'] as AppRole[] },
    { label: 'Catalogo', url: '/produtos', icon: Package, roles: ['admin', 'atendente'] as AppRole[] },
    { label: 'Financeiro', url: '/relatorios', icon: BarChart3, roles: ['admin'] as AppRole[] },
    { label: 'Perfil', url: '/perfil', icon: User, roles: ['super_admin', 'admin', 'atendente', 'caixa', 'producao'] as AppRole[] },
  ]), []);

  const visibleNavItems = navItems.filter((item) => hasPermission(item.roles));

  const showBack = useMemo(() => {
    const topLevelRoutes = new Set([
      '/dashboard',
      '/pdv',
      '/pedidos',
      '/pedidos/kanban',
      '/producao',
      '/produtos',
      '/insumos',
      '/categorias',
      '/atributos',
      '/estoque',
      '/clientes',
      '/relatorios',
      '/usuarios',
      '/banners',
      '/empresas',
      '/configuracoes',
      '/assinatura',
      '/super-admin',
      '/super-admin/empresas',
      '/super-admin/planos',
      '/perfil',
    ]);

    return !topLevelRoutes.has(location.pathname);
  }, [location.pathname]);

  const formatDays = (value: number | null) => {
    if (value === null) return null;
    return `${value} ${value === 1 ? 'dia' : 'dias'}`;
  };

  const subscriptionLabel = (() => {
    if (!subscription || role === 'super_admin') return null;
    if (subscription.status === 'active') {
      const daysLabel = formatDays(subscription.daysRemaining);
      return daysLabel
        ? `Plano ativo: ${daysLabel}`
        : 'Plano ativo';
    }
    if (subscription.status === 'trial') {
      const daysLabel = formatDays(subscription.daysRemaining);
      return daysLabel
        ? `Período de teste: ${daysLabel} restantes`
        : 'Período de teste ativo';
    }
    if (subscription.status === 'expired') {
      return 'Plano expirado';
    }
    return null;
  })();

  const subscriptionVariant = subscription?.status === 'expired' ? 'destructive' : subscription?.status === 'active' ? 'outline' : 'secondary';

  const subscriptionBanner = (() => {
    if (!subscription || subscription.warningLevel === 'none' || role === 'super_admin') return null;
    const isExpired = subscription.warningLevel === 'danger';
    const days = subscription.daysRemaining;
    const dayLabel = days === 1 ? 'dia' : 'dias';
    const title = isExpired
      ? 'Plano expirado'
      : subscription.warningReason === 'trial_ending'
        ? 'Período de teste terminando'
        : 'Plano perto de vencer';
    const description = isExpired
      ? 'Seu acesso expirou. Escolha um plano para voltar a usar o sistema.'
      : days !== null
        ? `Restam ${days} ${dayLabel} para o fim do período.`
        : 'Seu plano está perto de vencer.';

    return (
      <div className="px-4 pt-4">
        <Alert variant={isExpired ? 'destructive' : 'default'} className={!isExpired ? 'border-amber-300 text-amber-900' : undefined}>
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{description}</span>
            <Button variant={isExpired ? 'outline' : 'secondary'} size="sm" onClick={() => navigate('/assinatura')}>
              Ver planos
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  })();

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <SidebarInset className="app-shell">
          <header className="app-header">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              {showBack && (
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Voltar">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              )}
              <div className="flex flex-col">
                <span className="app-title">{pageTitle}</span>
                <span className="text-xs text-muted-foreground sm:hidden">GraficaERP</span>
              </div>
            </div>
            {subscriptionLabel && (
              <div className="ml-auto hidden sm:flex">
                <Badge variant={subscriptionVariant}>{subscriptionLabel}</Badge>
              </div>
            )}
          </header>
          <main className="app-content">
            {subscriptionBanner}
            {children}
          </main>
          <nav className="app-bottom-nav md:hidden" aria-label="Navegacao principal">
            {visibleNavItems.map((item) => {
              const isActive = location.pathname === item.url || location.pathname.startsWith(`${item.url}/`);
              return (
                <button
                  key={item.label}
                  type="button"
                  className={isActive ? "bottom-nav-item bottom-nav-active" : "bottom-nav-item"}
                  onClick={() => navigate(item.url)}
                  aria-current={isActive ? "page" : undefined}
                >
                  <item.icon className="bottom-nav-icon" />
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
