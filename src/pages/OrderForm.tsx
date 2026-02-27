import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { CurrencyInput } from '@/components/ui/currency-input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Customer, PaymentMethod, PriceTier, Product, type OrderStatus } from '@/types/database';
import { resolveProductPrice } from '@/lib/pricing';
import { normalizeDigits } from '@/components/ui/masked-input';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { ensurePublicStorageUrl } from '@/lib/storage';
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

interface OrderItemForm {
  product: Product;
  quantity: number;
  unit_price: number;
  discount: number;
  attributes: Record<string, string>;
  notes: string;
}

type DocumentType = 'orcamento' | 'pedido_venda' | 'pedido_compra';
type PriorityLevel = 'baixa' | 'normal' | 'alta';

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

export default function OrderForm() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [suppliesCostMap, setSuppliesCostMap] = useState<Record<string, number>>({});
  const [salespeople, setSalespeople] = useState<SalespersonOption[]>([]);

  const [documentType, setDocumentType] = useState<DocumentType>('orcamento');
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('retirada');
  const [discount, setDiscount] = useState(0);
  const [freight, setFreight] = useState(0);
  const [paymentCondition, setPaymentCondition] = useState('avista');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
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
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const productBlurTimerRef = useRef<number | null>(null);

  const draftRestoredRef = useRef(false);
  const draftStorageKey = 'order_form_draft';

  const fmt = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n || 0));

  const getProductPrice = (product: Product, quantity: number): number => {
    const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    const suppliesCost = suppliesCostMap[product.id] || 0;
    return resolveProductPrice(product, safeQuantity, priceTiers, suppliesCost);
  };

  const calculateItemTotal = (item: OrderItemForm) =>
    Math.max(0, Number(item.unit_price) * Number(item.quantity) - Number(item.discount || 0));

  const updateTotals = (
    nextItems: OrderItemForm[] = items,
    nextDiscount: number = discount,
    nextFreight: number = freight,
  ) => {
    const subtotal = nextItems.reduce((sum, item) => sum + calculateItemTotal(item), 0);
    const total = Math.max(0, subtotal - Number(nextDiscount || 0) + Number(nextFreight || 0));
    setTotals({
      itemCount: nextItems.length,
      subtotal,
      total,
    });
  };

  useEffect(() => {
    updateTotals();
  }, [items, discount, freight]);

  const itemsSnapshot = useMemo(
    () =>
      items.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        attributes: item.attributes,
        notes: item.notes,
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
      deliveryDate,
      deliveryMethod,
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
      deliveryDate,
      deliveryMethod,
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
      discount > 0 ||
      freight > 0,
  );

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
        setProducts((prodResult.data as Product[]) || []);
        setPriceTiers((tiersResult.data as PriceTier[]) || []);
        setSalespeople((salespeopleResult.data as SalespersonOption[]) || []);

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
          const defaultResponsible = people.find((person) => person.id === user?.id)?.id || people[0]?.id || '';
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
  }, [profile?.company_id, toast, user?.id]);

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
        deliveryDate?: string;
        deliveryMethod?: string;
        discount?: number;
        freight?: number;
        paymentCondition?: string;
        paymentMethod?: PaymentMethod;
        priority?: PriorityLevel;
        responsibleId?: string;
        items?: Array<{
          productId: string;
          quantity: number;
          unit_price: number;
          discount: number;
          attributes: Record<string, string>;
          notes: string;
        }>;
      };

      if (parsed.documentType) setDocumentType(parsed.documentType);
      if (parsed.customerId) setCustomerId(parsed.customerId);
      if (parsed.customerName) setCustomerName(parsed.customerName);
      if (parsed.customerPhone) setCustomerPhone(parsed.customerPhone);
      if (parsed.customerEmail) setCustomerEmail(parsed.customerEmail);
      if (parsed.notes) setNotes(parsed.notes);
      if (parsed.deliveryDate) setDeliveryDate(parsed.deliveryDate);
      if (parsed.deliveryMethod) setDeliveryMethod(parsed.deliveryMethod);
      if (typeof parsed.discount === 'number') setDiscount(parsed.discount);
      if (typeof parsed.freight === 'number') setFreight(parsed.freight);
      if (parsed.paymentCondition) setPaymentCondition(parsed.paymentCondition);
      if (parsed.paymentMethod) setPaymentMethod(parsed.paymentMethod);
      if (parsed.priority) setPriorityLevel(parsed.priority);
      if (parsed.responsibleId) setResponsibleId(parsed.responsibleId);

      if (parsed.items && Array.isArray(parsed.items)) {
        const restoredItems = parsed.items
          .map((item) => {
            const product = products.find((productEntry) => productEntry.id === item.productId);
            if (!product) return null;
            return {
              product,
              quantity: Number(item.quantity) || 1,
              unit_price: Number(item.unit_price) || getProductPrice(product, Number(item.quantity) || 1),
              discount: Number(item.discount) || 0,
              attributes: item.attributes || {},
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
      deliveryDate: deliveryDate || undefined,
      deliveryMethod: deliveryMethod || undefined,
      discount,
      freight,
      paymentCondition,
      paymentMethod,
      priority,
      responsibleId: responsibleId || undefined,
      items: items.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        attributes: item.attributes,
        notes: item.notes,
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
    deliveryMethod,
    discount,
    documentType,
    draftStorageKey,
    freight,
    items,
    notes,
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
      if (productBlurTimerRef.current) {
        window.clearTimeout(productBlurTimerRef.current);
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
    if (!text) return products.slice(0, 5);
    return products
      .filter((product) => {
        const byName = product.name.toLowerCase().includes(text);
        const bySku = (product.sku || '').toLowerCase().includes(text);
        return byName || bySku;
      })
      .slice(0, 5);
  }, [productSearchTerm, products]);

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

  const setType = (type: DocumentType) => {
    setDocumentType(type);
  };

  const selectPayment = (method: PaymentMethod) => {
    setPaymentMethod(method);
  };

  const setPriority = (value: PriorityLevel) => {
    setPriorityLevel(value);
  };

  const addItem = (productId: string) => {
    const product = products.find((entry) => entry.id === productId);
    if (!product) return;

    setItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.product.id === product.id);
      if (existingIndex >= 0) {
        const next = [...prev];
        const nextQty = Math.max(1, Number(next[existingIndex].quantity || 1) + 1);
        next[existingIndex] = {
          ...next[existingIndex],
          quantity: nextQty,
          unit_price: getProductPrice(product, nextQty),
        };
        return next;
      }

      const quantity = 1;
      return [
        ...prev,
        {
          product,
          quantity,
          unit_price: getProductPrice(product, quantity),
          discount: 0,
          attributes: {},
          notes: '',
        },
      ];
    });

    setProductSearchTerm('');
    setProductDropdownOpen(false);
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const changeQty = (productId: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        const nextQty = Math.max(1, Number(item.quantity || 1) + delta);
        return {
          ...item,
          quantity: nextQty,
          unit_price: getProductPrice(item.product, nextQty),
        };
      }),
    );
  };

  const setQty = (productId: string, value: number) => {
    const nextValue = Number.isFinite(value) ? Math.max(1, value) : 1;
    setItems((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        return {
          ...item,
          quantity: nextValue,
          unit_price: getProductPrice(item.product, nextValue),
        };
      }),
    );
  };

  const handleCustomerSelect = (customer: Customer) => {
    setCustomerId(customer.id);
    setCustomerName(customer.name || '');
    setCustomerPhone(customer.phone || '');
    setCustomerEmail(customer.email || '');
    setCustomerSearchTerm(customer.name || '');
    setCustomerDropdownOpen(false);
  };

  const clearCustomerSelection = () => {
    setCustomerId('');
    setCustomerSearchTerm('');
  };

  const persistDraftNow = () => {
    const payload = {
      documentType,
      customerId: customerId || undefined,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      customerEmail: customerEmail.trim() || undefined,
      notes: notes.trim() || undefined,
      deliveryDate: deliveryDate || undefined,
      deliveryMethod: deliveryMethod || undefined,
      discount,
      freight,
      paymentCondition,
      paymentMethod,
      priority,
      responsibleId: responsibleId || undefined,
      items: items.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        attributes: item.attributes,
        notes: item.notes,
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
    if (!user?.id) {
      toast({ title: 'Sessão inválida', description: 'Faça login novamente', variant: 'destructive' });
      return;
    }
    if (items.length === 0) {
      toast({ title: 'Adicione ao menos um produto', variant: 'destructive' });
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

      const { data: createdOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          company_id: profile?.company_id || null,
          customer_id: resolvedCustomerId,
          customer_name: customerName.trim() || null,
          status,
          subtotal: totals.subtotal,
          discount,
          total: totals.total,
          amount_paid: 0,
          payment_status: 'pendente',
          payment_method: paymentMethod,
          notes: buildOrderNotes(),
          created_by: user.id,
        })
        .select('id')
        .single();

      if (orderError || !createdOrder?.id) {
        throw orderError || new Error('Não foi possível criar pedido');
      }

      createdOrderId = createdOrder.id;

      const orderItemsPayload = items.map((item) => ({
        order_id: createdOrder.id,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        total: calculateItemTotal(item),
        attributes: item.attributes,
        notes: item.notes || null,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItemsPayload);
      if (itemsError) throw itemsError;

      const { error: historyError } = await supabase.from('order_status_history').insert({
        order_id: createdOrder.id,
        status,
        user_id: user.id,
        notes: status === 'orcamento' ? 'Orçamento criado' : 'Pedido criado',
      });
      if (historyError) throw historyError;

      window.localStorage.removeItem(draftStorageKey);
      setInitialSnapshot(JSON.stringify({ ...formSnapshot, items: [] }));

      toast({ title: 'Pedido criado com sucesso' });
      navigate(`/pedidos/${createdOrder.id}`);
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

            <section className="order-card">
              <div className="order-card-header">
                <h2 className="order-card-title">
                  <ShoppingCart className="order-card-title-icon" />
                  Produtos e Serviços
                </h2>
                <span className="order-count-badge">{totals.itemCount} itens</span>
              </div>
              <div className="order-card-body">
                <div className="order-field-group">
                  <label className="order-field-label" htmlFor="product-search">
                    Buscar produto
                  </label>
                  <div className="order-search-field">
                    <Search className="order-field-icon" />
                    <input
                      id="product-search"
                      value={productSearchTerm}
                      onChange={(event) => {
                        setProductSearchTerm(event.target.value);
                        setProductDropdownOpen(true);
                      }}
                      onFocus={() => {
                        if (productBlurTimerRef.current) {
                          window.clearTimeout(productBlurTimerRef.current);
                        }
                        setProductDropdownOpen(true);
                      }}
                      onBlur={() => {
                        productBlurTimerRef.current = window.setTimeout(() => {
                          setProductDropdownOpen(false);
                        }, 150);
                      }}
                      placeholder="Buscar por nome ou SKU"
                      className="order-input order-search-input"
                    />
                  </div>

                  {productDropdownOpen ? (
                    <div className="order-dropdown">
                      {filteredProducts.length === 0 ? (
                        <div className="order-dropdown-empty">Nenhum produto encontrado</div>
                      ) : (
                        filteredProducts.map((product) => {
                          const thumbUrl = ensurePublicStorageUrl('product-images', product.image_url);
                          return (
                            <div key={product.id} className="order-product-result">
                              <div className="order-product-result-left">
                                <div className="order-product-thumb">
                                  {thumbUrl ? <img src={thumbUrl} alt={product.name} loading="lazy" /> : <Box className="h-4 w-4" />}
                                </div>
                                <div className="order-product-meta">
                                  <strong>{product.name}</strong>
                                  <span>SKU: {product.sku || '-'}</span>
                                </div>
                              </div>
                              <div className="order-product-result-right">
                                <span>{fmt(getProductPrice(product, 1))}</span>
                                <button
                                  type="button"
                                  className="order-add-btn"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => addItem(product.id)}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  Adicionar
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>

                {items.length === 0 ? (
                  <div className="order-empty-state">
                    <div className="order-empty-icon">
                      <Box className="h-5 w-5" />
                    </div>
                    <h3>Nenhum produto adicionado</h3>
                    <p>Pesquise por nome ou SKU e clique em adicionar.</p>
                  </div>
                ) : (
                  <div className="order-table-wrap">
                    <table className="order-items-table">
                      <thead>
                        <tr>
                          <th>Produto</th>
                          <th>Qtd</th>
                          <th>Preco Unit.</th>
                          <th>Total</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.product.id}>
                            <td>
                              <div className="order-product-cell">
                                <strong>{item.product.name}</strong>
                                <span>{item.product.sku || 'Sem SKU'}</span>
                              </div>
                            </td>
                            <td>
                              <div className="order-qty-control">
                                <button
                                  type="button"
                                  onClick={() => changeQty(item.product.id, -1)}
                                  disabled={saving || item.quantity <= 1}
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  value={item.quantity}
                                  onChange={(event) => {
                                    const parsed = Number(event.target.value);
                                    setQty(item.product.id, Number.isFinite(parsed) ? parsed : 1);
                                  }}
                                />
                                <button type="button" onClick={() => changeQty(item.product.id, 1)} disabled={saving}>
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                            <td>{fmt(item.unit_price)}</td>
                            <td>{fmt(calculateItemTotal(item))}</td>
                            <td>
                              <button
                                type="button"
                                className="order-delete-btn"
                                onClick={() => removeItem(item.product.id)}
                                disabled={saving}
                                aria-label={`Remover ${item.product.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <div className="order-sub-grid">
              <section className="order-card">
                <div className="order-card-header">
                  <h2 className="order-card-title">
                    <FileText className="order-card-title-icon" />
                    Observações
                  </h2>
                </div>
                <div className="order-card-body">
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Observações internas, detalhes de arte, acabamento..."
                    className="order-textarea"
                    rows={6}
                  />
                </div>
              </section>

              <section className="order-card">
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
                      onChange={(event) => setDeliveryDate(event.target.value)}
                      className="order-input"
                    />
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
            <section className="order-card">
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
                  <CurrencyInput
                    id="discount-input"
                    value={discount}
                    onChange={setDiscount}
                    className="order-input order-currency-input"
                  />
                </div>
                <div className="order-summary-row order-summary-edit">
                  <label htmlFor="freight-input">Frete</label>
                  <CurrencyInput
                    id="freight-input"
                    value={freight}
                    onChange={setFreight}
                    className="order-input order-currency-input"
                  />
                </div>
                <div className="order-total-row">
                  <span>Total</span>
                  <strong>{fmt(totals.total)}</strong>
                </div>

                <div className="order-status-block">
                  <div className="order-status-icon">
                    <Clock3 className="h-4 w-4" />
                  </div>
                  <div>
                    <p>Status: Pendente</p>
                    <small>O pedido sera criado aguardando processamento.</small>
                  </div>
                </div>
              </div>
            </section>

            <section className="order-card">
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
                  {paymentMethodOptions.map((option) => {
                    const Icon = option.icon;
                    const active = paymentMethod === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`order-payment-btn ${active ? 'is-active' : ''}`}
                        onClick={() => selectPayment(option.id)}
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
                    ? Baixa
                  </button>
                  <button
                    type="button"
                    className={`order-priority-btn priority-normal ${priority === 'normal' ? 'is-active' : ''}`}
                    onClick={() => setPriority('normal')}
                  >
                    ? Normal
                  </button>
                  <button
                    type="button"
                    className={`order-priority-btn priority-high ${priority === 'alta' ? 'is-active' : ''}`}
                    onClick={() => setPriority('alta')}
                  >
                    ? Alta
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
                          {person.full_name || 'Usuario'}
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
            <strong>{fmt(totals.total)}</strong>
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

      {items.length === 0 ? (
        <div className="order-floating-alert">
          <AlertCircle className="h-4 w-4" />
          <span>Adicione pelo menos um item para criar o pedido.</span>
        </div>
      ) : null}
    </div>
  );
}
