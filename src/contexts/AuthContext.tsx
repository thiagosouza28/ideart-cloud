import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (payload: {
    email: string;
    password: string;
    fullName: string;
    cpf: string;
    companyName?: string;
  }) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasPermission: (allowedRoles: AppRole[]) => boolean;
  refreshUserData: () => Promise<void>;
  refreshCompany: () => Promise<void>;
  getLoggedCompany: () => Company | null;
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
        setSession(session);
        setUser(session?.user ?? null);

        if (event === 'SIGNED_OUT') {
          setProfile(null);
          setCompany(null);
          setSubscription(null);
          setRole(null);
          setNeedsOnboarding(false);
          setPasswordRecovery(false);
          setLoading(false);

          if (!wasAuthResetRecently()) {
            void resetAuthSession({ reason: 'signed_out', skipSignOut: true });
          }
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

        if (session?.user) {
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setCompany(null);
          setSubscription(null);
          setRole(null);
          setNeedsOnboarding(false);
          setPasswordRecovery(false);
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
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
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
      console.error('Error fetching company:', error);
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
        console.error('Error fetching profile:', profileResult.error);
      }

      if (roleResult.error) {
        console.error('Error fetching user role:', roleResult.error);
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
      console.error('Error fetching user data:', error);
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
    await resetAuthSession({ reason: 'user_signout', skipSignOut: true });
    setPasswordRecovery(false);
  };

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
      signIn,
      signUp,
      signOut,
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
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
