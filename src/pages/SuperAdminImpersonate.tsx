import { useState } from 'react';
import { Loader2, Shield, UserCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/services/edgeFunctions';
import { useAuth } from '@/contexts/AuthContext';

type ImpersonateResponse = {
  email: string;
  token: string;
  user_id: string;
  action_link?: string | null;
  token_hash?: string | null;
  verification_type?: string | null;
};

type ParsedActionLink = {
  tokenHash: string;
  verificationType: string;
  hasCode: boolean;
};

const parseActionLink = (value?: string | null): ParsedActionLink => {
  if (!value) return { tokenHash: '', verificationType: '', hasCode: false };
  try {
    const parsed = new URL(value);
    return {
      tokenHash: parsed.searchParams.get('token_hash') || '',
      verificationType: parsed.searchParams.get('type') || '',
      hasCode: parsed.searchParams.has('code'),
    };
  } catch {
    return { tokenHash: '', verificationType: '', hasCode: false };
  }
};

export default function SuperAdminImpersonate() {
  const navigate = useNavigate();
  const { startImpersonation, clearImpersonation, isImpersonating } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const verifyAsClient = async (response: ImpersonateResponse) => {
    const parsedLink = parseActionLink(response.action_link);
    const verificationType = (response.verification_type || parsedLink.verificationType || 'magiclink').toLowerCase();
    const tokenHash = response.token_hash || parsedLink.tokenHash || '';
    const attempts: Array<() => Promise<{ session: unknown; error: Error | null }>> = [];

    const pushVerifyOtpAttempt = (payload: Record<string, unknown>) => {
      attempts.push(async () => {
        const { data, error } = await supabase.auth.verifyOtp(payload as any);
        return { session: data?.session ?? null, error: error ?? null };
      });
    };

    if (response.email && response.token) {
      pushVerifyOtpAttempt({
        type: verificationType,
        email: response.email,
        token: response.token,
      });
      if (verificationType !== 'email') {
        pushVerifyOtpAttempt({
          type: 'email',
          email: response.email,
          token: response.token,
        });
      }
    }

    if (tokenHash) {
      pushVerifyOtpAttempt({
        type: verificationType,
        token_hash: tokenHash,
      });
      if (verificationType !== 'email') {
        pushVerifyOtpAttempt({
          type: 'email',
          token_hash: tokenHash,
        });
      }
    }

    if (response.action_link && parsedLink.hasCode) {
      attempts.push(async () => {
        const { data, error } = await supabase.auth.exchangeCodeForSession(response.action_link as string);
        return { session: data?.session ?? null, error: error ?? null };
      });
    }

    let lastError: Error | null = null;
    for (const attempt of attempts) {
      const { session, error } = await attempt();
      if (!error && session) {
        return true;
      }
      lastError = error;
    }

    if (response.action_link) {
      window.location.assign(response.action_link);
      return false;
    }

    throw lastError || new Error('Falha ao autenticar como cliente.');
  };

  const handleImpersonate = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      toast.error('Informe o email do cliente.');
      return;
    }

    if (isImpersonating) {
      toast.error('Finalize a sessao atual antes de entrar em outra conta.');
      return;
    }

    setLoading(true);
    try {
      const response = await invokeEdgeFunction<ImpersonateResponse>('admin-impersonate', {
        email: trimmedEmail,
        redirect_to: `${window.location.origin}/dashboard`,
      });

      await startImpersonation();
      const switched = await verifyAsClient(response);
      if (!switched) return;

      setEmail('');
      toast.success('Acesso concedido. Voce esta na conta do cliente.');
      navigate('/dashboard', { replace: true });
    } catch (error: any) {
      clearImpersonation();
      toast.error(error?.message || 'Erro ao acessar a conta do cliente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center gap-3 text-slate-600">
        <Shield className="h-5 w-5" />
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Entrar como cliente</h1>
          <p className="text-sm text-slate-500">
            Acesse uma conta cliente usando apenas o email cadastrado.
          </p>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Impersonacao administrativa</CardTitle>
          <CardDescription>
            Use este acesso apenas para suporte. Ao sair, voce retorna para sua conta admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client-email">Email do cliente</Label>
            <Input
              id="client-email"
              type="email"
              placeholder="cliente@exemplo.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleImpersonate} disabled={loading || !email.trim()}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
              Entrar na conta
            </Button>
            <p className="text-xs text-slate-500">
              A sessao do admin fica salva e pode ser restaurada no banner superior.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
