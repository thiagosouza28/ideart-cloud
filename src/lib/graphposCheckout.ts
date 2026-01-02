export interface GraphPOSCheckoutItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface GraphPOSCheckoutState {
  items: GraphPOSCheckoutItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: 'dinheiro' | 'credito' | 'debito' | 'pix' | 'outros';
  amountPaid: number;
  saleId?: string;
  createdAt?: string;
  editingCustomer?: boolean;
  customer?: {
    id: string;
    name: string;
    document?: string;
    email?: string;
    phone?: string;
  };
}

const STORAGE_KEY = 'graphpos_checkout';

export function getGraphPOSCheckoutState(): GraphPOSCheckoutState | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GraphPOSCheckoutState;
  } catch {
    return null;
  }
}

export function setGraphPOSCheckoutState(state: GraphPOSCheckoutState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearGraphPOSCheckoutState() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
