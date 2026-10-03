# Backups and recovery

This is a personal diary, so losing it would be very bad. The database runs on **Supabase's Free plan**,
which **has no automatic backups and no point-in-time recovery**. The layers below are what stands
between a problem and lost pages. None of them can prevent every loss on its own, and the free hosting
behind the first one can change or end. That's why every person's **own encrypted backups** (layer 4) matter.

Nothing here requires the server to be able to read a diary: everything stored and backed up is
ciphertext that opens only with its owner's secret phrase or passkey.

| Layer | Protects against | Who controls it | Retention |
|---|---|---|---|
| 1. Scheduled encrypted backups on GitHub (+ any exports you make yourself) | Database loss or corruption, a bad deploy, accidental `DELETE`/`DROP`, losing the Supabase project | You (the operator) | 90 days on GitHub; longer for copies you download |
| 2. Supabase's pause backup | A free project paused for more than 90 days | Supabase | Only the last backup taken before pausing |
| 3. `vault_history` table (in the app) | One overwritten or deleted page, a botched restore, "Erase my diary" | You, via SQL | `HISTORY_DAYS` (default 30) |
| 4. In-app encrypted backups (file download / Google Drive) | The server, the database or the operator disappearing | Each diary's owner | As long as they keep them |
| 5. Browser outbox | Losing the connection mid-write, server restarts, maintenance, an expired session | Automatic | Until the save reaches the server |

What's **not** covered: anything written after the last backup, if the Supabase project itself is lost or
corrupted. With the schedule below that's up to about 3–4 days of writing. Those pages survive only in the
owners' own backups.

## Requirements

- **The server refuses to start without `DATABASE_URL` in production.** It never falls back to a local or
  in-memory database, because that would put diaries on Render's disk, which is wiped on every deploy.
- **It refuses an internet database without a verified TLS CA** (`DATABASE_CA_CERT`). See [DATABASE.md](DATABASE.md).

## Layer 1: scheduled encrypted backups on GitHub (the important one)

Supabase recommends exactly this for free projects: export regularly and keep the copies off-site.
[`.github/workflows/database-backup.yml`](../.github/workflows/database-backup.yml) does it **every Monday and
Thursday at 03:23 UTC** (and whenever you press *Run workflow*). Each run:

1. **Backs up** with `npm run db:backup` from one consistent, read-only snapshot. The file records each
   table's row count and checksum. It refuses to run as a database user that row level security would
   silently hide rows from, so it can't produce a backup that looks fine but is empty.
2. **Proves the backup restores.** It restores the file into a throwaway PostgreSQL inside the job, and the
   run fails unless every table matches the checksums exactly.
