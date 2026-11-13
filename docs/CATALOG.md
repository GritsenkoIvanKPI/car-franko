# Auction catalogue: how it works

`catalog.html` shows Copart and IAAI lots. It reads one file, `data/lots.json`, which `scripts/sync-lots.mjs` builds from a data provider.

```
provider API  ->  scripts/adapters/*.mjs  ->  scripts/sync-lots.mjs  ->  data/lots.json  ->  catalog.html
                   (fetch + map fields)       (rules, clean-up,          (what the site
                                               dedupe, sort)               reads)
```

## Rules

The rules live in `scripts/catalog.config.mjs`. Every provider goes through them:

- year 2015 or newer (`MIN_YEAR`)
- the 24 brands in `BRANDS`; `BRAND_ALIASES` catches other spellings such as "MERCEDES BENZ" or "VW"
- auctions `copart` and `iaai`
- lots whose auction has already ended are dropped
- the same car listed twice is kept once (matched by VIN, otherwise by auction + lot number)

The sync script turns provider values into fixed codes that the filters use:

| Field | Codes |
|---|---|
| body | `sedan`, `suv`, `hatchback`, `wagon`, `coupe`, `minivan`, `pickup` |
| fuel | `gasoline`, `diesel`, `hybrid`, `electric` |
| transmission | `automatic`, `cvt`, `manual` |
| drive | `fwd`, `rwd`, `awd` |
| primary_damage | `front_end`, `rear_end`, `side`, `minor_dents`, `all_over`, `hail`, `water`, `mechanical`, `normal_wear` |
| condition | `run_drive`, `starts`, `stationary` |
| title | `clean`, `salvage` |

Mileage arrives in miles and is also stored in km.

## Data source

Copart and IAAI have no public API, and their terms restrict automated copying of their sites. Don't scrape them directly. Use a provider that is licensed to resell Copart/IAAI lot data as JSON, and confirm with them that the photos and data may be shown on your site.

### Connecting a provider

1. Fill in the three marked spots in `scripts/adapters/http-provider.mjs` from the provider's API docs:
   - the search request
   - how to read lots and paging from a response
   - `mapLot()`
2. Test locally:
   ```
   CATALOG_PROVIDER=http CATALOG_API_URL=... CATALOG_API_KEY=... node scripts/sync-lots.mjs
   ```
3. Open `http://localhost:3000/catalog.html` (`node serve.mjs`). The "Демо-режим" notice disappears automatically once the data isn't demo data.
4. Turn on automatic updates. In GitHub, go to Settings → Secrets and variables → Actions and add:
   - **secrets:** `CATALOG_API_URL`, `CATALOG_API_KEY`
   - **variable:** `CATALOG_PROVIDER` = `http`
   - **optional variable:** `CATALOG_API_AUTH`. Set it to `x-api-key` (or another header name) if the provider doesn't use Bearer tokens.

   `.github/workflows/sync-catalog.yml` then refreshes `data/lots.json` every 3 hours and commits any changes. You can also run it by hand from the Actions tab.

### Demo data

`node scripts/sync-lots.mjs` with no settings writes 24 sample lots, one per brand, using the photos in `images/lots/`. Auction dates in demo mode are shifted forward so the countdowns stay in the future.

## Catalogue page

- **Filters:** auction, brand, model (shows after a brand is picked), year, current bid, mileage (km), engine size, fuel, drive, transmission, body, damage, plus toggles for runs & drives, keys present, clean title and Buy Now. There is also a search box for brand, model, VIN or lot number.
- **Sorting:** auction date, bid (low to high and high to low), year, mileage.
- **Shareable views:** all filters are saved in the page address, e.g. `catalog.html?make=Toyota,Lexus&y1=2019&fuel=hybrid`.
- **Lot cards:**
  - "Хочу це авто" opens the enquiry form, pre-filled with the auction, lot number and car.
  - The arrow icon opens the original lot on Copart or IAAI.
- **Scale:** 12 cards load at a time. Everything is filtered in the browser, which suits a few thousand lots. For larger volumes, move filtering to a small server API that accepts the same URL parameters.
