import type { PaymentMethod } from '@/types/database';

export type CheckoutPaymentMethodType = Extract<
  PaymentMethod,
  'pix' | 'dinheiro' | 'credito' | 'debito' | 'transferencia' | 'outro'
>;

export type CompanyPaymentMethodConfig = {
  id?: string;
  company_id?: string | null;
  name: string;
  type: PaymentMethod;
  fee_percentage: number;
  is_active: boolean;
  description: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type CheckoutPaymentMethodOption = {
  type: CheckoutPaymentMethodType;
  name: string;
  description: string | null;
  fee_percentage: number;
};

export const paymentMethodTypeLabels: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  credito: 'Cartão de crédito',
  debito: 'Cartão de débito',
  transferencia: 'Transferência',
  pix: 'Pix',
  boleto: 'Boleto',
  outro: 'Outros',
};

export const paymentMethodSortOrder: Record<PaymentMethod, number> = {
  dinheiro: 10,
  cartao: 20,
  credito: 30,
  debito: 40,
  pix: 50,
  boleto: 60,
  transferencia: 70,
  outro: 80,
};

export const defaultCompanyPaymentMethods: CompanyPaymentMethodConfig[] = [
  {
    type: 'dinheiro',
    name: 'Dinheiro',
    fee_percentage: 0,
    is_active: true,
    description: 'Recebimento em dinheiro.',
    sort_order: paymentMethodSortOrder.dinheiro,
  },
  {
    type: 'cartao',
    name: 'Cartão',
    fee_percentage: 0,
    is_active: true,
    description: 'Cartão em cobrança única.',
    sort_order: paymentMethodSortOrder.cartao,
  },
  {
    type: 'credito',
    name: 'Cartão de crédito',
    fee_percentage: 0,
    is_active: true,
    description: 'Cobrança no crédito.',
    sort_order: paymentMethodSortOrder.credito,
  },
  {
    type: 'debito',
    name: 'Cartão de débito',
    fee_percentage: 0,
    is_active: true,
    description: 'Cobrança no débito.',
    sort_order: paymentMethodSortOrder.debito,
  },
  {
    type: 'pix',
    name: 'Pix',
    fee_percentage: 0,
    is_active: true,
    description: 'Pagamento via Pix.',
    sort_order: paymentMethodSortOrder.pix,
  },
  {
    type: 'boleto',
    name: 'Boleto',
    fee_percentage: 0,
    is_active: false,
    description: 'Cobrança via boleto.',
    sort_order: paymentMethodSortOrder.boleto,
  },
  {
    type: 'transferencia',
    name: 'Transferência',
    fee_percentage: 0,
    is_active: true,
    description: 'Transferência bancária.',
    sort_order: paymentMethodSortOrder.transferencia,
  },
  {
    type: 'outro',
    name: 'Outros',
    fee_percentage: 0,
    is_active: true,
    description: 'Outras formas de pagamento.',
    sort_order: paymentMethodSortOrder.outro,
  },
];

const checkoutPaymentTypes = new Set<CheckoutPaymentMethodType>([
  'pix',
  'dinheiro',
  'credito',
  'debito',
  'transferencia',
  'outro',
]);

const asPaymentMethod = (value: unknown): PaymentMethod | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase() as PaymentMethod;
  return normalized in paymentMethodTypeLabels ? normalized : null;
};

const sortPaymentMethods = (items: CompanyPaymentMethodConfig[]) =>
  [...items].sort((left, right) => {
    const sortDiff = Number(left.sort_order || 0) - Number(right.sort_order || 0);
    if (sortDiff !== 0) return sortDiff;
    return left.name.localeCompare(right.name, 'pt-BR');
  });

