-- Add dashboard quick access modules to companies

alter table public.companies
  add column if not exists dashboard_quick_access text[] default array[
    'pedidos',
    'producao',
    'pdv',
    'fluxo_caixa',
    'relatorios',
    'kanban',
    'produtos',
    'estoque'
  ]::text[];

update public.companies
set dashboard_quick_access = array[
  'pedidos',
  'producao',
  'pdv',
  'fluxo_caixa',
  'relatorios',
  'kanban',
  'produtos',
  'estoque'
]::text[]
where dashboard_quick_access is null;

alter table public.companies
  alter column dashboard_quick_access set not null;

