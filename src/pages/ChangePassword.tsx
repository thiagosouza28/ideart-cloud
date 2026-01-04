import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function ChangePassword() {
  const navigate = useNavigate();
  const { user, refreshUserData, passwordRecovery, clearPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!user) {
      setError('Sessão expirada. Faça login novamente.');
      return;
    }

    if (password.length < 8) {
      setError('A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          force_password_change: false,
          must_change_password: false,
          must_complete_onboarding: false,
          must_complete_company: false,
        })
        .eq('id', user.id);

      if (profileError) {
        setError(profileError.message);
        return;
      }

      await refreshUserData();
      clearPasswordRecovery();
      setNotice('Senha atualizada com sucesso.');
      navigate(passwordRecovery ? '/auth' : '/dashboard', { replace: true });
    } catch {
      setError('Não foi possível atualizar a senha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sidebar via-sidebar/95 to-sidebar/90 p-4">
      <Card className="w-full max-w-md shadow-xl border-0 bg-background/95 backdrop-blur-sm">
        <CardHeader className="text-center space-y-2 pb-4">
          <CardTitle className="text-2xl font-bold">Defina uma nova senha</CardTitle>
          <CardDescription>Por segurança, altere sua senha no primeiro acesso.</CardDescription>
        </CardHeader>
        <CardContent>
          {!user && !passwordRecovery && (
            <div className="space-y-4 text-sm text-slate-600">
              <p>Para trocar a senha, abra o link de recuperação enviado por e-mail.</p>
              <div className="text-center">
                <Link to="/auth" className="underline underline-offset-4">Voltar ao login</Link>
              </div>
            </div>
          )}
          {(user || passwordRecovery) && (
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
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar senha</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar nova senha
            </Button>
          </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
