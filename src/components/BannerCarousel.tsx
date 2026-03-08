import { useEffect, useMemo, useState } from 'react';
import Autoplay from 'embla-carousel-autoplay';
import { publicSupabase } from '@/integrations/supabase/public-client';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { Skeleton } from '@/components/ui/skeleton';

type Banner = {
  id: string;
  image_url: string;
  link_url: string | null;
  title: string | null;
  position: 'catalog' | 'dashboard';
  is_active: boolean;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
};

interface BannerCarouselProps {
  companyId: string;
  position: 'catalog' | 'dashboard';
  className?: string;
}

const isBannerVisible = (banner: Banner, referenceDate = new Date()) => {
  if (!banner.is_active) return false;

  const startDate = banner.starts_at ? new Date(banner.starts_at) : null;
  const endDate = banner.ends_at ? new Date(banner.ends_at) : null;

  if (startDate && startDate.getTime() > referenceDate.getTime()) return false;
  if (endDate && endDate.getTime() < referenceDate.getTime()) return false;
  return true;
};

export function BannerCarousel({ companyId, position, className }: BannerCarouselProps) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBanners = async () => {
      if (!companyId) {
        setBanners([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      const { data, error } = await publicSupabase
        .from('banners')
        .select('id, image_url, link_url, title, position, is_active, sort_order, starts_at, ends_at')
        .eq('company_id', companyId)
        .eq('position', position)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('Erro ao buscar banners:', error);
        setBanners([]);
        setLoading(false);
        return;
      }

      setBanners(((data || []) as Banner[]).filter((banner) => isBannerVisible(banner)));
      setLoading(false);
    };

    void fetchBanners();
  }, [companyId, position]);

  const hasMultipleBanners = banners.length > 1;
  const autoplayPlugin = useMemo(
    () =>
      hasMultipleBanners
        ? [
            Autoplay({
              delay: 4500,
              stopOnInteraction: false,
            }),
          ]
        : [],
    [hasMultipleBanners],
  );

  if (loading) {
    return <Skeleton className={`w-full rounded-2xl aspect-[21/8] ${className || ''}`.trim()} />;
  }

  if (banners.length === 0) return null;

  const BannerCard = ({ banner }: { banner: Banner }) => (
    <div className="relative aspect-[21/8] w-full overflow-hidden rounded-2xl border border-[var(--pc-card-border,#e2e8f0)] bg-[var(--pc-card-bg,#fff)] shadow-sm">
      <img
        src={ensurePublicStorageUrl('product-images', banner.image_url) || ''}
        alt={banner.title || 'Banner'}
        loading="lazy"
        className="h-full w-full object-cover"
      />
      {banner.title && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/30 to-transparent px-5 py-4">
          <p className="text-sm font-semibold text-white sm:text-base">{banner.title}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className={className}>
      <Carousel
        opts={{ align: 'start', loop: hasMultipleBanners }}
        plugins={autoplayPlugin}
        className="w-full"
      >
        <CarouselContent>
          {banners.map((banner) => (
            <CarouselItem key={banner.id}>
              {banner.link_url ? (
                <a
                  href={banner.link_url}
                  target={banner.link_url.startsWith('http') ? '_blank' : '_self'}
                  rel="noopener noreferrer"
                  className="block"
                >
                  <BannerCard banner={banner} />
                </a>
              ) : (
                <BannerCard banner={banner} />
              )}
            </CarouselItem>
          ))}
        </CarouselContent>
        {hasMultipleBanners && (
          <>
            <CarouselPrevious className="-left-4 hidden md:flex" />
            <CarouselNext className="-right-4 hidden md:flex" />
          </>
        )}
      </Carousel>
    </div>
  );
}
