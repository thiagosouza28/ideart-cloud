import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, ShieldAlert } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchCompanyPaymentSettings,
  fetchPaymentWebhookLogs,
  updateCompanyPaymentSettings,
  type CompanyPaymentSettings,
  type PaymentWebhookLog,
} from '@/services/payments';
import {
  fetchCompanyPaymentMethods,
  saveCompanyPaymentMethods,
} from '@/services/companyPaymentMethods';
import {
  defaultCompanyPaymentMethods,
  normalizeCompanyPaymentMethods,
  paymentMethodTypeLabels,
  type CompanyPaymentMethodConfig,
  type CheckoutPaymentMethodType,
} from '@/lib/paymentMethods';
import type { PixGateway, PixKeyType } from '@/types/database';

const formatDate = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
};

const GATEWAY_LABELS: Record<string, string> = {
  mercadopago: 'MercadoPago',
  mercado_pago: 'MercadoPago',
  pagseguro: 'PagSeguro',
  pixmanual: 'PixManual',
  pix_manual: 'PixManual',
  manual: 'PixManual',
};

const EVENT_LABELS: Record<string, string> = {
  'payment.created': 'Pagamento criado',
  'payment.updated': 'Pagamento atualizado',
  'payment.approved': 'Pagamento aprovado',
  'payment.pending': 'Pagamento pendente',
  'payment.canceled': 'Pagamento cancelado',
  'payment.cancelled': 'Pagamento cancelado',
  'payment.failed': 'Pagamento com falha',
  'payment.refunded': 'Pagamento reembolsado',
  'payment.authorized': 'Pagamento autorizado',
  'payment.captured': 'Pagamento capturado',
  'payment.paid': 'Pagamento pago',
};

const STATUS_LABELS: Record<string, string> = {
  approved: 'Aprovado',
  pending: 'Pendente',
  paid: 'Pago',
  in_process: 'Em processamento',
  in_review: 'Em análise',
  authorized: 'Autorizado',
  processing: 'Processando',
  rejected: 'Rejeitado',
  cancelled: 'Cancelado',
  canceled: 'Cancelado',
  refunded: 'Reembolsado',
  failed: 'Falha',
  error: 'Erro',
  success: 'Sucesso',
  created: 'Criado',
  updated: 'Atualizado',
  unknown: 'Desconhecido',
};

const LOG_WORD_LABELS: Record<string, string> = {
  payment: 'pagamento',
  webhook: 'webhook',
  order: 'pedido',
  transaction: 'transação',
  charge: 'cobrança',
  notification: 'notificação',
  pix: 'pix',
  created: 'criado',
  updated: 'atualizado',
  approved: 'aprovado',
  pending: 'pendente',
  canceled: 'cancelado',
  cancelled: 'cancelado',
  failed: 'falha',
  paid: 'pago',
  processing: 'processando',
  authorized: 'autorizado',
  refunded: 'reembolsado',
  received: 'recebido',
};

const checkoutCompatibleTypes = new Set<CheckoutPaymentMethodType>([
  'pix',
  'dinheiro',
  'credito',
  'debito',
  'transferencia',
  'outro',
]);

const normalizeLogValue = (value: string) => value.trim().toLowerCase();

const sentenceCase = (value: string) =>
  value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;

const formatLogLabel = (value: string, exactMap: Record<string, string>) => {
  const normalized = normalizeLogValue(value);
  if (exactMap[normalized]) return exactMap[normalized];

  const parts = normalized.split(/[.\s:_-]+/g).filter(Boolean);
  if (!parts.length) return value;

  const translated = parts.map((part) => LOG_WORD_LABELS[part] || STATUS_LABELS[part]?.toLowerCase() || part);
  return sentenceCase(translated.join(' '));
};

const getGatewayLabel = (gateway: string | null) => {
  if (!gateway) return '-';
  const normalized = normalizeLogValue(gateway);
  return GATEWAY_LABELS[normalized] || gateway;
};

const getEventLabel = (eventType: string | null) => {
  if (!eventType) return '-';
  return formatLogLabel(eventType, EVENT_LABELS);
};

const getStatusLabel = (status: string | null) => {
  if (!status) return '-';
  return formatLogLabel(status, STATUS_LABELS);
};

const createEmptyMethods = (companyId?: string | null) =>
  normalizeCompanyPaymentMethods(defaultCompanyPaymentMethods, companyId || null);

