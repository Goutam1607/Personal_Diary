# my little corner 🤍

A private, cozy diary. You pick a mood, the room changes with it, a small companion sits with you, and you write. Everything you write is encrypted on your device before it's saved to your account, so the server only ever stores scrambled pages.

## Running it

On Windows, the easiest way is to double-click **`start-diary.bat`**. It installs everything the first time, starts the diary and opens it in your browser. Keep that window open while you write.

Or from a terminal:

```bash
npm install
npm start            # starts the diary and opens http://localhost:5173
```

Don't open `index.html` directly (by double-clicking it, or with a "Live Server" extension). The app has to be served by Vite, and opened that way it only shows a message explaining this.

Locally, the diary's API runs inside the dev server, with a small local database in `.data/pglite` (real PostgreSQL compiled to WebAssembly, so nothing to install). Set `DATABASE_URL` to use a real Postgres instead. The first time you open it, you create an account on that local database.

To build and run it the way it runs in production:

```bash
npm run build        # outputs dist/
DATABASE_URL=postgres://... NODE_ENV=production npm run serve   # serves dist/ and /api on :8787
```

### Hosting on Render (so friends can use it too)

The repo includes a `render.yaml` Blueprint that deploys a **Node web service** (the app plus its API, from one origin). The database is a **Supabase Free** PostgreSQL project, which costs nothing. [docs/DATABASE.md](docs/DATABASE.md) has the setup, the exact environment variables, the security model, and the free plan's limits.

1. Create the Supabase project as described in [docs/DATABASE.md](docs/DATABASE.md): turn its Data API off and download its CA certificate.
2. Push this folder to a GitHub or GitLab repository.
3. In the Render dashboard, choose **New → Blueprint** and pick the repository. When asked, fill in `DATABASE_URL` (Supabase's *Session pooler* string) and `DATABASE_CA_CERT` (the certificate's contents).
4. Share the `https://<your-name>.onrender.com` link.

