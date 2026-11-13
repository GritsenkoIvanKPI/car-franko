// Copart normalisation. NOTE: the sample is synthetic (see fixture _note) because Copart blocked
// every request during research. These tests pin our mapping logic, not Copart's real format.
import { describe, expect, it } from 'vitest';
import { normalizeCopart } from '../src/normalize/copart.js';
import { SchemaChangedError } from '../src/providers/errors.js';
import { fixtureJson } from './helpers.js';

const content = fixtureJson<{ data: { results: { content: unknown[] } } }>('copart/search-results.synthetic.json').data.results.content;

describe('normalizeCopart (synthetic sample)', () => {
  it('maps a full lot', () => {
    const lot = normalizeCopart(content[0]);
    expect(lot).toMatchObject({
      source: 'copart', sourceLotId: '72389104', stockNumber: null, lotUrl: 'https://www.copart.com/lot/72389104',
      year: 2022, make: 'Tesla', model: 'Model Y', trim: 'LONG RANGE', fuel: 'electric', drive: 'awd', bodyType: 'suv',
      primaryDamage: 'front_end', secondaryDamage: 'minor_dents', titleType: 'salvage', keys: true, drivability: 'run_drive',
      currentBidUsd: 16900, buyNowUsd: 22500, vinMasked: true, odometerMi: 24660, odometerStatus: 'actual',
    });
    expect(lot.location).toMatchObject({ city: 'LOS ANGELES', state: 'CA', branch: 'CA - LOS ANGELES' });
    expect(lot.saleDate).toBe(new Date(1795111200000).toISOString());
    expect(lot.photos[0]).toMatchObject({ thumbUrl: expect.stringContaining('_thb.'), url: expect.stringContaining('_ful.') });
  });

  it('handles string numbers, missing fields and zero prices', () => {
    const lot = normalizeCopart(content[1]);
    expect(lot).toMatchObject({ year: 2019, make: 'Dodge', model: 'Charger', engineL: 3.6, cylinders: 6, drive: 'rwd', bodyType: 'sedan', odometerMi: 52410, odometerStatus: 'not_actual', keys: false, drivability: 'stationary', secondaryDamage: 'all_over' });
    expect(lot.currentBidUsd).toBeNull();
    expect(lot.buyNowUsd).toBeNull();
    expect(lot.location.state).toBe('FL'); // taken from yard name "FL - ORLANDO NORTH"
    expect(lot.photos).toEqual([]);
  });

  it('fails loudly when required fields are missing', () => {
    expect(() => normalizeCopart({ lotNumber: 1, make: 'TESLA' })).toThrow(SchemaChangedError);
  });
});
