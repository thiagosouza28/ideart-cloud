import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { customerSupabase } from '@/integrations/supabase/customer-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CatalogFooter, CatalogHero, CatalogTopNav } from '@/components/catalog/PublicCatalogChrome';

const isCustomerAccount = (candidate: User | null | undefined) =>
  String(candidate?.user_metadata?.account_type || '').toLowerCase() === 'customer';

export default function PublicCustomerChangePassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const recoveryContext = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
    return {
      hasRecoverySignal:
        searchParams.has('code') ||
        searchParams.get('type') === 'recovery' ||
        hashParams.get('type') === 'recovery' ||
        hashParams.has('access_token'),
      nextPath: (() => {
        const next = searchParams.get('next');
        return next && next.startsWith('/') ? next : '/minha-conta/pedidos';
      })(),
      loginHref: (() => {
        const params = new URLSearchParams();
        const next = searchParams.get('next');
        const catalog = searchParams.get('catalog');
        const company = searchParams.get('company');
        if (next && next.startsWith('/')) params.set('next', next);
        if (catalog && catalog.startsWith('/')) params.set('catalog', catalog);
        if (company) params.set('company', company);
        const query = params.toString();
        return `/minha-conta/login${query ? `?${query}` : ''}`;
      })(),
    };
  }, [location.hash, location.search]);

  useEffect(() => {
    let mounted = true;

    const hydrateSession = async () => {
      setLoadingSession(true);

      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const code = searchParams.get('code');
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      try {
        if (code) {
          const { error: exchangeError } = await customerSupabase.auth.exchangeCodeForSession(window.location.href);
          if (exchangeError) {
            console.warn('[customer-password-recovery] exchangeCodeForSession failed', exchangeError.message);
          }
        } else if (accessToken && refreshToken) {
          const { error: setSessionError } = await customerSupabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setSessionError) {
            console.warn('[customer-password-recovery] setSession failed', setSessionError.message);
          }
        }

        const { data } = await customerSupabase.auth.getSession();
        const activeUser = data.session?.user ?? null;

        if (!mounted) return;

        if (activeUser && !isCustomerAccount(activeUser)) {
          setUser(null);
          setError('Este link pertence a outra área. Use a recuperação da loja.');
          void customerSupabase.auth.signOut({ scope: 'local' });
        } else {
          setUser(activeUser);
        }
      } finally {
        if (mounted) setLoadingSession(false);
      }
    };

    const { data: listener } = customerSupabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const nextUser = session?.user ?? null;
      if (nextUser && !isCustomerAccount(nextUser)) {
        setUser(null);
        setError('Este link pertence a outra área. Use a recuperação da loja.');
        void customerSupabase.auth.signOut({ scope: 'local' });
        return;
      }
      setUser(nextUser);
    });

    void hydrateSession();

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!user) {
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

    setSubmitting(true);
    try {
      const { error: updateError } = await customerSupabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      setNotice('Senha atualizada com sucesso.');
      navigate(recoveryContext.nextPath, { replace: true });
    } catch {
      setError('Não foi possível atualizar a senha agora.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <CatalogTopNav
        subtitle="Acesso do cliente"
        showBack
        onBack={() => navigate(recoveryContext.loginHref)}
        showAccount={Boolean(user)}
        accountHref={recoveryContext.nextPath}
      />

      <CatalogHero
        badge="Minha conta"
        title="Defina uma nova senha"
        description="Use o link recebido por e-mail para criar sua nova senha."
      />

      <main className="mx-auto flex w-[min(620px,calc(100%-24px))] items-center py-10">
        <Card className="w-full border-slate-200">
          <CardHeader>
            <CardTitle>Recuperar senha da conta</CardTitle>
            <CardDescription>Digite e confirme sua nova senha para continuar.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingSession ? (
              <div className="flex items-center justify-center py-8 text-sm text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validando link...
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {!user && !recoveryContext.hasRecoverySignal && (
                  <Alert>
                    <AlertDescription>
                      Abra o link de recuperação enviado por e-mail para redefinir sua senha.
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
                  <Label htmlFor="customer-new-password">Nova senha</Label>
                  <Input
                    id="customer-new-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer-confirm-password">Confirmar senha</Label>
                  <Input
                    id="customer-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>

                <Button type="submit" className="w-full bg-[#1a3a8f] hover:bg-[#16337e]" disabled={submitting || !user}>
                  {submitting ? 'Salvando...' : 'Salvar nova senha'}
                </Button>

                <p className="text-center text-xs text-slate-500">
                  <Link to={recoveryContext.loginHref} className="underline underline-offset-4">
                    Voltar para o login do cliente
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </main>

      <CatalogFooter showAccount={Boolean(user)} accountHref={recoveryContext.nextPath} />
    </div>
  );
}
