import { useEffect, useState } from 'react';
import { formatOrderNumber } from '@/lib/utils';
import { BibleVerse } from '@/components/BibleVerse';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShoppingCart, AlertTriangle, ClipboardList, TrendingUp, Users, Clock, CheckCircle, FileText, Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';
import type { Customer, OrderItem, PaymentMethod } from '@/types/database';

interface DashboardStats {
  totalProducts: number;
  lowStockProducts: number;
  todaySales: number;
  todayRevenue: number;
  pendingOrders: number;
  inProductionOrders: number;
  readyOrders: number;
  totalCustomers: number;
  weekRevenue: number;
  monthRevenue: number;
}

interface LowStockProduct {
  id: string;
  name: string;
  stock_quantity: number;
  min_stock: number;
  track_stock: boolean;
}

interface RecentOrder {
  id: string;
  order_number: number;
  customer_id: string | null;
  customer_name: string | null;
  status: string;
  total: number;
  created_at: string;
  payment_method: PaymentMethod | null;
  customer?: Pick<Customer, 'name' | 'phone' | 'document'> | null;
  items?: Array<Pick<OrderItem, 'product_name' | 'quantity'>>;
}

interface ProductionOrder {
  id: string;
  order_number: number;
  customer_id: string | null;
  customer_name: string | null;
  status: string;
  total: number;
  created_at: string;
  payment_method: PaymentMethod | null;
  customer?: Pick<Customer, 'name' | 'phone' | 'document'> | null;
  items?: Array<Pick<OrderItem, 'product_name' | 'quantity'>>;
}

