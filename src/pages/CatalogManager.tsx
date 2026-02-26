import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  ImagePlus,
  LayoutGrid,
  List,
  Search,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Company, Product } from "@/types/database";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ensurePublicStorageUrl } from "@/lib/storage";

type CatalogProduct = Pick<
  Product,
  | "id"
  | "name"
  | "sku"
  | "barcode"
  | "image_url"
  | "catalog_enabled"
  | "catalog_featured"
  | "catalog_min_order"
  | "catalog_price"
  | "catalog_sort_order"
  | "show_in_catalog"
  | "is_active"
  | "slug"
>;

type CatalogSettings = Pick<
  Company,
  | "catalog_title"
  | "catalog_description"
  | "catalog_button_text"
  | "catalog_show_prices"
  | "catalog_show_contact"
  | "catalog_contact_url"
  | "catalog_primary_color"
  | "catalog_secondary_color"
  | "catalog_text_color"
>;

type ProductFilter = "all" | "active" | "inactive" | "featured" | "incomplete";
type ViewMode = "grid" | "list";
type TabMode = "products" | "personalization";

type CompletenessInfo = {
  points: number;
  percent: number;
  incomplete: boolean;
  tone: "success" | "warn" | "danger";
};

const PRODUCT_SELECT =
  "id,name,sku,barcode,image_url,catalog_enabled,catalog_featured,catalog_min_order,catalog_price,catalog_sort_order,show_in_catalog,is_active,slug";

const defaultCatalogSettings: CatalogSettings = {
  catalog_title: "",
  catalog_description: "",
  catalog_button_text: "",
  catalog_show_prices: true,
  catalog_show_contact: true,
  catalog_contact_url: "",
  catalog_primary_color: "#2563eb",
  catalog_secondary_color: "#1d4ed8",
  catalog_text_color: "#1a1814",
};

const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const isCatalogVisible = (product: CatalogProduct) =>
  Boolean(product.catalog_enabled ?? product.show_in_catalog);

const getCompleteness = (product: CatalogProduct): CompletenessInfo => {
  let points = 0;

  if (typeof product.catalog_price === "number" && product.catalog_price > 0) points += 1;
  if (product.image_url) points += 1;
  if (typeof product.catalog_min_order === "number" && product.catalog_min_order > 0) points += 1;

  const percent = Math.round((points / 3) * 100);
  const tone = points === 3 ? "success" : points >= 2 ? "warn" : "danger";

  return {
    points,
    percent,
    incomplete: percent < 100,
    tone,
  };
};

const badgeBaseClass =
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none";

