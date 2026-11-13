// Applies src/db/migrations/*.sql in name order, once each. Run: npm run migrate

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPgDb, type Db } from './client.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

export async function migrate(db: Db, log: (msg: string) => void = () => {}): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(r => r.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter(f => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await readFile(MIGRATIONS_DIR + f, 'utf8');
    await db.query('BEGIN');
    try {
      await db.query(sql);
      await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK');
      throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
    }
    applied.push(f);
    log(`applied ${f}`);
  }
  return applied;
}

// CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { process.loadEnvFile?.('.env'); } catch { /* no .env file: rely on real env */ }
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL is not set'); process.exit(1); }
  const db = createPgDb(url);
  migrate(db, console.log)
    .then(a => console.log(a.length ? `done (${a.length} applied)` : 'up to date'))
    .catch(e => { console.error(e.message); process.exitCode = 1; })
    .finally(() => db.close());
}
