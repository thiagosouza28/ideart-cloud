import {
  ClipboardList,
  Factory,
  ShoppingCart,
  CreditCard,
  BarChart3,
  Kanban,
  Package,
  Boxes,
  Users,
  Layers,
  Calculator,
  FileText,
  Barcode,
  FolderTree,
  Image as ImageIcon,
  Tags,
  Settings,
} from 'lucide-react';
import { AppModuleKey } from './modulePermissions';
import { AppRole } from '@/types/database';

export interface QuickModule {
  id: string;
  title: string;
  url: string;
  icon: any;
  roles: AppRole[];
  moduleKey: AppModuleKey;
  color: string;
  bg: string;
}

export const allQuickModules: QuickModule[] = [
  { id: 'pedidos', title: 'Pedidos', url: '/pedidos', icon: ClipboardList, roles: ['admin', 'atendente', 'caixa'], moduleKey: 'pedidos', color: 'text-blue-600', bg: 'bg-blue-50' },
  { id: 'producao', title: 'Produção', url: '/producao', icon: Factory, roles: ['admin', 'producao'], moduleKey: 'producao', color: 'text-orange-600', bg: 'bg-orange-50' },
  { id: 'pdv', title: 'PDV', url: '/pdv', icon: ShoppingCart, roles: ['admin', 'caixa'], moduleKey: 'pdv', color: 'text-green-600', bg: 'bg-green-50' },
  { id: 'fluxo_caixa', title: 'Fluxo de Caixa', url: '/financeiro/fluxo-caixa', icon: CreditCard, roles: ['admin', 'financeiro', 'atendente', 'producao'], moduleKey: 'fluxo_caixa', color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { id: 'relatorios', title: 'Relatórios', url: '/financeiro/relatorios', icon: BarChart3, roles: ['admin', 'financeiro', 'atendente', 'producao'], moduleKey: 'relatorios', color: 'text-purple-600', bg: 'bg-purple-50' },
  { id: 'kanban', title: 'Kanban', url: '/pedidos/kanban', icon: Kanban, roles: ['admin', 'atendente', 'caixa', 'producao'], moduleKey: 'kanban_pedidos', color: 'text-sky-600', bg: 'bg-sky-50' },
  { id: 'produtos', title: 'Produtos', url: '/produtos', icon: Package, roles: ['admin', 'atendente'], moduleKey: 'produtos', color: 'text-amber-600', bg: 'bg-amber-50' },
  { id: 'estoque', title: 'Estoque', url: '/estoque', icon: Boxes, roles: ['admin', 'atendente'], moduleKey: 'estoque', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { id: 'clientes', title: 'Clientes', url: '/clientes', icon: Users, roles: ['admin', 'atendente'], moduleKey: 'clientes', color: 'text-rose-600', bg: 'bg-rose-50' },
  { id: 'insumos', title: 'Insumos', url: '/insumos', icon: Layers, roles: ['admin', 'atendente'], moduleKey: 'insumos', color: 'text-amber-600', bg: 'bg-amber-50' },
  { id: 'simulador', title: 'Simulador', url: '/produtos/simulador-preco', icon: Calculator, roles: ['admin', 'atendente'], moduleKey: 'produtos', color: 'text-violet-600', bg: 'bg-violet-50' },
  { id: 'comprovantes', title: 'Comprovantes', url: '/comprovantes', icon: FileText, roles: ['admin', 'atendente', 'caixa'], moduleKey: 'comprovantes', color: 'text-slate-600', bg: 'bg-slate-50' },
  { id: 'etiquetas', title: 'Etiquetas', url: '/produtos/etiquetas', icon: Barcode, roles: ['admin', 'atendente'], moduleKey: 'etiquetas', color: 'text-cyan-600', bg: 'bg-cyan-50' },
  { id: 'categorias', title: 'Categorias', url: '/categorias', icon: FolderTree, roles: ['admin', 'atendente'], moduleKey: 'categorias', color: 'text-blue-600', bg: 'bg-blue-50' },
  { id: 'banners', title: 'Banners', url: '/banners', icon: ImageIcon, roles: ['admin'], moduleKey: 'banners', color: 'text-orange-600', bg: 'bg-orange-50' },
  { id: 'atributos', title: 'Atributos', url: '/atributos', icon: Tags, roles: ['admin', 'atendente'], moduleKey: 'atributos', color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { id: 'catalogo_config', title: 'Configurações', url: '/catalogo/configuracoes', icon: Settings, roles: ['admin'], moduleKey: 'catalogo', color: 'text-slate-600', bg: 'bg-slate-50' },
];

export const defaultQuickAccess = [
  'pedidos',
  'producao',
  'pdv',
  'fluxo_caixa',
  'relatorios',
  'kanban',
  'produtos',
  'estoque',
];
