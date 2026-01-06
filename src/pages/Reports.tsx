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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { useToast } from '@/hooks/use-toast';
import { buildPeriodSeries, loadReports, type ReportBundle, type ReportFilters, type SalesPeriod } from '@/services/reports';
import { exportToCsv, exportToExcel, openPdfPreview, printPdf, type ExportRow } from '@/lib/report-export';
import { OrderStatus } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';

const statusOptions: Array<{ value: OrderStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'orcamento', label: 'Orcamento' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'em_producao', label: 'Em Produção' },
  { value: 'pronto', label: 'Pronto' },
  { value: 'aguardando_retirada', label: 'Aguardando retirada' },
  { value: 'entregue', label: 'Entregue' },
  { value: 'cancelado', label: 'Cancelado' },
];

const reportTabs = [
  { value: 'cash', label: 'Caixa' },
  { value: 'financial', label: 'Financeiro' },
  { value: 'sales', label: 'Vendas' },
  { value: 'customers', label: 'Clientes' },
  { value: 'products', label: 'Produtos' },
] as const;

type ReportTab = (typeof reportTabs)[number]['value'];

const currency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const percent = (value: number) => `${value.toFixed(1)}%`;

const formatDateTime = (value: string) => new Date(value).toLocaleString('pt-BR');

const defaultDateRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const format = (date: Date) => date.toISOString().split('T')[0];
  return {
    start: format(start),
    end: format(end),
  };
};

const buildExportRows = (tab: ReportTab, data: ReportBundle | null): ExportRow[] => {
  if (!data) return [];
  if (tab === 'cash') {
    return data.cash.transactions.map((tx) => ({
      Data: formatDateTime(tx.date),
      Tipo: tx.type,
      Origem: tx.origin,
      Descricao: tx.description,
      Metodo: tx.method || '-',
      Valor: currency(tx.amount),
      Status: tx.status,
    }));
  }
  if (tab === 'financial') {
    const rows: ExportRow[] = [
      { Secao: 'Resumo', Descricao: 'Receita total', Valor: currency(data.financial.revenueTotal) },
      { Secao: 'Resumo', Descricao: 'Despesa total', Valor: currency(data.financial.expenseTotal) },
      { Secao: 'Resumo', Descricao: 'Lucro', Valor: currency(data.financial.profit) },
      { Secao: 'Resumo', Descricao: 'Margem', Valor: percent(data.financial.margin) },
    ];
    Object.entries(data.financial.revenueByOrigin).forEach(([origin, value]) => {
      rows.push({ Secao: 'Receita por origem', Descricao: origin, Valor: currency(value) });
    });
    Object.entries(data.financial.revenueByMethod).forEach(([method, value]) => {
      rows.push({ Secao: 'Receita por forma', Descricao: method, Valor: currency(value) });
    });
    Object.entries(data.financial.expensesByCategory).forEach(([category, value]) => {
      rows.push({ Secao: 'Despesas por categoria', Descricao: category, Valor: currency(value) });
    });
    Object.entries(data.financial.expensesByStatus).forEach(([status, value]) => {
      rows.push({ Secao: 'Despesas por status', Descricao: status, Valor: currency(value) });
    });
    return rows;
  }
  if (tab === 'sales') {
    const rows: ExportRow[] = [];
    data.sales.salesByProduct.forEach((row) => {
      rows.push({
        Secao: 'Vendas por produto',
        Produto: row.name,
        Quantidade: row.quantity,
        Total: currency(row.total),
      });
    });
    data.sales.salesByCustomer.forEach((row) => {
      rows.push({
        Secao: 'Vendas por cliente',
        Cliente: row.name,
        Pedidos: row.orders,
        Total: currency(row.total),
      });
    });
    return rows;
  }
  if (tab === 'customers') {
    const rows: ExportRow[] = [];
    data.customers.mostActive.forEach((row) => {
      rows.push({
        Secao: 'Clientes ativos',
        Cliente: row.name,
        Pedidos: row.orders,
        Total: currency(row.total),
      });
    });
    data.customers.highestRevenue.forEach((row) => {
      rows.push({
        Secao: 'Maior faturamento',
        Cliente: row.name,
        Total: currency(row.total),
      });
    });
    data.customers.pendingBalances.forEach((row) => {
      rows.push({
        Secao: 'Saldo pendente',
        Cliente: row.name,
        Saldo: currency(row.balance),
      });
    });
    return rows;
  }
  return data.products.marginByProduct.map((row) => ({
    Produto: row.name,
    Margem: currency(row.margin),
    Percentual: percent(row.marginPct),
  }));
};

