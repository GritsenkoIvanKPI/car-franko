import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { FilterSetSchema } from '../src/config/filters.js';
import type { Db } from '../src/db/client.js';
import { migrate } from '../src/db/migrate.js';
import { TransientError } from '../src/providers/errors.js';
import type { HttpClient, HttpResponse } from '../src/providers/http.js';
import { IaaiProvider } from '../src/providers/iaai.js';
import { runInitialImport } from '../src/sync/initial-import.js';
import { PoliteHttpClient } from '../src/sync/polite-http.js';
import { FakeHttp, fixture } from './helpers.js';

function pgliteDb(): Db {
  const pg = new PGlite();
  return {
    query: async <T>(sql: string, params: unknown[] = []) => {
      if (!params.length && /;\s*\S/.test(sql.trim().replace(/;\s*$/, ''))) { await pg.exec(sql); return { rows: [] as T[] }; }
      return { rows: (await pg.query<T>(sql, params as any[])).rows };
    },
    close: () => pg.close(),
  };
}

describe('PoliteHttpClient', () => {
  const ok = (url: string): HttpResponse => ({ status: 200, url, headers: new Headers(), body: 'ok' });

  it('runs one request at a time with a gap in [min, max]', async () => {
    const waits: number[] = [];
    let active = 0, maxActive = 0;
    const inner: HttpClient = { request: async url => { active++; maxActive = Math.max(maxActive, active); await new Promise(r => setTimeout(r, 2)); active--; return ok(url); } };
    const c = new PoliteHttpClient(inner, { minDelayMs: 2000, maxDelayMs: 3000, retries: 0, backoffBaseMs: 10, sleep: async ms => { waits.push(ms); } });
    await Promise.all([c.request('a'), c.request('b'), c.request('c')]);
    expect(maxActive).toBe(1);
    expect(c.stats.requests).toBe(3);
    // first request has no previous one; the next two must wait (fake sleep returns instantly, so wait ≈ gap)
    for (const w of waits.slice(-2)) { expect(w).toBeGreaterThan(1900); expect(w).toBeLessThanOrEqual(3000); }
  });

  it('retries 5xx / network errors with growing backoff, then gives up', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const inner: HttpClient = { request: async url => { calls++; if (calls < 3) throw new TransientError('t', 'boom'); return ok(url); } };
    const c = new PoliteHttpClient(inner, { minDelayMs: 1000, maxDelayMs: 1000, retries: 3, backoffBaseMs: 100, sleep: async ms => { sleeps.push(ms); } });
    await c.request('x');
    expect(calls).toBe(3);
    expect(c.stats.retries).toBe(2);
    const backoffs = sleeps.filter(s => s < 900);
    expect(backoffs[1]!).toBeGreaterThan(backoffs[0]!);

    const always503: HttpClient = { request: async url => ({ status: 503, url, headers: new Headers(), body: '' }) };
    const d = new PoliteHttpClient(always503, { minDelayMs: 1000, maxDelayMs: 1000, retries: 2, backoffBaseMs: 1, sleep: async () => {} });
    expect((await d.request('y')).status).toBe(503); // final 5xx is returned; provider turns it into TransientError
    expect(d.stats.requests).toBe(3);
  });

  it('never retries a 403', async () => {
    let calls = 0;
    const inner: HttpClient = { request: async url => { calls++; return { status: 403, url, headers: new Headers(), body: '' }; } };
    const c = new PoliteHttpClient(inner, { minDelayMs: 1000, maxDelayMs: 1000, retries: 3, backoffBaseMs: 1, sleep: async () => {} });
    expect((await c.request('z')).status).toBe(403);
    expect(calls).toBe(1);
  });
});

