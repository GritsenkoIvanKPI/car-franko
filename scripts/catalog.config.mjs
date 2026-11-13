// Catalogue rules: which auction lots get copied to our site.
// Change these values to widen or narrow the catalogue; the sync script applies them to every provider.

export const MIN_YEAR = 2015;

export const SOURCES = ['copart', 'iaai'];

// Brands we import (names as they appear on Copart / IAAI, matched case-insensitively).
export const BRANDS = [
  'Acura', 'Audi', 'BMW', 'Buick', 'Cadillac', 'Chevrolet', 'Chrysler', 'Dodge',
  'Ford', 'GMC', 'Honda', 'Hyundai', 'Infiniti', 'KIA', 'Lexus', 'Lincoln',
  'Mazda', 'Mercedes-Benz', 'Nissan', 'RAM', 'Subaru', 'Tesla', 'Toyota', 'Volkswagen',
];

// Spelling variants some feeds use -> our canonical brand name.
export const BRAND_ALIASES = {
  'MERCEDES': 'Mercedes-Benz',
  'MERCEDES BENZ': 'Mercedes-Benz',
  'VOLKSWAGEN': 'Volkswagen',
  'VW': 'Volkswagen',
  'RAM TRUCKS': 'RAM',
  'INFINITY': 'Infiniti',
};

// Lots whose auction ended more than this many hours ago are dropped.
export const KEEP_ENDED_HOURS = 0;

// Where the site reads the catalogue from.
export const OUTPUT_FILE = new URL('../data/lots.json', import.meta.url);
