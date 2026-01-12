import { useEffect, useMemo, useState } from 'react';
import { formatOrderNumber } from '@/lib/utils';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { Customer, Order, OrderStatus } from '@/types/database';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { calculateAge, formatDateBr, isBirthdayToday } from '@/lib/birthdays';

type DeliveryMap = Record<string, string>;

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

const statusColors: Record<OrderStatus, string> = {
  orcamento: 'bg-blue-100 text-blue-800',
  pendente: 'bg-orange-100 text-orange-800',
  produzindo_arte: 'bg-indigo-100 text-indigo-800',
  arte_aprovada: 'bg-emerald-100 text-emerald-800',
  em_producao: 'bg-yellow-100 text-yellow-800',
  finalizado: 'bg-green-100 text-green-800',
  pronto: 'bg-green-100 text-green-800',
  aguardando_retirada: 'bg-sky-100 text-sky-800',
  entregue: 'bg-gray-100 text-gray-800',
  cancelado: 'bg-red-100 text-red-800',
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatDate = (d?: string | null) => {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('pt-BR');
};

const daysBetween = (start: string, end: string) => {
  const startDate = new Date(start).getTime();
  const endDate = new Date(end).getTime();
  const diff = Math.max(0, endDate - startDate);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

export default function CustomerHistory() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveryMap, setDeliveryMap] = useState<DeliveryMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      setError(null);

      const [customerResult, ordersResult] = await Promise.all([
        supabase.from('customers').select('*').eq('id', id).single(),
        supabase
          .from('orders')
          .select('*')
          .eq('customer_id', id)
          .order('created_at', { ascending: false }),
      ]);

      if (customerResult.error || !customerResult.data) {
        setError('Cliente não encontrado.');
        setLoading(false);
        return;
      }

      const orderData = (ordersResult.data as Order[]) || [];
      setCustomer(customerResult.data as Customer);
      setOrders(orderData);

      if (orderData.length > 0) {
        const orderIds = orderData.map((o) => o.id);
        const { data: deliveries } = await supabase
          .from('order_status_history')
          .select('order_id, created_at')
          .eq('status', 'entregue')
          .in('order_id', orderIds);

        const latestByOrder: DeliveryMap = {};
        (deliveries || []).forEach((entry: any) => {
          const existing = latestByOrder[entry.order_id];
          if (!existing || new Date(entry.created_at) > new Date(existing)) {
            latestByOrder[entry.order_id] = entry.created_at;
          }
        });
        setDeliveryMap(latestByOrder);
      }

      setLoading(false);
    };

    load();
  }, [id]);

  const nonCanceledOrders = useMemo(
    () => orders.filter((order) => order.status !== 'cancelado'),
    [orders],
  );

  const lastPurchase = nonCanceledOrders[0]?.created_at || null;
  const finishedOrders = orders.filter((order) => order.status === 'entregue');
  const totalPaid = nonCanceledOrders.reduce(
    (sum, order) => sum + Number(order.amount_paid || 0),
    0,
  );
  const totalFinishedValue = finishedOrders.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0,
  );
  const ticketAverage =
    finishedOrders.length > 0 ? totalFinishedValue / finishedOrders.length : 0;

  const customerSegment = useMemo(() => {
    if (!lastPurchase) return 'Sem histórico';
    const days = daysBetween(lastPurchase, new Date().toISOString());
    if (days <= 60) return 'Ativo';
    return 'Inativo';
  }, [lastPurchase]);

  const statusCounts = useMemo(() => {
    const counts: Record<OrderStatus, number> = {
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
      counts[order.status] += 1;
    });
    return counts;
  }, [orders]);

  const insights = useMemo(() => {
    const notes: string[] = [];
    if (orders.length === 0) {
      notes.push('Cliente ainda não possui pedidos registrados.');
    }
    if (lastPurchase) {
      const days = daysBetween(lastPurchase, new Date().toISOString());
      if (days <= 30) {
        notes.push('Cliente ativo: bom momento para sugerir upsell.');
      } else if (days <= 90) {
        notes.push('Cliente em aquecimento: reforce o relacionamento.');
      } else {
        notes.push('Cliente inativo: considere uma oferta de retorno.');
      }
    }
    if (ticketAverage > 0 && ticketAverage < 150) {
      notes.push('Ticket médio baixo: oportunidade para kits ou adicionais.');
    }
    const pendingBalance = orders.reduce(
      (sum, order) => sum + Math.max(0, Number(order.total) - Number(order.amount_paid)),
      0,
    );
    if (pendingBalance > 0) {
      notes.push('Existe saldo pendente em pedidos anteriores.');
    }
    return notes;
  }, [orders, lastPurchase, ticketAverage]);

  const birthDateLabel = formatDateBr(customer?.date_of_birth);
  const customerAge = calculateAge(customer?.date_of_birth);
  const birthdayToday = isBirthdayToday(customer?.date_of_birth);
  const customerPhoto = ensurePublicStorageUrl('customer-photos', customer?.photo_url);
  const customerInitials = customer?.name
    ? customer.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
    : 'CL';

  if (loading) {
    return (
      <div className="page-container flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="page-container flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Histórico do Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error || 'Cliente não encontrado.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-container w-full max-w-none space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Relatório do Cliente</h1>
          <p className="text-muted-foreground">Resumo de pedidos e comportamento</p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14">
              {customerPhoto ? (
                <AvatarImage src={customerPhoto} alt={customer.name} />
              ) : null}
              <AvatarFallback className="bg-muted text-xs">{customerInitials}</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{customer.name}</h2>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Nascimento: {birthDateLabel}</Badge>
                {customerAge !== null && (
                  <Badge variant="outline">Idade: {customerAge} anos</Badge>
                )}
                {birthdayToday && (
                  <Badge className="bg-emerald-100 text-emerald-800">Aniversário hoje</Badge>
                )}
                <Badge variant="outline">Segmento: {customerSegment}</Badge>
                <Badge variant="outline">
                  Última compra: {lastPurchase ? formatDate(lastPurchase) : '-'}
                </Badge>
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate('/clientes')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm text-muted-foreground">Pedidos (exceto cancelados)</p>
            <p className="text-2xl font-semibold">{nonCanceledOrders.length}</p>
            <p className="text-xs text-muted-foreground">Total de pedidos do cliente</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm text-muted-foreground">Pedidos finalizados</p>
            <p className="text-2xl font-semibold">{finishedOrders.length}</p>
            <p className="text-xs text-muted-foreground">Base para última compra e ticket</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm text-muted-foreground">Total pago (histórico)</p>
            <p className="text-2xl font-semibold">{formatCurrency(totalPaid)}</p>
            <p className="text-xs text-muted-foreground">Somatório de pagamentos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm text-muted-foreground">Ticket médio (finalizados)</p>
            <p className="text-2xl font-semibold">
              {finishedOrders.length > 0 ? formatCurrency(ticketAverage) : 'R$ 0,00'}
            </p>
            <p className="text-xs text-muted-foreground">
              Intervalo médio: {lastPurchase ? `${daysBetween(lastPurchase, new Date().toISOString())} dias` : '--'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Status dos pedidos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(statusCounts)
              .filter(([, count]) => count > 0)
              .map(([status, count]) => (
                <div key={status} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <span className="font-medium">{statusLabels[status as OrderStatus]}</span>
                  <Badge className={statusColors[status as OrderStatus]}>{count}</Badge>
                </div>
              ))}
            {orders.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum pedido registrado.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <CardTitle>Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {insights.length > 0 ? (
              insights.map((insight) => <p key={insight}>{insight}</p>)
            ) : (
              <p>Nenhum insight disponível no momento.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pedidos do cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Entrega</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Pago</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead className="text-right">Abrir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                    Nenhum pedido encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => {
                  const balance = Number(order.amount_paid || 0) - Number(order.total || 0);
                  const balanceLabel =
                    balance > 0
                      ? `Saldo a favor: ${formatCurrency(balance)}`
                      : balance < 0
                        ? `Saldo pendente: ${formatCurrency(Math.abs(balance))}`
                        : formatCurrency(0);
                  const balanceClass =
                    balance > 0
                      ? 'text-emerald-600'
                      : balance < 0
                        ? 'text-destructive'
                        : 'text-muted-foreground';

                  return (
                    <TableRow
                      key={order.id}
                      className={order.status === 'entregue' ? 'bg-emerald-50/40' : ''}
                    >
                      <TableCell className="font-medium">#{formatOrderNumber(order.order_number)}</TableCell>
                      <TableCell>
                        <span className={`status-badge ${statusColors[order.status]}`}>
                          {statusLabels[order.status]}
                        </span>
                      </TableCell>
                      <TableCell>{formatDate(order.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDate(deliveryMap[order.id])}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(order.total))}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(order.amount_paid))}</TableCell>
                      <TableCell className={balanceClass}>{balanceLabel}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/pedidos/${order.id}`)}
                        >
                          Abrir
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

