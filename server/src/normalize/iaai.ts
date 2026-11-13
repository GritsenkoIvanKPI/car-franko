// IAAI -> NormalizedLot.
// Input is the JSON object IAAI embeds in every lot page:
//   <script type="application/json" id="ProductDetailsVM">{...}</script>
// Field names verified against real lot pages (see test/fixtures/iaai/*.vm.json).

import { z } from 'zod';
import type { NormalizedLot, Photo } from '../domain/lot.js';
import { SchemaChangedError } from '../providers/errors.js';
import {
  canonicalMake, canonicalModel, clean, mapBody, mapDamage, mapDrivability, mapDrive, mapFuel, mapTitle,
  mapTransmission, parseDate, parseEngine, parseOdometer, stateCode, toNumber,
} from './common.js';

export const IAAI_BASE = 'https://www.iaai.com';
export const IAAI_IMAGE_BASE = 'https://vis.iaai.com';

const str = z.union([z.string(), z.number()]).transform(v => String(v));
const optStr = z.union([z.string(), z.number(), z.null()]).optional();
const money = z.union([z.number(), z.string(), z.null()]).optional().transform(v => toNumber(v) ?? 0);

// Only what we rely on is required. If IAAI drops or renames these, we stop instead of writing junk.
const AttributesSchema = z.object({
  StockNumber: str,
  Year: str,
  Make: z.string().min(1),
  Model: z.string().min(1),
  Series: optStr,
  VIN: optStr,
  VINMask: optStr,
  BodyStyleName: optStr,
  ExteriorColor: optStr,
  EngineSize: optStr,
  EngineInformation: optStr,
  Cylinders: optStr,
  FuelTypeDesc: optStr,
  Transmission: optStr,
  DriveLineTypeDesc: optStr,
  PrimaryDamageDesc: optStr,
  SecondaryDamageDesc: optStr,
  TitleCode: optStr,
  TitleStateName: optStr,
  TitleState: optStr,
  Keys: z.union([z.boolean(), z.string()]).optional().nullable(),
  RunAndDrive: z.union([z.boolean(), z.string()]).optional().nullable(),
  City: optStr,
  State: optStr,
  Zip: optStr,
  BranchName: optStr,
  StorageLocationLatitude: optStr,
  StorageLocationLongitude: optStr,
  AuctionDateTime: optStr,
  InventoryStatus: optStr,
}).passthrough();

const KeyValueList = z.object({ $values: z.array(z.object({ key: z.string(), value: z.unknown() }).passthrough()) }).passthrough();

const ImageKey = z.object({ k: z.string(), w: z.number().optional(), h: z.number().optional(), in: z.number().optional() }).passthrough();

export const ProductDetailsSchema = z.object({
  inventoryView: z.object({
    itemId: str,
    attributes: AttributesSchema,
    vehicleInformation: KeyValueList,
    imageDimensions: z.object({ keys: z.object({ $values: z.array(ImageKey) }).passthrough() }).passthrough().optional().nullable(),
  }).passthrough(),
  auctionInformation: z.object({
    biddingInformation: z.object({
      buyNowInd: z.boolean().optional().nullable(),
      buyNowAmount: money,
    }).passthrough().optional().nullable(),
    prebidInformation: z.object({
      showCurrentBid: z.boolean().optional().nullable(),
      decimalHighBidAmount: money, // seen as both number and string in real pages
      vehicleStatus: optStr,
    }).passthrough().optional().nullable(),
  }).passthrough(),
}).passthrough();

export type IaaiProductDetails = z.infer<typeof ProductDetailsSchema>;

export const iaaiLotUrl = (itemId: string) => `${IAAI_BASE}/VehicleDetail/${itemId}~US`;
export const iaaiImageUrl = (key: string, width = 1024, height = 768) =>
  `${IAAI_IMAGE_BASE}/resizer?imageKeys=${encodeURIComponent(key)}&width=${width}&height=${height}`;

export function iaaiPhotosFromKeys(keys: Array<{ k?: string; K?: string; w?: number; W?: number; h?: number; H?: number }>): Photo[] {
  return keys
    .map(k => ({ key: k.k ?? k.K ?? '', w: k.w ?? k.W, h: k.h ?? k.H }))
    .filter(k => k.key)
    .map((k, i) => ({ url: iaaiImageUrl(k.key), thumbUrl: iaaiImageUrl(k.key, 320, 240), width: k.w, height: k.h, order: i }));
}

/** Pull the ProductDetailsVM JSON out of a lot page. Returns null when the script tag isn't there. */
export function extractProductDetails(html: string): unknown | null {
  const m = html.match(/<script[^>]*\bid="ProductDetailsVM"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m || !m[1]) return null;
  try { return JSON.parse(m[1].trim()); } catch { return null; }
}

