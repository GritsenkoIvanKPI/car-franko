#!/usr/bin/env node
// Loads the forwarder's land-transport price list into the calculator.
//
//   node scripts/import-locations.mjs <url-or-saved-page.html>
//
// The source is the forwarder's "local transportation" table: one row per pickup location with
// City, State and a land price to each departure port (column headers like "Savannah, GA").
// Only the ports listed in data/calculator.json → shipping.ports are kept (matched by their `source` header).
// The import keeps the location name, city, state and prices. The auction column is dropped, and a location
// named after an auction gets its city instead, because the website never says which auction a car comes from.
// The result replaces shipping.locations; everything else in the file stays as it is.
import { readFile, writeFile } from 'node:fs/promises';

const src = process.argv[2];
if (!src) { console.error('Usage: node scripts/import-locations.mjs <url-or-saved-page.html>'); process.exit(1); }
const CONFIG = new URL('../data/calculator.json', import.meta.url);
const cfg = JSON.parse(await readFile(CONFIG, 'utf8'));

const html = /^https?:\/\//.test(src)
  ? await (await fetch(src, { headers: { 'User-Agent': 'CarFrankoCalc/1.0 (price list import)' } })).text()
  : await readFile(src, 'utf8');

const decode = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const text = s => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c => text(c[1])));

const head = rows.find(r => r.includes('City') && r.includes('State'));
if (!head) throw new Error('No price table found (expected columns City and State).');
const iCity = head.indexOf('City'), iState = head.indexOf('State');
const portCols = Object.entries(cfg.shipping.ports).map(([key, p]) => {
  const i = head.indexOf(p.source);
  if (i < 0) throw new Error(`Port column "${p.source}" (${key}) not found. Columns: ${head.join(' | ')}`);
  return [key, i];
});

const title = s => s.toLowerCase().replace(/(^|[\s\-'.(\/])\p{L}/gu, m => m.toUpperCase());
const money = s => { const n = Number(String(s || '').replace(/[^0-9.]/g, '')); return s && Number.isFinite(n) && n > 0 ? n : null; };
const STATE_NAMES = Object.fromEntries(Object.entries(cfg.states).map(([code, [name]]) => [name.toUpperCase(), code]));
const stateCode = s => { const u = (s || '').trim().toUpperCase(); return cfg.states[u] ? u : STATE_NAMES[u] || null; };
const AUCTION_WORDS = /copart|iaai|\biaa\b|manheim|adesa|auction|crashedtoys/i; // auction brands and sub-brands
const iName = head.indexOf('Auction Location') >= 0 ? head.indexOf('Auction Location') : 0;
const iZip = head.indexOf('Zip');

// Display name of a pickup location, as the forwarder's list writes it, minus the state (the customer has already picked it).
function locationName(raw, city, state, zip) {
  let n = raw.replace(/^ACE\s*-\s*/i, '').replace(new RegExp(`,?\\s*\\(?\\b${state}\\b\\)?(?=\\s|$)`, 'g'), '').replace(/\s+/g, ' ').trim();
  if (AUCTION_WORDS.test(n) || !n || STATE_NAMES[n.toUpperCase()]) n = `${city}${zip ? ' ' + zip : ''}`; // never name the auction; a bare state name says nothing
  return n === n.toUpperCase() ? title(n) : n;
}
const keyOf = n => n.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const byPlace = new Map();
let skipped = 0;
for (const r of rows) {
  if (r === head || r.length < head.length) continue;
  const state = stateCode(r[iState]), city = title(r[iCity] || '');
  if (!state || !city) { skipped++; continue; } // Canada and other places outside the US
  const land = {};
  for (const [key, i] of portCols) { const v = money(r[i]); if (v) land[key] = v; }
  if (!Object.keys(land).length) { skipped++; continue; }
  const zip = (r[iZip] || '').trim();
  const name = locationName(r[iName] || '', city, state, zip);
  const k = `${state}|${keyOf(name)}`;
  const prev = byPlace.get(k);
  if (!prev) { byPlace.set(k, { name, city, state, land }); continue; }
  // the same yard listed twice: keep the higher price per port, so the estimate never comes out too low
  for (const [p, v] of Object.entries(land)) prev.land[p] = Math.max(prev.land[p] || 0, v);
  if (prev.name === prev.name.toUpperCase() || /^[A-Z\s\d,()-]+$/.test(prev.name)) prev.name = name;
}

const locations = [...byPlace.values()].sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
if (locations.length < 50) throw new Error(`Only ${locations.length} locations parsed; nothing was changed.`);
cfg.updated = new Date().toISOString().slice(0, 10);
cfg.shipping.locations = '__LOCATIONS__';
// one location per line keeps the file readable and the git diff small
const json = JSON.stringify(cfg, null, 2)
  .replace('"__LOCATIONS__"', '[\n' + locations.map(l => '      ' + JSON.stringify(l)).join(',\n') + '\n    ]');
JSON.parse(json);
await writeFile(CONFIG, json + '\n');
const states = new Set(locations.map(l => l.state));
console.log(`${locations.length} locations in ${states.size} states imported (${skipped} rows skipped).`);
