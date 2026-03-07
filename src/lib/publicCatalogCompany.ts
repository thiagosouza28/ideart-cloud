import { publicSupabase } from '@/integrations/supabase/public-client';
import { fetchCatalogSettings, hydrateCatalogCompany } from '@/lib/catalogSettings';
import { ensurePublicStorageUrl } from '@/lib/storage';
import type { Company } from '@/types/database';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuidLike = (value?: string | null) => UUID_PATTERN.test(String(value || '').trim());

export const hydratePublicCatalogCompany = async <
  TCompany extends Pick<Company, 'id' | 'name'> & Partial<Company>,
>(
  company: TCompany,
) => {
  let settings = null;

  try {
    settings = await fetchCatalogSettings(publicSupabase, company.id);
  } catch {
    settings = null;
  }

  const hydrated = hydrateCatalogCompany(company, settings);

  return {
    ...hydrated,
    logo_url: ensurePublicStorageUrl('product-images', hydrated.logo_url) || hydrated.logo_url || null,
  };
};

export const loadPublicCatalogCompany = async ({
  slug,
  companyId,
}: {
  slug?: string | null;
  companyId?: string | null;
}) => {
  const resolvedSlug = slug?.trim() || null;
  const resolvedCompanyId = companyId?.trim() || null;

  if (!resolvedSlug && !resolvedCompanyId) {
    return null;
  }

  let companyQuery = publicSupabase.from('companies').select('*').eq('is_active', true);

  if (resolvedCompanyId) {
    companyQuery = companyQuery.eq('id', resolvedCompanyId);
  } else if (resolvedSlug) {
    companyQuery = companyQuery.eq('slug', resolvedSlug);
  }

  let { data } = await companyQuery.maybeSingle();

  if (!data && resolvedSlug && !resolvedCompanyId && isUuidLike(resolvedSlug)) {
    const fallbackResult = await publicSupabase
      .from('companies')
      .select('*')
      .eq('id', resolvedSlug)
      .eq('is_active', true)
      .maybeSingle();

    data = fallbackResult.data;
  }

  if (!data) {
    return null;
  }

  return hydratePublicCatalogCompany(data as Company);
};
