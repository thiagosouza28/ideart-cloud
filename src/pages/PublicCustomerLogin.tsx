import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CatalogFooter, CatalogHero, CatalogTopNav } from '@/components/catalog/PublicCatalogChrome';
import { useCustomerAuth } from '@/hooks/use-customer-auth';
import { CpfCnpjInput, PhoneInput, normalizeDigits, validateCpf, validatePhone } from '@/components/ui/masked-input';
import { customerSupabase } from '@/integrations/supabase/customer-client';
import { publicSupabase } from '@/integrations/supabase/public-client';

export default function PublicCustomerLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signIn, signOut, loading } = useCustomerAuth();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupCpf, setSignupCpf] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [catalogCompany, setCatalogCompany] = useState<{
    id: string;
    name: string;
    slug: string | null;
    city: string | null;
    state: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    whatsapp: string | null;
    catalog_contact_url: string | null;
  } | null>(null);

  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

  const customerAccount = (candidate: User | null | undefined) =>
    String(candidate?.user_metadata?.account_type || '').toLowerCase() === 'customer';

  const targetPath = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const next = searchParams.get('next');
    return next && next.startsWith('/') ? next : '/catalogo';
  }, [location.search]);

  const catalogPath = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const next = searchParams.get('next');
    const nextParams = next?.includes('?') ? new URLSearchParams(next.split('?')[1]) : null;
    const catalog = searchParams.get('catalog') || nextParams?.get('catalog');
    if (!catalog) return '/catalogo';
    if (catalog.startsWith('/catalogo') || catalog.startsWith('/loja/')) return catalog;
    return '/catalogo';
  }, [location.search]);

  const companyContext = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const next = searchParams.get('next');
    const nextParams = next?.includes('?') ? new URLSearchParams(next.split('?')[1]) : null;
    const company = searchParams.get('company') || nextParams?.get('company');
    if (company && isUuid(company)) return company;

    const catalog = searchParams.get('catalog') || nextParams?.get('catalog');
    if (!catalog) return null;
    const storeByIdMatch = catalog.match(/^\/loja\/([^/?#]+)/i);
    if (storeByIdMatch?.[1]) return storeByIdMatch[1];
    const match = catalog.match(/^\/catalogo\/([^/?#]+)/i);
    return match?.[1] || null;
  }, [location.search]);

  useEffect(() => {
    let isMounted = true;

    const loadCatalogCompany = async () => {
      if (!companyContext) {
        setCatalogCompany(null);
        return;
      }

      let query = publicSupabase
        .from('companies')
        .select('id, name, slug, city, state, phone, email, address, whatsapp, catalog_contact_url, is_active')
        .eq('is_active', true);
      query = isUuid(companyContext) ? query.eq('id', companyContext) : query.eq('slug', companyContext);
      const { data } = await query.maybeSingle();

      if (!isMounted) return;

      if (data) {
        setCatalogCompany({
          id: data.id,
          name: data.name,
          slug: data.slug || null,
          city: data.city || null,
          state: data.state || null,
          phone: data.phone || null,
          email: data.email || null,
          address: data.address || null,
          whatsapp: data.whatsapp || null,
          catalog_contact_url: data.catalog_contact_url || null,
        });
        return;
      }

      setCatalogCompany(null);
    };

    void loadCatalogCompany();
    return () => {
      isMounted = false;
    };
  }, [companyContext]);

  const linkCustomerToCompany = useCallback(
    async (sessionUser?: User | null) => {
      const resolvedUser = sessionUser || user;
      const resolvedCompanyId =
        catalogCompany?.id || (companyContext && isUuid(companyContext) ? companyContext : null);
      if (!resolvedUser?.id || !resolvedCompanyId) return;

      const metadata = (resolvedUser.user_metadata || {}) as Record<string, unknown>;
      const { error } = await customerSupabase.rpc('upsert_catalog_customer_profile', {
        p_company_id: resolvedCompanyId,
        p_name: (typeof metadata.full_name === 'string' ? metadata.full_name : '').trim(),
        p_phone: (resolvedUser.phone || (typeof metadata.phone === 'string' ? metadata.phone : '') || '').trim(),
        p_document: (typeof metadata.cpf === 'string' ? metadata.cpf : '').trim(),
        p_email: (resolvedUser.email || '').trim(),
      });
      if (error) {
        console.warn('[catalog-customer] failed to link customer to company', error.message);
      }
    },
    [catalogCompany?.id, companyContext, user],
  );

  useEffect(() => {
    if (loading) return;
    if (!user) return;

    if (!customerAccount(user)) {
      void signOut().finally(() => {
        navigate('/auth', { replace: true });
      });
      return;
    }

    void linkCustomerToCompany(user).finally(() => {
      navigate(targetPath, { replace: true });
    });
  }, [linkCustomerToCompany, loading, navigate, signOut, targetPath, user]);

  const handleLoginSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await signIn(email.trim(), password);
    if (error) {
      setSubmitting(false);
      setErrorMessage(error.message || 'Nao foi possivel entrar. Verifique os dados.');
      return;
    }

    const { data: userData } = await customerSupabase.auth.getUser();
    const loggedUser = userData.user;
    await linkCustomerToCompany(loggedUser);
    setSubmitting(false);
    navigate(targetPath, { replace: true });
  };

  const handleSignupSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    if (signupName.trim().length < 2) {
      setSubmitting(false);
      setErrorMessage('Informe seu nome completo.');
      return;
    }

    if (!validatePhone(signupPhone)) {
      setSubmitting(false);
      setErrorMessage('Informe um telefone valido.');
      return;
    }

    const cpfDigits = normalizeDigits(signupCpf);
    if (!validateCpf(cpfDigits)) {
      setSubmitting(false);
      setErrorMessage('Informe um CPF valido.');
      return;
    }

    if (signupPassword.length < 6) {
      setSubmitting(false);
      setErrorMessage('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      setSubmitting(false);
      setErrorMessage('As senhas nao conferem.');
      return;
    }

    const { data, error } = await customerSupabase.auth.signUp({
      email: email.trim(),
      password: signupPassword,
      options: {
        data: {
          full_name: signupName.trim(),
          phone: normalizeDigits(signupPhone),
          cpf: cpfDigits,
          account_type: 'customer',
        },
      },
    });

    if (error) {
      setSubmitting(false);
      setErrorMessage(error.message || 'Nao foi possivel criar a conta.');
      return;
    }

    setSubmitting(false);

    if (!data.session) {
      setSuccessMessage(
        catalogCompany
          ? `Conta criada. Confirme seu e-mail e depois entre novamente para vincular a ${catalogCompany.name}.`
          : 'Conta criada. Verifique seu e-mail para confirmar o acesso.',
      );
      return;
    }

    await linkCustomerToCompany(data.user || null);
    navigate(targetPath, { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <CatalogTopNav
        company={catalogCompany}
        subtitle="Acesso do cliente"
        showBack
        onBack={() => navigate(catalogPath)}
        showAccount={Boolean(user)}
        accountHref={targetPath}
        showContact
      />

      <CatalogHero
        badge="Minha conta"
        title="Acesse ou crie sua conta"
        description="Use sua conta para acompanhar pedidos e manter seus dados de compra."
      />

      <main className="mx-auto flex w-[min(620px,calc(100%-24px))] items-center py-10">
        <Card className="w-full border-slate-200">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2">
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-semibold ${mode === 'login' ? 'bg-[#1a3a8f] text-white' : 'bg-slate-100 text-slate-600'}`}
                onClick={() => {
                  setMode('login');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
              >
                Entrar
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-semibold ${mode === 'signup' ? 'bg-[#1a3a8f] text-white' : 'bg-slate-100 text-slate-600'}`}
                onClick={() => {
                  setMode('signup');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
              >
                Criar conta
              </button>
            </div>
            <CardTitle>{mode === 'login' ? 'Acessar conta do cliente' : 'Criar conta de cliente'}</CardTitle>
            <CardDescription>
              {mode === 'login'
                ? 'Entre com seu e-mail e senha para acompanhar seus pedidos.'
                : 'Crie sua conta para acompanhar pedidos e status de producao.'}
            </CardDescription>
            {catalogCompany && (
              <p className="text-xs text-slate-500">
                Cadastro vinculado a loja <strong>{catalogCompany.name}</strong>.
              </p>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={mode === 'login' ? handleLoginSubmit : handleSignupSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="customer-name">Nome completo</Label>
                  <Input
                    id="customer-name"
                    value={signupName}
                    onChange={(event) => setSignupName(event.target.value)}
                    placeholder="Nome e sobrenome"
                    autoComplete="name"
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="customer-email">E-mail</Label>
                <Input
                  id="customer-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="cliente@exemplo.com"
                  autoComplete="email"
                  required
                />
              </div>

              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="customer-phone">WhatsApp</Label>
                  <PhoneInput
                    id="customer-phone"
                    value={signupPhone}
                    onChange={setSignupPhone}
                    required
                  />
                </div>
              )}

              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="customer-cpf">CPF</Label>
                  <CpfCnpjInput
                    id="customer-cpf"
                    value={signupCpf}
                    onChange={setSignupCpf}
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="customer-password">{mode === 'login' ? 'Senha' : 'Senha (min. 6)'}</Label>
                <Input
                  id="customer-password"
                  type="password"
                  value={mode === 'login' ? password : signupPassword}
                  onChange={(event) =>
                    mode === 'login' ? setPassword(event.target.value) : setSignupPassword(event.target.value)
                  }
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                />
              </div>

              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="customer-password-confirm">Confirmar senha</Label>
                  <Input
                    id="customer-password-confirm"
                    type="password"
                    value={signupConfirmPassword}
                    onChange={(event) => setSignupConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
              )}

              {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}
              {successMessage && <p className="text-xs text-emerald-600">{successMessage}</p>}

              <Button type="submit" className="w-full bg-[#1a3a8f] hover:bg-[#16337e]" disabled={submitting}>
                {submitting ? (mode === 'login' ? 'Entrando...' : 'Criando conta...') : (mode === 'login' ? 'Entrar' : 'Criar conta')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>

      <CatalogFooter company={catalogCompany} showAccount={Boolean(user)} accountHref={targetPath} />
    </div>
  );
}
