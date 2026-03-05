import type { OrderStatus } from '@/types/database';

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
  orcamento: 'Orçamento',
  pendente: 'Pendente',
  produzindo_arte: 'Produzindo arte',
  arte_aprovada: 'Arte aprovada',
  em_producao: 'Em produção',
  finalizado: 'Finalizado',
  pronto: 'Pronto',
  aguardando_retirada: 'Aguardando retirada',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

export type CompanyOrderStatusCustomization = {
  labels: Record<OrderStatus, string>;
  enabled_statuses: ConfigurableOrderStatus[];
};

const isConfigurableOrderStatus = (value: unknown): value is ConfigurableOrderStatus =>
  typeof value === 'string' &&
  configurableOrderStatuses.includes(value as ConfigurableOrderStatus);

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

export const buildOrderStatusCustomization = (
  value?: unknown,
): CompanyOrderStatusCustomization => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      labels: { ...defaultOrderStatusLabels },
      enabled_statuses: [...configurableOrderStatuses],
    };
  }

  const source = value as Record<string, unknown>;
  const labels =
    source.labels && typeof source.labels === 'object' && !Array.isArray(source.labels)
      ? parseLabels(source.labels)
      : parseLabels(source);

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
  };
};
