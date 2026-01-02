import { PropsWithChildren } from 'react';
import { cn } from '@/lib/utils';

interface GraphPOSCardProps extends PropsWithChildren {
  className?: string;
}

export default function GraphPOSCard({ className, children }: GraphPOSCardProps) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white p-6 shadow-sm', className)}>
      {children}
    </div>
  );
}
