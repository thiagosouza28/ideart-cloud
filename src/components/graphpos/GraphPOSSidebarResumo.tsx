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
    <div className={cn('rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm', className)}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        </div>
        {badge ? (
          <span
            className={cn(
              'rounded-full border border-success/30 bg-success/15 px-3 py-1 text-xs font-semibold text-success',
              badgeClassName,
            )}
          >
            {badge}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
