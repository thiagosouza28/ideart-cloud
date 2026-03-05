import { formatOrderNumber } from '@/lib/utils';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT_REGEX =
  /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

export const extractOrderIdFromParam = (value?: string | null): string | null => {
  if (!value) return null;
  const candidate = value.trim();
  if (!candidate) return null;
  if (UUID_REGEX.test(candidate)) return candidate;
  const match = candidate.match(UUID_IN_TEXT_REGEX);
  return match?.[1] || null;
};

export const buildOrderDetailsPath = ({
  id,
  orderNumber,
  customerName,
}: {
  id: string;
  orderNumber?: number | string | null;
  customerName?: string | null;
}) => {
  const customerSlug = slugify(customerName || 'cliente') || 'cliente';
  const formattedOrder = formatOrderNumber(orderNumber);
  const orderToken = formattedOrder || '00000';
  return `/pedidos/${customerSlug}-${orderToken}-${id}`;
};
