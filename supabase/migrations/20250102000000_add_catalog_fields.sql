-- Add catalog fields for products and companies

alter table public.products
  add column if not exists catalog_enabled boolean not null default true,
  add column if not exists catalog_featured boolean not null default false,
  add column if not exists catalog_min_order integer not null default 1,
  add column if not exists catalog_price numeric(10,2),
  add column if not exists catalog_short_description text,
  add column if not exists catalog_long_description text,
  add column if not exists catalog_sort_order integer not null default 0,
  add column if not exists slug text;

create index if not exists products_catalog_enabled_idx
  on public.products (catalog_enabled);

create index if not exists products_catalog_featured_idx
  on public.products (catalog_featured);

create index if not exists products_catalog_sort_order_idx
  on public.products (catalog_sort_order);

create unique index if not exists products_company_slug_idx
  on public.products (company_id, slug)
  where slug is not null;

alter table public.companies
  add column if not exists catalog_title text,
  add column if not exists catalog_description text,
  add column if not exists catalog_share_image_url text,
  add column if not exists catalog_button_text text,
  add column if not exists catalog_show_prices boolean not null default true,
  add column if not exists catalog_show_contact boolean not null default true,
  add column if not exists catalog_contact_url text,
  add column if not exists catalog_font text,
  add column if not exists catalog_columns_mobile integer not null default 2,
  add column if not exists catalog_columns_desktop integer not null default 4;
