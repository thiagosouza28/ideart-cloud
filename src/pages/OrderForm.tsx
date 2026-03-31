import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Customer, PaymentMethod, PriceTier, Product, type OrderStatus } from '@/types/database';
import {
  getInitialTierQuantity,
  getProductPriceTiers,
  getPriceTierValidationMessage,
  isQuantityAllowedByPriceTiers,
  resolveProductPrice,
} from '@/lib/pricing';
import {
  calculateEstimatedDeliveryInfo,
  formatBusinessDaysLabel,
  normalizeProductionTimeDays,
  resolveCompanyDeliveryTimeDays,
} from '@/lib/productionTime';
import { normalizeDigits } from '@/components/ui/masked-input';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { buildOrderDetailsPath } from '@/lib/orderRouting';
import { isAreaUnit, M2_ATTRIBUTE_KEYS, calculateAreaM2, formatAreaM2, parseMeasurementInput } from '@/lib/measurements';
import {
  getProductSaleEquivalentText,
  getProductSaleUnitLabel,
  getProductSaleUnitPriceSuffix,
} from '@/lib/productSaleUnit';
import {
  calculateDiscountAmount,
  calculateDiscountValueFromAmount,
  calculateLineTotal,
  normalizeDiscountType,
  normalizeDiscountValue,
  type DiscountType,
} from '@/lib/orderDiscounts';
import { fetchCompanyPaymentMethods } from '@/services/companyPaymentMethods';
import { applyCustomerCreditToOrder } from '@/services/orders';
import {
  defaultCompanyPaymentMethods,
  getActiveCompanyPaymentMethods,
  getPaymentMethodDisplayName,
  type CompanyPaymentMethodConfig,
} from '@/lib/paymentMethods';
import {
  AlertCircle,
  ArrowLeft,
  Box,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  CreditCard,
  FileText,
  Loader2,
  Mail,
  Minus,
  Phone,
  Plus,
  QrCode,
  RefreshCcw,
  ReceiptText,
  Search,
  ShoppingCart,
  Truck,
  Trash2,
  UserRound,
  Wallet,
} from 'lucide-react';

import { EditableOrderItem } from '@/components/EditableOrderItem';
import '@/styles/order-form-items.css';

export interface OrderItemForm {
  product: Product;
  quantity: number;
  unit_price: number;
  discount: number;
  attributes: Record<string, string>;
  notes: string;
  isManual?: boolean;
}

export type ProductAttributeOption = {
  id: string;
  value: string;
  priceModifier: number;
};

export type ProductAttributeGroup = {
  attributeId: string;
  attributeName: string;
  options: ProductAttributeOption[];
};

type DocumentType = 'orcamento' | 'pedido_venda' | 'pedido_compra';
type PriorityLevel = 'baixa' | 'normal' | 'alta';
type DeliveryDateMode = 'auto' | 'manual';

type SalespersonOption = {
  id: string;
  full_name: string | null;
};

const documentTypeOptions: Array<{
  id: DocumentType;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
    { id: 'orcamento', label: 'Orçamento', icon: ClipboardList },
    { id: 'pedido_venda', label: 'Pedido de Venda', icon: ShoppingCart },
    { id: 'pedido_compra', label: 'Pedido de Compra', icon: RefreshCcw },
  ];

const paymentMethodOptions: Array<{
  id: PaymentMethod;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
    { id: 'cartao', label: 'Cartão', icon: CreditCard },
    { id: 'pix', label: 'PIX', icon: QrCode },
    { id: 'dinheiro', label: 'Dinheiro', icon: Wallet },
    { id: 'boleto', label: 'Boleto', icon: CalendarDays },
  ];

const paymentMethodIcons: Record<PaymentMethod, ComponentType<{ className?: string }>> = {
  dinheiro: Wallet,
  cartao: CreditCard,
  credito: CreditCard,
  debito: CreditCard,
  transferencia: Wallet,
  pix: QrCode,
  boleto: CalendarDays,
  outro: Wallet,
};

const deliveryMethods = [
  { value: 'retirada', label: 'Retirada na loja' },
  { value: 'entrega', label: 'Entrega' },
  { value: 'motoboy', label: 'Motoboy' },
];

const paymentConditions = [
  { value: 'avista', label: 'À vista' },
  { value: '7dias', label: '7 dias' },
  { value: '15dias', label: '15 dias' },
  { value: '30dias', label: '30 dias' },
  { value: '45dias', label: '45 dias' },
  { value: 'entrada_saldo', label: 'Entrada + saldo' },
];

const steps = ['Tipo', 'Detalhes', 'Revisão', 'Confirmação'];

const createManualProduct = (name: string): Product =>
  ({
    track_stock: false,
    stock_control_type: null,
    id: `manual:${crypto.randomUUID()}`,
    name,
    sku: null,
    barcode: null,
    description: null,
    product_type: 'servico',
    category_id: null,
    company_id: null,
    owner_id: null,
    is_public: false,
    is_copy: false,
    original_product_id: null,
    image_url: null,
    image_urls: null,
    unit: 'un',
    unit_type: 'unit',
    is_active: true,
    show_in_catalog: false,
    catalog_enabled: false,
    catalog_featured: false,
    catalog_min_order: null,
    catalog_price: null,
    mostrar_tabela_preco_catalogo: false,
    catalog_short_description: null,
    catalog_long_description: null,
    catalog_sort_order: null,
    slug: null,
    product_colors: null,
    personalization_enabled: false,
    production_time_days: null,
    service_base_price: 0,
    base_cost: 0,
    labor_cost: 0,
    expense_percentage: 0,
    waste_percentage: 0,
    profit_margin: 0,
    promo_price: null,
    promo_start_at: null,
    promo_end_at: null,
    final_price: null,
    stock_quantity: 0,
    min_stock: 0,
    min_order_quantity: 1,
    sales_count: 0,
    view_count: 0,
    yampi_sku_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    category: undefined,
    company: undefined,
  }) as Product;

