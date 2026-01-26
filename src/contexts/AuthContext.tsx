import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AppRole, Company, Profile } from '@/types/database';
import { computeSubscriptionState, type SubscriptionState } from '@/services/subscription';
import { invokePublicFunction } from '@/services/publicFunctions';
import { isInvalidRefreshTokenError, resetAuthSession, wasAuthResetRecently } from '@/lib/auth';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  company: Company | null;
  subscription: SubscriptionState | null;
  role: AppRole | null;
  loading: boolean;
  needsOnboarding: boolean;
  passwordRecovery: boolean;
  isImpersonating: boolean;
  impersonationAdmin: { id: string; email: string | null } | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (payload: {
    email: string;
    password: string;
    fullName: string;
    cpf: string;
    companyName?: string;
  }) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  startImpersonation: () => Promise<void>;
  stopImpersonation: () => Promise<boolean>;
  clearImpersonation: () => void;
  hasPermission: (allowedRoles: AppRole[]) => boolean;
  refreshUserData: () => Promise<void>;
  refreshCompany: () => Promise<void>;
  getLoggedCompany: () => Company | null;
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type StoredAdminSession = {
  access_token: string;
  refresh_token: string;
};

type ImpersonationAdmin = {
  id: string;
  email: string | null;
};

const IMPERSONATION_SESSION_KEY = 'admin_impersonation_origin_session';
const IMPERSONATION_FLAG_KEY = 'admin_impersonation_active';
const IMPERSONATION_ADMIN_KEY = 'admin_impersonation_admin';

