import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle, ArrowRight, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { completeCaktoSuccess } from "@/services/cakto";

const SubscriptionSuccess = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [manualRetrying, setManualRetrying] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const sessionId = searchParams.get("session_id");
  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) return;

    let timeout: number | undefined;
    setLoading(true);

    const run = async () => {
      try {
        const resp = await completeCaktoSuccess(token);
        const redirectUrl = (resp as any)?.redirect_url;
        if (redirectUrl) {
          window.location.href = redirectUrl;
          return;
        }

        const error = (resp as any)?.error;
        if (error) {
          setStatusMessage("Finalizando sua assinatura...");
          timeout = window.setTimeout(run, 3000);
        }
      } catch (error: any) {
        console.error("Error finishing checkout:", error);
        setStatusMessage(error?.message || "Falha ao validar assinatura.");
      } finally {
        setLoading(false);
        setManualRetrying(false);
      }
    };

    run();

    return () => {
      if (timeout) window.clearTimeout(timeout);
    };
  }, [token, retryCount]);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", user.id)
          .single();

        if (profile?.company_id) {
          const { data: company } = await supabase
            .from("companies")
            .select("name, plan_id, plans(name)")
            .eq("id", profile.company_id)
            .single();

          if (company) {
            setCompanyName(company.name);
            if (company.plans && typeof company.plans === "object" && "name" in company.plans) {
              setPlanName((company.plans as { name: string }).name);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching details:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [user]);

  if (!user && token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3 max-w-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">
            {statusMessage || "Finalizando sua assinatura..."}
          </p>
          <p className="text-xs text-muted-foreground">
            Se o pagamento acabou de ser aprovado, pode levar alguns segundos para ativar.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setManualRetrying(true);
                setRetryCount((prev) => prev + 1);
              }}
              disabled={manualRetrying || loading}
            >
              {manualRetrying || loading ? "Verificando..." : "Tentar novamente"}
            </Button>
            <Button asChild variant="ghost">
              <Link to="/assinatura">Voltar para os planos</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <Card className="w-full max-w-lg text-center border-primary/20 shadow-lg">
        <CardHeader className="pb-4">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            Assinatura Confirmada!
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Sua assinatura foi ativada com sucesso
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            {companyName && (
              <p className="text-sm text-muted-foreground">
                Empresa: <span className="font-medium text-foreground">{companyName}</span>
              </p>
            )}
            {planName && (
              <p className="text-sm text-muted-foreground">
                Plano: <span className="font-medium text-foreground">{planName}</span>
              </p>
            )}
            {sessionId && (
              <p className="text-xs text-muted-foreground/70 font-mono">
                ID: {sessionId.substring(0, 20)}...
              </p>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Você agora tem acesso a todos os recursos do seu plano. 
              Aproveite ao máximo sua experiência!
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <Button asChild size="lg" className="w-full">
              <Link to="/dashboard">
                Ir para o Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            
            <Button asChild variant="outline" size="lg" className="w-full">
              <Link to="/assinatura">
                Gerenciar Assinatura
                <ExternalLink className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SubscriptionSuccess;
