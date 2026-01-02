import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Product, Company } from "@/types/database";
import { ArrowUpDown, ExternalLink, Save } from "lucide-react";
import { toast } from "sonner";

type CatalogProduct = Pick<
  Product,
  | "id"
  | "name"
  | "sku"
  | "image_url"
  | "catalog_enabled"
  | "catalog_featured"
  | "catalog_min_order"
  | "catalog_price"
  | "catalog_short_description"
  | "catalog_long_description"
  | "catalog_sort_order"
  | "show_in_catalog"
  | "is_active"
  | "slug"
>;

type CatalogSettings = Partial<Company> & {
  catalog_title?: string | null;
  catalog_description?: string | null;
  catalog_share_image_url?: string | null;
  catalog_button_text?: string | null;
  catalog_show_prices?: boolean | null;
  catalog_show_contact?: boolean | null;
  catalog_contact_url?: string | null;
  catalog_font?: string | null;
  catalog_columns_mobile?: number | null;
  catalog_columns_desktop?: number | null;
};

export default function CatalogManager() {
  const { profile, company } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [settings, setSettings] = useState<CatalogSettings>({});
  const [savingSettings, setSavingSettings] = useState(false);

  const loadProducts = async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("id,name,sku,image_url,catalog_enabled,catalog_featured,catalog_min_order,catalog_price,catalog_short_description,catalog_long_description,catalog_sort_order,show_in_catalog,is_active,slug")
      .eq("company_id", profile.company_id)
      .order("catalog_sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar produtos do catÁlogo");
      setLoading(false);
      return;
    }

    setProducts((data || []) as CatalogProduct[]);
    setLoading(false);
  };

  const loadSettings = async () => {
    if (!profile?.company_id) return;
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("id", profile.company_id)
      .maybeSingle();

    if (error) {
      toast.error("Erro ao carregar personalizaÓÐo do catÁlogo");
      return;
    }

    const companyData = data as Company | null;
    if (!companyData) return;
    setSettings({
      catalog_primary_color: companyData.catalog_primary_color,
      catalog_secondary_color: companyData.catalog_secondary_color,
      catalog_text_color: companyData.catalog_text_color,
      catalog_button_bg_color: companyData.catalog_button_bg_color,
      catalog_button_text_color: companyData.catalog_button_text_color,
      catalog_layout: companyData.catalog_layout,
      catalog_title: companyData.catalog_title,
      catalog_description: companyData.catalog_description,
      catalog_share_image_url: companyData.catalog_share_image_url,
      catalog_button_text: companyData.catalog_button_text,
      catalog_show_prices: companyData.catalog_show_prices,
      catalog_show_contact: companyData.catalog_show_contact,
      catalog_contact_url: companyData.catalog_contact_url,
      catalog_font: companyData.catalog_font,
      catalog_columns_mobile: companyData.catalog_columns_mobile,
      catalog_columns_desktop: companyData.catalog_columns_desktop,
    });
  };

  useEffect(() => {
    loadProducts();
    loadSettings();
  }, [profile?.company_id]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) =>
      product.name.toLowerCase().includes(term) || (product.sku || "").toLowerCase().includes(term)
    );
  }, [products, search]);

  const updateProduct = async (productId: string, patch: Partial<CatalogProduct>) => {
    const { error } = await supabase
      .from("products")
      .update(patch)
      .eq("id", productId);

    if (error) {
      toast.error("Erro ao atualizar produto do catÁlogo");
      return;
    }

    setProducts((prev) =>
      prev.map((item) => (item.id === productId ? { ...item, ...patch } : item))
    );
  };

  const handleDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    setProducts((prev) => {
      const current = [...prev];
      const fromIndex = current.findIndex((item) => item.id === draggingId);
      const toIndex = current.findIndex((item) => item.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const [moved] = current.splice(fromIndex, 1);
      current.splice(toIndex, 0, moved);
      return current;
    });
  };

  const saveOrder = async () => {
    if (!profile?.company_id) return;
    setSavingOrder(true);
    const updates = products.map((product, index) => ({
      id: product.id,
      catalog_sort_order: index + 1,
    }));
    const { error } = await supabase.from("products").upsert(updates, { onConflict: "id" });
    if (error) {
      toast.error("Erro ao salvar a ordem do catÁlogo");
      setSavingOrder(false);
      return;
    }
    setProducts((prev) =>
      prev.map((item, index) => ({ ...item, catalog_sort_order: index + 1 }))
    );
    toast.success("Ordem do catÁlogo atualizada");
    setSavingOrder(false);
  };

  const saveSettings = async () => {
    if (!profile?.company_id) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from("companies")
      .update(settings)
      .eq("id", profile.company_id);
    if (error) {
      toast.error("Erro ao salvar personalizaÓÐo");
      setSavingSettings(false);
      return;
    }
    toast.success("PersonalizaÓÐo salva");
    setSavingSettings(false);
  };

  const catalogUrl = company?.slug ? `/catalogo/${company.slug}` : "";

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">CatÁlogo</h1>
          <p className="text-muted-foreground text-sm">Gerencie produtos e personalizaÓÐo do catÁlogo</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {catalogUrl && (
            <Button variant="outline" onClick={() => window.open(catalogUrl, "_blank")}>
              Ver catÁlogo
              <ExternalLink className="h-4 w-4 ml-2" />
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate("/banners")}>
            Banners
          </Button>
          <Button onClick={() => navigate("/produtos/novo")}>Novo produto</Button>
        </div>
      </div>

      <Tabs defaultValue="produtos" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="personalizacao">PersonalizaÓÐo</TabsTrigger>
        </TabsList>

        <TabsContent value="produtos" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input
              placeholder="Buscar produto..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="sm:w-80"
            />
            <Button variant="outline" onClick={saveOrder} disabled={savingOrder}>
              <Save className="h-4 w-4 mr-2" />
              {savingOrder ? "Salvando..." : "Salvar ordem"}
            </Button>
          </div>

          {loading ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">Carregando produtos...</CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredProducts.map((product) => (
                <Card
                  key={product.id}
                  draggable
                  onDragStart={() => setDraggingId(product.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDrop(product.id)}
                  className="border-dashed transition-shadow hover:shadow-md"
                >
                  <CardContent className="grid gap-4 p-4 md:grid-cols-[24px_1fr_auto] md:items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold">{product.name}</span>
                        {!product.is_active && <Badge variant="outline">Inativo</Badge>}
                        {(product.catalog_enabled ?? product.show_in_catalog) && (
                          <Badge variant="secondary">CatÁlogo ativo</Badge>
                        )}
                        {product.catalog_featured && <Badge variant="default">Destaque</Badge>}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label>PreÓo catÁlogo</Label>
                          <Input
                            type="number"
                            min="0"
                            value={product.catalog_price ?? ""}
                            onChange={(event) =>
                              updateProduct(product.id, {
                                catalog_price: event.target.value ? Number(event.target.value) : null,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Pedido mÝnimo</Label>
                          <Input
                            type="number"
                            min="1"
                            value={product.catalog_min_order ?? 1}
                            onChange={(event) =>
                              updateProduct(product.id, {
                                catalog_min_order: Math.max(1, Number(event.target.value) || 1),
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Slug</Label>
                          <Input
                            value={product.slug ?? ""}
                            onChange={(event) =>
                              updateProduct(product.id, { slug: event.target.value })
                            }
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={product.catalog_enabled ?? product.show_in_catalog}
                          onCheckedChange={(checked) =>
                            updateProduct(product.id, {
                              catalog_enabled: checked,
                              show_in_catalog: checked,
                            })
                          }
                        />
                        <span className="text-sm">No catÁlogo</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={product.catalog_featured ?? false}
                          onCheckedChange={(checked) =>
                            updateProduct(product.id, { catalog_featured: checked })
                          }
                        />
                        <span className="text-sm">Destaque</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="personalizacao" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Identidade do catÁlogo</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>TÝtulo do catÁlogo</Label>
                <Input
                  value={settings.catalog_title ?? ""}
                  onChange={(event) => setSettings({ ...settings, catalog_title: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Imagem de compartilhamento</Label>
                <Input
                  value={settings.catalog_share_image_url ?? ""}
                  onChange={(event) => setSettings({ ...settings, catalog_share_image_url: event.target.value })}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>DescriÓÐo SEO</Label>
                <Textarea
                  rows={3}
                  value={settings.catalog_description ?? ""}
                  onChange={(event) => setSettings({ ...settings, catalog_description: event.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Layout e comportamento</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Fonte</Label>
                <Input
                  value={settings.catalog_font ?? ""}
                  onChange={(event) => setSettings({ ...settings, catalog_font: event.target.value })}
                  placeholder="Ex: Manrope, Poppins..."
                />
              </div>
              <div className="space-y-2">
                <Label>Texto do botÐo</Label>
                <Input
                  value={settings.catalog_button_text ?? ""}
                  onChange={(event) => setSettings({ ...settings, catalog_button_text: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Colunas mobile</Label>
                <Input
                  type="number"
                  min="1"
                  max="3"
                  value={settings.catalog_columns_mobile ?? 2}
                  onChange={(event) =>
                    setSettings({ ...settings, catalog_columns_mobile: Number(event.target.value) || 1 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Colunas desktop</Label>
                <Input
                  type="number"
                  min="2"
                  max="6"
                  value={settings.catalog_columns_desktop ?? 4}
                  onChange={(event) =>
                    setSettings({ ...settings, catalog_columns_desktop: Number(event.target.value) || 4 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Layout</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={settings.catalog_layout === "grid" ? "default" : "outline"}
                    onClick={() => setSettings({ ...settings, catalog_layout: "grid" })}
                  >
                    Grid
                  </Button>
                  <Button
                    type="button"
                    variant={settings.catalog_layout === "list" ? "default" : "outline"}
                    onClick={() => setSettings({ ...settings, catalog_layout: "list" })}
                  >
                    Lista
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={settings.catalog_show_prices ?? true}
                  onCheckedChange={(checked) => setSettings({ ...settings, catalog_show_prices: checked })}
                />
                <span className="text-sm">Exibir preÓos</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={settings.catalog_show_contact ?? true}
                  onCheckedChange={(checked) => setSettings({ ...settings, catalog_show_contact: checked })}
                />
                <span className="text-sm">Exibir botÐo de contato</span>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Link de contato</Label>
                <Input
                  value={settings.catalog_contact_url ?? ""}
                  onChange={(event) => setSettings({ ...settings, catalog_contact_url: event.target.value })}
                  placeholder="https://wa.me/5511999999999"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cores</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Cor primÁria</Label>
                <Input
                  type="color"
                  value={settings.catalog_primary_color ?? "#3b82f6"}
                  onChange={(event) => setSettings({ ...settings, catalog_primary_color: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Cor secundÁria</Label>
                <Input
                  type="color"
                  value={settings.catalog_secondary_color ?? "#1e40af"}
                  onChange={(event) => setSettings({ ...settings, catalog_secondary_color: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Cor do texto</Label>
                <Input
                  type="color"
                  value={settings.catalog_text_color ?? "#111827"}
                  onChange={(event) => setSettings({ ...settings, catalog_text_color: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Cor do botÐo</Label>
                <Input
                  type="color"
                  value={settings.catalog_button_bg_color ?? "#3b82f6"}
                  onChange={(event) => setSettings({ ...settings, catalog_button_bg_color: event.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveSettings} disabled={savingSettings}>
              {savingSettings ? "Salvando..." : "Salvar personalizaÓÐo"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
