// All settings come from environment variables (.env locally). Validated once at startup.

import { z } from 'zod';

const list = (fallback: string) => z.string().default(fallback).transform(s => s.split(',').map(x => x.trim()).filter(Boolean));

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  /** Providers to run, by id: iaai-web, copart-web (later: apibara). */
  PROVIDERS: list('iaai-web,copart-web'),
  /** JSON file with filter sets (see config/filters.example.json). */
  FILTERS_FILE: z.string().default('./config/filters.json'),
  /** Identify ourselves honestly; include a contact URL or email. */
  HTTP_USER_AGENT: z.string().default('CarFrankoLotSync/0.1 (+https://github.com/GritsenkoIvanKPI/car-franko)'),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  IAAI_SITEMAP_INDEX_URL: z.string().url().default('https://www.iaai.com/Xj9rDOVMEi0hc38S/sitemap_index.xml'),
  /** Gap between requests to one source, picked at random in [min, max]. */
  RATE_LIMIT_MIN_MS: z.coerce.number().int().min(1000).default(2000),
  RATE_LIMIT_MAX_MS: z.coerce.number().int().min(1000).default(3000),
}).refine(e => e.RATE_LIMIT_MAX_MS >= e.RATE_LIMIT_MIN_MS, { message: 'RATE_LIMIT_MAX_MS must be >= RATE_LIMIT_MIN_MS', path: ['RATE_LIMIT_MAX_MS'] });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${msg}`);
  }
  return parsed.data;
}
