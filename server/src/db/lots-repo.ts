// Writes normalised lots. Unique key: (source, source_lot_id). Upsert only — never duplicates.

import { createHash } from 'node:crypto';
import type { NormalizedLot } from '../domain/lot.js';
import type { Db } from './client.js';

export type UpsertOutcome = 'inserted' | 'updated' | 'unchanged';

/** Hash of everything we show, so re-seeing an identical lot only bumps last_seen_at. */
export function contentHash(lot: NormalizedLot): string {
  const { rawJson: _raw, ...visible } = lot;
  return createHash('sha1').update(stableStringify(visible)).digest('hex');
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter(k => o[k] !== undefined).map(k => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

const COLUMNS = [
  'source', 'source_lot_id', 'stock_number', 'lot_url', 'vin', 'vin_masked', 'year', 'make', 'model', 'trim',
  'body_type', 'body_style_raw', 'color', 'engine_raw', 'engine_l', 'cylinders', 'fuel', 'transmission', 'drive',
  'odometer_mi', 'odometer_km', 'odometer_status', 'primary_damage', 'primary_damage_raw', 'secondary_damage',
  'secondary_damage_raw', 'title_type', 'title_raw', 'title_state', 'keys', 'drivability', 'location_city',
  'location_state', 'location_zip', 'location_branch', 'location_lat', 'location_lng', 'sale_date',
  'current_bid_usd', 'buy_now_usd', 'photos', 'status', 'source_status', 'content_hash', 'raw_json',
] as const;

function toRow(l: NormalizedLot, hash: string): unknown[] {
  return [
    l.source, l.sourceLotId, l.stockNumber, l.lotUrl, l.vin, l.vinMasked, l.year, l.make, l.model, l.trim,
    l.bodyType, l.bodyStyleRaw, l.color, l.engineRaw, l.engineL, l.cylinders, l.fuel, l.transmission, l.drive,
    l.odometerMi, l.odometerKm, l.odometerStatus, l.primaryDamage, l.primaryDamageRaw, l.secondaryDamage,
    l.secondaryDamageRaw, l.titleType, l.titleRaw, l.titleState, l.keys, l.drivability, l.location.city,
    l.location.state, l.location.zip, l.location.branch, l.location.lat, l.location.lng, l.saleDate,
    l.currentBidUsd, l.buyNowUsd, JSON.stringify(l.photos), l.status, l.sourceStatus, hash, JSON.stringify(l.rawJson ?? null),
  ];
}

const placeholders = COLUMNS.map((c, i) => (c === 'photos' || c === 'raw_json' ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(', ');
const updates = COLUMNS.filter(c => c !== 'source' && c !== 'source_lot_id').map(c => `${c} = EXCLUDED.${c}`).join(',\n    ');

// `prev` reads the row as it was before this statement, so we can tell inserted / updated / unchanged.
const UPSERT_SQL = `
WITH prev AS (
  SELECT content_hash, status FROM lots WHERE source = $1 AND source_lot_id = $2
)
INSERT INTO lots (${COLUMNS.join(', ')})
VALUES (${placeholders})
ON CONFLICT (source, source_lot_id) DO UPDATE SET
    ${updates},
    last_seen_at = now(),
    updated_at = CASE WHEN lots.content_hash IS DISTINCT FROM EXCLUDED.content_hash THEN now() ELSE lots.updated_at END,
    status_changed_at = CASE WHEN lots.status IS DISTINCT FROM EXCLUDED.status THEN now() ELSE lots.status_changed_at END
RETURNING id, (SELECT content_hash FROM prev) AS prev_hash`;

export class LotsRepo {
  constructor(private readonly db: Db) {}

  async upsert(lot: NormalizedLot): Promise<{ id: number; outcome: UpsertOutcome }> {
    const hash = contentHash(lot);
    const { rows } = await this.db.query<{ id: string | number; prev_hash: string | null }>(UPSERT_SQL, toRow(lot, hash));
    const r = rows[0]!;
    const outcome: UpsertOutcome = r.prev_hash === null ? 'inserted' : r.prev_hash === hash ? 'unchanged' : 'updated';
    return { id: Number(r.id), outcome };
  }

  async count(): Promise<number> {
    const { rows } = await this.db.query<{ n: string | number }>('SELECT count(*) AS n FROM lots');
    return Number(rows[0]!.n);
  }
}