export default function Reports() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const defaults = useMemo(() => defaultDateRange(), []);
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: defaults.start,
    endDate: defaults.end,
    status: 'all',
    companyId: profile?.company_id ?? null,
  });
  const [activeTab, setActiveTab] = useState<ReportTab>('cash');
  const [reportData, setReportData] = useState<ReportBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [cashPeriod, setCashPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'annual' | 'shift'>('daily');
  const [salesPeriod, setSalesPeriod] = useState<SalesPeriod>('daily');

  const exportRows = useMemo(() => buildExportRows(activeTab, reportData), [activeTab, reportData]);
  const exportTitle = useMemo(() => {
    const tabLabel = reportTabs.find((tab) => tab.value === activeTab)?.label || 'Relatório';
    return `Relatório - ${tabLabel}`;
  }, [activeTab]);

  const loadData = async (nextFilters: ReportFilters) => {
    setLoading(true);
    try {
      const data = await loadReports(nextFilters);
      setReportData(data);
    } catch (error: any) {
      toast({ title: 'Erro ao carregar relatorios', description: error?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(filters);
  }, [filters]);

  useEffect(() => {
    setFilters((prev) => ({ ...prev, companyId: profile?.company_id ?? null }));
  }, [profile?.company_id]);

  const handleClear = () => {
    setFilters({
      startDate: defaults.start,
      endDate: defaults.end,
      status: 'all' as const,
      companyId: profile?.company_id ?? null,
    });
  };

  const cashSeries = useMemo(() => {
    if (!reportData) return [];
    return buildPeriodSeries(reportData.cash.transactions, cashPeriod);
  }, [reportData, cashPeriod]);

  const financialCashflow = useMemo(() => reportData?.financial.cashflow || [], [reportData]);

  const salesPeriodSeries = useMemo(() => {
    if (!reportData) return [];
    return reportData.sales.salesByPeriod[salesPeriod] || [];
  }, [reportData, salesPeriod]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Relatórios</h1>
          <p className="text-sm text-slate-500">Central de indicadores e financeiro.</p>
        </div>
        <Button
          className="rounded-2xl bg-sky-500 shadow-sm hover:bg-sky-600"
          onClick={() => setExportOpen(true)}
          disabled={!reportData}
        >
          Exportar
        </Button>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-2 lg:col-span-2">
              <label className="text-sm text-muted-foreground">Inicio</label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <label className="text-sm text-muted-foreground">Fim</label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Status</label>
              <Select
                value={filters.status || 'all'}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value as ReportFilters['status'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Tipo</label>
              <Select value={activeTab} onValueChange={(value) => setActiveTab(value as ReportTab)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {reportTabs.map((tab) => (
                    <SelectItem key={tab.value} value={tab.value}>
                      {tab.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 lg:col-span-6">
              <Button variant="outline" onClick={handleClear} disabled={loading}>
                Limpar filtros
              </Button>
              {loading && <span className="text-sm text-muted-foreground animate-pulse">Carregando dados...</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ReportTab)}>
        <TabsList>
          {reportTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="cash" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-6 space-y-2">
                <p className="text-sm text-muted-foreground">Total entradas</p>
                <p className="text-2xl font-semibold">
                  {reportData ? currency(reportData.cash.summary.totalIn) : 'R$ 0,00'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-2">
                <p className="text-sm text-muted-foreground">Total saidas</p>
                <p className="text-2xl font-semibold">
                  {reportData ? currency(reportData.cash.summary.totalOut) : 'R$ 0,00'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-2">
                <p className="text-sm text-muted-foreground">Saldo inicial</p>
                <p className="text-2xl font-semibold">
                  {reportData ? currency(reportData.cash.summary.openingBalance) : 'R$ 0,00'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-2">
                <p className="text-sm text-muted-foreground">Saldo final</p>
                <p className="text-2xl font-semibold">
                  {reportData ? currency(reportData.cash.summary.closingBalance) : 'R$ 0,00'}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Fluxo de caixa</CardTitle>
              <Select value={cashPeriod} onValueChange={(value) => setCashPeriod(value as typeof cashPeriod)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diario</SelectItem>
                  <SelectItem value="shift">Por turno</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="annual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  inflow: { label: 'Entradas', color: '#2563eb' },
                  outflow: { label: 'Saidas', color: '#f97316' },
                  net: { label: 'Saldo', color: '#16a34a' },
                }}
                className="h-[280px]"
              >
                <LineChart data={cashSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line type="monotone" dataKey="inflow" stroke="var(--color-inflow)" strokeWidth={2} />
                  <Line type="monotone" dataKey="outflow" stroke="var(--color-outflow)" strokeWidth={2} />
                  <Line type="monotone" dataKey="net" stroke="var(--color-net)" strokeWidth={2} />
                </LineChart>
              </ChartContainer>
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
                    <TableHead>Descricao</TableHead>
                    <TableHead>Metodo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData?.cash.transactions.length ? (
                    reportData.cash.transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>{formatDateTime(tx.date)}</TableCell>
                        <TableCell>{tx.type}</TableCell>
                        <TableCell>{tx.origin}</TableCell>
                        <TableCell>{tx.description}</TableCell>
                        <TableCell>{tx.method || '-'}</TableCell>
                        <TableCell className="text-right">{currency(tx.amount)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{tx.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                        Nenhuma movimentação no período.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="financial" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-6 space-y-2">
                <p className="text-sm text-muted-foreground">Receita total</p>
                <p className="text-2xl font-semibold">
                  {reportData ? currency(reportData.financial.revenueTotal) : 'R$ 0,00'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-2">
                <p className="text-sm text-muted-foreground">Despesa total</p>
                <p className="text-2xl font-semibold">
                  {reportData ? currency(reportData.financial.expenseTotal) : 'R$ 0,00'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-2">
                <p className="text-sm text-muted-foreground">Lucro</p>
                <p className="text-2xl font-semibold">
                  {reportData ? currency(reportData.financial.profit) : 'R$ 0,00'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-2">
                <p className="text-sm text-muted-foreground">Margem</p>
                <p className="text-2xl font-semibold">
                  {reportData ? percent(reportData.financial.margin) : '0%'}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Fluxo de caixa</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    inflow: { label: 'Entradas', color: '#2563eb' },
                    outflow: { label: 'Saidas', color: '#f97316' },
                    net: { label: 'Saldo', color: '#16a34a' },
                  }}
                  className="h-[260px]"
                >
                  <LineChart data={financialCashflow}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="inflow" stroke="var(--color-inflow)" strokeWidth={2} />
                    <Line type="monotone" dataKey="outflow" stroke="var(--color-outflow)" strokeWidth={2} />
                    <Line type="monotone" dataKey="net" stroke="var(--color-net)" strokeWidth={2} />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Receita por origem</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    value: { label: 'Receita', color: '#2563eb' },
                  }}
                  className="h-[260px]"
                >
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <Pie
                      data={Object.entries(reportData?.financial.revenueByOrigin || {}).map(([name, value]) => ({
                        name,
                        value,
                      }))}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={90}
                    >
                      {Object.keys(reportData?.financial.revenueByOrigin || {}).map((key, index) => (
                        <Cell key={key} fill={['#2563eb', '#0ea5e9', '#38bdf8'][index % 3]} />
                      ))}
                    </Pie>
                    <ChartLegend content={<ChartLegendContent />} />
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Receita por forma</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Forma</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(reportData?.financial.revenueByMethod || {}).length ? (
                      Object.entries(reportData?.financial.revenueByMethod || {}).map(([method, value]) => (
                        <TableRow key={method}>
                          <TableCell>{method}</TableCell>
                          <TableCell className="text-right">{currency(value)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground py-6">
                          Nenhum dado no período.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Despesas por status</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(reportData?.financial.expensesByStatus || {}).length ? (
                      Object.entries(reportData?.financial.expensesByStatus || {}).map(([status, value]) => (
                        <TableRow key={status}>
                          <TableCell>{status}</TableCell>
                          <TableCell className="text-right">{currency(value)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground py-6">
                          Nenhum dado no período.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Despesas por categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  value: { label: 'Despesas', color: '#f97316' },
                }}
                className="h-[260px]"
              >
                <BarChart
                  data={Object.entries(reportData?.financial.expensesByCategory || {}).map(([name, value]) => ({
                    name,
                    value,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-6 space-y-2">
                <p className="text-sm text-muted-foreground">Total vendido</p>
                <p className="text-2xl font-semibold">
                  {reportData ? currency(reportData.sales.totalSales) : 'R$ 0,00'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-2">
                <p className="text-sm text-muted-foreground">Ticket medio</p>
                <p className="text-2xl font-semibold">
                  {reportData ? currency(reportData.sales.ticketAverage) : 'R$ 0,00'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-2">
                <p className="text-sm text-muted-foreground">Pedidos / vendas</p>
                <p className="text-2xl font-semibold">
                  {reportData ? reportData.sales.orderCount : 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-2">
                <p className="text-sm text-muted-foreground">Status pedidos</p>
                <div className="flex items-center justify-between text-sm">
                  <span>Finalizados</span>
                  <span className="font-medium">
                    {reportData ? reportData.sales.statusCounts.entregue || 0 : 0}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Cancelados</span>
                  <span className="font-medium text-destructive">
                    {reportData ? reportData.sales.statusCounts.cancelado || 0 : 0}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Vendas por período</CardTitle>
              <Select value={salesPeriod} onValueChange={(value) => setSalesPeriod(value as SalesPeriod)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diario</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="annual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  total: { label: 'Vendas', color: '#2563eb' },
                }}
                className="h-[260px]"
              >
                <LineChart data={salesPeriodSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="total" stroke="var(--color-total)" strokeWidth={2} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Produtos mais vendidos</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData?.sales.salesByProduct.slice(0, 8).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right">{row.quantity}</TableCell>
                        <TableCell className="text-right">{currency(row.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Vendas por cliente</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Pedidos</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData?.sales.salesByCustomer.slice(0, 8).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right">{row.orders}</TableCell>
                        <TableCell className="text-right">{currency(row.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="customers" className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Clientes mais ativos</CardTitle>
              </CardHeader>
              <CardContent>
                {reportData?.customers.mostActive.map((row) => (
                  <div key={row.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{row.name}</span>
                    <span className="font-medium">{row.orders} pedidos</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Maior faturamento</CardTitle>
              </CardHeader>
              <CardContent>
                {reportData?.customers.highestRevenue.map((row) => (
                  <div key={row.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{row.name}</span>
                    <span className="font-medium">{currency(row.total)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Saldo pendente</CardTitle>
              </CardHeader>
              <CardContent>
                {reportData?.customers.pendingBalances.map((row) => (
                  <div key={row.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{row.name}</span>
                    <span className="font-medium text-destructive">{currency(row.balance)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Insights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {(reportData?.customers.insights || []).map((insight) => (
                <p key={insight}>{insight}</p>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Histórico de compras</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Ultima compra</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData?.customers.history.length ? (
                    reportData.customers.history.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right">{row.orders}</TableCell>
                        <TableCell className="text-right">{currency(row.total)}</TableCell>
                        <TableCell className="text-right">
                          {row.lastOrderAt ? new Date(row.lastOrderAt).toLocaleDateString('pt-BR') : '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                        Nenhum pedido encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Produtos mais vendidos</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData?.products.mostSold.length ? (
                      reportData.products.mostSold.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.name}</TableCell>
                          <TableCell className="text-right">{row.quantity}</TableCell>
                          <TableCell className="text-right">{currency(row.total)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                          Nenhuma venda no período.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Produtos menos vendidos</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData?.products.leastSold.length ? (
                      reportData.products.leastSold.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.name}</TableCell>
                          <TableCell className="text-right">{row.quantity}</TableCell>
                          <TableCell className="text-right">{currency(row.total)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                          Nenhuma venda no período.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Faturamento por produto</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData?.products.revenueByProduct.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right">{currency(row.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Margem por produto</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Margem</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData?.products.marginByProduct.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right">{currency(row.margin)}</TableCell>
                        <TableCell className="text-right">{percent(row.marginPct)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Baixo giro</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData?.products.lowTurnover.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-right">{row.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Preview - {exportTitle}</DialogTitle>
          </DialogHeader>
          {exportRows.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {exportRows.length} linhas encontradas.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    {Object.keys(exportRows[0]).map((key) => (
                      <TableHead key={key}>{key}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exportRows.slice(0, 15).map((row, index) => (
                    <TableRow key={index}>
                      {Object.keys(row).map((key) => (
                        <TableCell key={key}>{String(row[key] ?? '')}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum dado para exportar.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => openPdfPreview(exportTitle, exportRows)} disabled={!exportRows.length}>
              Preview PDF
            </Button>
            <Button variant="outline" onClick={() => printPdf(exportTitle, exportRows)} disabled={!exportRows.length}>
              PDF
            </Button>
            <Button variant="outline" onClick={() => exportToExcel(exportRows, 'relatorio.xls')} disabled={!exportRows.length}>
              Excel
            </Button>
            <Button onClick={() => exportToCsv(exportRows, 'relatorio.csv')} disabled={!exportRows.length}>
              CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
