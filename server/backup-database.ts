import { createReadStream, createWriteStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { createGunzip, createGzip } from 'node:zlib'
import { ORDER, canonical, columns, fingerprint, readCa, readOnlySnapshot, type Fingerprint } from './copy-database.ts'
import { TABLES, migrate, postgresDb, type Db } from './db.ts'

/**
 * Database backups that verify themselves.
 *
 * A backup is a gzipped file of JSON lines: a header, the rows of every table (as Postgres itself
 * renders them, so nothing is altered on the way), and the row count + checksum of every table, all
 * taken from ONE consistent read-only snapshot. Restoring checks the restored data against those
 * checksums before committing, so a damaged or tampered file is refused instead of half-restored.
 *
 * What's inside is what the database holds: ciphertext, wrapped keys, salts and password/session
 * hashes — nobody's diary can be read from it without their phrase. It still deserves care (weak
 * phrases can be guessed offline), so the scheduled GitHub backup encrypts it with age before storing it.
 *
 *   DATABASE_URL=… DATABASE_CA_CERT=… npm run db:backup -- --out backup.json.gz [--restore-check]
 *   TARGET_DATABASE_URL=… TARGET_DATABASE_CA_CERT=… npm run db:restore -- backup.json.gz
 *
 * --restore-check also restores the new backup into RESTORE_DATABASE_URL (an empty scratch database)
 * and verifies it there. Output is pass/fail only (--verbose adds per-table counts).
 */

const FORMAT = 1
/** Rows per line. Small enough that a line stays a manageable size even with long pages. */
const BATCH = 100

interface Header {
  app: 'little-corner'
  kind: 'database-backup'
  format: number
  createdAt: string
  columns: string
}

interface Trailer {
  end: true
  fingerprints: Record<string, Fingerprint>
}

/** Writes a backup of `db` to `out` (gzipped). Returns the fingerprints it recorded. */
export async function writeBackup(db: Db, out: NodeJS.WritableStream): Promise<Record<string, Fingerprint>> {
  const gzip = createGzip()
  const done = pipeline(gzip, out)
  const write = (line: string) => (gzip.write(line + '\n') ? Promise.resolve() : new Promise<void>((r) => gzip.once('drain', () => r())))
  try {
    const fingerprints = await readOnlySnapshot(db, async (tx) => {
      const header: Header = { app: 'little-corner', kind: 'database-backup', format: FORMAT, createdAt: new Date().toISOString(), columns: await columns(tx) }
      await write(JSON.stringify(header))
      const fps: Record<string, Fingerprint> = {}
      for (const table of TABLES) {
        for (let offset = 0; ; offset += BATCH) {
          const { rows } = await tx.query<{ batch: string | null }>(
            // jsonb_agg, not json_agg: json_agg puts newlines between rows, which would break the line format.
            `SELECT jsonb_agg(t ORDER BY ${ORDER[table]})::text AS batch
             FROM (SELECT * FROM ${table} ORDER BY ${ORDER[table]} LIMIT ${BATCH} OFFSET ${offset}) t`,
          )
          if (!rows[0].batch) break
          // The rows' JSON is spliced in as Postgres produced it — never parsed and re-serialised.
          await write(`{"table":${JSON.stringify(table)},"rows":${rows[0].batch}}`)
        }
        fps[table] = await fingerprint(tx, table)
      }
      const trailer: Trailer = { end: true, fingerprints: fps }
      await write(JSON.stringify(trailer))
      return fps
    })
    gzip.end()
    await done
    return fingerprints
  } catch (err) {
    gzip.destroy()
    await done.catch(() => {})
    throw err
  }
}

/**
 * Restores a backup into an EMPTY database, in one transaction, committing only if every table's row
 * count and checksum match the ones recorded in the backup.
 */
export async function restoreBackup(input: NodeJS.ReadableStream, target: Db): Promise<Record<string, Fingerprint>> {
  await migrate(target)
  return target.transaction(async (tx) => {
    await canonical(tx)
    for (const table of TABLES) {
      const { rows } = await tx.query(`SELECT 1 FROM ${table} LIMIT 1`)
      if (rows.length) throw new Error(`The target already has data in "${table}". Restore into an empty database.`)
    }
    const lines = createInterface({ input: (input as Readable).pipe(createGunzip()), crlfDelay: Infinity })
    let header: Header | null = null
    let trailer: Trailer | null = null
    let seen = -1
    for await (const line of lines) {
      if (!line) continue
      if (trailer) throw new Error('This backup has data after its end marker.')
      if (!header) {
        const h = JSON.parse(line) as Header
        if (h.app !== 'little-corner' || h.kind !== 'database-backup') throw new Error('This isn’t a little-corner database backup.')
        if (h.format !== FORMAT) throw new Error(`This backup is format ${h.format}; this version reads format ${FORMAT}.`)
        if (h.columns !== (await columns(tx))) throw new Error('This backup was made with a different database layout. Restore it with the app version that made it.')
        header = h
        continue
      }
      const parsed = JSON.parse(line) as { table?: string; rows?: unknown; end?: true; fingerprints?: Trailer['fingerprints'] }
      if (parsed.end) {
        trailer = parsed as Trailer
        continue
      }
      const index = TABLES.indexOf(parsed.table as (typeof TABLES)[number])
      if (index < 0 || index < seen) throw new Error('This backup’s tables are out of order or unknown.')
      seen = index
      if (!Array.isArray(parsed.rows)) throw new Error('This backup has a damaged line.')
      // Values are strings/objects as Postgres wrote them; the checksums below prove nothing changed.
      await tx.query(`INSERT INTO ${TABLES[index]} SELECT * FROM jsonb_populate_recordset(NULL::${TABLES[index]}, $1::jsonb)`, [
        JSON.stringify(parsed.rows),
      ])
    }
    if (!header || !trailer) throw new Error('This backup is incomplete (it was cut off).')
    await tx.query(
      "SELECT setval(pg_get_serial_sequence('vault_history', 'seq'), COALESCE((SELECT max(seq) FROM vault_history), 1), (SELECT count(*) > 0 FROM vault_history))",
    )
    const restored: Record<string, Fingerprint> = {}
    for (const table of TABLES) {
      const want = trailer.fingerprints[table]
      const got = await fingerprint(tx, table)
      if (!want || want.rows !== got.rows || want.sum !== got.sum) throw new Error(`The restored "${table}" doesn't match the backup. Nothing was committed.`)
      restored[table] = got
    }
    return restored
  })
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}

async function connect(urlVar: string, caVar: string): Promise<Db> {
  const url = process.env[urlVar]
  if (!url) throw new Error(`Set ${urlVar}.`)
  return postgresDb(url, { caCert: readCa(process.env[caVar]), poolMax: 2 })
}

async function main() {
  const verbose = process.argv.includes('--verbose')
  const report = (fps: Record<string, Fingerprint>) => {
    if (verbose) for (const [t, f] of Object.entries(fps)) console.log(`  ${t}: ${f.rows} rows`)
  }
  if (process.argv[2] === 'restore') {
    const file = process.argv[3]
    if (!file) throw new Error('Usage: npm run db:restore -- <backup.json.gz>')
    const target = await connect('TARGET_DATABASE_URL', 'TARGET_DATABASE_CA_CERT')
    try {
      report(await restoreBackup(createReadStream(file), target))
      console.log('Restored and verified: every table matches the backup.')
    } finally {
      await target.close()
    }
    return
  }

  const out = arg('--out')
  if (!out) throw new Error('Usage: npm run db:backup -- --out <file.json.gz> [--restore-check] [--verbose]')
  const db = await connect('DATABASE_URL', 'DATABASE_CA_CERT')
  try {
    const fps = await writeBackup(db, createWriteStream(out, { flags: 'wx' })) // never overwrite an existing file
    console.log('Backup written and checksummed.')
    report(fps)
  } finally {
    await db.close()
  }
  if (process.argv.includes('--restore-check')) {
    const scratch = await connect('RESTORE_DATABASE_URL', 'RESTORE_DATABASE_CA_CERT')
    try {
      await restoreBackup(createReadStream(out), scratch)
      console.log('Restore check passed: the backup restores into an empty database and matches exactly.')
    } finally {
      await scratch.close()
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`Stopped: ${(err as { code?: string }).code ? `[${(err as { code?: string }).code}] ` : ''}${(err as Error).message}`)
    process.exitCode = 1
  })
}

