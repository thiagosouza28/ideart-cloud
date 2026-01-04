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
  LayoutGrid
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

interface CompanyWithPlan extends Company {
  plan?: Plan;
  user_count?: number;
}

interface CompanyUser {
  id: string;
  full_name: string;
  email: string | null;
  created_at: string | null;
}

const statusLabels: Record<string, string> = {
  trial: 'Trial',
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
  expired: 'bg-slate-100 text-slate-600 border-slate-200',
  past_due: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  unpaid: 'bg-rose-100 text-rose-700 border-rose-200',
  incomplete: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function SuperAdminCompanies() {
  const [companies, setCompanies] = useState<CompanyWithPlan[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [companiesResult, plansResult, profilesResult] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: false }),
      supabase.from('plans').select('*').eq('is_active', true),
      supabase.from('profiles').select('company_id'),
    ]);

    const plansData = (plansResult.data || []) as Plan[];
    setPlans(plansData);

    const profiles = profilesResult.data || [];
    const companiesData = (companiesResult.data || []).map((company: Company) => ({
      ...company,
      plan: plansData.find(p => p.id === company.plan_id),
      user_count: profiles.filter(p => p.company_id === company.id).length,
    }));

    setCompanies(companiesData);
    setLoading(false);
  };

  const filtered = companies.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.slug.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (c.subscription_status || 'trial') === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
      .update(updateData)
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
      );
      setCompanyUsers(response.users || []);
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao carregar usuarios');
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
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

      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Empresas Cadastradas
              </CardTitle>
              <CardDescription>
                {companies.length} empresa{companies.length !== 1 ? 's' : ''} no sistema
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                  <SelectItem value="expired">Expirado</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar empresas..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-[220px]"
                />
              </div>
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
                <TableHead>Usuários</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    Nenhuma empresa encontrada
                  </TableCell>
                </TableRow>
              ) : filtered.map((company) => (
                <TableRow key={company.id} className={!company.is_active ? 'opacity-60' : ''}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{company.name}</p>
                        <p className="text-sm text-slate-500">{company.slug}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {company.plan ? (
                      <div>
                        <p className="font-medium">{company.plan.name}</p>
                        <p className="text-sm text-slate-500">
                          {formatCurrency(company.plan.price)}/{company.plan.billing_period === 'monthly' ? 'mes' : 'ano'}
                        </p>
                      </div>
                    ) : (
                      <span className="text-slate-500">Sem plano</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={statusColors[(company.subscription_status as SubscriptionStatus) || 'trial']}
                    >
                      {statusLabels[(company.subscription_status as SubscriptionStatus) || 'trial']}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-slate-500">
                      <Users className="h-4 w-4" />
                      {company.user_count || 0}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-500">
                    {formatDate(company.created_at)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(company)}>
                          Editar assinatura
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openUsersDialog(company)}>
                          Usuários
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleCompanyStatus(company)}>
                          {company.is_active ? 'Desativar' : 'Ativar'}
                        </DropdownMenuItem>
                        {company.slug && (
                          <DropdownMenuItem onClick={() => window.open(`/catalogo/${company.slug}`, '_blank')}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Ver catalogo
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
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
                      {plan.name} - {formatCurrency(plan.price)}/{plan.billing_period === 'monthly' ? 'mes' : 'ano'}
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
                  <SelectItem value="trial">Trial</SelectItem>
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

      <Dialog open={usersDialogOpen} onOpenChange={setUsersDialogOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Usuários - {selectedCompanyUsers?.name}</DialogTitle>
            <DialogDescription>
              Gere um link de reset de senha para enviar ao usuario.
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
                  <TableHead className="text-right">Acoes</TableHead>
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
