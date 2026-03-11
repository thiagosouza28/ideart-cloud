import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Privacy = () => {
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
        <h1 className="mb-10 text-4xl font-black tracking-tight sm:text-6xl">Política de Privacidade</h1>
        
        <div className="prose prose-slate max-w-none space-y-8 text-lg leading-relaxed text-slate-600">
          <section className="space-y-4">
            <h2 className="text-2xl font-black text-slate-900">1. Coleta de Dados</h2>
            <p>
              Coletamos informações necessárias para a operacionalização da sua gráfica, como dados da empresa, usuários e cadastros de clientes efetuados por você no sistema.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-black text-slate-900">2. Uso das Informações</h2>
            <p>
              Seus dados nunca serão compartilhados com terceiros. Eles são utilizados exclusivamente para autenticação, processamento de pedidos e emissão de relatórios financeiros internos de sua empresa.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-black text-slate-900">3. Segurança</h2>
            <p>
              Utilizamos infraestrutura em nuvem de alta segurança (Supabase/Azure) para garantir a criptografia e proteção das informações de seu negócio.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-black text-slate-900">4. Seus Direitos (LGPD)</h2>
            <p>
               Você tem o direito de acessar, editar e exportar seus dados a qualquer momento através do painel de configurações do IDEART Cloud.
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

export default Privacy;
