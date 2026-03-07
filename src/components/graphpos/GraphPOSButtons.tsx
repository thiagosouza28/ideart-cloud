import { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type GraphPOSButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function BotaoPrimario({ className, ...props }: GraphPOSButtonProps) {
  return (
    <button
      className={cn(
        'h-12 w-full rounded-2xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-[0_12px_24px_-14px_hsl(var(--primary)/0.75)] transition-all hover:bg-primary/90',
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
        'h-12 w-full rounded-2xl border border-border bg-card px-6 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted/70',
        className,
      )}
      {...props}
    />
  );
}
