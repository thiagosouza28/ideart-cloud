import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { formatOrderNumber } from '@/lib/utils';
import { useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CatalogFooter, CatalogHero, CatalogTopNav } from '@/components/catalog/PublicCatalogChrome';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { approveArtByToken, approveOrderByToken, fetchPublicOrder } from '@/services/orders';
import type { OrderStatus, PublicOrderPayload } from '@/types/database';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { formatAreaM2, parseM2Attributes } from '@/lib/measurements';
import { CheckCircle, Clock, Package, Truck, XCircle, FileText, Image as ImageIcon } from 'lucide-react';

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

const statusIcons: Record<OrderStatus, ComponentType<{ className?: string }>> = {
  orcamento: FileText,
  pendente: Clock,
  produzindo_arte: ImageIcon,
  arte_aprovada: CheckCircle,
  em_producao: Clock,
  finalizado: Package,
  pronto: Package,
  aguardando_retirada: CheckCircle,
  entregue: Truck,
  cancelado: XCircle,
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

const getPaymentStatusLabel = (status: 'pago' | 'parcial' | 'pendente') => {
  if (status === 'pago') return 'Pago';
  if (status === 'parcial') return 'Pagamento parcial';
  return 'Pendente';
};

export default function PublicOrder() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<PublicOrderPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approvingArt, setApprovingArt] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; created_at: string } | null>(null);
  const lastStatusRef = useRef<OrderStatus | null>(null);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const formatDate = (d: string) => new Date(d).toLocaleString('pt-BR');

  const handleOpenPhoto = (photo: { url: string; created_at: string }) => {
    setSelectedPhoto(photo);
    setPhotoViewerOpen(true);
  };


  const remainingAmount = useMemo(() => {
    if (!payload) return 0;
    return Math.max(0, Number(payload.order.total) - Number(payload.order.amount_paid));
  }, [payload]);

  const loadOrder = useCallback(async (silent = false) => {
    if (!token) return;
    try {
      const data = await fetchPublicOrder(token);
      if (!data) {
        setError('Pedido não encontrado.');
        setLoading(false);
        return;
      }

      if (silent && lastStatusRef.current && data.order.status !== lastStatusRef.current) {
        toast({
          title: 'Status atualizado',
          description: `Novo status: ${statusLabels[data.order.status]}`,
        });
      }

      lastStatusRef.current = data.order.status;
      setPayload(data);
      setError(null);
      if (!silent) setLoading(false);
    } catch (err: unknown) {
      if (!silent) {
        const message = err instanceof Error ? err.message : 'Erro ao carregar pedido.';
        setError(message);
        setLoading(false);
      }
    }
  }, [token, toast]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      void loadOrder(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [loadOrder, token]);

  const handleApprove = async () => {
    if (!token) return;
    setApproving(true);
    try {
      const data = await approveOrderByToken(token);
      if (data) {
        setPayload(data);
        toast({ title: 'Orçamento aprovado com sucesso!' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao aprovar orçamento.';
      toast({ title: 'Erro ao aprovar orçamento', description: message, variant: 'destructive' });
    } finally {
      setApproving(false);
    }
  };

  const handleApproveArt = async () => {
    if (!token) return;
    setApprovingArt(true);
    try {
      const data = await approveArtByToken(token);
      if (data) {
        setPayload(data);
        toast({ title: 'Arte aprovada com sucesso!' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao aprovar arte.';
      toast({ title: 'Erro ao aprovar arte', description: message, variant: 'destructive' });
    } finally {
      setApprovingArt(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <CatalogTopNav subtitle="Acompanhe seu pedido" showContact={false} />
        <CatalogHero
          badge="Pedido online"
          title="Acompanhar pedido"
          description="Visualize status, itens e pagamentos em tempo real."
        />
        <div className="mx-auto flex w-[min(980px,calc(100%-24px))] items-center justify-center py-10">
          <div className="text-sm text-slate-500">Carregando...</div>
        </div>
        <CatalogFooter />
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <CatalogTopNav subtitle="Acompanhe seu pedido" showContact={false} />
        <CatalogHero
          badge="Pedido online"
          title="Acompanhar pedido"
          description="Visualize status, itens e pagamentos em tempo real."
        />
        <div className="mx-auto w-[min(980px,calc(100%-24px))] py-10">
          <Card className="mx-auto w-full max-w-md">
            <CardHeader>
              <CardTitle>Pedido</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{error || 'Pedido não encontrado.'}</p>
            </CardContent>
          </Card>
        </div>
        <CatalogFooter />
      </div>
    );
  }

  const companyLogoUrl = payload.company.logo_url
    ? ensurePublicStorageUrl('product-images', payload.company.logo_url)
    : null;
  const finalPhotosWithUrls = (payload.final_photos || []).map((photo) => ({
    ...photo,
    url: ensurePublicStorageUrl('order-final-photos', photo.storage_path),
  }));
  const artFilesWithUrls = (payload.art_files || []).map((file) => ({
    ...file,
    url: ensurePublicStorageUrl('order-art-files', file.storage_path),
    isImage: file.file_type ? file.file_type.startsWith('image/') : false,
  }));
  const artFilesReady = artFilesWithUrls.filter((file) => file.url);
  const readyPhotos = finalPhotosWithUrls.filter((photo) => photo.url);
  const showReadyPhotos =
    readyPhotos.length > 0 && (
      payload.order.status === 'finalizado' ||
      payload.order.status === 'pronto' ||
      payload.order.status === 'aguardando_retirada' ||
      payload.order.status === 'entregue'
    );
  const showArtFiles =
    artFilesReady.length > 0 &&
    [
      'produzindo_arte',
      'arte_aprovada',
      'em_producao',
      'finalizado',
      'pronto',
      'aguardando_retirada',
      'entregue',
    ].includes(payload.order.status);
  const canApproveArt =
    payload.order.status === 'produzindo_arte' && artFilesReady.length > 0;
  const StatusIcon = statusIcons[payload.order.status];
  const companyInfo = {
    name: payload.company.name,
    city: payload.company.city,
    state: payload.company.state,
    phone: payload.company.phone,
    email: payload.company.email,
    address: payload.company.address,
    whatsapp: payload.company.whatsapp,
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <CatalogTopNav
        company={companyInfo}
        subtitle="Acompanhamento de pedido"
        showContact
      />
      <CatalogHero
        badge="Pedido online"
        title={`Pedido #${formatOrderNumber(payload.order.order_number)}`}
        description="Acompanhe status, pagamento e detalhes do seu pedido."
      />

      <div className="page-container mx-auto max-w-5xl py-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            {companyLogoUrl && (
              <img
                src={companyLogoUrl}
                alt={payload.company.name || 'Empresa'}
                className="h-10 w-10 rounded-md object-cover"
              />
            )}
            <h1 className="page-title">Pedido #{formatOrderNumber(payload.order.order_number)}</h1>
            <span className={`status-badge ${statusColors[payload.order.status]}`}>
              {StatusIcon && <StatusIcon className="h-4 w-4 mr-1" />}
              {statusLabels[payload.order.status]}
            </span>
          </div>
          <p className="text-muted-foreground">Criado em {formatDate(payload.order.created_at)}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Cliente</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <p className="font-medium">{payload.customer.name || 'Cliente não informado'}</p>
                  {payload.customer.document && (
                    <p className="text-sm text-muted-foreground">Documento: {payload.customer.document}</p>
                  )}
                  {payload.customer.phone && (
                    <p className="text-sm text-muted-foreground">Tel: {payload.customer.phone}</p>
                  )}
                  {payload.customer.email && (
                    <p className="text-sm text-muted-foreground">E-mail: {payload.customer.email}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Itens do Pedido</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-center">Qtd</TableHead>
                      <TableHead className="text-right">Preço Unit.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payload.items.map((item) => {
                      const m2 = parseM2Attributes(item.attributes);
                      const hasDimensions =
                        typeof m2.widthCm === 'number' &&
                        typeof m2.heightCm === 'number' &&
                        m2.widthCm > 0 &&
                        m2.heightCm > 0;
                      const quantityLabel = hasDimensions
                        ? `${formatAreaM2(Number(item.quantity))} m\u00B2`
                        : item.quantity;

                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <p className="font-medium">{item.product_name}</p>
                            {hasDimensions && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {m2.widthCm}cm x {m2.heightCm}cm - Area: {formatAreaM2(Number(item.quantity))} m\u00B2
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{quantityLabel}</TableCell>
                          <TableCell className="text-right">{formatCurrency(Number(item.unit_price))}{hasDimensions ? ' / m\u00B2' : ''}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(Number(item.total))}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <div className="mt-4 pt-4 border-t space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(Number(payload.order.subtotal))}</span>
                  </div>
                  {Number(payload.order.discount) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Desconto</span>
                      <span className="text-destructive">-{formatCurrency(Number(payload.order.discount))}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="text-primary">{formatCurrency(Number(payload.order.total))}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {showArtFiles && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
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
                          className="group overflow-hidden rounded-lg border bg-muted/10 text-left focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <div className="relative">
                            <img
                              src={file.url || ''}
                              alt={file.file_name || 'Arquivo da arte'}
                              className="h-40 w-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
                          </div>
                          <div className="px-2 py-1 text-xs text-muted-foreground">
                            {formatDate(file.created_at)}
                          </div>
                        </button>
                      ) : (
                        <a
                          key={file.id}
                          href={file.url || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted/50"
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{file.file_name || 'Arquivo PDF'}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(file.created_at)}</p>
                          </div>
                        </a>
                      ),
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {canApproveArt && (
              <Card>
                <CardHeader>
                  <CardTitle>Aprovação da Arte</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Revise os arquivos acima e confirme se a arte esta aprovada.
                  </p>
                  <Button onClick={handleApproveArt} disabled={approvingArt} className="w-full">
                    {approvingArt && <CheckCircle className="mr-2 h-4 w-4 animate-spin" />}
                    Aprovar Arte
                  </Button>
                </CardContent>
              </Card>
            )}

            {showReadyPhotos && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
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
                        className="group overflow-hidden rounded-lg border bg-muted/10 text-left focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <div className="relative">
                          <img
                            src={photo.url || ''}
                            alt={`Foto do pedido ${formatOrderNumber(payload.order.order_number)}`}
                            className="h-40 w-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
                        </div>
                        <div className="px-2 py-1 text-xs text-muted-foreground">
                          {formatDate(photo.created_at)}
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Pagamentos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={payload.order.payment_status === 'pago' ? 'default' : 'outline'}>
                    {getPaymentStatusLabel(payload.order.payment_status)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Valor pago</span>
                  <span>{formatCurrency(Number(payload.order.amount_paid))}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Saldo</span>
                  <span>{formatCurrency(remainingAmount)}</span>
                </div>
                <Separator />
                {payload.payments.length > 0 ? (
                  <div className="space-y-2">
                    {payload.payments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between text-sm">
                        <div>
                          <p className="font-medium">{formatCurrency(Number(payment.amount))}</p>
                          <p className="text-xs text-muted-foreground">
                            {(payment.method || '-').toString()} - {formatDate(payment.paid_at || payment.created_at)}
                          </p>
                        </div>
                        <Badge variant={payment.status === 'pago' ? 'default' : 'outline'}>
                          {getPaymentStatusLabel(payment.status)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
                )}
              </CardContent>
            </Card>

            {(payload.order.status === 'orcamento' ||
              (payload.order.status === 'pendente' && !payload.order.approved_at)) && (
              <Card>
                <CardHeader>
                  <CardTitle>Aprovação do Orçamento</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Revise os detalhes e aprove o orçamento para iniciar a produção.
                  </p>
                  <Button onClick={handleApprove} disabled={approving} className="w-full">
                    {approving && <CheckCircle className="mr-2 h-4 w-4 animate-spin" />}
                    Aprovar Orçamento
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Empresa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="font-medium">{payload.company.name || 'Empresa'}</p>
                {payload.company.address && (
                  <p className="text-sm text-muted-foreground">{payload.company.address}</p>
                )}
                {(payload.company.city || payload.company.state) && (
                  <p className="text-sm text-muted-foreground">
                    {[payload.company.city, payload.company.state].filter(Boolean).join(' - ')}
                  </p>
                )}
                {payload.company.phone && (
                  <p className="text-sm text-muted-foreground">Tel: {payload.company.phone}</p>
                )}
                {payload.company.whatsapp && (
                  <p className="text-sm text-muted-foreground">WhatsApp: {payload.company.whatsapp}</p>
                )}
                {payload.company.email && (
                  <p className="text-sm text-muted-foreground">E-mail: {payload.company.email}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Linha do Tempo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border"></div>
                  <div className="space-y-6">
                    {payload.history.map((h) => {
                      const Icon = statusIcons[h.status as OrderStatus];
                      return (
                        <div key={h.id} className="relative flex gap-4">
                          <div className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full ${statusColors[h.status as OrderStatus]}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 pb-4">
                            <p className="font-medium text-sm">{statusLabels[h.status as OrderStatus]}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(h.created_at)}</p>
                            {h.notes && (
                              <p className="text-xs mt-1 p-2 bg-muted rounded">{h.notes}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

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
                <div className="px-1 text-xs text-muted-foreground">
                  {formatDate(selectedPhoto.created_at)}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <CatalogFooter company={companyInfo} />
    </div>
  );
}





