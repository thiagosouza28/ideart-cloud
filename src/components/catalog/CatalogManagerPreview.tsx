import {
  ImagePlus,
  LayoutGrid,
  List,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  ShoppingCart,
} from "lucide-react";
import { ensurePublicStorageUrl } from "@/lib/storage";
import type { CatalogSettingsData } from "@/lib/catalogSettings";

type PreviewCompany = {
  name?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  logo_url?: string | null;
};

type PreviewProduct = {
  name?: string | null;
  image_url?: string | null;
  catalog_price?: number | null;
};

type CatalogManagerPreviewProps = {
  settings: CatalogSettingsData;
  company?: PreviewCompany | null;
  product?: PreviewProduct | null;
};

const withAlpha = (value: string | null | undefined, alpha: string, fallback: string) => {
  const safe = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(safe) ? `${safe}${alpha}` : fallback;
};

const formatCurrency = (value: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));

export function CatalogManagerPreview({
  settings,
  company,
  product,
}: CatalogManagerPreviewProps) {
  const previewLogoUrl = ensurePublicStorageUrl("product-images", company?.logo_url || null);
  const previewProductImage = ensurePublicStorageUrl("product-images", product?.image_url || null);
  const brandName = company?.name || "Sua loja";
  const brandLocation = [company?.city, company?.state].filter(Boolean).join(", ") || "Sua cidade, UF";
  const brandInitials =
    brandName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0])
      .join("")
      .toUpperCase() || "SL";
  const headerSubtle = withAlpha(settings.header_text_color, "BF", "rgba(255,255,255,0.78)");
  const footerSubtle = withAlpha(settings.footer_text_color, "B3", "rgba(255,255,255,0.72)");
  const toolbarBorder = withAlpha(settings.header_text_color, "40", "rgba(255,255,255,0.25)");
  const toolbarSurface = withAlpha(settings.header_text_color, "12", "rgba(255,255,255,0.08)");
  const footerBorder = withAlpha(settings.footer_text_color, "2E", "rgba(255,255,255,0.18)");
  const cardTextMuted = withAlpha(settings.text_color, "A6", "rgba(15,23,42,0.66)");

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <p className="text-sm font-semibold">Preview do catálogo</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Modelo do catálogo público para visualizar topo, hero, filtros, card e rodapé.
      </p>

      <div className="mt-4 overflow-hidden rounded-[24px] border border-border bg-[#d9dce3] shadow-sm">
        <div className="min-h-[620px]">
          <div
            className="border-b px-4 py-4 sm:px-5"
            style={{
              backgroundColor: settings.header_bg_color,
              borderBottomColor: toolbarBorder,
              color: settings.header_text_color,
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {previewLogoUrl ? (
                  <img
                    src={previewLogoUrl}
                    alt={brandName}
                    className="h-11 w-11 rounded-full border object-cover"
                    style={{ borderColor: toolbarBorder }}
                  />
                ) : (
                  <span
                    className="grid h-11 w-11 place-items-center rounded-full text-sm font-bold"
                    style={{
                      backgroundColor: settings.button_bg_color,
                      color: settings.button_text_color,
                    }}
                  >
                    {brandInitials}
                  </span>
                )}

                <div className="min-w-0">
                  <p className="truncate text-base font-bold">{brandName}</p>
                  <p className="truncate text-xs" style={{ color: headerSubtle }}>
                    {brandLocation}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <span
                  className="inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-semibold"
                  style={{
                    borderColor: toolbarBorder,
                    backgroundColor: toolbarSurface,
                    color: settings.header_text_color,
                  }}
                >
                  <ShoppingCart className="h-4 w-4" />
                  0 itens
                </span>
                <span
                  className="inline-flex h-9 items-center rounded-xl border px-4 text-sm font-semibold"
                  style={{
                    borderColor: toolbarBorder,
                    backgroundColor: toolbarSurface,
                    color: settings.header_text_color,
                  }}
                >
                  Minha conta
                </span>
                {settings.show_contact && (
                  <span
                    className="inline-flex h-9 items-center gap-2 rounded-xl px-4 text-sm font-semibold"
                    style={{
                      backgroundColor: settings.button_bg_color,
                      color: settings.button_text_color,
                    }}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Falar no WhatsApp
                  </span>
                )}
              </div>
            </div>
          </div>

          <div
            className="relative overflow-hidden px-4 py-6 sm:px-5 sm:py-7"
            style={{
              background: `linear-gradient(115deg, ${settings.header_bg_color} 0%, ${settings.button_bg_color} 100%)`,
              color: settings.header_text_color,
            }}
          >
            <div
              className="absolute inset-0 opacity-35"
              style={{
                backgroundImage:
                  "radial-gradient(circle, rgba(255,255,255,0.24) 1px, transparent 1px)",
                backgroundSize: "16px 16px",
              }}
            />
            <div
              className="absolute -right-12 -top-10 h-36 w-36 rounded-full border"
              style={{ borderColor: withAlpha(settings.header_text_color, "2B", "rgba(255,255,255,0.2)") }}
            />

            <div className="relative z-10 max-w-4xl min-w-0">
              <span
                className="inline-flex rounded-full px-4 py-1.5 text-xs font-semibold"
                style={{
                  backgroundColor: settings.badge_bg_color,
                  color: settings.badge_text_color,
                }}
              >
                Catálogo de produtos
              </span>
              <h3 className="mt-4 break-words text-[32px] font-extrabold leading-none sm:text-[42px]">
                {settings.catalog_title || "Catálogo"}
              </h3>
              <p className="mt-4 max-w-3xl text-sm" style={{ color: headerSubtle }}>
                {settings.catalog_description ||
                  "Explore os itens disponíveis, filtre por categoria e encontre o produto ideal para seu pedido."}
              </p>

              <div
                className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"
                style={{ color: withAlpha(settings.header_text_color, "E0", "rgba(255,255,255,0.88)") }}
              >
                <span className="inline-flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  {company?.phone || "(11) 99999-0000"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {company?.email || "contato@sualoja.com"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {company?.address || "Endereço principal da loja"}
                </span>
              </div>
            </div>
          </div>

          <div className="px-4 py-4 sm:px-5" style={{ backgroundColor: settings.header_bg_color }}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex rounded-full px-4 py-2 text-sm font-semibold"
                  style={{
                    backgroundColor: settings.filter_bg_color,
                    color: settings.filter_text_color,
                  }}
                >
                  Todos (1)
                </span>
                <span
                  className="inline-flex h-10 w-full min-w-0 items-center justify-center rounded-full border px-4 text-sm font-medium sm:w-auto sm:min-w-[130px]"
                  style={{
                    borderColor: settings.button_outline_color,
                    backgroundColor: settings.card_bg_color,
                    color: settings.text_color,
                  }}
                >
                  Buscar...
                </span>
              </div>

              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <span
                  className="inline-flex h-10 w-full min-w-0 items-center rounded-xl border px-4 text-sm sm:w-auto sm:min-w-[170px]"
                  style={{
                    borderColor: settings.button_outline_color,
                    backgroundColor: settings.card_bg_color,
                    color: cardTextMuted,
                  }}
                >
                  <Search className="mr-2 h-4 w-4" />
                  Buscar produto...
                </span>

                <span className="inline-flex overflow-hidden rounded-xl border" style={{ borderColor: settings.button_outline_color }}>
                  <span
                    className="grid h-10 w-10 place-items-center border-r"
                    style={{
                      borderColor: settings.button_outline_color,
                      backgroundColor:
                        settings.catalog_layout === "grid"
                          ? settings.filter_bg_color
                          : settings.card_bg_color,
                      color:
                        settings.catalog_layout === "grid"
                          ? settings.filter_text_color
                          : settings.text_color,
                    }}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </span>
                  <span
                    className="grid h-10 w-10 place-items-center"
                    style={{
                      backgroundColor:
                        settings.catalog_layout === "list"
                          ? settings.filter_bg_color
                          : settings.card_bg_color,
                      color:
                        settings.catalog_layout === "list"
                          ? settings.filter_text_color
                          : settings.text_color,
                    }}
                  >
                    <List className="h-4 w-4" />
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[#d9dce3] px-4 py-6 sm:px-5">
            <div
              className={`rounded-[22px] border ${settings.catalog_layout === "grid" ? "max-w-[360px]" : ""}`}
              style={{
                backgroundColor: settings.card_bg_color,
                borderColor: settings.card_border_color,
                boxShadow: "0 12px 24px rgba(15, 23, 42, 0.06)",
              }}
            >
              <div
                className={`grid gap-0 ${settings.catalog_layout === "grid" ? "md:grid-cols-1" : "md:grid-cols-[120px_1fr_180px]"}`}
              >
                <div
                  className={`flex items-center justify-center ${settings.catalog_layout === "grid" ? "h-[240px] border-b" : "min-h-[150px] border-r"}`}
                  style={{
                    backgroundColor: withAlpha(settings.card_bg_color, "F2", settings.card_bg_color),
                    borderColor: settings.card_border_color,
                  }}
                >
                  {previewProductImage ? (
                    <img
                      src={previewProductImage}
                      alt={product?.name || "Produto"}
                      className={`w-full object-contain ${settings.catalog_layout === "grid" ? "h-full p-4" : "h-full max-h-[140px] p-3"}`}
                    />
                  ) : (
                    <ImagePlus className="h-10 w-10" style={{ color: cardTextMuted }} />
                  )}
                </div>

                <div className="space-y-4 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium" style={{ color: cardTextMuted }}>
                      Categoria principal
                    </span>
                    <span
                      className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{
                        backgroundColor: settings.badge_bg_color,
                        color: settings.badge_text_color,
                      }}
                    >
                      Personalizado
                    </span>
                  </div>

                  <div>
                    <p className="text-base font-semibold" style={{ color: settings.text_color }}>
                      {product?.name || "Produto exemplo"}
                    </p>
                    <p className="mt-2 text-sm leading-6" style={{ color: cardTextMuted }}>
                      Item de demonstração para mostrar como o produto vai aparecer no catálogo público.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm" style={{ color: cardTextMuted }}>
                      Tempo de produção: 3 dias
                    </p>
                    <p className="text-[30px] font-bold" style={{ color: settings.price_color }}>
                      {settings.show_prices ? formatCurrency(product?.catalog_price ?? 3.5) : "Preço sob consulta"}
                    </p>
                  </div>
                </div>

                <div className={`flex p-4 ${settings.catalog_layout === "grid" ? "justify-start pt-0" : "items-end justify-end lg:items-center"}`}>
                  <span
                    className="inline-flex rounded-2xl px-5 py-3 text-sm font-semibold"
                    style={{
                      backgroundColor: settings.button_bg_color,
                      color: settings.button_text_color,
                    }}
                  >
                    {settings.button_text || "Comprar agora"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            className="px-5 py-5"
            style={{
              backgroundColor: settings.footer_bg_color,
              color: settings.footer_text_color,
            }}
          >
            <div
              className="flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-center lg:justify-between"
              style={{ borderBottomColor: footerBorder }}
            >
              <div className="flex min-w-0 items-center gap-3">
                {previewLogoUrl ? (
                  <img
                    src={previewLogoUrl}
                    alt={brandName}
                    className="h-10 w-10 rounded-full border object-cover"
                    style={{ borderColor: footerBorder }}
                  />
                ) : (
                  <span
                    className="grid h-10 w-10 place-items-center rounded-full text-sm font-bold"
                    style={{
                      backgroundColor: settings.button_bg_color,
                      color: settings.button_text_color,
                    }}
                  >
                    {brandInitials}
                  </span>
                )}

                <div className="min-w-0">
                  <p className="truncate text-base font-bold">{brandName}</p>
                  <p className="truncate text-xs" style={{ color: footerSubtle }}>
                    {brandLocation}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex h-9 items-center rounded-xl border px-4 text-sm font-semibold"
                  style={{
                    borderColor: footerBorder,
                    backgroundColor: withAlpha(settings.footer_text_color, "12", "rgba(255,255,255,0.08)"),
                    color: settings.footer_text_color,
                  }}
                >
                  Ligar
                </span>
                <span
                  className="inline-flex h-9 items-center rounded-xl border px-4 text-sm font-semibold"
                  style={{
                    borderColor: footerBorder,
                    backgroundColor: withAlpha(settings.footer_text_color, "12", "rgba(255,255,255,0.08)"),
                    color: settings.footer_text_color,
                  }}
                >
                  E-mail
                </span>
                {settings.show_contact && (
                  <span
                    className="inline-flex h-9 items-center gap-2 rounded-xl px-4 text-sm font-semibold"
                    style={{
                      backgroundColor: settings.button_bg_color,
                      color: settings.button_text_color,
                    }}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Falar no WhatsApp
                  </span>
                )}
              </div>
            </div>

            <p className="pt-4 text-center text-xs" style={{ color: footerSubtle }}>
              © {new Date().getFullYear()} {brandName}. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
