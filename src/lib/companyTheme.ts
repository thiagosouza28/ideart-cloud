import type {
  CompanyTheme,
  CompanyThemeBorderRadius,
  CompanyThemeFontFamily,
  CompanyThemeLayoutDensity,
  CompanyThemeMode,
  CompanyThemePalette,
  CompanyThemePaletteMode,
} from '@/types/database';

type ResolvedThemeMode = Exclude<CompanyThemeMode, 'system'>;

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const THEME_CSS_VARIABLES = [
  '--app-font-family',
  '--app-button-bg',
  '--app-button-hover',
  '--app-button-foreground',
  '--app-button-soft-bg',
  '--app-button-soft-hover',
  '--app-button-outline-border',
  '--app-menu-hover',
  '--app-card-radius',
  '--app-control-radius',
  '--app-button-radius',
  '--app-dialog-radius',
  '--app-card-padding',
  '--app-dialog-padding',
  '--app-control-height',
  '--app-control-padding-x',
  '--app-control-padding-y',
  '--app-button-height',
  '--app-button-padding-x',
  '--app-button-padding-y',
  '--app-button-sm-height',
  '--app-button-sm-padding-x',
  '--app-button-sm-padding-y',
  '--app-button-lg-height',
  '--app-button-lg-padding-x',
  '--app-button-lg-padding-y',
  '--app-button-icon-size',
  '--app-table-cell-px',
  '--app-table-cell-py',
  '--app-sidebar-item-radius',
  '--app-sidebar-item-px',
  '--app-sidebar-item-py',
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--success',
  '--success-foreground',
  '--warning',
  '--warning-foreground',
  '--info',
  '--info-foreground',
  '--border',
  '--input',
  '--ring',
  '--sidebar-background',
  '--sidebar-foreground',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
  '--sidebar-border',
  '--sidebar-ring',
  '--sidebar-muted',
  '--radius',
] as const;

const FONT_STACKS: Record<CompanyThemeFontFamily, string> = {
  Inter: '"Inter", "Segoe UI", sans-serif',
  Roboto: '"Roboto", "Segoe UI", sans-serif',
  Poppins: '"Poppins", "Segoe UI", sans-serif',
  'Open Sans': '"Open Sans", "Segoe UI", sans-serif',
};

const RADIUS_PRESETS: Record<
  CompanyThemeBorderRadius,
  {
    base: string;
    card: string;
    control: string;
    button: string;
    dialog: string;
    sidebarItem: string;
  }
> = {
  small: {
    base: '0.375rem',
    card: '0.5rem',
    control: '0.375rem',
    button: '0.5rem',
    dialog: '0.75rem',
    sidebarItem: '0.75rem',
  },
  medium: {
    base: '0.75rem',
    card: '1rem',
    control: '0.75rem',
    button: '0.875rem',
    dialog: '1rem',
    sidebarItem: '1rem',
  },
  large: {
    base: '1.25rem',
    card: '1.5rem',
    control: '1rem',
    button: '1.125rem',
    dialog: '1.5rem',
    sidebarItem: '1.25rem',
  },
};

const DENSITY_PRESETS: Record<
  CompanyThemeLayoutDensity,
  {
    cardPadding: string;
    dialogPadding: string;
    controlHeight: string;
    controlPaddingX: string;
    controlPaddingY: string;
    buttonHeight: string;
    buttonPaddingX: string;
    buttonPaddingY: string;
    buttonSmHeight: string;
    buttonSmPaddingX: string;
    buttonSmPaddingY: string;
    buttonLgHeight: string;
    buttonLgPaddingX: string;
    buttonLgPaddingY: string;
    buttonIconSize: string;
    tableCellPx: string;
    tableCellPy: string;
    sidebarItemPx: string;
    sidebarItemPy: string;
  }
