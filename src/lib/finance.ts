import type {
  Expense,
  ExpenseDueStatus,
  FinancialEntry,
  Order,
  OrderItem,
  Product,
  ProductSupply,
  Sale,
  SaleItem,
} from '@/types/database';

const DAY_MS = 24 * 60 * 60 * 1000;
const DUPLICATED_FINANCIAL_ORIGINS = new Set([
  'order_payment',
  'order_payment_cancel',
  'order_payment_delete',
  'venda',
  'reembolso',
  'pdv',
]);

export type ForecastPeriod = 'today' | 'week' | 'month';

export type ExpenseAlertItem = {
  id: string;
  title: string;
  amount: number;
  dueDate: string | null;
  dueStatus: ExpenseDueStatus;
};

export type ExpenseAlertSummary = {
  total: number;
  dueSoon: number;
  overdue: number;
  items: ExpenseAlertItem[];
};

export type CashForecastSummary = {
  currentBalance: number;
  incoming: number;
  outgoing: number;
  projectedBalance: number;
};

export type CashForecastPoint = {
  label: string;
  incoming: number;
  outgoing: number;
  net: number;
};

export type ProductProfitabilityRow = {
  id: string;
  name: string;
  soldUnits: number;
  salePrice: number;
  directCost: number;
  fixedAllocation: number;
  variableShare: number;
  totalRealCost: number;
  profitPerUnit: number;
  marginPct: number;
  totalCost: number;
  totalProfit: number;
  revenue: number;
};

const startOfDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(23, 59, 59, 999);
  return next;
};

const diffInDays = (from: Date, to: Date) =>
  Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

const getMonthLastDay = (year: number, monthIndex: number) =>
  new Date(year, monthIndex + 1, 0).getDate();

const normalizeDueDay = (expense: Expense) => {
  const rawDay =
    expense.due_day ??
    (expense.expense_date ? new Date(`${expense.expense_date}T00:00:00`).getDate() : null) ??
    new Date(expense.created_at).getDate();

  if (!rawDay || Number.isNaN(rawDay)) return null;
  return Math.min(Math.max(rawDay, 1), 31);
};

export const getExpenseAmount = (expense: Expense) =>
  Number(expense.expense_type === 'recorrente' ? expense.monthly_amount : expense.amount || 0);

export const isExpensePaidForReferenceDate = (
  expense: Expense,
  referenceDate = new Date(),
) => {
  if (expense.status !== 'pago') return false;
  if (expense.expense_type !== 'recorrente') return true;
  if (!expense.paid_at) return false;

  const paidAt = new Date(expense.paid_at);
  if (Number.isNaN(paidAt.getTime())) return false;

  return (
    paidAt.getFullYear() === referenceDate.getFullYear() &&
    paidAt.getMonth() === referenceDate.getMonth()
  );
};

export const getExpenseDisplayStatus = (
  expense: Expense,
  referenceDate = new Date(),
) => {
  if (expense.status === 'inativo') return 'inativo';
  return isExpensePaidForReferenceDate(expense, referenceDate) ? 'pago' : 'pendente';
};

export const resolveExpenseDueDate = (expense: Expense, referenceDate = new Date()) => {
  if (expense.expense_type === 'nao_recorrente') {
    const rawDate = expense.due_date || expense.expense_date;
    if (!rawDate) return null;
    const dueDate = new Date(`${rawDate}T00:00:00`);
    return Number.isNaN(dueDate.getTime()) ? null : dueDate;
  }

  const dueDay = normalizeDueDay(expense);
  if (!dueDay) return null;

  const monthIndex = referenceDate.getMonth();
  const year = referenceDate.getFullYear();
  const safeDay = Math.min(dueDay, getMonthLastDay(year, monthIndex));
  return new Date(year, monthIndex, safeDay);
};

