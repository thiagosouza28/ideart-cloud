import { useEffect, useState } from 'react';
import { Search, Shield, UserPlus, Loader2, Mail, UserMinus, UserCheck, Users, LayoutGrid, KeyRound, Copy, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/services/edgeFunctions';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { AppRole } from '@/types/database';

interface UserWithRole {
  id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  role: AppRole | null;
  role_id: string | null;
  company_id: string | null;
  company_name: string | null;
}

type CompanyOption = {
  id: string;
  name: string;
};

const roleLabels: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  financeiro: 'Financeiro',
  atendente: 'Atendente',
  caixa: 'Caixa',
  producao: 'Produção',
};

const roleBadgeColors: Record<AppRole, string> = {
  super_admin: 'bg-slate-200 text-slate-700 border-slate-200',
  admin: 'bg-rose-100 text-rose-700 border-rose-200',
  financeiro: 'bg-violet-100 text-violet-700 border-violet-200',
  atendente: 'bg-blue-100 text-blue-700 border-blue-200',
  caixa: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  producao: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

export default function UserManagement() {
  const { user, profile, hasPermission, role } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);

  const isSuperAdmin = role === 'super_admin';
  const canCreateUsers = hasPermission(['admin', 'super_admin']);
  const assignableRoles: AppRole[] = isSuperAdmin
    ? ['super_admin', 'admin', 'financeiro', 'atendente', 'caixa', 'producao']
    : ['admin', 'financeiro', 'atendente', 'caixa', 'producao'];

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [newUserData, setNewUserData] = useState({
    email: '',
    fullName: '',
    password: '',
    role: '' as AppRole | '',
    companyId: '',
  });

  const [removeUserId, setRemoveUserId] = useState<string | null>(null);
  const [removeUserName, setRemoveUserName] = useState<string>('');
  const [removing, setRemoving] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordTargetUser, setPasswordTargetUser] = useState<UserWithRole | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);

  const [inactiveUsers, setInactiveUsers] = useState<UserWithRole[]>([]);
  const [showInactiveDialog, setShowInactiveDialog] = useState(false);
  const [loadingInactive, setLoadingInactive] = useState(false);
  const [reactivating, setReactivating] = useState<string | null>(null);

  const loadUsers = async () => {
    if (!profile?.company_id && !isSuperAdmin) {
      setLoading(false);
      return;
    }

    let query = supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, created_at, company_id, company:companies(name)');
    if (!isSuperAdmin) {
      query = query.eq('company_id', profile?.company_id as string);
    }

    const { data: profiles, error: profilesError } = await query.order('full_name');

    if (profilesError) {
      toast.error('Erro ao carregar usuários');
      setLoading(false);
      return;
    }

    const profileRows = (profiles || []) as Array<{
      id: string;
      full_name: string;
      email: string | null;
      avatar_url: string | null;
      created_at: string;
      company_id: string | null;
      company?: { name: string } | null;
    }>;

    const userIds = profileRows.map((p) => p.id);
    if (userIds.length === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }

    const { data: roles, error: rolesError } = await supabase
      .rpc('list_user_roles' as any, { p_user_ids: userIds });

    if (rolesError) {
      toast.error('Erro ao carregar perfis');
      setLoading(false);
      return;
    }

    const usersWithRoles: UserWithRole[] = profileRows.map((p) => {
      const userRole = (roles as Array<{ user_id: string; role: AppRole | null; role_id: string | null }> | null)?.find(
        (r) => r.user_id === p.id,
      );
      return {
        id: p.id,
        full_name: p.full_name,
        email: p.email ?? null,
        avatar_url: p.avatar_url,
        created_at: p.created_at,
        company_id: p.company_id,
        company_name: p.company?.name ?? null,
        role: (userRole?.role as AppRole) || null,
        role_id: userRole?.role_id || null,
      };
    });

    setUsers(usersWithRoles);
    setLoading(false);
  };

  const loadCompanies = async () => {
    if (!isSuperAdmin) return;
    const { data, error } = await supabase
      .from('companies')
      .select('id, name')
      .order('name');

    if (error) {
      console.error('Erro ao carregar empresas:', error);
      return;
    }
    setCompanies((data as CompanyOption[]) || []);
  };

  useEffect(() => {
    loadUsers();
    if (isSuperAdmin) {
      loadCompanies();
    }
  }, [profile?.company_id, isSuperAdmin]);

  const loadInactiveUsers = async () => {
    setLoadingInactive(true);

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, created_at, company_id')
      .is('company_id', null)
      .order('full_name');

    if (profilesError) {
      toast.error('Erro ao carregar usuários inativos');
      setLoadingInactive(false);
      return;
    }

    const profileRows = (profiles || []) as Array<{
      id: string;
      full_name: string;
      email: string | null;
      avatar_url: string | null;
      created_at: string;
      company_id: string | null;
    }>;

    const userIds = profileRows.map((p) => p.id);
    if (userIds.length === 0) {
      setInactiveUsers([]);
      setLoadingInactive(false);
      return;
    }

    const { data: roles } = await supabase
      .rpc('list_user_roles' as any, { p_user_ids: userIds });

    const usersWithRoles: UserWithRole[] = profileRows.map((p) => {
      const userRole = (roles as Array<{ user_id: string; role: AppRole | null; role_id: string | null }> | null)?.find(
        (r) => r.user_id === p.id,
      );
      return {
        id: p.id,
        full_name: p.full_name,
        email: p.email ?? null,
        avatar_url: p.avatar_url,
        created_at: p.created_at,
        company_id: p.company_id,
        company_name: null,
        role: (userRole?.role as AppRole) || null,
        role_id: userRole?.role_id || null,
      };
    });

    setInactiveUsers(usersWithRoles);
    setLoadingInactive(false);
  };

  const handleOpenInactiveDialog = () => {
    setShowInactiveDialog(true);
    loadInactiveUsers();
  };

  const handleReactivateUser = async (userId: string) => {
    if (!profile?.company_id && !isSuperAdmin) {
      toast.error('Você não está vinculado a uma empresa');
      return;
    }

    setReactivating(userId);

    try {
      const targetCompanyId = profile?.company_id;
      if (!targetCompanyId) {
        toast.error('Defina uma empresa para o usuário primeiro');
        setReactivating(null);
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ company_id: targetCompanyId })
        .eq('id', userId);

      if (error) throw error;

      toast.success('Usuário reativado com sucesso');
      await loadInactiveUsers();
      await loadUsers();
    } catch (error: any) {
      console.error('Reactivate user error:', error);
      toast.error('Erro ao reativar usuário');
    } finally {
      setReactivating(null);
    }
  };

  const filtered = users.filter((u) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;

    return (
      u.full_name.toLowerCase().includes(term) ||
      (u.email || '').toLowerCase().includes(term) ||
      (u.company_name || '').toLowerCase().includes(term) ||
      (u.role ? roleLabels[u.role].toLowerCase() : '').includes(term)
    );
  });

  const handleRoleChange = async (userId: string, _roleId: string | null, newRole: AppRole) => {
    if (userId === user.id) {
      toast.error('Você não pode alterar seu próprio perfil');
      return;
    }

    if (!isSuperAdmin && newRole === 'super_admin') {
      toast.error('Apenas super admin pode definir este cargo');
      return;
    }

    setUpdating(userId);

    const { error } = await supabase.rpc('set_user_role' as any, {
      p_target_user_id: userId,
      p_role: newRole,
    });

    if (error) {
      toast.error(error.message || 'Erro ao atualizar perfil');
      setUpdating(null);
      return;
    }

    toast.success('Perfil atualizado com sucesso');
    await loadUsers();
    setUpdating(null);
  };

  const handleAddUser = async () => {
    if (!canCreateUsers) {
      toast.error('Apenas administradores podem criar usuários');
      return;
    }

    if (!profile?.company_id && !isSuperAdmin) {
      toast.error('Empresa não encontrada para o usuário logado');
      return;
    }

    const normalizedEmail = newUserData.email.trim().toLowerCase();
    const normalizedFullName = newUserData.fullName.trim();
    const normalizedPassword = newUserData.password;

    if (!normalizedEmail || !normalizedFullName || !normalizedPassword) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (normalizedPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (!newUserData.role) {
      toast.error('Selecione o cargo do usuário');
      return;
    }

    if (!isSuperAdmin && newUserData.role === 'super_admin') {
      toast.error('Apenas super admin pode criar outro super admin');
      return;
    }

    setAddingUser(true);

    try {
      const targetCompanyId = isSuperAdmin ? newUserData.companyId : (profile?.company_id || null);

      const requiresCompany = newUserData.role !== 'super_admin';

      if (isSuperAdmin && requiresCompany && !targetCompanyId) {
        toast.error('Selecione uma empresa para o usuário');
        setAddingUser(false);
        return;
      }

      const response = await invokeEdgeFunction<{ created_now?: boolean }>('company-users', {
        email: normalizedEmail,
        password: normalizedPassword,
        full_name: normalizedFullName,
        role: newUserData.role,
        company_id: requiresCompany ? targetCompanyId : null,
      }, {
        resetAuthOn401: false,
      });
      toast.success(response?.created_now === false
        ? 'Usuário existente atualizado e vinculado com sucesso'
        : 'Usuário adicionado com sucesso');
      setAddDialogOpen(false);
      setNewUserData({ email: '', fullName: '', password: '', role: '', companyId: '' });
      await loadUsers();
    } catch (error: any) {
      console.error('Add user error:', error);
      const payloadMessage = error?.payload?.error;
      if (payloadMessage) {
        toast.error(payloadMessage);
      } else if (error.message?.includes('already registered')) {
        toast.error('Este e-mail já está cadastrado');
      } else {
        toast.error(error.message || 'Erro ao adicionar usuário');
      }
    } finally {
      setAddingUser(false);
    }
  };

  const handleRemoveUser = async () => {
    if (!removeUserId) return;

    setRemoving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ company_id: null })
        .eq('id', removeUserId);

      if (error) throw error;

      toast.success('Usuário removido da empresa');
      setRemoveUserId(null);
      setRemoveUserName('');
      await loadUsers();
    } catch (error: any) {
      console.error('Remove user error:', error);
      toast.error('Erro ao remover usuário');
    } finally {
      setRemoving(false);
    }
  };

  const generateTemporaryPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const values = new Uint32Array(10);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => chars[value % chars.length]).join('');
  };

  const handleOpenPasswordDialog = (targetUser: UserWithRole) => {
    setPasswordTargetUser(targetUser);
    setResetPasswordValue(generateTemporaryPassword());
    setShowResetPassword(true);
    setPasswordSaved(false);
    setPasswordDialogOpen(true);
  };

  const handleCopyPassword = async () => {
    if (!resetPasswordValue) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(resetPasswordValue);
      } else {
        const tempInput = document.createElement('textarea');
        tempInput.value = resetPasswordValue;
        tempInput.setAttribute('readonly', '');
        tempInput.style.position = 'fixed';
        tempInput.style.opacity = '0';
        tempInput.style.pointerEvents = 'none';
        document.body.appendChild(tempInput);
        tempInput.focus();
        tempInput.select();
        tempInput.setSelectionRange(0, tempInput.value.length);
        const copied = document.execCommand('copy');
        document.body.removeChild(tempInput);

        if (!copied) {
          throw new Error('copy_failed');
        }
      }
      toast.success('Senha copiada');
    } catch (error) {
      console.error('Copy password error:', error);
      toast.error('Não foi possível copiar a senha');
    }
  };

  const handleResetPassword = async () => {
    if (!passwordTargetUser) return;

    if (!resetPasswordValue || resetPasswordValue.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setSavingPassword(true);

    try {
      await invokeEdgeFunction<{ password_changed?: boolean }>('company-users', {
        action: 'reset_password',
        user_id: passwordTargetUser.id,
        password: resetPasswordValue,
      }, {
        resetAuthOn401: false,
      });

      setPasswordSaved(true);
      setShowResetPassword(true);
      toast.success('Nova senha definida com sucesso');
    } catch (error: any) {
      console.error('Reset password error:', error);
      toast.error(error?.payload?.error || error.message || 'Erro ao redefinir senha');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSendResetEmail = async () => {
    if (!passwordTargetUser) return;
    if (!passwordTargetUser.email) {
      toast.error('Este usuário não possui e-mail cadastrado');
      return;
    }

    setSendingResetEmail(true);

    try {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/alterar-senha`
          : '/alterar-senha';

      await invokeEdgeFunction<{ email_sent?: boolean; email?: string }>('company-users', {
        action: 'send_reset_email',
        user_id: passwordTargetUser.id,
        redirectTo,
      }, {
        resetAuthOn401: false,
      });

      toast.success(`Link de redefinição enviado para ${passwordTargetUser.email}`);
    } catch (error: any) {
      console.error('Send reset email error:', error);
      toast.error(error?.payload?.error || error.message || 'Não foi possível enviar o e-mail de redefinição');
    } finally {
      setSendingResetEmail(false);
    }
  };

  const handleClosePasswordDialog = (open: boolean) => {
    setPasswordDialogOpen(open);
    if (!open) {
      setPasswordTargetUser(null);
      setResetPasswordValue('');
      setShowResetPassword(false);
      setPasswordSaved(false);
      setSendingResetEmail(false);
    }
  };

  const openRemoveDialog = (userId: string, userName: string) => {
    setRemoveUserId(userId);
    setRemoveUserName(userName);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 text-slate-600">
          <LayoutGrid className="h-5 w-5" />
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Gestão de Usuários</h1>
            <p className="text-sm text-slate-500">
              {isSuperAdmin ? 'Gerencie todos os usuários do sistema' : 'Gerencie os usuários e permissões da sua empresa'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleOpenInactiveDialog}>
            <Users className="mr-2 h-4 w-4" />
            Usuários Inativos
          </Button>
          <Button
            onClick={() => setAddDialogOpen(true)}
            disabled={!canCreateUsers}
            title={!canCreateUsers ? 'Apenas administradores podem criar usuários' : undefined}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Adicionar Usuário
          </Button>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {isSuperAdmin ? 'Todos os Usuários' : 'Usuários da Empresa'}
              </CardTitle>
              <CardDescription>
                {users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome, e-mail ou loja..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Loja</TableHead>
                <TableHead>Cargo Atual</TableHead>
                <TableHead>Cadastrado em</TableHead>
                <TableHead className="w-[200px]">Alterar Cargo</TableHead>
                <TableHead className="w-[80px]">Ações</TableHead>
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
                    Nenhum usuário encontrado
                  </TableCell>
                </TableRow>
              ) : filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {getInitials(u.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{u.full_name}</p>
                        <p className="text-xs text-slate-500">{u.email || 'Sem e-mail cadastrado'}</p>
                        {u.id === user.id && (
                          <p className="text-xs text-slate-500">(você)</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {u.company_name || 'Sem loja'}
                  </TableCell>
                  <TableCell>
                    {u.role ? (
                      <Badge variant="outline" className={roleBadgeColors[u.role]}>
                        {roleLabels[u.role]}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-slate-100 text-slate-500">
                        Sem cargo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-500">
                    {formatDate(u.created_at)}
                  </TableCell>
                  <TableCell>
                    {u.id === user.id ? (
                      <span className="text-sm text-slate-500">-</span>
                    ) : (
                      <Select
                        value={u.role || ''}
                        onValueChange={(value) => handleRoleChange(u.id, u.role_id, value as AppRole)}
                        disabled={updating === u.id}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecionar cargo" />
                        </SelectTrigger>
                        <SelectContent>
                          {assignableRoles.map((roleOption) => (
                            <SelectItem key={roleOption} value={roleOption}>
                              {roleLabels[roleOption]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.id === user.id ? (
                      <span className="text-sm text-slate-500">-</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenPasswordDialog(u)}
                          title="Definir e visualizar nova senha"
                        >
                          <KeyRound className="h-4 w-4 text-primary" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openRemoveDialog(u.id, u.full_name)}
                          title="Remover da empresa"
                        >
                          <UserMinus className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Descrição dos Cargos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
              <Badge variant="outline" className={roleBadgeColors.admin}>Admin</Badge>
              <p className="text-sm text-slate-500">
                Acesso total ao sistema, incluindo gestão de usuários, configurações e todos os módulos.
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
              <Badge variant="outline" className={roleBadgeColors.atendente}>Atendente</Badge>
              <p className="text-sm text-slate-500">
                Gerencia pedidos, produtos, estoque e clientes. Não acessa PDV ou produção.
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
              <Badge variant="outline" className={roleBadgeColors.caixa}>Caixa</Badge>
              <p className="text-sm text-slate-500">
                Opera o PDV e visualiza pedidos. Não gerencia produtos ou configurações.
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
              <Badge variant="outline" className={roleBadgeColors.producao}>Produção</Badge>
              <p className="text-sm text-slate-500">
                Acessa o painel de produção e detalhes dos pedidos em andamento.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Adicionar Novo Usuário
            </DialogTitle>
            <DialogDescription>
              Cadastre um novo usuário para o sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome Completo *</Label>
              <Input
                id="fullName"
                placeholder="João da Silva"
                value={newUserData.fullName}
                onChange={(e) => setNewUserData({ ...newUserData, fullName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                E-mail *
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@email.com"
                value={newUserData.email}
                onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha *</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={newUserData.password}
                onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
              />
            </div>

            {isSuperAdmin && (
              <div className="space-y-2">
                <Label htmlFor="company">Empresa *</Label>
                <Select
                  value={newUserData.companyId}
                  onValueChange={(value) => setNewUserData({ ...newUserData, companyId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar empresa" />
                  </SelectTrigger>
                  <SelectContent>
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
              <Label htmlFor="role">Cargo</Label>
              <Select
                value={newUserData.role}
                onValueChange={(value) => setNewUserData({ ...newUserData, role: value as AppRole })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar cargo" />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((roleOption) => (
                    <SelectItem key={roleOption} value={roleOption}>
                      {roleLabels[roleOption]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddUser} disabled={addingUser}>
              {addingUser && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Adicionar Usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordDialogOpen} onOpenChange={handleClosePasswordDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Senha de acesso
            </DialogTitle>
            <DialogDescription>
              A senha atual do usuário não fica disponível para visualização. Defina uma nova senha para copiar ou envie um link de redefinição por e-mail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-900">{passwordTargetUser?.full_name || 'Usuário'}</p>
              <p className="text-slate-500">{passwordTargetUser?.email || 'Sem e-mail cadastrado'}</p>
              <p className="mt-1 text-slate-500">
                {isSuperAdmin ? (passwordTargetUser?.company_name || 'Sem loja') : (profile?.company_name || 'Sua loja')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reset-password">Nova senha</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="reset-password"
                    type={showResetPassword ? 'text' : 'password'}
                    value={resetPasswordValue}
                    onChange={(e) => {
                      setResetPasswordValue(e.target.value);
                      setPasswordSaved(false);
                    }}
                    placeholder="Defina uma nova senha"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                    onClick={() => setShowResetPassword((current) => !current)}
                  >
                    {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setResetPasswordValue(generateTemporaryPassword());
                    setShowResetPassword(true);
                    setPasswordSaved(false);
                  }}
                  title="Gerar outra senha"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Apenas administradores da própria loja podem redefinir a senha deste usuário.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-dashed border-slate-200 p-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">Senha visível para copiar</p>
                <p className="text-slate-500">
                  {passwordSaved ? 'Nova senha salva com sucesso.' : 'Você já pode copiar a senha exibida antes de salvar.'}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleCopyPassword}
                disabled={!resetPasswordValue}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copiar
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-dashed border-slate-200 p-3 text-sm">
              <div>
                <p className="font-medium text-slate-900">Resetar por e-mail</p>
                <p className="text-slate-500">
                  {passwordTargetUser?.email
                    ? `Envia um link de redefinição para ${passwordTargetUser.email}.`
                    : 'Cadastre um e-mail no usuário para liberar o envio.'}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleSendResetEmail}
                disabled={sendingResetEmail || !passwordTargetUser?.email}
              >
                {sendingResetEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                Enviar e-mail
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleClosePasswordDialog(false)}>
              Fechar
            </Button>
            <Button onClick={handleResetPassword} disabled={savingPassword || !passwordTargetUser}>
              {savingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar nova senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeUserId} onOpenChange={() => setRemoveUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover usuário da empresa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{removeUserName}</strong> da empresa?
              O usuário perderá acesso ao sistema, mas a conta continuará existindo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveUser}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showInactiveDialog} onOpenChange={setShowInactiveDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Usuários Inativos
            </DialogTitle>
            <DialogDescription>
              Usuários que foram removidos de uma empresa e podem ser reativados.
            </DialogDescription>
          </DialogHeader>

          {loadingInactive ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : inactiveUsers.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              Nenhum usuário inativo encontrado
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {inactiveUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-slate-100 text-slate-500 text-xs">
                        {getInitials(u.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{u.full_name}</p>
                        <p className="text-xs text-slate-500">{u.email || 'Sem e-mail cadastrado'}</p>
                      <p className="text-xs text-slate-500">
                        {u.role ? roleLabels[u.role] : 'Sem cargo'} - Criado em {formatDate(u.created_at)}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleReactivateUser(u.id)}
                    disabled={reactivating === u.id || (!profile?.company_id && !isSuperAdmin)}
                  >
                    {reactivating === u.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UserCheck className="mr-2 h-4 w-4" />
                    )}
                    Reativar
                  </Button>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInactiveDialog(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

