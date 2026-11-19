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

test('full calculation: $10 000 petrol 2.0 L 2019 from Texas', () => {
  const r = C.calculate({ ...base, price: 10000, fuel: 'gasoline', engineL: 2.0, prodYear: 2019, state: 'TX' }, cfg);
  const item = k => r.groups.flatMap(g => g.items).find(i => i.key === k).usd;
  assert.equal(item('auctionFee'), 1140);
  const route = C.resolveRoute('TX', '', cfg.states, cfg.shipping);
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
  const r = C.calculate({ ...base, price: 15000, fuel: 'electric', batteryKwh: 75, prodYear: 2022, state: 'CA' }, cfg);
  const item = k => r.groups.flatMap(g => g.items).find(i => i.key === k).usd;
  assert.equal(item('duty'), 0);
  assert.equal(item('excise'), Math.round(75 * 50.3379 / 45.3849));
  assert.ok(item('vat') > 0);
  assert.equal(item('shipping'), C.resolveRoute('CA', '', cfg.states, cfg.shipping).usd + cfg.shipping.hybridElectricSurchargeUsd);
  assert.equal(r.extras.find(e => e.key === 'pension').usd, 0);
});

test('unknown state falls back to the New Jersey port', () => {
  const r = C.calculate({ ...base, price: 5000, fuel: 'gasoline', engineL: 1.5, prodYear: 2018, state: 'XX' }, cfg);
  assert.equal(r.port.key, 'NJ');
});

const ship = { ...cfg.shipping, markupPerLocationUsd: 50, ports: { GA: { label: 'GA', containerUsd: 1050 }, NJ: { label: 'NJ', containerUsd: 1100 } } };

test('exact location: cheapest port wins, delivery = land + $50 + container', () => {
  const shipping = { ...ship, locations: [{ name: 'Elkton 21921', city: 'Elkton', state: 'MD', land: { GA: 700, NJ: 330 } }] };
  const r = C.resolveRoute('MD', 'Elkton', cfg.states, shipping);
  assert.equal(r.portKey, 'NJ');
  assert.equal(r.usd, 330 + 50 + 1100);
  assert.equal(r.location.city, 'Elkton');
  assert.equal(C.resolveRoute('MD', 'Elkton 21921', cfg.states, shipping).usd, r.usd); // by name, as the page sends it
});

test('another place in a listed state uses the state median per port', () => {
  const shipping = { ...ship, locations: [
    { name: 'A', city: 'A', state: 'GA', land: { GA: 200, NJ: 900 } },
    { name: 'B', city: 'B', state: 'GA', land: { GA: 300, NJ: 900 } },
    { name: 'C', city: 'C', state: 'GA', land: { GA: 900, NJ: 900 } },
  ] };
  const r = C.resolveRoute('GA', 'Nowhere', cfg.states, shipping);
  assert.equal(r.location, null);
  assert.equal(r.portKey, 'GA');
  assert.equal(r.usd, 300 + 50 + 1050);
});

test('a state missing from the price list uses its default port and unlistedLandUsd', () => {
  const r = C.resolveRoute('DC', '', cfg.states, cfg.shipping);
  assert.equal(r.portKey, cfg.states.DC[1]);
  assert.equal(r.usd, cfg.shipping.unlistedLandUsd + cfg.shipping.markupPerLocationUsd + cfg.shipping.ports[r.portKey].containerUsd);
});

test('price list: 5 ports, every state maps to a port, no auction names', () => {
  assert.deepEqual(Object.keys(cfg.shipping.ports).sort(), ['CA', 'GA', 'IN', 'NJ', 'TX']);
  for (const [code, [, port]] of Object.entries(cfg.states)) assert.ok(cfg.shipping.ports[port], code);
  assert.ok(cfg.shipping.locations.length > 300);
  for (const l of cfg.shipping.locations) {
    assert.ok(cfg.states[l.state], l.state);
    assert.ok(Object.keys(l.land).every(k => cfg.shipping.ports[k] && l.land[k] > 0), l.city);
    assert.deepEqual(Object.keys(l).sort(), ['city', 'land', 'name', 'state']);
    assert.ok(!/copart|iaai|\biaa\b|auction|crashedtoys/i.test(l.name), l.name); // our sources; Manheim, PA is a real town
  }
});
