// Initial import: walk a provider's results, keep lots that pass our filters, upsert them.
// Stops at `limit` matched lots, on a block (pause the source), or on a structure change (fail the run).

import { matchesAny, type FilterSet } from '../config/filters.js';
import type { Db } from '../db/client.js';
import { LotsRepo } from '../db/lots-repo.js';
import { ProviderBlockedError, SchemaChangedError } from '../providers/errors.js';
import type { AuctionProvider, SearchItem } from '../providers/types.js';

export interface ImportOptions {
  limit: number;                 // stop after this many matched lots (Infinity = no limit)
  maxChecks?: number;            // safety cap on lot pages fetched
  skipKnown?: boolean;           // don't re-fetch lots already in the database
  log?: (msg: string) => void;
  now?: () => number;
}

export interface ImportResult {
  runId: number;
  status: 'ok' | 'failed' | 'blocked' | 'stopped';
  checked: number; matched: number; added: number; updated: number; unchanged: number; skipped: number; errors: number;
  message: string | null;
}

export async function runInitialImport(db: Db, provider: AuctionProvider, filterSets: FilterSet[], opts: ImportOptions): Promise<ImportResult> {
  const log = opts.log ?? (() => {});
  const now = opts.now ?? Date.now;
  const repo = new LotsRepo(db);
  const sets = filterSets.filter(f => f.sources.includes(provider.source));
  const r: ImportResult = { runId: 0, status: 'ok', checked: 0, matched: 0, added: 0, updated: 0, unchanged: 0, skipped: 0, errors: 0, message: null };

  const { rows } = await db.query<{ id: string }>(`INSERT INTO sync_runs (provider_id, kind) VALUES ($1, 'initial') RETURNING id`, [provider.id]);
  r.runId = Number(rows[0]!.id);
  if (!sets.length) {
    r.message = 'no filter set applies to this source';
    return finish(db, r, null);
  }

  const known = new Set<string>();
  if (opts.skipKnown) {
    const k = await db.query<{ source_lot_id: string }>('SELECT source_lot_id FROM lots WHERE source = $1', [provider.source]);
    k.rows.forEach(x => known.add(x.source_lot_id));
  }

  let page: string | null = null;
  const maxChecks = opts.maxChecks ?? Infinity;
  try {
    outer: do {
      // Sources that filter server-side only need one filter set per query; IAAI ignores filters in search.
      const res = await provider.searchLots(sets[0]!, page);
      // Freshest sitemap entries first: most likely to be upcoming auctions.
      const items: SearchItem[] = [...res.items].sort((a, b) => (b.lastModified ?? '').localeCompare(a.lastModified ?? ''));
      log(`page ${page ?? 0}: ${items.length} candidates`);

      for (const item of items) {
        if (r.matched >= opts.limit || r.checked >= maxChecks) break outer;
        if (known.has(item.sourceLotId)) continue;

        const lot = item.lot ?? (await provider.getLot(item.sourceLotId));
        r.checked++;
        if (!lot) { r.skipped++; continue; }                                         // not found / withdrawn
        if (lot.saleDate && Date.parse(lot.saleDate) < now()) { r.skipped++; continue; } // auction already over
        if (!matchesAny(lot, sets)) { r.skipped++; continue; }

        const { outcome } = await repo.upsert(lot);
        r.matched++;
        r[outcome === 'inserted' ? 'added' : outcome === 'updated' ? 'updated' : 'unchanged']++;
        log(`#${r.matched} ${lot.year} ${lot.make} ${lot.model} · ${lot.primaryDamage ?? '-'} · ${lot.location.state ?? '-'} · ${outcome}`);
        if (r.checked % 25 === 0) await progress(db, r, page);
      }
      page = res.nextPage;
    } while (page !== null);
  } catch (e) {
    if (e instanceof ProviderBlockedError) { r.status = 'blocked'; r.message = e.message; }
    else if (e instanceof SchemaChangedError) { r.status = 'failed'; r.message = e.message; }
    else { r.status = 'failed'; r.errors++; r.message = (e as Error).message; }
    log(`STOP (${r.status}): ${r.message}`);
  }
  if (r.status === 'ok' && r.matched >= opts.limit) r.message = `limit of ${opts.limit} reached`;
  return finish(db, r, page);
}

async function progress(db: Db, r: ImportResult, cursor: string | null) {
  await db.query(
    `UPDATE sync_runs SET lots_checked=$2, lots_matched=$3, lots_added=$4, lots_updated=$5, lots_unchanged=$6, lots_skipped=$7, errors=$8, cursor=$9 WHERE id=$1`,
    [r.runId, r.checked, r.matched, r.added, r.updated, r.unchanged, r.skipped, r.errors, cursor],
  );
}

async function finish(db: Db, r: ImportResult, cursor: string | null): Promise<ImportResult> {
  await progress(db, r, cursor);
  await db.query(`UPDATE sync_runs SET finished_at=now(), status=$2, message=$3 WHERE id=$1`, [r.runId, r.status, r.message]);
  return r;
}
