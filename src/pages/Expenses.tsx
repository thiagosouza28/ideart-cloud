import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Plus, Repeat, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyInput } from '@/components/ui/currency-input';
import {
  buildExpenseAlertSummary,
  getExpenseAmount,
  getExpenseDisplayStatus,
  getExpenseDueStatus,
  resolveExpenseDueDate,
} from '@/lib/finance';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { fetchCompanyPaymentMethods } from '@/services/companyPaymentMethods';
import {
  defaultCompanyPaymentMethods,
  getActiveCompanyPaymentMethods,
  type CompanyPaymentMethodConfig,
} from '@/lib/paymentMethods';
import type {
  Expense,
  ExpenseAllocationMethod,
  ExpenseDueStatus,
  ExpenseStatus,
  ExpenseType,
  PaymentMethod,
} from '@/types/database';

type ExpenseFormState = {
  id?: string;
  expense_type: ExpenseType;
  name: string;
  category: string;
  monthly_amount: number;
  amount: number;
  expense_date: string;
  due_date: string;
  due_day: number;
  description: string;
  status: ExpenseStatus;
  apply_to_product_cost: boolean;
  allocation_method: ExpenseAllocationMethod;
};

type ExpensePaymentFormState = {
  expenseId: string;
  expenseName: string;
  amount: number;
  paidDate: string;
  paymentMethod: PaymentMethod;
  notes: string;
};

const defaultForm = (): ExpenseFormState => ({
  expense_type: 'recorrente',
  name: '',
  category: '',
  monthly_amount: 0,
  amount: 0,
  expense_date: new Date().toISOString().slice(0, 10),
  due_date: new Date().toISOString().slice(0, 10),
  due_day: 10,
  description: '',
  status: 'ativo',
  apply_to_product_cost: false,
  allocation_method: 'percentual_custo',
});

const currency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const typeLabels: Record<ExpenseType, string> = {
  recorrente: 'Recorrente',
  nao_recorrente: 'Não recorrente',
};

const dueStatusLabels: Record<ExpenseDueStatus, string> = {
  a_vencer: 'A vencer',
  vencendo: 'Vencendo',
  vencida: 'Vencida',
  pago: 'Pago',
  sem_vencimento: 'Sem vencimento',
};

const displayStatusLabels = {
  pendente: 'Pendente',
  pago: 'Pago',
  inativo: 'Inativo',
} as const;

const createDefaultPaymentForm = (): ExpensePaymentFormState => ({
  expenseId: '',
  expenseName: '',
  amount: 0,
  paidDate: new Date().toISOString().slice(0, 10),
  paymentMethod: 'dinheiro',
  notes: '',
});

