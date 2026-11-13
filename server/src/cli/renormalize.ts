// Rebuild every stored lot from its raw_json with the current normalisers. No network requests.
// Use after improving a mapping:  npm run renormalize

import { loadEnv } from '../config/env.js';
import { createPgDb } from '../db/client.js';
import { LotsRepo } from '../db/lots-repo.js';
import type { NormalizedLot } from '../domain/lot.js';
import { normalizeCopart } from '../normalize/copart.js';
import { normalizeIaai } from '../normalize/iaai.js';

try { process.loadEnvFile?.('.env'); } catch { /* use real environment */ }
const env = loadEnv();
const db = createPgDb(env.DATABASE_URL);
const repo = new LotsRepo(db);

const { rows } = await db.query<{ source: string; raw_json: unknown; photos: NormalizedLot['photos']; status: NormalizedLot['status'] }>(
  'SELECT source, raw_json, photos, status FROM lots ORDER BY id',
);
const counts = { inserted: 0, updated: 0, unchanged: 0, failed: 0 };
for (const r of rows) {
  try {
    const lot = r.source === 'iaai' ? normalizeIaai(r.raw_json) : normalizeCopart(r.raw_json, r.photos);
    lot.status = r.status; // keep sync-managed status (sold/removed)
    counts[(await repo.upsert(lot)).outcome]++;
  } catch (e) {
    counts.failed++;
    console.error((e as Error).message);
  }
}
console.log(`renormalized ${rows.length} lots:`, counts);
await db.close();
