// Finds, downloads, shrinks and keeps the real pictures that "Realistic" mode asks for (see photo-tags.js for the tags).
//
// Where the pictures come from, in order:
//   1. Animato Studio Pro's own search (inside Animato; it runs in the person's GitHub: svc-pinterest for looks and moods,
//      svc-searxng web search for facts). The app talks to it through the parent page (see makeParentBridge).
//   2. Open image libraries that allow browsers to ask them directly (Wikimedia Commons for facts, Openverse for moods),
//      used when the page is not inside Animato or Animato found nothing.
// A picture that cannot be found is simply left out: the story still plays, with the drawn background it would have had.
//
// Everything that touches the outside world (the bridge, fetch, the image shrinker, the cache) is passed in with configure(),
// so the logic runs and is tested in Node. index.html wires the browser versions.
import { searchPlan, rankCandidates, acceptableSize, targetSize, collectSceneTags } from './photo-tags.js';

const cfg = { bridge: null, fetch: null, normalize: null, cache: null, concurrency: 3, openFallback: true, directFetchMs: 12000, candidatesPerSearch: 6, portrait: false };
let nextId = 1;
export function configure(o = {}) { Object.assign(cfg, o); }

/** What the engine reads while drawing. `ver` goes up whenever a picture arrives, so cached drawings know to refresh. */
export const store = { ver: 0, map: new Map(), failed: new Set() };
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const bump = () => { store.ver++; for (const fn of [...listeners]) { try { fn(store.ver); } catch { /* a listener must never stop the film */ } } };

/** { href, w, h } for drawing: a short blob: address in the live preview, the picture itself (data:) for export. */
export function entryFor(key, live) {
  const e = store.map.get(key);
  if (!e || !e.ready) return null;
  const href = live && e.blobUrl ? e.blobUrl : e.dataUrl;
  return href ? { href, w: e.w, h: e.h, credit: e.credit || '', via: e.via || '', refId: live && e.blobUrl ? e.id : '' } : null;
}
export const statusOf = (key) => (store.map.get(key)?.ready ? 'ready' : store.failed.has(key) ? 'failed' : store.map.has(key) ? 'loading' : 'none');
export function _reset() { store.map.clear(); store.failed.clear(); store.ver = 0; inflight.clear(); }

const doFetch = (...a) => (cfg.fetch || globalThis.fetch).apply(globalThis, a);

async function fetchBlob(url) {
  // 1. straight from the picture's own site (works when that site allows it)
  try {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), cfg.directFetchMs) : null;
    try {
      const r = await doFetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl ? ctl.signal : undefined });
      if (r && r.ok) { const b = await r.blob(); if (b && b.size > 1500 && /^image\//i.test(b.type || 'image/')) return b; }
    } finally { if (timer) clearTimeout(timer); }
  } catch { /* not allowed or not reachable: ask Animato to fetch it */ }
  // 2. through Animato's server
  if (cfg.bridge && cfg.bridge.fetchBlob) { try { const b = await cfg.bridge.fetchBlob(url); if (b && b.size > 1500) return b; } catch { /* next */ } }
  return null;
}

async function tryCandidates(cands, use) {
  const wantTall = cfg.portrait && use === 'bg';
  let spare = null;
  for (const c of cands.slice(0, cfg.candidatesPerSearch)) {
    for (const url of [...new Set([c.url, c.thumb].filter(Boolean))]) {
      const blob = await fetchBlob(url);
      if (!blob) continue;
      let n = null;
      try { n = await cfg.normalize(blob, use); } catch { n = null; }
      if (n && acceptableSize(n.w, n.h)) {
        const got = { ...n, credit: String(c.credit || c.title || '').slice(0, 60), page: String(c.page || '') };
        const sharp = use !== 'bg' || Math.max(n.w, n.h) >= 1100;   // a background fills the screen: a small one looks blurry
        if (sharp && (!wantTall || n.h >= n.w * 1.1)) return got;   // a tall picture for a vertical film
        if (!spare || (sharp && !spare.sharp)) spare = { ...got, sharp };   // otherwise keep the best usable one in case nothing better turns up
      }
    }
  }
  return spare;
}

// ---- open libraries (used when Animato is not there, or found nothing) ----
export async function openSearch(kind, query) {
  const q = encodeURIComponent(String(query).slice(0, 120));
  const items = [];
  try {
    if (kind === 'fact') {
      const r = await doFetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${q}&gsrlimit=10&prop=imageinfo&iiprop=url%7Csize%7Cmime&iiurlwidth=1280&format=json&origin=*`, { credentials: 'omit' });
      const d = await r.json();
      for (const p of Object.values((d && d.query && d.query.pages) || {})) {
        const ii = p && p.imageinfo && p.imageinfo[0];
        if (ii && /^image\/(jpeg|png|webp)$/i.test(ii.mime || '') && (ii.thumburl || ii.url)) items.push({ url: ii.thumburl || ii.url, thumb: '', w: ii.thumbwidth || ii.width || 0, title: String(p.title || '').replace(/^File:/, ''), credit: 'Wikimedia Commons', page: ii.descriptionurl || '' });
      }
    } else {
      const r = await doFetch(`https://api.openverse.org/v1/images/?q=${q}&page_size=10&aspect_ratio=wide&mature=false`, { credentials: 'omit' });
      const d = await r.json();
      for (const x of (d && d.results) || []) if (x && (x.thumbnail || x.url)) items.push({ url: x.thumbnail || x.url, thumb: x.url || '', w: x.width || 0, title: x.title || '', credit: x.creator ? `${x.creator} (Openverse)` : 'Openverse', page: x.foreign_landing_url || '' });
    }
  } catch { /* offline or blocked */ }
  return items;
}

