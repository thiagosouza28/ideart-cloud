import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
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
import type { FinancialEntryOrigin, FinancialEntryType, PaymentMethod } from '@/types/database';

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
  { value: 'cartao', label: 'Cartao' },
  { value: 'credito', label: 'Cartao credito' },
  { value: 'debito', label: 'Cartao debito' },
  { value: 'transferencia', label: 'Transferencia' },
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
        description: error?.message || 'Nao foi possivel carregar os filtros',
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

  const lineSeries = useMemo(() => {
    if (!cashData) return [];
    return buildPeriodSeries(cashData.transactions, period);
  }, [cashData, period]);

  const methodPie = useMemo(
    () =>
      Object.entries(cashData?.revenueByMethod || {}).map(([name, value]) => ({
        name,
        value,
      })),
    [cashData],
  );

  const monthlyBars = useMemo(() => cashData?.monthlyComparison || [], [cashData]);

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
      Descricao: tx.description,
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
      toast({ title: 'Valor invalido', description: 'Informe um valor maior que zero.', variant: 'destructive' });
      return;
    }

    const payload: ManualCashEntryPayload = {
      type: entryForm.type,
      origin: entryForm.origin,
      amount,
      payment_method: entryForm.payment_method === 'none' ? null : entryForm.payment_method,
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Fluxo de Caixa</h1>
          <p className="text-sm text-slate-500">Entradas, saidas, saldos e relatorios com filtros avancados.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => loadCash(filters)} disabled={reportLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
          <Button variant="outline" onClick={() => openPdfPreview('Fluxo de Caixa', exportRows)} disabled={!exportRows.length}>
            Preview PDF
          </Button>
          <Button variant="outline" onClick={() => printPdf('Fluxo de Caixa', exportRows)} disabled={!exportRows.length}>
            Exportar PDF
          </Button>
          <Button variant="outline" onClick={() => exportToCsv(exportRows, 'fluxo_caixa.csv')} disabled={!exportRows.length}>
            Exportar CSV
          </Button>
          {canManage && (
            <Button onClick={openCreateDialog}>
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
              <Label>Direcao</Label>
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Total entradas</p>
            <p className="text-2xl font-semibold">{currency(cashData?.summary.totalIn || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Total saidas</p>
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Evolucao receita vs despesa</CardTitle>
            <Select value={period} onValueChange={(value) => setPeriod(value as typeof period)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Diario</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="annual">Anual</SelectItem>
                <SelectItem value="shift">Turno</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <ChartContainer
              className="h-[280px]"
              config={{
                inflow: { label: 'Receitas', color: '#2563eb' },
                outflow: { label: 'Despesas', color: '#ef4444' },
                net: { label: 'Saldo', color: '#16a34a' },
              }}
            >
              <LineChart data={lineSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line dataKey="inflow" type="monotone" stroke="var(--color-inflow)" strokeWidth={2} />
                <Line dataKey="outflow" type="monotone" stroke="var(--color-outflow)" strokeWidth={2} />
                <Line dataKey="net" type="monotone" stroke="var(--color-net)" strokeWidth={2} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Receita por forma de pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer className="h-[280px]" config={{ value: { label: 'Receita', color: '#3b82f6' } }}>
              <PieChart>
                <Pie data={methodPie} dataKey="value" nameKey="name" outerRadius={95} innerRadius={45} label />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
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
          <ChartContainer
            className="h-[260px]"
            config={{
              inflow: { label: 'Entradas', color: '#2563eb' },
              outflow: { label: 'Saidas', color: '#f97316' },
            }}
          >
            <BarChart data={monthlyBars}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="inflow" fill="var(--color-inflow)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="outflow" fill="var(--color-outflow)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartContainer>
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
              <p className="text-sm text-slate-500">Sem dados para o periodo selecionado.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movimentacoes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Descricao</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Saldo acumulado</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="text-right">Acoes</TableHead>}
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
                        {tx.isAutomatic ? 'Automatico' : 'Manual'}
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
                            title={tx.isAutomatic ? 'Lançamento automatico nao pode ser editado' : 'Editar'}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={tx.isAutomatic}
                            onClick={() => handleDeleteEntry(tx)}
                            title={tx.isAutomatic ? 'Lançamento automatico nao pode ser excluido' : 'Excluir'}
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
                    {reportLoading ? 'Carregando movimentacoes...' : 'Nenhuma movimentacao encontrada.'}
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
              <Input
                type="number"
                min="0"
                step="0.01"
                value={entryForm.amount}
                onChange={(e) => setEntryForm((prev) => ({ ...prev, amount: e.target.value }))}
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
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods
                    .filter((option) => option.value !== 'all')
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
              <Label>Descricao</Label>
              <Input
                value={entryForm.description}
                onChange={(e) => setEntryForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Descricao do lançamento"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Observacoes</Label>
              <Textarea
                value={entryForm.notes}
                onChange={(e) => setEntryForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Informacoes adicionais (opcional)"
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
