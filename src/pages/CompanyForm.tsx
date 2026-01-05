import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Loader2, Save, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { PhoneInput, formatPhone, normalizeDigits, validatePhone } from '@/components/ui/masked-input';
import { supabase } from '@/integrations/supabase/client';
import type { Company } from '@/types/database';
import { toast } from 'sonner';
import { ensurePublicStorageUrl } from '@/lib/storage';

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
]);

const emptyForm = {
  name: '',
  slug: '',
  description: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  city: '',
  state: '',
  instagram: '',
  facebook: '',
  logo_url: null as string | null,
  is_active: true,
};

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function CompanyForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEditing = Boolean(id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState<typeof emptyForm | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    loadCompany();
    return () => {
      if (logoObjectUrlRef.current) {
        URL.revokeObjectURL(logoObjectUrlRef.current);
        logoObjectUrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadCompany = async () => {
    setLoading(true);
    if (!isEditing || !id) {
      setForm(emptyForm);
      setInitialForm(emptyForm);
      setLogoPreview(null);
      setSlugTouched(false);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      toast.error('Empresa não encontrada');
      navigate('/empresas');
      return;
    }

    const company = data as Company;
    const normalizedLogo = ensurePublicStorageUrl('product-images', company.logo_url);
    const nextForm = {
      name: company.name,
      slug: company.slug,
      description: company.description || '',
      phone: company.phone ? formatPhone(company.phone) : '',
      whatsapp: company.whatsapp ? formatPhone(company.whatsapp) : '',
      email: company.email || '',
      address: company.address || '',
      city: company.city || '',
      state: company.state || '',
      instagram: company.instagram || '',
      facebook: company.facebook || '',
      logo_url: normalizedLogo,
      is_active: company.is_active,
    };

    setForm(nextForm);
    setInitialForm(nextForm);
    setLogoPreview(normalizedLogo);
    setSlugTouched(false);
    setLoading(false);
  };

  const resetLogoPreview = () => {
    if (logoObjectUrlRef.current) {
      URL.revokeObjectURL(logoObjectUrlRef.current);
      logoObjectUrlRef.current = null;
    }
    setLogoPreview(null);
  };

  const handleNameChange = (name: string) => {
    setForm((prev) => ({
      ...prev,
      name,
      slug: isEditing || slugTouched ? prev.slug : generateSlug(name),
    }));
  };

  const handleSlugChange = (value: string) => {
    setSlugTouched(true);
    setForm((prev) => ({ ...prev, slug: generateSlug(value) }));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      toast.error('Use PNG, JPG ou SVG');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      toast.error('A imagem deve ter no máximo 2MB');
      e.target.value = '';
      return;
    }

    const previousLogo = form.logo_url;
    if (logoObjectUrlRef.current) {
      URL.revokeObjectURL(logoObjectUrlRef.current);
      logoObjectUrlRef.current = null;
    }

    const previewUrl = URL.createObjectURL(file);
    logoObjectUrlRef.current = previewUrl;
    setLogoPreview(previewUrl);

    setUploadingLogo(true);
    const fileExt = file.name.split('.').pop() || 'png';
    const fileName = `logos/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(fileName, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      toast.error('Erro ao enviar logo');
      setLogoPreview(previousLogo);
      setUploadingLogo(false);
      e.target.value = '';
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(fileName);

    const normalizedUrl = ensurePublicStorageUrl('product-images', publicUrl);
    setForm((prev) => ({ ...prev, logo_url: normalizedUrl }));
    setLogoPreview(normalizedUrl);
    if (logoObjectUrlRef.current) {
      URL.revokeObjectURL(logoObjectUrlRef.current);
      logoObjectUrlRef.current = null;
    }
    setUploadingLogo(false);
    e.target.value = '';
  };

  const handleRemoveLogo = () => {
    resetLogoPreview();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setForm((prev) => ({ ...prev, logo_url: null }));
  };

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const isSlugAvailable = async (slug: string) => {
    let query = supabase
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('slug', slug);

    if (id) {
      query = query.neq('id', id);
    }

    const { count, error } = await query;
    if (error) {
      throw error;
    }
    return (count ?? 0) === 0;
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (saving) return;

    const name = form.name.trim();
    const normalizedSlug = generateSlug(form.slug.trim() || name);

    if (!name) {
      toast.error('Nome é obrigatório');
      return;
    }

    if (!normalizedSlug) {
      toast.error('Slug inválido');
      return;
    }

    if (form.email.trim() && !isValidEmail(form.email.trim())) {
      toast.error('E-mail inválido');
      return;
    }

    if (form.phone.trim() && !validatePhone(form.phone)) {
      toast.error('Telefone invケlido');
      return;
    }

    if (form.whatsapp.trim() && !validatePhone(form.whatsapp)) {
      toast.error('WhatsApp invケlido');
      return;
    }

    setSaving(true);

    try {
      const slugChanged = !initialForm || initialForm.slug !== normalizedSlug;
      if (slugChanged) {
        const available = await isSlugAvailable(normalizedSlug);
        if (!available) {
          toast.error('Slug já existe');
          setSaving(false);
          return;
        }
      }

      if (form.slug !== normalizedSlug) {
        setForm((prev) => ({ ...prev, slug: normalizedSlug }));
      }

      const phoneDigits = form.phone.trim() ? normalizeDigits(form.phone) : null;
      const whatsappDigits = form.whatsapp.trim() ? normalizeDigits(form.whatsapp) : null;
      const normalizedData = {
        name,
        slug: normalizedSlug,
        description: form.description.trim() || null,
        phone: phoneDigits,
        whatsapp: whatsappDigits,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim().toUpperCase() || null,
        instagram: form.instagram.trim() || null,
        facebook: form.facebook.trim() || null,
        logo_url: form.logo_url,
        is_active: form.is_active,
      };

      if (isEditing && id) {
        const normalizedInitial = initialForm
          ? {
            ...normalizedData,
            name: initialForm.name.trim(),
            slug: generateSlug(initialForm.slug.trim()),
            description: initialForm.description.trim() || null,
            phone: initialForm.phone.trim() ? normalizeDigits(initialForm.phone) : null,
            whatsapp: initialForm.whatsapp.trim() ? normalizeDigits(initialForm.whatsapp) : null,
            email: initialForm.email.trim() || null,
            address: initialForm.address.trim() || null,
            city: initialForm.city.trim() || null,
            state: initialForm.state.trim().toUpperCase() || null,
            instagram: initialForm.instagram.trim() || null,
            facebook: initialForm.facebook.trim() || null,
            logo_url: initialForm.logo_url,
            is_active: initialForm.is_active,
          }
          : null;

        const payload: Partial<typeof normalizedData> = {};
        if (normalizedInitial) {
          const payloadKeys: Array<keyof typeof normalizedData> = [
            'name',
            'slug',
            'description',
            'phone',
            'whatsapp',
            'email',
            'address',
            'city',
            'state',
            'instagram',
            'facebook',
            'logo_url',
            'is_active',
          ];
          payloadKeys.forEach((key) => {
            if (normalizedData[key] !== normalizedInitial[key]) {
              payload[key] = normalizedData[key];
            }
          });
        } else {
          Object.assign(payload, normalizedData);
        }

        if (Object.keys(payload).length === 0) {
          toast.success('Nenhuma alteração para salvar');
          setSaving(false);
          return;
        }

        const { error } = await supabase
          .from('companies')
          .update(payload)
          .eq('id', id)
          .select()
          .single();

        if (error) {
          toast.error(error.message.includes('unique') ? 'Slug já existe' : 'Erro ao atualizar');
          setSaving(false);
          return;
        }
        toast.success('Empresa atualizada');
      } else {
        const { error } = await supabase.from('companies').insert(normalizedData);
        if (error) {
          toast.error(error.message.includes('unique') ? 'Slug já existe' : 'Erro ao cadastrar');
          setSaving(false);
          return;
        }
        toast.success('Empresa cadastrada');
      }

      navigate('/empresas');
    } finally {
      setSaving(false);
    }
  };

  const currentLogo = logoPreview || form.logo_url;

  if (loading) {
    return (
      <div className="page-container">
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="page-container pb-24">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/empresas')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="page-title">{isEditing ? 'Editar Empresa' : 'Nova Empresa'}</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Dados da Empresa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Nome da empresa"
                />
              </div>
              <div className="space-y-2">
                <Label>Slug (URL) *</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="minha-empresa"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">/catalogo/{form.slug || 'slug'}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Logo</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <div className="flex flex-wrap items-center gap-4">
                {currentLogo ? (
                  <img src={currentLogo} alt="Logo" className="w-16 h-16 object-cover rounded" />
                ) : (
                  <div className="w-16 h-16 bg-muted rounded flex items-center justify-center">
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingLogo}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingLogo ? 'Enviando...' : 'Enviar logo'}
                  </Button>
                  {currentLogo && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveLogo}
                      disabled={uploadingLogo}
                    >
                      Remover
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Descrição da empresa para o catálogo..."
                rows={3}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Telefone</Label>
                <PhoneInput
                  value={form.phone}
                  onChange={(value) => setForm((prev) => ({ ...prev, phone: value }))}
                  placeholder="(00) 0000-0000"
                />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp</Label>
                <PhoneInput
                  value={form.whatsapp}
                  onChange={(value) => setForm((prev) => ({ ...prev, whatsapp: value }))}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="contato@empresa.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Instagram</Label>
                <Input
                  value={form.instagram}
                  onChange={(e) => setForm((prev) => ({ ...prev, instagram: e.target.value }))}
                  placeholder="@empresa"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Endereço</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Rua, número"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Input
                  value={form.state}
                  onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value.toUpperCase() }))}
                  maxLength={2}
                  placeholder="SP"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((prev) => ({ ...prev, is_active: v }))} />
              <Label>Empresa ativa (catálogo visível)</Label>
            </div>
          </CardContent>
        </Card>

        <div className="sticky bottom-0 z-10 border-t bg-background/95 py-4 backdrop-blur">
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => navigate('/empresas')} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || uploadingLogo}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              Salvar
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
