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
import { useSearchParams } from 'react-router-dom';
import { computeSubscriptionState } from '@/services/subscription';
import { invokeEdgeFunction } from '@/services/edgeFunctions';
import { listCaktoOffers } from '@/services/cakto';
import { Plan, Company, BillingPeriod } from '@/types/database';

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
  recurrence_period?: number | null;
  status: string | null;
  type?: string | null;
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
  if (!period || period === 'monthly') return 'Mensal';
  if (period === 'quarterly') return 'Trimestral';
  if (period === 'yearly') return 'Anual';
  if (period === 'lifetime') return 'Vitalício';
  return period;
};

const defaultPlanFeatures = [
  'Acesso completo ao sistema',
  'Suporte especializado',
];

export default function Subscription() {
  const { profile, user } = useAuth();
  const [searchParams] = useSearchParams();

  const [plans, setPlans] = useState<Plan[]>([]);
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
      const normalizedCompany = companyData
        ? ({
            ...(companyData as CompanyWithPlan),
            plan: (companyData as CompanyWithPlan).plan?.is_active
              ? (companyData as CompanyWithPlan).plan
              : null,
          } as CompanyWithPlan)
        : null;
      setCompany(normalizedCompany);
    }

    /* ---------- ASSINATURA ---------- */
    try {
      let subscription: SubscriptionRow | null = null;

      if (user.id) {
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

      const normalizedSubscription = subscription
        ? ({
            ...subscription,
            plan: subscription.plan?.is_active ? subscription.plan : null,
          } as SubscriptionRow)
        : null;
      setLatestSubscription(normalizedSubscription);
    } catch (err) {
      console.error('Erro ao buscar assinatura', err);
      setLatestSubscription(null);
    }

    setLoading(false);
  }, [profile?.company_id, user.id]);

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
          email: user.email ?? '',
          name: profile?.full_name ?? user.email ?? '',
        },
      }, {
        resetAuthOn401: false,
      });

      const redirectUrl = data?.checkout_url ?? data?.url;

      if (!redirectUrl) {
        toast.error('Erro ao iniciar pagamento');
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
        console.warn('[subscription] received 401 without forcing logout');
        return;
      }

      toast.error(err?.message || 'Erro ao iniciar pagamento');
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
        return <Badge variant="secondary">Teste</Badge>;
      case 'expired':
        return <Badge variant="destructive">Plano expirado</Badge>;
      default:
        return <Badge variant="secondary">Sem plano ativo</Badge>;
    }
  };

  const resolveOfferPeriodLabel = (offer: CaktoOffer, fallbackPeriod?: string | null) => {
    const type = (offer.type ?? '').toLowerCase();
    if (type === 'one_time' || type === 'one-time' || type === 'one time') return 'Vitalício';

    const recurrencePeriod = Number(offer.recurrence_period ?? NaN);
    if (Number.isFinite(recurrencePeriod) && recurrencePeriod > 0) {
      if (recurrencePeriod >= 360) return 'Anual';
      if (recurrencePeriod >= 80) return 'Trimestral';
      if (recurrencePeriod >= 27) return 'Mensal';
      if (recurrencePeriod >= 7) return 'Semanal';
      return 'Diário';
    }

    const intervalType = (offer.intervalType ?? '').toLowerCase();

    if (intervalType.includes('year') || intervalType.includes('ano') || intervalType.includes('anual')) return 'Anual';
    if (intervalType.includes('quarter') || intervalType.includes('trimestre') || intervalType.includes('trimestral')) return 'Trimestral';
    if (intervalType.includes('month') || intervalType.includes('mes') || intervalType.includes('mensal')) return 'Mensal';

    const isCaktoSubscriptionWithLifetimeIntervalType =
      type === 'subscription' &&
      (intervalType.includes('lifetime') || intervalType.includes('infinite'));

    if (!isCaktoSubscriptionWithLifetimeIntervalType) {
      if (intervalType.includes('lifetime') || intervalType.includes('vitalicio') || intervalType.includes('vitalício') || intervalType.includes('infinite')) return 'Vitalício';
    }

    if (intervalType.includes('week') || intervalType.includes('semana')) return 'Semanal';
    if (intervalType.includes('day') || intervalType.includes('dia')) return 'Diário';
    return getPeriodLabel(fallbackPeriod);
  };

  const getOfferPeriodLabel = (offer: CaktoOffer) => {
    const type = (offer.type ?? '').toLowerCase();
    if (type === 'one_time' || type === 'one-time' || type === 'one time') return 'Vitalício';

    const recurrencePeriod = Number(offer.recurrence_period ?? NaN);
    if (Number.isFinite(recurrencePeriod) && recurrencePeriod > 0) {
      if (recurrencePeriod >= 360) return 'Anual';
      if (recurrencePeriod >= 80) return 'Trimestral';
      if (recurrencePeriod >= 27) return 'Mensal';
      if (recurrencePeriod >= 7) return 'Semanal';
      return 'Diário';
    }

    const intervalType = (offer.intervalType ?? '').toLowerCase();

    if (intervalType.includes('year') || intervalType.includes('ano')) return 'Anual';
    if (intervalType.includes('quarter') || intervalType.includes('trimestre')) return 'Trimestral';
    if (intervalType.includes('month') || intervalType.includes('mes')) return 'Mensal';

    const isCaktoSubscriptionWithLifetimeIntervalType =
      type === 'subscription' &&
      (intervalType.includes('lifetime') || intervalType.includes('infinite'));

    if (!isCaktoSubscriptionWithLifetimeIntervalType) {
      if (intervalType.includes('lifetime') || intervalType.includes('vitalicio') || intervalType.includes('vitalício') || intervalType.includes('infinite')) return 'Vitalício';
    }

    if (intervalType.includes('week') || intervalType.includes('semana')) return 'Semanal';
    if (intervalType.includes('day') || intervalType.includes('dia')) return 'Diário';
    return 'Mensal';
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

  const companyActivePlan = company?.plan && company.plan.is_active ? company.plan : null;
  const subscriptionActivePlan =
    latestSubscription?.plan && latestSubscription.plan.is_active
      ? latestSubscription.plan
      : null;
  const activePlanFromIds =
    companyActivePlan ??
    subscriptionActivePlan ??
    plans.find((planItem) => planItem.id === company?.plan_id) ??
    plans.find((planItem) => planItem.id === latestSubscription?.plan_id) ??
    null;
  const activeOfferFromPlan = activePlanFromIds?.cakto_plan_id
    ? offers.find((offerItem) => offerItem.id === activePlanFromIds.cakto_plan_id)
    : null;
  const activeOffer = activeOfferFromLink ?? activeOfferFromPlan ?? null;
  const activePlanFromOffer = activeOffer?.id
    ? plans.find((planItem) => planItem.cakto_plan_id === activeOffer.id)
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
      ? getOfferPeriodLabel(activeOffer)
      : '—';

  const planStartLabel = formatDate(company?.subscription_start_date ?? null);
  const planEndLabel = formatDate(subscriptionState.expiresAt);
  const getPlanPeriodLabel = (item: CaktoOffer | Plan) => {
    const isOffer = (item as CaktoOffer).checkout_url !== undefined;

    if (isOffer) {
      const offer = item as CaktoOffer;
      const matchedPlan = plans.find((planItem) => planItem.cakto_plan_id === offer.id);
      return resolveOfferPeriodLabel(offer, matchedPlan?.billing_period ?? null);
    }

    const plan = item as Plan;
    if (plan.billing_period === 'monthly') return 'Mensal';
    if (plan.billing_period === 'quarterly') return 'Trimestral';
    if (plan.billing_period === 'lifetime') return 'Vitalício';
    return 'Anual';
  };

  const getPlanDisplayOrder = (periodLabel: string) => {
    if (periodLabel === 'Mensal') return 0;
    if (periodLabel === 'Anual') return 1;
    if (periodLabel === 'Trimestral') return 2;
    if (periodLabel === 'Vitalício') return 3;
    if (periodLabel === 'Semanal') return 4;
    if (periodLabel === 'Diário') return 5;
    return 6;
  };

  const displayPlanItems = [...(offers.length > 0 ? offers : plans)].sort((itemA, itemB) => {
    const periodDiff =
      getPlanDisplayOrder(getPlanPeriodLabel(itemA)) -
      getPlanDisplayOrder(getPlanPeriodLabel(itemB));

    if (periodDiff !== 0) return periodDiff;

    const priceA = (itemA as CaktoOffer).checkout_url !== undefined
      ? ((itemA as CaktoOffer).price ?? 0)
      : (itemA as Plan).price;
    const priceB = (itemB as CaktoOffer).checkout_url !== undefined
      ? ((itemB as CaktoOffer).price ?? 0)
      : (itemB as Plan).price;

    return priceA - priceB;
  });

  /* ======================================================
     RENDER
  ====================================================== */
  if (loading) {
    return (
      <div className="min-h-screen bg-background px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex min-h-[65vh] w-full items-center justify-center rounded-2xl border bg-card shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="w-full space-y-6">
      <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
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

      <div className="mb-10 space-y-4 text-center">
        <p className="text-muted-foreground text-sm font-bold uppercase tracking-[0.2em]">
          Planos
        </p>
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Escolha o plano certo para escalar a sua gráfica.
        </h2>
        <p className="text-muted-foreground mx-auto max-w-2xl text-base">
          Todos os planos incluem atualizações, segurança e suporte para manter sua operação estável.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {displayPlanItems.map((item) => {
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
          const planNameLabel = matchedPlan?.name ?? (isOffer ? offer.name : plan.name) ?? 'Plano';
          const planDescription =
            matchedPlan?.description ||
            (!isOffer ? plan.description : null) ||
            'Plano completo para acelerar sua operação gráfica.';
          const planFeatures =
            matchedPlan?.features && matchedPlan.features.length > 0
              ? matchedPlan.features
              : defaultPlanFeatures;
          const periodLabel = getPlanPeriodLabel(item);
          const isPopular = periodLabel === 'Anual';

          return (
            <Card
              key={isOffer ? offer.id : plan.id}
              className={`relative flex flex-col rounded-[2.5rem] border-2 p-10 transition-all duration-500 ${
                isPopular
                  ? 'border-primary bg-[#0f172a] text-white shadow-2xl shadow-primary/30'
                  : isActivePlan
                    ? 'border-primary bg-white text-slate-900 shadow-2xl shadow-primary/15'
                    : 'border-slate-100 bg-white text-slate-900 shadow-xl shadow-slate-200/50 hover:border-primary/20'
              }`}
            >
              <CardHeader className="relative p-0">
                {isPopular && (
                  <div className="absolute -top-14 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-amber-400 px-6 py-2 text-[0.8rem] font-black uppercase tracking-widest text-amber-950 shadow-lg">
                      Mais popular
                    </span>
                  </div>
                )}
                {isActivePlan && (
                  <div className="absolute right-4 top-4 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground">
                    Plano atual
                  </div>
                )}
                <div className="mb-8">
                  <p className={`text-xs font-black uppercase tracking-[0.2em] ${isPopular ? 'text-slate-400' : 'text-primary'}`}>
                    {planNameLabel}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <CardTitle className={`text-3xl font-black tracking-tight ${isPopular ? 'text-white' : 'text-slate-900'}`}>
                      {formatCurrency(priceValue)}
                    </CardTitle>
                    {planNameLabel.toLowerCase().includes('pro') && (
                      <div className={`rounded-full p-2 ${isPopular ? 'bg-amber-400/15' : 'bg-amber-100'}`}>
                        <Crown className={`h-5 w-5 ${isPopular ? 'text-amber-300' : 'text-amber-500'}`} />
                      </div>
                    )}
                  </div>
                  <p className={`mt-2 text-sm font-bold ${isPopular ? 'text-slate-400' : 'text-slate-500'}`}>
                    Faturamento {periodLabel}
                  </p>
                  <CardDescription className={`mt-4 text-base leading-relaxed ${isPopular ? 'text-slate-300' : 'text-slate-500'}`}>
                    {planDescription}
                  </CardDescription>
                </div>
                {isActivePlan && subscriptionState.daysRemaining !== null && subscriptionState.daysRemaining <= 7 && (
                  <Badge
                    variant="secondary"
                    className={`mb-6 w-fit ${isPopular ? 'border-slate-700 bg-slate-800 text-slate-100' : ''}`}
                  >
                    Vence em {subscriptionState.daysRemaining} {subscriptionState.daysRemaining === 1 ? 'dia' : 'dias'}
                  </Badge>
                )}
              </CardHeader>

              <CardContent className="flex flex-1 flex-col space-y-8 p-0">
                <ul className="space-y-4">
                  {planFeatures.map((feature) => (
                    <li key={`${isOffer ? offer.id : plan.id}-${feature}`} className="flex items-start gap-3 text-sm font-medium">
                      <div className={`mt-0.5 rounded-full p-1 ${isPopular ? 'bg-primary/20' : 'bg-primary/10'}`}>
                        <Check className="h-3 w-3 shrink-0 text-primary" />
                      </div>
                      <span className={isPopular ? 'text-slate-200' : 'text-slate-600'}>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="space-y-3">
                  <div className={`flex items-center justify-between text-sm ${isPopular ? 'text-slate-300' : 'text-slate-500'}`}>
                    <span>Checkout</span>
                    <span>{canCheckout ? 'Disponível' : 'Em configuração'}</span>
                  </div>
                  <div className={`flex items-center justify-between text-sm ${isPopular ? 'text-slate-300' : 'text-slate-500'}`}>
                    <span>Status</span>
                    <span>{isActivePlan ? 'Plano atual' : 'Disponível'}</span>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="p-0 pt-10">
                <Button
                  className={`h-16 w-full rounded-2xl text-lg font-black shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                    isActivePlan
                      ? 'border border-primary bg-primary/10 text-primary hover:bg-primary/10'
                      : isPopular
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-primary/40'
                        : 'bg-slate-100 text-slate-900 hover:bg-primary hover:text-white hover:shadow-primary/30'
                  } ${!subscriptionState.hasAccess && !isActivePlan ? 'ring-2 ring-primary/30' : ''}`}
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
                          ? 'Assinar agora'
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
    </div>
  );
}
