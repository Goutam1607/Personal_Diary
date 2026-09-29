# my little corner 🤍

A private, cozy diary that lives in your browser. You pick a mood, the room changes with it, a small companion sits with you, and you write. Everything you write is encrypted on your device before it's saved.

## Running it

On Windows, the easiest way is to double-click **`start-diary.bat`**. It installs everything the first time, starts the diary and opens it in your browser. Keep that window open while you write.

Or from a terminal:

```bash
npm install
npm start            # starts the diary and opens http://localhost:5173
```

Don't open `index.html` directly (by double-clicking it, or with a "Live Server" extension). The app has to be served by Vite, and opened that way it only shows a message explaining this.

To build a static site:

```bash
npm run build        # outputs dist/
npm run preview
```

### Hosting on Render (so friends can use it too)

The repo includes a `render.yaml` Blueprint that deploys the diary as a free **Static Site**.

1. Push this folder to a GitHub or GitLab repository.
2. In the Render dashboard, choose **New → Blueprint** and pick the repository. Render reads `render.yaml` and sets everything up: the build command, the publish folder, the Node version and the security headers.
   - Alternatively, choose **New → Static Site** and enter:
     - Build command: `npm ci --include=dev && npm run build`
     - Publish directory: `dist`
     - Environment variable: `NODE_VERSION` = `22.12.0`
3. Share the `https://<your-name>.onrender.com` link.

**How sharing works:** everyone who opens the link gets the same app, and each person gets **their own separate diary**, created and encrypted in their own browser. Render only serves the app's files. It never receives anyone's entries, so neither you (the host) nor anyone else can read a friend's diary. A few things follow from that:
- Each browser holds one diary. People sharing a computer should use separate browser profiles.
- A diary doesn't sync between someone's phone and laptop. Each device is its own diary, and encrypted backups (Settings → Backups) move entries between them.
- Passkeys are tied to the site's address. Everyone sets up their own passkey on the Render URL, and it works automatically because Render serves over HTTPS.
- Every push to the repository redeploys, and everyone gets the update the next time they open the site. Their diaries aren't affected.

`dist/` can also go on any other static host (Netlify, Cloudflare Pages, GitHub Pages, your own server). **Serve it over HTTPS**: passkeys only work on `https://` pages or `localhost`. `public/_headers` sets the security headers on Netlify and Cloudflare Pages; on other hosts, copy them into your server config.

### Tests

```bash
npm test             # unit tests: crypto, vault, prompts, stats
npm run test:e2e     # browser tests in your installed Chrome (starts the dev server itself)
```

The end-to-end suite covers: creating, editing, favoriting and deleting entries; mood selection and atmosphere; vent mode; prompts; check-in; calendar, search, filters, "on this day" and random memories; empty states; encryption at rest; persistence across reloads; wrong-phrase rejection; manual lock; auto-lock (including saving unsaved words first); encrypted backup download; passkey unlock through Chrome's virtual authenticator, both with PRF support and without it; night mode; reduced motion; large text; keyboard navigation; and the mobile layout.

## How it's built

- **React 19 + TypeScript + Vite + Tailwind CSS v4.** No UI kit. The fonts are bundled locally (Fraunces, Nunito, Caveat and Lora via Fontsource), so the site loads nothing from Google or any other outside server.
- **No backend.** It's a local-first app: all data stays in the browser's IndexedDB. It's written so that a sync backend could be added later that only ever sees ciphertext (see `src/lib/storage.ts` → `VaultStorage`).
- Hash routing (`#/write`, `#/memories`, …) so it runs from any static host.

```
src/
  lib/            crypto, vault, passkey (WebAuthn PRF), storage (IndexedDB), moods, prompts, stats, ambience
  state/          providers: vault (key in memory), settings, atmosphere (mood → colours), router, auto-lock, autosave
  components/     companion (SVG characters), scene (room, lock scene, weather), pickers, cards, calendar, ui bits
  pages/          Lock, Setup, Home, Write, Vent, EntryView, Memories, Journey, CheckIn, Settings
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

**Why the passkey has to support PRF.** With no server, an ordinary passkey "login" would only be a screen that JavaScript chooses to hide. Anyone with access to the browser's storage could skip it. PRF makes the authenticator (Windows Hello, Touch ID or Face ID, an Android or iPhone, a security key) produce a secret that *is* the decryption key. If your device can't do PRF, the app says so and doesn't turn on a fake passkey lock. PRF works in current Chrome, Edge and Safari with Google Password Manager, iCloud Keychain, phones and most security keys. Support for Windows Hello depends on your Windows version.

**Why there's no 4-digit PIN.** Someone who copies the encrypted data can try every short PIN offline in seconds. A PIN would feel secure without being secure, so the app asks for a phrase of at least 8 characters instead (longer is better).

**Locking.**
- A lock button.
- Auto-lock after 1–30 minutes of inactivity (default 5). It uses wall-clock time, so it still works after sleep or in background tabs.
- Optional locking after one minute away from the tab (on by default).
- Unsaved words are saved, encrypted, before any lock.

With no server there's no separate login session, so "log out" and "lock" are the same thing.

**Not protected:**
- Anyone using your device *while the diary is unlocked*. Auto-lock exists for this.
- Malware or malicious browser extensions on your device.
- Weak phrases, against someone who has copied the encrypted data.
- A forgotten phrase with no working passkey. Nobody can recover the diary; that's the cost of it being truly yours. Keep encrypted backups (Settings → Backups).
- Clearing the browser's site data, or losing the device, deletes the diary unless you have a backup.

**Stored unencrypted, in `localStorage`:** only look-and-feel preferences (day/night, animations, text size, which companion, auto-lock settings). They're needed before unlocking, and none of them contain anything you wrote.

**Network.** The production build ships a strict Content-Security-Policy (`connect-src 'self'`, no third-party scripts, fonts or analytics). Nothing you write leaves the device.

**Passkeys are tied to the site's address.** A passkey made on `localhost` won't work on your deployed domain, and the reverse is also true. Add a new one wherever you use the diary. Encrypted backups can move between them.

## Accessibility
- Keyboard navigation throughout, including a skip link, arrow keys in the mood picker and native `<dialog>` focus handling.
- Visible focus rings.
- Screen-reader labels for every icon and illustration.
- Live regions for save status and toasts.
- Honours the system's reduced-motion setting, with a manual override.
- A larger-text option.
- Charts show counts as text, never colour alone.
