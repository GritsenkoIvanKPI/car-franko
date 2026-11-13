// Upsert behaviour on a real PostgreSQL engine (PGlite, in-process).
import { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/client.js';
import { LotsRepo } from '../src/db/lots-repo.js';
import { migrate } from '../src/db/migrate.js';
import { normalizeIaai } from '../src/normalize/iaai.js';
import { fixtureJson } from './helpers.js';

function pgliteDb(): Db {
  const pg = new PGlite();
  return {
    query: async <T>(sql: string, params: unknown[] = []) => {
      // PGlite runs multi-statement SQL (migrations) through exec(); parameterised queries through query().
      if (!params.length && /;\s*\S/.test(sql.trim().replace(/;\s*$/, ''))) { await pg.exec(sql); return { rows: [] as T[] }; }
      const r = await pg.query<T>(sql, params as any[]);
      return { rows: r.rows };
    },
    close: () => pg.close(),
  };
}

const lot = () => normalizeIaai(fixtureJson('iaai/lot-2021-infiniti-q60-salvage.vm.json'));

describe('LotsRepo.upsert', () => {
  let db: Db;
  let repo: LotsRepo;
  beforeEach(async () => {
    db = pgliteDb();
    await migrate(db);
    repo = new LotsRepo(db);
  });

  it('inserts, then reports unchanged for identical data, then updated', async () => {
    const a = await repo.upsert(lot());
    expect(a.outcome).toBe('inserted');
    const b = await repo.upsert(lot());
    expect(b).toEqual({ id: a.id, outcome: 'unchanged' });
    const c = await repo.upsert({ ...lot(), saleDate: '2026-11-20T15:30:00.000Z' });
    expect(c).toEqual({ id: a.id, outcome: 'updated' });
    expect(await repo.count()).toBe(1);
  });

  it('(source, source_lot_id) is unique; same id on another source is a different lot', async () => {
    await repo.upsert(lot());
    await repo.upsert({ ...lot(), source: 'copart' });
    await repo.upsert(lot());
    expect(await repo.count()).toBe(2);
  });

  it('stores normalised columns, photos and raw JSON; keeps first_seen_at on update', async () => {
    const { id } = await repo.upsert(lot());
    const before = (await db.query<{ first_seen_at: Date }>('SELECT first_seen_at FROM lots WHERE id = $1', [id])).rows[0]!;
    await repo.upsert({ ...lot(), currentBidUsd: 5000 });
    const { rows } = await db.query<any>('SELECT * FROM lots WHERE id = $1', [id]);
    const r = rows[0];
    expect(r).toMatchObject({ source: 'iaai', source_lot_id: '46257118', make: 'Infiniti', model: 'Q60', year: 2021, title_type: 'salvage', location_state: 'IL', status: 'active', vin_masked: true });
    expect(Number(r.current_bid_usd)).toBe(5000);
    expect(r.photos).toHaveLength(16);
    expect(String(r.raw_json.inventoryView.itemId)).toBe('46257118'); // raw payload kept untouched
    expect(new Date(r.first_seen_at).getTime()).toBe(new Date(before.first_seen_at).getTime());
    expect(new Date(r.sale_date).toISOString()).toBe('2026-11-17T15:30:00.000Z');
  });

  it('migrations are idempotent', async () => {
    expect(await migrate(db)).toEqual([]);
  });
});
