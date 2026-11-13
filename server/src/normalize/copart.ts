// Copart -> NormalizedLot.
//
// UNVERIFIED: Copart answers every non-browser request with an Imperva challenge page, so these
// field names could not be checked against live responses. They follow the short keys Copart's
// own frontend uses in /public/lots/search-results (content[] items). The schema only requires a
// few fields; if Copart ever serves data and the names differ, normalisation fails loudly with a
// SchemaChangedError instead of writing wrong data.

import { z } from 'zod';
import type { NormalizedLot, Photo } from '../domain/lot.js';
import { SchemaChangedError } from '../providers/errors.js';
import {
  canonicalMake, canonicalModel, clean, mapBody, mapDamage, mapDrivability, mapDrive, mapFuel, mapTitle,
  mapTransmission, parseDate, parseEngine, parseOdometer, stateCode, toNumber,
} from './common.js';

export const COPART_BASE = 'https://www.copart.com';

const num = z.union([z.number(), z.string()]);
const opt = z.union([z.string(), z.number(), z.boolean(), z.null()]).optional();

export const CopartLotSchema = z.object({
  ln: num,              // lot number
  mkn: z.string().min(1), // make
  lcy: num,             // year
  lm: opt,              // model
  lmg: opt,             // model group
  mtrim: opt,           // trim
  fv: opt,              // VIN (may be partly masked for guests)
  orr: opt,             // odometer reading
  ord: opt,             // odometer brand: ACTUAL / NOT ACTUAL / EXEMPT
  egn: opt,             // engine
  cy: opt,              // cylinders
  ft: opt,              // fuel type
  tmtp: opt,            // transmission
  drv: opt,             // drive
  bstl: opt,            // body style
  clr: opt,             // colour
  dd: opt,              // primary damage
  sdd: opt,             // secondary damage
  td: opt,              // title description, e.g. "FL - CERT OF TITLE-SALVAGE"
  tsmn: opt,            // title state
  hk: opt,              // has keys: YES / NO
  lcd: opt,             // condition: RUNS AND DRIVES / ENGINE START PROGRAM / STATIONARY
  yn: opt,              // yard name
  locCity: opt,
  locState: opt,
  zip: opt,
  lat: opt,
  lng: opt,
  ad: opt,              // auction date, epoch ms
  hb: opt,              // high (current) bid
  bnp: opt,             // buy-it-now price
  tims: opt,            // thumbnail URL
  ls: opt,              // lot status code
}).passthrough();

export type CopartLot = z.infer<typeof CopartLotSchema>;

export const copartLotUrl = (lot: string) => `${COPART_BASE}/lot/${lot}`;

export function normalizeCopart(raw: unknown, photos: Photo[] = []): NormalizedLot {
  const parsed = CopartLotSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SchemaChangedError('copart', 'search-results content[]', parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`));
  }
  const c = parsed.data;
  const year = toNumber(c.lcy);
  const make = canonicalMake(c.mkn);
  const model = canonicalModel(c.lm ?? c.lmg);
  if (!year || !make || !model) throw new SchemaChangedError('copart', 'search-results content[]', ['year/make/model empty']);

  const lot = String(c.ln);
  const vin = clean(c.fv);
  const odo = parseOdometer(c.orr, c.ord);
  const engine = parseEngine(c.egn, c.cy);
  const bid = toNumber(c.hb);
  const bnp = toNumber(c.bnp);
  const thumb = clean(c.tims);

  return {
    source: 'copart',
    sourceLotId: lot,
    stockNumber: null,
    lotUrl: copartLotUrl(lot),
    vin,
    vinMasked: !!vin && vin.includes('*'),
    year,
    make,
    model,
    trim: clean(c.mtrim),
    bodyType: mapBody(c.bstl),
    bodyStyleRaw: clean(c.bstl),
    color: clean(c.clr),
    ...engine,
    fuel: mapFuel(c.ft),
    transmission: mapTransmission(c.tmtp),
    drive: mapDrive(c.drv),
    odometerMi: odo.mi,
    odometerKm: odo.km,
    odometerStatus: odo.status,
    primaryDamage: mapDamage(c.dd),
    primaryDamageRaw: clean(c.dd),
    secondaryDamage: mapDamage(c.sdd),
    secondaryDamageRaw: clean(c.sdd),
    titleType: mapTitle(c.td),
    titleRaw: clean(c.td),
    titleState: clean(c.tsmn),
    keys: c.hk == null ? null : /^(yes|y|true)$/i.test(String(c.hk)),
    drivability: mapDrivability(c.lcd),
    location: {
      city: clean(c.locCity),
      state: stateCode(c.locState) ?? stateCode(clean(c.yn)?.split(' - ')[0]),
      zip: clean(c.zip),
      branch: clean(c.yn),
      lat: toNumber(c.lat),
      lng: toNumber(c.lng),
    },
    saleDate: parseDate(typeof c.ad === 'number' ? c.ad : toNumber(c.ad) ?? c.ad),
    currentBidUsd: bid && bid > 0 ? bid : null,
    buyNowUsd: bnp && bnp > 0 ? bnp : null,
    status: 'active',
    sourceStatus: clean(c.ls),
    photos: photos.length ? photos : thumb ? [{ url: thumb.replace(/_thb\./, '_ful.'), thumbUrl: thumb, order: 0 }] : [],
    rawJson: raw,
  };
}
