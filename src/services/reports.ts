import { supabase } from '@/integrations/supabase/client';
import type {
  Customer,
  ExpenseCategory,
  FinancialEntry,
  Order,
  OrderItem,
  OrderPayment,
  OrderStatus,
  PaymentMethod,
  Product,
  ProductSupply,
  Sale,
  SaleItem,
} from '@/types/database';

export type ReportFilters = {
  startDate?: string;
  endDate?: string;
  status?: OrderStatus | 'all';
};

export type SalesPeriod = 'daily' | 'weekly' | 'monthly' | 'annual';

export type CashTransaction = {
  id: string;
  date: string;
  type: 'entrada' | 'saida';
  origin: string;
  description: string;
  amount: number;
  method: PaymentMethod | null;
  status: string;
};

export type CashSummary = {
  totalIn: number;
  totalOut: number;
  openingBalance: number;
  closingBalance: number;
};

export type CashReport = {
  transactions: CashTransaction[];
  summary: CashSummary;
};

export type FinancialReport = {
  revenueTotal: number;
  expenseTotal: number;
  profit: number;
  margin: number;
  revenueByOrigin: Record<string, number>;
  revenueByMethod: Record<string, number>;
  expensesByCategory: Record<string, number>;
  expensesByStatus: Record<string, number>;
  cashflow: Array<{ label: string; inflow: number; outflow: number; net: number }>;
};

export type SalesReport = {
  totalSales: number;
  orderCount: number;
  ticketAverage: number;
  statusCounts: Record<string, number>;
  salesByPeriod: Record<SalesPeriod, Array<{ label: string; total: number }>>;
  salesByProduct: Array<{ id: string; name: string; quantity: number; total: number }>;
  salesByCustomer: Array<{ id: string; name: string; orders: number; total: number }>;
};

export type CustomerReport = {
  mostActive: Array<{ id: string; name: string; orders: number; total: number }>;
  highestRevenue: Array<{ id: string; name: string; total: number }>;
  pendingBalances: Array<{ id: string; name: string; balance: number }>;
  insights: string[];
  history: Array<{ id: string; name: string; orders: number; total: number; lastOrderAt: string | null }>;
};

export type ProductReport = {
  mostSold: Array<{ id: string; name: string; quantity: number; total: number }>;
  leastSold: Array<{ id: string; name: string; quantity: number; total: number }>;
  revenueByProduct: Array<{ id: string; name: string; total: number }>;
  marginByProduct: Array<{ id: string; name: string; margin: number; marginPct: number }>;
  lowTurnover: Array<{ id: string; name: string; quantity: number }>;
};

export type ReportBundle = {
  cash: CashReport;
  financial: FinancialReport;
  sales: SalesReport;
  customers: CustomerReport;
  products: ProductReport;
};

type ReportSources = {
  orders: Order[];
  orderItems: OrderItem[];
  orderPayments: OrderPayment[];
  sales: Sale[];
  saleItems: SaleItem[];
  customers: Customer[];
  products: Product[];
  productSupplies: ProductSupply[];
  financialEntries: FinancialEntry[];
  expenseCategories: ExpenseCategory[];
};

const buildDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const normalizeRange = (filters: ReportFilters) => {
  const today = new Date();
  const defaultEnd = new Date(today);
  defaultEnd.setHours(23, 59, 59, 999);
  const defaultStart = new Date(today);
  defaultStart.setDate(defaultStart.getDate() - 30);
  defaultStart.setHours(0, 0, 0, 0);

  const startDate = filters.startDate ? buildDate(filters.startDate) : defaultStart;
  startDate.setHours(0, 0, 0, 0);
  const endDate = filters.endDate ? buildDate(filters.endDate) : defaultEnd;
  endDate.setHours(23, 59, 59, 999);

  return { startDate, endDate };
};

const applyDateRange = <T>(
  query: T,
  field: string,
  start: Date,
  end: Date,
) => {
  return (query as any).gte(field, start.toISOString()).lte(field, end.toISOString());
};

const sumBy = <T>(rows: T[], getValue: (row: T) => number) =>
  rows.reduce((total, row) => total + getValue(row), 0);

