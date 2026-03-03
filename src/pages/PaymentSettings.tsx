import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  fetchCompanyPaymentSettings,
  fetchPaymentWebhookLogs,
  updateCompanyPaymentSettings,
  type CompanyPaymentSettings,
  type PaymentWebhookLog,
} from '@/services/payments';
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
  in_review: 'Em analise',
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
  transaction: 'transacao',
  charge: 'cobranca',
  notification: 'notificacao',
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

export default function PaymentSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reloadingLogs, setReloadingLogs] = useState(false);
  const [settings, setSettings] = useState<CompanyPaymentSettings | null>(null);
  const [logs, setLogs] = useState<PaymentWebhookLog[]>([]);
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

  const loadPageData = async () => {
    setLoading(true);
    try {
      const [settingsResult, logsResult] = await Promise.all([
        fetchCompanyPaymentSettings(),
        fetchPaymentWebhookLogs(),
      ]);

      setSettings(settingsResult);
      setLogs(logsResult);
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
        title: 'Erro ao carregar configuracoes de pagamento',
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
  }, []);

  const handleSave = async () => {
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
          title: 'Preencha a configuracao manual do PIX',
          description: 'Tipo da chave, chave e favorecido sao obrigatorios.',
          variant: 'destructive',
        });
        return;
      }
    }

    if (changingAnyToken && !form.admin_password.trim()) {
      toast({
        title: 'Senha obrigatoria',
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
        title: 'Configuracao PIX salva',
      });

      await loadLogs();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar configuracao';
      toast({
        title: 'Falha ao salvar',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="flex min-h-[260px] items-center justify-center text-sm text-muted-foreground">
          Carregando configuracoes de pagamento...
        </div>
      </div>
    );
  }

  return (
    <div className="page-container space-y-6">
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Configuracoes de Pagamento - PIX</CardTitle>
          <CardDescription>
            Tokens financeiros ficam protegidos no backend e nunca sao exibidos completos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Ativar PIX no pagamento</p>
              <p className="text-xs text-slate-500">
                O cliente so vera o botao PIX quando a configuracao estiver completa.
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
              <Label>Ultima atualizacao</Label>
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
                    <SelectItem value="ChaveAleatoria">Chave Aleatoria</SelectItem>
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
                  placeholder="Nome completo / razao social"
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
                placeholder={settings?.mp_access_token_set
                  ? `Token atual: ${settings.mp_access_token_masked}`
                  : 'Cole o access token'}
              />
              <p className="text-xs text-slate-500">
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
                placeholder={settings?.pagseguro_token_set
                  ? `Token atual: ${settings.pagseguro_token_masked}`
                  : 'Cole o token'}
              />
              <p className="text-xs text-slate-500">
                Token atual: {settings?.pagseguro_token_masked || 'não configurado'}.
              </p>
            </div>
          )}

          {(form.pix_gateway === 'MercadoPago' || form.pix_gateway === 'PagSeguro') && (
            <div className="space-y-2">
              <Label>Senha do admin (obrigatoria para atualizar token)</Label>
              <Input
                type="password"
                value={form.admin_password}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, admin_password: event.target.value }))
                }
                placeholder="Digite sua senha"
              />
              <p className="flex items-center gap-1 text-xs text-slate-500">
                <ShieldAlert className="h-3.5 w-3.5" />
                A senha so e usada para validar a alteracao do token.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar configuracoes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
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
                  <TableCell colSpan={6} className="text-center text-slate-500">
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
                    <TableCell>{log.signature_valid === null ? '-' : log.signature_valid ? 'Valida' : 'Invalida'}</TableCell>
                    <TableCell className="max-w-[320px] truncate text-xs">{log.error_message || '-'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
