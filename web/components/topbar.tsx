import { useTranslations } from 'next-intl';
import { BrandMark } from './brand-mark';
import { LanguageSwitcher } from './language-switcher';

export function Topbar({
  lastSnapshotLabel,
}: {
  lastSnapshotLabel?: string;
}) {
  const t = useTranslations('brand');
  const tShell = useTranslations('shell');
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-zinc-200 bg-white/85 px-4 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <BrandMark size={26} />
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight">{t('name')}</div>
          <div className="text-[10px] text-zinc-500">{t('tagline')}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {lastSnapshotLabel ? (
          <div className="hidden text-[11px] text-zinc-500 sm:block">
            <span className="text-zinc-400">{tShell('lastSnapshot')}</span>{' '}
            <span className="font-medium text-zinc-700">{lastSnapshotLabel}</span>
          </div>
        ) : null}
        <LanguageSwitcher />
      </div>
    </header>
  );
}
