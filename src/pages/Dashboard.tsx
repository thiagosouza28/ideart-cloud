import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  BadgeDollarSign,
  BarChart2,
  ClipboardCheck,
  Eye,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Users,
  Wallet,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/dashboard/StatCard';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { OrdersList } from '@/components/dashboard/OrdersList';
import { EmptyStateCard } from '@/components/dashboard/EmptyStateCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  buildCashForecastSummary,
  buildExpenseAlertSummary,
  buildProductProfitabilityRows,
  buildSoldUnitsMap,
  calculateMonthlyActualSummary,
  getExpenseAmount,
  resolveExpenseDueDate,
} from '@/lib/finance';
import { formatOrderNumber } from '@/lib/utils';
import type {
  Expense,
  FinancialEntry,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  ProductSupply,
  Sale,
  SaleItem,
  CatalogEventLog,
} from '@/types/database';
import { buildOrderDetailsPath } from '@/lib/orderRouting';

const statusLabels: Record<OrderStatus, string> = {
  orcamento: 'Orçamento',
  pendente: 'Pendente',
  produzindo_arte: 'Produzindo arte',
  arte_aprovada: 'Arte aprovada',
  em_producao: 'Em Produção',
  finalizado: 'Finalizado',
  pronto: 'Finalizado',
  aguardando_retirada: 'Aguardando retirada',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

const paymentMethodLabels: Record<string, string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  pix: 'Pix',
  boleto: 'Boleto',
  outro: 'Outro',
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSupplies, setProductSupplies] = useState<ProductSupply[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [catalogEvents, setCatalogEvents] = useState<CatalogEventLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      if (!profile?.company_id) {
        setOrders([]);
        setSales([]);
        setExpenses([]);
        setEntries([]);
        setProducts([]);
        setProductSupplies([]);
        setOrderItems([]);
        setSaleItems([]);
        setCatalogEvents([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      const [ordersResult, salesResult, expensesResult, entriesResult, productsResult, catalogEventsResult] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_number, customer_name, status, total, amount_paid, customer_credit_used, created_at, payment_method, payment_status, estimated_delivery_date')
          .eq('company_id', profile.company_id)
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('sales')
          .select('id, total, amount_paid, created_at')
          .eq('company_id', profile.company_id)
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('expenses')
          .select('*')
          .eq('company_id', profile.company_id)
          .order('created_at', { ascending: false }),
        supabase
          .from('financial_entries')
          .select('*')
          .eq('company_id', profile.company_id)
          .order('occurred_at', { ascending: false })
          .limit(300),
        supabase
          .from('products')
          .select('*, product_supplies(id, product_id, supply_id, quantity, supply:supplies(cost_per_unit))')
          .eq('company_id', profile.company_id)
          .order('name'),
        supabase
          .from('catalog_event_logs')
          .select('id, company_id, product_id, user_id, session_key, event_type, metadata, created_at')
          .eq('company_id', profile.company_id)
          .order('created_at', { ascending: false })
          .limit(2000),
      ]);

      const nextOrders = (ordersResult.data as Order[]) || [];
      const nextSales = (salesResult.data as Sale[]) || [];
      const nextExpenses = (expensesResult.data as Expense[]) || [];
      const nextEntries = (entriesResult.data as FinancialEntry[]) || [];
      const nextProducts = (productsResult.data as unknown as Array<Product & { product_supplies?: ProductSupply[] }>) || [];

      setOrders(nextOrders);
      setSales(nextSales);
      setExpenses(nextExpenses);
      setEntries(nextEntries);
      setProducts(nextProducts);
      setCatalogEvents((catalogEventsResult.data as CatalogEventLog[]) || []);
      setProductSupplies(
        nextProducts.flatMap((product) =>
          (product.product_supplies || []).map((entry) => ({
            ...entry,
            product_id: product.id,
          })),
        ),
      );

      const validOrderIds = nextOrders
        .filter((order) => !['orcamento', 'pendente', 'cancelado'].includes(order.status))
        .map((order) => order.id);
      const saleIds = nextSales.map((sale) => sale.id);

      const [orderItemsResult, saleItemsResult] = await Promise.all([
        validOrderIds.length
          ? supabase
            .from('order_items')
            .select('id, order_id, product_id, product_name, quantity, unit_price, discount, total, attributes, notes, created_at')
            .in('order_id', validOrderIds)
          : Promise.resolve({ data: [] }),
        saleIds.length
          ? supabase
            .from('sale_items')
            .select('id, sale_id, product_id, product_name, quantity, unit_price, discount, total, attributes, created_at')
            .in('sale_id', saleIds)
          : Promise.resolve({ data: [] }),
      ]);

      setOrderItems((orderItemsResult.data as OrderItem[]) || []);
      setSaleItems((saleItemsResult.data as SaleItem[]) || []);
      setLoading(false);
    };

    void loadDashboard();
  }, [profile?.company_id]);

  const metrics = useMemo(() => {
    const now = new Date();
    const start7 = new Date(now);
    start7.setDate(now.getDate() - 7);
    const start30 = new Date(now);
    start30.setDate(now.getDate() - 30);

    let totalToday = 0;
    let total7d = 0;
    let total30d = 0;
    let paidTotal = 0;
    let pendingTotal = 0;
    const customers = new Set<string>();
    const statusCounts: Record<OrderStatus, number> = {
      orcamento: 0,
      pendente: 0,
      produzindo_arte: 0,
      arte_aprovada: 0,
      em_producao: 0,
      finalizado: 0,
      pronto: 0,
      aguardando_retirada: 0,
      entregue: 0,
      cancelado: 0,
    };

    orders.forEach((order) => {
      const createdAt = new Date(order.created_at);
      const total = Number(order.total ?? 0);
      const paidCash = Math.max(0, Number(order.amount_paid ?? 0));
      const paidCredit = Math.max(0, Number(order.customer_credit_used ?? 0));
      const paidAmount = paidCash + paidCredit;
      const isRevenueOrder =
        order.status !== 'orcamento' && order.status !== 'pendente' && order.status !== 'cancelado';

      if (isRevenueOrder && paidCash > 0) {
        if (createdAt.toDateString() === now.toDateString()) totalToday += paidCash;
        if (createdAt >= start7) total7d += paidCash;
        if (createdAt >= start30) total30d += paidCash;
      }

      if (isRevenueOrder) {
        paidTotal += paidCash;
        pendingTotal += Math.max(0, total - paidAmount);
      }

      if (order.customer_name) customers.add(order.customer_name);
      statusCounts[order.status] += 1;
    });

    sales.forEach((sale) => {
      const createdAt = new Date(sale.created_at);
      const total = Number(sale.total ?? 0);
      const paid = Number(sale.amount_paid ?? 0);
      const paidValue = Math.max(0, Math.min(total, paid));

      if (paidValue > 0) {
        if (createdAt.toDateString() === now.toDateString()) totalToday += paidValue;
        if (createdAt >= start7) total7d += paidValue;
        if (createdAt >= start30) total30d += paidValue;
        paidTotal += paidValue;
      }
    });

    return {
      totalToday,
      total7d,
      total30d,
      paidTotal,
      pendingTotal,
      customers: customers.size,
      statusCounts,
    };
  }, [orders, sales]);

  const expenseAlerts = useMemo(() => buildExpenseAlertSummary(expenses), [expenses]);

  const monthlyFinancialSummary = useMemo(
    () => calculateMonthlyActualSummary({ orders, sales, entries }),
    [entries, orders, sales],
  );

  const monthlyExpenseCommitment = useMemo(() => {
    const now = new Date();
    return expenses.reduce((total, expense) => {
      if (expense.status === 'inativo') return total;
      const dueDate = resolveExpenseDueDate(expense, now);
      if (!dueDate) return total;
      if (dueDate.getFullYear() !== now.getFullYear() || dueDate.getMonth() !== now.getMonth()) {
        return total;
      }
      return total + getExpenseAmount(expense);
    }, 0);
  }, [expenses]);

  const cashForecast = useMemo(
    () =>
      buildCashForecastSummary({
        orders,
        sales,
        entries,
        expenses,
        period: 'month',
      }),
    [entries, expenses, orders, sales],
  );

  const profitabilityRows = useMemo(() => {
    const soldUnitsByProduct = buildSoldUnitsMap({ orderItems, saleItems });
    return buildProductProfitabilityRows({
      products,
      productSupplies,
      expenses,
      soldUnitsByProduct,
    });
  }, [expenses, orderItems, productSupplies, products, saleItems]);

  const profitabilitySummary = useMemo(() => {
    const activeRows = profitabilityRows.filter((row) => row.salePrice > 0);
    const totalRevenue = activeRows.reduce((total, row) => total + row.revenue, 0);
    const totalProfit = activeRows.reduce((total, row) => total + row.totalProfit, 0);
    const averageProfit = activeRows.length
      ? activeRows.reduce((total, row) => total + row.profitPerUnit, 0) / activeRows.length
      : 0;
    const averageMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      averageProfit,
      averageMargin,
      totalProducts: activeRows.length,
    };
  }, [profitabilityRows]);

  const lowStockProducts = useMemo(
    () =>
      products
        .filter(
          (product) =>
            Boolean(product.track_stock) &&
            Number(product.stock_quantity || 0) <= Number(product.min_stock || 0),
        )
        .sort(
          (a, b) =>
            Number(a.stock_quantity || 0) - Number(b.stock_quantity || 0) ||
            a.name.localeCompare(b.name, 'pt-BR'),
        ),
    [products],
  );

  const catalogFunnel = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const relevantEvents = catalogEvents.filter((event) => new Date(event.created_at) >= cutoff);
    const counts = {
      view_product: 0,
      add_to_cart: 0,
      start_order: 0,
      purchase_completed: 0,
    };

    relevantEvents.forEach((event) => {
      counts[event.event_type] += 1;
    });

    return {
      ...counts,
      addToCartRate: counts.view_product > 0 ? (counts.add_to_cart / counts.view_product) * 100 : 0,
      startOrderRate: counts.add_to_cart > 0 ? (counts.start_order / counts.add_to_cart) * 100 : 0,
      purchaseRate: counts.start_order > 0 ? (counts.purchase_completed / counts.start_order) * 100 : 0,
      overallConversion:
        counts.view_product > 0 ? (counts.purchase_completed / counts.view_product) * 100 : 0,
    };
  }, [catalogEvents]);

  const kpiCards = useMemo(
    () => [
      {
        title: 'Vendas Hoje',
        value: formatCurrency(metrics.totalToday),
        badge: 'Hoje',
        icon: <ShoppingBag className="h-5 w-5" />,
      },
      {
        title: 'Faturamento (7d)',
        value: formatCurrency(metrics.total7d),
        badge: metrics.total7d > 0 ? '+12%' : '0%',
        badgeTone: metrics.total7d > 0 ? ('success' as const) : undefined,
        icon: <Activity className="h-5 w-5" />,
      },
      {
        title: 'Faturamento (Mês)',
        value: formatCurrency(metrics.total30d),
        badge: '30 dias',
        icon: <BarChart2 className="h-5 w-5" />,
      },
      {
        title: 'Clientes Ativos',
        value: metrics.customers.toString(),
        icon: <Users className="h-5 w-5" />,
      },
    ],
    [metrics],
  );

  const financialCards = useMemo(
    () => [
      {
        title: 'Contas vencendo',
        value: expenseAlerts.total.toString(),
        subtitle:
          expenseAlerts.total > 0
            ? `${expenseAlerts.overdue} vencidas • ${expenseAlerts.dueSoon} próximas`
            : 'Nenhum alerta financeiro',
        icon: <AlertTriangle className="h-5 w-5" />,
        tone:
          expenseAlerts.overdue > 0
            ? 'text-destructive'
            : expenseAlerts.dueSoon > 0
              ? 'text-amber-600'
              : 'text-emerald-600',
      },
      {
        title: 'Saldo do caixa',
        value: formatCurrency(cashForecast.currentBalance),
        subtitle: 'Saldo consolidado do sistema',
        icon: <Wallet className="h-5 w-5" />,
        tone: 'text-primary',
      },
      {
        title: 'Entradas do mês',
        value: formatCurrency(monthlyFinancialSummary.income),
        subtitle: 'Recebimentos confirmados',
        icon: <ArrowUpCircle className="h-5 w-5" />,
        tone: 'text-emerald-600',
      },
      {
        title: 'Saídas do mês',
        value: formatCurrency(monthlyFinancialSummary.expense + monthlyExpenseCommitment),
        subtitle: 'Pagas e previstas no mês',
        icon: <ArrowDownCircle className="h-5 w-5" />,
        tone: 'text-amber-600',
      },
      {
        title: 'Lucro estimado',
        value: formatCurrency(profitabilitySummary.averageProfit),
        subtitle: `${profitabilitySummary.averageMargin.toFixed(1)}% de margem média`,
        icon: <BadgeDollarSign className="h-5 w-5" />,
        tone: profitabilitySummary.averageProfit >= 0 ? 'text-emerald-600' : 'text-destructive',
      },
      {
        title: 'Estoque baixo',
        value: lowStockProducts.length.toString(),
        subtitle:
          lowStockProducts.length > 0 ? 'Produtos abaixo do mínimo' : 'Nenhum alerta de estoque',
        icon: <AlertTriangle className="h-5 w-5" />,
        tone: lowStockProducts.length > 0 ? 'text-amber-600' : 'text-emerald-600',
      },
    ],
    [
      cashForecast.currentBalance,
      expenseAlerts,
      lowStockProducts.length,
      monthlyExpenseCommitment,
      monthlyFinancialSummary,
      profitabilitySummary,
    ],
  );

  const summaryCards = useMemo(
    () => [
      {
        title: 'Pendentes',
        value: metrics.statusCounts.pendente.toString(),
        subtitle: 'aguardando aprovação',
        icon: <ClipboardCheck className="h-5 w-5" />,
        tone: 'blue' as const,
      },
      {
        title: 'Arte',
        value: (metrics.statusCounts.produzindo_arte + metrics.statusCounts.arte_aprovada).toString(),
        subtitle: 'ajustes em andamento',
        icon: <Activity className="h-5 w-5" />,
        tone: 'orange' as const,
      },
      {
        title: 'Em Produção',
        value: metrics.statusCounts.em_producao.toString(),
        subtitle: 'em andamento',
        icon: <BadgeDollarSign className="h-5 w-5" />,
        tone: 'green' as const,
      },
    ],
    [metrics],
  );

  const recentOrders = useMemo(
    () =>
      orders.slice(0, 3).map((order) => {
        const method = order.payment_method
          ? paymentMethodLabels[order.payment_method] ?? order.payment_method
          : 'Sem pagamento';
        const statusTone =
          order.status === 'entregue' || order.status === 'finalizado' || order.status === 'pronto'
            ? ('success' as const)
            : ('warning' as const);

        return {
          id: `#${formatOrderNumber(order.order_number)}`,
          customer: order.customer_name || 'Cliente',
          details: `Pagamento: ${method}`,
          status: statusLabels[order.status],
          statusTone,
          amount: formatCurrency(Number(order.total ?? 0)),
        };
      }),
    [orders],
  );

  const productionQueue = useMemo(
    () =>
      orders.filter((order) =>
        ['pendente', 'produzindo_arte', 'arte_aprovada', 'em_producao'].includes(order.status),
      ),
    [orders],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Painel</h1>
          <p className="text-sm text-muted-foreground">Visão geral do sistema</p>
        </div>
        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
          {loading ? 'Atualizando...' : 'Atualizado agora'}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button onClick={() => navigate('/pedidos/novo')}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Pedido
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">Considera apenas pagamentos aprovados.</p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <StatCard
            key={card.title}
            title={card.title}
            value={card.value}
            badge={card.badge}
            badgeTone={card.badgeTone}
            icon={card.icon}
          />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {financialCards.map((card) => (
          <Card key={card.title}>
            <CardContent className="flex items-start justify-between gap-4 pt-6">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{card.title}</p>
                <p className="text-2xl font-semibold text-foreground">{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.subtitle}</p>
              </div>
              <div className={card.tone}>{card.icon}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Total recebido</p>
          <p className="text-lg font-semibold text-foreground">{formatCurrency(metrics.paidTotal)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Saldo pendente</p>
          <p className="text-lg font-semibold text-amber-600">{formatCurrency(metrics.pendingTotal)}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {summaryCards.map((card) => (
          <SummaryCard
            key={card.title}
            title={card.title}
            value={card.value}
            subtitle={card.subtitle}
            icon={card.icon}
            tone={card.tone}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Painel Financeiro</CardTitle>
              <p className="text-sm text-muted-foreground">
                Alertas de contas, projeção do mês e rentabilidade média dos produtos.
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate('/financeiro/fluxo-caixa')}>
              Ver fluxo de caixa
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
            <div className="space-y-3">
              {expenseAlerts.items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                  Nenhuma conta vencendo ou vencida no momento.
                </div>
              ) : (
                expenseAlerts.items.slice(0, 4).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate('/financeiro/despesas')}
                    className="flex w-full items-start justify-between gap-4 rounded-2xl border border-border px-4 py-3 text-left transition hover:bg-muted/40"
                  >
                    <div>
                      <p className="font-medium text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.dueStatus === 'vencida' ? 'Conta vencida' : 'Vencendo em até 5 dias'}
                        {item.dueDate
                          ? ` • ${new Date(`${item.dueDate}T00:00:00`).toLocaleDateString('pt-BR')}`
                          : ''}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(item.amount)}</span>
                  </button>
                ))
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Saldo projetado</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {formatCurrency(cashForecast.projectedBalance)}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-xl border border-border bg-card px-3 py-3">
                  <p className="text-xs text-muted-foreground">Entradas previstas</p>
                  <p className="mt-2 font-semibold text-emerald-600">{formatCurrency(cashForecast.incoming)}</p>
                </div>
                <div className="rounded-xl border border-border bg-card px-3 py-3">
                  <p className="text-xs text-muted-foreground">Saídas previstas</p>
                  <p className="mt-2 font-semibold text-amber-600">{formatCurrency(cashForecast.outgoing)}</p>
                </div>
                <div className="rounded-xl border border-border bg-card px-3 py-3">
                  <p className="text-xs text-muted-foreground">Lucro médio por produto</p>
                  <p className="mt-2 font-semibold text-foreground">
                    {formatCurrency(profitabilitySummary.averageProfit)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {profitabilitySummary.totalProducts} item(ns) com preço configurado
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card px-3 py-3">
                  <p className="text-xs text-muted-foreground">Margem real média</p>
                  <p className="mt-2 font-semibold text-foreground">
                    {profitabilitySummary.averageMargin.toFixed(1)}%
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Baseada em custos reais e rateio fixo</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <OrdersList items={recentOrders} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_1.2fr]">
        {productionQueue.length === 0 ? (
          <EmptyStateCard
            title="Fila de Produção"
            description="Tudo limpo! Não há pedidos aguardando produção."
            actionLabel="Ver Fila Completa"
            icon={<ShoppingBag className="h-5 w-5" />}
          />
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Fila de Produção</h3>
              <button
                className="text-sm font-semibold text-muted-foreground hover:text-foreground"
                onClick={() => navigate('/producao')}
              >
                Ver Fila Completa
              </button>
            </div>
            <div className="mt-6 space-y-4 text-sm text-muted-foreground">
              <p>{productionQueue.length} pedido(s) aguardando produção.</p>
              <div className="space-y-3">
                {productionQueue.slice(0, 3).map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    className="group flex w-full items-center justify-between rounded-2xl border border-border/80 px-4 py-3 text-left transition hover:bg-muted/70"
                    onClick={() =>
                      navigate(
                        buildOrderDetailsPath({
                          id: order.id,
                          orderNumber: order.order_number,
                          customerName: order.customer_name,
                        }),
                      )
                    }
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">#{formatOrderNumber(order.order_number)}</p>
                      <p className="text-xs text-muted-foreground">{order.customer_name || 'Cliente'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                        {statusLabels[order.status]}
                      </span>
                      <span className="text-muted-foreground/70 group-hover:text-foreground">→</span>
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Use a fila para acompanhar o andamento.</p>
            </div>
          </div>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Produtos mais rentáveis</CardTitle>
              <p className="text-sm text-muted-foreground">
                Lucro real por unidade considerando insumos, despesas e rateio fixo.
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate('/relatorios')}>
              Abrir relatórios
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {profitabilityRows
              .filter((row) => row.salePrice > 0)
              .sort((a, b) => b.profitPerUnit - a.profitPerUnit)
              .slice(0, 4)
              .map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-foreground">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Custo real {formatCurrency(row.totalRealCost)} • Margem {row.marginPct.toFixed(1)}%
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {formatCurrency(row.profitPerUnit)}
                  </span>
                </div>
              ))}
            {profitabilityRows.filter((row) => row.salePrice > 0).length === 0 && (
              <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                Cadastre preços e vendas para visualizar a rentabilidade real dos produtos.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Funil do Catálogo</CardTitle>
              <p className="text-sm text-muted-foreground">
                Visualizações, carrinhos, pedidos iniciados e compras concluídas nos últimos 30 dias.
              </p>
            </div>
            <span className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-semibold text-muted-foreground">
              Conversão total {catalogFunnel.overallConversion.toFixed(1)}%
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Visualizações</p>
                  <Eye className="h-4 w-4 text-primary" />
                </div>
                <p className="mt-3 text-2xl font-semibold text-foreground">{catalogFunnel.view_product}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Carrinho</p>
                  <ShoppingCart className="h-4 w-4 text-primary" />
                </div>
                <p className="mt-3 text-2xl font-semibold text-foreground">{catalogFunnel.add_to_cart}</p>
                <p className="mt-1 text-xs text-muted-foreground">{catalogFunnel.addToCartRate.toFixed(1)}% das visualizações</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Pedidos iniciados</p>
                  <ClipboardCheck className="h-4 w-4 text-primary" />
                </div>
                <p className="mt-3 text-2xl font-semibold text-foreground">{catalogFunnel.start_order}</p>
                <p className="mt-1 text-xs text-muted-foreground">{catalogFunnel.startOrderRate.toFixed(1)}% de avanço</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Compras concluídas</p>
                  <BadgeDollarSign className="h-4 w-4 text-primary" />
                </div>
                <p className="mt-3 text-2xl font-semibold text-foreground">{catalogFunnel.purchase_completed}</p>
                <p className="mt-1 text-xs text-muted-foreground">{catalogFunnel.purchaseRate.toFixed(1)}% dos pedidos iniciados</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              {[
                { label: 'Visualização', value: catalogFunnel.view_product, tone: 'bg-slate-500' },
                { label: 'Carrinho', value: catalogFunnel.add_to_cart, tone: 'bg-sky-500' },
                { label: 'Pedido', value: catalogFunnel.start_order, tone: 'bg-amber-500' },
                { label: 'Compra', value: catalogFunnel.purchase_completed, tone: 'bg-emerald-500' },
              ].map((step) => {
                const width =
                  catalogFunnel.view_product > 0
                    ? Math.max(6, (step.value / Math.max(catalogFunnel.view_product, 1)) * 100)
                    : 6;

                return (
                  <div key={step.label} className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{step.label}</span>
                      <span>{step.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted/40">
                      <div className={`h-2 rounded-full ${step.tone}`} style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Estoque baixo</CardTitle>
              <p className="text-sm text-muted-foreground">
                Produtos com estoque atual menor ou igual ao estoque mínimo configurado.
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate('/produtos')}>
              Ver produtos
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {lowStockProducts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                Nenhum produto com alerta de estoque baixo no momento.
              </div>
            ) : (
              lowStockProducts.slice(0, 6).map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-foreground">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Atual {product.stock_quantity} {product.unit} • Mínimo {product.min_stock} {product.unit}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                    Estoque baixo
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
