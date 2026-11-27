// Doodle character style for the Animato scene engine.
// A port of the Doodle Maker characters (wobbly pencil line + watercolor wash, big-headed
// kids with seeded faces, hair and accessories) that outputs SVG so it can be used by the
// scene player and video exporter exactly like the stickman rig.
//
//   renderDoodle(look, pose, talk, mouthOpen, blink, view, uid, index) -> { svg, chair }
//   ddSpec(look, index) -> resolved unique doodle character + expression

import { seedFromLook, resolveExpression } from './style-humanforge.js';
import { mouthParams } from './motion-polish.js';

const PI = Math.PI, sin = Math.sin, cos = Math.cos;
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const f1 = (n) => { n = +n; return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0; };
const D2R = PI / 180;
const HEX6 = /^#[0-9a-f]{6}$/i, HEX3 = /^#[0-9a-f]{3}$/i;
const asHex = (v) => {
  const s = String(v == null ? '' : v).trim();
  if (HEX6.test(s)) return s.toLowerCase();
  if (HEX3.test(s)) return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
  return '';
};

export const DOODLE_OPTIONS = {
  shape: ['round', 'tall', 'wide', 'pear'],
  eye: ['big', 'sleepy', 'wink', 'dots'],
  hair: ['messy', 'spiky', 'bowl', 'sidepart', 'buzz', 'bald'],
  bit: ['none', 'topknot', 'bandana', 'eyepatch', 'goggles', 'mustache', 'bigEars', 'tooth', 'beret', 'bandaid', 'crown', 'headphones', 'scar'],
  mouth: ['smile', 'grin', 'open', 'smirk', 'frown', 'flat'],
  brow: ['calm', 'happy', 'sad', 'angry'],
};
const HAIR_ALIAS = {
  short: 'sidepart', 'side-part': 'sidepart', swept: 'sidepart', pompadour: 'sidepart', crop: 'buzz', long: 'messy', 'long-wavy': 'messy', curly: 'messy', 'curly-afro': 'messy', afro: 'messy',
  ponytail: 'messy', bun: 'messy', bob: 'bowl', pixie: 'bowl', braid: 'messy', tousled: 'messy', quiff: 'spiky', none: 'bald',
};
const BIT_ALIAS = {
  glasses: 'goggles', shades: 'goggles', round: 'goggles', square: 'goggles', cap: 'beret', hat: 'beret', beanie: 'beret', bucket: 'beret', beard: 'mustache', moustache: 'mustache', ears: 'bigEars', band: 'bandana',
};
const PAL = {
  skin: ['#f2d7bd', '#ecc9a8', '#f5e0c8', '#eac5a4', '#f0d2b2'],
  cloth: ['#b9c6cc', '#c9c2a4', '#d4b8b0', '#b3c2b0', '#c6bed2', '#d8cba8', '#c2cfd4'],
  pop: ['#e0a05a', '#c96a5a', '#8aa860', '#6a9ab0'],
};
const PENCIL = '#3d372f', PAPER = '#f3ecd9';
let INK = PENCIL;

