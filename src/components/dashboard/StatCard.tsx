import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string;
  badge?: string;
  badgeTone?: 'default' | 'success';
  icon: ReactNode;
}

export function StatCard({ title, value, badge, badgeTone = 'default', icon }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
          {badge && (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
                badgeTone === 'success'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {badge}
            </span>
          )}
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          {icon}
        </div>
      </div>
    </div>
  );
}
