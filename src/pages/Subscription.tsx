import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Crown,
  Loader2,
  Building2,
  ExternalLink,
  Copy,
  CreditCard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { computeSubscriptionState } from '@/services/subscription';
import { invokeEdgeFunction } from '@/services/edgeFunctions';
import { Plan, Company } from '@/types/database';

/* ======================================================
   TIPOS DE LEITURA (DTOs) — NÃO use tipos crus do banco
====================================================== */

type SubscriptionRow = {
  id: string;
  company_id: string | null;
  user_id: string | null;
  status: string;
  payment_link_url?: string | null;
  created_at: string;
  current_period_ends_at?: string | null;
};

type CompanyWithPlan = Company & {
  plan?: Plan | null;
};

export default function Subscription() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [company, setCompany] = useState<CompanyWithPlan | null>(null);
  const [latestSubscription, setLatestSubscription] =
    useState<SubscriptionRow | null>(null);

  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedPaymentLink, setCopiedPaymentLink] = useState(false);

  const subscriptionState = useMemo(
    () => computeSubscriptionState(company),
    [company]
  );

  /* ======================================================
     LOAD DATA
  ====================================================== */
  const loadData = useCallback(async () => {
    setLoading(true);

    /* ---------- PLANOS ---------- */
    const { data: plansData, error: plansError } = await supabase
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (plansError) {
      console.error(plansError);
      toast.error('Erro ao carregar planos');
    }

    setPlans((plansData as Plan[]) ?? []);

    /* ---------- EMPRESA ---------- */
    if (!profile?.company_id) {
      setCompany(null);
      setLatestSubscription(null);
      setLoading(false);
      return;
    }

    const { data: companyData, error: companyError } = await supabase
      .from('companies')
      .select('*, plan:plans(*)')
      .eq('id', profile.company_id)
      .single();

    if (companyError) {
      console.error(companyError);
      toast.error('Erro ao carregar empresa');
      setCompany(null);
    } else {
      setCompany(companyData as CompanyWithPlan);
    }

    /* ---------- ASSINATURA ---------- */
    try {
      let subscription: SubscriptionRow | null = null;

      if (user?.id) {
        const { data, error } = await supabase
          .from('subscriptions' as any)
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        subscription = data as unknown as SubscriptionRow | null;
      } else {
        const { data, error } = await supabase
          .from('subscriptions' as any)
          .select('*')
          .eq('company_id', profile.company_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        subscription = data as unknown as SubscriptionRow | null;
      }

      setLatestSubscription(subscription);
    } catch (err) {
      console.error('Erro ao buscar assinatura', err);
      setLatestSubscription(null);
    }

    setLoading(false);
  }, [profile?.company_id, user?.id]);

  /* ======================================================
     CALLBACK DO CHECKOUT
  ====================================================== */
  useEffect(() => {
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');

    if (success === 'true') {
      toast.success('Assinatura realizada com sucesso!');
      loadData();
    }

    if (canceled === 'true') {
      toast.info('Pagamento cancelado');
    }
  }, [searchParams, loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ======================================================
     HELPERS
  ====================================================== */
  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(v);

  const handleSubscribe = async (planId: string) => {
    if (!company) {
      toast.error('Você precisa ter uma empresa cadastrada');
      return;
    }

    setSubscribing(planId);

    try {
      const data = await invokeEdgeFunction<{
        checkout_url?: string;
        url?: string;
      }>('create-subscription', { plan_id: planId });

      const redirectUrl = data?.checkout_url ?? data?.url;

      if (!redirectUrl) {
        toast.error('Erro ao iniciar checkout');
        return;
      }

      window.location.href = redirectUrl;
    } catch (err: any) {
      console.error(err);

      if (
        err?.status === 401 ||
        /sess[aã]o inv[aá]lida|expirada/i.test(err?.message ?? '')
      ) {
        toast.error('Sessão inválida. Faça login novamente.');
        navigate('/auth');
        return;
      }

      toast.error(err?.message || 'Erro ao iniciar checkout');
    } finally {
      setSubscribing(null);
    }
  };

  const catalogUrl = company?.slug
    ? `${window.location.origin}/catalogo/${company.slug}`
    : '';

  const paymentLinkUrl = latestSubscription?.payment_link_url ?? '';

  const isPendingPayment = (latestSubscription?.status ?? '')
    .toLowerCase()
    .includes('pending');

  const copyText = async (
    text: string,
    setter: (v: boolean) => void
  ) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setter(true);
    toast.success('Link copiado!');
    setTimeout(() => setter(false), 2000);
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

  /* ======================================================
     RENDER
  ====================================================== */
  if (loading) {
    return (
      <div className="page-container flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="page-container w-full max-w-none">
      <div className="page-header">
        <div>
          <h1 className="page-title">Assinatura e Catálogo</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie seu plano e acesse seu catálogo público
          </p>
        </div>
      </div>

      {company && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {company.name}
            </CardTitle>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {getStatusBadge()}

              {isPendingPayment && subscriptionState.status !== 'active' && (
                <Badge variant="outline">Pagamento pendente</Badge>
              )}

              {subscriptionState.status === 'active' && company.plan && (
                <>
                  <Badge variant="outline" className="gap-1">
                    <Crown className="h-3 w-3" />
                    {company.plan.name}
                  </Badge>
                </>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {paymentLinkUrl && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Link de pagamento:</p>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <code className="flex-1 break-all text-sm font-mono">
                    {paymentLinkUrl}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyText(paymentLinkUrl, setCopiedPaymentLink)}
                  >
                    {copiedPaymentLink ? (
                      <Check className="h-4 w-4 text-chart-2" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button variant="ghost" size="icon" asChild>
                    <a href={paymentLinkUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            )}

            {company.slug && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Link do seu Catálogo Público:
                  </p>
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <code className="flex-1 break-all text-sm font-mono">
                      {catalogUrl}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyText(catalogUrl, setCopied)}
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-chart-2" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button variant="ghost" size="icon" asChild>
                      <a href={catalogUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mb-4">
        <h2 className="text-xl font-semibold">Planos Disponíveis</h2>
        <p className="text-muted-foreground text-sm">
          Escolha o plano ideal para sua empresa
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const isSamePlan = company?.plan_id === plan.id;
          const isActivePlan =
            isSamePlan && subscriptionState.status === 'active';

          return (
            <Card key={plan.id}>
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
                  <span className="text-3xl font-bold">
                    {formatCurrency(plan.price)}
                  </span>
                  <span className="text-muted-foreground">
                    /{plan.billing_period === 'monthly' ? 'mês' : 'ano'}
                  </span>
                </div>
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
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" />
                      {isActivePlan ? 'Plano Atual' : 'Assinar este plano'}
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