export const normalizeCompanyPaymentMethods = (
  value: unknown,
  companyId?: string | null,
): CompanyPaymentMethodConfig[] => {
  const defaultsByType = new Map(
    defaultCompanyPaymentMethods.map((item) => [item.type, item]),
  );

  if (!Array.isArray(value) || value.length === 0) {
    return sortPaymentMethods(
      defaultCompanyPaymentMethods.map((item) => ({
        ...item,
        company_id: companyId || null,
      })),
    );
  }

  const resolved = value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const type = asPaymentMethod(record.type);
      if (!type) return null;

      const fallback = defaultsByType.get(type);
      return {
        id: typeof record.id === 'string' ? record.id : undefined,
        company_id:
          typeof record.company_id === 'string'
            ? record.company_id
            : companyId || null,
        name:
          typeof record.name === 'string' && record.name.trim()
            ? record.name.trim()
            : fallback?.name || paymentMethodTypeLabels[type],
        type,
        fee_percentage: Number(record.fee_percentage || 0) || 0,
        is_active:
          typeof record.is_active === 'boolean'
            ? record.is_active
            : fallback?.is_active ?? true,
        description:
          typeof record.description === 'string' && record.description.trim()
            ? record.description.trim()
            : fallback?.description || null,
        sort_order:
          Number.isFinite(Number(record.sort_order))
            ? Number(record.sort_order)
            : fallback?.sort_order || paymentMethodSortOrder[type],
        created_at:
          typeof record.created_at === 'string' ? record.created_at : undefined,
        updated_at:
          typeof record.updated_at === 'string' ? record.updated_at : undefined,
      } satisfies CompanyPaymentMethodConfig;
    })
    .filter((item): item is CompanyPaymentMethodConfig => Boolean(item));

  const byType = new Map<PaymentMethod, CompanyPaymentMethodConfig>();
  resolved.forEach((item) => byType.set(item.type, item));

  defaultCompanyPaymentMethods.forEach((item) => {
    if (!byType.has(item.type)) {
      byType.set(item.type, {
        ...item,
        company_id: companyId || null,
      });
    }
  });

  return sortPaymentMethods(Array.from(byType.values()));
};

export const getActiveCompanyPaymentMethods = (
  value: CompanyPaymentMethodConfig[],
) => sortPaymentMethods(value.filter((item) => item.is_active));

export const getSelectableCompanyPaymentMethods = (
  value: CompanyPaymentMethodConfig[],
  ensuredTypes: Array<PaymentMethod | '' | null | undefined> = [],
) => {
  const activeMethods = getActiveCompanyPaymentMethods(value);
  const byType = new Map(activeMethods.map((item) => [item.type, item]));

  ensuredTypes.forEach((type) => {
    const normalized = asPaymentMethod(type);
    if (!normalized || byType.has(normalized)) return;
    const fallback =
      defaultCompanyPaymentMethods.find((item) => item.type === normalized) || {
        type: normalized,
        name: paymentMethodTypeLabels[normalized],
        fee_percentage: 0,
        is_active: true,
        description: null,
        sort_order: paymentMethodSortOrder[normalized],
      };
    byType.set(normalized, fallback);
  });

  return sortPaymentMethods(Array.from(byType.values()));
};

export const getPaymentMethodDisplayName = (
  type: PaymentMethod | '' | null | undefined,
  methods?: CompanyPaymentMethodConfig[] | null,
) => {
  const normalized = asPaymentMethod(type);
  if (!normalized) return '';
  const customName = methods?.find((item) => item.type === normalized)?.name?.trim();
  return customName || paymentMethodTypeLabels[normalized];
};

export const normalizeCheckoutPaymentOptions = (
  value: unknown,
): CheckoutPaymentMethodOption[] => {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((item) => {
      if (typeof item === 'string') {
        const type = asPaymentMethod(item);
        if (!type || !checkoutPaymentTypes.has(type as CheckoutPaymentMethodType)) return null;
        return {
          type: type as CheckoutPaymentMethodType,
          name: paymentMethodTypeLabels[type],
          description: null,
          fee_percentage: 0,
        } satisfies CheckoutPaymentMethodOption;
      }

      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const type = asPaymentMethod(record.type);
      if (!type || !checkoutPaymentTypes.has(type as CheckoutPaymentMethodType)) return null;

      return {
        type: type as CheckoutPaymentMethodType,
        name:
          typeof record.name === 'string' && record.name.trim()
            ? record.name.trim()
            : paymentMethodTypeLabels[type],
        description:
          typeof record.description === 'string' && record.description.trim()
            ? record.description.trim()
            : null,
        fee_percentage: Number(record.fee_percentage || 0) || 0,
      } satisfies CheckoutPaymentMethodOption;
    })
    .filter((item): item is CheckoutPaymentMethodOption => Boolean(item));

  const seen = new Set<CheckoutPaymentMethodType>();
  return normalized.filter((item) => {
    if (seen.has(item.type)) return false;
    seen.add(item.type);
    return true;
  });
};
