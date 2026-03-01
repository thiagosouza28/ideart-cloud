export interface PublicCartItem {
  productId: string;
  productSlug?: string | null;
  name: string;
  imageUrl?: string | null;
  unitPrice: number;
  quantity: number;
  minOrderQuantity: number;
  notes?: string | null;
}

export const PUBLIC_CART_UPDATED_EVENT = 'public-cart-updated';

const getStorageKey = (companyId: string) => `public_catalog_cart:${companyId}`;

const emitCartUpdated = (companyId: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(PUBLIC_CART_UPDATED_EVENT, {
      detail: { companyId },
    }),
  );
};

const toValidNumber = (value: unknown, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const sanitizeCartItem = (value: unknown): PublicCartItem | null => {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;

  const productId = typeof item.productId === 'string' ? item.productId.trim() : '';
  const name = typeof item.name === 'string' ? item.name.trim() : '';
  const unitPrice = toValidNumber(item.unitPrice, 0);
  const quantity = Math.max(1, Math.floor(toValidNumber(item.quantity, 1)));
  const minOrderQuantity = Math.max(1, Math.floor(toValidNumber(item.minOrderQuantity, 1)));

  if (!productId || !name || unitPrice < 0) return null;

  return {
    productId,
    productSlug: typeof item.productSlug === 'string' ? item.productSlug : null,
    name,
    imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : null,
    unitPrice,
    quantity,
    minOrderQuantity,
    notes: typeof item.notes === 'string' ? item.notes : null,
  };
};

const writeCart = (companyId: string, items: PublicCartItem[]) => {
  if (!companyId || typeof window === 'undefined') return;
  const key = getStorageKey(companyId);
  window.localStorage.setItem(key, JSON.stringify(items));
  emitCartUpdated(companyId);
};

export const getPublicCart = (companyId: string): PublicCartItem[] => {
  if (!companyId || typeof window === 'undefined') return [];

  const key = getStorageKey(companyId);
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeCartItem)
      .filter((item): item is PublicCartItem => Boolean(item));
  } catch {
    return [];
  }
};

export const clearPublicCart = (companyId: string) => {
  if (!companyId || typeof window === 'undefined') return;
  window.localStorage.removeItem(getStorageKey(companyId));
  emitCartUpdated(companyId);
};

export const removePublicCartItem = (companyId: string, productId: string) => {
  if (!companyId || !productId) return;
  const nextItems = getPublicCart(companyId).filter((item) => item.productId !== productId);
  writeCart(companyId, nextItems);
};

export const setPublicCartItemQuantity = (
  companyId: string,
  productId: string,
  quantity: number,
) => {
  if (!companyId || !productId) return;

  const nextItems = getPublicCart(companyId).map((item) => {
    if (item.productId !== productId) return item;
    const minimum = Math.max(1, item.minOrderQuantity || 1);
    return {
      ...item,
      quantity: Math.max(minimum, Math.floor(quantity || minimum)),
    };
  });

  writeCart(companyId, nextItems);
};

export const upsertPublicCartItem = (
  companyId: string,
  incomingItem: PublicCartItem,
  mode: 'sum' | 'replace' = 'sum',
) => {
  if (!companyId) return;

  const current = getPublicCart(companyId);
  const existingIndex = current.findIndex((item) => item.productId === incomingItem.productId);
  const minimum = Math.max(1, incomingItem.minOrderQuantity || 1);
  const quantity = Math.max(minimum, Math.floor(incomingItem.quantity || minimum));
  const normalizedIncoming = {
    ...incomingItem,
    quantity,
    minOrderQuantity: minimum,
  };

  if (existingIndex < 0) {
    writeCart(companyId, [...current, normalizedIncoming]);
    return;
  }

  const existingItem = current[existingIndex];
  const nextQuantity =
    mode === 'replace'
      ? quantity
      : Math.max(existingItem.minOrderQuantity || 1, existingItem.quantity + quantity);

  const updatedItem: PublicCartItem = {
    ...existingItem,
    ...normalizedIncoming,
    quantity: nextQuantity,
  };

  const nextItems = [...current];
  nextItems[existingIndex] = updatedItem;
  writeCart(companyId, nextItems);
};

export const getPublicCartItemsCount = (companyId: string) =>
  getPublicCart(companyId).reduce((total, item) => total + item.quantity, 0);

