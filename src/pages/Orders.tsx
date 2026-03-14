import { useEffect, useMemo, useState } from 'react';
import { formatOrderNumber } from '@/lib/utils';
import { Plus, Search, Eye, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Order, OrderStatus } from '@/types/database';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { deleteOrder } from '@/services/orders';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { buildOrderDetailsPath } from '@/lib/orderRouting';
import { isPendingCustomerInfoOrder, isPublicCatalogPersonalizedOrder } from '@/lib/orderMetadata';
import {
  buildOrderStatusCustomization,
  configurableOrderStatuses,
  getOrderStatusBadgeStyle,
  getOrderStatusLabel,
  getOrderStatusTabStyle,
  type ConfigurableOrderStatus,
} from '@/lib/orderStatusConfig';

export default function Orders() {
  const { company } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusCustomization, setStatusCustomization] = useState(() =>
    buildOrderStatusCustomization(company?.order_status_customization),
  );
  const navigate = useNavigate();
  const { toast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    supabase
      .from('orders')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setOrders((data as Order[]) || []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    setStatusCustomization(buildOrderStatusCustomization(company?.order_status_customization));
  }, [company?.order_status_customization]);

  const visibleStatusTabs = useMemo(
    () =>
      configurableOrderStatuses.filter((status) =>
        statusCustomization.enabled_statuses.includes(status),
      ),
    [statusCustomization.enabled_statuses],
  );

  useEffect(() => {
    if (statusFilter === 'all') return;
    if (!visibleStatusTabs.includes(statusFilter as ConfigurableOrderStatus)) {
      setStatusFilter('all');
    }
  }, [statusFilter, visibleStatusTabs]);

  const filtered = useMemo(
    () =>
      orders.filter((order) => {
        const matchesSearch =
          order.order_number.toString().includes(search) ||
          order.customer_name?.toLowerCase().includes(search.toLowerCase());
        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'finalizado'
            ? order.status === 'finalizado' || order.status === 'pronto'
            : order.status === statusFilter);
        return matchesSearch && matchesStatus;
      }),
    [orders, search, statusFilter],
  );

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-BR');
  const getPaymentStatusLabel = (paymentStatus: Order['payment_status']) =>
    paymentStatus === 'pago'
      ? 'Pago'
      : paymentStatus === 'parcial'
        ? 'Pagamento parcial'
        : 'Pendente';
  const getPaymentStatusColor = (paymentStatus: Order['payment_status']) =>
    paymentStatus === 'pago'
      ? 'bg-green-100 text-green-800'
      : paymentStatus === 'parcial'
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-gray-100 text-gray-800';
  const getPendingDetailLabel = (order: Order) =>
    order.status === 'pendente' && isPendingCustomerInfoOrder(order.notes)
      ? 'Aguardando informacoes do cliente'
      : null;

  const getStatusCounts = () => {
    const counts: Record<string, number> = { all: orders.length };
    orders.forEach((order) => {
      const key = order.status === 'pronto' ? 'finalizado' : order.status;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  };

  const counts = getStatusCounts();
  const openOrderDetails = (order: Order) => {
    navigate(
      buildOrderDetailsPath({
        id: order.id,
        orderNumber: order.order_number,
        customerName: order.customer_name,
      }),
    );
  };

  const canDeleteOrder = (order: Order) =>
    order.status === 'orcamento' || order.status === 'pendente';

  const handleDeleteOrder = async (event: React.MouseEvent, orderId: string) => {
    event.stopPropagation();
    const targetOrder = orders.find((item) => item.id === orderId);
    if (!targetOrder || !canDeleteOrder(targetOrder)) {
      toast({
        title: 'Exclusão indisponível',
        description: 'Somente pedidos em orçamento ou pendente podem ser excluídos.',
        variant: 'destructive',
      });
      return;
    }
    const approved = await confirm({
      title: 'Excluir pedido',
      description: 'Deseja excluir este pedido? Essa ação não pode ser desfeita.',
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      destructive: true,
    });
    if (!approved) return;
    setDeletingId(orderId);
    try {
      await deleteOrder(orderId);
      setOrders((prev) => prev.filter((item) => item.id !== orderId));
      toast({ title: 'Pedido excluído com sucesso!' });
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message || '')
          : undefined;
      toast({
        title: 'Erro ao excluir pedido',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Pedidos</h1>
          <p className="text-sm text-slate-500">Gerencie pedidos e acompanhe o status.</p>
        </div>
        <Button
          className="w-full rounded-2xl bg-sky-500 shadow-sm hover:bg-sky-600 sm:w-auto"
          onClick={() => navigate('/pedidos/novo')}
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo Pedido
        </Button>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-4">
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-auto w-max min-w-full justify-start">
            <TabsTrigger
              value="all"
              className="shrink-0 text-slate-700 hover:text-slate-800 data-[state=active]:bg-slate-100 data-[state=active]:font-semibold data-[state=active]:text-slate-900"
            >
              Todos <span className="ml-1 text-xs opacity-70">({counts.all || 0})</span>
            </TabsTrigger>
            {visibleStatusTabs.map((status) => (
              <TabsTrigger
                key={status}
                value={status}
                className="shrink-0 transition-colors data-[state=active]:font-semibold"
                style={getOrderStatusTabStyle(status, statusCustomization, statusFilter === status)}
              >
                {getOrderStatusLabel(status, statusCustomization)}{' '}
                <span className="ml-1 text-xs opacity-70">({counts[status] || 0})</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por número ou cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 md:hidden">
            {loading ? (
              <div className="rounded-lg border py-8 text-center text-sm text-muted-foreground">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-lg border py-8 text-center text-sm text-muted-foreground">Nenhum pedido encontrado</div>
            ) : (
              filtered.map((order) => (
                <div
                  key={order.id}
                  className="cursor-pointer space-y-3 rounded-lg border p-3"
                  onClick={() => openOrderDetails(order)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">#{formatOrderNumber(order.order_number)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className="status-badge shrink-0"
                        style={getOrderStatusBadgeStyle(order.status, statusCustomization)}
                      >
                        {getOrderStatusLabel(order.status, statusCustomization, order.payment_status)}
                      </span>
                      {getPendingDetailLabel(order) && (
                        <span className="text-[11px] text-muted-foreground">{getPendingDetailLabel(order)}</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="truncate text-sm font-medium">{order.customer_name || 'Não informado'}</p>
                    {isPublicCatalogPersonalizedOrder(order.notes) && (
                      <span className="inline-flex rounded bg-indigo-100 px-2 py-1 text-[11px] font-medium text-indigo-800">
                        Personalizado
                      </span>
                    )}
                    <span className={`inline-flex rounded px-2 py-1 text-xs ${getPaymentStatusColor(order.payment_status)}`}>
                      {getPaymentStatusLabel(order.payment_status)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{formatCurrency(Number(order.total))}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          openOrderDetails(order);
                        }}
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        Abrir
                      </Button>
                      {canDeleteOrder(order) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={(event) => handleDeleteOrder(event, order.id)}
                          disabled={deletingId === order.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="w-[120px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Nenhum pedido encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((order) => (
                    <TableRow
                      key={order.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openOrderDetails(order)}
                    >
                      <TableCell className="font-medium py-1">#{formatOrderNumber(order.order_number)}</TableCell>
                      <TableCell className="py-1">
                        <div className="flex flex-col gap-1">
                          {order.customer_id ? (
                            <Button
                              variant="link"
                              className="h-auto w-fit p-0 text-primary"
                              onClick={(event) => {
                                event.stopPropagation();
                                navigate(`/clientes/${order.customer_id}/historico`);
                              }}
                            >
                              {order.customer_name || 'Cliente'}
                            </Button>
                          ) : (
                            <span>{order.customer_name || 'Não informado'}</span>
                          )}
                          {isPublicCatalogPersonalizedOrder(order.notes) && (
                            <span className="inline-flex w-fit rounded bg-indigo-100 px-2 py-1 text-[11px] font-medium text-indigo-800">
                              Personalizado
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-1">
                        <div className="flex flex-col gap-1">
                          <span
                            className="status-badge"
                            style={getOrderStatusBadgeStyle(order.status, statusCustomization)}
                          >
                            {getOrderStatusLabel(order.status, statusCustomization, order.payment_status)}
                          </span>
                          {getPendingDetailLabel(order) && (
                            <span className="text-[11px] text-muted-foreground">
                              {getPendingDetailLabel(order)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-1">
                        <span className={`rounded px-2 py-1 text-xs ${getPaymentStatusColor(order.payment_status)}`}>
                          {getPaymentStatusLabel(order.payment_status)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium py-1">
                        {formatCurrency(Number(order.total))}
                      </TableCell>
                      <TableCell className="text-muted-foreground py-1">{formatDate(order.created_at)}</TableCell>
                      <TableCell className="py-1">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(event) => {
                              event.stopPropagation();
                              openOrderDetails(order);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canDeleteOrder(order) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={(event) => handleDeleteOrder(event, order.id)}
                              disabled={deletingId === order.id}
                              title="Excluir pedido"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
