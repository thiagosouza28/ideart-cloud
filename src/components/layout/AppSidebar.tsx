import { useMemo } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Users,
  ClipboardList,
  Factory,
  Kanban,
  Settings,
  LogOut,
  User,
  Shield,
  CreditCard,
  Layers,
  Crown,
  Building2,
  FolderTree,
  Tags,
  Barcode,
  BarChart3,
  Image as ImageIcon,
  Gift,
  FileText,
  Calculator,
  HandCoins,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { AppRole } from '@/types/database';
import { AppModuleKey } from '@/lib/modulePermissions';

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
  moduleKey: AppModuleKey;
}

const primaryMenu: MenuItem[] = [
  { title: 'Painel', url: '/dashboard', icon: LayoutDashboard, roles: ['super_admin', 'admin', 'financeiro', 'atendente', 'caixa', 'producao'], moduleKey: 'dashboard' },
  { title: 'Pedidos', url: '/pedidos', icon: ClipboardList, roles: ['admin', 'atendente', 'caixa'], moduleKey: 'pedidos' },
  { title: 'Produção', url: '/producao', icon: Factory, roles: ['admin', 'producao'], moduleKey: 'producao' },
  { title: 'Fluxo de Caixa', url: '/financeiro/fluxo-caixa', icon: CreditCard, roles: ['admin', 'financeiro', 'atendente', 'producao'], moduleKey: 'fluxo_caixa' },
  { title: 'Despesas', url: '/financeiro/despesas', icon: HandCoins, roles: ['admin', 'financeiro'], moduleKey: 'fluxo_caixa' },
  { title: 'Relatórios', url: '/financeiro/relatorios', icon: BarChart3, roles: ['admin', 'financeiro', 'atendente', 'producao'], moduleKey: 'relatorios' },
];

const operationsMenu: MenuItem[] = [
  { title: 'PDV', url: '/pdv', icon: ShoppingCart, roles: ['admin', 'caixa'], moduleKey: 'pdv' },
  { title: 'Comprovantes', url: '/comprovantes', icon: FileText, roles: ['admin', 'atendente', 'caixa'], moduleKey: 'comprovantes' },
  { title: 'Kanban de Pedidos', url: '/pedidos/kanban', icon: Kanban, roles: ['admin', 'atendente', 'caixa', 'producao'], moduleKey: 'kanban_pedidos' },
  { title: 'Insumos', url: '/insumos', icon: Layers, roles: ['admin', 'atendente'], moduleKey: 'insumos' },
  { title: 'Estoque', url: '/estoque', icon: Boxes, roles: ['admin', 'atendente'], moduleKey: 'estoque' },
  { title: 'Clientes', url: '/clientes', icon: Users, roles: ['admin', 'atendente'], moduleKey: 'clientes' },
  { title: 'Aniversariantes do Mês', url: '/clientes/aniversariantes', icon: Gift, roles: ['admin', 'atendente'], moduleKey: 'aniversariantes' },
  { title: 'Simulador de Preço', url: '/produtos/simulador-preco', icon: Calculator, roles: ['admin', 'atendente'], moduleKey: 'produtos' },
  { title: 'Etiquetas', url: '/produtos/etiquetas', icon: Barcode, roles: ['admin', 'atendente'], moduleKey: 'etiquetas' },
];

const catalogMenu: MenuItem[] = [
  { title: 'Produtos', url: '/produtos', icon: Package, roles: ['admin', 'atendente'], moduleKey: 'produtos' },
  { title: 'Categorias', url: '/categorias', icon: FolderTree, roles: ['admin', 'atendente'], moduleKey: 'categorias' },
  { title: 'Banners', url: '/banners', icon: ImageIcon, roles: ['admin'], moduleKey: 'banners' },
  { title: 'Atributos', url: '/atributos', icon: Tags, roles: ['admin', 'atendente'], moduleKey: 'atributos' },
  { title: 'Configurações do Catálogo', url: '/catalogo/configuracoes', icon: Settings, roles: ['admin'], moduleKey: 'catalogo' },
];

