import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Crown,
  Loader2,
  Building2,
  ExternalLink,
  Copy,
  CreditCard,
  AlertTriangle,
  CalendarClock,
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
import { listCaktoOffers } from '@/services/cakto';
import { Plan, Company } from '@/types/database';

/* ======================================================
   TIPOS DE LEITURA (DTOs) - NAO use tipos crus do banco
====================================================== */

type SubscriptionRow = {
  id: string;
  company_id: string | null;
  user_id: string | null;
  status: string;
  payment_link_url?: string | null;
  created_at: string;
  current_period_ends_at?: string | null;
  plan_id?: string | null;
  plan?: Plan | null;
};

type CompanyWithPlan = Company & {
  plan?: Plan | null;
};

type CaktoOffer = {
  id: string;
  name: string | null;
  price: number | null;
  intervalType: string | null;
  interval: number | null;
  status: string | null;
  checkout_url: string | null;
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v);

const formatDate = (value?: string | Date | null) => {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR').format(date);
};

const getPeriodLabel = (period?: string | null) => {
  if (!period) return 'Mensal';
  if (period === 'yearly') return 'Anual';
  if (period === 'monthly') return 'Mensal';
  return period;
};

export default function Subscription() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [extraPlans, setExtraPlans] = useState<Plan[]>([]);
  const [offers, setOffers] = useState<CaktoOffer[]>([]);
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
  const allPlans = useMemo(() => {
    if (extraPlans.length === 0) return plans;
    const merged = [...plans];
    extraPlans.forEach((planItem) => {
      if (!merged.some((entry) => entry.id === planItem.id)) {
        merged.push(planItem);
      }
    });
    return merged;
  }, [plans, extraPlans]);

  /* ======================================================
     LOAD DATA
  ====================================================== */
  const loadData = useCallback(async () => {
    setLoading(true);

    /* ---------- OFERTAS CAKTO ---------- */
    try {
      const { offers: offersData } = await listCaktoOffers();
      setOffers(
        (offersData as CaktoOffer[]).filter((offer) => Boolean(offer?.id))
      );
    } catch (error) {
      console.error('Erro ao carregar ofertas Cakto', error);
      setOffers([]);
    }

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

    const activePlans = (plansData as Plan[]) ?? [];
    setPlans(activePlans);

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
          .select('*, plan:plans(*)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        subscription = data as unknown as SubscriptionRow | null;
      } else {
        const { data, error } = await supabase
          .from('subscriptions' as any)
          .select('*, plan:plans(*)')
          .eq('company_id', profile.company_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        subscription = data as unknown as SubscriptionRow | null;
      }

      setLatestSubscription(subscription);

      const planIdsToCheck = [
        companyData?.plan_id,
        subscription?.plan_id,
      ].filter(Boolean) as string[];
      const missingPlanIds = planIdsToCheck.filter(
        (planId) => !activePlans.some((planItem) => planItem.id === planId)
      );

      if (missingPlanIds.length > 0) {
        const { data: extraPlansData, error: extraPlansError } = await supabase
          .from('plans')
          .select('*')
          .in('id', missingPlanIds);

        if (extraPlansError) {
          console.error(extraPlansError);
          setExtraPlans([]);
        } else {
          setExtraPlans((extraPlansData as Plan[]) ?? []);
        }
      } else {
        setExtraPlans([]);
      }
    } catch (err) {
      console.error('Erro ao buscar assinatura', err);
      setLatestSubscription(null);
      setExtraPlans([]);
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
      }>('create-subscription', {
        plan_id: planId,
        company_id: company?.id,
        customer: {
          email: user?.email ?? '',
          name: profile?.full_name ?? user?.email ?? '',
        },
      });

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

  const getOfferPeriodLabel = (offer: CaktoOffer) => {
    const intervalType = (offer.intervalType ?? '').toLowerCase();
    if (intervalType.includes('year') || intervalType.includes('ano')) return 'ano';
    if (intervalType.includes('month') || intervalType.includes('mes')) return 'mes';
    if (intervalType.includes('week') || intervalType.includes('semana')) return 'semana';
    if (intervalType.includes('day') || intervalType.includes('dia')) return 'dia';
    return 'mes';
  };

  const activeOfferFromLink = useMemo(() => {
    if (!latestSubscription?.payment_link_url || offers.length === 0) return null;
    const link = latestSubscription.payment_link_url;
    return (
      offers.find((offerItem) => link.includes(offerItem.id)) ??
      offers.find((offerItem) => offerItem.checkout_url === link) ??
      null
    );
  }, [latestSubscription?.payment_link_url, offers]);

  const activePlanFromIds =
    company?.plan ??
    latestSubscription?.plan ??
    allPlans.find((planItem) => planItem.id === company?.plan_id) ??
    allPlans.find((planItem) => planItem.id === latestSubscription?.plan_id) ??
    null;
  const activeOfferFromPlan = activePlanFromIds?.cakto_plan_id
    ? offers.find((offerItem) => offerItem.id === activePlanFromIds.cakto_plan_id)
    : null;
  const activeOffer = activeOfferFromLink ?? activeOfferFromPlan ?? null;
  const activePlanFromOffer = activeOffer?.id
    ? allPlans.find((planItem) => planItem.cakto_plan_id === activeOffer.id)
    : null;
  const activePlan = activePlanFromIds ?? activePlanFromOffer ?? null;
  const activePlanId =
    activePlan?.id ??
    company?.plan_id ??
    latestSubscription?.plan_id ??
    null;
  const activeOfferId = activeOffer?.id ?? null;
  const planName = activePlan?.name ?? activeOffer?.name ?? 'Sem plano ativo';
  const planPrice = activePlan?.price ?? activeOffer?.price ?? null;
  const planPeriod = activePlan
    ? getPeriodLabel(activePlan?.billing_period ?? null)
    : activeOffer
      ? (getOfferPeriodLabel(activeOffer) === 'ano'
        ? 'Anual'
        : getOfferPeriodLabel(activeOffer) === 'mes'
          ? 'Mensal'
          : getOfferPeriodLabel(activeOffer))
      : '—';

  const planStartLabel = formatDate(company?.subscription_start_date ?? null);
  const planEndLabel = formatDate(subscriptionState.expiresAt);

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

      {!subscriptionState.hasAccess && (
        <Card className="mb-6 border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Seu acesso está bloqueado até a assinatura ser aprovada. Escolha um plano e conclua o pagamento.
          </CardContent>
        </Card>
      )}

      {company && (
        <>
          <Card className="mb-6">
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
                  <Badge variant="outline" className="gap-1">
                    <Crown className="h-3 w-3" />
                    {company.plan.name}
                  </Badge>
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

          <Card className={`mb-8 ${subscriptionState.status === 'active' && activePlan ? 'border-primary/40 shadow-md bg-primary/5' : ''}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className={`h-5 w-5 ${subscriptionState.status === 'active' && activePlan ? 'text-primary' : 'text-muted-foreground'}`} />
                Plano Atual
                {subscriptionState.status === 'active' && activePlan && (
                  <Badge className="bg-primary/10 text-primary hover:bg-primary/15">
                    Plano ativo
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Status do plano e datas de vigência
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">Plano</p>
                <p className="font-medium">{planName}</p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">Valor</p>
                <p className={`font-medium ${subscriptionState.status === 'active' && planPrice !== null ? 'text-primary' : ''}`}>
                  {planPrice !== null ? formatCurrency(planPrice) : '—'}
                </p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">Periodicidade</p>
                <p className={`font-medium ${subscriptionState.status === 'active' && activePlan ? 'text-primary' : ''}`}>
                  {planPeriod}
                </p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">Status</p>
                <div className="flex items-center gap-2">
                  {getStatusBadge()}
                  {subscriptionState.isTrial && (
                    <Badge variant="secondary">Período de teste</Badge>
                  )}
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">Início</p>
                <p className="font-medium">{planStartLabel}</p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">Vencimento</p>
                <p className={`font-medium ${subscriptionState.status === 'active' && subscriptionState.expiresAt ? 'text-primary' : ''}`}>
                  {planEndLabel}
                </p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">Dias restantes</p>
                <p className="font-medium">
                  {subscriptionState.daysRemaining !== null
                    ? `${subscriptionState.daysRemaining} dia${subscriptionState.daysRemaining === 1 ? '' : 's'}`
                    : '—'}
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <div className="mb-4">
        <h2 className="text-xl font-semibold">Planos Disponíveis</h2>
        <p className="text-muted-foreground text-sm">
          Escolha o plano ideal para sua empresa
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {(offers.length > 0 ? offers : plans).map((item) => {
          const isOffer = (item as CaktoOffer).checkout_url !== undefined;
          const offer = item as CaktoOffer;
          const plan = item as Plan;
          const matchedPlan = isOffer
            ? plans.find((planItem) => planItem.cakto_plan_id === offer.id)
            : plan;
          const isSamePlan = matchedPlan?.id
            ? activePlanId === matchedPlan.id
            : false;
          const isActivePlan = subscriptionState.status === 'active' && (
            (isOffer && activeOfferId ? offer.id === activeOfferId : false) ||
            (!isOffer && isSamePlan)
          );
          const checkoutUrl = isOffer ? offer.checkout_url : null;
          const canCheckout = Boolean(checkoutUrl || matchedPlan?.id);
          const isProcessing = Boolean(
            subscribing && subscribing === (matchedPlan?.id ?? plan.id)
          );
          const priceValue = isOffer ? offer.price ?? 0 : plan.price;
          const periodLabel = isOffer
            ? getOfferPeriodLabel(offer)
            : plan.billing_period === 'monthly'
              ? 'mes'
              : 'ano';

          return (
            <Card key={isOffer ? offer.id : plan.id} className={isActivePlan ? "border-primary/50 shadow-md" : undefined}>
              <CardHeader className="relative">
                {isActivePlan && (
                  <div className="absolute right-4 top-4 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground">
                    Plano atual
                  </div>
                )}
                <CardTitle className="flex items-center justify-between">
                  {isOffer ? offer.name : plan.name}
                  {(isOffer ? offer.name : plan.name)?.toLowerCase().includes('pro') && (
                    <Crown className="h-5 w-5 text-yellow-500" />
                  )}
                </CardTitle>
                {isActivePlan && subscriptionState.daysRemaining !== null && subscriptionState.daysRemaining <= 7 && (
                  <Badge variant="secondary">Vence em {subscriptionState.daysRemaining} {subscriptionState.daysRemaining === 1 ? "dia" : "dias"}</Badge>
                )}
                {!isOffer && plan.description && (
                  <CardDescription>{plan.description}</CardDescription>
                )}
                {isOffer && (
                  <CardDescription>Plano cadastrado na Cakto.</CardDescription>
                )}
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">
                    {formatCurrency(priceValue)}
                  </span>
                  <span className="text-muted-foreground">/{periodLabel}</span>
                </div>
              </CardContent>

              <CardFooter>
                <Button
                  className={`w-full gap-2 ${!subscriptionState.hasAccess ? 'ring-2 ring-primary/40' : ''}`}
                  variant={isActivePlan ? 'outline' : 'default'}
                  disabled={!canCheckout || isActivePlan || isProcessing}
                  onClick={() => {
                    if (checkoutUrl) {
                      window.location.href = checkoutUrl;
                      return;
                    }
                    if (matchedPlan?.id) {
                      handleSubscribe(matchedPlan.id);
                    }
                  }}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" />
                      {isActivePlan
                        ? 'Plano Atual'
                        : canCheckout
                          ? 'Assinar este plano'
                          : 'Em configuração'}
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
