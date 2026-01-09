import { useEffect, useRef, useState } from 'react';
import { formatOrderNumber } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Order } from '@/types/database';
import { updateOrderStatus } from '@/services/orders';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, Clock, Eye, Package, Upload, X } from 'lucide-react';

export default function Production() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [readyDialogOpen, setReadyDialogOpen] = useState(false);
  const [readyOrder, setReadyOrder] = useState<Order | null>(null);
  const [readyFiles, setReadyFiles] = useState<File[]>([]);
  const [readyPreviews, setReadyPreviews] = useState<string[]>([]);
  const [savingReady, setSavingReady] = useState(false);
  const readyFileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    const urls = readyFiles.map((file) => URL.createObjectURL(file));
    setReadyPreviews(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [readyFiles]);

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .in('status', ['pendente', 'produzindo_arte', 'arte_aprovada', 'em_producao'])
      .order('created_at');
    setOrders((data as Order[]) || []);
    setLoading(false);
  };

  const startProduction = async (orderId: string) => {
    try {
      await updateOrderStatus({ orderId, status: 'em_producao', userId: user?.id });
      toast({ title: 'Pedido iniciado na producao!' });
      fetchOrders();
    } catch (error: any) {
      toast({ title: 'Erro ao atualizar pedido', description: error?.message, variant: 'destructive' });
    }
  };

  const markArtApproved = async (orderId: string) => {
    try {
      await updateOrderStatus({ orderId, status: 'arte_aprovada', userId: user?.id });
      toast({ title: 'Arte aprovada com sucesso!' });
      fetchOrders();
    } catch (error: any) {
      toast({ title: 'Erro ao atualizar pedido', description: error?.message, variant: 'destructive' });
    }
  };

  const openReadyDialog = (order: Order) => {
    setReadyOrder(order);
    setReadyFiles([]);
    setReadyDialogOpen(true);
  };

  const closeReadyDialog = () => {
    setReadyDialogOpen(false);
    setReadyOrder(null);
    setReadyFiles([]);
  };

  const handleReadyFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const validFiles: File[] = [];
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) {
        toast({ title: 'Arquivo invalido', description: 'Selecione apenas imagens.', variant: 'destructive' });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: 'Imagem muito grande', description: 'Cada imagem deve ter ate 5MB.', variant: 'destructive' });
        return;
      }
      validFiles.push(file);
    });

    if (validFiles.length > 0) {
      setReadyFiles((prev) => [...prev, ...validFiles]);
    }

    event.target.value = '';
  };

  const removeReadyFile = (index: number) => {
    setReadyFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const uploadFinalPhotos = async (orderId: string, files: File[]) => {
    if (files.length === 0) return [];

    const uploadedPaths: string[] = [];
    const bucket = 'order-final-photos';

    for (const file of files) {
      const extension = file.name.split('.').pop() || 'jpg';
      const token = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const path = `orders/${orderId}/${token}.${extension}`;

      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: true, contentType: file.type });

      if (error) {
        await supabase.storage.from(bucket).remove(uploadedPaths);
        throw error;
      }

      uploadedPaths.push(path);
    }

    const { error: insertError } = await supabase.from('order_final_photos' as any).insert(
      uploadedPaths.map((path) => ({
        order_id: orderId,
        storage_path: path,
        created_by: user?.id || null,
      })),
    );

    if (insertError) {
      await supabase.storage.from(bucket).remove(uploadedPaths);
      throw insertError;
    }

    return uploadedPaths;
  };

  const confirmReady = async () => {
    if (!readyOrder) return;

    setSavingReady(true);
    let uploadedPaths: string[] = [];

    try {
      uploadedPaths = await uploadFinalPhotos(readyOrder.id, readyFiles);
      await updateOrderStatus({ orderId: readyOrder.id, status: 'finalizado', userId: user?.id });
      toast({ title: 'Pedido finalizado!', description: 'Fotos salvas com sucesso.' });
      closeReadyDialog();
      fetchOrders();
    } catch (error: any) {
      if (uploadedPaths.length > 0) {
        await supabase
          .from('order_final_photos' as any)
          .delete()
          .eq('order_id', readyOrder.id)
          .in('storage_path', uploadedPaths);
        await supabase.storage.from('order-final-photos').remove(uploadedPaths);
      }
      toast({ title: 'Erro ao concluir pedido', description: error?.message, variant: 'destructive' });
    } finally {
      setSavingReady(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const pendingOrders = orders.filter((order) => order.status === 'pendente');
  const artOrders = orders.filter((order) => order.status === 'produzindo_arte');
  const artApprovedOrders = orders.filter((order) => order.status === 'arte_aprovada');
  const inProductionOrders = orders.filter((order) => order.status === 'em_producao');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Painel de Produção</h1>
          <p className="text-sm text-slate-500">Pedidos pendentes, arte e producao aguardando avancos</p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1 rounded-full">
          <Clock className="mr-2 h-4 w-4" />
          {orders.length} {orders.length === 1 ? 'pedido' : 'pedidos'}
        </Badge>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : orders.length === 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="mx-auto h-12 w-12 mb-4 opacity-50" />
            Nenhum pedido pendente, arte ou producao
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {pendingOrders.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Pendentes</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {pendingOrders.map((order) => (
                  <Card key={order.id} className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Pedido #{formatOrderNumber(order.order_number)}</CardTitle>
                        <span className="status-badge status-pendente">Pendente</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Cliente:</span>{' '}
                        {order.customer_id ? (
                          <Button
                            variant="link"
                            className="h-auto p-0 text-sm text-primary"
                            onClick={() => navigate(`/clientes/${order.customer_id}/historico`)}
                          >
                            {order.customer_name || 'Cliente'}
                          </Button>
                        ) : (
                          <span className="font-medium">{order.customer_name || 'Não informado'}</span>
                        )}
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Total:</span>{' '}
                        <span className="font-medium">{formatCurrency(Number(order.total))}</span>
                      </div>
                      {order.notes && (
                        <div className="text-sm bg-muted p-2 rounded">
                          <span className="text-muted-foreground">Obs:</span> {order.notes}
                        </div>
                      )}
                      <div className="grid gap-2">
                        <Button variant="outline" className="w-full" onClick={() => navigate(`/pedidos/${order.id}`)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Ver Pedido
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
          {artOrders.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Produzindo Arte</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {artOrders.map((order) => (
                  <Card key={order.id} className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Pedido #{formatOrderNumber(order.order_number)}</CardTitle>
                        <span className="status-badge status-produzindo_arte">Produzindo arte</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Cliente:</span>{' '}
                        {order.customer_id ? (
                          <Button
                            variant="link"
                            className="h-auto p-0 text-sm text-primary"
                            onClick={() => navigate(`/clientes/${order.customer_id}/historico`)}
                          >
                            {order.customer_name || 'Cliente'}
                          </Button>
                        ) : (
                          <span className="font-medium">{order.customer_name || 'Nao informado'}</span>
                        )}
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Total:</span>{' '}
                        <span className="font-medium">{formatCurrency(Number(order.total))}</span>
                      </div>
                      {order.notes && (
                        <div className="text-sm bg-muted p-2 rounded">
                          <span className="text-muted-foreground">Obs:</span> {order.notes}
                        </div>
                      )}
                      <div className="grid gap-2">
                        <Button variant="outline" className="w-full" onClick={() => navigate(`/pedidos/${order.id}`)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Ver Pedido
                        </Button>
                        <Button className="w-full" onClick={() => markArtApproved(order.id)}>
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Arte aprovada
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
          {artApprovedOrders.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Arte Aprovada</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {artApprovedOrders.map((order) => (
                  <Card key={order.id} className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Pedido #{formatOrderNumber(order.order_number)}</CardTitle>
                        <span className="status-badge status-arte_aprovada">Arte aprovada</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Cliente:</span>{' '}
                        {order.customer_id ? (
                          <Button
                            variant="link"
                            className="h-auto p-0 text-sm text-primary"
                            onClick={() => navigate(`/clientes/${order.customer_id}/historico`)}
                          >
                            {order.customer_name || 'Cliente'}
                          </Button>
                        ) : (
                          <span className="font-medium">{order.customer_name || 'Nao informado'}</span>
                        )}
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Total:</span>{' '}
                        <span className="font-medium">{formatCurrency(Number(order.total))}</span>
                      </div>
                      {order.notes && (
                        <div className="text-sm bg-muted p-2 rounded">
                          <span className="text-muted-foreground">Obs:</span> {order.notes}
                        </div>
                      )}
                      <div className="grid gap-2">
                        <Button variant="outline" className="w-full" onClick={() => navigate(`/pedidos/${order.id}`)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Ver Pedido
                        </Button>
                        <Button className="w-full" onClick={() => startProduction(order.id)}>
                          <Clock className="mr-2 h-4 w-4" />
                          Iniciar Producao
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
          {inProductionOrders.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Em Produção</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {inProductionOrders.map((order) => (
                  <Card key={order.id} className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Pedido #{formatOrderNumber(order.order_number)}</CardTitle>
                        <span className="status-badge status-em_producao">Em Produção</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Cliente:</span>{' '}
                        {order.customer_id ? (
                          <Button
                            variant="link"
                            className="h-auto p-0 text-sm text-primary"
                            onClick={() => navigate(`/clientes/${order.customer_id}/historico`)}
                          >
                            {order.customer_name || 'Cliente'}
                          </Button>
                        ) : (
                          <span className="font-medium">{order.customer_name || 'Não informado'}</span>
                        )}
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Total:</span>{' '}
                        <span className="font-medium">{formatCurrency(Number(order.total))}</span>
                      </div>
                      {order.notes && (
                        <div className="text-sm bg-muted p-2 rounded">
                          <span className="text-muted-foreground">Obs:</span> {order.notes}
                        </div>
                      )}
                      <div className="grid gap-2">
                        <Button variant="outline" className="w-full" onClick={() => navigate(`/pedidos/${order.id}`)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Ver Pedido
                        </Button>
                        <Button className="w-full" onClick={() => openReadyDialog(order)}>
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Marcar como Finalizado
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={readyDialogOpen} onOpenChange={(open) => !open && closeReadyDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Finalizar producao</DialogTitle>
            <DialogDescription>
              Confirme o status e anexe fotos do produto final para registrar no pedido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {readyOrder && (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Pedido</p>
                    <p className="font-semibold">#{formatOrderNumber(readyOrder.order_number)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cliente</p>
                    <p className="font-semibold">{readyOrder.customer_name || 'Não informado'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status atual</p>
                    <p className="font-semibold">Em producao</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-semibold">{formatCurrency(Number(readyOrder.total))}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Fotos do produto final (opcional)</Label>
              <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-center space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => readyFileInputRef.current?.click()}
                  disabled={savingReady}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Selecionar fotos
                </Button>
                <p className="text-xs text-muted-foreground">
                  Envie uma ou mais imagens JPG ou PNG (ate 5MB cada).
                </p>
              </div>
              <input
                ref={readyFileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleReadyFiles}
              />
            </div>

            {readyPreviews.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-3">
                {readyPreviews.map((preview, index) => (
                  <div key={`${preview}-${index}`} className="group relative overflow-hidden rounded-lg border">
                    <img
                      src={preview}
                      alt={`Foto ${index + 1}`}
                      className="h-32 w-full object-cover"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => removeReadyFile(index)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeReadyDialog} disabled={savingReady}>
              Cancelar
            </Button>
            <Button onClick={confirmReady} disabled={savingReady}>
              {savingReady ? 'Salvando...' : 'Confirmar e marcar como finalizado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
