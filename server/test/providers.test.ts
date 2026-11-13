// Providers against recorded responses (no network).
import { describe, expect, it } from 'vitest';
import { FilterSetSchema } from '../src/config/filters.js';
import { CopartProvider, copartSearchBody } from '../src/providers/copart.js';
import { ProviderBlockedError, SchemaChangedError, TransientError } from '../src/providers/errors.js';
import { IaaiProvider, parseVehicleSitemap } from '../src/providers/iaai.js';
import { FakeHttp, fixture } from './helpers.js';

const filters = FilterSetSchema.parse({ name: 't', makes: ['Toyota', 'Lexus'], yearFrom: 2015, states: ['tx'] });
const INDEX = 'https://www.iaai.com/Xj9rDOVMEi0hc38S/sitemap_index.xml';

describe('IaaiProvider', () => {
  const http = new FakeHttp([
    ['sitemap_index.xml', { body: fixture('iaai/sitemap-index.xml') }],
    ['ms-sitemap', { body: fixture('iaai/sitemap-page.sample.xml') }],
    ['VehicleDetail/47107083~US', { body: fixture('iaai/lot-page.trimmed.html') }],
    ['VehicleDetail/1~US', { body: fixture('iaai/lot-not-found.trimmed.html') }],
    ['/dimensions?', { body: fixture('iaai/dimensions.sample.json') }],
  ]);
  const p = new IaaiProvider(http, { sitemapIndexUrl: INDEX });

  it('declares that it filters locally', () => {
    expect(p.capabilities.serverSideFilters).toBe(false);
  });

  it('searchLots pages through vehicle sitemap files only', async () => {
    const first = await p.searchLots(filters, null);
    expect(first.items).toHaveLength(25);
    expect(first.items[0]).toEqual({ sourceLotId: '30060949', url: 'https://www.iaai.com/vehicledetail/30060949~US/', lastModified: '2026-11-11' });
    expect(first.nextPage).toBe('1');
    expect(first.totalEstimate).toBe(10); // ms-sitemap1..10; make/branch sitemaps are skipped
    const last = await p.searchLots(filters, '9');
    expect(last.nextPage).toBeNull();
  });

  it('getLot parses a lot page; returns null for "not found"', async () => {
    expect((await p.getLot('47107083'))?.make).toBe('Hyundai');
    expect(await p.getLot('1')).toBeNull();
  });

  it('getPhotos uses the dimensions endpoint', async () => {
    const photos = await p.getPhotos('47107083');
    expect(photos.length).toBeGreaterThan(5);
    expect(photos[0]!.url).toContain('imageKeys=47107083~SID~B647~S0~I1');
  });

  it('a challenge page stops the provider instead of being parsed', async () => {
    const blocked = new IaaiProvider(new FakeHttp([[/.*/, { status: 200, body: fixture('copart/imperva-challenge.html') }]]), { sitemapIndexUrl: INDEX });
    await expect(blocked.getLot('47107083')).rejects.toBeInstanceOf(ProviderBlockedError);
  });

  it('403 and 429 are blocks; 5xx is transient', async () => {
    for (const status of [403, 429]) {
      const q = new IaaiProvider(new FakeHttp([[/.*/, { status, body: '' }]]), { sitemapIndexUrl: INDEX });
      await expect(q.getLot('5')).rejects.toBeInstanceOf(ProviderBlockedError);
    }
    const q = new IaaiProvider(new FakeHttp([[/.*/, { status: 503, body: 'down' }]]), { sitemapIndexUrl: INDEX });
    await expect(q.getLot('5')).rejects.toBeInstanceOf(TransientError);
  });

  it('a lot page without the data script is a structure change', async () => {
    const q = new IaaiProvider(new FakeHttp([[/.*/, { body: '<html><head><title>2020 FORD</title></head><body>new layout</body></html>' }]]), { sitemapIndexUrl: INDEX });
    await expect(q.getLot('5')).rejects.toBeInstanceOf(SchemaChangedError);
  });

  it('parseVehicleSitemap ignores non-vehicle URLs', () => {
    expect(parseVehicleSitemap('<urlset><url><loc>https://www.iaai.com/locations</loc></url></urlset>')).toEqual([]);
  });
});

describe('CopartProvider', () => {
  it('real Imperva challenge (HTTP 307) -> ProviderBlockedError, nothing parsed', async () => {
    const p = new CopartProvider(new FakeHttp([[/.*/, { status: 307, body: fixture('copart/imperva-challenge.html') }]]));
    await expect(p.searchLots(filters, null)).rejects.toBeInstanceOf(ProviderBlockedError);
    await expect(p.getLot('72389104')).rejects.toBeInstanceOf(ProviderBlockedError);
  });

  it('real script-only Imperva challenge with HTTP 200 (seen 13 Nov 2026) -> blocked, named clearly', async () => {
    const p = new CopartProvider(new FakeHttp([[/.*/, { status: 200, body: fixture('copart/imperva-challenge-200.html') }]]));
    await expect(p.searchLots(filters, null)).rejects.toThrow(/Imperva JavaScript challenge \(script-only page\)/);
  });

  it('maps a synthetic search response if Copart ever serves JSON', async () => {
    const p = new CopartProvider(new FakeHttp([[/search-results/, { body: fixture('copart/search-results.synthetic.json') }]]));
    const page = await p.searchLots(filters, null);
    expect(page.items.map(i => i.lot?.make)).toEqual(['Tesla', 'Dodge']);
    expect(page.nextPage).toBeNull();
  });

  it('builds the search body from a filter set', () => {
    expect(copartSearchBody(filters, 2)).toMatchObject({
      filter: { MAKE: ['lot_make_desc:"TOYOTA"', 'lot_make_desc:"LEXUS"'], YEAR: ['lot_year:[2015 TO *]'], LOC: ['yard_state_code:"TX"'] },
      page: 2, start: 200,
    });
  });
});
