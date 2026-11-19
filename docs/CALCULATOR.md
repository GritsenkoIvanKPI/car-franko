# Cost calculator

`calculator.html` estimates the full cost of a US car delivered to Ukraine.

All numbers come from [`data/calculator.json`](../data/calculator.json). Edit that file to change prices or rates; no code changes are needed. The maths lives in `assets/js/calc-core.js`, and the tests are in `tests/calc.test.mjs` (run with `node --test tests/calc.test.mjs`).

## Before going live: set your own prices

Values marked **confirmed** came from Car Franko. The rest are placeholders until the real prices arrive:

| Key | What it is | Value now |
|---|---|---|
| `shipping.ports.*.containerUsd` | Container from the US port to Klaipėda | **confirmed**: Savannah 1050, Elizabeth NJ 1100, Houston 1225, Los Angeles 1650, Indianapolis 1250 |
| `shipping.markupPerLocationUsd` | Added to every location's land price | **50** (confirmed) |
| `shipping.locations` | Land price from each location to each port | **forwarder's price list** (450 locations) |
| `shipping.unlistedLandUsd` | Land price for a state with no locations in the list (only DC now) | 600 |
| `shipping.hybridElectricSurchargeUsd` | Extra for hybrids and electric cars | 200 |
| `services.forwardingUsd` | Forwarding services at the port | 370 |
| `services.customsBrokerUsd` | Customs broker | 200 |
| `services.deliveryToUkraineUsd` | Lithuania → Ivano-Frankivsk on our own truck | 800 |
| `services.companyFeeUsd` | Car Franko's services | **500** (confirmed) |
| `services.certificationUsd` | Certification | **170** (confirmed) |
| `services.registrationUsd` | Registration | 60 |
| `auctionFee` | Auction buyer fee curve | approximate |

## Delivery: 5 ports and the forwarder's price list

The customer sees one delivery figure: land transport from the car's location to a US port + $50 + that port's container to Klaipėda. The calculator works it out for each of the 5 ports and uses the cheapest.

- `shipping.ports` holds the 5 ports, their container prices and `source`, the port's column header in the price list.
- `shipping.locations` holds the land price from each location to each port. It is imported from the forwarder's public price list; auction and yard names are dropped, only city and state are kept.
- On the page the customer picks a state, then a location. "Інша локація в штаті" uses the state's median land price to each port.
- Oversized vehicles are quoted individually; the page says so.

To refresh the price list (it changes from time to time):

```
node scripts/import-locations.mjs "https://www.cargoloop.com/LocalTransportation.aspx"
```

The script refuses to write anything if it finds fewer than 50 locations or a port column is missing.

## How the calculation works

### Customs value

Car price + auction fee + delivery to the EU port.

### Customs duties

| Charge | Rule |
|---|---|
| Duty | 10% of the customs value. Electric cars: 0%. |
| Excise, petrol | €50 per litre up to 3.0 L, €100 per litre above that, × age coefficient |
| Excise, diesel | €75 per litre up to 3.5 L, €150 per litre above that, × age coefficient |
| Excise, hybrid | €100 flat per car |
| Excise, electric | €1 per kWh of battery |
| VAT | 20% of (customs value + duty + excise). Since 2026 this applies to electric cars too. |

The age coefficient is the number of full calendar years since manufacture: current year − year of manufacture − 1, at least 1 and at most 15. A 2019 car in 2026 gets 6.

### Pension-fund fee at first registration

The fee is a share of the car's value without VAT. The thresholds are set in subsistence minimums; in 2026 one minimum is 3,328 UAH.

| Car value | Fee |
|---|---|
| Up to 549,120 UAH (165 minimums) | 3% |
| Up to 965,120 UAH (290 minimums) | 4% |
| Above that | 5% |
| Electric cars | Exempt |

### Exchange rates

The calculator uses today's official National Bank of Ukraine rate (`bank.gov.ua`). If that service is unavailable, it falls back to `fx.fallbackUsdUah` and `fx.fallbackEurUah`.

### Where these rules differ from the example calculator

The example (autotrader.org.ua) differs from the Tax Code in three places:

- It counts the age coefficient as year − made, with no −1, so 2019 gets 7 instead of 6.
- It charges hybrids excise by litres and age.
- It charges no excise on electric cars.

Our calculator follows the Tax Code. Re-check the rates each January.

## Links into the calculator

The calculator can be pre-filled from its address:

```
calculator.html?price=12000&fuel=diesel&engine=2.0&year=2019&state=TX&loc=Houston
calculator.html?price=20000&fuel=electric&kwh=75&year=2022&state=CA
```

Car pages use this, including the car's location, for their "Розрахувати вартість під ключ" button.
