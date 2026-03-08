import type { AppRole } from '@/types/database';

export type StoreAppRole = Exclude<AppRole, 'super_admin'>;

export const storeAppRoles: StoreAppRole[] = [
  'admin',
  'financeiro',
  'atendente',
  'caixa',
  'producao',
];

export type AppModuleKey =
  | 'dashboard'
  | 'pedidos'
  | 'producao'
  | 'fluxo_caixa'
  | 'relatorios'
  | 'pdv'
  | 'comprovantes'
  | 'kanban_pedidos'
  | 'catalogo'
  | 'produtos'
  | 'etiquetas'
  | 'categorias'
  | 'insumos'
  | 'atributos'
  | 'estoque'
  | 'clientes'
  | 'aniversariantes'
  | 'empresas'
  | 'pagamentos_pix'
  | 'banners'
  | 'usuarios'
  | 'assinatura'
  | 'configuracoes';

export type RoleModulePermissions = Record<StoreAppRole, Record<AppModuleKey, boolean>>;

export type ModuleDefinition = {
  key: AppModuleKey;
  label: string;
  description: string;
  defaultRoles: StoreAppRole[];
};

export const storeRoleLabels: Record<StoreAppRole, string> = {
  admin: 'Admin',
  financeiro: 'Financeiro',
  atendente: 'Atendente',
  caixa: 'Caixa',
  producao: 'Produção',
};

export const moduleDefinitions: ModuleDefinition[] = [
  { key: 'dashboard', label: 'Painel', description: 'Visão geral da operação.', defaultRoles: ['admin', 'financeiro', 'atendente', 'caixa', 'producao'] },
  { key: 'pedidos', label: 'Pedidos', description: 'Lista e gestão de pedidos.', defaultRoles: ['admin', 'atendente', 'caixa', 'producao'] },
  { key: 'kanban_pedidos', label: 'Kanban de pedidos', description: 'Quadro de status dos pedidos.', defaultRoles: ['admin', 'atendente', 'caixa', 'producao'] },
  { key: 'producao', label: 'Produção', description: 'Painel de produção.', defaultRoles: ['admin', 'producao'] },
  { key: 'pdv', label: 'PDV', description: 'Fluxo de venda no caixa.', defaultRoles: ['admin', 'caixa'] },
  { key: 'comprovantes', label: 'Comprovantes', description: 'Comprovantes e recibos.', defaultRoles: ['admin', 'atendente', 'caixa'] },
  { key: 'fluxo_caixa', label: 'Fluxo de caixa', description: 'Movimentações financeiras.', defaultRoles: ['admin', 'financeiro', 'atendente', 'producao'] },
  { key: 'relatorios', label: 'Relatórios', description: 'Relatórios financeiros/gerenciais.', defaultRoles: ['admin', 'financeiro', 'atendente', 'producao'] },
  { key: 'catalogo', label: 'Catálogo', description: 'Gestão do catálogo público.', defaultRoles: ['admin'] },
  { key: 'produtos', label: 'Produtos', description: 'Cadastro de produtos.', defaultRoles: ['admin', 'atendente'] },
  { key: 'etiquetas', label: 'Etiquetas', description: 'Impressão de etiquetas.', defaultRoles: ['admin', 'atendente'] },
  { key: 'categorias', label: 'Categorias', description: 'Categorias de produtos.', defaultRoles: ['admin', 'atendente'] },
  { key: 'insumos', label: 'Insumos', description: 'Cadastro de insumos.', defaultRoles: ['admin', 'atendente'] },
  { key: 'atributos', label: 'Atributos', description: 'Atributos de produtos.', defaultRoles: ['admin', 'atendente'] },
  { key: 'estoque', label: 'Estoque', description: 'Controle de estoque.', defaultRoles: ['admin', 'atendente'] },
  { key: 'clientes', label: 'Clientes', description: 'Cadastro e histórico de clientes.', defaultRoles: ['admin', 'atendente'] },
  { key: 'aniversariantes', label: 'Aniversariantes', description: 'Aniversariantes do mês.', defaultRoles: ['admin', 'atendente'] },
  { key: 'empresas', label: 'Empresas', description: 'Dados da empresa.', defaultRoles: ['admin'] },
  { key: 'pagamentos_pix', label: 'Pagamentos', description: 'Configuração de pagamentos e PIX.', defaultRoles: ['admin'] },
  { key: 'banners', label: 'Banners', description: 'Gestão de banners.', defaultRoles: ['admin'] },
  { key: 'usuarios', label: 'Usuários', description: 'Gestão de usuários e cargos.', defaultRoles: ['admin'] },
  { key: 'assinatura', label: 'Assinatura', description: 'Plano e assinatura.', defaultRoles: ['admin', 'financeiro'] },
  { key: 'configuracoes', label: 'Configurações', description: 'Configurações gerais.', defaultRoles: ['admin'] },
];

const moduleKeySet = new Set<AppModuleKey>(moduleDefinitions.map((item) => item.key));

export const lockedModulesByRole: Partial<Record<StoreAppRole, AppModuleKey[]>> = {
  admin: ['dashboard', 'configuracoes'],
  financeiro: ['dashboard'],
  atendente: ['dashboard'],
  caixa: ['dashboard'],
  producao: ['dashboard'],
};

export const isModuleLockedForRole = (role: StoreAppRole, moduleKey: AppModuleKey) =>
  (lockedModulesByRole[role] || []).includes(moduleKey);

const createEmptyPermissions = (): RoleModulePermissions =>
  storeAppRoles.reduce((acc, role) => {
    const moduleMap = moduleDefinitions.reduce((modAcc, moduleItem) => {
      modAcc[moduleItem.key] = false;
      return modAcc;
    }, {} as Record<AppModuleKey, boolean>);
    acc[role] = moduleMap;
    return acc;
  }, {} as RoleModulePermissions);

export const createDefaultRoleModulePermissions = (): RoleModulePermissions => {
  const base = createEmptyPermissions();

  moduleDefinitions.forEach((moduleItem) => {
    moduleItem.defaultRoles.forEach((role) => {
      base[role][moduleItem.key] = true;
    });
  });

  storeAppRoles.forEach((role) => {
    (lockedModulesByRole[role] || []).forEach((moduleKey) => {
      base[role][moduleKey] = true;
    });
  });

  return base;
};

export const normalizeRoleModulePermissions = (value?: unknown): RoleModulePermissions => {
  const normalized = createDefaultRoleModulePermissions();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return normalized;
  }

  const source = value as Record<string, unknown>;
  storeAppRoles.forEach((role) => {
    const rawRoleValue = source[role];
    if (!rawRoleValue || typeof rawRoleValue !== 'object' || Array.isArray(rawRoleValue)) {
      return;
    }

    const roleMap = rawRoleValue as Record<string, unknown>;
    Object.entries(roleMap).forEach(([moduleKey, rawEnabled]) => {
      if (!moduleKeySet.has(moduleKey as AppModuleKey)) return;
      normalized[role][moduleKey as AppModuleKey] = rawEnabled === true;
    });
  });

  storeAppRoles.forEach((role) => {
    (lockedModulesByRole[role] || []).forEach((moduleKey) => {
      normalized[role][moduleKey] = true;
    });
  });

  return normalized;
};

export const hasModuleAccess = (
  permissions: RoleModulePermissions,
  role: AppRole | null | undefined,
  moduleKey: AppModuleKey,
) => {
  if (!role) return false;
  if (role === 'super_admin') return true;
  return Boolean(permissions[role]?.[moduleKey]);
};
