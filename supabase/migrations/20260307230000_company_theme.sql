create table if not exists public.company_theme (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null unique references public.companies(id) on delete cascade,
  theme_mode text not null default 'light',
  primary_color text not null default '#2563eb',
  secondary_color text not null default '#1e293b',
  background_color text not null default '#f8fafc',
  text_color text not null default '#0f172a',
  button_color text not null default '#2563eb',
  button_hover_color text not null default '#1d4ed8',
  menu_hover_color text not null default '#dbeafe',
  border_radius text not null default 'medium',
  button_style text not null default 'modern',
  layout_density text not null default 'normal',
  font_family text not null default 'Inter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_theme_mode_check check (theme_mode in ('light', 'dark', 'system')),
  constraint company_theme_radius_check check (border_radius in ('small', 'medium', 'large')),
  constraint company_theme_button_style_check check (button_style in ('soft', 'modern', 'solid', 'outline')),
  constraint company_theme_layout_density_check check (layout_density in ('compact', 'normal', 'spacious')),
  constraint company_theme_font_family_check check (font_family in ('Inter', 'Roboto', 'Poppins', 'Open Sans'))
);

alter table public.company_theme enable row level security;

drop trigger if exists update_company_theme_updated_at on public.company_theme;
create trigger update_company_theme_updated_at
before update on public.company_theme
for each row execute function public.update_updated_at();

create or replace function public.ensure_company_theme()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  insert into public.company_theme (store_id)
  values (new.id)
  on conflict (store_id) do nothing;

  return new;
end;
$$;

drop trigger if exists ensure_company_theme_on_companies on public.companies;
create trigger ensure_company_theme_on_companies
after insert on public.companies
for each row execute function public.ensure_company_theme();

insert into public.company_theme (store_id)
select c.id
from public.companies c
on conflict (store_id) do nothing;

drop policy if exists "Company users can view own company theme" on public.company_theme;
create policy "Company users can view own company theme"
on public.company_theme
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.company_id = company_theme.store_id
  )
  or exists (
    select 1
    from public.company_users cu
    where cu.user_id = auth.uid()
      and cu.company_id = company_theme.store_id
  )
);

drop policy if exists "Company admins can manage own company theme" on public.company_theme;
create policy "Company admins can manage own company theme"
on public.company_theme
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where p.id = auth.uid()
      and p.company_id = company_theme.store_id
      and ur.role = 'admin'::public.app_role
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where p.id = auth.uid()
      and p.company_id = company_theme.store_id
      and ur.role = 'admin'::public.app_role
  )
);

grant select, insert, update on public.company_theme to authenticated;
