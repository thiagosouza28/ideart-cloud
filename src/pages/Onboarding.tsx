import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Loader2, Mail, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export default function Onboarding() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, company, refreshCompany, refreshUserData } = useAuth();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    whatsapp: "",
    address: "",
    city: "",
    state: "",
    email: "",
  });

  useEffect(() => {
    if (company) {
      setFormData({
        name: company.name ?? "",
        phone: company.phone ?? "",
        whatsapp: company.whatsapp ?? "",
        address: company.address ?? "",
        city: company.city ?? "",
        state: company.state ?? "",
        email: company.email ?? "",
      });
    }
  }, [company]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const requiredFields: Array<keyof typeof formData> = [
      "name",
      "phone",
      "whatsapp",
      "address",
      "city",
      "state",
    ];

    const hasMissing = requiredFields.some((key) => !formData[key].trim());
    if (hasMissing) {
      toast({
        title: "Campos obrigatorios",
        description: "Preencha todos os campos para continuar.",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Erro",
        description: "Usuario nao autenticado.",
        variant: "destructive",
      });
      return;
    }

    const companyId = profile?.company_id ?? company?.id ?? null;
    if (!companyId) {
      toast({
        title: "Empresa nao encontrada",
        description: "Entre em contato com o suporte para liberar o acesso.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error: companyError } = await supabase
        .from("companies")
        .update({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          whatsapp: formData.whatsapp.trim(),
          address: formData.address.trim(),
          city: formData.city.trim(),
          state: formData.state.trim(),
          email: formData.email.trim() || null,
        })
        .eq("id", companyId);

      if (companyError) {
        throw companyError;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ must_complete_onboarding: false })
        .eq("id", user.id);

      if (profileError) {
        throw profileError;
      }

      await refreshCompany();
      await refreshUserData();

      toast({
        title: "Dados salvos",
        description: "Agora defina sua nova senha.",
      });

      navigate("/alterar-senha", { replace: true });
    } catch (error) {
      console.error("Onboarding error:", error);
      toast({
        title: "Erro ao salvar",
        description: "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Configure sua Empresa</CardTitle>
          <CardDescription>
            Preencha os dados obrigatorios para liberar o sistema.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Nome da Empresa *
              </Label>
              <Input
                id="name"
                placeholder="Minha Empresa"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Telefone *
                </Label>
                <Input
                  id="phone"
                  placeholder="(11) 1234-5678"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp *</Label>
                <Input
                  id="whatsapp"
                  placeholder="(11) 91234-5678"
                  value={formData.whatsapp}
                  onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email comercial
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="contato@empresa.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-4">
              <Label className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Endereco *
              </Label>
              <Input
                placeholder="Rua, numero, bairro"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                required
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  placeholder="Cidade"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  required
                />
                <Input
                  placeholder="Estado"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar e continuar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
