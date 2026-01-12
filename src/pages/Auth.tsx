import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CpfCnpjInput, normalizeDigits, validateCpf } from '@/components/ui/masked-input';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
});

const signupSchema = z.object({
  fullName: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  cpf: z.string().min(1, 'CPF obrigatório'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não conferem',
  path: ['confirmPassword'],
});


export default function Auth() {
  const navigate = useNavigate();
  const { user, profile, needsOnboarding, subscription, signIn, signUp, loading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupCpf, setSignupCpf] = useState('');
  const [signupCompanyName, setSignupCompanyName] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);

  const mustChangePassword = Boolean(profile?.must_change_password || profile?.force_password_change);
  const mustCompleteCompany = Boolean(profile?.must_complete_company || profile?.must_complete_onboarding);

  useEffect(() => {
    if (user && !authLoading) {
      if (needsOnboarding || mustCompleteCompany) {
        navigate('/onboarding');
      } else if (mustChangePassword) {
        navigate('/alterar-senha');
      } else if (subscription && !subscription.hasAccess) {
        navigate('/assinatura');
      } else {
        navigate('/dashboard');
      }
    }
  }, [user, authLoading, needsOnboarding, mustCompleteCompany, mustChangePassword, subscription, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = loginSchema.safeParse({ email: loginEmail, password: loginPassword });
      if (!result.success) {
        setError(result.error.errors[0].message);
        setIsLoading(false);
        return;
      }

      const { error } = await signIn(loginEmail, loginPassword);
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setError('E-mail ou senha incorretos');
        } else {
          setError(error.message);
        }
      }
    } catch {
      setError('Erro ao fazer login. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setIsLoading(true);

    try {
      const email = signupEmail.trim();
      const cpfDigits = normalizeDigits(signupCpf);
      const result = signupSchema.safeParse({
        fullName: signupName,
        email,
        cpf: cpfDigits,
        password: signupPassword,
        confirmPassword: signupConfirmPassword,
      });

      if (!result.success) {
        setError(result.error.errors[0].message);
        setIsLoading(false);
        return;
      }

      if (!validateCpf(cpfDigits)) {
        setError('CPF inválido');
        setIsLoading(false);
        return;
      }

      const { error } = await signUp({
        email,
        password: signupPassword,
        fullName: signupName,
        cpf: cpfDigits,
        companyName: signupCompanyName.trim() || undefined,
      });
      if (error) {
        const message = error.message.toLowerCase();
        if (message.includes('email') && message.includes('conta')) {
          setError('Este e-mail já está cadastrado');
        } else if (message.includes('cpf')) {
          setError('Este CPF já está cadastrado');
        } else {
          setError(error.message);
        }
      } else {
        setNotice('Conta criada! Acesse com seu e-mail e senha para continuar o cadastro da empresa.');
        setLoginEmail(email);
        setLoginPassword(signupPassword);
        setActiveTab('login');
        setSignupName('');
        setSignupEmail('');
        setSignupCpf('');
        setSignupCompanyName('');
        setSignupPassword('');
        setSignupConfirmPassword('');
      }
    } catch {
      setError('Erro ao criar conta. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sidebar via-sidebar/95 to-sidebar/90 p-4">
      <Card className="w-full max-w-md shadow-xl border-0 bg-background/95 backdrop-blur-sm">
        <CardHeader className="text-center space-y-4 pb-6">
          <div className="flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Package className="h-7 w-7" />
            </div>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold tracking-tight">GráficaERP</CardTitle>
            <CardDescription className="text-base">Sistema de Gestão para Gráfica</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'login' | 'signup')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar Conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-4">
              <form onSubmit={handleLogin} className="space-y-5">
                {notice && (
                  <Alert className="border-success bg-success/10 text-success">
                    <AlertDescription>{notice}</AlertDescription>
                  </Alert>
                )}

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2.5">
                  <Label htmlFor="login-email" className="text-sm font-medium">E-mail</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="h-11 transition-all focus-visible:ring-2 focus-visible:ring-primary/20"
                    required
                  />
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="login-password" className="text-sm font-medium">Senha</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showLoginPassword ? "text" : "password"}
                      placeholder="********"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pr-10 h-11 transition-all focus-visible:ring-2 focus-visible:ring-primary/20"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm p-1"
                      tabIndex={-1}
                      aria-label={showLoginPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showLoginPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 text-base font-medium shadow-sm hover:shadow-md transition-shadow"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Entrar
                </Button>
                <div className="text-center text-sm text-slate-500">
                  <Link to="/recuperar-senha" className="underline underline-offset-4">
                    Esqueci minha senha
                  </Link>
                </div>
                <p className="text-center text-xs text-slate-500">
                  Experimente 3 dias gratis. Depois, escolha um plano.
                </p>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-4">
              <form onSubmit={handleSignup} className="space-y-5">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2.5">
                  <Label htmlFor="signup-name" className="text-sm font-medium">Nome Completo</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Seu nome"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    className="h-11 transition-all focus-visible:ring-2 focus-visible:ring-primary/20"
                    required
                  />
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="signup-email" className="text-sm font-medium">E-mail</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    className="h-11 transition-all focus-visible:ring-2 focus-visible:ring-primary/20"
                    required
                  />
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="signup-cpf" className="text-sm font-medium">CPF</Label>
                  <CpfCnpjInput
                    id="signup-cpf"
                    placeholder="000.000.000-00"
                    value={signupCpf}
                    onChange={(value) => setSignupCpf(value)}
                    className="h-11 transition-all focus-visible:ring-2 focus-visible:ring-primary/20"
                    required
                  />
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="signup-company" className="text-sm font-medium">Nome da Empresa (opcional)</Label>
                  <Input
                    id="signup-company"
                    type="text"
                    placeholder="Minha Empresa"
                    value={signupCompanyName}
                    onChange={(e) => setSignupCompanyName(e.target.value)}
                    className="h-11 transition-all focus-visible:ring-2 focus-visible:ring-primary/20"
                  />
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="signup-password" className="text-sm font-medium">Senha</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showSignupPassword ? "text" : "password"}
                      placeholder="********"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="pr-10 h-11 transition-all focus-visible:ring-2 focus-visible:ring-primary/20"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword(!showSignupPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm p-1"
                      tabIndex={-1}
                      aria-label={showSignupPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showSignupPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="signup-confirm" className="text-sm font-medium">Confirmar Senha</Label>
                  <div className="relative">
                    <Input
                      id="signup-confirm"
                      type={showSignupConfirmPassword ? "text" : "password"}
                      placeholder="********"
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      className="pr-10 h-11 transition-all focus-visible:ring-2 focus-visible:ring-primary/20"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupConfirmPassword(!showSignupConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm p-1"
                      tabIndex={-1}
                      aria-label={showSignupConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showSignupConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 text-base font-medium shadow-sm hover:shadow-md transition-shadow"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar Conta
                </Button>
                <p className="text-center text-xs text-slate-500">
                  Ao criar conta você ganha 3 dias de teste gratuito.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
