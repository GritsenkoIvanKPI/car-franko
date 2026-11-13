// Shared parsing helpers: turn free-text auction values into our fixed codes.
// Every mapper keeps the raw value next to the code, so nothing is lost when a mapping is wrong.

import type { BodyType, DamageType, Drivability, Drive, Fuel, OdometerStatus, TitleType, Transmission } from '../domain/lot.js';

export const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
};

export const toNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_, p, c) => p + c.toUpperCase());

// ---- make ----------------------------------------------------------------------------------
const MAKE_CANONICAL: Record<string, string> = {
  ACURA: 'Acura', AUDI: 'Audi', BMW: 'BMW', BUICK: 'Buick', CADILLAC: 'Cadillac', CHEVROLET: 'Chevrolet',
  CHEVY: 'Chevrolet', CHRYSLER: 'Chrysler', DODGE: 'Dodge', FORD: 'Ford', GMC: 'GMC', HONDA: 'Honda',
  HYUNDAI: 'Hyundai', INFINITI: 'Infiniti', INFINITY: 'Infiniti', KIA: 'KIA', LEXUS: 'Lexus', LINCOLN: 'Lincoln',
  MAZDA: 'Mazda', 'MERCEDES-BENZ': 'Mercedes-Benz', 'MERCEDES BENZ': 'Mercedes-Benz', MERCEDES: 'Mercedes-Benz',
  NISSAN: 'Nissan', RAM: 'RAM', SUBARU: 'Subaru', TESLA: 'Tesla', TOYOTA: 'Toyota', VOLKSWAGEN: 'Volkswagen', VW: 'Volkswagen',
  JEEP: 'Jeep', MINI: 'MINI', 'LAND ROVER': 'Land Rover', PORSCHE: 'Porsche', VOLVO: 'Volvo', GENESIS: 'Genesis',
  MITSUBISHI: 'Mitsubishi', JAGUAR: 'Jaguar', FIAT: 'Fiat', POLESTAR: 'Polestar', RIVIAN: 'Rivian',
};
export function canonicalMake(raw: unknown): string | null {
  const s = clean(raw);
  if (!s) return null;
  return MAKE_CANONICAL[s.toUpperCase()] ?? titleCase(s);
}

/** Short words that are real words, not model codes ("Santa Fe", "Grand Cherokee L" stays as is). */
const MODEL_WORDS = new Set(['FE', 'DE', 'DEL', 'LA', 'EL', 'AND']);

/** Models come upper-case from both sites; keep letter/number codes upper-case ("CX-5", "RX 350", "CLA 250", "F-150"). */
export function canonicalModel(raw: unknown): string | null {
  const s = clean(raw);
  if (!s) return null;
  return s.split(' ').map(w => {
    const up = w.toUpperCase();
    if (MODEL_WORDS.has(up)) return titleCase(w);
    return /\d/.test(w) || w.length <= 3 ? up : titleCase(w);
  }).join(' ');
}

// ---- generic keyword matcher -----------------------------------------------------------------
type Rules<T> = Array<[T, RegExp]>;
function match<T>(raw: unknown, rules: Rules<T>): T | null {
  const s = clean(raw);
  if (!s) return null;
  for (const [code, re] of rules) if (re.test(s)) return code;
  return null;
}

const BODY: Rules<BodyType> = [
  ['pickup', /pick ?up|crew cab|quad cab|extended cab|regular cab|super ?cab|double cab|\bcab\b/i],
  ['minivan', /mini ?van/i],
  ['van', /\bvan\b|cargo/i],
  ['wagon', /wagon|estate/i],
  ['convertible', /convertible|cabrio|roadster/i],
  ['coupe', /coupe|2 ?dr/i],
  ['hatchback', /hatch|liftback|3 ?dr|5 ?dr/i],
  ['suv', /sport utility|\bsuv\b|crossover|utility|\bspor\b|sport ?ut/i], // Copart abbreviates "4DR SPOR"
  ['sedan', /sedan|4 ?dr|saloon/i],
];
export const mapBody = (raw: unknown): BodyType => match(raw, BODY) ?? 'other';

const FUEL: Rules<Fuel> = [
  ['electric', /electric|\bev\b|\bbev\b/i],
  ['hybrid', /hybrid|phev|plug-?in/i],
  ['diesel', /diesel/i],
  ['gasoline', /gas|petrol|flex|ethanol|e85/i],
];
export const mapFuel = (raw: unknown): Fuel => match(raw, FUEL) ?? 'other';

const TRANS: Rules<Transmission> = [
  ['cvt', /cvt|continuously variable/i],
  ['manual', /manual|\bmt\b|stick/i],
  ['automatic', /auto|\bat\b/i],
];
export const mapTransmission = (raw: unknown): Transmission => match(raw, TRANS) ?? 'other';

const DRIVE: Rules<Drive> = [
  ['awd', /awd|all wheel|4x4|4wd|four wheel|4 wheel/i],
  ['rwd', /rwd|rear wheel|rear-wheel/i],
  ['fwd', /fwd|front wheel|front-wheel/i],
];
export const mapDrive = (raw: unknown): Drive => match(raw, DRIVE) ?? 'other';

