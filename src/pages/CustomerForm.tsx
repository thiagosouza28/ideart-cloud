import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  CpfCnpjInput,
  PhoneInput,
  CepInput,
  validateCpfCnpj,
  formatCpfCnpj,
  formatPhone,
  formatCep,
  normalizeDigits,
  validatePhone,
} from '@/components/ui/masked-input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { ensurePublicStorageUrl, getStoragePathFromUrl } from '@/lib/storage';
import { calculateAge, parseDateInput } from '@/lib/birthdays';

const ESTADOS_BR = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

export default function CustomerForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [documentError, setDocumentError] = useState('');
  const [birthDateError, setBirthDateError] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    document: '',
    email: '',
    phone: '',
    date_of_birth: '',
    photo_url: '',
    zip_code: '',
    address: '',
    city: '',
    state: '',
    notes: '',
  });

  useEffect(() => {
    setInitialSnapshot(null);
  }, [id]);

  useEffect(() => {
    if (!isEditing) return;
    supabase.from('customers').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) return;
      const nextForm = {
        name: data.name || '',
        document: data.document ? formatCpfCnpj(data.document) : '',
        email: data.email || '',
        phone: data.phone ? formatPhone(data.phone) : '',
        date_of_birth: data.date_of_birth || '',
        photo_url: data.photo_url || '',
        zip_code: data.zip_code ? formatCep(data.zip_code) : '',
        address: data.address || '',
        city: data.city || '',
        state: data.state || '',
        notes: data.notes || '',
      };
      setForm(nextForm);
      setBirthDateError('');
      setInitialSnapshot(JSON.stringify(nextForm));
    });
  }, [id, isEditing]);

  const formSnapshot = useMemo(() => ({
    name: form.name,
    document: form.document,
    email: form.email,
    phone: form.phone,
    date_of_birth: form.date_of_birth,
    photo_url: form.photo_url,
    zip_code: form.zip_code,
    address: form.address,
    city: form.city,
    state: form.state,
    notes: form.notes,
  }), [form]);
  const formSnapshotJson = useMemo(() => JSON.stringify(formSnapshot), [formSnapshot]);
  const isDirty = initialSnapshot !== null && initialSnapshot !== formSnapshotJson;

  useEffect(() => {
    if (!isEditing && initialSnapshot === null) {
      setInitialSnapshot(formSnapshotJson);
    }
  }, [isEditing, initialSnapshot, formSnapshotJson]);

  useUnsavedChanges(isDirty && !loading);

  const formatDateInputValue = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayInputValue = formatDateInputValue(new Date());

  const validateBirthDate = (value: string) => {
    if (!value) return 'Data de nascimento e obrigatoria';
    const parsed = parseDateInput(value);
    if (!parsed) return 'Data de nascimento invalida';
    const today = new Date();
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (parsed > todayDate) return 'Data de nascimento nao pode ser futura';
    return '';
  };

  const handleBirthDateChange = (value: string) => {
    setForm((prev) => ({ ...prev, date_of_birth: value }));
    setBirthDateError(validateBirthDate(value));
  };

  const photoPreview = ensurePublicStorageUrl('customer-photos', form.photo_url);
  const customerInitials = form.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'CL';

  const currentAge = useMemo(() => calculateAge(form.date_of_birth), [form.date_of_birth]);

  const handleDocumentChange = (value: string) => {
    const formatted = formatCpfCnpj(value);
    setForm(prev => ({ ...prev, document: formatted }));

    const digits = normalizeDigits(value);
    if (digits.length === 11 || digits.length === 14) {
      const { valid, type } = validateCpfCnpj(formatted);
      if (!valid) {
        setDocumentError(`${type === 'cpf' ? 'CPF' : 'CNPJ'} inválido`);
      } else {
        setDocumentError('');
      }
    } else {
      setDocumentError('');
    }
  };

  const handleCepChange = async (value: string) => {
    const formatted = formatCep(value);
    setForm(prev => ({ ...prev, zip_code: formatted }));

    const digits = normalizeDigits(value);
    if (digits.length !== 8) return;

    setLoadingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await response.json();
      if (!data.erro) {
        setForm(prev => ({
          ...prev,
          address: data.logradouro || prev.address,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
        }));
      }
    } catch {
      // Ignore CEP lookup errors
    } finally {
      setLoadingCep(false);
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Selecione uma imagem JPG, PNG ou WEBP.');
      event.target.value = '';
      return;
    }

    const maxSizeMb = 5;
    if (file.size > maxSizeMb * 1024 * 1024) {
      toast.error(`Imagem deve ter no maximo ${maxSizeMb}MB.`);
      event.target.value = '';
      return;
    }

    setUploadingPhoto(true);
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`;
    const filePath = `customers/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('customer-photos')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast.error('Erro ao enviar foto do cliente');
      setUploadingPhoto(false);
      event.target.value = '';
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('customer-photos')
      .getPublicUrl(filePath);

    const normalizedUrl = ensurePublicStorageUrl('customer-photos', publicUrl);
    if (normalizedUrl) {
      const previousUrl = form.photo_url;
      setForm((prev) => ({ ...prev, photo_url: normalizedUrl }));

      if (previousUrl && previousUrl !== normalizedUrl) {
        const previousPath = getStoragePathFromUrl('customer-photos', previousUrl);
        await supabase.storage.from('customer-photos').remove([previousPath]);
      }
      toast.success('Foto enviada com sucesso');
    }

    setUploadingPhoto(false);
    event.target.value = '';
  };

  const removePhoto = async () => {
    if (!form.photo_url) return;
    const path = getStoragePathFromUrl('customer-photos', form.photo_url);
    await supabase.storage.from('customer-photos').remove([path]);
    setForm((prev) => ({ ...prev, photo_url: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    const birthDateErrorMessage = validateBirthDate(form.date_of_birth);
    if (birthDateErrorMessage) {
      setBirthDateError(birthDateErrorMessage);
      toast.error(birthDateErrorMessage);
      return;
    }

    if (form.document) {
      const { valid } = validateCpfCnpj(form.document);
      if (!valid) {
        toast.error('CPF/CNPJ inválido');
        return;
      }
    }

    if (form.phone && !validatePhone(form.phone)) {
      toast.error('Telefone inválido. Use um celular brasileiro válido.');
      return;
    }

    setLoading(true);

    const documentDigits = form.document ? normalizeDigits(form.document) : null;
    const phoneDigits = form.phone ? normalizeDigits(form.phone) : null;

    if (documentDigits) {
      const { data: existingDoc } = await supabase
        .from('customers')
        .select('id')
        .eq('document', documentDigits)
        .neq('id', id ?? '')
        .maybeSingle();
      if (existingDoc?.id) {
        toast.error('CPF/CNPJ já cadastrado para outro cliente.');
        setLoading(false);
        return;
      }
    }

    const customerData = {
      name: form.name.trim(),
      document: documentDigits,
      email: form.email || null,
      phone: phoneDigits,
      date_of_birth: form.date_of_birth || null,
      photo_url: form.photo_url || null,
      zip_code: form.zip_code ? normalizeDigits(form.zip_code) : null,
      address: form.address || null,
      city: form.city || null,
      state: form.state || null,
      notes: form.notes || null,
    };

    if (isEditing) {
      const { error } = await supabase.from('customers').update(customerData).eq('id', id);
      if (error) {
        toast.error('Erro ao atualizar cliente');
        setLoading(false);
        return;
      }
      toast.success('Cliente atualizado com sucesso');
    } else {
      const { error } = await supabase.from('customers').insert(customerData);
      if (error) {
        toast.error('Erro ao cadastrar cliente');
        setLoading(false);
        return;
      }
      toast.success('Cliente cadastrado com sucesso');
    }

    navigate('/clientes');
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/clientes')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="page-title">{isEditing ? 'Editar Cliente' : 'Novo Cliente'}</h1>
        </div>
        <Button onClick={handleSubmit} disabled={loading}>
          <Save className="mr-2 h-4 w-4" />
          {loading ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Dados Pessoais</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="name">Nome / Razão Social *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nome completo ou razão social"
                required
              />
            </div>

            <div>
              <Label htmlFor="document">CPF / CNPJ</Label>
              <CpfCnpjInput
                id="document"
                value={form.document}
                onChange={handleDocumentChange}
                className={documentError ? 'border-destructive' : ''}
              />
              {documentError && <p className="text-sm text-destructive mt-1">{documentError}</p>}
            </div>

            <div>
              <Label htmlFor="phone">Telefone (WhatsApp)</Label>
              <PhoneInput
                id="phone"
                value={form.phone}
                onChange={(value) => setForm(prev => ({ ...prev, phone: value }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@exemplo.com"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nascimento e foto</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="date_of_birth">Data de nascimento *</Label>
              <Input
                id="date_of_birth"
                type="date"
                value={form.date_of_birth}
                onChange={(e) => handleBirthDateChange(e.target.value)}
                max={todayInputValue}
                className={birthDateError ? 'border-destructive' : ''}
                required
              />
              {birthDateError && <p className="text-sm text-destructive mt-1">{birthDateError}</p>}
              {currentAge !== null && !birthDateError && (
                <p className="text-xs text-muted-foreground mt-1">Idade atual: {currentAge} anos</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="photo">Foto do cliente</Label>
                <Input
                  id="photo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handlePhotoUpload}
                  disabled={uploadingPhoto}
                />
                <p className="text-xs text-muted-foreground">JPG, PNG ou WEBP. Opcional.</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Avatar className="h-16 w-16">
                  {photoPreview ? (
                    <AvatarImage src={photoPreview} alt={form.name || 'Cliente'} />
                  ) : null}
                  <AvatarFallback className="bg-muted text-xs">{customerInitials}</AvatarFallback>
                </Avatar>
                {form.photo_url && (
                  <Button type="button" variant="outline" size="sm" onClick={removePhoto}>
                    Remover foto
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Endereço</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="zip_code">CEP</Label>
              <CepInput
                id="zip_code"
                value={form.zip_code}
                onChange={(value) => setForm(prev => ({ ...prev, zip_code: value }))}
                onSearch={handleCepChange}
                disabled={loadingCep}
              />
              {loadingCep && <p className="text-sm text-muted-foreground mt-1">Buscando endereço...</p>}
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="address">Endereço</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))}
                placeholder="Rua, número, complemento"
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="city">Cidade</Label>
              <Input
                id="city"
                value={form.city}
                onChange={(e) => setForm(prev => ({ ...prev, city: e.target.value }))}
                placeholder="Cidade"
              />
            </div>

            <div>
              <Label htmlFor="state">Estado</Label>
              <Select value={form.state} onValueChange={(v) => setForm(prev => ({ ...prev, state: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS_BR.map((uf) => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Observações sobre o cliente..."
              rows={4}
            />
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