const inflight = new Map();

/** Finds one picture. Always resolves (never throws): { key, ok, via }. */
const ONE_MAX_MS = 75_000;
export function resolveOne(tag, use = 'prop') {
  const key = tag.key;
  const have = store.map.get(key);
  if (have && have.ready) return Promise.resolve({ key, ok: true, via: have.via || 'cache' });
  if (inflight.has(key)) return inflight.get(key);
  store.failed.delete(key);
  const work = (async () => {
    try {
      store.map.set(key, { ready: false });
      // saved from an earlier visit
      if (cfg.cache) {
        try {
          const c = await cfg.cache.get(ckey(key, use));
          if (c && c.blob) { const n = await cfg.normalize(c.blob, use, { already: true }); if (n && acceptableSize(n.w, n.h)) return finish(key, { ...n, credit: c.credit || '', via: 'saved' }, use); }
        } catch { /* a broken cache is just a miss */ }
      }
      for (const step of searchPlan(tag, use)) {
        let items = [];
        if (cfg.bridge && cfg.bridge.search) { try { items = await cfg.bridge.search(step.query, step.source); } catch { items = []; } }
        const got = await tryCandidates(rankCandidates(items, { want: use === 'bg' ? (cfg.portrait ? 'portrait' : 'landscape') : 'any' }), use);
        if (got) return finish(key, { ...got, via: step.source }, use);
      }
      if (cfg.openFallback) {
        const items = await openSearch(tag.kind, tag.kind === 'scene' ? `${tag.query} illustration` : tag.query);
        const got = await tryCandidates(rankCandidates(items, { want: use === 'bg' ? (cfg.portrait ? 'portrait' : 'landscape') : 'any', minW: 300 }), use);
        if (got) return finish(key, { ...got, via: 'open' }, use);
      }
      store.map.delete(key); store.failed.add(key); bump();
      return { key, ok: false };
    } catch {
      store.map.delete(key); store.failed.add(key); bump();
      return { key, ok: false };
    } finally { inflight.delete(key); }
  })();
  // never wait forever: after ONE_MAX_MS this picture is given up and the story plays with its drawn scenery
  const p = Promise.race([work, new Promise((res) => setTimeout(() => { if (!store.map.get(key)?.ready) { store.map.delete(key); store.failed.add(key); inflight.delete(key); bump(); } res({ key, ok: false }); }, ONE_MAX_MS))]);
  inflight.set(key, p);
  return p;
}

// backgrounds saved before the sharp-picture fix were degraded: they are not reused ('|hq')
const ckey = (key, use) => (use === 'bg' ? key + (cfg.portrait ? '|tall' : '') + '|hq' : key);
function finish(key, n, use = 'prop') {
  let blobUrl = '';
  try { if (n.blob && typeof URL !== 'undefined' && URL.createObjectURL) blobUrl = URL.createObjectURL(n.blob); } catch { blobUrl = ''; }
  // decode it now, so the first frame that shows it does not stall
  let img = null;
  try { if (blobUrl && typeof Image !== 'undefined') { img = new Image(); img.src = blobUrl; if (img.decode) img.decode().catch(() => {}); } } catch { img = null; }
  store.map.set(key, { ready: true, id: 'phi' + (nextId++), blobUrl, dataUrl: n.dataUrl, w: n.w, h: n.h, credit: n.credit || '', via: n.via || '', img });
  if (cfg.cache && n.via !== 'saved' && n.blob) { try { cfg.cache.put(ckey(key, use), { blob: n.blob, credit: n.credit || '', at: Date.now() }); } catch { /* ignore */ } }
  bump();
  return { key, ok: true, via: n.via };
}

/**
 * Finds every picture the scenes ask for. Runs a few searches at a time, the first scenes first, and calls onProgress after each one.
 * @returns {Promise<{total:number, found:number, missing:string[]}>}
 */
export async function resolveScenes(scenes, { onProgress } = {}) {
  const tags = collectSceneTags(scenes);
  const total = tags.length;
  if (!total) return { total: 0, found: 0, missing: [] };
  let found = 0, done = 0, next = 0;
  const missing = [];
  const say = (current) => { try { onProgress && onProgress({ done, total, found, current }); } catch { /* ignore */ } };
  say('');
  const worker = async () => {
    while (next < tags.length) {
      const tag = tags[next++];
      const r = await resolveOne(tag, tag.uses.includes('bg') ? 'bg' : 'prop');
      done++; if (r.ok) found++; else missing.push(tag.query);
      say(tag.query);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(cfg.concurrency, total)) }, worker));
  return { total, found, missing };
}

