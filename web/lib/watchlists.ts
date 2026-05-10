import 'server-only';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

/**
 * Read tracker config straight from the watchlist YAML files. Lighter than
 * reaching into the scraper package and avoids fragile DB string parsing.
 *
 * The YAML lives at <repo>/watchlists/*.yml — one level up from `web/`.
 */
const WATCHLISTS_DIR = join(process.cwd(), '..', 'watchlists');

export interface YamlTracker {
  mode: 'search' | 'category';
  query?: string;
  category_id?: string;
  top_n: number;
  cooldown_days: number;
  max_targets_per_day: number;
  timezone: string;
}

export interface YamlWatchlist {
  slug: string;
  name: string;
  description?: string;
  amazon_domain?: string;
  tracker?: YamlTracker;
}

export function loadYamlWatchlists(): YamlWatchlist[] {
  if (!existsSync(WATCHLISTS_DIR)) return [];
  const files = readdirSync(WATCHLISTS_DIR).filter(
    (f) => f.endsWith('.yml') || f.endsWith('.yaml'),
  );
  const out: YamlWatchlist[] = [];
  for (const f of files) {
    try {
      const raw = parseYaml(readFileSync(join(WATCHLISTS_DIR, f), 'utf8'));
      if (raw && typeof raw === 'object' && 'slug' in raw) {
        const r = raw as Record<string, unknown>;
        const tracker = r.tracker as Record<string, unknown> | undefined;
        out.push({
          slug: String(r.slug),
          name: String(r.name ?? r.slug),
          description: typeof r.description === 'string' ? r.description : undefined,
          amazon_domain:
            typeof r.amazon_domain === 'string' ? r.amazon_domain : undefined,
          tracker: tracker
            ? {
                mode: tracker.mode as 'search' | 'category',
                query: typeof tracker.query === 'string' ? tracker.query : undefined,
                category_id:
                  typeof tracker.category_id === 'string' ? tracker.category_id : undefined,
                top_n: Number(tracker.top_n ?? 10),
                cooldown_days: Number(tracker.cooldown_days ?? 3),
                max_targets_per_day: Number(tracker.max_targets_per_day ?? 15),
                timezone:
                  typeof tracker.timezone === 'string'
                    ? tracker.timezone
                    : 'America/Los_Angeles',
              }
            : undefined,
        });
      }
    } catch {
      // Ignore unparseable files; UI must be resilient to malformed YAML.
    }
  }
  return out;
}
