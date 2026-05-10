import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadConfig } from './config.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const cfg = loadConfig();
  pool = new Pool({
    connectionString: cfg.DATABASE_URL,
    // Supabase pooled connections — keep small, app is short-lived
    max: 5,
    idleTimeoutMillis: 10_000,
  });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

/**
 * Tiny migrate runner: applies every *.sql in migrations/ in lexical order
 * once. Tracks applied filenames in a `_migrations` table.
 */
export async function migrate(): Promise<void> {
  const p = getPool();
  await p.query(`
    create table if not exists _migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    const { rows } = await p.query<{ filename: string }>(
      'select filename from _migrations where filename = $1',
      [f],
    );
    if (rows.length > 0) {
      console.log(`= ${f} (already applied)`);
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    console.log(`+ ${f}`);
    const client = await p.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into _migrations (filename) values ($1)', [f]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }
  console.log('migrations done');
}

// CLI: `tsx src/db.ts migrate`
const cmd = process.argv[2];
if (cmd === 'migrate') {
  migrate()
    .then(() => closePool())
    .catch((err) => {
      console.error(err);
      closePool().finally(() => process.exit(1));
    });
}
