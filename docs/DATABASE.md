# The database: Supabase Free PostgreSQL

The diary's server runs on Render. Its database is a **Supabase Free** PostgreSQL project, reached
through Supabase's connection pooler over TLS. It's the same PostgreSQL schema, SQL and driver the app
used with Render Postgres. Only the connection settings changed, plus a lockdown for Supabase's
auto-generated API.

The browser is not the source of truth: it holds only an encrypted outbox of saves that haven't reached
the server yet. Clearing the browser or redeploying Render doesn't lose the diary.

## What the database holds

Only what the server already had, which the server can't use to read anyone's diary:

| Table | Contents |
|---|---|
| `users` | username, scrypt hash of a browser-side PBKDF2 hash of the account password |
| `sessions` | SHA-256 hashes of session tokens, expiry times |
| `vaults` | the diary key *wrapped* (encrypted) by the secret phrase / passkeys, plus salts |
| `vault_items` | AES-256-GCM ciphertext of each page and of private settings |
| `vault_history` | previous ciphertext of overwritten/deleted pages, kept `HISTORY_DAYS` (default 30) |

No plaintext diary content, phrases, keys or passwords are stored.

## Why Supabase and not Cloudflare D1

Supabase is PostgreSQL. The existing schema, parameterized SQL, transactions, `pg` driver,
encryption and authentication carry over unchanged.

D1 is SQLite-compatible, and would have needed:
- **SQL rewrites:** the app uses `jsonb`, `unnest`, `FOR UPDATE` and interval maths.
- **Redesigned writes:** D1 has no `BEGIN`/`COMMIT`, only batches. The "archive the previous version, then
  overwrite, atomically" logic depends on real transactions.
- **A Cloudflare Worker in front of the database:** D1's REST API is meant for administration, not production traffic.

That's more new code, and more room for new security mistakes. D1's free tier is attractive (no pausing,
7 days of point-in-time recovery), but not worth a backend rewrite for this app.

## Security model

**Unchanged:**
- Pages are encrypted in the browser, so the database only ever sees ciphertext.
- Every API call is authenticated server-side. Every diary query is scoped to the session's user, and a
  user id sent by a client is never used.
- Every query is parameterized.
- Logs never contain diary data, usernames, tokens, cookies or connection strings.

**Changed:**
- **The database is on the internet, at a third party.** Render Postgres was reachable only over Render's private network. Supabase's pooler
  is a public endpoint protected by the database password and TLS. So:
  - The server **verifies** the TLS certificate against Supabase's own root CA (`DATABASE_CA_CERT`),
    including the host name. It **refuses to start** in production if the database isn't on a private
    network and no CA is configured. (Supabase's certificates chain to "Supabase Root 2021 CA", which
    isn't in Node's default trust store. The common workaround of turning verification off would allow
    interception, so the app doesn't do it.)
  - **The database password is now the most sensitive secret you hold.** It lives only in Render's
    environment variables.
- **Supabase's Data API.** Supabase can expose tables in `public` over auto-generated REST/GraphQL
  endpoints to its `anon`/`authenticated` roles. Their anon key is public by design. This app never uses
  that API, so it's shut three ways:
  1. **Turn the Data API off** in the dashboard (setup step 3). This is Supabase's own recommendation for apps that don't use it.
  2. Schema migration 2 **enables Row Level Security with no policies** on every table, so those roles see no rows.
  3. It **revokes** those roles' grants, now and for future tables.

  The server checks this at every start and logs `[security] …` if anything is reachable again.
- **Supabase becomes a data processor** for ciphertext, wrapped keys and hashes.

### Should RLS also enforce per-user access?

Authorization is enforced in the server: every query includes `user_id = <the session's user>`. RLS is
enabled as a **deny-all** layer for Supabase's API roles, not per-user policies, because:
- the server connects as the tables' **owner** (`postgres`), and owners aren't subject to RLS (so never use
  `FORCE ROW LEVEL SECURITY`, or the app stops working);
- real per-user RLS would mean a separate non-owner database role, a `SET LOCAL app.user_id` at the start of
  every transaction, and policies on every table. That's a reasonable future hardening step (it would
  limit the damage of a hypothetical SQL bug in the server), but it isn't needed for the current
  guarantees, and it changes every query path.

### Keys you must NOT use

The app uses no Supabase client library, so it needs **no anon key, publishable key, secret key or
service-role key**. Don't add any of them to Render or to the code.
- The build fails if any `VITE_*` variable looks like a database URL or a secret/service-role key, because
  `VITE_*` values are copied into the public JavaScript.
- The only database credentials are `DATABASE_URL` and the public CA certificate, both server-side.

## Free plan limits (checked October 2026; check [supabase.com/pricing](https://supabase.com/pricing) for changes)

- **500 MB database.** An encrypted page is roughly 2–4 KB (more for long pages), and history keeps old
  versions for 30 days, so this fits many thousands of pages for a handful of people.
- **5 GB egress per month.** Every unlock downloads that person's whole encrypted diary, so big diaries
  opened very often are what use this up.
