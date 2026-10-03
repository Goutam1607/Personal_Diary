import { dayKey, formatDate, formatLongDate, formatTime, monthLabel, parseDay } from './dates'
import { hasContent, kindLabel } from './entries'
import { moodEmoji, moodLabel, moodOf } from './moods'
import { journey } from './stats'
import type { Entry } from './types'

/**
 * A "keepsake book": every page of the diary as one self-contained HTML file that opens in
 * any browser, reads like a little book, and prints (or saves as PDF) cleanly.
 * It is plain text on disk — the caller is responsible for telling the person it isn't encrypted.
 */
export interface KeepsakeOptions {
  name?: string
  now?: Date
  /** @font-face rules to embed (see keepsakeFonts.ts). Without them the book falls back to system fonts. */
  fontCss?: string
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Blank lines become paragraphs, single newlines become line breaks. */
function paragraphs(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function scale(value: number, full: string, empty: string): string {
  return `<span class="scale" aria-label="${value} out of 5">${full.repeat(value)}<span class="off">${empty.repeat(5 - value)}</span></span>`
}

function page(e: Entry): string {
  const m = moodOf(e.mood)
  const mood = moodLabel(e.mood, e.customMood)
  const d = parseDay(e.date)
  const style = `--a:${m.day.accent};--as:${m.day.accentSoft};--na:${m.night.accent};--nas:${m.night.accentSoft}`
  const parts: string[] = []

  parts.push(`<header>
    <div class="when"><span class="num">${d.getDate()}</span><span class="wk">${esc(d.toLocaleDateString(undefined, { weekday: 'short' }))}</span></div>
    <div class="meta"><h3>${esc(formatLongDate(e.date))}</h3><p>${esc(kindLabel(e.kind))} · ${esc(formatTime(e.createdAt))}</p></div>
    <div class="badges">${mood ? `<span class="mood">${moodEmoji(e.mood, e.customMood)} ${esc(mood)}</span>` : ''}${e.favorite ? '<span class="heart" title="Kept close">♥</span>' : ''}</div>
  </header>`)

  if (e.prompt) parts.push(`<p class="prompt">${esc(e.prompt)}</p>`)
  if (e.body.trim()) parts.push(`<div class="body">${paragraphs(e.body)}</div>`)

  const c = e.checkin
  if (c?.day || c?.energy) {
    parts.push(`<div class="checkin">${c.day ? `<span>How today felt ${scale(c.day, '★', '★')}</span>` : ''}${
      c.energy ? `<span>Energy ${scale(c.energy, '<i class="bar"></i>', '<i class="bar"></i>')}</span>` : ''
    }</div>`)
  }
  if (c?.onMind?.trim()) parts.push(`<aside class="note"><h4>On my mind</h4>${paragraphs(c.onMind)}</aside>`)
  if (e.unsaid?.trim()) parts.push(`<aside class="note unsaid"><h4>Things I couldn’t say out loud…</h4>${paragraphs(e.unsaid)}</aside>`)
  if (e.goodThing?.trim()) parts.push(`<aside class="note good"><h4>A tiny good thing ✨</h4>${paragraphs(e.goodThing)}</aside>`)
  if (e.tags.length) parts.push(`<ul class="tags">${e.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`)

  return `<article class="page${e.favorite ? ' kept' : ''}${e.kind === 'vent' ? ' vent' : ''}" style="${style}">${parts.join('\n')}</article>`
}

export function keepsakeHtml(all: Entry[], { name = '', now = new Date(), fontCss = '' }: KeepsakeOptions = {}): string {
  const entries = all.filter(hasContent).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  const j = journey(entries, now)

  const months = new Map<string, Entry[]>()
  for (const e of entries) {
    const key = e.date.slice(0, 7)
    months.set(key, [...(months.get(key) ?? []), e])
  }
  const monthName = (key: string) => monthLabel(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1)
  const keys = [...months.keys()]

  const title = name.trim() ? `${name.trim()}’s little book of memories` : 'my little book of memories'
  const range = keys.length ? (keys.length === 1 ? monthName(keys[0]) : `${monthName(keys[0])} – ${monthName(keys.at(-1)!)}`) : ''
  const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

  const chapters = keys
    .map((key) => {
      const list = months.get(key)!
      const dots = list.map((e) => `<i style="--a:${moodOf(e.mood).day.accent};--na:${moodOf(e.mood).night.accent}" title="${esc(moodLabel(e.mood, e.customMood) || 'no mood')}"></i>`).join('')
      return `<section class="month${list.some((e) => e.favorite) ? ' has-kept' : ''}" id="m-${key}">
  <h2><span>${esc(monthName(key))}</span><small>${plural(list.length, 'page')}</small></h2>
  <div class="dots" aria-hidden="true">${dots}</div>
  ${list.map(page).join('\n')}
</section>`
    })
    .join('\n')

  const contents = keys
    .map((key) => `<li><a href="#m-${key}"><span>${esc(monthName(key))}</span><span class="leader"></span><span>${months.get(key)!.length}</span></a></li>`)
    .join('')

  const topMoods = j.topMoods.slice(0, 3).map((t) => `<span class="nw">${moodEmoji(t.mood)} ${esc(moodLabel(t.mood))}</span>`)
  const anyKept = entries.some((e) => e.favorite)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
${fontCss}
:root{
  --bg:#fbf4ec;--bg2:#f7e7e6;--bg3:#efe9f4;--paper:#fffcf7;--ink:#453b3d;--muted:#857677;--line:#ecdfd8;
  --accent:#d9918d;--accent-soft:#f6ddd8;--shadow:0 1px 2px rgb(80 50 60/.05),0 10px 30px -10px rgb(80 50 60/.18);
  --display:'Keepsake Display','Iowan Old Style',Georgia,serif;--write:'Keepsake Write',Georgia,'Times New Roman',serif;
  --hand:'Keepsake Hand','Segoe Print','Bradley Hand',cursive;--sans:'Keepsake Sans',ui-rounded,'Segoe UI',system-ui,sans-serif;
  color-scheme:light;
}
.page{--pa:var(--a);--pas:var(--as)}
@media (prefers-color-scheme:dark){
  :root{--bg:#1f1f3a;--bg2:#2c2748;--bg3:#3a2d4a;--paper:#29274a;--ink:#f3e9dc;--muted:#b9b0c9;--line:#3d3960;--accent:#eaa7a2;--accent-soft:#4a3a54;
    --shadow:0 1px 2px rgb(0 0 10/.3),0 12px 34px -10px rgb(0 0 20/.5);color-scheme:dark}
  .page{--pa:var(--na);--pas:var(--nas)}
  .dots i{--a:var(--na)!important}
}
*{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;font-family:var(--sans);color:var(--ink);line-height:1.6;background:var(--bg)}
body::before{content:'';position:fixed;inset:0;z-index:-1;background:linear-gradient(160deg,var(--bg) 0%,var(--bg2) 45%,var(--bg3) 100%)}
.wrap{max-width:46rem;margin:0 auto;padding:0 1rem 4rem}

.cover{min-height:92vh;display:grid;place-items:center;text-align:center;padding:3rem 1rem}
.cover .hand{font-family:var(--hand);font-size:1.9rem;color:var(--muted);margin:0}
.cover h1{font-family:var(--display);font-weight:600;font-size:clamp(2.4rem,8vw,4rem);line-height:1.08;letter-spacing:-.02em;margin:.2rem 0 .6rem}
.cover .range{font-family:var(--display);font-style:italic;color:var(--muted);font-size:1.15rem;margin:0}
.cover .flourish{margin:1.8rem auto;width:7rem;height:1px;background:linear-gradient(90deg,transparent,var(--accent),transparent)}
.stats{display:flex;flex-wrap:wrap;justify-content:center;gap:.6rem;margin:0;padding:0;list-style:none}
.stats li{background:var(--paper);border-radius:999px;padding:.45rem 1rem;box-shadow:var(--shadow);font-weight:600;font-size:.95rem}
.nw{white-space:nowrap}
.cover .felt{margin:1.2rem 0 0;color:var(--muted)}
.cover .made{margin:2.4rem 0 0;font-family:var(--hand);font-size:1.4rem;color:var(--muted)}

.toolbar{position:sticky;top:.75rem;z-index:5;display:flex;flex-wrap:wrap;justify-content:center;gap:.4rem;margin:0 auto 2rem;width:fit-content;max-width:100%;
  padding:.4rem;border-radius:1.5rem;background:color-mix(in srgb,var(--paper) 88%,transparent);backdrop-filter:blur(8px);box-shadow:var(--shadow)}
.toolbar a,.toolbar button{font:inherit;font-size:.9rem;font-weight:600;color:var(--ink);background:none;border:0;border-radius:999px;padding:.45rem .9rem;cursor:pointer;text-decoration:none}
.toolbar a:hover,.toolbar button:hover,.toolbar [aria-pressed=true]{background:var(--accent-soft)}
.toolbar :focus-visible{outline:2px solid var(--accent);outline-offset:2px}

.contents{background:var(--paper);border-radius:1.6rem;box-shadow:var(--shadow);padding:1.6rem 1.8rem;margin:0 0 3rem}
.contents h2{font-family:var(--display);font-weight:600;margin:0 0 .8rem;font-size:1.4rem}
.contents ol{list-style:none;margin:0;padding:0}
.contents a{display:flex;align-items:baseline;gap:.5rem;color:inherit;text-decoration:none;padding:.3rem 0}
.contents a:hover span:first-child{color:var(--accent)}
.contents .leader{flex:1;border-bottom:2px dotted var(--line);transform:translateY(-.3rem)}

.month{margin-top:3.5rem;scroll-margin-top:4.5rem}
.month h2{display:flex;align-items:baseline;justify-content:space-between;gap:1rem;margin:0;font-family:var(--display);font-weight:600;font-size:clamp(1.7rem,5vw,2.3rem);letter-spacing:-.01em}
.month h2 small{font-family:var(--hand);font-weight:500;font-size:1.3rem;color:var(--muted);white-space:nowrap}
.dots{display:flex;flex-wrap:wrap;gap:5px;margin:.5rem 0 1.4rem}
.dots i{width:10px;height:10px;border-radius:50%;background:var(--a)}

.page{background:var(--paper);border-radius:1.6rem;box-shadow:var(--shadow);padding:1.4rem 1.6rem 1.5rem;margin:0 0 1.25rem;
  border-top:5px solid var(--pa);scroll-margin-top:5rem;position:relative}
.page header{display:flex;gap:1rem;align-items:center}
.when{flex:none;width:3.3rem;height:3.5rem;border-radius:1rem;background:var(--pas);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}
.when .num{font-family:var(--display);font-weight:700;font-size:1.55rem}
.when .wk{font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-top:.2rem}
.meta{flex:1;min-width:0}
.meta h3{margin:0;font-family:var(--display);font-weight:600;font-size:1.08rem;line-height:1.3}
.meta p{margin:.1rem 0 0;color:var(--muted);font-size:.85rem}
.badges{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;justify-content:flex-end}
.mood{background:var(--pas);border-radius:999px;padding:.25rem .75rem;font-size:.85rem;font-weight:600;white-space:nowrap}
.heart{color:var(--pa);font-size:1.3rem;line-height:1}
.prompt{font-family:var(--hand);font-size:1.45rem;line-height:1.3;color:var(--muted);margin:1.1rem 0 0}
.body{font-family:var(--write);font-size:1.08rem;line-height:1.8;margin-top:1rem;overflow-wrap:anywhere}
.body p,.note p{margin:0 0 .9em}.body p:last-child,.note p:last-child{margin-bottom:0}
.checkin{display:flex;flex-wrap:wrap;gap:.5rem 1.5rem;margin-top:1rem;font-size:.92rem;color:var(--muted);font-weight:600}
.checkin span{display:inline-flex;align-items:center;gap:.4rem}
.scale{color:var(--pa);letter-spacing:.12em;display:inline-flex;align-items:center;gap:3px}
.scale .off{opacity:.25;display:inline-flex;gap:3px}
.bar{display:inline-block;width:.55rem;height:.95rem;border-radius:3px;background:currentColor}
.note{margin-top:1.1rem;padding:1rem 1.2rem;border-radius:1.1rem;background:color-mix(in srgb,var(--pas) 55%,transparent);font-family:var(--write);overflow-wrap:anywhere}
.note h4{margin:0 0 .35rem;font-family:var(--hand);font-weight:600;font-size:1.35rem;color:var(--muted)}
.unsaid{font-style:italic}
.good{background:color-mix(in srgb,#ffe6a8 45%,transparent)}
@media (prefers-color-scheme:dark){.good{background:color-mix(in srgb,#ffd79a 14%,transparent)}}
.tags{display:flex;flex-wrap:wrap;gap:.4rem;list-style:none;margin:1.1rem 0 0;padding:0}
.tags li{border:1px solid var(--line);border-radius:999px;padding:.15rem .7rem;font-size:.82rem;color:var(--muted)}
.page.glow{animation:glow 2.2s ease}
@keyframes glow{0%,100%{box-shadow:var(--shadow)}25%{box-shadow:0 0 0 4px var(--pa),0 18px 50px -12px var(--pa)}}
.only-kept .page:not(.kept),.only-kept .month:not(.has-kept),.only-kept .contents{display:none}

.empty,.end{text-align:center;padding:4rem 1rem}
.end p,.empty p{margin:0}
.end .hand,.empty .hand{font-family:var(--hand);font-size:2rem}
.end .soft,.empty .soft{color:var(--muted)}
.private{text-align:center;font-size:.8rem;color:var(--muted);margin-top:2rem}

@media (max-width:520px){
  .page{padding:1.1rem 1.1rem 1.2rem;border-radius:1.3rem}
  .page header{flex-wrap:wrap}.badges{width:100%;justify-content:flex-start}
  .contents{padding:1.2rem 1.3rem}
}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.page.glow{animation:none;outline:3px solid var(--pa)}}
@media print{
  @page{margin:16mm 14mm}
  :root{color-scheme:light}
  body{background:#fff;}
  body::before{display:none}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .toolbar,.private{display:none!important}
  .cover{min-height:auto;height:250mm;break-after:page}
  .contents{box-shadow:none;border:1px solid var(--line);break-after:page}
  .month{break-before:page;margin-top:0}
  .page{box-shadow:none;border:1px solid var(--line);border-top:5px solid var(--pa);break-inside:avoid}
  .note{break-inside:avoid}
}
</style>
</head>
<body>
<div class="wrap">
<section class="cover">
  <div>
    <p class="hand">a little book of memories</p>
    <h1>${esc(name.trim() ? `${name.trim()}’s pages` : 'my pages')}</h1>
    ${range ? `<p class="range">${esc(range)}</p>` : ''}
    <div class="flourish"></div>
    <ul class="stats">
      <li>${plural(j.totalEntries, 'page')}</li>
      <li>${plural(j.daysWritten, 'day')}</li>
      <li>${plural(j.words, 'word')}</li>
    </ul>
    ${topMoods.length ? `<p class="felt">Most often I felt ${topMoods.join(' · ')}</p>` : ''}
    <p class="made">from my little corner · kept on ${esc(formatDate(dayKey(now)))} 🤍</p>
  </div>
</section>
${
  entries.length
    ? `<nav class="toolbar" aria-label="Book">
  ${keys.length > 1 ? '<a href="#contents">Contents</a>' : ''}
  <button type="button" id="surprise">✨ Surprise me</button>
  ${anyKept ? '<button type="button" id="kept" aria-pressed="false">♥ Only kept pages</button>' : ''}
  <button type="button" id="print">Save as PDF</button>
</nav>
${keys.length > 1 ? `<section class="contents" id="contents"><h2>Contents</h2><ol>${contents}</ol></section>` : ''}
${chapters}
<section class="end"><p class="hand">the end… for now.</p><p class="soft">So many more pages are waiting to be written.</p></section>`
    : `<section class="empty"><p class="hand">No pages yet.</p><p class="soft">But there’s room here for so many.</p></section>`
}
<p class="private">This copy isn’t encrypted. Keep it somewhere private. 🔒</p>
</div>
<script>
(function () {
  var surprise = document.getElementById('surprise'), kept = document.getElementById('kept'), print = document.getElementById('print'), last = null
  if (surprise) surprise.onclick = function () {
    var pages = [].slice.call(document.querySelectorAll('.page')).filter(function (p) { return p.offsetParent !== null })
    if (!pages.length) return
    var p = pages[Math.floor(Math.random() * pages.length)]
    if (p === last && pages.length > 1) p = pages[(pages.indexOf(p) + 1) % pages.length]
    last = p
    p.classList.remove('glow'); void p.offsetWidth; p.classList.add('glow')
    p.scrollIntoView({ block: 'center' })
  }
  if (kept) kept.onclick = function () {
    var on = document.body.classList.toggle('only-kept')
    kept.setAttribute('aria-pressed', String(on))
  }
  if (print) print.onclick = function () { window.print() }
})()
</script>
</body>
</html>
`
}
