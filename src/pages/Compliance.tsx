import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Lock, Search, FileCheck } from "lucide-react";
import { Link } from "react-router-dom";

const Compliance = () => {
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

      <main className="mx-auto max-w-7xl px-6 py-20 text-center">
        <h1 className="mb-4 text-4xl font-black tracking-tight sm:text-6xl text-center">Compliance</h1>
        <p className="mx-auto mb-20 max-w-2xl text-lg text-slate-500 text-center">
          Transparência, ética e segurança em todos os processos.
        </p>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4 text-left">
          <Card className="border-2 border-slate-100 p-8 shadow-xl shadow-slate-200/50">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Shield className="h-7 w-7 text-primary" />
            </div>
            <h3 className="mb-4 text-xl font-black">LGPD Ready</h3>
            <p className="text-slate-500 leading-relaxed">
              Sistema em total conformidade com a Lei Geral de Proteção de Dados (13.709/2018).
            </p>
          </Card>

          <Card className="border-2 border-slate-100 p-8 shadow-xl shadow-slate-200/50">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Lock className="h-7 w-7 text-primary" />
            </div>
            <h3 className="mb-4 text-xl font-black">Criptografia SSL</h3>
            <p className="text-slate-500 leading-relaxed">
               Todos os dados trafegados entre seu computador e o servidor são criptografados de ponta a ponta.
            </p>
          </Card>

          <Card className="border-2 border-slate-100 p-8 shadow-xl shadow-slate-200/50">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Search className="h-7 w-7 text-primary" />
            </div>
            <h3 className="mb-4 text-xl font-black">Auditoria</h3>
            <p className="text-slate-500 leading-relaxed">
              Logs de acesso e auditoria interna em todos os registros críticos para sua segurança.
            </p>
          </Card>

          <Card className="border-2 border-slate-100 p-8 shadow-xl shadow-slate-200/50">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <FileCheck className="h-7 w-7 text-primary" />
            </div>
            <h3 className="mb-4 text-xl font-black">Código Ético</h3>
            <p className="text-slate-500 leading-relaxed">
               Nossas operações internas seguem controles rígidos de integridade e ética comercial.
            </p>
          </Card>
        </div>
      </main>

      <footer className="border-t bg-slate-50 py-12 text-center text-sm text-slate-400">
        &copy; {new Date().getFullYear()} IDEART CLOUD - Todos os direitos reservados.
      </footer>
    </div>
  );
};

export default Compliance;