**Read the limits before relying on it:**
- **No automatic backups and no point-in-time recovery.** The repo includes a GitHub Actions workflow that makes **encrypted, restore-checked backups twice a week**. It needs a one-time setup (an age key pair, two secrets and one variable): [docs/BACKUPS.md](docs/BACKUPS.md#one-time-setup).
- **500 MB of storage.**
- **The project pauses after about a week without activity**, until you restore it in the Supabase dashboard.

Free hosting can change, so everyone should also keep their own encrypted backups (Settings → Backups).

Server settings (environment variables):

- `DATABASE_URL` and `DATABASE_CA_CERT` (required in production). The server refuses to start without a database, and refuses to reach one over the internet without verified TLS.
- `DB_POOL_MAX` (default 5)
- `MAINTENANCE_MODE=read-only` refuses changes while the database is being moved; browsers keep unsent words in their outbox meanwhile.
- `ALLOW_SIGNUPS=false` stops new accounts once everyone you invited has one.
- `HISTORY_DAYS` sets how long overwritten or deleted encrypted pages are kept for recovery (default 30).

**Moving from Render Postgres to Supabase:** `npm run db:copy` copies the database as it is stored, without decrypting anything, and verifies every table before it commits. The step-by-step guide is in [docs/DATABASE.md](docs/DATABASE.md#moving-the-data-from-render-postgres-to-supabase). Keep the old Render database until `npm run db:copy -- --check` reports nothing missing.

The server sets the security headers (CSP, HSTS, frame and referrer policies) itself, and redirects `http://` to `https://`.

**How sharing works:** everyone who opens the link gets the same app. Each person creates an **account**, and gets **their own separate diary** in it. Pages are encrypted in their browser with a key only their secret phrase or passkey can unlock, so neither you (the host) nor anyone else can read a friend's diary from the database. Every API call checks the session server-side, and a person can only ever reach their own rows.
- The same diary opens on someone's phone and laptop: sign in, then unlock with the secret phrase.
- Passkeys are tied to the site's address. Everyone sets up their own passkey on the site's URL.
- Every push redeploys. Diaries live in the database, so deploys don't affect them.

### Moving from the static site (existing diaries)

Before accounts, each diary lived **only in the visitor's browser**, and browser storage belongs to one site address (origin). The app has a built-in, authenticated migration: after signing in, it finds the old diary, checks that every page opens with its phrase, and moves it into the account. It never deletes the copy in the browser unless the person asks. But **it can only find that old diary if the new app is served from the same address** as the old one. Passkeys are also tied to the address.

Render can't turn an existing static site into a Node web service, so the Blueprint creates a new service. Pick one:

1. **Custom domain (best):** if people use a custom domain, move the domain from the old static site to the new web service. Same origin, so migration and passkeys just work.
2. **Only an `.onrender.com` address:** the new service gets a different address. Before switching, ask people to use **Settings → Backups → Download encrypted backup** (or Google Drive backup) on the old site. On the new site they create an account and choose **Already have a diary? Bring it back from a backup**. Keep the old static site online until everyone has moved. Their diary is never only on the server, and never lost in between.

(A Render static-site rewrite of `/api/*` to the new service might keep the old address, but Render doesn't document how rewrites to external URLs treat cookies and request bodies, so it isn't a supported path here.)

### Google Drive backups (optional)

The diary can keep encrypted backups in your own Google Drive, so your memories survive a lost or broken device. Only the encrypted backup file is uploaded (the same file as **Download encrypted backup**), so Google stores scrambled data it can't read. The app asks only for the `drive.file` permission, which lets it see the files it created itself and nothing else in your Drive. No Google code is loaded into the diary page: sign-in happens in a separate Google window.

It needs a Google OAuth client ID (free, about 5 minutes, done once):

1. Go to [console.cloud.google.com](https://console.cloud.google.com/), and create a project (any name, e.g. "my little corner").
2. **APIs & Services → Library**: search **Google Drive API** and click **Enable**.
3. **Google Auth Platform** (or **OAuth consent screen**): choose **External**, fill in the app name and your email.
   - **Audience**: add your own Gmail address as a **test user**. While the app is in "Testing", only the test users you list can connect. That's fine if it's just for you. To let friends use Drive backup too, add them as test users or click **Publish app** (`drive.file` doesn't need Google's review).
   - **Data access**: add the scope `https://www.googleapis.com/auth/drive.file`.
4. **Clients → Create client → Web application**:
   - **Authorized JavaScript origins**: `https://<your-site>.onrender.com` and `http://localhost:5173`
   - **Authorized redirect URIs**: `https://<your-site>.onrender.com/oauth-callback.html` and `http://localhost:5173/oauth-callback.html`
5. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`; it isn't a secret) and set it as `VITE_GOOGLE_CLIENT_ID`:
   - On Render: the service → **Environment** → add `VITE_GOOGLE_CLIENT_ID`, then **Manual Deploy → Clear build cache & deploy**.
   - Locally: copy `.env.example` to `.env.local` and fill it in, then restart `npm start`.

Then, in **Settings → Backups → Google Drive**, tap **Back up to Google Drive**. Backups go into a **"my little corner backups"** folder. The newest 30 are kept, and older ones move to Drive's trash. When you've written new pages and a few days have passed, the home page shows a gentle reminder with a one-tap **Back up now**. (Backups need that tap: fully automatic background backups would need a server holding access to your Drive, which this app deliberately doesn't have.)

**If your device is lost:** just sign in on the new device. Your diary is in your account. Drive backups are your own extra copy, in case the server itself is ever lost: on a fresh account, tap **Already have a diary? Bring it back from a backup**, choose **Google Drive**, pick the backup, and enter your secret phrase.

**Reading a backup:** **Settings → Backups → Read a backup** decrypts any backup (from Drive or a file) on your device and saves it as a readable book (an HTML file, which also has **Save as PDF**). It doesn't change the diary on that device. **Download my memories** does the same for the diary that's open.

Without `VITE_GOOGLE_CLIENT_ID`, the Drive options are simply hidden, and file backups work as before.

### Tests

```bash
npm test             # unit tests, the API on PGlite, and (if openssl is available) a real PostgreSQL over verified TLS
npm run test:e2e     # browser tests in your installed Chrome (starts the dev server and a throwaway database itself)
```

`server/postgres.test.ts` starts a real PostgreSQL server that accepts only TLS, with its own CA, and sets up a database like a Supabase project (its `anon`/`authenticated` roles and their default grants). It then runs, through the production driver:
- TLS checks: the wrong CA, the wrong host name, and an attempt to downgrade through the URL are all refused;
- a full Render → Supabase move, with someone writing during maintenance;
- checks that nothing was decrypted or lost, and that the copy is byte-identical;
- the Data API lockdown;
- sign-in on a new device, isolation between two accounts, and a restart.

To run the whole browser suite against a real Postgres, set `DATABASE_URL` (and `DATABASE_CA_CERT`) before `npm run test:e2e`.

The server tests cover:
- sign-up, sign-in and sign-out
- passwords and session tokens stored only as hashes
- rate limiting
- per-user isolation, even with identical entry ids
- client-supplied user ids being ignored
- CSRF and origin checks
- input validation
- stale-update rejection
- import, merge and restore never overwriting silently
- history archiving and its expiry

The migration tests run both migration paths end-to-end in Chrome. One case: the account is empty and the device diary is uploaded as it is encrypted. The other: the account already has a diary, and the device pages are re-encrypted with its key without overwriting anything. They also check:
- a wrong phrase sends nothing
- "start fresh" keeps the device copy
- offline saves sync later
- signing in on a second device opens the same diary

The end-to-end suite also covers: creating, editing, favoriting and deleting entries; mood selection and atmosphere; vent mode; prompts; check-in; calendar, search, filters, "on this day" and random memories; empty states; encryption at rest; persistence across reloads; wrong-phrase rejection; manual lock; auto-lock (including saving unsaved words first); encrypted backup download; passkey unlock through Chrome's virtual authenticator, both with PRF support and without it; night mode; reduced motion; large text; keyboard navigation; and the mobile layout.

## How it's built

- **React 19 + TypeScript + Vite + Tailwind CSS v4.** No UI kit. The fonts are bundled locally (Fraunces, Nunito, Caveat and Lora via Fontsource), so the site loads nothing from Google or any other outside server.
- **A small Node server + PostgreSQL** (`server/`): it serves the app and a JSON API.
  - It uses only `node:http` and `pg`, and every query is parameterized.
  - The browser talks to it through the same `VaultStorage` interface the app always used. `src/lib/remoteStorage.ts` replaced the IndexedDB one, so only ciphertext ever crosses it.
  - IndexedDB is now just an outbox for saves that haven't reached the server yet, plus the place an older device diary is read from during migration.
  - The server runs with Node's built-in TypeScript type-stripping, so there's no build step for it.
- Hash routing (`#/write`, `#/memories`, …) so it runs from any static host.

```
server/           API (accounts, sessions, encrypted diary storage), database + migrations, static files
docs/             backups and recovery runbook
src/
  lib/            crypto, vault, passkey (WebAuthn PRF), account, remoteStorage (+ outbox), migrate, storage (IndexedDB), moods, prompts, stats, ambience
  state/          providers: vault (key in memory), settings, atmosphere (mood → colours), router, auto-lock, autosave
  components/     companion (SVG characters), scene (room, lock scene, weather), pickers, cards, calendar, ui bits
  pages/          Account, Migrate, Lock, Setup, Home, Write, Vent, EntryView, Memories, Journey, CheckIn, Settings
e2e/              Playwright tests
```

### Companions
There are six original characters (Mochi the bunny, Biscuit the bear, Pudding the cat, Pebble the penguin, Luna the little moon and Puff the cloud), all drawn in code as SVG. Their faces and poses follow your mood. On heavy days they don't cheer you on: when you're sad the bunny's ears droop and it sits quietly by the rainy window; when you're lonely it's under a blanket holding a tiny heart; when you're overwhelmed the room empties out and it just breathes slowly. They never talk.

### Ambient sound
Rain, fireplace, ocean, night and café sounds are generated live with the Web Audio API, so there are no audio files and nothing to download. Sound is off by default and only starts when you tap a sound.

## Privacy and security: what's real and what isn't

**What is encrypted.** Every entry is encrypted, including its text, mood, tags, "things I couldn't say", good thing, dates and favourite flag. So are your name, custom tags and today's mood. Encryption is AES-256-GCM with a random 256-bit vault key. Each record is bound to its ID, so encrypted records can't be swapped around.

**How the key is protected.** The vault key is never stored in the clear. It is stored *wrapped* (encrypted) by:
- a key derived from your **secret phrase**, using PBKDF2-SHA-256 with 600,000 iterations and a random salt, and
- optionally, a key derived from a **passkey** through the WebAuthn **PRF extension**, using HKDF-SHA-256.

After you unlock, the vault key exists only in memory, as a *non-extractable* `CryptoKey`. Locking drops it and clears all decrypted entries from the page.

**Accounts are separate from the diary key.** The account (username and password) only decides whose encrypted diary the server hands over.
- The password is never sent as typed. The browser sends PBKDF2-SHA-256 of it (600,000 rounds, salted with the username), and the server stores an scrypt hash of that. So even if someone uses their secret phrase as their account password, the server never sees the phrase.
- Sessions are random tokens in `HttpOnly`, `Secure`, `SameSite=Strict` (`__Host-`) cookies, and only their SHA-256 hashes are stored.
- Every API call also requires a custom header, so other sites can't act on a session (CSRF).

**What the server can see:** usernames, how many pages each person has, their approximate sizes, and when they were saved. It can't see page contents, moods, tags, names or settings. It stores the *wrapped* vault key. Anyone holding a copy of the database (or a backup of it) can try to guess a person's phrase offline, at 600,000 PBKDF2 rounds per guess, so a long phrase matters more now than when the diary lived only in the browser.

**This is not end-to-end encryption in the strict sense, and the app doesn't claim it is.** The same server that stores the ciphertext also delivers the JavaScript that does the encrypting. Someone who took over the server or the deployment could ship code that captures phrases as they're typed. What the design does guarantee is that the database, its backups and its logs only ever contain data nobody can read without the owner's phrase or passkey.

**Known limits of the key design:**
- Changing your phrase re-wraps the same vault key; it doesn't replace it. So database backups (and the 30-day history) made before the change can still be opened with the *old* phrase for as long as they're kept.
- The server could withhold or roll back pages. Each page is bound to its id, but not to a version.

**Why the passkey has to support PRF.** An ordinary passkey "login" only proves who you are. It doesn't decrypt anything: whoever got hold of the encrypted data could skip it. PRF makes the authenticator (Windows Hello, Touch ID or Face ID, an Android or iPhone, a security key) produce a secret that *is* the decryption key. If your device can't do PRF, the app says so and doesn't turn on a fake passkey lock. PRF works in current Chrome, Edge and Safari with Google Password Manager, iCloud Keychain, phones and most security keys. Support for Windows Hello depends on your Windows version.

**Why there's no 4-digit PIN.** Someone who copies the encrypted data can try every short PIN offline in seconds. A PIN would feel secure without being secure, so the app asks for a phrase of at least 8 characters instead (longer is better).

**Locking and signing in.**
- A lock button.
- Auto-lock after 1–30 minutes of inactivity (default 5). It uses wall-clock time, so it still works after sleep or in background tabs.
- Optional locking after one minute away from the tab (on by default).
- Unsaved words are saved, encrypted, before any lock.

Locking only drops the key from memory, and you stay signed in (sessions last 30 days). **Sign out** in Settings (or on the lock screen) ends the session on that device.

**Not protected:**
- Anyone using your device *while the diary is unlocked*. Auto-lock exists for this.
- Malware or malicious browser extensions on your device.
- Weak phrases, against someone who has copied the encrypted data.
- A forgotten phrase with no working passkey. Nobody can recover the diary; that's the cost of it being truly yours. Keep encrypted backups (Settings → Backups).
- A compromised server or deployment (see above).

Losing a device or clearing browser data doesn't lose the diary: it's in your account, in the server's database. That database runs on a free plan without automatic backups, though. It depends on the operator's own exports ([docs/BACKUPS.md](docs/BACKUPS.md)) and on your own encrypted backups, so keep one.

**Stored unencrypted, in `localStorage`:** only look-and-feel preferences (day/night, animations, text size, which companion, auto-lock settings), the date of the last Drive backup, and a note of which accounts an old device diary was already moved into. None of them contain anything you wrote.

**Network.** The production build ships a strict Content-Security-Policy (`connect-src 'self'`, no third-party scripts, fonts or analytics).
- What you write leaves the device only as ciphertext, over HTTPS, to the site's own server.
- The server logs only method, route shape, status and timing: never bodies, usernames, tokens or cookies.
- Google Drive is the one other destination, and only if you turn on Drive backups.

**Passkeys are tied to the site's address.** A passkey made on `localhost` won't work on your deployed domain, and the reverse is also true. Add a new one wherever you use the diary. Encrypted backups can move between them.

## Accessibility
- Keyboard navigation throughout, including a skip link, arrow keys in the mood picker and native `<dialog>` focus handling.
- Visible focus rings.
- Screen-reader labels for every icon and illustration.
- Live regions for save status and toasts.
- Honours the system's reduced-motion setting, with a manual override.
- A larger-text option.
- Charts show counts as text, never colour alone.
