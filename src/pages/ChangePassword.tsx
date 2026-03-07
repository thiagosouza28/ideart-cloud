import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { isCustomerAccount } from '@/lib/access-control';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const hasRecoverySignalInLocation = (search: string, hash: string) => {
  const searchParams = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''));

  return (
    searchParams.has('code') ||
    searchParams.has('token_hash') ||
    searchParams.get('type') === 'recovery' ||
    hashParams.get('type') === 'recovery' ||
    hashParams.has('access_token')
  );
};

type VerifyOtpPayload = Parameters<typeof supabase.auth.verifyOtp>[0];

export default function ChangePassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refreshUserData, passwordRecovery, clearPasswordRecovery } = useAuth();
  const [recoveryUser, setRecoveryUser] = useState<User | null>(null);
  const [loadingSession, setLoadingSession] = useState(() =>
    typeof window !== 'undefined'
      ? hasRecoverySignalInLocation(window.location.search, window.location.hash)
      : false,
  );
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const recoveryContext = useMemo(
    () => ({
      hasRecoverySignal: hasRecoverySignalInLocation(location.search, location.hash),
      loginHref: '/auth',
    }),
    [location.hash, location.search],
  );

  const activeUser = useMemo(() => {
    if (user && !isCustomerAccount(user)) return user;
    return recoveryUser;
  }, [recoveryUser, user]);

  useEffect(() => {
    let mounted = true;

    if (!recoveryContext.hasRecoverySignal) {
      setLoadingSession(false);
      setRecoveryUser(null);
      return;
    }

    const hydrateSession = async () => {
      setLoadingSession(true);

      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const code = searchParams.get('code');
      const tokenHash = searchParams.get('token_hash');
      const verificationType = (searchParams.get('type') || 'recovery').toLowerCase();
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (exchangeError) {
            console.warn('[store-password-recovery] exchangeCodeForSession failed', exchangeError.message);
          }
        } else if (tokenHash) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: verificationType as VerifyOtpPayload['type'],
          });
          if (verifyError) {
            console.warn('[store-password-recovery] verifyOtp failed', verifyError.message);
          }
        } else if (accessToken && refreshToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setSessionError) {
            console.warn('[store-password-recovery] setSession failed', setSessionError.message);
          }
        }

        const { data } = await supabase.auth.getSession();
        const nextUser = data.session?.user ?? null;
        if (!mounted) return;

        if (nextUser && isCustomerAccount(nextUser)) {
          setRecoveryUser(null);
          setError('Este link pertence à área do cliente. Use a recuperação em /minha-conta/login.');
          void supabase.auth.signOut({ scope: 'local' });
          return;
        }

        setRecoveryUser(nextUser);
      } finally {
        if (mounted) {
          setLoadingSession(false);
        }
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const nextUser = session?.user ?? null;

      if (nextUser && isCustomerAccount(nextUser)) {
        setRecoveryUser(null);
        setError('Este link pertence à área do cliente. Use a recuperação em /minha-conta/login.');
        void supabase.auth.signOut({ scope: 'local' });
        return;
      }

      setRecoveryUser(nextUser);
    });

    void hydrateSession();

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [recoveryContext.hasRecoverySignal]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!activeUser) {
      setError('Sessão de recuperação expirada. Solicite um novo link.');
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
          password_defined: true,
        })
        .eq('id', activeUser.id);

      if (profileError) {
        setError(profileError.message);
        return;
      }

      await refreshUserData();
      clearPasswordRecovery();
      setNotice('Senha atualizada com sucesso.');
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Não foi possível atualizar a senha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const shouldShowForm = Boolean(activeUser || recoveryContext.hasRecoverySignal || passwordRecovery);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sidebar via-sidebar/95 to-sidebar/90 p-4">
      <Card className="w-full max-w-md shadow-xl border-0 bg-background/95 backdrop-blur-sm">
        <CardHeader className="text-center space-y-2 pb-4">
          <CardTitle className="text-2xl font-bold">Defina uma nova senha</CardTitle>
          <CardDescription>Use o link recebido por e-mail para criar sua nova senha.</CardDescription>
        </CardHeader>
        <CardContent>
          {!shouldShowForm && (
            <div className="space-y-4 text-sm text-slate-600">
              <p>Para trocar a senha, abra o link de recuperação enviado por e-mail.</p>
              <div className="text-center">
                <Link to={recoveryContext.loginHref} className="underline underline-offset-4">
                  Voltar ao login
                </Link>
              </div>
            </div>
          )}

          {shouldShowForm && (
            <>
              {loadingSession ? (
                <div className="flex items-center justify-center py-8 text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Válidando link...
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {!activeUser && (
                    <Alert>
                      <AlertDescription>
                        {recoveryContext.hasRecoverySignal || passwordRecovery
                          ? 'Sessão de recuperação expirada. Solicite um novo link.'
                          : 'Abra o link de recuperação enviado por e-mail para redefinir sua senha.'}
                      </AlertDescription>
                    </Alert>
                  )}

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
                      autoComplete="new-password"
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
                      autoComplete="new-password"
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={loading || !activeUser}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar nova senha
                  </Button>

                  <div className="text-center text-sm text-slate-500">
                    <Link to={recoveryContext.loginHref} className="underline underline-offset-4">
                      Voltar ao login
                    </Link>
                  </div>
                </form>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
