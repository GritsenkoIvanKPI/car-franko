import { describe, expect, it } from 'vitest';
import {
  canonicalMake, canonicalModel, mapBody, mapDamage, mapDrive, mapTitle, parseDate, parseEngine, parseOdometer,
} from '../src/normalize/common.js';

describe('parsers', () => {
  it('dates: IAAI format with AM/PM and offset', () => {
    expect(parseDate('11/17/2026 3:30:00 PM +00:00')).toBe('2026-11-17T15:30:00.000Z');
    expect(parseDate('11/13/2026 12:05:00 AM -05:00')).toBe('2026-11-13T05:05:00.000Z');
    expect(parseDate(1795111200000)).toBe(new Date(1795111200000).toISOString());
    expect(parseDate('')).toBeNull();
  });

  it('odometer: miles, km, status', () => {
    expect(parseOdometer('143,298 mi (Actual)')).toEqual({ mi: 143298, km: Math.round(143298 / 0.621371), status: 'actual' });
    expect(parseOdometer('80,000 km (Not Actual)')).toMatchObject({ km: 80000, mi: Math.round(80000 * 0.621371), status: 'not_actual' });
    expect(parseOdometer('0', 'EXEMPT')).toEqual({ mi: null, km: null, status: 'exempt' });
  });

  it('engine size and cylinders', () => {
    expect(parseEngine('2.0L I-4 DI, DOHC, VVT, turbo, premium , 208HP')).toMatchObject({ engineL: 2, cylinders: 4 });
    expect(parseEngine('5.7L V-8')).toMatchObject({ engineL: 5.7, cylinders: 8 });
    expect(parseEngine('', '0')).toMatchObject({ engineL: null, cylinders: null });
  });

  it('makes and models', () => {
    expect(canonicalMake('MERCEDES-BENZ')).toBe('Mercedes-Benz');
    expect(canonicalMake('KIA')).toBe('KIA');
    expect(canonicalMake('LAND ROVER')).toBe('Land Rover');
    expect(canonicalModel('SANTA FE')).toBe('Santa Fe');
    expect(canonicalModel('CX-5')).toBe('CX-5');
    expect(canonicalModel('RX 350')).toBe('RX 350');
  });

  it('code mappers', () => {
    expect(mapBody('SPORT UTILITY')).toBe('suv');
    expect(mapBody('CREW CAB PICKUP')).toBe('pickup');
    expect(mapDrive('4x4')).toBe('awd');
    expect(mapDamage('Right Side')).toBe('side');
    expect(mapDamage('MINOR DENT/SCRATCHES')).toBe('minor_dents');
    expect(mapDamage('WATER/FLOOD')).toBe('water_flood');
    expect(mapDamage(' ')).toBeNull();
    expect(mapTitle('CERTIFICATE OF DESTRUCTION')).toBe('parts_only');
    expect(mapTitle('REBUILT')).toBe('rebuilt');
    expect(mapTitle('CLEAR (Pennsylvania)')).toBe('clean');
    // real values from the first 200-lot import
    expect(mapTitle('MV-907A (New York)')).toBe('salvage');
    expect(mapTitle('REBUILDABLE (Florida)')).toBe('salvage');
    expect(mapTitle('REGULAR (South Dakota)')).toBe('clean');
    expect(mapTitle('CERTIFICATE OF TITLE (Nebraska)')).toBe('clean');
    expect(mapTitle('BILL OF SALE (Washington)')).toBe('other');
    expect(mapTitle('REPOSSESSION PAPERWORK (Georgia)')).toBe('other');
  });
});
