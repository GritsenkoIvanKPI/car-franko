// Run: node --test tests/calc.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../assets/js/calc-core.js');
const cfg = JSON.parse(readFileSync(new URL('../data/calculator.json', import.meta.url), 'utf8'));
const base = { currentYear: 2026, usdUah: 45.3849, eurUah: 50.3379 };

test('age coefficient = full calendar years (year − made − 1), between 1 and 15', () => {
  assert.equal(C.ageCoefficient(2019, 2026), 6);
  assert.equal(C.ageCoefficient(2025, 2026), 1);
  assert.equal(C.ageCoefficient(2026, 2026), 1);
  assert.equal(C.ageCoefficient(2000, 2026), 15);
});

test('excise in EUR for each fuel and engine band (2026 rules)', () => {
  const e = o => C.exciseEur({ prodYear: 2019, currentYear: 2026, ...o }, cfg.customs);
  assert.equal(e({ fuel: 'gasoline', engineL: 2.0 }), 600);   // 50 × 2.0 × 6
  assert.equal(e({ fuel: 'gasoline', engineL: 3.0 }), 900);   // still ≤ 3000 cc
  assert.equal(e({ fuel: 'gasoline', engineL: 3.5 }), 2100);  // 100 × 3.5 × 6
  assert.equal(e({ fuel: 'diesel', engineL: 2.0 }), 900);     // 75 × 2.0 × 6
  assert.equal(e({ fuel: 'diesel', engineL: 4.0 }), 3600);    // 150 × 4.0 × 6
  assert.equal(e({ fuel: 'hybrid', engineL: 2.5 }), 100);     // flat per car
  assert.equal(e({ fuel: 'electric', batteryKwh: 75 }), 75);  // 1 € per kWh
});

test('auction fee follows the table, then rate + plus', () => {
  const f = p => C.auctionFee(p, cfg.auctionFee);
  assert.equal(f(300), 325);
  assert.equal(f(3000), 745);
  assert.equal(f(10000), 1140);
  assert.equal(f(6250), 978);
  assert.equal(f(20000), 1490);
  assert.equal(f(50000), 3290);
});

test('pension fund: 3% / 4% / 5% by value in subsistence minimums; electric exempt', () => {
  const p = (usd, fuel = 'gasoline') => C.pensionFee(usd, { fuel, usdUah: base.usdUah }, cfg.pensionFund);
  assert.equal(p(12000).rate, 0.03);   // 544 619 UAH ≤ 549 120
  assert.equal(p(12200).rate, 0.04);   // 553 696 UAH
  assert.equal(p(21300).rate, 0.05);   // 966 698 UAH > 965 120
  assert.deepEqual(p(40000, 'electric'), { rate: 0, usd: 0 });
});

test('full calculation: $10 000 petrol 2.0 L 2019 via Houston', () => {
  const r = C.calculate({ ...base, price: 10000, fuel: 'gasoline', engineL: 2.0, prodYear: 2019, port: 'TX' }, cfg);
  const item = k => r.groups.flatMap(g => g.items).find(i => i.key === k).usd;
  assert.equal(item('auctionFee'), 1140);
  const route = C.resolveRoute('TX', '', cfg.shipping);
  assert.equal(item('shipping'), route.usd);            // one delivery figure: land + markup + container
  const cv = 10000 + 1140 + route.usd;
  assert.equal(r.customsValue, cv);
  assert.equal(item('duty'), Math.round(cv * 0.1));     // 10 %
  assert.equal(item('excise'), Math.round(600 * 50.3379 / 45.3849));
  assert.equal(item('vat'), Math.round((cv + item('duty') + item('excise')) * 0.2));
  assert.equal(r.total, r.groups.reduce((a, g) => a + g.usd, 0));
  assert.equal(r.grandTotal, r.total + r.extrasTotal);
  assert.ok(r.extras.find(e => e.key === 'pension').label.includes('4%'));
});

test('electric: no duty, excise by battery, VAT applies, shipping surcharge, no pension fee', () => {
  const r = C.calculate({ ...base, price: 15000, fuel: 'electric', batteryKwh: 75, prodYear: 2022, port: 'CA' }, cfg);
  const item = k => r.groups.flatMap(g => g.items).find(i => i.key === k).usd;
  assert.equal(item('duty'), 0);
  assert.equal(item('excise'), Math.round(75 * 50.3379 / 45.3849));
  assert.ok(item('vat') > 0);
  assert.equal(item('shipping'), C.resolveRoute('CA', '', cfg.shipping).usd + cfg.shipping.hybridElectricSurchargeUsd);
  assert.equal(r.extras.find(e => e.key === 'pension').usd, 0);
});

const ship = { ...cfg.shipping, markupPerLocationUsd: 50,
  ports: { GA: { label: 'Savannah, GA', containerUsd: 1050 }, NJ: { label: 'Elizabeth, NJ', containerUsd: 1100 } },
  locations: [
    { name: 'Akron 44203', city: 'Barberton', state: 'OH', port: 'NJ', landUsd: 550 },
    { name: 'Albany 12205', city: 'Albany', state: 'NY', port: 'NJ', landUsd: 325 },
    { name: 'Atlanta East 30680', city: 'Winder', state: 'GA', port: 'GA', landUsd: 385 },
  ] };

test('delivery = land price to the location\'s own port + $50 + container', () => {
  const r = C.resolveRoute('NJ', 'Akron 44203', ship);
  assert.equal(r.location.city, 'Barberton');
  assert.equal(r.usd, 550 + 50 + 1100);
});

test('a port lists only its own (colour-marked) locations', () => {
  assert.deepEqual(C.portLocations('NJ', ship).map(l => l.name), ['Albany 12205', 'Akron 44203']); // sorted by state, then name
  assert.deepEqual(C.portLocations('GA', ship).map(l => l.name), ['Atlanta East 30680']);
  assert.equal(C.resolveRoute('GA', 'Akron 44203', ship).location, null); // a location of another port is not accepted
});

test('no location chosen: median land price of the port\'s locations', () => {
  assert.equal(C.resolveRoute('NJ', '', ship).usd, Math.round((325 + 550) / 2) + 50 + 1100);
});

test('car pages find the location by city and state', () => {
  assert.equal(C.findLocation({ city: 'Winder', state: 'GA' }, ship).name, 'Atlanta East 30680');
  assert.equal(C.findLocation({ name: 'Akron 44203' }, ship).port, 'NJ');
  assert.equal(C.findLocation({ city: 'Winder', state: 'TX' }, ship), null);
});

test('price list: 5 ports with the agreed containers, every location on one of them, no auction names', () => {
  const P = cfg.shipping.ports;
  assert.deepEqual(Object.fromEntries(Object.entries(P).map(([k, p]) => [k, p.containerUsd])), { GA: 1050, NJ: 1100, TX: 1225, CA: 1650, IN: 1250 });
  assert.equal(cfg.shipping.markupPerLocationUsd, 50);
  assert.ok(cfg.shipping.locations.length > 500);
  for (const l of cfg.shipping.locations) {
    assert.ok(P[l.port], l.name);
    assert.ok(cfg.states[l.state], l.state);
    assert.ok(l.landUsd > 0, l.name);
    assert.deepEqual(Object.keys(l).sort(), ['city', 'landUsd', 'name', 'port', 'state']);
    assert.ok(!/copart|iaai|\biaa\b|auction|crashedtoys/i.test(l.name), l.name); // our sources; Manheim, PA is a real town
  }
  for (const k of Object.keys(P)) assert.ok(C.portLocations(k, cfg.shipping).length > 0, k);
});
