import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CatalogFooter,
  CatalogHero,
  CatalogTopNav,
  type CatalogChromeCompany,
} from '@/components/catalog/PublicCatalogChrome';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useCustomerAuth } from '@/hooks/use-customer-auth';
import { customerSupabase as supabase } from '@/integrations/supabase/customer-client';
import { loadPublicCatalogCompany } from '@/lib/publicCatalogCompany';
import { approveArtByToken, fetchPublicOrder } from '@/services/orders';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { formatOrderNumber } from '@/lib/utils';
import { localizeOrderHistoryNote } from '@/lib/orderHistoryNotes';
import { isPublicCatalogOrder } from '@/lib/orderMetadata';
import type {
  Order,
  OrderItem,
  OrderStatus,
  OrderStatusHistory,
  PublicOrderPayload,
} from '@/types/database';
import { CheckCircle, FileText, Image as ImageIcon } from 'lucide-react';

const statusLabels: Record<OrderStatus, string> = {
  orcamento: 'Orçamento',
  pendente: 'Pendente',
  produzindo_arte: 'Produzindo arte',
  arte_aprovada: 'Arte aprovada',
  em_producao: 'Em produção',
  finalizado: 'Finalizado',
  pronto: 'Finalizado',
  aguardando_retirada: 'Aguardando retirada',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

const asCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDateTime = (value: string) => new Date(value).toLocaleString('pt-BR');

const getPaymentStatusLabel = (status?: string | null) => {
  if (status === 'pago') return 'Pago';
  if (status === 'parcial') return 'Pagamento parcial';
  return 'Pendente';
};

const normalizePublicCatalogStatus = (status: OrderStatus, notes?: string | null): OrderStatus => {
  if (isPublicCatalogOrder(notes) && status === 'orcamento') return 'pendente';
  return status;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export default function PublicCustomerOrderDetails() {
  const { orderId } = useParams<{ orderId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user, loading } = useCustomerAuth();
  const customerUserId = user?.id ?? null;
  const customerEmail = user?.email || 'Cliente autenticado';

  const [catalogCompany, setCatalogCompany] = useState<CatalogChromeCompany | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [history, setHistory] = useState<OrderStatusHistory[]>([]);
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [publicPayload, setPublicPayload] = useState<PublicOrderPayload | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [approvingArt, setApprovingArt] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; created_at: string } | null>(null);

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

  const companyContext = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const company = params.get('company');
    if (company && isUuid(company)) return company;

    const catalog = params.get('catalog');
    if (!catalog) return null;
    const byId = catalog.match(/^\/loja\/([^/?#]+)/i);
    if (byId?.[1]) return byId[1];
    const bySlug = catalog.match(/^\/catalogo\/([^/?#]+)/i);
    return bySlug?.[1] || null;
  }, [location.search]);

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
    let isMounted = true;

    const loadCatalogCompanyData = async () => {
      if (!companyContext) {
        setCatalogCompany(null);
        return;
      }

      const data = await loadPublicCatalogCompany({
        companyId: isUuid(companyContext) ? companyContext : undefined,
        slug: isUuid(companyContext) ? undefined : companyContext,
      });

      if (!isMounted) return;
      setCatalogCompany(data);
    };

    void loadCatalogCompanyData();

    return () => {
      isMounted = false;
    };
  }, [companyContext]);

  const getCustomerOrderPublicToken = useCallback(async (targetOrderId: string) => {
    const { data, error } = await (supabase as any).rpc('get_customer_order_public_token', {
      p_order_id: targetOrderId,
    });

    if (error) {
      throw error;
    }

    return typeof data === 'string' && data.trim() ? data.trim() : null;
  }, []);

  const loadOrderData = useCallback(
    async (silent = false) => {
      if (!customerUserId || !orderId) {
        setPageLoading(false);
        return;
      }

      if (!silent) {
        setPageLoading(true);
        setErrorMessage(null);
      }

      const [
        { data: orderData, error: orderError },
        { data: itemData, error: itemsError },
        { data: historyData, error: historyError },
      ] = await Promise.all([
        supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .eq('customer_user_id', customerUserId)
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
        setPublicToken(null);
        setPublicPayload(null);
        setErrorMessage(orderError?.message || 'Pedido não encontrado.');
        setPageLoading(false);
        return;
      }

      if (itemsError || historyError) {
        setErrorMessage(itemsError?.message || historyError?.message || 'Erro ao carregar detalhes.');
      } else if (!silent) {
        setErrorMessage(null);
      }

      setOrder(orderData as Order);
      setItems(((itemData || []) as OrderItem[]) || []);
      setHistory(((historyData || []) as OrderStatusHistory[]) || []);

      try {
        const token = await getCustomerOrderPublicToken(orderData.id);
        setPublicToken(token);

        if (token) {
          const payload = await fetchPublicOrder(token);
          setPublicPayload(payload);
        } else {
          setPublicPayload(null);
        }
      } catch (publicError) {
        console.error('[customer-order] failed to load public payload', publicError);
        setPublicToken(null);
        setPublicPayload(null);
      } finally {
        setPageLoading(false);
      }
    },
    [customerUserId, getCustomerOrderPublicToken, orderId],
  );

  useEffect(() => {
    void loadOrderData();
  }, [loadOrderData]);

  const handleOpenPhoto = (photo: { url: string; created_at: string }) => {
    setSelectedPhoto(photo);
    setPhotoViewerOpen(true);
  };

  const handleApproveArt = async () => {
    if (!publicToken) return;

    setApprovingArt(true);
    try {
      const payload = await approveArtByToken(publicToken);
      if (payload) {
        setPublicPayload(payload);
      }
      await loadOrderData(true);
      toast({ title: 'Arte aprovada com sucesso!' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível aprovar a arte.';
      toast({
        title: 'Erro ao aprovar arte',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setApprovingArt(false);
    }
  };

  const displayOrder = publicPayload?.order ?? order;
  const displayItems = publicPayload?.items ?? items;
  const displayHistory = publicPayload?.history ?? history;
  const displayPayments = publicPayload?.payments ?? [];

  const totalItems = useMemo(
    () => displayItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [displayItems],
  );

  const orderStatus = displayOrder
    ? normalizePublicCatalogStatus(displayOrder.status, publicPayload?.order.notes || order?.notes)
    : null;

  const artFilesReady = useMemo(
    () =>
      (publicPayload?.art_files || [])
        .map((file) => ({
          ...file,
          url: ensurePublicStorageUrl('order-art-files', file.storage_path),
          isImage: file.file_type ? file.file_type.startsWith('image/') : false,
        }))
        .filter((file) => file.url),
    [publicPayload?.art_files],
  );

  const readyPhotos = useMemo(
    () =>
      (publicPayload?.final_photos || [])
        .map((photo) => ({
          ...photo,
          url: ensurePublicStorageUrl('order-final-photos', photo.storage_path),
        }))
        .filter((photo) => photo.url),
    [publicPayload?.final_photos],
  );

  const showReadyPhotos =
    readyPhotos.length > 0 &&
    orderStatus !== null &&
    ['finalizado', 'pronto', 'aguardando_retirada', 'entregue'].includes(orderStatus);

  const showArtFiles =
    artFilesReady.length > 0 &&
    orderStatus !== null &&
    [
      'produzindo_arte',
      'arte_aprovada',
      'em_producao',
      'finalizado',
      'pronto',
      'aguardando_retirada',
      'entregue',
    ].includes(orderStatus);

  const canApproveArt =
    Boolean(publicToken) &&
    orderStatus === 'produzindo_arte' &&
    artFilesReady.length > 0;

  const displayOrderNumber = displayOrder?.order_number ?? order?.order_number ?? 0;
  const displayCreatedAt = displayOrder?.created_at ?? order?.created_at ?? null;
  const displayTotal = Number(displayOrder?.total ?? order?.total ?? 0);
  const displayAmountPaid = Number(displayOrder?.amount_paid ?? order?.amount_paid ?? 0);
  const displayPaymentStatus = displayOrder?.payment_status ?? order?.payment_status ?? 'pendente';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <CatalogTopNav
        company={catalogCompany}
        subtitle={customerEmail}
        showBack
        onBack={() => navigate(ordersPath)}
        showAccount
        accountHref={ordersPath}
        accountLabel="Meus pedidos"
      />

      <CatalogHero
        company={catalogCompany}
        badge="Minha conta"
        title="Detalhes do pedido"
        description="Consulte itens, histórico, arquivos da arte e andamento da produção."
      />

      <main className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link to={catalogPath} className="text-sm font-medium text-[#1a3a8f] hover:underline">
            Ir para catálogo
          </Link>
          <Link to={ordersPath} className="text-sm font-medium text-[#1a3a8f] hover:underline">
            Voltar para pedidos
          </Link>
        </div>

        {pageLoading && <p className="text-sm text-slate-500">Carregando pedido...</p>}

        {!pageLoading && errorMessage && !order && (
          <Card className="border-slate-200">
            <CardContent className="p-6">
              <p className="text-sm text-destructive">{errorMessage}</p>
              <Button
                type="button"
                className="mt-4 bg-[#1a3a8f] hover:bg-[#16337e]"
                onClick={() => navigate(ordersPath)}
              >
                Voltar para meus pedidos
              </Button>
            </CardContent>
          </Card>
        )}

        {!pageLoading && order && (
          <>
            {errorMessage && (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="p-4">
                  <p className="text-sm text-amber-900">{errorMessage}</p>
                </CardContent>
              </Card>
            )}

            <Card className="border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">
                  Pedido #{formatOrderNumber(displayOrderNumber)}
                </CardTitle>
                <Badge variant="secondary">
                  {orderStatus ? statusLabels[orderStatus] || orderStatus : 'Pedido'}
                </Badge>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                  <p className="text-xs text-slate-500">Data</p>
                  <p className="font-medium">
                    {displayCreatedAt ? formatDateTime(displayCreatedAt) : '-'}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                  <p className="text-xs text-slate-500">Valor total</p>
                  <p className="font-semibold">{asCurrency(displayTotal)}</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                  <p className="text-xs text-slate-500">Pagamento</p>
                  <p className="font-medium">{getPaymentStatusLabel(displayPaymentStatus)}</p>
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
                {displayItems.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum item encontrado.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Qtd.</TableHead>
                        <TableHead className="text-right">Unitário</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">
                            {asCurrency(Number(item.unit_price || 0))}
                          </TableCell>
                          <TableCell className="text-right">
                            {asCurrency(Number(item.total || 0))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {showArtFiles && (
              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ImageIcon className="h-5 w-5" />
                    Arquivos da arte
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {artFilesReady.map((file) =>
                      file.isImage ? (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() =>
                            handleOpenPhoto({
                              url: file.url || '',
                              created_at: file.created_at,
                            })
                          }
                          className="group overflow-hidden rounded-lg border bg-white text-left focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]"
                        >
                          <div className="relative">
                            <img
                              src={file.url || ''}
                              alt={file.file_name || 'Arquivo da arte'}
                              className="h-40 w-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
                          </div>
                          <div className="px-2 py-1 text-xs text-slate-500">
                            {formatDateTime(file.created_at)}
                          </div>
                        </button>
                      ) : (
                        <a
                          key={file.id}
                          href={file.url || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-3 rounded-lg border bg-white p-3 hover:bg-slate-50"
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100">
                            <FileText className="h-5 w-5 text-slate-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {file.file_name || 'Arquivo PDF'}
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatDateTime(file.created_at)}
                            </p>
                          </div>
                        </a>
                      ),
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {canApproveArt && (
              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle className="text-lg">Aprovação da arte</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-slate-500">
                    Revise os arquivos acima e confirme a aprovação para liberar a produção.
                  </p>
                  <Button
                    type="button"
                    onClick={handleApproveArt}
                    disabled={approvingArt}
                    className="w-full bg-[#1a3a8f] hover:bg-[#16337e]"
                  >
                    {approvingArt && <CheckCircle className="mr-2 h-4 w-4 animate-spin" />}
                    Aprovar arte
                  </Button>
                </CardContent>
              </Card>
            )}

            {showReadyPhotos && (
              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ImageIcon className="h-5 w-5" />
                    Fotos do pedido finalizado
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {readyPhotos.map((photo) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() =>
                          handleOpenPhoto({
                            url: photo.url || '',
                            created_at: photo.created_at,
                          })
                        }
                        className="group overflow-hidden rounded-lg border bg-white text-left focus:outline-none focus:ring-2 focus:ring-[#1a3a8f]"
                      >
                        <div className="relative">
                          <img
                            src={photo.url || ''}
                            alt={`Foto do pedido ${formatOrderNumber(displayOrderNumber)}`}
                            className="h-40 w-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
                        </div>
                        <div className="px-2 py-1 text-xs text-slate-500">
                          {formatDateTime(photo.created_at)}
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg">Pagamentos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border border-slate-200 bg-white p-3 text-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Status</span>
                    <Badge variant={displayPaymentStatus === 'pago' ? 'default' : 'outline'}>
                      {getPaymentStatusLabel(displayPaymentStatus)}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Valor pago</span>
                    <span>{asCurrency(displayAmountPaid)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Saldo</span>
                    <span>{asCurrency(Math.max(0, displayTotal - displayAmountPaid))}</span>
                  </div>
                </div>

                {displayPayments.length > 0 ? (
                  <div className="space-y-2">
                    {displayPayments.map((payment) => (
                      <div
                        key={payment.id}
                        className="rounded-md border border-slate-200 bg-white p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">{asCurrency(Number(payment.amount || 0))}</p>
                            <p className="text-xs text-slate-500">
                              {(payment.method || '-').toString()} -{' '}
                              {formatDateTime(payment.paid_at || payment.created_at)}
                            </p>
                          </div>
                          <Badge variant={payment.status === 'pago' ? 'default' : 'outline'}>
                            {getPaymentStatusLabel(payment.status)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Nenhum pagamento registrado.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg">Histórico de status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {displayHistory.length === 0 && (
                  <p className="text-sm text-slate-500">Sem histórico registrado.</p>
                )}
                {displayHistory.map((entry) => (
                  <div key={entry.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        {statusLabels[entry.status] || entry.status}
                      </p>
                      <p className="text-xs text-slate-500">{formatDateTime(entry.created_at)}</p>
                    </div>
                    {entry.notes && (
                      <p className="mt-1 text-xs text-slate-500">
                        {localizeOrderHistoryNote(entry.notes)}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </main>

      <Dialog
        open={photoViewerOpen}
        onOpenChange={(open) => {
          setPhotoViewerOpen(open);
          if (!open) setSelectedPhoto(null);
        }}
      >
        <DialogContent className="max-w-5xl w-[95vw] max-h-[95vh] overflow-hidden p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Arquivo do pedido</DialogTitle>
          </DialogHeader>
          {selectedPhoto && (
            <div className="flex flex-col gap-2">
              <img
                src={selectedPhoto.url}
                alt="Arquivo do pedido"
                className="max-h-[80vh] w-full object-contain rounded-md"
              />
              <div className="px-1 text-xs text-slate-500">
                {formatDateTime(selectedPhoto.created_at)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CatalogFooter
        company={catalogCompany}
        showAccount
        accountHref={ordersPath}
        accountLabel="Meus pedidos"
      />
    </div>
  );
}
