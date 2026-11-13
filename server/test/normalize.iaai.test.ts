// Normalisation tests against real IAAI lot data (ProductDetailsVM captured from iaai.com lot pages).
import { describe, expect, it } from 'vitest';
import { extractProductDetails, isIaaiNotFoundPage, normalizeIaai } from '../src/normalize/iaai.js';
import { SchemaChangedError } from '../src/providers/errors.js';
import { fixture, fixtureJson } from './helpers.js';

const load = (name: string) => normalizeIaai(fixtureJson(`iaai/${name}.vm.json`));

describe('normalizeIaai — 2021 Infiniti Q60, salvage, right side', () => {
  const lot = load('lot-2021-infiniti-q60-salvage');

  it('identity and links', () => {
    expect(lot.source).toBe('iaai');
    expect(lot.sourceLotId).toBe('46257118');
    expect(lot.stockNumber).toBe('45758397');
    expect(lot.lotUrl).toBe('https://www.iaai.com/VehicleDetail/46257118~US');
  });

  it('VIN is kept but flagged as masked', () => {
    expect(lot.vin).toBe('JN1EV7KK7MM******');
    expect(lot.vinMasked).toBe(true);
  });

  it('vehicle', () => {
    expect(lot).toMatchObject({ year: 2021, make: 'Infiniti', model: 'Q60', bodyType: 'coupe', fuel: 'gasoline', transmission: 'automatic', drive: 'rwd', engineL: 3, cylinders: 6, color: 'BLACK' });
  });

  it('odometer in miles and km', () => {
    expect(lot.odometerMi).toBe(47948);
    expect(lot.odometerKm).toBe(Math.round(47948 / 0.621371));
    expect(lot.odometerStatus).toBe('actual');
  });

  it('damage, title, keys, drivability', () => {
    expect(lot.primaryDamage).toBe('side');
    expect(lot.primaryDamageRaw).toBe('RIGHT SIDE');
    expect(lot.secondaryDamage).toBeNull();
    expect(lot.titleType).toBe('salvage');
    expect(lot.titleRaw).toBe('SALVAGE (Missouri)');
    expect(lot.titleState).toBe('Missouri');
    expect(lot.keys).toBe(true);
    expect(lot.drivability).toBe('run_drive');
  });

  it('location and sale date (UTC)', () => {
    expect(lot.location).toMatchObject({ city: 'Caseyville', state: 'IL', zip: '62232', branch: 'St. Louis (IL)' });
    expect(lot.location.lat).toBeCloseTo(38.61466, 4);
    expect(lot.saleDate).toBe('2026-11-17T15:30:00.000Z');
  });

  it('prices: bid hidden for guests; Buy Now amount ignored when Buy Now is not offered', () => {
    expect(lot.currentBidUsd).toBeNull();
    expect(lot.buyNowUsd).toBeNull();
  });

  it('photos come from the embedded image keys', () => {
    expect(lot.photos).toHaveLength(16);
    expect(lot.photos[0]!.url).toMatch(/^https:\/\/vis\.iaai\.com\/resizer\?imageKeys=46257118~SID/);
    expect(lot.photos[0]!.thumbUrl).toContain('width=320');
    expect(lot.photos.map(p => p.order)).toEqual([...Array(16).keys()]);
  });

  it('keeps the raw payload and source status', () => {
    expect(lot.status).toBe('active');
    expect(lot.sourceStatus).toBe('RS');
    expect(lot.rawJson).toBeTypeOf('object');
  });
});

describe('normalizeIaai — other real lots', () => {
  it('2015 Mercedes-Benz CLA 250: title read from document text, not code "OTH"', () => {
    const lot = load('lot-2015-mercedes-cla250');
    expect(lot).toMatchObject({ year: 2015, make: 'Mercedes-Benz', model: 'CLA 250', bodyType: 'sedan', drive: 'fwd', engineL: 2, cylinders: 4, odometerMi: 158153 });
    expect(lot.titleType).toBe('salvage');
    expect(lot.titleRaw).toBe('SALVAGE - GREATER THAN 75% (Maryland)');
    expect(lot.primaryDamage).toBe('front_end');
    expect(lot.location.state).toBe('MD');
  });

  it('2009 Hyundai Santa Fe: stationary, clean title, normal wear', () => {
    const lot = load('lot-2009-hyundai-santa-fe');
    expect(lot).toMatchObject({ model: 'Santa Fe', trim: 'GLS', drivability: 'stationary', titleType: 'clean', primaryDamage: 'normal_wear', bodyType: 'suv' });
    expect(lot.location.state).toBe('PA'); // source has a trailing space: "PA "
  });

  it('1998 Nissan Pathfinder: 4x4 maps to awd, secondary damage, original title = clean', () => {
    const lot = load('lot-1998-nissan-pathfinder');
    expect(lot).toMatchObject({ year: 1998, drive: 'awd', primaryDamage: 'mechanical', secondaryDamage: 'front_end', titleType: 'clean' });
  });
});

describe('IAAI page handling', () => {
  it('extracts ProductDetailsVM from a lot page', () => {
    const vm = extractProductDetails(fixture('iaai/lot-page.trimmed.html'));
    expect(normalizeIaai(vm).sourceLotId).toBe('47107083');
  });

  it('recognises the "not found" page', () => {
    const html = fixture('iaai/lot-not-found.trimmed.html');
    expect(isIaaiNotFoundPage(html)).toBe(true);
    expect(extractProductDetails(html)).toBeNull();
  });
});

describe('structure health check', () => {
  const base = () => fixtureJson<Record<string, any>>('iaai/lot-2021-infiniti-q60-salvage.vm.json');

  it('throws SchemaChangedError when a required field disappears', () => {
    const vm = base();
    delete vm.inventoryView.attributes.Make;
    expect(() => normalizeIaai(vm)).toThrow(SchemaChangedError);
  });

  it('throws when the attributes block is renamed', () => {
    const vm = base();
    vm.inventoryView.attrs = vm.inventoryView.attributes;
    delete vm.inventoryView.attributes;
    expect(() => normalizeIaai(vm)).toThrow(/attributes/);
  });

  it('throws on a non-object payload', () => {
    expect(() => normalizeIaai('<html>')).toThrow(SchemaChangedError);
  });
});