export const getExpenseDueStatus = (
  expense: Expense,
  referenceDate = new Date(),
): ExpenseDueStatus => {
  if (isExpensePaidForReferenceDate(expense, referenceDate)) return 'pago';
  if (expense.status === 'inativo') return 'sem_vencimento';

  const dueDate = resolveExpenseDueDate(expense, referenceDate);
  if (!dueDate) return 'sem_vencimento';

  const daysUntilDue = diffInDays(referenceDate, dueDate);
  if (daysUntilDue < 0) return 'vencida';
  if (daysUntilDue <= 5) return 'vencendo';
  return 'a_vencer';
};

export const buildExpenseAlertSummary = (
  expenses: Expense[],
  referenceDate = new Date(),
): ExpenseAlertSummary => {
  const items = expenses
    .filter((expense) => expense.status !== 'inativo' && !isExpensePaidForReferenceDate(expense, referenceDate))
    .map((expense) => {
      const dueDate = resolveExpenseDueDate(expense, referenceDate);
      return {
        id: expense.id,
        title: expense.name,
        amount: getExpenseAmount(expense),
        dueDate: dueDate ? toIsoDate(dueDate) : null,
        dueStatus: getExpenseDueStatus(expense, referenceDate),
      };
    })
    .filter((item) => item.dueStatus === 'vencendo' || item.dueStatus === 'vencida')
    .sort((a, b) => {
      const aTime = a.dueDate ? new Date(`${a.dueDate}T00:00:00`).getTime() : 0;
      const bTime = b.dueDate ? new Date(`${b.dueDate}T00:00:00`).getTime() : 0;
      return aTime - bTime;
    });

  return {
    total: items.length,
    dueSoon: items.filter((item) => item.dueStatus === 'vencendo').length,
    overdue: items.filter((item) => item.dueStatus === 'vencida').length,
    items,
  };
};

const isOpenOrderStatus = (status: Order['status']) =>
  !['orcamento', 'cancelado', 'entregue'].includes(status);

const normalizeEntryOrigin = (origin: string) => {
  if (origin === 'order_payment' || origin === 'order_payment_cancel' || origin === 'order_payment_delete') {
    return origin;
  }
  return origin;
};

export const calculateCurrentCashBalance = (
  orders: Order[],
  sales: Sale[],
  entries: FinancialEntry[],
) => {
  const ordersReceived = orders.reduce(
    (total, order) => total + Math.max(0, Number(order.amount_paid || 0)),
    0,
  );
  const salesReceived = sales.reduce(
    (total, sale) => total + Math.max(0, Number(sale.amount_paid || 0)),
    0,
  );
  const manualNet = entries.reduce((total, entry) => {
    if (entry.status !== 'pago') return total;
    if (DUPLICATED_FINANCIAL_ORIGINS.has(normalizeEntryOrigin(entry.origin))) return total;
    return total + (entry.type === 'receita' ? Number(entry.amount || 0) : -Number(entry.amount || 0));
  }, 0);

  return ordersReceived + salesReceived + manualNet;
};

export const getForecastRange = (period: ForecastPeriod, referenceDate = new Date()) => {
  const start = startOfDay(referenceDate);
  const end = new Date(start);

  if (period === 'today') {
    return { start, end: endOfDay(start) };
  }

  if (period === 'week') {
    end.setDate(start.getDate() + 6);
    return { start, end: endOfDay(end) };
  }

  end.setMonth(start.getMonth() + 1, 0);
  return { start, end: endOfDay(end) };
};

const isDateInRange = (value: Date | null, start: Date, end: Date) => {
  if (!value || Number.isNaN(value.getTime())) return false;
  return value.getTime() >= start.getTime() && value.getTime() <= end.getTime();
};

const parseDateOrNull = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getForecastDateForOrder = (order: Order) =>
  parseDateOrNull(order.estimated_delivery_date) || parseDateOrNull(order.created_at);

const getForecastDateForSale = (sale: Sale) => parseDateOrNull(sale.created_at);

const getForecastDateForEntry = (entry: FinancialEntry) =>
  parseDateOrNull(entry.due_date) || parseDateOrNull(entry.occurred_at);

