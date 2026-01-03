import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AppRole, Company, Profile } from '@/types/database';
import { computeSubscriptionState, type SubscriptionState } from '@/services/subscription';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  company: Company | null;
  subscription: SubscriptionState | null;
  role: AppRole | null;
  loading: boolean;
  needsOnboarding: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasPermission: (allowedRoles: AppRole[]) => boolean;
  refreshUserData: () => Promise<void>;
  refreshCompany: () => Promise<void>;
  getLoggedCompany: () => Company | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

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
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setCompany(null);
        setSubscription(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadCompany = useCallback(async (companyId?: string | null) => {
    if (!companyId) {
      setCompany(null);
      setSubscription(null);
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

      // Check if user needs onboarding (no company associated and not super_admin)
      // Strict check: Must have company_id OR be super_admin.
      if (!profileData?.company_id && userRole !== 'super_admin') {
        console.log('User needs onboarding: No company_id and not super_admin');
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

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: fullName }
      }
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const hasPermission = (allowedRoles: AppRole[]) => {
    if (!role) return false;
    return allowedRoles.includes(role);
  };

  const getLoggedCompany = () => company;

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      role,
      loading,
      needsOnboarding,
      signIn,
      signUp,
      signOut,
      hasPermission,
      refreshUserData,
      company,
      subscription,
      refreshCompany,
      getLoggedCompany
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
