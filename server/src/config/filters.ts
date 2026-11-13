// Which lots we import. Filter sets are data, not code: today they come from a JSON file
// (FILTERS_FILE); later an admin panel can store them in the database behind the same FilterSource.

import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { DAMAGE_TYPES, DRIVABILITY, SOURCES, TITLE_TYPES, type NormalizedLot } from '../domain/lot.js';

const upperList = z.array(z.string().min(1)).transform(a => a.map(s => s.trim().toUpperCase()));

export const FilterSetSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  sources: z.array(z.enum(SOURCES)).default([...SOURCES]),
  makes: upperList.optional(),              // ["TOYOTA", "MERCEDES-BENZ"]
  models: upperList.optional(),             // ["TOYOTA CAMRY", "LEXUS RX"] — "MAKE MODEL", prefix match on model
  yearFrom: z.number().int().optional(),
  yearTo: z.number().int().optional(),
  damageTypes: z.array(z.enum(DAMAGE_TYPES)).optional(),        // primary damage
  excludeDamageTypes: z.array(z.enum(DAMAGE_TYPES)).optional(),
  titleTypes: z.array(z.enum(TITLE_TYPES)).optional(),
  drivability: z.array(z.enum(DRIVABILITY)).optional(),
  states: upperList.optional(),             // US state codes: ["TX", "FL"]
  priceMin: z.number().nonnegative().optional(), // applies to current bid, or Buy Now when no bid is visible
  priceMax: z.number().nonnegative().optional(),
  includeUnpriced: z.boolean().default(true),    // IAAI hides bids from guests; keep those lots unless set false
  odometerMaxMi: z.number().positive().optional(),
});
export type FilterSet = z.infer<typeof FilterSetSchema>;

export const FiltersFileSchema = z.object({ filterSets: z.array(FilterSetSchema).min(1) });

export interface FilterSource {
  load(): Promise<FilterSet[]>;
}

export class FileFilterSource implements FilterSource {
  constructor(private readonly path: string) {}
  async load(): Promise<FilterSet[]> {
    const json = JSON.parse(await readFile(this.path, 'utf8'));
    const parsed = FiltersFileSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Invalid filters file ${this.path}: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    }
    return parsed.data.filterSets.filter(f => f.enabled);
  }
}

/** Does a normalised lot fall inside a filter set? Used for sources that can't filter server-side. */
export function matchesFilterSet(lot: NormalizedLot, f: FilterSet): boolean {
  if (!f.sources.includes(lot.source)) return false;
  const make = lot.make.toUpperCase();
  if (f.makes?.length && !f.makes.includes(make)) return false;
  if (f.models?.length) {
    const mm = `${make} ${lot.model.toUpperCase()}`;
    if (!f.models.some(m => mm === m || mm.startsWith(`${m} `))) return false;
  }
  if (f.yearFrom !== undefined && lot.year < f.yearFrom) return false;
  if (f.yearTo !== undefined && lot.year > f.yearTo) return false;
  if (f.damageTypes?.length && (!lot.primaryDamage || !f.damageTypes.includes(lot.primaryDamage))) return false;
  if (f.excludeDamageTypes?.length && lot.primaryDamage && f.excludeDamageTypes.includes(lot.primaryDamage)) return false;
  if (f.titleTypes?.length && (!lot.titleType || !f.titleTypes.includes(lot.titleType))) return false;
  if (f.drivability?.length && !f.drivability.includes(lot.drivability)) return false;
  if (f.states?.length && (!lot.location.state || !f.states.includes(lot.location.state))) return false;
  if (f.odometerMaxMi !== undefined && lot.odometerMi !== null && lot.odometerMi > f.odometerMaxMi) return false;
  const price = lot.currentBidUsd ?? lot.buyNowUsd;
  if (price === null) return f.includeUnpriced;
  if (f.priceMin !== undefined && price < f.priceMin) return false;
  if (f.priceMax !== undefined && price > f.priceMax) return false;
  return true;
}

export const matchesAny = (lot: NormalizedLot, sets: FilterSet[]) => sets.some(f => matchesFilterSet(lot, f));
