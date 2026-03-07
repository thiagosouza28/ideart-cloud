import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Painel', to: '/dashboard' },
  { label: 'Vendas', to: '/pdv' },
  { label: 'Clientes', to: '/clientes' },
  { label: 'Inventario', to: '/estoque' },
];

interface GraphPOSHeaderProps {
  active?: string;
}

export default function GraphPOSHeader({ active }: GraphPOSHeaderProps) {
  return (
    <header className="w-full border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              G
            </span>
            <span>GraphPOS</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            {navItems.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className={cn(
                  'transition-colors hover:text-foreground',
                  active === item.label ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-2 text-sm text-muted-foreground md:flex">
            <Search className="h-4 w-4" />
            <span>Buscar pedidos, clientes...</span>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
            JD
          </div>
        </div>
      </div>
    </header>
  );
}
