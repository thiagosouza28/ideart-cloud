import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from "@/components/ui/carousel";
import { ensurePublicStorageUrl } from '@/lib/storage';
import { Skeleton } from '@/components/ui/skeleton';
import Autoplay from "embla-carousel-autoplay";

interface Banner {
    id: string;
    image_url: string;
    link_url: string | null;
    title: string | null;
}

interface BannerCarouselProps {
    companyId: string;
    position: 'catalog' | 'dashboard';
}

export function BannerCarousel({ companyId, position }: BannerCarouselProps) {
    const [banners, setBanners] = useState<Banner[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchBanners = async () => {
            setLoading(true);
            try {
                const now = new Date().toISOString();
                const { data, error } = await supabase
                    .from('banners')
                    .select('id, image_url, link_url, title')
                    .eq('company_id', companyId)
                    .eq('position', position)
                    .eq('is_active', true)
                    .or(`starts_at.is.null,starts_at.lte.${now}`)
                    .or(`ends_at.is.null,ends_at.gte.${now}`)
                    .order('sort_order', { ascending: true });

                if (error) throw error;
                setBanners(data || []);
            } catch (error) {
                console.error('Error fetching banners:', error);
            } finally {
                setLoading(false);
            }
        };

        if (companyId) {
            fetchBanners();
        }
    }, [companyId, position]);

    if (loading) {
        return <Skeleton className="w-full aspect-[21/9] mb-8 rounded-xl" />;
    }

    if (banners.length === 0) {
        return null;
    }

    const BannerContent = ({ banner }: { banner: Banner }) => (
        <div className="relative aspect-[21/9] w-full overflow-hidden rounded-xl shadow-sm border">
            <img
                src={ensurePublicStorageUrl('product-images', banner.image_url) || ''}
                alt={banner.title || 'Banner'}
                className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
            />
        </div>
    );

    return (
        <div className="w-full mb-8 px-4 md:px-0">
            <Carousel
                opts={{
                    align: "start",
                    loop: true,
                }}
                plugins={[
                    Autoplay({
                        delay: 5000,
                    }),
                ]}
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
                                    <BannerContent banner={banner} />
                                </a>
                            ) : (
                                <BannerContent banner={banner} />
                            )}
                        </CarouselItem>
                    ))}
                </CarouselContent>
                {banners.length > 1 && (
                    <>
                        <CarouselPrevious className="hidden md:flex -left-6" />
                        <CarouselNext className="hidden md:flex -right-6" />
                    </>
                )}
            </Carousel>
        </div>
    );
}