export default function Dashboard() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    lowStockProducts: 0,
    todaySales: 0,
    todayRevenue: 0,
    pendingOrders: 0,
    inProductionOrders: 0,
    readyOrders: 0,
    totalCustomers: 0,
    weekRevenue: 0,
    monthRevenue: 0,
  });
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);

      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      monthAgo.setHours(0, 0, 0, 0);

      const [
        productsResult,
        lowStockResult,
        salesResult,
        weekSalesResult,
        monthSalesResult,
        ordersResult,
        customersResult,
        recentOrdersResult,
        productionOrdersResult
      ] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact' }).eq('is_active', true),
        supabase
          .from('products')
          .select('id, name, stock_quantity, min_stock, track_stock')
          .eq('track_stock', true),
        supabase.from('sales').select('id, total').gte('created_at', today.toISOString()),
        supabase.from('sales').select('id, total').gte('created_at', weekAgo.toISOString()),
        supabase.from('sales').select('id, total').gte('created_at', monthAgo.toISOString()),
        supabase.from('orders').select('id, status'),
        supabase.from('customers').select('id', { count: 'exact' }),
        supabase
          .from('orders')
          .select(
            'id, order_number, customer_id, customer_name, status, total, created_at, payment_method, customer:customers(name, phone, document), items:order_items(product_name, quantity)'
          )
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('orders')
          .select(
            'id, order_number, customer_id, customer_name, status, total, created_at, payment_method, customer:customers(name, phone, document), items:order_items(product_name, quantity)'
          )
          .in('status', ['pendente', 'em_producao', 'pronto'])
          .order('created_at', { ascending: true })
          .limit(10)
      ]);

      const lowStock = (lowStockResult.data || []).filter(p => p.track_stock && p.stock_quantity <= p.min_stock);

      setStats({
        totalProducts: productsResult.count || 0,
        lowStockProducts: lowStock.length,
        todaySales: salesResult.data?.length || 0,
        todayRevenue: salesResult.data?.reduce((acc, s) => acc + Number(s.total), 0) || 0,
        weekRevenue: weekSalesResult.data?.reduce((acc, s) => acc + Number(s.total), 0) || 0,
        monthRevenue: monthSalesResult.data?.reduce((acc, s) => acc + Number(s.total), 0) || 0,
        pendingOrders: ordersResult.data?.filter(o => o.status === 'orcamento').length || 0,
        inProductionOrders: ordersResult.data?.filter(o => o.status === 'em_producao').length || 0,
        readyOrders: ordersResult.data?.filter(o => o.status === 'pronto').length || 0,
        totalCustomers: customersResult.count || 0,
      });

      setLowStockProducts(lowStock.slice(0, 5) as LowStockProduct[]);
      setRecentOrders(recentOrdersResult.data as RecentOrder[] || []);
      setProductionOrders(productionOrdersResult.data as ProductionOrder[] || []);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatTime = (value: Date) =>
    new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(value);

  const formatPaymentMethod = (value?: PaymentMethod | null) => {
    if (!value) return '-';
    const labels: Record<PaymentMethod, string> = {
      dinheiro: 'Dinheiro',
      cartao: 'Cartao',
      pix: 'Pix',
      boleto: 'Boleto',
      outro: 'Outro',
    };
    return labels[value] || value;
  };

  const formatOrderItems = (items?: Array<Pick<OrderItem, 'product_name' | 'quantity'>> | null) => {
    if (!items || items.length === 0) return 'Sem produtos';
    const preview = items.slice(0, 2).map((item) => {
      const qty = Number(item.quantity);
      const qtyLabel = Number.isFinite(qty) ? String(qty) : String(item.quantity);
      return `${item.product_name} x${qtyLabel}`;
    });
    const remaining = items.length - preview.length;
    return remaining > 0 ? `${preview.join(', ')} +${remaining}` : preview.join(', ');
  };

  const getStatusConfig = (status: string) => {
    const config: Record<string, { label: string; color: string; icon: React.ElementType }> = {
      orcamento: { label: 'Orçamento', color: 'bg-blue-100 text-blue-800', icon: FileText },
      pendente: { label: 'Pendente', color: 'bg-orange-100 text-orange-800', icon: Clock },
      em_producao: { label: 'Em Produção', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      pronto: { label: 'Pronto', color: 'bg-green-100 text-green-800', icon: CheckCircle },
      aguardando_retirada: { label: 'Aguardando retirada', color: 'bg-sky-100 text-sky-800', icon: CheckCircle },
      entregue: { label: 'Entregue', color: 'bg-gray-100 text-gray-800', icon: Truck },
    };
    return config[status] || { label: status, color: 'bg-gray-100 text-gray-800', icon: FileText };
  };

  const totalActiveOrders = stats.pendingOrders + stats.inProductionOrders + stats.readyOrders;
  const statCards = [
    {
      id: 'today',
      title: 'Vendas Hoje',
      value: formatCurrency(stats.todayRevenue),
      helper: `${stats.todaySales} ${stats.todaySales === 1 ? 'venda' : 'vendas'}`,
      icon: ShoppingCart,
      iconClass: 'text-blue-600',
      iconBg: 'bg-blue-100',
    },
    {
      id: 'week',
      title: 'Semana',
      value: formatCurrency(stats.weekRevenue),
      helper: 'Ultimos 7 dias',
      icon: TrendingUp,
      iconClass: 'text-emerald-600',
      iconBg: 'bg-emerald-100',
    },
    {
      id: 'month',
      title: 'Mes',
      value: formatCurrency(stats.monthRevenue),
      helper: 'Ultimos 30 dias',
      icon: TrendingUp,
      iconClass: 'text-cyan-600',
      iconBg: 'bg-cyan-100',
    },
    {
      id: 'clients',
      title: 'Clientes',
      value: stats.totalCustomers,
      helper: `${stats.totalProducts} produtos ativos`,
      icon: Users,
      iconClass: 'text-slate-600',
      iconBg: 'bg-slate-100',
    },
  ];
  const productionCards = [
    {
      id: 'orcamentos',
      title: 'Orçamentos',
      value: stats.pendingOrders,
      helper: 'aguardando aprovação',
      cardClass: 'border-blue-200 bg-blue-50/50 dark:bg-blue-950/20',
      icon: FileText,
      iconClass: 'text-blue-600',
      valueClass: 'text-blue-600',
    },
    {
      id: 'producao',
      title: 'Em Produção',
      value: stats.inProductionOrders,
      helper: 'em andamento',
      cardClass: 'border-yellow-200 bg-yellow-50/50 dark:bg-yellow-950/20',
      icon: Clock,
      iconClass: 'text-yellow-600',
      valueClass: 'text-yellow-600',
    },
    {
      id: 'prontos',
      title: 'Prontos',
      value: stats.readyOrders,
      helper: 'aguardando entrega',
      cardClass: 'border-green-200 bg-green-50/50 dark:bg-green-950/20',
      icon: CheckCircle,
      iconClass: 'text-green-600',
      valueClass: 'text-green-600',
    },
  ];

  if (loading) {
    return (
      <div className="page-container">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-24"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-16"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-muted-foreground">Visao geral do sistema</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lastUpdated && (
            <Badge variant="outline">Atualizado {formatTime(lastUpdated)}</Badge>
          )}
          {hasPermission(['admin', 'atendente', 'caixa']) && (
            <Button onClick={() => navigate('/pedidos/novo')}>
              Novo Pedido
            </Button>
          )}
          {hasPermission(['admin', 'atendente', 'caixa', 'producao']) && (
            <Button variant="outline" onClick={() => navigate('/pedidos/kanban')}>
              Kanban
            </Button>
          )}
          {hasPermission(['admin', 'producao']) && (
            <Button variant="outline" onClick={() => navigate('/producao')}>
              Produção
            </Button>
          )}
        </div>
      </div>

      <BibleVerse />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.id} className="stat-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <div className={`flex h-8 w-8 items-center justify-center rounded-full ${card.iconBg}`}>
                  <Icon className={`h-4 w-4 ${card.iconClass}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="stat-value">{card.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{card.helper}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Production Overview */}
      <div className="grid gap-4 md:grid-cols-3 mt-4">
        {productionCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.id} className={card.cardClass}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${card.iconClass}`} />
                  {card.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${card.valueClass}`}>{card.value}</div>
                <p className="text-xs text-muted-foreground">{card.helper}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Production Progress */}
      {totalActiveOrders > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-lg">Fluxo de Produção</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-24 text-sm font-medium">Orçamentos</div>
                <Progress value={(stats.pendingOrders / totalActiveOrders) * 100} className="flex-1 h-3" />
                <div className="w-8 text-sm text-right">{stats.pendingOrders}</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-24 text-sm font-medium">Produção</div>
                <Progress value={(stats.inProductionOrders / totalActiveOrders) * 100} className="flex-1 h-3 [&>div]:bg-yellow-500" />
                <div className="w-8 text-sm text-right">{stats.inProductionOrders}</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-24 text-sm font-medium">Prontos</div>
                <Progress value={(stats.readyOrders / totalActiveOrders) * 100} className="flex-1 h-3 [&>div]:bg-green-500" />
                <div className="w-8 text-sm text-right">{stats.readyOrders}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 mt-4">
        {/* Production Queue */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Fila de Produção
            </CardTitle>
            <Badge variant="outline">
              {stats.inProductionOrders + stats.readyOrders} pedidos
            </Badge>
          </CardHeader>
          <CardContent>
            {productionOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum pedido Em Produção
              </p>
            ) : (
              <div className="space-y-3">
                {productionOrders.map((order) => {
                  const config = getStatusConfig(order.status);
                  const StatusIcon = config.icon;
                  return (
                    <div
                      key={order.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => navigate(`/pedidos/${order.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-full ${config.color}`}>
                          <StatusIcon className="h-3 w-3" />
                        </div>
                        <div>
                          <span className="font-medium">#{formatOrderNumber(order.order_number)}</span>
                          <div className="text-xs text-muted-foreground">
                            {order.customer_id ? (
                              <Button
                                variant="link"
                                className="h-auto p-0 text-xs text-primary"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  navigate(`/clientes/${order.customer_id}/historico`);
                                }}
                              >
                                {order.customer_name || order.customer?.name || 'Cliente'}
                              </Button>
                            ) : (
                              <span>{order.customer_name || order.customer?.name || 'Cliente não informado'}</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Tel: {order.customer?.phone || '-'} | CPF: {order.customer?.document || '-'}
                          </div>
                          <div className="text-xs text-muted-foreground max-w-[260px] truncate">
                            Pagamento: {formatPaymentMethod(order.payment_method)} | Produtos: {formatOrderItems(order.items)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium">{formatCurrency(Number(order.total))}</span>
                        <p className="text-xs text-muted-foreground">{config.label}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {hasPermission(['admin', 'atendente', 'producao']) && (
              <Button
                variant="outline"
                className="w-full mt-4"
                onClick={() => navigate('/producao')}
              >
                Ver Produção
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Low Stock Alert or Recent Orders */}
        {stats.lowStockProducts > 0 ? (
          <Card className="border-warning/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                Estoque Baixo
              </CardTitle>
              <Badge variant="outline" className="text-warning border-warning">
                {stats.lowStockProducts} {stats.lowStockProducts === 1 ? 'item' : 'itens'}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {lowStockProducts.map((product) => (
                  <div key={product.id} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{product.name}</span>
                    <span className="text-destructive">
                      {product.stock_quantity} / {product.min_stock}
                    </span>
                  </div>
                ))}
              </div>
              {hasPermission(['admin', 'atendente']) && (
                <Button
                  variant="outline"
                  className="w-full mt-4"
                  onClick={() => navigate('/estoque')}
                >
                  Ver Estoque
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Ultimos Pedidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum pedido registrado
                </p>
              ) : (
                <div className="space-y-3">
                  {recentOrders.map((order) => {
                    const config = getStatusConfig(order.status);
                    return (
                      <div
                        key={order.id}
                        className="flex items-center justify-between text-sm cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors"
                        onClick={() => navigate(`/pedidos/${order.id}`)}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">#{formatOrderNumber(order.order_number)}</span>
                            <span className="text-xs text-muted-foreground">
                              {order.customer_id ? (
                                <Button
                                  variant="link"
                                  className="h-auto p-0 text-xs text-primary"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    navigate(`/clientes/${order.customer_id}/historico`);
                                  }}
                                >
                                  {order.customer_name || order.customer?.name || 'Cliente'}
                                </Button>
                              ) : (
                                <span>{order.customer_name || order.customer?.name || 'Cliente não informado'}</span>
                              )}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Tel: {order.customer?.phone || '-'} | CPF: {order.customer?.document || '-'}
                          </div>
                          <div className="text-xs text-muted-foreground max-w-[260px] truncate">
                            Pagamento: {formatPaymentMethod(order.payment_method)} | Produtos: {formatOrderItems(order.items)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${config.color}`}>
                            {config.label}
                          </span>
                          <span className="font-medium">{formatCurrency(Number(order.total))}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {hasPermission(['admin', 'atendente', 'caixa']) && (
                <Button
                  variant="outline"
                  className="w-full mt-4"
                  onClick={() => navigate('/pedidos')}
                >
                  Ver Todos os Pedidos
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

