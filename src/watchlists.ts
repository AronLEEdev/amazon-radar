import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { ParsedWatchlist, ProductTarget } from './types.js';
import { loadConfig } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WATCHLISTS_DIR = join(__dirname, '..', 'watchlists');

const ASIN_RE = /^[A-Z0-9]{10}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const AsinEntry = z.union([
  z.string().regex(ASIN_RE),
  z.object({
    asin: z.string().regex(ASIN_RE),
    amazon_domain: z.string().min(1).optional(),
  }),
]);

const CategoryEntry = z.object({
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  name: z.string().optional(),
  types: z
    .array(z.enum(['bestsellers', 'new_releases', 'movers_and_shakers']))
    .min(1),
});

const Tracker = z
  .object({
    mode: z.enum(['search', 'category']),
    query: z.string().min(1).optional(),
    category_id: z.string().min(1).optional(),
    top_n: z.number().int().positive().max(50).default(10),
    cooldown_days: z.number().int().min(0).max(30).default(3),
    max_targets_per_day: z.number().int().positive().max(100).default(15),
    timezone: z.string().min(1).default('America/Los_Angeles'),
  })
  .refine(
    (t) => (t.mode === 'search' ? !!t.query : !!t.category_id),
    {
      message: 'tracker.query is required when mode=search; category_id when mode=category',
    },
  );

const WatchlistFile = z.object({
  slug: z.string().regex(SLUG_RE, 'slug must be kebab-case lowercase'),
  name: z.string().min(1),
  description: z.string().optional(),
  amazon_domain: z.string().optional(),
  asins: z.array(AsinEntry).default([]),
  keywords: z.array(z.string().min(1)).default([]),
  categories: z.array(CategoryEntry).default([]),
  tracker: Tracker.optional(),
});

export function loadWatchlists(): ParsedWatchlist[] {
  const cfg = loadConfig();
  const files = readdirSync(WATCHLISTS_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort();

  const seenSlugs = new Set<string>();
  const out: ParsedWatchlist[] = [];

  for (const f of files) {
    const path = join(WATCHLISTS_DIR, f);
    const raw = parseYaml(readFileSync(path, 'utf8'));
    const parsed = WatchlistFile.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `    - ${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid watchlist ${f}:\n${issues}`);
    }
    const wl = parsed.data;
    if (seenSlugs.has(wl.slug)) {
      throw new Error(`Duplicate watchlist slug "${wl.slug}" in ${f}`);
    }
    seenSlugs.add(wl.slug);

    const fallbackDomain = wl.amazon_domain ?? cfg.AMAZON_DOMAIN;
    const seenAsins = new Set<string>();
    const asins: ProductTarget[] = [];
    for (const entry of wl.asins) {
      const asin = typeof entry === 'string' ? entry : entry.asin;
      const domain =
        typeof entry === 'string'
          ? fallbackDomain
          : entry.amazon_domain ?? fallbackDomain;
      const key = `${asin}|${domain}`;
      if (seenAsins.has(key)) {
        // Silent dedupe within a single watchlist file
        continue;
      }
      seenAsins.add(key);
      asins.push({ asin, amazon_domain: domain });
    }

    out.push({
      slug: wl.slug,
      name: wl.name,
      description: wl.description,
      amazon_domain: wl.amazon_domain,
      asins,
      keywords: wl.keywords,
      categories: wl.categories,
      tracker: wl.tracker,
    });
  }
  return out;
}
