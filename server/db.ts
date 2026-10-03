/**
 * The database layer. Every query in the app goes through `Queryable.query(text, params)` with
 * positional parameters ($1, $2, …) — values are never concatenated into SQL.
 *
 * Production uses node-postgres against a hosted Postgres (Supabase, via its connection pooler).
 * Development and tests use PGlite (real Postgres compiled to WebAssembly) or a local PostgreSQL,
 * so the same SQL runs everywhere.
 */

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>
}

export interface Db extends Queryable {
  /** Runs `fn` in a single transaction: everything in it commits together or not at all. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>
  close(): Promise<void>
}

/** The app's tables. Every table added by a future migration must be listed here and get RLS (see migration 2). */
export const TABLES = ['users', 'sessions', 'vaults', 'vault_items', 'vault_history'] as const

/**
 * Schema versions, applied in order, each exactly once. Never edit a shipped migration — add a new one.
 * A string is split into statements at line-ending semicolons; an array is used as-is (for statements
 * that contain semicolons themselves, like DO blocks).
 */
const MIGRATIONS: (string | string[])[] = [
  /* 1 */ `
  CREATE TABLE users (
    id            uuid PRIMARY KEY,
    username      text NOT NULL,
    password_hash text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX users_username_key ON users (lower(username));

  -- Only a SHA-256 of each session token is stored, so a database leak doesn't hand out live sessions.
  CREATE TABLE sessions (
    token_hash text PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  );
  CREATE INDEX sessions_user_idx ON sessions (user_id);

  -- One diary per account. "meta" holds the vault key wrapped by the phrase / passkeys, plus the
  -- non-secret salts needed to unwrap it. The server can't unwrap it.
  CREATE TABLE vaults (
    user_id    uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    meta       jsonb NOT NULL,
    rev        integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  -- Encrypted entries ('record') and encrypted private settings ('blob'). Only ciphertext + IV.
  CREATE TABLE vault_items (
    user_id    uuid NOT NULL REFERENCES vaults (user_id) ON DELETE CASCADE,
    kind       text NOT NULL CHECK (kind IN ('record', 'blob')),
    id         text NOT NULL,
    iv         text NOT NULL,
    ct         text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, kind, id)
  );

  -- Every overwritten or deleted item (and every previous meta) is copied here first and kept for a
  -- while, so a bug, a bad sync or a mistaken delete can be undone. Still only ciphertext.
  CREATE TABLE vault_history (
    seq         bigserial PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind        text NOT NULL CHECK (kind IN ('record', 'blob', 'meta')),
    id          text NOT NULL,
    payload     jsonb NOT NULL,
    reason      text NOT NULL,
    archived_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX vault_history_user_idx ON vault_history (user_id, archived_at);
  `,

  /* 2 — lock the tables away from Supabase's auto-generated Data API (PostgREST/GraphQL).
   * On Supabase, tables in `public` are granted to the `anon` and `authenticated` roles by default,
   * and the anon key that goes with them is not a secret. This app never uses that API (only this
   * server talks to the database, as the tables' owner), so:
   *  - RLS is enabled with NO policies: anon/authenticated get no rows even if a grant slips back.
   *    The owner role the server connects as isn't subject to RLS (don't use FORCE ROW LEVEL SECURITY).
   *  - Their grants are revoked, now and for tables created later.
   * On plain Postgres (local, tests) the roles don't exist and only the harmless RLS switch runs. */
  [
    ...['users', 'sessions', 'vaults', 'vault_items', 'vault_history', 'schema_migrations'].map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`),
    `DO $$
    DECLARE r text;
    BEGIN
      FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
          EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
          EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
          EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
          EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
        END IF;
      END LOOP;
    END $$`,
  ],
]

export async function migrate(db: Db): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    integer PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`)
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const version = i + 1
    await db.transaction(async (tx) => {
      // Serialises concurrent starts (e.g. two instances during a deploy).
      await tx.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE')
      const done = await tx.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version])
      if (done.rows.length) return
      const m = MIGRATIONS[i]
      const statements = Array.isArray(m) ? m : m.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)
      for (const statement of statements) {
        await tx.query(statement)
      }
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version])
    })
  }
}

