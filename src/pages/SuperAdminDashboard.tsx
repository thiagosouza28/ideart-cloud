import { useEffect, useState } from 'react';
import { Building2, CreditCard, LayoutGrid, TrendingUp, AlertTriangle, Mail, FileCheck, Trash2, UserCircle, LogOut, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { Company, SubscriptionStatus } from '@/types/database';

interface Stats {
  totalCompanies: number;
  activeCompanies: number;
  trialCompanies: number;
  totalPlans: number;
  totalSalesVolume: number;
  totalOrderCount: number;
}

interface CompanyWithStats extends Company {
  totalSales: number;
  orderCount: number;
}

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
  expired: 'bg-slate-100 text-slate-600 border-slate-200',
  past_due: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  unpaid: 'bg-rose-100 text-rose-700 border-rose-200',
  incomplete: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    totalCompanies: 0,
    activeCompanies: 0,
    trialCompanies: 0,
    totalPlans: 0,
    totalSalesVolume: 0,
    totalOrderCount: 0,
  });
  const [topCompanies, setTopCompanies] = useState<CompanyWithStats[]>([]);
  const [recentCompanies, setRecentCompanies] = useState<Company[]>([]);
  const [contactMessages, setContactMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [companiesResult, plansResult, messagesResult, ordersResult, salesResult] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: false }),
      supabase.from('plans').select('*').eq('is_active', true),
      supabase.from('order_notifications').select('*').eq('type', 'contact_form').order('created_at', { ascending: false }).limit(5),
      supabase.from('orders').select('company_id, total').neq('status', 'cancelado'),
      supabase.from('sales').select('company_id, total'),
    ]);

    const companies = (companiesResult.data || []) as Company[];
    const plans = plansResult.data || [];
    const messages = messagesResult.data || [];
    const orders = ordersResult.data || [];
    const sales = salesResult.data || [];

    const totalSalesValue = [...orders, ...sales].reduce((sum, item) => sum + Number(item.total || 0), 0);

    const companiesWithStats = companies.map(c => {
      const cOrders = orders.filter(o => o.company_id === c.id);
      const cSales = sales.filter(s => s.company_id === c.id);
      return {
        ...c,
        totalSales: cOrders.reduce((sum, o) => sum + Number(o.total || 0), 0) + cSales.reduce((sum, s) => sum + Number(s.total || 0), 0),
        orderCount: cOrders.length + cSales.length,
      };
    });

    setStats({
      totalCompanies: companies.length,
      activeCompanies: companies.filter(c => c.subscription_status === 'active').length,
      trialCompanies: companies.filter(c => c.subscription_status === 'trial' || !c.subscription_status).length,
      totalPlans: plans.length,
      totalSalesVolume: totalSalesValue,
      totalOrderCount: orders.length + sales.length,
    });

    setTopCompanies(companiesWithStats.sort((a, b) => b.totalSales - a.totalSales).slice(0, 5));
    setRecentCompanies(companies.slice(0, 5));
    setContactMessages(messages);
    setLoading(false);
  };

  const asCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const markAsRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from('order_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      setContactMessages(prev => prev.map(m => m.id === id ? { ...m, read_at: new Date().toISOString() } : m));
      toast.success("Mensagem marcada como lida");
    } catch (error) {
      toast.error("Erro ao atualizar mensagem");
    }
  };

  const deleteMessage = async (id: string) => {
    if (!confirm("Deseja realmente excluir esta mensagem?")) return;
    try {
      const { error } = await supabase
        .from('order_notifications')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setContactMessages(prev => prev.filter(m => m.id !== id));
      toast.success("Mensagem excluída");
    } catch (error) {
      toast.error("Erro ao excluir mensagem");
    }
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-primary animate-pulse" />
            </div>
          </div>
          <div className="text-center">
            <h3 className="text-lg font-bold text-slate-900">Calculando métricas</h3>
            <p className="text-sm text-slate-500 animate-pulse">Consolidando dados das lojas...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 text-slate-600">
          <LayoutGrid className="h-5 w-5" />
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Painel Super Admin</h1>
            <p className="text-sm text-slate-500">Gerencie todas as empresas e planos do SaaS</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card
          className="border-slate-200 cursor-pointer hover:shadow-sm transition-shadow"
          onClick={() => navigate('/super-admin/empresas')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Empresas</CardTitle>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
              <Building2 className="h-4 w-4 text-slate-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">{stats.totalCompanies}</div>
            <p className="text-xs text-slate-500">empresas cadastradas</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-emerald-600">Volume Total Vendas</CardTitle>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-emerald-700">{asCurrency(stats.totalSalesVolume)}</div>
            <p className="text-xs text-slate-500">volume total transacionado</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">Total Pedidos</CardTitle>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
              <LayoutGrid className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-blue-700">{stats.totalOrderCount}</div>
            <p className="text-xs text-slate-500">pedidos e vendas PDV</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-slate-200 lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Top 5 Lojas (Vendas)
            </CardTitle>
            <CardDescription>Lojas com maior volume financeiro</CardDescription>
          </CardHeader>
          <CardContent>
            {topCompanies.length === 0 ? (
              <p className="text-slate-500 text-center py-8">Sem dados de vendas</p>
            ) : (
              <div className="space-y-4">
                {topCompanies.map((company, idx) => (
                  <div key={company.id} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-bold text-slate-400 w-4">#{idx + 1}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{company.name}</p>
                        <p className="text-[10px] text-slate-500">{company.orderCount} pedidos</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-emerald-600 shrink-0">
                      {asCurrency(company.totalSales)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Empresas Recentes</CardTitle>
            <CardDescription>Últimas empresas cadastradas no sistema</CardDescription>
          </CardHeader>
          <CardContent>
            {recentCompanies.length === 0 ? (
              <p className="text-slate-500 text-center py-8">Nenhuma empresa cadastrada</p>
            ) : (
              <div className="space-y-4">
                {recentCompanies.map((company) => (
                  <div
                    key={company.id}
                    className="grid grid-cols-12 items-center p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer transition-colors gap-4"
                    onClick={() => navigate('/super-admin/empresas')}
                  >
                    <div className="col-span-6 flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{company.name}</p>
                        <p className="text-sm text-slate-500 truncate">{company.slug}</p>
                      </div>
                    </div>
                    
                    <div className="col-span-3 flex justify-center">
                      <Badge
                        variant="outline"
                        className={`${statusColors[company.subscription_status as SubscriptionStatus || 'trial']} w-24 justify-center`}
                      >
                        {statusLabels[company.subscription_status as SubscriptionStatus || 'trial']}
                      </Badge>
                    </div>

                    <div className="col-span-3 text-right">
                      <span className="text-sm text-slate-500 whitespace-nowrap">
                        {formatDate(company.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Mensagens de Contato</CardTitle>
            <CardDescription>Mensagens recebidas via formulário do site</CardDescription>
          </CardHeader>
          <CardContent>
            {contactMessages.length === 0 ? (
              <p className="text-slate-500 text-center py-8">Nenhuma mensagem recebida</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {contactMessages.map((msg) => {
                  const data = JSON.parse(msg.body || '{}');
                  const isRead = !!msg.read_at;
                  return (
                    <div
                      key={msg.id}
                      className={`p-4 rounded-lg border border-slate-200 bg-white hover:border-primary/30 transition-all ${isRead ? 'opacity-60 grayscale-[0.5]' : 'border-l-4 border-l-primary shadow-sm'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 truncate max-w-[150px]">{data.name}</span>
                          {!isRead && <Badge className="bg-primary text-[10px] h-4">Nova</Badge>}
                        </div>
                        <span className="text-xs text-slate-400">{formatDate(msg.created_at)}</span>
                      </div>
                      <div className="text-sm text-slate-600 mb-1">
                        <span className="font-semibold">Assunto:</span> {data.subject}
                      </div>
                      <div className="text-sm text-slate-500 mb-3 whitespace-pre-wrap line-clamp-3">
                        {data.message}
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 truncate max-w-[120px]">{data.email}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-400 hover:text-blue-600"
                            asChild
                          >
                            <a href={`mailto:${data.email}?subject=Re: ${data.subject}`}>
                              <Mail className="h-4 w-4" />
                            </a>
                          </Button>
                          {!isRead && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-slate-400 hover:text-emerald-600"
                              onClick={() => markAsRead(msg.id)}
                            >
                              <FileCheck className="h-4 w-4" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-400 hover:text-rose-600"
                            onClick={() => deleteMessage(msg.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

