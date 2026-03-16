import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CatalogFooter,
  CatalogHero,
  CatalogTopNav,
  type CatalogChromeCompany,
} from '@/components/catalog/PublicCatalogChrome';
import { CpfCnpjInput, PhoneInput, normalizeDigits, validateCpf, validatePhone } from '@/components/ui/masked-input';
import { useCustomerAuth } from '@/hooks/use-customer-auth';
import { PageFallback } from '@/App';
import { customerSupabase } from '@/integrations/supabase/customer-client';
import { loadPublicCatalogCompany } from '@/lib/publicCatalogCompany';

type ProfileForm = {
  name: string;
  phone: string;
  document: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

const emptyProfileForm: ProfileForm = {
  name: '',
  phone: '',
  document: '',
  email: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export default function PublicCustomerProfile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut, loading: authLoading } = useCustomerAuth();
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;

  const [catalogCompany, setCatalogCompany] = useState<CatalogChromeCompany | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);
  const [profileErrorMessage, setProfileErrorMessage] = useState<string | null>(null);
  const [profileFormErrors, setProfileFormErrors] = useState<Partial<Record<keyof ProfileForm, string>>>({});

  const companyContext = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('catalog') || params.get('company') || null;
  }, [location.search]);

  const profileCompanyId = catalogCompany?.id ?? null;

  const catalogPath = useMemo(() => {
    if (catalogCompany?.slug) return `/catalogo/${catalogCompany.slug}`;
    if (catalogCompany?.id) return `/catalogo/loja/${catalogCompany.id}`;
    return '/catalogo';
  }, [catalogCompany]);

  const ordersPath = useMemo(() => {
    if (!companyContext) return '/minha-conta/pedidos';
    return `/minha-conta/pedidos?${new URLSearchParams({ catalog: companyContext }).toString()}`;
  }, [companyContext]);

  useEffect(() => {
    let isMounted = true;
    const loadCatalogCompany = async () => {
      if (!companyContext) return;
      const data = await loadPublicCatalogCompany({
        companyId: isUuid(companyContext) ? companyContext : undefined,
        slug: isUuid(companyContext) ? undefined : companyContext,
      });

      if (!isMounted) return;
      if (data) {
        setCatalogCompany(data);
      } else {
        setCatalogCompany(null);
      }
    };

    void loadCatalogCompany();
    return () => {
      isMounted = false;
    };
  }, [companyContext]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!userId || !profileCompanyId) return;

      const { data, error } = await customerSupabase.rpc('get_catalog_customer_checkout_profile', {
        p_company_id: profileCompanyId,
      });

      if (error) {
        console.error('Error loading profile:', error);
        setProfileLoaded(true);
        return;
      }

      if (data && typeof data === 'object') {
        const profile = data as any;
        setProfileForm({
          name: profile.name || '',
          phone: profile.phone || '',
          document: profile.document || '',
          email: profile.email || '',
          address: profile.address || '',
          city: profile.city || '',
          state: profile.state || '',
          zipCode: profile.zip_code || '',
        });
      } else if (user) {
        const metadata = (user.user_metadata || {}) as Record<string, unknown>;
        setProfileForm({
          ...emptyProfileForm,
          name: (typeof metadata.full_name === 'string' ? metadata.full_name : '') || '',
          phone: user.phone || (typeof metadata.phone === 'string' ? metadata.phone : '') || '',
          document: (typeof metadata.cpf === 'string' ? metadata.cpf : '') || '',
          email: user.email || '',
        });
      }
      setProfileLoaded(true);
    };

    void loadProfile();
  }, [profileCompanyId, userId, user]);

  const handleProfileChange = (field: keyof ProfileForm, value: string) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
    if (profileFormErrors[field]) {
      setProfileFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validateProfile = () => {
    const errors: Partial<Record<keyof ProfileForm, string>> = {};
    if (!profileForm.name.trim()) errors.name = 'Informe seu nome completo.';
    if (!validatePhone(profileForm.phone)) errors.phone = 'Informe um telefone válido.';
    if (!validateCpf(profileForm.document)) errors.document = 'Informe um CPF válido.';
    if (!isValidEmail(profileForm.email)) errors.email = 'Informe um e-mail válido.';
    if (!profileForm.address.trim()) errors.address = 'Informe seu endereço.';
    if (!profileForm.city.trim()) errors.city = 'Informe sua cidade.';
    if (!profileForm.state.trim() || profileForm.state.trim().length < 2)
      errors.state = 'Informe seu estado (UF).';
    if (normalizeDigits(profileForm.zipCode).length < 8) errors.zipCode = 'Informe um CEP válido.';

    setProfileFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId || !profileCompanyId) return;
    if (!validateProfile()) return;

    setProfileSaving(true);
    setProfileFeedback(null);
    setProfileErrorMessage(null);

    const { error } = await customerSupabase.rpc('upsert_catalog_customer_checkout_profile', {
      p_company_id: profileCompanyId,
      p_name: profileForm.name.trim(),
      p_phone: normalizeDigits(profileForm.phone),
      p_document: normalizeDigits(profileForm.document),
      p_email: profileForm.email.trim(),
      p_address: profileForm.address.trim(),
      p_city: profileForm.city.trim(),
      p_state: profileForm.state.trim().toUpperCase().slice(0, 2),
      p_zip_code: normalizeDigits(profileForm.zipCode),
    });

    if (error) {
      setProfileErrorMessage(error.message || 'Não foi possível salvar o perfil.');
      setProfileSaving(false);
      return;
    }

    setProfileFeedback('Perfil salvo com sucesso.');
    setProfileSaving(false);
  };

  if (authLoading || (profileCompanyId && !profileLoaded)) {
    return <PageFallback />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <CatalogTopNav
        company={catalogCompany}
        subtitle={userEmail || 'Cliente autenticado'}
        showBack
        onBack={() => navigate(catalogPath)}
        showAccount
        accountHref={ordersPath}
        accountLabel="Meus pedidos"
        showContact
      />

      <CatalogHero
        company={catalogCompany}
        badge="Minha conta"
        title="Meu perfil"
        description="Mantenha seus dados atualizados para finalizar pedidos com rapidez."
      />

      <main className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-[#1a3a8f] text-[#1a3a8f] hover:bg-[#f3f6ff]"
            onClick={() => navigate(ordersPath)}
          >
            Meus pedidos
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-[#1a3a8f] text-[#1a3a8f] hover:bg-[#f3f6ff]"
            onClick={() => void signOut()}
          >
            Sair
          </Button>
        </div>

        <Card className="border-slate-200">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg">Dados para pedidos</CardTitle>
            <p className="text-xs text-slate-500">
              Esses dados sao usados automaticamente no pagamento.
              {catalogCompany ? ` Loja vinculada: ${catalogCompany.name}.` : ''}
            </p>
          </CardHeader>
          <CardContent>
            {!profileCompanyId && (
              <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
                Abra o catálogo de uma loja para vincular e salvar seu perfil.
              </p>
            )}
            {profileCompanyId && !profileLoaded && (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                Carregando perfil...
              </p>
            )}
            <form onSubmit={handleProfileSubmit} className="space-y-3">
              <div>
                <Label htmlFor="profile-name">Nome completo *</Label>
                <Input
                  id="profile-name"
                  value={profileForm.name}
                  onChange={(event) => handleProfileChange('name', event.target.value)}
                  placeholder="Nome e sobrenome"
                  className={profileFormErrors.name ? 'border-destructive' : ''}
                />
                {profileFormErrors.name && (
                  <p className="mt-1 text-xs text-destructive">{profileFormErrors.name}</p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="profile-phone">Telefone *</Label>
                  <PhoneInput
                    id="profile-phone"
                    value={profileForm.phone}
                    onChange={(event) => handleProfileChange('phone', event.target.value)}
                    placeholder="(00) 00000-0000"
                    className={profileFormErrors.phone ? 'border-destructive' : ''}
                  />
                  {profileFormErrors.phone && (
                    <p className="mt-1 text-xs text-destructive">{profileFormErrors.phone}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="profile-document">CPF *</Label>
                  <CpfCnpjInput
                    id="profile-document"
                    value={profileForm.document}
                    onChange={(event) => handleProfileChange('document', event.target.value)}
                    placeholder="000.000.000-00"
                    className={profileFormErrors.document ? 'border-destructive' : ''}
                  />
                  {profileFormErrors.document && (
                    <p className="mt-1 text-xs text-destructive">{profileFormErrors.document}</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="profile-email">E-mail *</Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={profileForm.email}
                  onChange={(event) => handleProfileChange('email', event.target.value)}
                  placeholder="seu@email.com"
                  className={profileFormErrors.email ? 'border-destructive' : ''}
                />
                {profileFormErrors.email && (
                  <p className="mt-1 text-xs text-destructive">{profileFormErrors.email}</p>
                )}
              </div>

              <Separator className="my-4" />

              <div>
                <Label htmlFor="profile-address">Endereço de entrega *</Label>
                <Input
                  id="profile-address"
                  value={profileForm.address}
                  onChange={(event) => handleProfileChange('address', event.target.value)}
                  placeholder="Rua, número, complemento, bairro"
                  className={profileFormErrors.address ? 'border-destructive' : ''}
                />
                {profileFormErrors.address && (
                  <p className="mt-1 text-xs text-destructive">{profileFormErrors.address}</p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <Label htmlFor="profile-zip">CEP *</Label>
                  <Input
                    id="profile-zip"
                    value={profileForm.zipCode}
                    onChange={(event) => handleProfileChange('zipCode', event.target.value)}
                    placeholder="00000-000"
                    maxLength={9}
                    className={profileFormErrors.zipCode ? 'border-destructive' : ''}
                  />
                  {profileFormErrors.zipCode && (
                    <p className="mt-1 text-xs text-destructive">{profileFormErrors.zipCode}</p>
                  )}
                </div>
                <div className="sm:col-span-1">
                  <Label htmlFor="profile-city">Cidade *</Label>
                  <Input
                    id="profile-city"
                    value={profileForm.city}
                    onChange={(event) => handleProfileChange('city', event.target.value)}
                    placeholder="Cidade"
                    className={profileFormErrors.city ? 'border-destructive' : ''}
                  />
                  {profileFormErrors.city && (
                    <p className="mt-1 text-xs text-destructive">{profileFormErrors.city}</p>
                  )}
                </div>
                <div className="sm:col-span-1">
                  <Label htmlFor="profile-state">Estado (UF) *</Label>
                  <Input
                    id="profile-state"
                    value={profileForm.state}
                    onChange={(event) => handleProfileChange('state', event.target.value)}
                    placeholder="UF"
                    maxLength={2}
                    className={profileFormErrors.state ? 'border-destructive' : ''}
                  />
                  {profileFormErrors.state && (
                    <p className="mt-1 text-xs text-destructive">{profileFormErrors.state}</p>
                  )}
                </div>
              </div>

              <div className="pt-2">
                {profileFeedback && (
                  <p className="mb-3 rounded-md bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
                    {profileFeedback}
                  </p>
                )}
                {profileErrorMessage && (
                  <p className="mb-3 rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
                    {profileErrorMessage}
                  </p>
                )}
                <Button
                  type="submit"
                  className="w-full bg-[#1a3a8f] hover:bg-[#16337e]"
                  disabled={profileSaving || !profileCompanyId}
                >
                  {profileSaving ? 'Salvando...' : 'Salvar perfil'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>

      <CatalogFooter company={catalogCompany} showAccount accountHref={ordersPath} accountLabel="Meus pedidos" />
    </div>
  );
}
