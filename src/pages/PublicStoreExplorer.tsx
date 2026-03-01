import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LocateFixed, MapPin, Search, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CatalogFooter, CatalogHero, CatalogTopNav } from '@/components/catalog/PublicCatalogChrome';
import { publicSupabase } from '@/integrations/supabase/public-client';
import { formatKmDistance, haversineKm, isValidCoordinate, type Coordinates } from '@/lib/geo';
import { ensurePublicStorageUrl } from '@/lib/storage';
import type { Company } from '@/types/database';

type CatalogStore = Pick<
  Company,
  'id' | 'name' | 'slug' | 'logo_url' | 'address' | 'city' | 'state' | 'latitude' | 'longitude'
>;

type CatalogStoreWithDistance = CatalogStore & {
  distanceKm: number | null;
};

const resolveGeoErrorMessage = (error: GeolocationPositionError) => {
  if (error.code === 1) return 'Permissao de localizacao negada.';
  if (error.code === 2) return 'Nao foi possivel identificar sua localizacao.';
  if (error.code === 3) return 'Tempo limite para obter localizacao.';
  return 'Falha ao obter localizacao.';
};

export default function PublicStoreExplorer() {
  const [stores, setStores] = useState<CatalogStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [searchName, setSearchName] = useState('');
  const [searchCity, setSearchCity] = useState('');
  const [sortMode, setSortMode] = useState<'distance' | 'name'>('distance');

  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const requestUserLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationError('Seu navegador nao suporta geolocalizacao.');
      return;
    }

    setLocationLoading(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationLoading(false);
      },
      (error) => {
        setLocationError(resolveGeoErrorMessage(error));
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 300_000 },
    );
  }, []);

  useEffect(() => {
    requestUserLocation();
  }, [requestUserLocation]);

  useEffect(() => {
    const loadStores = async () => {
      setLoading(true);
      setErrorMessage(null);

      const [companiesResult, productsResult] = await Promise.all([
        publicSupabase
          .from('companies')
          .select('id, name, slug, logo_url, address, city, state, latitude, longitude, is_active')
          .eq('is_active', true)
          .order('name', { ascending: true }),
        publicSupabase
          .from('products')
          .select('company_id')
          .eq('is_active', true)
          .or('catalog_enabled.is.true,show_in_catalog.is.true'),
      ]);

      if (companiesResult.error) {
        setStores([]);
        setLoading(false);
        setErrorMessage('Nao foi possivel carregar as lojas no momento.');
        return;
      }

      if (productsResult.error) {
        setStores([]);
        setLoading(false);
        setErrorMessage('Nao foi possivel carregar as lojas com catalogo ativo.');
        return;
      }

      const activeCompanyIds = new Set(
        (productsResult.data || [])
          .map((product) => product.company_id)
          .filter((value): value is string => typeof value === 'string' && value.length > 0),
      );

      const mappedStores = ((companiesResult.data || []) as CatalogStore[])
        .filter((company) => activeCompanyIds.has(company.id))
        .map((company) => ({
          ...company,
          logo_url: ensurePublicStorageUrl('product-images', company.logo_url),
        }));

      setStores(mappedStores);
      setLoading(false);
    };

    void loadStores();
  }, []);

  const filteredStores = useMemo<CatalogStoreWithDistance[]>(() => {
    const normalizedName = searchName.trim().toLowerCase();
    const normalizedCity = searchCity.trim().toLowerCase();

    const projected = stores
      .map((store) => {
        const hasCoordinates =
          isValidCoordinate(store.latitude) && isValidCoordinate(store.longitude) && location;
        const distanceKm = hasCoordinates
          ? haversineKm(location, {
              latitude: store.latitude as number,
              longitude: store.longitude as number,
            })
          : null;

        return {
          ...store,
          distanceKm,
        };
      })
      .filter((store) => {
        const nameMatch = normalizedName
          ? store.name.toLowerCase().includes(normalizedName)
          : true;
        const cityMatch = normalizedCity
          ? (store.city || '').toLowerCase().includes(normalizedCity)
          : true;
        return nameMatch && cityMatch;
      });

    return projected.sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name);

      const distanceA = a.distanceKm;
      const distanceB = b.distanceKm;

      if (distanceA === null && distanceB === null) return a.name.localeCompare(b.name);
      if (distanceA === null) return 1;
      if (distanceB === null) return -1;
      return distanceA - distanceB;
    });
  }, [location, searchCity, searchName, sortMode, stores]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <CatalogTopNav
        subtitle="Encontre lojas proximas"
        showAccount
        accountHref="/minha-conta/login?next=/minha-conta/pedidos"
        showContact={false}
      />

      <CatalogHero
        badge="Catalogo publico"
        title="Lojas proximas"
        description="Encontre lojas ativas, filtre por nome/cidade e abra o catalogo de cada uma."
      />

      <main className="mx-auto w-[min(1220px,calc(100%-24px))] py-6">
        <Card className="border-slate-200">
          <CardContent className="grid gap-3 p-4 md:grid-cols-[1.2fr_1fr_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchName}
                onChange={(event) => setSearchName(event.target.value)}
                placeholder="Buscar por nome da loja"
                className="pl-9"
              />
            </div>

            <Input
              value={searchCity}
              onChange={(event) => setSearchCity(event.target.value)}
              placeholder="Filtrar por cidade"
            />

            <select
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as 'distance' | 'name')}
            >
              <option value="distance">Ordenar por proximidade</option>
              <option value="name">Ordenar por nome</option>
            </select>

            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={requestUserLocation}
              disabled={locationLoading}
            >
              <LocateFixed className="h-4 w-4" />
              {locationLoading ? 'Localizando...' : 'Minha localizacao'}
            </Button>
          </CardContent>
        </Card>

        {locationError && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {locationError} Voce ainda pode buscar por nome e cidade.
          </p>
        )}

        {errorMessage && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {errorMessage}
          </p>
        )}

        {loading ? (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Carregando lojas...
          </div>
        ) : filteredStores.length === 0 ? (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Nenhuma loja encontrada com os filtros informados.
          </div>
        ) : (
          <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredStores.map((store) => {
              const storePath = store.slug ? `/catalogo/${store.slug}` : `/loja/${store.id}`;
              const cityState = [store.city, store.state].filter(Boolean).join(' - ');

              return (
                <article
                  key={store.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    {store.logo_url ? (
                      <img
                        src={store.logo_url}
                        alt={store.name}
                        className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="grid h-12 w-12 place-items-center rounded-lg border border-slate-200 bg-slate-50">
                        <Store className="h-5 w-5 text-slate-500" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-slate-900">{store.name}</h2>
                      {cityState && <p className="text-xs text-slate-500">{cityState}</p>}
                    </div>
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    {store.address && (
                      <p className="flex items-start gap-1.5">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 text-slate-400" />
                        <span>{store.address}</span>
                      </p>
                    )}
                    <p className="font-medium text-slate-700">
                      {formatKmDistance(store.distanceKm)}
                    </p>
                  </div>

                  <div className="mt-4">
                    <Button asChild className="w-full bg-[#1a3a8f] hover:bg-[#16337e]">
                      <Link to={storePath}>Ver Produtos</Link>
                    </Button>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>

      <CatalogFooter showAccount accountHref="/minha-conta/login?next=/minha-conta/pedidos" />
    </div>
  );
}
