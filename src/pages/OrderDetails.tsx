import { useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { formatOrderNumber } from '@/lib/utils';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { ProductAttributeGroup } from './OrderForm';
import { Order, OrderFinalPhoto, OrderArtFile, OrderItem, OrderStatusHistory, OrderStatus, OrderPayment, PaymentMethod, PaymentStatus, Product, Customer, PriceTier } from '@/types/database';
import { ArrowLeft, Loader2, CheckCircle, Clock, Package, Truck, XCircle, User, FileText, Printer, MessageCircle, Link, Copy, CreditCard, PauseCircle, Trash2, Image as ImageIcon, Upload, Paintbrush, Sparkles, Wallet, FileDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import OrderReceipt from '@/components/OrderReceipt';
import PaymentReceipt from '@/components/PaymentReceipt';
import DeliveryReceipt, { type DeliveryReceiptPaymentInfo } from '@/components/DeliveryReceipt';
import CustomerSearch from '@/components/CustomerSearch';
import { M2_ATTRIBUTE_KEYS, buildM2Attributes, calculateAreaM2, formatAreaM2, isAreaUnit, parseM2Attributes, parseMeasurementInput, stripM2Attributes } from '@/lib/measurements';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  applyCustomerCreditToOrder,
  cancelOrder,
  cancelOrderPaymentWithCredit as cancelOrderPayment,
  createOrderPaymentWithCredit as createOrderPayment,
  deleteOrder,
  deleteOrderPaymentWithCredit as deleteOrderPayment,
  fetchMergeableCustomerOrders,
  getOrCreatePublicLink,
  markOrderItemsDelivered,
  mergeCustomerOrders,
  markOrderItemsReady,
  updateOrderItemStatus,
  updateOrderStatus,
  updateOrderItems,
  uploadOrderFinalPhoto,
  type MergeableOrderCandidate,
} from '@/services/orders';
import { ensurePublicStorageUrl } from '@/lib/storage';
import {
  getOrderCashPaidAmount,
  getOrderCustomerCreditUsedAmount,
  getOrderGeneratedCreditAmount,
  getOrderRemainingAmount,
  getOrderSettledAmount,
  isCustomerCreditPayment,
} from '@/lib/orderPayments';
import {
  getInitialTierQuantity,
  getProductPriceTiers,
  getPriceTierValidationMessage,
  isQuantityAllowedByPriceTiers,
  resolveProductPrice,
} from '@/lib/pricing';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { localizeOrderHistoryNote } from '@/lib/orderHistoryNotes';
import { extractOrderIdFromParam } from '@/lib/orderRouting';
import { fetchCompanyPaymentMethods } from '@/services/companyPaymentMethods';
import {
  isPendingCustomerInfoOrder,
  isPublicCatalogPersonalizedOrder,
  stripPendingCustomerInfoNotes,
} from '@/lib/orderMetadata';
import { extractVisibleOrderNotes, mergeOrderNotes } from '@/lib/orderNotes';
import { buildSuggestedOrderFileName, sanitizeDisplayFileName } from '@/lib/orderFiles';
import {
  defaultCompanyPaymentMethods,
  getActiveCompanyPaymentMethods,
  getPaymentMethodDisplayName,
  getSelectableCompanyPaymentMethods,
  type CompanyPaymentMethodConfig,
} from '@/lib/paymentMethods';
import {
  buildOrderStatusCustomization,
  getOrderStatusBadgeStyle,
  getOrderStatusLabel,
} from '@/lib/orderStatusConfig';
import {
  calculateBaseAmount,
  calculateDiscountAmount,
  calculateDiscountValueFromAmount,
  calculateLineTotal,
  normalizeDiscountType,
  normalizeDiscountValue,
  roundCurrency,
  resolveDiscountState,
  type DiscountType,
} from '@/lib/orderDiscounts';

const PDF_MARGIN = 20;
const PDF_SINGLE_PAGE_TOLERANCE = 1.08;
const PRINT_PAGE_MARGIN_MM = 8;
const A4_WIDTH_MM = 210;
const RECEIPT_RENDER_WIDTH = Math.round(((A4_WIDTH_MM - PRINT_PAGE_MARGIN_MM * 2) / 25.4) * 96);

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
    next: ['produzindo_arte', 'em_producao', 'cancelado']
  },
  produzindo_arte: {
    label: 'Produzindo arte',
    icon: Paintbrush,
    color: 'bg-indigo-100 text-indigo-800',
    next: ['arte_aprovada', 'cancelado']
  },
  arte_aprovada: {
    label: 'Arte aprovada',
    icon: Sparkles,
    color: 'bg-emerald-100 text-emerald-800',
    next: ['em_producao', 'cancelado']
  },
  em_producao: {
    label: 'Em Produção',
    icon: Clock,
    color: 'bg-yellow-100 text-yellow-800',
    next: ['finalizado', 'cancelado']
  },
  finalizado: {
    label: 'Finalizado',
    icon: Package,
    color: 'bg-green-100 text-green-800',
    next: ['aguardando_retirada', 'cancelado']
  },
  pronto: {
    label: 'Finalizado',
    icon: Package,
    color: 'bg-green-100 text-green-800',
    next: ['aguardando_retirada', 'cancelado']
  },
  aguardando_retirada: {
    label: 'Aguardando retirada',
    icon: CheckCircle,
    color: 'bg-sky-100 text-sky-800',
    next: ['cancelado']
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
    next: ['pendente']
  },
};

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

const defaultStatusCustomerMessages: Record<OrderStatus, string> = {
  orcamento: 'Seu pedido está em orçamento.',
  pendente: 'Recebemos seu pedido e ele está pendente.',
  produzindo_arte: 'Sua arte está sendo produzida.',
  arte_aprovada: 'Sua arte foi aprovada e seguirá para produção.',
  em_producao: 'Seu pedido está em produção.',
  finalizado: 'Seu pedido foi finalizado.',
  pronto: 'Seu pedido foi finalizado.',
  aguardando_retirada: 'Seu pedido está pronto e aguardando retirada.',
  entregue: 'Seu pedido foi entregue.',
  cancelado: 'Seu pedido foi cancelado.',
};

const resolveOrderStatusMessageTemplates = (
  value: unknown,
): Partial<Record<OrderStatus, string>> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const resolved: Partial<Record<OrderStatus, string>> = {};

  (Object.keys(defaultStatusCustomerMessages) as OrderStatus[]).forEach((status) => {
    const candidate = source[status];
    if (typeof candidate === 'string' && candidate.trim()) {
      resolved[status] = candidate.trim();
    }
  });

  return resolved;
};

type EditableOrderItem = OrderItem & {
  discount_type: DiscountType;
  discount_value: number;
  price_mode: 'catalog' | 'manual';
};

