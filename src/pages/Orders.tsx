import { useEffect, useState } from 'react';
import { formatOrderNumber } from '@/lib/utils';
import { Plus, Search, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Order, OrderStatus } from '@/types/database';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const statusLabels: Record<OrderStatus, string> = {
  orcamento: 'Orcamento',
  pendente: 'Pendente',
  em_producao: 'Em Producao',
  pronto: 'Pronto',
  aguardando_retirada: 'Aguardando retirada',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

const statusColors: Record<OrderStatus, string> = {
  orcamento: 'bg-blue-100 text-blue-800',
  pendente: 'bg-orange-100 text-orange-800',
  em_producao: 'bg-yellow-100 text-yellow-800',
  pronto: 'bg-green-100 text-green-800',
  aguardando_retirada: 'bg-sky-100 text-sky-800',
  entregue: 'bg-gray-100 text-gray-800',
  cancelado: 'bg-red-100 text-red-800',
};

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setOrders((data as Order[]) || []);
        setLoading(false);
      });
  }, []);

  const filtered = orders.filter((order) => {
    const matchesSearch =
      order.order_number.toString().includes(search) ||
      order.customer_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-BR');

  const getStatusCounts = () => {
    const counts: Record<string, number> = { all: orders.length };
    orders.forEach((order) => {
      counts[order.status] = (counts[order.status] || 0) + 1;
    });
    return counts;
  };

  const counts = getStatusCounts();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Pedidos</h1>
          <p className="text-sm text-slate-500">Gerencie pedidos e acompanhe o status.</p>
        </div>
        <Button className="rounded-2xl bg-sky-500 shadow-sm hover:bg-sky-600" onClick={() => navigate('/pedidos/novo')}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Pedido
        </Button>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">
            Todos <span className="ml-1 text-xs opacity-70">({counts.all || 0})</span>
          </TabsTrigger>
          <TabsTrigger value="orcamento">
            Orcamentos <span className="ml-1 text-xs opacity-70">({counts.orcamento || 0})</span>
          </TabsTrigger>
          <TabsTrigger value="pendente">
            Pendentes <span className="ml-1 text-xs opacity-70">({counts.pendente || 0})</span>
          </TabsTrigger>
          <TabsTrigger value="em_producao">
            Em Producao <span className="ml-1 text-xs opacity-70">({counts.em_producao || 0})</span>
          </TabsTrigger>
          <TabsTrigger value="pronto">
            Prontos <span className="ml-1 text-xs opacity-70">({counts.pronto || 0})</span>
          </TabsTrigger>
          <TabsTrigger value="entregue">
            Entregues <span className="ml-1 text-xs opacity-70">({counts.entregue || 0})</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por numero ou cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-[80px]">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhum pedido encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((order) => (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/pedidos/${order.id}`)}
                  >
                    <TableCell className="font-medium">#{formatOrderNumber(order.order_number)}</TableCell>
                    <TableCell>
                      {order.customer_id ? (
                        <Button
                          variant="link"
                          className="h-auto p-0 text-primary"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/clientes/${order.customer_id}/historico`);
                          }}
                        >
                          {order.customer_name || 'Cliente'}
                        </Button>
                      ) : (
                        <span>{order.customer_name || 'Nao informado'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`status-badge ${statusColors[order.status]}`}>
                        {statusLabels[order.status]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          order.payment_status === 'pago'
                            ? 'bg-green-100 text-green-800'
                            : order.payment_status === 'parcial'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {order.payment_status === 'pago'
                          ? 'Pago'
                          : order.payment_status === 'parcial'
                            ? 'Pagamento parcial'
                            : 'Pendente'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(Number(order.total))}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(order.created_at)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/pedidos/${order.id}`);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
