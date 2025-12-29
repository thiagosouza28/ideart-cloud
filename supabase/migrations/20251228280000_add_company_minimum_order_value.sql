-- Add minimum order value configuration to companies.

alter table public.companies
  add column if not exists minimum_order_value numeric(10,2) default 0;
