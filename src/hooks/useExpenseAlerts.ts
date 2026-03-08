import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { buildExpenseAlertSummary, type ExpenseAlertSummary } from '@/lib/finance';
import type { Expense } from '@/types/database';

export const useExpenseAlerts = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseAlertSummary>({
    total: 0,
    dueSoon: 0,
    overdue: 0,
    items: [],
  });
  const [loading, setLoading] = useState(false);

  const refreshExpenseAlerts = useCallback(async () => {
    if (!profile?.company_id) {
      setExpenses([]);
      setSummary({ total: 0, dueSoon: 0, overdue: 0, items: [] });
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Erro ao carregar alertas financeiros',
        description: error.message,
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    const rows = (data || []) as Expense[];
    setExpenses(rows);
    setSummary(buildExpenseAlertSummary(rows));
    setLoading(false);
  }, [profile?.company_id, toast]);

  useEffect(() => {
    void refreshExpenseAlerts();
  }, [refreshExpenseAlerts]);

  useEffect(() => {
    if (!profile?.company_id) {
      setExpenses([]);
      setSummary({ total: 0, dueSoon: 0, overdue: 0, items: [] });
      return;
    }

    const channel = supabase
      .channel(`expense-alerts-${profile.company_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expenses',
          filter: `company_id=eq.${profile.company_id}`,
        },
        () => {
          void refreshExpenseAlerts();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void refreshExpenseAlerts();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.company_id, refreshExpenseAlerts]);

  return {
    expenses,
    summary,
    loading,
    refreshExpenseAlerts,
  };
};
