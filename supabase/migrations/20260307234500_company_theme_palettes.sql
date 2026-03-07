alter table public.company_theme
  add column if not exists light_palette jsonb,
  add column if not exists dark_palette jsonb;

update public.company_theme
set light_palette = jsonb_build_object(
  'primary_color', coalesce(primary_color, '#2563eb'),
  'secondary_color', coalesce(secondary_color, '#1e293b'),
  'background_color', coalesce(background_color, '#f8fafc'),
  'text_color', coalesce(text_color, '#0f172a'),
  'button_color', coalesce(button_color, primary_color, '#2563eb'),
  'button_hover_color', coalesce(button_hover_color, '#1d4ed8'),
  'menu_hover_color', coalesce(menu_hover_color, '#dbeafe')
)
where light_palette is null;

update public.company_theme
set dark_palette = jsonb_build_object(
  'primary_color', coalesce(primary_color, '#60a5fa'),
  'secondary_color', '#0f172a',
  'background_color', '#020617',
  'text_color', '#f8fafc',
  'button_color', coalesce(button_color, primary_color, '#60a5fa'),
  'button_hover_color', coalesce(button_hover_color, '#3b82f6'),
  'menu_hover_color', '#1e293b'
)
where dark_palette is null;

alter table public.company_theme
  alter column light_palette set default jsonb_build_object(
    'primary_color', '#2563eb',
    'secondary_color', '#1e293b',
    'background_color', '#f8fafc',
    'text_color', '#0f172a',
    'button_color', '#2563eb',
    'button_hover_color', '#1d4ed8',
    'menu_hover_color', '#dbeafe'
  ),
  alter column dark_palette set default jsonb_build_object(
    'primary_color', '#60a5fa',
    'secondary_color', '#0f172a',
    'background_color', '#020617',
    'text_color', '#f8fafc',
    'button_color', '#60a5fa',
    'button_hover_color', '#3b82f6',
    'menu_hover_color', '#1e293b'
  );

alter table public.company_theme
  alter column light_palette set not null,
  alter column dark_palette set not null;
