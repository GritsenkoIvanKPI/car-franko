// Download genuine auction photos for stored lots, so the website serves them from our own domain.
//   npm run photos -- --per-lot 15            # up to 15 photos per active lot
//   npm run photos -- --per-lot 15 --limit 5  # first 5 lots only (trial run)
// Same rules as the importer: one request at a time per source, 2–3 s gap, stop on any block.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadEnv } from '../config/env.js';
import { createPgDb } from '../db/client.js';
import { migrate } from '../db/migrate.js';
import { publicCode } from '../domain/public-code.js';
import type { Photo } from '../domain/lot.js';
import { ProviderBlockedError } from '../providers/errors.js';
import { assertNotBlocked, type HttpClient, type HttpResponse } from '../providers/http.js';
import { PoliteHttpClient } from '../sync/polite-http.js';

try { process.loadEnvFile?.('.env'); } catch { /* use real environment */ }
const env = loadEnv();
const { values } = parseArgs({ options: { 'per-lot': { type: 'string', default: '15' }, limit: { type: 'string' } } });
const perLot = Number(values['per-lot']);
const siteRoot = resolve(env.SITE_ROOT);
const stamp = () => new Date().toISOString().slice(11, 19);

/** Binary-safe client: images must arrive as image/*, anything else (HTML challenge) is a block. */
class ImageClient implements HttpClient {
  last: Buffer | null = null;
  constructor(private readonly providerId: string) {}
  async request(url: string): Promise<HttpResponse> {
    const res = await fetch(url, { headers: { 'User-Agent': env.HTTP_USER_AGENT, Accept: 'image/*' }, redirect: 'manual', signal: AbortSignal.timeout(env.HTTP_TIMEOUT_MS) });
    const buf = Buffer.from(await res.arrayBuffer());
    const isImage = (res.headers.get('content-type') ?? '').startsWith('image/');
    this.last = isImage ? buf : null;
    // body text only matters for block detection when it isn't an image
    return { status: res.status, url, headers: res.headers, body: isImage ? '' : buf.toString('utf8') };
  }
}

const db = createPgDb(env.DATABASE_URL);
await migrate(db, m => console.log(`[db] ${m}`));

const { rows: lots } = await db.query<{ id: string; source: string; source_lot_id: string; photos: Photo[]; have: string }>(`
  SELECT l.id, l.source, l.source_lot_id, l.photos, (SELECT count(*) FROM lot_photos p WHERE p.lot_id = l.id) AS have
  FROM lots l
  WHERE l.status = 'active' AND (l.sale_date IS NULL OR l.sale_date > now())
  ORDER BY l.sale_date NULLS LAST, l.id
  ${values.limit ? `LIMIT ${Number(values.limit)}` : ''}`);

const clients = new Map<string, { raw: ImageClient; polite: PoliteHttpClient }>();
const clientFor = (source: string) => {
  if (!clients.has(source)) {
    const raw = new ImageClient(source);
    clients.set(source, { raw, polite: new PoliteHttpClient(raw, { minDelayMs: env.RATE_LIMIT_MIN_MS, maxDelayMs: env.RATE_LIMIT_MAX_MS, retries: 3, backoffBaseMs: 5_000 }) });
  }
  return clients.get(source)!;
};

let saved = 0, skipped = 0, failed = 0;
const blocked = new Set<string>();
console.log(`[${stamp()}] ${lots.length} lots, up to ${perLot} photos each -> ${join(siteRoot, 'images/cars')}`);

for (const [n, lot] of lots.entries()) {
  if (blocked.has(lot.source)) continue;
  const code = publicCode(lot.source, lot.source_lot_id);
  const wanted = (lot.photos ?? []).slice(0, perLot);
  if (Number(lot.have) >= wanted.length) { skipped++; continue; }
  const { raw, polite } = clientFor(lot.source);
  let got = 0;
  for (const [i, photo] of wanted.entries()) {
    const rel = `images/cars/${code}/${String(i + 1).padStart(2, '0')}.jpg`;
    const exists = await db.query('SELECT 1 FROM lot_photos WHERE lot_id = $1 AND position = $2', [lot.id, i]);
    if (exists.rows.length) { got++; continue; }
    try {
      const res = await polite.request(photo.url);
      if (!raw.last) assertNotBlocked(lot.source, res, false);
      if (!raw.last || raw.last.length < 2_000) { failed++; continue; } // not an image / placeholder
      const abs = join(siteRoot, rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, raw.last);
      await db.query(
        `INSERT INTO lot_photos (lot_id, position, source_url, local_path, bytes) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (lot_id, position) DO UPDATE SET source_url=EXCLUDED.source_url, local_path=EXCLUDED.local_path, bytes=EXCLUDED.bytes, fetched_at=now()`,
        [lot.id, i, photo.url, rel, raw.last.length],
      );
      saved++; got++;
    } catch (e) {
      if (e instanceof ProviderBlockedError) {
        blocked.add(lot.source);
        console.log(`[${stamp()}] STOP ${lot.source}: ${e.message}`);
        break;
      }
      failed++;
      console.log(`[${stamp()}] photo error ${code} #${i + 1}: ${(e as Error).message}`);
    }
  }
  console.log(`[${stamp()}] ${n + 1}/${lots.length} ${code}: ${got}/${wanted.length} photos`);
}

console.log(`[${stamp()}] DONE: saved ${saved} photos, lots already complete ${skipped}, failed ${failed}${blocked.size ? `, BLOCKED: ${[...blocked].join(', ')}` : ''}`);
await db.close();
process.exit(blocked.size ? 2 : 0);
