export function formatPrice(amount: number | null, currency: string | null): string {
  if (amount === null) return '—';
  const code = currency ?? 'USD';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

export function formatCompact(n: number | null): string {
  if (n === null || n === undefined) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatBsr(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return `#${n.toLocaleString()}`;
}

export function formatRating(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return n.toFixed(1);
}

export function formatRelative(d: Date | null, locale = 'en'): string {
  if (!d) return '—';
  const ts = typeof d === 'string' ? new Date(d) : d;
  const diff = Date.now() - ts.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  const isZh = locale === 'zh';
  if (minutes < 1) return isZh ? '刚刚' : 'just now';
  if (hours < 1) return isZh ? `${minutes} 分钟前` : `${minutes}m ago`;
  if (days < 1) return isZh ? `${hours} 小时前` : `${hours}h ago`;
  return isZh ? `${days} 天前` : `${days}d ago`;
}

export function amazonUrl(asin: string, domain: string): string {
  return `https://www.${domain}/dp/${asin}`;
}
