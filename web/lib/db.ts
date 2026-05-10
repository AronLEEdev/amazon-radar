import 'server-only';
import pg from 'pg';

const { Pool } = pg;

const globalForPool = globalThis as unknown as { _pgPool?: pg.Pool };

export function getPool(): pg.Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set — copy .env.local.example to .env.local');
  }
  if (!globalForPool._pgPool) {
    globalForPool._pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 10_000,
    });
  }
  return globalForPool._pgPool;
}
