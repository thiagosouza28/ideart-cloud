import { ReactNode } from 'react';

interface EmptyStateCardProps {
  title: string;
  description: string;
  actionLabel: string;
  icon: ReactNode;
}

export function EmptyStateCard({ title, description, actionLabel, icon }: EmptyStateCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <button className="text-sm font-semibold text-muted-foreground hover:text-foreground">
          Ver Fila Completa
        </button>
      </div>
      <div className="mt-8 flex flex-col items-center gap-3 text-center text-muted-foreground">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/70 text-muted-foreground">
          {icon}
        </div>
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="text-sm">{description}</p>
        <button className="mt-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/70 hover:text-foreground">
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
