import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
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
  status?: string | null;
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
          status: offer.status ? String(offer.status) : null,
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

    if (activeOffers.length) {
      return activeOffers.map((offer) => {
        const matchingPlan = plans.find(
          (plan) => normalizeOfferId(plan.cakto_plan_id ?? undefined) === offer.id
        );
        const billing =
          offer.intervalType === "year" || offer.intervalType === "yearly"
            ? "yearly"
            : "monthly";
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
      });
    }

    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description ?? null,
      price: plan.price,
      billing_period: plan.billing_period,
      features: plan.features ?? [],
      planId: plan.id,
      checkoutUrl: null,
    }));
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
      toast.error("Plano ainda não configurado para checkout.");
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
        throw new Error("Checkout indisponível no momento.");
      }

      window.location.href = checkoutUrl;
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Erro ao iniciar o checkout.";
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
            <span className="landing-heading text-base font-extrabold tracking-[0.04em]">GRAFICAERP</span>
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

      <main className="overflow-hidden">
        <section id="inicio" className="landing-hero-grid relative isolate pt-20">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="landing-blob absolute left-[8%] top-24 h-64 w-64 rounded-full bg-primary" />
            <div className="landing-blob absolute right-[10%] top-28 h-72 w-72 rounded-full bg-info" />
          </div>

          <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-14 pt-20 sm:pt-24">
            <span className="landing-hero-anim landing-hero-delay-1 inline-flex w-fit items-center gap-2 rounded-full border border-foreground/10 bg-card/85 px-4 py-2 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Novo - versão 2.6 disponível
            </span>

            <div className="space-y-5">
              <h1 className="landing-heading landing-hero-title landing-hero-anim landing-hero-delay-2 max-w-4xl text-foreground">
                Gestão completa para gráfica com{" "}
                <span className="landing-gradient-text">controle em tempo real</span>.
              </h1>
              <p className="landing-copy landing-hero-anim landing-hero-delay-3 max-w-[560px] text-muted-foreground">
                Organize pedidos, produção, estoque e vendas em um fluxo único, com clareza visual e
                velocidade para equipes que precisam entregar mais todos os dias.
              </p>
            </div>

            <div className="landing-hero-anim landing-hero-delay-4 flex flex-wrap items-center gap-3">
              <Button asChild className="landing-btn h-12 rounded-full px-7 text-primary-foreground">
                <Link to={trialSignupLink}>Testar por 3 dias</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="landing-btn h-12 rounded-full border-foreground/20 bg-transparent px-7 text-foreground hover:bg-foreground/5"
              >
                <a href="#interface">Ver interface</a>
              </Button>
            </div>
            <p className="landing-hero-anim landing-hero-delay-5 text-sm text-muted-foreground">
              Comece agora com teste gratis de 3 dias e cadastro rapido.
            </p>

            <div className="landing-hero-anim landing-hero-delay-5 grid w-full max-w-3xl gap-3 sm:grid-cols-3">
              {heroStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-foreground/10 bg-card/90 px-4 py-3 shadow-[0_12px_32px_rgba(15,23,42,0.06)]"
                >
                  <p className="landing-heading text-2xl font-extrabold leading-tight text-foreground">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-[0.83rem] uppercase tracking-[0.18em] text-muted-foreground">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="interface" className="mx-auto w-full max-w-6xl px-4 pb-20">
          <div className="reveal space-y-4">
            <p className="landing-section-label text-muted-foreground">Interface real do sistema</p>
            <h2 className="landing-heading landing-section-title max-w-3xl text-foreground">
              Veja pedidos, indicadores e operação em uma única tela.
            </h2>
          </div>

          <div className="reveal reveal-delay-1 mt-8 rounded-[30px] border border-foreground/10 bg-card/80 p-3 shadow-[0_26px_70px_rgba(15,23,42,0.14)]">
            <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#14181f] shadow-[0_30px_90px_rgba(2,6,23,0.55)] [transform:perspective(1200px)_rotateX(3deg)] transition-transform duration-500 hover:[transform:perspective(1200px)_rotateX(0deg)]">
              <div className="flex items-center gap-3 border-b border-white/10 bg-[#1c2230] px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                </div>
                <div className="ml-2 flex-1 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[0.72rem] text-slate-300">
                  app.graficaerp.com/dashboard
                </div>
              </div>

              <div className="grid min-h-[380px] grid-cols-1 lg:grid-cols-[220px_1fr]">
                <aside className="border-r border-white/10 bg-[#171d29] p-4">
                  <div className="mb-6 flex items-center gap-2 text-white">
                    <span className="h-7 w-7 rounded-md bg-primary" />
                    <span className="landing-heading text-sm font-bold tracking-[0.08em]">GRAFICAERP</span>
                  </div>
                  <div className="space-y-2 text-[0.86rem] text-slate-400">
                    {["Dashboard", "Pedidos", "Clientes", "Estoque", "Financeiro"].map((item, index) => (
                      <div
                        key={item}
                        className={`rounded-lg px-3 py-2 ${
                          index === 1 ? "bg-primary/20 text-primary-foreground" : "hover:bg-white/5"
                        }`}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </aside>

                <div className="bg-[#0f141f] p-4 lg:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="w-full max-w-[280px] rounded-lg border border-white/10 bg-[#151b29] px-3 py-2 text-[0.82rem] text-slate-400">
                      Buscar pedido, cliente ou produto...
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <span className="h-8 w-8 rounded-full bg-primary/30" />
                      Iane Teles
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    {previewMetrics.map((metric) => (
                      <div key={metric.label} className="rounded-xl border border-white/10 bg-[#141b29] p-3">
                        <p className="text-[0.72rem] uppercase tracking-[0.16em] text-slate-400">{metric.label}</p>
                        <p className="landing-heading mt-1 text-xl font-bold text-white">{metric.value}</p>
                        <p className="text-[0.78rem] text-emerald-400">{metric.trend}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
                    <table className="w-full border-collapse text-left text-[0.84rem] text-slate-300">
                      <thead className="bg-white/5 text-[0.7rem] uppercase tracking-[0.16em] text-slate-400">
                        <tr>
                          <th className="px-4 py-3 font-medium">Pedido</th>
                          <th className="px-4 py-3 font-medium">Cliente</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row) => (
                          <tr key={row.order} className="border-t border-white/10">
                            <td className="px-4 py-3">{row.order}</td>
                            <td className="px-4 py-3">{row.customer}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.72rem] font-medium ${row.badge}`}>
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="funcionalidades" className="bg-[#0f131b] py-20 text-slate-100">
          <div className="mx-auto w-full max-w-6xl px-4">
            <div className="reveal space-y-4">
              <p className="landing-section-label text-slate-400">Funcionalidades</p>
              <h2 className="landing-heading landing-section-title max-w-3xl text-slate-100">
                Tudo que uma operação gráfica precisa para crescer sem perder controle.
              </h2>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {featureCards.map((feature, index) => (
                <Card
                  key={feature.title}
                  className={`landing-feature-card reveal border border-white/10 bg-white/5 shadow-none ${
                    index === 1 ? "reveal-delay-1" : index === 2 ? "reveal-delay-2" : index === 3 ? "reveal-delay-3" : ""
                  }`}
                >
                  <CardContent className="space-y-4 p-6">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-xl">
                      {feature.icon}
                    </span>
                    <h3 className="landing-heading text-xl font-bold text-white">{feature.title}</h3>
                    <p className="landing-card-copy text-slate-300">{feature.description}</p>
                    <span className="inline-flex rounded-full border border-white/15 px-3 py-1 text-[0.72rem] uppercase tracking-[0.14em] text-slate-300">
                      {feature.tag}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="planos" className="mx-auto w-full max-w-6xl px-4 py-20">
          <div className="reveal space-y-4">
            <p className="landing-section-label text-muted-foreground">Planos</p>
            <h2 className="landing-heading landing-section-title max-w-3xl text-foreground">
              Escolha o plano certo para escalar a sua gráfica.
            </h2>
            <p className="landing-copy max-w-[560px] text-muted-foreground">
              Todos os planos incluem atualizações, segurança e suporte para manter sua operação estável.
            </p>
          </div>

          {offersLoading && (
            <p className="mt-4 text-sm text-muted-foreground">Carregando planos da Cakto...</p>
          )}

          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {displayPlans.map((plan, index) => {
              const isPopular = maxPrice > 0 && plan.price === maxPrice;
              return (
                <Card
                  key={plan.id}
                  className={`landing-plan-card reveal border ${
                    isPopular
                      ? "border-primary/35 bg-[#101827] text-slate-100 shadow-[0_20px_50px_hsl(var(--primary)/0.22)]"
                      : "border-border bg-card/90 text-foreground"
                  } ${index === 1 ? "reveal-delay-1" : index === 2 ? "reveal-delay-2" : index === 3 ? "reveal-delay-3" : ""}`}
                >
                  <CardContent className="relative p-6">
                    {isPopular && (
                      <span className="absolute right-6 top-5 rounded-full bg-amber-400 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-amber-950">
                        Popular
                      </span>
                    )}

                    <p className={`landing-heading text-[0.78rem] font-semibold uppercase tracking-[0.2em] ${isPopular ? "text-slate-400" : "text-muted-foreground"}`}>
                      {plan.name}
                    </p>
                    <p className={`landing-card-copy mt-3 ${isPopular ? "text-slate-300" : "text-muted-foreground"}`}>
                      {plan.description || "Plano cadastrado na Cakto."}
                    </p>

                    <div className="mt-6">
                      <p className={`landing-heading text-4xl font-extrabold ${isPopular ? "text-white" : "text-foreground"}`}>
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(plan.price)}
                      </p>
                      <p className={`mt-1 text-[0.84rem] ${isPopular ? "text-slate-400" : "text-muted-foreground"}`}>
                        por {plan.billing_period === "monthly" ? "mês" : "ano"}
                      </p>
                    </div>

                    <ul className="mt-5 space-y-2.5">
                      {(plan.features || []).map((feature) => (
                        <li key={feature} className={`flex items-start gap-2.5 text-[0.88rem] ${isPopular ? "text-slate-200" : "text-foreground"}`}>
                          <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      className="landing-btn mt-7 h-11 w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => openCheckout(plan.planId, plan.checkoutUrl)}
                      disabled={!plan.planId && !plan.checkoutUrl}
                    >
                      {!plan.planId && plan.checkoutUrl
                        ? "Assinar agora"
                        : plan.planId
                          ? "Assinar agora"
                          : "Em configuração"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </main>

      <footer id="contato" className="bg-[#0d1118] text-slate-300">
        <div className="mx-auto w-full max-w-6xl px-4 py-14">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="h-8 w-8 rounded-lg bg-primary" />
                <span className="landing-heading text-sm font-bold tracking-[0.08em] text-white">GRAFICAERP</span>
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
              <a href="#contato" className="block text-sm text-slate-400 transition-colors hover:text-primary">Contato</a>
              <a href="#contato" className="block text-sm text-slate-400 transition-colors hover:text-primary">Suporte</a>
              <a href="#contato" className="block text-sm text-slate-400 transition-colors hover:text-primary">Parcerias</a>
            </div>

            <div className="space-y-3">
              <h4 className="landing-heading text-sm font-semibold uppercase tracking-[0.16em] text-slate-100">Legal</h4>
              <a href="#contato" className="block text-sm text-slate-400 transition-colors hover:text-primary">Termos de uso</a>
              <a href="#contato" className="block text-sm text-slate-400 transition-colors hover:text-primary">Privacidade</a>
              <a href="#contato" className="block text-sm text-slate-400 transition-colors hover:text-primary">Compliance</a>
            </div>
          </div>
        </div>
        <div className="border-t border-white/[0.07]">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>(c) 2026 GraficaERP. Todos os direitos reservados.</span>
            <span className="uppercase tracking-[0.2em]">Feito para operações gráficas</span>
          </div>
        </div>
      </footer>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="landing-heading">Finalize sua assinatura</DialogTitle>
            <DialogDescription>
              Informe seus dados para gerar o checkout do plano selecionado.
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
                    Gerando checkout...
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

