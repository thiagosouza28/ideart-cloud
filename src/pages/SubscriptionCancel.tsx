import { useState } from "react";
import { Link } from "react-router-dom";
import { XCircle, ArrowLeft, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const cancelReasons = [
  { value: "too_expensive", label: "Muito caro para o meu orçamento" },
  { value: "not_using", label: "Não estou usando o suficiente" },
  { value: "missing_features", label: "Faltam recursos que preciso" },
  { value: "found_alternative", label: "Encontrei uma alternativa melhor" },
  { value: "technical_issues", label: "Problemas técnicos frequentes" },
  { value: "other", label: "Outro motivo" },
];

const SubscriptionCancel = () => {
  const { toast } = useToast();
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [additionalFeedback, setAdditionalFeedback] = useState("");
  const [loading, setLoading] = useState(false);

  const handleManageSubscription = async () => {
    if (!selectedReason) {
      toast({
        title: "Selecione um motivo",
        description: "Por favor, nos diga por que deseja cancelar.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Log the cancellation feedback
      console.log("Cancellation feedback:", {
        reason: selectedReason,
        feedback: additionalFeedback,
      });

      toast({
        title: "Solicitação enviada",
        description: "Entraremos em contato para confirmar o cancelamento.",
      });
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Erro",
        description: "Não foi possível abrir o portal de gerenciamento.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <Card className="w-full max-w-lg border-destructive/20 shadow-lg">
        <CardHeader className="pb-4 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-10 w-10 text-destructive" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            Cancelar Assinatura
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Sentiremos sua falta! Antes de ir, nos ajude a melhorar.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Por que você está cancelando?
            </Label>
            <RadioGroup
              value={selectedReason}
              onValueChange={setSelectedReason}
              className="space-y-2"
            >
              {cancelReasons.map((reason) => (
                <div
                  key={reason.value}
                  className="flex items-center space-x-3 rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
                >
                  <RadioGroupItem value={reason.value} id={reason.value} />
                  <Label
                    htmlFor={reason.value}
                    className="flex-1 cursor-pointer text-sm"
                  >
                    {reason.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback" className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Algo mais que gostaria de compartilhar?
            </Label>
            <Textarea
              id="feedback"
              placeholder="Seu feedback nos ajuda a melhorar..."
              value={additionalFeedback}
              onChange={(e) => setAdditionalFeedback(e.target.value)}
              className="min-h-[100px] resize-none"
            />
          </div>

          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-4 border border-amber-200 dark:border-amber-800">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Lembre-se:</strong> Você ainda terá acesso aos recursos premium até o fim do período atual da sua assinatura.
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <Button
              onClick={handleManageSubscription}
              disabled={loading}
              variant="destructive"
              size="lg"
              className="w-full"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Continuar com Cancelamento
            </Button>

            <Button asChild variant="outline" size="lg" className="w-full">
              <Link to="/assinatura">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar e Manter Assinatura
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SubscriptionCancel;