- **The project pauses after about a week without database activity.** A paused project is offline (the
  app shows "I can't reach your diary right now") until you click **Restore** in the Supabase dashboard.
  - Paused free projects stay restorable for **90 days**. After that, only a download of the last
    backup is offered.
  - On Render's always-on `starter` plan, Render's health checks query the database every few seconds,
    which should count as activity; a sleeping free Render web service doesn't.
  - Supabase doesn't document exactly what counts as activity, so check the dashboard now and then.
- **No automatic backups and no point-in-time recovery** on the Free plan. The scheduled GitHub backup
  covers this; set it up as described in [BACKUPS.md](BACKUPS.md#one-time-setup).
- Two free projects per account. Use a **dedicated project** for the diary: the lockdown revokes the API
  roles' access to every table in its `public` schema.

None of this is a guarantee: free tiers can change, and Supabase can pause or end free projects under its
terms. Treat each person's **encrypted personal backups** as essential, not optional.

## Environment variables on Render

| Variable | Value | Secret? |
|---|---|---|
| `DATABASE_URL` | Supabase → **Connect** → **Session pooler** string (port **5432**), password filled in: `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres` | **Yes** |
| `DATABASE_CA_CERT` | The full contents of the CA file from Supabase → **Database settings** → **SSL configuration** → *Download certificate* (`-----BEGIN CERTIFICATE-----` … `-----END CERTIFICATE-----`) | No (it's public), but keep it with the config |
| `DB_POOL_MAX` | `5` | No |
| `NODE_ENV` | `production` | No |
| `MAINTENANCE_MODE` | empty normally; `read-only` only during a move | No |
| `ALLOW_SIGNUPS`, `HISTORY_DAYS`, `VITE_GOOGLE_CLIENT_ID` | as before | No |

Notes:
- Use the **Session pooler** (port 5432), not the direct connection, which is IPv6-only on the free
  plan, and not the transaction pooler (port 6543), which doesn't support prepared statements.
- If the dashboard flattens the certificate onto one line with `\n`, that's fine; the server accepts both forms.

## Moving the data from Render Postgres to Supabase

The copy is done by `npm run db:copy` ([server/copy-database.ts](../server/copy-database.ts)):
- **Nothing is decrypted.** Ciphertext, wrapped keys and hashes move byte-for-byte, so passwords, sessions,
  phrases and passkeys all keep working.
- **The source is only read**, inside a read-only, consistent snapshot.
- **The target must be empty.** The tool creates the schema there (including the lockdown).
- **It commits only if verified:** every table's row count and checksum must match the source.
- **It prints only table names and counts.**

You need Node 22+ and this repository on your computer.

1. **Create the Supabase project.** Use a strong, generated database password. Pick the region closest to
   your Render service.
2. **Download the CA certificate:** Database settings → SSL configuration. Optionally turn on
   **Enforce SSL**.
3. **Turn the Data API off:** Integrations → Data API → turn off *Enable Data API*.
4. **Get the source connection string:** Render → the old database → **Connect** → *External* URL.
   Add your IP under the database's **Access control** for the duration of the move.
5. **Put the site into maintenance:** on the Render web service, set `MAINTENANCE_MODE=read-only` and
   deploy. People can still read. Anything they write waits, encrypted, in their browser's outbox and is
   sent after the move.
6. **Copy and verify:**
   ```bash
   SOURCE_DATABASE_URL='<Render external URL>' \
   TARGET_DATABASE_URL='<Supabase Session pooler URL>' \
   TARGET_DATABASE_CA_CERT=./prod-ca-2021.crt \
   npm run db:copy
   ```
   You should see `verified … checksums match` for every table, then `Done`. If it stops with an error,
   nothing was committed. Fix the cause and run it again.
   - If the Render URL fails TLS verification, add `SOURCE_DATABASE_CA_CERT` with Render's CA, or add
     `?sslmode=verify-full` to its URL. Don't disable verification.
7. **Switch the app:** on Render, set `DATABASE_URL` (Supabase) and `DATABASE_CA_CERT`, clear
   `MAINTENANCE_MODE`, and deploy. Check the deploy logs: there should be no `[security]` lines.
8. **Smoke test:**
   - sign in on a fresh browser, unlock, and check that old pages are there;
   - write, edit and delete a page;
   - download the keepsake book and an encrypted backup.
   Saves made during maintenance arrive by themselves once the browsers that made them come back online.
9. **Before deleting anything,** confirm nothing from Render is missing in Supabase. Pages that people
   deleted or replaced since then count as present, because they're in the history:
   ```bash
   SOURCE_DATABASE_URL=… TARGET_DATABASE_URL=… TARGET_DATABASE_CA_CERT=./prod-ca-2021.crt npm run db:copy -- --check
   ```
   It must say `Nothing is missing.`
10. **Keep the Render database for a while** (a week or two of normal use), and take one final export
    from it (Render → database → Backups → Create export, then download it). Only then delete it. Deleting
    it is what removes the cost.

To roll back during the move: until step 7, the app still uses Render. Just clear `MAINTENANCE_MODE`.
After step 7, point `DATABASE_URL` back at Render. Anything written to Supabase since would then need
copying back by hand, which is why step 10 waits.
