import { Radar } from 'lucide-react';
import { cn } from '@/lib/cn';

export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn(
        'brand-gradient grid place-items-center rounded-lg text-white shadow-[0_2px_6px_rgba(59,130,246,0.35)]',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Radar size={Math.round(size * 0.6)} strokeWidth={2.2} />
    </div>
  );
}
