-- Add product colors and personalization flag for catalog customization.

alter table public.products
  add column if not exists product_colors jsonb not null default '[]'::jsonb;

alter table public.products
  add column if not exists personalization_enabled boolean not null default false;

do $$
begin
  alter table public.products
    add constraint products_product_colors_is_array
    check (jsonb_typeof(product_colors) = 'array');
exception
  when duplicate_object then null;
end $$;
