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

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
}

const primaryMenu: MenuItem[] = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, roles: ['super_admin', 'admin', 'atendente', 'caixa', 'producao'] },
  { title: 'Pedidos', url: '/pedidos', icon: ClipboardList, roles: ['admin', 'atendente', 'caixa'] },
  { title: 'Produção', url: '/producao', icon: Factory, roles: ['admin', 'producao'] },
  { title: 'Relatórios', url: '/relatorios', icon: BarChart3, roles: ['admin'] },
];

const secondaryMenu: MenuItem[] = [
  { title: 'PDV', url: '/pdv', icon: ShoppingCart, roles: ['admin', 'caixa'] },
  { title: 'Kanban de Pedidos', url: '/pedidos/kanban', icon: Kanban, roles: ['admin', 'atendente', 'caixa', 'producao'] },
  { title: 'Catálogo', url: '/catalogo-admin', icon: LayoutGrid, roles: ['admin'] },
  { title: 'Produtos', url: '/produtos', icon: Package, roles: ['admin', 'atendente'] },
  { title: 'Etiquetas', url: '/produtos/etiquetas', icon: Barcode, roles: ['admin', 'atendente'] },
  { title: 'Categorias', url: '/categorias', icon: FolderTree, roles: ['admin', 'atendente'] },
  { title: 'Insumos', url: '/insumos', icon: Layers, roles: ['admin', 'atendente'] },
  { title: 'Atributos', url: '/atributos', icon: Tags, roles: ['admin', 'atendente'] },
  { title: 'Estoque', url: '/estoque', icon: Boxes, roles: ['admin', 'atendente'] },
  { title: 'Clientes', url: '/clientes', icon: Users, roles: ['admin', 'atendente'] },
  { title: 'Aniversariantes do Mes', url: '/clientes/aniversariantes', icon: Gift, roles: ['admin', 'atendente'] },
  { title: 'Empresas', url: '/empresas', icon: Building2, roles: ['admin'] },
  { title: 'Banners', url: '/banners', icon: ImageIcon, roles: ['admin'] },
  { title: 'Usuários', url: '/usuarios', icon: User, roles: ['admin'] },
  { title: 'Assinatura', url: '/assinatura', icon: Crown, roles: ['admin'] },
];

const superAdminMenu: MenuItem[] = [
  { title: 'Painel', url: '/super-admin', icon: LayoutDashboard, roles: ['super_admin'] },
  { title: 'Empresas SaaS', url: '/super-admin/empresas', icon: Building2, roles: ['super_admin'] },
  { title: 'Planos', url: '/super-admin/planos', icon: CreditCard, roles: ['super_admin'] },
  { title: 'Usuários', url: '/usuarios', icon: Users, roles: ['super_admin'] },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const { role, signOut, hasPermission } = useAuth();
  const collapsed = state === 'collapsed';

  const filterByRole = (items: MenuItem[]) => items.filter((item) => hasPermission(item.roles));
  const isSuperAdmin = role === 'super_admin';
  const primaryItems = isSuperAdmin ? [] : filterByRole(primaryMenu);
  const secondaryItems = isSuperAdmin ? [] : filterByRole(secondaryMenu);
  const superAdminItems = filterByRole(superAdminMenu);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={`flex items-center gap-3 px-3 py-4 ${collapsed ? 'justify-center' : ''}`}>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-600 text-white shadow-sm">
            <Package className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-base font-semibold text-slate-900">GráficaERP</span>
              <span className="text-[11px] font-medium tracking-wide text-slate-400">SISTEMA DE GESTÃO</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className={collapsed ? 'scrollbar-thin px-2 py-4' : 'scrollbar-thin px-4 py-4'}>
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[11px] font-semibold tracking-wide text-slate-400">
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
                    className={
                      'h-11 rounded-2xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 data-[active=true]:bg-purple-600 data-[active=true]:text-white'
                    }
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
              <SidebarGroupLabel className="text-[11px] font-semibold tracking-wide text-slate-400">
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
                      className={
                        'h-11 rounded-2xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 data-[active=true]:bg-purple-600 data-[active=true]:text-white'
                      }
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
              <SidebarGroupLabel className="text-[11px] font-semibold tracking-wide text-slate-400">
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
                      className={
                        'h-11 rounded-2xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 data-[active=true]:bg-purple-600 data-[active=true]:text-white'
                      }
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
          {!isSuperAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="Configurações"
                className={
                  'h-11 rounded-2xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 data-[active=true]:bg-purple-600 data-[active=true]:text-white'
                }
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
              className="h-11 rounded-2xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
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
