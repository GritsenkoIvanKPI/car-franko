import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileFilterSource, FilterSetSchema, matchesAny, matchesFilterSet } from '../src/config/filters.js';
import { normalizeIaai } from '../src/normalize/iaai.js';
import { fixture, fixtureJson } from './helpers.js';

const infiniti = normalizeIaai(fixtureJson('iaai/lot-2021-infiniti-q60-salvage.vm.json'));
const nissan98 = normalizeIaai(fixtureJson('iaai/lot-1998-nissan-pathfinder.vm.json'));
const f = (o: object) => FilterSetSchema.parse({ name: 't', ...o });

describe('matchesFilterSet', () => {
  it('makes are case-insensitive', () => {
    expect(matchesFilterSet(infiniti, f({ makes: ['infiniti'] }))).toBe(true);
    expect(matchesFilterSet(infiniti, f({ makes: ['Toyota'] }))).toBe(false);
  });
  it('models use "MAKE MODEL" with whole-word prefix', () => {
    expect(matchesFilterSet(infiniti, f({ models: ['Infiniti Q60'] }))).toBe(true);
    expect(matchesFilterSet(infiniti, f({ models: ['Infiniti Q6'] }))).toBe(false);
  });
  it('year range drops the 1998 lot', () => {
    expect(matchesFilterSet(nissan98, f({ yearFrom: 2015 }))).toBe(false);
    expect(matchesFilterSet(infiniti, f({ yearFrom: 2015, yearTo: 2021 }))).toBe(true);
  });
  it('damage include / exclude, title, drivability, state', () => {
    expect(matchesFilterSet(infiniti, f({ damageTypes: ['front_end'] }))).toBe(false);
    expect(matchesFilterSet(infiniti, f({ excludeDamageTypes: ['side'] }))).toBe(false);
    expect(matchesFilterSet(infiniti, f({ titleTypes: ['salvage'], drivability: ['run_drive'], states: ['il'] }))).toBe(true);
    expect(matchesFilterSet(infiniti, f({ sources: ['copart'] }))).toBe(false);
  });
  it('unpriced lots (IAAI hides bids) follow includeUnpriced', () => {
    expect(matchesFilterSet(infiniti, f({ priceMax: 10000 }))).toBe(true);
    expect(matchesFilterSet(infiniti, f({ priceMax: 10000, includeUnpriced: false }))).toBe(false);
    expect(matchesFilterSet({ ...infiniti, buyNowUsd: 12000 }, f({ priceMax: 10000 }))).toBe(false);
  });
  it('matchesAny: OR across filter sets', () => {
    expect(matchesAny(nissan98, [f({ yearFrom: 2015 }), f({ makes: ['Nissan'] })])).toBe(true);
  });
});

describe('FileFilterSource', () => {
  it('loads the example file and skips disabled sets', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'filters-'));
    const path = join(dir, 'f.json');
    const example = JSON.parse(fixture('../../config/filters.example.json'));
    example.filterSets.push({ name: 'off', enabled: false });
    await writeFile(path, JSON.stringify(example));
    const sets = await new FileFilterSource(path).load();
    expect(sets.map(s => s.name)).toEqual(['main-brands-2015plus']);
    expect(sets[0]!.makes).toContain('MERCEDES-BENZ');
  });
  it('rejects invalid values with a readable message', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'filters-'));
    const path = join(dir, 'bad.json');
    await writeFile(path, JSON.stringify({ filterSets: [{ name: 'x', damageTypes: ['smashed'] }] }));
    await expect(new FileFilterSource(path).load()).rejects.toThrow(/damageTypes/);
  });
});
