alter table public.companies
  add column if not exists role_module_permissions jsonb not null default '{}'::jsonb;

comment on column public.companies.role_module_permissions is
  'Permissoes de modulos por perfil da empresa (JSON).';