/**
 * Problems that would leave the diary's tables reachable through Supabase's Data API roles
 * (`anon`, `authenticated`). Empty when everything is locked down, or on Postgres without those roles.
 */
export async function securityWarnings(db: Queryable): Promise<string[]> {
  const warnings: string[] = []
  const { rows: noRls } = await db.query<{ relname: string }>(
    "SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname = ANY($1) AND NOT relrowsecurity",
    [[...TABLES]],
  )
  for (const r of noRls) warnings.push(`row level security is off for table ${r.relname}`)
  const { rows: grants } = await db.query<{ grantee: string; table_name: string }>(
    `SELECT DISTINCT grantee, table_name FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = ANY($1) AND grantee IN ('anon', 'authenticated')`,
    [[...TABLES]],
  )
  for (const g of grants) warnings.push(`role ${g.grantee} has privileges on table ${g.table_name}`)
  return warnings
}

export interface PostgresOptions {
  /**
   * PEM of the CA that signed the database server's certificate (for Supabase: "Supabase Root 2021 CA",
   * from Dashboard → Database settings → SSL configuration). When given, the connection uses TLS and
   * verifies both the certificate chain and the host name (like sslmode=verify-full); any sslmode in
   * the URL is ignored so it can't weaken that.
   */
  caCert?: string
  /** Connections kept open. Keep it small on free tiers (the Supabase session pooler has a modest limit). */
  poolMax?: number
}

/** Accepts a PEM pasted with real newlines or with literal "\n" (as some dashboards store it). */
export function normalizePem(pem: string): string {
  return pem.replace(/\\n/g, '\n').trim() + '\n'
}

/** True for hosts on a private network or this machine, where the database isn't reachable from the internet. */
export function isPrivateHost(connectionString: string): boolean {
  const host = new URL(connectionString).hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || !host.includes('.')
}

/** node-postgres, for production. */
export async function postgresDb(connectionString: string, { caCert, poolMax = 5 }: PostgresOptions = {}): Promise<Db> {
  const { default: pg } = await import('pg')
  let config: import('pg').PoolConfig = { connectionString, max: poolMax }
  if (caCert) {
    // node-postgres lets SSL settings in the URL override the `ssl` option, so strip them.
    const url = new URL(connectionString)
    for (const p of [...url.searchParams.keys()]) if (p.startsWith('ssl') || p === 'uselibpqcompat') url.searchParams.delete(p)
    config = { connectionString: url.toString(), max: poolMax, ssl: { ca: normalizePem(caCert), rejectUnauthorized: true } }
  }
  const pool = new pg.Pool({ ...config, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000 })
  // An idle client losing its connection must not crash the process; the pool replaces it.
  pool.on('error', (err) => console.error(`[db] idle client error: ${(err as { code?: string }).code ?? err.name}`))
  return {
    query: (text, params) => pool.query(text, params) as never,
    async transaction(fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn({ query: (text, params) => client.query(text, params) as never })
        await client.query('COMMIT')
        return result
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw err
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

/**
 * PGlite, for development and tests only. `dataDir` keeps data between restarts;
 * omit it for a throwaway in-memory database.
 */
export async function pgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite')
  if (dataDir) (await import('node:fs')).mkdirSync(dataDir, { recursive: true })
  const pg = new PGlite(dataDir)
  // PGlite runs one statement at a time; queue transactions so they never interleave.
  let chain: Promise<unknown> = Promise.resolve()
  const queued = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn)
    chain = run.catch(() => {})
    return run
  }
  return {
    query: (text, params) => queued(() => pg.query(text, params)) as never,
    transaction: (fn) => queued(() => pg.transaction((tx) => fn({ query: (text, params) => tx.query(text, params) as never }))),
    close: () => pg.close(),
  }
}
