import { normalizeHexColor } from '@/lib/companyTheme';
import type { OrderStatus, PaymentStatus } from '@/types/database';

export type ConfigurableOrderStatus = Exclude<OrderStatus, 'pronto'>;

export const allOrderStatuses: OrderStatus[] = [
  'orcamento',
  'pendente',
  'produzindo_arte',
  'arte_aprovada',
  'em_producao',
  'finalizado',
  'pronto',
  'aguardando_retirada',
  'entregue',
  'cancelado',
];

export const configurableOrderStatuses: ConfigurableOrderStatus[] = [
  'orcamento',
  'pendente',
  'produzindo_arte',
  'arte_aprovada',
  'em_producao',
  'finalizado',
  'aguardando_retirada',
  'entregue',
  'cancelado',
];

export const defaultOrderStatusLabels: Record<OrderStatus, string> = {
  orcamento: 'Or\u00e7amento',
  pendente: 'Pendente',
  produzindo_arte: 'Produzindo arte',
  arte_aprovada: 'Arte aprovada',
  em_producao: 'Em produ\u00e7\u00e3o',
  finalizado: 'Finalizado',
  pronto: 'Pronto',
  aguardando_retirada: 'Aguardando retirada',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

export const defaultOrderStatusColors: Record<OrderStatus, string> = {
  orcamento: '#2563eb',
  pendente: '#ea580c',
  produzindo_arte: '#4f46e5',
  arte_aprovada: '#059669',
  em_producao: '#d97706',
  finalizado: '#16a34a',
  pronto: '#16a34a',
  aguardando_retirada: '#0ea5e9',
  entregue: '#64748b',
  cancelado: '#dc2626',
};

export type CompanyOrderStatusCustomization = {
  labels: Record<OrderStatus, string>;
  enabled_statuses: ConfigurableOrderStatus[];
  colors: Record<OrderStatus, string>;
};

const isConfigurableOrderStatus = (value: unknown): value is ConfigurableOrderStatus =>
  typeof value === 'string' &&
  configurableOrderStatuses.includes(value as ConfigurableOrderStatus);

const resolveStatusKey = (status: OrderStatus): OrderStatus =>
  status === 'pronto' ? 'finalizado' : status;

const parseLabels = (value: unknown): Record<OrderStatus, string> => {
  const labels = { ...defaultOrderStatusLabels };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return labels;
  }

  const source = value as Record<string, unknown>;
  allOrderStatuses.forEach((status) => {
    const candidate = source[status];
    if (typeof candidate === 'string') {
      const normalized = candidate.trim();
      if (normalized) {
        labels[status] = normalized;
      }
    }
  });

  return labels;
};

const parseColors = (value: unknown): Record<OrderStatus, string> => {
  const colors = { ...defaultOrderStatusColors };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return colors;
  }

  const source = value as Record<string, unknown>;
  allOrderStatuses.forEach((status) => {
    const candidate = source[status];
    if (typeof candidate === 'string') {
      colors[status] = normalizeHexColor(candidate, defaultOrderStatusColors[status]);
    }
  });

  colors.pronto = colors.finalizado;
  return colors;
};

const hexToRgb = (value: string) => {
  const normalized = normalizeHexColor(value);
  const parsed = normalized.slice(1);
  return {
    r: Number.parseInt(parsed.slice(0, 2), 16),
    g: Number.parseInt(parsed.slice(2, 4), 16),
    b: Number.parseInt(parsed.slice(4, 6), 16),
  };
};

const withAlpha = (value: string, alpha: number) => {
  const { r, g, b } = hexToRgb(value);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getRelativeLuminance = (value: string) => {
  const { r, g, b } = hexToRgb(value);
  const transform = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
};

const getReadableAccentText = (value: string) =>
  getRelativeLuminance(value) > 0.55 ? '#0f172a' : value;

export const getOrderStatusLabel = (
  status: OrderStatus,
  customization?: Pick<CompanyOrderStatusCustomization, 'labels'> | null,
  paymentStatus?: PaymentStatus | null,
) => {
  const resolved = resolveStatusKey(status);
  const baseLabel = (
    customization?.labels?.[resolved] ||
    customization?.labels?.[status] ||
    defaultOrderStatusLabels[resolved] ||
    defaultOrderStatusLabels[status]
  );

  if (resolved === 'entregue') {
    if (paymentStatus === 'pendente') {
      return `${baseLabel}, aguardando pagamento`;
    }

    if (paymentStatus === 'parcial') {
      return `${baseLabel}, pagamento parcial`;
    }
  }

  return baseLabel;
};

export const getOrderStatusColor = (
  status: OrderStatus,
  customization?: Pick<CompanyOrderStatusCustomization, 'colors'> | null,
) => {
  const resolved = resolveStatusKey(status);
  return (
    customization?.colors?.[resolved] ||
    customization?.colors?.[status] ||
    defaultOrderStatusColors[resolved] ||
    defaultOrderStatusColors[status]
  );
};

export const getOrderStatusBadgeStyle = (
  status: OrderStatus,
  customization?: CompanyOrderStatusCustomization | null,
) => {
  const baseColor = getOrderStatusColor(status, customization);
  return {
    backgroundColor: withAlpha(baseColor, 0.16),
    color: getReadableAccentText(baseColor),
    borderColor: withAlpha(baseColor, 0.3),
    borderWidth: '1px',
    borderStyle: 'solid',
  };
};

export const getOrderStatusTabStyle = (
  status: OrderStatus,
  customization: CompanyOrderStatusCustomization | null | undefined,
  active: boolean,
) => {
  const baseColor = getOrderStatusColor(status, customization);
  return {
    color: getReadableAccentText(baseColor),
    backgroundColor: active ? withAlpha(baseColor, 0.14) : 'transparent',
    boxShadow: active ? `inset 0 0 0 1px ${withAlpha(baseColor, 0.28)}` : 'none',
  };
};

export const buildOrderStatusCustomization = (
  value?: unknown,
): CompanyOrderStatusCustomization => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      labels: { ...defaultOrderStatusLabels },
      enabled_statuses: [...configurableOrderStatuses],
      colors: { ...defaultOrderStatusColors },
    };
  }

  const source = value as Record<string, unknown>;
  const labels =
    source.labels && typeof source.labels === 'object' && !Array.isArray(source.labels)
      ? parseLabels(source.labels)
      : parseLabels(source);
  const colors =
    source.colors && typeof source.colors === 'object' && !Array.isArray(source.colors)
      ? parseColors(source.colors)
      : parseColors(source);

  const rawEnabled = source.enabled_statuses;
  const hasExplicitEnabledStatuses = Array.isArray(rawEnabled);
  const normalizedEnabled = hasExplicitEnabledStatuses
    ? rawEnabled.filter(isConfigurableOrderStatus)
    : [];

  return {
    labels,
    enabled_statuses: hasExplicitEnabledStatuses
      ? Array.from(new Set(normalizedEnabled))
      : [...configurableOrderStatuses],
    colors,
  };
};
