// IAAI provider.
// Discovery: IAAI's official XML sitemap lists lot pages (robots.txt disallows /Search, so we don't use it).
// Details: each lot page embeds a ProductDetailsVM JSON object.
// Photos: listed inside that JSON; vis.iaai.com/dimensions is the fallback.

import type { FilterSet } from '../config/filters.js';
import type { NormalizedLot, Photo } from '../domain/lot.js';
import {
  extractProductDetails, IAAI_IMAGE_BASE, iaaiLotUrl, iaaiPhotosFromKeys, isIaaiNotFoundPage, normalizeIaai,
} from '../normalize/iaai.js';
import { SchemaChangedError } from './errors.js';
import { assertNotBlocked, type HttpClient } from './http.js';
import type { AuctionProvider, PageToken, SearchPage } from './types.js';

export interface IaaiProviderOptions {
  sitemapIndexUrl: string;
}

export class IaaiProvider implements AuctionProvider {
  readonly id = 'iaai-web';
  readonly source = 'iaai' as const;
  readonly capabilities = { serverSideFilters: false, searchReturnsFullLots: false, exposesCurrentBid: false };

  private vehicleSitemaps: string[] | null = null;

  constructor(private readonly http: HttpClient, private readonly opts: IaaiProviderOptions) {}

  /** The sitemap can't filter, so `filters` is ignored here; sync applies them after getLot(). Page = sitemap file index. */
  async searchLots(_filters: FilterSet, page: PageToken | null): Promise<SearchPage> {
    const files = await this.listVehicleSitemaps();
    const index = page === null ? 0 : Number(page);
    const file = files[index];
    if (!file) return { items: [], nextPage: null };

    const res = await this.http.request(file);
    assertNotBlocked(this.id, res);
    const items = parseVehicleSitemap(res.body);
    if (!items.length && res.body.length > 0) {
      throw new SchemaChangedError(this.id, `sitemap ${file}`, ['no <url><loc>…/vehicledetail/{id}~US</loc> entries found']);
    }
    return { items, nextPage: index + 1 < files.length ? String(index + 1) : null, totalEstimate: files.length };
  }

  async getLot(sourceLotId: string): Promise<NormalizedLot | null> {
    const res = await this.http.request(iaaiLotUrl(sourceLotId));
    if (res.status === 404) return null;
    assertNotBlocked(this.id, res);
    if (isIaaiNotFoundPage(res.body)) return null;
    const vm = extractProductDetails(res.body);
    if (!vm) throw new SchemaChangedError(this.id, `lot page ${sourceLotId}`, ['<script id="ProductDetailsVM"> not found']);
    return normalizeIaai(vm);
  }

  async getPhotos(sourceLotId: string): Promise<Photo[]> {
    const res = await this.http.request(`${IAAI_IMAGE_BASE}/dimensions?imageKeys=${encodeURIComponent(sourceLotId)}~SID`, {
      headers: { Accept: 'application/json' },
    });
    assertNotBlocked(this.id, res, true);
    let json: { keys?: unknown };
    try { json = JSON.parse(res.body); } catch { throw new SchemaChangedError(this.id, 'dimensions', ['response is not JSON']); }
    if (!Array.isArray(json.keys)) throw new SchemaChangedError(this.id, 'dimensions', ['"keys" array missing']);
    return iaaiPhotosFromKeys(json.keys as Array<{ K?: string; W?: number; H?: number }>);
  }

  /** Vehicle sitemap files from the sitemap index (ms-sitemap1.xml … ms-sitemapN.xml; not make/branch pages). */
  private async listVehicleSitemaps(): Promise<string[]> {
    if (this.vehicleSitemaps) return this.vehicleSitemaps;
    const res = await this.http.request(this.opts.sitemapIndexUrl);
    assertNotBlocked(this.id, res);
    const files = [...res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]!).filter(u => /\/ms-sitemap\d+\.xml$/i.test(u));
    if (!files.length) throw new SchemaChangedError(this.id, 'sitemap index', ['no ms-sitemapN.xml entries']);
    this.vehicleSitemaps = files;
    return files;
  }
}

export function parseVehicleSitemap(xml: string): Array<{ sourceLotId: string; url: string; lastModified: string | null }> {
  const out: Array<{ sourceLotId: string; url: string; lastModified: string | null }> = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const block = m[1]!;
    const loc = block.match(/<loc>\s*([^<\s]+)\s*<\/loc>/)?.[1];
    const id = loc?.match(/\/vehicledetail\/(\d+)~US/i)?.[1];
    if (!loc || !id) continue;
    out.push({ sourceLotId: id, url: loc, lastModified: block.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/)?.[1] ?? null });
  }
  return out;
}
