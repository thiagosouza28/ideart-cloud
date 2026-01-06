import { useEffect, useState, useRef } from 'react';
import { formatOrderNumber } from '@/lib/utils';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Order, OrderFinalPhoto, OrderItem, OrderStatusHistory, OrderStatus, OrderPayment, PaymentMethod, PaymentStatus, Product } from '@/types/database';
import { ArrowLeft, Loader2, CheckCircle, Clock, Package, Truck, XCircle, User, FileText, Printer, MessageCircle, Link, Copy, CreditCard, PauseCircle, Trash2, Image as ImageIcon, Upload } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import OrderReceipt from '@/components/OrderReceipt';
import {
  calculatePaymentSummary,
  cancelOrder,
  deleteOrder,
  cancelOrderPayment,
  createOrderPayment,
  deleteOrderPayment,
  getOrCreatePublicLink,
  updateOrderStatus,
  updateOrderItems,
  uploadOrderFinalPhoto,
  type PaymentSummary,
} from '@/services/orders';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { resolveSuggestedPrice } from '@/lib/pricing';

const statusConfig: Record<OrderStatus, { label: string; icon: React.ComponentType<any>; color: string; next: OrderStatus[] }> = {
  orcamento: {
    label: 'Orçamento',
    icon: FileText,
    color: 'bg-blue-100 text-blue-800',
    next: ['pendente', 'cancelado']
  },
  pendente: {
    label: 'Pendente',
    icon: PauseCircle,
    color: 'bg-orange-100 text-orange-800',
    next: ['em_producao', 'cancelado']
  },
  em_producao: {
    label: 'Em Produção',
    icon: Clock,
    color: 'bg-yellow-100 text-yellow-800',
    next: ['pronto', 'cancelado']
  },
  pronto: {
    label: 'Pronto',
    icon: Package,
    color: 'bg-green-100 text-green-800',
    next: ['aguardando_retirada', 'cancelado']
  },
  aguardando_retirada: {
    label: 'Aguardando retirada',
    icon: CheckCircle,
    color: 'bg-sky-100 text-sky-800',
    next: ['entregue', 'cancelado']
  },
  entregue: {
    label: 'Entregue',
    icon: Truck,
    color: 'bg-gray-100 text-gray-800',
    next: []
  },
  cancelado: {
    label: 'Cancelado',
    icon: XCircle,
    color: 'bg-red-100 text-red-800',
    next: []
  },
};

