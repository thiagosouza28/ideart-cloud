import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

  const [form, setForm] = useState({
    name: '',
    document: '',
    email: '',
    phone: '',
    zip_code: '',
    address: '',
    city: '',
    state: '',
    notes: '',
  });

  useEffect(() => {
    if (!isEditing) return;
    supabase.from('customers').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) return;
      setForm({
        name: data.name || '',
        document: data.document ? formatCpfCnpj(data.document) : '',
        email: data.email || '',
        phone: data.phone ? formatPhone(data.phone) : '',
        zip_code: data.zip_code ? formatCep(data.zip_code) : '',
        address: data.address || '',
        city: data.city || '',
        state: data.state || '',
        notes: data.notes || '',
      });
    });
  }, [id, isEditing]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error('Nome é obrigatório');
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
