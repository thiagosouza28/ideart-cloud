import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, FileDown, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { generateAndUploadPaymentReceipt } from '@/services/paymentReceipts';
import type { PaymentReceiptPayload } from '@/templates/paymentReceiptTemplate';
import { PaymentMethod } from '@/types/database';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { buildReceiptA5Url } from '@/lib/receiptA5';

type OrderPaymentRow = {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  method: PaymentMethod | null;
  paid_at: string | null;
  created_at: string;
  company_id: string | null;
  order_number: number | null;
  customer_name: string;
};

type SaleRow = {
  id: string;
  customer_id: string | null;
  total: number;
  amount_paid: number;
  payment_method: PaymentMethod;
  created_at: string;
  company_id: string | null;
  customer_name: string;
};

type CustomerLite = {
  id: string;
  name: string;
  document: string | null;
};

type OrderLite = {
  id: string;
  order_number: number;
  customer_id: string | null;
  customer_name: string | null;
};

type CompanyReceiptData = {
  id: string;
  name: string;
  document: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  logo_url: string | null;
  signature_image_url: string | null;
  signature_responsible: string | null;
  signature_role: string | null;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const formatDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('pt-BR');
};

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);

const buildDefaultDates = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    from: toDateInput(start),
    to: toDateInput(end),
  };
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartao',
  credito: 'Cartao credito',
  debito: 'Cartao debito',
  transferencia: 'Transferencia',
  pix: 'Pix',
  boleto: 'Boleto',
  outro: 'Outro',
};

const buildOrderReceiptNumber = (orderNumber: number, paymentId: string) => {
  const suffix = paymentId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `REC-${orderNumber}-${suffix}`;
};

const buildSaleReceiptNumber = (saleId: string) => `PDV-${saleId.slice(0, 8).toUpperCase()}`;

const buildDescription = (rows: Array<{ product_name: string; quantity: number }>, fallback: string) => {
  const description = rows
    .map((row) => `${row.quantity}x ${row.product_name}`)
    .filter(Boolean)
    .join(', ');

  const resolved = description || fallback;
  return resolved.length > 160 ? `${resolved.slice(0, 157)}...` : resolved;
};

const buildCompanyAddress = (company?: CompanyReceiptData | null) => {
  if (!company) return '-';
  const cityState = [company.city, company.state].filter(Boolean).join(' - ');
  const parts = [company.address, cityState].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : '-';
};

