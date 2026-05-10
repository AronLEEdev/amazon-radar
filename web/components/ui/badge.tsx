import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'default' | 'primary' | 'muted' | 'success' | 'danger' | 'warning' | 'outline';

const variants: Record<Variant, string> = {
  default: 'bg-zinc-100 text-zinc-800 border-zinc-200',
  primary: 'bg-blue-50 text-blue-700 border-blue-200',
  muted: 'bg-zinc-50 text-zinc-600 border-zinc-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  outline: 'bg-white text-zinc-700 border-zinc-300',
};

export function Badge({
  children,
  variant = 'default',
  className,
}: {
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium tabular',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
