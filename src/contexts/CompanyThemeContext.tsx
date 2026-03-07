import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { CompanyTheme, CompanyThemeMode } from '@/types/database';
import {
  applyCompanyThemeToDocument,
  clearCompanyThemeFromDocument,
  defaultCompanyTheme,
  normalizeCompanyTheme,
} from '@/lib/companyTheme';

type CompanyThemeContextValue = {
  companyTheme: CompanyTheme | null;
  loadingCompanyTheme: boolean;
  savingCompanyThemeMode: boolean;
  resolvedCompanyThemeMode: 'light' | 'dark';
  refreshCompanyTheme: () => Promise<CompanyTheme | null>;
  setCompanyThemeLocally: (theme: CompanyTheme) => void;
  setCompanyThemeMode: (
    themeMode: CompanyThemeMode,
    options?: { persist?: boolean },
  ) => Promise<CompanyTheme | null>;
};

const CompanyThemeContext = createContext<CompanyThemeContextValue | undefined>(undefined);

export function CompanyThemeProvider({ children }: { children: React.ReactNode }) {
  const { company } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const [companyTheme, setCompanyTheme] = useState<CompanyTheme | null>(null);
  const [loadingCompanyTheme, setLoadingCompanyTheme] = useState(false);
  const [savingCompanyThemeMode, setSavingCompanyThemeMode] = useState(false);

  const companyId = company?.id ?? null;
  const resolvedCompanyThemeMode = useMemo<'light' | 'dark'>(() => {
    if (companyTheme?.theme_mode === 'light' || companyTheme?.theme_mode === 'dark') {
      return companyTheme.theme_mode;
    }

    return resolvedTheme === 'dark' ? 'dark' : 'light';
  }, [companyTheme?.theme_mode, resolvedTheme]);

  const applyTheme = useCallback(
    (theme: CompanyTheme | null) => {
      if (!theme || !companyId) {
        setCompanyTheme(null);
        setTheme('light');
        return;
      }

      const normalized = normalizeCompanyTheme(theme, companyId);
      setCompanyTheme(normalized);
      setTheme(normalized.theme_mode);
    },
    [companyId, setTheme],
  );

  const refreshCompanyTheme = useCallback(async () => {
    if (!companyId) {
      applyTheme(null);
      return null;
    }

    setLoadingCompanyTheme(true);

    try {
      const { data, error } = await supabase
        .from('company_theme')
        .select('*')
        .eq('store_id', companyId)
        .maybeSingle();

      if (error) {
        console.error('Erro ao carregar tema da empresa:', error);
        const fallback = defaultCompanyTheme(companyId);
        applyTheme(fallback);
        return fallback;
      }

      if (!data) {
        const fallback = defaultCompanyTheme(companyId);
        const { data: insertedData, error: insertError } = await supabase
          .from('company_theme')
          .upsert(fallback, { onConflict: 'store_id' })
          .select('*')
          .maybeSingle();

        if (insertError) {
          console.error('Erro ao criar tema padrão da empresa:', insertError);
          applyTheme(fallback);
          return fallback;
        }

        const normalizedInserted = normalizeCompanyTheme(insertedData ?? fallback, companyId);
        applyTheme(normalizedInserted);
        return normalizedInserted;
      }

      const normalized = normalizeCompanyTheme(data, companyId);
      applyTheme(normalized);
      return normalized;
    } finally {
      setLoadingCompanyTheme(false);
    }
  }, [applyTheme, companyId]);

  useEffect(() => {
    void refreshCompanyTheme();
  }, [refreshCompanyTheme]);

  useEffect(() => {
    if (!companyTheme || !companyId) {
      clearCompanyThemeFromDocument();
      return;
    }

    applyCompanyThemeToDocument(companyTheme, resolvedCompanyThemeMode);
  }, [companyId, companyTheme, resolvedCompanyThemeMode]);

  const setCompanyThemeLocally = useCallback(
    (theme: CompanyTheme) => {
      if (!companyId) return;
      applyTheme(normalizeCompanyTheme(theme, companyId));
    },
    [applyTheme, companyId],
  );

  const setCompanyThemeMode = useCallback(
    async (themeMode: CompanyThemeMode, options?: { persist?: boolean }) => {
      if (!companyId) return null;

      const persist = options?.persist ?? true;
      const nextTheme = normalizeCompanyTheme(
        {
          ...(companyTheme ?? defaultCompanyTheme(companyId)),
          theme_mode: themeMode,
        },
        companyId,
      );

      setCompanyTheme(nextTheme);
      setTheme(themeMode);

      if (!persist) {
        return nextTheme;
      }

      setSavingCompanyThemeMode(true);

      try {
        const { data, error } = await supabase
          .from('company_theme')
          .upsert(nextTheme, { onConflict: 'store_id' })
          .select('*')
          .maybeSingle();

        if (error) throw error;

        const savedTheme = normalizeCompanyTheme(data ?? nextTheme, companyId);
        setCompanyTheme(savedTheme);
        return savedTheme;
      } catch (error) {
        console.error('Erro ao atualizar modo do tema da empresa:', error);
        return await refreshCompanyTheme();
      } finally {
        setSavingCompanyThemeMode(false);
      }
    },
    [companyId, companyTheme, refreshCompanyTheme, setTheme],
  );

  const value = useMemo(
    () => ({
      companyTheme,
      loadingCompanyTheme,
      savingCompanyThemeMode,
      resolvedCompanyThemeMode,
      refreshCompanyTheme,
      setCompanyThemeLocally,
      setCompanyThemeMode,
    }),
    [
      companyTheme,
      loadingCompanyTheme,
      refreshCompanyTheme,
      resolvedCompanyThemeMode,
      savingCompanyThemeMode,
      setCompanyThemeLocally,
      setCompanyThemeMode,
    ],
  );

  return <CompanyThemeContext.Provider value={value}>{children}</CompanyThemeContext.Provider>;
}

export const useCompanyTheme = () => {
  const context = useContext(CompanyThemeContext);
  if (!context) {
    throw new Error('useCompanyTheme deve ser usado dentro de CompanyThemeProvider.');
  }

  return context;
};
