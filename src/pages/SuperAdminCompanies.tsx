import { useEffect, useState } from 'react';
import {
  Building2,
  Search,
  MoreHorizontal,
  ExternalLink,
  Users,
  KeyRound,
  Copy,
  Loader2,
  Mail,
  LayoutGrid,
  CalendarPlus,
  ArrowUpDown,
  Phone,
  UserCircle,
  TrendingUp,
  AlertTriangle,
  Clock,
  LogOut
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/services/edgeFunctions';
import { toast } from 'sonner';
import type { Company, Plan, SubscriptionStatus } from '@/types/database';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface CompanyWithPlan extends Company {
  plan?: Plan;
  user_count?: number;
  owner_email?: string;
  total_sales?: number;
  order_count?: number;
  last_order_at?: string | null;
}

interface CompanyUser {
  id: string;
  full_name: string;
  email: string | null;
  created_at: string | null;
}

interface ImpersonateResponse {
  email: string;
  token: string;
  user_id: string;
  action_link?: string | null;
  token_hash?: string | null;
  verification_type?: string | null;
}

const normalizeSearchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const statusLabels: Record<string, string> = {
  trial: 'Teste',
  active: 'Ativo',
  cancelled: 'Cancelado',
  canceled: 'Cancelado',
  expired: 'Expirado',
  past_due: 'Pagamento atrasado',
  unpaid: 'Não pago',
  incomplete: 'Incompleto',
};

const statusColors: Record<string, string> = {
  trial: 'bg-blue-100 text-blue-700 border-blue-200',
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-100 text-rose-700 border-rose-200',
  canceled: 'bg-rose-100 text-rose-700 border-rose-200',
  expired: 'bg-rose-100 text-rose-700 border-rose-200',
  past_due: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  unpaid: 'bg-rose-100 text-rose-700 border-rose-200',
  incomplete: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function SuperAdminCompanies() {
  const navigate = useNavigate();
  const { startImpersonation, clearImpersonation, isImpersonating } = useAuth();
  const [companies, setCompanies] = useState<CompanyWithPlan[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [loading, setLoading] = useState(true);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyWithPlan | null>(null);
  const [formData, setFormData] = useState({
    plan_id: '',
    subscription_status: 'trial' as SubscriptionStatus,
  });
  const [usersDialogOpen, setUsersDialogOpen] = useState(false);
  const [selectedCompanyUsers, setSelectedCompanyUsers] = useState<CompanyWithPlan | null>(null);
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [resettingUser, setResettingUser] = useState<string | null>(null);
  const [sendingResetEmail, setSendingResetEmail] = useState<string | null>(null);
  const [resetLinks, setResetLinks] = useState<Record<string, string>>({});
  const [trialDialogOpen, setTrialDialogOpen] = useState(false);
  const [selectedTrialCompany, setSelectedTrialCompany] = useState<CompanyWithPlan | null>(null);
  const [trialDaysInput, setTrialDaysInput] = useState('3');
  const [addingTrialDays, setAddingTrialDays] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [companiesResult, plansResult, profilesResult, ordersResult, salesResult] = await Promise.all([
      supabase.from('companies').select('*, subscription_end_date, trial_ends_at').order('created_at', { ascending: false }),
      supabase.from('plans').select('*').eq('is_active', true),
      supabase.from('profiles').select('company_id'),
      supabase.from('orders').select('company_id, total, status, created_at').neq('status', 'cancelado'),
      supabase.from('sales').select('company_id, total, created_at'),
    ]);

    if (companiesResult.error) {
      toast.error('Erro ao carregar empresas');
      setLoading(false);
      return;
    }

    const plansData = (plansResult.data || []) as Plan[];
    setPlans(plansData);

    const profiles = (profilesResult.data as any[]) || [];
    const orders = (ordersResult.data as any[]) || [];
    const sales = (salesResult.data as any[]) || [];

    const companiesData = ((companiesResult.data as any[]) || []).map((company: any) => {
      const companyOrders = orders.filter(o => o.company_id === company.id);
      const companySales = sales.filter(s => s.company_id === company.id);
      
      const totalOrderSales = companyOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
      const totalPDVSales = companySales.reduce((sum, s) => sum + Number(s.total || 0), 0);
      
      const lastOrderDate = companyOrders.length > 0 
        ? companyOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at 
        : null;
      const lastSaleDate = companySales.length > 0
        ? companySales.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
        : null;

      const finalLastDate = (lastOrderDate && lastSaleDate)
        ? (new Date(lastOrderDate).getTime() > new Date(lastSaleDate).getTime() ? lastOrderDate : lastSaleDate)
        : (lastOrderDate || lastSaleDate || null);

      return {
        ...company,
        logo_url: ensurePublicStorageUrl('product-images', company.logo_url),
        plan: plansData.find(p => p.id === company.plan_id),
        user_count: profiles.filter(p => p.company_id === company.id).length,
        owner_email: company.email,
        total_sales: totalOrderSales + totalPDVSales,
        order_count: companyOrders.length + companySales.length,
        last_order_at: finalLastDate,
      };
    });

    setCompanies(companiesData);
    setLoading(false);
  };

  const getExpirationDate = (company: CompanyWithPlan) => {
    return company.trial_ends_at || company.subscription_end_date;
  };

  const getDaysRemainingValue = (company: CompanyWithPlan) => {
    if (company.plan?.billing_period === 'lifetime') return 999999;
    const endDate = getExpirationDate(company);
    if (!endDate) return 0;
    const now = new Date();
    const diff = new Date(endDate).getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const filtered = companies
    .filter(c => {
      const searchTerm = normalizeSearchText(search);
      const matchesSearch = !searchTerm ||
        normalizeSearchText(c.name).includes(searchTerm) ||
        normalizeSearchText(c.slug || '').includes(searchTerm);
      const matchesStatus = statusFilter === 'all' || (c.subscription_status || 'trial') === statusFilter;
      const matchesPlan = planFilter === 'all' || c.plan_id === planFilter;
      return matchesSearch && matchesStatus && matchesPlan;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'sales_value') return (b.total_sales || 0) - (a.total_sales || 0);
      if (sortBy === 'order_count') return (b.order_count || 0) - (a.order_count || 0);
      if (sortBy === 'last_activity') {
        const dateA = a.last_order_at ? new Date(a.last_order_at).getTime() : 0;
        const dateB = b.last_order_at ? new Date(b.last_order_at).getTime() : 0;
        return dateB - dateA;
      }
      if (sortBy === 'expiration') {
        const dateA = getExpirationDate(a);
        const dateB = getExpirationDate(b);
        if (!dateA) return 1;
        if (!dateB) return -1;
        return new Date(dateA).getTime() - new Date(dateB).getTime();
      }
      return 0;
    });

  const stats = {
    total: companies.length,
    active: companies.filter(c => c.subscription_status === 'active').length,
    trial: companies.filter(c => c.subscription_status === 'trial' || !c.subscription_status).length,
    expired: companies.filter(c => {
      const days = getDaysRemainingValue(c);
      return days < 0;
    }).length,
  };

  const handleImpersonate = async (company: CompanyWithPlan) => {
    if (!company.owner_email) {
      toast.error('Não foi possível identificar o e-mail do proprietário.');
      return;
    }

    if (isImpersonating) {
      toast.error('Finalize a sessão atual antes de entrar em outra conta.');
      return;
    }

    setImpersonatingId(company.id);
    try {
      const response = await invokeEdgeFunction<ImpersonateResponse>('admin-impersonate', {
        email: company.owner_email,
        redirect_to: `${window.location.origin}/dashboard`,
      }, {
        resetAuthOn401: false,
      });

      await startImpersonation();
      
      const { data, error } = await supabase.auth.verifyOtp({
        type: (response.verification_type as any) || 'magiclink',
        token_hash: response.token_hash!,
      });

      if (error || !data.session) {
        throw error || new Error('Falha ao autenticar como cliente.');
      }

      toast.success(`Entrando como ${company.name}...`);
      navigate('/dashboard', { replace: true });
    } catch (error: any) {
      clearImpersonation();
      toast.error(error.message || 'Erro ao acessar a conta do cliente.');
    } finally {
      setImpersonatingId(null);
    }
  };

  const openEditDialog = (company: CompanyWithPlan) => {
    setSelectedCompany(company);
    setFormData({
      plan_id: company.plan_id || '',
      subscription_status: (company.subscription_status as SubscriptionStatus) || 'trial',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selectedCompany) return;

    const updateData: Partial<Company> = {
      plan_id: formData.plan_id || null,
      subscription_status: formData.subscription_status,
    };

    if (formData.subscription_status === 'active' && !selectedCompany.subscription_start_date) {
      updateData.subscription_start_date = new Date().toISOString();
    }

    const { error } = await supabase
      .from('companies')
      .update(updateData as any)
      .eq('id', selectedCompany.id);

    if (error) {
      toast.error('Erro ao atualizar empresa');
      return;
    }

    toast.success('Empresa atualizada com sucesso');
    setDialogOpen(false);
    loadData();
  };

  const toggleCompanyStatus = async (company: CompanyWithPlan) => {
    const { error } = await supabase
      .from('companies')
      .update({ is_active: !company.is_active })
      .eq('id', company.id);

    if (error) {
      toast.error('Erro ao alterar status');
      return;
    }

    toast.success(company.is_active ? 'Empresa desativada' : 'Empresa ativada');
    loadData();
  };

  const loadCompanyUsers = async (companyId: string) => {
    setLoadingUsers(true);
    try {
      const response = await invokeEdgeFunction<{ users: CompanyUser[] }>(
        'super-admin-users',
        { action: 'list', companyId },
        { resetAuthOn401: false },
      );
      setCompanyUsers(response.users || []);
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao carregar usuários');
    } finally {
      setLoadingUsers(false);
    }
  };

  const openUsersDialog = async (company: CompanyWithPlan) => {
    setSelectedCompanyUsers(company);
    setCompanyUsers([]);
    setResetLinks({});
    setUsersDialogOpen(true);
    await loadCompanyUsers(company.id);
  };

  const handleResetPassword = async (userId: string) => {
    if (!selectedCompanyUsers) return;
    setResettingUser(userId);
    try {
      const response = await invokeEdgeFunction<{ link: string }>(
        'super-admin-users',
        { action: 'reset', companyId: selectedCompanyUsers.id, userId },
        { resetAuthOn401: false },
      );
      if (response.link) {
        setResetLinks((prev) => ({ ...prev, [userId]: response.link }));
        try {
          await navigator.clipboard.writeText(response.link);
          toast.success('Link de reset copiado');
        } catch {
          toast.success('Link de reset gerado');
        }
      }
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao gerar reset de senha');
    } finally {
      setResettingUser(null);
    }
  };

  const handleSendResetEmail = async (userId: string) => {
    if (!selectedCompanyUsers) return;
    setSendingResetEmail(userId);
    try {
      await invokeEdgeFunction('super-admin-users', {
        action: 'reset_email',
        companyId: selectedCompanyUsers.id,
        userId,
      }, {
        resetAuthOn401: false,
      });
      toast.success('E-mail de reset enviado');
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao enviar e-mail de reset');
    } finally {
      setSendingResetEmail(null);
    }
  };

  const handleCopyResetLink = async (userId: string) => {
    const link = resetLinks[userId];
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado');
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  const parseDate = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const openTrialDialog = (company: CompanyWithPlan) => {
    setSelectedTrialCompany(company);
    setTrialDaysInput('3');
    setTrialDialogOpen(true);
  };

  const handleAddTrialDays = async () => {
    if (!selectedTrialCompany) return;

    const days = Number.parseInt(trialDaysInput, 10);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      toast.error('Informe entre 1 e 365 dias');
      return;
    }

    setAddingTrialDays(true);
    try {
      const now = new Date();
      const trialEndDate = parseDate(selectedTrialCompany.trial_ends_at);
      const trialSubscriptionEnd = (selectedTrialCompany.subscription_status || '').toLowerCase() === 'trial'
        ? parseDate(selectedTrialCompany.subscription_end_date)
        : null;
      const currentEnd = trialEndDate || trialSubscriptionEnd;
      const baseDate = currentEnd && currentEnd.getTime() > now.getTime()
        ? currentEnd
        : now;

      const nextEndDate = new Date(baseDate);
      nextEndDate.setDate(nextEndDate.getDate() + days);
      const nextEndIso = nextEndDate.toISOString();

      const { error } = await supabase
        .from('companies')
        .update({
          subscription_status: 'trial',
          trial_active: true,
          trial_ends_at: nextEndIso,
          subscription_start_date: selectedTrialCompany.subscription_start_date || now.toISOString(),
          subscription_end_date: nextEndIso,
        })
        .eq('id', selectedTrialCompany.id);

      if (error) {
        toast.error(error.message || 'Erro ao adicionar dias de teste');
        return;
      }

      toast.success(`Teste atualizado por ${days} dia${days === 1 ? '' : 's'}`);
      setTrialDialogOpen(false);
      setSelectedTrialCompany(null);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao adicionar dias de teste');
    } finally {
      setAddingTrialDays(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const getRemainingDays = (company: CompanyWithPlan) => {
    if (company.plan?.billing_period === 'lifetime') {
      return <span className="text-green-600">Vitalício</span>;
    }

    const endDate = company.trial_ends_at
      ? new Date(company.trial_ends_at)
      : company.subscription_end_date
        ? new Date(company.subscription_end_date)
        : null;

    if (!endDate) {
      return '-';
    }

    const now = new Date();
    const diff = endDate.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) {
      return <span className="text-red-600">Expirado</span>;
    }

    return `${days} dia(s)`;
  };

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 text-slate-600">
          <LayoutGrid className="h-5 w-5" />
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Empresas SaaS</h1>
            <p className="text-sm text-slate-500">Gerencie todas as empresas cadastradas no sistema</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
              <Building2 className="h-4 w-4 text-slate-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-emerald-600">Ativas</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">{stats.active}</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">Em Teste</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
              <AlertTriangle className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{stats.trial}</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-rose-600">Expiradas</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50">
              <Clock className="h-4 w-4 text-rose-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-700">{stats.expired}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Empresas Cadastradas
                </CardTitle>
                <CardDescription>
                  Gerenciamento completo das lojas cadastradas
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-[450px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Nome ou slug da empresa..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Status</SelectItem>
                  <SelectItem value="trial">Teste</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="expired">Expirado</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>

              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Plano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Planos</SelectItem>
                  {plans.map(plan => (
                    <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Mais recentes</SelectItem>
                  <SelectItem value="oldest">Mais antigas</SelectItem>
                  <SelectItem value="name">Nome (A-Z)</SelectItem>
                  <SelectItem value="expiration">Data de Expiração</SelectItem>
                  <SelectItem value="sales_value">Maior Volume Vendas</SelectItem>
                  <SelectItem value="order_count">Mais Pedidos</SelectItem>
                  <SelectItem value="last_activity">Última Atividade</SelectItem>
                </SelectContent>
              </Select>

              {isImpersonating && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-xs text-rose-600 border-rose-200 bg-rose-50"
                  onClick={() => {
                    clearImpersonation();
                    window.location.reload();
                  }}
                >
                  <LogOut className="h-3 w-3 mr-1" />
                  Sair do Cliente
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Vendas/Pedidos</TableHead>
                <TableHead>Dias Restantes</TableHead>
                <TableHead>Última Venda</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-20">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="relative">
                        <div className="h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Loader2 className="h-5 w-5 text-primary/40 animate-pulse" />
                        </div>
                      </div>
                      <p className="text-sm font-medium text-muted-foreground animate-pulse">Buscando empresas...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    Nenhuma empresa encontrada
                  </TableCell>
                </TableRow>
              ) : filtered.map((company) => {
                const daysRemaining = getDaysRemainingValue(company);
                const isNearExpiration = daysRemaining >= 0 && daysRemaining <= 7 && company.plan?.billing_period !== 'lifetime';
                const isExpired = daysRemaining < 0;

                return (
                  <TableRow key={company.id} className={!company.is_active ? 'opacity-60' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {company.logo_url ? (
                          <img
                            src={company.logo_url}
                            alt={company.name}
                            className="h-10 w-10 rounded-lg object-cover border border-slate-100"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200">
                            <Building2 className="h-5 w-5 text-slate-400" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-900 line-clamp-1">{company.name}</p>
                            <Badge variant="secondary" className="text-[9px] h-4 px-1 py-0 font-normal">
                              <Users className="h-2 w-2 mr-0.5" />
                              {company.user_count || 0}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-slate-500">{company.slug}</p>
                            {company.phone && (
                              <a 
                                href={`https://wa.me/55${company.phone.replace(/\D/g, '')}`} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-emerald-500 hover:text-emerald-600"
                              >
                                <Phone className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {company.plan ? (
                        <div>
                          <p className="text-sm font-medium text-slate-700">{company.plan.name}</p>
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                            {company.plan.billing_period === 'monthly' ? 'Mensal' : 
                             company.plan.billing_period === 'quarterly' ? 'Trimestral' : 
                             company.plan.billing_period === 'lifetime' ? 'Vitalício' : 'Anual'}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Sem plano</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`${statusColors[(company.subscription_status as SubscriptionStatus) || 'trial']} text-[10px] py-0 px-2 h-5`}
                      >
                        {statusLabels[(company.subscription_status as SubscriptionStatus) || 'trial']}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-bold text-emerald-600">
                          {formatCurrency(company.total_sales || 0)}
                        </p>
                        <p className="text-[10px] text-slate-500 flex items-center gap-1">
                          <LayoutGrid className="h-2.5 w-2.5" />
                          {company.order_count || 0} pedidos
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-medium ${
                          isExpired ? 'text-rose-600' : 
                          isNearExpiration ? 'text-amber-600' : 
                          'text-slate-700'
                        }`}>
                          {company.plan?.billing_period === 'lifetime' ? 'Vitalício' : 
                           isExpired ? 'Expirado' : `${daysRemaining} dia(s)`}
                        </span>
                        {isNearExpiration && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                        {isExpired && <Clock className="h-3.5 w-3.5 text-rose-500" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                      {company.last_order_at ? formatDate(company.last_order_at) : 'Nunca'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-primary hover:bg-primary/5"
                          title="Entrar na conta"
                          onClick={() => handleImpersonate(company)}
                          disabled={impersonatingId === company.id}
                        >
                          {impersonatingId === company.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserCircle className="h-4 w-4" />
                          )}
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(company)}>
                              <CalendarPlus className="h-4 w-4 mr-2" />
                              Editar assinatura
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openUsersDialog(company)}>
                              <Users className="h-4 w-4 mr-2" />
                              Usuários
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openTrialDialog(company)}>
                              <CalendarPlus className="h-4 w-4 mr-2" />
                              Adicionar dias de teste
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleCompanyStatus(company)}>
                              <KeyRound className="h-4 w-4 mr-2" />
                              {company.is_active ? 'Desativar Empresa' : 'Ativar Empresa'}
                            </DropdownMenuItem>
                            {company.slug && (
                              <DropdownMenuItem onClick={() => window.open(`/catalogo/${company.slug}`, '_blank')}>
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Ver catálogo
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Editar assinatura - {selectedCompany?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Plano</Label>
              <Select
                value={formData.plan_id}
                onValueChange={(value) => setFormData({ ...formData, plan_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar plano" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} - {formatCurrency(plan.price)}/{
                        plan.billing_period === 'monthly' ? 'Mensal' : 
                        plan.billing_period === 'quarterly' ? 'Trimestral' : 
                        plan.billing_period === 'lifetime' ? 'Vitalício' : 'Anual'
                      }
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status da assinatura</Label>
              <Select
                value={formData.subscription_status}
                onValueChange={(value) => setFormData({ ...formData, subscription_status: value as SubscriptionStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Teste</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                  <SelectItem value="expired">Expirado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={trialDialogOpen} onOpenChange={setTrialDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Adicionar dias de teste</DialogTitle>
            <DialogDescription>
              Prorroga o período de teste da empresa selecionada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-900">{selectedTrialCompany?.name || '-'}</p>
              <p className="text-slate-500">
                Teste atual ate: {formatDate(selectedTrialCompany?.trial_ends_at || selectedTrialCompany?.subscription_end_date || null)}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="trial-days">Dias para adicionar</Label>
              <Input
                id="trial-days"
                type="number"
                min={1}
                max={365}
                value={trialDaysInput}
                onChange={(event) => setTrialDaysInput(event.target.value)}
                placeholder="Ex: 7"
              />
              <p className="text-xs text-slate-500">Valor permitido: de 1 a 365 dias.</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTrialDialogOpen(false)}
              disabled={addingTrialDays}
            >
              Cancelar
            </Button>
            <Button onClick={handleAddTrialDays} disabled={addingTrialDays}>
              {addingTrialDays ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CalendarPlus className="mr-2 h-4 w-4" />
              )}
              Adicionar dias
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={usersDialogOpen} onOpenChange={setUsersDialogOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Usuários - {selectedCompanyUsers?.name}</DialogTitle>
            <DialogDescription>
              Gere um link de reset de senha para enviar ao usuário.
            </DialogDescription>
          </DialogHeader>
          {loadingUsers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : companyUsers.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              Nenhum usuário encontrado para esta empresa.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companyUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.full_name}</TableCell>
                    <TableCell className="text-slate-500">
                      {user.email || '-'}
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSendResetEmail(user.id)}
                          disabled={!user.email || sendingResetEmail === user.id}
                          title={!user.email ? 'E-mail não encontrado para este usuário' : undefined}
                        >
                          {sendingResetEmail === user.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Mail className="mr-2 h-4 w-4" />
                          )}
                          Enviar e-mail
                        </Button>
                        {resetLinks[user.id] && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyResetLink(user.id)}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Copiar link
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => handleResetPassword(user.id)}
                          disabled={!user.email || resettingUser === user.id}
                          title={!user.email ? 'E-mail não encontrado para este usuário' : undefined}
                        >
                          {resettingUser === user.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <KeyRound className="mr-2 h-4 w-4" />
                          )}
                          Gerar link
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUsersDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

