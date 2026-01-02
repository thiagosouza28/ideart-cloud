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
  blue: 'bg-blue-50 text-blue-600',
  orange: 'bg-orange-50 text-orange-600',
  green: 'bg-emerald-50 text-emerald-600',
};

export function SummaryCard({ title, value, subtitle, icon, tone = 'blue' }: SummaryCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', toneStyles[tone])}>
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700">{title}</p>
          <p className="text-2xl font-semibold text-slate-900">{value}</p>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
