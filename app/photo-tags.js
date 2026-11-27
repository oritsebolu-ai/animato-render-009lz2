// Real pictures in the film ("Realistic" mode). Pure functions only (no DOM, no network), so they are unit tested in Node.
//
// The AI that writes the scene file never draws these. It writes a TAG, and the app finds a real picture for it:
//
//   background:'photo:mood:rainy neon street at night'       a full-screen picture behind the characters
//   {photo:'fact:New York Stock Exchange trading floor', x:800, y:330, w:760, h:430, show:[2,6.5]}      a picture on screen while it is talked about
//   ['photo','fact:Nvidia logo', 800, 330, 640, 360, 2, 6.5]                                           the same, as a compact beat item
//
//   fact:  something real and checkable: a logo, a brand, a product, a real place or building, a public person, a flag, a map, a chart.
//          Found by WEB SEARCH (SearXNG), where the right answer is the first answer.
//   mood:  a look or a feeling: a woman dancing, a cozy cafe, a crowded city, a stormy sea. Found on PINTEREST, where pictures are made to be looked at.
//   scene: the place a scene happens in ('photo:scene:school gate on a sunny morning'). Searched as a 2D illustrated / animation background
//          first, so the set matches the drawn characters (a real photo is only the fallback).
//
// public/photo-store.js finds and downloads the pictures; the engine (index.html) draws them with photoNodeSvg() below.

export const KINDS = Object.freeze(['fact', 'mood', 'scene']);
const MAX_QUERY = 90;

