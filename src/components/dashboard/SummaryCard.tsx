import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SummaryCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  tone?: 'blue' | 'orange' | 'green';
}

const toneStyles: Record<NonNullable<SummaryCardProps['tone']>, string> = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300',
  orange: 'bg-orange-50 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300',
  green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300',
};

export function SummaryCard({ title, value, subtitle, icon, tone = 'blue' }: SummaryCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', toneStyles[tone])}>
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
