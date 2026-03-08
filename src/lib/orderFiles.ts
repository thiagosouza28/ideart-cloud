type OrderFileNameInput = {
  customerName?: string | null;
  productName?: string | null;
  orderNumber?: number | string | null;
  date?: string | Date | null;
  originalFileName?: string | null;
  fallbackBaseName?: string | null;
};

const normalizeSegment = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

const resolveFileExtension = (fileName?: string | null) => {
  const trimmed = String(fileName || '').trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === trimmed.length - 1) return '';
  return normalizeSegment(trimmed.slice(lastDot + 1)).toLowerCase();
};

const resolveFileBaseName = (fileName?: string | null) => {
  const trimmed = String(fileName || '').trim();
  const lastDot = trimmed.lastIndexOf('.');
  const base = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;
  return normalizeSegment(base);
};

const resolveDateLabel = (value?: string | Date | null) => {
  if (!value) return new Date().toISOString().slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
};

export const sanitizeDisplayFileName = (
  value: string,
  originalFileName?: string | null,
  fallbackBaseName = 'arquivo',
) => {
  const originalExtension = resolveFileExtension(originalFileName);
  const nextExtension = resolveFileExtension(value) || originalExtension;
  const rawBaseName = resolveFileBaseName(value) || normalizeSegment(fallbackBaseName) || 'arquivo';
  return nextExtension ? `${rawBaseName}.${nextExtension}` : rawBaseName;
};

export const buildSuggestedOrderFileName = ({
  customerName,
  productName,
  orderNumber,
  date,
  originalFileName,
  fallbackBaseName,
}: OrderFileNameInput) => {
  const extension = resolveFileExtension(originalFileName);
  const dateLabel = resolveDateLabel(date);
  const parts = [
    normalizeSegment(customerName || ''),
    normalizeSegment(productName || ''),
    orderNumber ? normalizeSegment(`PED${String(orderNumber)}`) : '',
    dateLabel,
  ].filter(Boolean);

  const fallback = resolveFileBaseName(originalFileName) || normalizeSegment(fallbackBaseName || 'arquivo');
  const baseName = parts.length > 0 ? parts.join('_') : fallback || 'arquivo';

  return extension ? `${baseName}.${extension}` : baseName;
};