export default function Receipts() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();

  const defaults = useMemo(() => buildDefaultDates(), []);
  const [activeTab, setActiveTab] = useState<'orders' | 'pdv'>('orders');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [loading, setLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [runningKey, setRunningKey] = useState<string | null>(null);

  const [companyData, setCompanyData] = useState<CompanyReceiptData | null>(null);
  const [customersById, setCustomersById] = useState<Record<string, CustomerLite>>({});
  const [ordersById, setOrdersById] = useState<Record<string, OrderLite>>({});
  const [orderPayments, setOrderPayments] = useState<OrderPaymentRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);

  const companyId = profile?.company_id || null;

  const loadData = async (isReload = false) => {
    if (!companyId) return;

    if (isReload) {
      setReloading(true);
    } else {
      setLoading(true);
    }

    try {
      const fromIso = `${dateFrom}T00:00:00.000Z`;
      const toIso = `${dateTo}T23:59:59.999Z`;

      let paymentsQuery = supabase
        .from('order_payments')
        .select('id, order_id, amount, status, method, paid_at, created_at, company_id')
        .eq('company_id', companyId)
        .neq('status', 'pendente')
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false })
        .limit(400);

      let salesQuery = supabase
        .from('sales')
        .select('id, customer_id, total, amount_paid, payment_method, created_at, company_id')
        .eq('company_id', companyId)
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false })
        .limit(400);

      const [paymentsResult, salesResult, companyResult] = await Promise.all([
        paymentsQuery,
        salesQuery,
        supabase
          .from('companies')
          .select('id, name, document, address, city, state, logo_url, signature_image_url, signature_responsible, signature_role')
          .eq('id', companyId)
          .maybeSingle(),
      ]);

      if (paymentsResult.error) throw paymentsResult.error;
      if (salesResult.error) throw salesResult.error;
      if (companyResult.error) throw companyResult.error;

      const paymentRows = (paymentsResult.data || []) as Array<{
        id: string;
        order_id: string;
        amount: number;
        status: string;
        method: PaymentMethod | null;
        paid_at: string | null;
        created_at: string;
        company_id: string | null;
      }>;

      const saleRows = (salesResult.data || []) as Array<{
        id: string;
        customer_id: string | null;
        total: number;
        amount_paid: number;
        payment_method: PaymentMethod;
        created_at: string;
        company_id: string | null;
      }>;

      const orderIds = Array.from(new Set(paymentRows.map((row) => row.order_id).filter(Boolean)));
      const ordersResult = orderIds.length
        ? await supabase
            .from('orders')
            .select('id, order_number, customer_id, customer_name')
            .in('id', orderIds)
        : { data: [], error: null };

      if (ordersResult.error) throw ordersResult.error;

      const orderMap = Object.fromEntries(
        ((ordersResult.data || []) as OrderLite[]).map((order) => [order.id, order]),
      );

      const customerIds = new Set<string>();
      Object.values(orderMap).forEach((order) => {
        if (order.customer_id) customerIds.add(order.customer_id);
      });
      saleRows.forEach((sale) => {
        if (sale.customer_id) customerIds.add(sale.customer_id);
      });

      const customersResult = customerIds.size > 0
        ? await supabase
            .from('customers')
            .select('id, name, document')
            .in('id', Array.from(customerIds))
        : { data: [], error: null };

      if (customersResult.error) throw customersResult.error;

      const customerMap = Object.fromEntries(
        ((customersResult.data || []) as CustomerLite[]).map((customer) => [customer.id, customer]),
      );

      const normalizedPayments: OrderPaymentRow[] = paymentRows.map((payment) => {
        const order = orderMap[payment.order_id];
        const customerName =
          (order?.customer_id ? customerMap[order.customer_id]?.name : null) ||
          order?.customer_name ||
          'Cliente';

        return {
          ...payment,
          order_number: order?.order_number ?? null,
          customer_name: customerName,
        };
      });

      const normalizedSales: SaleRow[] = saleRows.map((sale) => ({
        ...sale,
        customer_name: sale.customer_id ? customerMap[sale.customer_id]?.name || 'Consumidor final' : 'Consumidor final',
      }));

      setCompanyData((companyResult.data as CompanyReceiptData | null) || null);
      setOrdersById(orderMap);
      setCustomersById(customerMap);
      setOrderPayments(normalizedPayments);
      setSales(normalizedSales);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar comprovantes',
        description: error?.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setReloading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [companyId, dateFrom, dateTo]);

  const filteredOrderPayments = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orderPayments;

    return orderPayments.filter((row) => {
      const orderLabel = row.order_number ? String(row.order_number) : '';
      return (
        row.customer_name.toLowerCase().includes(term) ||
        orderLabel.includes(term) ||
        row.id.toLowerCase().includes(term)
      );
    });
  }, [orderPayments, search]);

  const filteredSales = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sales;

    return sales.filter((row) => (
      row.customer_name.toLowerCase().includes(term) ||
      row.id.toLowerCase().includes(term)
    ));
  }, [sales, search]);

  const handleGenerateOrderReceipt = async (payment: OrderPaymentRow) => {
    if (!companyId) return;

    const order = ordersById[payment.order_id];
    if (!order || !order.order_number) {
      toast({ title: 'Pedido não encontrado para este pagamento', variant: 'destructive' });
      return;
    }

    setRunningKey(`order-${payment.id}`);

    try {
      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('product_name, quantity')
        .eq('order_id', payment.order_id);

      if (itemsError) throw itemsError;

      const receiptNumber = buildOrderReceiptNumber(order.order_number, payment.id);
      const description = buildDescription(
        ((itemsData || []) as Array<{ product_name: string; quantity: number }>),
        `Pedido #${order.order_number}`,
      );
      const customer = order.customer_id ? customersById[order.customer_id] : null;
      const paymentMethodLabel = payment.method ? paymentMethodLabels[payment.method] || String(payment.method) : 'Não informado';

      const payload: PaymentReceiptPayload = {
        cliente: {
          nome: customer?.name || order.customer_name || 'Cliente',
          documento: customer?.document || null,
        },
        pagamento: {
          valor: Number(payment.amount || 0),
          forma: paymentMethodLabel,
          descricao: description,
          data: payment.paid_at || payment.created_at,
        },
        loja: {
          nome: companyData?.name || 'Loja',
          documento: companyData?.document || null,
          endereco: buildCompanyAddress(companyData),
          logo: companyData?.logo_url ? ensurePublicStorageUrl('product-images', companyData.logo_url) : null,
          assinaturaImagem: companyData?.signature_image_url
            ? ensurePublicStorageUrl('product-images', companyData.signature_image_url)
            : null,
          responsavel: companyData?.signature_responsible || companyData?.name || 'Responsavel',
          cargo: companyData?.signature_role || 'Responsavel',
        },
        numeroRecibo: receiptNumber,
        referencia: {
          tipo: 'pedido',
          numero: `#${order.order_number}`,
          codigo: payment.id.slice(0, 8).toUpperCase(),
        },
      };

      const path = `${companyId}/${payment.order_id}/recibo-${receiptNumber}.pdf`;
      await generateAndUploadPaymentReceipt(payload, {
        bucket: 'payment-receipts',
        path,
      });

      const receiptA5Url = buildReceiptA5Url(payload);
      window.open(receiptA5Url, '_blank', 'noopener,noreferrer');

      toast({ title: 'Comprovante gerado com sucesso' });
    } catch (error: any) {
      toast({
        title: 'Erro ao gerar comprovante',
        description: error?.message,
        variant: 'destructive',
      });
    } finally {
      setRunningKey(null);
    }
  };

  const handleGenerateSaleReceipt = async (sale: SaleRow) => {
    if (!companyId) return;

    setRunningKey(`sale-${sale.id}`);

    try {
      const { data: itemsData, error: itemsError } = await supabase
        .from('sale_items')
        .select('product_name, quantity')
        .eq('sale_id', sale.id);

      if (itemsError) throw itemsError;

      const receiptNumber = buildSaleReceiptNumber(sale.id);
      const saleCode = sale.id.slice(0, 8).toUpperCase();
      const description = buildDescription(
        ((itemsData || []) as Array<{ product_name: string; quantity: number }>),
        `Venda PDV #${saleCode}`,
      );
      const customer = sale.customer_id ? customersById[sale.customer_id] : null;

      const payload: PaymentReceiptPayload = {
        cliente: {
          nome: customer?.name || 'Consumidor final',
          documento: customer?.document || null,
        },
        pagamento: {
          valor: Number(sale.amount_paid || sale.total || 0),
          forma: paymentMethodLabels[sale.payment_method] || String(sale.payment_method),
          descricao: description,
          data: sale.created_at,
        },
        loja: {
          nome: companyData?.name || 'Loja',
          documento: companyData?.document || null,
          endereco: buildCompanyAddress(companyData),
          logo: companyData?.logo_url ? ensurePublicStorageUrl('product-images', companyData.logo_url) : null,
          assinaturaImagem: companyData?.signature_image_url
            ? ensurePublicStorageUrl('product-images', companyData.signature_image_url)
            : null,
          responsavel: companyData?.signature_responsible || companyData?.name || 'Responsavel',
          cargo: companyData?.signature_role || 'Responsavel',
        },
        numeroRecibo: receiptNumber,
        referencia: {
          tipo: 'pdv',
          numero: `#${saleCode}`,
          codigo: saleCode,
        },
      };

      const path = `${companyId}/pdv/${sale.id}/recibo-${receiptNumber}.pdf`;
      await generateAndUploadPaymentReceipt(payload, {
        bucket: 'payment-receipts',
        path,
      });

      const receiptA5Url = buildReceiptA5Url(payload);
      window.open(receiptA5Url, '_blank', 'noopener,noreferrer');

      toast({ title: 'Recibo PDV gerado com sucesso' });
    } catch (error: any) {
      toast({
        title: 'Erro ao gerar recibo PDV',
        description: error?.message,
        variant: 'destructive',
      });
    } finally {
      setRunningKey(null);
    }
  };

  if (!companyId) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Comprovantes</h1>
        <p className="text-sm text-muted-foreground">Empresa não encontrada na sessão.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Comprovantes</h1>
          <p className="text-sm text-slate-500">
            Segunda via de comprovantes de pedidos e recibos de venda do PDV.
          </p>
        </div>
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={() => loadData(true)}
          disabled={loading || reloading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${reloading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-10"
                placeholder="Buscar por cliente, número ou código..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'orders' | 'pdv')}>
        <TabsList>
          <TabsTrigger value="orders">Comprovantes de pedidos ({filteredOrderPayments.length})</TabsTrigger>
          <TabsTrigger value="pdv">Recibos PDV ({filteredSales.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pagamentos de pedidos</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Carregando comprovantes...</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Forma</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrderPayments.length > 0 ? (
                      filteredOrderPayments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{formatDateTime(payment.paid_at || payment.created_at)}</TableCell>
                          <TableCell className="font-medium">
                            #{payment.order_number || payment.order_id.slice(0, 8).toUpperCase()}
                          </TableCell>
                          <TableCell>{payment.customer_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {payment.method ? paymentMethodLabels[payment.method] || payment.method : 'Não informado'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(Number(payment.amount))}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/pedidos/${payment.order_id}`)}
                              >
                                <ExternalLink className="mr-1 h-4 w-4" />
                                Pedido
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleGenerateOrderReceipt(payment)}
                                disabled={runningKey === `order-${payment.id}`}
                              >
                                <FileDown className="mr-1 h-4 w-4" />
                                {runningKey === `order-${payment.id}` ? 'Gerando...' : 'A5'}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          Nenhum comprovante de pedido encontrado no periodo.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pdv" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recibos de venda do PDV</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Carregando recibos...</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Venda</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Forma</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSales.length > 0 ? (
                      filteredSales.map((sale) => (
                        <TableRow key={sale.id}>
                          <TableCell>{formatDateTime(sale.created_at)}</TableCell>
                          <TableCell className="font-medium">#{sale.id.slice(0, 8).toUpperCase()}</TableCell>
                          <TableCell>{sale.customer_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{paymentMethodLabels[sale.payment_method] || sale.payment_method}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(Number(sale.total))}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleGenerateSaleReceipt(sale)}
                                disabled={runningKey === `sale-${sale.id}`}
                              >
                                <FileDown className="mr-1 h-4 w-4" />
                                {runningKey === `sale-${sale.id}` ? 'Gerando...' : 'A5'}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          Nenhum recibo de PDV encontrado no periodo.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
