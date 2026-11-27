// "Use my images": the person's own backgrounds. Pure functions (no DOM) so they are unit tested in Node; index.html wires the browser parts.
//
//   - each background has a NAME the person typed ("Classroom"), a picture kept on the device, and a measured FLOOR (where characters can stand)
//   - the prompt lists the names and the floor numbers, so the AI writes  background:'my:Classroom'  and places the characters on the floor
//   - the engine draws the saved picture (cover-fit, never stretched) and, as a safety net, puts the characters' feet on the measured floor
//   - a contact sheet (the pictures with their names, 12 per page) is downloaded with the prompt so the AI can SEE them

export const MY_PREFIX = 'my:';
export const SHEET_PER_PAGE = 12;
export const MAX_NAME = 40;
export const MAX_IMAGES = 40;

const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** A tidy name: no markup characters, no quotes, one space between words, at most 40 letters. */
export function cleanBgName(s) {
  return String(s == null ? '' : s).replace(/[<>&"'`\\]/g, '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

/** "classroom_night-2.JPG" -> "Classroom night 2": a starting name the person can change. */
export function nameFromFile(fileName) {
  const base = String(fileName || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!base || /^(img|image|photo|dsc|screenshot|pxl)\s*\d*$/i.test(base) || /^\d+$/.test(base)) return '';
  return cleanBgName(base.charAt(0).toUpperCase() + base.slice(1));
}

/** The name with a number added when the person already has one called the same (names are what the AI uses, so each must be unique). */
export function uniqueBgName(name, list) {
  const base = cleanBgName(name) || 'Background';
  const taken = new Set((list || []).map((b) => norm(b.name)));
  if (!taken.has(norm(base))) return base;
  for (let i = 2; i < 200; i++) {
    const n = cleanBgName(base.slice(0, MAX_NAME - String(i).length - 1) + ' ' + i);
    if (!taken.has(norm(n))) return n;
  }
  return base;
}

/** 'my:Classroom' (also 'mine:' / 'photo:my:') -> 'Classroom', else null. */
export function parseMyTag(raw) {
  const m = /^\s*(?:photo\s*:\s*)?(?:my|mine)\s*:\s*(.+?)\s*$/i.exec(String(raw == null ? '' : raw));
  return m ? m[1].replace(/^["'`]+|["'`]+$/g, '').trim() : null;
}
export const isMyTag = (raw) => parseMyTag(raw) !== null;

/** Finds the picture a name means: exact, then without capitals and symbols, then one inside the other, then the most shared words. Falls back to the first. */
export function matchBg(list, wanted) {
  const L = (list || []).filter(Boolean);
  if (!L.length) return null;
  const w = norm(wanted);
  if (w) {
    const exact = L.find((b) => b.name === wanted) || L.find((b) => norm(b.name) === w);
    if (exact) return exact;
    const inc = L.find((b) => norm(b.name).includes(w) || w.includes(norm(b.name)));
    if (inc && norm(inc.name).length > 2) return inc;
    const words = w.split(' ').filter((x) => x.length > 2);
    let best = null, bs = 0;
    for (const b of L) { const bw = norm(b.name).split(' '); const s = words.filter((x) => bw.some((y) => y === x || y.startsWith(x) || x.startsWith(y))).length; if (s > bs) { bs = s; best = b; } }
    if (best) return best;
  }
  return L[0];
}

/* ---------- measuring the floor ---------- */

/**
 * Looks at a small grayscale copy of the picture (gray: Float/Uint8 array, w*h, 0..255) and estimates
 *   horizon  0..1  where the floor (or ground) starts, from the strongest brightness change across the middle of the picture
 *   top      0..1  the top of the standing area (the horizon, never above 35% or below 80%)
 *   free     up to 3 ranges [x0,x1] (0..1) in the floor area that are calmer (less furniture / clutter) than the rest
 * It is an estimate: a plain wall-and-floor room reads well, a busy street less so.
 */
export function measureFloor(gray, w, h) {
  const W = Math.max(2, w | 0), H = Math.max(2, h | 0);
  const row = new Array(H).fill(0);
  for (let y = 0; y < H; y++) { let s = 0; for (let x = 0; x < W; x++) s += gray[y * W + x] || 0; row[y] = s / W; }
  const band = 3;
  let bestY = Math.round(H * 0.62), bestV = 0;
  for (let y = Math.round(H * 0.3); y <= Math.round(H * 0.78); y++) {
    let a = 0, b = 0, n = 0;
    for (let k = 1; k <= band; k++) { if (y - k >= 0 && y + k < H) { a += row[y - k]; b += row[y + k]; n++; } }
    if (!n) continue;
    const v = Math.abs(b / n - a / n);
    if (v > bestV) { bestV = v; bestY = y; }
  }
  const strong = bestV >= 6;
  const horizon = strong ? bestY / H : 0.62;
  const top = cl(horizon, 0.35, 0.8);
  // calm columns: low edge density in the floor area
  const cols = 8, y0 = Math.min(H - 2, Math.round(top * H)), dens = new Array(cols).fill(0), cnt = new Array(cols).fill(0);
  for (let y = y0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const c = Math.min(cols - 1, Math.floor((x / W) * cols));
    dens[c] += Math.abs(gray[y * W + x + 1] - gray[y * W + x]) + Math.abs(gray[(y + 1) * W + x] - gray[y * W + x]);
    cnt[c]++;
  }
  const d = dens.map((v, i) => (cnt[i] ? v / cnt[i] : 0));
  const sorted = [...d].sort((a, b) => a - b), med = sorted[Math.floor(cols / 2)];
  const calm = d.map((v) => v <= med);
  const free = [];
  for (let i = 0; i < cols; i++) {
    if (!calm[i]) continue;
    const last = free[free.length - 1];
    if (last && last[1] === i) last[1] = i + 1; else free.push([i, i + 1]);
  }
  const ranges = free.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 3).map(([a, b]) => [Math.round((a / cols) * 100) / 100, Math.round((b / cols) * 100) / 100]).sort((a, b) => a[0] - b[0]);
  return { horizon: Math.round(horizon * 1000) / 1000, top: Math.round(top * 1000) / 1000, free: ranges.length ? ranges : [[0.1, 0.9]], sure: strong };
}

/**
 * Where the picture lands in the 1600x900 film world, and so where characters can stand (world units).
 * Landscape film: the picture covers the whole 1600x900. Tall (9:16) film: the visible window is x 547..1053, and the picture covers that window.
 */
export function placementFor(rec, aspect = '16:9') {
  const tall = aspect === '9:16';
  const w = Math.max(1, +rec.w || 1600), h = Math.max(1, +rec.h || 900);
  const box = tall ? { x: 547, y: 0, w: 506, h: 900 } : { x: 0, y: 0, w: 1600, h: 900 };
  const s = Math.max(box.w / w, box.h / h);
  const dw = w * s, dh = h * s, ox = box.x + (box.w - dw) / 2, oy = box.y + (box.h - dh) / 2;
  const f = rec.floor || { top: 0.62, free: [[0.1, 0.9]] };
  const topY = cl(Math.round(oy + f.top * dh), 280, 760);
  const lo = Math.min(topY + 30, 850), hi = 880;
  const ground = Math.round(cl(topY + (hi - topY) * 0.55, lo, hi));
  const free = (f.free || []).map(([a, b]) => [cl(Math.round(ox + a * dw), box.x, box.x + box.w), cl(Math.round(ox + b * dw), box.x, box.x + box.w)]).filter(([a, b]) => b - a > 60);
  return { box, draw: { x: ox, y: oy, w: dw, h: dh }, topY, groundLo: lo, groundHi: hi, ground, free: free.length ? free : [[box.x + 40, box.x + box.w - 40]] };
}

/* ---------- the prompt ---------- */

export const MY_BG_HEADING = 'BACKGROUND STYLE: MY OWN PICTURES';

/** The background directions when the person uses their own pictures. */
export function myBackgroundBlock(list, aspect = '16:9') {
  const L = (list || []).filter(Boolean);
  if (!L.length) return '';
  const tall = aspect === '9:16';
  const lines = L.map((b, i) => {
    const p = placementFor(b, aspect);
    const fr = p.free.map(([a, c]) => `x ${a}-${c}`).join(' and ');
    return `${i + 1}. "${b.name}" (${b.w >= b.h ? 'wide' : 'tall'} picture): the floor starts at about y=${p.topY}; put the feet (ground) between y=${p.groundLo} and y=${p.groundHi}, best y=${p.ground}; the clearest places to stand are ${fr}.`;
  }).join('\n');
  return `${MY_BG_HEADING}
The person has saved their OWN background pictures in the app. Use ONLY these. Do NOT draw a set, do NOT use LOC.*, SETS or photo: tags for the place. In EVERY scene (and the thumbnail) write  background:'my:<exact name>'  with the name copied exactly as written below, and choose the picture that best fits what that scene's narration says. A picture may be used in many scenes; change the camera, the light tint, the props and where the characters stand to keep scenes different. If the story needs a place that is not in the list, use the closest picture and show the rest with props, items, labels and effects on top of it.
THE PICTURES (each one is also shown on the contact sheet I attach, numbered and named; if you can see the sheet, study where the floor, furniture and doorways are; if you cannot, use the numbers):
${lines}
PLACING CHARACTERS ON THEM: every character's feet must stand on the picture's floor: use the ground y from the list (a little higher y = nearer the camera = a little bigger scale, a little lower y = farther = smaller). Keep people inside the clear standing places, not in front of the furniture or doors the picture shows, and keep them out of the bottom quarter that holds the captions' text where you can. ${tall ? 'This is a tall 9:16 film: only the middle of each picture (x 547 to 1053) is visible, so keep everyone and every prop inside x 600 to 1000.' : 'Face people toward each other and toward what the narration is about.'} Props and items you add must sit on the floor line or on surfaces the picture shows.
The pictures are flat images: they do not move. Bring the scene alive with the characters, props, items, light, particles, camera moves and captions.`;
}

/** Puts the block into a finished Full-tier prompt: before the engine reference when there is one, otherwise at the end. Replaces any other background block. */
export function injectMyBackgroundBlock(prompt, block) {
  let text = String(prompt || '');
  if (!text || !block || text.includes(MY_BG_HEADING)) return text;
  const at = text.indexOf('ENGINE REFERENCE:');
  if (at > 0) return `${text.slice(0, at)}${block}\n\n${text.slice(at)}`;
  return `${text.trimEnd()}\n\n${block}\n`;
}

/* ---------- the contact sheet ---------- */

/** Which pictures go on which page and where each cell is. Cells are 16:9 with a name bar under them. */
export function sheetPages(list, per = SHEET_PER_PAGE) {
  const L = (list || []).filter(Boolean), cols = 3, cw = 480, ch = 270, bar = 38, gap = 14, pad = 14;
  const pages = [];
  for (let s = 0; s < L.length; s += per) {
    const items = L.slice(s, s + per), rows = Math.ceil(items.length / cols);
    pages.push({
      index: pages.length + 1, w: pad * 2 + cols * cw + (cols - 1) * gap, h: pad * 2 + rows * (ch + bar) + (rows - 1) * gap,
      cells: items.map((b, i) => ({ n: s + i + 1, name: b.name, id: b.id, x: pad + (i % cols) * (cw + gap), y: pad + Math.floor(i / cols) * (ch + bar + gap), w: cw, h: ch, bar })),
    });
  }
  return pages;
}

/* ---------- keeping the pictures on the device ---------- */

const DB = 'animato-my-backgrounds', STORE = 'bgs';

/** A small store: IndexedDB when the browser has it, memory otherwise. Records: { id, name, w, h, data (a data URL), thumb, floor }. */
export function createBgStore(env = {}) {
  const idb = env.indexedDB !== undefined ? env.indexedDB : (typeof indexedDB !== 'undefined' ? indexedDB : null);
  const mem = new Map();
  let db = null;
  const open = () => new Promise((res) => {
    if (!idb) return res(null);
    if (db) return res(db);
    try {
      const rq = idb.open(DB, 1);
      rq.onupgradeneeded = () => { try { rq.result.createObjectStore(STORE, { keyPath: 'id' }); } catch (e) { /* exists */ } };
      rq.onsuccess = () => { db = rq.result; res(db); };
      rq.onerror = () => res(null);
      rq.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
  const tx = (mode, fn) => open().then((d) => new Promise((res) => {
    if (!d) return res(undefined);
    try { const t = d.transaction(STORE, mode); fn(t.objectStore(STORE)); t.oncomplete = () => res(true); t.onerror = () => res(undefined); t.onabort = () => res(undefined); } catch (e) { res(undefined); }
  }));
  return {
    async all() {
      const d = await open();
      if (d) {
        const list = await new Promise((res) => { try { const r = d.transaction(STORE, 'readonly').objectStore(STORE).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res(null); } catch (e) { res(null); } });
        if (list) return list.sort((a, b) => (a.at || 0) - (b.at || 0));
      }
      return [...mem.values()].sort((a, b) => (a.at || 0) - (b.at || 0));
    },
    async put(rec) { mem.set(rec.id, rec); await tx('readwrite', (s) => s.put(rec)); return true; },
    async remove(id) { mem.delete(id); await tx('readwrite', (s) => s.delete(id)); return true; },
    persistent: () => !!idb,
  };
}
