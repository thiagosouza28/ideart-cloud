import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Loader2, Mail, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CpfCnpjInput, PhoneInput, formatCpfCnpj, formatPhone, normalizeDigits, validateCpfCnpj, validatePhone } from "@/components/ui/masked-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_TRIAL_DAYS } from "@/services/subscription";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const randomSuffix = () => Math.random().toString(36).slice(2, 8);

export default function Onboarding() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, company, refreshCompany, refreshUserData } = useAuth();
  const [loading, setLoading] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    whatsapp: "",
    address: "",
    city: "",
    state: "",
    email: "",
    document: "",
  });

  useEffect(() => {
    if (company) {
      const nextForm = {
        name: company.name ?? "",
        phone: company.phone ? formatPhone(company.phone) : "",
        whatsapp: company.whatsapp ? formatPhone(company.whatsapp) : "",
        address: company.address ?? "",
        city: company.city ?? "",
        state: company.state ?? "",
        email: company.email ?? "",
        document: (company as { document?: string | null }).document
          ? formatCpfCnpj((company as { document?: string | null }).document ?? "")
          : "",
      };
      setFormData(nextForm);
      setInitialSnapshot(JSON.stringify(nextForm));
    }
  }, [company]);

  const formSnapshotJson = useMemo(() => JSON.stringify(formData), [formData]);
  const isDirty = initialSnapshot !== null && initialSnapshot !== formSnapshotJson;

  useEffect(() => {
    if (!company && initialSnapshot === null) {
      setInitialSnapshot(formSnapshotJson);
    }
  }, [company, initialSnapshot, formSnapshotJson]);

  useUnsavedChanges(isDirty && !loading);

  useEffect(() => {
    if (!company?.completed) return;

    if (profile?.password_defined || profile?.must_change_password === false) {
      navigate("/dashboard", { replace: true });
      return;
    }

    navigate("/alterar-senha", { replace: true });
  }, [company?.completed, navigate, profile?.must_change_password, profile?.password_defined]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const requiredFields: Array<keyof typeof formData> = [
      "name",
      "phone",
      "whatsapp",
      "address",
      "city",
      "state",
      "email",
    ];

    const hasMissing = requiredFields.some((key) => !formData[key].trim());
    if (hasMissing) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos para continuar.",
        variant: "destructive",
      });
      return;
    }

    if (!validatePhone(formData.phone) || !validatePhone(formData.whatsapp)) {
      toast({
        title: "Telefone inválido",
        description: "Use um celular brasileiro válido.",
        variant: "destructive",
      });
      return;
    }

    if (formData.document) {
      const { valid } = validateCpfCnpj(formData.document);
      if (!valid) {
        toast({
          title: "Documento inválido",
          description: "Informe um CPF ou CNPJ válido.",
          variant: "destructive",
        });
        return;
      }
    }

    if (!user) {
      toast({
        title: "Erro",
        description: "Usuário não autenticado.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + DEFAULT_TRIAL_DAYS);
      const trialEndIso = trialEnd.toISOString();

      let companyId = profile?.company_id ?? company?.id ?? null;
      const documentDigits = formData.document ? normalizeDigits(formData.document) : null;
      const phoneDigits = normalizeDigits(formData.phone);
      const whatsappDigits = normalizeDigits(formData.whatsapp);
      if (companyId) {
        const { error: companyError } = await supabase
          .from("companies")
          .update({
            name: formData.name.trim(),
            phone: phoneDigits,
            whatsapp: whatsappDigits,
            address: formData.address.trim(),
            city: formData.city.trim(),
            state: formData.state.trim(),
            email: formData.email.trim() || null,
            document: documentDigits,
            completed: true,
          })
          .eq("id", companyId);

        if (companyError) {
          throw companyError;
        }
      } else {
        const baseSlug = slugify(formData.name.trim() || "empresa") || "empresa";
        const slug = `${baseSlug}-${randomSuffix()}`;
        const { data: createdCompany, error: createError } = await supabase
          .from("companies")
          .insert({
            name: formData.name.trim(),
            slug,
            phone: phoneDigits,
            whatsapp: whatsappDigits,
            address: formData.address.trim(),
            city: formData.city.trim(),
            state: formData.state.trim(),
            email: formData.email.trim() || null,
            document: documentDigits,
            completed: true,
            is_active: true,
            subscription_status: "trial",
            subscription_start_date: now.toISOString(),
            subscription_end_date: trialEndIso,
            trial_active: true,
            trial_ends_at: trialEndIso,
            owner_user_id: user.id,
          })
          .select("id")
          .single();

        if (createError || !createdCompany?.id) {
          throw createError ?? new Error("Falha ao criar empresa");
        }
        companyId = createdCompany.id;

        await supabase
          .from("profiles")
          .update({ company_id: companyId })
          .eq("id", user.id);

        const { data: existingSubscription } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("company_id", companyId)
          .maybeSingle();

        if (!existingSubscription?.id) {
          await supabase.from("subscriptions").insert({
            user_id: user.id,
            company_id: companyId,
            plan_id: null,
            status: "trial",
            trial_ends_at: trialEndIso,
            current_period_ends_at: trialEndIso,
            gateway: "trial",
          });
        }
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ must_complete_onboarding: false, must_complete_company: false })
        .eq("id", user.id);

      if (profileError) {
        throw profileError;
      }

      await refreshCompany();
      await refreshUserData();

      toast({
        title: "Dados salvos",
        description: "Cadastro da empresa concluído.",
      });

      if (profile?.password_defined || profile?.must_change_password === false) {
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/alterar-senha", { replace: true });
      }
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
            Preencha os dados obrigatórios para liberar o sistema.
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
                <PhoneInput
                  id="phone"
                  placeholder="(11) 12345-6789"
                  value={formData.phone}
                  onChange={(value) => setFormData({ ...formData, phone: value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp *</Label>
                <PhoneInput
                  id="whatsapp"
                  placeholder="(11) 91234-5678"
                  value={formData.whatsapp}
                  onChange={(value) => setFormData({ ...formData, whatsapp: value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  E-mail comercial *
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="contato@empresa.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="document">CNPJ ou CPF (opcional)</Label>
                <CpfCnpjInput
                  id="document"
                  placeholder="00.000.000/0000-00"
                  value={formData.document}
                  onChange={(value) => setFormData({ ...formData, document: value })}
                />
              </div>
            </div>

            <div className="space-y-4">
              <Label className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Endereço *
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
