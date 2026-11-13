#!/usr/bin/env node
// Pulls lots from the configured provider, keeps only what we sell
// (2015+, our brands, upcoming auctions), normalises values and writes data/lots.json.
//
//   node scripts/sync-lots.mjs                 # demo data
//   CATALOG_PROVIDER=http node scripts/sync-lots.mjs   # real provider (see adapters/http-provider.mjs)

import { createHash } from 'node:crypto';
import { writeFile, mkdir, readFile } from 'node:fs/promises';

/** Stable, opaque car code shown to customers, e.g. "CF-7K3D9QX". Our team maps it back via the database. */
const publicCode = internalId => 'CF-' + BigInt('0x' + createHash('sha1').update(internalId).digest('hex').slice(0, 10)).toString(36).toUpperCase().padStart(7, '0').slice(-7);
import { MIN_YEAR, BRANDS, BRAND_ALIASES, SOURCES, KEEP_ENDED_HOURS, OUTPUT_FILE } from './catalog.config.mjs';

const PROVIDER = process.env.CATALOG_PROVIDER || 'demo';
const adapters = { demo: './adapters/demo.mjs', http: './adapters/http-provider.mjs' };
if (!adapters[PROVIDER]) throw new Error(`Unknown CATALOG_PROVIDER "${PROVIDER}". Use: ${Object.keys(adapters).join(', ')}`);

const brandMap = new Map(BRANDS.map(b => [b.toUpperCase(), b]));
for (const [k, v] of Object.entries(BRAND_ALIASES)) brandMap.set(k.toUpperCase(), v);

const low = v => (v == null ? '' : String(v).toLowerCase().trim());
const pick = (v, rules, fallback = null) => {
  const s = low(v);
  if (!s) return fallback;
  for (const [code, words] of rules) if (words.some(w => s === w || s.includes(w))) return code;
  return fallback;
};

const BODY = [
  ['pickup', ['pickup', 'truck', 'crew cab', 'quad cab', 'regular cab']],
  ['minivan', ['minivan', 'van']],
  ['wagon', ['wagon', 'estate']],
  ['coupe', ['coupe', 'convertible', 'cabriolet']],
  ['hatchback', ['hatchback', 'liftback']],
  ['suv', ['suv', 'sport utility', 'crossover', '4dr spor', 'utility']],
  ['sedan', ['sedan', '4dr', 'saloon']],
];
const FUEL = [
  ['electric', ['electric', 'ev', 'bev']],
  ['hybrid', ['hybrid', 'phev', 'plug-in']],
  ['diesel', ['diesel']],
  ['gasoline', ['gas', 'petrol', 'flexible', 'flex']],
];
const TRANS = [['cvt', ['cvt', 'variable']], ['manual', ['manual', 'mt']], ['automatic', ['auto', 'at']]];
const DRIVE = [
  ['awd', ['awd', 'all wheel', '4wd', '4x4', 'four wheel']],
  ['rwd', ['rwd', 'rear']],
  ['fwd', ['fwd', 'front']],
];
const DAMAGE = [
  ['front_end', ['front_end', 'front end', 'front']],
  ['rear_end', ['rear_end', 'rear end', 'rear']],
  ['side', ['side', 'left', 'right']],
  ['minor_dents', ['minor_dents', 'minor dent', 'scratch']],
  ['all_over', ['all_over', 'all over', 'rollover']],
  ['hail', ['hail']],
  ['water', ['water', 'flood']],
  ['mechanical', ['mechanical', 'engine', 'transmission']],
  ['normal_wear', ['normal_wear', 'normal wear', 'none']],
];
const CONDITION = [
  ['run_drive', ['run_drive', 'run and drive', 'run & drive', 'runs and drives', 'true']],
  ['starts', ['starts', 'engine start', 'enhanced']],
  ['stationary', ['stationary', 'does not start', 'non-runner', 'false']],
];
const TITLE = [['clean', ['clean', 'clear']], ['salvage', ['salvage', 'certificate of destruction', 'parts only', 'rebuilt']]];

