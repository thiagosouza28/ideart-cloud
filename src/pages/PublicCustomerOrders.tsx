import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CatalogFooter, CatalogHero, CatalogTopNav } from '@/components/catalog/PublicCatalogChrome';
import { useCustomerAuth } from '@/hooks/use-customer-auth';
import { customerSupabase } from '@/integrations/supabase/customer-client';
import { publicSupabase } from '@/integrations/supabase/public-client';
import type { Order, OrderStatus } from '@/types/database';

const statusLabels: Record<OrderStatus, string> = {
  orcamento: 'Orcamento',
  pendente: 'Pendente',
  produzindo_arte: 'Em arte',
  arte_aprovada: 'Arte aprovada',
  em_producao: 'Em producao',
  finalizado: 'Finalizado',
  pronto: 'Pronto',
  aguardando_retirada: 'Aguardando retirada',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

const asCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-BR');

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export default function PublicCustomerOrders() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut, loading } = useCustomerAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [catalogCompany, setCatalogCompany] = useState<{
    id: string;
    name: string;
    slug: string | null;
    city: string | null;
    state: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    whatsapp: string | null;
    catalog_contact_url: string | null;
  } | null>(null);

  const catalogPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const catalog = params.get('catalog');
    if (!catalog) return '/catalogo';
    if (catalog.startsWith('/catalogo') || catalog.startsWith('/loja/')) return catalog;
    return '/catalogo';
  }, [location.search]);

  const profilePath = useMemo(
    () => (location.search ? `/minha-conta/perfil${location.search}` : '/minha-conta/perfil'),
    [location.search],
  );

  const ordersPath = useMemo(
    () => (location.search ? `/minha-conta/pedidos${location.search}` : '/minha-conta/pedidos'),
    [location.search],
  );

  const companyContext = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const company = params.get('company');
    if (company && isUuid(company)) return company;

    const catalog = params.get('catalog');
    if (!catalog) return null;
    const byId = catalog.match(/^\/loja\/([^/?#]+)/i);
    if (byId?.[1]) return byId[1];
    const bySlug = catalog.match(/^\/catalogo\/([^/?#]+)/i);
    return bySlug?.[1] || null;
  }, [location.search]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const params = new URLSearchParams();
      params.set('next', ordersPath);
      if (catalogPath.startsWith('/catalogo') || catalogPath.startsWith('/loja/')) {
        params.set('catalog', catalogPath);
      }
      navigate(`/minha-conta/login?${params.toString()}`, { replace: true });
    }
  }, [catalogPath, loading, navigate, ordersPath, user]);

  useEffect(() => {
    let isMounted = true;

    const loadCatalogCompany = async () => {
      if (!companyContext) {
        setCatalogCompany(null);
        return;
      }

      let query = publicSupabase
        .from('companies')
        .select('id, name, slug, city, state, phone, email, address, whatsapp, catalog_contact_url, is_active')
        .eq('is_active', true);
      query = isUuid(companyContext) ? query.eq('id', companyContext) : query.eq('slug', companyContext);
      const { data } = await query.maybeSingle();

      if (!isMounted) return;

      if (data) {
        setCatalogCompany({
          id: data.id,
          name: data.name,
          slug: data.slug || null,
          city: data.city || null,
          state: data.state || null,
          phone: data.phone || null,
          email: data.email || null,
          address: data.address || null,
          whatsapp: data.whatsapp || null,
          catalog_contact_url: data.catalog_contact_url || null,
        });
      } else {
        setCatalogCompany(null);
      }
    };

    void loadCatalogCompany();
    return () => {
      isMounted = false;
    };
  }, [companyContext]);

  useEffect(() => {
    const loadOrders = async () => {
      if (!user?.id) return;

      setOrdersLoading(true);
      setErrorMessage(null);

      const { data, error } = await customerSupabase
        .from('orders')
        .select('id, order_number, status, payment_status, total, created_at, customer_name, customer_user_id')
        .eq('customer_user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        setOrders([]);
        setErrorMessage(error.message || 'Nao foi possivel carregar seus pedidos.');
      } else {
        setOrders((data || []) as Order[]);
      }
      setOrdersLoading(false);
    };

    void loadOrders();
  }, [user?.id]);

  const pendingCount = useMemo(
    () => orders.filter((order) => order.status !== 'entregue' && order.status !== 'cancelado').length,
    [orders],
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <CatalogTopNav
        company={catalogCompany}
        subtitle={user?.email || 'Cliente autenticado'}
        showBack
        onBack={() => navigate(catalogPath)}
        showAccount
        accountHref={profilePath}
        accountLabel="Meu perfil"
        showContact
      />

      <CatalogHero
        badge="Minha conta"
        title="Meus pedidos"
        description="Acompanhe status, valores e detalhes de todos os pedidos da sua conta."
      />

      <main className="mx-auto w-[min(980px,calc(100%-24px))] py-6">
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-[#1a3a8f] text-[#1a3a8f] hover:bg-[#f3f6ff]"
            onClick={() => navigate(profilePath)}
          >
            Meu perfil
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-[#1a3a8f] text-[#1a3a8f] hover:bg-[#f3f6ff]"
            onClick={() => void signOut()}
          >
            Sair
          </Button>
        </div>

        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Pedidos</CardTitle>
            <Badge variant="secondary">{pendingCount} em andamento</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {ordersLoading && <p className="text-sm text-slate-500">Carregando pedidos...</p>}
            {!ordersLoading && errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}
            {!ordersLoading && !errorMessage && orders.length === 0 && (
              <p className="text-sm text-slate-500">Voce ainda nao possui pedidos vinculados a esta conta.</p>
            )}

            {!ordersLoading && !errorMessage && orders.map((order) => (
              <article
                key={order.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Pedido #{order.order_number}</p>
                    <p className="text-xs text-slate-500">{formatDate(order.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{statusLabels[order.status] || order.status}</Badge>
                    <Button
                      type="button"
                      className="bg-[#1a3a8f] hover:bg-[#16337e]"
                      onClick={() =>
                        navigate(
                          location.search
                            ? `/minha-conta/pedidos/${order.id}${location.search}`
                            : `/minha-conta/pedidos/${order.id}`,
                        )
                      }
                    >
                      Ver detalhes
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-slate-500">Valor total</span>
                  <span className="font-semibold">{asCurrency(Number(order.total || 0))}</span>
                </div>
              </article>
            ))}
          </CardContent>
        </Card>
      </main>

      <CatalogFooter company={catalogCompany} showAccount accountHref={profilePath} accountLabel="Meu perfil" />
    </div>
  );
}