export const buildCashForecastSummary = ({
  orders,
  sales,
  entries,
  expenses,
  period,
  referenceDate = new Date(),
}: {
  orders: Order[];
  sales: Sale[];
  entries: FinancialEntry[];
  expenses: Expense[];
  period: ForecastPeriod;
  referenceDate?: Date;
}): CashForecastSummary => {
  const { start, end } = getForecastRange(period, referenceDate);
  const currentBalance = calculateCurrentCashBalance(orders, sales, entries);

  const incomingFromOrders = orders.reduce((total, order) => {
    const balance = Math.max(0, Number(order.total || 0) - Number(order.amount_paid || 0));
    if (!balance || !isOpenOrderStatus(order.status)) return total;
    if (!isDateInRange(getForecastDateForOrder(order), start, end)) return total;
    return total + balance;
  }, 0);

  const incomingFromSales = sales.reduce((total, sale) => {
    const balance = Math.max(0, Number(sale.total || 0) - Number(sale.amount_paid || 0));
    if (!balance) return total;
    if (!isDateInRange(getForecastDateForSale(sale), start, end)) return total;
    return total + balance;
  }, 0);

  const incomingFromEntries = entries.reduce((total, entry) => {
    if (entry.type !== 'receita' || entry.status === 'pago') return total;
    if (!isDateInRange(getForecastDateForEntry(entry), start, end)) return total;
    return total + Number(entry.amount || 0);
  }, 0);

  const outgoingFromEntries = entries.reduce((total, entry) => {
    if (entry.type !== 'despesa' || entry.status === 'pago') return total;
    if (!isDateInRange(getForecastDateForEntry(entry), start, end)) return total;
    return total + Number(entry.amount || 0);
  }, 0);

  const outgoingFromExpenses = expenses.reduce((total, expense) => {
    if (expense.status === 'inativo' || isExpensePaidForReferenceDate(expense, referenceDate)) return total;
    const dueDate = resolveExpenseDueDate(expense, referenceDate);
    if (!isDateInRange(dueDate, start, end)) return total;
    return total + getExpenseAmount(expense);
  }, 0);

  const incoming = incomingFromOrders + incomingFromSales + incomingFromEntries;
  const outgoing = outgoingFromEntries + outgoingFromExpenses;

  return {
    currentBalance,
    incoming,
    outgoing,
    projectedBalance: currentBalance + incoming - outgoing,
  };
};

