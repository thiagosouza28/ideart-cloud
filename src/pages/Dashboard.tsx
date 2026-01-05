import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BadgeDollarSign,
  BarChart2,
  ClipboardCheck,
  Filter,
  Plus,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { StatCard } from '@/components/dashboard/StatCard';
import { SummaryCard } from '@/components/dashboard/SummaryCard';
import { OrdersList } from '@/components/dashboard/OrdersList';
import { EmptyStateCard } from '@/components/dashboard/EmptyStateCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatOrderNumber } from '@/lib/utils';
import { Order, OrderStatus, Sale } from '@/types/database';

const statusLabels: Record<OrderStatus, string> = {
  orcamento: 'Orçamento',
  pendente: 'Pendente',
  em_producao: 'Em Produção',
  pronto: 'Pronto',
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadOrders = async () => {
      if (!profile?.company_id) {
        setOrders([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const [ordersResult, salesResult] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_number, customer_name, status, total, created_at, payment_method, payment_status')
          .eq('company_id', profile.company_id)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('sales')
          .select('id, total, amount_paid, created_at')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (!ordersResult.error) {
        setOrders((ordersResult.data as Order[]) || []);
      } else {
        setOrders([]);
      }

      if (!salesResult.error) {
        setSales((salesResult.data as Sale[]) || []);
      } else {
        setSales([]);
      }
      setLoading(false);
    };

    loadOrders();
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
    const customers = new Set<string>();
    const statusCounts: Record<OrderStatus, number> = {
      orcamento: 0,
      pendente: 0,
      em_producao: 0,
      pronto: 0,
      aguardando_retirada: 0,
      entregue: 0,
      cancelado: 0,
    };

    orders.forEach((order) => {
      const createdAt = new Date(order.created_at);
      const total = Number(order.total ?? 0);
      const isPaid = order.payment_status === 'pago' && order.status !== 'orcamento';
      if (isPaid) {
        if (createdAt.toDateString() === now.toDateString()) {
          totalToday += total;
        }
        if (createdAt >= start7) total7d += total;
        if (createdAt >= start30) total30d += total;
      }
      if (order.customer_name) customers.add(order.customer_name);
      statusCounts[order.status] += 1;
    });

    sales.forEach((sale) => {
      const createdAt = new Date(sale.created_at);
      const total = Number(sale.total ?? 0);
      const paid = Number(sale.amount_paid ?? 0);
      if (paid >= total && total > 0) {
        if (createdAt.toDateString() === now.toDateString()) {
          totalToday += total;
        }
        if (createdAt >= start7) total7d += total;
        if (createdAt >= start30) total30d += total;
      }
    });

    return {
      totalToday,
      total7d,
      total30d,
      customers: customers.size,
      statusCounts,
    };
  }, [orders, sales]);

  const kpiCards = useMemo(() => ([
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
  ]), [metrics]);

  const summaryCards = useMemo(() => ([
    {
      title: 'Orçamentos',
      value: metrics.statusCounts.orcamento.toString(),
      subtitle: 'aguardando aprovação',
      icon: <ClipboardCheck className="h-5 w-5" />,
      tone: 'blue' as const,
    },
    {
      title: 'Em Produção',
      value: metrics.statusCounts.em_producao.toString(),
      subtitle: 'em andamento',
      icon: <Activity className="h-5 w-5" />,
      tone: 'orange' as const,
    },
    {
      title: 'Prontos',
      value: metrics.statusCounts.pronto.toString(),
      subtitle: 'aguardando entrega',
      icon: <BadgeDollarSign className="h-5 w-5" />,
      tone: 'green' as const,
    },
  ]), [metrics]);

  const recentOrders = useMemo(() => {
    return orders.slice(0, 3).map((order) => {
      const method = order.payment_method ? (paymentMethodLabels[order.payment_method] ?? order.payment_method) : 'Sem pagamento';
      const statusTone = order.status === 'entregue' || order.status === 'pronto' ? 'success' : 'warning';
      return {
        id: `#${formatOrderNumber(order.order_number)}`,
        customer: order.customer_name || 'Cliente',
        details: `Pagamento: ${method}`,
        status: statusLabels[order.status],
        statusTone,
        amount: formatCurrency(Number(order.total ?? 0)),
      };
    });
  }, [orders]);

  const productionQueue = useMemo(
    () => orders.filter((order) => order.status === 'pendente' || order.status === 'em_producao'),
    [orders],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Visão geral do sistema</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
          Atualizado agora
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm">
          <Filter className="h-4 w-4" />
          Filtro
        </button>
        <button
          className="flex items-center gap-2 rounded-2xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm"
          onClick={() => navigate('/pedidos/novo')}
        >
          <Plus className="h-4 w-4" />
          Novo Pedido
        </button>
      </div>

      <p className="text-xs text-slate-400">
        Considera apenas pagamentos aprovados.
      </p>

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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_1.2fr]">
        {productionQueue.length === 0 ? (
          <EmptyStateCard
            title="Fila de Produção"
            description="Tudo limpo! Não há pedidos aguardando produção."
            actionLabel="Ver Fila Completa"
            icon={<ShoppingBag className="h-5 w-5" />}
          />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Fila de Produção</h3>
              <button
                className="text-sm font-semibold text-slate-500 hover:text-slate-700"
                onClick={() => navigate('/producao')}
              >
                Ver Fila Completa
              </button>
            </div>
            <div className="mt-6 space-y-4 text-sm text-slate-600">
              <p>{productionQueue.length} pedido(s) aguardando produção.</p>
              <div className="space-y-3">
                {productionQueue.slice(0, 3).map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    className="group flex w-full items-center justify-between rounded-2xl border border-slate-100 px-4 py-3 text-left transition hover:border-slate-200 hover:bg-slate-50"
                    onClick={() => navigate(`/pedidos/${order.id}`)}
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">#{formatOrderNumber(order.order_number)}</p>
                      <p className="text-xs text-slate-400">{order.customer_name || 'Cliente'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                        {statusLabels[order.status]}
                      </span>
                      <span className="text-slate-300 group-hover:text-slate-400">→</span>
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400">Use a fila para acompanhar o andamento.</p>
            </div>
          </div>
        )}
        <OrdersList items={recentOrders} />
      </div>
    </div>
  );
}