export default function OrderDetails() {
  const { id: routeParam } = useParams<{ id: string }>();
  const orderId = useMemo(() => extractOrderIdFromParam(routeParam), [routeParam]);
  const navigate = useNavigate();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { user, hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [history, setHistory] = useState<OrderStatusHistory[]>([]);
  const [finalPhotos, setFinalPhotos] = useState<OrderFinalPhoto[]>([]);
  const [artFiles, setArtFiles] = useState<OrderArtFile[]>([]);
  const [payments, setPayments] = useState<OrderPayment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; created_at: string } | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const paymentReceiptRef = useRef<HTMLDivElement>(null);
  const autoLinkRequestOrderIdRef = useRef<string | null>(null);

  // Status change dialog
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<OrderStatus | ''>('');
  const [statusItemId, setStatusItemId] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [readyDialogOpen, setReadyDialogOpen] = useState(false);
  const [readySaving, setReadySaving] = useState(false);
  const [readyItemIds, setReadyItemIds] = useState<string[]>([]);
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [deliverySaving, setDeliverySaving] = useState(false);
  const [deliveryReceiptOrder, setDeliveryReceiptOrder] = useState<Order | null>(null);
  const [deliveryReceiptPayment, setDeliveryReceiptPayment] = useState<DeliveryReceiptPaymentInfo | null>(null);
  const [deliveryReceiptItems, setDeliveryReceiptItems] = useState<OrderItem[]>([]);
  const [deliveryReceiptItemIds, setDeliveryReceiptItemIds] = useState<string[]>([]);
  const [deliveryReceiptDeliveredAt, setDeliveryReceiptDeliveredAt] = useState<string | null>(null);
  const [deliveryItemIds, setDeliveryItemIds] = useState<string[]>([]);
  const [deliveryPaymentAmount, setDeliveryPaymentAmount] = useState(0);
  const [deliveryPaymentMethod, setDeliveryPaymentMethod] = useState<PaymentMethod | ''>('');
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
  const [paymentAmountTouched, setPaymentAmountTouched] = useState(false);
  const [paymentDiscountType, setPaymentDiscountType] = useState<DiscountType>('fixed');
  const [paymentDiscountValue, setPaymentDiscountValue] = useState(0);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pago');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState(0);
  const [creditNotes, setCreditNotes] = useState('');
  const [creditSaving, setCreditSaving] = useState(false);
  const [customerAvailableCredit, setCustomerAvailableCredit] = useState(0);
  const [paymentActionId, setPaymentActionId] = useState<string | null>(null);
  const [paymentActionType, setPaymentActionType] = useState<'cancel' | 'delete' | 'download' | null>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [receiptPayment, setReceiptPayment] = useState<OrderPayment | null>(null);
  const [paymentReceiptLoading, setPaymentReceiptLoading] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeOrdersLoading, setMergeOrdersLoading] = useState(false);
  const [mergeOrdersSaving, setMergeOrdersSaving] = useState(false);
  const [mergeCandidates, setMergeCandidates] = useState<MergeableOrderCandidate[]>([]);
  const [selectedMergeOrderIds, setSelectedMergeOrderIds] = useState<string[]>([]);

  const [publicLinkToken, setPublicLinkToken] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState<'public' | 'message' | 'art-file' | null>(null);
  const [messageText, setMessageText] = useState('');
  const [messageDirty, setMessageDirty] = useState(false);
  const [isEditingItems, setIsEditingItems] = useState(false);
  const [editableItems, setEditableItems] = useState<EditableOrderItem[]>([]);
  const [orderDiscountType, setOrderDiscountType] = useState<DiscountType>('fixed');
  const [orderDiscountValue, setOrderDiscountValue] = useState(0);
  const [savingItems, setSavingItems] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productAttributeMap, setProductAttributeMap] = useState<Record<string, ProductAttributeGroup[]>>({});
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [newItemProductId, setNewItemProductId] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [newItemWidthCm, setNewItemWidthCm] = useState('');
  const [newItemHeightCm, setNewItemHeightCm] = useState('');
  const [newItemAttributes, setNewItemAttributes] = useState<Record<string, string>>({});
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerDraft, setCustomerDraft] = useState<Customer | null>(null);
  const [customerNameDraft, setCustomerNameDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [showNotesOnPdf, setShowNotesOnPdf] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);
  const [companyPaymentMethods, setCompanyPaymentMethods] = useState<CompanyPaymentMethodConfig[]>(
    getActiveCompanyPaymentMethods(defaultCompanyPaymentMethods),
  );
  const [artUploadDialogOpen, setArtUploadDialogOpen] = useState(false);
  const [pendingArtUploads, setPendingArtUploads] = useState<
    Array<{ id: string; file: File; displayName: string }>
  >([]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const resolvePaidAtIso = (value: string) => {
    const raw = value.trim();
    if (!raw) return new Date().toISOString();
    const parsed = new Date(`${raw}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  };

  useEffect(() => {
    let active = true;

    const loadPaymentMethods = async () => {
      try {
        const result = await fetchCompanyPaymentMethods({ activeOnly: true });
        if (!active) return;
        setCompanyPaymentMethods(
          result.length > 0 ? result : getActiveCompanyPaymentMethods(defaultCompanyPaymentMethods),
        );
      } catch (error) {
        console.error(error);
        if (!active) return;
        setCompanyPaymentMethods(getActiveCompanyPaymentMethods(defaultCompanyPaymentMethods));
      }
    };

    void loadPaymentMethods();

    return () => {
      active = false;
    };
  }, []);

  const companyStatusMessages = useMemo(
    () => resolveOrderStatusMessageTemplates(order?.company?.order_status_message_templates),
    [order?.company?.order_status_message_templates],
  );
  const orderStatusCustomization = useMemo(
    () => buildOrderStatusCustomization(order?.company?.order_status_customization),
    [order?.company?.order_status_customization],
  );

  const getStatusCustomerMessage = (status: OrderStatus) =>
    companyStatusMessages[status] ||
    (status === 'pronto' ? companyStatusMessages.finalizado : undefined) ||
    defaultStatusCustomerMessages[status] ||
    `O status do seu pedido agora é ${statusLabels[status] ?? status}.`;

  const getWhatsAppTemplateReplacements = (link: string): Record<string, string> => {
    if (!order) return {};
    const catalogLink = order.company?.slug
      ? `${window.location.origin}/catalogo/${order.company.slug}`
      : '';
    return {
      '{cliente_nome}': order.customer?.name || order.customer_name || 'cliente',
      '{cliente_telefone}': order.customer?.phone || (order as any).customer_phone || '',
      '{pedido_numero}': formatOrderNumber(order.order_number),
      '{pedido_id}': order.id,
      '{pedido_status}': statusLabels[order.status] ?? order.status,
      '{mensagem_status}': getStatusCustomerMessage(order.status),
      '{pedido_total}': formatCurrency(Number(order.total || 0)),
      '{total}': formatCurrency(Number(order.total || 0)),
      '{pedido_link}': link,
      '{link_catalogo}': catalogLink,
      '{empresa_nome}': order.company?.name || 'Nossa empresa',
    };
  };

  const applyTemplateReplacements = (template: string, replacements: Record<string, string>) =>
    Object.entries(replacements).reduce((acc, [key, value]) => acc.split(key).join(value), template);

  const getProductById = (productId?: string | null) =>
    products.find((product) => product.id === productId);

  const getProductAttributeGroups = (productId: string) => productAttributeMap[productId] || [];

  const ensureSelectedAttributes = (
    productId: string,
    attributes: Record<string, string> = {},
  ): Record<string, string> => {
    const nextAttributes = { ...attributes };
    const productGroups = getProductAttributeGroups(productId);

    productGroups.forEach((group) => {
      const selectedValue = String(nextAttributes[group.attributeName] || '').trim();
      const hasValidSelection = group.options.some((option) => option.value === selectedValue);
      if (!hasValidSelection && group.options[0]?.value) {
        nextAttributes[group.attributeName] = group.options[0].value;
      }
    });

    return nextAttributes;
  };

  const getAttributePriceModifier = (
    productId: string,
    attributes: Record<string, string> = {},
  ): number =>
    getProductAttributeGroups(productId).reduce((sum, group) => {
      const selectedValue = String(attributes[group.attributeName] || '').trim();
      const selectedOption = group.options.find((option) => option.value === selectedValue);
      return sum + Number(selectedOption?.priceModifier || 0);
    }, 0);

  const calculateUnitPriceWithAttributes = (
    product: Product,
    quantity: number,
    attributes: Record<string, string> = {},
  ) => {
    const basePrice = getProductPriceForQuantity(product, quantity);
    const attributeModifier = getAttributePriceModifier(product.id, attributes);
    return Math.max(0, basePrice + attributeModifier);
  };

  const getProductPriceForQuantity = (product: Product, quantity: number) =>
    resolveProductPrice(product, quantity, priceTiers, 0);

  const validateTierQuantity = (product: Product, quantity: number) => {
    if (isAreaUnit(product.unit)) return true;
    if (isQuantityAllowedByPriceTiers(product.id, quantity, priceTiers)) return true;

    toast({
      title: 'Quantidade fora da faixa permitida',
      description: getPriceTierValidationMessage(product.id, priceTiers) || undefined,
      variant: 'destructive',
    });
    return false;
  };

  const getTierRangeLabel = (productId?: string | null) => {
    if (!productId) return null;
    const tiers = getProductPriceTiers(productId, priceTiers);
    if (tiers.length === 0) return null;

    return tiers
      .map((tier) => {
        const isInfinite = tier.max_quantity === null || Number(tier.max_quantity) === 0;
        return isInfinite
          ? `${tier.min_quantity}+`
          : `${tier.min_quantity} a ${tier.max_quantity}`;
      })
      .join(', ');
  };

  const inferPriceMode = (
    productId: string | null | undefined,
    quantity: number,
    unitPrice: number,
  ): 'catalog' | 'manual' => {
    const product = getProductById(productId);
    if (!product) return 'manual';
    const suggestedPrice = getProductPriceForQuantity(product, quantity > 0 ? quantity : 1);
    return Math.abs(Number(unitPrice || 0) - suggestedPrice) > 0.009 ? 'manual' : 'catalog';
  };

  const buildEditableItem = (item: OrderItem): EditableOrderItem => {
    const discountState = getItemDiscountState(item);
    return {
      ...item,
      discount_type: discountState.discountType,
      discount_value: discountState.discountValue,
      discount: discountState.discountAmount,
      total: calculateItemTotal({
        ...item,
        discount_type: discountState.discountType,
        discount_value: discountState.discountValue,
      }),
      price_mode: inferPriceMode(item.product_id, Number(item.quantity || 0), Number(item.unit_price || 0)),
    };
  };

  const getSavedOrderDiscountState = () =>
    resolveDiscountState({
      baseAmount: calculateSubtotal(items),
      discountAmount: Number(order?.discount || 0),
      discountType: normalizeDiscountType(order?.discount_type),
      discountValue: order?.discount_value ?? undefined,
    });

  const getItemUnit = (item: OrderItem) => getProductById(item.product_id)?.unit;

  const getItemM2Data = (item: OrderItem) => parseM2Attributes(item.attributes);

  const isItemM2 = (item: OrderItem) => {
    const unit = getItemUnit(item);
    if (isAreaUnit(unit)) return true;
    const m2 = getItemM2Data(item);
    return Boolean(m2.widthCm || m2.heightCm || m2.areaM2);
  };

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

  const isBudget = order?.status === 'orcamento' || order?.status === 'pendente';
  const notesSourceForDisplay = useMemo(
    () =>
      order?.status === 'pendente'
        ? order?.notes
        : stripPendingCustomerInfoNotes(order?.notes),
    [order?.notes, order?.status],
  );
  const orderVisibleNotes = useMemo(
    () => extractVisibleOrderNotes(notesSourceForDisplay),
    [notesSourceForDisplay],
  );

  const getItemDiscountState = (
    item: Pick<OrderItem, 'quantity' | 'unit_price' | 'discount'> &
      Partial<Pick<OrderItem, 'discount_type' | 'discount_value'>>,
  ) =>
    resolveDiscountState({
      baseAmount: calculateBaseAmount(Number(item.quantity || 0), Number(item.unit_price || 0)),
      discountAmount: Number(item.discount || 0),
      discountType: normalizeDiscountType(item.discount_type),
      discountValue: item.discount_value ?? undefined,
    });

  const calculateItemDiscountAmount = (
    item: Pick<OrderItem, 'quantity' | 'unit_price' | 'discount'> &
      Partial<Pick<OrderItem, 'discount_type' | 'discount_value'>>,
  ) =>
    getItemDiscountState(item).discountAmount;

  const calculateItemTotal = (
    item: Pick<OrderItem, 'quantity' | 'unit_price' | 'discount'> &
      Partial<Pick<OrderItem, 'discount_type' | 'discount_value'>>,
  ) =>
    calculateLineTotal({
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unit_price || 0),
      discountType: item.discount_type,
      discountValue:
        item.discount_value ?? getItemDiscountState(item).discountValue,
    });

  const calculateSubtotal = (
    itemsList: Array<
      Pick<OrderItem, 'quantity' | 'unit_price' | 'discount'> &
      Partial<Pick<OrderItem, 'discount_type' | 'discount_value'>>
    >,
  ) => itemsList.reduce((sum, item) => sum + calculateItemTotal(item), 0);

  const calculateGrossSubtotal = (
    itemsList: Array<Pick<OrderItem, 'quantity' | 'unit_price'>>,
  ) => itemsList.reduce((sum, item) => sum + calculateBaseAmount(Number(item.quantity || 0), Number(item.unit_price || 0)), 0);

  const calculateItemsDiscountTotal = (
    itemsList: Array<
      Pick<OrderItem, 'quantity' | 'unit_price' | 'discount'> &
      Partial<Pick<OrderItem, 'discount_type' | 'discount_value'>>
    >,
  ) => itemsList.reduce((sum, item) => sum + calculateItemDiscountAmount(item), 0);

  const calculateOrderDiscountAmount = (
    subtotalValue: number,
    discountType: DiscountType,
    discountValue: number,
  ) =>
    calculateDiscountAmount({
      baseAmount: subtotalValue,
      discountType,
      discountValue,
    });

  const calculateOrderTotal = (
    subtotalValue: number,
    discountType: DiscountType,
    discountValue: number,
  ) => Math.max(0, subtotalValue - calculateOrderDiscountAmount(subtotalValue, discountType, discountValue));

  const paymentReceiptMethodLabels: Record<PaymentMethod, string> = {
    dinheiro: 'Dinheiro',
    cartao: 'Cartão',
    credito: 'Cartão crédito',
    debito: 'Cartão débito',
    transferencia: 'Transferência',
    pix: 'PIX',
    boleto: 'Boleto',
    outro: 'Outro',
  };

  const getPaymentMethodLabel = (method?: PaymentMethod | null) =>
    method ? paymentReceiptMethodLabels[method] || String(method) : 'Não informado';

  const selectablePaymentMethods = useMemo(
    () =>
      getSelectableCompanyPaymentMethods(companyPaymentMethods, [
        order?.payment_method,
        paymentMethod,
        entryMethod,
        deliveryPaymentMethod,
      ]),
    [companyPaymentMethods, deliveryPaymentMethod, entryMethod, order?.payment_method, paymentMethod],
  );

  const buildDeliveryReceiptPaymentInfo = (
    sourceOrder: Order,
    payment?: OrderPayment | null,
  ): DeliveryReceiptPaymentInfo | null => {
    const settledTotal = Number(sourceOrder.amount_paid || 0) + Number(sourceOrder.customer_credit_used || 0);

    if (payment) {
      return {
        amount: Number(payment.amount || 0),
        method: payment.method || null,
        paidAt: payment.paid_at || payment.created_at || null,
        totalPaid: settledTotal || Number(payment.amount || 0),
      };
    }

    if (Number(sourceOrder.amount_paid || 0) <= 0) {
      return null;
    }

    return {
      amount: Number(sourceOrder.amount_paid || 0),
      method: sourceOrder.payment_method || null,
      paidAt: sourceOrder.paid_at || null,
      totalPaid: settledTotal,
    };
  };

  const getDeliveredHistoryTimestamp = (
    sourceHistory: OrderStatusHistory[] = history,
  ) => sourceHistory.find((entry) => entry.status === 'entregue')?.created_at || null;

  const buildDeliveredOrderSnapshot = (
    sourceOrder: Order,
    explicitDeliveredAt?: string | null,
  ): Order => {
    const deliveredAt = explicitDeliveredAt || sourceOrder.delivered_at || getDeliveredHistoryTimestamp();
    if (!deliveredAt || sourceOrder.delivered_at) return sourceOrder;
    return {
      ...sourceOrder,
      delivered_at: deliveredAt,
    };
  };

  const buildDeliveryReceiptItemsSnapshot = (
    sourceItems: OrderItem[],
    deliveredItemIds: string[],
    deliveredAt: string,
  ) => {
    const deliveredIdSet = new Set(deliveredItemIds);

    return sourceItems.map((item) => {
      if (!deliveredIdSet.has(item.id)) {
        return item;
      }

      return {
        ...item,
        status: 'entregue' as OrderStatus,
        ready_at: item.ready_at || deliveredAt,
        ready_by: item.ready_by || user?.id || null,
        delivered_at: item.delivered_at || deliveredAt,
        delivered_by: item.delivered_by || user?.id || null,
      };
    });
  };

  const buildDeliveryReceiptMarkup = ({
    deliveryOrder,
    receiptItems,
    deliveredItemIds,
    deliveredAt,
    paymentInfo,
  }: {
    deliveryOrder: Order;
    receiptItems: OrderItem[];
    deliveredItemIds: string[];
    deliveredAt?: string | null;
    paymentInfo?: DeliveryReceiptPaymentInfo | null;
  }) =>
    renderToStaticMarkup(
      <DeliveryReceipt
        order={deliveryOrder}
        items={receiptItems}
        deliveredAt={deliveredAt || deliveryOrder.delivered_at}
        deliveredItemIds={deliveredItemIds}
        payment={paymentInfo || undefined}
      />,
    );

  const buildPaymentReceiptSummary = (payment: OrderPayment) => {
    if (!order) return null;

    const orderedPayments = payments
      .filter((entry) => entry.status !== 'pendente')
      .slice()
      .sort((a, b) => {
        const paidAtA = new Date(a.paid_at || a.created_at || 0).getTime();
        const paidAtB = new Date(b.paid_at || b.created_at || 0).getTime();
        if (paidAtA !== paidAtB) return paidAtA - paidAtB;

        const createdAtA = new Date(a.created_at || 0).getTime();
        const createdAtB = new Date(b.created_at || 0).getTime();
        if (createdAtA !== createdAtB) return createdAtA - createdAtB;

        return a.id.localeCompare(b.id);
      });

    let paidTotal = 0;
    let creditUsedTotal = 0;
    let found = false;

    for (const entry of orderedPayments) {
      if (isCustomerCreditPayment(entry)) {
        creditUsedTotal += Number(entry.amount || 0);
      } else {
        paidTotal += Number(entry.amount || 0);
      }

      if (entry.id === payment.id) {
        found = true;
        break;
      }
    }

    if (!found) {
      const currentCashPaid = Number(order.amount_paid || 0);
      const currentCreditUsed = Number(order.customer_credit_used || 0);

      if (isCustomerCreditPayment(payment)) {
        paidTotal = currentCashPaid;
        creditUsedTotal = Math.max(currentCreditUsed, Number(payment.amount || 0));
      } else {
        paidTotal = currentCashPaid + Number(payment.amount || 0);
        creditUsedTotal = currentCreditUsed;
      }
    }

    const settledTotal = paidTotal + creditUsedTotal;
    const remaining = Math.max(0, Number(order.total || 0) - settledTotal);
    const paymentStatus: PaymentStatus =
      settledTotal >= Number(order.total || 0)
        ? 'pago'
        : settledTotal > 0
          ? 'parcial'
          : 'pendente';

    return {
      paidTotal,
      creditUsedTotal,
      settledTotal,
      remaining,
      paymentStatus,
    };
  };

  const buildPaymentReceiptMarkup = (payment: OrderPayment) => {
    if (!order) return null;

    return renderToStaticMarkup(
      <PaymentReceipt
        order={order}
        items={items}
        payment={payment}
        summary={buildPaymentReceiptSummary(payment)}
      />,
    );
  };

  const ensureProductsLoaded = async () => {
    if (!order?.company_id) return;
    if (products.length > 0 && priceTiers.length > 0) return;

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

    const loadedProducts = (data as unknown as Product[]) || [];
    setProducts(loadedProducts);

    const productIds = loadedProducts.map((product) => product.id);
    if (productIds.length === 0) {
      setPriceTiers([]);
      setProductAttributeMap({});
      return;
    }

    const [tiersResult, attributesResult] = await Promise.all([
      supabase
        .from('price_tiers')
        .select('*')
        .in('product_id', productIds)
        .order('min_quantity'),
      supabase
        .from('product_attributes')
        .select(
          'product_id, price_modifier, attribute_value_id, attribute_value:attribute_values(id, value, attribute_id, attribute:attributes(id, name))',
        )
        .in('product_id', productIds),
    ]);

    if (tiersResult.error) {
      toast({ title: 'Erro ao carregar faixas de preço', variant: 'destructive' });
      return;
    }

    if (attributesResult.error) {
      toast({ title: 'Erro ao carregar atributos', variant: 'destructive' });
      return;
    }

    setPriceTiers((tiersResult.data as PriceTier[]) || []);

    const nextProductAttributeMap: Record<string, ProductAttributeGroup[]> = {};
    (attributesResult.data || []).forEach((row) => {
      const productId = row.product_id;
      const attributeValue = Array.isArray(row.attribute_value)
        ? row.attribute_value[0]
        : row.attribute_value;
      const attribute = Array.isArray(attributeValue?.attribute)
        ? attributeValue.attribute[0]
        : attributeValue?.attribute;
      const attributeId = String(attribute?.id || attributeValue?.attribute_id || '').trim();
      const attributeName = String(attribute?.name || '').trim();
      const valueId = String(attributeValue?.id || row.attribute_value_id || '').trim();
      const valueLabel = String(attributeValue?.value || '').trim();

      if (!productId || !attributeId || !attributeName || !valueId || !valueLabel) return;

      const productGroups = nextProductAttributeMap[productId] || [];
      let group = productGroups.find((item) => item.attributeId === attributeId);

      if (!group) {
        group = {
          attributeId,
          attributeName,
          options: [],
        };
        productGroups.push(group);
      }

      if (!group.options.some((option) => option.id === valueId)) {
        group.options.push({
          id: valueId,
          value: valueLabel,
          priceModifier: Number(row.price_modifier || 0),
        });
      }

      nextProductAttributeMap[productId] = productGroups;
    });

    Object.values(nextProductAttributeMap).forEach((groups) => {
      groups.sort((left, right) => left.attributeName.localeCompare(right.attributeName, 'pt-BR'));
      groups.forEach((group) => {
        group.options.sort((left, right) => left.value.localeCompare(right.value, 'pt-BR'));
      });
    });

    setProductAttributeMap(nextProductAttributeMap);
  };

  const startEditingItems = async () => {
    if (!isBudget) return;
    await ensureProductsLoaded();
    const mapped = (items || []).map(buildEditableItem);
    const savedOrderDiscount = getSavedOrderDiscountState();
    setEditableItems(mapped);
    setOrderDiscountType(savedOrderDiscount.discountType);
    setOrderDiscountValue(savedOrderDiscount.discountValue);
    setNewItemProductId('');
    setNewItemQuantity(1);
    setNewItemWidthCm('');
    setNewItemHeightCm('');
    setIsEditingItems(true);
  };

  const cancelEditingItems = () => {
    setEditableItems([]);
    const savedOrderDiscount = getSavedOrderDiscountState();
    setOrderDiscountType(savedOrderDiscount.discountType);
    setOrderDiscountValue(savedOrderDiscount.discountValue);
    setIsEditingItems(false);
    setNewItemProductId('');
    setNewItemQuantity(1);
    setNewItemWidthCm('');
    setNewItemHeightCm('');
  };

  const handleChangeItemProduct = (index: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setEditableItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const isM2 = isAreaUnit(product.unit);
        if (isM2) {
          const m2 = parseM2Attributes(item.attributes);
          const hasValidDimensions =
            typeof m2.widthCm === 'number' &&
            typeof m2.heightCm === 'number' &&
            m2.widthCm > 0 &&
            m2.heightCm > 0;
          const area = hasValidDimensions ? calculateAreaM2(m2.widthCm, m2.heightCm) : 0;
          const unitPrice = getProductPriceForQuantity(product, area > 0 ? area : 1);
          const attributes = buildM2Attributes(item.attributes ?? {}, {
            widthCm: m2.widthCm ?? null,
            heightCm: m2.heightCm ?? null,
            areaM2: hasValidDimensions ? area : null,
          });
          const next = {
            ...item,
            product_id: product.id,
            product_name: product.name,
            quantity: area,
            unit_price: unitPrice,
            attributes,
            price_mode: 'catalog' as const,
          };
          return {
            ...next,
            total: calculateItemTotal(next),
          };
        }

        const requestedQuantity = Math.max(1, Number(item.quantity));
        const quantity = isQuantityAllowedByPriceTiers(product.id, requestedQuantity, priceTiers)
          ? requestedQuantity
          : getInitialTierQuantity(product.id, priceTiers);
        const unitPrice = getProductPriceForQuantity(product, quantity);
        const cleanedAttributes = stripM2Attributes(item.attributes);
        const next = {
          ...item,
          product_id: product.id,
          product_name: product.name,
          quantity,
          unit_price: unitPrice,
          attributes: Object.keys(cleanedAttributes).length > 0 ? cleanedAttributes : null,
          price_mode: 'catalog' as const,
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
        if (isItemM2(item)) return item;
        const product = getProductById(item.product_id);
        if (!product || !validateTierQuantity(product, quantity)) return item;
        const next = { ...item, quantity };
        if (item.price_mode !== 'manual') {
          next.unit_price = getProductPriceForQuantity(product, quantity);
        }
        return { ...next, total: calculateItemTotal(next) };
      }),
    );
  };

  const handleChangeItemDimensions = (index: number, key: string, value: string) => {
    setEditableItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        if (!isItemM2(item)) return item;

        const nextAttributes = { ...(item.attributes || {}) };
        nextAttributes[key] = value;

        const widthCm = parseMeasurementInput(nextAttributes[M2_ATTRIBUTE_KEYS.widthCm]);
        const heightCm = parseMeasurementInput(nextAttributes[M2_ATTRIBUTE_KEYS.heightCm]);
        const hasValidDimensions =
          typeof widthCm === 'number' &&
          typeof heightCm === 'number' &&
          widthCm > 0 &&
          heightCm > 0;

        const product = getProductById(item.product_id);
        const quantity = hasValidDimensions ? calculateAreaM2(widthCm, heightCm) : 0;
        const unitPrice = product
          ? item.price_mode === 'manual'
            ? Number(item.unit_price)
            : getProductPriceForQuantity(product, quantity > 0 ? quantity : 1)
          : Number(item.unit_price);

        const attributes = buildM2Attributes(nextAttributes, {
          widthCm: widthCm ?? null,
          heightCm: heightCm ?? null,
          areaM2: hasValidDimensions ? quantity : null,
        });

        const next = {
          ...item,
          attributes,
          quantity,
          unit_price: unitPrice,
        };
        return { ...next, total: calculateItemTotal(next) };
      }),
    );
  };

  const handleChangeItemUnitPrice = (index: number, value: number) => {
    setEditableItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const next = {
          ...item,
          unit_price: Math.max(0, Number(value || 0)),
          price_mode: 'manual' as const,
        };
        return { ...next, total: calculateItemTotal(next) };
      }),
    );
  };

  const handleChangeItemAttribute = (index: number, attributeName: string, value: string) => {
    setEditableItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;

        const nextAttributes = ensureSelectedAttributes(item.product_id!, {
          ...(item.attributes || {}),
          [attributeName]: value,
        });

        const product = getProductById(item.product_id);
        const next = {
          ...item,
          attributes: nextAttributes,
        };

        if (product && item.price_mode !== 'manual') {
          next.unit_price = calculateUnitPriceWithAttributes(product, item.quantity, nextAttributes);
        }

        return {
          ...next,
          total: calculateItemTotal(next),
        };
      }),
    );
  };

  const handleChangeItemTotal = (index: number, value: number) => {
    setEditableItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;

        const quantity = Math.max(0, Number(item.quantity || 0));
        if (quantity <= 0) {
          return item;
        }

        const targetTotal = normalizeDiscountValue(value);

        if (targetTotal <= 0) {
          const next = {
            ...item,
            unit_price: 0,
            discount_type: 'fixed' as const,
            discount_value: 0,
            price_mode: 'manual' as const,
          };
          return { ...next, total: 0 };
        }

        const rawUnitPrice = targetTotal / quantity;
        const nextUnitPrice = roundCurrency(Math.ceil((rawUnitPrice - 0.000001) * 100) / 100);
        const nextBaseAmount = calculateBaseAmount(quantity, nextUnitPrice);
        const nextDiscountAmount = normalizeDiscountValue(nextBaseAmount - targetTotal);
        const next = {
          ...item,
          unit_price: nextUnitPrice,
          discount_type: 'fixed' as const,
          discount_value: nextDiscountAmount,
          price_mode: 'manual' as const,
        };

        return { ...next, total: calculateItemTotal(next) };
      }),
    );
  };

  const handleResetItemUnitPrice = (index: number) => {
    setEditableItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const product = getProductById(item.product_id);
        if (!product) return item;
        const next = {
          ...item,
          unit_price: getProductPriceForQuantity(product, Number(item.quantity || 0) > 0 ? Number(item.quantity) : 1),
          price_mode: 'catalog' as const,
        };
        return { ...next, total: calculateItemTotal(next) };
      }),
    );
  };

  const handleChangeItemDiscountType = (index: number, value: DiscountType) => {
    setEditableItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const nextType = normalizeDiscountType(value);
        const currentDiscountAmount = calculateItemDiscountAmount(item);
        const next = {
          ...item,
          discount_type: nextType,
          discount_value: calculateDiscountValueFromAmount({
            baseAmount: calculateBaseAmount(Number(item.quantity || 0), Number(item.unit_price || 0)),
            discountAmount: currentDiscountAmount,
            discountType: nextType,
          }),
        };
        return {
          ...next,
          total: calculateItemTotal(next),
        };
      }),
    );
  };

  const handleChangeItemDiscountValue = (index: number, value: number) => {
    setEditableItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const next = {
          ...item,
          discount_value: normalizeDiscountValue(value),
        };
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
    const isM2 = isAreaUnit(product.unit);
    const widthCm = parseMeasurementInput(newItemWidthCm);
    const heightCm = parseMeasurementInput(newItemHeightCm);

    if (isM2) {
      if (!widthCm || !heightCm || widthCm <= 0 || heightCm <= 0) {
        toast({ title: 'Informe largura e altura validas', variant: 'destructive' });
        return;
      }
    }

    const quantity = isM2
      ? calculateAreaM2(widthCm as number, heightCm as number)
      : Math.max(1, Number(newItemQuantity) || getInitialTierQuantity(product.id, priceTiers));
    if (!isM2 && !validateTierQuantity(product, quantity)) {
      return;
    }

    const initialAttributes = ensureSelectedAttributes(product.id, newItemAttributes);
    const unitPrice = calculateUnitPriceWithAttributes(product, quantity > 0 ? quantity : 1, initialAttributes);

    const attributes = isM2
      ? buildM2Attributes(initialAttributes, {
        widthCm: widthCm as number,
        heightCm: heightCm as number,
        areaM2: quantity,
      })
      : Object.keys(initialAttributes).length > 0 ? initialAttributes : null;

    const newItem: EditableOrderItem = {
      id: crypto.randomUUID(),
      order_id: order?.id || '',
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit_price: unitPrice,
      discount_type: 'fixed',
      discount_value: 0,
      discount: 0,
      total: calculateItemTotal({
        quantity,
        unit_price: unitPrice,
        discount_type: 'fixed',
        discount_value: 0,
        discount: 0,
      }),
      attributes,
      notes: null,
      status: order?.status || 'orcamento',
      created_at: new Date().toISOString(),
      price_mode: 'catalog',
    };
    setEditableItems((prev) => [...prev, newItem]);
    setNewItemProductId('');
    setNewItemQuantity(1);
    setNewItemWidthCm('');
    setNewItemHeightCm('');
    setNewItemAttributes({});
  };

  const handleNewItemProductChange = (productId: string) => {
    setNewItemProductId(productId);
    setNewItemAttributes(ensureSelectedAttributes(productId));
    const product = products.find((entry) => entry.id === productId);
    if (!product || isAreaUnit(product.unit)) {
      setNewItemQuantity(1);
      return;
    }

    setNewItemQuantity(getInitialTierQuantity(product.id, priceTiers));
  };

  const handleSaveItems = async () => {
    if (!order) return;
    if (editableItems.length === 0) {
      toast({ title: 'Adicione pelo menos um item', variant: 'destructive' });
      return;
    }

    const invalidM2Items = editableItems.filter((item) => {
      const unit = getProductById(item.product_id)?.unit;
      const isM2 = isAreaUnit(unit) || isItemM2(item);
      if (!isM2) return false;
      const { widthCm, heightCm } = parseM2Attributes(item.attributes);
      return !widthCm || !heightCm || widthCm <= 0 || heightCm <= 0;
    });

    if (invalidM2Items.length > 0) {
      toast({
        title: 'Informe largura e altura validas',
        description: invalidM2Items.map((item) => item.product_name).join(', '),
        variant: 'destructive',
      });
      return;
    }

    const invalidTierItems = editableItems.filter((item) => {
      const product = getProductById(item.product_id);
      if (!product || isAreaUnit(product.unit)) return false;
      return !isQuantityAllowedByPriceTiers(product.id, item.quantity, priceTiers);
    });

    if (invalidTierItems.length > 0) {
      const firstProduct = getProductById(invalidTierItems[0].product_id);
      toast({
        title: 'Quantidade fora da faixa permitida',
        description: firstProduct
          ? getPriceTierValidationMessage(firstProduct.id, priceTiers) || undefined
          : undefined,
        variant: 'destructive',
      });
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
        discount_type: normalizeDiscountType(item.discount_type),
        discount_value: Number(item.discount_value || 0),
        discount: calculateItemDiscountAmount(item),
        notes: item.notes ?? null,
        attributes: item.attributes ?? null,
      }));
      const updatedOrder = await updateOrderItems({
        orderId: order.id,
        items: payload,
        orderDiscountType,
        orderDiscountValue,
      });
      const refreshedItems = editableItems.map((item) => ({
        ...item,
        discount: calculateItemDiscountAmount(item),
        total: calculateItemTotal(item),
      }));
      setOrder((prev) => (prev ? { ...prev, ...updatedOrder } : updatedOrder));
      setItems(refreshedItems);
      setIsEditingItems(false);
      toast({ title: 'Pedido atualizado com sucesso!' });
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

  const handleSaveCustomer = async () => {
    if (!order) return;
    const trimmedName = customerNameDraft.trim();
    if (!trimmedName) {
      toast({ title: 'Informe o nome do cliente', variant: 'destructive' });
      return;
    }

    setCustomerSaving(true);
    try {
      let customerId = customerDraft?.id || null;
      let customerRecord = customerDraft;

      if (customerId && customerRecord && customerRecord.name !== trimmedName) {
        const { data, error } = await supabase
          .from('customers')
          .update({ name: trimmedName })
          .eq('id', customerId)
          .select('*')
          .single();
        if (error) throw error;
        customerRecord = data as Customer;
      }

      if (!customerId) {
        const { data: existingCustomer, error: lookupError } = await supabase
          .from('customers')
          .select('*')
          .ilike('name', trimmedName)
          .limit(1)
          .maybeSingle();
        if (lookupError) throw lookupError;

        if (existingCustomer?.id) {
          customerId = existingCustomer.id;
          customerRecord = existingCustomer as Customer;
        } else {
          const { data: createdCustomer, error: createError } = await supabase
            .from('customers')
            .insert({ name: trimmedName })
            .select('*')
            .single();
          if (createError) throw createError;
          customerId = createdCustomer.id;
          customerRecord = createdCustomer as Customer;
        }
      }

      const { error: orderError } = await supabase
        .from('orders')
        .update({ customer_id: customerId, customer_name: trimmedName })
        .eq('id', order.id);
      if (orderError) throw orderError;

      setOrder((prev) =>
        prev
          ? {
            ...prev,
            customer_id: customerId,
            customer_name: trimmedName,
            customer: customerRecord || prev.customer,
          }
          : prev,
      );
      toast({ title: 'Cliente atualizado com sucesso!' });
      setCustomerDialogOpen(false);
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar cliente',
        description: error?.message,
        variant: 'destructive',
      });
    } finally {
      setCustomerSaving(false);
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
    const rawPhone = normalizeWhatsappPhone(order?.customer?.phone);

    if (!rawPhone) {
      toast({ title: 'Cliente sem telefone cadastrado', variant: 'destructive' });
      return;
    }

    let phone = rawPhone.replace(/\D/g, '');

    // Garante DDI Brasil
    if (!phone.startsWith('55')) {
      phone = `55${phone}`;
    }

    const text = encodeURIComponent(message);

    // Usa sessão já logada do WhatsApp Web
    const whatsappUrl = `https://web.whatsapp.com/send?phone=${phone}&text=${text}`;

    // Redireciona a aba atual
    window.location.href = whatsappUrl;
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
    text += `*TOTAL: ${formatCurrency(Number(order.total))} 


















    **/*7entStatusLabel(order.payment_status)}\n`;

    if (orderVisibleNotes) {
      text += `\nObs: ${orderVisibleNotes}`;
    }

    return text;
  };
  const buildWhatsAppMessage = (link: string) => {
    if (!order) return '';
    const template =
      order.company?.whatsapp_message_template ||
      'Ola {cliente_nome}! {mensagem_status} Pedido #{pedido_numero}. Status: {pedido_status}. Acompanhe pelo link: {pedido_link}';
    return applyTemplateReplacements(template, getWhatsAppTemplateReplacements(link));
  };
  const handleWhatsApp = () => {
    handleSendWhatsAppUpdate();
  };

  const printMarkup = (
    markup: string,
    title: string,
    targetWindow?: Window | null,
  ) => {
    const printWindow = targetWindow && !targetWindow.closed
      ? targetWindow
      : window.open('', '_blank');
    if (!printWindow) return;

    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((node) => node.outerHTML)
      .join('\n');
    const printOverrides = `
      <style>
        @page { size: A4 portrait; margin: ${PRINT_PAGE_MARGIN_MM}mm; }
        html, body { margin: 0; padding: 0; background: #ffffff; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .receipt-root {
          box-shadow: none !important;
          max-width: ${RECEIPT_RENDER_WIDTH}px !important;
          width: ${RECEIPT_RENDER_WIDTH}px !important;
          margin: 0 auto !important;
        }
        .receipt-block, .receipt-row, .receipt-table tr, .receipt-table td, .receipt-table th {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .receipt-table thead { display: table-header-group; }
      </style>
    `;
    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          ${styles}
          ${printOverrides}
        </head>
        <body>
          ${markup}
        </body>
      </html>
    `);
    printWindow.document.close();
    let handled = false;
    const handlePrint = () => {
      if (handled) return;
      handled = true;

      const waitForReady = async () => {
        try {
          if (printWindow.document.fonts?.ready) {
            await printWindow.document.fonts.ready;
          }
        } catch {
          // ignore font readiness errors
        }

        const images = Array.from(printWindow.document.images || []);
        await Promise.all(
          images.map(
            (image) =>
              new Promise<void>((resolve) => {
                if (image.complete) {
                  resolve();
                  return;
                }
                image.onload = () => resolve();
                image.onerror = () => resolve();
              }),
          ),
        );
      };

      waitForReady().finally(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      });
    };

    printWindow.onload = handlePrint;
    window.setTimeout(handlePrint, 300);
  };

  const printReceipt = (
    content: HTMLDivElement | null,
    title: string,
    targetWindow?: Window | null,
  ) => {
    if (!content) return;
    printMarkup(content.outerHTML, title, targetWindow);
  };

  const handlePrint = () => {
    printReceipt(receiptRef.current, `Recibo - Pedido #${formatOrderNumber(order?.order_number)}`);
  };

  const saveCanvasAsPdf = (canvas: HTMLCanvasElement, fileName: string) => {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const availableWidth = pageWidth - PDF_MARGIN * 2;
    const availableHeight = pageHeight - PDF_MARGIN * 2;
    const widthScale = availableWidth / canvas.width;
    const heightScale = availableHeight / canvas.height;
    const scaledHeightAtFullWidth = canvas.height * widthScale;
    const imgData = canvas.toDataURL('image/png');

    if (scaledHeightAtFullWidth <= availableHeight * PDF_SINGLE_PAGE_TOLERANCE) {
      const scale = Math.min(widthScale, heightScale);
      const renderWidth = canvas.width * scale;
      const renderHeight = canvas.height * scale;
      const renderX = (pageWidth - renderWidth) / 2;

      pdf.addImage(imgData, 'PNG', renderX, PDF_MARGIN, renderWidth, renderHeight);
      pdf.save(fileName);
      return;
    }

    let heightLeft = scaledHeightAtFullWidth;
    let positionY = PDF_MARGIN;

    pdf.addImage(imgData, 'PNG', PDF_MARGIN, positionY, availableWidth, scaledHeightAtFullWidth);
    heightLeft -= availableHeight;

    while (heightLeft > 0) {
      pdf.addPage();
      positionY = PDF_MARGIN - (scaledHeightAtFullWidth - heightLeft);
      pdf.addImage(imgData, 'PNG', PDF_MARGIN, positionY, availableWidth, scaledHeightAtFullWidth);
      heightLeft -= availableHeight;
    }

    pdf.save(fileName);
  };

  const downloadReceiptMarkupAsPdf = async (
    markup: string,
    fileName: string,
    successTitle: string,
  ) => {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = `${RECEIPT_RENDER_WIDTH}px`;
    container.style.background = '#ffffff';
    container.innerHTML = markup;
    document.body.appendChild(container);

    try {
      const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map((node) => node.outerHTML)
        .join('\n');

      const shadow = container.attachShadow ? container.attachShadow({ mode: 'open' }) : null;
      if (shadow) {
        shadow.innerHTML = `${styles}${markup}`;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      const elementToCapture = shadow
        ? (shadow.querySelector('.receipt-root') as HTMLElement | null)
        : (container.querySelector('.receipt-root') as HTMLElement | null);

      const canvas = await html2canvas(elementToCapture || container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      saveCanvasAsPdf(canvas, fileName);
      toast({ title: successTitle });
    } finally {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }
  };

  const handleDownloadOrderPdf = async () => {
    if (!receiptRef.current || !order) return;
    
    setLoading(true);
    try {
      await downloadReceiptMarkupAsPdf(
        receiptRef.current.outerHTML,
        `pedido-${formatOrderNumber(order.order_number)}.pdf`,
        'PDF do pedido baixado',
      );
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Erro ao gerar PDF', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const printDeliveryReceipt = ({
    deliveryOrder,
    receiptItems,
    deliveredItemIds,
    deliveredAt,
    paymentInfo,
    targetWindow,
  }: {
    deliveryOrder: Order;
    receiptItems: OrderItem[];
    deliveredItemIds: string[];
    deliveredAt?: string | null;
    paymentInfo?: DeliveryReceiptPaymentInfo | null;
    targetWindow?: Window | null;
  }) => {
    const markup = buildDeliveryReceiptMarkup({
      deliveryOrder,
      receiptItems,
      deliveredItemIds,
      deliveredAt,
      paymentInfo,
    });

    printMarkup(
      markup,
      `Comprovante de entrega - Pedido #${formatOrderNumber(deliveryOrder.order_number)}`,
      targetWindow,
    );
  };

  const preparePrintWindow = (title: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return null;

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              font-family: Arial, sans-serif;
              color: #334155;
              background: #ffffff;
            }
          </style>
        </head>
        <body>Gerando comprovante...</body>
      </html>
    `);
    printWindow.document.close();

    return printWindow;
  };

  const handleOpenReadyDialog = () => {
    setReadyItemIds(readyCompletedFromItems ? [] : pendingReadyItems.map((item) => item.id));
    setReadyDialogOpen(true);
  };

  const handleConfirmReady = async () => {
    if (!order) return;
    if (!['em_producao', 'finalizado', 'pronto', 'aguardando_retirada'].includes(order.status)) {
      toast({
        title: 'Marcacao indisponivel',
        description: 'O pedido precisa estar em producao ou finalizado para registrar itens prontos.',
        variant: 'destructive',
      });
      return;
    }

    if (selectedReadyItems.length === 0) {
      toast({
        title: 'Selecione ao menos um item',
        description: 'Escolha quais itens ja ficaram prontos.',
        variant: 'destructive',
      });
      return;
    }

    setReadySaving(true);

    try {
      const readyResult = await markOrderItemsReady({
        orderId: order.id,
        itemIds: selectedReadyItems.map((item) => item.id),
        userId: user?.id ?? null,
      });

      const updatedOrder = readyResult?.order;

      if (!updatedOrder) {
        throw new Error('O sistema nao retornou o pedido atualizado.');
      }

      const mergedOrder = {
        ...order,
        ...updatedOrder,
        customer: order.customer,
        company: order.company,
      } as Order;

      setOrder(mergedOrder);
      setReadyDialogOpen(false);
      toast({
        title: readyResult?.ready_completed
          ? readyResult?.status_updated
            ? 'Todos os itens ficaram prontos. Pedido finalizado!'
            : 'Todos os itens do pedido ja estao prontos!'
          : 'Itens marcados como prontos!',
        description: readyResult?.ready_completed
          ? undefined
          : `${selectedReadyItems.length} item(ns) marcado(s) como pronto(s).`,
      });

      await fetchOrder(order.id);
    } catch (error: any) {
      toast({
        title: 'Erro ao marcar itens como prontos',
        description: error?.message,
        variant: 'destructive',
      });
    } finally {
      setReadySaving(false);
    }
  };

  const handleOpenDeliveryDialog = () => {
    const deliveredSnapshot =
      deliveryCompletedFromItems && order
        ? buildDeliveredOrderSnapshot(order, latestDeliveredItemAt)
        : null;

    if (deliveryCompleted && deliveredSnapshot) {
      const latestBatchItemIds = latestDeliveredItemAt
        ? items
            .filter((item) => {
              if (!item.delivered_at) return false;
              return new Date(item.delivered_at).getTime() === new Date(latestDeliveredItemAt).getTime();
            })
            .map((item) => item.id)
        : [];

      setDeliveryReceiptOrder(deliveredSnapshot);
      setDeliveryReceiptPayment(buildDeliveryReceiptPaymentInfo(deliveredSnapshot, latestPaidPayment));
      setDeliveryReceiptItems(items);
      setDeliveryReceiptItemIds(
        latestBatchItemIds.length > 0 ? latestBatchItemIds : deliveredItems.map((item) => item.id),
      );
      setDeliveryReceiptDeliveredAt(deliveredSnapshot.delivered_at || latestDeliveredItemAt || null);
      setDeliveryItemIds([]);
      setDeliveryPaymentAmount(0);
      setDeliveryPaymentMethod(deliveredSnapshot.payment_method || '');
    } else {
      setDeliveryReceiptOrder(null);
      setDeliveryReceiptPayment(null);
      setDeliveryReceiptItems([]);
      setDeliveryReceiptItemIds([]);
      setDeliveryReceiptDeliveredAt(null);
      setDeliveryItemIds(pendingDeliveryItems.map((item) => item.id));
      setDeliveryPaymentAmount(remainingAmount);
      setDeliveryPaymentMethod('');
    }
    setDeliveryDialogOpen(true);
  };

  const handlePrintDeliveryReceipt = () => {
    const sourceOrder = deliveryReceiptSource;
    const printableOrder =
      sourceOrder && deliveryCompleted
        ? buildDeliveredOrderSnapshot(sourceOrder, deliveryRecordedAt)
        : sourceOrder;
    const sourcePayment =
      deliveryReceiptPayment ||
      (printableOrder ? buildDeliveryReceiptPaymentInfo(printableOrder, latestPaidPayment) : null);

    if (!printableOrder || !deliveryReceiptAvailable) {
      toast({
        title: 'Comprovante indisponivel',
        description: 'Nenhum comprovante de entrega foi gerado ainda para este pedido.',
        variant: 'destructive',
      });
      return;
    }

    if (!deliveryRecordedAt) {
      toast({
        title: 'Data da entrega indisponivel',
        description: 'Nao foi possivel localizar a data registrada da entrega para reimpressao.',
        variant: 'destructive',
      });
      return;
    }

    printDeliveryReceipt({
      deliveryOrder: printableOrder,
      receiptItems: deliveryReceiptSourceItems,
      deliveredItemIds: deliveryReceiptSelectedItemIds,
      deliveredAt: deliveryRecordedAt,
      paymentInfo: sourcePayment,
    });
  };

  const handleDownloadDeliveryReceipt = async () => {
    const sourceOrder = deliveryReceiptSource;
    const printableOrder =
      sourceOrder && deliveryCompleted
        ? buildDeliveredOrderSnapshot(sourceOrder, deliveryRecordedAt)
        : sourceOrder;
    const sourcePayment =
      deliveryReceiptPayment ||
      (printableOrder ? buildDeliveryReceiptPaymentInfo(printableOrder, latestPaidPayment) : null);

    if (!printableOrder || !deliveryReceiptAvailable || !deliveryRecordedAt) {
      toast({ title: 'Comprovante indisponivel', variant: 'destructive' });
      return;
    }

    setDeliverySaving(true);
    try {
      const markup = buildDeliveryReceiptMarkup({
        deliveryOrder: printableOrder,
        receiptItems: deliveryReceiptSourceItems,
        deliveredItemIds: deliveryReceiptSelectedItemIds,
        deliveredAt: deliveryRecordedAt,
        paymentInfo: sourcePayment,
      });

      await downloadReceiptMarkupAsPdf(
        markup,
        `comprovante-entrega-${formatOrderNumber(printableOrder.order_number)}.pdf`,
        'Comprovante baixado com sucesso!',
      );
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Erro ao gerar PDF', description: error.message, variant: 'destructive' });
    } finally {
      setDeliverySaving(false);
    }
  };

  const handleConfirmDelivery = async () => {
    if (!order) return;
    if (!['em_producao', 'pronto', 'finalizado', 'aguardando_retirada'].includes(order.status)) {
      toast({
        title: 'Entrega indisponível',
        description: 'O pedido precisa estar em producao ou pronto para confirmar a entrega.',
        variant: 'destructive',
      });
      return;
    }

    if (selectedDeliveryItems.length === 0) {
      toast({
        title: 'Selecione ao menos um item',
        description:
          pendingDeliveryItems.length === 0 && blockedDeliveryItems.length > 0
            ? 'Nenhum item esta pronto para entrega. Marque o item como pronto antes de entregar.'
            : 'Escolha quais itens prontos estao sendo entregues agora.',
        variant: 'destructive',
      });
      return;
    }

    const isFinalDelivery = selectedDeliveryCompletesOrder;
    const printTitle = `Comprovante de entrega - Pedido #${formatOrderNumber(order.order_number)}`;
    const printWindow = preparePrintWindow(printTitle);
    const pendingAmount = isFinalDelivery ? Math.max(0, remainingAmount) : 0;
    const selectedDeliveryItemIds = selectedDeliveryItems.map((item) => item.id);
    let receiptPrinted = false;
    setDeliverySaving(true);

    try {
      let receiptPaymentInfo = buildDeliveryReceiptPaymentInfo(
        order,
        latestPaidPayment,
      );
      const shouldRegisterPaymentOnDelivery =
        pendingAmount > 0 &&
        Boolean(deliveryPaymentMethod) &&
        Number(deliveryPaymentAmount) > 0.009;

      if (shouldRegisterPaymentOnDelivery) {
        if (Math.abs(Number(deliveryPaymentAmount) - pendingAmount) > 0.009) {
          throw new Error(`O pagamento precisa quitar o saldo pendente de ${formatCurrency(pendingAmount)}.`);
        }

        const paymentResult = await createOrderPayment({
          orderId: order.id,
          amount: Number(deliveryPaymentAmount),
          method: deliveryPaymentMethod as PaymentMethod,
          status: 'pago',
          notes: 'Pagamento registrado na confirmação da entrega.',
          createdBy: user?.id ?? null,
        });

        receiptPaymentInfo = buildDeliveryReceiptPaymentInfo(
          {
            ...order,
            amount_paid: paymentResult.summary.paidTotal,
            payment_method: deliveryPaymentMethod as PaymentMethod,
          } as Order,
          paymentResult.payment,
        );
      }

      const deliveryResult = await markOrderItemsDelivered({
        orderId: order.id,
        itemIds: selectedDeliveryItemIds,
        userId: user?.id ?? null,
      });

      const updatedOrder = deliveryResult?.order;

      if (!updatedOrder) {
        throw new Error('O sistema não retornou o pedido atualizado.');
      }

      const mergedOrder = {
        ...order,
        ...updatedOrder,
        customer: order.customer,
        company: order.company,
      } as Order;
      const receiptRecordedAt = mergedOrder.delivered_at || new Date().toISOString();
      const receiptOrder = isFinalDelivery
        ? buildDeliveredOrderSnapshot(mergedOrder, receiptRecordedAt)
        : mergedOrder;
      const receiptItems = buildDeliveryReceiptItemsSnapshot(
        items,
        selectedDeliveryItemIds,
        receiptRecordedAt,
      );
      const resolvedReceiptPayment =
        receiptPaymentInfo || buildDeliveryReceiptPaymentInfo(receiptOrder, latestPaidPayment);

      setOrder(mergedOrder);
      setDeliveryReceiptOrder(receiptOrder);
      setDeliveryReceiptPayment(resolvedReceiptPayment);
      setDeliveryReceiptItems(receiptItems);
      setDeliveryReceiptItemIds(selectedDeliveryItemIds);
      setDeliveryReceiptDeliveredAt(receiptRecordedAt);
      printDeliveryReceipt({
        deliveryOrder: receiptOrder,
        receiptItems,
        deliveredItemIds: selectedDeliveryItemIds,
        deliveredAt: receiptRecordedAt,
        paymentInfo: resolvedReceiptPayment,
        targetWindow: printWindow,
      });
      receiptPrinted = true;

      toast({
        title: isFinalDelivery
          ? shouldRegisterPaymentOnDelivery
            ? 'Entrega confirmada com pagamento registrado!'
            : pendingAmount > 0
              ? 'Entrega confirmada. Pedido aguardando pagamento.'
              : 'Entrega confirmada com sucesso!'
          : 'Entrega parcial registrada!',
        description: isFinalDelivery
          ? undefined
          : `${selectedDeliveryItems.length} item(ns) marcado(s) como entregue(s).`,
      });
      await fetchOrder(order.id);
    } catch (error: any) {
      if (!receiptPrinted && printWindow && !printWindow.closed) {
        printWindow.close();
      }
      toast({
        title: 'Erro ao confirmar entrega',
        description: error?.message,
        variant: 'destructive',
      });
    } finally {
      setDeliverySaving(false);
    }
  };

  const handlePrintPaymentReceipt = () => {
    if (!order || !receiptPayment || !paymentReceiptRef.current) {
      toast({ title: 'Recibo indisponível', variant: 'destructive' });
      return;
    }

    printReceipt(
      paymentReceiptRef.current,
      `Comprovante de pagamento - Pedido #${formatOrderNumber(order.order_number)}`,
    );
  };

  const handleDownloadPaymentReceipt = async () => {
    if (!order || !receiptPayment || !paymentReceiptRef.current) {
      toast({ title: 'Recibo indisponível', variant: 'destructive' });
      return;
    }

    const fileName = `comprovante-pagamento-pedido-${formatOrderNumber(order.order_number)}.pdf`;

    setPaymentReceiptLoading(true);
    try {
      await downloadReceiptMarkupAsPdf(
        paymentReceiptRef.current.outerHTML,
        fileName,
        'Comprovante baixado com sucesso',
      );
    } catch (error: any) {
      toast({
        title: 'Erro ao gerar comprovante',
        description: error?.message,
        variant: 'destructive',
      });
    } finally {
      setPaymentReceiptLoading(false);
    }
  };

  useEffect(() => {
    if (!routeParam) return;
    if (!orderId) {
      toast({ title: 'Pedido não encontrado', variant: 'destructive' });
      navigate('/pedidos');
      return;
    }
    fetchOrder(orderId);
  }, [orderId, routeParam]);

  useEffect(() => {
    if (!isBudget && isEditingItems) {
      setIsEditingItems(false);
      setEditableItems([]);
    }
  }, [isBudget, isEditingItems]);

  useEffect(() => {
    setNotesDraft(orderVisibleNotes);
    setShowNotesOnPdf(order?.show_notes_on_pdf !== false);
  }, [order?.id, order?.show_notes_on_pdf, orderVisibleNotes]);

  useEffect(() => {
    if (!order?.id) {
      autoLinkRequestOrderIdRef.current = null;
      return;
    }

    if (
      publicLinkToken ||
      linkLoading ||
      autoLinkRequestOrderIdRef.current === order.id
    ) {
      return;
    }

    let cancelled = false;
    autoLinkRequestOrderIdRef.current = order.id;

    const generatePublicLink = async () => {
      setLinkLoading(true);
      try {
        const token = await getOrCreatePublicLink(order.id);
        if (!cancelled) {
          setPublicLinkToken(token);
        }
      } catch (error: any) {
        if (!cancelled) {
          toast({
            title: 'Erro ao gerar link do cliente',
            description: error?.message,
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) {
          setLinkLoading(false);
        }
      }
    };

    void generatePublicLink();

    return () => {
      cancelled = true;
    };
  }, [linkLoading, order?.id, publicLinkToken, toast]);

  useEffect(() => {
    if (!order?.id) return;

    let cancelled = false;

    const syncPublicLinkToken = async () => {
      const { data, error } = await supabase
        .from('order_public_links')
        .select('token')
        .eq('order_id', order.id)
        .maybeSingle();

      if (!cancelled && !error && data?.token) {
        setPublicLinkToken(data.token);
        setLinkLoading(false);
      }
    };

    const channel = supabase
      .channel(`order-public-link-${order.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_public_links',
          filter: `order_id=eq.${order.id}`,
        },
        (payload) => {
          const nextToken =
            (payload.new as { token?: string | null } | null)?.token ||
            (payload.old as { token?: string | null } | null)?.token ||
            null;

          if (nextToken) {
            setPublicLinkToken(nextToken);
            setLinkLoading(false);
            return;
          }

          void syncPublicLinkToken();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void syncPublicLinkToken();
        }
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [order?.id]);

  const fetchOrder = async (targetOrderId: string | null = orderId) => {
    if (!targetOrderId) return;
    const [orderResult, itemsResult, historyResult, paymentsResult, linkResult, finalPhotosResult, artFilesResult] = await Promise.all([
      supabase.from('orders')
        .select('*, customer:customers(*), company:companies(*)')
        .eq('id', targetOrderId)
        .is('deleted_at', null)
        .single(),
      supabase.from('order_items').select('*').eq('order_id', targetOrderId).order('created_at'),
      supabase.from('order_status_history').select('*').eq('order_id', targetOrderId).order('created_at', { ascending: false }),
      supabase.from('order_payments').select('*').eq('order_id', targetOrderId).order('created_at', { ascending: false }),
      supabase.from('order_public_links').select('token').eq('order_id', targetOrderId).maybeSingle(),
      (supabase.from('order_final_photos' as any).select('*').eq('order_id', targetOrderId).order('created_at', { ascending: false })) as any,
      (supabase.from('order_art_files' as any).select('*').eq('order_id', targetOrderId).order('created_at', { ascending: false })) as any,
    ]) as any[];

    if (orderResult.error || !orderResult.data) {
      toast({ title: 'Pedido não encontrado', variant: 'destructive' });
      navigate('/pedidos');
      return;
    }

    const orderData = orderResult.data as Order;
    if (orderData.company) {
      orderData.company = {
        ...orderData.company,
        logo_url: orderData.company.logo_url
          ? ensurePublicStorageUrl('product-images', orderData.company.logo_url)
          : null,
        signature_image_url: orderData.company.signature_image_url
          ? ensurePublicStorageUrl('product-images', orderData.company.signature_image_url)
          : null,
      };
    }
    setOrder(orderData);
    setItems(itemsResult.data as OrderItem[] || []);
    setHistory(historyResult.data as OrderStatusHistory[] || []);
    setFinalPhotos(finalPhotosResult.data as OrderFinalPhoto[] || []);
    setArtFiles(artFilesResult.data as OrderArtFile[] || []);
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
      ...(artFilesResult.data || []).map((file: any) => file.created_by).filter(Boolean),
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

  const openMergeDialog = async () => {
    if (!order?.customer_id) {
      toast({ title: 'Associe um cliente ao pedido', variant: 'destructive' });
      return;
    }

    if (!canMergeOrders) {
      toast({
        title: 'Agrupamento indisponível',
        description: 'Somente pedidos em aberto e sem pagamentos podem ser agrupados.',
        variant: 'destructive',
      });
      return;
    }

    setMergeDialogOpen(true);
    setMergeOrdersLoading(true);
    setSelectedMergeOrderIds([]);

    try {
      const candidates = await fetchMergeableCustomerOrders({
        targetOrderId: order.id,
        customerId: order.customer_id,
      });
      setMergeCandidates(candidates);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar pedidos',
        description: error?.message,
        variant: 'destructive',
      });
      setMergeDialogOpen(false);
    } finally {
      setMergeOrdersLoading(false);
    }
  };

  const handleToggleMergeOrder = (orderIdToToggle: string, checked: boolean) => {
    setSelectedMergeOrderIds((prev) => {
      if (checked) {
        if (prev.includes(orderIdToToggle)) return prev;
        return [...prev, orderIdToToggle];
      }
      return prev.filter((item) => item !== orderIdToToggle);
    });
  };

  const handleMergeOrders = async () => {
    if (!order) return;
    if (selectedMergeOrderIds.length === 0) {
      toast({ title: 'Selecione ao menos um pedido', variant: 'destructive' });
      return;
    }

    setMergeOrdersSaving(true);
    try {
      await mergeCustomerOrders({
        targetOrderId: order.id,
        sourceOrderIds: selectedMergeOrderIds,
        userId: user?.id || null,
      });
      setMergeDialogOpen(false);
      setSelectedMergeOrderIds([]);
      setMergeCandidates([]);
      toast({
        title: 'Pedidos agrupados com sucesso!',
        description: 'O desconto geral foi preservado e convertido para valor fixo, se necessário.',
      });
      await fetchOrder(order.id);
    } catch (error: any) {
      toast({
        title: 'Erro ao agrupar pedidos',
        description: error?.message,
        variant: 'destructive',
      });
    } finally {
      setMergeOrdersSaving(false);
    }
  };


  const formatDate = (d: string) =>
    new Date(d).toLocaleString('pt-BR');

  const handleSaveOrderNotes = async () => {
    if (!order) return;

    setSavingNotes(true);

    const nextNotes = mergeOrderNotes({
      existingValue: notesSourceForDisplay,
      visibleNotes: notesDraft,
    });

    const { error } = await supabase
      .from('orders')
      .update({
        notes: nextNotes,
        show_notes_on_pdf: showNotesOnPdf,
        updated_by: user?.id || null,
      })
      .eq('id', order.id);

    if (error) {
      toast({ title: 'Erro ao salvar observações', description: error.message, variant: 'destructive' });
      setSavingNotes(false);
      return;
    }

    setOrder((prev) =>
      prev
        ? {
          ...prev,
          notes: nextNotes,
          show_notes_on_pdf: showNotesOnPdf,
          updated_by: user?.id || prev.updated_by,
        }
        : prev,
    );
    toast({ title: 'Observações atualizadas' });
    setSavingNotes(false);
  };

  const handleOpenStatusDialog = () => {
    const initialItem =
      items.find((item) => !isCanceledItem(item)) ||
      items[0] ||
      null;

    setStatusItemId(initialItem?.id || '');
    setNewStatus('');
    setStatusNotes('');
    setStatusDialogOpen(true);
  };

  const handleOpenPhoto = (photo: { url: string; created_at: string }) => {
    setSelectedPhoto(photo);
    setPhotoViewerOpen(true);
  };

  const getPublicLinkUrl = (token: string) => `${window.location.origin}/pedido/${token}`;
  const publicLink = publicLinkToken ? getPublicLinkUrl(publicLinkToken) : '';
  const messageLink = publicLink || '[link]';
  const resolveMessageForSend = (url: string) => {
    if (!messageDirty) return buildWhatsAppMessage(url);
    const resolved = applyTemplateReplacements(messageText, getWhatsAppTemplateReplacements(url));
    return resolved.split('[link]').join(url);
  };

  const clientMessage = messageDirty ? messageText : buildWhatsAppMessage(messageLink);
  const suggestedArtFileName = useMemo(
    () =>
      buildSuggestedOrderFileName({
        customerName: order?.customer?.name || order?.customer_name || 'Cliente',
        productName: items[0]?.product_name || 'Arte',
        orderNumber: order?.order_number,
        date: order?.created_at,
        fallbackBaseName: 'arte',
      }),
    [items, order?.created_at, order?.customer?.name, order?.customer_name, order?.order_number],
  );
  const ensurePublicLink = async () => {
    if (!order) return null;
    if (publicLinkToken) return publicLinkToken;
    autoLinkRequestOrderIdRef.current = order.id;
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

  const handleCopySuggestedArtFileName = async () => {
    const copied = await copyToClipboard(suggestedArtFileName);
    if (!copied) {
      toast({ title: 'Falha ao copiar', description: 'Tente novamente.', variant: 'destructive' });
      return;
    }
    setCopiedLink('art-file');
    setTimeout(() => setCopiedLink(null), 2000);
    toast({ title: 'Nome do arquivo copiado' });
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
      toast({ title: 'Pedido excluído com sucesso!' });
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
    setReceiptPayment(payment);
    setReceiptDialogOpen(true);
  };

  const openPaymentDialog = () => {
    if (!order) return;
    const creditUsedAmount = Number(order.customer_credit_used ?? 0);
    const remaining = Math.max(0, Number(order.total) - Number(order.amount_paid) - creditUsedAmount);
    if (remaining <= 0) {
      toast({ title: 'Pedido já quitado', description: 'Não há saldo pendente.', variant: 'destructive' });
      return;
    }
    setPaymentAmount(remaining);
    setPaymentAmountTouched(false);
    setPaymentDiscountType(savedOrderDiscount.discountType);
    setPaymentDiscountValue(savedOrderDiscount.discountValue);
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod(order.payment_method || '');
    setPaymentStatus('pago');
    setPaymentNotes('');
    setPaymentDialogOpen(true);
  };

  const fetchCustomerCredit = async (customerId?: string | null) => {
    if (!customerId) {
      setCustomerAvailableCredit(0);
      return;
    }
    const { data, error } = await supabase
      .from('customers')
      .select('saldo_credito')
      .eq('id', customerId)
      .maybeSingle();
    if (error || !data) {
      setCustomerAvailableCredit(0);
      return;
    }
    setCustomerAvailableCredit(Number(data.saldo_credito ?? 0));
  };

  const openCreditDialog = async () => {
    if (!order || !order.customer_id) return;
    await fetchCustomerCredit(order.customer_id);
    const creditUsedAmount = Number(order.customer_credit_used ?? 0);
    const remaining = Math.max(0, Number(order.total) - Number(order.amount_paid) - creditUsedAmount);
    if (remaining <= 0) {
      toast({ title: 'Pedido já quitado', variant: 'destructive' });
      return;
    }
    const { data: freshCustomer } = await supabase
      .from('customers')
      .select('saldo_credito')
      .eq('id', order.customer_id)
      .maybeSingle();
    const availableCredit = Number(freshCustomer?.saldo_credito ?? 0);
    setCustomerAvailableCredit(availableCredit);
    if (availableCredit <= 0) {
      toast({ title: 'Cliente sem saldo de crédito', variant: 'destructive' });
      return;
    }
    setCreditAmount(Math.min(availableCredit, remaining));
    setCreditNotes('');
    setCreditDialogOpen(true);
  };

  const handleApplyCredit = async () => {
    if (!order) return;
    if (creditAmount <= 0) {
      toast({ title: 'Informe um valor válido', variant: 'destructive' });
      return;
    }
    setCreditSaving(true);
    try {
      await applyCustomerCreditToOrder({
        orderId: order.id,
        amount: creditAmount,
        notes: creditNotes || undefined,
      });
      toast({ title: 'Crédito aplicado com sucesso!' });
      setCreditDialogOpen(false);
      fetchOrder();
    } catch (error: any) {
      toast({ title: 'Erro ao aplicar crédito', description: error?.message, variant: 'destructive' });
    } finally {
      setCreditSaving(false);
    }
  };

  const handleCreatePayment = async () => {
    if (!order) return;
    const paymentDiscountChanged =
      paymentDiscountType !== savedOrderDiscount.discountType ||
      Math.abs(paymentDiscountValue - savedOrderDiscount.discountValue) > 0.009;

    if (!paymentMethod) {
      toast({ title: 'Selecione a forma de pagamento', variant: 'destructive' });
      return;
    }

    if (paymentAmount <= 0) {
      toast({ title: 'Informe um valor válido', variant: 'destructive' });
      return;
    }

    if (paymentDiscountInvalid) {
      toast({
        title: 'Desconto inválido',
        description: 'O desconto não pode reduzir o total abaixo do valor já quitado.',
        variant: 'destructive',
      });
      return;
    }

    if (paymentAmount > paymentRemainingAmount && paymentStatus === 'pendente') {
      toast({ title: 'Valor excede o saldo restante', variant: 'destructive' });
      return;
    }

    if (paymentAmount > paymentRemainingAmount && !order.customer_id) {
      toast({ title: 'Associe um cliente ao pedido para gerar crédito do excedente', variant: 'destructive' });
      return;
    }

    setPaymentSaving(true);
    try {
      const result = await createOrderPayment({
        orderId: order.id,
        amount: paymentAmount,
        method: paymentMethod as PaymentMethod,
        status: paymentStatus,
        paidAt: paymentStatus === 'pendente' ? null : resolvePaidAtIso(paymentDate),
        notes: paymentNotes || undefined,
        createdBy: user.id,
        orderDiscountType: paymentDiscountChanged ? paymentDiscountType : undefined,
        orderDiscountValue: paymentDiscountChanged ? paymentDiscountValue : undefined,
      });

      const creditGenerated = Number(result.payment?.generated_credit_amount ?? 0);
      if (creditGenerated > 0) {
        toast({ title: 'Pagamento registrado com sucesso!', description: `Crédito de ${formatCurrency(creditGenerated)} gerado para o cliente.` });
      } else {
        toast({ title: 'Pagamento registrado com sucesso!' });
      }
      setPaymentDialogOpen(false);
      setReceiptPayment(result.payment);
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
    if (statusTargetIsItem && !selectedStatusItem) {
      toast({ title: 'Selecione um produto', variant: 'destructive' });
      return;
    }

    if (entrada && entrada > 0 && !entryMethod) {
      toast({ title: 'Selecione a forma de pagamento', variant: 'destructive' });
      return;
    }

    if ((newStatus === 'finalizado' || newStatus === 'pronto') && finalPhotos.length === 0) {
      toast({
        title: 'Foto obrigatória',
        description: 'E necessario anexar pelo menos uma foto do produto final antes de alterar o status.',
        variant: 'destructive',
      });
      setStatusDialogOpen(false);
      return;
    }

    if (newStatus === 'arte_aprovada' && artFiles.length === 0) {
      toast({
        title: 'Arquivo obrigatório',
        description: 'Anexe pelo menos um arquivo da arte antes de finalizar.',
        variant: 'destructive',
      });
      setStatusDialogOpen(false);
      return;
    }

    setSaving(true);

    const trimmedNotes = statusNotes.trim();
    const artNote =
      newStatus === 'arte_aprovada'
        ? `Arquivos da arte anexados (${artFiles.length}).`
        : '';
    const resolvedNotes = [trimmedNotes, artNote].filter(Boolean).join(' ');

    try {
      if (statusTargetIsItem && selectedStatusItem) {
        await updateOrderItemStatus({
          orderId: order.id,
          itemId: selectedStatusItem.id,
          status: newStatus,
          notes: resolvedNotes || undefined,
          userId: user.id,
        });
      } else {
        await updateOrderStatus({
          orderId: order.id,
          status: newStatus,
          notes: resolvedNotes || undefined,
          userId: user.id,
          entrada: entrada ?? null,
          paymentMethod: entrada && entryMethod ? entryMethod : undefined,
        });
      }

      toast({ title: statusTargetIsItem ? 'Status do produto atualizado com sucesso!' : 'Status atualizado com sucesso!' });
      setStatusDialogOpen(false);
      setEntryDialogOpen(false);

      if (!statusTargetIsItem && order.customer?.phone) {
        const statusLabel = statusLabels[newStatus] ?? newStatus;
        const approved = await confirm({
          title: 'Enviar WhatsApp?',
          description: `Status alterado para "${statusLabel}". Deseja enviar mensagem no WhatsApp para o cliente?`,
          confirmText: 'Enviar',
          cancelText: 'Agora não',
        });
        if (approved) {
          setTimeout(() => handleSendWhatsAppUpdate(), 500);
        }
      }

      setNewStatus('');
      setStatusItemId('');
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

    if (!statusTargetIsItem && order.status === 'orcamento' && newStatus === 'pendente') {
      setEntryMethod(order.payment_method || '');
      setEntryDialogOpen(true);
      return;
    }
    await applyStatusChange();
  };

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingArtFile, setUploadingArtFile] = useState(false);
  const artFileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!order || !e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    setUploadingPhoto(true);

    try {
      const { uploadOrderFinalPhoto } = await import('@/services/orders');
      const photo = await uploadOrderFinalPhoto(order.id, file, user.id);

      setFinalPhotos(prev => [photo as any as OrderFinalPhoto, ...prev]);
      toast({ title: 'Foto enviada com sucesso!' });
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Erro ao enviar foto', description: error.message, variant: 'destructive' });
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const allowedArtMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

  const normalizeClipboardFile = (file: File, index: number) => {
    if (file.name && file.name !== 'image.png') {
      return file;
    }
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'png';
    return new File([file], `arte-${Date.now()}-${index}.${extension}`, { type: file.type || 'image/png' });
  };

  const buildSuggestedArtFileDisplayName = (file: File) =>
    sanitizeDisplayFileName(
      buildSuggestedOrderFileName({
        customerName: order?.customer?.name || order?.customer_name || 'Cliente',
        productName: items[0]?.product_name || 'Arte',
        orderNumber: order?.order_number,
        date: order?.created_at,
        originalFileName: file.name,
        fallbackBaseName: 'arte',
      }),
      file.name,
      'arte',
    );

  const queueArtFilesForUpload = (files: File[]) => {
    if (!order || files.length === 0) return;

    const validFiles = files.filter((file) => {
      if (allowedArtMimeTypes.includes(file.type)) return true;
      toast({
        title: 'Arquivo inválido',
        description: 'Use JPG, PNG, WEBP ou PDF.',
        variant: 'destructive',
      });
      return false;
    });

    if (validFiles.length === 0) return;

    setPendingArtUploads(
      validFiles.map((file, index) => ({
        id:
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${index}`,
        file,
        displayName: buildSuggestedArtFileDisplayName(file),
      })),
    );
    setArtUploadDialogOpen(true);
  };

  const handlePendingArtUploadNameChange = (id: string, value: string) => {
    setPendingArtUploads((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
            ...item,
            displayName: sanitizeDisplayFileName(value, item.file.name, 'arte'),
          }
          : item,
      ),
    );
  };

  const handleRemovePendingArtUpload = (id: string) => {
    setPendingArtUploads((prev) => prev.filter((item) => item.id !== id));
  };

  const confirmArtFilesUpload = async () => {
    if (!order || pendingArtUploads.length === 0) return;
    setUploadingArtFile(true);
    const uploaded: OrderArtFile[] = [];
    try {
      const { uploadOrderArtFile } = await import('@/services/orders');
      for (const item of pendingArtUploads) {
        const artFile = await uploadOrderArtFile(order.id, item.file, user.id, {
          customerId: order.customer_id || null,
          displayFileName: item.displayName,
        });
        uploaded.push(artFile as any as OrderArtFile);
      }

      if (uploaded.length > 0) {
        setArtFiles((prev) => [...uploaded, ...prev]);
        toast({ title: 'Arquivos enviados com sucesso!' });
      }

      setArtUploadDialogOpen(false);
      setPendingArtUploads([]);
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Erro ao enviar arquivos', description: error?.message, variant: 'destructive' });
    } finally {
      setUploadingArtFile(false);
      if (artFileInputRef.current) artFileInputRef.current.value = '';
    }
  };

  const uploadArtFiles = async (files: File[]) => {
    if (!order || files.length === 0) return;
    setUploadingArtFile(true);
    const uploaded: OrderArtFile[] = [];
    try {
      const { uploadOrderArtFile } = await import('@/services/orders');
      for (const file of files) {
        if (!allowedArtMimeTypes.includes(file.type)) {
          toast({
            title: 'Arquivo inválido',
            description: 'Use JPG, PNG ou PDF.',
            variant: 'destructive',
          });
          continue;
        }
        const artFile = await uploadOrderArtFile(order.id, file, user.id);
        uploaded.push(artFile as any as OrderArtFile);
      }

      if (uploaded.length > 0) {
        setArtFiles((prev) => [...uploaded, ...prev]);
        toast({ title: 'Arquivos enviados com sucesso!' });
      }
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Erro ao enviar arquivos', description: error?.message, variant: 'destructive' });
    } finally {
      setUploadingArtFile(false);
      if (artFileInputRef.current) artFileInputRef.current.value = '';
    }
  };

  const handleArtFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    queueArtFilesForUpload(files);
  };

  const handleArtPaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (!order || order.status !== 'produzindo_arte') return;
    const items = Array.from(event.clipboardData?.items || []);
    const imageFiles = items
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];

    if (imageFiles.length === 0) return;
    event.preventDefault();
    const normalized = imageFiles.map((file, index) => normalizeClipboardFile(file, index));
    queueArtFilesForUpload(normalized);
  };

  const handleReceiptDialogChange = (open: boolean) => {
    setReceiptDialogOpen(open);
    if (!open) {
      setReceiptPayment(null);
      setPaymentReceiptLoading(false);
    }
  };

  const handleCancelPayment = async (paymentId: string) => {
    if (!order) return;
    const approved = await confirm({
      title: 'Cancelar pagamento',
      description: 'Cancelar este pagamento?',
      confirmText: 'Cancelar',
      cancelText: 'Voltar',
      destructive: true,
    });
    if (!approved) return;
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
    const approved = await confirm({
      title: 'Excluir pagamento',
      description: 'Excluir este pagamento? Esta ação não pode ser desfeita.',
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      destructive: true,
    });
    if (!approved) return;
    setPaymentActionId(paymentId);
    setPaymentActionType('delete');
    try {
      await deleteOrderPayment(order.id, paymentId);
      toast({ title: 'Pagamento excluído' });
      fetchOrder();
    } catch (error: any) {
      toast({ title: 'Erro ao excluir pagamento', description: error?.message, variant: 'destructive' });
    } finally {
      setPaymentActionId(null);
      setPaymentActionType(null);
    }
  };

  const editableItemsSnapshot = useMemo(() => (
    editableItems.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_type: item.discount_type,
      discount_value: item.discount_value,
      attributes: item.attributes,
    }))
  ), [editableItems]);
  const itemsSnapshot = useMemo(() => (
    items.map((item) => {
      const discountState = getItemDiscountState(item);
      return {
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_type: discountState.discountType,
        discount_value: discountState.discountValue,
        attributes: item.attributes,
      };
    })
  ), [items]);
  const savedOrderDiscount = getSavedOrderDiscountState();
  const paymentSubtotal = calculateSubtotal(items);
  const paymentDiscountAmount = calculateOrderDiscountAmount(
    paymentSubtotal,
    paymentDiscountType,
    paymentDiscountValue,
  );
  const paymentOrderTotal = calculateOrderTotal(
    paymentSubtotal,
    paymentDiscountType,
    paymentDiscountValue,
  );
  const paymentSettledAmount =
    Number(order?.amount_paid ?? 0) +
    Number(order?.customer_credit_used ?? 0);
  const paymentOutstandingAfterDiscount = roundCurrency(paymentOrderTotal - paymentSettledAmount);
  const paymentDiscountInvalid = paymentOutstandingAfterDiscount < -0.009;
  const paymentRemainingAmount = Math.max(0, paymentOutstandingAfterDiscount);
  const itemsDirty = isEditingItems && (
    JSON.stringify(editableItemsSnapshot) !== JSON.stringify(itemsSnapshot) ||
    orderDiscountType !== savedOrderDiscount.discountType ||
    Math.abs(orderDiscountValue - savedOrderDiscount.discountValue) > 0.009
  );
  const pendingItemInput = isEditingItems && (newItemProductId || newItemQuantity !== 1);
  const statusDirty = statusDialogOpen && (newStatus || statusNotes.trim() || entryDialogOpen || entryAmount > 0 || entryMethod);
  const paymentDirty = paymentDialogOpen && (paymentNotes.trim() || paymentMethod || paymentAmount > 0);
  const cancelDirty = cancelDialogOpen && (cancelReason.trim() || cancelConfirmPaid);
  const customerDirty = customerDialogOpen && (
    customerNameDraft.trim() !== (order?.customer?.name || order?.customer_name || '') ||
    (customerDraft?.id || null) !== (order?.customer?.id || null)
  );
  const hasUnsavedChanges = messageDirty
    || itemsDirty
    || pendingItemInput
    || statusDirty
    || paymentDirty
    || cancelDirty
    || customerDirty
    || uploadingPhoto
    || uploadingArtFile;

  useEffect(() => {
    if (!paymentDialogOpen || paymentAmountTouched) return;
    setPaymentAmount(paymentRemainingAmount);
  }, [paymentAmountTouched, paymentDialogOpen, paymentRemainingAmount]);

  useUnsavedChanges(
    hasUnsavedChanges && !saving && !savingItems && !paymentSaving && !cancelLoading && !deleteLoading
  );
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
  const creditUsed = Number(order.customer_credit_used ?? 0);
  const generatedCredit = Number(order.customer_credit_generated ?? 0);
  const remainingAmount = Math.max(0, orderTotal - paidTotal - creditUsed);
  const isOrderPaid = remainingAmount <= 0;
  const hasRegisteredPayments =
    payments.length > 0 || paidTotal > 0.009 || creditUsed > 0.009;
  const canMergeOrders =
    order.status !== 'cancelado' &&
    Boolean(order.customer_id) &&
    !hasRegisteredPayments;
  const selectedMergeOrders = mergeCandidates.filter((candidate) =>
    selectedMergeOrderIds.includes(candidate.id),
  );
  const mergeSelectedTotal = selectedMergeOrders.reduce(
    (sum, candidate) => sum + Number(candidate.total || 0),
    0,
  );
  const mergeProjectedTotal = orderTotal + mergeSelectedTotal;
  const hasCustomerCredit = Boolean(order.customer_id) && customerAvailableCredit > 0;
  const canUseCredit = hasCustomerCredit && !isOrderPaid;
  const latestPaidPayment = payments.find((payment) => payment.status !== 'pendente') || null;
  const isCanceledItem = (item: OrderItem) => item.status === 'cancelado';
  const getItemReadyAt = (item: OrderItem) => item.ready_at || item.delivered_at || null;
  const activeItems = items.filter((item) => !isCanceledItem(item));
  const readyItems = activeItems.filter((item) => Boolean(getItemReadyAt(item)));
  const pendingReadyItems = activeItems.filter((item) => !getItemReadyAt(item));
  const readyCompletedFromItems =
    activeItems.length > 0
      ? pendingReadyItems.length === 0
      : ['finalizado', 'pronto', 'aguardando_retirada', 'entregue'].includes(order.status);
  const partialReadyRegistered =
    readyItems.length > 0 && pendingReadyItems.length > 0;
  const selectedReadyItems = pendingReadyItems.filter((item) =>
    readyItemIds.includes(item.id),
  );
  const selectedReadyCompletesOrder =
    !readyCompletedFromItems &&
    pendingReadyItems.length > 0 &&
    selectedReadyItems.length === pendingReadyItems.length;
  const latestReadyItemAt = readyItems.reduce<string | null>((latest, item) => {
    const readyAt = getItemReadyAt(item);
    if (!readyAt) return latest;
    if (!latest) return readyAt;
    return new Date(readyAt) > new Date(latest) ? readyAt : latest;
  }, null);
  const deliveredItems = activeItems.filter((item) => Boolean(item.delivered_at));
  const undeliveredItems = activeItems.filter((item) => !item.delivered_at);
  const pendingDeliveryItems = undeliveredItems.filter((item) => Boolean(getItemReadyAt(item)));
  const blockedDeliveryItems = undeliveredItems.filter((item) => !getItemReadyAt(item));
  const deliveryCompletedFromItems =
    activeItems.length > 0 ? undeliveredItems.length === 0 : order.status === 'entregue';
  const partialDeliveryRegistered =
    deliveredItems.length > 0 && undeliveredItems.length > 0;
  const selectedDeliveryItems = pendingDeliveryItems.filter((item) =>
    deliveryItemIds.includes(item.id),
  );
  const selectedDeliveryCompletesOrder =
    !deliveryCompletedFromItems &&
    undeliveredItems.length > 0 &&
    selectedDeliveryItems.length === undeliveredItems.length;
  const latestDeliveredItemAt = deliveredItems.reduce<string | null>((latest, item) => {
    if (!item.delivered_at) return latest;
    if (!latest) return item.delivered_at;
    return new Date(item.delivered_at) > new Date(latest) ? item.delivered_at : latest;
  }, null);
  const deliveryLatestBatchItemIds = latestDeliveredItemAt
    ? deliveredItems
        .filter(
          (item) =>
            item.delivered_at &&
            new Date(item.delivered_at).getTime() === new Date(latestDeliveredItemAt).getTime(),
        )
        .map((item) => item.id)
    : [];
  const statusTargetIsItem = items.length > 1;
  const selectedStatusItem =
    (statusTargetIsItem
      ? items.find((item) => item.id === statusItemId)
      : items[0]) || null;
  const statusSource = selectedStatusItem?.status || order.status;
  const statusDialogConfig = statusConfig[statusSource];
  const statusDialogNextOptions = statusTargetIsItem
    ? statusDialogConfig.next.filter(
        (status) => !['finalizado', 'pronto', 'aguardando_retirada', 'entregue'].includes(status),
      )
    : statusDialogConfig.next;
  const statusTargetLabel = statusTargetIsItem ? 'Produto' : 'Pedido';
  const hasStatusDialogOptions = statusTargetIsItem
    ? items.some((item) =>
        statusConfig[item.status].next.some(
          (status) => !['finalizado', 'pronto', 'aguardando_retirada', 'entregue'].includes(status),
        ),
      )
    : statusConfig[order.status].next.length > 0;

  const config = statusConfig[order.status];
  const StatusIcon = config.icon;
  const currentStatusLabel = getOrderStatusLabel(
    order.status,
    orderStatusCustomization,
    order.payment_status,
  );
  const currentStatusBadgeStyle = getOrderStatusBadgeStyle(order.status, orderStatusCustomization);
  const canSendWhatsApp = Boolean(order?.customer?.phone);
  const readyAllowedStatuses = [
    'em_producao',
    'finalizado',
    'pronto',
    'aguardando_retirada',
  ];
  const canManageReady =
    readyAllowedStatuses.includes(order.status) &&
    hasPermission(['admin', 'atendente', 'caixa', 'producao']);
  const deliveryAllowedStatuses = [
    'em_producao',
    'pronto',
    'finalizado',
    'aguardando_retirada',
    'entregue',
  ];
  const canManageDelivery =
    deliveryAllowedStatuses.includes(order.status) &&
    hasPermission(['admin', 'atendente', 'caixa', 'producao']);
  const deliveryReceiptSource =
    deliveryCompletedFromItems
      ? buildDeliveredOrderSnapshot(deliveryReceiptOrder || order, latestDeliveredItemAt)
      : deliveryReceiptOrder;
  const deliveryReceiptSourceItems =
    deliveryReceiptItems.length > 0 ? deliveryReceiptItems : items;
  const deliveryReceiptSelectedItemIds =
    deliveryReceiptItemIds.length > 0
      ? deliveryReceiptItemIds
      : deliveryCompletedFromItems
        ? deliveryLatestBatchItemIds.length > 0
          ? deliveryLatestBatchItemIds
          : deliveredItems.map((item) => item.id)
        : [];
  const deliveryRecordedAt =
    deliveryReceiptDeliveredAt || deliveryReceiptSource?.delivered_at || latestDeliveredItemAt || null;
  const deliveryCompleted = deliveryCompletedFromItems;
  const deliveryReceiptAvailable =
    Boolean(deliveryReceiptSource) &&
    deliveryReceiptSelectedItemIds.length > 0 &&
    Boolean(deliveryRecordedAt);
  const deliveryDialogShowsReceipt = deliveryCompleted || deliveryReceiptAvailable;
  const deliveryReceiptActiveItems = deliveryReceiptSourceItems.filter((item) => !isCanceledItem(item));
  const deliveryReceiptDeliveredCount = deliveryReceiptActiveItems.filter((item) => Boolean(item.delivered_at)).length;
  const deliveryReceiptIsTotal =
    deliveryReceiptActiveItems.length > 0 &&
    deliveryReceiptDeliveredCount === deliveryReceiptActiveItems.length;
  const deliveryCustomerName = order.customer?.name || order.customer_name || 'Cliente não informado';
  const deliveryCustomerPhone = order.customer?.phone || '-';
  const deliveryPendingAmount =
    deliveryCompleted || !selectedDeliveryCompletesOrder ? 0 : remainingAmount;
  const hasPendingPaymentAtDelivery =
    !deliveryCompleted && selectedDeliveryCompletesOrder && deliveryPendingAmount > 0;
  const shouldRegisterPaymentOnDelivery =
    hasPendingPaymentAtDelivery &&
    Boolean(deliveryPaymentMethod) &&
    Number(deliveryPaymentAmount) > 0.009;
  const deliveryPaymentInfo =
    deliveryReceiptPayment ||
    (deliveryReceiptSource ? buildDeliveryReceiptPaymentInfo(deliveryReceiptSource, latestPaidPayment) : null);
  const readyConfirmDisabled =
    readySaving || (!readyCompletedFromItems && selectedReadyItems.length === 0);
  const readyActionLabel = readyCompletedFromItems
    ? 'Itens prontos'
    : partialReadyRegistered
      ? 'Gerenciar prontos'
      : 'Marcar pronto';
  const readyPrimaryActionLabel = readyCompletedFromItems
    ? ''
    : selectedReadyCompletesOrder
      ? 'Marcar tudo como pronto'
      : 'Registrar itens prontos';
  const deliveryConfirmDisabled =
    deliverySaving || (!deliveryCompleted && selectedDeliveryItems.length === 0);
  const deliveryActionLabel = deliveryCompleted
    ? 'Comprovante de entrega'
    : partialDeliveryRegistered
      ? 'Gerenciar entrega'
      : 'Confirmar entrega';
  const deliveryPrimaryActionLabel = deliveryCompleted
    ? ''
    : selectedDeliveryCompletesOrder
      ? shouldRegisterPaymentOnDelivery
        ? 'Quitar e entregar'
        : hasPendingPaymentAtDelivery
          ? 'Entregar com saldo pendente'
          : 'Confirmar entrega'
      : 'Registrar entrega parcial';
  const publicLinkLabel = linkLoading
    ? 'Gerando...'
    : publicLinkToken
      ? copiedLink === 'public'
        ? 'Copiado'
        : 'Copiar'
      : 'Tentar novamente';
  const messageLabel = linkLoading
    ? 'Gerando...'
    : copiedLink === 'message'
      ? 'Copiado'
      : 'Copiar';
  const suggestedArtFileLabel = copiedLink === 'art-file' ? 'Copiado' : 'Copiar nome do arquivo';
  const finalPhotosWithUrls = finalPhotos.map((photo) => ({
    ...photo,
    url: ensurePublicStorageUrl('order-final-photos', photo.storage_path),
  }));
  const artFilesWithUrls = artFiles.map((file) => ({
    ...file,
    url: ensurePublicStorageUrl('order-art-files', file.storage_path),
    isImage: file.file_type ? file.file_type.startsWith('image/') : false,
  }));
  const artFilesReady = artFilesWithUrls.filter((file) => file.url);
  const pricingItems = isEditingItems ? editableItems : items;
  const editingGrossSubtotal = calculateGrossSubtotal(pricingItems);
  const editingItemsDiscount = calculateItemsDiscountTotal(pricingItems);
  const activeOrderDiscountType = isEditingItems ? orderDiscountType : savedOrderDiscount.discountType;
  const activeOrderDiscountValue = isEditingItems ? orderDiscountValue : savedOrderDiscount.discountValue;
  const editingSubtotal = calculateSubtotal(pricingItems);
  const editingOrderDiscount = calculateOrderDiscountAmount(
    editingSubtotal,
    activeOrderDiscountType,
    activeOrderDiscountValue,
  );
  const editingTotal = calculateOrderTotal(
    editingSubtotal,
    activeOrderDiscountType,
    activeOrderDiscountValue,
  );
  const newItemProduct = products.find((product) => product.id === newItemProductId);
  const newItemIsM2 = newItemProduct ? isAreaUnit(newItemProduct.unit) : false;
  const newItemWidthValue = parseMeasurementInput(newItemWidthCm);
  const newItemHeightValue = parseMeasurementInput(newItemHeightCm);
  const newItemArea =
    newItemIsM2 &&
      typeof newItemWidthValue === 'number' &&
      typeof newItemHeightValue === 'number' &&
      newItemWidthValue > 0 &&
      newItemHeightValue > 0
      ? calculateAreaM2(newItemWidthValue, newItemHeightValue)
      : 0;
  const artIndicator =
    order.status === 'pendente'
      ? { label: 'Arte: aguardando definição', color: 'bg-slate-100 text-slate-600' }
      : order.status === 'produzindo_arte'
        ? { label: 'Arte: em produção', color: 'bg-indigo-100 text-indigo-800' }
        : order.status === 'arte_aprovada'
          ? { label: 'Arte: aprovada', color: 'bg-emerald-100 text-emerald-800' }
          : null;
  const pendingCustomerInfo =
    order.status === 'pendente' && isPendingCustomerInfoOrder(order.notes);
  const personalizedOrder = isPublicCatalogPersonalizedOrder(order.notes);
  const canManageArtFiles = order.status === 'produzindo_arte';
  const showArtFilesSection = canManageArtFiles || artFilesReady.length > 0;

  return (
    <div className="page-container w-full max-w-none">
      <div className="page-header">
        <div className="flex items-start gap-3 sm:items-center sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/pedidos')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="page-title flex flex-wrap items-center gap-2 sm:gap-3">
              Pedido #{formatOrderNumber(order.order_number)}
              <span className="status-badge" style={currentStatusBadgeStyle}>
                <StatusIcon className="h-4 w-4 mr-1" />
                {currentStatusLabel}
              </span>
              {artIndicator && (
                <span className={`status-badge ${artIndicator.color}`}>
                  {artIndicator.label}
                </span>
              )}
              {pendingCustomerInfo && (
                <span className="status-badge bg-slate-100 text-slate-700">
                  Aguardando informações do cliente
                </span>
              )}
              {personalizedOrder && (
                <span className="status-badge bg-indigo-100 text-indigo-800">
                  Pedido personalizado
                </span>
              )}
            </h1>
            <p className="text-muted-foreground">Criado em {formatDate(order.created_at)}</p>
          </div>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          {canManageReady && (
            <Button
              onClick={handleOpenReadyDialog}
              variant={readyCompletedFromItems ? 'outline' : 'default'}
              className="w-full sm:w-auto"
            >
              <Package className="mr-2 h-4 w-4" />
              {readyActionLabel}
            </Button>
          )}
          {canManageDelivery && (
            <Button onClick={handleOpenDeliveryDialog} className="w-full sm:w-auto">
              <Truck className="mr-2 h-4 w-4" />
              {deliveryCompleted ? 'Reimprimir Comprovante' : deliveryActionLabel}
            </Button>
          )}
          {order.status !== 'cancelado' && (
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(true)}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
          )}
          {['orcamento', 'pendente'].includes(order.status) && (
            <Button
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
              className="w-full sm:w-auto"
            >
              Excluir
            </Button>
          )}
          {hasStatusDialogOptions && hasPermission(['admin', 'atendente', 'caixa', 'producao']) && (
            <Button onClick={handleOpenStatusDialog} className="w-full sm:w-auto">
              Alterar Status
            </Button>
          )}
          <Button variant="outline" onClick={handlePrint} className="w-full sm:w-auto">
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>
          <Button variant="outline" onClick={handleDownloadOrderPdf} className="w-full sm:w-auto">
            <FileDown className="mr-2 h-4 w-4" />
            Baixar PDF
          </Button>
          <Button variant="outline" onClick={handleWhatsApp} disabled={!order?.customer?.phone} className="w-full sm:w-auto">
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                readOnly
                value={publicLink}
                placeholder={linkLoading ? 'Gerando link automaticamente...' : 'Link indisponível no momento'}
              />
              <Button
                variant="outline"
                onClick={handleCopyPublicLink}
                disabled={linkLoading}
                className="w-full gap-2 sm:w-auto"
              >
                <Copy className="h-4 w-4" />
                {publicLinkLabel}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Sugestão de nome do arquivo da arte</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                readOnly
                value={suggestedArtFileName}
                placeholder="Nome da arte"
              />
              <Button
                variant="outline"
                onClick={handleCopySuggestedArtFileName}
                className="w-full gap-2 sm:w-auto"
              >
                <Copy className="h-4 w-4" />
                {suggestedArtFileLabel}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use este nome ao salvar a arte no CorelDRAW, Illustrator ou outro editor. A extensão pode ser adicionada no momento do salvamento.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Mensagem para o cliente</Label>
            <div className="flex flex-col gap-2 md:flex-row md:items-start">
              <Textarea
                value={clientMessage}
                onChange={(event) => {
                  setMessageDirty(true);
                  setMessageText(event.target.value);
                }}
                className="min-h-[88px] w-full"
              />
              <div className="flex gap-2 md:flex-col">
                <Button
                  variant="outline"
                  onClick={handleCopyMessage}
                  disabled={linkLoading}
                  className="flex-1 gap-2 md:flex-none"
                >
                  <Copy className="h-4 w-4" />
                  {messageLabel}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSendWhatsAppUpdate}
                  disabled={!canSendWhatsApp || linkLoading}
                  className="flex-1 gap-2 md:flex-none"
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
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Cliente
              </CardTitle>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                {order.customer_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={openMergeDialog}
                    disabled={!canMergeOrders || mergeOrdersLoading}
                    title="Somente pedidos sem pagamento do mesmo cliente podem ser agrupados, inclusive entregues."
                  >
                    Agrupar pedidos
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setCustomerDialogOpen(true);
                    setCustomerDraft(order.customer || null);
                    setCustomerNameDraft(order.customer?.name || order.customer_name || '');
                  }}
                >
                  {order.customer || order.customer_name ? 'Editar cliente' : 'Adicionar cliente'}
                </Button>
              </div>
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
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Itens do Pedido</CardTitle>
              {isBudget && !isEditingItems && (
                <Button variant="outline" size="sm" onClick={startEditingItems} className="w-full sm:w-auto">
                  Editar pedido
                </Button>
              )}
              {isBudget && isEditingItems && (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <Button variant="outline" size="sm" onClick={cancelEditingItems} disabled={savingItems} className="w-full sm:w-auto">
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={handleSaveItems} disabled={savingItems} className="w-full sm:w-auto">
                    {savingItems && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar alterações
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {isEditingItems ? (
                <div className="grid gap-4">
                  {editableItems.map((item, index) => {
                    const m2Data = parseM2Attributes(item.attributes);
                    const isM2 = isItemM2(item);
                    const widthRaw = item.attributes?.[M2_ATTRIBUTE_KEYS.widthCm] ?? '';
                    const heightRaw = item.attributes?.[M2_ATTRIBUTE_KEYS.heightCm] ?? '';
                    const hasValidDimensions =
                      typeof m2Data.widthCm === 'number' &&
                      typeof m2Data.heightCm === 'number' &&
                      m2Data.widthCm > 0 &&
                      m2Data.heightCm > 0;
                    const discountState = getItemDiscountState(item);

                    return (
                      <div key={item.id} className="rounded-lg border bg-card p-4 shadow-sm">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex-1 space-y-3">
                            <div className="space-y-2">
                              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Produto</Label>
                              <Select
                                value={item.product_id ?? ""}
                                onValueChange={(value) => handleChangeItemProduct(index, value)}
                              >
                                <SelectTrigger className="w-full lg:max-w-md">
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
                            </div>

                            {isM2 && (
                              <div className="grid gap-3 sm:grid-cols-2 lg:max-w-md">
                                <div className="space-y-1.5">
                                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Largura (cm)</Label>
                                  <Input
                                    value={widthRaw}
                                    onChange={(e) => handleChangeItemDimensions(index, M2_ATTRIBUTE_KEYS.widthCm, e.target.value)}
                                    className="h-9"
                                    inputMode="decimal"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Altura (cm)</Label>
                                  <Input
                                    value={heightRaw}
                                    onChange={(e) => handleChangeItemDimensions(index, M2_ATTRIBUTE_KEYS.heightCm, e.target.value)}
                                    className="h-9"
                                    inputMode="decimal"
                                  />
                                </div>
                                <p className={`col-span-full text-xs font-medium ${hasValidDimensions ? 'text-primary' : 'text-destructive'}`}>
                                  Área: {hasValidDimensions ? `${formatAreaM2(item.quantity)} m\u00B2` : 'Informe dimensões válidas'}
                                </p>
                              </div>
                            )}

                            {item.product_id && getProductAttributeGroups(item.product_id).length > 0 && (
                              <div className="grid gap-3 sm:grid-cols-2 lg:max-w-md">
                                {getProductAttributeGroups(item.product_id).map((group) => (
                                  <div key={`${item.id}-${group.attributeId}`} className="space-y-1.5">
                                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      {group.attributeName}
                                    </Label>
                                    <Select
                                      value={item.attributes?.[group.attributeName] || group.options[0]?.value || ""}
                                      onValueChange={(value) => handleChangeItemAttribute(index, group.attributeName, value)}
                                    >
                                      <SelectTrigger className="h-9">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {group.options.map((option) => (
                                          <SelectItem key={option.id} value={option.value}>
                                            {option.value}
                                            {option.priceModifier > 0 ? ` (+${formatCurrency(option.priceModifier)})` : ""}
                                            {option.priceModifier < 0 ? ` (-${formatCurrency(Math.abs(option.priceModifier))})` : ""}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:flex lg:flex-row lg:items-end lg:gap-6">
                            {!isM2 && (
                              <div className="space-y-1.5">
                                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qtd</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={item.quantity}
                                  onChange={(e) => handleChangeItemQuantity(index, Number(e.target.value))}
                                  className="w-full text-center lg:w-24"
                                />
                                {getTierRangeLabel(item.product_id) && (
                                  <p className="text-[10px] text-muted-foreground text-center">
                                    {getTierRangeLabel(item.product_id)}
                                  </p>
                                )}
                              </div>
                            )}

                            <div className="space-y-1.5">
                              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Preço Unit.</Label>
                              <div className="space-y-1.5">
                                <CurrencyInput
                                  value={Number(item.unit_price || 0)}
                                  onChange={(value) => handleChangeItemUnitPrice(index, value)}
                                  className="w-full lg:w-32"
                                />
                                {'price_mode' in item && item.price_mode === 'manual' && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-auto w-full px-2 py-1 text-[10px] hover:bg-primary/5 hover:text-primary"
                                    onClick={() => handleResetItemUnitPrice(index)}
                                  >
                                    Usar tabela
                                  </Button>
                                )}
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Desconto</Label>
                              <div className="flex flex-col gap-1.5">
                                <div className="flex gap-1.5">
                                  <Select
                                    value={discountState.discountType}
                                    onValueChange={(value) => handleChangeItemDiscountType(index, value as DiscountType)}
                                  >
                                    <SelectTrigger className="w-16 lg:w-20">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="fixed">R$</SelectItem>
                                      <SelectItem value="percent">%</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  {discountState.discountType === 'percent' ? (
                                    <Input
                                      type="number"
                                      min={0}
                                      max={100}
                                      step="0.01"
                                      value={discountState.discountValue}
                                      onChange={(e) => handleChangeItemDiscountValue(index, Number(e.target.value))}
                                      className="text-right lg:w-24"
                                    />
                                  ) : (
                                    <CurrencyInput
                                      value={discountState.discountValue}
                                      onChange={(value) => handleChangeItemDiscountValue(index, value)}
                                      className="lg:w-32"
                                    />
                                  )}
                                </div>
                                <p className="text-right text-[10px] font-medium text-destructive">
                                  -{formatCurrency(discountState.discountAmount)}
                                </p>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right block">Total</Label>
                              <div className="flex items-center gap-3">
                                <CurrencyInput
                                  value={calculateItemTotal(item)}
                                  onChange={(value) => handleChangeItemTotal(index, value)}
                                  className="w-full lg:w-36 text-right font-semibold"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveItem(index)}
                                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[38%] whitespace-nowrap">Produto</TableHead>
                        <TableHead className="w-[140px] whitespace-nowrap text-center">Status</TableHead>
                        <TableHead className="w-[110px] whitespace-nowrap text-center">Qtd</TableHead>
                        <TableHead className="w-[130px] whitespace-nowrap text-center">Preço Unit.</TableHead>
                        <TableHead className="w-[120px] whitespace-nowrap text-right">Desconto</TableHead>
                        <TableHead className="w-[120px] whitespace-nowrap text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => {
                        const m2Data = parseM2Attributes(item.attributes);
                        const displayAttributes = stripM2Attributes(item.attributes);
                        const discountState = getItemDiscountState(item);
                        const hasValidDimensions =
                          typeof m2Data.widthCm === 'number' &&
                          typeof m2Data.heightCm === 'number' &&
                          m2Data.widthCm > 0 &&
                          m2Data.heightCm > 0;
                        const itemStatusLabel = getOrderStatusLabel(item.status, orderStatusCustomization);
                        const itemStatusMoment = item.delivered_at
                          ? `Entregue em ${formatDate(item.delivered_at)}`
                          : getItemReadyAt(item)
                            ? `Pronto em ${formatDate(getItemReadyAt(item) as string)}`
                            : null;

                        return (
                          <TableRow key={item.id} className="h-12">
                            <TableCell className="py-2">
                              <div>
                                <p className="font-medium">{item.product_name}</p>
                                {Object.keys(displayAttributes).length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {Object.entries(displayAttributes).map(([key, value]) => (
                                      <Badge key={key} variant="outline" className="text-xs">
                                        {value}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                                {hasValidDimensions && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {m2Data.widthCm}cm x {m2Data.heightCm}cm - Area: {formatAreaM2(item.quantity)} m²
                                  </p>
                                )}
                                {item.notes && (
                                  <p className="text-xs text-muted-foreground mt-1">Obs: {item.notes}</p>
                                )}
                                {itemStatusMoment && (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {itemStatusMoment}
                                  </p>
                                )}
                                {!isItemM2(item) && getTierRangeLabel(item.product_id) && (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Faixas válidas: {getTierRangeLabel(item.product_id)}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-2 text-center align-middle">
                              <div className="flex justify-center whitespace-nowrap">
                                <Badge
                                  className={`whitespace-nowrap ${statusConfig[item.status]?.color || 'bg-slate-100 text-slate-700'}`}
                                >
                                  {itemStatusLabel}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-center py-2">
                              {isItemM2(item) ? `${formatAreaM2(item.quantity)} m\u00B2` : item.quantity}
                            </TableCell>
                            <TableCell className="whitespace-nowrap py-2 align-middle text-center">
                              <div className="text-center">
                                {formatCurrency(Number(item.unit_price))}
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap py-2 align-top">
                              <div className="text-right">
                                {discountState.discountAmount > 0 ? (
                                  <>
                                    <p className="text-destructive">-{formatCurrency(discountState.discountAmount)}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {discountState.discountType === 'percent'
                                        ? `${discountState.discountValue}%`
                                        : 'R$'}
                                    </p>
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap py-2 text-right font-medium">
                              {formatCurrency(calculateItemTotal(item))}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {isEditingItems && (
                <div className="mt-4 rounded-lg border p-4">
                  <div className="grid gap-3 md:grid-cols-[1fr_140px_140px_auto] items-end">
                    <div className={`space-y-2 ${newItemIsM2 ? 'md:col-span-2' : ''}`}>
                      <Label>Produto</Label>
                      <Select value={newItemProductId} onValueChange={handleNewItemProductChange}>
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
                      {getTierRangeLabel(newItemProductId) && !newItemIsM2 && (
                        <p className="text-xs text-muted-foreground">
                          Faixas válidas: {getTierRangeLabel(newItemProductId)}
                        </p>
                      )}

                      {newItemProductId && getProductAttributeGroups(newItemProductId).length > 0 && (
                        <div className="grid gap-2 sm:grid-cols-2 mt-2">
                          {getProductAttributeGroups(newItemProductId).map((group) => (
                            <div key={`new-item-${group.attributeId}`} className="space-y-1">
                              <Label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                {group.attributeName}
                              </Label>
                              <Select
                                value={newItemAttributes[group.attributeName] || group.options[0]?.value || ""}
                                onValueChange={(value) => {
                                  setNewItemAttributes(prev => ({
                                    ...prev,
                                    [group.attributeName]: value
                                  }));
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {group.options.map((option) => (
                                    <SelectItem key={option.id} value={option.value}>
                                      {option.value}
                                      {option.priceModifier > 0 ? ` (+${formatCurrency(option.priceModifier)})` : ""}
                                      {option.priceModifier < 0 ? ` (-${formatCurrency(Math.abs(option.priceModifier))})` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {newItemIsM2 ? (
                      <>
                        <div className="space-y-2">
                          <Label>Largura (cm)</Label>
                          <Input
                            value={newItemWidthCm}
                            onChange={(e) => setNewItemWidthCm(e.target.value)}
                            inputMode="decimal"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Altura (cm)</Label>
                          <Input
                            value={newItemHeightCm}
                            onChange={(e) => setNewItemHeightCm(e.target.value)}
                            inputMode="decimal"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <Label>Quantidade</Label>
                        <Input
                          type="number"
                          min={1}
                          value={newItemQuantity}
                          onChange={(e) => setNewItemQuantity(Number(e.target.value))}
                        />
                      </div>
                    )}
                    <Button onClick={handleAddItem} className="mt-2 w-full md:mt-6 md:w-auto">
                      Adicionar item
                    </Button>
                  </div>
                  {newItemIsM2 && (
                    <p className={`mt-2 text-xs ${newItemArea > 0 ? 'text-muted-foreground' : 'text-destructive'}`}>
                      Area: {newItemArea > 0 ? `${formatAreaM2(newItemArea)} m\u00B2` : 'Informe dimensoes validas'}
                    </p>
                  )}
                </div>
              )}

              {isEditingItems && (
                <div className="mt-4 rounded-lg border p-4">
                  <div className="grid gap-3 md:grid-cols-[180px_minmax(0,220px)]">
                    <div className="space-y-2">
                      <Label>Desconto geral</Label>
                      <Select
                        value={orderDiscountType}
                        onValueChange={(value) => {
                          const nextType = value as DiscountType;
                          const currentDiscountAmount = calculateOrderDiscountAmount(
                            editingSubtotal,
                            orderDiscountType,
                            orderDiscountValue,
                          );
                          setOrderDiscountType(nextType);
                          setOrderDiscountValue(
                            calculateDiscountValueFromAmount({
                              baseAmount: editingSubtotal,
                              discountAmount: currentDiscountAmount,
                              discountType: nextType,
                            }),
                          );
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">R$</SelectItem>
                          <SelectItem value="percent">%</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Valor do desconto</Label>
                      {orderDiscountType === 'percent' ? (
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={orderDiscountValue}
                          onChange={(e) => setOrderDiscountValue(normalizeDiscountValue(Number(e.target.value)))}
                          className="text-right"
                        />
                      ) : (
                        <CurrencyInput
                          value={orderDiscountValue}
                          onChange={(value) => setOrderDiscountValue(normalizeDiscountValue(value))}
                        />
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    O desconto geral é aplicado após os descontos individuais dos itens.
                  </p>
                </div>
              )}

              <div className="mt-4 pt-4 border-t space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal bruto</span>
                  <span>{formatCurrency(editingGrossSubtotal)}</span>
                </div>
                {editingItemsDiscount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Desconto dos itens</span>
                    <span className="text-destructive">-{formatCurrency(editingItemsDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(editingSubtotal)}</span>
                </div>
                {editingOrderDiscount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Desconto geral ({activeOrderDiscountType === 'percent' ? `${activeOrderDiscountValue}%` : 'R$'})
                    </span>
                    <span className="text-destructive">-{formatCurrency(editingOrderDiscount)}</span>
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
          {showArtFilesSection && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Paintbrush className="h-5 w-5" />
                  Arquivos da arte
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {canManageArtFiles && (
                  <div className="space-y-2">
                    <input
                      ref={artFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      multiple
                      onChange={handleArtFilesUpload}
                      className="hidden"
                    />
                    <div
                      className="flex flex-col gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"
                      onPaste={handleArtPaste}
                      tabIndex={0}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => artFileInputRef.current?.click()}
                          disabled={uploadingArtFile}
                        >
                          {uploadingArtFile ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="mr-2 h-4 w-4" />
                          )}
                          Anexar arquivo
                        </Button>
                        <span>JPG, PNG ou PDF.</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Cole uma imagem com Ctrl+V ou use o botão acima.
                      </p>
                    </div>
                  </div>
                )}

                {artFilesReady.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum arquivo anexado.</p>
                ) : (
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
                          className="group relative overflow-hidden rounded-lg border bg-muted/10 text-left focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <img
                            src={file.url || ''}
                            alt={file.file_name || 'Arquivo da arte'}
                            className="h-40 w-full object-cover"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-xs text-white">
                            <div>{formatDate(file.created_at)}</div>
                            {file.created_by && profiles[file.created_by] && (
                              <div>por {profiles[file.created_by]}</div>
                            )}
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
                )}
              </CardContent>
            </Card>
          )}
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

          <Card>
            <CardHeader>
              <CardTitle>Observações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                rows={5}
                placeholder="Adicione observações internas, detalhes de arte, acabamento ou instruções do pedido."
              />
              <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={showNotesOnPdf}
                  onChange={(event) => setShowNotesOnPdf(event.target.checked)}
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">Mostrar observações no PDF do pedido</span>
                  <span className="block text-xs text-muted-foreground">
                    Quando desativado, as observações continuam no sistema e deixam de aparecer no comprovante impresso.
                  </span>
                </span>
              </label>
              {orderVisibleNotes && (
                <p className="rounded-lg bg-muted/30 px-4 py-3 text-sm text-muted-foreground whitespace-pre-line">
                  {orderVisibleNotes}
                </p>
              )}
              <div className="flex justify-end">
                <Button type="button" onClick={handleSaveOrderNotes} disabled={savingNotes}>
                  {savingNotes ? 'Salvando...' : 'Salvar observações'}
                </Button>
              </div>
            </CardContent>
          </Card>
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
                    const historyStatusBadgeStyle = getOrderStatusBadgeStyle(h.status, orderStatusCustomization);
                    return (
                      <div key={h.id} className="relative flex gap-4">
                        <div
                          className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full border"
                          style={historyStatusBadgeStyle}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 pb-4">
                          <p className="font-medium text-sm">
                            {getOrderStatusLabel(h.status, orderStatusCustomization)}
                          </p>
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
                              {localizeOrderHistoryNote(h.notes)}
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
                    <span>{getPaymentMethodDisplayName(order.payment_method, companyPaymentMethods)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor pago</span>
                  <span>{formatCurrency(paidTotal)}</span>
                </div>
                {creditUsed > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Crédito usado</span>
                    <span className="text-emerald-600">{formatCurrency(creditUsed)}</span>
                  </div>
                )}
                {generatedCredit > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Crédito gerado</span>
                    <span className="text-blue-600">{formatCurrency(generatedCredit)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saldo restante</span>
                  <span>{formatCurrency(remainingAmount)}</span>
                </div>
              </div>

              <Separator />

              {payments.length > 0 ? (
                <div className="space-y-2">
                  {payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                      <div>
                        <p className="font-medium">{formatCurrency(Number(payment.amount))}</p>
                        <p className="text-xs text-muted-foreground">
                          {isCustomerCreditPayment(payment) ? 'Crédito do cliente' : (getPaymentMethodDisplayName(payment.method, companyPaymentMethods) || '-')} - {formatDate(payment.paid_at || payment.created_at)}
                        </p>
                        {Number(payment.generated_credit_amount ?? 0) > 0 && (
                          <p className="text-xs text-blue-600">
                            Crédito gerado: {formatCurrency(Number(payment.generated_credit_amount))}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2">
                        <Badge variant={payment.status === 'pago' ? 'default' : 'outline'}>
                          {getPaymentStatusLabel(payment.status)}
                        </Badge>
                        {payment.status !== 'pendente' && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Imprimir"
                              onClick={() => {
                                const markup = buildPaymentReceiptMarkup(payment);
                                if (!markup) return;
                                printMarkup(
                                  markup,
                                  `Comprovante de pagamento - Pedido #${formatOrderNumber(order.order_number)}`,
                                );
                              }}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Baixar PDF"
                              onClick={async () => {
                                const markup = buildPaymentReceiptMarkup(payment);
                                if (!markup) return;

                                setPaymentActionId(payment.id);
                                setPaymentActionType('download');
                                try {
                                  await downloadReceiptMarkupAsPdf(
                                    markup,
                                    `comprovante-pagamento-pedido-${formatOrderNumber(order.order_number)}.pdf`,
                                    'Comprovante baixado',
                                  );
                                } catch (error: any) {
                                  toast({ title: 'Erro ao baixar', description: error.message, variant: 'destructive' });
                                } finally {
                                  setPaymentActionId(null);
                                  setPaymentActionType(null);
                                }
                              }}
                              disabled={paymentActionId === payment.id && paymentActionType === 'download'}
                            >
                              {paymentActionId === payment.id && paymentActionType === 'download' ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <FileDown className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
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
                {order.customer_id && (
                  <Button
                    variant="outline"
                    onClick={openCreditDialog}
                    disabled={isOrderPaid}
                    className="gap-2"
                  >
                    <Wallet className="h-4 w-4" />
                    Usar saldo do cliente
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader>
            <DialogTitle>{order.customer || order.customer_name ? 'Editar cliente' : 'Adicionar cliente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Buscar cliente cadastrado</Label>
              <CustomerSearch
                selectedCustomer={customerDraft}
                onSelect={(customer) => {
                  setCustomerDraft(customer);
                  setCustomerNameDraft(customer?.name || '');
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Nome do cliente</Label>
              <Input
                value={customerNameDraft}
                onChange={(e) => setCustomerNameDraft(e.target.value)}
                placeholder="Nome do cliente"
              />
              {customerDraft && customerDraft.name !== customerNameDraft.trim() && (
                <p className="text-xs text-muted-foreground">
                  Este nome será atualizado no cadastro do cliente.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomerDialogOpen(false)} disabled={customerSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCustomer} disabled={customerSaving}>
              {customerSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agrupar pedidos do cliente</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Pedidos sem pagamento do mesmo cliente podem ser agrupados, inclusive quando jÃ¡ estiverem entregues.
            </p>
            <DialogDescription>
              Selecione pedidos abertos do mesmo cliente para juntar neste pedido e ficar com um único saldo.
              Pedidos com pagamento não entram nesse agrupamento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 rounded-md border p-4 text-sm md:grid-cols-3">
              <div className="space-y-1">
                <p className="text-muted-foreground">Pedido principal</p>
                <p className="font-medium">#{formatOrderNumber(order.order_number)}</p>
                <p>{formatCurrency(orderTotal)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Pedidos selecionados</p>
                <p className="font-medium">{selectedMergeOrderIds.length}</p>
                <p>{formatCurrency(mergeSelectedTotal)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Novo total previsto</p>
                <p className="font-medium text-primary">{formatCurrency(mergeProjectedTotal)}</p>
                <p className="text-xs text-muted-foreground">O desconto geral é preservado no total final.</p>
              </div>
            </div>

            {mergeOrdersLoading ? (
              <div className="flex min-h-32 items-center justify-center rounded-md border text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Carregando pedidos elegíveis...
              </div>
            ) : mergeCandidates.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                Nenhum outro pedido aberto e sem pagamento foi encontrado para este cliente.
              </div>
            ) : (
              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {mergeCandidates.map((candidate) => (
                  <label
                    key={candidate.id}
                    className="flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={selectedMergeOrderIds.includes(candidate.id)}
                      onCheckedChange={(checked) => handleToggleMergeOrder(candidate.id, checked === true)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">#{formatOrderNumber(candidate.order_number)}</p>
                          <p className="text-xs text-muted-foreground">
                            Status: {getOrderStatusLabel(candidate.status, orderStatusCustomization)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(candidate.created_at)} • {candidate.status === 'orcamento' ? 'Orçamento' : 'Pendente'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{formatCurrency(Number(candidate.total || 0))}</p>
                          {Number(candidate.discount || 0) > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Desconto atual: {formatCurrency(Number(candidate.discount || 0))}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMergeDialogOpen(false);
                setSelectedMergeOrderIds([]);
              }}
              disabled={mergeOrdersSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleMergeOrders}
              disabled={mergeOrdersSaving || mergeOrdersLoading || selectedMergeOrderIds.length === 0}
            >
              {mergeOrdersSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Agrupando...
                </>
              ) : (
                'Agrupar pedidos'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal do pedido</span>
                <span>{formatCurrency(paymentSubtotal)}</span>
              </div>
              {paymentDiscountAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Desconto ({paymentDiscountType === 'percent' ? `${paymentDiscountValue}%` : 'R$'})
                  </span>
                  <span className="text-destructive">-{formatCurrency(paymentDiscountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total atualizado</span>
                <span>{formatCurrency(paymentOrderTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total pago</span>
                <span>{formatCurrency(paidTotal)}</span>
              </div>
              {creditUsed > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Crédito usado</span>
                  <span>{formatCurrency(creditUsed)}</span>
                </div>
              )}
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground">Saldo restante</span>
                <span>{formatCurrency(paymentRemainingAmount)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Desconto no pedido</Label>
              <div className="flex gap-2">
                <div className="w-28">
                  <Select
                    value={paymentDiscountType}
                    onValueChange={(value) => {
                      const nextType = normalizeDiscountType(value);
                      const currentDiscountAmount = calculateOrderDiscountAmount(
                        paymentSubtotal,
                        paymentDiscountType,
                        paymentDiscountValue,
                      );
                      setPaymentDiscountType(nextType);
                      setPaymentDiscountValue(
                        calculateDiscountValueFromAmount({
                          baseAmount: paymentSubtotal,
                          discountAmount: currentDiscountAmount,
                          discountType: nextType,
                        }),
                      );
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">R$</SelectItem>
                      <SelectItem value="percent">%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  {paymentDiscountType === 'percent' ? (
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={paymentDiscountValue}
                      onChange={(event) => setPaymentDiscountValue(normalizeDiscountValue(Number(event.target.value)))}
                      className="text-right"
                    />
                  ) : (
                    <CurrencyInput
                      value={paymentDiscountValue}
                      onChange={(value) => setPaymentDiscountValue(normalizeDiscountValue(value))}
                    />
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                O desconto ajusta o total do pedido antes de registrar o pagamento.
              </p>
              {paymentDiscountInvalid && (
                <p className="text-xs text-destructive">
                  O desconto não pode reduzir o total abaixo do valor já quitado.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Valor pago</Label>
              <CurrencyInput
                value={paymentAmount}
                onChange={(value) => {
                  setPaymentAmountTouched(true);
                  setPaymentAmount(value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Data do pagamento</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                disabled={paymentStatus === 'pendente'}
              />
              {paymentStatus === 'pendente' && (
                <p className="text-xs text-muted-foreground">
                  A data fica disponivel quando o status for pago ou parcial.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {selectablePaymentMethods.map((option) => (
                    <SelectItem key={option.type} value={option.type}>
                      {getPaymentMethodDisplayName(option.type, companyPaymentMethods)}
                    </SelectItem>
                  ))}
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
              disabled={
                paymentSaving ||
                paymentAmount <= 0 ||
                paymentDiscountInvalid ||
                (paymentAmount > paymentRemainingAmount && (paymentStatus === 'pendente' || !order.customer_id))
              }
            >
              {paymentSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {paymentAmount > paymentRemainingAmount && paymentStatus !== 'pendente' && order.customer_id
                ? `Confirmar (gera crédito de ${formatCurrency(paymentAmount - paymentRemainingAmount)})`
                : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit Dialog */}
      <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Usar saldo do cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saldo disponível do cliente</span>
                <span className="font-medium text-emerald-600">{formatCurrency(customerAvailableCredit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saldo restante do pedido</span>
                <span>{formatCurrency(remainingAmount)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Valor a utilizar</Label>
              <CurrencyInput value={creditAmount} onChange={setCreditAmount} />
              {creditAmount > customerAvailableCredit && (
                <p className="text-xs text-destructive">Valor excede o saldo disponível do cliente.</p>
              )}
              {creditAmount > remainingAmount && (
                <p className="text-xs text-destructive">Valor excede o saldo restante do pedido.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={creditNotes}
                onChange={(e) => setCreditNotes(e.target.value)}
                placeholder="Observações sobre o uso do crédito..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditDialogOpen(false)} disabled={creditSaving}>
              Cancelar
            </Button>
            <Button
              onClick={handleApplyCredit}
              disabled={creditSaving || creditAmount <= 0 || creditAmount > customerAvailableCredit || creditAmount > remainingAmount}
            >
              {creditSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aplicar crédito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Receipt Dialog */}
      <Dialog open={receiptDialogOpen} onOpenChange={handleReceiptDialogChange}>
        <DialogContent
          aria-describedby={undefined}
          className="w-[calc(100vw-1.5rem)] max-w-[700px] max-h-[92vh] overflow-hidden"
        >
          <DialogHeader>
            <DialogTitle>Recibo de Pagamento</DialogTitle>
          </DialogHeader>
          <div className="max-h-[calc(92vh-190px)] overflow-y-auto overflow-x-hidden pr-1">
            <div className="flex justify-center">
              {receiptPayment ? (
                <PaymentReceipt
                  ref={paymentReceiptRef}
                  order={order}
                  items={items}
                  payment={receiptPayment}
                  summary={buildPaymentReceiptSummary(receiptPayment)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Recibo indisponível.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleReceiptDialogChange(false)}>
              Fechar
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadPaymentReceipt}
              disabled={!receiptPayment || paymentReceiptLoading}
              className="gap-2"
            >
              <FileDown className="h-4 w-4" />
              {paymentReceiptLoading ? 'Gerando...' : 'Baixar PDF'}
            </Button>
            <Button onClick={handlePrintPaymentReceipt} disabled={!receiptPayment || paymentReceiptLoading} className="gap-2">
              <Printer className="h-4 w-4" />
              {paymentReceiptLoading ? 'Gerando...' : 'Imprimir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={readyDialogOpen}
        onOpenChange={(open) => {
          if (readySaving) return;
          setReadyDialogOpen(open);
          if (!open) {
            setReadyItemIds([]);
          }
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className="w-[calc(100vw-1.5rem)] max-w-[560px] overflow-hidden sm:w-full md:max-w-[760px]"
        >
          <DialogHeader className="pr-8">
            <DialogTitle>{readyActionLabel}</DialogTitle>
            <DialogDescription>
              {readyCompletedFromItems
                ? 'Todos os itens do pedido ja foram marcados como prontos.'
                : 'Selecione os itens que ja ficaram prontos. Quando todos os itens estiverem prontos, o pedido sera finalizado automaticamente.'}
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0 space-y-4">
            <div className="min-w-0 rounded-lg border bg-muted/30 p-4 text-sm">
              <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3">
                <span className="text-muted-foreground">Pedido</span>
                <span className="min-w-0 font-medium text-right break-words">#{formatOrderNumber(order.order_number)}</span>
              </div>
              <div className="mt-2 grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3">
                <span className="text-muted-foreground">Cliente</span>
                <span className="min-w-0 font-medium text-right break-words">{order.customer?.name || order.customer_name || 'Cliente nao informado'}</span>
              </div>
              <div className="mt-2 grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3">
                <span className="text-muted-foreground">Telefone</span>
                <span className="min-w-0 font-medium text-right break-all">{order.customer?.phone || '-'}</span>
              </div>
            </div>

            {!readyCompletedFromItems && (
              <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Itens do pedido</p>
                    <p className="text-xs text-muted-foreground">
                      Prontos: {readyItems.length}/{activeItems.length || items.length}
                    </p>
                  </div>
                  {pendingReadyItems.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setReadyItemIds(pendingReadyItems.map((item) => item.id))}
                    >
                      Selecionar todos
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {items.map((item) => {
                    const isCanceled = isCanceledItem(item);
                    const readyAt = getItemReadyAt(item);
                    const alreadyReady = Boolean(readyAt);
                    const alreadyDelivered = Boolean(item.delivered_at);
                    const checked = alreadyReady || readyItemIds.includes(item.id);

                    return (
                      <label
                        key={item.id}
                        className={[
                          'flex items-start gap-3 rounded-lg border p-3',
                          alreadyDelivered
                            ? 'border-emerald-200 bg-emerald-50/60'
                            : isCanceled
                              ? 'border-red-200 bg-red-50/60'
                            : alreadyReady
                              ? 'border-sky-200 bg-sky-50/60'
                              : 'border-slate-200 bg-white',
                        ].join(' ')}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={alreadyReady || isCanceled}
                          onCheckedChange={(value) => {
                            if (alreadyReady || isCanceled) return;
                            setReadyItemIds((current) =>
                              value === true
                                ? Array.from(new Set([...current, item.id]))
                                : current.filter((id) => id !== item.id),
                            );
                          }}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-slate-900">{item.product_name}</p>
                            <Badge variant="outline">Qtd: {item.quantity}</Badge>
                            {alreadyDelivered ? (
                              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                                Entregue
                              </Badge>
                            ) : isCanceled ? (
                              <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                                Cancelado
                              </Badge>
                            ) : alreadyReady ? (
                              <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100">
                                Pronto
                              </Badge>
                            ) : (
                              <Badge variant="outline">Em producao</Badge>
                            )}
                          </div>
                          {item.delivered_at ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Entregue em {formatDate(item.delivered_at)}
                            </p>
                          ) : isCanceled ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Item cancelado.
                            </p>
                          ) : readyAt ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Pronto em {formatDate(readyAt)}
                            </p>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
                {partialReadyRegistered && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
                    Este pedido ja possui itens prontos. Marque apenas os restantes para continuar.
                  </div>
                )}
              </div>
            )}

            {readyCompletedFromItems ? (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
                <p className="font-medium">Todos os itens ja estao prontos.</p>
                <p className="mt-1">
                  Ultimo registro: {latestReadyItemAt ? formatDate(latestReadyItemAt) : '-'}
                </p>
              </div>
            ) : selectedReadyCompletesOrder ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                <p className="font-medium">Pedido completo</p>
                <p className="mt-1">
                  Ao confirmar, todos os itens ficarao prontos e o pedido sera finalizado automaticamente.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Os itens selecionados serao marcados como prontos, mas o pedido continuara aberto
                enquanto existirem itens ainda em producao.
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setReadyDialogOpen(false)}
              disabled={readySaving}
              className="w-full sm:w-auto"
            >
              {readyCompletedFromItems ? 'Fechar' : 'Cancelar'}
            </Button>
            {!readyCompletedFromItems && (
              <Button
                onClick={handleConfirmReady}
                disabled={readyConfirmDisabled}
                className="w-full min-w-0 sm:flex-1"
              >
                {readySaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Package className="mr-2 h-4 w-4" />
                {readyPrimaryActionLabel}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deliveryDialogOpen}
        onOpenChange={(open) => {
          if (deliverySaving) return;
          setDeliveryDialogOpen(open);
          if (!open) {
            setDeliveryReceiptOrder(null);
            setDeliveryReceiptPayment(null);
            setDeliveryReceiptItems([]);
            setDeliveryReceiptItemIds([]);
            setDeliveryReceiptDeliveredAt(null);
            setDeliveryItemIds([]);
            setDeliveryPaymentAmount(0);
            setDeliveryPaymentMethod('');
          }
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className="w-[calc(100vw-1.5rem)] max-w-[560px] overflow-hidden sm:w-full md:max-w-[760px]"
        >
          <DialogHeader className="pr-8">
            <DialogTitle>{deliveryDialogShowsReceipt ? 'Comprovante de entrega' : deliveryActionLabel}</DialogTitle>
            <DialogDescription>
              {deliveryDialogShowsReceipt
                ? deliveryReceiptIsTotal
                  ? 'A entrega total ja foi registrada. Use esta tela para consultar, baixar ou reimprimir o comprovante.'
                  : 'A entrega parcial ja foi registrada. Use esta tela para consultar, baixar ou reimprimir o comprovante.'
                : 'Selecione os itens prontos que estao sendo entregues agora. Itens ainda em producao precisam ser marcados como prontos antes da entrega.'}
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0 space-y-4">
            <div className="min-w-0 rounded-lg border bg-muted/30 p-4 text-sm">
              <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3">
                <span className="text-muted-foreground">Pedido</span>
                <span className="min-w-0 font-medium text-right break-words">#{formatOrderNumber(order.order_number)}</span>
              </div>
              <div className="mt-2 grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3">
                <span className="text-muted-foreground">Cliente</span>
                <span className="min-w-0 font-medium text-right break-words">{deliveryCustomerName}</span>
              </div>
              <div className="mt-2 grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3">
                <span className="text-muted-foreground">Telefone</span>
                <span className="min-w-0 font-medium text-right break-all">{deliveryCustomerPhone}</span>
              </div>
              <div className="mt-2 grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3">
                <span className="text-muted-foreground">Valor total</span>
                <span className="min-w-0 font-medium text-right break-words">{formatCurrency(Number(order.total || 0))}</span>
              </div>
            </div>

            {!deliveryDialogShowsReceipt && (
              <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Itens do pedido</p>
                    <p className="text-xs text-muted-foreground">
                      Entregues: {deliveredItems.length}/{activeItems.length || items.length} • Prontos para entrega: {pendingDeliveryItems.length}
                    </p>
                  </div>
                  {pendingDeliveryItems.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setDeliveryItemIds(pendingDeliveryItems.map((item) => item.id))}
                    >
                      Selecionar todos
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {items.map((item) => {
                    const isCanceled = isCanceledItem(item);
                    const readyAt = getItemReadyAt(item);
                    const alreadyReady = Boolean(readyAt);
                    const alreadyDelivered = Boolean(item.delivered_at);
                    const deliveryBlocked = !isCanceled && !alreadyDelivered && !alreadyReady;
                    const checked = alreadyDelivered || deliveryItemIds.includes(item.id);

                    return (
                      <label
                        key={item.id}
                        className={[
                          'flex items-start gap-3 rounded-lg border p-3',
                          alreadyDelivered
                            ? 'border-emerald-200 bg-emerald-50/60'
                            : isCanceled
                              ? 'border-red-200 bg-red-50/60'
                            : deliveryBlocked
                              ? 'border-slate-200 bg-slate-50/80'
                              : 'border-sky-200 bg-sky-50/60',
                        ].join(' ')}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={alreadyDelivered || deliveryBlocked || isCanceled}
                          onCheckedChange={(value) => {
                            if (alreadyDelivered || deliveryBlocked || isCanceled) return;
                            setDeliveryItemIds((current) =>
                              value === true
                                ? Array.from(new Set([...current, item.id]))
                                : current.filter((id) => id !== item.id),
                            );
                          }}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-slate-900">{item.product_name}</p>
                            <Badge variant="outline">Qtd: {item.quantity}</Badge>
                            {alreadyDelivered ? (
                              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                                Entregue
                              </Badge>
                            ) : isCanceled ? (
                              <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                                Cancelado
                              </Badge>
                            ) : alreadyReady ? (
                              <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100">
                                Pronto para entrega
                              </Badge>
                            ) : (
                              <Badge variant="outline">Aguardando ficar pronto</Badge>
                            )}
                          </div>
                          {item.delivered_at ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Entregue em {formatDate(item.delivered_at)}
                            </p>
                          ) : isCanceled ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Item cancelado.
                            </p>
                          ) : readyAt ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Pronto em {formatDate(readyAt)}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Marque este item como pronto antes de registrar a entrega.
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
                {blockedDeliveryItems.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                    Existem {blockedDeliveryItems.length} item(ns) ainda em producao. Eles nao podem ser entregues antes de serem marcados como prontos.
                  </div>
                )}
                {partialDeliveryRegistered && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
                    Este pedido ja possui itens entregues. Marque apenas os restantes para continuar.
                  </div>
                )}
              </div>
            )}

            {deliveryDialogShowsReceipt ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <p className="font-medium">
                    {deliveryReceiptIsTotal ? 'Entrega total registrada com sucesso.' : 'Entrega parcial registrada com sucesso.'}
                  </p>
                  <p className="mt-1">
                    Data e hora registradas: {deliveryRecordedAt ? formatDate(deliveryRecordedAt) : '-'}
                  </p>
                  <p className="mt-1">
                    Itens entregues no pedido: {deliveryReceiptDeliveredCount}/{deliveryReceiptActiveItems.length || items.length}
                  </p>
                </div>
                {deliveryPaymentInfo && (
                  <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                    <p className="font-medium text-slate-900">Pagamento vinculado ao comprovante</p>
                    <div className="mt-2 space-y-1 text-slate-700">
                      <p>Valor pago: {formatCurrency(deliveryPaymentInfo.amount)}</p>
                      <p>Forma de pagamento: {getPaymentMethodLabel(deliveryPaymentInfo.method)}</p>
                      <p>Data e hora do pagamento: {deliveryPaymentInfo.paidAt ? formatDate(deliveryPaymentInfo.paidAt) : '-'}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {!selectedDeliveryCompletesOrder ? (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
                    <p className="font-medium">Entrega parcial</p>
                    <p className="mt-1">
                      Os itens selecionados serao marcados como entregues, mas o pedido continuara aberto
                      ate que todos os itens restantes fiquem prontos e sejam entregues.
                    </p>
                  </div>
                ) : hasPendingPaymentAtDelivery ? (
                  <div className="min-w-0 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                    <p className="font-medium">Pagamento pendente</p>
                    <p className="mt-1">
                      Há um saldo pendente de {formatCurrency(deliveryPendingAmount)}. Você pode registrar esse pagamento agora ou concluir a entrega e deixar o pedido aguardando pagamento.
                    </p>
                    <div className="mt-4 space-y-3">
                      <div className="space-y-2">
                        <Label>Valor para quitar agora</Label>
                        <CurrencyInput value={deliveryPaymentAmount} onChange={setDeliveryPaymentAmount} disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>Forma de pagamento (opcional)</Label>
                        <Select
                          value={deliveryPaymentMethod}
                          onValueChange={(value) => setDeliveryPaymentMethod(value as PaymentMethod)}
                        >
                          <SelectTrigger className="w-full min-w-0">
                            <SelectValue placeholder="Selecione a forma de pagamento" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectablePaymentMethods.map((option) => (
                              <SelectItem key={option.type} value={option.type}>
                                {getPaymentMethodDisplayName(option.type, companyPaymentMethods)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    O comprovante usará exatamente a mesma data e hora gravadas no sistema no momento da confirmação.
                  </div>
                )}
              </div>
            )}

            {false && (deliveryCompleted ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="font-medium">Entrega registrada com sucesso.</p>
                <p className="mt-1">
                  Data e hora registradas: {deliveryRecordedAt ? formatDate(deliveryRecordedAt) : '-'}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                O comprovante usará exatamente a mesma data e hora gravadas no sistema no momento da confirmação.
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setDeliveryDialogOpen(false)}
              disabled={deliverySaving}
              className="w-full sm:w-auto"
            >
              {deliveryDialogShowsReceipt ? 'Fechar' : 'Cancelar'}
            </Button>
            {deliveryDialogShowsReceipt ? (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button
                  variant="outline"
                  onClick={handleDownloadDeliveryReceipt}
                  disabled={deliverySaving}
                  className="w-full gap-2 sm:w-auto"
                >
                  <FileDown className="h-4 w-4" />
                  Baixar PDF
                </Button>
                <Button
                  onClick={handlePrintDeliveryReceipt}
                  disabled={deliverySaving}
                  className="w-full gap-2 sm:w-auto"
                >
                  <Printer className="h-4 w-4" />
                  Imprimir Comprovante
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleConfirmDelivery}
                disabled={deliveryConfirmDisabled}
                className="w-full min-w-0 sm:flex-1"
              >
                {deliverySaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Truck className="mr-2 h-4 w-4" />
                {deliveryPrimaryActionLabel}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Change Dialog */}
      <Dialog
        open={statusDialogOpen}
        onOpenChange={(open) => {
          setStatusDialogOpen(open);
          if (!open) {
            setNewStatus('');
            setStatusItemId('');
            setStatusNotes('');
          }
        }}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Alterar Status do {statusTargetLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {statusTargetIsItem && (
              <div className="space-y-2">
                <Label>Produto</Label>
                <Select
                  value={statusItemId}
                  onValueChange={(value) => {
                    setStatusItemId(value);
                    setNewStatus('');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.product_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedStatusItem && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{selectedStatusItem.product_name}</span>
                      <Badge className={statusConfig[selectedStatusItem.status]?.color || 'bg-slate-100 text-slate-700'}>
                        {getOrderStatusLabel(selectedStatusItem.status, orderStatusCustomization)}
                      </Badge>
                      {isCanceledItem(selectedStatusItem) && (
                        <Badge variant="outline">Item cancelado</Badge>
                      )}
                    </div>
                    {selectedStatusItem.status === 'em_producao' && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Quando este item terminar a producao, use a acao `Marcar pronto`.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {statusSource === 'pendente' ? (
              <div className="space-y-2">
                <Label>Este {statusTargetLabel.toLowerCase()} precisa de criação ou ajuste de arte?</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant={newStatus === 'produzindo_arte' ? 'default' : 'outline'}
                    onClick={() => setNewStatus('produzindo_arte')}
                  >
                    Sim, precisa
                  </Button>
                  <Button
                    type="button"
                    variant={newStatus === 'em_producao' ? 'default' : 'outline'}
                    onClick={() => setNewStatus('em_producao')}
                  >
                    Não, ir para produção
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Novo Status</Label>
                <Select value={newStatus} onValueChange={(v) => setNewStatus(v as OrderStatus)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o novo status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusDialogNextOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const Icon = statusConfig[status].icon;
                            return <Icon className="h-4 w-4" />;
                          })()}
                          {getOrderStatusLabel(status, orderStatusCustomization)}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {statusTargetIsItem && statusDialogNextOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Este produto não possui troca de status disponível nesta tela.
                  </p>
                )}
              </div>
            )}
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
              disabled={
                saving ||
                !newStatus ||
                (statusTargetIsItem && !selectedStatusItem) ||
                (newStatus === 'cancelado' && !statusNotes)
              }
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
                  {selectablePaymentMethods.map((option) => (
                    <SelectItem key={option.type} value={option.type}>
                      {getPaymentMethodDisplayName(option.type, companyPaymentMethods)}
                    </SelectItem>
                  ))}
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

      <Dialog
        open={artUploadDialogOpen}
        onOpenChange={(open) => {
          if (uploadingArtFile) return;
          setArtUploadDialogOpen(open);
          if (!open) {
            setPendingArtUploads([]);
            if (artFileInputRef.current) artFileInputRef.current.value = '';
          }
        }}
      >
        <DialogContent aria-describedby={undefined} className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Organizar arquivos do cliente</DialogTitle>
            <DialogDescription>
              O sistema sugeriu um nome padrão para cada arquivo. Você pode ajustar antes de salvar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {pendingArtUploads.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum arquivo selecionado.</p>
            ) : (
              pendingArtUploads.map((item) => (
                <div key={item.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{item.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(item.file.type || 'Arquivo').toUpperCase()} - {(item.file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemovePendingArtUpload(item.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    <Label>Nome do arquivo</Label>
                    <Input
                      value={item.displayName}
                      onChange={(event) =>
                        handlePendingArtUploadNameChange(item.id, event.target.value)
                      }
                      placeholder="Nome do arquivo"
                    />
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setArtUploadDialogOpen(false);
                setPendingArtUploads([]);
              }}
              disabled={uploadingArtFile}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmArtFilesUpload}
              disabled={uploadingArtFile || pendingArtUploads.length === 0}
            >
              {uploadingArtFile ? 'Enviando...' : 'Salvar arquivos'}
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
            <DialogTitle>Excluir pedido</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir este pedido? Essa ação não pode ser desfeita.
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
  );
}
