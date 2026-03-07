import { PropsWithChildren } from 'react';
import { cn } from '@/lib/utils';

interface GraphPOSCardProps extends PropsWithChildren {
  className?: string;
}

export default function GraphPOSCard({ className, children }: GraphPOSCardProps) {
  return (
    <div className={cn('rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm', className)}>
      {children}
    </div>
  );
}