const DAMAGE: Rules<DamageType> = [
  ['normal_wear', /normal wear/i],
  ['minor_dents', /minor dent|minor scratch|scratch/i],
  ['front_end', /front/i],
  ['rear_end', /rear/i],
  ['side', /side|left|right/i],
  ['top_roof', /top|roof/i],
  ['undercarriage', /under ?carriage/i],
  ['all_over', /all over|rollover|roll over/i],
  ['hail', /hail/i],
  ['water_flood', /water|flood/i],
  ['fire', /fire|burn/i],
  ['mechanical', /mechanical|engine|transmission|drivetrain/i],
  ['electrical', /electric/i],
  ['vandalism', /vandal/i],
  ['stripped', /stripped|missing|theft/i],
  ['none', /^none$|no damage/i],
];
export const mapDamage = (raw: unknown): DamageType | null => (clean(raw) ? match(raw, DAMAGE) ?? 'other' : null);

// State-specific names seen in real IAAI data: NY "MV-907A" = salvage certificate, FL "REBUILDABLE" = salvage.
// "BILL OF SALE" / "REPOSSESSION PAPERWORK" mean there is no title document -> 'other'.
const TITLE: Rules<TitleType> = [
  ['parts_only', /parts only|certificate of destruction|junk|non-?repairable|scrap|dismantl/i],
  ['rebuilt', /rebuilt|reconstructed|salvage.*repaired/i],
  ['salvage', /salvage|\bsal\b|total loss|mv-?907a|rebuildable/i],
  ['clean', /clear|clean|original|regular|certificate of title|\bclr\b|\borg\b|\bmv-?1\b/i],
];
export const mapTitle = (raw: unknown): TitleType | null => (clean(raw) ? match(raw, TITLE) ?? 'other' : null);

const DRIVABLE: Rules<Drivability> = [
  ['run_drive', /run (and|&) drive|runs (and|&) drives|run & drive/i],
  ['starts', /starts|engine start|enhanced/i],
  ['stationary', /stationary|does not start|won'?t start|no start/i],
];
export const mapDrivability = (raw: unknown): Drivability => match(raw, DRIVABLE) ?? 'unknown';

// ---- odometer: "47,948 mi (Actual)", "120000", "85,000 km (Not Actual)" ---------------------
const MI_PER_KM = 0.621371;
export function parseOdometer(raw: unknown, statusRaw?: unknown): { mi: number | null; km: number | null; status: OdometerStatus } {
  const s = clean(raw) ?? '';
  const n = toNumber(s.split('(')[0]);
  const isKm = /\bkm\b|kilomet/i.test(s);
  const statusText = `${s} ${clean(statusRaw) ?? ''}`;
  const status: OdometerStatus =
    /not actual|not-actual|tmu|true mileage unknown/i.test(statusText) ? 'not_actual'
      : /exempt/i.test(statusText) ? 'exempt'
        : /exceeds/i.test(statusText) ? 'exceeds_limit'
          : /actual/i.test(statusText) ? 'actual'
            : 'unknown';
  if (n === null || n <= 0) return { mi: null, km: null, status };
  const mi = Math.round(isKm ? n * MI_PER_KM : n);
  const km = Math.round(isKm ? n : n / MI_PER_KM);
  return { mi, km, status };
}

// ---- engine: "2.7L V-6 DOHC, VVT, REGULAR , 185HP" --------------------------------------------
export function parseEngine(raw: unknown, cylindersRaw?: unknown): { engineRaw: string | null; engineL: number | null; cylinders: number | null } {
  const s = clean(raw);
  const l = s?.match(/(\d{1,2}(?:\.\d)?)\s*L\b/i);
  // "V-6" / "I-4" (IAAI), "6 cyl", or Copart's "3.6L 6"
  const cylFromText = s?.match(/\b[VIWH]-?(\d{1,2})\b|(\d{1,2})\s*cyl|\d(?:\.\d)?\s*L\s+(\d{1,2})\b/i);
  const fromText = cylFromText ? toNumber(cylFromText[1] ?? cylFromText[2] ?? cylFromText[3]) : null;
  const given = toNumber(cylindersRaw);
  const cyl = given && given > 0 ? given : fromText;
  return {
    engineRaw: s,
    engineL: l ? Number(l[1]) : null,
    cylinders: cyl && cyl > 0 && cyl <= 16 ? cyl : null,
  };
}

/** "11/17/2026 3:30:00 PM +00:00" (IAAI) or epoch ms (Copart) -> ISO string. */
export function parseDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return new Date(raw).toISOString();
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\s*([+-]\d{2}):?(\d{2})?$/i);
  if (m) {
    const [, mo, d, y, hh, mm, ss = '0', ap, tzh = '+00', tzm = '00'] = m;
    let h = Number(hh);
    if (ap) { if (ap.toUpperCase() === 'PM' && h < 12) h += 12; if (ap.toUpperCase() === 'AM' && h === 12) h = 0; }
    const sign = tzh!.startsWith('-') ? -1 : 1;
    const offsetMin = sign * (Math.abs(Number(tzh)) * 60 + Number(tzm));
    const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), h, Number(mm), Number(ss)) - offsetMin * 60e3;
    return new Date(utc).toISOString();
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export const stateCode = (raw: unknown): string | null => {
  const s = clean(raw);
  return s ? s.toUpperCase().slice(0, 2) : null;
};
