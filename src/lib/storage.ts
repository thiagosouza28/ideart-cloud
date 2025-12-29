import { supabase } from '@/integrations/supabase/client';

export const ensurePublicStorageUrl = (bucket: string, value?: string | null) => {
  if (!value) return null;

  if (value.includes('/storage/v1/object/public/')) {
    return value;
  }

  if (value.includes('/storage/v1/object/')) {
    return value.replace('/storage/v1/object/', '/storage/v1/object/public/');
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  return supabase.storage.from(bucket).getPublicUrl(value).data.publicUrl;
};

export const getStoragePathFromUrl = (bucket: string, url: string) => {
  const marker = `/${bucket}/`;
  const index = url.indexOf(marker);
  if (index >= 0) {
    return url.slice(index + marker.length);
  }
  return url;
};