export default function Expenses() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filterType, setFilterType] = useState<'all' | ExpenseType>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | ExpenseStatus>('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<ExpenseFormState>(defaultForm());
  const [paymentMethods, setPaymentMethods] = useState<CompanyPaymentMethodConfig[]>(
    getActiveCompanyPaymentMethods(defaultCompanyPaymentMethods),
  );
  const [paymentForm, setPaymentForm] = useState<ExpensePaymentFormState>(createDefaultPaymentForm());

  const getDueBadgeClassName = (status: ExpenseDueStatus) => {
    if (status === 'pago') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (status === 'vencendo') return 'border-amber-200 bg-amber-50 text-amber-700';
    if (status === 'vencida') return 'border-red-200 bg-red-50 text-red-700';
    return 'border-border bg-muted text-muted-foreground';
  };

  const getDisplayStatusBadgeClassName = (
    displayStatus: keyof typeof displayStatusLabels,
    dueStatus: ExpenseDueStatus,
  ) => {
    if (displayStatus === 'pago') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (displayStatus === 'inativo') return 'border-border bg-muted text-muted-foreground';
    if (dueStatus === 'vencida') return 'border-red-200 bg-red-50 text-red-700';
    return 'border-amber-200 bg-amber-50 text-amber-700';
  };

  const resolvePaidAtIso = (value: string) => {
    const raw = value?.trim();
    if (!raw) return new Date().toISOString();
    const parsed = new Date(`${raw}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  };

  const loadExpenses = async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setExpenses((data ?? []) as Expense[]);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar despesas',
        description: error?.message || 'Não foi possível carregar as despesas.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadExpenses();
  }, [profile?.company_id]);

  useEffect(() => {
    let active = true;

    const loadPaymentMethods = async () => {
      try {
        const result = await fetchCompanyPaymentMethods({
          companyId: profile?.company_id,
          activeOnly: true,
        });

        if (!active) return;
        setPaymentMethods(
          result.length > 0
            ? result
            : getActiveCompanyPaymentMethods(defaultCompanyPaymentMethods),
        );
      } catch (error) {
        console.error(error);
        if (!active) return;
        setPaymentMethods(getActiveCompanyPaymentMethods(defaultCompanyPaymentMethods));
      }
    };

    void loadPaymentMethods();

    return () => {
      active = false;
    };
  }, [profile?.company_id]);

  const filteredExpenses = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return expenses.filter((expense) => {
      if (filterType !== 'all' && expense.expense_type !== filterType) return false;
      if (filterStatus !== 'all') {
        const displayStatus = getExpenseDisplayStatus(expense);
        if (filterStatus === 'inativo') {
          if (displayStatus !== 'inativo') return false;
        } else if (displayStatus !== filterStatus) {
          return false;
        }
      }
      if (!normalizedSearch) return true;

      return [expense.name, expense.category || '', expense.description || '']
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [expenses, filterStatus, filterType, search]);

  const recurringMonthlyTotal = useMemo(
    () =>
      expenses
        .filter((expense) => expense.expense_type === 'recorrente' && expense.status === 'ativo')
        .reduce((total, expense) => total + Number(expense.monthly_amount || 0), 0),
    [expenses],
  );

  const variableMonthTotal = useMemo(() => {
    const now = new Date();
    return expenses
      .filter((expense) => {
        if (expense.expense_type !== 'nao_recorrente') return false;
        if (!expense.expense_date) return false;
        const expenseDate = new Date(`${expense.expense_date}T00:00:00`);
        return (
          expenseDate.getFullYear() === now.getFullYear() &&
          expenseDate.getMonth() === now.getMonth()
        );
      })
      .reduce((total, expense) => total + Number(expense.amount || 0), 0);
  }, [expenses]);

  const appliedCostCount = useMemo(
    () => expenses.filter((expense) => expense.apply_to_product_cost).length,
    [expenses],
  );

  const alertSummary = useMemo(() => buildExpenseAlertSummary(expenses), [expenses]);

  const resetForm = () => setForm(defaultForm());
  const resetPaymentForm = () => setPaymentForm(createDefaultPaymentForm());

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (expense: Expense) => {
    setForm({
      id: expense.id,
      expense_type: expense.expense_type,
      name: expense.name,
      category: expense.category || '',
      monthly_amount: Number(expense.monthly_amount || 0),
      amount: Number(expense.amount || 0),
      expense_date: expense.expense_date || new Date().toISOString().slice(0, 10),
      due_date: expense.due_date || expense.expense_date || new Date().toISOString().slice(0, 10),
      due_day: Number(expense.due_day || 10),
      description: expense.description || '',
      status: expense.status,
      apply_to_product_cost: Boolean(expense.apply_to_product_cost),
      allocation_method: expense.allocation_method || 'percentual_custo',
    });
    setDialogOpen(true);
  };

  const openPayDialog = (expense: Expense) => {
    const fallbackMethod = paymentMethods[0]?.type || 'dinheiro';
    setPaymentForm({
      expenseId: expense.id,
      expenseName: expense.name,
      amount: Number(getExpenseAmount(expense) || 0),
      paidDate: new Date().toISOString().slice(0, 10),
      paymentMethod: fallbackMethod,
      notes: '',
    });
    setPayDialogOpen(true);
  };

  const saveExpense = async () => {
    if (!profile?.company_id) return;
    if (!form.name.trim()) {
      toast({ title: 'Informe o nome da despesa', variant: 'destructive' });
      return;
    }

    if (form.expense_type === 'recorrente' && form.monthly_amount <= 0) {
      toast({ title: 'Informe o valor mensal da despesa recorrente', variant: 'destructive' });
      return;
    }

    if (form.expense_type === 'recorrente' && (form.due_day < 1 || form.due_day > 31)) {
      toast({ title: 'Informe um dia de vencimento entre 1 e 31', variant: 'destructive' });
      return;
    }

    if (form.expense_type === 'nao_recorrente' && (form.amount <= 0 || !form.expense_date)) {
      toast({ title: 'Informe o valor e a data da despesa não recorrente', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        company_id: profile.company_id,
        expense_type: form.expense_type,
        name: form.name.trim(),
        category: form.category.trim() || null,
        monthly_amount: form.expense_type === 'recorrente' ? form.monthly_amount : null,
        amount: form.expense_type === 'nao_recorrente' ? form.amount : null,
        expense_date: form.expense_type === 'nao_recorrente' ? form.expense_date : null,
        due_date: form.expense_type === 'nao_recorrente' ? form.due_date || form.expense_date : null,
        due_day: form.expense_type === 'recorrente' ? form.due_day : null,
        description: form.description.trim() || null,
        status: form.status,
        apply_to_product_cost: form.expense_type === 'recorrente' ? form.apply_to_product_cost : false,
        allocation_method: form.expense_type === 'recorrente' ? form.allocation_method : 'percentual_custo',
      };

      if (form.id) {
        const { error } = await supabase.from('expenses').update(payload).eq('id', form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('expenses').insert(payload);
        if (error) throw error;
      }

      toast({ title: form.id ? 'Despesa atualizada' : 'Despesa criada com sucesso' });
      setDialogOpen(false);
      resetForm();
      await loadExpenses();
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar despesa',
        description: error?.message || 'Não foi possível salvar a despesa.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const removeExpense = async (expenseId: string) => {
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
      if (error) throw error;
      toast({ title: 'Despesa removida' });
      await loadExpenses();
    } catch (error: any) {
      toast({
        title: 'Erro ao remover despesa',
        description: error?.message || 'Não foi possível remover a despesa.',
        variant: 'destructive',
      });
    }
  };

  const payExpense = async () => {
    if (!paymentForm.expenseId) return;
    if (paymentForm.amount <= 0) {
      toast({ title: 'Informe um valor pago maior que zero', variant: 'destructive' });
      return;
    }
    if (!paymentForm.paymentMethod) {
      toast({ title: 'Selecione a forma de pagamento', variant: 'destructive' });
      return;
    }

    setPaying(true);
    try {
      const { error } = await supabase.rpc('pay_expense', {
        p_expense_id: paymentForm.expenseId,
        p_paid_amount: Number(paymentForm.amount || 0),
        p_paid_at: resolvePaidAtIso(paymentForm.paidDate),
        p_payment_method: paymentForm.paymentMethod,
        p_payment_notes: paymentForm.notes.trim() || null,
      });

      if (error) throw error;

      toast({ title: 'Despesa paga com sucesso' });
      setPayDialogOpen(false);
      resetPaymentForm();
      await loadExpenses();
    } catch (error: any) {
      toast({
        title: 'Erro ao pagar despesa',
        description: error?.message || 'Não foi possível registrar o pagamento da despesa.',
        variant: 'destructive',
      });
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="page-container space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Despesas</h1>
          <p className="text-muted-foreground">
            Gerencie despesas recorrentes, variáveis, vencimentos e rateio no custo dos produtos.
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Nova despesa
        </Button>
      </div>

      {alertSummary.total > 0 && (
        <Card className="border-amber-300 bg-amber-50/80">
          <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-semibold">Alertas financeiros ativos</span>
              </div>
              <p className="text-sm text-amber-800">
                {alertSummary.dueSoon > 0 ? `${alertSummary.dueSoon} conta(s) vencendo nos próximos 5 dias.` : ''}
                {alertSummary.dueSoon > 0 && alertSummary.overdue > 0 ? ' ' : ''}
                {alertSummary.overdue > 0 ? `${alertSummary.overdue} conta(s) estão vencidas.` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="border-amber-200 bg-white text-amber-700 hover:bg-white">
                Vencendo: {alertSummary.dueSoon}
              </Badge>
              <Badge className="border-red-200 bg-white text-red-700 hover:bg-white">
                Vencidas: {alertSummary.overdue}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Repeat className="h-4 w-4" />
              Recorrentes ativas
            </CardTitle>
            <CardDescription>Total mensal das despesas fixas ativas.</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{currency(recurringMonthlyTotal)}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" />
              Variáveis no mês
            </CardTitle>
            <CardDescription>Total lançado no mês atual.</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{currency(variableMonthTotal)}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aplicadas no custo</CardTitle>
            <CardDescription>Despesas recorrentes marcadas para cálculo de produto.</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{appliedCostCount}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock3 className="h-4 w-4" />
              Vencendo
            </CardTitle>
            <CardDescription>Contas que vencem em até 5 dias.</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-amber-600">{alertSummary.dueSoon}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4" />
              Vencidas
            </CardTitle>
            <CardDescription>Contas já fora do prazo.</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-red-600">{alertSummary.overdue}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_220px_220px]">
          <Input
            placeholder="Buscar por nome, categoria ou descrição"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select value={filterType} onValueChange={(value) => setFilterType(value as 'all' | ExpenseType)}>
            <SelectTrigger>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="recorrente">Recorrente</SelectItem>
              <SelectItem value="nao_recorrente">Não recorrente</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as 'all' | ExpenseStatus)}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista de despesas</CardTitle>
          <CardDescription>{filteredExpenses.length} registro(s) encontrado(s).</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando despesas...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Alerta</TableHead>
                  <TableHead>Rateio</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      Nenhuma despesa cadastrada ainda.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredExpenses.map((expense) => {
                    const dueStatus = getExpenseDueStatus(expense);
                    const dueDate = resolveExpenseDueDate(expense);
                    const displayStatus = getExpenseDisplayStatus(expense);
                    const canPay = expense.status !== 'inativo' && displayStatus !== 'pago';

                    return (
                      <TableRow key={expense.id}>
                        <TableCell className="font-medium">{expense.name}</TableCell>
                        <TableCell>{typeLabels[expense.expense_type]}</TableCell>
                        <TableCell>{expense.category || '-'}</TableCell>
                        <TableCell>
                          {expense.expense_type === 'recorrente'
                            ? `${currency(getExpenseAmount(expense))}/mês`
                            : currency(getExpenseAmount(expense))}
                        </TableCell>
                        <TableCell>
                          <Badge className={getDisplayStatusBadgeClassName(displayStatus, dueStatus)}>
                            {displayStatusLabels[displayStatus]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {expense.expense_type === 'recorrente'
                            ? `Dia ${expense.due_day || '-'}`
                            : dueDate
                              ? dueDate.toLocaleDateString('pt-BR')
                              : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge className={getDueBadgeClassName(dueStatus)}>
                            {dueStatusLabels[dueStatus]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {expense.apply_to_product_cost
                            ? expense.allocation_method === 'quantidade_vendas'
                              ? 'Qtd. vendas'
                              : 'Percentual'
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {canPay && (
                              <Button size="sm" onClick={() => openPayDialog(expense)}>
                                Pagar
                              </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => openEditDialog(expense)}>
                              Editar
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => void removeExpense(expense.id)}>
                              Excluir
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar despesa' : 'Nova despesa'}</DialogTitle>
            <DialogDescription>
              Configure despesas fixas e variáveis, com vencimento e rateio no custo.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo da despesa</Label>
              <Select
                value={form.expense_type}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    expense_type: value as ExpenseType,
                    apply_to_product_cost: value === 'recorrente' ? prev.apply_to_product_cost : false,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recorrente">Recorrente (fixa)</SelectItem>
                  <SelectItem value="nao_recorrente">Não recorrente (variável)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as ExpenseStatus }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Input
                value={form.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                placeholder="Ex.: aluguel, energia, marketing"
              />
            </div>
          </div>

          {form.expense_type === 'recorrente' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Valor mensal (R$)</Label>
                <CurrencyInput
                  value={form.monthly_amount}
                  onChange={(value) => setForm((prev) => ({ ...prev, monthly_amount: value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Dia de vencimento</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={form.due_day}
                  onChange={(event) => setForm((prev) => ({ ...prev, due_day: Number(event.target.value || 1) }))}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3 md:col-span-2">
                <div>
                  <p className="text-sm font-medium">Participa do custo do produto</p>
                  <p className="text-xs text-muted-foreground">
                    Use para despesas fixas que devem entrar nas análises de precificação.
                  </p>
                </div>
                <Switch
                  checked={form.apply_to_product_cost}
                  onCheckedChange={(value) => setForm((prev) => ({ ...prev, apply_to_product_cost: value }))}
                />
              </div>

              {form.apply_to_product_cost && (
                <div className="space-y-2 md:col-span-2">
                  <Label>Método de rateio</Label>
                  <Select
                    value={form.allocation_method}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, allocation_method: value as ExpenseAllocationMethod }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentual_custo">Percentual aplicado ao custo</SelectItem>
                      <SelectItem value="quantidade_vendas">Por quantidade de vendas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <CurrencyInput
                  value={form.amount}
                  onChange={(value) => setForm((prev) => ({ ...prev, amount: value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Data de lançamento</Label>
                <Input
                  type="date"
                  value={form.expense_date}
                  onChange={(event) => setForm((prev) => ({ ...prev, expense_date: event.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Vencimento</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(event) => setForm((prev) => ({ ...prev, due_date: event.target.value }))}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Detalhes adicionais da despesa"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={saveExpense} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar despesa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={payDialogOpen}
        onOpenChange={(open) => {
          setPayDialogOpen(open);
          if (!open) resetPaymentForm();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pagar despesa</DialogTitle>
            <DialogDescription>
              Registre o pagamento e lance a saída automaticamente no fluxo de caixa.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-sm font-medium text-foreground">{paymentForm.expenseName || 'Despesa'}</p>
              <p className="text-xs text-muted-foreground">
                Valor sugerido: {currency(paymentForm.amount)}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Valor pago</Label>
                <CurrencyInput
                  value={paymentForm.amount}
                  onChange={(value) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      amount: value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Data do pagamento</Label>
                <Input
                  type="date"
                  value={paymentForm.paidDate}
                  onChange={(event) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      paidDate: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select
                value={paymentForm.paymentMethod}
                onValueChange={(value) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    paymentMethod: value as PaymentMethod,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((method) => (
                    <SelectItem key={method.type} value={method.type}>
                      {method.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Observação</Label>
              <Textarea
                rows={3}
                value={paymentForm.notes}
                onChange={(event) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    notes: event.target.value,
                  }))
                }
                placeholder="Detalhes do pagamento"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPayDialogOpen(false);
                resetPaymentForm();
              }}
              disabled={paying}
            >
              Cancelar
            </Button>
            <Button onClick={payExpense} disabled={paying}>
              {paying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