const statusLabels: Record<OrderStatus, string> = {
  orcamento: 'Orcamento',
  pendente: 'Pendente',
  em_producao: 'Em producao',
  pronto: 'Pronto',
  aguardando_retirada: 'Aguardando retirada',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

export default function OrderDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [history, setHistory] = useState<OrderStatusHistory[]>([]);
  const [finalPhotos, setFinalPhotos] = useState<OrderFinalPhoto[]>([]);
  const [payments, setPayments] = useState<OrderPayment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; created_at: string } | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const paymentReceiptRef = useRef<HTMLDivElement>(null);

  // Status change dialog
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<OrderStatus | ''>('');
  const [statusNotes, setStatusNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryAmount, setEntryAmount] = useState(0);
  const [entryMethod, setEntryMethod] = useState<PaymentMethod | ''>('');
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelConfirmPaid, setCancelConfirmPaid] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pago');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentActionId, setPaymentActionId] = useState<string | null>(null);
  const [paymentActionType, setPaymentActionType] = useState<'cancel' | 'delete' | null>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [receiptPayment, setReceiptPayment] = useState<OrderPayment | null>(null);
  const [receiptSummary, setReceiptSummary] = useState<PaymentSummary | null>(null);

  const [publicLinkToken, setPublicLinkToken] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState<'public' | 'message' | null>(null);
  const [messageText, setMessageText] = useState('');
  const [messageDirty, setMessageDirty] = useState(false);
  const [isEditingItems, setIsEditingItems] = useState(false);
  const [editableItems, setEditableItems] = useState<OrderItem[]>([]);
  const [savingItems, setSavingItems] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [newItemProductId, setNewItemProductId] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState(1);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const getPaymentStatusLabel = (status: PaymentStatus) => {
    if (status === 'pago') return 'Pago';
    if (status === 'parcial') return 'Pagamento parcial';
    return 'Pendente';
  };

  const copyToClipboard = async (text: string) => {
    if (!text) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fallback below
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  };

  const isBudget = order?.status === 'orcamento';

  const calculateItemTotal = (item: Pick<OrderItem, 'quantity' | 'unit_price' | 'discount'>) =>
    Math.max(0, Number(item.quantity) * Number(item.unit_price) - Number(item.discount || 0));

  const calculateSubtotal = (itemsList: OrderItem[]) =>
    itemsList.reduce((sum, item) => sum + Number(item.total || 0), 0);

  const calculateOrderTotal = (subtotalValue: number) =>
    Math.max(0, subtotalValue - Number(order?.discount || 0));

  const ensureProductsLoaded = async () => {
    if (products.length > 0 || !order?.company_id) return;
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .eq('company_id', order.company_id)
      .order('name');
    if (error) {
      toast({ title: 'Erro ao carregar produtos', variant: 'destructive' });
      return;
    }
    setProducts(data as Product[] || []);
  };

  const startEditingItems = async () => {
    if (!isBudget) return;
    await ensureProductsLoaded();
    const mapped = (items || []).map((item) => ({
      ...item,
      total: calculateItemTotal(item),
    }));
    setEditableItems(mapped);
    setNewItemProductId('');
    setNewItemQuantity(1);
    setIsEditingItems(true);
  };

  const cancelEditingItems = () => {
    setEditableItems([]);
    setIsEditingItems(false);
    setNewItemProductId('');
    setNewItemQuantity(1);
  };

  const handleChangeItemProduct = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setEditableItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const quantity = Math.max(1, Number(item.quantity));
        const unitPrice = resolveSuggestedPrice(product, quantity, [], 0);
        const next = {
          ...item,
          product_id: product.id,
          product_name: product.name,
          unit_price: unitPrice,
        };
        return { ...next, total: calculateItemTotal(next) };
      }),
    );
  };

  const handleChangeItemQuantity = (index: number, value: number) => {
    const quantity = Math.max(1, Number(value) || 1);
    setEditableItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const next = { ...item, quantity };
        return { ...next, total: calculateItemTotal(next) };
      }),
    );
  };

  const handleRemoveItem = (index: number) => {
    setEditableItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddItem = () => {
    const product = products.find((p) => p.id === newItemProductId);
    if (!product) {
      toast({ title: 'Selecione um produto', variant: 'destructive' });
      return;
    }
    const quantity = Math.max(1, Number(newItemQuantity) || 1);
    const unitPrice = resolveSuggestedPrice(product, quantity, [], 0);
    const newItem: OrderItem = {
      id: crypto.randomUUID(),
      order_id: order?.id || '',
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit_price: unitPrice,
      discount: 0,
      total: Math.max(0, quantity * unitPrice),
      attributes: null,
      notes: null,
      created_at: new Date().toISOString(),
    };
    setEditableItems((prev) => [...prev, newItem]);
    setNewItemProductId('');
    setNewItemQuantity(1);
  };

  const handleSaveItems = async () => {
    if (!order) return;
    if (editableItems.length === 0) {
      toast({ title: 'Adicione pelo menos um item', variant: 'destructive' });
      return;
    }
    setSavingItems(true);
    try {
      const payload = editableItems.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        discount: Number(item.discount || 0),
        notes: item.notes ?? null,
        attributes: item.attributes ?? null,
      }));
      const updatedOrder = await updateOrderItems({ orderId: order.id, items: payload });
      const refreshedItems = editableItems.map((item) => ({
        ...item,
        total: calculateItemTotal(item),
      }));
      setOrder(updatedOrder);
      setItems(refreshedItems);
      setIsEditingItems(false);
      toast({ title: 'Orçamento atualizado com sucesso!' });
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar alterações',
        description: error?.message,
        variant: 'destructive',
      });
    } finally {
      setSavingItems(false);
    }
  };

  const normalizeWhatsappPhone = (value?: string | null) => {
    const digits = (value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('55') && digits.length >= 12) return digits;
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    return digits.startsWith('55') ? digits : `55${digits}`;
  };

  const sendWhatsAppMessage = (message: string) => {
    const phone = normalizeWhatsappPhone(order?.customer?.phone);
    if (!phone) {
      toast({ title: 'Cliente sem telefone cadastrado', variant: 'destructive' });
      return;
    }

    const text = encodeURIComponent(message);
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  const generateReceiptText = () => {
    if (!order) return '';

    let text = `*RECIBO - Pedido #${formatOrderNumber(order.order_number)}*\n`;
    text += `Data: ${new Date(order.created_at).toLocaleString('pt-BR')}\n\n`;

    if (order.customer?.name || order.customer_name) {
      text += `*Cliente:* ${order.customer?.name || order.customer_name}\n`;
      if (order.customer?.document) text += `CPF/CNPJ: ${order.customer.document}\n`;
      text += '\n';
    }

    text += `*ITENS:*\n`;
    items.forEach(item => {
      text += `- ${item.product_name} x${item.quantity} = ${formatCurrency(Number(item.total))}\n`;
    });
    text += '\n';

    text += `Subtotal: ${formatCurrency(Number(order.subtotal))}\n`;
    if (Number(order.discount) > 0) {
      text += `Desconto: -${formatCurrency(Number(order.discount))}\n`;
    }
    text += `*TOTAL: ${formatCurrency(Number(order.total))}*\n\n`;

    text += `Pagamento: ${order.payment_method || '-'}\n`;
    text += `Status: ${getPaymentStatusLabel(order.payment_status)}\n`;

    if (order.notes) {
      text += `\nObs: ${order.notes}`;
    }

    return text;
  };
  const buildWhatsAppMessage = (link: string) => {
    if (!order) return '';
    const template =
      order.company?.whatsapp_message_template ||
      'Ola {cliente_nome}, seu pedido #{pedido_numero} esta pronto! Acompanhe pelo link: {pedido_link}';
    const catalogLink = order.company?.slug
      ? `${window.location.origin}/catalogo/${order.company.slug}`
      : '';
    const replacements: Record<string, string> = {
      '{cliente_nome}': order.customer?.name || order.customer_name || 'cliente',
      '{cliente_telefone}': order.customer?.phone || order.customer_phone || '',
      '{pedido_numero}': formatOrderNumber(order.order_number),
      '{pedido_id}': order.id,
      '{pedido_status}': statusLabels[order.status] ?? order.status,
      '{pedido_total}': formatCurrency(Number(order.total || 0)),
      '{total}': formatCurrency(Number(order.total || 0)),
      '{pedido_link}': link,
      '{link_catalogo}': catalogLink,
      '{empresa_nome}': order.company?.name || 'Nossa empresa',
    };
    return Object.entries(replacements).reduce((acc, [key, value]) => acc.replaceAll(key, value), template);
  };  const handleWhatsApp = () => {
    handleSendWhatsAppUpdate();
  };

  const printReceipt = (content: HTMLDivElement | null, title: string) => {
    if (!content) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((node) => node.outerHTML)
      .join('\n');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          ${styles}
        </head>
        <body>
          ${content.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };
  };

  const handlePrint = () => {
    printReceipt(receiptRef.current, `Recibo - Pedido #${formatOrderNumber(order?.order_number)}`);
  };

  const handlePrintPaymentReceipt = () => {
    if (!receiptPayment) return;
    printReceipt(
      paymentReceiptRef.current,
      `Recibo de pagamento - Pedido #${formatOrderNumber(order?.order_number)}`,
    );
  };

  useEffect(() => {
    if (id) fetchOrder();
  }, [id]);

  useEffect(() => {
    if (!isBudget && isEditingItems) {
      setIsEditingItems(false);
      setEditableItems([]);
    }
  }, [isBudget, isEditingItems]);

  const fetchOrder = async () => {
    const [orderResult, itemsResult, historyResult, paymentsResult, linkResult, finalPhotosResult] = await Promise.all([
      supabase.from('orders')
        .select('*, customer:customers(*), company:companies(*)')
        .eq('id', id)
        .is('deleted_at', null)
        .single(),
      supabase.from('order_items').select('*').eq('order_id', id).order('created_at'),
      supabase.from('order_status_history').select('*').eq('order_id', id).order('created_at', { ascending: false }),
      supabase.from('order_payments').select('*').eq('order_id', id).order('created_at', { ascending: false }),
      supabase.from('order_public_links').select('token').eq('order_id', id).maybeSingle(),
      (supabase.from('order_final_photos' as any).select('*').eq('order_id', id).order('created_at', { ascending: false })) as any,
    ]) as any[];

    if (orderResult.error || !orderResult.data) {
      toast({ title: 'Pedido não encontrado', variant: 'destructive' });
      navigate('/pedidos');
      return;
    }

    const orderData = orderResult.data as Order;
    if (orderData.company?.logo_url) {
      orderData.company = {
        ...orderData.company,
        logo_url: ensurePublicStorageUrl('product-images', orderData.company.logo_url),
      };
    }
    setOrder(orderData);
    setItems(itemsResult.data as OrderItem[] || []);
    setHistory(historyResult.data as OrderStatusHistory[] || []);
    setFinalPhotos(finalPhotosResult.data as OrderFinalPhoto[] || []);
    setPayments(paymentsResult.data as OrderPayment[] || []);
    setPublicLinkToken(linkResult.data?.token || null);
    setMessageDirty(false);
    setMessageText('');

    if (orderData) {
      const remaining = Math.max(0, Number(orderData.total) - Number(orderData.amount_paid));
      setPaymentAmount(remaining);
    }

    // Fetch user names for history
    const userIds = [
      ...(historyResult.data || []).map((h: any) => h.user_id).filter(Boolean),
      ...(finalPhotosResult.data || []).map((photo: any) => photo.created_by).filter(Boolean),
    ];
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      const profileMap: Record<string, string> = {};
      (profilesData || []).forEach((p: any) => {
        profileMap[p.id] = p.full_name;
      });
      setProfiles(profileMap);
    }

    setLoading(false);
  };


  const formatDate = (d: string) =>
    new Date(d).toLocaleString('pt-BR');

  const handleOpenPhoto = (photo: { url: string; created_at: string }) => {
    setSelectedPhoto(photo);
    setPhotoViewerOpen(true);
  };

  const getPublicLinkUrl = (token: string) => `${window.location.origin}/pedido/${token}`;
  const publicLink = publicLinkToken ? getPublicLinkUrl(publicLinkToken) : '';
  const messageLink = publicLink || '[link]';
  const resolveMessageForSend = (url: string) => {
    if (!messageDirty) return buildWhatsAppMessage(url);
    const catalogLink = order?.company?.slug
      ? `${window.location.origin}/catalogo/${order.company.slug}`
      : '';
    return messageText
      .replaceAll('{pedido_link}', url)
      .replaceAll('{link_catalogo}', catalogLink)
      .replaceAll('[link]', url);
  };

  const clientMessage = messageDirty ? messageText : buildWhatsAppMessage(messageLink);
  const ensurePublicLink = async () => {
    if (!order) return null;
    if (publicLinkToken) return publicLinkToken;
    setLinkLoading(true);
    try {
      const token = await getOrCreatePublicLink(order.id);
      setPublicLinkToken(token);
      return token;
    } catch (error: any) {
      toast({ title: 'Erro ao gerar link', description: error?.message, variant: 'destructive' });
      return null;
    } finally {
      setLinkLoading(false);
    }
  };

  const handleCopyPublicLink = async () => {
    const token = await ensurePublicLink();
    if (!token) return;
    const url = getPublicLinkUrl(token);
    const copied = await copyToClipboard(url);
    if (!copied) {
      toast({ title: 'Falha ao copiar', description: 'Tente novamente.', variant: 'destructive' });
      return;
    }
    setCopiedLink('public');
    setTimeout(() => setCopiedLink(null), 2000);
    toast({ title: 'Copiado com sucesso!' });
  };

  const handleCopyMessage = async () => {
    if (!order) return;
    const token = await ensurePublicLink();
    if (!token) return;
    const url = getPublicLinkUrl(token);
    const message = resolveMessageForSend(url);
    const copied = await copyToClipboard(message);
    if (!copied) {
      toast({ title: 'Falha ao copiar', description: 'Tente novamente.', variant: 'destructive' });
      return;
    }
    setCopiedLink('message');
    setTimeout(() => setCopiedLink(null), 2000);
    toast({ title: 'Copiado com sucesso!' });
  };

  const handleSendWhatsAppUpdate = async () => {
    if (!order) return;
    const token = await ensurePublicLink();
    if (!token) return;
    const url = getPublicLinkUrl(token);
    sendWhatsAppMessage(resolveMessageForSend(url));
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    setCancelLoading(true);
    try {
      await cancelOrder({
        orderId: order.id,
        motivo: cancelReason.trim() || undefined,
        confirmPaid: cancelConfirmPaid,
      });
      toast({ title: 'Pedido cancelado com sucesso!' });
      setCancelDialogOpen(false);
      setCancelReason('');
      setCancelConfirmPaid(false);
      navigate('/pedidos');
    } catch (error: any) {
      toast({ title: 'Erro ao cancelar', description: error?.message, variant: 'destructive' });
    } finally {
      setCancelLoading(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!order) return;
    setDeleteLoading(true);
    try {
      await deleteOrder(order.id);
      toast({ title: 'Orçamento excluído com sucesso!' });
      setDeleteDialogOpen(false);
      navigate('/pedidos');
    } catch (error: any) {
      toast({ title: 'Erro ao excluir', description: error?.message, variant: 'destructive' });
    } finally {
      setDeleteLoading(false);
    }
  };


  const handleOpenPaymentReceipt = (payment: OrderPayment) => {
    if (!order) return;
    const paidTotal = payments
      .filter((item) => item.status !== 'pendente')
      .reduce((sum, item) => sum + Number(item.amount), 0);
    const summary = calculatePaymentSummary(Number(order.total), paidTotal);
    setReceiptPayment(payment);
    setReceiptSummary(summary);
    setReceiptDialogOpen(true);
  };

  const openPaymentDialog = () => {
    if (!order) return;
    const remaining = Math.max(0, Number(order.total) - Number(order.amount_paid));
    if (remaining <= 0) {
      toast({ title: 'Pedido já quitado', description: 'Não há saldo pendente.', variant: 'destructive' });
      return;
    }
    setPaymentAmount(remaining);
    setPaymentMethod(order.payment_method || '');
    setPaymentStatus('pago');
    setPaymentNotes('');
    setPaymentDialogOpen(true);
  };

  const handleCreatePayment = async () => {
    if (!order) return;

    if (!paymentMethod) {
      toast({ title: 'Selecione a forma de pagamento', variant: 'destructive' });
      return;
    }

    if (paymentAmount <= 0) {
      toast({ title: 'Informe um valor valido', variant: 'destructive' });
      return;
    }

    if (paymentAmount > remainingAmount) {
      toast({ title: 'Valor excede o saldo restante', variant: 'destructive' });
      return;
    }

    setPaymentSaving(true);
    try {
      const result = await createOrderPayment({
        orderId: order.id,
        amount: paymentAmount,
        method: paymentMethod as PaymentMethod,
        status: paymentStatus,
        notes: paymentNotes || undefined,
        createdBy: user?.id,
      });

      toast({ title: 'Pagamento registrado com sucesso!' });
      setPaymentDialogOpen(false);
      setReceiptPayment(result.payment);
      setReceiptSummary(result.summary);
      setReceiptDialogOpen(true);
      fetchOrder();
    } catch (error: any) {
      toast({ title: 'Erro ao registrar pagamento', description: error?.message, variant: 'destructive' });
    } finally {
      setPaymentSaving(false);
    }
  };

  const applyStatusChange = async (entrada?: number | null) => {
    if (!newStatus || !order) return;

    if (entrada && entrada > 0 && !entryMethod) {
      toast({ title: 'Selecione a forma de pagamento', variant: 'destructive' });
      return;
    }

    if (newStatus === 'pronto' && finalPhotos.length === 0) {
      toast({
        title: 'Foto obrigat¢ria',
        description: ' necess rio anexar pelo menos uma foto do produto pronto antes de alterar o status para "Pronto".',
        variant: 'destructive',
      });
      setStatusDialogOpen(false);
      return;
    }

    setSaving(true);

    try {
      await updateOrderStatus({
        orderId: order.id,
        status: newStatus,
        notes: statusNotes || undefined,
        userId: user?.id,
        entrada: entrada ?? null,
        paymentMethod: entrada && entryMethod ? entryMethod : undefined,
      });

      toast({ title: 'Status atualizado com sucesso!' });
      setStatusDialogOpen(false);
      setEntryDialogOpen(false);

      if (order.customer?.phone) {
        if (window.confirm(`Status alterado para "${newStatus}". Deseja enviar mensagem no WhatsApp para o cliente?`)) {
          setTimeout(() => handleSendWhatsAppUpdate(), 500);
        }
      }

      setNewStatus('');
      setStatusNotes('');
      setEntryAmount(0);
      fetchOrder();
    } catch (error: any) {
      toast({ title: 'Erro ao atualizar status', description: error?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

    const handleStatusChange = async () => {
    if (!newStatus || !order) return;

    if (order.status === 'orcamento' && newStatus === 'pendente') {
      setEntryMethod(order.payment_method || '');
      setEntryDialogOpen(true);
      return;
    }
    await applyStatusChange();
  };

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!order || !e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    setUploadingPhoto(true);

    try {
      const { uploadOrderFinalPhoto } = await import('@/services/orders');
      const photo = await uploadOrderFinalPhoto(order.id, file, user?.id);

      setFinalPhotos(prev => [photo, ...prev]);
      toast({ title: 'Foto enviada com sucesso!' });
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Erro ao enviar foto', description: error.message, variant: 'destructive' });
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReceiptDialogChange = (open: boolean) => {
    setReceiptDialogOpen(open);
    if (!open) {
      setReceiptPayment(null);
      setReceiptSummary(null);
    }
  };

  const handleCancelPayment = async (paymentId: string) => {
    if (!order) return;
    if (!window.confirm('Cancelar este pagamento?')) return;
    setPaymentActionId(paymentId);
    setPaymentActionType('cancel');
    try {
      await cancelOrderPayment(order.id, paymentId);
      toast({ title: 'Pagamento cancelado' });
      fetchOrder();
    } catch (error: any) {
      toast({ title: 'Erro ao cancelar pagamento', description: error?.message, variant: 'destructive' });
    } finally {
      setPaymentActionId(null);
      setPaymentActionType(null);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!order) return;
    if (!window.confirm('Excluir este pagamento? Esta ação não pode ser desfeita.')) return;
    setPaymentActionId(paymentId);
    setPaymentActionType('delete');
    try {
      await deleteOrderPayment(order.id, paymentId);
      toast({ title: 'Pagamento excluido' });
      fetchOrder();
    } catch (error: any) {
      toast({ title: 'Erro ao excluir pagamento', description: error?.message, variant: 'destructive' });
    } finally {
      setPaymentActionId(null);
      setPaymentActionType(null);
    }
  };

  if (loading) {
    return (
      <div className="page-container flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) return null;

  const orderTotal = Number(order.total);
  const paidTotal = Number(order.amount_paid);
  const remainingAmount = Math.max(0, orderTotal - paidTotal);
  const isOrderPaid = remainingAmount <= 0;

  const config = statusConfig[order.status];
  const StatusIcon = config.icon;
const canSendWhatsApp = Boolean(order?.customer?.phone);
  const publicLinkLabel = linkLoading
    ? 'Gerando...'
    : publicLinkToken
      ? copiedLink === 'public'
        ? 'Copiado'
        : 'Copiar'
      : 'Gerar link';
  const messageLabel = linkLoading
    ? 'Gerando...'
    : copiedLink === 'message'
      ? 'Copiado'
      : 'Copiar';
  const finalPhotosWithUrls = finalPhotos.map((photo) => ({
    ...photo,
    url: ensurePublicStorageUrl('order-final-photos', photo.storage_path),
  }));
  const editingSubtotal = calculateSubtotal(isEditingItems ? editableItems : items);
  const editingTotal = calculateOrderTotal(editingSubtotal);

  return (
    <div className="page-container w-full max-w-none">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/pedidos')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="page-title flex items-center gap-3">
              Pedido #{formatOrderNumber(order.order_number)}
              <span className={`status-badge ${config.color}`}>
                <StatusIcon className="h-4 w-4 mr-1" />
                {config.label}
              </span>
            </h1>
            <p className="text-muted-foreground">Criado em {formatDate(order.created_at)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {order.status !== 'cancelado' && (
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(true)}
            >
              Cancelar
            </Button>
          )}
          {order.status === 'orcamento' && (
            <Button
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              Excluir
            </Button>
          )}
          {config.next.length > 0 && hasPermission(['admin', 'atendente', 'caixa', 'producao']) && (
            <Button onClick={() => setStatusDialogOpen(true)}>
              Alterar Status
            </Button>
          )}
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>
          <Button variant="outline" onClick={handleWhatsApp} disabled={!order?.customer?.phone}>
            <MessageCircle className="mr-2 h-4 w-4" />
            WhatsApp
          </Button>
        </div>
      </div>

      {/* Hidden receipt for printing */}
      <div className="hidden">
        <OrderReceipt ref={receiptRef} order={order} items={items} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Links do Pedido
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Link para o cliente</Label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={publicLink}
                placeholder="Clique em gerar para criar o link"
              />
              <Button
                variant="outline"
                onClick={handleCopyPublicLink}
                disabled={linkLoading}
                className="gap-2"
              >
                <Copy className="h-4 w-4" />
                {publicLinkLabel}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Mensagem para o cliente</Label>
            <div className="flex items-start gap-2">
                <Textarea
                  value={clientMessage}
                  onChange={(event) => {
                    setMessageDirty(true);
                    setMessageText(event.target.value);
                  }}
                  className="min-h-[88px]"
                />
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={handleCopyMessage}
                  disabled={linkLoading}
                  className="gap-2"
                >
                  <Copy className="h-4 w-4" />
                  {messageLabel}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSendWhatsAppUpdate}
                  disabled={!canSendWhatsApp || linkLoading}
                  className="gap-2"
                >
                  <MessageCircle className="h-4 w-4" />
                  Enviar WhatsApp
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Content */}
        <div className="md:col-span-2 space-y-6">
          {/* Customer Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.customer ? (
                <div className="space-y-1">
                  <p className="font-medium">{order.customer.name}</p>
                  {order.customer.document && (
                    <p className="text-sm text-muted-foreground">CPF/CNPJ: {order.customer.document}</p>
                  )}
                  {order.customer.phone && (
                    <p className="text-sm text-muted-foreground">Tel: {order.customer.phone}</p>
                  )}
                  {order.customer.email && (
                    <p className="text-sm text-muted-foreground">E-mail: {order.customer.email}</p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">{order.customer_name || 'Cliente não informado'}</p>
              )}
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Itens do Pedido</CardTitle>
              {isBudget && !isEditingItems && (
                <Button variant="outline" size="sm" onClick={startEditingItems}>
                  Editar or?amento
                </Button>
              )}
              {isBudget && isEditingItems && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={cancelEditingItems} disabled={savingItems}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={handleSaveItems} disabled={savingItems}>
                    {savingItems && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar altera??es
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-center">Qtd</TableHead>
                    <TableHead className="text-right">Pre??o Unit.</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    {isEditingItems && <TableHead className="text-right">A??oes</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(isEditingItems ? editableItems : items).map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {isEditingItems ? (
                          <Select
                            value={item.product_id ?? ""}
                            onValueChange={(value) => handleChangeItemProduct(index, value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o produto" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((product) => (
                                <SelectItem key={product.id} value={product.id}>
                                  {product.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div>
                            <p className="font-medium">{item.product_name}</p>
                            {item.attributes && Object.keys(item.attributes).length > 0 && (
                              <div className="flex gap-1 mt-1">
                                {Object.entries(item.attributes).map(([key, value]) => (
                                  <Badge key={key} variant="outline" className="text-xs">
                                    {value}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {item.notes && (
                              <p className="text-xs text-muted-foreground mt-1">Obs: {item.notes}</p>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {isEditingItems ? (
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => handleChangeItemQuantity(index, Number(e.target.value))}
                            className="w-20 text-center"
                          />
                        ) : (
                          item.quantity
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(item.unit_price))}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(Number(item.total))}</TableCell>
                      {isEditingItems && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveItem(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {isEditingItems && (
                <div className="mt-4 rounded-lg border p-4">
                  <div className="grid gap-3 md:grid-cols-[1fr_120px_auto] items-end">
                    <div className="space-y-2">
                      <Label>Produto</Label>
                      <Select value={newItemProductId} onValueChange={setNewItemProductId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um produto" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Quantidade</Label>
                      <Input
                        type="number"
                        min={1}
                        value={newItemQuantity}
                        onChange={(e) => setNewItemQuantity(Number(e.target.value))}
                      />
                    </div>
                    <Button onClick={handleAddItem} className="mt-6 md:mt-0">
                      Adicionar item
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(editingSubtotal)}</span>
                </div>
                {Number(order.discount) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Desconto</span>
                    <span className="text-destructive">-{formatCurrency(Number(order.discount))}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(editingTotal)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          {finalPhotosWithUrls.some((photo) => photo.url) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Fotos do produto final
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {finalPhotosWithUrls
                    .filter((photo) => photo.url)
                    .map((photo) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() =>
                          handleOpenPhoto({
                            url: photo.url || '',
                            created_at: photo.created_at,
                          })
                        }
                        className="group relative overflow-hidden rounded-lg border bg-muted/10 text-left focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <img
                          src={photo.url || ''}
                          alt={`Foto do pedido ${formatOrderNumber(order.order_number)}`}
                          className="h-40 w-full object-cover"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-xs text-white">
                          <div>{formatDate(photo.created_at)}</div>
                          {photo.created_by && profiles[photo.created_by] && (
                            <div>por {profiles[photo.created_by]}</div>
                          )}
                        </div>
                      </button>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {order.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Observações</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{order.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar - Status Timeline */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Linha do Tempo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border"></div>

                <div className="space-y-6">
                  {history.map((h, index) => {
                    const statusConf = statusConfig[h.status];
                    const Icon = statusConf.icon;
                    return (
                      <div key={h.id} className="relative flex gap-4">
                        <div className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full ${statusConf.color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 pb-4">
                          <p className="font-medium text-sm">{statusConf.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(h.created_at)}
                          </p>
                          {h.user_id && profiles[h.user_id] && (
                            <p className="text-xs text-muted-foreground">
                              por {profiles[h.user_id]}
                            </p>
                          )}
                          {h.notes && (
                            <p className="text-xs mt-1 p-2 bg-muted rounded">
                              {h.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Pagamentos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={order.payment_status === 'pago' ? 'default' : 'outline'}>
                    {getPaymentStatusLabel(order.payment_status)}
                  </Badge>
                </div>
                {order.payment_method && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Forma</span>
                    <span className="capitalize">{order.payment_method}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor pago</span>
                  <span>{formatCurrency(Number(order.amount_paid))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saldo</span>
                  <span>{formatCurrency(remainingAmount)}</span>
                </div>
              </div>

              <Separator />

              {payments.length > 0 ? (
                <div className="space-y-2">
                  {payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{formatCurrency(Number(payment.amount))}</p>
                        <p className="text-xs text-muted-foreground">
                          {(payment.method || '-').toString()} - {formatDate(payment.paid_at || payment.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={payment.status === 'pago' ? 'default' : 'outline'}>
                          {getPaymentStatusLabel(payment.status)}
                        </Badge>
                        {payment.status !== 'pendente' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Abrir recibo"
                            onClick={() => handleOpenPaymentReceipt(payment)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                        {payment.status !== 'pendente' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Cancelar pagamento"
                            onClick={() => handleCancelPayment(payment.id)}
                            disabled={paymentActionId === payment.id && paymentActionType === 'cancel'}
                          >
                            {paymentActionId === payment.id && paymentActionType === 'cancel' ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Excluir pagamento"
                          onClick={() => handleDeletePayment(payment.id)}
                          disabled={paymentActionId === payment.id && paymentActionType === 'delete'}
                        >
                          {paymentActionId === payment.id && paymentActionType === 'delete' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
              )}

              <div className="flex flex-col gap-2">
                {isOrderPaid && (
                  <p className="text-xs text-muted-foreground">
                    Pedido quitado. Não é possível registrar novos pagamentos.
                  </p>
                )}
                <Button variant="outline" onClick={openPaymentDialog} disabled={isOrderPaid}>
                  Registrar Pagamento
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total do pedido</span>
                <span>{formatCurrency(orderTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total pago</span>
                <span>{formatCurrency(paidTotal)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground">Saldo restante</span>
                <span>{formatCurrency(remainingAmount)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Valor pago</Label>
              <CurrencyInput value={paymentAmount} onChange={setPaymentAmount} />
            </div>
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="cartao">Cartao</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as PaymentStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="parcial">Pagamento parcial</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Detalhes do pagamento..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreatePayment}
              disabled={paymentSaving || paymentAmount <= 0 || paymentAmount > remainingAmount}
            >
              {paymentSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Receipt Dialog */}
      <Dialog open={receiptDialogOpen} onOpenChange={handleReceiptDialogChange}>
        <DialogContent aria-describedby={undefined} className="max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Recibo de Pagamento</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            <OrderReceipt
              ref={paymentReceiptRef}
              order={order}
              items={items}
              payment={receiptPayment}
              summary={receiptSummary}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleReceiptDialogChange(false)}>
              Fechar
            </Button>
            <Button onClick={handlePrintPaymentReceipt} disabled={!receiptPayment}>
              Baixar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Change Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Alterar Status do Pedido</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Novo Status</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as OrderStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o novo status" />
                </SelectTrigger>
                <SelectContent>
                  {config.next.map((status) => (
                    <SelectItem key={status} value={status}>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const Icon = statusConfig[status].icon;
                          return <Icon className="h-4 w-4" />;
                        })()}
                        {statusConfig[status].label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                {newStatus === 'cancelado' ? 'Motivo do cancelamento *' : 'Observações (opcional)'}
              </Label>
              <Textarea
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                placeholder={newStatus === 'cancelado' ? 'Informe o motivo...' : 'Adicione uma observação...'}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleStatusChange}
              disabled={saving || !newStatus || (newStatus === 'cancelado' && !statusNotes)}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CheckCircle className="mr-2 h-4 w-4" />
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={entryDialogOpen}
        onOpenChange={(open) => {
          setEntryDialogOpen(open);
          if (!open) {
            setEntryAmount(0);
            setEntryMethod('');
          }
        }}
      >
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar entrada</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Deseja registrar um valor de entrada para este pedido?
            </p>
            <div className="space-y-2">
              <Label>Valor de entrada (opcional)</Label>
              <CurrencyInput value={entryAmount} onChange={setEntryAmount} />
            </div>
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={entryMethod} onValueChange={(v) => setEntryMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="cartao">Cartao</SelectItem>
                  <SelectItem value="pix">Pix</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => applyStatusChange()} disabled={saving}>
              Continuar sem entrada
            </Button>
            <Button onClick={() => applyStatusChange(entryAmount)} disabled={saving || entryAmount <= 0}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Registrar entrada e continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar pedido</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Motivo (opcional)</Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Descreva o motivo do cancelamento..."
                rows={3}
              />
            </div>
            {order.payment_status === 'pago' && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={cancelConfirmPaid}
                  onChange={(e) => setCancelConfirmPaid(e.target.checked)}
                />
                Confirmo o cancelamento de um pedido pago.
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)} disabled={cancelLoading}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelOrder}
              disabled={cancelLoading || (order.payment_status === 'pago' && !cancelConfirmPaid)}
            >
              {cancelLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir orçamento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir este orçamento? Essa ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleteLoading}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={handleDeleteOrder} disabled={deleteLoading}>
              {deleteLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={photoViewerOpen}
        onOpenChange={(open) => {
          setPhotoViewerOpen(open);
          if (!open) setSelectedPhoto(null);
        }}
      >
        <DialogContent className="max-w-5xl w-[95vw] max-h-[95vh] overflow-hidden p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Foto do pedido</DialogTitle>
          </DialogHeader>
          {selectedPhoto && (
            <div className="flex flex-col gap-2">
              <img
                src={selectedPhoto.url}
                alt="Foto do pedido"
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
  );
}



















