// The single lot shape every provider maps into. The database, sync and API only know this type.

export const SOURCES = ['copart', 'iaai'] as const;
export type Source = (typeof SOURCES)[number];

export const LOT_STATUSES = ['active', 'sold', 'removed'] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

export const BODY_TYPES = ['sedan', 'suv', 'hatchback', 'wagon', 'coupe', 'convertible', 'minivan', 'pickup', 'van', 'other'] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export const FUELS = ['gasoline', 'diesel', 'hybrid', 'electric', 'other'] as const;
export type Fuel = (typeof FUELS)[number];

export const TRANSMISSIONS = ['automatic', 'manual', 'cvt', 'other'] as const;
export type Transmission = (typeof TRANSMISSIONS)[number];

export const DRIVES = ['fwd', 'rwd', 'awd', 'other'] as const;
export type Drive = (typeof DRIVES)[number];

export const DAMAGE_TYPES = [
  'front_end', 'rear_end', 'side', 'top_roof', 'undercarriage', 'all_over', 'minor_dents',
  'hail', 'water_flood', 'fire', 'mechanical', 'electrical', 'vandalism', 'stripped',
  'normal_wear', 'none', 'other',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

export const TITLE_TYPES = ['clean', 'salvage', 'rebuilt', 'parts_only', 'other'] as const;
export type TitleType = (typeof TITLE_TYPES)[number];

export const DRIVABILITY = ['run_drive', 'starts', 'stationary', 'unknown'] as const;
export type Drivability = (typeof DRIVABILITY)[number];

export const ODOMETER_STATUSES = ['actual', 'not_actual', 'exempt', 'exceeds_limit', 'unknown'] as const;
export type OdometerStatus = (typeof ODOMETER_STATUSES)[number];

export interface Photo {
  url: string;        // full-size image
  thumbUrl?: string;  // small preview, if the source offers one
  width?: number;
  height?: number;
  order: number;
}

export interface LotLocation {
  city: string | null;
  state: string | null;   // US state code, e.g. "TX"
  zip: string | null;
  branch: string | null;  // yard / branch name at the auction
  lat: number | null;
  lng: number | null;
}

/** A lot as produced by a provider, before the database adds bookkeeping fields. */
export interface NormalizedLot {
  source: Source;
  sourceLotId: string;        // id used in the source's lot URL (Copart lot number, IAAI item id)
  stockNumber: string | null; // IAAI stock number; null for Copart
  lotUrl: string;

  vin: string | null;
  vinMasked: boolean;         // true when the source hides part of the VIN (IAAI for guests)

  year: number;
  make: string;               // canonical brand, e.g. "Mercedes-Benz"
  model: string;
  trim: string | null;

  bodyType: BodyType;
  bodyStyleRaw: string | null;
  color: string | null;
  engineRaw: string | null;
  engineL: number | null;
  cylinders: number | null;
  fuel: Fuel;
  transmission: Transmission;
  drive: Drive;

  odometerMi: number | null;
  odometerKm: number | null;
  odometerStatus: OdometerStatus;

  primaryDamage: DamageType | null;
  primaryDamageRaw: string | null;
  secondaryDamage: DamageType | null;
  secondaryDamageRaw: string | null;

  titleType: TitleType | null;
  titleRaw: string | null;
  titleState: string | null;

  keys: boolean | null;
  drivability: Drivability;

  location: LotLocation;
  saleDate: string | null;      // ISO 8601, UTC

  currentBidUsd: number | null; // null when the source hides it (IAAI for guests)
  buyNowUsd: number | null;     // only when Buy Now is actually offered

  status: LotStatus;            // what the source says right now
  sourceStatus: string | null;  // raw status code from the source

  photos: Photo[];
  rawJson: unknown;             // the untouched source payload, for debugging and re-normalising
}

/** A lot as stored in our database. */
export interface StoredLot extends NormalizedLot {
  id: number;
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;
  statusChangedAt: string;
  contentHash: string;
}