3. **Encrypts** the file with [age](https://age-encryption.org) to *your* public key, then shreds the
   unencrypted copy. The private key that opens backups never goes to GitHub.
4. **Stores** only the encrypted `.age` file as a workflow artifact, for 90 days (the most a public
   repository allows).

### Why the encryption matters here

This repository is **public**. Anyone can read the workflow logs, and artifacts in a public repository
should be treated as downloadable by anyone. So:
- the workflow refuses to run at all unless `BACKUP_AGE_RECIPIENT` is set, and never uploads anything unencrypted;
- the logs say only pass/fail: no row counts, usernames or contents.

Even unencrypted, a backup holds no readable diary content (only ciphertext, salts and hashes). But it would let someone try to guess weak
secret phrases and account passwords offline, so it's kept encrypted on top.

### One-time setup

1. **Install age** on your computer: on Windows `winget install FiloSottile.age` (or download it from
   [the age releases](https://github.com/FiloSottile/age/releases)); on macOS `brew install age`.
2. **Make your backup key pair:**
   ```bash
   age-keygen -o little-corner-backup-key.txt
   ```
   It prints `Public key: age1…`.
   - **The file is the private key.** Keep it somewhere safe and **off GitHub**: a password manager, plus a
     second copy on a USB stick. If you lose it, the backups can't be opened by anyone, including you.
     `.gitignore` blocks `*backup-key*.txt` so it can't be committed by accident.
3. **On GitHub:** the repository → **Settings** → **Secrets and variables** → **Actions**.
   - **Secrets** tab, *New repository secret*:
     - `DATABASE_URL`: the same Supabase *Session pooler* string as on Render.
     - `DATABASE_CA_CERT`: the same certificate contents as on Render.
   - **Variables** tab, *New repository variable*:
     - `BACKUP_AGE_RECIPIENT`: the `age1…` **public** key. It isn't secret.
4. **Run it once now:** **Actions** → *Encrypted database backup* → **Run workflow**. Every step should be
   green, including "Back up, then prove the backup restores".
5. **Get notified of failures:** GitHub emails failed scheduled runs to the person who last changed the
   schedule. Check that Actions notifications are on in your GitHub notification settings.

### Things to know

- **GitHub now holds the database password** (as an encrypted repository secret, hidden from logs and never
  given to forks or pull requests). Anyone with *write* access to the repository could use it from a workflow,
  so keep write access to yourself and use two-factor authentication on GitHub. If you ever suspect it
  leaked, reset the database password in Supabase and update it on Render and here.
- **Scheduled workflows in public repositories are switched off after 60 days without repository activity.**
  GitHub emails a warning first. Any commit counts as activity, or re-enable it from the Actions tab.
- **Artifacts expire after 90 days.** For anything older, download a backup every month or so (open a run →
  *Artifacts*) and keep it with your other important files. They're already encrypted.
- The schedule also counts as database activity twice a week, which helps keep the free project from pausing.

### Restoring from a scheduled backup

```bash
# 1. Download the artifact from the run (a .zip containing the .age file) and unzip it
# 2. Decrypt with your private key
age --decrypt --identity little-corner-backup-key.txt --output restore.json.gz little-corner-db-<date>.json.gz.age
# 3. Restore into an EMPTY database (a new Supabase project, or a local PostgreSQL to look first)
TARGET_DATABASE_URL='<empty database>' TARGET_DATABASE_CA_CERT=./prod-ca-2021.crt npm run db:restore -- restore.json.gz
```

`db:restore` commits only if every table matches the checksums recorded in the backup. A damaged, cut-off or
tampered file is refused and nothing is written. For a new Supabase project: turn its Data API off first,
restore, then point `DATABASE_URL` / `DATABASE_CA_CERT` on Render (and in the GitHub secrets) at it.
Delete `restore.json.gz` when you're done; `.gitignore` already keeps such files out of the repository.

**Do a restore drill** once after setting this up, and again every few months: restore the latest backup
into a local or scratch database and check it opens.

### Exports by hand

`npm run db:backup -- --out my-backup.json.gz` makes the same kind of backup from your computer, using
`DATABASE_URL` and `DATABASE_CA_CERT` from your environment. Add `--restore-check` with
`RESTORE_DATABASE_URL` pointing at an empty scratch database to test it.

You can also use `pg_dump`. It needs PostgreSQL client tools of the **same major version or newer** than the project's
Postgres, which is shown in Supabase → Database settings.

```bash
# The Session pooler URL, plus TLS verification against Supabase's CA file
export DUMP_URL='postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=prod-ca-2021.crt'
pg_dump --format=custom --no-owner --no-privileges --schema=public --file="little-corner-$(date +%F).dump" "$DUMP_URL"
```

(`supabase db dump` from the Supabase CLI also works.)

Useful before a risky change (a schema migration, a big restore), on top of the scheduled backups:
- keep such dumps somewhere other than Supabase, Render and GitHub (an encrypted drive, or
  private cloud storage);
- remember that a dump contains only ciphertext, salts and hashes, but should still stay private: anyone
  holding it can try to guess weak secret phrases offline.

**Restoring** into a fresh Supabase project, or any Postgres:
1. Create the new project, download its CA certificate, and turn its Data API off (DATABASE.md, steps 1–3).
2. Restore the dump into a scratch Postgres (for example a local one, or a second free project):
   `pg_restore --no-owner --no-privileges --dbname="$SCRATCH_URL" little-corner-YYYY-MM-DD.dump`
3. Move it into the new project with the app's own verified copy, which also applies the lockdown:
   `SOURCE_DATABASE_URL="$SCRATCH_URL" TARGET_DATABASE_URL=… TARGET_DATABASE_CA_CERT=… npm run db:copy`
4. Point `DATABASE_URL` / `DATABASE_CA_CERT` on Render at the new project and deploy.

Sanity checks for any restored copy:

```sql
SELECT count(*) FROM users;
SELECT count(*) FROM vaults;
SELECT kind, count(*) FROM vault_items GROUP BY kind;
SELECT max(updated_at) FROM vault_items;   -- should be close to when the dump was taken
```

**Test a restore** at least once, and after any schema change: restore the latest dump into a scratch
database, run the app against it locally (`DATABASE_URL=… DATABASE_CA_CERT=… npm start`), sign in and
unlock a test diary.

## Layer 2: if the project gets paused

A free project with about a week of no database activity is paused. The app then can't reach its database
until you press **Restore** in the Supabase dashboard; data isn't lost by the pause itself. Paused projects
stay restorable for 90 days. After that, Supabase only offers a download of the backup it took when
pausing, which you would restore as in layer 1. Don't rely on this: it's a last resort, and its terms are
Supabase's to change.

## Layer 3: page history inside the database

Before the server overwrites or deletes anything, it copies the previous ciphertext into `vault_history`:

- **deleting a page** (`reason = 'delete'`)
- **overwriting a page** that hadn't changed for 10+ minutes (`'update'`; rapid autosaves while typing aren't archived)
- **changing the diary's keys:** phrase change, adding or removing a passkey (`'meta-change'`)
- **restoring a backup** over the diary (`'replace'`)
- **"Erase my diary" / "start over"** (`'erase'`)

Rows older than `HISTORY_DAYS` (default 30) are purged automatically.

To bring back one deleted page for a user:

```sql
-- find it
SELECT h.seq, h.id, h.reason, h.archived_at
FROM vault_history h JOIN users u ON u.id = h.user_id
WHERE lower(u.username) = lower('their-username') AND h.kind = 'record'
ORDER BY h.archived_at DESC;

-- put it back (the diary must still exist; this is the original ciphertext under the same vault key, so it opens as before)
INSERT INTO vault_items (user_id, kind, id, iv, ct)
SELECT user_id, 'record', id, payload->>'iv', payload->>'ct' FROM vault_history WHERE seq = <seq>
ON CONFLICT (user_id, kind, id) DO UPDATE SET iv = EXCLUDED.iv, ct = EXCLUDED.ct, updated_at = now();
```

To undo a whole erase or restore, put the `'meta'` row back into `vaults` first, then all the item
rows with the same `reason` and `archived_at`. Wrap it in a transaction and check the counts.

Note the trade-off for phrase changes: the history keeps the vault key wrapped under the *old* phrase
for `HISTORY_DAYS`, and your dumps keep it for as long as they're kept. Changing a phrase protects
the diary from then on, not in backups made before the change. Rotating the vault key itself, which
would make old copies useless even with the old phrase, isn't supported by the app yet. If an old
phrase is known to be compromised, shorten the exposure by purging that user's `vault_history`
`'meta-change'` rows, and keep in mind that your dumps still hold the old wrapped key until you delete them.

## Layer 4: the owner's own encrypted backups

With a free database and no automatic backups, these are the most important layer for each person. The
in-app backups export from the database:

- **Settings → Backups → Download encrypted backup**
- **Google Drive backup**

They work independently of this server. The **Bring it back from a backup** option on the setup
screen restores one into any account. These backups are the owner's guarantee if the site ever goes away.

## Layer 5: the outbox

Each save is first written to an IndexedDB outbox in the browser (still encrypted), then sent. It's
removed only after the server confirms it. If the device is offline, the server is restarting, or the
session has expired, the words wait there and are sent automatically when possible. The editor then
says so ("Saved on this device · it goes to your account when you're back online").

## What is never logged

The server logs only the method, the route shape (with ids replaced by `:id`), the status code and the
timing for each API call. Errors are logged as an error code only. It never logs request bodies,
diary content, usernames, passwords or their hashes, session tokens, cookies or query strings.
