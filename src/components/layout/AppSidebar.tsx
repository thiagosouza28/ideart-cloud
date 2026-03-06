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
  LayoutGrid,
  FolderTree,
  Tags,
  Barcode,
  BarChart3,
  Image as ImageIcon,
  Gift,
  FileText,
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
  { title: 'Relatórios', url: '/financeiro/relatorios', icon: BarChart3, roles: ['admin', 'financeiro', 'atendente', 'producao'], moduleKey: 'relatorios' },
];

const secondaryMenu: MenuItem[] = [
  { title: 'PDV', url: '/pdv', icon: ShoppingCart, roles: ['admin', 'caixa'], moduleKey: 'pdv' },
  { title: 'Comprovantes', url: '/comprovantes', icon: FileText, roles: ['admin', 'atendente', 'caixa'], moduleKey: 'comprovantes' },
  { title: 'Kanban de Pedidos', url: '/pedidos/kanban', icon: Kanban, roles: ['admin', 'atendente', 'caixa', 'producao'], moduleKey: 'kanban_pedidos' },
  { title: 'Catálogo', url: '/catalogo-admin', icon: LayoutGrid, roles: ['admin'], moduleKey: 'catalogo' },
  { title: 'Produtos', url: '/produtos', icon: Package, roles: ['admin', 'atendente'], moduleKey: 'produtos' },
  { title: 'Etiquetas', url: '/produtos/etiquetas', icon: Barcode, roles: ['admin', 'atendente'], moduleKey: 'etiquetas' },
  { title: 'Categorias', url: '/categorias', icon: FolderTree, roles: ['admin', 'atendente'], moduleKey: 'categorias' },
  { title: 'Insumos', url: '/insumos', icon: Layers, roles: ['admin', 'atendente'], moduleKey: 'insumos' },
  { title: 'Atributos', url: '/atributos', icon: Tags, roles: ['admin', 'atendente'], moduleKey: 'atributos' },
  { title: 'Estoque', url: '/estoque', icon: Boxes, roles: ['admin', 'atendente'], moduleKey: 'estoque' },
  { title: 'Clientes', url: '/clientes', icon: Users, roles: ['admin', 'atendente'], moduleKey: 'clientes' },
  { title: 'Aniversariantes do Mês', url: '/clientes/aniversariantes', icon: Gift, roles: ['admin', 'atendente'], moduleKey: 'aniversariantes' },
  { title: 'Empresas', url: '/empresas', icon: Building2, roles: ['admin'], moduleKey: 'empresas' },
  { title: 'Pagamentos PIX', url: '/configuracoes/pagamentos/pix', icon: CreditCard, roles: ['admin'], moduleKey: 'pagamentos_pix' },
  { title: 'Banners', url: '/banners', icon: ImageIcon, roles: ['admin'], moduleKey: 'banners' },
  { title: 'Usuários', url: '/usuarios', icon: User, roles: ['admin'], moduleKey: 'usuarios' },
  { title: 'Assinatura', url: '/assinatura', icon: Crown, roles: ['admin', 'financeiro'], moduleKey: 'assinatura' },
];

const superAdminMenu: MenuItem[] = [
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

  const filterByRole = (items: MenuItem[]) =>
    items.filter((item) => hasPermission(item.roles) && hasModulePermission(item.moduleKey));
  const isSuperAdmin = role === 'super_admin';
  const primaryItems = isSuperAdmin ? [] : filterByRole(primaryMenu);
  const secondaryItems = isSuperAdmin ? [] : filterByRole(secondaryMenu);
  const superAdminItems = filterByRole(superAdminMenu);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const navButtonClass =
    'min-h-11 h-auto rounded-2xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground [&>span:last-child]:whitespace-normal [&>span:last-child]:overflow-visible [&>span:last-child]:text-clip [&>span:last-child]:leading-tight';
  const neutralNavButtonClass =
    'min-h-11 h-auto rounded-2xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground [&>span:last-child]:whitespace-normal [&>span:last-child]:overflow-visible [&>span:last-child]:text-clip [&>span:last-child]:leading-tight';

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={`flex items-center gap-3 px-3 py-4 ${collapsed ? 'justify-center' : ''}`}>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
            <Package className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-base font-semibold text-sidebar-foreground">Ideart Cloud</span>
              <span className="text-[11px] font-medium tracking-wide text-sidebar-muted">SISTEMA DE GESTÃO</span>
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
                    isActive={location.pathname === item.url}
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

        {secondaryItems.length > 0 && !isSuperAdmin && (
          <SidebarGroup className="pt-2">
            {!collapsed && (
              <SidebarGroupLabel className="text-[11px] font-semibold tracking-wide text-sidebar-muted">
                OUTROS
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className={collapsed ? 'gap-1' : ''}>
                {secondaryItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === item.url}
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
                      isActive={location.pathname === item.url || location.pathname.startsWith(`${item.url}/`)}
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
          {!isSuperAdmin && hasModulePermission('configuracoes') && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="Configurações"
                className={navButtonClass}
                isActive={location.pathname === '/configuracoes'}
              >
                <a
                  href="/configuracoes"
                  onClick={(event) => {
                    event.preventDefault();
                    navigate('/configuracoes');
                  }}
                >
                  <Settings className="h-5 w-5" />
                  {!collapsed && <span>Configurações</span>}
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
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

