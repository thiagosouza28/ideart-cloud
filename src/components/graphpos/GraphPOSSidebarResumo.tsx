import { PropsWithChildren } from 'react';
import { cn } from '@/lib/utils';

interface GraphPOSSidebarResumoProps extends PropsWithChildren {
  title: string;
  badge?: string;
  badgeClassName?: string;
  className?: string;
}

export default function GraphPOSSidebarResumo({
  title,
  badge,
  badgeClassName,
  className,
  children,
}: GraphPOSSidebarResumoProps) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white p-6 shadow-sm', className)}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        </div>
        {badge ? (
          <span className={cn('rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700', badgeClassName)}>
            {badge}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
