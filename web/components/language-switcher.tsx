'use client';

import { Globe } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/cn';

export function LanguageSwitcher() {
  const t = useTranslations('language');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname(); // locale-stripped pathname, e.g. "/"
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function switchTo(next: string) {
    if (next === locale) return;
    const qs = searchParams.toString();
    const target = qs ? `${pathname}?${qs}` : pathname;
    startTransition(() => {
      // next-intl router accepts a `locale` option and handles prefix correctly
      router.replace(target, { locale: next as (typeof routing.locales)[number] });
      // Bust router cache so the [locale] layout (which holds the messages
      // provider) re-renders with fresh translations.
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
            pending && 'opacity-60',
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
