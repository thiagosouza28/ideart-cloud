import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyInput } from '@/components/ui/currency-input';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  buildCashForecastSeries,
  buildCashForecastSummary,
  buildExpenseAlertSummary,
  type ForecastPeriod,
} from '@/lib/finance';
import { buildPeriodSeries, loadReports, type CashTransaction, type ReportFilters } from '@/services/reports';
import {
  createManualCashEntry,
  deleteManualCashEntry,
  listCashCompanies,
  listCashCreators,
  updateManualCashEntry,
  type ManualCashEntryPayload,
} from '@/services/cashFlow';
import { exportToCsv, openPdfPreview, printPdf, type ExportRow } from '@/lib/report-export';
import type {
  Expense,
  FinancialEntry,
  FinancialEntryOrigin,
  FinancialEntryType,
  Order,
  PaymentMethod,
  Sale,
} from '@/types/database';

type SortBy = 'date' | 'amount' | 'type';
type SortOrder = 'asc' | 'desc';

type EntryFormState = {
  id: string | null;
  type: FinancialEntryType;
  origin: FinancialEntryOrigin;
  amount: string;
  payment_method: PaymentMethod | 'none';
  occurred_at: string;
  description: string;
  notes: string;
};

const paymentMethods: Array<{ value: PaymentMethod | 'all' | 'none'; label: string }> = [
  { value: 'all', label: 'Todas as formas' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'credito', label: 'Cartão crédito' },
  { value: 'debito', label: 'Cartão débito' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'outro', label: 'Outros' },
];

const originOptions: Array<{ value: FinancialEntryOrigin | 'all'; label: string }> = [
  { value: 'all', label: 'Todas as origens' },
  { value: 'venda', label: 'Venda' },
  { value: 'assinatura', label: 'Assinatura' },
  { value: 'custo', label: 'Custo' },
  { value: 'reembolso', label: 'Reembolso' },
  { value: 'ajuste', label: 'Ajuste' },
  { value: 'manual', label: 'Manual' },
  { value: 'pdv', label: 'PDV' },
  { value: 'outros', label: 'Outros' },
];

const manualOriginOptions: Array<{ value: FinancialEntryOrigin; label: string }> = [
  { value: 'manual', label: 'Receita avulsa' },
  { value: 'custo', label: 'Custo' },
  { value: 'ajuste', label: 'Ajuste de caixa' },
  { value: 'outros', label: 'Outros' },
  { value: 'reembolso', label: 'Reembolso' },
  { value: 'venda', label: 'Venda' },
  { value: 'assinatura', label: 'Assinatura' },
  { value: 'pdv', label: 'PDV' },
];

const paymentMethodChartPalette = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#7c3aed',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);
const toDateTimeLocal = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const offset = parsed.getTimezoneOffset();
  const local = new Date(parsed.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
};
const fromDateTimeLocal = (value: string) => {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
};

const currency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const dateTimeLabel = (value: string) => new Date(value).toLocaleString('pt-BR');

const defaultRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: toDateInput(start), end: toDateInput(end) };
};

const defaultForm = (): EntryFormState => ({
  id: null,
  type: 'receita',
  origin: 'manual',
  amount: '',
  payment_method: 'none',
  occurred_at: toDateTimeLocal(new Date().toISOString()),
  description: '',
  notes: '',
});

const mapTransactionToForm = (tx: CashTransaction): EntryFormState => ({
  id: tx.id,
  type: tx.rawType,
  origin: (tx.origin as FinancialEntryOrigin) || 'manual',
  amount: String(tx.amount || ''),
  payment_method: tx.method || 'none',
  occurred_at: toDateTimeLocal(tx.date),
  description: tx.description || '',
  notes: '',
});

