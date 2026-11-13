// Initial import from the command line.
//   npm run import -- --limit 200                 # all configured providers
//   npm run import -- --limit 200 --provider iaai-web

import { parseArgs } from 'node:util';
import { loadEnv } from '../config/env.js';
import { FileFilterSource } from '../config/filters.js';
import { createPgDb } from '../db/client.js';
import { migrate } from '../db/migrate.js';
import { FetchHttpClient } from '../providers/http.js';
import { createProviders } from '../providers/registry.js';
import { runInitialImport } from '../sync/initial-import.js';
import { PoliteHttpClient } from '../sync/polite-http.js';

try { process.loadEnvFile?.('.env'); } catch { /* use real environment */ }
const env = loadEnv();
const { values } = parseArgs({
  options: {
    limit: { type: 'string', default: '200' },
    provider: { type: 'string' },
    'max-checks': { type: 'string' },
  },
});
const limit = Number(values.limit);
const stamp = () => new Date().toISOString().slice(11, 19);

const db = createPgDb(env.DATABASE_URL);
await migrate(db, m => console.log(`[db] ${m}`));
const filterSets = await new FileFilterSource(env.FILTERS_FILE).load();

const clients = new Map<string, PoliteHttpClient>();
const providers = createProviders(env, id => {
  const c = new PoliteHttpClient(new FetchHttpClient(id, env.HTTP_USER_AGENT, env.HTTP_TIMEOUT_MS), {
    minDelayMs: env.RATE_LIMIT_MIN_MS, maxDelayMs: env.RATE_LIMIT_MAX_MS, retries: 3, backoffBaseMs: 5_000,
  });
  clients.set(id, c);
  return c;
}).filter(p => !values.provider || p.id === values.provider);

let exitCode = 0;
for (const p of providers) {
  console.log(`[${stamp()}] ${p.id}: importing up to ${limit} lots (filter sets: ${filterSets.map(f => f.name).join(', ')})`);
  const r = await runInitialImport(db, p, filterSets, {
    limit,
    maxChecks: values['max-checks'] ? Number(values['max-checks']) : undefined,
    skipKnown: true,
    log: m => console.log(`[${stamp()}] ${p.id} ${m}`),
  });
  const http = clients.get(p.id)!.stats;
  await db.query('UPDATE sync_runs SET requests=$2 WHERE id=$1', [r.runId, http.requests]);
  console.log(`[${stamp()}] ${p.id} DONE run #${r.runId}: ${r.status} · checked ${r.checked} · matched ${r.matched} (added ${r.added}, updated ${r.updated}) · skipped ${r.skipped} · requests ${http.requests} (retries ${http.retries})${r.message ? ' · ' + r.message : ''}`);
  if (r.status === 'failed') exitCode = 1;
}
await db.close();
process.exit(exitCode);