const loadImpersonationAdmin = () => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(IMPERSONATION_ADMIN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImpersonationAdmin;
  } catch {
    return null;
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(IMPERSONATION_FLAG_KEY) === 'true';
  });
  const [impersonationAdmin, setImpersonationAdmin] = useState<ImpersonationAdmin | null>(
    () => loadImpersonationAdmin()
  );
  const userIdRef = useRef<string | null>(null);
  const profileIdRef = useRef<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user]);

  useEffect(() => {
    profileIdRef.current = profile?.id ?? null;
  }, [profile]);

  useEffect(() => {
    sessionTokenRef.current = session?.access_token ?? null;
  }, [session]);

  const clearImpersonationState = useCallback(() => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(IMPERSONATION_SESSION_KEY);
    localStorage.removeItem(IMPERSONATION_FLAG_KEY);
    localStorage.removeItem(IMPERSONATION_ADMIN_KEY);
    setIsImpersonating(false);
    setImpersonationAdmin(null);
  }, []);

  useEffect(() => {
    const url = window.location.href;
    const search = window.location.search;
    const hash = window.location.hash;
    const isRecovery =
      search.includes("type=recovery") ||
      hash.includes("type=recovery") ||
      hash.includes("access_token=");

    if (isRecovery) {
      supabase.auth.exchangeCodeForSession(url).catch((error) => {
        console.error('Failed to exchange recovery code', error);
      }).finally(() => {
        setPasswordRecovery(true);
        if (window.location.pathname !== '/alterar-senha') {
          navigate({ pathname: '/alterar-senha', search, hash }, { replace: true });
        }
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setProfile(null);
          setCompany(null);
          setSubscription(null);
          setRole(null);
          setNeedsOnboarding(false);
          setPasswordRecovery(false);
          setLoading(false);
          clearImpersonationState();

          if (!wasAuthResetRecently()) {
            void resetAuthSession({ reason: 'signed_out', skipSignOut: true });
          }
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          // Avoid UI resets on tab focus/token refresh.
          return;
        }

        if (event === 'PASSWORD_RECOVERY') {
          setPasswordRecovery(true);
          if (window.location.pathname !== '/alterar-senha') {
            const currentSearch = window.location.search;
            const currentHash = window.location.hash;
            navigate({ pathname: '/alterar-senha', search: currentSearch, hash: currentHash }, { replace: true });
          }
        }

        const nextUserId = session?.user?.id ?? null;
        const tokenChanged = (session?.access_token ?? null) !== sessionTokenRef.current;
        const userChanged = nextUserId !== userIdRef.current;
        const shouldUpdateUser = userChanged || event === 'USER_UPDATED';
        const shouldUpdateSession = shouldUpdateUser;

        if (shouldUpdateSession) {
          setSession(session ?? null);
        }
        if (shouldUpdateUser) {
          setUser(session?.user ?? null);
        }

        if (nextUserId) {
          if (profileIdRef.current !== nextUserId) {
            setTimeout(() => {
              fetchUserData(nextUserId);
            }, 0);
          }
        } else {
          setSession(null);
          setUser(null);
          setProfile(null);
          setCompany(null);
          setSubscription(null);
          setRole(null);
          setNeedsOnboarding(false);
          setPasswordRecovery(false);
          clearImpersonationState();
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('[auth] getSession failed', error);
        if (isInvalidRefreshTokenError(error)) {
          void resetAuthSession({ reason: 'invalid_refresh_token' });
        }
        setSession(null);
        setUser(null);
        setProfile(null);
        setCompany(null);
        setSubscription(null);
        setRole(null);
        setNeedsOnboarding(false);
        setPasswordRecovery(false);
        clearImpersonationState();
        setLoading(false);
        return;
      }

      const session = data.session ?? null;
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setCompany(null);
        setSubscription(null);
        setPasswordRecovery(false);
        clearImpersonationState();
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const refreshIfNeeded = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.expires_at) return;
      const expiresAtMs = session.expires_at * 1000;
      if (Date.now() > expiresAtMs - 60_000) {
        try {
          await supabase.auth.refreshSession();
        } catch (error) {
          console.warn('[auth] silent refresh failed', error);
        }
      }
    };

    refreshIfNeeded();
    const interval = window.setInterval(refreshIfNeeded, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  const loadCompany = useCallback(async (companyId?: string | null) => {
    if (!companyId) {
      setCompany(null);
      setSubscription(computeSubscriptionState(null));
      return;
    }

    const { data, error } = await supabase
      .from('companies')
      .select('*, plan:plans(*)')
      .eq('id', companyId)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar empresa:', error);
      setCompany(null);
      setSubscription(null);
      return;
    }

    const companyData = data as Company | null;
    setCompany(companyData);
    setSubscription(computeSubscriptionState(companyData));
  }, []);

  const fetchUserData = async (userId: string) => {
    setLoading(true);
    try {
      const [profileResult, roleResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle()
      ]);

      if (profileResult.error) {
        console.error('Erro ao buscar perfil:', profileResult.error);
      }

      if (roleResult.error) {
        console.error('Erro ao buscar cargo do usuário:', roleResult.error);
      }

      let profileData = profileResult.data as Profile | null;
      const userRole = roleResult.data?.role as AppRole | undefined;

      // Fallback: If profile has no company_id, check company_users table
      // This happens if the profile trigger didn't fire or if the user was just created via Edge Function
      if (profileData && !profileData.company_id) {
        const { data: companyUserLink } = await supabase
          .from('company_users')
          .select('company_id')
          .eq('user_id', userId)
          .maybeSingle();

        if (companyUserLink?.company_id) {
          console.log('Found company link via company_users table:', companyUserLink.company_id);
          // Update local profile state temporarily (or persist it if we wanted to be aggressive)
          profileData = { ...profileData, company_id: companyUserLink.company_id };

          // Optionally attempt to fix the profile in background
          supabase.from('profiles').update({ company_id: companyUserLink.company_id }).eq('id', userId).then();
        }
      }

      setProfile(profileData);
      setRole(userRole ?? null);

      const requiresOnboarding =
        Boolean(profileData?.must_complete_onboarding) || Boolean(profileData?.must_complete_company);
      const missingCompany = !profileData?.company_id && userRole !== 'super_admin';
      if (requiresOnboarding || missingCompany) {
        console.log('User needs onboarding', { requiresOnboarding, missingCompany });
        setNeedsOnboarding(true);
      } else {
        setNeedsOnboarding(false);
      }

      await loadCompany(profileData?.company_id);
    } catch (error) {
      console.error('Erro ao buscar dados do usuário:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshCompany = useCallback(async () => {
    await loadCompany(profile?.company_id);
  }, [loadCompany, profile?.company_id]);

  const refreshUserData = useCallback(async () => {
    if (!user) return;
    await fetchUserData(user.id);
  }, [user]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (payload: {
    email: string;
    password: string;
    fullName: string;
    cpf: string;
    companyName?: string;
  }) => {
    try {
      await invokePublicFunction("trial-signup", {
        email: payload.email,
        password: payload.password,
        full_name: payload.fullName,
        cpf: payload.cpf,
        company_name: payload.companyName ?? null,
      });
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error("Erro ao criar conta.") };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn('[auth] signOut failed', error);
    }
    clearImpersonationState();
    await resetAuthSession({ reason: 'user_signout', skipSignOut: true });
    setPasswordRecovery(false);
  };

  const startImpersonation = useCallback(async () => {
    if (isImpersonating) {
      throw new Error('Impersonation already active.');
    }
    const { data, error } = await supabase.auth.getSession();
    const activeSession = data.session ?? null;
    if (error || !activeSession?.access_token || !activeSession?.refresh_token || !activeSession.user?.id) {
      throw new Error('Admin session not available.');
    }

    const storedSession: StoredAdminSession = {
      access_token: activeSession.access_token,
      refresh_token: activeSession.refresh_token,
    };
    const adminInfo: ImpersonationAdmin = {
      id: activeSession.user.id,
      email: activeSession.user.email ?? null,
    };

    localStorage.setItem(IMPERSONATION_SESSION_KEY, JSON.stringify(storedSession));
    localStorage.setItem(IMPERSONATION_ADMIN_KEY, JSON.stringify(adminInfo));
    localStorage.setItem(IMPERSONATION_FLAG_KEY, 'true');
    setIsImpersonating(true);
    setImpersonationAdmin(adminInfo);
  }, [isImpersonating]);

  const stopImpersonation = useCallback(async () => {
    if (typeof window === 'undefined') return false;
    const raw = localStorage.getItem(IMPERSONATION_SESSION_KEY);
    if (!raw) {
      clearImpersonationState();
      return false;
    }

    let stored: StoredAdminSession | null = null;
    try {
      stored = JSON.parse(raw) as StoredAdminSession;
    } catch {
      clearImpersonationState();
      return false;
    }

    const accessToken = stored?.access_token;
    const refreshToken = stored?.refresh_token;
    if (!accessToken || !refreshToken) {
      clearImpersonationState();
      return false;
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    clearImpersonationState();

    if (error || !data.session) {
      await resetAuthSession({ reason: 'impersonation_restore_failed' });
      return false;
    }

    return true;
  }, [clearImpersonationState]);

  const clearImpersonation = useCallback(() => {
    clearImpersonationState();
  }, [clearImpersonationState]);

  const hasPermission = (allowedRoles: AppRole[]) => {
    if (!role) return false;
    return allowedRoles.includes(role);
  };

  const getLoggedCompany = () => company;
  const clearPasswordRecovery = () => setPasswordRecovery(false);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      role,
      loading,
      needsOnboarding,
      passwordRecovery,
      isImpersonating,
      impersonationAdmin,
      signIn,
      signUp,
      signOut,
      startImpersonation,
      stopImpersonation,
      clearImpersonation,
      hasPermission,
      refreshUserData,
      company,
      subscription,
      refreshCompany,
      getLoggedCompany,
      clearPasswordRecovery
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}
