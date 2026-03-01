import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CatalogFooter, CatalogHero, CatalogTopNav } from '@/components/catalog/PublicCatalogChrome';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCustomerAuth } from '@/hooks/use-customer-auth';
import { customerSupabase as supabase } from '@/integrations/supabase/customer-client';
import type { Order, OrderItem, OrderStatus, OrderStatusHistory } from '@/types/database';

const statusLabels: Record<OrderStatus, string> = {
  orcamento: 'Orcamento',
  pendente: 'Pendente',
  produzindo_arte: 'Em arte',
  arte_aprovada: 'Arte aprovada',
  em_producao: 'Em producao',
  finalizado: 'Finalizado',
  pronto: 'Pronto',
  aguardando_retirada: 'Aguardando retirada',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

const asCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDateTime = (value: string) => new Date(value).toLocaleString('pt-BR');

export default function PublicCustomerOrderDetails() {
  const { orderId } = useParams<{ orderId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useCustomerAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [history, setHistory] = useState<OrderStatusHistory[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const catalogPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const catalog = params.get('catalog');
    if (!catalog) return '/catalogo';
    if (catalog.startsWith('/catalogo') || catalog.startsWith('/loja/')) return catalog;
    return '/catalogo';
  }, [location.search]);

  const ordersPath = useMemo(
    () => (location.search ? `/minha-conta/pedidos${location.search}` : '/minha-conta/pedidos'),
    [location.search],
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const next = orderId
        ? (location.search ? `/minha-conta/pedidos/${orderId}${location.search}` : `/minha-conta/pedidos/${orderId}`)
        : ordersPath;
      const params = new URLSearchParams();
      params.set('next', next);
      if (catalogPath.startsWith('/catalogo') || catalogPath.startsWith('/loja/')) {
        params.set('catalog', catalogPath);
      }
      navigate(`/minha-conta/login?${params.toString()}`, { replace: true });
    }
  }, [catalogPath, loading, location.search, navigate, orderId, ordersPath, user]);

  useEffect(() => {
    const loadOrder = async () => {
      if (!user?.id || !orderId) return;

      setPageLoading(true);
      setErrorMessage(null);

      const [{ data: orderData, error: orderError }, { data: itemData, error: itemsError }, { data: historyData, error: historyError }] = await Promise.all([
        supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .eq('customer_user_id', user.id)
          .maybeSingle(),
        supabase
          .from('order_items')
          .select('*')
          .eq('order_id', orderId)
          .order('created_at', { ascending: true }),
        supabase
          .from('order_status_history')
          .select('*')
          .eq('order_id', orderId)
          .order('created_at', { ascending: true }),
      ]);

      if (orderError || !orderData) {
        setOrder(null);
        setItems([]);
        setHistory([]);
        setErrorMessage(orderError?.message || 'Pedido nao encontrado.');
        setPageLoading(false);
        return;
      }

      if (itemsError || historyError) {
        setErrorMessage(itemsError?.message || historyError?.message || 'Erro ao carregar detalhes.');
      }

      setOrder(orderData as Order);
      setItems((itemData || []) as OrderItem[]);
      setHistory((historyData || []) as OrderStatusHistory[]);
      setPageLoading(false);
    };

    void loadOrder();
  }, [orderId, user?.id]);

  const totalItems = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [items],
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <CatalogTopNav
        subtitle={user?.email || 'Cliente autenticado'}
        showBack
        onBack={() => navigate(ordersPath)}
        showAccount
        accountHref={ordersPath}
        accountLabel="Meus pedidos"
      />

      <CatalogHero
        badge="Minha conta"
        title="Detalhes do pedido"
        description="Consulte itens, historico e valores do seu pedido."
      />

      <main className="mx-auto w-[min(980px,calc(100%-24px))] py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link to={catalogPath} className="text-sm font-medium text-[#1a3a8f] hover:underline">
            Ir para catalogo
          </Link>
          <Link to={ordersPath} className="text-sm font-medium text-[#1a3a8f] hover:underline">
            Voltar para pedidos
          </Link>
        </div>

        {pageLoading && <p className="text-sm text-slate-500">Carregando pedido...</p>}
        {!pageLoading && errorMessage && (
          <Card className="border-slate-200">
            <CardContent className="p-6">
              <p className="text-sm text-destructive">{errorMessage}</p>
              <Button type="button" className="mt-4 bg-[#1a3a8f] hover:bg-[#16337e]" onClick={() => navigate(ordersPath)}>
                Voltar para meus pedidos
              </Button>
            </CardContent>
          </Card>
        )}

        {!pageLoading && !errorMessage && order && (
          <>
            <Card className="border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Pedido #{order.order_number}</CardTitle>
                <Badge variant="secondary">{statusLabels[order.status] || order.status}</Badge>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                  <p className="text-xs text-slate-500">Data</p>
                  <p className="font-medium">{formatDateTime(order.created_at)}</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                  <p className="text-xs text-slate-500">Valor total</p>
                  <p className="font-semibold">{asCurrency(Number(order.total || 0))}</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                  <p className="text-xs text-slate-500">Pagamento</p>
                  <p className="font-medium">{order.payment_status}</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                  <p className="text-xs text-slate-500">Itens</p>
                  <p className="font-medium">{totalItems}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg">Itens do pedido</CardTitle>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum item encontrado.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Qtd.</TableHead>
                        <TableHead className="text-right">Unitario</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{asCurrency(Number(item.unit_price || 0))}</TableCell>
                          <TableCell className="text-right">{asCurrency(Number(item.total || 0))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg">Historico de status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {history.length === 0 && (
                  <p className="text-sm text-slate-500">Sem historico registrado.</p>
                )}
                {history.map((entry) => (
                  <div key={entry.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{statusLabels[entry.status] || entry.status}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(entry.created_at)}</p>
                    </div>
                    {entry.notes && <p className="mt-1 text-xs text-slate-500">{entry.notes}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </main>

      <CatalogFooter showAccount accountHref={ordersPath} accountLabel="Meus pedidos" />
    </div>
  );
}
