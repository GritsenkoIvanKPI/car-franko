// Copart provider.
// Uses the JSON endpoints Copart's own frontend calls. As of the Step 1 research every one of them
// returns an Imperva challenge to non-browser clients, so in practice each call ends in
// ProviderBlockedError and sync pauses the source. It's kept so the source works without code
// changes if Copart ever serves these endpoints normally. We never try to solve the challenge.

import type { FilterSet } from '../config/filters.js';
import type { NormalizedLot, Photo } from '../domain/lot.js';
import { COPART_BASE, normalizeCopart } from '../normalize/copart.js';
import { SchemaChangedError } from './errors.js';
import { assertNotBlocked, type HttpClient } from './http.js';
import type { AuctionProvider, PageToken, SearchPage } from './types.js';

const PAGE_SIZE = 100;

/** Our filter set -> Copart's Solr-style filter object (unverified). */
export function copartSearchBody(f: FilterSet, page: number) {
  const filter: Record<string, string[]> = {};
  if (f.makes?.length) filter.MAKE = f.makes.map(m => `lot_make_desc:"${m}"`);
  if (f.yearFrom !== undefined || f.yearTo !== undefined) filter.YEAR = [`lot_year:[${f.yearFrom ?? '*'} TO ${f.yearTo ?? '*'}]`];
  if (f.states?.length) filter.LOC = f.states.map(s => `yard_state_code:"${s}"`);
  return { query: ['*'], filter, sort: ['auction_date_utc asc'], page, size: PAGE_SIZE, start: page * PAGE_SIZE };
}

export class CopartProvider implements AuctionProvider {
  readonly id = 'copart-web';
  readonly source = 'copart' as const;
  readonly capabilities = { serverSideFilters: true, searchReturnsFullLots: true, exposesCurrentBid: true };

  constructor(private readonly http: HttpClient) {}

  async searchLots(filters: FilterSet, page: PageToken | null): Promise<SearchPage> {
    const p = page === null ? 0 : Number(page);
    const res = await this.http.request(`${COPART_BASE}/public/lots/search-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(copartSearchBody(filters, p)),
    });
    assertNotBlocked(this.id, res, true);
    const json = parseJson(this.id, 'search-results', res.body) as { data?: { results?: { content?: unknown[]; totalElements?: number } } };
    const content = json.data?.results?.content;
    if (!Array.isArray(content)) throw new SchemaChangedError(this.id, 'search-results', ['data.results.content[] missing']);
    const total = json.data?.results?.totalElements ?? 0;
    const items = content.map(raw => {
      const lot = normalizeCopart(raw);
      return { sourceLotId: lot.sourceLotId, url: lot.lotUrl, lot };
    });
    return { items, nextPage: (p + 1) * PAGE_SIZE < total ? String(p + 1) : null, totalEstimate: total };
  }

  async getLot(sourceLotId: string): Promise<NormalizedLot | null> {
    const res = await this.http.request(`${COPART_BASE}/public/data/lotdetails/solr/${encodeURIComponent(sourceLotId)}`, {
      headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return null;
    assertNotBlocked(this.id, res, true);
    const json = parseJson(this.id, 'lotdetails', res.body) as { data?: { lotDetails?: unknown } };
    if (!json.data) return null;
    if (!json.data.lotDetails) throw new SchemaChangedError(this.id, 'lotdetails', ['data.lotDetails missing']);
    return normalizeCopart(json.data.lotDetails, await this.getPhotos(sourceLotId));
  }

  async getPhotos(sourceLotId: string): Promise<Photo[]> {
    const res = await this.http.request(`${COPART_BASE}/public/data/lotdetails/solr/lotImages/${encodeURIComponent(sourceLotId)}/USA`, {
      headers: { Accept: 'application/json' },
    });
    assertNotBlocked(this.id, res, true);
    const json = parseJson(this.id, 'lotImages', res.body) as { data?: { imagesList?: { FULL_IMAGE?: Array<{ url: string; sequence?: number }>; THUMBNAIL_IMAGE?: Array<{ url: string }> } } };
    const full = json.data?.imagesList?.FULL_IMAGE;
    if (!Array.isArray(full)) throw new SchemaChangedError(this.id, 'lotImages', ['data.imagesList.FULL_IMAGE missing']);
    const thumbs = json.data?.imagesList?.THUMBNAIL_IMAGE ?? [];
    return full.map((img, i) => ({ url: img.url, thumbUrl: thumbs[i]?.url, order: img.sequence ?? i }));
  }
}

function parseJson(providerId: string, where: string, body: string): unknown {
  try { return JSON.parse(body); } catch { throw new SchemaChangedError(providerId, where, ['response is not JSON']); }
}
