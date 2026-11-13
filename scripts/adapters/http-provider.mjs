// Real data provider adapter (template).
//
// Copart and IAAI don't offer a public API, so lot data comes from a licensed
// third-party provider that serves Copart/IAAI listings as JSON. Once a provider
// is chosen, fill in the three marked spots below using its API documentation:
//   1) the search request (URL + query params),
//   2) how to read the list of lots and the next page from a response,
//   3) mapLot(): converting one provider lot into our normalised shape.
//
// Configure with environment variables (GitHub Actions secrets in production):
//   CATALOG_API_URL   base URL of the provider's search endpoint
//   CATALOG_API_KEY   API key / token
//   CATALOG_API_AUTH  'bearer' (default) or a header name such as 'x-api-key'

import { MIN_YEAR, BRANDS, SOURCES } from '../catalog.config.mjs';

const BASE = process.env.CATALOG_API_URL;
const KEY = process.env.CATALOG_API_KEY;
const AUTH = (process.env.CATALOG_API_AUTH || 'bearer').toLowerCase();
const MAX_PAGES = Number(process.env.CATALOG_MAX_PAGES || 50);

const headers = () => (AUTH === 'bearer'
  ? { Authorization: `Bearer ${KEY}` }
  : { [AUTH]: KEY });

async function getJson(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    const res = await fetch(url, { headers: { Accept: 'application/json', ...headers() } });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 1500 * i)); continue; }
    throw new Error(`Provider responded ${res.status} for ${url}`);
  }
  throw new Error(`Provider kept failing for ${url}`);
}

// (3) Map one provider lot to our shape. Field names on the right are examples —
// replace them with the provider's real ones. Unknown values should be null.
export function mapLot(raw) {
  return {
    source: String(raw.source || raw.auction || '').toLowerCase(),       // 'copart' | 'iaai'
    lot: String(raw.lot_number ?? raw.lot ?? ''),
    url: raw.url ?? raw.lot_url ?? null,
    vin: raw.vin ?? null,
    year: Number(raw.year),
    make: raw.make,
    model: raw.model,
    trim: raw.trim ?? raw.series ?? null,
    body: raw.body_style ?? raw.body ?? null,          // normalised later in sync-lots.mjs
    fuel: raw.fuel_type ?? raw.fuel ?? null,
    engine_l: raw.engine_size ?? raw.engine ?? null,  // e.g. "2.0L" or 2.0
    cylinders: raw.cylinders ?? null,
    transmission: raw.transmission ?? null,
    drive: raw.drive ?? raw.drive_line ?? null,
    odometer_mi: raw.odometer ?? raw.mileage ?? null,
    primary_damage: raw.primary_damage ?? raw.damage ?? null,
    secondary_damage: raw.secondary_damage ?? null,
    title: raw.title_type ?? raw.document ?? null,
    condition: raw.highlights ?? raw.run_and_drive ?? null,
    keys: raw.keys ?? null,
    location: { city: raw.location_city ?? raw.city ?? null, state: raw.location_state ?? raw.state ?? null },
    sale_date: raw.sale_date ?? raw.auction_date ?? null,
    current_bid_usd: raw.current_bid ?? raw.bid ?? null,
    buy_now_usd: raw.buy_now ?? raw.buy_it_now_price ?? null,
    est_retail_usd: raw.est_retail_value ?? raw.acv ?? null,
    color: raw.color ?? null,
    images: raw.images ?? raw.photos ?? [],
  };
}

export async function fetchLots() {
  if (!BASE || !KEY) throw new Error('Set CATALOG_API_URL and CATALOG_API_KEY to use the http provider.');
  const out = [];
  for (const source of SOURCES) {
    for (const make of BRANDS) {
      for (let page = 1; page <= MAX_PAGES; page++) {
        // (1) Build the search request. Ask the provider to pre-filter as much as it can.
        const url = new URL(BASE);
        url.searchParams.set('auction', source);
        url.searchParams.set('make', make);
        url.searchParams.set('year_from', String(MIN_YEAR));
        url.searchParams.set('status', 'upcoming');
        url.searchParams.set('page', String(page));

        const json = await getJson(url);
        // (2) Read lots and paging from the response.
        const items = json.data ?? json.items ?? json.results ?? [];
        out.push(...items.map(mapLot));
        const hasMore = json.next_page ?? json.has_more ?? (items.length > 0 && page < (json.total_pages ?? page));
        if (!hasMore) break;
      }
    }
  }
  return out;
}
