import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { TABLES, migrate, postgresDb, type Db, type Queryable } from './db.ts'

/**
 * Copies the diary database from one Postgres to another (e.g. Render Postgres → Supabase),
 * exactly as stored: ciphertext, wrapped keys, salts and password/session hashes are copied
 * byte-for-byte. Nothing is decrypted — this tool couldn't if it tried.
 *
 *  - The source is only ever read, inside one READ ONLY, REPEATABLE READ transaction, so the copy is
 *    a consistent snapshot even if the app is still serving reads.
 *  - The target gets this app's schema (including the Supabase lockdown), and must be empty.
 *  - Everything is inserted in one transaction, then every table's row count and checksum are
 *    compared with the source snapshot BEFORE committing. Any difference rolls the whole copy back.
 *  - Output is table names, counts and pass/fail only — never rows, hashes or connection strings.
 *
 * Usage (see docs/DATABASE.md):
 *   SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... TARGET_DATABASE_CA_CERT=./prod-ca-2021.crt \
 *     npm run db:copy                # copy and verify
 *     npm run db:copy -- --verify    # compare both databases again (before switching the app over)
 *     npm run db:copy -- --check     # after switching: is everything from the source in the target?
 */

/** Primary-key ordering for each table. Constants only — never built from input. */
export const ORDER: Record<(typeof TABLES)[number], string> = {
  users: 'id',
  sessions: 'token_hash',
  vaults: 'user_id',
  vault_items: 'user_id, kind, id',
  vault_history: 'seq',
}
const BATCH = 500

export interface TableReport {
  table: string
  rows: number
}

export interface Fingerprint {
  rows: number
  sum: string
}

/** Same settings on both sides, so values (timestamps) render identically for the checksum. */
export async function canonical(tx: Queryable) {
  await tx.query("SET LOCAL TIME ZONE 'UTC'")
  await tx.query("SET LOCAL DateStyle = 'ISO, YMD'")
  await tx.query("SET LOCAL extra_float_digits = 3")
}

/** Row count + an MD5 over every row's text form, in primary-key order. Detects any changed byte. */
export async function fingerprint(q: Queryable, table: (typeof TABLES)[number]): Promise<Fingerprint> {
  const { rows } = await q.query<{ n: string; sum: string }>(
    `SELECT count(*) AS n, coalesce(md5(string_agg(md5(t::text), '' ORDER BY ${ORDER[table]})), '') AS sum FROM ${table} t`,
  )
  return { rows: Number(rows[0].n), sum: rows[0].sum }
}

export async function columns(q: Queryable): Promise<string> {
  const { rows } = await q.query<{ c: string }>(
    `SELECT table_name || '.' || column_name || ':' || data_type AS c FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1) ORDER BY table_name, ordinal_position`,
    [[...TABLES]],
  )
  return rows.map((r) => r.c).join(',')
}

/**
 * With row level security on (migration 2) and no policies, a role that neither owns the tables nor
 * has BYPASSRLS reads ZERO rows — silently. A copy or backup made that way would look fine and be empty.
 */
export async function assertSeesAllRows(q: Queryable): Promise<void> {
  const { rows } = await q.query<{ ok: boolean }>(
    `SELECT (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user)
            OR bool_and(pg_has_role(current_user, relowner, 'USAGE')) AS ok
     FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname = ANY($1)`,
    [[...TABLES]],
  )
  if (!rows[0]?.ok)
    throw new Error('This database user would not see every row (row level security). Connect as the user that owns the tables (on Supabase: postgres).')
}

/** A consistent, read-only view of the database, with canonical settings, as a user that sees every row. */
export async function readOnlySnapshot<T>(db: Db, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
    await canonical(tx)
    await assertSeesAllRows(tx)
    return fn(tx)
  })
}

