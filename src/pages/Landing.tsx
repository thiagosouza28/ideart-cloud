import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowDownCircle,
  BarChart2,
  BarChart3,
  Barcode,
  Boxes,
  Calculator,
  Check,
  ClipboardList,
  CreditCard,
  Factory,
  FileText,
  FolderTree,
  Gift,
  Image as ImageIcon,
  Kanban,
  Layers,
  LayoutDashboard,
  Loader2,
  Package,
  Settings,
  ShoppingCart,
  Tags,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { createCaktoCheckout, listCaktoOffers } from "@/services/cakto";
import type { Plan } from "@/types/database";

type PlanWithCakto = Plan & { cakto_plan_id?: string | null };
type CaktoOffer = {
  id: string;
  name?: string | null;
  price?: number | null;
  intervalType?: string | null;
  interval?: number | null;
  recurrence_period?: number | null;
  status?: string | null;
  type?: string | null;
  checkoutUrl?: string | null;
};

type DisplayPlan = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  billing_period: string;
  features: string[];
  planId: string | null;
  checkoutUrl: string | null;
};

const heroStats = [
  { value: "+1.200", label: "usuários ativos" },
  { value: "99,9%", label: "uptime mensal" },
  { value: "4,9/5", label: "avaliação média" },
];

const featureCards = [
  {
    icon: "OP",
    title: "Pedidos e produção no mesmo fluxo",
    description:
      "Acompanhe cada etapa com status visíveis, prazos e histórico completo para toda a equipe.",
    tag: "Operação",
  },
  {
    icon: "PDV",
    title: "PDV e financeiro conectados",
    description:
      "Venda, receba e gere comprovantes com consistência entre caixa, pedidos e relatórios.",
    tag: "Financeiro",
  },
  {
    icon: "CAT",
    title: "Catálogo inteligente de produtos",
    description:
      "Monte combinações, atributos e categorias com rapidez para acelerar o atendimento.",
    tag: "Comercial",
  },
  {
    icon: "BI",
    title: "Indicadores para decidir rápido",
    description:
      "Visualize desempenho, gargalos e metas em painéis claros para escalar com previsibilidade.",
    tag: "Gestão",
  },
];

const previewMetrics = [
  { label: "Pedidos hoje", value: "32", trend: "+12%" },
  { label: "Produção ativa", value: "18", trend: "+7%" },
  { label: "Receita dia", value: "R$ 8.420", trend: "+19%" },
];

const previewRows = [
  { order: "#4512", customer: "Iane Teles", status: "Em produção", badge: "bg-warning/15 text-warning" },
  { order: "#4513", customer: "Bruno Sales", status: "Arte aprovada", badge: "bg-info/15 text-info" },
  { order: "#4514", customer: "Claudia Lima", status: "Finalizado", badge: "bg-primary/15 text-primary" },
];