describe('runInitialImport', () => {
  const sitemap = `<urlset>${['46257118', '46492016', '46561005', '47107083', '1'].map((id, i) =>
    `<url><loc>https://www.iaai.com/vehicledetail/${id}~US/</loc><lastmod>2026-11-1${i}</lastmod></url>`).join('')}</urlset>`;
  const lotPages: Record<string, string> = {
    '46257118': 'lot-2021-infiniti-q60-salvage', '46492016': 'lot-1998-nissan-pathfinder',
    '46561005': 'lot-2015-mercedes-cla250', '47107083': 'lot-2009-hyundai-santa-fe',
  };
  const page = (name: string) => `<html><script type="application/json" id="ProductDetailsVM">${fixture(`iaai/${name}.vm.json`)}</script></html>`;
  const routes = (): ConstructorParameters<typeof FakeHttp>[0] => [
    ['sitemap_index.xml', { body: '<sitemapindex><sitemap><loc>https://www.iaai.com/x/ms-sitemap1.xml</loc></sitemap></sitemapindex>' }],
    ['ms-sitemap1.xml', { body: sitemap }],
    ...Object.entries(lotPages).map(([id, name]) => [`VehicleDetail/${id}~US`, { body: page(name) }] as [string, { body: string }]),
    ['VehicleDetail/1~US', { body: fixture('iaai/lot-not-found.trimmed.html') }],
  ];
  const filters = [FilterSetSchema.parse({ name: 'f', yearFrom: 2015 })];
  const beforeSales = () => Date.parse('2026-11-01T00:00:00Z');

  it('imports matching lots, skips old / not found, records the run', async () => {
    const db = pgliteDb(); await migrate(db);
    const p = new IaaiProvider(new FakeHttp(routes()), { sitemapIndexUrl: 'https://www.iaai.com/x/sitemap_index.xml' });
    const r = await runInitialImport(db, p, filters, { limit: 10, now: beforeSales });
    expect(r).toMatchObject({ status: 'ok', checked: 5, matched: 2, added: 2, skipped: 3 }); // 2015+ only: Infiniti, Mercedes
    const run = (await db.query<any>('SELECT * FROM sync_runs WHERE id = $1', [r.runId])).rows[0];
    expect(run).toMatchObject({ status: 'ok', lots_added: 2, lots_skipped: 3, kind: 'initial' });
    expect(run.finished_at).not.toBeNull();
  });

  it('stops at the limit and skips lots already stored on the next run', async () => {
    const db = pgliteDb(); await migrate(db);
    const http = new FakeHttp(routes());
    const p = new IaaiProvider(http, { sitemapIndexUrl: 'https://www.iaai.com/x/sitemap_index.xml' });
    const r1 = await runInitialImport(db, p, filters, { limit: 1, now: beforeSales });
    expect(r1).toMatchObject({ matched: 1, message: 'limit of 1 reached' });
    const r2 = await runInitialImport(db, p, filters, { limit: 10, now: beforeSales, skipKnown: true });
    expect(r2.added).toBe(1);
    expect((await db.query<{ n: string }>('SELECT count(*) n FROM lots')).rows[0]!.n).toBe(2);
  });

  it('skips lots whose auction is already over', async () => {
    const db = pgliteDb(); await migrate(db);
    const p = new IaaiProvider(new FakeHttp(routes()), { sitemapIndexUrl: 'https://www.iaai.com/x/sitemap_index.xml' });
    const r = await runInitialImport(db, p, filters, { limit: 10, now: () => Date.parse('2027-01-01T00:00:00Z') });
    expect(r.matched).toBe(0);
  });

  it('a block page ends the run as "blocked" without writing anything', async () => {
    const db = pgliteDb(); await migrate(db);
    const r0 = routes();
    r0.splice(2, 0, ['VehicleDetail/', { body: fixture('copart/imperva-challenge.html') }]);
    const p = new IaaiProvider(new FakeHttp(r0), { sitemapIndexUrl: 'https://www.iaai.com/x/sitemap_index.xml' });
    const r = await runInitialImport(db, p, filters, { limit: 10, now: beforeSales });
    expect(r.status).toBe('blocked');
    expect(r.message).toMatch(/Imperva/);
    expect((await db.query<{ n: string }>('SELECT count(*) n FROM lots')).rows[0]!.n).toBe(0);
  });
});