> = {
  compact: {
    cardPadding: '1rem',
    dialogPadding: '1rem',
    controlHeight: '2.5rem',
    controlPaddingX: '0.75rem',
    controlPaddingY: '0.5rem',
    buttonHeight: '2.5rem',
    buttonPaddingX: '0.875rem',
    buttonPaddingY: '0.5rem',
    buttonSmHeight: '2.125rem',
    buttonSmPaddingX: '0.75rem',
    buttonSmPaddingY: '0.375rem',
    buttonLgHeight: '2.875rem',
    buttonLgPaddingX: '1.25rem',
    buttonLgPaddingY: '0.625rem',
    buttonIconSize: '2.5rem',
    tableCellPx: '0.75rem',
    tableCellPy: '0.625rem',
    sidebarItemPx: '0.75rem',
    sidebarItemPy: '0.625rem',
  },
  normal: {
    cardPadding: '1.5rem',
    dialogPadding: '1.5rem',
    controlHeight: '2.75rem',
    controlPaddingX: '0.875rem',
    controlPaddingY: '0.625rem',
    buttonHeight: '2.75rem',
    buttonPaddingX: '1rem',
    buttonPaddingY: '0.625rem',
    buttonSmHeight: '2.375rem',
    buttonSmPaddingX: '0.875rem',
    buttonSmPaddingY: '0.5rem',
    buttonLgHeight: '3rem',
    buttonLgPaddingX: '1.5rem',
    buttonLgPaddingY: '0.75rem',
    buttonIconSize: '2.75rem',
    tableCellPx: '1rem',
    tableCellPy: '0.875rem',
    sidebarItemPx: '0.875rem',
    sidebarItemPy: '0.75rem',
  },
  spacious: {
    cardPadding: '1.75rem',
    dialogPadding: '1.75rem',
    controlHeight: '3rem',
    controlPaddingX: '1rem',
    controlPaddingY: '0.75rem',
    buttonHeight: '3rem',
    buttonPaddingX: '1.125rem',
    buttonPaddingY: '0.75rem',
    buttonSmHeight: '2.625rem',
    buttonSmPaddingX: '1rem',
    buttonSmPaddingY: '0.625rem',
    buttonLgHeight: '3.25rem',
    buttonLgPaddingX: '1.75rem',
    buttonLgPaddingY: '0.875rem',
    buttonIconSize: '3rem',
    tableCellPx: '1.125rem',
    tableCellPy: '1rem',
    sidebarItemPx: '1rem',
    sidebarItemPy: '0.875rem',
  },
};

const defaultThemeValues = {
  theme_mode: 'light' as CompanyThemeMode,
  border_radius: 'medium' as CompanyThemeBorderRadius,
  button_style: 'modern' as CompanyTheme['button_style'],
  layout_density: 'normal' as CompanyThemeLayoutDensity,
  font_family: 'Inter' as CompanyThemeFontFamily,
};

const defaultLightPalette: CompanyThemePalette = {
  primary_color: '#2563eb',
  secondary_color: '#1e293b',
  background_color: '#f8fafc',
  text_color: '#0f172a',
  button_color: '#2563eb',
  button_hover_color: '#1d4ed8',
  menu_hover_color: '#dbeafe',
};

