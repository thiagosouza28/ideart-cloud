import { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type GraphPOSButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function BotaoPrimario({ className, ...props }: GraphPOSButtonProps) {
  return (
    <button
      className={cn(
        'h-12 w-full rounded-2xl bg-sky-500 px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-600',
        className,
      )}
      {...props}
    />
  );
}

export function BotaoSecundario({ className, ...props }: GraphPOSButtonProps) {
  return (
    <button
      className={cn(
        'h-12 w-full rounded-2xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50',
        className,
      )}
      {...props}
    />
  );
}
