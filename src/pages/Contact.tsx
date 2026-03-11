import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, MessageSquare, Phone, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";

const Contact = () => {
  const [formData, setFormData] = useState({
    firstName: "",
    company: "",
    email: "",
    subject: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase.from("order_notifications").insert({
        title: `Novo Contato: ${formData.subject}`,
        body: JSON.stringify({
          name: formData.firstName,
          company: formData.company,
          email: formData.email,
          subject: formData.subject,
          message: formData.message
        }),
        type: "contact_form"
      });

      if (error) throw error;

      toast.success("Mensagem enviada com sucesso! Logo entraremos em contato.");
      setFormData({
        firstName: "",
        company: "",
        email: "",
        subject: "",
        message: ""
      });
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      toast.error("Erro ao enviar mensagem. Tente novamente mais tarde.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      {/* Header simples */}
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

      <main className="mx-auto max-w-7xl px-6 py-20">
        <div className="mb-16 text-center">
          <h1 className="mb-4 text-4xl font-black tracking-tight sm:text-6xl">Fale Conosco</h1>
          <p className="mx-auto max-w-2xl text-lg text-slate-500">
            Estamos aqui para ajudar você a transformar sua gráfica. Escolha o melhor canal de atendimento.
          </p>
        </div>

        <div className="grid gap-12 lg:grid-cols-2">
          {/* Informações de Contato */}
          <div className="space-y-8">
            <div className="grid gap-6 sm:grid-cols-2">
              <Card className="border-2 border-slate-100 shadow-xl shadow-slate-200/50">
                <CardContent className="p-8">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                    <MessageSquare className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mb-2 text-xl font-black">Suporte</h3>
                  <p className="text-sm text-slate-500">Dúvidas técnicas ou problemas no sistema.</p>
                  <p className="mt-4 font-bold text-primary">ideart.loja@gmail.com</p>
                </CardContent>
              </Card>

              <Card className="border-2 border-slate-100 shadow-xl shadow-slate-200/50">
                <CardContent className="p-8">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                    <Phone className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mb-2 text-xl font-black">Comercial</h3>
                  <p className="text-sm text-slate-500">Planos, parcerias e demonstrações.</p>
                  <p className="mt-4 font-bold text-primary">(91) 99332-0376</p>
                </CardContent>
              </Card>
            </div>

            <div className="rounded-3xl border-2 border-slate-100 bg-slate-50 p-8">
              <h3 className="mb-6 text-2xl font-black">Nossos canais oficiais</h3>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-md">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold">E-mail</p>
                    <p className="text-slate-500">ideart.loja@gmail.com</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-md">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold">Endereço</p>
                    <p className="text-slate-500 text-sm leading-relaxed">
                      Rod PA 252 km 36 Ramal da Campina,<br />
                      Moju-PA - CEP: 68.450-000
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Formulário */}
          <Card className="rounded-[2.5rem] border-2 border-slate-100 p-10 shadow-2xl shadow-slate-200/60">
            <h2 className="mb-8 text-3xl font-black">Envie sua mensagem</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="font-bold">Nome</Label>
                  <Input 
                    id="firstName" 
                    placeholder="Seu nome" 
                    className="h-12 rounded-xl" 
                    required 
                    value={formData.firstName}
                    onChange={(e) => setFormData(p => ({ ...p, firstName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company" className="font-bold">Empresa</Label>
                  <Input 
                    id="company" 
                    placeholder="Nome da sua gráfica" 
                    className="h-12 rounded-xl" 
                    required 
                    value={formData.company}
                    onChange={(e) => setFormData(p => ({ ...p, company: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="font-bold">E-mail corporativo</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="seu@email.com" 
                  className="h-12 rounded-xl" 
                  required 
                  value={formData.email}
                  onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject" className="font-bold">Assunto</Label>
                <Input 
                  id="subject" 
                  placeholder="Como podemos ajudar?" 
                  className="h-12 rounded-xl" 
                  required 
                  value={formData.subject}
                  onChange={(e) => setFormData(p => ({ ...p, subject: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message" className="font-bold">Mensagem</Label>
                <Textarea 
                  id="message" 
                  placeholder="Descreva sua necessidade..." 
                  className="min-h-[150px] rounded-xl" 
                  required 
                  value={formData.message}
                  onChange={(e) => setFormData(p => ({ ...p, message: e.target.value }))}
                />
              </div>
              <Button type="submit" disabled={isSubmitting} className="h-14 w-full rounded-2xl text-lg font-black shadow-lg shadow-primary/25 transition-all hover:scale-[1.02]">
                {isSubmitting ? "Enviando..." : "Enviar Mensagem"}
              </Button>
            </form>
          </Card>
        </div>
      </main>

      <footer className="border-t bg-slate-50 py-12">
        <div className="mx-auto max-w-7xl px-6 text-center">
          <p className="text-sm text-slate-400">
            &copy; {new Date().getFullYear()} IDEART CLOUD - Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Contact;
