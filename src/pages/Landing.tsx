import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Sparkles } from "lucide-react";
import type { Plan } from "@/types/database";

const fallbackPlans: Plan[] = [
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
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    const loadPlans = async () => {
      const { data } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("price", { ascending: true });
      setPlans((data || []) as Plan[]);
    };
    loadPlans();
  }, []);

  const displayPlans = useMemo(() => (plans.length ? plans : fallbackPlans), [plans]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
              GE
            </div>
            <div className="leading-tight">
              <p className="text-lg font-semibold">GraficaERP</p>
              <p className="text-xs text-slate-500">Plataforma SaaS</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="text-sm">
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild className="text-sm">
              <Link to="/auth">Adquirir Sistema</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-6">
            <Badge variant="secondary" className="w-fit">
              Experiencia app-like
            </Badge>
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
              Venda, produza e gerencie sua grafica em um <span className="text-primary">unico lugar</span>
            </h1>
            <p className="text-lg text-slate-600">
              Catalogo inteligente, PDV rapido e producao organizada para acelerar suas vendas e otimizar seu negocio.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/auth">Adquirir Sistema</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/auth">Entrar</Link>
              </Button>
            </div>
          </div>

          <Card className="border-slate-200 shadow-lg">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Sparkles className="h-4 w-4 text-primary" />
                Destaques
              </div>
              {[
                "Catalogo digital com descricao inteligente",
                "Pedidos e PDV integrados",
                "Kanban de producao em tempo real",
                "Relatorios e financeiro sempre atualizados",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm text-slate-600">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-12">
        <div className="grid gap-6 md:grid-cols-2">
          {[
            {
              title: "Catalogo digital",
              text: "Configure cores, fontes e layout. Controle produtos em destaque, precos e contato direto.",
            },
            {
              title: "Pedidos e PDV",
              text: "Fluxo rapido de vendas com uma mao, pagamentos integrados e emissao de recibos.",
            },
            {
              title: "Producao e Kanban",
              text: "Arraste pedidos entre etapas e acompanhe a fila de producao em tempo real.",
            },
            {
              title: "Financeiro e relatorios",
              text: "Indicadores, metas e controle total de receitas e despesas em uma visao clara.",
            },
          ].map((card) => (
            <Card key={card.title} className="border-slate-200">
              <CardContent className="p-6">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <span className="text-sm font-semibold">GE</span>
                </div>
                <h3 className="text-base font-semibold">{card.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{card.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Conheca a interface por dentro</h2>
          <p className="mt-2 text-sm text-slate-500">
            Uma experiencia visual moderna e intuitiva, desenhada para facilitar o dia a dia da sua grafica.
          </p>
        </div>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-100 p-6 shadow-lg">
          <div className="rounded-xl bg-white p-6">
            <div className="grid grid-cols-[72px_1fr] gap-6">
              <div className="space-y-3">
                <div className="h-3 w-12 rounded-full bg-slate-200" />
                <div className="h-3 w-16 rounded-full bg-slate-200" />
                <div className="h-3 w-14 rounded-full bg-slate-200" />
              </div>
              <div className="space-y-6">
                <div className="grid grid-cols-5 gap-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={index}
                      className={`h-16 rounded-lg ${index === 2 ? "bg-primary" : "bg-slate-200"}`}
                    />
                  ))}
                </div>
                <div className="h-3 w-full rounded-full bg-slate-200" />
                <div className="h-3 w-5/6 rounded-full bg-slate-200" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-semibold mb-6">Planos e precos</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {displayPlans.map((plan) => (
            <Card key={plan.id} className="border-slate-200 shadow-sm">
              <CardContent className="p-6 space-y-4">
                <div>
                  <h3 className="text-base font-semibold">{plan.name}</h3>
                  <p className="text-sm text-slate-500">{plan.description}</p>
                </div>
                <div className="text-3xl font-bold">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(plan.price)}
                  <span className="text-sm text-slate-500">/{plan.billing_period === "monthly" ? "mes" : "ano"}</span>
                </div>
                <ul className="space-y-2 text-sm text-slate-600">
                  {(plan.features || []).map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button asChild className="w-full">
                  <Link to="/auth">Assinar Agora</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2 md:grid-cols-3">
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
        <div className="border-t">
          <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-400">
            © 2024 GraficaERP. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}
