const META_PREFIX = '[meta]';
const PERSONALIZED_TAG = `${META_PREFIX} public_catalog_personalized=true`;
const PENDING_CUSTOMER_INFO_TAG = `${META_PREFIX} pending_customer_info=true`;
const PUBLIC_CATALOG_SOURCE_TAG = `${META_PREFIX} source=public_catalog`;
const PENDING_CUSTOMER_INFO_LINES = new Set([
  PENDING_CUSTOMER_INFO_TAG,
  'Pendente - aguardando informacoes do cliente.',
  'Pendente - aguardando informações do cliente.',
]);

export const isPublicCatalogPersonalizedOrder = (notes?: string | null) =>
  (notes || '').includes(PERSONALIZED_TAG);

export const isPendingCustomerInfoOrder = (notes?: string | null) =>
  (notes || '').includes(PENDING_CUSTOMER_INFO_TAG);

export const isPublicCatalogOrder = (notes?: string | null) =>
  (notes || '').includes(PUBLIC_CATALOG_SOURCE_TAG);

export const stripPendingCustomerInfoNotes = (notes?: string | null) => {
  const remainingLines = (notes || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !PENDING_CUSTOMER_INFO_LINES.has(line));

  return remainingLines.length > 0 ? remainingLines.join('\n') : null;
};
