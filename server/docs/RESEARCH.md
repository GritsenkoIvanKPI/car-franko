# Step 1 research: how Copart and IAAI serve lot data

Research date: 13 November 2026. About 10 single requests were made, spaced several seconds apart.

## Copart: blocked for non-browser clients

Every URL answers plain HTTP clients with a 302 or 307 redirect to a tiny `<TITLE>Loading</TITLE>` page. Those requests include the homepage, `robots.txt`, and the frontend JSON endpoints listed below.

The `x-iinfo` header and the `visid_incap_*` / `incap_ses_*` cookies show this is Imperva (Incapsula) bot protection. Its JavaScript challenge only a real browser passes. Passing it from automation means defeating bot protection, which we don't do.

`CopartProvider` therefore detects the challenge and raises `ProviderBlockedError` (test: `providers.test.ts`, using the real challenge page in `test/fixtures/copart/`).

These are the internal endpoints Copart's frontend uses. They are known but couldn't be verified because of the block:

| Purpose | Request |
|---|---|
| Search | `POST /public/lots/search-results`. JSON body: `{query, filter{MAKE,YEAR,LOC…}, sort, page, size, start}`. Results in `data.results.content[]` |
| Lot details | `GET /public/data/lotdetails/solr/{lot}`, returns `data.lotDetails` |
| Photos | `GET /public/data/lotdetails/solr/lotImages/{lot}/USA`, returns `data.imagesList.FULL_IMAGE[]` |

Short field keys in the search results:

| Key | Meaning |
|---|---|
| `ln` | lot number |
| `mkn` | make |
| `lm` | model |
| `lcy` | year |
| `fv` | VIN |
| `orr` / `ord` | odometer / odometer status |
| `dd` / `sdd` | primary / secondary damage |
| `td` | title |
| `hk` | keys |
| `lcd` | condition |
| `yn` | yard |
| `ad` | auction date (ms) |
| `hb` | high bid |
| `bnp` | Buy Now |
| `tims` | thumbnail |

## IAAI: works within robots.txt

Imperva is present (`x-cdn: Imperva`), but plain requests currently get normal pages. This held with a browser User-Agent and with our honest `CarFrankoLotSync/0.1` User-Agent.

| Purpose | Request | robots.txt | Format |
|---|---|---|---|
| Lot discovery | `GET /Xj9rDOVMEi0hc38S/sitemap_index.xml` → `ms-sitemap1..10.xml` | allowed | XML, about 5,800 `vehicledetail/{itemId}~US` URLs per file, with `<lastmod>` |
| Lot details | `GET /VehicleDetail/{itemId}~US` | allowed | HTML with `<script type="application/json" id="ProductDetailsVM">` |
| Not found | same URL | allowed | page titled `DetailsNotFoundView` |
| Photo list | `GET https://vis.iaai.com/dimensions?imageKeys={itemId}~SID` | separate host | JSON `keys[]` (`K`, `W`, `H`). The same list is inside `ProductDetailsVM` |
| Photo | `GET https://vis.iaai.com/resizer?imageKeys={key}&width=…&height=…` | separate host | JPEG |
| Search | `/Search` | **disallowed** | HTML. **Not used.** |

### Fields in ProductDetailsVM

All paths below start with `inventoryView.attributes` unless noted otherwise.

| Our field | IAAI path |
|---|---|
| source_lot_id | `inventoryView.itemId` |
| stock number | `StockNumber` |
| VIN | `VIN`. **Masked for guests**, e.g. `5NMSG13D19H******` |
| year / make / model / trim | `Year`, `Make`, `Model`, `Series` |
| odometer | `inventoryView.vehicleInformation` entry `Odometer`: "143,298 mi (Actual)" |
| primary / secondary damage | `PrimaryDamageDesc`, `SecondaryDamageDesc` |
| title | `vehicleInformation` entry `TitleSaleDoc`: "SALVAGE - GREATER THAN 75% (Maryland)". This is more reliable than `TitleCode`, which can be `OTH` |
| keys | `vehicleInformation` entry `KeySlashFob` ("Present"), or `Keys` |
| drivability | `vehicleInformation` entry `StartCode` ("Run & Drive" / "Stationary"), or `RunAndDrive` |
| location | `City`, `State` (has a trailing space), `Zip`, `BranchName`, `StorageLocationLatitude/Longitude` |
| sale date | `AuctionDateTime`: "11/17/2026 3:30:00 PM +00:00" |
| Buy Now | `auctionInformation.biddingInformation.buyNowInd` + `buyNowAmount`. The amount can be set while Buy Now isn't offered |
| current bid | `auctionInformation.prebidInformation.decimalHighBidAmount`, but `showCurrentBid` is false for guests, so it's **hidden** |
| photos | `inventoryView.imageDimensions.keys.$values[].k` |
| engine / fuel / drive / gearbox / body / colour | `EngineInformation`, `FuelTypeDesc`, `DriveLineTypeDesc`, `Transmission`, `BodyStyleName`, `ExteriorColor` |

## Consequences for the design

- **Plan B (Playwright/Cheerio) isn't needed for IAAI:** the data is already JSON inside the HTML. Regex extraction plus a schema check is enough.
- **Filters can't be applied when searching IAAI:** the sitemap only has IDs. Every lot page must be fetched once, and our filters are applied after that.
- **The first full pass is slow:** about 58,000 URLs at 1 request per 2–3 s is roughly 40 hours. After that, only new IDs and changed `lastmod` dates.
- **Refreshes must be prioritised:** refreshing every tracked lot every 120 minutes won't fit the rate limit. Lots whose auction is close come first.
- **Duplicate detection can't use the VIN for IAAI,** because it's masked. The unique key is (source, source_lot_id).
- **Legal:** both sites' terms of use very likely prohibit automated collection, and republishing photos raises copyright questions. Check this before going live.