const num = v => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function normalise(raw) {
  const make = brandMap.get(String(raw.make || '').toUpperCase().trim());
  const source = low(raw.source);
  const year = Number(raw.year);
  if (!make || !SOURCES.includes(source) || !(year >= MIN_YEAR) || !raw.lot) return null;

  const fuel = pick(raw.fuel, FUEL, 'gasoline');
  const mi = num(raw.odometer_mi);
  return {
    id: `${source}-${raw.lot}`,
    source,
    lot: String(raw.lot),
    url: raw.url || null,
    vin: raw.vin || null,
    year,
    make,
    model: String(raw.model || '').trim(),
    trim: raw.trim || null,
    body: pick(raw.body, BODY, 'sedan'),
    fuel,
    engine_l: fuel === 'electric' ? null : num(raw.engine_l),
    cylinders: num(raw.cylinders),
    transmission: pick(raw.transmission, TRANS, 'automatic'),
    drive: pick(raw.drive, DRIVE, 'fwd'),
    odometer_mi: mi,
    odometer_km: mi ? Math.round(mi * 1.609344) : null,
    primary_damage: pick(raw.primary_damage, DAMAGE, null),
    secondary_damage: pick(raw.secondary_damage, DAMAGE, null),
    title: pick(raw.title, TITLE, null),
    condition: pick(raw.condition, CONDITION, null),
    keys: raw.keys == null ? null : Boolean(raw.keys),
    location: raw.location || null,
    sale_date: raw.sale_date ? new Date(raw.sale_date).toISOString() : null,
    current_bid_usd: num(raw.current_bid_usd) || 0,
    buy_now_usd: num(raw.buy_now_usd),
    est_retail_usd: num(raw.est_retail_usd),
    color: raw.color || null,
    images: (raw.images || []).filter(Boolean),
  };
}

const { fetchLots } = await import(adapters[PROVIDER]);
const started = Date.now();
const raw = await fetchLots();

const cutoff = Date.now() - KEEP_ENDED_HOURS * 3600e3;
const seen = new Set();
const lots = [];
let dropped = 0;
for (const r of raw) {
  const lot = normalise(r);
  if (!lot || (lot.sale_date && Date.parse(lot.sale_date) < cutoff)) { dropped++; continue; }
  const key = lot.vin ? `vin:${lot.vin}` : lot.id; // the same car can be listed twice
  if (seen.has(key) || seen.has(lot.id)) { dropped++; continue; }
  seen.add(key); seen.add(lot.id);
  lots.push(lot);
}
lots.sort((a, b) => (Date.parse(a.sale_date) || Infinity) - (Date.parse(b.sale_date) || Infinity));

// Public file: the website never reveals which auction a car comes from.
// No source, lot number, lot URL or VIN — only what the page shows, plus our own car code.
const publicLot = ({ source, lot, url, vin, id, ...rest }) => ({ code: publicCode(id), ...rest });

const out = {
  meta: {
    demo: PROVIDER === 'demo',
    generated_at: new Date().toISOString(),
    min_year: MIN_YEAR,
    brands: BRANDS,
    count: lots.length,
  },
  lots: lots.map(publicLot),
};

// Never let demo data replace a real catalogue by accident.
if (PROVIDER === 'demo' && !process.argv.includes('--force')) {
  try {
    const current = JSON.parse(await readFile(OUTPUT_FILE, 'utf8'));
    if (current?.meta && current.meta.demo === false) {
      console.error('data/lots.json holds real cars; refusing to overwrite with demo data (use --force if you really mean it).');
      process.exit(1);
    }
  } catch { /* no file yet */ }
}
await mkdir(new URL('.', OUTPUT_FILE), { recursive: true });
await writeFile(OUTPUT_FILE, JSON.stringify(out, null, 1) + '\n');
console.log(`[${PROVIDER}] ${lots.length} lots written, ${dropped} skipped, ${((Date.now() - started) / 1000).toFixed(1)}s`);
