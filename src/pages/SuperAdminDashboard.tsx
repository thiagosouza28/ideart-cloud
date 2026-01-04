import { useEffect, useState } from 'react';
import { Building2, CreditCard, LayoutGrid, TrendingUp, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import type { Company, SubscriptionStatus } from '@/types/database';

interface Stats {
  totalCompanies: number;
  activeCompanies: number;
  trialCompanies: number;
  totalPlans: number;
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

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    totalCompanies: 0,
    activeCompanies: 0,
    trialCompanies: 0,
    totalPlans: 0,
  });
  const [recentCompanies, setRecentCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [companiesResult, plansResult] = await Promise.all([
      supabase.from('companies').select('*').order('created_at', { ascending: false }),
      supabase.from('plans').select('*'),
    ]);

    const companies = (companiesResult.data || []) as Company[];
    const plans = plansResult.data || [];

    setStats({
      totalCompanies: companies.length,
      activeCompanies: companies.filter(c => c.subscription_status === 'active').length,
      trialCompanies: companies.filter(c => c.subscription_status === 'trial' || !c.subscription_status).length,
      totalPlans: plans.length,
    });

    setRecentCompanies(companies.slice(0, 5));
    setLoading(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="flex items-center justify-center h-64">
          <p className="text-slate-500">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 text-slate-600">
          <LayoutGrid className="h-5 w-5" />
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Painel Super Admin</h1>
            <p className="text-sm text-slate-500">Gerencie todas as empresas e planos do SaaS</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
            <CardTitle className="text-sm font-medium text-slate-500">Assinaturas Ativas</CardTitle>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-emerald-700">{stats.activeCompanies}</div>
            <p className="text-xs text-slate-500">pagando mensalmente</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Em Trial</CardTitle>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
              <AlertTriangle className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-blue-700">{stats.trialCompanies}</div>
            <p className="text-xs text-slate-500">periodo de avaliacao</p>
          </CardContent>
        </Card>

        <Card
          className="border-slate-200 cursor-pointer hover:shadow-sm transition-shadow"
          onClick={() => navigate('/super-admin/planos')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Planos</CardTitle>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
              <CreditCard className="h-4 w-4 text-slate-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">{stats.totalPlans}</div>
            <p className="text-xs text-slate-500">planos configurados</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Empresas Recentes</CardTitle>
          <CardDescription>Ultimas empresas cadastradas no sistema</CardDescription>
        </CardHeader>
        <CardContent>
          {recentCompanies.length === 0 ? (
            <p className="text-slate-500 text-center py-8">Nenhuma empresa cadastrada</p>
          ) : (
            <div className="space-y-4">
              {recentCompanies.map((company) => (
                <div
                  key={company.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => navigate('/super-admin/empresas')}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{company.name}</p>
                      <p className="text-sm text-slate-500">{company.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={statusColors[company.subscription_status as SubscriptionStatus || 'trial']}
                    >
                      {statusLabels[company.subscription_status as SubscriptionStatus || 'trial']}
                    </Badge>
                    <span className="text-sm text-slate-500">
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
  );
}