const defaultDarkPalette: CompanyThemePalette = {
  primary_color: '#60a5fa',
  secondary_color: '#0f172a',
  background_color: '#020617',
  text_color: '#f8fafc',
  button_color: '#60a5fa',
  button_hover_color: '#3b82f6',
  menu_hover_color: '#1e293b',
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const normalizeShortHex = (value: string) => {
  if (value.length !== 4) return value;
  const [, r, g, b] = value;
  return `#${r}${r}${g}${g}${b}${b}`;
};

type RgbColor = { r: number; g: number; b: number };

const hexToRgb = (value: string): RgbColor => {
  const normalized = normalizeHexColor(value);
  const sanitized = normalizeShortHex(normalized).slice(1);
  return {
    r: Number.parseInt(sanitized.slice(0, 2), 16),
    g: Number.parseInt(sanitized.slice(2, 4), 16),
    b: Number.parseInt(sanitized.slice(4, 6), 16),
  };
};

const rgbToHex = ({ r, g, b }: RgbColor) =>
  `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;

const componentToLinear = (value: number) => {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};

const getRelativeLuminance = (value: string) => {
  const { r, g, b } = hexToRgb(value);
  return 0.2126 * componentToLinear(r) + 0.7152 * componentToLinear(g) + 0.0722 * componentToLinear(b);
};

const getContrastTextColor = (value: string) =>
  getRelativeLuminance(value) > 0.55 ? '#0f172a' : '#f8fafc';

const mixColors = (base: string, target: string, weight: number) => {
  const clamped = clamp(weight, 0, 1);
  const baseRgb = hexToRgb(base);
  const targetRgb = hexToRgb(target);

  return rgbToHex({
    r: baseRgb.r + (targetRgb.r - baseRgb.r) * clamped,
    g: baseRgb.g + (targetRgb.g - baseRgb.g) * clamped,
    b: baseRgb.b + (targetRgb.b - baseRgb.b) * clamped,
  });
};

const rgbToHsl = ({ r, g, b }: RgbColor) => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  let hue = 0;
  let saturation = 0;
  const lightness = (max + min) / 2;
  const difference = max - min;

  if (difference !== 0) {
    saturation =
      lightness > 0.5 ? difference / (2 - max - min) : difference / (max + min);

    switch (max) {
      case red:
        hue = (green - blue) / difference + (green < blue ? 6 : 0);
        break;
      case green:
        hue = (blue - red) / difference + 2;
        break;
      default:
        hue = (red - green) / difference + 4;
        break;
    }

    hue /= 6;
  }

  return {
    h: Math.round(hue * 360),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
};

const hexToHslToken = (value: string) => {
  const { h, s, l } = rgbToHsl(hexToRgb(value));
  return `${h} ${s}% ${l}%`;
};

export const normalizeHexColor = (value?: string | null, fallback = '#2563eb') => {
  const candidate = value?.trim() || '';
  if (!HEX_COLOR_PATTERN.test(candidate)) return fallback;
  return normalizeShortHex(candidate.toLowerCase());
};

const getDefaultPalette = (mode: CompanyThemePaletteMode): CompanyThemePalette =>
  mode === 'dark' ? defaultDarkPalette : defaultLightPalette;

const buildLegacyPalette = (
  value: Partial<CompanyTheme> | null | undefined,
  mode: CompanyThemePaletteMode,
): CompanyThemePalette => {
  const fallback = getDefaultPalette(mode);
  const source = value ?? {};

  return {
    primary_color: normalizeHexColor(source.primary_color, fallback.primary_color),
    secondary_color: normalizeHexColor(source.secondary_color, fallback.secondary_color),
    background_color: normalizeHexColor(source.background_color, fallback.background_color),
    text_color: normalizeHexColor(source.text_color, fallback.text_color),
    button_color: normalizeHexColor(source.button_color, source.primary_color || fallback.button_color),
    button_hover_color: normalizeHexColor(
      source.button_hover_color,
      source.button_color || source.primary_color || fallback.button_hover_color,
    ),
    menu_hover_color: normalizeHexColor(source.menu_hover_color, fallback.menu_hover_color),
  };
};

export const normalizeCompanyThemePalette = (
  value: Partial<CompanyThemePalette> | null | undefined,
  fallbackPalette: CompanyThemePalette,
): CompanyThemePalette => {
  const source = value ?? {};

  return {
    primary_color: normalizeHexColor(source.primary_color, fallbackPalette.primary_color),
    secondary_color: normalizeHexColor(source.secondary_color, fallbackPalette.secondary_color),
    background_color: normalizeHexColor(source.background_color, fallbackPalette.background_color),
    text_color: normalizeHexColor(source.text_color, fallbackPalette.text_color),
    button_color: normalizeHexColor(source.button_color, source.primary_color || fallbackPalette.button_color),
    button_hover_color: normalizeHexColor(
      source.button_hover_color,
      source.button_color || source.primary_color || fallbackPalette.button_hover_color,
    ),
    menu_hover_color: normalizeHexColor(source.menu_hover_color, fallbackPalette.menu_hover_color),
  };
};

export const getCompanyThemePalette = (
  theme: Partial<CompanyTheme> | null | undefined,
  mode: CompanyThemePaletteMode,
): CompanyThemePalette => {
  const fallbackPalette = buildLegacyPalette(theme, mode);
  const sourcePalette = mode === 'dark' ? theme?.dark_palette : theme?.light_palette;
  return normalizeCompanyThemePalette(sourcePalette, fallbackPalette);
};

export const setCompanyThemePalette = (
  theme: CompanyTheme,
  mode: CompanyThemePaletteMode,
  palette: CompanyThemePalette,
): CompanyTheme => {
  const normalizedPalette = normalizeCompanyThemePalette(palette, getDefaultPalette(mode));
  const nextTheme = {
    ...theme,
    [mode === 'dark' ? 'dark_palette' : 'light_palette']: normalizedPalette,
  } as CompanyTheme;

  const lightPalette = getCompanyThemePalette(nextTheme, 'light');

  return {
    ...nextTheme,
    primary_color: lightPalette.primary_color,
    secondary_color: lightPalette.secondary_color,
    background_color: lightPalette.background_color,
    text_color: lightPalette.text_color,
    button_color: lightPalette.button_color,
    button_hover_color: lightPalette.button_hover_color,
    menu_hover_color: lightPalette.menu_hover_color,
  };
};

export const defaultCompanyTheme = (storeId = ''): CompanyTheme => ({
  ...setCompanyThemePalette(
    {
      store_id: storeId,
      ...defaultThemeValues,
      light_palette: defaultLightPalette,
      dark_palette: defaultDarkPalette,
      primary_color: defaultLightPalette.primary_color,
      secondary_color: defaultLightPalette.secondary_color,
      background_color: defaultLightPalette.background_color,
      text_color: defaultLightPalette.text_color,
      button_color: defaultLightPalette.button_color,
      button_hover_color: defaultLightPalette.button_hover_color,
      menu_hover_color: defaultLightPalette.menu_hover_color,
    },
    'dark',
    defaultDarkPalette,
  ),
});

export const normalizeCompanyTheme = (
  value: Partial<CompanyTheme> | null | undefined,
  storeId: string,
): CompanyTheme => {
  const source = value ?? {};
  const themeMode: CompanyThemeMode =
    source.theme_mode === 'dark' || source.theme_mode === 'system' ? source.theme_mode : 'light';
  const borderRadius: CompanyThemeBorderRadius =
    source.border_radius === 'small' || source.border_radius === 'large'
      ? source.border_radius
      : 'medium';
  const buttonStyle: CompanyTheme['button_style'] =
    source.button_style === 'soft' ||
    source.button_style === 'solid' ||
    source.button_style === 'outline'
      ? source.button_style
      : 'modern';
  const layoutDensity: CompanyThemeLayoutDensity =
    source.layout_density === 'compact' || source.layout_density === 'spacious'
      ? source.layout_density
      : 'normal';
  const fontFamily: CompanyThemeFontFamily =
    source.font_family === 'Roboto' ||
    source.font_family === 'Poppins' ||
    source.font_family === 'Open Sans'
      ? source.font_family
      : 'Inter';
  const lightPalette = getCompanyThemePalette(source, 'light');
  const darkPalette = getCompanyThemePalette(source, 'dark');

  return {
    id: source.id,
    store_id: storeId,
    theme_mode: themeMode,
    light_palette: lightPalette,
    dark_palette: darkPalette,
    primary_color: lightPalette.primary_color,
    secondary_color: lightPalette.secondary_color,
    background_color: lightPalette.background_color,
    text_color: lightPalette.text_color,
    button_color: lightPalette.button_color,
    button_hover_color: lightPalette.button_hover_color,
    menu_hover_color: lightPalette.menu_hover_color,
    border_radius: borderRadius,
    button_style: buttonStyle,
    layout_density: layoutDensity,
    font_family: fontFamily,
    created_at: source.created_at,
    updated_at: source.updated_at,
  };
};

export const resolveThemeMode = (themeMode: CompanyThemeMode): ResolvedThemeMode => {
  if (themeMode === 'light' || themeMode === 'dark') return themeMode;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const getCompanyThemeCssVariables = (
  theme: CompanyTheme,
  resolvedMode = resolveThemeMode(theme.theme_mode),
) => {
  const radius = RADIUS_PRESETS[theme.border_radius];
  const density = DENSITY_PRESETS[theme.layout_density];
  const isDark = resolvedMode === 'dark';
  const palette = getCompanyThemePalette(theme, resolvedMode);

  const background = normalizeHexColor(palette.background_color, getDefaultPalette(resolvedMode).background_color);
  const text = normalizeHexColor(palette.text_color, getDefaultPalette(resolvedMode).text_color);
  const primary = normalizeHexColor(palette.primary_color, getDefaultPalette(resolvedMode).primary_color);
  const secondary = normalizeHexColor(palette.secondary_color, getDefaultPalette(resolvedMode).secondary_color);
  const button = normalizeHexColor(palette.button_color, primary);
  const buttonHover = normalizeHexColor(palette.button_hover_color, mixColors(button, '#000000', 0.15));
  const menuHover = normalizeHexColor(
    palette.menu_hover_color,
    isDark ? mixColors(secondary, '#ffffff', 0.14) : mixColors(primary, '#ffffff', 0.82),
  );

  const card = isDark ? mixColors(background, '#ffffff', 0.08) : mixColors(background, '#ffffff', 0.82);
  const popover = isDark ? mixColors(background, '#ffffff', 0.06) : mixColors(background, '#ffffff', 0.92);
  const secondarySurface = isDark
    ? mixColors(secondary, background, 0.5)
    : mixColors(secondary, '#ffffff', 0.76);
  const muted = isDark ? mixColors(background, '#ffffff', 0.12) : mixColors(background, '#0f172a', 0.03);
  const mutedForeground = isDark ? mixColors(text, '#ffffff', 0.22) : mixColors(text, '#64748b', 0.38);
  const border = isDark ? mixColors(background, '#ffffff', 0.18) : mixColors(background, text, 0.12);
  const input = isDark ? mixColors(background, '#ffffff', 0.16) : mixColors(background, text, 0.08);
  const accent = normalizeHexColor(theme.menu_hover_color, menuHover);
  const sidebarBackground = isDark
    ? mixColors(secondary, '#020617', 0.64)
    : mixColors(secondary, '#ffffff', 0.88);
  const sidebarBorder = isDark
    ? mixColors(sidebarBackground, '#ffffff', 0.12)
    : mixColors(sidebarBackground, '#0f172a', 0.1);

  return {
    '--app-font-family': FONT_STACKS[theme.font_family],
    '--app-button-bg': button,
    '--app-button-hover': buttonHover,
    '--app-button-foreground': getContrastTextColor(button),
    '--app-button-soft-bg': isDark ? mixColors(button, background, 0.74) : mixColors(button, '#ffffff', 0.84),
    '--app-button-soft-hover': isDark ? mixColors(button, background, 0.62) : mixColors(button, '#ffffff', 0.72),
    '--app-button-outline-border': button,
    '--app-menu-hover': menuHover,
    '--app-card-radius': radius.card,
    '--app-control-radius': radius.control,
    '--app-button-radius': radius.button,
    '--app-dialog-radius': radius.dialog,
    '--app-sidebar-item-radius': radius.sidebarItem,
    '--app-card-padding': density.cardPadding,
    '--app-dialog-padding': density.dialogPadding,
    '--app-control-height': density.controlHeight,
    '--app-control-padding-x': density.controlPaddingX,
    '--app-control-padding-y': density.controlPaddingY,
    '--app-button-height': density.buttonHeight,
    '--app-button-padding-x': density.buttonPaddingX,
    '--app-button-padding-y': density.buttonPaddingY,
    '--app-button-sm-height': density.buttonSmHeight,
    '--app-button-sm-padding-x': density.buttonSmPaddingX,
    '--app-button-sm-padding-y': density.buttonSmPaddingY,
    '--app-button-lg-height': density.buttonLgHeight,
    '--app-button-lg-padding-x': density.buttonLgPaddingX,
    '--app-button-lg-padding-y': density.buttonLgPaddingY,
    '--app-button-icon-size': density.buttonIconSize,
    '--app-table-cell-px': density.tableCellPx,
    '--app-table-cell-py': density.tableCellPy,
    '--app-sidebar-item-px': density.sidebarItemPx,
    '--app-sidebar-item-py': density.sidebarItemPy,
    '--background': hexToHslToken(background),
    '--foreground': hexToHslToken(text),
    '--card': hexToHslToken(card),
    '--card-foreground': hexToHslToken(text),
    '--popover': hexToHslToken(popover),
    '--popover-foreground': hexToHslToken(text),
    '--primary': hexToHslToken(primary),
    '--primary-foreground': hexToHslToken(getContrastTextColor(primary)),
    '--secondary': hexToHslToken(secondarySurface),
    '--secondary-foreground': hexToHslToken(getContrastTextColor(secondarySurface)),
    '--muted': hexToHslToken(muted),
    '--muted-foreground': hexToHslToken(mutedForeground),
    '--accent': hexToHslToken(accent),
    '--accent-foreground': hexToHslToken(getContrastTextColor(accent)),
    '--destructive': '0 84% 60%',
    '--destructive-foreground': '0 0% 100%',
    '--success': '142 76% 36%',
    '--success-foreground': '0 0% 100%',
    '--warning': '38 92% 50%',
    '--warning-foreground': '0 0% 100%',
    '--info': '199 89% 48%',
    '--info-foreground': '0 0% 100%',
    '--border': hexToHslToken(border),
    '--input': hexToHslToken(input),
    '--ring': hexToHslToken(primary),
    '--sidebar-background': hexToHslToken(sidebarBackground),
    '--sidebar-foreground': hexToHslToken(text),
    '--sidebar-primary': hexToHslToken(primary),
    '--sidebar-primary-foreground': hexToHslToken(getContrastTextColor(primary)),
    '--sidebar-accent': hexToHslToken(menuHover),
    '--sidebar-accent-foreground': hexToHslToken(getContrastTextColor(menuHover)),
    '--sidebar-border': hexToHslToken(sidebarBorder),
    '--sidebar-ring': hexToHslToken(primary),
    '--sidebar-muted': hexToHslToken(mixColors(text, background, isDark ? 0.32 : 0.48)),
    '--radius': radius.base,
  } as Record<(typeof THEME_CSS_VARIABLES)[number], string>;
};

export const buildCompanyThemePreviewStyle = (
  theme: CompanyTheme,
  resolvedMode = resolveThemeMode(theme.theme_mode),
) => getCompanyThemeCssVariables(theme, resolvedMode) as React.CSSProperties;

export const applyCompanyThemeToDocument = (
  theme: CompanyTheme,
  resolvedMode = resolveThemeMode(theme.theme_mode),
) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const variables = getCompanyThemeCssVariables(theme, resolvedMode);

  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  root.dataset.companyButtonStyle = theme.button_style;
  root.dataset.companyDensity = theme.layout_density;
  root.dataset.companyThemeMode = resolvedMode;
};

export const clearCompanyThemeFromDocument = () => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  THEME_CSS_VARIABLES.forEach((key) => {
    root.style.removeProperty(key);
  });

  delete root.dataset.companyButtonStyle;
  delete root.dataset.companyDensity;
  delete root.dataset.companyThemeMode;
};

export const suggestThemeFromLogoColor = (
  baseColor: string,
  paletteMode: CompanyThemePaletteMode,
  currentPalette?: Partial<CompanyThemePalette> | null,
): CompanyThemePalette => {
  const fallback = currentPalette
    ? normalizeCompanyThemePalette(currentPalette, getDefaultPalette(paletteMode))
    : getDefaultPalette(paletteMode);
  const normalizedBase = normalizeHexColor(baseColor, fallback.primary_color);
  const isDark = paletteMode === 'dark';

  return {
    ...fallback,
    primary_color: normalizedBase,
    secondary_color: isDark
      ? mixColors(normalizedBase, '#020617', 0.64)
      : mixColors(normalizedBase, '#0f172a', 0.22),
    button_color: normalizedBase,
    button_hover_color: mixColors(normalizedBase, '#000000', 0.12),
    menu_hover_color: isDark
      ? mixColors(normalizedBase, '#ffffff', 0.18)
      : mixColors(normalizedBase, '#ffffff', 0.82),
  };
};

export const extractDominantColorFromFile = async (file: File) => {
  const url = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Falha ao carregar a imagem da logo.'));
      element.src = url;
    });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return defaultLightPalette.primary_color;
    }

    const maxSize = 48;
    const ratio = Math.min(maxSize / image.width, maxSize / image.height, 1);
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let totalWeight = 0;
    let red = 0;
    let green = 0;
    let blue = 0;

    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3];
      if (alpha < 40) continue;

      const currentRed = data[index];
      const currentGreen = data[index + 1];
      const currentBlue = data[index + 2];
      const max = Math.max(currentRed, currentGreen, currentBlue);
      const min = Math.min(currentRed, currentGreen, currentBlue);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const brightness = (currentRed + currentGreen + currentBlue) / 765;
      const weight = clamp(0.35 + saturation * 0.45 + brightness * 0.2, 0.1, 1);

      totalWeight += weight;
      red += currentRed * weight;
      green += currentGreen * weight;
      blue += currentBlue * weight;
    }

    if (totalWeight === 0) {
      return defaultLightPalette.primary_color;
    }

    return rgbToHex({
      r: red / totalWeight,
      g: green / totalWeight,
      b: blue / totalWeight,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};
