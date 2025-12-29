import { useEffect, useState } from 'react';
import { Building2, Users, CreditCard, TrendingUp, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import type { Company, Plan, SubscriptionStatus } from '@/types/database';

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
  past_due: 'Pagamento Atrasado',
  unpaid: 'Não Pago',
  incomplete: 'Incompleto',
};

const statusColors: Record<string, string> = {
  trial: 'bg-chart-4/10 text-chart-4 border-chart-4/20',
  active: 'bg-chart-2/10 text-chart-2 border-chart-2/20',
  cancelled: 'bg-destructive/10 text-destructive border-destructive/20',
  canceled: 'bg-destructive/10 text-destructive border-destructive/20',
  expired: 'bg-muted text-muted-foreground border-muted',
  past_due: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  unpaid: 'bg-destructive/10 text-destructive border-destructive/20',
  incomplete: 'bg-muted text-muted-foreground border-muted',
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
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Painel Super Admin</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie todas as empresas e planos do SaaS
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card 
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate('/super-admin/empresas')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Empresas</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCompanies}</div>
            <p className="text-xs text-muted-foreground">empresas cadastradas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assinaturas Ativas</CardTitle>
            <TrendingUp className="h-4 w-4 text-chart-2" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-chart-2">{stats.activeCompanies}</div>
            <p className="text-xs text-muted-foreground">pagando mensalmente</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Trial</CardTitle>
            <AlertTriangle className="h-4 w-4 text-chart-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-chart-4">{stats.trialCompanies}</div>
            <p className="text-xs text-muted-foreground">período de avaliação</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate('/super-admin/planos')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Planos</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPlans}</div>
            <p className="text-xs text-muted-foreground">planos configurados</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Empresas Recentes</CardTitle>
          <CardDescription>Últimas empresas cadastradas no sistema</CardDescription>
        </CardHeader>
        <CardContent>
          {recentCompanies.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhuma empresa cadastrada</p>
          ) : (
            <div className="space-y-4">
              {recentCompanies.map((company) => (
                <div 
                  key={company.id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate('/super-admin/empresas')}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{company.name}</p>
                      <p className="text-sm text-muted-foreground">{company.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant="outline" 
                      className={statusColors[company.subscription_status as SubscriptionStatus || 'trial']}
                    >
                      {statusLabels[company.subscription_status as SubscriptionStatus || 'trial']}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
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