const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f]+/g, ' ').replace(/^[\s"'`]+|[\s"'`]+$/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY);

/** The key a picture is stored under: the same words always find the same picture, whatever the capital letters. */
export const photoKey = (kind, query) => `${kind === 'fact' ? 'fact' : kind === 'scene' ? 'scene' : 'mood'}|${clean(query).toLowerCase()}`;

/**
 * 'photo:fact:Nvidia logo' | 'fact:Nvidia logo' | 'photo:cozy cafe' (no kind means mood) -> { kind, query, key } or null.
 * A bare phrase with no kind and no "photo:" in front is NOT a tag (it could be anything), unless allowBare is set.
 */
export function parsePhotoTag(raw, { allowBare = false } = {}) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  let had = false;
  const p = /^photo\s*:\s*/i.exec(s);
  if (p) { s = s.slice(p[0].length); had = true; }
  let kind = 'mood';
  const k = /^(fact|mood|scene|place|set|bg|background)\s*:\s*/i.exec(s);
  if (k) { const w = k[1].toLowerCase(); kind = w === 'fact' || w === 'mood' ? w : 'scene'; s = s.slice(k[0].length); had = true; }
  if (!had && !allowBare) return null;
  const query = clean(s);
  if (query.length < 2) return null;
  return { kind, query, key: photoKey(kind, query) };
}

/** True when a scene background string is a picture tag rather than drawn scenery. */
export const isPhotoBackground = (bg) => typeof bg === 'string' && /^\s*photo\s*:/i.test(bg);

/**
 * Every picture the scenes ask for, once each, in the order they are first needed (the first scenes first, so the opening is ready sooner).
 * @returns {{key:string, kind:'fact'|'mood'|'scene', query:string, uses:('bg'|'prop')[], scene:number}[]}
 */
export function collectSceneTags(scenes) {
  const out = new Map();
  const add = (tag, use, scene) => {
    if (!tag) return;
    const hit = out.get(tag.key);
    if (hit) { if (!hit.uses.includes(use)) hit.uses.push(use); return; }
    out.set(tag.key, { ...tag, uses: [use], scene });
  };
  (Array.isArray(scenes) ? scenes : []).forEach((sc, i) => {
    if (!sc || typeof sc !== 'object') return;
    if (isPhotoBackground(sc.background)) add(parsePhotoTag(sc.background), 'bg', i);
    for (const p of Array.isArray(sc.props) ? sc.props : []) {
      if (p && typeof p === 'object' && typeof p.photo === 'string') add(parsePhotoTag(p.photo, { allowBare: true }), 'prop', i);
    }
  });
  return [...out.values()];
}

/**
 * Which searches to try for a tag, best first. Facts ask the web first; moods ask Pinterest first. The server also falls back to the other source.
 * SCENE tags (and mood tags used as a background) are the set the story happens in. They are searched as a 2D illustrated
 * background first (the kind animators paint), so the found place matches the drawn characters instead of fighting them;
 * a plain photo is only the fallback.
 */
export const STYLIZED_BG = ['2d animation background', 'cartoon background illustration', 'illustrated background art'];
export function searchPlan(tag, use = 'prop') {
  const q = clean(tag && tag.query);
  if (!q) return [];
  const empty = /\b(no people|empty|nobody)\b/i.test(q) ? q : `${q} no people`;
  const st = (i) => clean(`${empty.replace(/\s+no people$/i, '')} ${STYLIZED_BG[i]}`);
  if (tag.kind === 'scene') return [{ source: 'pinterest', query: st(0) }, { source: 'web', query: st(1) }, { source: 'pinterest', query: st(2) }, { source: 'pinterest', query: q }, { source: 'web', query: q }];
  if (tag.kind === 'fact') return [{ source: 'web', query: q }, { source: 'pinterest', query: q }];
  if (use === 'bg') return [{ source: 'pinterest', query: st(0) }, { source: 'pinterest', query: q }, { source: 'web', query: q }];
  return [{ source: 'pinterest', query: q }, { source: 'web', query: q }];
}

/**
 * Orders the found pictures: big enough, the right shape for where they will be used, and the picture's own site last when it is a stock-photo watermark site.
 * @param items [{url, thumb, w, title}]
 * @param want 'landscape' (a background), 'portrait' (a vertical film) or 'any'
 */
export function rankCandidates(items, { want = 'any', minW = 480 } = {}) {
  const bad = /(shutterstock|istockphoto|gettyimages|alamy|dreamstime|depositphotos|123rf|adobestock|stock\.adobe)/i;
  const seen = new Set();
  const list = [];
  for (const it of Array.isArray(items) ? items : []) {
    const url = String((it && (it.url || it.thumb)) || '');
    if (!/^https:\/\//i.test(url)) continue;
    const id = url.split('?')[0];
    if (seen.has(id)) continue;
    seen.add(id);
    const w = Number(it.w) || 0;
    let score = 0;
    if (w >= minW) score += 2; else if (w > 0) score -= 2;
    if (w >= 1000) score += 1;
    if (w >= 1600) score += 1;                          // sharp pictures first: low-resolution ones look cheap on a phone
    if (bad.test(url) || bad.test(String(it.page || ''))) score -= 3;
    if (/\.(svg)(\?|$)/i.test(url)) score -= 1;        // vector logos are fine but often tiny when rasterised
    if (want === 'landscape' && /\b(portrait|vertical|phone wallpaper|9:16)\b/i.test(String(it.title || ''))) score -= 1;
    list.push({ ...it, url, _score: score, _order: list.length });
  }
  return list.sort((a, b) => b._score - a._score || a._order - b._order);
}

/** Is a downloaded picture usable? Not tiny, not a thin strip. */
export function acceptableSize(w, h, { minSide = 240, maxRatio = 4 } = {}) {
  w = Number(w) || 0; h = Number(h) || 0;
  if (!(w >= minSide && h >= minSide * 0.6)) return false;
  const r = w / h;
  return r <= maxRatio && r >= 1 / maxRatio;
}

/** Size to shrink a picture to before keeping it (the film is at most 1920 wide, and a smaller picture keeps every frame of the export light). */
export function targetSize(w, h, use = 'prop') {
  // sharp enough for a 1080p export (a background fills the frame, so it keeps up to 1920 on its long side)
  const tall = h > w;
  const maxW = use === 'bg' ? (tall ? 1080 : 1920) : 1280;
  const maxH = use === 'bg' ? (tall ? 1920 : 1080) : 960;
  const k = Math.min(1, maxW / Math.max(1, w), maxH / Math.max(1, h));
  return { w: Math.max(2, Math.round(w * k)), h: Math.max(2, Math.round(h * k)) };
}

// ---------- slow camera move on a still picture ----------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (u) => u * u * (3 - 2 * u);

/** @param mode 'in' | 'out' | 'left' | 'right' | 'none'  @param u 0..1 through the time the picture is shown. @returns { s, x, y } scale and shift (fractions of the box) */
export function kenBurns(mode, u) {
  const e = ease(clamp01(u));
  switch (mode) {
    case 'none': return { s: 1, x: 0, y: 0 };
    case 'out': return { s: 1.16 - 0.12 * e, x: 0, y: 0 };
    case 'left': return { s: 1.12, x: 0.03 - 0.06 * e, y: 0 };
    case 'right': return { s: 1.12, x: -0.03 + 0.06 * e, y: 0 };
    default: return { s: 1.04 + 0.12 * e, x: 0, y: 0 };
  }
}

const num = (v, d) => (Number.isFinite(+v) ? +v : d);
const f2 = (v) => Math.round(v * 100) / 100;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let uid = 0;

/** transform string of the slow move, centred on (cx, cy) in a box of w x h */
export function kbTransform(mode, u, cx, cy, w, h) {
  const k = kenBurns(mode, u);
  return `translate(${f2(cx)},${f2(cy)}) scale(${f2(k.s * 1000) / 1000}) translate(${f2(-cx + k.x * w)},${f2(-cy + k.y * h)})`;
}

/**
 * The SVG of one picture prop, centred on (0,0) like every other prop (the engine moves it with x, y, scale and the show window).
 * @param entry { href, w, h }  the picture (href is a data: address for export, a blob: address for the live preview)
 * @param p     the prop: { w, h, fit, frame, radius, kb, label, tilt }
 * @param u     0..1 through the time it is shown
 * Returns '' when there is no picture yet.
 */
export function photoPropSvg(entry, p, u = 0) {
  if (!entry || !entry.href) return '';
  const w = Math.max(40, num(p.w, 640)), h = Math.max(30, num(p.h, 360));
  const frame = p.frame !== false;
  const r = Math.max(0, num(p.radius, frame ? 14 : 0));
  const id = `phc${(uid = (uid + 1) % 1e6)}`;
  const fit = p.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice';
  const kb = p.fit === 'contain' ? 'none' : String(p.kb || 'in').toLowerCase();
  const x0 = -w / 2, y0 = -h / 2;
  let o = '';
  if (frame) {
    o += `<rect x="${f2(x0 + 7)}" y="${f2(y0 + 12)}" width="${f2(w + 16)}" height="${f2(h + 16)}" rx="${f2(r + 6)}" fill="#000" opacity=".34"/>`;
    o += `<rect x="${f2(x0 - 8)}" y="${f2(y0 - 8)}" width="${f2(w + 16)}" height="${f2(h + 16)}" rx="${f2(r + 6)}" fill="#fff"/>`;
  }
  o += `<clipPath id="${id}"><rect x="${f2(x0)}" y="${f2(y0)}" width="${f2(w)}" height="${f2(h)}" rx="${f2(r)}"/></clipPath>`;
  o += `<rect x="${f2(x0)}" y="${f2(y0)}" width="${f2(w)}" height="${f2(h)}" rx="${f2(r)}" fill="#111"/>`;
  let img;
  if (entry.refId && entry.w > 0 && entry.h > 0) {
    // live preview: the picture is defined once (photoDefsSvg) and only placed here, so nothing is decoded again on every frame
    const s = fit.endsWith('meet') ? Math.min(w / entry.w, h / entry.h) : Math.max(w / entry.w, h / entry.h);
    img = `<use href="#${entry.refId}" transform="translate(${f2(-entry.w * s / 2)},${f2(-entry.h * s / 2)}) scale(${Math.round(s * 10000) / 10000})"/>`;
  } else {
    img = `<image x="${f2(x0)}" y="${f2(y0)}" width="${f2(w)}" height="${f2(h)}" preserveAspectRatio="${fit}" href="${entry.href}"/>`;
  }
  o += `<g clip-path="url(#${id})"><g transform="${kbTransform(kb, u, 0, 0, w, h)}">${img}</g></g>`;
  const label = String(p.label == null ? '' : p.label).slice(0, 42);
  if (label) {
    const lw = Math.min(w - 20, label.length * 17 + 36), ly = y0 + h - 56;
    o += `<rect x="${f2(x0 + 14)}" y="${f2(ly)}" width="${f2(lw)}" height="42" rx="21" fill="#0b0f1a" opacity=".82"/><text x="${f2(x0 + 14 + lw / 2)}" y="${f2(ly + 28)}" text-anchor="middle" font-family="system-ui,Segoe UI,Roboto,Arial,sans-serif" font-size="25" font-weight="700" fill="#fff">${esc(label)}</text>`;
  }
  const tilt = num(p.tilt, 0);
  return tilt ? `<g transform="rotate(${f2(tilt)})">${o}</g>` : o;
}

/**
 * A picture that fills the whole 1600 x 900 stage behind the characters, with a calm dark layer so characters and captions stay easy to read.
 * `__KB__` is where the slow move goes (the live preview changes only that one attribute each frame; export fills it in).
 */
export function photoBackgroundSvg(entry, { tall = false } = {}) {
  const dim = '<defs><linearGradient id="phbg" x1="0" y1="0" x2="0" y2="1"><stop offset=".52" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".62"/></linearGradient><linearGradient id="phbt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".22" stop-color="#000" stop-opacity="0"/></linearGradient></defs>';
  const img = entry && entry.href
    ? `<g class="p-kb" transform="__KB__"><image x="${tall ? 547 : 0}" y="0" width="${tall ? 506 : 1600}" height="900" preserveAspectRatio="xMidYMid slice" href="${entry.href}"/></g>`
    : '<defs><linearGradient id="phfb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b2338"/><stop offset="1" stop-color="#0c111d"/></linearGradient></defs><rect width="1600" height="900" fill="url(#phfb)"/>';
  return `${img}${dim}<rect width="1600" height="900" fill="#000" opacity=".14"/><rect width="1600" height="900" fill="url(#phbt)"/><rect width="1600" height="900" fill="url(#phbg)"/>`;
}

/** The transform for the background picture at scene time T (a scene of `dur` seconds). */
export const backgroundKb = (T, dur, mode = 'in') => kbTransform(mode, clamp01(T / Math.max(0.5, dur)), 800, 450, 1600, 900);

/** Fade (and a small pop) of a picture that is shown between show[0] and show[1]. Returns { op, scale }. */
export function photoShowEnvelope(T, show) {
  const a = Array.isArray(show) ? num(show[0], 0) : 0, b = Array.isArray(show) ? num(show[1], 1e9) : 1e9;
  const inn = ease(clamp01((T - a) / 0.38)), out = b < 1e8 ? ease(clamp01((b - T) / 0.3)) : 1;
  const k = Math.min(inn, out);
  return { op: k, scale: 0.94 + 0.06 * k, u: b < 1e8 && b > a ? clamp01((T - a) / (b - a)) : clamp01((T - a) / 8) };
}

/** The shared copies of the pictures for the live preview: one <image> per picture, placed many times with <use>. */
export function photoDefsSvg(store) {
  let o = '';
  if (!store || !store.map) return o;
  for (const e of store.map.values()) {
    if (e && e.ready && e.blobUrl && e.id) o += `<image id="${e.id}" width="${e.w}" height="${e.h}" href="${e.blobUrl}"/>`;
  }
  return o;
}
