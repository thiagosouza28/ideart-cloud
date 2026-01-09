import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { User, Mail, Building2, Shield, Save, Loader2 } from 'lucide-react';
import { AppRole, Company } from '@/types/database';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';

const roleLabels: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  atendente: 'Atendente',
  caixa: 'Caixa',
  producao: 'Produção',
};

export default function Profile() {
  const { user, profile, role } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.company_id) {
      supabase
        .from('companies')
        .select('*')
        .eq('id', profile.company_id)
        .single()
        .then(({ data }) => {
          if (data) {
            setCompany({
              ...(data as Company),
              logo_url: ensurePublicStorageUrl('product-images', data.logo_url),
            });
          }
        });
    }
  }, [profile?.company_id]);

  useEffect(() => {
    if (!profile) return;
    const nextName = profile.full_name || '';
    setFullName(nextName);
    setInitialSnapshot(JSON.stringify({ full_name: nextName }));
  }, [profile]);

  const snapshotJson = useMemo(() => JSON.stringify({ full_name: fullName }), [fullName]);
  const isDirty = initialSnapshot !== null && initialSnapshot !== snapshotJson;

  useUnsavedChanges(isDirty && !saving);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', user.id);

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Perfil atualizado com sucesso!' });
    }
    setSaving(false);
  };

  return (
    <div className="page-container w-full max-w-none">
      <div className="page-header mb-6">
        <h1 className="page-title">Minha Conta</h1>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informações Pessoais
            </CardTitle>
            <CardDescription>Gerencie suas informações de perfil</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome Completo</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome completo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  value={user?.email || ''}
                  disabled
                  className="pl-9 bg-muted"
                />
              </div>
              <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado</p>
            </div>

            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar Alterações
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Função no Sistema
            </CardTitle>
            <CardDescription>Sua função determina suas permissões</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{role ? roleLabels[role] : 'Carregando...'}</p>
                <p className="text-sm text-muted-foreground">Função atribuída pelo administrador</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {company && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Empresa
              </CardTitle>
              <CardDescription>Informações da empresa vinculada</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                {company.logo_url ? (
                  <img src={company.logo_url} alt={company.name} className="h-12 w-12 rounded-lg object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                )}
                <div>
                  <p className="font-medium">{company.name}</p>
                  {company.email && <p className="text-sm text-muted-foreground">{company.email}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