/** IAAI renders a page titled "DetailsNotFoundView" for unknown or withdrawn lots. */
export const isIaaiNotFoundPage = (html: string) => /<title[^>]*>\s*DetailsNotFoundView\s*<\/title>/i.test(html);

const truthy = (v: unknown) => v === true || /^(true|yes|present|y)$/i.test(String(v ?? '').trim());

export function normalizeIaai(raw: unknown): NormalizedLot {
  const parsed = ProductDetailsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SchemaChangedError('iaai', 'ProductDetailsVM', parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`));
  }
  const vm = parsed.data;
  const a = vm.inventoryView.attributes;
  const info: Record<string, string> = {};
  for (const x of vm.inventoryView.vehicleInformation.$values) info[x.key] = clean(x.value) ?? '';

  const year = toNumber(a.Year);
  const make = canonicalMake(a.Make);
  const model = canonicalModel(a.Model);
  if (!year || !make || !model) {
    throw new SchemaChangedError('iaai', 'ProductDetailsVM.attributes', ['Year/Make/Model empty']);
  }

  const vin = clean(a.VIN) ?? clean(a.VINMask);
  const odo = parseOdometer(info.Odometer);
  const engine = parseEngine(a.EngineInformation ?? a.EngineSize, a.Cylinders);
  // Title: the document text ("SALVAGE - GREATER THAN 75% (Maryland)") is more reliable than TitleCode ("OTH").
  const titleDoc = clean(info.TitleSaleDoc);
  const titleRaw = titleDoc ?? clean(a.TitleCode);
  const bidding = vm.auctionInformation.biddingInformation;
  const prebid = vm.auctionInformation.prebidInformation;
  const sourceStatus = clean(a.InventoryStatus) ?? clean(prebid?.vehicleStatus);

  const drivability = info.StartCode ? mapDrivability(info.StartCode) : truthy(a.RunAndDrive) ? 'run_drive' : 'unknown';
  const keys = info.KeySlashFob ? /present|yes/i.test(info.KeySlashFob) : a.Keys == null ? null : truthy(a.Keys);

  return {
    source: 'iaai',
    sourceLotId: String(vm.inventoryView.itemId),
    stockNumber: String(a.StockNumber),
    lotUrl: iaaiLotUrl(String(vm.inventoryView.itemId)),

    vin,
    vinMasked: !!vin && vin.includes('*'),

    year,
    make,
    model,
    trim: clean(a.Series),

    bodyType: mapBody(a.BodyStyleName),
    bodyStyleRaw: clean(a.BodyStyleName),
    color: clean(a.ExteriorColor),
    ...engine,
    fuel: mapFuel(a.FuelTypeDesc),
    transmission: mapTransmission(a.Transmission),
    drive: mapDrive(a.DriveLineTypeDesc),

    odometerMi: odo.mi,
    odometerKm: odo.km,
    odometerStatus: odo.status,

    primaryDamage: mapDamage(a.PrimaryDamageDesc ?? info.PrimaryDamage),
    primaryDamageRaw: clean(a.PrimaryDamageDesc) ?? clean(info.PrimaryDamage),
    secondaryDamage: mapDamage(a.SecondaryDamageDesc ?? info.SecondaryDamage),
    secondaryDamageRaw: clean(a.SecondaryDamageDesc) ?? clean(info.SecondaryDamage),

    titleType: mapTitle(titleRaw),
    titleRaw,
    titleState: clean(a.TitleStateName) ?? clean(a.TitleState),

    keys,
    drivability,

    location: {
      city: clean(a.City),
      state: stateCode(a.State),
      zip: clean(a.Zip),
      branch: clean(a.BranchName),
      lat: toNumber(a.StorageLocationLatitude),
      lng: toNumber(a.StorageLocationLongitude),
    },
    saleDate: parseDate(a.AuctionDateTime),

    // IAAI hides the live bid from visitors who aren't logged in.
    currentBidUsd: prebid?.showCurrentBid && (prebid.decimalHighBidAmount ?? 0) > 0 ? prebid.decimalHighBidAmount! : null,
    // buyNowAmount is sometimes filled while Buy Now isn't offered; trust only the flag.
    buyNowUsd: bidding?.buyNowInd && (bidding.buyNowAmount ?? 0) > 0 ? bidding.buyNowAmount! : null,

    status: 'active', // sold/removed is decided by the sync layer (lot disappears or page says not found)
    sourceStatus,

    photos: iaaiPhotosFromKeys(vm.inventoryView.imageDimensions?.keys.$values ?? []),
    rawJson: raw,
  };
}
