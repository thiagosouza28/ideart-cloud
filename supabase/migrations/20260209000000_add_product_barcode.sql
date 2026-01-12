alter table public.products
add column if not exists barcode text;

create unique index if not exists products_company_id_barcode_key
on public.products (company_id, barcode)
where barcode is not null;
