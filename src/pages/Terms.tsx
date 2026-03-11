import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Terms = () => {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-primary shadow-lg shadow-primary/20" />
            <span className="text-xl font-black tracking-tight">IDEART CLOUD</span>
          </Link>
          <Button asChild variant="ghost" className="font-bold">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="mb-10 text-4xl font-black tracking-tight sm:text-6xl">Termos de Uso</h1>
        
        <div className="prose prose-slate max-w-none space-y-8 text-lg leading-relaxed text-slate-600">
          <section className="space-y-4">
            <h2 className="text-2xl font-black text-slate-900">1. Aceitação dos Termos</h2>
            <p>
              Ao utilizar a plataforma IDEART Cloud, você concorda inteiramente com estes Termos de Uso. Este sistema foi desenvolvido para a gestão de gráficas, papelarias e serviços de personalizados, e seu uso deve respeitar as leis brasileiras vigentes.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-black text-slate-900">2. Uso da Plataforma</h2>
            <p>
              O IDEART Cloud é fornecido como Software como Serviço (SaaS). O usuário é responsável pela veracidade dos dados inseridos, pelas configurações de sua loja e pelo atendimento direto aos seus clientes.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-black text-slate-900">3. Planos e Pagamentos</h2>
            <p>
              Os serviços são disponibilizados mediante planos de assinatura (Mensal, Trimestral, Anual ou Vitalício). O atraso no pagamento poderá resultar na suspensão temporária do acesso às funcionalidades administrativas do sistema.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-black text-slate-900">4. Responsabilidades</h2>
            <p>
               Nós nos esforçamos para manter a plataforma ativa 99,9% do tempo, mas não nos responsabilizamos por perdas comerciais decorrentes de instabilidades momentâneas ou mau uso por parte do usuário.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t bg-slate-50 py-12 text-center text-sm text-slate-400">
        &copy; {new Date().getFullYear()} IDEART CLOUD - Todos os direitos reservados.
      </footer>
    </div>
  );
};

export default Terms;
