import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Loader2 } from "lucide-react";
import { invokePublicFunction } from "@/services/publicFunctions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      await invokePublicFunction("password-recovery", { email: email.trim() });
      setNotice("Se o e-mail estiver cadastrado, enviamos um link de recuperação.");
    } catch {
      setError("Não foi possível enviar o e-mail de recuperação.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sidebar via-sidebar/95 to-sidebar/90 p-4">
      <Card className="w-full max-w-md shadow-xl border-0 bg-background/95 backdrop-blur-sm">
        <CardHeader className="text-center space-y-2 pb-4">
          <CardTitle className="text-2xl font-bold">Recuperar senha</CardTitle>
          <CardDescription>Vamos enviar um link para você criar uma nova senha.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {notice && (
              <Alert className="border-success bg-success/10 text-success">
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="recovery-email">E-mail</Label>
              <Input
                id="recovery-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seu@email.com"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar link
            </Button>
            <div className="text-center text-sm text-slate-500">
              <Link to="/auth" className="underline underline-offset-4">Voltar ao login</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