export default function CatalogManager() {
  const { profile, company } = useAuth();

  const [activeTab, setActiveTab] = useState<TabMode>("products");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filter, setFilter] = useState<ProductFilter>("all");
  const [search, setSearch] = useState("");

  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);

  const [settings, setSettings] = useState<CatalogSettings>(defaultCatalogSettings);
  const [savingSettings, setSavingSettings] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);

  const companyId = profile?.company_id ?? null;
  const publicCatalogUrl = company?.slug ? `/catalogo/${company.slug}` : null;

  const loadProducts = useCallback(async () => {
    if (!companyId) {
      setLoadingProducts(false);
      return;
    }

    setLoadingProducts(true);

    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("company_id", companyId)
      .order("catalog_sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar produtos do catálogo.");
      setLoadingProducts(false);
      return;
    }

    setProducts((data || []) as CatalogProduct[]);
    setLoadingProducts(false);
  }, [companyId]);

  const loadSettings = useCallback(async () => {
    if (!companyId) return;

    setLoadingSettings(true);

    const { data, error } = await supabase
      .from("companies")
      .select(
        "catalog_title,catalog_description,catalog_button_text,catalog_show_prices,catalog_show_contact,catalog_contact_url,catalog_primary_color,catalog_secondary_color,catalog_text_color"
      )
      .eq("id", companyId)
      .maybeSingle();

    if (error) {
      toast.error("Erro ao carregar personalização do catálogo.");
      setLoadingSettings(false);
      return;
    }

    if (data) {
      setSettings({
        ...defaultCatalogSettings,
        ...data,
      });
    }

    setLoadingSettings(false);
  }, [companyId]);

  useEffect(() => {
    void loadProducts();
    void loadSettings();
  }, [loadProducts, loadSettings]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => products.some((product) => product.id === id)));
  }, [products]);

  const completenessMap = useMemo(() => {
    const map = new Map<string, CompletenessInfo>();
    products.forEach((product) => {
      map.set(product.id, getCompleteness(product));
    });
    return map;
  }, [products]);

  const stats = useMemo(() => {
    const total = products.length;
    const active = products.filter((product) => product.is_active).length;
    const featured = products.filter((product) => Boolean(product.catalog_featured)).length;
    const incomplete = products.filter((product) => completenessMap.get(product.id)?.incomplete).length;

    return { total, active, featured, incomplete };
  }, [products, completenessMap]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products.filter((product) => {
      const bySearch =
        term.length === 0 ||
        product.name.toLowerCase().includes(term) ||
        (product.sku || "").toLowerCase().includes(term) ||
        (product.barcode || "").toLowerCase().includes(term);

      if (!bySearch) return false;

      if (filter === "active") return product.is_active;
      if (filter === "inactive") return !product.is_active;
      if (filter === "featured") return Boolean(product.catalog_featured);
      if (filter === "incomplete") return Boolean(completenessMap.get(product.id)?.incomplete);

      return true;
    });
  }, [products, search, filter, completenessMap]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCount = selectedIds.length;

  const allVisibleSelected =
    filteredProducts.length > 0 && filteredProducts.every((product) => selectedSet.has(product.id));

  const toggleSelection = (productId: string) => {
    setSelectedIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const toggleSelectVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredProducts.forEach((product) => next.delete(product.id));
      } else {
        filteredProducts.forEach((product) => next.add(product.id));
      }
      return Array.from(next);
    });
  };

  const patchSingleProduct = async (
    productId: string,
    patch: Partial<CatalogProduct>,
    options?: { successMessage?: string }
  ) => {
    const { error } = await supabase.from("products").update(patch).eq("id", productId);

    if (error) {
      toast.error("Não foi possível atualizar o produto.");
      return false;
    }

    setProducts((prev) => prev.map((product) => (product.id === productId ? { ...product, ...patch } : product)));

    if (options?.successMessage) {
      toast.success(options.successMessage);
    }

    return true;
  };

  const runBulkPatch = async (patch: Partial<CatalogProduct>, successMessage: string) => {
    if (selectedIds.length === 0) return;

    setBulkRunning(true);
    const ids = [...selectedIds];

    const { error } = await supabase.from("products").update(patch).in("id", ids);

    if (error) {
      toast.error("Não foi possível aplicar a ação em lote.");
      setBulkRunning(false);
      return;
    }

    const idSet = new Set(ids);
    setProducts((prev) => prev.map((product) => (idSet.has(product.id) ? { ...product, ...patch } : product)));
    setSelectedIds([]);
    setBulkRunning(false);
    toast.success(successMessage);
  };

  const saveSettings = async () => {
    if (!companyId) return;

    setSavingSettings(true);

    const { error } = await supabase.from("companies").update(settings).eq("id", companyId);

    if (error) {
      toast.error("Não foi possível salvar as configurações.");
      setSavingSettings(false);
      return;
    }

    toast.success("Personalização salva.");
    setSavingSettings(false);
  };

  const filterChips: Array<{ id: ProductFilter; label: string }> = [
    { id: "all", label: "Todos" },
    { id: "active", label: "Ativos" },
    { id: "inactive", label: "Inativos" },
    { id: "featured", label: "Destaque" },
    { id: "incomplete", label: "Incompletos" },
  ];

  return (
    <div className="page-container text-foreground">
      <div className="page-header">
        <div>
          <h1 className="page-title">Catálogo</h1>
          <p className="text-sm text-muted-foreground">Gestão visual dos produtos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {publicCatalogUrl && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 border-border"
              onClick={() => window.open(publicCatalogUrl, "_blank")}
            >
              Ver catálogo
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => setActiveTab("products")}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-bold transition-colors",
            activeTab === "products"
              ? "bg-primary text-white"
              : "text-muted-foreground hover:bg-muted/30"
          )}
        >
          Produtos
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("personalization")}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-bold transition-colors",
            activeTab === "personalization"
              ? "bg-primary text-white"
              : "text-muted-foreground hover:bg-muted/30"
          )}
        >
          Personalização
        </button>
      </div>

      {activeTab === "products" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="mt-2 text-2xl font-semibold">
                {stats.total}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ativos</p>
              <p className="mt-2 text-2xl font-semibold">
                {stats.active}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Destaque</p>
              <p className="mt-2 text-2xl font-semibold">
                {stats.featured}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Incompletos</p>
              <p className="mt-2 text-2xl font-semibold">
                {stats.incomplete}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="relative w-full xl:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar produto por nome, SKU ou código..."
                  className="h-11 border-border bg-card pl-9"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {filterChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setFilter(chip.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                      filter === chip.id
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary"
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <div className="inline-flex items-center rounded-xl border border-border bg-card p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  aria-label="Visualização em grade"
                  className={cn(
                    "rounded-lg p-2 transition-colors",
                    viewMode === "grid" ? "bg-primary text-white" : "text-muted-foreground"
                  )}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  aria-label="Visualização em lista"
                  className={cn(
                    "rounded-lg p-2 transition-colors",
                    viewMode === "list" ? "bg-primary text-white" : "text-muted-foreground"
                  )}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={toggleSelectVisible}
                className="rounded-full border border-border px-3 py-1 font-semibold hover:border-primary"
              >
                {allVisibleSelected ? "Desmarcar visíveis" : "Selecionar visíveis"}
              </button>
              <span>{filteredProducts.length} itens visíveis</span>
            </div>
          </div>

          {stats.incomplete > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <p className="text-sm font-semibold">
                Existem {stats.incomplete} produtos incompletos. Complete preço, imagem e pedido mínimo.
              </p>
            </div>
          )}

          <div
            className={cn(
              "overflow-hidden transition-all duration-300",
              selectedCount > 0 ? "max-h-28 opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3">
              <p className="text-sm font-semibold text-primary">
                {selectedCount} produto(s) selecionado(s)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkRunning}
                  className="h-8 border-primary/40 bg-white"
                  onClick={() =>
                    void runBulkPatch(
                      { catalog_enabled: true, show_in_catalog: true },
                      "Produtos exibidos no catálogo."
                    )
                  }
                >
                  Exibir
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkRunning}
                  className="h-8 border-primary/40 bg-white"
                  onClick={() =>
                    void runBulkPatch(
                      { catalog_enabled: false, show_in_catalog: false },
                      "Produtos ocultados do catálogo."
                    )
                  }
                >
                  Ocultar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkRunning}
                  className="h-8 border-primary/40 bg-white"
                  onClick={() => void runBulkPatch({ catalog_featured: true }, "Produtos destacados.")}
                >
                  Destacar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={bulkRunning}
                  className="h-8 border-primary/40 bg-white"
                  onClick={() => void runBulkPatch({ catalog_featured: false }, "Destaque removido dos produtos.")}
                >
                  Remover destaque
                </Button>
              </div>
            </div>
          </div>

          {loadingProducts ? (
            <div className="rounded-2xl border border-border bg-card py-16 text-center text-sm text-muted-foreground">
              Carregando produtos...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center text-sm text-muted-foreground">
              Nenhum produto encontrado para os filtros atuais.
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => {
                const completeness = completenessMap.get(product.id) || getCompleteness(product);
                const productImage = ensurePublicStorageUrl("product-images", product.image_url);
                const visible = isCatalogVisible(product);

                return (
                  <article
                    key={product.id}
                    className="overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-px hover:border-primary hover:shadow-lg"
                  >
                    <div className="relative h-[100px] border-b border-border bg-muted/30">
                      {productImage ? (
                        <img src={productImage} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImagePlus className="h-6 w-6" />
                        </div>
                      )}

                      <div className="absolute left-2 top-2 flex max-w-[75%] flex-wrap gap-1">
                        <span
                          className={cn(
                            badgeBaseClass,
                            product.is_active
                              ? "border-emerald-500/40 bg-emerald-50 text-emerald-600"
                              : "border-border bg-muted text-muted-foreground"
                          )}
                        >
                          {product.is_active ? "Ativo" : "Inativo"}
                        </span>

                        {product.catalog_featured && (
                          <span className={cn(badgeBaseClass, "border-violet-500/40 bg-violet-100 text-violet-700")}>
                            Destaque
                          </span>
                        )}

                        {completeness.incomplete && (
                          <span className={cn(badgeBaseClass, "border-amber-500/40 bg-amber-50 text-amber-800")}>
                            Incompleto
                          </span>
                        )}
                      </div>

                      <label className="absolute right-2 top-2 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border bg-white">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selectedSet.has(product.id)}
                          onChange={() => toggleSelection(product.id)}
                        />
                      </label>
                    </div>

                    <div className="block w-full space-y-3 p-4 text-left">
                      <h3 className="truncate text-base font-semibold">
                        {product.name}
                      </h3>

                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Preço</p>
                          <p className="font-semibold">{formatCurrency(product.catalog_price)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Min. pedido</p>
                          <p className="font-semibold">{product.catalog_min_order ?? "-"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Completude</p>
                          <p className="font-semibold">{completeness.percent}%</p>
                        </div>
                      </div>

                      <div>
                        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Progresso</span>
                          <span>{completeness.points}/3</span>
                        </div>
                        <div className="h-2 rounded-full bg-border">
                          <div
                            className={cn(
                              "h-2 rounded-full transition-all",
                              completeness.tone === "success"
                                ? "bg-emerald-500"
                                : completeness.tone === "warn"
                                  ? "bg-amber-500"
                                  : "bg-red-500"
                            )}
                            style={{ width: `${completeness.percent}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-border px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={visible}
                          onCheckedChange={(checked) =>
                            void patchSingleProduct(product.id, {
                              catalog_enabled: checked,
                              show_in_catalog: checked,
                            })
                          }
                        />
                        <span className="text-xs font-semibold text-muted-foreground">
                          {visible ? "No catálogo" : "Oculto"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() =>
                            void patchSingleProduct(product.id, {
                              catalog_featured: !Boolean(product.catalog_featured),
                            })
                          }
                        >
                          <Star
                            className={cn(
                              "h-4 w-4",
                              product.catalog_featured ? "fill-violet-700 text-violet-700" : "text-muted-foreground"
                            )}
                          />
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProducts.map((product) => {
                const completeness = completenessMap.get(product.id) || getCompleteness(product);
                const productImage = ensurePublicStorageUrl("product-images", product.image_url);
                const visible = isCatalogVisible(product);

                return (
                  <div
                    key={product.id}
                    className="grid gap-3 rounded-2xl border border-border bg-card p-3 md:grid-cols-[auto_auto_minmax(220px,1fr)_auto_auto] md:items-center"
                  >
                    <label className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-white">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selectedSet.has(product.id)}
                        onChange={() => toggleSelection(product.id)}
                      />
                    </label>

                    <div className="h-12 w-12 overflow-hidden rounded-lg border border-border bg-muted/30">
                      {productImage ? (
                        <img src={productImage} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImagePlus className="h-4 w-4" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-left text-base font-semibold">
                        {product.name}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span
                          className={cn(
                            badgeBaseClass,
                            product.is_active
                              ? "border-emerald-500/40 bg-emerald-50 text-emerald-600"
                              : "border-border bg-muted text-muted-foreground"
                          )}
                        >
                          {product.is_active ? "Ativo" : "Inativo"}
                        </span>
                        {product.catalog_featured && (
                          <span className={cn(badgeBaseClass, "border-violet-500/40 bg-violet-100 text-violet-700")}>
                            Destaque
                          </span>
                        )}
                        {completeness.incomplete && (
                          <span className={cn(badgeBaseClass, "border-amber-500/40 bg-amber-50 text-amber-800")}>
                            Incompleto
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-sm font-semibold">
                      {product.catalog_price === null || product.catalog_price === undefined ? (
                        <span className="text-destructive">Sem preço</span>
                      ) : (
                        formatCurrency(product.catalog_price)
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() =>
                          void patchSingleProduct(product.id, {
                            catalog_enabled: !visible,
                            show_in_catalog: !visible,
                          })
                        }
                        title={visible ? "Ocultar no catálogo" : "Mostrar no catálogo"}
                      >
                        {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() =>
                          void patchSingleProduct(product.id, {
                            catalog_featured: !Boolean(product.catalog_featured),
                          })
                        }
                      >
                        <Star
                          className={cn(
                            "h-4 w-4",
                            product.catalog_featured ? "fill-violet-700 text-violet-700" : "text-muted-foreground"
                          )}
                        />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === "personalization" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-xl font-semibold">
              Personalização do catálogo
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ajuste os textos e as cores principais da experiência pública.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <Label>Título do catálogo</Label>
              <Input
                value={settings.catalog_title || ""}
                onChange={(event) => setSettings((prev) => ({ ...prev, catalog_title: event.target.value }))}
                className="border-border"
                placeholder="Ex: Catálogo da loja"
              />

              <Label>Descrição</Label>
              <Textarea
                rows={4}
                value={settings.catalog_description || ""}
                onChange={(event) => setSettings((prev) => ({ ...prev, catalog_description: event.target.value }))}
                className="border-border"
                placeholder="Resumo para SEO e compartilhamento"
              />

              <Label>Texto do botao principal</Label>
              <Input
                value={settings.catalog_button_text || ""}
                onChange={(event) => setSettings((prev) => ({ ...prev, catalog_button_text: event.target.value }))}
                className="border-border"
                placeholder="Comprar agora"
              />

              <Label>Link de contato</Label>
              <Input
                value={settings.catalog_contact_url || ""}
                onChange={(event) => setSettings((prev) => ({ ...prev, catalog_contact_url: event.target.value }))}
                className="border-border"
                placeholder="https://wa.me/55..."
              />

              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-semibold">Exibir preços</p>
                  <p className="text-xs text-muted-foreground">Mostra valores no catálogo público.</p>
                </div>
                <Switch
                  checked={Boolean(settings.catalog_show_prices ?? true)}
                  onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, catalog_show_prices: checked }))}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-semibold">Exibir contato</p>
                  <p className="text-xs text-muted-foreground">Habilita atalho para contato rápido.</p>
                </div>
                <Switch
                  checked={Boolean(settings.catalog_show_contact ?? true)}
                  onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, catalog_show_contact: checked }))}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <h3 className="text-lg font-semibold">
                Cores principais
              </h3>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <Label>Cor primaria</Label>
                  <Input
                    type="color"
                    value={settings.catalog_primary_color || "#2563eb"}
                    onChange={(event) => setSettings((prev) => ({ ...prev, catalog_primary_color: event.target.value }))}
                    className="h-11 border-border p-1"
                  />
                </div>
                <div>
                  <Label>Cor secundaria</Label>
                  <Input
                    type="color"
                    value={settings.catalog_secondary_color || "#1d4ed8"}
                    onChange={(event) =>
                      setSettings((prev) => ({ ...prev, catalog_secondary_color: event.target.value }))
                    }
                    className="h-11 border-border p-1"
                  />
                </div>
                <div>
                  <Label>Cor do texto</Label>
                  <Input
                    type="color"
                    value={settings.catalog_text_color || "#1a1814"}
                    onChange={(event) => setSettings((prev) => ({ ...prev, catalog_text_color: event.target.value }))}
                    className="h-11 border-border p-1"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="text-sm font-semibold">Preview rápido</p>
                <div className="mt-3 rounded-xl border border-border bg-white p-4">
                  <p className="text-base font-semibold" title={settings.catalog_title || ""}>
                    {settings.catalog_title || "Título do catálogo"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground" title={settings.catalog_description || ""}>
                    {settings.catalog_description || "Descrição do catálogo público"}
                  </p>
                  <button
                    type="button"
                    className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white"
                    style={{ backgroundColor: settings.catalog_primary_color || "#2563eb" }}
                  >
                    {settings.catalog_button_text || "Botao principal"}
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={saveSettings} disabled={savingSettings || loadingSettings}>
                  {savingSettings ? "Salvando..." : "Salvar personalização"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}



