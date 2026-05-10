'use client';

import { Globe } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@/lib/cn';

export function LanguageSwitcher() {
  const t = useTranslations('language');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function switchTo(next: string) {
    if (next === locale) return;
    // Strip current locale prefix if present
    const stripped = pathname.replace(/^\/(en|zh)(\/|$)/, '/');
    const target = next === 'en' ? stripped : `/${next}${stripped}`;
    startTransition(() => {
      router.push(target);
      router.refresh();
    });
  }

  const locales: Array<{ code: 'en' | 'zh'; label: string }> = [
    { code: 'en', label: t('en') },
    { code: 'zh', label: t('zh') },
  ];

  return (
    <div className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white p-0.5 text-xs">
      <Globe size={12} className="ml-1 text-zinc-400" />
      {locales.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => switchTo(l.code)}
          disabled={pending}
          className={cn(
            'rounded px-2 py-0.5 transition',
            locale === l.code
              ? 'bg-zinc-900 text-white'
              : 'text-zinc-600 hover:bg-zinc-100',
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
