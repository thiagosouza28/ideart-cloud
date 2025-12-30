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
  BarChart3,
  Image as ImageIcon
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
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

const menuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, roles: ['super_admin', 'admin', 'atendente', 'caixa', 'producao'] },
  { title: 'PDV', url: '/pdv', icon: ShoppingCart, roles: ['admin', 'caixa'] },
  { title: 'Pedidos', url: '/pedidos', icon: ClipboardList, roles: ['admin', 'atendente', 'caixa'] },
  { title: 'Kanban de Pedidos', url: '/pedidos/kanban', icon: Kanban, roles: ['admin', 'atendente', 'caixa', 'producao'] },
  { title: 'Produção', url: '/producao', icon: Factory, roles: ['admin', 'producao'] },
  { title: 'Produtos', url: '/produtos', icon: Package, roles: ['admin', 'atendente'] },
  { title: 'Categorias', url: '/categorias', icon: FolderTree, roles: ['admin', 'atendente'] },
  { title: 'Insumos', url: '/insumos', icon: Layers, roles: ['admin', 'atendente'] },
  { title: 'Atributos', url: '/atributos', icon: Tags, roles: ['admin', 'atendente'] },
  { title: 'Estoque', url: '/estoque', icon: Boxes, roles: ['admin', 'atendente'] },
  { title: 'Clientes', url: '/clientes', icon: Users, roles: ['admin', 'atendente'] },
  { title: 'Relatórios', url: '/relatorios', icon: BarChart3, roles: ['admin'] },
  { title: 'Empresas', url: '/empresas', icon: Building2, roles: ['admin'] },
  { title: 'Banners', url: '/banners', icon: ImageIcon, roles: ['admin'] },
  { title: 'Usuários', url: '/usuarios', icon: User, roles: ['admin'] },
  { title: 'Assinatura', url: '/assinatura', icon: Crown, roles: ['admin'] },
  { title: 'Configurações', url: '/configuracoes', icon: Settings, roles: ['admin'] },
];

const superAdminMenuItems: MenuItem[] = [
  { title: 'Painel', url: '/super-admin', icon: LayoutDashboard, roles: ['super_admin'] },
  { title: 'Empresas SaaS', url: '/super-admin/empresas', icon: Building2, roles: ['super_admin'] },
  { title: 'Planos', url: '/super-admin/planos', icon: CreditCard, roles: ['super_admin'] },
  { title: 'Usuários', url: '/usuarios', icon: Users, roles: ['super_admin'] },
];

const roleLabels: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  atendente: 'Atendente',
  caixa: 'Caixa',
  producao: 'Produção',
};

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const { profile, role, signOut, hasPermission } = useAuth();
  const collapsed = state === 'collapsed';

  const filteredMenuItems = menuItems.filter(item => hasPermission(item.roles));
  const filteredSuperAdminItems = superAdminMenuItems.filter(item => hasPermission(item.roles));
  const isSuperAdmin = role === 'super_admin';

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={`flex items-center gap-3 px-2 py-3 ${collapsed ? "justify-center" : ""}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Package className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-base font-semibold text-sidebar-foreground">GraficaERP</span>
              <span className="text-sm text-sidebar-muted">Sistema de Gestão</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className={collapsed ? "scrollbar-thin px-2 py-4" : "scrollbar-thin px-3 py-4"}>
        {isSuperAdmin && filteredSuperAdminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className={collapsed ? "gap-1" : ""}>
                {filteredSuperAdminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === item.url || location.pathname.startsWith(item.url + '/')}
                      tooltip={item.title}
                      className={collapsed ? "justify-center" : ""}
                    >
                      <a
                        href={item.url}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(item.url);
                        }}
                      >
                        <item.icon />
                        {!collapsed && <span>{item.title}</span>}
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {!isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className={collapsed ? "gap-1" : ""}>
                {filteredMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === item.url}
                      tooltip={item.title}
                      className={collapsed ? "justify-center" : ""}
                    >
                      <a
                        href={item.url}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(item.url);
                        }}
                      >
                        <item.icon />
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

      <SidebarFooter className="border-t border-sidebar-border px-3 py-4">
        <SidebarMenu className={collapsed ? "gap-1" : ""}>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Minha Conta"
              className={collapsed ? "justify-center" : ""}
            >
              <a
                href="/perfil"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/perfil');
                }}
              >
                <User />
                {!collapsed && <span>Minha conta</span>}
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              tooltip="Sair"
              className={`${collapsed ? "justify-center " : ""}text-sidebar-foreground hover:text-destructive`}
            >
              <LogOut />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

