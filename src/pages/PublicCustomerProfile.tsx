import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CatalogFooter, CatalogHero, CatalogTopNav } from '@/components/catalog/PublicCatalogChrome';
import { CpfCnpjInput, PhoneInput, normalizeDigits, validateCpf, validatePhone } from '@/components/ui/masked-input';
import { useCustomerAuth } from '@/hooks/use-customer-auth';
import { customerSupabase } from '@/integrations/supabase/customer-client';
import { publicSupabase } from '@/integrations/supabase/public-client';

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
  const { user, signOut, loading } = useCustomerAuth();

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
  const [fallbackCompanyId, setFallbackCompanyId] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileErrors, setProfileErrors] = useState<Partial<Record<keyof ProfileForm, string>>>({});
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);
  const [profileErrorMessage, setProfileErrorMessage] = useState<string | null>(null);

  const catalogPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const catalog = params.get('catalog');
    if (!catalog) return '/catalogo';
    if (catalog.startsWith('/catalogo') || catalog.startsWith('/loja/')) return catalog;
    return '/catalogo';
  }, [location.search]);

  const profilePath = useMemo(
    () => (location.search ? `/minha-conta/perfil${location.search}` : '/minha-conta/perfil'),
    [location.search],
  );

  const ordersPath = useMemo(
    () => (location.search ? `/minha-conta/pedidos${location.search}` : '/minha-conta/pedidos'),
    [location.search],
  );

  const companyContext = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const company = params.get('company');
    if (company && isUuid(company)) return company;

    const catalog = params.get('catalog');
    if (!catalog) return null;
    const byId = catalog.match(/^\/loja\/([^/?#]+)/i);
    if (byId?.[1]) return byId[1];
    const bySlug = catalog.match(/^\/catalogo\/([^/?#]+)/i);
    return bySlug?.[1] || null;
  }, [location.search]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const params = new URLSearchParams();
      params.set('next', profilePath);
      if (catalogPath.startsWith('/catalogo') || catalogPath.startsWith('/loja/')) {
        params.set('catalog', catalogPath);
      }
      navigate(`/minha-conta/login?${params.toString()}`, { replace: true });
    }
  }, [catalogPath, loading, navigate, profilePath, user]);

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
    const loadFallbackCompany = async () => {
      if (!user?.id || catalogCompany?.id || (companyContext && isUuid(companyContext))) return;

      const { data } = await customerSupabase
        .from('orders')
        .select('company_id')
        .eq('customer_user_id', user.id)
        .not('company_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setFallbackCompanyId((data?.company_id as string | null) || null);
    };

    void loadFallbackCompany();
  }, [catalogCompany?.id, companyContext, user?.id]);

  useEffect(() => {
    if (!user) return;
    const metadata = (user.user_metadata || {}) as Record<string, unknown>;
    setProfileForm((prev) => ({
      ...prev,
      name: prev.name || (typeof metadata.full_name === 'string' ? metadata.full_name : '') || '',
      phone: prev.phone || user.phone || (typeof metadata.phone === 'string' ? metadata.phone : '') || '',
      document: prev.document || (typeof metadata.cpf === 'string' ? metadata.cpf : '') || '',
      email: prev.email || user.email || '',
    }));
  }, [user]);

  const profileCompanyId = useMemo(() => {
    if (catalogCompany?.id) return catalogCompany.id;
    if (companyContext && isUuid(companyContext)) return companyContext;
    return fallbackCompanyId;
  }, [catalogCompany?.id, companyContext, fallbackCompanyId]);

  useEffect(() => {
    if (!user?.id || !profileCompanyId) {
      setProfileLoaded(true);
      return;
    }

    let isMounted = true;

    const loadProfile = async () => {
      setProfileLoaded(false);
      const { data, error } = await customerSupabase
        .from('customers')
        .select('name, phone, document, email, address, city, state, zip_code')
        .eq('company_id', profileCompanyId)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!isMounted) return;

      if (!error && data) {
        setProfileForm((prev) => ({
          ...prev,
          name: data.name || prev.name,
          phone: data.phone || prev.phone,
          document: data.document || prev.document,
          email: data.email || prev.email,
          address: data.address || '',
          city: data.city || '',
          state: data.state || '',
          zipCode: data.zip_code || '',
        }));
      }
      setProfileLoaded(true);
    };

    void loadProfile();
    return () => {
      isMounted = false;
    };
  }, [profileCompanyId, user?.id]);

  const validateProfile = () => {
    const nextErrors: Partial<Record<keyof ProfileForm, string>> = {};

    if (profileForm.name.trim().length < 2) {
      nextErrors.name = 'Informe o nome completo.';
    }
    if (!validatePhone(profileForm.phone)) {
      nextErrors.phone = 'Telefone invalido.';
    }
    if (!validateCpf(profileForm.document)) {
      nextErrors.document = 'CPF invalido.';
    }
    if (!isValidEmail(profileForm.email)) {
      nextErrors.email = 'Informe um e-mail valido.';
    }
    if (!profileForm.address.trim()) {
      nextErrors.address = 'Informe o endereco.';
    }
    if (!profileForm.city.trim()) {
      nextErrors.city = 'Informe a cidade.';
    }
    if (profileForm.state.trim().length < 2) {
      nextErrors.state = 'Informe o estado (UF).';
    }
    if (normalizeDigits(profileForm.zipCode).length < 8) {
      nextErrors.zipCode = 'Informe um CEP valido.';
    }

    setProfileErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleProfileChange = (field: keyof ProfileForm, value: string) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
    setProfileErrors((prev) => ({ ...prev, [field]: undefined }));
    setProfileFeedback(null);
    setProfileErrorMessage(null);
  };

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.id || !profileCompanyId) return;
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
      setProfileErrorMessage(error.message || 'Nao foi possivel salvar o perfil.');
      setProfileSaving(false);
      return;
    }

    setProfileFeedback('Perfil salvo com sucesso.');
    setProfileSaving(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <CatalogTopNav
        company={catalogCompany}
        subtitle={user?.email || 'Cliente autenticado'}
        showBack
        onBack={() => navigate(catalogPath)}
        showAccount
        accountHref={ordersPath}
        accountLabel="Meus pedidos"
        showContact
      />

      <CatalogHero
        badge="Minha conta"
        title="Meu perfil"
        description="Mantenha seus dados atualizados para finalizar pedidos com rapidez."
      />

      <main className="mx-auto w-[min(980px,calc(100%-24px))] py-6 space-y-6">
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
              Esses dados sao usados automaticamente no checkout.
              {catalogCompany ? ` Loja vinculada: ${catalogCompany.name}.` : ''}
            </p>
          </CardHeader>
          <CardContent>
            {!profileCompanyId && (
              <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
                Abra o catalogo de uma loja para vincular e salvar seu perfil.
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
                  disabled={!profileCompanyId}
                />
                {profileErrors.name && <p className="mt-1 text-xs text-destructive">{profileErrors.name}</p>}
              </div>

              <div>
                <Label htmlFor="profile-phone">Telefone (WhatsApp) *</Label>
                <PhoneInput
                  id="profile-phone"
                  value={profileForm.phone}
                  onChange={(value) => handleProfileChange('phone', value)}
                  className={profileErrors.phone ? 'border-destructive' : ''}
                  disabled={!profileCompanyId}
                />
                {profileErrors.phone && <p className="mt-1 text-xs text-destructive">{profileErrors.phone}</p>}
              </div>

              <div>
                <Label htmlFor="profile-document">CPF *</Label>
                <CpfCnpjInput
                  id="profile-document"
                  value={profileForm.document}
                  onChange={(value) => handleProfileChange('document', value)}
                  className={profileErrors.document ? 'border-destructive' : ''}
                  disabled={!profileCompanyId}
                />
                {profileErrors.document && <p className="mt-1 text-xs text-destructive">{profileErrors.document}</p>}
              </div>

              <div>
                <Label htmlFor="profile-email">E-mail *</Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={profileForm.email}
                  onChange={(event) => handleProfileChange('email', event.target.value)}
                  placeholder="voce@email.com"
                  disabled={!profileCompanyId}
                />
                {profileErrors.email && <p className="mt-1 text-xs text-destructive">{profileErrors.email}</p>}
              </div>

              <div>
                <Label htmlFor="profile-address">Endereco *</Label>
                <Input
                  id="profile-address"
                  value={profileForm.address}
                  onChange={(event) => handleProfileChange('address', event.target.value)}
                  placeholder="Rua, numero e complemento"
                  disabled={!profileCompanyId}
                />
                {profileErrors.address && <p className="mt-1 text-xs text-destructive">{profileErrors.address}</p>}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="profile-city">Cidade *</Label>
                  <Input
                    id="profile-city"
                    value={profileForm.city}
                    onChange={(event) => handleProfileChange('city', event.target.value)}
                    placeholder="Cidade"
                    disabled={!profileCompanyId}
                  />
                  {profileErrors.city && <p className="mt-1 text-xs text-destructive">{profileErrors.city}</p>}
                </div>
                <div>
                  <Label htmlFor="profile-state">UF *</Label>
                  <Input
                    id="profile-state"
                    value={profileForm.state}
                    onChange={(event) => handleProfileChange('state', event.target.value.toUpperCase().slice(0, 2))}
                    placeholder="SP"
                    disabled={!profileCompanyId}
                  />
                  {profileErrors.state && <p className="mt-1 text-xs text-destructive">{profileErrors.state}</p>}
                </div>
                <div>
                  <Label htmlFor="profile-zip">CEP *</Label>
                  <Input
                    id="profile-zip"
                    value={profileForm.zipCode}
                    onChange={(event) => handleProfileChange('zipCode', event.target.value)}
                    placeholder="00000-000"
                    disabled={!profileCompanyId}
                  />
                  {profileErrors.zipCode && <p className="mt-1 text-xs text-destructive">{profileErrors.zipCode}</p>}
                </div>
              </div>

              {profileErrorMessage && <p className="text-xs text-destructive">{profileErrorMessage}</p>}
              {profileFeedback && <p className="text-xs text-emerald-600">{profileFeedback}</p>}

              <Button
                type="submit"
                className="bg-[#1a3a8f] hover:bg-[#16337e]"
                disabled={!profileCompanyId || profileSaving}
              >
                {profileSaving ? 'Salvando perfil...' : 'Salvar perfil'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>

      <CatalogFooter company={catalogCompany} showAccount accountHref={ordersPath} accountLabel="Meus pedidos" />
    </div>
  );
}