const groupBy = <T, K extends string>(
  rows: T[],
  getKey: (row: T) => K,
) => {
  return rows.reduce((acc, row) => {
    const key = getKey(row);
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {} as Record<K, T[]>);
};

const getDateLabel = (value: string) => {
  const date = new Date(value);
  return date.toLocaleDateString('pt-BR');
};

const getShiftLabel = (dateValue: string) => {
  const date = new Date(dateValue);
  const hour = date.getHours();
  const dayLabel = date.toLocaleDateString('pt-BR');
  if (hour >= 6 && hour < 14) return `${dayLabel} - Manha`;
  if (hour >= 14 && hour < 22) return `${dayLabel} - Tarde`;
  return `${dayLabel} - Noite`;
};

export const buildPeriodSeries = (
  transactions: CashTransaction[],
  period: 'daily' | 'weekly' | 'monthly' | 'annual' | 'shift',
) => {
  const grouped = groupBy(transactions, (tx) => {
    const date = new Date(tx.date);
    if (period === 'shift') return getShiftLabel(tx.date);
    if (period === 'weekly') {
      const first = new Date(date);
      first.setDate(date.getDate() - date.getDay());
      return `Sem ${first.toLocaleDateString('pt-BR')}`;
    }
    if (period === 'monthly') return `${date.getMonth() + 1}/${date.getFullYear()}`;
    if (period === 'annual') return `${date.getFullYear()}`;
    return getDateLabel(tx.date);
  });

  const entries = Object.entries(grouped).map(([label, rows]) => {
    const inflow = sumBy(rows, (tx) => (tx.type === 'entrada' ? tx.amount : 0));
    const outflow = sumBy(rows, (tx) => (tx.type === 'saida' ? tx.amount : 0));
    const sortKey = (() => {
      if (period === 'shift') {
        const date = new Date(rows[0].date);
        const dayKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        const hour = date.getHours();
        const shiftIndex = hour >= 6 && hour < 14 ? 0 : hour >= 14 && hour < 22 ? 1 : 2;
        return dayKey + shiftIndex;
      }
      if (period === 'weekly' && label.startsWith('Sem')) {
        const value = label.replace('Sem ', '');
        return new Date(value.split('/').reverse().join('-')).getTime();
      }
      if (period === 'monthly') {
        const [month, year] = label.split('/').map(Number);
        return new Date(year, month - 1, 1).getTime();
      }
      if (period === 'annual') {
        return new Date(Number(label), 0, 1).getTime();
      }
      const parsed = label.split('/').reverse().join('-');
      return new Date(parsed).getTime();
    })();

    return {
      label,
      inflow,
      outflow,
      net: inflow - outflow,
      sortKey,
    };
  });

  return entries
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ sortKey, ...rest }) => rest);
};

