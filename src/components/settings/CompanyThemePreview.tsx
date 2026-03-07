import { Bell, LayoutDashboard, Package, Settings, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { CompanyTheme, CompanyThemePaletteMode } from '@/types/database';
import { buildCompanyThemePreviewStyle, resolveThemeMode } from '@/lib/companyTheme';

interface CompanyThemePreviewProps {
  theme: CompanyTheme;
  previewMode?: CompanyThemePaletteMode;
}

const previewMenu = [
  { label: 'Painel', icon: LayoutDashboard, active: true },
  { label: 'Pedidos', icon: ShoppingCart, active: false },
  { label: 'Produtos', icon: Package, active: false },
  { label: 'Configurações', icon: Settings, active: false },
];

export function CompanyThemePreview({ theme, previewMode }: CompanyThemePreviewProps) {
  const resolvedMode = previewMode ?? resolveThemeMode(theme.theme_mode);

  return (
    <div
      className="overflow-hidden rounded-[var(--app-card-radius)] border bg-background shadow-sm"
      data-company-button-style={theme.button_style}
      data-company-density={theme.layout_density}
      data-company-theme-mode={resolvedMode}
      style={buildCompanyThemePreviewStyle(theme, resolvedMode)}
    >
      <div className="grid min-h-[420px] grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside
          className="border-b border-sidebar-border p-4 lg:border-b-0 lg:border-r"
          style={{
            background: 'hsl(var(--sidebar-background))',
            color: 'hsl(var(--sidebar-foreground))',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--app-sidebar-item-radius)] bg-sidebar-primary text-sidebar-primary-foreground">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Sua Empresa</p>
              <p className="text-xs text-sidebar-muted">Preview do tema</p>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {previewMenu.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 px-[var(--app-sidebar-item-px)] py-[var(--app-sidebar-item-py)]"
                style={{
                  borderRadius: 'var(--app-sidebar-item-radius)',
                  background: item.active ? 'hsl(var(--sidebar-primary))' : 'transparent',
                  color: item.active
                    ? 'hsl(var(--sidebar-primary-foreground))'
                    : 'hsl(var(--sidebar-foreground))',
                }}
              >
                <item.icon className="h-4 w-4" />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
            ))}

            <div
              className="flex items-center gap-3 px-[var(--app-sidebar-item-px)] py-[var(--app-sidebar-item-py)]"
              style={{
                borderRadius: 'var(--app-sidebar-item-radius)',
                background: 'var(--app-menu-hover)',
                color: 'hsl(var(--sidebar-foreground))',
              }}
            >
              <Bell className="h-4 w-4" />
              <span className="text-sm font-medium">Hover do menu</span>
            </div>
          </div>
        </aside>

        <div className="min-w-0 bg-background">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Navbar</p>
              <h3 className="text-lg font-semibold text-foreground">
                Tema da Empresa {resolvedMode === 'dark' ? '• Escuro' : '• Claro'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm">Ação principal</Button>
              <Button size="sm" variant="outline">
                Secundário
              </Button>
            </div>
          </header>

          <div className="grid gap-4 p-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cards e botões</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[var(--app-control-radius)] border border-border bg-muted/30 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Receita</p>
                    <p className="mt-2 text-2xl font-semibold">R$ 12.480</p>
                  </div>
                  <div className="rounded-[var(--app-control-radius)] border border-border bg-muted/30 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Pedidos</p>
                    <p className="mt-2 text-2xl font-semibold">184</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button>Salvar</Button>
                  <Button variant="secondary">Secundário</Button>
                  <Button variant="ghost">Ghost</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Formulários e listas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input value="Exemplo de campo" readOnly />
                <div className="overflow-hidden rounded-[var(--app-control-radius)] border border-border">
                  <div className="grid grid-cols-[1.2fr_0.8fr] bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <div className="px-[var(--app-table-cell-px)] py-[var(--app-table-cell-py)]">Tabela</div>
                    <div className="px-[var(--app-table-cell-px)] py-[var(--app-table-cell-py)]">Status</div>
                  </div>
                  <div className="grid grid-cols-[1.2fr_0.8fr] border-t border-border text-sm">
                    <div className="px-[var(--app-table-cell-px)] py-[var(--app-table-cell-py)]">Pedido #1842</div>
                    <div className="px-[var(--app-table-cell-px)] py-[var(--app-table-cell-py)] text-muted-foreground">
                      Em produção
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
