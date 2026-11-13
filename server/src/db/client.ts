// Tiny database abstraction so the same code runs on node-postgres (production) and PGlite (tests).

import pg from 'pg';

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
}

export function createPgDb(databaseUrl: string): Db {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  return {
    query: async <T>(sql: string, params: unknown[] = []) => {
      const r = await pool.query(sql, params as unknown[]);
      return { rows: r.rows as T[] };
    },
    close: () => pool.end(),
  };
}
