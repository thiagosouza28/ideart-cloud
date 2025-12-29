import { useEffect, useMemo, useState } from 'react';
import { Check, Crown, Loader2, Building2, ExternalLink, Copy, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plan, Company, Subscription } from '@/types/database';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { computeSubscriptionState } from '@/services/subscription';
import { invokeEdgeFunction } from '@/services/edgeFunctions';

export default function Subscription() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [latestSubscription, setLatestSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedPaymentLink, setCopiedPaymentLink] = useState(false);
  const subscriptionState = useMemo(() => computeSubscriptionState(company), [company]);

  useEffect(() => {
    // Check for optional success/cancel flags
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');

    if (success === 'true') {
      toast.success('Assinatura realizada com sucesso!');
      // Reload company data to get updated subscription
      loadData();
    } else if (canceled === 'true') {
      toast.info('Pagamento cancelado');
    }
  }, [searchParams]);

  useEffect(() => {
    loadData();
  }, [profile]);

  const loadData = async () => {
    // Load available plans
    const { data: plansData } = await supabase
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .order('price');

    setPlans(plansData as Plan[] || []);

    // Load user's company
    if (profile?.company_id) {
      const { data: companyData } = await supabase
        .from('companies')
        .select('*, plan:plans(*)')
        .eq('id', profile.company_id)
        .single();

      setCompany(companyData as Company);

      try {
        let subscriptionQuery = supabase
          .from('subscriptions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1);

        if (user?.id) {
          subscriptionQuery = subscriptionQuery.eq('user_id', user.id);
        } else {
          subscriptionQuery = subscriptionQuery.eq('company_id', profile.company_id);
        }

        const { data: subscriptionData } = await subscriptionQuery.maybeSingle();
        setLatestSubscription(subscriptionData as Subscription | null);
      } catch (error) {
        console.error('Erro ao buscar assinatura:', error);
        setLatestSubscription(null);
      }
    }

    setLoading(false);
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const handleSubscribe = async (planId: string) => {
    if (!company) {
      toast.error('Você precisa ter uma empresa cadastrada');
      return;
    }

    setSubscribing(planId);

    try {
      // Usar a nova função de assinatura do Cakto
      const data = await invokeEdgeFunction<{ checkout_url?: string; url?: string }>('create-subscription', { plan_id: planId });

      const redirectUrl = data?.checkout_url || data?.url;

      if (!redirectUrl) {
        console.error('Checkout error: missing url', { planId, data });
        toast.error('Erro ao iniciar checkout');
        return;
      }

      window.location.href = redirectUrl;
    } catch (error: any) {
      console.error('Checkout error', {
        planId,
        message: error?.message,
        status: error?.status,
        payload: error?.payload,
      });
      if (error?.status === 401 || /sessao invalida|sessao expirada/i.test(error?.message || '')) {
        toast.error('Sessao invalida. Faca login novamente.');
        navigate('/auth');
        return;
      }
      toast.error(error?.message || 'Erro ao iniciar checkout');
    } finally {
      setSubscribing(null);
    }
  };

  const catalogUrl = company?.slug ? `${window.location.origin}/catalogo/${company.slug}` : null;
  const paymentLinkUrl = latestSubscription?.payment_link_url || null;
  const isPendingPayment = latestSubscription?.status?.toLowerCase() === 'pending';

  const copyCatalogLink = () => {
    if (catalogUrl) {
      navigator.clipboard.writeText(catalogUrl);
      setCopied(true);
      toast.success('Link copiado!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyPaymentLink = () => {
    if (paymentLinkUrl) {
      navigator.clipboard.writeText(paymentLinkUrl);
      setCopiedPaymentLink(true);
      toast.success('Link copiado!');
      setTimeout(() => setCopiedPaymentLink(false), 2000);
    }
  };

  const getStatusBadge = () => {
    switch (subscriptionState.status) {
      case 'active':
        return <Badge className="bg-chart-2">Ativo</Badge>;
      case 'trial':
        return <Badge variant="secondary">Trial</Badge>;
      case 'expired':
        return <Badge variant="destructive">Plano expirado</Badge>;
      default:
        return <Badge variant="secondary">Sem plano ativo</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="page-container flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="page-container w-full max-w-none">
      <div className="page-header">
        <div>
          <h1 className="page-title">Assinatura e Catálogo</h1>
          <p className="text-muted-foreground mt-1">Gerencie seu plano e acesse seu catálogo público</p>
        </div>
      </div>

      {/* Company Info & Catalog Link */}
      {company && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {company.name}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
              {getStatusBadge()}
              {isPendingPayment && subscriptionState.status !== 'active' && (
                <Badge variant="outline">Pagamento pendente</Badge>
              )}
              {subscriptionState.status === 'active' && company.plan && (
                <>
                  <Badge variant="outline" className="gap-1">
                    <Crown className="h-3 w-3" />
                    {(company.plan as any).name}
                  </Badge>
                  {subscriptionState.expiresAt && (
                    <span className="text-sm">
                      Valido ate {subscriptionState.expiresAt.toLocaleDateString('pt-BR')}
                    </span>
                  )}
                  {subscriptionState.daysRemaining !== null && (
                    <span className="text-sm">
                      Restam {subscriptionState.daysRemaining} {subscriptionState.daysRemaining === 1 ? 'dia' : 'dias'}
                    </span>
                  )}
                </>
              )}
              {subscriptionState.status === 'trial' && (
                <span className="text-sm">
                  Teste {subscriptionState.daysRemaining !== null ? `- ${subscriptionState.daysRemaining} ${subscriptionState.daysRemaining === 1 ? 'dia' : 'dias'}` : 'ativo'}
                </span>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {paymentLinkUrl && (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Link de pagamento (Yampi):</p>
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <code className="flex-1 text-sm font-mono break-all">{paymentLinkUrl}</code>
                    <Button variant="ghost" size="icon" onClick={copyPaymentLink}>
                      {copiedPaymentLink ? <Check className="h-4 w-4 text-chart-2" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" asChild>
                      <a href={paymentLinkUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* Catalog Link */}
            {company.slug && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Link do seu Catálogo Público:</p>
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <code className="flex-1 text-sm font-mono break-all">{catalogUrl}</code>
                    <Button variant="ghost" size="icon" onClick={copyCatalogLink}>
                      {copied ? <Check className="h-4 w-4 text-chart-2" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" asChild>
                      <a href={catalogUrl || '#'} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Compartilhe este link com seus clientes para que vejam seus produtos
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Plans Grid */}
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Planos Disponíveis</h2>
        <p className="text-muted-foreground text-sm">Escolha o plano ideal para sua empresa</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const isSamePlan = company?.plan_id === plan.id;
          const isActivePlan = isSamePlan && subscriptionState.status === 'active';
          const isExpiredPlan = isSamePlan && subscriptionState.status === 'expired';
          const features = Array.isArray(plan.features) ? plan.features : [];

          return (
            <Card
              key={plan.id}
              className={`relative ${isActivePlan ? 'border-primary ring-2 ring-primary/20' : ''}`}
            >
              {isActivePlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary">Plano Atual</Badge>
                </div>
              )}
              {isExpiredPlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="destructive">Plano expirado</Badge>
                </div>
              )}

              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {plan.name}
                  {plan.name.toLowerCase().includes('pro') && (
                    <Crown className="h-5 w-5 text-yellow-500" />
                  )}
                </CardTitle>
                {plan.description && (
                  <CardDescription>{plan.description}</CardDescription>
                )}
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{formatCurrency(plan.price)}</span>
                  <span className="text-muted-foreground">/{plan.billing_period === 'monthly' ? 'mês' : 'ano'}</span>
                </div>

                {plan.max_users && (
                  <p className="text-sm text-muted-foreground">
                    Até {plan.max_users} usuário{plan.max_users > 1 ? 's' : ''}
                  </p>
                )}

                <Separator />

                <ul className="space-y-2">
                  {features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-chart-2 flex-shrink-0" />
                      <span>{String(feature)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full gap-2"
                  variant={isActivePlan ? 'outline' : 'default'}
                  disabled={isActivePlan || subscribing === plan.id}
                  onClick={() => handleSubscribe(plan.id)}
                >
                  {subscribing === plan.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processando...
                    </>
                  ) : isActivePlan ? (
                    'Plano Atual'
                  ) : isExpiredPlan ? (
                    'Renovar com Yampi'
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" />
                      Pagar com Yampi
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {plans.length === 0 && (
        <Card className="text-center py-12">
          <CardContent>
            <p className="text-muted-foreground">Nenhum plano disponível no momento.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