const settingsMenu: MenuItem[] = [
  { title: 'Empresa', url: '/configuracoes/empresa', icon: Building2, roles: ['admin'], moduleKey: 'configuracoes' },
  { title: 'Usuários', url: '/usuarios', icon: User, roles: ['admin'], moduleKey: 'usuarios' },
  { title: 'Pagamentos', url: '/configuracoes/pagamentos', icon: CreditCard, roles: ['admin'], moduleKey: 'pagamentos_pix' },
  { title: 'Assinatura', url: '/assinatura', icon: Crown, roles: ['admin', 'financeiro'], moduleKey: 'assinatura' },
];

const superAdminMenu: MenuItem[] = [
  { title: 'Painel', url: '/super-admin', icon: LayoutDashboard, roles: ['super_admin'], moduleKey: 'dashboard' },
  { title: 'Empresas / Lojas', url: '/super-admin/empresas', icon: Building2, roles: ['super_admin'], moduleKey: 'empresas' },
  { title: 'Planos', url: '/super-admin/planos', icon: Crown, roles: ['super_admin'], moduleKey: 'assinatura' },
  { title: 'Entrar como cliente', url: '/admin/entrar-como-cliente', icon: Shield, roles: ['super_admin'], moduleKey: 'usuarios' },
  { title: 'Usuários', url: '/usuarios', icon: Users, roles: ['super_admin'], moduleKey: 'usuarios' },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const { role, signOut, hasPermission, hasModulePermission } = useAuth();
  const collapsed = state === 'collapsed';

  const allMenuUrls = useMemo(() => {
    const menus = [
      ...primaryMenu,
      ...operationsMenu,
      ...catalogMenu,
      ...settingsMenu,
      ...superAdminMenu,
    ];
    return menus.map((m) => m.url);
  }, []);

  const filterByRole = (items: MenuItem[]) =>
    items.filter((item) => hasPermission(item.roles) && hasModulePermission(item.moduleKey));
  const isSuperAdmin = role === 'super_admin';
  const primaryItems = isSuperAdmin ? [] : filterByRole(primaryMenu);
  const operationItems = isSuperAdmin ? [] : filterByRole(operationsMenu);
  const catalogItems = isSuperAdmin ? [] : filterByRole(catalogMenu);
  const settingsItems = isSuperAdmin ? [] : filterByRole(settingsMenu);
  const superAdminItems = filterByRole(superAdminMenu);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const navButtonClass =
    'min-h-11 h-auto text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground [&>span:last-child]:whitespace-normal [&>span:last-child]:overflow-visible [&>span:last-child]:text-clip [&>span:last-child]:leading-tight';
  const neutralNavButtonClass =
    'min-h-11 h-auto text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground [&>span:last-child]:whitespace-normal [&>span:last-child]:overflow-visible [&>span:last-child]:text-clip [&>span:last-child]:leading-tight';
  const isItemActive = (url: string) => {
    const currentPath = location.pathname;

    // Correspondência exata sempre vence
    if (currentPath === url) return true;

    // Para dashboards, evitamos correspondência parcial se não for exata
    if (url === '/dashboard' || url === '/super-admin') {
      return currentPath === url;
    }

    // Se o caminho atual começar com a URL do item (ex: /clientes/novo começando com /clientes)
    if (currentPath.startsWith(`${url}/`)) {
      // Verificamos se existe algum outro item de menu que seja uma correspondência mais específica
      // (ex: se estivermos em /clientes/aniversariantes, não queremos ativar o item /clientes)
      const hasMoreSpecificMatch = allMenuUrls.some(
        (menuUrl) => menuUrl !== url && currentPath.startsWith(menuUrl) && menuUrl.length > url.length,
      );

      return !hasMoreSpecificMatch;
    }

    return false;
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={`flex items-center gap-3 px-3 py-4 ${collapsed ? 'justify-center overflow-hidden' : ''}`}>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
            <Package className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-base font-semibold text-sidebar-foreground truncate">Ideart Cloud</span>
              <span className="text-[11px] font-medium tracking-wide text-sidebar-muted truncate">SISTEMA DE GESTÃO</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className={collapsed ? 'scrollbar-thin px-2 py-4' : 'scrollbar-thin px-4 py-4'}>
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[11px] font-semibold tracking-wide text-sidebar-muted">
              MENU PRINCIPAL
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className={collapsed ? 'gap-1' : ''}>
              {primaryItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isItemActive(item.url)}
                    tooltip={item.title}
                    className={navButtonClass}
                  >
                    <a
                      href={item.url}
                      onClick={(event) => {
                        event.preventDefault();
                        navigate(item.url);
                      }}
                    >
                      <item.icon className="h-5 w-5" />
                      {!collapsed && <span>{item.title}</span>}
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {catalogItems.length > 0 && !isSuperAdmin && (
          <SidebarGroup className="pt-2">
            {!collapsed && (
              <SidebarGroupLabel className="text-[11px] font-semibold tracking-wide text-sidebar-muted">
                CATÁLOGO
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className={collapsed ? 'gap-1' : ''}>
                {catalogItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isItemActive(item.url)}
                      tooltip={item.title}
                      className={navButtonClass}
                    >
                      <a
                        href={item.url}
                        onClick={(event) => {
                          event.preventDefault();
                          navigate(item.url);
                        }}
                      >
                        <item.icon className="h-5 w-5" />
                        {!collapsed && <span>{item.title}</span>}
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {operationItems.length > 0 && !isSuperAdmin && (
          <SidebarGroup className="pt-2">
            {!collapsed && (
              <SidebarGroupLabel className="text-[11px] font-semibold tracking-wide text-sidebar-muted">
                OUTROS
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className={collapsed ? 'gap-1' : ''}>
                {operationItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isItemActive(item.url)}
                      tooltip={item.title}
                      className={navButtonClass}
                    >
                      <a
                        href={item.url}
                        onClick={(event) => {
                          event.preventDefault();
                          navigate(item.url);
                        }}
                      >
                        <item.icon className="h-5 w-5" />
                        {!collapsed && <span>{item.title}</span>}
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {settingsItems.length > 0 && !isSuperAdmin && (
          <SidebarGroup className="pt-2">
            {!collapsed && (
              <SidebarGroupLabel className="text-[11px] font-semibold tracking-wide text-sidebar-muted">
                CONFIGURAÇÕES
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className={collapsed ? 'gap-1' : ''}>
                {settingsItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isItemActive(item.url)}
                      tooltip={item.title}
                      className={navButtonClass}
                    >
                      <a
                        href={item.url}
                        onClick={(event) => {
                          event.preventDefault();
                          navigate(item.url);
                        }}
                      >
                        <item.icon className="h-5 w-5" />
                        {!collapsed && <span>{item.title}</span>}
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isSuperAdmin && superAdminItems.length > 0 && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="text-[11px] font-semibold tracking-wide text-sidebar-muted">
                SUPER ADMIN
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className={collapsed ? 'gap-1' : ''}>
                {superAdminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isItemActive(item.url)}
                      tooltip={item.title}
                      className={navButtonClass}
                    >
                      <a
                        href={item.url}
                        onClick={(event) => {
                          event.preventDefault();
                          navigate(item.url);
                        }}
                      >
                        <item.icon className="h-5 w-5" />
                        {!collapsed && <span>{item.title}</span>}
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-4 py-4">
        <SidebarMenu className={collapsed ? 'gap-1' : ''}>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              tooltip="Sair"
              className={neutralNavButtonClass}
            >
              <LogOut className="h-5 w-5" />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

