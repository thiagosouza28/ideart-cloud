import { useCallback, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { customerSupabase } from '@/integrations/supabase/customer-client';

const isCustomerAccount = (candidate?: User | null) =>
  String(candidate?.user_metadata?.account_type || '').toLowerCase() === 'customer';

export function useCustomerAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const { data: authListener } = customerSupabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      if (nextSession?.user && !isCustomerAccount(nextSession.user)) {
        setSession(null);
        setUser(null);
        setLoading(false);
        void customerSupabase.auth.signOut({ scope: 'local' });
        return;
      }
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    customerSupabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const nextSession = data.session ?? null;
      if (nextSession?.user && !isCustomerAccount(nextSession.user)) {
        setSession(null);
        setUser(null);
        setLoading(false);
        void customerSupabase.auth.signOut({ scope: 'local' });
        return;
      }
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await customerSupabase.auth.signInWithPassword({ email, password });
    if (error) return { error };

    if (data.user && !isCustomerAccount(data.user)) {
      await customerSupabase.auth.signOut({ scope: 'local' });
      return {
        error: new Error('Este login e exclusivo para clientes. Para equipe da loja, use /auth.'),
      };
    }

    setSession(data.session ?? null);
    setUser(data.user ?? null);
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    await customerSupabase.auth.signOut({ scope: 'local' });
    setSession(null);
    setUser(null);
  }, []);

  return {
    session,
    user,
    loading,
    signIn,
    signOut,
  };
}