export default function CashFlow() {
  const { toast } = useToast();
  const { profile, role, hasPermission } = useAuth();
  const ranges = useMemo(() => defaultRange(), []);
  const canManage = hasPermission(['admin', 'financeiro']);
  const isSuperAdmin = role === 'super_admin';

  const [filters, setFilters] = useState<ReportFilters>({
    startDate: ranges.start,
    endDate: ranges.end,
    status: 'all',
    companyId: profile?.company_id ?? null,
    cashType: 'all',
    cashOrigin: 'all',
    cashPaymentMethod: 'all',
    cashCreatedBy: 'all',
    cashSortBy: 'date',
    cashSortOrder: 'desc',
  });
  const [reportLoading, setReportLoading] = useState(false);
  const [cashData, setCashData] = useState<Awaited<ReturnType<typeof loadReports>>['cash'] | null>(null);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'annual' | 'shift'>('daily');
  const [creators, setCreators] = useState<Array<{ id: string; full_name: string }>>([]);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entrySaving, setEntrySaving] = useState(false);
  const [entryForm, setEntryForm] = useState<EntryFormState>(defaultForm());
  const [forecastPeriod, setForecastPeriod] = useState<ForecastPeriod>('month');
  const [forecastOrders, setForecastOrders] = useState<Order[]>([]);
  const [forecastSales, setForecastSales] = useState<Sale[]>([]);
  const [forecastEntries, setForecastEntries] = useState<FinancialEntry[]>([]);
  const [forecastExpenses, setForecastExpenses] = useState<Expense[]>([]);

  const activeCompanyId = isSuperAdmin ? filters.companyId ?? null : profile?.company_id ?? null;

  const loadCash = async (nextFilters: ReportFilters) => {
    setReportLoading(true);
    try {
      const data = await loadReports(nextFilters);
      setCashData(data.cash);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar fluxo de caixa',
        description: error?.message || 'Falha ao buscar dados',
        variant: 'destructive',
      });
    } finally {
      setReportLoading(false);
    }
  };

  const loadForecastData = async (companyId?: string | null) => {
    if (!companyId) {
      setForecastOrders([]);
      setForecastSales([]);
      setForecastEntries([]);
      setForecastExpenses([]);
      return;
    }

    try {
      const [ordersResult, salesResult, entriesResult, expensesResult] = await Promise.all([
        supabase
          .from('orders')
          .select('id, status, total, amount_paid, created_at, estimated_delivery_date, customer_credit_used, payment_status')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('sales')
          .select('id, total, amount_paid, created_at')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('financial_entries')
          .select('*')
          .eq('company_id', companyId)
          .order('occurred_at', { ascending: false })
          .limit(500),
        supabase
          .from('expenses')
          .select('*')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false }),
      ]);

      setForecastOrders((ordersResult.data as Order[]) || []);
      setForecastSales((salesResult.data as Sale[]) || []);
      setForecastEntries((entriesResult.data as FinancialEntry[]) || []);
      setForecastExpenses((expensesResult.data as Expense[]) || []);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar previsão de caixa',
        description: error?.message || 'Falha ao buscar dados previstos',
        variant: 'destructive',
      });
    }
  };

  const loadFilterSources = async (companyId?: string | null) => {
    try {
      const [creatorRows, companyRows] = await Promise.all([
        listCashCreators(companyId || null),
        isSuperAdmin ? listCashCompanies() : Promise.resolve([]),
      ]);
      setCreators(creatorRows);
      setCompanies(companyRows);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar filtros',
        description: error?.message || 'Não foi possível carregar os filtros',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    const companyId = isSuperAdmin ? filters.companyId : profile?.company_id ?? null;
    void loadFilterSources(companyId);
  }, [isSuperAdmin, profile?.company_id, filters.companyId]);

  useEffect(() => {
    if (!isSuperAdmin) {
      setFilters((prev) => ({ ...prev, companyId: profile?.company_id ?? null }));
    }
  }, [profile?.company_id, isSuperAdmin]);

  useEffect(() => {
    void loadCash(filters);
  }, [filters]);

  useEffect(() => {
    void loadForecastData(activeCompanyId);
  }, [activeCompanyId]);

  const lineSeries = useMemo(() => {
    if (!cashData) return [];
    return buildPeriodSeries(cashData.transactions, period);
  }, [cashData, period]);

  const methodPie = useMemo(
    () =>
      Object.entries(cashData?.revenueByMethod || {}).map(([name, value], index) => ({
        name,
        value,
        fill: paymentMethodChartPalette[index % paymentMethodChartPalette.length],
      })),
    [cashData],
  );

  const paymentMethodChartConfig = useMemo<ChartConfig>(
    () =>
      methodPie.reduce((config, item) => {
        config[item.name] = {
          label: item.name,
          color: item.fill,
        };
        return config;
      }, {} as ChartConfig),
    [methodPie],
  );

  const monthlyBars = useMemo(() => cashData?.monthlyComparison || [], [cashData]);

  const forecastSummary = useMemo(
    () =>
      buildCashForecastSummary({
        orders: forecastOrders,
        sales: forecastSales,
        entries: forecastEntries,
        expenses: forecastExpenses,
        period: forecastPeriod,
      }),
    [forecastEntries, forecastExpenses, forecastOrders, forecastPeriod, forecastSales],
  );

  const forecastSeries = useMemo(
    () =>
      buildCashForecastSeries({
        orders: forecastOrders,
        sales: forecastSales,
        entries: forecastEntries,
        expenses: forecastExpenses,
        period: forecastPeriod,
      }),
    [forecastEntries, forecastExpenses, forecastOrders, forecastPeriod, forecastSales],
  );

  const forecastAlerts = useMemo(() => buildExpenseAlertSummary(forecastExpenses), [forecastExpenses]);

  const balancesById = useMemo(() => {
    if (!cashData) return {} as Record<string, number>;
    const ascending = [...cashData.transactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    let running = cashData.summary.openingBalance;
    const map: Record<string, number> = {};
    ascending.forEach((tx) => {
      running += tx.type === 'entrada' ? tx.amount : -tx.amount;
      map[tx.id] = running;
    });
    return map;
  }, [cashData]);

  const exportRows = useMemo<ExportRow[]>(() => {
    if (!cashData) return [];
    return cashData.transactions.map((tx) => ({
      Data: dateTimeLabel(tx.date),
      Tipo: tx.type,
      Origem: tx.origin,
      Descrição: tx.description,
      Valor: currency(tx.amount),
      Forma: tx.method || '-',
      'Saldo acumulado': currency(balancesById[tx.id] || 0),
    }));
  }, [cashData, balancesById]);

  const openCreateDialog = () => {
    setEntryForm(defaultForm());
    setEntryDialogOpen(true);
  };

  const openEditDialog = (tx: CashTransaction) => {
    if (tx.isAutomatic) return;
    setEntryForm(mapTransactionToForm(tx));
    setEntryDialogOpen(true);
  };

  const handleSaveEntry = async () => {
    const amount = Number(entryForm.amount.replace(',', '.'));
    if (!amount || amount <= 0) {
      toast({ title: 'Valor inválido', description: 'Informe um valor maior que zero.', variant: 'destructive' });
      return;
    }
    if (entryForm.payment_method === 'none') {
      toast({
        title: 'Forma de pagamento obrigatória',
        description: 'Selecione a forma de pagamento do lançamento.',
        variant: 'destructive',
      });
      return;
    }

    const payload: ManualCashEntryPayload = {
      type: entryForm.type,
      origin: entryForm.origin,
      amount,
      payment_method: entryForm.payment_method,
      description: entryForm.description || null,
      notes: entryForm.notes || null,
      occurred_at: fromDateTimeLocal(entryForm.occurred_at),
      status: 'pago',
    };

    setEntrySaving(true);
    try {
      if (entryForm.id) {
        await updateManualCashEntry(entryForm.id, payload);
        toast({ title: 'Lançamento atualizado' });
      } else {
        await createManualCashEntry(payload);
        toast({ title: 'Lançamento criado' });
      }
      setEntryDialogOpen(false);
      setEntryForm(defaultForm());
      await loadCash(filters);
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar lançamento',
        description: error?.message || 'Falha ao salvar',
        variant: 'destructive',
      });
    } finally {
      setEntrySaving(false);
    }
  };

  const handleDeleteEntry = async (tx: CashTransaction) => {
    if (tx.isAutomatic || !canManage) return;
    if (!window.confirm('Deseja realmente excluir este lançamento manual?')) return;

    try {
      await deleteManualCashEntry(tx.id);
      toast({ title: 'Lançamento excluído' });
      await loadCash(filters);
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir lançamento',
        description: error?.message || 'Falha ao excluir',
        variant: 'destructive',
      });
    }
  };

  const clearFilters = () => {
    setFilters((prev) => ({
      ...prev,
      startDate: ranges.start,
      endDate: ranges.end,
      cashType: 'all',
      cashOrigin: 'all',
      cashPaymentMethod: 'all',
      cashCreatedBy: 'all',
      cashSortBy: 'date',
      cashSortOrder: 'desc',
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Fluxo de Caixa</h1>
          <p className="text-sm text-slate-500">Entradas, saídas, saldos e relatórios com filtros avançados.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap lg:w-auto lg:justify-end">
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => loadCash(filters)} disabled={reportLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => openPdfPreview('Fluxo de Caixa', exportRows)} disabled={!exportRows.length}>
            Preview PDF
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => printPdf('Fluxo de Caixa', exportRows)} disabled={!exportRows.length}>
            Exportar PDF
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => exportToCsv(exportRows, 'fluxo_caixa.csv')} disabled={!exportRows.length}>
            Exportar CSV
          </Button>
          {canManage && (
            <Button className="w-full sm:w-auto" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Novo lançamento
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-2">
              <Label>Data inicial</Label>
              <Input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Data final</Label>
              <Input
                type="date"
                value={filters.endDate || ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={filters.cashType || 'all'}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, cashType: value as ReportFilters['cashType'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Origem</Label>
              <Select
                value={filters.cashOrigin || 'all'}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, cashOrigin: value as ReportFilters['cashOrigin'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {originOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Forma</Label>
              <Select
                value={filters.cashPaymentMethod || 'all'}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, cashPaymentMethod: value as ReportFilters['cashPaymentMethod'] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods
                    .filter((option) => option.value !== 'none')
                    .map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Criado por</Label>
              <Select
                value={filters.cashCreatedBy || 'all'}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, cashCreatedBy: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {creators.map((creator) => (
                    <SelectItem key={creator.id} value={creator.id}>
                      {creator.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isSuperAdmin && (
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Select
                  value={filters.companyId || 'all'}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, companyId: value === 'all' ? null : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Ordenar por</Label>
              <Select
                value={filters.cashSortBy || 'date'}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, cashSortBy: value as SortBy }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Data</SelectItem>
                  <SelectItem value="amount">Valor</SelectItem>
                  <SelectItem value="type">Tipo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Direção</Label>
              <Select
                value={filters.cashSortOrder || 'desc'}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, cashSortOrder: value as SortOrder }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Decrescente</SelectItem>
                  <SelectItem value="asc">Crescente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={clearFilters} className="w-full">
                Limpar filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Previsão de fluxo de caixa</CardTitle>
            <p className="text-sm text-muted-foreground">
              Entradas e saídas previstas com base em pedidos, vendas, lançamentos e despesas futuras.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              className="w-full sm:w-auto"
              size="sm"
              variant={forecastPeriod === 'today' ? 'default' : 'outline'}
              onClick={() => setForecastPeriod('today')}
            >
              Hoje
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              size="sm"
              variant={forecastPeriod === 'week' ? 'default' : 'outline'}
              onClick={() => setForecastPeriod('week')}
            >
              Semana
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              size="sm"
              variant={forecastPeriod === 'month' ? 'default' : 'outline'}
              onClick={() => setForecastPeriod('month')}
            >
              Mês
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-sm text-muted-foreground">Saldo atual</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {currency(forecastSummary.currentBalance)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-sm text-muted-foreground">Entradas previstas</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-600">
                {currency(forecastSummary.incoming)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-sm text-muted-foreground">Saídas previstas</p>
              <p className="mt-2 text-2xl font-semibold text-amber-600">
                {currency(forecastSummary.outgoing)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-sm text-muted-foreground">Saldo projetado</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {currency(forecastSummary.projectedBalance)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {forecastAlerts.overdue > 0 || forecastAlerts.dueSoon > 0
                  ? `${forecastAlerts.overdue} vencida(s) • ${forecastAlerts.dueSoon} vencendo`
                  : 'Sem contas em alerta no período'}
              </p>
            </div>
          </div>

          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ChartContainer
              className="h-[340px] min-w-[520px] md:h-[280px] md:min-w-0"
              config={{
                incoming: { label: 'Entradas previstas', color: '#16a34a' },
                outgoing: { label: 'Saídas previstas', color: '#f59e0b' },
                net: { label: 'Saldo líquido', color: '#2563eb' },
              }}
            >
              <LineChart data={forecastSeries} margin={{ top: 12, right: 12, left: 4, bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" minTickGap={24} tick={{ fontSize: 12 }} tickMargin={8} />
                <YAxis width={48} tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent className="flex-wrap gap-2 sm:gap-4" />} />
                <Line dataKey="incoming" type="monotone" stroke="var(--color-incoming)" strokeWidth={2} />
                <Line dataKey="outgoing" type="monotone" stroke="var(--color-outgoing)" strokeWidth={2} />
                <Line dataKey="net" type="monotone" stroke="var(--color-net)" strokeWidth={2} />
              </LineChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Total entradas</p>
            <p className="text-2xl font-semibold">{currency(cashData?.summary.totalIn || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Total saídas</p>
            <p className="text-2xl font-semibold">{currency(cashData?.summary.totalOut || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Saldo atual</p>
            <p className="text-2xl font-semibold">{currency(cashData?.summary.closingBalance || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Saldo inicial</p>
            <p className="text-2xl font-semibold">{currency(cashData?.summary.openingBalance || 0)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Evolução receita vs despesa</CardTitle>
            <Select value={period} onValueChange={(value) => setPeriod(value as typeof period)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Diário</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="annual">Anual</SelectItem>
                <SelectItem value="shift">Turno</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <ChartContainer
                className="h-[340px] min-w-[520px] md:h-[280px] md:min-w-0"
                config={{
                  inflow: { label: 'Receitas', color: '#2563eb' },
                  outflow: { label: 'Despesas', color: '#ef4444' },
                  net: { label: 'Saldo', color: '#16a34a' },
                }}
              >
                <LineChart data={lineSeries} margin={{ top: 12, right: 12, left: 4, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" minTickGap={24} tick={{ fontSize: 12 }} tickMargin={8} />
                  <YAxis width={48} tick={{ fontSize: 12 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent className="flex-wrap gap-2 sm:gap-4" />} />
                  <Line dataKey="inflow" type="monotone" stroke="var(--color-inflow)" strokeWidth={2} />
                  <Line dataKey="outflow" type="monotone" stroke="var(--color-outflow)" strokeWidth={2} />
                  <Line dataKey="net" type="monotone" stroke="var(--color-net)" strokeWidth={2} />
                </LineChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Receita por forma de pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer className="h-[340px] md:h-[280px]" config={paymentMethodChartConfig}>
              <PieChart>
                <Pie data={methodPie} dataKey="value" nameKey="name" outerRadius={80} innerRadius={42}>
                  {methodPie.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent className="flex-wrap gap-2 sm:gap-4" nameKey="name" />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comparativo mensal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ChartContainer
              className="h-[320px] min-w-[520px] md:h-[260px] md:min-w-0"
              config={{
                inflow: { label: 'Entradas', color: '#2563eb' },
                outflow: { label: 'Saídas', color: '#f97316' },
              }}
            >
              <BarChart data={monthlyBars} margin={{ top: 12, right: 12, left: 4, bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" minTickGap={24} tick={{ fontSize: 12 }} tickMargin={8} />
                <YAxis width={48} tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent className="flex-wrap gap-2 sm:gap-4" />} />
                <Bar dataKey="inflow" fill="var(--color-inflow)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="outflow" fill="var(--color-outflow)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saldo por forma de pagamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(cashData?.summary.balanceByMethod || {}).length ? (
              Object.entries(cashData?.summary.balanceByMethod || {}).map(([method, value]) => (
                <div key={method} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">{method}</p>
                  <p className="text-lg font-semibold">{currency(value)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">Sem dados para o período selecionado.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movimentações</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Saldo acumulado</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cashData?.transactions.length ? (
                cashData.transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{dateTimeLabel(tx.date)}</TableCell>
                    <TableCell>{tx.type}</TableCell>
                    <TableCell>{tx.origin}</TableCell>
                    <TableCell>{tx.description}</TableCell>
                    <TableCell>{tx.method || '-'}</TableCell>
                    <TableCell className="text-right">{currency(tx.amount)}</TableCell>
                    <TableCell className="text-right">{currency(balancesById[tx.id] || 0)}</TableCell>
                    <TableCell>
                      <Badge variant={tx.isAutomatic ? 'secondary' : 'outline'}>
                        {tx.isAutomatic ? 'Automático' : 'Manual'}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={tx.isAutomatic}
                            onClick={() => openEditDialog(tx)}
                            title={tx.isAutomatic ? 'Lançamento automático não pode ser editado' : 'Editar'}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={tx.isAutomatic}
                            onClick={() => handleDeleteEntry(tx)}
                            title={tx.isAutomatic ? 'Lançamento automático não pode ser excluído' : 'Excluir'}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={canManage ? 9 : 8} className="py-8 text-center text-slate-500">
                    {reportLoading ? 'Carregando movimentações...' : 'Nenhuma movimentação encontrada.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{entryForm.id ? 'Editar lançamento manual' : 'Novo lançamento manual'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={entryForm.type} onValueChange={(value) => setEntryForm((prev) => ({ ...prev, type: value as FinancialEntryType }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Origem</Label>
              <Select value={entryForm.origin} onValueChange={(value) => setEntryForm((prev) => ({ ...prev, origin: value as FinancialEntryOrigin }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {manualOriginOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <CurrencyInput
                value={Number(entryForm.amount || 0)}
                onChange={(value) => setEntryForm((prev) => ({ ...prev, amount: String(value) }))}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select
                value={entryForm.payment_method}
                onValueChange={(value) => setEntryForm((prev) => ({ ...prev, payment_method: value as EntryFormState['payment_method'] }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>
                    Selecione
                  </SelectItem>
                  {paymentMethods
                    .filter((option) => option.value !== 'all' && option.value !== 'none')
                    .map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Data e hora</Label>
              <Input
                type="datetime-local"
                value={entryForm.occurred_at}
                onChange={(e) => setEntryForm((prev) => ({ ...prev, occurred_at: e.target.value }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Descrição</Label>
              <Input
                value={entryForm.description}
                onChange={(e) => setEntryForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Descrição do lançamento"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Observações</Label>
              <Textarea
                value={entryForm.notes}
                onChange={(e) => setEntryForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Informações adicionais (opcional)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEntry} disabled={entrySaving}>
              {entrySaving ? 'Salvando...' : 'Salvar lançamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
