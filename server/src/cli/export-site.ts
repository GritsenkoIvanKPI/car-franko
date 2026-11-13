// Write the website's catalogue file (<SITE_ROOT>/data/lots.json) from our database.
//   npm run export:site                 # cars with at least 10 downloaded photos
//   npm run export:site -- --min-photos 10 --max-photos 15
// Public file rule: no auction name, lot number, lot URL, VIN, branch or raw data — only our car code.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadEnv } from '../config/env.js';
import { createPgDb } from '../db/client.js';
import { publicCode } from '../domain/public-code.js';

try { process.loadEnvFile?.('.env'); } catch { /* use real environment */ }
const env = loadEnv();
const { values } = parseArgs({ options: { 'min-photos': { type: 'string', default: '10' }, 'max-photos': { type: 'string', default: '15' } } });
const minPhotos = Number(values['min-photos']);
const maxPhotos = Number(values['max-photos']);

const COLORS: Record<string, string> = {
  BLACK: 'Чорний', WHITE: 'Білий', GRAY: 'Сірий', GREY: 'Сірий', SILVER: 'Сріблястий', BLUE: 'Синій', RED: 'Червоний',
  GREEN: 'Зелений', BROWN: 'Коричневий', BEIGE: 'Бежевий', GOLD: 'Золотистий', YELLOW: 'Жовтий', ORANGE: 'Помаранчевий',
  PURPLE: 'Фіолетовий', MAROON: 'Бордовий', BURGUNDY: 'Бордовий', CHARCOAL: 'Графітовий', TAN: 'Бежевий', TEAL: 'Бірюзовий',
};
const BODY: Record<string, string | null> = { convertible: 'coupe', van: 'minivan', other: null };
const nz = <T>(v: T) => (v === 'other' || v === 'unknown' ? null : v);

const db = createPgDb(env.DATABASE_URL);
const { rows } = await db.query<any>(`
  SELECT l.*, coalesce(json_agg(p.local_path ORDER BY p.position) FILTER (WHERE p.local_path IS NOT NULL), '[]') AS local_photos
  FROM lots l LEFT JOIN lot_photos p ON p.lot_id = l.id
  WHERE l.status = 'active' AND (l.sale_date IS NULL OR l.sale_date > now())
  GROUP BY l.id
  ORDER BY l.sale_date NULLS LAST`);

let tooFewPhotos = 0;
const lots = rows.flatMap(r => {
  const images: string[] = (r.local_photos as string[]).slice(0, maxPhotos);
  if (images.length < minPhotos) { tooFewPhotos++; return []; }
  const color = r.color ? COLORS[String(r.color).toUpperCase()] ?? String(r.color).charAt(0) + String(r.color).slice(1).toLowerCase() : null;
  return [{
    code: publicCode(r.source, r.source_lot_id),
    year: r.year, make: r.make, model: r.model, trim: r.trim,
    body: r.body_type in BODY ? BODY[r.body_type] : r.body_type,
    fuel: nz(r.fuel), engine_l: r.engine_l === null ? null : Number(r.engine_l), cylinders: r.cylinders,
    transmission: nz(r.transmission), drive: nz(r.drive),
    odometer_mi: r.odometer_mi, odometer_km: r.odometer_km,
    primary_damage: nz(r.primary_damage), secondary_damage: nz(r.secondary_damage),
    title: r.title_type, condition: nz(r.drivability), keys: r.keys,
    location: { city: r.location_city ? String(r.location_city).replace(/\b\w+/g, (w: string) => w[0]!.toUpperCase() + w.slice(1).toLowerCase()) : null, state: r.location_state },
    sale_date: r.sale_date ? new Date(r.sale_date).toISOString() : null,
    current_bid_usd: r.current_bid_usd === null ? null : Number(r.current_bid_usd),
    buy_now_usd: r.buy_now_usd === null ? null : Number(r.buy_now_usd),
    est_retail_usd: null,
    color,
    images,
  }];
});

const out = {
  meta: { demo: false, generated_at: new Date().toISOString(), min_year: 2015, brands: [...new Set(lots.map(l => l.make))].sort(), count: lots.length },
  lots,
};
const file = join(resolve(env.SITE_ROOT), 'data/lots.json');
await mkdir(dirname(file), { recursive: true });
await writeFile(file, JSON.stringify(out, null, 1) + '\n');
console.log(`exported ${lots.length} cars to ${file} (skipped ${tooFewPhotos} with fewer than ${minPhotos} photos)`);
await db.close();
