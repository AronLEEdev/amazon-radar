import 'dotenv/config';
import { z } from 'zod';

const Schema = z.object({
  RAINFOREST_API_KEY: z.string().min(1, 'RAINFOREST_API_KEY required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL required'),
  AMAZON_DOMAIN: z.string().default('amazon.com'),
  FETCH_CONCURRENCY: z.coerce.number().int().positive().max(20).default(5),
});

export type Config = z.infer<typeof Schema>;

let cached: Config | undefined;
export function loadConfig(): Config {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}
