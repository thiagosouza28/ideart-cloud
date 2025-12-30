import { useEffect, useState } from 'react';
import { CreditCard, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/services/edgeFunctions';
import { toast } from 'sonner';
import type { Plan, BillingPeriod } from '@/types/database';

const defaultPlan: Partial<Plan> = {
  name: '',
  description: '',
  price: 0,
  billing_period: 'monthly',
  features: [],
  max_users: null,
  is_active: true,
};

export default function SuperAdminPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState<Partial<Plan>>(defaultPlan);
  const [newFeature, setNewFeature] = useState('');

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .order('price', { ascending: true });

    if (error) {
      toast.error('Erro ao carregar planos');
      return;
    }

    setPlans((data || []) as Plan[]);
    setLoading(false);
  };

  const openCreateDialog = () => {
    setSelectedPlan(null);
    setFormData(defaultPlan);
    setDialogOpen(true);
  };

  const openEditDialog = (plan: Plan) => {
    const periodDaysBase = plan.billing_period === 'yearly' ? 365 : 30;
    const intervalCount = Math.round((plan.period_days || periodDaysBase) / periodDaysBase);

    setSelectedPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description,
      price: plan.price,
      billing_period: plan.billing_period as BillingPeriod,
      features: plan.features || [],
      max_users: plan.max_users,
      is_active: plan.is_active,
      ['interval_count' as any]: intervalCount,
      ['trial_days' as any]: 0, // Fallback as it's not in DB yet
    });
    setDialogOpen(true);
  };

  const openDeleteDialog = (plan: Plan) => {
    setSelectedPlan(plan);
    setDeleteDialogOpen(true);
  };

  const addFeature = () => {
    if (!newFeature.trim()) return;
    setFormData({
      ...formData,
      features: [...(formData.features || []), newFeature.trim()],
    });
    setNewFeature('');
  };

  const removeFeature = (index: number) => {
    setFormData({
      ...formData,
      features: (formData.features || []).filter((_, i) => i !== index),
    });
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast.error('Nome é obrigatório');
      return;
    }

    const periodDays = (formData.billing_period || 'monthly') === 'yearly' ? 365 : 30;
    const intervalCount = (formData as any).interval_count || 1;

    const planData = {
      name: formData.name,
      description: formData.description || null,
      price: formData.price || 0,
      interval: (formData.billing_period || 'monthly') === 'yearly' ? 'year' : 'month',
      interval_count: intervalCount,
      billing_period: formData.billing_period || 'monthly',
      period_days: periodDays * intervalCount,
      features: formData.features || [],
      max_users: formData.max_users || null,
      is_active: formData.is_active ?? true,
      trial_days: (formData as any).trial_days || 0,
    };

    if (selectedPlan) {
      const localUpdateData = {
        name: planData.name,
        description: planData.description,
        price: planData.price,
        billing_period: planData.billing_period,
        period_days: planData.period_days,
        features: planData.features,
        max_users: planData.max_users,
        is_active: planData.is_active,
      };

      const { error } = await supabase
        .from('plans')
        .update(localUpdateData)
        .eq('id', selectedPlan.id);

      if (error) {
        toast.error('Erro ao atualizar plano');
        return;
      }

      toast.success('Plano atualizado com sucesso');
    } else {
      try {
        await invokeEdgeFunction<{ plan: Plan }>('create-plan', planData);
        toast.success('Plano criado com sucesso');
      } catch (error: any) {
        const message = error?.message || 'Erro ao criar plano';
        toast.error(message);
        return;
      }
    }

    setDialogOpen(false);
    loadPlans();
  };

  const handleDelete = async () => {
    if (!selectedPlan) return;

    const { error } = await supabase
      .from('plans')
      .delete()
      .eq('id', selectedPlan.id);

    if (error) {
      toast.error('Erro ao excluir plano. Pode haver empresas usando este plano.');
      return;
    }

    toast.success('Plano excluído com sucesso');
    setDeleteDialogOpen(false);
    loadPlans();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Planos de Assinatura</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure os planos disponíveis para as empresas
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Plano
        </Button>
      </div>

      {plans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum plano cadastrado</h3>
            <p className="text-muted-foreground mb-4">
              Crie seu primeiro plano de assinatura para as empresas
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Plano
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className={!plan.is_active ? 'opacity-60' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {plan.name}
                      {!plan.is_active && (
                        <Badge variant="outline" className="bg-muted">Inativo</Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">{plan.description}</CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(plan)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(plan)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <span className="text-3xl font-bold">{formatCurrency(plan.price)}</span>
                  <span className="text-muted-foreground">
                    /{plan.billing_period === 'monthly' ? 'mês' : 'ano'}
                  </span>
                </div>

                {plan.max_users && (
                  <p className="text-sm text-muted-foreground mb-3">
                    Até {plan.max_users} usuário{plan.max_users > 1 ? 's' : ''}
                  </p>
                )}

                {plan.features && plan.features.length > 0 && (
                  <ul className="space-y-2">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-chart-2" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedPlan ? 'Editar Plano' : 'Novo Plano'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Básico, Profissional, Empresarial"
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição breve do plano"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Preço *</Label>
                <CurrencyInput
                  value={formData.price || 0}
                  onChange={(value) => setFormData({ ...formData, price: value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Duração do Ciclo</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="1"
                    className="w-20"
                    value={(formData as any).interval_count || 1}
                    onChange={(e) => setFormData({ ...formData, ['interval_count' as any]: parseInt(e.target.value) || 1 })}
                  />
                  <Select
                    value={formData.billing_period || 'monthly'}
                    onValueChange={(value) => setFormData({ ...formData, billing_period: value as BillingPeriod })}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mês(es)</SelectItem>
                      <SelectItem value="yearly">Ano(s)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Dias de Teste (Trial)</Label>
                <Input
                  type="number"
                  min="0"
                  value={(formData as any).trial_days || 0}
                  onChange={(e) => setFormData({ ...formData, ['trial_days' as any]: parseInt(e.target.value) || 0 })}
                  placeholder="0 (sem trial)"
                />
              </div>
              <div className="space-y-2">
                <Label>Máximo de Usuários</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.max_users || ''}
                  onChange={(e) => setFormData({ ...formData, max_users: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Ilimitado"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Funcionalidades</Label>
              <div className="flex gap-2">
                <Input
                  value={newFeature}
                  onChange={(e) => setNewFeature(e.target.value)}
                  placeholder="Ex: Acesso ao PDV"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())}
                />
                <Button type="button" variant="outline" onClick={addFeature}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {formData.features && formData.features.length > 0 && (
                <div className="space-y-2 mt-2">
                  {formData.features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                      <Check className="h-4 w-4 text-chart-2 shrink-0" />
                      <span className="flex-1 text-sm">{feature}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeFeature(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Label>Plano Ativo</Label>
              <Switch
                checked={formData.is_active ?? true}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Excluir Plano</DialogTitle>
          </DialogHeader>
          <p className="py-4">
            Tem certeza que deseja excluir o plano <strong>{selectedPlan?.name}</strong>?
            Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}