// ---------- seeded random + stable noise ----------
function mb(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
class RNG {
  constructor(s) { this.f = mb(s); }
  next() { return this.f(); }
  range(a, b) { return a + (b - a) * this.f(); }
  pick(a) { return a[Math.floor(this.f() * a.length)]; }
  chance(p) { return this.f() < p; }
}
const NC = new Map();
function noise(seed) {
  let f = NC.get(seed);
  if (f) return f;
  if (NC.size > 6000) NC.clear();
  const r = mb(seed), N = 128, tb = new Float32Array(N);
  for (let i = 0; i < N; i++) tb[i] = r() * 2 - 1;
  f = (t) => { const i = Math.floor(t), u = t - i, s = u * u * (3 - 2 * u), a = ((i % N) + N) % N; return tb[a] + (tb[(a + 1) % N] - tb[a]) * s; };
  NC.set(seed, f);
  return f;
}

// ---------- pencil + watercolor primitives (SVG strings) ----------
function subdiv(p, st) {
  if (p.length < 2) return p.slice();
  const o = [p[0]];
  for (let i = 1; i < p.length; i++) {
    const [a, b] = p[i - 1], [c, d] = p[i], n = Math.max(1, Math.round(Math.hypot(c - a, d - b) / st));
    for (let k = 1; k <= n; k++) { const u = k / n; o.push([a + (c - a) * u, b + (d - b) * u]); }
  }
  return o;
}
function wob(p, seed, m, close) {
  const nx = noise(seed), ny = noise(seed + 101);
  return p.map((q, i) => {
    let dx = nx(i * .35) * m, dy = ny(i * .35) * m;
    if (close && (i === 0 || i === p.length - 1)) { dx = nx(0) * m; dy = ny(0) * m; }
    return [q[0] + dx, q[1] + dy];
  });
}
const pathD = (p, close) => 'M' + p.map((q) => f1(q[0]) + ',' + f1(q[1])).join('L') + (close ? 'Z' : '');
function rs(pts, o = {}) {
  const seed = o.seed ?? 1, w = o.wobble ?? 1.4, close = o.close ?? false, wd = o.width ?? 1.7, al = o.alpha ?? .8, sub = subdiv(pts, 7), col = o.color ?? INK;
  let s = '';
  for (let k = 0; k < 2; k++) {
    s += `<path d="${pathD(wob(sub, seed + k * 104729, w * (k ? .9 : 1), close), close)}" fill="none" stroke="${col}" stroke-width="${f1((k ? wd * .7 : wd) * 10) / 10}" stroke-opacity="${f1((k ? al * .45 : al) * 100) / 100}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return s;
}
function wash(pts, col, o = {}) {
  const seed = o.seed ?? 1, Ln = o.layers ?? 3, al = Math.min(.6, (o.alpha ?? .1) * 1.7), bl = o.bleed ?? 3, sub = subdiv(pts, 9);
  let cx = 0, cy = 0;
  for (const p of sub) { cx += p[0]; cy += p[1]; }
  cx /= sub.length; cy /= sub.length;
  let s = o.base === false ? '' : `<path d="${pathD(wob(sub, seed + 7, .8, true), true)}" fill="${PAPER}"/>`;
  for (let l = 0; l < Ln; l++) {
    const g = bl * (l + 1) / Ln * (o.tight ? .6 : 1), nx = noise(seed + l * 31), ny = noise(seed + l * 31 + 7);
    const w = sub.map((p, i) => {
      const vx = p[0] - cx, vy = p[1] - cy, d = Math.hypot(vx, vy) || 1, r = g * (.6 + .8 * Math.abs(nx(i * .4)));
      return [p[0] + vx / d * r + nx(i * .4) * 1.1, p[1] + vy / d * r + ny(i * .4) * 1.1];
    });
    s += `<path d="${pathD(w, true)}" fill="${col}" fill-opacity="${f1(al * (1 - .55 * l / Ln) * 100) / 100}"/>`;
  }
  return s;
}
const shp = (p, o = {}) => (o.fill ? wash(p, o.fill, o) : '') + rs(p, { ...o, close: true });
function blob(cx, cy, r, seed, o = {}) {
  const n = o.n ?? 30, n1 = noise(seed), n2 = noise(seed + 31), amp = o.amp ?? .06, sxx = o.sqX ?? 1, syy = o.sqY ?? 1, jaw = o.jaw ?? 0, p = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * PI * 2;
    let rr = r * (1 + amp * n1(i * .55) + amp * .5 * n2(i * 1.3));
    if (jaw) rr *= 1 + jaw * Math.max(0, sin(a));
    p.push([cx + cos(a) * rr * sxx, cy + sin(a) * rr * syy]);
  }
  return p;
}
const ell = (cx, cy, rx, ry, n = 26, rot = 0) => {
  const p = [];
  for (let i = 0; i < n; i++) { const a = i / n * PI * 2, x = cos(a) * rx, y = sin(a) * ry; p.push([cx + x * cos(rot) - y * sin(rot), cy + x * sin(rot) + y * cos(rot)]); }
  return p;
};
const arc = (cx, cy, r, a0, a1, n = 12) => {
  const p = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([cx + cos(a) * r, cy + sin(a) * r]); }
  return p;
};
const dot = (x, y, r, c, al = .8) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${c}" fill-opacity="${al}"/>`;
function groundShadow(cx, cy, w, seed) {
  let s = `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(w)}" ry="${f1(w * .17)}" fill="#000" opacity=".07"/>`;
  for (let i = 0; i < 3; i++) {
    const r = mb(seed + i * 17), rx = w * (.85 + r() * .3), ry = w * .16 * (.8 + r() * .4);
    s += rs(ell(cx + (r() - .5) * w * .2, cy + (r() - .5) * 3, rx, ry, 22), { seed: seed + i * 991, wobble: 2.2, width: 1.1, alpha: .2, close: true });
  }
  return s;
}

// ---------- the character spec ----------
export function ddSpec(look, idx = 0) {
  const L = look && typeof look === 'object' ? look : {};
  const seed = seedFromLook(L, idx);
  const r = new RNG(seed), h = 250;
  const d = { seed, h };
  d.headR = h * r.range(.32, .38); d.legH = h * r.range(.15, .19); d.torsoH = h * r.range(.13, .17);
  d.shape = r.pick(DOODLE_OPTIONS.shape);
  d.skin = r.chance(.22) ? r.pick(PAL.pop) : r.pick(PAL.skin);
  d.eye = r.pick(['big', 'big', 'big', 'sleepy', 'wink', 'dots']);
  d.look = r.range(-.4, .4); d.skew = r.chance(.4) ? r.range(.05, .09) : 0;
  d.bit = r.pick(['topknot', 'bandana', 'eyepatch', 'goggles', 'mustache', 'bigEars', 'tooth', 'beret', 'bandaid', 'crown', 'headphones', 'scar', 'none', 'none']);
  d.hair = r.pick(['messy', 'messy', 'spiky', 'bowl', 'sidepart', 'buzz', 'bald']);
  d.hairC = r.pick(['#6b5b48', '#4a4238', '#8a7a68', '#3a3430']);
  d.shirt = r.pick(PAL.cloth); d.stripes = r.chance(.3); d.blush = r.chance(.5); d.tic = r.pick(['sway', 'bounce', 'still']);
  const gs = String(L.gender || L.sex || '').toLowerCase();
  const fem = /^f|^w|^girl/.test(gs), mal = /^m|^b/.test(gs);
  if (fem && ['bald', 'buzz', 'spiky'].includes(d.hair)) d.hair = r.pick(['messy', 'bowl', 'sidepart']);
  if (fem && d.bit === 'mustache') d.bit = 'bandana';
  const sh = String(L.shape || L.headShape || '').toLowerCase(); if (DOODLE_OPTIONS.shape.includes(sh)) d.shape = sh;
  const skin = asHex(L.skin); if (skin) d.skin = skin;
  const eye = String(L.eye || L.eyes || '').toLowerCase(); if (DOODLE_OPTIONS.eye.includes(eye)) d.eye = eye;
  if (L.hair !== undefined) { let hk = String(L.hair).toLowerCase(); hk = HAIR_ALIAS[hk] || hk; if (DOODLE_OPTIONS.hair.includes(hk)) d.hair = hk; }
  const hc = asHex(L.hairc || L.hairC || L.hairColor); if (hc) d.hairC = hc;
  let bit = L.bit !== undefined ? L.bit : (L.accessory !== undefined ? L.accessory : (L.headwear !== undefined && !/^none$/i.test(String(L.headwear)) ? L.headwear : (L.eyewear !== undefined && !/^none$/i.test(String(L.eyewear)) ? L.eyewear : (L.glasses !== undefined && !/^none$/i.test(String(L.glasses)) ? 'goggles' : undefined))));
  if (bit !== undefined) {
    let bk = String(bit); const lower = bk.toLowerCase();
    bk = DOODLE_OPTIONS.bit.find((b) => b.toLowerCase() === lower) || BIT_ALIAS[lower] || bk;
    if (DOODLE_OPTIONS.bit.includes(bk)) d.bit = bk;
  }
  if (L.facialHair !== undefined && !/^(none|no|false)$/i.test(String(L.facialHair)) && L.bit === undefined) d.bit = 'mustache';
  const shirt = asHex(L.shirt || L.topc || L.topColor || L.outfitc || (asHex(L.top) ? L.top : '')); if (shirt) d.shirt = shirt;
  if (L.stripes !== undefined) d.stripes = !!L.stripes; else if (/stripe/i.test(String(L.top || L.outfit || ''))) d.stripes = true;
  if (L.blush !== undefined) d.blush = !!L.blush;
  if (['sway', 'bounce', 'still'].includes(L.tic)) d.tic = L.tic;
  const headScale = +L.headSize || +L.headScale; if (Number.isFinite(headScale) && headScale > 0) d.headR *= cl(headScale, .8, 1.25);
  const ink = asHex(L.ink); d.ink = ink || PENCIL;
  d.ex = resolveExpression(L);
  void mal;
  return d;
}

// ---------- head pieces ----------
function headPts(d, V) {
  const r = d.headR, cy = d.cy, s = d.seed ^ 0xb1, S = V === 'side';
  if (d.shape === 'tall') return blob(0, cy, r, s, { amp: .045, sqX: S ? .95 : .88, sqY: 1.12 });
  if (d.shape === 'wide') return blob(0, cy, r, s, { amp: .045, sqX: S ? 1 : 1.18, sqY: .88 });
  if (d.shape === 'pear') return blob(0, cy, r, s, { amp: .045, jaw: .24 });
  return blob(0, cy, r, s, { amp: .05 });
}
function scrib(d, pts, col, seed, y0, y1, clipId) {
  const r = d.headR, rr = new RNG(seed);
  let hatch = '';
  for (let y = y0; y < y1; y += 7) {
    let x = -r * 1.4; hatch += `M${f1(x)},${f1(y)}`;
    while (x < r * 1.4) { x += 9; hatch += `L${f1(x)},${f1(y + (rr.next() - .5) * 5)}`; }
  }
  return `<clipPath id="${clipId}"><path d="${pathD(subdiv(pts, 8), true)}"/></clipPath><path d="${hatch}" clip-path="url(#${clipId})" fill="none" stroke="${col}" stroke-width="1.3" stroke-opacity=".5"/>`;
}
function hairdo(d, V) {
  const r = d.headR, cy = d.cy, seed = d.seed ^ 0xb2, h = d.hair, c = d.hairC;
  let pts = null, o = '';
  if (h === 'messy') { pts = arc(0, cy, r * 1.04, PI * 1.02, PI * 1.98, 18); for (let i = 6; i >= 0; i--) pts.push([-r * .9 + i / 6 * r * 1.8, cy - r * (.28 + (i % 2) * .14)]); }
  else if (h === 'bowl') pts = arc(0, cy, r * 1.02, PI * 1.03, PI * 1.97, 16).concat(arc(0, cy, r * .68, PI * 1.97, PI * 1.03, 12));
  else if (h === 'sidepart') pts = arc(0, cy, r * 1.03, PI * .95, PI * 1.85, 16).concat([[r * .15, cy - r * .1], [-r * .7, cy - r * .35]]);
  else if (h === 'spiky') {
    pts = [];
    for (let i = 0; i <= 8; i++) {
      const a = PI * 1.08 + i / 8 * PI * .84; pts.push([cos(a) * r * 1.02, cy + sin(a) * r * 1.02]);
      if (i < 8) { const a2 = PI * 1.08 + (i + .5) / 8 * PI * .84; pts.push([cos(a2) * r * 1.3, cy + sin(a2) * r * 1.3]); }
    }
    pts.push([r * .9, cy - r * .4], [-r * .9, cy - r * .4]);
  } else if (h === 'buzz') pts = arc(0, cy, r * 1.01, PI * 1.05, PI * 1.95, 16).concat(arc(0, cy, r * .84, PI * 1.95, PI * 1.05, 12));
  const id = `dd${d.seed}${V[0]}`;
  if (pts) { o += shp(pts, { seed, fill: c, alpha: .26, bleed: 1.6, width: 1.7 }) + scrib(d, pts, c, seed, cy - r * 1.4, cy + r * .3, id + 'a'); }
  if (h !== 'bald' && V !== 'front') {
    const q = V === 'back' ? headPts(d, V) : arc(0, cy, r, PI * .62, PI * 1.55, 16);
    o += shp(q, { seed: seed + 9, fill: c, alpha: .26, bleed: 1.6, width: 1.7 }) + scrib(d, q, c, seed + 9, cy - r * 1.4, cy + r * 1.1, id + 'b');
  }
  return o;
}
function bits(d, V, sw) {
  const r = d.headR, cy = d.cy, s = d.seed ^ 0xb3, tY = cy - r, eY = cy - r * .05, eX = r * .36, hc = d.hairC;
  const S = V === 'side', B = V === 'back', F = V === 'front', k = S ? .75 : 1, red = '#c96a5a';
  let o = '';
  switch (d.bit) {
    case 'topknot': o += rs([[0, tY], [3, tY - r * .28], [1, tY - r * .34]], { seed: s, wobble: .5, width: 2.2 }) + shp(blob(2, tY - r * .42 + sw * 1.5, r * .16, s, { amp: .1 }), { seed: s + 1, fill: hc, alpha: .5, tight: 1, width: 1.5 }); break;
    case 'bandana':
      o += shp([[-r * .95 * k, cy - r * .3], [0, tY + r * .02], [r * .95 * k, cy - r * .3], [r * .75 * k, cy - r * .02], [-r * .75 * k, cy - r * .02]], { seed: s, fill: red, alpha: .5, tight: 1, width: 1.7 });
      if (F) o += rs([[r * .95, cy - r * .25], [r * 1.2, cy - r * .08 + sw * 2]], { seed: s + 1, wobble: .5, width: 2.2, color: red });
      if (S) o += rs([[-r * .7, cy - r * .2], [-r * 1.05, cy + r * .02 + sw * 2]], { seed: s + 1, wobble: .5, width: 2.2, color: red });
      if (B) o += dot(0, cy - r * .1, 4, red, .8) + rs([[0, cy - r * .1], [-r * .14, cy + r * .14 + sw * 2]], { seed: s + 1, wobble: .4, width: 2.2, color: red }) + rs([[0, cy - r * .1], [r * .16, cy + r * .12 - sw * 2]], { seed: s + 2, wobble: .4, width: 2.2, color: red });
      break;
    case 'eyepatch': {
      const px = S ? r * .44 : eX;
      if (!B) o += shp(ell(px, eY, r * .2, r * .18, 12), { seed: s, fill: '#3a3430', alpha: .7, tight: 1, width: 1.5 });
      o += rs(S ? [[-r * .95, eY - r * .35], [px, eY]] : B ? [[-r * .95, eY - r * .35], [r * .95, eY + r * .3]] : [[-r * .95, eY - r * .35], [eX, eY], [r * .95, eY + r * .3]], { seed: s + 1, wobble: .4, width: 1.5 });
      break;
    }
    case 'goggles':
      if (S) o += shp(ell(r * .3, tY + r * .18, r * .2, r * .16, 12), { seed: s, fill: '#8fa8c0', alpha: .5, tight: 1, width: 1.8 }) + rs([[-r * .9, tY + r * .35], [r * .1, tY + r * .18]], { seed: s + 2, wobble: .3, width: 1.8 });
      else if (B) o += rs([[-r * .9, tY + r * .3], [0, tY + r * .12], [r * .9, tY + r * .3]], { seed: s + 2, wobble: .3, width: 1.8 });
      else { for (const dd of [-1, 1]) o += shp(ell(dd * r * .34, tY + r * .18, r * .2, r * .16, 12), { seed: s + dd, fill: '#8fa8c0', alpha: .5, tight: 1, width: 1.8 }); o += rs([[-r * .14, tY + r * .18], [r * .14, tY + r * .18]], { seed: s + 2, wobble: .3, width: 1.8 }); }
      break;
    case 'mustache': if (!B) { const a = S ? r * .45 : -r * .35, w = S ? r * .4 : r * .7, p = []; for (let i = 0; i <= 10; i++) { const u = i / 10; p.push([a + u * w, cy + r * .38 + sin(u * PI * 4) * r * .05]); } o += rs(p, { seed: s, wobble: .5, width: 3.2, color: hc }); } break;
    case 'bigEars': if (S) o += shp(ell(0, cy, r * .22, r * .3, 12), { seed: s + 1, fill: d.skin, alpha: .3, tight: 1, width: 1.5 }); else for (const dd of [-1, 1]) o += shp(ell(dd * r * 1.02, cy, r * .22, r * .3, 12), { seed: s + dd, fill: d.skin, alpha: .3, tight: 1, width: 1.5 }); break;
    case 'tooth': if (!B) { const x = S ? r * .55 : 0; o += shp([[x - r * .05, cy + r * .44], [x + r * .09, cy + r * .44], [x + r * .09, cy + r * .58], [x - r * .05, cy + r * .58]], { seed: s, fill: '#fdfbf5', alpha: .8, tight: 1, width: 1.2 }); } break;
    case 'beret': o += shp(ell(r * .08, tY + r * .06, r * .55, r * .2, 14, .22), { seed: s, fill: red, alpha: .5, tight: 1, width: 1.7 }) + rs([[r * .08, tY - r * .12], [r * .12, tY - r * .24]], { seed: s + 1, wobble: .3, width: 1.6 }); break;
    case 'bandaid': if (!B) { o += `<g transform="translate(${f1(S ? r * .2 : -r * .45)},${f1(cy - r * .45)}) rotate(-28.6)">` + shp([[-r * .2, -r * .06], [r * .2, -r * .06], [r * .2, r * .06], [-r * .2, r * .06]], { seed: s, fill: '#e8ddc8', alpha: .7, tight: 1, width: 1.2 }); for (const bx of [-r * .07, 0, r * .07]) o += dot(bx, 0, 1, INK, .4); o += '</g>'; } break;
    case 'crown': { const p = []; for (let i = 0; i <= 4; i++) { const x = (-r * .3 + i / 4 * r * .6) * k; p.push([x, tY + r * .05]); if (i < 4) p.push([x + r * .075 * k, tY - r * (.22 + (i % 2) * .08)]); } o += shp(p, { seed: s, fill: '#e8c85a', alpha: .55, tight: 1, width: 1.5 }); break; }
    case 'headphones': o += rs(arc(0, cy - r * .1, r * 1.08, PI * 1.15, PI * 1.85, 14), { seed: s, wobble: .7, width: 2.6 }); for (const dd of S ? [0] : [-1, 1]) o += shp(ell(dd * r, cy + r * .02, r * .14, r * .2, 12), { seed: s + dd, fill: '#4a4238', alpha: .6, tight: 1, width: 1.6 }); break;
    case 'scar': if (!B) { const off = S ? -r * .1 : 0; o += rs([[r * .5 + off, cy - r * .5], [r * .62 + off, cy - r * .34]], { seed: s, wobble: .3, width: 1.6, color: '#c98a8a' }) + rs([[r * .52 + off, cy - r * .44], [r * .6 + off, cy - r * .42]], { seed: s + 1, wobble: .2, width: 1.2, color: '#c98a8a' }); } break;
    default: break;
  }
  return o;
}
const HEAD_CACHE = new Map();
function drawHead(d, V, closed, mouth, openAmt, brow, wide, sw, mp, turn) {
  const key = [d.seed, d.shape, d.skin, d.hair, d.hairC, d.bit, d.eye, d.blush, d.headR | 0, d.ink, V, closed ? 1 : 0, mouth, Math.round(openAmt * 8), brow, wide ? 1 : 0, Math.round(sw * 2), mp ? [mp.v, Math.round(mp.wide * 4), Math.round(mp.teeth * 2)].join(':') : ''].join('|');
  const hit = HEAD_CACHE.get(key);
  if (hit) return turn ? turnDoodleHead(hit, turn, d) : hit.all;
  const r = d.headR, cy = d.cy, sd = d.seed, S = V === 'side', eY0 = cy - r * .05;
  const skull = shp(headPts(d, V), { seed: sd ^ 0xb7, fill: d.skin, alpha: .26, bleed: 2.6, width: 1.8 });
  let o = '';
  if (V !== 'back') {
    if (d.blush) { if (S) o += dot(r * .35, cy + r * .28, r * .09, '#e8a0a0', .4); else o += dot(-r * .55, cy + r * .28, r * .09, '#e8a0a0', .4) + dot(r * .58, cy + r * .28, r * .09, '#e8a0a0', .4); }
    if (S && d.bit !== 'bigEars') o += shp(ell(-r * .1, cy + r * .06, r * .13, r * .18, 12), { seed: sd ^ 0xba, fill: d.skin, alpha: .3, tight: 1, width: 1.3 });
    for (const s of S ? [1] : [-1, 1]) {
      const ex = S ? r * .44 : s * r * .36, ey = eY0 + (!S && s > 0 ? -d.skew * r : 0);
      const bw = wide ? 1.25 : 1;
      if (!(d.bit === 'eyepatch' && s === 1)) {
        if (closed) o += rs([[ex - r * .16, ey], [ex + r * .16, ey]], { seed: sd + s * 71, wobble: .4, width: 1.5 });
        else if (d.eye === 'wink' && s === 1) o += rs(arc(ex, ey, r * .16, PI + .3, -.3, 8), { seed: sd + s * 71, wobble: .4, width: 1.8 });
        else if (d.eye === 'dots') o += dot(ex, ey, r * .06 * bw, d.ink, .85);
        else {
          const er = r * (d.eye === 'sleepy' ? .18 : .22) * bw;
          o += shp(ell(ex, ey, er, er * 1.05, 14), { seed: sd + s * 71, fill: '#fdfbf5', alpha: .5, bleed: 1, tight: 1, width: 1.5 });
          o += dot(ex + (S ? er * .45 + d.look * er * .3 : d.look * er + er * .2), ey + er * .1, er * .42, d.ink, .92);
          if (d.eye === 'sleepy') o += rs([[ex - er * 1.1, ey - er * .7], [ex + er * 1.1, ey - er * .7]], { seed: sd + s * 73, wobble: .4, width: 1.6 });
        }
      }
      if (brow !== 'calm' && !(d.bit === 'eyepatch' && s === 1)) {
        const by = ey - r * (wide ? .42 : .34), bw2 = r * .17, sg = S ? 1 : s;
        let bp;
        if (brow === 'happy') bp = [[ex - bw2, by + r * .03], [ex, by - r * .04], [ex + bw2, by + r * .03]];
        else if (brow === 'sad') bp = [[ex + sg * bw2, by + r * .05], [ex - sg * bw2, by - r * .05]];
        else bp = [[ex + sg * bw2, by - r * .05], [ex - sg * bw2, by + r * .05]];
        o += rs(bp, { seed: sd + s * 79, wobble: .3, width: 1.6 });
      }
    }
    if (S) o += rs([[r * .92, cy + r * .08], [r * 1.12, cy + r * .2], [r * .92, cy + r * .27]], { seed: sd ^ 0xb8, wobble: .3, width: 1.3, alpha: .7 });
    else o += rs([[0, cy + r * .12], [r * .06, cy + r * .22], [0, cy + r * .25]], { seed: sd ^ 0xb8, wobble: .3, width: 1.3, alpha: .7 });
    const my = cy + r * .42, mx = S ? r * .55 : 0, ms = sd ^ 0xb9;
    if (d.bit === 'tooth' && mouth === 'smile') o += rs([[mx - r * .16, my], [mx + r * .2, my]], { seed: ms, wobble: .4, width: 1.6 });
    else if (d.bit !== 'mustache' || mouth === 'open') {
      if (mouth === 'open' && mp) {
        // the mouth of the word being said: pressed for M B P, teeth on the lip for F V, round for O U, wide for E, tall for A
        if (mp.press > .5 && openAmt < .1) o += rs([[mx - r * .13, my + r * .02], [mx + r * .13, my + r * .02]], { seed: ms, wobble: .3, width: 2.3 });
        else if (mp.fv > .5) o += shp(ell(mx, my + r * .03, r * (S ? .1 : .14), r * .045, 14), { seed: ms, fill: '#8a3a3a', alpha: .55, tight: 1, width: 1.5 }) + rs([[mx - r * (S ? .07 : .1), my - r * .005], [mx + r * (S ? .07 : .1), my - r * .005]], { seed: ms ^ 5, wobble: .2, width: 2, alpha: .9 });
        else {
          const rw = r * (S ? .09 : .13) * (1 + mp.wide * (mp.wide > 0 ? .55 : .42)), rh = r * (.04 + openAmt * .17 + (mp.wide < -.35 ? .03 : 0));
          o += shp(ell(mx, my + r * .03, rw, rh, 14), { seed: ms, fill: '#8a3a3a', alpha: .55, tight: 1, width: 1.5 });
          if (mp.teeth > .4 && openAmt > .25) o += rs([[mx - rw * .7, my + r * .03 - rh * .55], [mx + rw * .7, my + r * .03 - rh * .55]], { seed: ms ^ 7, wobble: .25, width: 1.4, alpha: .85 });
          if (mp.tongue > .35 && openAmt > .3) o += dot(mx, my + r * .03 + rh * .38, rw * .42, '#d98b8b', .65);
        }
      } else if (mouth === 'open') o += shp(ell(mx, my + r * .03, r * (S ? .09 : .13), r * (.05 + openAmt * .14), 14), { seed: ms, fill: '#8a3a3a', alpha: .55, tight: 1, width: 1.5 });
      else if (mouth === 'grin') o += shp(arc(mx, my - r * .06, r * (S ? .15 : .2), .12, PI - .12, 10), { seed: ms, fill: '#8a3a3a', alpha: .4, tight: 1, width: 1.5 });
      else if (mouth === 'smirk') o += rs([[mx - r * .14, my], [mx + r * .04, my + r * .05], [mx + r * .17, my - r * .06]], { seed: ms, wobble: .4, width: 1.5 });
      else if (mouth === 'frown') o += rs(arc(mx, my + r * .16, r * (S ? .1 : .15), PI + .5, PI * 2 - .5, 8), { seed: ms, wobble: .4, width: 1.5 });
      else if (mouth === 'flat') o += rs([[mx - r * .13, my + r * .02], [mx + r * .13, my + r * .02]], { seed: ms, wobble: .4, width: 1.5 });
      else o += rs(arc(mx, my - r * .04, r * (S ? .12 : .16), .3, PI - .5, 8), { seed: ms, wobble: .4, width: 1.5 });
    }
  }
  const hairBits = hairdo(d, V) + bits(d, V, sw);
  const parts = { skull, face: o, hair: hairBits, all: skull + o + hairBits };
  if (HEAD_CACHE.size > 600) HEAD_CACHE.clear();
  HEAD_CACHE.set(key, parts);
  return turn ? turnDoodleHead(parts, turn, d) : parts.all;
}

// 2.5D head turn: the skull stays, the face slides and squeezes toward the person being looked at (yaw -1..1), the hair follows a little
function turnDoodleHead(p, turn, d) {
  const y = Math.max(-1, Math.min(1, +turn.yaw || 0)), a = Math.abs(y), r = d.headR, pt = Math.max(-1, Math.min(1, +turn.pitch || 0));
  if (a < .02 && Math.abs(pt) < .02) return p.all;
  const f = (n) => (Math.round(n * 10) / 10);
  return p.skull + `<g transform="translate(${f(r * .5 * y)},${f(pt * r * .1)}) scale(${f(1 - .24 * a)},1)">${p.face}</g>` + `<g transform="translate(${f(r * .12 * y)},${f(pt * r * .04)}) scale(${f(1 - .05 * a)},1)">${p.hair}</g>`;
}

// ---------- pose + body ----------
const K = 1.95; // pixels per doodle unit -> ~610px tall in the 1600x900 canvas

export function renderDoodle(look, P, talk, mo, blk, view, uid, idx) {
  const d = ddSpec(look, idx);
  INK = d.ink;
  P = P || {};
  const V = view === 'side' ? 'side' : view === 'back' ? 'back' : 'front', S = V === 'side';
  const r = d.headR, tH = d.torsoH; let lh = d.legH;
  lh = lh * 1.48; d.cy = -(lh + tH + r * .95);
  // arm length follows the BODY (hands hang near mid-thigh), not the head: a big head used to give arms that reached the floor
  const sy = -(lh + tH), swd = r * .55, U = Math.min(r * .62, (tH + lh * .42) * .52), hw = lh * .3, sd0 = d.seed, L = lh / 2;
  const a = Array.isArray(P.a) ? P.a : [34, -36, 34, -36];
  const l = Array.isArray(P.l) ? P.l : [0, 0, 0, 0];
  const kb = Math.max(0, +P.k || 0), bend = kb > 1;

  // legs: i=0 is the app's left leg (screen-left in front/back, near leg in profile)
  const legs = [0, 1].map((i) => {
    const sg = i ? 1 : -1, sw = +l[i] || 0, lift = bend ? 0 : (+l[2 + i] || 0) / K * 1.3;
    if (S) {
      const t = cl(sw, -110, 110) * D2R, kk = (bend ? kb : 0) * D2R + (Array.isArray(P.kn) ? cl(+P.kn[i] || 0, 0, 140) * D2R : (+l[2 + i] || 0) * .033 * (bend ? 0 : 1));
      const hx = i ? 1 : -1, hip = [hx, -lh], kn = [hx + sin(t) * L, -lh + cos(t) * L], ft = [kn[0] + sin(t - kk) * L, kn[1] + cos(t - kk) * L];
      return { sg, hip, kn, ft, near: !i };
    }
    const spl = cl(sw * (bend ? .15 : .42), -30, 30) * D2R, ts = bend ? 1 - .55 * Math.min(1, kb / 90) : 1;
    const hip = [sg * hw, -lh], kn = [hip[0] + sg * sin(spl) * L * ts, -lh + cos(spl) * L * ts - lift * .5], ft = [kn[0] + sg * sin(spl) * L, kn[1] + cos(spl) * L - lift * .5];
    return { sg, hip, kn, ft, near: true };
  });
  const shift = -Math.max(legs[0].ft[1], legs[1].ft[1]);
  const lift = Math.max(0, -(P.dy || 0)) / K * 0;

  // arms: i=0 is the app's left arm (screen-left in front/back, far arm in profile)
  const arms = [0, 1].map((i) => {
    const sg = i ? 1 : -1, ua = +a[i * 2] || 0, fa = +a[i * 2 + 1] || 0, sY = sy + 3;
    if (S) {
      const uW = (ua - 34) * 1.15 + 4, rawF = fa > 0 ? (uW + 18) + (fa - (uW + 18)) * .72 : 22 + (-36 - fa) * 1.05;
      const A1 = cl(uW, -85, 175) * D2R, A2 = (cl(uW, -85, 175) + cl(rawF - uW, -10, 120)) * D2R;
      const sh = [0, sY], e = [sin(A1) * U, sY + cos(A1) * U], hd = [e[0] + sin(A2) * U, e[1] + cos(A2) * U];
      return { sh, e, hd, far: !i };
    }
    // rubber-hose arms: short and natural when they hang, longer when raised, so a wave or a point clears the big head and reads
    const raise = cl((Math.abs(ua) - 55) / 95, 0, 1), Ua = U * (1 + .75 * raise);
    // the head is big: a raised arm opens out to the side (instead of straight up across the face) so the hand is seen beside the head
    const uaD = ua > 90 ? 90 + (ua - 90) * .45 : ua, faD = fa > 90 ? 90 + (fa - 90) * .6 : fa;
    const sh = [sg * swd, sY], A1 = uaD * D2R, A2 = faD * D2R;
    const e = [sh[0] + sg * sin(A1) * Ua, sY + cos(A1) * Ua], hd = [e[0] + sg * sin(A2) * Ua, e[1] + cos(A2) * Ua];
    return { sh, e, hd, far: false };
  });

  const halo = (pts, w) => `<path d="${pathD(pts, false)}" fill="none" stroke="${PAPER}" stroke-width="${w + 3.2}" stroke-opacity=".7" stroke-linecap="round" stroke-linejoin="round"/>`;
  let body = '';
  // legs + feet
  legs.forEach((lg, i) => {
    const al = S && !lg.near ? .62 : .9, pts = [lg.hip, lg.kn, lg.ft];
    // trousers: a soft coloured marker stroke under the pencil, so a leg has some body and the knee reads
    const trs = PAL.cloth[((d.seed >>> 5) + 3) % PAL.cloth.length];
    body += `<path d="${pathD(pts, false)}" fill="none" stroke="${trs}" stroke-opacity="${S && !lg.near ? .45 : .8}" stroke-width="${f1(lh * .2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    body += halo(pts, 1.8);
    body += rs(pts, { seed: sd0 + lg.sg * 53, wobble: .6, width: 3.4, alpha: al });
    // knee dot and a hand-drawn shoe that points the way the body faces
    body += dot(lg.kn[0], lg.kn[1], 2.4, INK, .35);
    const toe = S ? 1 : lg.sg, fx = lg.ft[0] + toe * 5.5, fy = lg.ft[1] - 2;
    body += shp(ell(fx, fy, 9.5, 4.6, 16), { seed: sd0 + lg.sg * 59 + i, fill: d.pants2 || '#5b4f45', alpha: al, bleed: 1.4, width: 2.2 });
  });
  // upper body (rotates about the hip)
  let up = '';
  const dd = S ? swd * .55 : swd;
  up += shp([[-dd, sy], [dd, sy], [dd * .8, -lh + 4], [-dd * .8, -lh + 4]], { seed: sd0 ^ 0xb5, fill: d.shirt, alpha: .3, bleed: 2.2, width: 1.6 });
  if (d.stripes) for (let i = 0; i < 2; i++) up += rs([[-dd * .85, sy + tH * (.35 + i * .3)], [dd * .85, sy + tH * (.35 + i * .3)]], { seed: (sd0 ^ 0xb6) + i, wobble: .4, width: 1.4, alpha: .5 });
  let armsFront = '';
  arms.forEach((am, i) => {
    const pts = [am.sh, am.e, am.hd];
    const seg = halo(pts, 1.5) + rs(pts, { seed: sd0 + (i ? 1 : -1) * 61, wobble: .7, width: 2.8, alpha: S && am.far ? .5 : .8 }) + dot(am.hd[0], am.hd[1], 4, d.skin, .95);
    // a raised hand goes in front of the head only when it is out beside it; a hand that would cross the face (a wave, a scratch) passes behind
    if (am.hd[1] < sy - 4 && (S || Math.abs(am.hd[0]) > r * .6)) armsFront += seg; else up += seg;
  });
  // head
  const closed = (Number.isFinite(+blk) ? +blk : 1) < .5;
  let mouth = d.ex.mouth;
  const mOpen = Number.isFinite(+mo) ? cl(+mo, 0, 1) : 0;
  const mp = talk ? mouthParams(mo) : null;
  if (talk && (mOpen > .12 || (mp && (mp.fv > .5 || mp.press > .5)))) mouth = 'open';
  const openAmt = mouth === 'open' ? (talk ? (mp ? mp.open : mOpen) : .6) : 0;
  const hrot = +P.hr || 0, sw = hrot * .1;
  const headSvg = drawHead(d, V, closed, mouth, openAmt, d.ex.brow, d.ex.wide, sw, mouth === 'open' && mp ? mp : null, V === 'front' && (P.yaw || P.pitch) ? { yaw: Math.round((+P.yaw || 0) * 20) / 20, pitch: Math.round((+P.pitch || 0) * 20) / 20 } : null);
  const hxo = f1((+P.hx || 0) / K), hyo = f1((+P.hy || 0) / K);
  up += `<g transform="translate(${hxo},${hyo}) rotate(${f1(hrot)} 0 ${f1(sy)})">${headSvg}</g>`;
  body += `<g transform="rotate(${f1(+P.tr || 0)} 0 ${f1(-lh)})">${up}${armsFront}</g>`;

  // outer transform: same conventions as the stickman rig
  const dx = +P.dx || 0, pDy = +P.dy || 0;
  const sq = Math.max(.2, +P.sq || 1), scl = Math.max(.2, +P.sc || 1);
  const shScaleY = pDy < 0 ? Math.max(.18, 1 + pDy / 500) : 1;
  const sitting = !!P.chair && bend;
  const effDy = sitting ? Math.min(pDy, 0) : pDy;
  const hipPx = 880 + (shift - lh) * K;
  const chair = P.chair ? { seatY: Math.round(hipPx + 6), vk: S ? 's' : V === 'back' ? 'b' : 'f' } : null;
  void lift; void uid;
  const shadow = groundShadow(0, 2, r * 1.15 * (S ? .85 : 1) * shScaleY, sd0 ^ 0xb4);
  const svg =
    `<g transform="translate(${f1(dx)},880) scale(${K})">${shadow}</g>` +
    '<!--CHAIR_B-->' +
    `<g transform="translate(${f1(dx)},${f1(effDy)}) translate(0,880) scale(${f1(1 / sq * 100) / 100},${f1(sq * 100) / 100}) translate(0,-880) translate(0,560) rotate(${f1(P.rot || 0)}) scale(${f1(scl * 100) / 100}) translate(0,-560)">` +
    `<g transform="translate(0,880) scale(${K}) translate(0,${f1(shift)})">${body}</g></g>` +
    '<!--CHAIR_F-->';
  return { svg, chair };
}