const buildCashTransactions = (sources: ReportSources) => {
  const paymentTransactions: CashTransaction[] = sources.orderPayments
    .filter((payment) => payment.status === 'pago')
    .map((payment) => ({
      id: payment.id,
      date: payment.paid_at || payment.created_at,
      type: 'entrada',
      origin: 'pedido',
      description: `Pagamento pedido ${payment.order_id}`,
      amount: Number(payment.amount),
      method: payment.method || null,
      status: payment.status,
    }));

  const saleTransactions: CashTransaction[] = sources.sales
    .filter((sale) => Number(sale.amount_paid) >= Number(sale.total))
    .map((sale) => ({
      id: sale.id,
      date: sale.created_at,
      type: 'entrada',
      origin: 'pdv',
      description: `Venda PDV ${sale.id}`,
      amount: Number(sale.total),
      method: sale.payment_method || null,
      status: 'pago',
    }));

  const entryTransactions: CashTransaction[] = sources.financialEntries
    .filter((entry) => entry.status === 'pago')
    .map((entry) => ({
      id: entry.id,
      date: entry.paid_at || entry.occurred_at,
      type: entry.type === 'receita' ? 'entrada' : 'saida',
      origin: entry.origin || 'manual',
      description: entry.description || entry.notes || 'Lancamento manual',
      amount: Number(entry.amount),
      method: entry.payment_method || null,
      status: entry.status,
    }));

  return [...paymentTransactions, ...saleTransactions, ...entryTransactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
};

const calculateOpeningBalance = async (filters: ReportFilters) => {
  if (!filters.startDate) return 0;
  const startDate = buildDate(filters.startDate);
  startDate.setHours(0, 0, 0, 0);

  const [paymentsResult, salesResult, entriesResult] = await Promise.all([
    supabase
      .from('order_payments')
      .select('amount, status, paid_at, created_at')
      .lt('created_at', startDate.toISOString()),
    supabase
      .from('sales')
      .select('total, created_at')
      .lt('created_at', startDate.toISOString()),
    supabase
      .from('financial_entries')
      .select('amount, type, status, paid_at, occurred_at')
      .lt('occurred_at', startDate.toISOString()),
  ]);

  const paidPayments = (paymentsResult.data as OrderPayment[] | null) || [];
  const paidSales = (salesResult.data as Sale[] | null) || [];
  const entries = (entriesResult.data as FinancialEntry[] | null) || [];

  const paymentTotal = sumBy(
    paidPayments.filter((payment) => payment.status === 'pago'),
    (payment) => Number(payment.amount),
  );
  const salesTotal = sumBy(
    paidSales.filter((sale) => Number(sale.amount_paid) >= Number(sale.total)),
    (sale) => Number(sale.total),
  );
  const entryTotal = sumBy(
    entries.filter((entry) => entry.status === 'pago'),
    (entry) => (entry.type === 'receita' ? Number(entry.amount) : -Number(entry.amount)),
  );

  return paymentTotal + salesTotal + entryTotal;
};

const buildCashReport = async (sources: ReportSources, filters: ReportFilters): Promise<CashReport> => {
  const transactions = buildCashTransactions(sources);
  const totalIn = sumBy(transactions, (tx) => (tx.type === 'entrada' ? tx.amount : 0));
  const totalOut = sumBy(transactions, (tx) => (tx.type === 'saida' ? tx.amount : 0));
  const openingBalance = await calculateOpeningBalance(filters);
  const closingBalance = openingBalance + totalIn - totalOut;

  return {
    transactions,
    summary: {
      totalIn,
      totalOut,
      openingBalance,
      closingBalance,
    },
  };
};

const buildFinancialReport = (sources: ReportSources): FinancialReport => {
  const paidPayments = sources.orderPayments.filter((payment) => payment.status === 'pago');
  const paidEntries = sources.financialEntries.filter((entry) => entry.status === 'pago');

  const revenueFromOrders = sumBy(paidPayments, (payment) => Number(payment.amount));
  const revenueFromSales = sumBy(
    sources.sales.filter((sale) => Number(sale.amount_paid) >= Number(sale.total)),
    (sale) => Number(sale.total),
  );
  const revenueFromManual = sumBy(
    paidEntries.filter((entry) => entry.type === 'receita'),
    (entry) => Number(entry.amount),
  );

  const expensePaid = sumBy(
    paidEntries.filter((entry) => entry.type === 'despesa'),
    (entry) => Number(entry.amount),
  );

  const revenueTotal = revenueFromOrders + revenueFromSales + revenueFromManual;
  const expenseTotal = expensePaid;
  const profit = revenueTotal - expenseTotal;
  const margin = revenueTotal > 0 ? (profit / revenueTotal) * 100 : 0;

  const revenueByOrigin: Record<string, number> = {
    pedido: revenueFromOrders,
    pdv: revenueFromSales,
    manual: revenueFromManual,
  };

  const revenueByMethod = paidPayments.reduce((acc, payment) => {
    const key = payment.method || 'indefinido';
    acc[key] = (acc[key] || 0) + Number(payment.amount);
    return acc;
  }, {} as Record<string, number>);

  sources.sales
    .filter((sale) => Number(sale.amount_paid) >= Number(sale.total))
    .forEach((sale) => {
      const key = sale.payment_method || 'indefinido';
      revenueByMethod[key] = (revenueByMethod[key] || 0) + Number(sale.total);
    });

  paidEntries
    .filter((entry) => entry.type === 'receita')
    .forEach((entry) => {
      const key = entry.payment_method || 'indefinido';
      revenueByMethod[key] = (revenueByMethod[key] || 0) + Number(entry.amount);
    });

  const categoriesById = sources.expenseCategories.reduce((acc, category) => {
    acc[category.id] = category.name;
    return acc;
  }, {} as Record<string, string>);

  const expensesByCategory = sources.financialEntries
    .filter((entry) => entry.type === 'despesa')
    .reduce((acc, entry) => {
      const key = entry.category_id ? categoriesById[entry.category_id] : 'Sem categoria';
      acc[key] = (acc[key] || 0) + Number(entry.amount);
      return acc;
    }, {} as Record<string, number>);

  const expensesByStatus = sources.financialEntries
    .filter((entry) => entry.type === 'despesa')
    .reduce((acc, entry) => {
      acc[entry.status] = (acc[entry.status] || 0) + Number(entry.amount);
      return acc;
    }, {} as Record<string, number>);

  const cashTransactions = buildCashTransactions(sources);
  const cashflow = buildPeriodSeries(cashTransactions, 'daily');

  return {
    revenueTotal,
    expenseTotal,
    profit,
    margin,
    revenueByOrigin,
    revenueByMethod,
    expensesByCategory,
    expensesByStatus,
    cashflow,
  };
};

const buildSalesReport = (sources: ReportSources): SalesReport => {
  const paidOrders = sources.orders.filter(
    (order) => order.status !== 'orcamento' && order.payment_status === 'pago',
  );
  const paidSales = sources.sales.filter(
    (sale) => Number(sale.amount_paid) >= Number(sale.total),
  );
  const orderCount = paidOrders.length;
  const orderRevenue = sumBy(paidOrders, (order) => Number(order.total));
  const salesRevenue = sumBy(paidSales, (sale) => Number(sale.total));
  const totalSales = orderRevenue + salesRevenue;
  const totalCount = orderCount + paidSales.length;
  const ticketAverage = totalCount > 0 ? totalSales / totalCount : 0;

  const statusCounts = sources.orders.reduce((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const itemRows = sources.orderItems
    .filter((item) => paidOrders.some((order) => order.id === item.order_id))
    .map((item) => ({
      id: item.product_id || item.product_name,
      name: item.product_name,
      quantity: Number(item.quantity),
      total: Number(item.total),
    }));

  const saleItemRows = sources.saleItems
    .filter((item) => paidSales.some((sale) => sale.id === item.sale_id))
    .map((item) => ({
      id: item.product_id || item.product_name,
      name: item.product_name,
      quantity: Number(item.quantity),
      total: Number(item.total),
    }));

  const combinedItems = [...itemRows, ...saleItemRows];
  const groupedItems = groupBy(combinedItems, (row) => row.id as string);
  const salesByProduct = Object.values(groupedItems).map((rows) => ({
    id: rows[0].id,
    name: rows[0].name,
    quantity: sumBy(rows, (row) => row.quantity),
    total: sumBy(rows, (row) => row.total),
  }));

  salesByProduct.sort((a, b) => b.total - a.total);

  const customerGroups = groupBy(paidOrders, (order) => order.customer_id || order.customer_name || 'sem-cliente');
  const salesByCustomer = Object.values(customerGroups).map((rows) => ({
    id: rows[0].customer_id || rows[0].customer_name || 'sem-cliente',
    name: rows[0].customer_name || sources.customers.find((c) => c.id === rows[0].customer_id)?.name || 'Cliente',
    orders: rows.length,
    total: sumBy(rows, (row) => Number(row.total)),
  }));

  salesByCustomer.sort((a, b) => b.total - a.total);

  const salesTransactions: CashTransaction[] = [
    ...paidOrders.map((order) => ({
      id: order.id,
      date: order.created_at,
      type: 'entrada',
      origin: 'pedido',
      description: `Pedido #${order.order_number}`,
      amount: Number(order.total),
      method: order.payment_method || null,
      status: order.status,
    })),
    ...paidSales.map((sale) => ({
      id: sale.id,
      date: sale.created_at,
      type: 'entrada',
      origin: 'pdv',
      description: `Venda PDV ${sale.id}`,
      amount: Number(sale.total),
      method: sale.payment_method || null,
      status: 'pago',
    })),
  ];

  const periods: SalesPeriod[] = ['daily', 'weekly', 'monthly', 'annual'];
  const salesByPeriod = periods.reduce((acc, period) => {
    acc[period] = buildPeriodSeries(salesTransactions, period).map((entry) => ({
      label: entry.label,
      total: entry.inflow,
    }));
    return acc;
  }, {} as Record<SalesPeriod, Array<{ label: string; total: number }>>);

  return {
    totalSales,
    orderCount: totalCount,
    ticketAverage,
    statusCounts,
    salesByPeriod,
    salesByProduct,
    salesByCustomer,
  };
};

const buildCustomerReport = (sources: ReportSources): CustomerReport => {
  const paidOrderIds = new Set(
    sources.orders
      .filter((order) => order.status !== 'orcamento' && order.payment_status === 'pago')
      .map((order) => order.id),
  );
  const grouped = groupBy(sources.orders, (order) => order.customer_id || order.customer_name || 'sem-cliente');

  const customerStats = Object.values(grouped).map((rows) => {
    const lastOrderAt = rows.reduce<string | null>((latest, row) => {
      if (!latest) return row.created_at;
      return new Date(row.created_at) > new Date(latest) ? row.created_at : latest;
    }, null);

    return {
      id: rows[0].customer_id || rows[0].customer_name || 'sem-cliente',
      name: rows[0].customer_name || sources.customers.find((c) => c.id === rows[0].customer_id)?.name || 'Cliente',
      orders: rows.length,
      total: sumBy(
        rows.filter((row) => paidOrderIds.has(row.id)),
        (row) => Number(row.total),
      ),
      balance: sumBy(rows, (row) => Math.max(0, Number(row.total) - Number(row.amount_paid))),
      lastOrderAt,
    };
  });

  const mostActive = [...customerStats].sort((a, b) => b.orders - a.orders).slice(0, 5);
  const highestRevenue = [...customerStats].sort((a, b) => b.total - a.total).slice(0, 5);
  const pendingBalances = customerStats
    .filter((row) => row.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5)
    .map((row) => ({ id: row.id, name: row.name, balance: row.balance }));

  const insights: string[] = [];
  if (mostActive.length > 0) {
    insights.push(`Cliente mais ativo: ${mostActive[0].name}.`);
  }
  if (pendingBalances.length > 0) {
    insights.push('Existem clientes com saldo pendente a receber.');
  }
  if (highestRevenue.length > 0) {
    insights.push(`Maior faturamento: ${highestRevenue[0].name}.`);
  }

  const history = [...customerStats].sort((a, b) => {
    if (!a.lastOrderAt) return 1;
    if (!b.lastOrderAt) return -1;
    return new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime();
  });

  return {
    mostActive,
    highestRevenue,
    pendingBalances,
    insights,
    history,
  };
};

const buildProductReport = (sources: ReportSources): ProductReport => {
  const suppliesCostMap = sources.productSupplies.reduce((acc, entry) => {
    const quantity = Number(entry.quantity || 0);
    const cost = Number((entry.supply as any)?.cost_per_unit || 0);
    acc[entry.product_id] = (acc[entry.product_id] || 0) + quantity * cost;
    return acc;
  }, {} as Record<string, number>);

  const paidOrderIds = new Set(
    sources.orders
      .filter((order) => order.status !== 'orcamento' && order.payment_status === 'pago')
      .map((order) => order.id),
  );
  const items = sources.orderItems
    .filter((item) => paidOrderIds.has(item.order_id))
    .map((item) => ({
      id: item.product_id || item.product_name,
      name: item.product_name,
      quantity: Number(item.quantity),
      total: Number(item.total),
    }));

  const grouped = groupBy(items, (row) => row.id as string);
  const productRows = Object.values(grouped).map((rows) => ({
    id: rows[0].id,
    name: rows[0].name,
    quantity: sumBy(rows, (row) => row.quantity),
    total: sumBy(rows, (row) => row.total),
  }));

  const mostSold = [...productRows].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  const leastSold = [...productRows].sort((a, b) => a.quantity - b.quantity).slice(0, 5);
  const revenueByProduct = [...productRows].sort((a, b) => b.total - a.total).slice(0, 10);

  const productMap = sources.products.reduce((acc, product) => {
    acc[product.id] = product;
    return acc;
  }, {} as Record<string, Product>);

  const marginByProduct = productRows.map((row) => {
    const product = productMap[row.id];
    const baseCost = Number(product?.base_cost || 0) + Number(product?.labor_cost || 0);
    const wastePct = Number(product?.waste_percentage || 0);
    const suppliesCost = suppliesCostMap[row.id] || 0;
    const costWithWaste = (baseCost + suppliesCost) * (1 + wastePct / 100);
    const costTotal = costWithWaste * row.quantity;
    const marginValue = row.total - costTotal;
    const marginPct = row.total > 0 ? (marginValue / row.total) * 100 : 0;
    return {
      id: row.id,
      name: row.name,
      margin: marginValue,
      marginPct,
    };
  });

  const lowTurnover = [...productRows]
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 5)
    .map((row) => ({ id: row.id, name: row.name, quantity: row.quantity }));

  return {
    mostSold,
    leastSold,
    revenueByProduct,
    marginByProduct,
    lowTurnover,
  };
};

const loadSources = async (filters: ReportFilters): Promise<ReportSources> => {
  const { startDate, endDate } = normalizeRange(filters);
  const statusFilter = filters.status && filters.status !== 'all' ? filters.status : null;

  let ordersQuery = supabase
    .from('orders')
    .select('id, order_number, customer_id, customer_name, status, total, subtotal, discount, amount_paid, created_at, payment_status');

  ordersQuery = applyDateRange(ordersQuery, 'created_at', startDate, endDate);
  if (statusFilter) {
    ordersQuery = (ordersQuery as any).eq('status', statusFilter);
  }

  const ordersResult = await ordersQuery;
  const orders = (ordersResult.data as Order[]) || [];
  const orderIds = orders.map((order) => order.id);

  const [orderItemsResult, paymentsResult, salesResult, entriesResult, categoriesResult, productsResult, suppliesResult] =
    await Promise.all([
      orderIds.length
        ? supabase.from('order_items').select('*').in('order_id', orderIds)
        : Promise.resolve({ data: [] }),
      applyDateRange(
        supabase.from('order_payments').select('*'),
        'created_at',
        startDate,
        endDate,
      ),
      applyDateRange(
        supabase.from('sales').select('*'),
        'created_at',
        startDate,
        endDate,
      ),
      applyDateRange(
        supabase.from('financial_entries').select('*'),
        'occurred_at',
        startDate,
        endDate,
      ),
      supabase.from('expense_categories').select('*'),
      supabase.from('products').select('id, name, base_cost, labor_cost, waste_percentage, profit_margin'),
      supabase.from('product_supplies').select('product_id, quantity, supply:supplies(cost_per_unit)'),
    ]);

  const sales = (salesResult.data as Sale[]) || [];
  const saleIds = sales.map((sale) => sale.id);

  const saleItemsResult = saleIds.length
    ? await supabase.from('sale_items').select('*').in('sale_id', saleIds)
    : { data: [] };

  const customerIds = Array.from(
    new Set(
      orders.map((order) => order.customer_id).filter((id): id is string => Boolean(id)),
    ),
  );

  const customersResult = customerIds.length
    ? await supabase.from('customers').select('*').in('id', customerIds)
    : { data: [] };

  return {
    orders,
    orderItems: (orderItemsResult.data as OrderItem[]) || [],
    orderPayments: (paymentsResult.data as OrderPayment[]) || [],
    sales,
    saleItems: (saleItemsResult.data as SaleItem[]) || [],
    customers: (customersResult.data as Customer[]) || [],
    products: (productsResult.data as Product[]) || [],
    productSupplies: (suppliesResult.data as ProductSupply[]) || [],
    financialEntries: (entriesResult.data as FinancialEntry[]) || [],
    expenseCategories: (categoriesResult.data as ExpenseCategory[]) || [],
  };
};

export const loadReports = async (filters: ReportFilters): Promise<ReportBundle> => {
  const sources = await loadSources(filters);
  const cash = await buildCashReport(sources, filters);

  return {
    cash,
    financial: buildFinancialReport(sources),
    sales: buildSalesReport(sources),
    customers: buildCustomerReport(sources),
    products: buildProductReport(sources),
  };
};