export async function copyDatabase(source: Db, target: Db, log: (line: string) => void = () => {}): Promise<TableReport[]> {
  await migrate(target)
  return readOnlySnapshot(source, async (src) => {
    if ((await columns(src)) !== (await columns(target)))
      throw new Error('The source and target tables don’t have the same columns. Deploy the same app version to both first.')
    return target.transaction(async (dst) => {
      await canonical(dst)
      for (const table of TABLES) {
        const { rows } = await dst.query(`SELECT 1 FROM ${table} LIMIT 1`)
        if (rows.length) throw new Error(`The target already has data in "${table}". Refusing to copy over it.`)
      }
      const report: TableReport[] = []
      // Parents before children, so foreign keys hold at every step.
      for (const table of TABLES) {
        let copied = 0
        for (let offset = 0; ; offset += BATCH) {
          // Rows leave Postgres as JSON text built by Postgres itself and go back in the same way, so no
          // value passes through a JavaScript type (a JS Date would drop timestamps' microseconds).
          const { rows } = await src.query<{ batch: string | null; n: number }>(
            `SELECT json_agg(t ORDER BY ${ORDER[table]})::text AS batch, count(*)::int AS n
             FROM (SELECT * FROM ${table} ORDER BY ${ORDER[table]} LIMIT ${BATCH} OFFSET ${offset}) t`,
          )
          if (!rows[0].batch) break
          await dst.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)`, [rows[0].batch])
          copied += rows[0].n
        }
        log(`  ${table}: ${copied} rows copied`)
        report.push({ table, rows: copied })
      }
      await dst.query(
        "SELECT setval(pg_get_serial_sequence('vault_history', 'seq'), COALESCE((SELECT max(seq) FROM vault_history), 1), (SELECT count(*) > 0 FROM vault_history))",
      )
      for (const table of TABLES) {
        const [a, b] = await Promise.all([fingerprint(src, table), fingerprint(dst, table)])
        if (a.rows !== b.rows || a.sum !== b.sum) throw new Error(`Verification failed for "${table}". Nothing was committed.`)
        log(`  ${table}: verified (${b.rows} rows, checksums match)`)
      }
      return report
    })
  })
}

/** Compares both databases table by table. Meant for the window before the app is switched over. */
export async function verifyDatabases(source: Db, target: Db, log: (line: string) => void = () => {}): Promise<boolean> {
  let ok = true
  await readOnlySnapshot(source, (src) =>
    readOnlySnapshot(target, async (dst) => {
      for (const table of TABLES) {
        const [a, b] = await Promise.all([fingerprint(src, table), fingerprint(dst, table)])
        const same = a.rows === b.rows && a.sum === b.sum
        ok &&= same
        log(`  ${table}: source ${a.rows} rows, target ${b.rows} rows — ${same ? 'identical' : 'DIFFERENT'}`)
      }
    }),
  )
  return ok
}

/**
 * After the switch, people keep writing to the target, so the databases legitimately drift apart.
 * This checks the thing that matters before the source is deleted: every account, diary and page from
 * the source is in the target — or, for a page, was deleted or replaced there since and so sits in the
 * target's history. Returns the number of missing items (0 means safe).
 */
export async function checkNothingMissing(source: Db, target: Db, log: (line: string) => void = () => {}): Promise<number> {
  return readOnlySnapshot(source, (src) =>
    readOnlySnapshot(target, async (dst) => {
      let missing = 0
      const users = (await src.query<{ id: string }>('SELECT id FROM users')).rows.map((r) => r.id)
      const { rows: u } = await dst.query<{ n: string }>('SELECT count(*) AS n FROM unnest($1::uuid[]) AS k(id) WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = k.id)', [users])
      missing += Number(u[0].n)
      log(`  accounts missing: ${u[0].n} of ${users.length}`)

      const vaults = (await src.query<{ user_id: string }>('SELECT user_id FROM vaults')).rows.map((r) => r.user_id)
      const { rows: v } = await dst.query<{ n: string }>(
        `SELECT count(*) AS n FROM unnest($1::uuid[]) AS k(user_id)
         WHERE NOT EXISTS (SELECT 1 FROM vaults WHERE user_id = k.user_id)
           AND NOT EXISTS (SELECT 1 FROM vault_history h WHERE h.user_id = k.user_id AND h.kind = 'meta' AND h.reason = 'erase')`,
        [vaults],
      )
      missing += Number(v[0].n)
      log(`  diaries missing: ${v[0].n} of ${vaults.length}`)

      let pages = 0
      let lost = 0
      for (let offset = 0; ; offset += BATCH) {
        const { rows } = await src.query<{ user_id: string; kind: string; id: string }>(
          `SELECT user_id, kind, id FROM vault_items ORDER BY ${ORDER.vault_items} LIMIT ${BATCH} OFFSET ${offset}`,
        )
        if (!rows.length) break
        pages += rows.length
        const { rows: m } = await dst.query<{ n: string }>(
          `SELECT count(*) AS n FROM unnest($1::uuid[], $2::text[], $3::text[]) AS k(user_id, kind, id)
           WHERE NOT EXISTS (SELECT 1 FROM vault_items i WHERE i.user_id = k.user_id AND i.kind = k.kind AND i.id = k.id)
             AND NOT EXISTS (SELECT 1 FROM vault_history h WHERE h.user_id = k.user_id AND h.kind = k.kind AND h.id = k.id)`,
          [rows.map((r) => r.user_id), rows.map((r) => r.kind), rows.map((r) => r.id)],
        )
        lost += Number(m[0].n)
      }
      missing += lost
      log(`  pages and settings missing: ${lost} of ${pages}`)
      return missing
    }),
  )
}

/** A CA given either as PEM text or as a path to a .crt/.pem file. */
export function readCa(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value.includes('-----BEGIN') ? value : readFileSync(value, 'utf8')
}

async function main() {
  const mode = process.argv.includes('--verify') ? 'verify' : process.argv.includes('--check') ? 'check' : 'copy'
  const sourceUrl = process.env.SOURCE_DATABASE_URL
  const targetUrl = process.env.TARGET_DATABASE_URL
  if (!sourceUrl || !targetUrl) throw new Error('Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL.')
  if (sourceUrl === targetUrl) throw new Error('The source and target are the same database.')
  const source = await postgresDb(sourceUrl, { caCert: readCa(process.env.SOURCE_DATABASE_CA_CERT), poolMax: 2 })
  const target = await postgresDb(targetUrl, { caCert: readCa(process.env.TARGET_DATABASE_CA_CERT), poolMax: 2 })
  const log = (line: string) => console.log(line)
  try {
    if (mode === 'copy') {
      console.log('Copying (the source is only read)…')
      await copyDatabase(source, target, log)
      console.log('Done. The copy matches the source exactly. Nothing in the source was changed.')
    } else if (mode === 'verify') {
      console.log('Comparing source and target…')
      const ok = await verifyDatabases(source, target, log)
      console.log(ok ? 'Identical.' : 'The databases differ (expected only if the app has written to one of them since the copy).')
      process.exitCode = ok ? 0 : 1
    } else {
      console.log('Checking that everything in the source exists in the target…')
      const missing = await checkNothingMissing(source, target, log)
      console.log(missing ? `${missing} item(s) are missing from the target. Do NOT delete the source.` : 'Nothing is missing.')
      process.exitCode = missing ? 1 : 0
    }
  } finally {
    await Promise.all([source.close(), target.close()])
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    // The message only — never the connection strings.
    console.error(`Stopped: ${(err as { code?: string }).code ? `[${(err as { code?: string }).code}] ` : ''}${(err as Error).message}`)
    process.exitCode = 1
  })
}