// ---------- the link to Animato Studio Pro (the parent page) ----------
/**
 * @param post    (message) -> void   sends to the Animato page (only ever to its exact address)
 * @param listen  (handler) -> void   handler(data) receives what Animato sends back
 */
export function makeParentBridge({ post, listen, searchTimeoutMs = 2 * 60_000, fetchTimeoutMs = 30_000, ackMs = 4000 }) {
  const waiting = new Map();
  let n = 0;
  // An Animato page that is not listening for pictures never answers. The first request that gets no "heard you" marks it as silent for a while,
  // and every later picture goes straight to the open libraries instead of each one waiting for nothing.
  let silentUntil = 0;
  listen((d) => {
    if (d && d.type === 'animato:media-hello') { silentUntil = 0; return; }
    if (!d || typeof d.type !== 'string' || !d.id) return;
    const w = waiting.get(d.id);
    if (w && d.type === 'animato:media-ack') { clearTimeout(w.ackT); silentUntil = 0; return; }
    if (!w) return;
    if (d.type === 'animato:media-search-result' && w.kind === 'search') { clearTimeout(w.t); clearTimeout(w.ackT); waiting.delete(d.id); d.ok ? w.res(Array.isArray(d.items) ? d.items : []) : w.rej(new Error(d.error || 'search failed')); }
    else if (d.type === 'animato:media-fetch-result' && w.kind === 'fetch') { clearTimeout(w.t); clearTimeout(w.ackT); waiting.delete(d.id); d.ok && d.blob ? w.res(d.blob) : w.rej(new Error(d.error || 'fetch failed')); }
  });
  const ask = (kind, msg, ms) => new Promise((res, rej) => {
    const id = `m${Date.now().toString(36)}${(n++).toString(36)}`;
    if (Date.now() < silentUntil) { rej(new Error('Animato is not answering')); return; }
    const t = setTimeout(() => { waiting.delete(id); rej(new Error('no answer')); }, ms);
    const ackT = setTimeout(() => { if (waiting.has(id)) { silentUntil = Date.now() + 90_000; clearTimeout(t); waiting.delete(id); rej(new Error('Animato is not answering')); } }, ackMs);
    waiting.set(id, { kind, res, rej, t, ackT });
    if (post({ ...msg, id }) === false) { clearTimeout(t); clearTimeout(ackT); waiting.delete(id); rej(new Error('not inside Animato')); }
  });
  return {
    warm: () => { try { post({ type: 'stickman:media-warm' }); } catch { /* ignore */ } },
    search: (query, source) => ask('search', { type: 'stickman:media-search-request', query, source }, searchTimeoutMs),
    fetchBlob: (url) => ask('fetch', { type: 'stickman:media-fetch-request', url }, fetchTimeoutMs),
  };
}

// ---------- browser pieces (only run in a page) ----------
/** Shrinks a picture to a JPEG that is light enough for every frame of an export. White behind transparent logos. */
export async function normalizeInBrowser(blob, use = 'prop', opts = null) {
  let bmp = null, w = 0, h = 0;
  if (typeof createImageBitmap === 'function') { try { bmp = await createImageBitmap(blob); w = bmp.width; h = bmp.height; } catch { bmp = null; } }
  let img = null;
  if (!bmp) {
    const u = URL.createObjectURL(blob);
    try {
      img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('not a picture')); i.src = u; });
      w = img.naturalWidth || img.width; h = img.naturalHeight || img.height;
    } finally { URL.revokeObjectURL(u); }
  }
  const t = targetSize(w, h, use);
  const cv = document.createElement('canvas'); cv.width = t.w; cv.height = t.h;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, t.w, t.h);
  g.imageSmoothingQuality = 'high';
  // Pictures stay sharp. (They used to be shrunk, blown back up and cut into flat colour bands, which made them look low quality.)
  // The background picture is dimmed and graded by layers drawn on top of it at play time, so the people still stand out.
  g.drawImage(bmp || img, 0, 0, t.w, t.h);
  if (bmp && bmp.close) bmp.close();
  const out = await new Promise((res) => cv.toBlob((b) => res(b), 'image/jpeg', 0.92));
  if (!out) throw new Error('could not shrink');
  const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('read failed')); r.readAsDataURL(out); });
  return { blob: out, dataUrl, w: t.w, h: t.h };
}

/** Keeps found pictures on this device between visits (IndexedDB), so the same film does not search again. */
export function makeIdbCache({ name = 'stk_photos', max = 80 } = {}) {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    try {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('p');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('p', mode); const o = fn(t.objectStore('p')); t.oncomplete = () => res(o && o.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
  return {
    get: async (key) => { try { return await tx('readonly', (s) => s.get(key)); } catch { return null; } },
    put: async (key, val) => {
      try {
        await tx('readwrite', (s) => s.put(val, key));
        const keys = await tx('readonly', (s) => s.getAllKeys());
        if (keys && keys.length > max) await tx('readwrite', (s) => { for (const k of keys.slice(0, keys.length - max)) s.delete(k); });
      } catch { /* the device may refuse storage */ }
    },
  };
}
