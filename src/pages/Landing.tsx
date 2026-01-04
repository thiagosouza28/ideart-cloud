import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { Plan } from "@/types/database";
import { createCaktoCheckout, listCaktoOffers } from "@/services/cakto";
import { toast } from "sonner";
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

const fallbackPlans: PlanWithCakto[] = [
  {
    id: "fallback-monthly",
    name: "Plano Mensal",
    description: "30 dias de acesso completo",
    price: 19.9,
    billing_period: "monthly",
    features: ["Acesso ilimitado", "Suporte prioritario", "Backup diario"],
    is_active: true,
    created_at: "",
    updated_at: "",
  },
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

  useEffect(() => {
    const loadPlans = async () => {
      const { data } = await supabase
        .from("plans")
        .select("id,name,description,price,billing_period,features,is_active,cakto_plan_id")
        .eq("is_active", true)
        .order("price", { ascending: true });
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

  const normalizeOfferId = (value?: string | null) => {
    if (!value) return null;
    if (value.startsWith("http")) {
      return value.split("/").pop() ?? null;
    }
    return value;
  };

  const displayPlans = useMemo<DisplayPlan[]>(() => {
    if (offers.length) {
      return offers
        .filter((offer) => offer.status !== "inactive" && offer.status !== "disabled")
        .map((offer) => {
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

    const basePlans = plans.length ? plans : fallbackPlans;
    return basePlans.map((plan) => ({
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
      const checkoutUrl = (resp as any)?.checkout_url;

      if (!checkoutUrl) {
        throw new Error("Checkout indisponivel no momento.");
      }

      window.location.href = checkoutUrl;
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "Erro ao iniciar o checkout.");
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-white">
              <div className="h-3 w-3 rounded-full border-2 border-white" />
            </div>
            <span className="text-base font-semibold">GráficaERP</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-slate-500 md:flex">
            <a href="#interface" className="hover:text-slate-900">Interface</a>
            <a href="#funcionalidades" className="hover:text-slate-900">Funcionalidades</a>
            <a href="#planos" className="hover:text-slate-900">Planos</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="h-9 rounded-full border-slate-200 px-5 text-sm font-medium text-slate-600"
            >
              <a href="#planos">Adquirir Sistema</a>
            </Button>
            <Button asChild className="h-9 rounded-full bg-blue-600 px-5 text-sm font-medium shadow-sm hover:bg-blue-700">
              <Link to="/auth">Entrar</Link>
            </Button>
          </div>
        </div>
      </header>

      <section id="interface" className="mx-auto max-w-6xl px-4 py-16">
        <div className="text-center">
          <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
            Conheca a interface por dentro
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500">
            Uma experiencia visual moderna e intuitiva, desenhada para facilitar o dia a dia da sua grafica.
            Gerencie tudo em um só lugar com eficiência.
          </p>
        </div>
        <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-400" />
              <span className="h-3 w-3 rounded-full bg-yellow-400" />
              <span className="h-3 w-3 rounded-full bg-green-400" />
            </div>
            <div className="mt-6 grid grid-cols-[60px_1fr] gap-6">
              <div className="space-y-3">
                <div className="h-2 w-10 rounded-full bg-slate-200" />
                <div className="h-2 w-14 rounded-full bg-slate-200" />
                <div className="h-2 w-12 rounded-full bg-slate-200" />
              </div>
              <div className="space-y-6">
                <div className="grid grid-cols-5 gap-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={index}
                      className={`h-14 rounded-xl ${index === 2 ? "bg-blue-300" : "bg-slate-200"}`}
                    />
                  ))}
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200" />
                <div className="h-2 w-5/6 rounded-full bg-slate-200" />
                <div className="h-2 w-2/3 rounded-full bg-slate-200" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="funcionalidades" className="mx-auto max-w-6xl px-4 pb-6">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Fluxos claros",
              text: "Organize producao, pedidos e PDV com status visuais e alertas.",
            },
            {
              title: "Catálogo eficiente",
              text: "Destaque produtos, personalize layout e compartilhe rapido.",
            },
            {
              title: "Financeiro simples",
              text: "Indicadores, metas e controle de receitas em um unico painel.",
            },
          ].map((card) => (
            <Card key={card.title} className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-6">
                <h3 className="text-sm font-semibold text-slate-800">{card.title}</h3>
                <p className="mt-2 text-sm text-slate-500">{card.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section id="planos" className="mx-auto max-w-6xl px-4 py-14">
        <div>
          <h2 className="text-xl font-semibold">Planos e precos</h2>
          <p className="mt-1 text-sm text-slate-500">Escolha o plano ideal para o seu negocio crescer.</p>
        </div>
        {offersLoading && (
          <p className="mt-4 text-sm text-slate-500">Carregando planos da Cakto...</p>
        )}
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {displayPlans.map((plan, index) => {
            const prices = displayPlans.map((item) => item.price || 0);
            const maxPrice = prices.length ? Math.max(...prices) : 0;
            const isPopular = plan.price === maxPrice && maxPrice > 0;
            return (
            <Card
              key={plan.id}
              className={`border-slate-200 bg-white shadow-sm ${isPopular ? "border-blue-400 shadow-[0_16px_40px_rgba(37,99,235,0.2)]" : ""}`}
            >
              <CardContent className="relative p-6">
                {isPopular && (
                  <span className="absolute right-6 top-5 rounded-full bg-blue-500 px-3 py-1 text-[10px] font-semibold uppercase text-white">
                    Popular
                  </span>
                )}
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">{plan.name}</p>
                  <p className="mt-2 text-sm text-slate-500">
                    {plan.description ? plan.description : "Plano cadastrado na Cakto."}
                  </p>
                </div>
                <div className="mt-6 text-3xl font-semibold text-slate-900">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(plan.price)}
                  <span className="text-sm font-medium text-slate-500">/{plan.billing_period === "monthly" ? "mes" : "ano"}</span>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                  {(plan.features || []).map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-6 h-10 w-full rounded-xl bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                  onClick={() => openCheckout(plan.planId, plan.checkoutUrl)}
                  disabled={!plan.planId && !plan.checkoutUrl}
                >
                  {!plan.planId && plan.checkoutUrl ? "Assinar Agora" : plan.planId ? "Assinar Agora" : "Em configuração"}
                </Button>
              </CardContent>
            </Card>
          )})}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-3">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Contato</h4>
            <p className="text-sm text-slate-500">contato@graficaerp.com.br</p>
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Termos</h4>
            <p className="text-sm text-slate-500">Termos de uso</p>
            <p className="text-sm text-slate-500">Politica de privacidade</p>
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Assinatura</h4>
            <p className="text-sm text-slate-500">Planos flexiveis para o seu negocio crescer sem amarras.</p>
          </div>
        </div>
        <div className="border-t border-slate-200">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 text-xs text-slate-400">
            <span>© 2024 GráficaERP. Todos os direitos reservados.</span>
            <div className="flex items-center gap-3">
              <span className="h-4 w-4 rounded-full border border-slate-300" />
              <span className="h-4 w-4 rounded-full border border-slate-300" />
            </div>
          </div>
        </div>
      </footer>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize sua assinatura</DialogTitle>
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
              <Button type="submit" disabled={checkoutLoading}>
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
