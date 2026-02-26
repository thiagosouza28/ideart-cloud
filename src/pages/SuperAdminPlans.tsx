import { useEffect, useMemo, useRef, useState } from 'react';
import { CreditCard, Plus, Pencil, Trash2, Check, X, LayoutGrid, Copy } from 'lucide-react';
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
import { listCaktoOffers } from '@/services/cakto';
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
  cakto_plan_id: null,
};

type CaktoOffer = {
  id: string;
  name?: string | null;
  price?: number | null;
  intervalType?: string | null;
  interval?: number | null;
  status?: string | null;
  checkoutUrl?: string | null;
};

export default function SuperAdminPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<CaktoOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<CaktoOffer | null>(null);
  const [formData, setFormData] = useState<Partial<Plan>>(defaultPlan);
  const [newFeature, setNewFeature] = useState('');
  const autoSyncedRef = useRef(false);
  const syncLoadingRef = useRef(false);

  useEffect(() => {
    loadPlans();
    loadOffers();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('cakto_auto_sync');
    if (saved !== null) {
      setAutoSyncEnabled(saved === 'true');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('cakto_auto_sync', String(autoSyncEnabled));
  }, [autoSyncEnabled]);

  useEffect(() => {
    syncLoadingRef.current = syncLoading;
  }, [syncLoading]);

  useEffect(() => {
    if (!autoSyncEnabled) return;
    if (autoSyncedRef.current) return;
    if (offersLoading) return;
    if (!offers.length) return;
    autoSyncedRef.current = true;
    handleSyncOffers();
  }, [offersLoading, offers]);

  useEffect(() => {
    if (!autoSyncEnabled) return;
    const intervalMs = 5 * 60 * 1000;
    const intervalId = window.setInterval(() => {
      if (offersLoading || syncLoadingRef.current) return;
      if (!offers.length) return;
      handleSyncOffers();
    }, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [offersLoading, offers]);

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

  const loadOffers = async () => {
    setOffersLoading(true);
    try {
      const resp = await listCaktoOffers();
      const mapped = (resp?.offers || []).map((offer) => ({
        id: String(offer.id),
        name: offer.name ? String(offer.name) : null,
        price: typeof offer.price === 'number' ? offer.price : Number(offer.price ?? 0),
        intervalType: offer.intervalType ? String(offer.intervalType) : null,
        interval: offer.interval ? Number(offer.interval) : null,
        status: offer.status ? String(offer.status) : null,
        checkoutUrl: offer.checkout_url ? String(offer.checkout_url) : null,
      }));
      setOffers(mapped.filter((offer) => offer.id));
    } catch (error) {
      console.error('Failed to load CAKTO offers', error);
      toast.error('Erro ao carregar planos da Cakto');
    } finally {
      setOffersLoading(false);
    }
  };

  const normalizeOfferId = (value?: string | null) => {
    if (!value) return null;
    if (value.startsWith('http')) {
      return value.split('/').pop() ?? null;
    }
    return value;
  };

  const openCreateDialog = () => {
    setSelectedPlan(null);
    setSelectedOffer(null);
    setFormData(defaultPlan);
    setDialogOpen(true);
  };

  const openEditDialog = (plan: Plan) => {
    const periodDaysBase = plan.billing_period === 'yearly' ? 365 : 30;
    const intervalCount = Math.round((plan.period_days || periodDaysBase) / periodDaysBase);

    setSelectedPlan(plan);
    setSelectedOffer(null);
    setFormData({
      name: plan.name,
      description: plan.description,
      price: plan.price,
      billing_period: plan.billing_period as BillingPeriod,
      features: plan.features || [],
      max_users: plan.max_users,
      is_active: plan.is_active,
      cakto_plan_id: plan.cakto_plan_id,
      ['interval_count' as any]: intervalCount,
      ['trial_days' as any]: 0,
    });
    setDialogOpen(true);
  };

  const openOfferDialog = (offer: CaktoOffer) => {
    const billingPeriod = offer.intervalType === 'year' || offer.intervalType === 'yearly' ? 'yearly' : 'monthly';
    const intervalCount = offer.interval || 1;
    setSelectedPlan(null);
    setSelectedOffer(offer);
    setFormData({
      name: offer.name || 'Plano Cakto',
      description: '',
      price: typeof offer.price === 'number' ? offer.price : 0,
      billing_period: billingPeriod,
      features: [],
      max_users: null,
      is_active: true,
      cakto_plan_id: offer.id,
      ['interval_count' as any]: intervalCount,
      ['trial_days' as any]: 0,
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
      cakto_plan_id: formData.cakto_plan_id || null,
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
        cakto_plan_id: planData.cakto_plan_id,
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
    } else if (selectedOffer) {
      const { error } = await supabase
        .from('plans')
        .insert({
          name: planData.name,
          description: planData.description,
          price: planData.price,
          billing_period: planData.billing_period,
          period_days: planData.period_days,
          features: planData.features,
          max_users: planData.max_users,
          is_active: planData.is_active,
          cakto_plan_id: planData.cakto_plan_id,
        });

      if (error) {
        toast.error('Erro ao importar plano da Cakto');
        return;
      }

      toast.success('Plano importado com sucesso');
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
    loadOffers();
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

    toast.success('Plano excluido com sucesso');
    setDeleteDialogOpen(false);
    loadPlans();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const displayItems = useMemo(() => {
    const linkedOfferIds = new Set(
      plans
        .map((plan) => normalizeOfferId(plan.cakto_plan_id ?? undefined))
        .filter(Boolean) as string[]
    );

    const planItems = plans.map((plan) => ({
      key: plan.id,
      plan,
      offer: null as CaktoOffer | null,
    }));

    const offerItems = offers
      .filter((offer) => !linkedOfferIds.has(offer.id))
      .map((offer) => ({
        key: `offer-${offer.id}`,
        plan: null as Plan | null,
        offer,
      }));

    return [...planItems, ...offerItems];
  }, [plans, offers]);

  const handleSyncOffers = async () => {
    if (!offers.length) {
      toast.error('Nenhum plano da Cakto encontrado');
      return;
    }

    setSyncLoading(true);
    try {
      const payload = offers.map((offer) => {
        const billingPeriod = offer.intervalType === 'year' || offer.intervalType === 'yearly' ? 'yearly' : 'monthly';
        const intervalCount = offer.interval || 1;
        const periodDays = (billingPeriod === 'yearly' ? 365 : 30) * intervalCount;
        return {
          name: offer.name || 'Plano Cakto',
          description: null,
          price: typeof offer.price === 'number' ? offer.price : 0,
          billing_period: billingPeriod,
          period_days: periodDays,
          features: [],
          max_users: null,
          is_active: true,
          cakto_plan_id: offer.id,
        };
      });

      const { error } = await supabase
        .from('plans')
        .upsert(payload, { onConflict: 'cakto_plan_id' });
      if (error) {
        console.warn('Upsert failed, falling back to per-item sync', error);
        for (const entry of payload) {
          const { data: existing } = await supabase
            .from('plans')
            .select('id')
            .eq('cakto_plan_id', entry.cakto_plan_id)
            .maybeSingle();
          if (existing?.id) {
            await supabase.from('plans').update(entry).eq('id', existing.id);
          } else {
            await supabase.from('plans').insert(entry);
          }
        }
      }

      toast.success('Planos da Cakto sincronizados com sucesso');
      await loadPlans();
    } finally {
      setSyncLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="flex items-center justify-center h-64">
          <p className="text-slate-500">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 text-slate-600">
          <LayoutGrid className="h-5 w-5" />
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Planos de Assinatura</h1>
            <p className="text-sm text-slate-500">Configure os planos disponiveis para as empresas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <span className="text-xs text-slate-500">Auto sync 5 min</span>
            <Switch
              checked={autoSyncEnabled}
              onCheckedChange={(checked) => setAutoSyncEnabled(checked)}
            />
          </div>
          <Button variant="outline" onClick={handleSyncOffers} disabled={offersLoading || syncLoading}>
            {syncLoading ? 'Sincronizando...' : 'Sincronizar Cakto'}
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Plano
          </Button>
        </div>
      </div>

      {plans.length === 0 && offers.length === 0 ? (
        <Card className="border-slate-200">
          <CardContent className="py-12 text-center">
            <CreditCard className="h-12 w-12 mx-auto text-slate-400 mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum plano cadastrado</h3>
            <p className="text-slate-500 mb-4">
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
          {displayItems.map(({ plan, offer, key }) => {
            const title = plan?.name || offer?.name || 'Plano Cakto';
            const description = plan?.description || (offer ? 'Plano cadastrado na Cakto' : null);
            const price = plan?.price ?? (typeof offer?.price === 'number' ? offer.price : 0);
            const billingPeriod = plan?.billing_period || (offer?.intervalType === 'year' || offer?.intervalType === 'yearly' ? 'yearly' : 'monthly');
            const isInactive = plan ? !plan.is_active : false;
            return (
              <Card key={key} className={`border-slate-200 ${isInactive ? 'opacity-60' : ''}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {title}
                        {offer && !plan && (
                          <Badge variant="outline" className="bg-slate-100">Cakto</Badge>
                        )}
                        {plan && !plan.is_active && (
                          <Badge variant="outline" className="bg-slate-100">Inativo</Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="mt-1">{description}</CardDescription>
                    </div>
                    <div className="flex gap-1">
                      {plan ? (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(plan)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(plan)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => offer && openOfferDialog(offer)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <span className="text-3xl font-bold">{formatCurrency(price)}</span>
                    <span className="text-slate-500">
                      /{billingPeriod === 'monthly' ? 'mes' : 'ano'}
                    </span>
                  </div>

                  {offer?.checkoutUrl && (
                    <div className="mb-3 flex gap-2">
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => window.open(offer.checkoutUrl as string, '_blank')}
                      >
                        Abrir checkout Cakto
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          navigator.clipboard.writeText(offer.checkoutUrl as string);
                          toast.success('Link copiado');
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  {plan?.max_users && (
                    <p className="text-sm text-slate-500 mb-3">
                      Até {plan.max_users} usuário{plan.max_users > 1 ? 's' : ''}
                    </p>
                  )}

                  {plan?.features && plan.features.length > 0 && (
                    <ul className="space-y-2">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-emerald-500" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
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
                placeholder="Ex: Basico, Profissional, Empresarial"
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
                      <SelectItem value="monthly">Mes(es)</SelectItem>
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
                    <div key={index} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
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
            <div className="space-y-2">
              <Label>ID do Plano na Cakto</Label>
              <Input
                value={formData.cakto_plan_id || ''}
                onChange={(e) => setFormData({ ...formData, cakto_plan_id: e.target.value })}
                placeholder="Ex: 123456"
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