export const buildCashForecastSeries = ({
  orders,
  sales,
  entries,
  expenses,
  period,
  referenceDate = new Date(),
}: {
  orders: Order[];
  sales: Sale[];
  entries: FinancialEntry[];
  expenses: Expense[];
  period: ForecastPeriod;
  referenceDate?: Date;
}): CashForecastPoint[] => {
  const { start, end } = getForecastRange(period, referenceDate);
  const seriesMap = new Map<string, { incoming: number; outgoing: number }>();

  const ensurePoint = (date: Date) => {
    const key = toIsoDate(date);
    if (!seriesMap.has(key)) {
      seriesMap.set(key, { incoming: 0, outgoing: 0 });
    }
    return seriesMap.get(key)!;
  };

  const cursor = new Date(start);
  while (cursor <= end) {
    ensurePoint(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }

  orders.forEach((order) => {
    const balance = Math.max(0, Number(order.total || 0) - Number(order.amount_paid || 0));
    const dueDate = getForecastDateForOrder(order);
    if (!balance || !isOpenOrderStatus(order.status) || !isDateInRange(dueDate, start, end)) return;
    ensurePoint(dueDate!).incoming += balance;
  });

  sales.forEach((sale) => {
    const balance = Math.max(0, Number(sale.total || 0) - Number(sale.amount_paid || 0));
    const dueDate = getForecastDateForSale(sale);
    if (!balance || !isDateInRange(dueDate, start, end)) return;
    ensurePoint(dueDate!).incoming += balance;
  });

  entries.forEach((entry) => {
    if (entry.status === 'pago') return;
    const dueDate = getForecastDateForEntry(entry);
    if (!isDateInRange(dueDate, start, end)) return;
    if (entry.type === 'receita') {
      ensurePoint(dueDate!).incoming += Number(entry.amount || 0);
      return;
    }
    ensurePoint(dueDate!).outgoing += Number(entry.amount || 0);
  });

  expenses.forEach((expense) => {
    if (expense.status === 'inativo' || isExpensePaidForReferenceDate(expense, referenceDate)) return;
    const dueDate = resolveExpenseDueDate(expense, referenceDate);
    if (!isDateInRange(dueDate, start, end)) return;
    ensurePoint(dueDate!).outgoing += getExpenseAmount(expense);
  });

  return Array.from(seriesMap.entries()).map(([key, values]) => ({
    label: new Date(`${key}T00:00:00`).toLocaleDateString('pt-BR'),
    incoming: values.incoming,
    outgoing: values.outgoing,
    net: values.incoming - values.outgoing,
  }));
};

export const calculateProductSupplyCost = (
  productId: string,
  productSupplies: ProductSupply[],
) =>
  productSupplies
    .filter((entry) => entry.product_id === productId)
    .reduce((acc, entry) => {
      const quantity = Number(entry.quantity || 0);
      const cost = Number((entry.supply as any)?.cost_per_unit || 0);
      return acc + quantity * cost;
    }, 0);

export const calculateProductDirectCost = (
  product: Product,
  productSupplies: ProductSupply[],
) => {
  const supplyCost = calculateProductSupplyCost(product.id, productSupplies);
  const baseCost = Number(product.base_cost || 0) + Number(product.labor_cost || 0) + supplyCost;
  const wastePct = Number(product.waste_percentage || 0);
  return baseCost * (1 + wastePct / 100);
};

export const calculateTotalSoldUnits = (rows: Array<{ quantity: number }>) =>
  Math.max(
    rows.reduce((total, row) => total + Number(row.quantity || 0), 0),
    1,
  );

export const buildSoldUnitsMap = ({
  orderItems,
  saleItems,
}: {
  orderItems?: Array<Pick<OrderItem, 'product_id' | 'quantity'>>;
  saleItems?: Array<Pick<SaleItem, 'product_id' | 'quantity'>>;
}) => {
  const soldUnitsByProduct: Record<string, number> = {};

  const register = (productId: string | null, quantity: number) => {
    if (!productId) return;
    soldUnitsByProduct[productId] = (soldUnitsByProduct[productId] || 0) + Number(quantity || 0);
  };

  (orderItems || []).forEach((item) => register(item.product_id, item.quantity));
  (saleItems || []).forEach((item) => register(item.product_id, item.quantity));

  return soldUnitsByProduct;
};

export const calculateProductRealMetrics = ({
  product,
  products,
  productSupplies,
  expenses,
  companySoldUnitsTotal,
  soldUnits = 1,
  salePrice,
}: {
  product: Product;
  products: Product[];
  productSupplies: ProductSupply[];
  expenses: Expense[];
  companySoldUnitsTotal: number;
  soldUnits?: number;
  salePrice?: number;
}) => {
  const directCost = calculateProductDirectCost(product, productSupplies);
  const fixedExpenses = expenses.filter(
    (expense) =>
      expense.expense_type === 'recorrente' &&
      expense.apply_to_product_cost &&
      expense.status !== 'inativo',
  );

  const percentagePool = fixedExpenses
    .filter((expense) => expense.allocation_method !== 'quantidade_vendas')
    .reduce((total, expense) => total + getExpenseAmount(expense), 0);

  const quantityPool = fixedExpenses
    .filter((expense) => expense.allocation_method === 'quantidade_vendas')
    .reduce((total, expense) => total + getExpenseAmount(expense), 0);

  const totalCompanyDirectCost = Math.max(
    products.reduce(
      (total, currentProduct) =>
        total + calculateProductDirectCost(currentProduct, productSupplies),
      0,
    ),
    directCost || 1,
  );

  const fixedByPercentage = totalCompanyDirectCost > 0
    ? (percentagePool / totalCompanyDirectCost) * directCost
    : 0;
  const fixedByQuantity = quantityPool / Math.max(companySoldUnitsTotal, 1);
  const variableShare = directCost * (Number(product.expense_percentage || 0) / 100);
  const totalRealCost = directCost + fixedByPercentage + fixedByQuantity + variableShare;
  const resolvedSalePrice = Number(
    salePrice ??
      product.final_price ??
      product.catalog_price ??
      0,
  );
  const profitPerUnit = resolvedSalePrice - totalRealCost;
  const marginPct = resolvedSalePrice > 0 ? (profitPerUnit / resolvedSalePrice) * 100 : 0;
  const revenue = resolvedSalePrice * Math.max(soldUnits, 0);
  const totalCost = totalRealCost * Math.max(soldUnits, 0);
  const totalProfit = profitPerUnit * Math.max(soldUnits, 0);

  return {
    salePrice: resolvedSalePrice,
    directCost,
    fixedByPercentage,
    fixedByQuantity,
    fixedAllocation: fixedByPercentage + fixedByQuantity,
    variableShare,
    totalRealCost,
    profitPerUnit,
    marginPct,
    soldUnits,
    revenue,
    totalCost,
    totalProfit,
  };
};

export const buildProductProfitabilityRows = ({
  products,
  productSupplies,
  expenses,
  soldUnitsByProduct,
}: {
  products: Product[];
  productSupplies: ProductSupply[];
  expenses: Expense[];
  soldUnitsByProduct: Record<string, number>;
}): ProductProfitabilityRow[] => {
  const companySoldUnitsTotal = Math.max(
    Object.values(soldUnitsByProduct).reduce((total, value) => total + Number(value || 0), 0),
    1,
  );

  return products.map((product) => {
    const soldUnits = Math.max(Number(soldUnitsByProduct[product.id] || 0), 0);
    const metrics = calculateProductRealMetrics({
      product,
      products,
      productSupplies,
      expenses,
      companySoldUnitsTotal,
      soldUnits,
    });

    return {
      id: product.id,
      name: product.name,
      soldUnits,
      salePrice: metrics.salePrice,
      directCost: metrics.directCost,
      fixedAllocation: metrics.fixedAllocation,
      variableShare: metrics.variableShare,
      totalRealCost: metrics.totalRealCost,
      profitPerUnit: metrics.profitPerUnit,
      marginPct: metrics.marginPct,
      totalCost: metrics.totalCost,
      totalProfit: metrics.totalProfit,
      revenue: metrics.revenue,
    };
  });
};

export const calculateMonthlyActualSummary = ({
  orders,
  sales,
  entries,
  referenceDate = new Date(),
}: {
  orders: Order[];
  sales: Sale[];
  entries: FinancialEntry[];
  referenceDate?: Date;
}) => {
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const monthEnd = endOfDay(referenceDate);

  const entriesInMonth = entries.filter((entry) => {
    if (entry.status !== 'pago') return false;
    const date = parseDateOrNull(entry.paid_at || entry.occurred_at);
    return isDateInRange(date, monthStart, monthEnd);
  });

  const incomeOrders = orders.reduce((total, order) => {
    const date = parseDateOrNull(order.created_at);
    if (!isDateInRange(date, monthStart, monthEnd)) return total;
    return total + Math.max(0, Number(order.amount_paid || 0));
  }, 0);

  const incomeSales = sales.reduce((total, sale) => {
    const date = parseDateOrNull(sale.created_at);
    if (!isDateInRange(date, monthStart, monthEnd)) return total;
    return total + Math.max(0, Number(sale.amount_paid || 0));
  }, 0);

  const incomeManual = entriesInMonth.reduce((total, entry) => {
    if (entry.type !== 'receita') return total;
    if (DUPLICATED_FINANCIAL_ORIGINS.has(normalizeEntryOrigin(entry.origin))) return total;
    return total + Number(entry.amount || 0);
  }, 0);

  const expenseManual = entriesInMonth.reduce((total, entry) => {
    if (entry.type !== 'despesa') return total;
    return total + Number(entry.amount || 0);
  }, 0);

  return {
    income: incomeOrders + incomeSales + incomeManual,
    expense: expenseManual,
  };
};