export default function PaymentSettings() {
  const { toast } = useToast();
  const { profile, company } = useAuth();
  const location = useLocation();
  const companyId = profile?.company_id || company?.id || null;
  const defaultTab = location.pathname.endsWith('/pix') ? 'pix' : 'methods';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingMethods, setSavingMethods] = useState(false);
  const [reloadingLogs, setReloadingLogs] = useState(false);
  const [settings, setSettings] = useState<CompanyPaymentSettings | null>(null);
  const [logs, setLogs] = useState<PaymentWebhookLog[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<CompanyPaymentMethodConfig[]>(
    createEmptyMethods(companyId),
  );
  const [form, setForm] = useState({
    pix_enabled: false,
    pix_gateway: '' as PixGateway | '',
    pix_key_type: '' as PixKeyType | '',
    pix_key: '',
    pix_beneficiary_name: '',
    mp_access_token: '',
    pagseguro_token: '',
    admin_password: '',
  });

  const requiresManualPixFields = useMemo(
    () => form.pix_gateway === 'PixManual',
    [form.pix_gateway],
  );

  const activeMethodsCount = useMemo(
    () => paymentMethods.filter((method) => method.is_active).length,
    [paymentMethods],
  );

  const activeCheckoutMethodsCount = useMemo(
    () =>
      paymentMethods.filter(
        (method) =>
          method.is_active &&
          checkoutCompatibleTypes.has(method.type as CheckoutPaymentMethodType),
      ).length,
    [paymentMethods],
  );

  const loadPageData = async () => {
    setLoading(true);
    try {
      const [settingsResult, logsResult, methodsResult] = await Promise.all([
        fetchCompanyPaymentSettings(),
        fetchPaymentWebhookLogs(),
        fetchCompanyPaymentMethods({ companyId }),
      ]);

      setSettings(settingsResult);
      setLogs(logsResult);
      setPaymentMethods(normalizeCompanyPaymentMethods(methodsResult, companyId));
      setForm({
        pix_enabled: settingsResult.pix_enabled,
        pix_gateway: (settingsResult.pix_gateway || '') as PixGateway | '',
        pix_key_type: (settingsResult.pix_key_type || '') as PixKeyType | '',
        pix_key: settingsResult.pix_key || '',
        pix_beneficiary_name: settingsResult.pix_beneficiary_name || '',
        mp_access_token: '',
        pagseguro_token: '',
        admin_password: '',
      });
    } catch (error) {
      console.error(error);
      toast({
        title: 'Erro ao carregar configurações de pagamento',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    setReloadingLogs(true);
    try {
      const logsResult = await fetchPaymentWebhookLogs();
      setLogs(logsResult);
    } catch (error) {
      console.error(error);
      toast({
        title: 'Erro ao carregar logs de webhook',
        variant: 'destructive',
      });
    } finally {
      setReloadingLogs(false);
    }
  };

  useEffect(() => {
    void loadPageData();
  }, [companyId]);

  const handleSavePix = async () => {
    const changingMpToken = form.mp_access_token.trim().length > 0;
    const changingPagToken = form.pagseguro_token.trim().length > 0;
    const changingAnyToken = changingMpToken || changingPagToken;

    if (form.pix_enabled && !form.pix_gateway) {
      toast({
        title: 'Selecione o gateway PIX',
        variant: 'destructive',
      });
      return;
    }

    if (requiresManualPixFields) {
      if (!form.pix_key_type || !form.pix_key.trim() || !form.pix_beneficiary_name.trim()) {
        toast({
          title: 'Preencha a configuração manual do PIX',
          description: 'Tipo da chave, chave e favorecido são obrigatórios.',
          variant: 'destructive',
        });
        return;
      }
    }

    if (changingAnyToken && !form.admin_password.trim()) {
      toast({
        title: 'Senha obrigatória',
        description: 'Informe sua senha para atualizar tokens financeiros.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const payload: Parameters<typeof updateCompanyPaymentSettings>[0] = {
        pix_enabled: form.pix_enabled,
        pix_gateway: (form.pix_gateway || null) as PixGateway | null,
        pix_key_type: (form.pix_key_type || null) as PixKeyType | null,
        pix_key: form.pix_key.trim() || null,
        pix_beneficiary_name: form.pix_beneficiary_name.trim() || null,
      };

      if (changingMpToken) {
        payload.mp_access_token = form.mp_access_token.trim();
      }

      if (changingPagToken) {
        payload.pagseguro_token = form.pagseguro_token.trim();
      }

      if (changingAnyToken) {
        payload.admin_password = form.admin_password;
      }

      const updated = await updateCompanyPaymentSettings(payload);
      setSettings(updated);
      setForm((prev) => ({
        ...prev,
        mp_access_token: '',
        pagseguro_token: '',
        admin_password: '',
      }));

      toast({
        title: 'Configuração PIX salva',
      });

      await loadLogs();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar configuração';
      toast({
        title: 'Falha ao salvar',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePaymentMethodChange = <K extends keyof CompanyPaymentMethodConfig>(
    type: CompanyPaymentMethodConfig['type'],
    key: K,
    value: CompanyPaymentMethodConfig[K],
  ) => {
    setPaymentMethods((prev) =>
      prev.map((method) =>
        method.type === type ? { ...method, [key]: value } : method,
      ),
    );
  };

  const handleSavePaymentMethods = async () => {
    if (!companyId) {
      toast({
        title: 'Empresa não identificada',
        description: 'Faça login novamente para salvar as formas de pagamento.',
        variant: 'destructive',
      });
      return;
    }

    if (activeMethodsCount === 0) {
      toast({
        title: 'Ative ao menos uma forma de pagamento',
        variant: 'destructive',
      });
      return;
    }

    const hasInvalidName = paymentMethods.some((method) => !method.name.trim());
    if (hasInvalidName) {
      toast({
        title: 'Preencha o nome de todas as formas de pagamento',
        variant: 'destructive',
      });
      return;
    }

    setSavingMethods(true);
    try {
      const updatedMethods = await saveCompanyPaymentMethods(companyId, paymentMethods);
      setPaymentMethods(updatedMethods);
      toast({
        title: 'Formas de pagamento salvas',
        description:
          activeCheckoutMethodsCount > 0
            ? 'PDV, pedidos e catálogo já passam a usar as opções ativas.'
            : 'PDV e pedidos seguem com as opções ativas. O catálogo ficará sem métodos compatíveis até ativar ao menos uma opção pública.',
      });
    } catch (error) {
      console.error(error);
      toast({
        title: 'Erro ao salvar formas de pagamento',
        description: error instanceof Error ? error.message : 'Não foi possível salvar agora.',
        variant: 'destructive',
      });
    } finally {
      setSavingMethods(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="flex min-h-[260px] items-center justify-center text-sm text-muted-foreground">
          Carregando configurações de pagamento...
        </div>
      </div>
    );
  }

  return (
    <div className="page-container space-y-6">
      <div className="space-y-1">
        <h1 className="page-title">Pagamentos</h1>
        <p className="page-subtitle">
          Configure PIX, taxas e quais formas ficam disponíveis na loja, no PDV e no catálogo.
        </p>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList className="h-auto w-full justify-start gap-2 p-1 sm:w-auto">
          <TabsTrigger value="methods" type="button">Formas da Loja</TabsTrigger>
          <TabsTrigger value="pix" type="button">PIX e Gateways</TabsTrigger>
          <TabsTrigger value="logs" type="button">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="methods" className="space-y-6">
          <Card className="company-card">
            <CardHeader>
              <CardTitle>Formas de Pagamento por Loja</CardTitle>
              <CardDescription>
                Essas opções alimentam automaticamente o PDV, os pedidos internos e o checkout do catálogo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Ativas</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{activeMethodsCount}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Compatíveis com catálogo</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{activeCheckoutMethodsCount}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                  O catálogo continua respeitando também o filtro de métodos aceitos em
                  {' '}
                  <span className="font-medium text-foreground">Catálogo → Personalização</span>.
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {paymentMethods.map((method) => (
                  <div
                    key={method.type}
                    className="rounded-2xl border border-border bg-card p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                          {paymentMethodTypeLabels[method.type]}
                        </p>
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">
                            Tipo salvo: {method.type}
                          </span>
                          {checkoutCompatibleTypes.has(method.type as CheckoutPaymentMethodType) && (
                            <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
                              Disponível no catálogo
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-full border border-border px-3 py-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {method.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                        <Switch
                          checked={method.is_active}
                          onCheckedChange={(checked) =>
                            handlePaymentMethodChange(method.type, 'is_active', checked)
                          }
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_140px]">
                      <div className="space-y-2">
                        <Label htmlFor={`payment-name-${method.type}`}>Nome exibido</Label>
                        <Input
                          id={`payment-name-${method.type}`}
                          value={method.name}
                          onChange={(event) =>
                            handlePaymentMethodChange(method.type, 'name', event.target.value)
                          }
                          placeholder={paymentMethodTypeLabels[method.type]}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`payment-fee-${method.type}`}>Taxa (%)</Label>
                        <Input
                          id={`payment-fee-${method.type}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={method.fee_percentage}
                          onChange={(event) =>
                            handlePaymentMethodChange(
                              method.type,
                              'fee_percentage',
                              parseFloat(event.target.value) || 0,
                            )
                          }
                        />
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <Label htmlFor={`payment-description-${method.type}`}>Descrição</Label>
                      <Textarea
                        id={`payment-description-${method.type}`}
                        value={method.description || ''}
                        onChange={(event) =>
                          handlePaymentMethodChange(method.type, 'description', event.target.value)
                        }
                        rows={2}
                        placeholder="Observação interna ou instrução para a equipe."
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSavePaymentMethods} disabled={savingMethods} className="gap-2">
                  <Save className="h-4 w-4" />
                  {savingMethods ? 'Salvando...' : 'Salvar formas de pagamento'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pix" className="space-y-6">
          <Card className="company-card">
            <CardHeader>
              <CardTitle>Configurações de Pagamento - PIX</CardTitle>
              <CardDescription>
                Tokens financeiros ficam protegidos no backend e nunca são exibidos completos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Ativar PIX no pagamento</p>
                  <p className="text-xs text-muted-foreground">
                    O cliente só verá o botão PIX quando a configuração estiver completa.
                  </p>
                </div>
                <Switch
                  checked={form.pix_enabled}
                  onCheckedChange={(value) => setForm((prev) => ({ ...prev, pix_enabled: value }))}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Gateway PIX</Label>
                  <Select
                    value={form.pix_gateway}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, pix_gateway: value as PixGateway | '' }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o gateway" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MercadoPago">MercadoPago</SelectItem>
                      <SelectItem value="PagSeguro">PagSeguro</SelectItem>
                      <SelectItem value="PixManual">PixManual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Última atualização</Label>
                  <Input value={formatDate(settings?.updated_at || null)} readOnly />
                </div>
              </div>

              {form.pix_gateway === 'PixManual' && (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Tipo da chave</Label>
                    <Select
                      value={form.pix_key_type}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, pix_key_type: value as PixKeyType | '' }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CPF">CPF</SelectItem>
                        <SelectItem value="CNPJ">CNPJ</SelectItem>
                        <SelectItem value="Email">Email</SelectItem>
                        <SelectItem value="Telefone">Telefone</SelectItem>
                        <SelectItem value="ChaveAleatoria">Chave Aleatória</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>Chave PIX</Label>
                    <Input
                      value={form.pix_key}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, pix_key: event.target.value }))
                      }
                      placeholder="Sua chave PIX"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-3">
                    <Label>Nome do favorecido</Label>
                    <Input
                      value={form.pix_beneficiary_name}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, pix_beneficiary_name: event.target.value }))
                      }
                      placeholder="Nome completo / razão social"
                    />
                  </div>
                </div>
              )}

              {form.pix_gateway === 'MercadoPago' && (
                <div className="space-y-2">
                  <Label>Access Token MercadoPago</Label>
                  <Input
                    value={form.mp_access_token}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, mp_access_token: event.target.value }))
                    }
                    placeholder={
                      settings?.mp_access_token_set
                        ? `Token atual: ${settings.mp_access_token_masked}`
                        : 'Cole o access token'
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Token atual: {settings?.mp_access_token_masked || 'não configurado'}.
                  </p>
                </div>
              )}

              {form.pix_gateway === 'PagSeguro' && (
                <div className="space-y-2">
                  <Label>Token PagSeguro</Label>
                  <Input
                    value={form.pagseguro_token}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, pagseguro_token: event.target.value }))
                    }
                    placeholder={
                      settings?.pagseguro_token_set
                        ? `Token atual: ${settings.pagseguro_token_masked}`
                        : 'Cole o token'
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Token atual: {settings?.pagseguro_token_masked || 'não configurado'}.
                  </p>
                </div>
              )}

              {(form.pix_gateway === 'MercadoPago' || form.pix_gateway === 'PagSeguro') && (
                <div className="space-y-2">
                  <Label>Senha do admin (obrigatória para atualizar token)</Label>
                  <Input
                    type="password"
                    value={form.admin_password}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, admin_password: event.target.value }))
                    }
                    placeholder="Digite sua senha"
                  />
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    A senha só é usada para validar a alteração do token.
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={handleSavePix} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? 'Salvando...' : 'Salvar configurações PIX'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-6">
          <Card className="company-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Logs de Webhook de Pagamento</CardTitle>
                <CardDescription>
                  Eventos recebidos de MercadoPago e PagSeguro para sua loja.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadLogs()}
                disabled={reloadingLogs}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${reloadingLogs ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recebido em</TableHead>
                    <TableHead>Gateway</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assinatura</TableHead>
                    <TableHead>Erro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Nenhum webhook registrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{formatDate(log.received_at)}</TableCell>
                        <TableCell>{getGatewayLabel(log.gateway)}</TableCell>
                        <TableCell>{getEventLabel(log.event_type)}</TableCell>
                        <TableCell>{getStatusLabel(log.status)}</TableCell>
                        <TableCell>
                          {log.signature_valid === null ? '-' : log.signature_valid ? 'Válida' : 'Inválida'}
                        </TableCell>
                        <TableCell className="max-w-[320px] truncate text-xs">
                          {log.error_message || '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