export default function OrderForm() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, company } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productAttributeMap, setProductAttributeMap] = useState<Record<string, ProductAttributeGroup[]>>({});
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [suppliesCostMap, setSuppliesCostMap] = useState<Record<string, number>>({});
  const [salespeople, setSalespeople] = useState<SalespersonOption[]>([]);

  const [documentType, setDocumentType] = useState<DocumentType>('orcamento');
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAvailableCredit, setCustomerAvailableCredit] = useState(0);
  const [useCustomerCredit, setUseCustomerCredit] = useState(false);
  const [customerCreditToUse, setCustomerCreditToUse] = useState(0);
  const [notes, setNotes] = useState('');
  const [showNotesOnPdf, setShowNotesOnPdf] = useState(true);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryDateMode, setDeliveryDateMode] = useState<DeliveryDateMode>('auto');
  const [deliveryMethod, setDeliveryMethod] = useState('retirada');
  const [discountType, setDiscountType] = useState<DiscountType>('fixed');
  const [discount, setDiscount] = useState(0);
  const [freight, setFreight] = useState(0);
  const [paymentCondition, setPaymentCondition] = useState('avista');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [companyPaymentMethods, setCompanyPaymentMethods] = useState<CompanyPaymentMethodConfig[]>(
    getActiveCompanyPaymentMethods(defaultCompanyPaymentMethods),
  );
  const [priority, setPriorityLevel] = useState<PriorityLevel>('normal');
  const [responsibleId, setResponsibleId] = useState('');

  const [items, setItems] = useState<OrderItemForm[]>([]);
  const [totals, setTotals] = useState({
    itemCount: 0,
    subtotal: 0,
    total: 0,
  });

  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerBlurTimerRef = useRef<number | null>(null);
  const customerInputRef = useRef<HTMLInputElement | null>(null);

  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [selectedDialogProductId, setSelectedDialogProductId] = useState('');
  const [productDialogQuantity, setProductDialogQuantity] = useState(1);
  const [manualItemDialogOpen, setManualItemDialogOpen] = useState(false);
  const [manualItemDescription, setManualItemDescription] = useState('');
  const [manualItemQuantity, setManualItemQuantity] = useState(1);
  const [manualItemPrice, setManualItemPrice] = useState(0);
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [discountDialogType, setDiscountDialogType] = useState<DiscountType>('fixed');
  const [discountDialogValue, setDiscountDialogValue] = useState(0);
  const [freightDialogOpen, setFreightDialogOpen] = useState(false);
  const [freightDialogValue, setFreightDialogValue] = useState(0);
  const [paymentQuickDialogOpen, setPaymentQuickDialogOpen] = useState(false);
  const [paymentConditionDialogValue, setPaymentConditionDialogValue] = useState('avista');
  const [paymentMethodDialogValue, setPaymentMethodDialogValue] = useState<PaymentMethod>('pix');
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notesDialogValue, setNotesDialogValue] = useState('');
  const [notesDialogShowOnPdf, setNotesDialogShowOnPdf] = useState(true);

  const draftRestoredRef = useRef(false);
  const draftStorageKey = 'order_form_draft';

  const fmt = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n || 0));

  const isManualOrderItem = (item: OrderItemForm) => Boolean(item.isManual || item.product.id.startsWith('manual:'));

  const getProductPrice = (product: Product, quantity: number): number => {
    const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    const suppliesCost = suppliesCostMap[product.id] || 0;
    return resolveProductPrice(product, safeQuantity, priceTiers, suppliesCost);
  };

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
    const basePrice = getProductPrice(product, quantity);
    const attributeModifier = getAttributePriceModifier(product.id, attributes);
    return Math.max(0, basePrice + attributeModifier);
  };

  const validateTierQuantity = (product: Product, quantity: number) => {
    if (isAreaUnit(product.unit)) {
      return true;
    }

    if (isQuantityAllowedByPriceTiers(product.id, quantity, priceTiers)) {
      return true;
    }

    toast({
      title: 'Quantidade fora da faixa permitida',
      description: getPriceTierValidationMessage(product.id, priceTiers) || undefined,
      variant: 'destructive',
    });
    return false;
  };

  const getTierRangeLabel = (productId: string) => {
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

  const calculateItemTotal = (item: OrderItemForm) =>
    calculateLineTotal({
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unit_price || 0),
      discountType: 'fixed',
      discountValue: Number(item.discount || 0),
    });

  const calculateOrderDiscountAmount = (
    subtotalValue: number,
    nextDiscountType: DiscountType = discountType,
    nextDiscountValue: number = discount,
  ) =>
    calculateDiscountAmount({
      baseAmount: subtotalValue,
      discountType: nextDiscountType,
      discountValue: nextDiscountValue,
    });

  const updateTotals = (
    nextItems: OrderItemForm[] = items,
    nextDiscountType: DiscountType = discountType,
    nextDiscount: number = discount,
    nextFreight: number = freight,
  ) => {
    const subtotal = nextItems.reduce((sum, item) => sum + calculateItemTotal(item), 0);
    const discountAmount = calculateOrderDiscountAmount(subtotal, nextDiscountType, nextDiscount);
    const calculatedTotal = Math.max(0, subtotal - discountAmount + Number(nextFreight || 0));
    setTotals({
      itemCount: nextItems.length,
      subtotal,
      total: calculatedTotal,
    });
  };

  useEffect(() => {
    updateTotals();
  }, [discount, discountType, freight, items]);

  const itemsSnapshot = useMemo(
    () =>
      items.map((item) => ({
        product_id: isManualOrderItem(item) ? null : item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        attributes: item.attributes,
        notes: item.notes,
        is_manual: isManualOrderItem(item),
      })),
    [items],
  );

  const formSnapshot = useMemo(
    () => ({
      documentType,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      notes,
      showNotesOnPdf,
      deliveryDate,
      deliveryDateMode,
      deliveryMethod,
      discountType,
      discount,
      freight,
      paymentCondition,
      paymentMethod,
      priority,
      responsibleId,
      items: itemsSnapshot,
    }),
    [
      documentType,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      notes,
      showNotesOnPdf,
      deliveryDate,
      deliveryDateMode,
      deliveryMethod,
      discountType,
      discount,
      freight,
      paymentCondition,
      paymentMethod,
      priority,
      responsibleId,
      itemsSnapshot,
    ],
  );

  const formSnapshotJson = useMemo(() => JSON.stringify(formSnapshot), [formSnapshot]);
  const isDirty = initialSnapshot !== null && initialSnapshot !== formSnapshotJson;
  const hasDraftData = Boolean(
    items.length > 0 ||
    customerId ||
    customerName.trim() ||
    customerPhone.trim() ||
    customerEmail.trim() ||
    notes.trim() ||
    !showNotesOnPdf ||
    discountType !== 'fixed' ||
    discount > 0 ||
    freight > 0,
  );

  const finalTotalToPay = Math.max(0, totals.total - (useCustomerCredit ? customerCreditToUse : 0));

  useUnsavedChanges((isDirty || hasDraftData) && !saving);

  useEffect(() => {
    if (!loading && initialSnapshot === null) {
      setInitialSnapshot(formSnapshotJson);
    }
  }, [loading, initialSnapshot, formSnapshotJson]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        let customersQuery = supabase.from('customers').select('*').order('name');
        let productsQuery = supabase.from('products').select('*').eq('is_active', true).order('name');
        let salespeopleQuery = supabase.from('profiles').select('id, full_name').order('full_name');

        if (profile?.company_id) {
          customersQuery = customersQuery.eq('company_id', profile.company_id);
          productsQuery = productsQuery.eq('company_id', profile.company_id);
          salespeopleQuery = salespeopleQuery.eq('company_id', profile.company_id);
        }

        const [custResult, prodResult, tiersResult, suppliesResult, salespeopleResult] = await Promise.all([
          customersQuery,
          productsQuery,
          supabase.from('price_tiers').select('*').order('min_quantity'),
          supabase.from('product_supplies').select('product_id, quantity, supply:supplies(cost_per_unit)'),
          salespeopleQuery,
        ]);

        if (custResult.error) throw custResult.error;
        if (prodResult.error) throw prodResult.error;
        if (tiersResult.error) throw tiersResult.error;
        if (suppliesResult.error) throw suppliesResult.error;
        if (salespeopleResult.error) throw salespeopleResult.error;

        setCustomers((custResult.data as Customer[]) || []);
        const loadedProducts = (prodResult.data as unknown as Product[]) || [];
        setProducts(loadedProducts);
        setPriceTiers((tiersResult.data as PriceTier[]) || []);
        setSalespeople((salespeopleResult.data as SalespersonOption[]) || []);

        const productIds = loadedProducts.map((product) => product.id).filter(Boolean);
        const nextProductAttributeMap: Record<string, ProductAttributeGroup[]> = {};

        if (productIds.length > 0) {
          const { data: productAttributesResult, error: productAttributesError } = await supabase
            .from('product_attributes')
            .select(
              'product_id, price_modifier, attribute_value_id, attribute_value:attribute_values(id, value, attribute_id, attribute:attributes(id, name))',
            )
            .in('product_id', productIds);

          if (productAttributesError) throw productAttributesError;

          (productAttributesResult || []).forEach((row) => {
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
        }

        setProductAttributeMap(nextProductAttributeMap);

        const suppliesCostByProduct: Record<string, number> = {};
        const suppliesRows = (suppliesResult.data || []) as Array<{
          product_id: string | null;
          quantity: number | null;
          supply: { cost_per_unit: number | null } | null;
        }>;
        suppliesRows.forEach((row) => {
          if (!row.product_id) return;
          const costPerUnit = Number(row.supply?.cost_per_unit ?? 0);
          const quantity = Number(row.quantity ?? 0);
          suppliesCostByProduct[row.product_id] =
            (suppliesCostByProduct[row.product_id] || 0) + costPerUnit * quantity;
        });
        setSuppliesCostMap(suppliesCostByProduct);

        if (!responsibleId) {
          const people = (salespeopleResult.data as SalespersonOption[] | null) || [];
          const defaultResponsible = people.find((person) => person.id === user.id)?.id || people[0]?.id || '';
          setResponsibleId(defaultResponsible);
        }
      } catch (error) {
        toast({
          title: 'Erro ao carregar dados',
          description: error instanceof Error ? error.message : 'Não foi possível carregar os dados',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile?.company_id, toast, user.id]);

  useEffect(() => {
    let active = true;

    const loadPaymentMethods = async () => {
      try {
        const result = await fetchCompanyPaymentMethods({
          companyId: profile?.company_id || company?.id || null,
          activeOnly: true,
        });
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
  }, [company?.id, profile?.company_id]);

  useEffect(() => {
    if (companyPaymentMethods.some((method) => method.type === paymentMethod)) return;
    setPaymentMethod(companyPaymentMethods[0]?.type || 'pix');
  }, [companyPaymentMethods, paymentMethod]);

  useEffect(() => {
    if (loading || draftRestoredRef.current) return;

    const raw = window.localStorage.getItem(draftStorageKey);
    if (!raw) {
      draftRestoredRef.current = true;
      return;
    }

    try {
      const parsed = JSON.parse(raw) as {
        documentType?: DocumentType;
        customerId?: string;
        customerName?: string;
        customerPhone?: string;
        customerEmail?: string;
        notes?: string;
        showNotesOnPdf?: boolean;
        deliveryDate?: string;
        deliveryDateMode?: DeliveryDateMode;
        deliveryMethod?: string;
        discountType?: DiscountType;
        discount?: number;
        freight?: number;
        paymentCondition?: string;
        paymentMethod?: PaymentMethod;
        priority?: PriorityLevel;
        responsibleId?: string;
        items?: Array<{
          productId: string;
          productName?: string;
          quantity: number;
          unit_price: number;
          discount: number;
          attributes: Record<string, string>;
          notes: string;
          isManual?: boolean;
        }>;
      };

      if (parsed.documentType) setDocumentType(parsed.documentType);
      if (parsed.customerId) setCustomerId(parsed.customerId);
      if (parsed.customerName) setCustomerName(parsed.customerName);
      if (parsed.customerPhone) setCustomerPhone(parsed.customerPhone);
      if (parsed.customerEmail) setCustomerEmail(parsed.customerEmail);
      if (parsed.notes) setNotes(parsed.notes);
      if (typeof parsed.showNotesOnPdf === 'boolean') setShowNotesOnPdf(parsed.showNotesOnPdf);
      if (parsed.deliveryDate) setDeliveryDate(parsed.deliveryDate);
      if (parsed.deliveryDateMode) {
        setDeliveryDateMode(parsed.deliveryDateMode);
      }
      if (parsed.deliveryMethod) setDeliveryMethod(parsed.deliveryMethod);
      if (parsed.discountType) setDiscountType(normalizeDiscountType(parsed.discountType));
      if (typeof parsed.discount === 'number') setDiscount(parsed.discount);
      if (typeof parsed.freight === 'number') setFreight(parsed.freight);
      if (parsed.paymentCondition) setPaymentCondition(parsed.paymentCondition);
      if (parsed.paymentMethod) setPaymentMethod(parsed.paymentMethod);
      if (parsed.priority) setPriorityLevel(parsed.priority);
      if (parsed.responsibleId) setResponsibleId(parsed.responsibleId);

      if (parsed.items && Array.isArray(parsed.items)) {
        const restoredItems = parsed.items
          .map((item) => {
            if (item.isManual || item.productId?.startsWith('manual:')) {
              return {
                product: createManualProduct(item.productName || 'Item avulso'),
                quantity: Number(item.quantity) || 1,
                unit_price: Number(item.unit_price) || 0,
                discount: Number(item.discount) || 0,
                attributes: {},
                notes: item.notes || '',
                isManual: true,
              } as OrderItemForm;
            }

            const product = products.find((productEntry) => productEntry.id === item.productId);
            if (!product) return null;
            const nextAttributes = ensureSelectedAttributes(product.id, item.attributes || {});
            const nextQuantity = Number(item.quantity) || 1;
            return {
              product,
              quantity: nextQuantity,
              unit_price: calculateUnitPriceWithAttributes(product, nextQuantity, nextAttributes),
              discount: Number(item.discount) || 0,
              attributes: nextAttributes,
              notes: item.notes || '',
            } as OrderItemForm;
          })
          .filter(Boolean) as OrderItemForm[];

        if (restoredItems.length > 0) {
          setItems(restoredItems);
        }
      }

      if (parsed.customerName) {
        setCustomerSearchTerm(parsed.customerName);
      }

      toast({ title: 'Rascunho restaurado' });
    } catch {
      window.localStorage.removeItem(draftStorageKey);
    } finally {
      draftRestoredRef.current = true;
    }
  }, [loading, products, toast]);

  useEffect(() => {
    if (!draftRestoredRef.current) return;
    const payload = {
      documentType,
      customerId: customerId || undefined,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      customerEmail: customerEmail.trim() || undefined,
      notes: notes.trim() || undefined,
      showNotesOnPdf,
      deliveryDate: deliveryDate || undefined,
      deliveryDateMode,
      deliveryMethod: deliveryMethod || undefined,
      discountType,
      discount,
      freight,
      paymentCondition,
      paymentMethod,
      priority,
      responsibleId: responsibleId || undefined,
      items: items.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        attributes: item.attributes,
        notes: item.notes,
        isManual: isManualOrderItem(item),
      })),
    };

    const hasData =
      payload.items.length > 0 ||
      Boolean(
        payload.customerId ||
        payload.customerName ||
        payload.customerPhone ||
        payload.customerEmail ||
        payload.notes ||
        !payload.showNotesOnPdf ||
        payload.discountType !== 'fixed' ||
        payload.discount > 0 ||
        payload.freight > 0,
      );

    if (!hasData) {
      window.localStorage.removeItem(draftStorageKey);
      return;
    }

    window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
  }, [
    customerId,
    customerName,
    customerPhone,
    customerEmail,
    deliveryDate,
    deliveryDateMode,
    deliveryMethod,
    discount,
    discountType,
    documentType,
    draftStorageKey,
    freight,
    items,
    notes,
    showNotesOnPdf,
    paymentCondition,
    paymentMethod,
    priority,
    responsibleId,
  ]);

  useEffect(() => {
    return () => {
      if (customerBlurTimerRef.current) {
        window.clearTimeout(customerBlurTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if (!isShortcut) return;
      event.preventDefault();
      customerInputRef.current?.focus();
      setCustomerDropdownOpen(true);
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  const filteredCustomers = useMemo(() => {
    const text = customerSearchTerm.trim().toLowerCase();
    const digits = normalizeDigits(customerSearchTerm);
    if (!text && !digits) return customers.slice(0, 5);
    return customers
      .filter((customer) => {
        const byName = customer.name.toLowerCase().includes(text);
        const byDigits = digits
          ? Boolean(
            customer.document?.includes(digits) ||
            customer.phone?.includes(digits) ||
            customer.email?.toLowerCase().includes(text),
          )
          : false;
        return byName || byDigits;
      })
      .slice(0, 5);
  }, [customerSearchTerm, customers]);

  const filteredProducts = useMemo(() => {
    const text = productSearchTerm.trim().toLowerCase();
    if (!text) return products.slice(0, 8);
    return products
      .filter((product) => {
        const byName = product.name.toLowerCase().includes(text);
        const bySku = (product.sku || '').toLowerCase().includes(text);
        const byId = product.id.toLowerCase().includes(text);
        return byName || bySku || byId;
      })
      .slice(0, 8);
  }, [productSearchTerm, products]);
  const selectedDialogProduct = useMemo(
    () => filteredProducts.find((product) => product.id === selectedDialogProductId) || products.find((product) => product.id === selectedDialogProductId) || null,
    [filteredProducts, products, selectedDialogProductId],
  );
  const productDialogQuantityValue = selectedDialogProduct && isAreaUnit(selectedDialogProduct.unit)
    ? 1
    : Math.max(1, Number(productDialogQuantity) || 1);
  const productDialogPreviewPrice = selectedDialogProduct
    ? calculateUnitPriceWithAttributes(
      selectedDialogProduct,
      productDialogQuantityValue,
      ensureSelectedAttributes(selectedDialogProduct.id),
    )
    : 0;
  const productDialogPreviewTotal = productDialogPreviewPrice * productDialogQuantityValue;
  const customerDisplayName = customerName.trim() || customerSearchTerm.trim() || 'Cliente não informado';
  const documentTypeLabel =
    documentTypeOptions.find((option) => option.id === documentType)?.label || 'Pedido';
  const paymentConditionLabel =
    paymentConditions.find((option) => option.value === paymentCondition)?.label || 'À vista';
  const notesPreviewText = notes.trim()
    ? notes.trim().slice(0, 72) + (notes.trim().length > 72 ? '...' : '')
    : 'Sem observações no pedido';
  const orderDiscountAmount = calculateOrderDiscountAmount(totals.subtotal);
  const discountDialogPreviewAmount = calculateOrderDiscountAmount(
    totals.subtotal,
    discountDialogType,
    discountDialogValue,
  );
  const discountDialogPreviewTotal = Math.max(0, totals.subtotal - discountDialogPreviewAmount + freight);
  const freightDialogPreviewTotal = Math.max(0, totals.subtotal - orderDiscountAmount + freightDialogValue);
  const createdAtLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date()),
    [],
  );

  useEffect(() => {
    if (!productDialogOpen) return;

    if (filteredProducts.length === 0) {
      if (selectedDialogProductId) {
        setSelectedDialogProductId('');
      }
      return;
    }

    if (!filteredProducts.some((product) => product.id === selectedDialogProductId)) {
      setSelectedDialogProductId(filteredProducts[0].id);
    }
  }, [filteredProducts, productDialogOpen, selectedDialogProductId]);

  const stepStates = useMemo(() => {
    const detailsDone = Boolean((customerId || customerName.trim()) && items.length > 0);
    const reviewDone = Boolean(items.length > 0 && paymentMethod && paymentCondition);
    const confirmationDone = false;
    const doneMap = [true, detailsDone, reviewDone, confirmationDone];
    const activeIndex = saving ? 3 : doneMap.findIndex((isDone) => !isDone);
    return {
      doneMap,
      activeIndex: activeIndex === -1 ? 3 : activeIndex,
    };
  }, [customerId, customerName, items.length, paymentMethod, paymentCondition, saving]);

  const totalQuantity = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [items],
  );

  const companyDeliveryTimeDays = useMemo(
    () => resolveCompanyDeliveryTimeDays(company),
    [company],
  );

  const productionInfo = useMemo(() => {
    let maxProductionDays: number | null = null;

    items.forEach((item) => {
      const productDays = normalizeProductionTimeDays(item.product.production_time_days);
      if (productDays === null) return;
      maxProductionDays =
        maxProductionDays === null ? productDays : Math.max(maxProductionDays, productDays);
    });

    const estimatedDeliveryInfo = calculateEstimatedDeliveryInfo({
      productionTimeDays: maxProductionDays,
      companyDeliveryDays: companyDeliveryTimeDays,
    });

    return {
      productionTimeDaysUsed: maxProductionDays,
      estimatedDeliveryDate: estimatedDeliveryInfo?.isoDate ?? null,
    };
  }, [companyDeliveryTimeDays, items]);

  const autoDeliveryDateDescription = useMemo(() => {
    if (companyDeliveryTimeDays > 0) {
      return `Data calculada automaticamente com base no maior prazo em dias úteis dos produtos + ${formatBusinessDaysLabel(companyDeliveryTimeDays)} de entrega da loja.`;
    }

    return 'Data calculada automaticamente com base no maior prazo em dias úteis dos produtos selecionados.';
  }, [companyDeliveryTimeDays]);

  useEffect(() => {
    if (deliveryDateMode !== 'auto') return;

    const nextDeliveryDate = productionInfo.estimatedDeliveryDate ?? '';
    setDeliveryDate((current) => (current === nextDeliveryDate ? current : nextDeliveryDate));
  }, [deliveryDateMode, productionInfo.estimatedDeliveryDate]);

  const setType = (type: DocumentType) => {
    setDocumentType(type);
  };

  const selectPayment = (method: PaymentMethod) => {
    setPaymentMethod(method);
  };

  const setPriority = (value: PriorityLevel) => {
    setPriorityLevel(value);
  };

  const addItem = (productId: string, quantityOverride?: number) => {
    const product = products.find((entry) => entry.id === productId);
    if (!product) return;
    const initialQuantity = isAreaUnit(product.unit)
      ? 1
      : getInitialTierQuantity(product.id, priceTiers);
    const nextAttributes = ensureSelectedAttributes(product.id);
    const requestedQuantity =
      Number.isFinite(quantityOverride) && Number(quantityOverride) > 0
        ? Math.max(1, Number(quantityOverride))
        : initialQuantity;
    const quantityToAdd = isAreaUnit(product.unit) ? 1 : requestedQuantity;

    setItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.product.id === product.id);
      if (existingIndex >= 0) {
        const next = [...prev];
        const nextQty = Math.max(1, Number(next[existingIndex].quantity || 1) + quantityToAdd);
        if (!validateTierQuantity(product, nextQty)) {
          return prev;
        }
        const existingAttributes = ensureSelectedAttributes(product.id, next[existingIndex].attributes);
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: nextQty,
          attributes: existingAttributes,
          unit_price: calculateUnitPriceWithAttributes(product, nextQty, existingAttributes),
        };
        return next;
      }

      const quantity = quantityToAdd;
      if (!validateTierQuantity(product, quantity)) {
        return prev;
      }
      return [
        ...prev,
        {
          product,
          quantity,
          unit_price: calculateUnitPriceWithAttributes(product, quantity, nextAttributes),
          discount: 0,
          attributes: nextAttributes,
          notes: '',
        },
      ];
    });

    setProductSearchTerm('');
  };

  const addManualItem = () => {
    const description = manualItemDescription.trim();
    const quantity = Math.max(1, Number(manualItemQuantity) || 1);
    const unitPrice = Math.max(0, Number(manualItemPrice) || 0);

    if (!description) {
      toast({ title: 'Informe a descrição do item', variant: 'destructive' });
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        product: createManualProduct(description),
        quantity,
        unit_price: unitPrice,
        discount: 0,
        attributes: {},
        notes: '',
        isManual: true,
      },
    ]);

    setManualItemDescription('');
    setManualItemQuantity(1);
    setManualItemPrice(0);
    setManualItemDialogOpen(false);
  };

  const openProductDialog = () => {
    setProductSearchTerm('');
    setProductDialogQuantity(1);
    setSelectedDialogProductId(products[0]?.id || '');
    setProductDialogOpen(true);
  };

  const closeProductDialog = (open: boolean) => {
    setProductDialogOpen(open);
    if (!open) {
      setProductSearchTerm('');
      setProductDialogQuantity(1);
      setSelectedDialogProductId('');
    }
  };

  const openManualDialog = () => {
    setManualItemDescription('');
    setManualItemQuantity(1);
    setManualItemPrice(0);
    setManualItemDialogOpen(true);
  };

  const openDiscountDialog = () => {
    setDiscountDialogType(discountType);
    setDiscountDialogValue(discount);
    setDiscountDialogOpen(true);
  };

  const applyDiscountDialog = () => {
    setDiscountType(discountDialogType);
    setDiscount(discountDialogValue);
    setDiscountDialogOpen(false);
  };

  const openFreightDialog = () => {
    setFreightDialogValue(freight);
    setFreightDialogOpen(true);
  };

  const applyFreightDialog = () => {
    setFreight(freightDialogValue);
    setFreightDialogOpen(false);
  };

  const openPaymentQuickDialog = () => {
    setPaymentConditionDialogValue(paymentCondition);
    setPaymentMethodDialogValue(paymentMethod);
    setPaymentQuickDialogOpen(true);
  };

  const applyPaymentQuickDialog = () => {
    setPaymentCondition(paymentConditionDialogValue);
    setPaymentMethod(paymentMethodDialogValue);
    setPaymentQuickDialogOpen(false);
  };

  const openNotesDialog = () => {
    setNotesDialogValue(notes);
    setNotesDialogShowOnPdf(showNotesOnPdf);
    setNotesDialogOpen(true);
  };

  const applyNotesDialog = () => {
    setNotes(notesDialogValue);
    setShowNotesOnPdf(notesDialogShowOnPdf);
    setNotesDialogOpen(false);
  };

  const handleAddSelectedProduct = () => {
    if (!selectedDialogProduct) {
      toast({ title: 'Selecione um produto', variant: 'destructive' });
      return;
    }

    addItem(selectedDialogProduct.id, productDialogQuantityValue);
    closeProductDialog(false);
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const changeQty = (productId: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        if (isManualOrderItem(item)) {
          return {
            ...item,
            quantity: Math.max(1, Number(item.quantity || 1) + delta),
          };
        }
        const nextQty = Math.max(1, Number(item.quantity || 1) + delta);
        if (!validateTierQuantity(item.product, nextQty)) {
          return item;
        }
        const nextAttributes = ensureSelectedAttributes(item.product.id, item.attributes);
        return {
          ...item,
          quantity: nextQty,
          attributes: nextAttributes,
          unit_price: calculateUnitPriceWithAttributes(item.product, nextQty, nextAttributes),
        };
      }),
    );
  };

  const setQty = (productId: string, value: number) => {
    const nextValue = Number.isFinite(value) ? Math.max(1, value) : 1;
    setItems((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        if (isManualOrderItem(item)) {
          return {
            ...item,
            quantity: nextValue,
          };
        }
        if (!validateTierQuantity(item.product, nextValue)) {
          return item;
        }
        const nextAttributes = ensureSelectedAttributes(item.product.id, item.attributes);
        return {
          ...item,
          quantity: nextValue,
          attributes: nextAttributes,
          unit_price: calculateUnitPriceWithAttributes(item.product, nextValue, nextAttributes),
        };
      }),
    );
  };

  const changeM2SubQuantity = (productId: string, key: string, value: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        if (!isAreaUnit(item.product.unit)) return item;

        const nextAttributes = { ...(item.attributes || {}) };
        nextAttributes[key] = value;

        const widthCm = parseMeasurementInput(nextAttributes[M2_ATTRIBUTE_KEYS.widthCm]);
        const heightCm = parseMeasurementInput(nextAttributes[M2_ATTRIBUTE_KEYS.heightCm]);

        let areaM2 = 1;
        if (typeof widthCm === 'number' && typeof heightCm === 'number' && widthCm > 0 && heightCm > 0) {
          areaM2 = calculateAreaM2(widthCm, heightCm);
        }

        const normalizedAttributes = ensureSelectedAttributes(item.product.id, nextAttributes);
        return {
          ...item,
          attributes: normalizedAttributes,
          quantity: areaM2,
          unit_price: calculateUnitPriceWithAttributes(item.product, areaM2, normalizedAttributes),
        };
      })
    );
  };

  const changeItemAttribute = (productId: string, attributeName: string, value: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;

        const nextAttributes = ensureSelectedAttributes(item.product.id, {
          ...(item.attributes || {}),
          [attributeName]: value,
        });

        return {
          ...item,
          attributes: nextAttributes,
          unit_price: calculateUnitPriceWithAttributes(item.product, item.quantity, nextAttributes),
        };
      }),
    );
  };

  const handleCustomerSelect = (customer: Customer) => {
    setCustomerId(customer.id);
    setCustomerName(customer.name || '');
    setCustomerPhone(customer.phone || '');
    setCustomerEmail(customer.email || '');
    setCustomerAvailableCredit(Number(customer.saldo_credito || 0));
    setUseCustomerCredit(false);
    setCustomerCreditToUse(0);
    setCustomerSearchTerm(customer.name || '');
    setCustomerDropdownOpen(false);
  };

  const clearCustomerSelection = () => {
    setCustomerId('');
    setCustomerName('');
    setCustomerSearchTerm('');
    setCustomerAvailableCredit(0);
    setUseCustomerCredit(false);
    setCustomerCreditToUse(0);
  };

  const persistDraftNow = () => {
    const payload = {
      documentType,
      customerId: customerId || undefined,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      customerEmail: customerEmail.trim() || undefined,
      notes: notes.trim() || undefined,
      showNotesOnPdf,
      deliveryDate: deliveryDate || undefined,
      deliveryDateMode,
      deliveryMethod: deliveryMethod || undefined,
      discountType,
      discount,
      freight,
      paymentCondition,
      paymentMethod,
      priority,
      responsibleId: responsibleId || undefined,
      items: items.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        attributes: item.attributes,
        notes: item.notes,
        isManual: isManualOrderItem(item),
      })),
    };
    window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
  };

  const handleSaveDraft = () => {
    persistDraftNow();
    toast({ title: 'Rascunho salvo' });
  };

  const buildOrderNotes = () => {
    const sanitizedNotes = notes.trim();
    return sanitizedNotes.length > 0 ? sanitizedNotes : null;
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (!user.id) {
      toast({ title: 'Sessão inválida', description: 'Faça login novamente', variant: 'destructive' });
      return;
    }
    if (items.length === 0) {
      toast({ title: 'Adicione ao menos um produto', variant: 'destructive' });
      return;
    }

    const invalidTierItems = items.filter((item) => {
      if (isManualOrderItem(item)) return false;
      if (isAreaUnit(item.product.unit)) return false;
      return !isQuantityAllowedByPriceTiers(item.product.id, item.quantity, priceTiers);
    });

    if (invalidTierItems.length > 0) {
      toast({
        title: 'Quantidade fora da faixa permitida',
        description: getPriceTierValidationMessage(invalidTierItems[0].product.id, priceTiers) || undefined,
        variant: 'destructive',
      });
      return;
    }

    const invalidAttributeItems = items.filter((item) => {
      if (isManualOrderItem(item)) return false;
      return getProductAttributeGroups(item.product.id).some((group) => {
        const selectedValue = String(item.attributes?.[group.attributeName] || '').trim();
        return !group.options.some((option) => option.value === selectedValue);
      });
    });

    if (invalidAttributeItems.length > 0) {
      toast({
        title: 'Selecione os atributos do produto',
        description: invalidAttributeItems[0]?.product.name || undefined,
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    let createdOrderId: string | null = null;

    try {
      let resolvedCustomerId = customerId || null;
      const trimmedCustomerName = customerName.trim();

      if (!resolvedCustomerId && trimmedCustomerName) {
        const { data: existingCustomer, error: lookupError } = await supabase
          .from('customers')
          .select('id')
          .ilike('name', trimmedCustomerName)
          .limit(1)
          .maybeSingle();

        if (lookupError) throw lookupError;

        if (existingCustomer?.id) {
          resolvedCustomerId = existingCustomer.id;
        } else {
          const { data: createdCustomer, error: createCustomerError } = await supabase
            .from('customers')
            .insert({
              name: trimmedCustomerName,
              phone: customerPhone.trim() || null,
              email: customerEmail.trim() || null,
            })
            .select('id')
            .single();

          if (createCustomerError || !createdCustomer?.id) {
            throw createCustomerError || new Error('Não foi possível criar cliente');
          }

          resolvedCustomerId = createdCustomer.id;
        }
      }

      const status: OrderStatus = documentType === 'orcamento' ? 'orcamento' : 'pendente';
      const orderDiscountAmount = calculateOrderDiscountAmount(totals.subtotal);
      const { data: createdOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          company_id: profile?.company_id || null,
          customer_id: resolvedCustomerId,
          customer_name: customerName.trim() || null,
          status,
          subtotal: totals.subtotal,
          discount_type: discountType,
          discount_value: discount,
          discount: orderDiscountAmount,
          total: totals.total,
          amount_paid: 0,
          payment_status: 'pendente',
          payment_method: paymentMethod,
          notes: buildOrderNotes(),
          show_notes_on_pdf: showNotesOnPdf,
          production_time_days_used: productionInfo.productionTimeDaysUsed,
          estimated_delivery_date: deliveryDate || productionInfo.estimatedDeliveryDate,
          created_by: user.id,
        } as any)
        .select('id, order_number, customer_name')
        .single();

      if (orderError || !createdOrder?.id) {
        throw orderError || new Error('Não foi possível criar pedido');
      }

      createdOrderId = createdOrder.id;

      const orderItemsPayload = items.map((item) => ({
        order_id: createdOrder.id,
        product_id: isManualOrderItem(item) ? null : item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_type: 'fixed',
        discount_value: item.discount,
        discount: item.discount,
        total: calculateItemTotal(item),
        attributes: item.attributes,
        notes: item.notes || null,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItemsPayload as any);
      if (itemsError) throw itemsError;

      const { error: historyError } = await supabase.from('order_status_history').insert({
        order_id: createdOrder.id,
        status,
        user_id: user.id,
        notes: status === 'orcamento' ? 'Orçamento criado' : 'Pedido criado',
      });
      if (historyError) throw historyError;

      if (useCustomerCredit && customerCreditToUse > 0 && customerAvailableCredit >= customerCreditToUse) {
        await applyCustomerCreditToOrder({
          orderId: createdOrder.id,
          amount: customerCreditToUse,
          createdBy: user.id,
          notes: 'Aplicado na criação do pedido',
        });
      }

      window.localStorage.removeItem(draftStorageKey);
      setInitialSnapshot(JSON.stringify({ ...formSnapshot, items: [] }));

      toast({ title: 'Pedido criado com sucesso' });
      navigate(
        buildOrderDetailsPath({
          id: createdOrder.id,
          orderNumber: createdOrder.order_number,
          customerName: createdOrder.customer_name || customerName,
        }),
      );
    } catch (error) {
      if (createdOrderId) {
        await supabase.from('order_items').delete().eq('order_id', createdOrderId);
        await supabase.from('orders').delete().eq('id', createdOrderId);
      }
      toast({
        title: 'Erro ao criar pedido',
        description: error instanceof Error ? error.message : 'Não foi possível concluir o cadastro',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChangeOrderDiscountType = (value: string) => {
    const nextType = normalizeDiscountType(value);
    const currentDiscountAmount = calculateOrderDiscountAmount(totals.subtotal, discountType, discount);
    setDiscountType(nextType);
    setDiscount(
      calculateDiscountValueFromAmount({
        baseAmount: totals.subtotal,
        discountAmount: currentDiscountAmount,
        discountType: nextType,
      }),
    );
  };

  if (loading) {
    return (
      <div className="order-new-page">
        <div className="order-loading-card">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Carregando formulário...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="order-new-page">
      <div className="order-page-shell">
        <div className="order-page-header order-fade-up order-fade-delay-1">
          <button type="button" className="order-back-btn" onClick={() => navigate('/pedidos')}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="order-page-title">Novo Pedido / Orçamento</h1>
            <p className="order-page-subtitle">Monte os itens, configure pagamento e confirme o documento.</p>
          </div>
        </div>

        <div className="order-steps order-fade-up order-fade-delay-2" aria-label="Etapas do formulário">
          {steps.map((label, index) => {
            const isDone = stepStates.doneMap[index];
            const isActive = stepStates.activeIndex === index;
            const showDoneIcon = isDone && !isActive;
            return (
              <div key={label} className="order-step-wrap">
                <div className={`order-step ${isDone ? 'is-done' : ''} ${isActive ? 'is-active' : ''}`}>
                  <span className="order-step-circle">
                    {showDoneIcon ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  <span className="order-step-label">{label}</span>
                </div>
                {index < steps.length - 1 ? (
                  <span
                    className={`order-step-line ${stepStates.doneMap[index + 1] ? 'is-done' : ''}`}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="order-layout order-fade-up order-fade-delay-3">
          <div className="order-main-column">
            <section className="order-card">
              <div className="order-card-header">
                <h2 className="order-card-title">
                  <ClipboardList className="order-card-title-icon" />
                  Tipo de Documento
                </h2>
              </div>
              <div className="order-card-body">
                <div className="order-type-toggle">
                  {documentTypeOptions.map((option) => {
                    const Icon = option.icon;
                    const active = documentType === option.id;
                    return (
                      <button
                        type="button"
                        key={option.id}
                        className={`order-type-btn ${active ? 'is-active' : ''}`}
                        onClick={() => setType(option.id)}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="order-card">
              <div className="order-card-header">
                <h2 className="order-card-title">
                  <UserRound className="order-card-title-icon" />
                  Cliente
                </h2>
              </div>
              <div className="order-card-body">
                <div className="order-form-grid-2">
                  <div className="order-field-group">
                    <label className="order-field-label" htmlFor="customer-search">
                      Buscar cliente
                    </label>
                    <div className="order-search-field">
                      <Search className="order-field-icon" />
                      <input
                        id="customer-search"
                        ref={customerInputRef}
                        value={customerSearchTerm}
                        onChange={(event) => {
                          setCustomerSearchTerm(event.target.value);
                          setCustomerDropdownOpen(true);
                        }}
                        onFocus={() => {
                          if (customerBlurTimerRef.current) {
                            window.clearTimeout(customerBlurTimerRef.current);
                          }
                          setCustomerDropdownOpen(true);
                        }}
                        onBlur={() => {
                          customerBlurTimerRef.current = window.setTimeout(() => {
                            setCustomerDropdownOpen(false);
                          }, 150);
                        }}
                        placeholder="Buscar por nome, CPF/CNPJ ou contato"
                        className="order-input order-search-input"
                      />
                      <span className="order-kbd-hint">Ctrl+K</span>
                    </div>
                    {customerDropdownOpen ? (
                      <div className="order-dropdown">
                        {filteredCustomers.length === 0 ? (
                          <div className="order-dropdown-empty">Nenhum cliente encontrado</div>
                        ) : (
                          filteredCustomers.map((customer) => (
                            <button
                              key={customer.id}
                              type="button"
                              className="order-dropdown-row"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => handleCustomerSelect(customer)}
                            >
                              <div className="order-dropdown-main">
                                <strong>{customer.name}</strong>
                                <span>{customer.document || customer.phone || customer.email || '-'}</span>
                              </div>
                              <span className="order-dropdown-action">Selecionar</span>
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                    {customerId ? (
                      <button type="button" className="order-link-btn" onClick={clearCustomerSelection}>
                        Limpar cliente selecionado
                      </button>
                    ) : null}
                  </div>

                  <div className="order-field-group">
                    <label className="order-field-label" htmlFor="customer-name">
                      Nome do cliente (opcional)
                    </label>
                    <input
                      id="customer-name"
                      value={customerName}
                      onChange={(event) => {
                        setCustomerName(event.target.value);
                        if (customerId) setCustomerId('');
                      }}
                      placeholder="Ex.: Maria Silva"
                      className="order-input"
                    />
                  </div>
                </div>

                <div className="order-form-grid-2">
                  <div className="order-field-group">
                    <label className="order-field-label" htmlFor="customer-phone">
                      Telefone
                    </label>
                    <div className="order-icon-input-wrap">
                      <Phone className="order-field-icon" />
                      <input
                        id="customer-phone"
                        value={customerPhone}
                        onChange={(event) => setCustomerPhone(event.target.value)}
                        placeholder="(00) 00000-0000"
                        className="order-input order-input-with-icon"
                      />
                    </div>
                  </div>

                  <div className="order-field-group">
                    <label className="order-field-label" htmlFor="customer-email">
                      E-mail
                    </label>
                    <div className="order-icon-input-wrap">
                      <Mail className="order-field-icon" />
                      <input
                        id="customer-email"
                        value={customerEmail}
                        onChange={(event) => setCustomerEmail(event.target.value)}
                        placeholder="cliente@email.com"
                        className="order-input order-input-with-icon"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="order-card order-creation-hero">
              <div className="order-creation-hero-main">
                <div>
                  <p className="order-creation-hero-eyebrow">Pedido em criação</p>
                  <h2 className="order-creation-hero-title">{customerDisplayName}</h2>
                  <p className="order-creation-hero-meta">
                    <span className="order-status-pill">Pendente</span>
                    <span>{documentTypeLabel}</span>
                    <span>Criado em {createdAtLabel}</span>
                    <span>Entrega {deliveryDate || productionInfo.estimatedDeliveryDate || 'a definir'}</span>
                  </p>
                </div>
                <div className="order-creation-hero-side">
                  <strong>{fmt(finalTotalToPay)}</strong>
                  <span>{totals.itemCount} itens no pedido</span>
                </div>
              </div>
            </section>

            <section className="order-card">
              <div className="order-card-header">
                <h2 className="order-card-title">
                  <ShoppingCart className="order-card-title-icon" />
                  Produtos e Serviços
                </h2>
                <span className="order-count-badge">{totals.itemCount} itens</span>
              </div>
              <div className="order-card-body">
                <div className="order-module-toolbar">
                  <button type="button" className="order-module-chip tone-blue" onClick={openProductDialog}>
                    <Box className="h-4 w-4" />
                    Produto
                  </button>
                  <button type="button" className="order-module-chip tone-slate" onClick={openManualDialog}>
                    <Plus className="h-4 w-4" />
                    Item avulso
                  </button>
                  <button type="button" className="order-module-chip tone-cyan" onClick={openDiscountDialog}>
                    %
                    Desconto
                  </button>
                  <button type="button" className="order-module-chip tone-amber" onClick={openFreightDialog}>
                    <Truck className="h-4 w-4" />
                    Taxa de entrega
                  </button>
                  <button type="button" className="order-module-chip tone-green" onClick={openPaymentQuickDialog}>
                    <CreditCard className="h-4 w-4" />
                    Pagamento
                  </button>
                  <button type="button" className="order-module-chip tone-dark" onClick={openNotesDialog}>
                    <FileText className="h-4 w-4" />
                    Observações
                  </button>
                </div>

                <p className="order-toolbar-caption">
                  Use os atalhos para montar o pedido com mais agilidade e ajustar desconto, frete, pagamento e observações sem sair da tela.
                </p>

                <div className="order-quick-preview-grid">
                  <button type="button" className="order-quick-preview-card is-discount" onClick={openDiscountDialog}>
                    <span className="order-quick-preview-label">Desconto</span>
                    <strong>{orderDiscountAmount > 0 ? `-${fmt(orderDiscountAmount)}` : 'Sem desconto'}</strong>
                    <small>
                      {orderDiscountAmount > 0
                        ? discountType === 'percent'
                          ? `${discount}% sobre o subtotal`
                          : `${fmt(discount)} em valor`
                        : 'Aplicar abatimento no pedido'}
                    </small>
                  </button>
                  <button type="button" className="order-quick-preview-card is-freight" onClick={openFreightDialog}>
                    <span className="order-quick-preview-label">Entrega</span>
                    <strong>{freight > 0 ? fmt(freight) : 'Sem taxa'}</strong>
                    <small>{deliveryMethod === 'retirada' ? 'Retirada na loja' : 'Cobrança de frete configurável'}</small>
                  </button>
                  <button type="button" className="order-quick-preview-card is-payment" onClick={openPaymentQuickDialog}>
                    <span className="order-quick-preview-label">Pagamento</span>
                    <strong>{getPaymentMethodDisplayName(paymentMethod, companyPaymentMethods)}</strong>
                    <small>{paymentConditionLabel}</small>
                  </button>
                  <button type="button" className="order-quick-preview-card is-notes" onClick={openNotesDialog}>
                    <span className="order-quick-preview-label">Observações</span>
                    <strong>{notes.trim() ? 'Com anotações' : 'Sem anotações'}</strong>
                    <small>{notesPreviewText}</small>
                  </button>
                </div>

                {items.length === 0 ? (
                  <div className="order-empty-state">
                    <div className="order-empty-icon">
                      <Box className="h-5 w-5" />
                    </div>
                    <h3>Nenhum item adicionado</h3>
                    <p>Clique em Produto ou Item avulso para montar o pedido no estilo rápido da nova tela.</p>
                  </div>
                ) : (
                  <div className="order-items-board">
                    <div className="order-items-board-head" aria-hidden="true">
                      <span>Item</span>
                      <span>Preço</span>
                      <span>Qtd</span>
                      <span>Total</span>
                      <span>Remover</span>
                    </div>
                    <div className="order-items-grid">
                      {items.map((item) => (
                        <EditableOrderItem
                          key={item.product.id}
                          item={item}
                          saving={saving}
                          productAttributeGroups={getProductAttributeGroups(item.product.id)}
                          tierRangeLabel={getTierRangeLabel(item.product.id)}
                          onQuantityChange={(productId, value) => setQty(productId, value)}
                          onM2SubQuantityChange={changeM2SubQuantity}
                          onAttributeChange={changeItemAttribute}
                          onRemove={removeItem}
                          calculateItemTotal={calculateItemTotal}
                          formatCurrency={fmt}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <div className="order-sub-grid">
              <section className="order-card" id="order-notes-card">
                <div className="order-card-header">
                  <h2 className="order-card-title">
                    <FileText className="order-card-title-icon" />
                    Observações
                  </h2>
                </div>
                <div className="order-card-body">
                  <Textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Observações internas, detalhes de arte, acabamento..."
                    className="order-textarea !min-h-0"
                    rows={1}
                  />
                  <label className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--order-border)] bg-[var(--order-surface)] px-4 py-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={showNotesOnPdf}
                      onChange={(event) => setShowNotesOnPdf(event.target.checked)}
                    />
                    <span className="space-y-1">
                      <span className="block text-sm font-semibold text-[#122046]">
                        Mostrar observações no PDF
                      </span>
                      <span className="block text-xs text-[var(--order-muted)]">
                        Desative para manter as observações visíveis apenas dentro do sistema.
                      </span>
                    </span>
                  </label>
                </div>
              </section>

              <section className="order-card" id="order-delivery-card">
                <div className="order-card-header">
                  <h2 className="order-card-title">
                    <Truck className="order-card-title-icon" />
                    Entrega e Prazo
                  </h2>
                </div>
                <div className="order-card-body">
                  <div className="order-field-group">
                    <label className="order-field-label" htmlFor="delivery-date">
                      Data prevista
                    </label>
                    <input
                      id="delivery-date"
                      type="date"
                      value={deliveryDate}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setDeliveryDate(nextValue);
                        setDeliveryDateMode(
                          nextValue && nextValue !== (productionInfo.estimatedDeliveryDate ?? '')
                            ? 'manual'
                            : 'auto',
                        );
                      }}
                      className="order-input"
                    />
                    <p className="mt-2 text-xs text-[var(--order-muted)]">
                      {deliveryDateMode === 'manual'
                        ? 'Data ajustada manualmente. Limpe o campo para recalcular automaticamente.'
                        : autoDeliveryDateDescription}
                    </p>
                  </div>
                  <div className="order-field-group">
                    <label className="order-field-label" htmlFor="delivery-method">
                      Método de entrega
                    </label>
                    <div className="order-select-wrap">
                      <select
                        id="delivery-method"
                        value={deliveryMethod}
                        onChange={(event) => setDeliveryMethod(event.target.value)}
                        className="order-input order-select"
                      >
                        {deliveryMethods.map((method) => (
                          <option key={method.value} value={method.value}>
                            {method.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="order-select-icon" />
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <aside className="order-side-column">
            <section className="order-card" id="order-summary-card">
              <div className="order-card-header">
                <h2 className="order-card-title">
                  <ReceiptText className="order-card-title-icon" />
                  Resumo
                </h2>
              </div>
              <div className="order-card-body">
                <div className="order-summary-row">
                  <span>Subtotal ({totals.itemCount} itens)</span>
                  <strong>{fmt(totals.subtotal)}</strong>
                </div>
                <div className="order-summary-row order-summary-edit">
                  <label htmlFor="discount-input">Desconto</label>
                  <div className="flex w-full gap-2">
                    <div className="order-select-wrap min-w-[86px]">
                      <select
                        value={discountType}
                        onChange={(event) => handleChangeOrderDiscountType(event.target.value)}
                        className="order-input order-select"
                      >
                        <option value="fixed">R$</option>
                        <option value="percent">%</option>
                      </select>
                      <ChevronDown className="order-select-icon" />
                    </div>
                    {discountType === 'percent' ? (
                      <input
                        id="discount-input"
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={discount}
                        onChange={(event) => setDiscount(normalizeDiscountValue(Number(event.target.value)))}
                        className="order-input w-full text-right"
                      />
                    ) : (
                      <CurrencyInput
                        id="discount-input"
                        value={discount}
                        onChange={(value) => setDiscount(normalizeDiscountValue(value))}
                        className="order-input order-currency-input"
                      />
                    )}
                  </div>
                </div>
                {orderDiscountAmount > 0 && (
                  <div className="order-summary-row">
                    <span>Desconto aplicado</span>
                    <strong className="text-destructive">-{fmt(orderDiscountAmount)}</strong>
                  </div>
                )}
                <div className="order-summary-row order-summary-edit">
                  <label htmlFor="freight-input">Frete</label>
                  <CurrencyInput
                    id="freight-input"
                    value={freight}
                    onChange={setFreight}
                    className="order-input order-currency-input"
                  />
                </div>

                {customerAvailableCredit > 0 && customerId && (
                  <>
                    <div className="order-summary-row mt-2 pt-2 border-t border-[var(--order-border)]">
                      <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-[#122046]">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-[var(--order-primary)] focus:ring-[var(--order-primary)]"
                          checked={useCustomerCredit}
                          onChange={(e) => {
                            setUseCustomerCredit(e.target.checked);
                            if (e.target.checked) {
                              setCustomerCreditToUse(Math.min(customerAvailableCredit, totals.total));
                            } else {
                              setCustomerCreditToUse(0);
                            }
                          }}
                        />
                        Usar saldo de crédito
                      </label>
                      <span className="text-sm font-semibold text-emerald-600">
                        Disp: {fmt(customerAvailableCredit)}
                      </span>
                    </div>

                    {useCustomerCredit && (
                      <div className="order-summary-row order-summary-edit mt-2 bg-emerald-50/50 p-2 rounded-lg border border-emerald-100">
                        <label htmlFor="credit-use-input" className="text-emerald-700">Valor do crédito</label>
                        <CurrencyInput
                          id="credit-use-input"
                          value={customerCreditToUse}
                          onChange={(val) => {
                            const maxAllowed = Math.min(customerAvailableCredit, totals.total);
                            setCustomerCreditToUse(Math.min(val, maxAllowed));
                          }}
                          className="order-input order-currency-input !border-emerald-200 focus:!border-emerald-400"
                        />
                      </div>
                    )}
                  </>
                )}

                <div className="order-total-row">
                  <span>Total</span>
                  <div className="flex flex-col items-end">
                    {useCustomerCredit && customerCreditToUse > 0 ? (
                      <>
                        <span className="text-sm text-muted-foreground line-through decoration-muted-foreground/50">
                          {fmt(totals.total)}
                        </span>
                        <strong className="text-emerald-600">{fmt(finalTotalToPay)}</strong>
                      </>
                    ) : (
                      <strong>{fmt(totals.total)}</strong>
                    )}
                  </div>
                </div>

                <div className="order-status-block">
                  <div className="order-status-icon">
                    <Clock3 className="h-4 w-4" />
                  </div>
                  <div>
                    <p>Status: Pendente</p>
                    <small>O pedido será criado aguardando processamento.</small>
                  </div>
                </div>
              </div>
            </section>

            <section className="order-card" id="order-payment-card">
              <div className="order-card-header">
                <h2 className="order-card-title">
                  <Wallet className="order-card-title-icon" />
                  Pagamento
                </h2>
              </div>
              <div className="order-card-body">
                <div className="order-field-group">
                  <label className="order-field-label" htmlFor="payment-condition">
                    Condição
                  </label>
                  <div className="order-select-wrap">
                    <select
                      id="payment-condition"
                      value={paymentCondition}
                      onChange={(event) => setPaymentCondition(event.target.value)}
                      className="order-input order-select"
                    >
                      {paymentConditions.map((condition) => (
                        <option key={condition.value} value={condition.value}>
                          {condition.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="order-select-icon" />
                  </div>
                </div>

                <div className="order-payment-grid">
                  {companyPaymentMethods.map((option) => {
                    const Icon = paymentMethodIcons[option.type] || Wallet;
                    const active = paymentMethod === option.type;
                    return (
                      <button
                        key={option.type}
                        type="button"
                        className={`order-payment-btn ${active ? 'is-active' : ''}`}
                        onClick={() => selectPayment(option.type)}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{getPaymentMethodDisplayName(option.type, companyPaymentMethods)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="order-card">
              <div className="order-card-header">
                <h2 className="order-card-title">
                  <AlertCircle className="order-card-title-icon" />
                  Prioridade
                </h2>
              </div>
              <div className="order-card-body">
                <div className="order-priority-grid">
                  <button
                    type="button"
                    className={`order-priority-btn priority-low ${priority === 'baixa' ? 'is-active' : ''}`}
                    onClick={() => setPriority('baixa')}
                  >
                    Baixa
                  </button>
                  <button
                    type="button"
                    className={`order-priority-btn priority-normal ${priority === 'normal' ? 'is-active' : ''}`}
                    onClick={() => setPriority('normal')}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    className={`order-priority-btn priority-high ${priority === 'alta' ? 'is-active' : ''}`}
                    onClick={() => setPriority('alta')}
                  >
                    Alta
                  </button>
                </div>
              </div>
            </section>

            <section className="order-card">
              <div className="order-card-header">
                <h2 className="order-card-title">
                  <BriefcaseBusiness className="order-card-title-icon" />
                  Responsável
                </h2>
              </div>
              <div className="order-card-body">
                <div className="order-select-wrap">
                  <select
                    id="responsible"
                    value={responsibleId}
                    onChange={(event) => setResponsibleId(event.target.value)}
                    className="order-input order-select"
                  >
                    {salespeople.length === 0 ? (
                      <option value="">Sem usuários</option>
                    ) : (
                      salespeople.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.full_name || 'Usuário'}
                        </option>
                      ))
                    )}
                  </select>
                  <ChevronDown className="order-select-icon" />
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>

      <footer className="order-bottom-bar">
        <div className="order-bottom-stats">
          <div className="order-bottom-stat">
            <span>Itens</span>
            <strong>{totals.itemCount}</strong>
          </div>
          <span className="order-bottom-sep" />
          <div className="order-bottom-stat">
            <span>Quantidade</span>
            <strong>{new Intl.NumberFormat('pt-BR').format(totalQuantity)}</strong>
          </div>
          <span className="order-bottom-sep" />
          <div className="order-bottom-stat">
            <span>Subtotal</span>
            <strong>{fmt(totals.subtotal)}</strong>
          </div>
          <span className="order-bottom-sep" />
          <div className="order-bottom-stat is-total">
            <span>Total</span>
            <strong>{fmt(finalTotalToPay)}</strong>
          </div>
        </div>

        <div className="order-bottom-actions">
          <button type="button" className="order-btn order-btn-ghost" onClick={() => navigate('/pedidos')} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="order-btn order-btn-outline" onClick={handleSaveDraft} disabled={saving}>
            Salvar Rascunho
          </button>
          <button type="button" className="order-btn order-btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Criar Pedido
              </>
            )}
          </button>
        </div>
      </footer>

      <Dialog open={productDialogOpen} onOpenChange={closeProductDialog}>
        <DialogContent className="order-dialog-content sm:max-w-[560px]" aria-describedby={undefined}>
          <div className="order-dialog-shell">
            <div className="order-dialog-topbar">
              <DialogHeader className="order-dialog-header">
                <DialogTitle className="order-dialog-title">
                  <Box className="h-5 w-5" />
                  Adicionar Produto
                </DialogTitle>
              </DialogHeader>
            </div>

            <div className="order-dialog-body">
              <div className="order-field-group">
                <label className="order-field-label" htmlFor="product-dialog-search">
                  ID do produto (atalho)
                </label>
                <div className="order-search-field">
                  <Search className="order-field-icon" />
                  <input
                    id="product-dialog-search"
                    value={productSearchTerm}
                    onChange={(event) => setProductSearchTerm(event.target.value)}
                    placeholder="Digite o ID, SKU ou nome"
                    className="order-input order-search-input"
                  />
                </div>
                <p className="order-dialog-hint">Dica: digite o ID, SKU ou parte do nome para filtrar.</p>
              </div>

              <div className="order-field-group">
                <label className="order-field-label" htmlFor="product-dialog-select">
                  Produto
                </label>
                <div className="order-select-wrap">
                  <select
                    id="product-dialog-select"
                    value={selectedDialogProductId}
                    onChange={(event) => setSelectedDialogProductId(event.target.value)}
                    className="order-input order-select"
                  >
                    {filteredProducts.length === 0 ? (
                      <option value="">Nenhum produto encontrado</option>
                    ) : (
                      filteredProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} {product.sku ? `(${product.sku})` : ''}
                        </option>
                      ))
                    )}
                  </select>
                  <ChevronDown className="order-select-icon" />
                </div>
              </div>

              {selectedDialogProduct ? (
                <div className="order-dialog-product-card">
                  <div className="order-product-thumb order-dialog-thumb">
                    {ensurePublicStorageUrl('product-images', selectedDialogProduct.image_url) ? (
                      <img
                        src={ensurePublicStorageUrl('product-images', selectedDialogProduct.image_url)!}
                        alt={selectedDialogProduct.name}
                        loading="lazy"
                      />
                    ) : (
                      <Box className="h-5 w-5" />
                    )}
                  </div>
                  <div className="order-dialog-product-meta">
                    <strong>{selectedDialogProduct.name}</strong>
                    <span>SKU: {selectedDialogProduct.sku || '-'}</span>
                    <span>
                      {fmt(productDialogPreviewPrice)} {getProductSaleUnitPriceSuffix(selectedDialogProduct.unit_type)}
                    </span>
                    {getTierRangeLabel(selectedDialogProduct.id) ? (
                      <span>Faixas: {getTierRangeLabel(selectedDialogProduct.id)}</span>
                    ) : (
                      <span>
                        Unidade de venda: {getProductSaleUnitLabel(selectedDialogProduct.unit_type, { capitalize: true })}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="order-dialog-empty-note">Selecione um produto para ver os detalhes.</p>
              )}

              <div className="order-field-group">
                <label className="order-field-label" htmlFor="product-dialog-quantity">
                  Quantidade
                </label>
                <input
                  id="product-dialog-quantity"
                  type="number"
                  min={1}
                  value={productDialogQuantityValue}
                  onChange={(event) => setProductDialogQuantity(Number(event.target.value) || 1)}
                  className="order-input"
                  disabled={Boolean(selectedDialogProduct && isAreaUnit(selectedDialogProduct.unit))}
                />
                {selectedDialogProduct && isAreaUnit(selectedDialogProduct.unit) ? (
                  <p className="order-dialog-hint">
                    Produtos por área iniciam com 1 e as medidas podem ser ajustadas depois na lista do pedido.
                  </p>
                ) : null}
              </div>

              <div className="order-dialog-total">Total: {fmt(productDialogPreviewTotal)}</div>
            </div>

            <DialogFooter className="order-dialog-footer">
              <button type="button" className="order-btn order-btn-primary" onClick={handleAddSelectedProduct}>
                Adicionar
              </button>
              <button type="button" className="order-btn order-btn-ghost" onClick={() => closeProductDialog(false)}>
                Fechar
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={manualItemDialogOpen} onOpenChange={setManualItemDialogOpen}>
        <DialogContent className="order-dialog-content sm:max-w-[520px]" aria-describedby={undefined}>
          <div className="order-dialog-shell">
            <div className="order-dialog-topbar">
              <DialogHeader className="order-dialog-header">
                <DialogTitle className="order-dialog-title">
                  <Plus className="h-5 w-5" />
                  Adicionar Item Avulso
                </DialogTitle>
              </DialogHeader>
            </div>

            <div className="order-dialog-body">
              <div className="order-field-group">
                <label className="order-field-label" htmlFor="manual-item-description">
                  Descrição do item
                </label>
                <input
                  id="manual-item-description"
                  value={manualItemDescription}
                  onChange={(event) => setManualItemDescription(event.target.value)}
                  className="order-input"
                  placeholder="Ex.: Ajuste de arte, serviço extra, frete especial"
                />
              </div>

              <div className="order-dialog-grid">
                <div className="order-field-group">
                  <label className="order-field-label" htmlFor="manual-item-quantity">
                    Quantidade
                  </label>
                  <input
                    id="manual-item-quantity"
                    type="number"
                    min={1}
                    value={manualItemQuantity}
                    onChange={(event) => setManualItemQuantity(Number(event.target.value) || 1)}
                    className="order-input"
                  />
                </div>

                <div className="order-field-group">
                  <label className="order-field-label" htmlFor="manual-item-price">
                    Valor
                  </label>
                  <CurrencyInput
                    id="manual-item-price"
                    value={manualItemPrice}
                    onChange={setManualItemPrice}
                    className="order-input"
                  />
                </div>
              </div>

              <div className="order-dialog-total">
                Total: {fmt(Math.max(1, Number(manualItemQuantity) || 1) * Math.max(0, Number(manualItemPrice) || 0))}
              </div>
            </div>

            <DialogFooter className="order-dialog-footer">
              <button type="button" className="order-btn order-btn-primary" onClick={addManualItem}>
                Adicionar
              </button>
              <button type="button" className="order-btn order-btn-ghost" onClick={() => setManualItemDialogOpen(false)}>
                Fechar
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={discountDialogOpen} onOpenChange={setDiscountDialogOpen}>
        <DialogContent className="order-dialog-content sm:max-w-[500px]" aria-describedby={undefined}>
          <div className="order-dialog-shell">
            <div className="order-dialog-topbar order-dialog-topbar-cyan">
              <DialogHeader className="order-dialog-header">
                <DialogTitle className="order-dialog-title">
                  % Desconto do pedido
                </DialogTitle>
              </DialogHeader>
            </div>

            <div className="order-dialog-body">
              <div className="order-quick-dialog-summary">
                <div>
                  <span>Subtotal atual</span>
                  <strong>{fmt(totals.subtotal)}</strong>
                </div>
                <div>
                  <span>Total previsto</span>
                  <strong>{fmt(discountDialogPreviewTotal)}</strong>
                </div>
              </div>

              <div className="order-dialog-grid">
                <div className="order-field-group">
                  <label className="order-field-label" htmlFor="discount-dialog-type">
                    Tipo
                  </label>
                  <div className="order-select-wrap">
                    <select
                      id="discount-dialog-type"
                      value={discountDialogType}
                      onChange={(event) => setDiscountDialogType(normalizeDiscountType(event.target.value))}
                      className="order-input order-select"
                    >
                      <option value="fixed">R$</option>
                      <option value="percent">%</option>
                    </select>
                    <ChevronDown className="order-select-icon" />
                  </div>
                </div>

                <div className="order-field-group">
                  <label className="order-field-label" htmlFor="discount-dialog-value">
                    Valor
                  </label>
                  {discountDialogType === 'percent' ? (
                    <input
                      id="discount-dialog-value"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={discountDialogValue}
                      onChange={(event) => setDiscountDialogValue(normalizeDiscountValue(Number(event.target.value)))}
                      className="order-input"
                    />
                  ) : (
                    <CurrencyInput
                      id="discount-dialog-value"
                      value={discountDialogValue}
                      onChange={(value) => setDiscountDialogValue(normalizeDiscountValue(value))}
                      className="order-input"
                    />
                  )}
                </div>
              </div>

              <p className="order-dialog-hint">
                O desconto geral é aplicado sobre o subtotal dos itens e aparece no total final do pedido.
              </p>

              {discountDialogPreviewAmount > 0 ? (
                <div className="order-dialog-total">Desconto aplicado: -{fmt(discountDialogPreviewAmount)}</div>
              ) : (
                <div className="order-dialog-total">Sem desconto aplicado</div>
              )}
            </div>

            <DialogFooter className="order-dialog-footer">
              <button type="button" className="order-btn order-btn-outline" onClick={applyDiscountDialog}>
                Aplicar
              </button>
              <button type="button" className="order-btn order-btn-ghost" onClick={() => setDiscountDialogOpen(false)}>
                Fechar
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={freightDialogOpen} onOpenChange={setFreightDialogOpen}>
        <DialogContent className="order-dialog-content sm:max-w-[480px]" aria-describedby={undefined}>
          <div className="order-dialog-shell">
            <div className="order-dialog-topbar order-dialog-topbar-amber">
              <DialogHeader className="order-dialog-header">
                <DialogTitle className="order-dialog-title">
                  <Truck className="h-5 w-5" />
                  Taxa de entrega
                </DialogTitle>
              </DialogHeader>
            </div>

            <div className="order-dialog-body">
              <div className="order-quick-dialog-summary">
                <div>
                  <span>Método atual</span>
                  <strong>{deliveryMethods.find((method) => method.value === deliveryMethod)?.label || 'Entrega'}</strong>
                </div>
                <div>
                  <span>Total previsto</span>
                  <strong>{fmt(freightDialogPreviewTotal)}</strong>
                </div>
              </div>

              <div className="order-field-group">
                <label className="order-field-label" htmlFor="freight-dialog-value">
                  Valor do frete
                </label>
                <CurrencyInput
                  id="freight-dialog-value"
                  value={freightDialogValue}
                  onChange={setFreightDialogValue}
                  className="order-input"
                />
              </div>

              <p className="order-dialog-hint">
                Use este atalho para ajustar a taxa de entrega sem precisar ir até o resumo do pedido.
              </p>
            </div>

            <DialogFooter className="order-dialog-footer">
              <button type="button" className="order-btn order-btn-outline" onClick={applyFreightDialog}>
                Aplicar
              </button>
              <button type="button" className="order-btn order-btn-ghost" onClick={() => setFreightDialogOpen(false)}>
                Fechar
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentQuickDialogOpen} onOpenChange={setPaymentQuickDialogOpen}>
        <DialogContent className="order-dialog-content sm:max-w-[620px]" aria-describedby={undefined}>
          <div className="order-dialog-shell">
            <div className="order-dialog-topbar order-dialog-topbar-green">
              <DialogHeader className="order-dialog-header">
                <DialogTitle className="order-dialog-title">
                  <Wallet className="h-5 w-5" />
                  Pagamento do pedido
                </DialogTitle>
              </DialogHeader>
            </div>

            <div className="order-dialog-body">
              <div className="order-quick-dialog-summary">
                <div>
                  <span>Total a cobrar</span>
                  <strong>{fmt(finalTotalToPay)}</strong>
                </div>
                <div>
                  <span>Condição atual</span>
                  <strong>{paymentConditions.find((option) => option.value === paymentConditionDialogValue)?.label || 'À vista'}</strong>
                </div>
              </div>

              <div className="order-field-group">
                <label className="order-field-label" htmlFor="payment-condition-dialog">
                  Condição de pagamento
                </label>
                <div className="order-select-wrap">
                  <select
                    id="payment-condition-dialog"
                    value={paymentConditionDialogValue}
                    onChange={(event) => setPaymentConditionDialogValue(event.target.value)}
                    className="order-input order-select"
                  >
                    {paymentConditions.map((condition) => (
                      <option key={condition.value} value={condition.value}>
                        {condition.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="order-select-icon" />
                </div>
              </div>

              <div className="order-payment-grid order-payment-grid-dialog">
                {companyPaymentMethods.map((option) => {
                  const Icon = paymentMethodIcons[option.type] || Wallet;
                  const active = paymentMethodDialogValue === option.type;
                  return (
                    <button
                      key={option.type}
                      type="button"
                      className={`order-payment-btn ${active ? 'is-active' : ''}`}
                      onClick={() => setPaymentMethodDialogValue(option.type)}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{getPaymentMethodDisplayName(option.type, companyPaymentMethods)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="order-dialog-footer">
              <button type="button" className="order-btn order-btn-outline" onClick={applyPaymentQuickDialog}>
                Aplicar
              </button>
              <button type="button" className="order-btn order-btn-ghost" onClick={() => setPaymentQuickDialogOpen(false)}>
                Fechar
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent className="order-dialog-content sm:max-w-[560px]" aria-describedby={undefined}>
          <div className="order-dialog-shell">
            <div className="order-dialog-topbar order-dialog-topbar-dark">
              <DialogHeader className="order-dialog-header">
                <DialogTitle className="order-dialog-title">
                  <FileText className="h-5 w-5" />
                  Observações do pedido
                </DialogTitle>
              </DialogHeader>
            </div>

            <div className="order-dialog-body">
              <div className="order-field-group">
                <label className="order-field-label" htmlFor="notes-dialog-value">
                  Observações internas
                </label>
                <Textarea
                  id="notes-dialog-value"
                  value={notesDialogValue}
                  onChange={(event) => setNotesDialogValue(event.target.value)}
                  placeholder="Detalhes de arte, acabamento, recados internos e qualquer orientação importante."
                  className="order-textarea min-h-[140px]"
                  rows={6}
                />
              </div>

              <label className="order-quick-dialog-checkbox">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={notesDialogShowOnPdf}
                  onChange={(event) => setNotesDialogShowOnPdf(event.target.checked)}
                />
                <span>
                  <strong>Mostrar observações no PDF</strong>
                  <small>Desative se quiser manter esse conteúdo visível somente dentro do sistema.</small>
                </span>
              </label>
            </div>

            <DialogFooter className="order-dialog-footer">
              <button type="button" className="order-btn order-btn-outline" onClick={applyNotesDialog}>
                Aplicar
              </button>
              <button type="button" className="order-btn order-btn-ghost" onClick={() => setNotesDialogOpen(false)}>
                Fechar
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {items.length === 0 ? (
        <div className="order-floating-alert">
          <AlertCircle className="h-4 w-4" />
          <span>Adicione pelo menos um item para criar o pedido.</span>
        </div>
      ) : null}
    </div>
  );
}