export default function Landing() {
  const [plans, setPlans] = useState<PlanWithCakto[]>([]);
  const [offers, setOffers] = useState<CaktoOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanWithCakto | null>(null);
  const [checkoutForm, setCheckoutForm] = useState({
    email: "",
    fullName: "",
    companyName: "",
  });
  const trialSignupLink = "/auth?tab=signup&trial=3";

  useEffect(() => {
    const loadPlans = async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id,name,description,price,billing_period,features,is_active,cakto_plan_id")
        .eq("is_active", true)
        .order("price", { ascending: true });

      if (error) {
        console.error("Erro ao carregar planos ativos", error);
        setPlans([]);
        return;
      }

      setPlans((data || []) as PlanWithCakto[]);
    };
    loadPlans();
  }, []);

  useEffect(() => {
    const loadOffers = async () => {
      setOffersLoading(true);
      try {
        const resp = await listCaktoOffers();
        const mapped = (resp?.offers || []).map((offer) => ({
          id: String(offer.id),
          name: offer.name ? String(offer.name) : null,
          price: typeof offer.price === "number" ? offer.price : Number(offer.price ?? 0),
          intervalType: offer.intervalType ? String(offer.intervalType) : null,
          interval: offer.interval ? Number(offer.interval) : null,
          recurrence_period: typeof offer.recurrence_period === "number"
            ? offer.recurrence_period
            : offer.recurrence_period
              ? Number(offer.recurrence_period)
              : null,
          status: offer.status ? String(offer.status) : null,
          type: offer.type ? String(offer.type) : null,
          checkoutUrl: offer.checkout_url ? String(offer.checkout_url) : null,
        }));
        setOffers(mapped.filter((offer) => offer.id));
      } catch (error) {
        console.error("Failed to load CAKTO offers", error);
      } finally {
        setOffersLoading(false);
      }
    };
    loadOffers();
  }, []);

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".reveal:not(.visible)"));
    if (!nodes.length) return;

    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      nodes.forEach((node) => node.classList.add("visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.15 }
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [plans, offers, offersLoading]);

  const normalizeOfferId = (value?: string | null) => {
    if (!value) return null;
    if (value.startsWith("http")) {
      return value.split("/").pop() ?? null;
    }
    return value;
  };

  const displayPlans = useMemo<DisplayPlan[]>(() => {
    const activeOffers = offers.filter((offer) => offer.status !== "inactive" && offer.status !== "disabled");

    const result = activeOffers.length 
      ? activeOffers.map((offer) => {
          const matchingPlan = plans.find(
            (plan) => normalizeOfferId(plan.cakto_plan_id ?? undefined) === offer.id
          );
          
          const it = (offer.intervalType || "").toLowerCase();
          const type = (offer.type || "").toLowerCase();
          const recurrencePeriod = Number(offer.recurrence_period ?? NaN);

          const isCaktoSubscriptionWithLifetimeIntervalType =
            type === "subscription" && (it.includes("lifetime") || it.includes("infinite"));

          const billing =
            type === "one_time" || type === "one-time" || type === "one time"
              ? "lifetime"
              : Number.isFinite(recurrencePeriod) && recurrencePeriod > 0
                ? recurrencePeriod >= 360
                  ? "yearly"
                  : recurrencePeriod >= 80
                    ? "quarterly"
                    : "monthly"
                : it.includes("year") || it.includes("anual") || it.includes("ano")
                  ? "yearly"
                  : it.includes("quarter") || it.includes("trimestral") || it.includes("trimestre")
                    ? "quarterly"
                    : it.includes("month") || it.includes("mes") || it.includes("mensal")
                      ? "monthly"
                      : !isCaktoSubscriptionWithLifetimeIntervalType &&
                          (it.includes("lifetime") || it.includes("infinite") || it.includes("vitalicio") || it.includes("vitalício"))
                        ? "lifetime"
                        : matchingPlan?.billing_period || "monthly";

          return {
            id: offer.id,
            name: matchingPlan?.name ?? offer.name ?? "Plano Cakto",
            description: matchingPlan?.description ?? null,
            price: typeof offer.price === "number" ? offer.price : 0,
            billing_period: billing,
            features: matchingPlan?.features ?? [],
            planId: matchingPlan?.id ?? null,
            checkoutUrl: offer.checkoutUrl ?? `https://pay.cakto.com.br/${offer.id}`,
          };
        })
      : plans.map((plan) => ({
          id: plan.id,
          name: plan.name,
          description: plan.description ?? null,
          price: plan.price,
          billing_period: plan.billing_period,
          features: plan.features ?? [],
          planId: plan.id,
          checkoutUrl: null,
        }));

    // Reorder: Mensal (monthly) -> Anual (yearly) -> Trimestral (quarterly)
    const orderMap: Record<string, number> = {
      monthly: 1,
      yearly: 2,
      quarterly: 3,
      lifetime: 4
    };

    return result.sort((a, b) => (orderMap[a.billing_period] || 99) - (orderMap[b.billing_period] || 99));
  }, [plans, offers]);

  const maxPrice = useMemo(() => {
    if (!displayPlans.length) return 0;
    return Math.max(...displayPlans.map((item) => item.price || 0));
  }, [displayPlans]);

  const openCheckout = (planId: string | null, checkoutUrl: string | null) => {
    if (!planId) {
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }
      toast.error("Plano ainda não configurado para pagamento.");
      return;
    }
    const plan = plans.find((item) => item.id === planId) ?? null;
    if (!plan) {
      toast.error("Plano não encontrado no sistema.");
      return;
    }
    setSelectedPlan(plan);
    setCheckoutOpen(true);
  };

  const handleCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPlan) return;

    const email = checkoutForm.email.trim();
    if (!email) {
      toast.error("Informe um e-mail válido.");
      return;
    }

    setCheckoutLoading(true);
    try {
      const payload = {
        plan_id: selectedPlan.id,
        email,
        full_name: checkoutForm.fullName.trim() || undefined,
        company_name: checkoutForm.companyName.trim() || undefined,
      };
      const resp = await createCaktoCheckout(payload);
      const checkoutUrl = (resp as { checkout_url?: string })?.checkout_url;

      if (!checkoutUrl) {
        throw new Error("Pagamento indisponível no momento.");
      }

      window.location.href = checkoutUrl;
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Erro ao iniciar o pagamento.";
      toast.error(message);
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="landing-page min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-foreground/10 bg-background/85 backdrop-blur-[14px]">
        <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-4">
          <a href="#inicio" className="landing-logo flex items-center gap-3 text-foreground">
            <span className="h-8 w-8 rounded-lg bg-primary shadow-[0_8px_24px_hsl(var(--primary)/0.45)]" />
            <span className="landing-heading text-base font-extrabold tracking-[0.04em]">IDEART CLOUD</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground lg:flex">
            <a href="#interface" className="landing-nav-link transition-colors hover:text-foreground">
              Interface
            </a>
            <a href="#funcionalidades" className="landing-nav-link transition-colors hover:text-foreground">
              Funcionalidades
            </a>
            <a href="#planos" className="landing-nav-link transition-colors hover:text-foreground">
              Planos
            </a>
            <a href="#contato" className="landing-nav-link transition-colors hover:text-foreground">
              Contato
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="landing-btn h-10 rounded-full border-foreground/15 px-5 text-foreground"
            >
              <Link to={trialSignupLink}>Teste 3 dias</Link>
            </Button>
            <Button asChild className="landing-btn h-10 rounded-full bg-primary px-5 text-primary-foreground">
              <Link to="/auth">Entrar</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="overflow-hidden pt-20">
        {/* HERO SECTION */}
        <section id="inicio" className="relative flex min-h-[80vh] items-center py-20">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.1),transparent_50%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.05),transparent_50%)]" />
          <div className="mx-auto w-full max-w-7xl px-4">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
              <div className="space-y-8 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                  Plataforma completa para o seu negócio
                </div>
                
                <h1 className="text-4xl font-black tracking-tight text-foreground sm:text-6xl">
                  IDEART CLOUD
                  <span className="block text-2xl font-bold text-muted-foreground sm:text-3xl mt-2">
                    Sistema completo para gráficas, papelarias e personalizados
                  </span>
                </h1>
                
                <p className="text-lg text-muted-foreground sm:text-xl max-w-xl mx-auto lg:mx-0">
                  Gerencie pedidos, produção, clientes, catálogo e financeiro em um único sistema de forma simples e eficiente.
                </p>
                
                <div className="flex flex-wrap items-center justify-center gap-4 lg:justify-start">
                  <Button asChild size="lg" className="h-14 rounded-xl px-8 text-lg font-bold shadow-lg shadow-primary/25">
                    <Link to={trialSignupLink}>Criar conta</Link>
                  </Button>
                  <Button asChild variant="ghost" size="lg" className="h-14 rounded-xl px-8 text-lg font-bold border border-primary/20 text-primary hover:bg-primary/5 hover:text-primary transition-all">
                    <Link to="/auth">Entrar no sistema</Link>
                  </Button>
                </div>
              </div>
              
              <div className="relative">
                <div className="relative z-10 space-y-4">
                  <div className="relative h-64 w-full overflow-hidden rounded-xl border bg-card shadow-2xl transition-all hover:scale-[1.02] sm:h-80">
                    <img 
                      src="/landing/painel.png" 
                      alt="Painel Administrativo" 
                      className="h-full w-full object-cover object-top"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative h-40 overflow-hidden rounded-xl border bg-card shadow-xl transition-all hover:scale-[1.02] sm:h-48">
                      <img 
                        src="/landing/pedidos.png" 
                        alt="Tela de Pedidos" 
                        className="h-full w-full object-cover object-top"
                      />
                    </div>
                    <div className="relative h-40 overflow-hidden rounded-xl border bg-card shadow-xl transition-all hover:scale-[1.02] sm:h-48">
                      <img 
                        src="/landing/catalogo.png" 
                        alt="Catálogo Online" 
                        className="h-full w-full object-cover object-top"
                      />
                    </div>
                  </div>
                </div>
                <div className="absolute -bottom-6 -left-6 -right-6 -top-6 -z-10 rounded-3xl bg-primary/5 blur-3xl" />
              </div>
            </div>
          </div>
        </section>

        {/* SEÇÃO DEMONSTRAÇÃO DO SISTEMA */}
        <section id="interface" className="bg-slate-50/50 py-24 dark:bg-slate-950/20">
          <div className="mx-auto w-full max-w-7xl px-4 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Veja o IDEART Cloud em ação
            </h2>
            <p className="mb-16 text-muted-foreground max-w-2xl mx-auto">
              Uma interface pensada para produtividade, com tudo que você precisa ao alcance de um clique.
            </p>
            
            <div className="grid gap-12 md:grid-cols-3">
              {/* PAINEL FINANCEIRO */}
              <Card className="overflow-hidden border-none bg-transparent shadow-none">
                <div className="group relative h-48 overflow-hidden rounded-3xl border bg-card shadow-lg transition-all hover:scale-[1.03] hover:shadow-2xl sm:h-64">
                  <img src="/landing/painel.png" alt="Painel Financeiro" className="h-full w-full object-cover object-top" />
                  <div className="absolute inset-0 bg-primary/10 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <CardContent className="pt-8 px-0">
                  <h3 className="mb-3 text-2xl font-black">Painel Financeiro</h3>
                  <p className="text-muted-foreground leading-relaxed">Acompanhe faturamento, fluxo de caixa e o desempenho geral da sua empresa em um só lugar.</p>
                </CardContent>
              </Card>

              {/* GESTÃO DE PEDIDOS */}
              <Card className="overflow-hidden border-none bg-transparent shadow-none">
                <div className="group relative h-48 overflow-hidden rounded-3xl border bg-card shadow-lg transition-all hover:scale-[1.03] hover:shadow-2xl sm:h-64">
                  <img src="/landing/pedidos.png" alt="Gestão de Pedidos" className="h-full w-full object-cover object-top" />
                  <div className="absolute inset-0 bg-primary/10 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <CardContent className="pt-8 px-0">
                  <h3 className="mb-3 text-2xl font-black">Gestão de Pedidos</h3>
                  <p className="text-muted-foreground leading-relaxed">Controle status, produção e pagamento de cada pedido em tempo real com total organização.</p>
                </CardContent>
              </Card>

              {/* CATÁLOGO ONLINE */}
              <Card className="overflow-hidden border-none bg-transparent shadow-none">
                <div className="group relative h-48 overflow-hidden rounded-3xl border bg-card shadow-lg transition-all hover:scale-[1.03] hover:shadow-2xl sm:h-64">
                  <img src="/landing/catalogo.png" alt="Catálogo Online" className="h-full w-full object-cover object-top" />
                  <div className="absolute inset-0 bg-primary/10 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <CardContent className="pt-8 px-0">
                  <h3 className="mb-3 text-2xl font-black">Catálogo Online</h3>
                  <p className="text-muted-foreground leading-relaxed">Seus clientes podem visualizar produtos e fazer pedidos online de forma prática e rápida.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* SEÇÃO FUNCIONALIDADES */}
        <section id="funcionalidades" className="py-24">
          <div className="mx-auto w-full max-w-7xl px-4">
            <div className="mb-16 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Funcionalidades do sistema
              </h2>
              <p className="mt-4 text-muted-foreground">O módulo ideal para cada necessidade da sua operação.</p>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              {[
                { title: 'Painel', icon: LayoutDashboard, color: 'text-blue-600', bg: 'bg-blue-50' },
                { title: 'Pedidos', icon: ClipboardList, color: 'text-blue-600', bg: 'bg-blue-50' },
                { title: 'Produção', icon: Factory, color: 'text-orange-600', bg: 'bg-orange-50' },
                { title: 'Fluxo de Caixa', icon: CreditCard, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                { title: 'Despesas', icon: ArrowDownCircle, color: 'text-red-500', bg: 'bg-red-50' },
                { title: 'Relatórios', icon: BarChart3, color: 'text-purple-600', bg: 'bg-purple-50' },
                { title: 'Produtos', icon: Package, color: 'text-amber-600', bg: 'bg-amber-50' },
                { title: 'Categorias', icon: FolderTree, color: 'text-blue-600', bg: 'bg-blue-50' },
                { title: 'Banners', icon: ImageIcon, color: 'text-orange-600', bg: 'bg-orange-50' },
                { title: 'Atributos', icon: Tags, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                { title: 'Gestão Catálogo', icon: Settings, color: 'text-slate-600', bg: 'bg-slate-50' },
                { title: 'PDV / Balcão', icon: ShoppingCart, color: 'text-green-600', bg: 'bg-green-50' },
                { title: 'Comprovantes', icon: FileText, color: 'text-slate-600', bg: 'bg-slate-50' },
                { title: 'Kanban', icon: Kanban, color: 'text-sky-600', bg: 'bg-sky-50' },
                { title: 'Insumos', icon: Layers, color: 'text-amber-600', bg: 'bg-amber-50' },
                { title: 'Estoque', icon: Boxes, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { title: 'Clientes', icon: Users, color: 'text-rose-600', bg: 'bg-rose-50' },
                { title: 'Aniversariantes', icon: Gift, color: 'text-pink-500', bg: 'bg-pink-50' },
                { title: 'Simulador', icon: Calculator, color: 'text-violet-600', bg: 'bg-violet-50' },
                { title: 'Etiquetas', icon: Barcode, color: 'text-cyan-600', bg: 'bg-cyan-50' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-6 transition-all hover:border-primary/50 hover:shadow-md">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${item.bg} ${item.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="text-center text-sm font-semibold">{item.title}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* SEÇÃO BENEFÍCIOS */}
        <section className="bg-primary/5 py-24">
          <div className="mx-auto w-full max-w-7xl px-4">
            <h2 className="mb-16 text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Mais organização para sua empresa
            </h2>
            
            <div className="grid gap-8 md:grid-cols-3">
              <div className="rounded-3xl border bg-card p-8 shadow-sm transition-all hover:shadow-lg">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                  <Activity className="h-8 w-8" />
                </div>
                <h3 className="mb-4 text-2xl font-bold">Automatize seus pedidos</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Receba pedidos do catálogo direto no painel e mantenha o cliente informado automaticamente via WhatsApp.
                </p>
              </div>

              <div className="rounded-3xl border bg-card p-8 shadow-sm transition-all hover:shadow-lg">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-600">
                  <Boxes className="h-8 w-8" />
                </div>
                <h3 className="mb-4 text-2xl font-bold">Organize produção e estoque</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Saiba exatamente o que deve ser produzido hoje e mantenha o estoque de insumos sempre em dia.
                </p>
              </div>

              <div className="rounded-3xl border bg-card p-8 shadow-sm transition-all hover:shadow-lg">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100 text-purple-600">
                  <BarChart2 className="h-8 w-8" />
                </div>
                <h3 className="mb-4 text-2xl font-bold">Controle financeiro completo</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Fluxo de caixa, contas a pagar e receber, e relatórios detalhados para você decidir melhor sobre seu negócio.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SEÇÃO PLANOS */}
        <section id="planos" className="mx-auto w-full max-w-7xl px-4 py-24">
          <div className="reveal space-y-4 text-center">
            <p className="landing-section-label text-muted-foreground uppercase tracking-widest text-sm font-bold">Planos</p>
            <h2 className="landing-heading text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
              Escolha o plano certo para escalar a sua gráfica.
            </h2>
            <p className="landing-copy max-w-2xl mx-auto text-muted-foreground text-lg">
              Todos os planos incluem atualizações, segurança e suporte para manter sua operação estável.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {displayPlans.map((plan) => {
              const isPopular = plan.billing_period === "yearly";
              const periodLabel = 
                plan.billing_period === "yearly" ? "Anual" : 
                plan.billing_period === "quarterly" ? "Trimestral" : 
                plan.billing_period === "lifetime" ? "Vitalício" : 
                "Mensal";

              return (
                <Card
                  key={plan.id}
                  className={`relative flex flex-col rounded-[2.5rem] p-10 transition-all duration-500 border-2 ${
                    isPopular 
                      ? "border-primary bg-[#0f172a] text-white shadow-2xl shadow-primary/30 scale-105 z-10" 
                      : "border-slate-100 bg-white text-slate-900 shadow-xl shadow-slate-200/50 hover:border-primary/20"
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="rounded-full bg-amber-400 px-6 py-2 text-[0.8rem] font-black uppercase tracking-widest text-amber-950 shadow-lg">
                        Mais Popular
                      </span>
                    </div>
                  )}
                  
                  <div className="mb-8">
                    <p className={`text-xs font-black uppercase tracking-[0.2em] ${isPopular ? "text-slate-400" : "text-primary"}`}>
                      {plan.name}
                    </p>
                    <p className={`mt-3 text-base leading-relaxed ${isPopular ? "text-slate-400" : "text-slate-500"}`}>
                      {plan.description || "Plano completo para acelerar sua operação gráfica."}
                    </p>
                  </div>

                  <div className="mb-10">
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-black tracking-tight">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(plan.price)}
                      </span>
                    </div>
                    <p className={`mt-2 text-sm font-bold ${isPopular ? "text-slate-400" : "text-slate-500"}`}>
                      Faturamento {periodLabel}
                    </p>
                  </div>

                  <ul className="mb-12 space-y-4 flex-1">
                    {(plan.features || []).length > 0 ? (
                      plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3 text-sm font-medium">
                          <div className={`mt-0.5 rounded-full p-1 ${isPopular ? "bg-primary/20" : "bg-primary/10"}`}>
                            <Check className={`h-3 w-3 shrink-0 ${isPopular ? "text-primary" : "text-primary"}`} />
                          </div>
                          <span className={isPopular ? "text-slate-200" : "text-slate-600"}>{feature}</span>
                        </li>
                      ))
                    ) : (
                      <>
                        <li className="flex items-start gap-3 text-sm font-medium">
                          <div className={`mt-0.5 rounded-full p-1 ${isPopular ? "bg-primary/20" : "bg-primary/10"}`}>
                             <Check className={`h-3 w-3 shrink-0 ${isPopular ? "text-primary" : "text-primary"}`} />
                          </div>
                          <span className={isPopular ? "text-slate-200" : "text-slate-600"}>Acesso completo ao sistema</span>
                        </li>
                        <li className="flex items-start gap-3 text-sm font-medium">
                          <div className={`mt-0.5 rounded-full p-1 ${isPopular ? "bg-primary/20" : "bg-primary/10"}`}>
                             <Check className={`h-3 w-3 shrink-0 ${isPopular ? "text-primary" : "text-primary"}`} />
                          </div>
                          <span className={isPopular ? "text-slate-200" : "text-slate-600"}>Suporte especializado</span>
                        </li>
                      </>
                    )}
                  </ul>

                  <Button
                    className={`h-16 w-full rounded-2xl text-xl font-black shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                      isPopular 
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-primary/40" 
                        : "bg-slate-100 text-slate-900 hover:bg-primary hover:text-white hover:shadow-primary/30"
                    }`}
                    onClick={() => openCheckout(plan.planId, plan.checkoutUrl)}
                  >
                    Assinar agora
                  </Button>
                </Card>
              );
            })}
          </div>
        </section>

        {/* CALL TO ACTION FINAL */}
        <section className="py-24">
          <div className="mx-auto w-full max-w-5xl px-4">
            <div className="rounded-[40px] bg-primary px-8 py-16 text-center text-primary-foreground shadow-2xl shadow-primary/40 sm:px-16">
              <h2 className="mb-6 text-3xl font-black sm:text-5xl">
                Comece agora a usar o IDEART Cloud
              </h2>
              <p className="mb-10 text-lg opacity-90 sm:text-xl">
                Junte-se a centenas de empresas que já transformaram sua forma de trabalhar.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Button asChild size="lg" variant="secondary" className="h-16 rounded-2xl px-12 text-xl font-black shadow-lg shadow-white/10 hover:shadow-white/20">
                  <Link to={trialSignupLink}>Criar conta grátis</Link>
                </Button>
              </div>
              <p className="mt-8 text-sm opacity-80">
                Teste grátis por 3 dias • Sem cartão de crédito • Suporte em português
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer id="contato" className="bg-[#0d1118] text-slate-300">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="h-8 w-8 rounded-lg bg-primary" />
                <span className="landing-heading text-sm font-bold tracking-[0.08em] text-white">IDEART CLOUD</span>
              </div>
              <p className="landing-card-copy max-w-xs text-slate-400">
                Plataforma para gráficas com foco em produtividade, controle e escala.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="landing-heading text-sm font-semibold uppercase tracking-[0.16em] text-slate-100">Produto</h4>
              <a href="#interface" className="block text-sm text-slate-400 transition-colors hover:text-primary">Interface</a>
              <a href="#funcionalidades" className="block text-sm text-slate-400 transition-colors hover:text-primary">Funcionalidades</a>
              <a href="#planos" className="block text-sm text-slate-400 transition-colors hover:text-primary">Planos</a>
            </div>

            <div className="space-y-3">
              <h4 className="landing-heading text-sm font-semibold uppercase tracking-[0.16em] text-slate-100">Empresa</h4>
              <Link to="/contato" className="block text-sm text-slate-400 transition-colors hover:text-primary">Contato</Link>
              <Link to="/suporte" className="block text-sm text-slate-400 transition-colors hover:text-primary">Suporte</Link>
              <Link to="/contato" className="block text-sm text-slate-400 transition-colors hover:text-primary">Parcerias</Link>
            </div>

            <div className="space-y-3">
              <h4 className="landing-heading text-sm font-semibold uppercase tracking-[0.16em] text-slate-100">Legal</h4>
              <Link to="/termos" className="block text-sm text-slate-400 transition-colors hover:text-primary">Termos de uso</Link>
              <Link to="/privacidade" className="block text-sm text-slate-400 transition-colors hover:text-primary">Privacidade</Link>
              <Link to="/compliance" className="block text-sm text-slate-400 transition-colors hover:text-primary">Compliance</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-white/[0.07]">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>(c) 2026 Ideart Cloud. Todos os direitos reservados.</span>
            <span className="uppercase tracking-[0.2em]">Feito para operações gráficas</span>
          </div>
        </div>
      </footer>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="landing-heading">Finalize sua assinatura</DialogTitle>
            <DialogDescription>
              Informe seus dados para gerar o pagamento do plano selecionado.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCheckout}>
            <div className="space-y-2">
              <Label htmlFor="checkout-email">E-mail</Label>
              <Input
                id="checkout-email"
                type="email"
                value={checkoutForm.email}
                onChange={(event) => setCheckoutForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="seu@email.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="checkout-name">Nome</Label>
              <Input
                id="checkout-name"
                value={checkoutForm.fullName}
                onChange={(event) => setCheckoutForm((prev) => ({ ...prev, fullName: event.target.value }))}
                placeholder="Seu nome completo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="checkout-company">Empresa</Label>
              <Input
                id="checkout-company"
                value={checkoutForm.companyName}
                onChange={(event) => setCheckoutForm((prev) => ({ ...prev, companyName: event.target.value }))}
                placeholder="Nome da empresa"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={checkoutLoading} className="landing-btn">
                {checkoutLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Gerando pagamento...
                  </>
                ) : (
                  "Continuar para pagamento"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

