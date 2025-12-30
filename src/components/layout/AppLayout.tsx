import { useEffect } from 'react';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Separator } from '@/components/ui/separator';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { useLocation, useNavigate } from 'react-router-dom';
import { useOrderNotifications } from '@/hooks/useOrderNotifications';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

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
  const { subscription, refreshCompany, role } = useAuth();
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
        <SidebarInset className="flex flex-col h-screen overflow-hidden">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-medium">{pageTitle}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            {subscriptionLabel && (
              <div className="ml-auto">
                <Badge variant={subscriptionVariant}>{subscriptionLabel}</Badge>
              </div>
            )}
          </header>
          <main className="flex-1 overflow-auto">
            {subscriptionBanner}
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
