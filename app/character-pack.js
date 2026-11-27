// Character packs: "make my own character from a reference image".
//
// The person copies the CHARACTER MAKER PROMPT (buildMakerPrompt) into any AI model, attaches a reference image, and the AI
// returns ONE .html file: a character pack. The pack holds a male and a female body, a wardrobe (outfits) and hairstyles, every
// piece drawn as SVG around its own pivot so the app's puppet can animate it (walk, talk, blink, gesture) in front, side and back view.
// The app imports the file (parsePackText), keeps it on the device (createStore), and scenes use it with
//   packCharacter('Mara', {gender:'female', outfit:'suit', hair:'bob', topc:'#7a5a8a'});  ...  {custom:'Mara', x:..., ground:...}
//
// Pure functions, no DOM (the only browser pieces, DOMParser and IndexedDB, are passed in or checked for).

import { fixDuplicateAttributes } from './svg-safe.js';

export const PACK_FORMAT = 'animato-character-pack';
export const PACK_VERSION = 1;
export const PACK_SCRIPT_ID = 'animato-character-pack';
export const MAKER_MARKER = 'ANIMATO CHARACTER MAKER';

/** The pieces a body supplies (the face), an outfit supplies (the clothes) and a hairstyle supplies (the hair). */
export const BODY_PARTS = ['head', 'headSide', 'headBack', 'mouthOpen', 'mouthOpenSide', 'eyesClosed', 'eyesClosedSide', 'pupil', 'pupilSide', 'browL', 'browR', 'browSide'];
/** The mouth shapes the face can show (lip sync + moods). Only `rest` is really needed; the app falls back to the nearest shape for the others. */
export const MOUTH_SHAPES = ['rest', 'smile', 'grin', 'smirk', 'frown', 'AI', 'E', 'O', 'U', 'MBP', 'FV', 'L', 'CONS'];
export const FACE_SLOT = '<g data-face="1"></g>';

/** Names the AI models use for the same mouth shapes (ah, ee, oh, oo, closed...). Everything is mapped to the 13 names above. */
const MOUTH_ALIAS = {
  rest: 'rest', neutral: 'rest', closed: 'rest', idle: 'rest', relaxed: 'rest', silent: 'rest', sil: 'rest', x: 'rest',
  smile: 'smile', happy: 'smile', grin: 'grin', bigsmile: 'grin', smirk: 'smirk', frown: 'frown', sad: 'frown',
  ai: 'AI', a: 'AI', ah: 'AI', aa: 'AI', aah: 'AI', ay: 'AI', e: 'E', ee: 'E', eh: 'E', ih: 'E', o: 'O', oh: 'O', ow: 'O', u: 'U', oo: 'U', uw: 'U', w: 'U', wq: 'U',
  mbp: 'MBP', bmp: 'MBP', mb: 'MBP', m: 'MBP', b: 'MBP', p: 'MBP', pressed: 'MBP', fv: 'FV', f: 'FV', v: 'FV',
  l: 'L', th: 'L', cons: 'CONS', consonant: 'CONS', consonants: 'CONS', t: 'CONS', d: 'CONS', s: 'CONS', k: 'CONS', cdgknrsthyz: 'CONS', etc: 'CONS',
};
/** "mouthAI", "viseme_AH", "Mouth-rest", "oh" ... -> one of MOUTH_SHAPES (unknown names are kept, cleaned). */
export function canonMouthKey(k) {
  const s = String(k == null ? '' : k).replace(/[^A-Za-z0-9]/g, '');
  const low = s.toLowerCase();
  const t = low.replace(/^(mouth|viseme|vis|lip)/, '') || low;
  return MOUTH_ALIAS[t] || MOUTH_ALIAS[low] || s.slice(0, 8);
}

/**
 * A complete, plain cartoon set of the 13 mouth shapes, each drawn around (0,0). It is the safety net: when the AI that made a pack
 * forgot the mouths (or drew only a few), the app draws these so the character still talks properly. Also printed in the maker
 * prompt as a starter the AI restyles to match the reference.  o: { width (of the mouth), line, lip, inner, tongue, teeth }
 */
export function defaultMouths(o = {}) {
  const w = cl(+o.width || 40, 14, 120), h = w / 2;
  const line = o.line || '@line', lip = o.lip || '#c4505a', inner = o.inner || '#5a1620', tongue = o.tongue || '#e8707a', teeth = o.teeth || '#ffffff';
  const sw = Math.round(cl(w * 0.075, 2, 5) * 10) / 10;
  const n = (v) => Math.round(v * 10) / 10;
  const q = (...a) => a.map((v) => n(v * h)).join(',');   // coordinates given in half-widths
  const st = (k = 1) => `stroke="${line}" stroke-width="${n(sw * k)}" stroke-linecap="round" stroke-linejoin="round"`;
  const stroke = (d, k = 1) => `<path d="${d}" fill="none" ${st(k)}/>`;
  const lipS = (d, k) => `<path d="${d}" fill="none" stroke="${lip}" stroke-width="${n(sw * k)}" stroke-linecap="round"/>`;
  const fillP = (d, c) => `<path d="${d}" fill="${c}"/>`;
  const closed = (d, k = 2.6) => lipS(d, k) + stroke(d, 0.9);
  // an open mouth: dark inside, then optional teeth and tongue, then the outline on top
  const open = (d, extra = '') => fillP(d, inner) + extra + `<path d="${d}" fill="none" ${st(1)}/>`;
  const band = (x, yTop, yBot, c = teeth) => fillP(`M${q(-x, -0.04)} Q${q(0, yTop)} ${q(x, -0.04)} L${q(x * 0.94, yBot * 0.7)} Q${q(0, yBot)} ${q(-x * 0.94, yBot * 0.7)} Z`, c);
  const tg = (d) => fillP(d, tongue);
  return {
    rest: closed(`M${q(-0.8, 0)} Q${q(0, 0.14)} ${q(0.8, 0)}`),
    smile: closed(`M${q(-0.9, -0.08)} Q${q(0, 0.75)} ${q(0.9, -0.08)}`, 2.4),
    grin: open(`M${q(-0.95, -0.1)} Q${q(0, 1.45)} ${q(0.95, -0.1)} Q${q(0, 0.14)} ${q(-0.95, -0.1)} Z`, band(0.82, 0.12, 0.34)),
    smirk: closed(`M${q(-0.8, 0.1)} Q${q(0, 0.28)} ${q(0.35, 0.06)} Q${q(0.7, -0.08)} ${q(0.9, -0.4)}`, 2.4),
    frown: closed(`M${q(-0.8, 0.3)} Q${q(0, -0.4)} ${q(0.8, 0.3)}`, 2.4),
    AI: open(`M${q(-0.85, -0.1)} Q${q(0, -0.24)} ${q(0.85, -0.1)} C${q(0.85, 0.5)} ${q(0.55, 1.2)} ${q(0, 1.2)} C${q(-0.55, 1.2)} ${q(-0.85, 0.5)} ${q(-0.85, -0.1)} Z`, band(0.62, -0.16, 0.26) + tg(`M${q(-0.42, 0.98)} Q${q(0, 0.5)} ${q(0.42, 0.98)} Q${q(0, 1.08)} ${q(-0.42, 0.98)} Z`)),
    E: open(`M${q(-1, -0.04)} Q${q(0, -0.28)} ${q(1, -0.04)} Q${q(0, 1.0)} ${q(-1, -0.04)} Z`, band(0.86, -0.2, 0.2)),
    O: open(`M${q(0, -0.34)} C${q(0.5, -0.34)} ${q(0.46, 0.92)} ${q(0, 0.92)} C${q(-0.46, 0.92)} ${q(-0.5, -0.34)} ${q(0, -0.34)} Z`, tg(`M${q(-0.22, 0.8)} Q${q(0, 0.5)} ${q(0.22, 0.8)} Q${q(0, 0.9)} ${q(-0.22, 0.8)} Z`)),
    U: lipS(`M${q(0, -0.18)} C${q(0.34, -0.18)} ${q(0.3, 0.6)} ${q(0, 0.6)} C${q(-0.3, 0.6)} ${q(-0.34, -0.18)} ${q(0, -0.18)} Z`, 2) + open(`M${q(0, -0.1)} C${q(0.22, -0.1)} ${q(0.2, 0.5)} ${q(0, 0.5)} C${q(-0.2, 0.5)} ${q(-0.22, -0.1)} ${q(0, -0.1)} Z`),
    MBP: closed(`M${q(-0.78, 0)} Q${q(0, 0.06)} ${q(0.78, 0)}`, 3.4),
    FV: open(`M${q(-0.85, -0.08)} Q${q(0, -0.22)} ${q(0.85, -0.08)} Q${q(0, 0.5)} ${q(-0.85, -0.08)} Z`, band(0.64, -0.14, 0.42) + lipS(`M${q(-0.6, 0.3)} Q${q(0, 0.64)} ${q(0.6, 0.3)}`, 2.6)),
    L: open(`M${q(-0.8, -0.1)} Q${q(0, -0.22)} ${q(0.8, -0.1)} C${q(0.7, 0.75)} ${q(-0.7, 0.75)} ${q(-0.8, -0.1)} Z`, band(0.6, -0.14, 0.2) + tg(`M${q(-0.4, 0.58)} Q${q(-0.3, 0.18)} ${q(0, 0.16)} Q${q(0.3, 0.18)} ${q(0.4, 0.58)} Z`)),
    CONS: open(`M${q(-0.8, -0.1)} Q${q(0, -0.2)} ${q(0.8, -0.1)} Q${q(0, 0.82)} ${q(-0.8, -0.1)} Z`, band(0.7, -0.12, 0.2)),
  };
}
/** The pack's own mouths, plus the standard ones for every shape it did not draw (only when it drew fewer than 9, or no "rest"). */
export function completeMouths(have, o) {
  const h = isObj(have) ? have : {};
  const names = Object.keys(h);
  if (names.length >= 9 && names.some((k) => k.toLowerCase() === 'rest')) return h;
  const d = defaultMouths(o), out = { ...h };
  for (const k of MOUTH_SHAPES) if (!names.some((x) => x.toLowerCase() === k.toLowerCase())) out[k] = d[k];
  return out;
}
const mixHex = (a, b, k) => { const x = normHex(a, '#d9a679'), y = normHex(b, '#b8323c'), f = (i) => cl(Math.round(parseInt(x.slice(i, i + 2), 16) * (1 - k) + parseInt(y.slice(i, i + 2), 16) * k), 0, 255).toString(16).padStart(2, '0'); return '#' + f(1) + f(3) + f(5); };
export const OUTFIT_PARTS = ['torso', 'torsoSide', 'torsoBack', 'upperArm', 'foreArm', 'upperLeg', 'lowerLeg', 'lowerLegSide'];
export const HAIR_PARTS = ['back', 'front', 'side', 'sideBack', 'rear'];
export const REQUIRED_BODY = ['head', 'eyesClosed'];
export const REQUIRED_OUTFIT = ['torso', 'upperArm', 'foreArm', 'upperLeg', 'lowerLeg'];
export const DEFAULT_RIG = { upperLeg: 150, lowerLeg: 150, torso: 190, shoulderX: 58, shoulderDown: 25, hipX: 32, upperArm: 105, foreArm: 100 };
export const DEFAULT_COLORS = ['#3b82f6', '#1e3a8a', '#f5b700', '#e2eafc'];
export const LIMITS = { piece: 40000, total: 2400000, outfits: 24, hairs: 24, name: 40, id: 32 };

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const NAMED = { black: '#1c1c21', white: '#f3f3f1', red: '#c0392b', blue: '#2e62b4', navy: '#1f2c4c', green: '#2f7d4f', yellow: '#e8c33a', orange: '#df7a2e', pink: '#e27aa3', purple: '#6a43a6', brown: '#6b4a33', gray: '#7a7f88', grey: '#7a7f88', teal: '#1d8583', beige: '#d9c3a0', tan: '#c9a77c', gold: '#c9a13b', silver: '#b8bcc4' };
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function normHex(c, fallback = '') {
  const s = String(c == null ? '' : c).trim().toLowerCase();
  if (HEX.test(s)) return s.length === 4 ? '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3] : s;
  if (NAMED[s]) return NAMED[s];
  return fallback;
}
export function shadeHex(hex, k) {
  const h = normHex(hex, '#888888');
  const f = (i) => cl(Math.round(parseInt(h.slice(i, i + 2), 16) * k), 0, 255).toString(16).padStart(2, '0');
  return '#' + f(1) + f(3) + f(5);
}
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
const slug = (s, n = LIMITS.id) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n);

/* ---------- safe SVG pieces ---------- */

/**
 * AI models often leave an SVG piece slightly broken: a closing tag with nothing to close (`...</g>`), a tag that is never closed,
 * the same attribute twice, a bare `&`, or a last tag that was cut off. The browser reads SVG as strict XML and refuses the WHOLE
 * piece ("Opening and ending tag mismatch"). This puts it right: orphan closing tags are dropped, unclosed tags are closed in
 * the right order, repeated attributes keep their first copy, a bare & becomes &amp;, and a cut-off last tag is removed.
 * A piece that is already well formed comes back unchanged.
 */
export function repairFragment(svg) {
  if (typeof svg !== 'string' || !svg) return svg || '';
  let x = svg.replace(/<(?![A-Za-z\/!?])/g, '&lt;');
  x = x.replace(/&(?!(?:#\d+|#x[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);)/g, '&amp;');
  x = x.replace(/<[A-Za-z\/][^<>]*$/, '');                         // a last tag that was cut off
  x = fixDuplicateAttributes(x);
  const TAG = /<!--[\s\S]*?-->|<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;
  const stack = [];
  let out = '';
  let last = 0;
  let m;
  while ((m = TAG.exec(x))) {
    out += x.slice(last, m.index);
    last = TAG.lastIndex;
    if (m[0].startsWith('<!--')) { out += m[0]; continue; }
    const [whole, close, name, , self] = m;
    if (!close) { out += whole; if (!self) stack.push(name); continue; }
    const at = stack.lastIndexOf(name);
    if (at < 0) continue;                                              // nothing to close: drop it
    while (stack.length - 1 > at) out += '</' + stack.pop() + '>';     // close what was left open inside it
    stack.pop();
    out += whole;
  }
  out += x.slice(last);
  while (stack.length) out += '</' + stack.pop() + '>';
  return out;
}

/** One drawn piece: SVG shapes only. Scripts, images, styles, links, animation tags and outside references are removed. */
export function cleanPiece(svg) {
  if (typeof svg !== 'string' || !svg.trim()) return '';
  let x = svg.slice(0, LIMITS.piece);
  x = x.replace(/<\s*(script|foreignObject|iframe|style|object|embed)\b[\s\S]*?(<\/\s*\1\s*>|$)/gi, '');
  x = x.replace(/<\s*image\b[^>]*>(\s*<\/\s*image\s*>)?/gi, '');
  x = x.replace(/<\s*\/?\s*(svg|use|animate\w*|set|a|html|body)\b[^>]*>/gi, '');
  x = x.replace(/\son\w+\s*=/gi, ' data-x=');
  // links: only a link to a shape in the SAME piece ("#gradient2", how one gradient borrows the colours of another) is kept; every other link is switched off
  x = x.replace(/(?:xlink:)?href\s*=\s*(["'])(?!#)/gi, 'data-h=$1').replace(/(?:xlink:)?href\s*=\s*(?!["'])/gi, 'data-h=').replace(/xlink:href\s*=/gi, 'href=');
  // url("#id") and url('#id') are the same as url(#id)
  x = x.replace(/url\(\s*(?:&quot;|["'])?\s*#([^)"'&\s]+)\s*(?:&quot;|["'])?\s*\)/gi, 'url(#$1)');
  x = x.replace(/url\(\s*(?!#)[^)]*\)/gi, 'none');
  x = repairFragment(x);
  return x.trim();
}

/**
 * Makes sure nothing is painted with a colour that does not exist. A face drawn with fill="url(#skin)" whose gradient has no colour stops
 * (or whose gradient is missing) is INVISIBLE: the browser paints nothing, and the head looks transparent. Every such fill / stroke is
 * replaced with a plain colour, and gradient links that an older import switched off (data-h) are switched back on.
 *   svg       one piece (colour tokens already filled in)
 *   fill      the colour to use instead of a broken fill (the skin for a face, the hair colour for hair...)
 *   stroke    the colour to use instead of a broken stroke
 *   ctx       other drawings that belong to the same piece (a gradient may be defined in the head and used by the hair on it)
 */
export function repairPaints(svg, fill = '#d9a679', stroke = '#1a1a1a', ctx = '') {
  if (typeof svg !== 'string' || !svg) return svg || '';
  if (svg.indexOf('url(') < 0 && svg.indexOf('data-h') < 0) return svg;
  const fixLinks = (t) => t.replace(/<(linearGradient|radialGradient|pattern)\b[^>]*>/gi, (tag) => tag.replace(/(?:xlink:)?data-h(\s*=\s*["']#)/i, 'href$1'));
  let x = fixLinks(svg);
  const all = x + fixLinks(String(ctx || ''));
  const ids = new Set(), grads = new Map();
  for (const m of all.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) ids.add(m[1]);
  for (const m of all.matchAll(/<(linearGradient|radialGradient)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1\s*>)/gi)) {
    const id = /\bid\s*=\s*["']([^"']+)["']/i.exec(m[2]), ln = /\bhref\s*=\s*["']#([^"']+)["']/i.exec(m[2]);
    if (id) grads.set(id[1], { stops: /<stop\b/i.test(m[4] || ''), link: ln ? ln[1] : '' });
  }
  const ok = (id, depth = 0) => {
    if (!ids.has(id)) return false;
    const g = grads.get(id);
    if (!g) return true;                       // a pattern, clip, mask, filter or marker: exists, so it is fine
    if (g.stops) return true;
    return depth < 6 && g.link ? ok(g.link, depth + 1) : false;
  };
  x = x.replace(/\b(fill|stroke)(\s*=\s*)(["'])url\(#([^)]+)\)\3/gi, (m, prop, eq, q, id) => (ok(id) ? m : prop + eq + q + (/^fill$/i.test(prop) ? fill : stroke) + q));
  x = x.replace(/\b(fill|stroke)(\s*:\s*)url\(#([^)]+)\)/gi, (m, prop, col, id) => (ok(id) ? m : prop + col + (/^fill$/i.test(prop) ? fill : stroke)));
  x = x.replace(/\b(clip-path|mask|filter)(\s*=\s*)(["'])url\(#([^)]+)\)\3/gi, (m, prop, eq, q, id) => (ids.has(id) ? m : prop + eq + q + 'none' + q));
  return x;
}

/** Optional check (browser): the fragment must be well-formed XML. Pass `new DOMParser()`. Returns '' when fine, else a short message. */
export function xmlProblem(fragment, parser) {
  if (!parser || !fragment) return '';
  try {
    const d = parser.parseFromString('<svg xmlns="http://www.w3.org/2000/svg">' + fragment.replace(/@(?=[a-z])/gi, '') + '</svg>', 'image/svg+xml');
    const e = d.getElementsByTagName('parsererror')[0];
    return e ? String(e.textContent || 'broken SVG').split('\n')[0].slice(0, 160) : '';
  } catch (e) { return ''; }
}

function cleanParts(src, keys, bag, where) {
  const out = {};
  if (!isObj(src)) return out;
  for (const k of keys) {
    const v = cleanPiece(src[k]);
    if (v) out[k] = v;
  }
  bag.size += Object.values(out).reduce((a, s) => a + s.length, 0);
  return out;
}

function cleanRig(r, base) {
  const out = { ...base };
  if (isObj(r)) for (const k of Object.keys(DEFAULT_RIG)) { const v = +r[k]; if (Number.isFinite(v) && v >= 5 && v <= 600) out[k] = v; }
  return out;
}
const colorList = (a) => (Array.isArray(a) ? a.map((c) => normHex(c)).filter(Boolean).slice(0, 4) : []);


const pt2 = (v) => (Array.isArray(v) && Number.isFinite(+v[0]) && Number.isFinite(+v[1]) ? [cl(+v[0], -400, 400), cl(+v[1], -400, 400)] : null);
function cleanMouths(src, bag) {
  const out = {};
  if (!isObj(src)) return out;
  for (const k of Object.keys(src).slice(0, 40)) {
    const key = canonMouthKey(k);
    if (!key || out[key]) continue;
    const v = cleanPiece(src[k]);
    if (v) { out[key] = v; bag.size += v.length; }
  }
  return out;
}
/** The mouth set of a body. Models put it in "mouths", but also in "visemes", "face.mouths", "parts.mouths" or as loose "mouthAI"... keys. */
function collectMouths(b, side, bag) {
  const out = {};
  const add = (src) => { const m = cleanMouths(src, bag); for (const k of Object.keys(m)) if (!out[k]) out[k] = m[k]; };
  const p = isObj(b.parts) ? b.parts : null, f = isObj(b.face) ? b.face : null;
  if (side) { add(b.mouthsSide); add(b.visemesSide); if (f) add(f.mouthsSide); if (p) add(p.mouthsSide); return out; }
  add(b.mouths); add(b.visemes); add(b.mouthShapes); if (f) add(f.mouths); if (p) add(p.mouths);
  for (const src of [p, b]) {
    if (!src) continue;
    const loose = {};
    for (const k of Object.keys(src)) if (/^(mouth|viseme)[_ -]?[A-Za-z0-9]+$/i.test(k) && !/^mouth(open|opens|s|side|sides|width|shapes)?(side)?$/i.test(k) && !/side$/i.test(k) && typeof src[k] === 'string') loose[k] = src[k];
    add(loose);
  }
  return out;
}
function cleanFacePoints(b) {
  const e = isObj(b.eyes) ? b.eyes : {}, w = isObj(b.brows) ? b.brows : {};
  const rg = Array.isArray(e.range) && Number.isFinite(+e.range[0]) && Number.isFinite(+e.range[1]) ? [cl(+e.range[0], 0, 40), cl(+e.range[1], 0, 40)] : [5, 3.5];
  return { eyes: { l: pt2(e.l), r: pt2(e.r), side: pt2(e.side), range: rg }, brows: { l: pt2(w.l), r: pt2(w.r), side: pt2(w.side) }, mouthSide: pt2(b.mouthSide) };
}
/**
 * Turns whatever the AI wrote into a safe, normalised pack. Never throws.
 * Returns { ok, pack, errors, warnings }: ok means the pack can be used (it has at least one complete person).
 */
export function sanitizePack(raw, opts = {}) {
  const errors = [], warnings = [];
  const bag = { size: 0 };
  if (!isObj(raw)) return { ok: false, pack: null, errors: ['The file does not hold a character pack.'], warnings };
  if (raw.format && raw.format !== PACK_FORMAT) warnings.push('The file says it is a "' + String(raw.format).slice(0, 30) + '" file, not an ' + PACK_FORMAT + ' file. Tried to read it anyway.');
  const name = String(raw.name || raw.title || 'My character').replace(/[<>&"]/g, '').trim().slice(0, LIMITS.name) || 'My character';
  const id = slug(raw.id || name) || 'my-character';
  const d = isObj(raw.defaults) ? raw.defaults : {};
  const defaults = {
    lip: normHex(d.lip, ''), skin: normHex(d.skin, '#d9a679'), line: normHex(d.line || d.outline, '#1a1a1a'), eye: normHex(d.eye, '#2b1a10'), hair: normHex(d.hair, '#1b1b1b'),
    colors: colorList(d.colors),
  };
  while (defaults.colors.length < 4) defaults.colors.push(DEFAULT_COLORS[defaults.colors.length]);
  const rig = cleanRig(raw.rig, DEFAULT_RIG);
  const size = cl(+raw.size || 1.1, 0.5, 2);

  const bodies = {};
  for (const g of ['male', 'female']) {
    const b = isObj(raw.bodies) ? raw.bodies[g] : null;
    if (!isObj(b)) continue;
    const parts = cleanParts(b.parts || b, BODY_PARTS, bag);
    const mouths = collectMouths(b, false, bag), mouthsSide = collectMouths(b, true, bag);
    const miss = REQUIRED_BODY.filter((k) => !parts[k]);
    if (miss.length) { errors.push('The ' + g + ' body is missing: ' + miss.join(', ') + '.'); continue; }
    const m = Array.isArray(b.mouth) && Number.isFinite(+b.mouth[0]) && Number.isFinite(+b.mouth[1]) ? [+b.mouth[0], +b.mouth[1]] : [0, -60];
    const fp = cleanFacePoints(b);
    if (!parts.pupil || !fp.eyes.l || !fp.eyes.r) warnings.push('The ' + g + ' body has no moving pupils (pupil + eyes.l / eyes.r): the eyes will not look around.');
    if (!parts.browL || !fp.brows.l || !fp.brows.r) warnings.push('The ' + g + ' body has no moving eyebrows (browL + brows.l / brows.r): the brows will not show feelings.');
    if (!Object.keys(mouths).length && !parts.mouthOpen) warnings.push('The ' + g + ' body has NO mouth shapes (the AI forgot the "mouths"). The app will draw its own standard mouths so the character still talks, but they will not copy your reference lips. Ask the AI to add the 13 "mouths".');
    else if (!mouths.rest || Object.keys(mouths).length < 6) warnings.push('The ' + g + ' body has fewer than 6 mouth shapes: the app adds its standard mouths for the missing ones, but lip sync is best with all 13.');
    else if (Object.keys(mouths).length < 13) warnings.push('The ' + g + ' body has ' + Object.keys(mouths).length + ' of the 13 mouth shapes (missing: ' + MOUTH_SHAPES.filter((m) => !Object.keys(mouths).some((x) => x.toLowerCase() === m.toLowerCase())).join(', ') + ').');
    bodies[g] = { rig: cleanRig(b.rig, rig), size: cl(+b.size || size, 0.5, 2), mouth: m, mouthSide: fp.mouthSide, mouthWidth: cl(+b.mouthWidth || 0, 0, 120), eyes: fp.eyes, brows: fp.brows, mouths, mouthsSide, skin: normHex(b.skin, ''), parts };
  }
  const extraOnly = !isObj(raw.bodies) && (Array.isArray(raw.outfits) || Array.isArray(raw.hairs));
  if (!Object.keys(bodies).length && !errors.length && !extraOnly) errors.push('The pack has no male or female body.');

  const outfits = [];
  for (const o of (Array.isArray(raw.outfits) ? raw.outfits : []).slice(0, LIMITS.outfits)) {
    if (!isObj(o)) continue;
    const oid = slug(o.id || o.label || 'outfit' + (outfits.length + 1)) || 'outfit' + (outfits.length + 1);
    const g = /^(male|female)$/.test(o.gender) ? o.gender : 'any';
    const parts = cleanParts(o.parts || o, OUTFIT_PARTS, bag);
    const miss = REQUIRED_OUTFIT.filter((k) => !parts[k]);
    if (miss.length) { warnings.push('Outfit "' + oid + '" skipped: it is missing ' + miss.join(', ') + '.'); continue; }
    if (outfits.some((x) => x.id === oid && x.gender === g)) continue;
    outfits.push({ id: oid, label: String(o.label || oid).replace(/[<>&"]/g, '').slice(0, 40), gender: g, colors: colorList(o.colors), parts });
  }
  const hairs = [];
  for (const h of (Array.isArray(raw.hairs) ? raw.hairs : []).slice(0, LIMITS.hairs)) {
    if (!isObj(h)) continue;
    const hid = slug(h.id || h.label || 'hair' + (hairs.length + 1)) || 'hair' + (hairs.length + 1);
    const g = /^(male|female)$/.test(h.gender) ? h.gender : 'any';
    const parts = cleanParts(h.parts || h, HAIR_PARTS, bag);
    if (hairs.some((x) => x.id === hid && x.gender === g)) continue;
    hairs.push({ id: hid, label: String(h.label || hid).replace(/[<>&"]/g, '').slice(0, 40), gender: g, color: normHex(h.color, ''), parts });
  }
  if (bag.size > LIMITS.total) errors.push('The pack is too big (' + Math.round(bag.size / 1000) + ' KB of drawing). Ask the AI for a smaller one.');
  for (const g of Object.keys(bodies)) {
    if (!outfits.some((o) => o.gender === g || o.gender === 'any')) errors.push('There is no complete outfit for the ' + g + ' body.');
  }
  if (extraOnly && !outfits.length && !hairs.length) errors.push('The file has no complete outfit or hairstyle in it.');
  if (!extraOnly && !bodies.male) warnings.push('There is no male body: male characters will use the female body.');
  if (!extraOnly && !bodies.female) warnings.push('There is no female body: female characters will use the male body.');
  for (const g of Object.keys(bodies)) {
    const n = outfits.filter((o) => o.gender === g || o.gender === 'any').length;
    if (n === 1) warnings.push('The ' + g + ' body has only one outfit, so every ' + g + ' will dress the same.');
  }
  if (!hairs.length) warnings.push('There are no hairstyles: the heads are drawn as given.');
  const pack = { format: PACK_FORMAT, version: PACK_VERSION, id, name, notes: String(raw.notes || '').slice(0, 400), defaults, rig, size, bodies, outfits, hairs };
  if (extraOnly) pack.extra = true;
  if (opts.parser) {
    const check = (label, s) => { const p = xmlProblem(s, opts.parser); if (p) errors.push(label + ': ' + p); };
    for (const g of Object.keys(bodies)) {
      for (const [k, v] of Object.entries(bodies[g].parts)) check(g + ' ' + k, v);
      /* a mouth that is still unreadable is left out (the app draws its own standard mouth for it): the character is never refused because of one mouth */
      for (const set of [bodies[g].mouths, bodies[g].mouthsSide]) {
        for (const [k, v] of Object.entries(set)) {
          if (xmlProblem(v, opts.parser)) { delete set[k]; warnings.push('The ' + g + ' mouth ' + k + ' was broken, so the app uses its own standard ' + k + ' mouth.'); }
        }
      }
    }
    for (const o of outfits) for (const [k, v] of Object.entries(o.parts)) check('outfit ' + o.id + ' ' + k, v);
    for (const h of hairs) for (const [k, v] of Object.entries(h.parts)) check('hair ' + h.id + ' ' + k, v);
  }
  return { ok: !errors.length && (!!Object.keys(bodies).length || extraOnly), pack: errors.length ? null : pack, errors, warnings };
}

/** Reads a pack out of an .html file (the JSON script inside it), a plain .json file, or text with a ```json block. */
export function parsePackText(text, opts = {}) {
  const src = String(text == null ? '' : text);
  if (!src.trim()) return { ok: false, pack: null, errors: ['The file is empty.'], warnings: [] };
  const cands = [];
  const re = new RegExp('<script[^>]*type\\s*=\\s*["\']application/json["\'][^>]*>([\\s\\S]*?)<\\/script>', 'gi');
  let m;
  while ((m = re.exec(src))) cands.push(m[1]);
  const byId = new RegExp('<script[^>]*id\\s*=\\s*["\']' + PACK_SCRIPT_ID + '["\'][^>]*>([\\s\\S]*?)<\\/script>', 'i').exec(src);
  if (byId) cands.unshift(byId[1]);
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(src);
  if (fence) cands.push(fence[1]);
  if (/^\s*[{[]/.test(src)) cands.push(src);
  const at = src.indexOf('"format"');
  if (at >= 0) { const s = src.lastIndexOf('{', at); if (s >= 0) cands.push(src.slice(s)); }
  let lastErr = '';
  for (const c of cands) {
    let t = c.trim();
    if (!t) continue;
    for (const attempt of [t, t.replace(/,\s*([}\]])/g, '$1'), t.slice(0, t.lastIndexOf('}') + 1)]) {
      try {
        const j = JSON.parse(attempt);
        if (isObj(j) && (j.bodies || j.outfits || j.format === PACK_FORMAT)) return sanitizePack(j, opts);
      } catch (e) { lastErr = e && e.message ? String(e.message).slice(0, 120) : 'bad JSON'; }
    }
  }
  return { ok: false, pack: null, errors: [lastErr ? 'The character data inside the file is broken (' + lastErr + '). Ask the AI to send the file again.' : 'No character pack was found in this file. Use the file the AI made from the character maker prompt.'], warnings: [] };
}

/** Adds the outfits and hairstyles of `more` to `base` (same id): lets the AI send a second file with extra clothes. */
export function mergePacks(base, more) {
  if (!base) return more;
  if (!more) return base;
  const out = JSON.parse(JSON.stringify(base));
  delete out.extra;
  for (const g of Object.keys(more.bodies)) if (!out.bodies[g]) out.bodies[g] = more.bodies[g];
  for (const o of more.outfits) if (!out.outfits.some((x) => x.id === o.id && x.gender === o.gender)) out.outfits.push(o);
  for (const h of more.hairs) if (!out.hairs.some((x) => x.id === h.id && x.gender === h.gender)) out.hairs.push(h);
  out.outfits = out.outfits.slice(0, LIMITS.outfits);
  out.hairs = out.hairs.slice(0, LIMITS.hairs);
  return out;
}

/* ---------- putting a person together ---------- */

const TOKENS = /@(skinShade|skin|hairShade|hair|eye|line|c[1-4])\b/g;
const find = (list, want, gender) => {
  const w = slug(want);
  if (!w) return null;
  const ok = (x) => x.gender === gender || x.gender === 'any';
  return list.find((x) => ok(x) && (x.id === w || slug(x.label) === w)) || list.find((x) => x.id === w || slug(x.label) === w) || list.find((x) => ok(x) && (x.id.includes(w) || w.includes(x.id))) || null;
};

/**
 * One person from the pack: the body for the gender, an outfit, a hairstyle, and the colours.
 * look: { gender, outfit, hair, skin, hairc, eyec, topc, bottomc, accentc, shoec, colors, height }
 * Whatever the look leaves out is chosen from `seed` (the person's name), so a cast gets different clothes and hair.
 * Returns the definition regCustom() takes: { rig, size, mouth, skin, outline, color, parts }.
 */
export function composeLook(pack, look = {}, seed = '') {
  const L = isObj(look) ? look : {};
  const has = (g) => !!pack.bodies[g];
  let gender = /^(f|w|girl|lady|female|woman)/i.test(String(L.gender || '')) ? 'female' : /^(m|b|boy|man|male|guy)/i.test(String(L.gender || '')) ? 'male' : '';
  if (!gender) { const avail = ['male', 'female'].filter(has); gender = avail[hash(seed + '|g') % Math.max(1, avail.length)] || 'male'; }
  const bodyG = has(gender) ? gender : has('male') ? 'male' : 'female';
  const body = pack.bodies[bodyG];
  const pickFrom = (list, tag) => { const pool = list.filter((x) => x.gender === gender || x.gender === 'any'); const use = pool.length ? pool : list; return use.length ? use[hash(seed + '|' + tag) % use.length] : null; };
  const outfit = find(pack.outfits, L.outfit, gender) || pickFrom(pack.outfits, 'o');
  const wantHair = String(L.hair == null ? '' : L.hair);
  const noHair = /^(none|shaved|no)$/i.test(wantHair) || (/^bald$/i.test(wantHair) && !find(pack.hairs, wantHair, gender));
  const hair = noHair ? null : (find(pack.hairs, L.hair, gender) || pickFrom(pack.hairs, 'h'));
  const hp = (hair && hair.parts) || {};
  const skin = normHex(L.skin, body.skin || pack.defaults.skin);
  const hairc = normHex(L.hairc || L.hairColor, (hair && hair.color) || pack.defaults.hair);
  const oc = (outfit && outfit.colors && outfit.colors.length ? outfit.colors : pack.defaults.colors).concat(pack.defaults.colors);
  const lc = Array.isArray(L.colors) ? L.colors : [];
  const c = [normHex(L.topc || lc[0], oc[0]), normHex(L.bottomc || lc[1], oc[1]), normHex(L.accentc || lc[2], oc[2]), normHex(L.shoec || lc[3], oc[3])];
  const map = { skin, skinShade: shadeHex(skin, 0.84), hair: hairc, hairShade: shadeHex(hairc, 0.72), eye: normHex(L.eyec || L.eyeColor, pack.defaults.eye), line: pack.defaults.line, c1: c[0], c2: c[1], c3: c[2], c4: c[3] };
  const fill = (s) => (s ? s.replace(TOKENS, (m0, k) => map[k]) : '');
  // every piece is also repaired so no fill points at a gradient that has no colours (that is a transparent face or body)
  const fx = (s, fb, ctx) => repairPaints(fill(s), fb, map.line, ctx ? fill(ctx) : '');
  const bp = body.parts, op = (outfit && outfit.parts) || {};
  // layers: hair that falls behind the person (back, sideBack) is its own piece, drawn BEHIND the neck, shoulders and body
  const sideBehind = hp.sideBack || '';
  const ctxFront = (bp.head || '') + (hp.front || ''), ctxSide = (bp.headSide || '') + (hp.side || hp.front || ''), ctxRear = (bp.headBack || '') + (hp.rear || '');
  const parts = {
    headBehind: fx(hp.back || '', hairc),
    headBehindSide: fx(sideBehind, hairc),
    head: fx(bp.head, skin, ctxFront) + FACE_SLOT + fx(hp.front || '', hairc, ctxFront),
    headSide: bp.headSide ? fx(bp.headSide, skin, ctxSide) + FACE_SLOT + fx(hp.side || hp.front || '', hairc, ctxSide) : '',
    headBack: bp.headBack ? fx(bp.headBack, skin, ctxRear) + fx(hp.rear || '', hairc, ctxRear) : '',
    mouthOpen: fx(bp.mouthOpen, '#6b1824'), mouthOpenSide: fx(bp.mouthOpenSide, '#6b1824'), eyesClosed: fx(bp.eyesClosed, skin), eyesClosedSide: fx(bp.eyesClosedSide, skin),
  };
  const OUT_FB = { torso: c[0], torsoSide: c[0], torsoBack: c[0], upperArm: c[0], foreArm: skin, upperLeg: c[1], lowerLeg: c[1], lowerLegSide: c[1] };
  for (const k of OUTFIT_PARTS) parts[k] = fx(op[k], OUT_FB[k] || c[0]);
  // the moving face: pupils, eyebrows and the set of mouth shapes (drawn by faceMarkup at the FACE_SLOT of the head)
  const fm = (o, fb = '#c4505a') => { const r = {}; for (const k of Object.keys(o || {})) r[k] = fx(o[k], fb); return r; };
  // the mouths: the pack's own set, completed with the app's standard mouths where the AI drew none or only a few (old saved packs too).
  // A pack that uses the old single "mouthOpen" piece keeps it and gets no moving mouths.
  const lipFb = pack.defaults.lip || mixHex(skin, '#b8323c', 0.55);
  let mouths = body.mouths || {}, mouthsSide = body.mouthsSide || {}, mouthSide = body.mouthSide || null;
  const noneDrawn = !Object.keys(mouths).length;
  if (!(noneDrawn && bp.mouthOpen)) {
    const my = body.mouth && Number.isFinite(+body.mouth[1]) ? +body.mouth[1] : -60;
    const lip = pack.defaults.lip || mixHex(skin, '#b8323c', 0.55);
    mouths = completeMouths(mouths, { width: body.mouthWidth || 40, line: '@line', lip, inner: mixHex('#2a0a10', lip, 0.18) });
    if (noneDrawn && !Object.keys(mouthsSide).length) {
      // no mouths at all: the profile gets the same set, narrowed, at the front of the face
      const half = completeMouths({}, { width: (body.mouthWidth || 40) * 0.55, line: '@line', lip, inner: mixHex('#2a0a10', lip, 0.18) });
      mouthsSide = half; mouthSide = mouthSide || [38, my];
    }
  }
  const face = (bp.pupil || bp.browL || Object.keys(mouths).length) ? {
    pupil: fx(bp.pupil, map.eye), pupilSide: fx(bp.pupilSide, map.eye), browL: fx(bp.browL, hairc), browR: fx(bp.browR, hairc), browSide: fx(bp.browSide, hairc),
    mouths: fm(mouths, lipFb), mouthsSide: fm(mouthsSide, lipFb), eyes: body.eyes || null, brows: body.brows || null, mouth: body.mouth, mouthSide,
  } : null;
  const hgt = cl(+L.height || 1, 0.75, 1.25);
  return { rig: body.rig, size: cl(body.size * hgt, 0.5, 2), mouth: body.mouth, face, skin, outline: map.line, color: c[0], parts, _info: { gender, bodyGender: bodyG, outfit: outfit && outfit.id, hair: hair ? hair.id : 'none' } };
}

/** Short summary for the screen and for the AI prompt. */
export function describePack(pack) {
  const ids = (list, g) => list.filter((x) => x.gender === g || x.gender === 'any').map((x) => x.id);
  return {
    id: pack.id, name: pack.name,
    genders: Object.keys(pack.bodies),
    outfits: { male: ids(pack.outfits, 'male'), female: ids(pack.outfits, 'female') },
    hairs: { male: ids(pack.hairs, 'male'), female: ids(pack.hairs, 'female') },
  };
}

/** What the scene prompt says when the person's saved characters are installed in the app. */
export function packCastGuide(packs) {
  const list = (Array.isArray(packs) ? packs : []).filter(Boolean);
  if (!list.length) return '';
  const rows = list.map((p) => {
    const d = describePack(p);
    return `- pack "${d.id}" (${d.name}): male outfits [${d.outfits.male.join(', ')}], female outfits [${d.outfits.female.join(', ')}]; male hair [${d.hairs.male.join(', ')}], female hair [${d.hairs.female.join(', ')}]`;
  }).join('\n');
  return `MY SAVED CHARACTERS ARE ALREADY INSTALLED IN THE APP (character pack). Do NOT draw people yourself and do NOT write customCharacter(...). Create every person (heroes, bosses, passers-by, crowd members) with packCharacter near the top of the file, then place them with {custom:'Name', ...}:
packCharacter('Mara', {gender:'female', outfit:'<outfit id>', hair:'<hair id>', skin:'#b97c52', hairc:'#2b1b14', topc:'#7a5a8a', bottomc:'#1f2937', accentc:'#f5b700', shoec:'#222222', height:1});
${rows}
- Every field is optional. Choose them for the story (a nurse, a CEO, a street seller...): a different outfit id, hair id and colours for every person, so no two people look alike. Fields you leave out are picked automatically and differently for each name.
- Add pack:'<pack id>' to use a pack other than the first one. Crowds: write several packCharacter people with different looks and place them small and far (do not use crowd(), it draws the built-in people).
- Write movie({title:'...', aspect:'16:9', character:'custom'}) and give every person {custom:'Name'} in every scene (and the thumbnail). Front, side and back views, talking mouths, blinking, walking and all acting commands work on these people exactly as on the built-in ones.
- Everything else (sets, props, objects, effects, camera, captions) you still design freely.`;
}

/* ---------- keeping packs on the device ---------- */

const DB = 'animato-char-packs', STORE = 'packs', LS_KEY = 'stk_char_packs';

/** A tiny store: IndexedDB when the browser has it, localStorage otherwise, memory as the last resort. */
export function createStore(env = {}) {
  const idb = env.indexedDB !== undefined ? env.indexedDB : (typeof indexedDB !== 'undefined' ? indexedDB : null);
  const ls = env.localStorage !== undefined ? env.localStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
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
  const lsRead = () => { try { const j = JSON.parse(ls.getItem(LS_KEY) || '[]'); return Array.isArray(j) ? j : []; } catch (e) { return []; } };
  const lsWrite = (a) => { try { ls.setItem(LS_KEY, JSON.stringify(a)); return true; } catch (e) { return false; } };
  const tx = (mode, fn) => open().then((d) => new Promise((res) => {
    if (!d) return res(undefined);
    try { const t = d.transaction(STORE, mode); const r = fn(t.objectStore(STORE)); t.oncomplete = () => res(r && r.result !== undefined ? r.result : true); t.onerror = () => res(undefined); t.onabort = () => res(undefined); } catch (e) { res(undefined); }
  }));
  return {
    async all() {
      const d = await open();
      let list = null;
      if (d) list = await new Promise((res) => { try { const r = d.transaction(STORE, 'readonly').objectStore(STORE).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res(null); } catch (e) { res(null); } });
      if (!list && ls) list = lsRead();
      if (!list) list = [...mem.values()];
      return list;
    },
    async put(pack) {
      mem.set(pack.id, pack);
      if (await tx('readwrite', (s) => s.put(pack))) return true;
      if (ls) { const a = lsRead().filter((p) => p.id !== pack.id); a.push(pack); return lsWrite(a); }
      return true;
    },
    async remove(id) {
      mem.delete(id);
      await tx('readwrite', (s) => s.delete(id));
      if (ls) lsWrite(lsRead().filter((p) => p.id !== id));
      return true;
    },
  };
}


/**
 * Draws the MOVING part of the face: pupils that look around, eyebrows that show the feeling, and one mouth shape.
 * Pure and self-contained (no outside names) so the same source also runs inside the pack's own viewer.
 *   F     the face of a composed person (composeLook().face)
 *   S     { gx, gy: where the eyes look (-1..1), tilt: +1 worried ... -1 angry, raise: brows up/down (-.8..1.2), eye: eye openness,
 *           yaw, pitch: head turn, mouth: a mouth name (rest smile grin smirk frown flat open AI E O U MBP FV L CONS), open: 0..1 jaw while talking,
 *           mouth2 + mix: the next shape and how far the mouth is on the way to it (0..1), wide: -1 (round) .. 1 (stretched) }
 *   view  'front' | 'side' | 'back'
 * Returns { svg, mouth, pupil, brow }: which parts it actually drew (so the caller knows to skip the old overlays).
 */
export function faceMarkup(F, S, view) {
  var o = { svg: '', mouth: false, pupil: false, brow: false };
  if (!F || view === 'back') return o;
  S = S || {};
  var side = view === 'side', out = '';
  var cl = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var nm = function (v, d) { v = +v; return isFinite(v) ? v : d; };
  var r = function (v) { return Math.round(v * 100) / 100; };
  var yaw = cl(nm(S.yaw, 0), -1, 1), pit = cl(nm(S.pitch, 0), -1, 1);
  var E = F.eyes || {}, B = F.brows || {};
  var P = side ? F.pupilSide : F.pupil;
  if (P) {
    var rg = E.range || [5, 3.5];
    var gx = cl(nm(S.gx, 0) + (side ? 0 : yaw * 0.6), -1, 1), gy = cl(nm(S.gy, 0) + pit * 0.6, -1, 1);
    var spots = side ? [E.side] : [E.l, E.r];
    for (var i = 0; i < spots.length; i++) if (spots[i]) { out += '<g transform="translate(' + r(spots[i][0] + gx * rg[0]) + ',' + r(spots[i][1] + gy * rg[1]) + ')">' + P + '</g>'; o.pupil = true; }
  }
  var bl = side ? F.browSide : F.browL;
  if (bl) {
    var ti = cl(nm(S.tilt, 0), -1.4, 1.4), up = -cl(nm(S.raise, 0), -0.8, 1.2) * 14 + (1 - cl(nm(S.eye, 1), 0.15, 1.5)) * 5;
    if (side) {
      if (B.side) { out += '<g transform="translate(' + r(B.side[0]) + ',' + r(B.side[1] + up) + ') rotate(' + r(-ti * 12) + ')">' + bl + '</g>'; o.brow = true; }
    } else {
      if (B.l) { out += '<g transform="translate(' + r(B.l[0]) + ',' + r(B.l[1] + up) + ') rotate(' + r(-ti * 18) + ')">' + bl + '</g>'; o.brow = true; }
      if (B.r) { out += '<g transform="translate(' + r(B.r[0]) + ',' + r(B.r[1] + up) + ') rotate(' + r(ti * 18) + ')">' + (F.browR || '<g transform="scale(-1,1)">' + bl + '</g>') + '</g>'; o.brow = true; }
    }
  }
  var M = side ? F.mouthsSide : F.mouths, mp = side ? (F.mouthSide || F.mouth) : F.mouth;
  if (M && mp) {
    var low = {}, any = false;
    for (var k in M) { low[k.toLowerCase()] = M[k]; any = true; }
    if (any) {
      var chain = { smile: ['smile', 'rest'], grin: ['grin', 'smile', 'rest'], smirk: ['smirk', 'smile', 'rest'], frown: ['frown', 'rest'], flat: ['rest'], rest: ['rest', 'flat'], open: ['o', 'ai'],
        ai: ['ai', 'o', 'e'], e: ['e', 'ai', 'smile'], o: ['o', 'ai', 'u'], u: ['u', 'o'], mbp: ['mbp', 'rest'], fv: ['fv', 'cons', 'e'], l: ['l', 'cons', 'e'], cons: ['cons', 'e', 'l', 'ai'], laugh: ['ai', 'grin'] };
      var pickM = function (name) {
        var w = String(name || 'rest').toLowerCase(), ch = chain[w] || [w, 'rest'], pc = '';
        for (var j = 0; j < ch.length && !pc; j++) pc = low[ch[j]] || '';
        return pc || low.rest || '';
      };
      var talkShape = /^(ai|e|o|u|l|cons|fv|open|laugh)$/;
      var jaw = function (name) {
        var op = S.open == null ? 1 : cl(nm(S.open, 0), 0, 1);
        var sy = S.open == null ? 1 : (talkShape.test(String(name).toLowerCase()) ? 0.64 + 0.44 * cl(op * 1.25, 0, 1) : 1);
        var sx = S.wide == null ? 1 : 1 + cl(nm(S.wide, 0), -1, 1) * 0.07;
        return 'translate(' + r(mp[0]) + ',' + r(mp[1]) + ') scale(' + r(sx) + ',' + r(sy) + ')';
      };
      var m1 = String(S.mouth || 'rest'), m2 = S.mouth2 ? String(S.mouth2) : '', mix = cl(nm(S.mix, 0), 0, 1);
      var piece = pickM(m1), piece2 = m2 && m2.toLowerCase() !== m1.toLowerCase() ? pickM(m2) : '';
      if (piece2 && piece2 !== piece) {
        // two shapes at once: the mouth moves from the first to the second, with a short dissolve in the middle (no hard flash)
        if (mix >= 0.7) { piece = piece2; m1 = m2; piece2 = ''; }
        else if (mix <= 0.3) piece2 = '';
      } else piece2 = '';
      if (piece) {
        if (piece2) {
          var u = (mix - 0.3) / 0.4;
          out += '<g opacity="' + r(1 - u) + '" transform="' + jaw(m1) + '">' + piece + '</g><g opacity="' + r(u) + '" transform="' + jaw(m2) + '">' + piece2 + '</g>';
        } else out += '<g transform="' + jaw(m1) + '">' + piece + '</g>';
        o.mouth = true;
      }
    }
  }
  o.svg = out ? '<g transform="translate(' + r(side ? 0 : yaw * 3) + ',' + r(pit * 2) + ')">' + out + '</g>' : '';
  return o;
}

/* ---------- the prompt the person copies into ChatGPT, Claude, Gemini... ---------- */

/** The minimal viewer that goes inside the pack file. It reads the JSON above it and draws every person in front, side and back view. */
export const VIEWER_SCRIPT = `(function(){
var SLOT='<g data-face="1"></g>';
${faceMarkup.toString()}
var FS={mouth:'rest',tilt:0,raise:0,gx:0,gy:0},PV=[8,-2,8,-2];
var pack=JSON.parse(document.getElementById('animato-character-pack').textContent);
var T=/@(skinShade|skin|hairShade|hair|eye|line|c[1-4])\\b/g;
function hx(c,d){c=String(c||'').trim();return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)?c:d}
function shade(h,k){h=hx(h,'#888888');if(h.length==4)h='#'+h[1]+h[1]+h[2]+h[2]+h[3]+h[3];var o='#';[1,3,5].forEach(function(i){o+=('0'+Math.max(0,Math.min(255,Math.round(parseInt(h.substr(i,2),16)*k))).toString(16)).slice(-2)});return o}
function compose(g,oi,hi){var b=pack.bodies[g]||pack.bodies.male||pack.bodies.female,os=pack.outfits.filter(function(o){return o.gender==g||o.gender=='any'}),hs=pack.hairs.filter(function(h){return h.gender==g||h.gender=='any'});
var o=os[oi%os.length],h=hs.length?hs[hi%hs.length]:{parts:{}},D=pack.defaults,skin=hx(b.skin,D.skin),hc=hx(h.color,D.hair),cs=(o.colors&&o.colors.length?o.colors:D.colors).concat(D.colors);
var m={skin:skin,skinShade:shade(skin,.84),hair:hc,hairShade:shade(hc,.72),eye:D.eye,line:D.line,c1:cs[0],c2:cs[1],c3:cs[2],c4:cs[3]};
function f(s){return (s||'').replace(T,function(a,k){return m[k]})}var hp=h.parts||{},bp=b.parts,P={};
P.headBehind=f(hp.back||'');P.headBehindSide=f(hp.sideBack||'');P.head=f(bp.head+SLOT+(hp.front||''));P.headSide=bp.headSide?f(bp.headSide+SLOT+(hp.side||hp.front||'')):'';P.headBack=bp.headBack?f(bp.headBack+(hp.rear||'')):'';
var F=null,mo={},mos={};for(var k in (b.mouths||{}))mo[k]=f(b.mouths[k]);for(var k2 in (b.mouthsSide||{}))mos[k2]=f(b.mouthsSide[k2]);
if(bp.pupil||bp.browL||Object.keys(mo).length)F={pupil:f(bp.pupil),pupilSide:f(bp.pupilSide),browL:f(bp.browL),browR:f(bp.browR),browSide:f(bp.browSide),mouths:mo,mouthsSide:mos,eyes:b.eyes,brows:b.brows,mouth:b.mouth,mouthSide:b.mouthSide};
['torso','torsoSide','torsoBack','upperArm','foreArm','upperLeg','lowerLeg','lowerLegSide'].forEach(function(k){P[k]=f(o.parts[k])});
return {P:P,F:F,rig:b.rig||pack.rig,label:g+' · '+o.id+' · '+(h.id||'no hair')}}
function draw(c,view){var R=c.rig,P=c.P,s=view=='side',bk=view=='back',hipY=880-(R.upperLeg+R.lowerLeg),neck=hipY-R.torso,sh=neck+R.shoulderDown;
function pk(k){return (s&&P[k+'Side'])||(bk&&P[k+'Back'])||P[k]}
function leg(m){var x=s?(m>0?-8:8):m*R.hipX;return '<g transform="translate('+x+','+hipY+')">'+P.upperLeg+'<g transform="translate(0,'+R.upperLeg+')">'+((s&&P.lowerLegSide)||P.lowerLeg)+'</g></g>'}
function arm(m){var x=s?0:m*R.shoulderX,i=m<0?0:1,ua=s?(m<0?6:-6):(m<0?PV[i*2]:-PV[i*2]),tf=s?0:((m<0?PV[i*2+1]:-PV[i*2+1])-ua);return '<g transform="translate('+x+','+sh+') rotate('+ua+')">'+P.upperArm+'<g transform="translate(0,'+R.upperArm+') rotate('+tf+')">'+P.foreArm+'</g></g>'}
var behind=bk?'':(s?P.headBehindSide:P.headBehind)||'';var body='<g transform="translate(0,'+neck+')">'+behind+'</g>'+(s?leg(1)+leg(-1):leg(-1)+leg(1))+'<g transform="translate(0,'+hipY+')">'+pk('torso')+'</g>'+(s?arm(-1):arm(-1)+arm(1))+'<g transform="translate(0,'+neck+')">'+pk('head').replace(SLOT,bk?'':faceMarkup(c.F,FS,view).svg)+'</g>';
return '<svg viewBox="-150 130 300 770" width="150" height="385">'+body+'</svg>'}
var NM=['rest','smile','grin','smirk','frown','AI','E','O','U','MBP','FV','L','CONS'],TC={};
function miss(g){var have={};for(var k in (pack.bodies[g].mouths||{}))have[k.toLowerCase()]=1;return NM.filter(function(n){return !have[n.toLowerCase()]})}
function headSvg(c,m,w){var s=c.F?faceMarkup(c.F,{mouth:m,open:1},'front').svg:'';return '<svg viewBox="-110 -215 220 235" width="'+w+'" height="'+Math.round(w*1.07)+'">'+(c.P.headBehind?'<g>'+c.P.headBehind+'</g>':'')+c.P.head.replace(SLOT,s)+'</svg>'}
var SEQ=['MBP','AI','E','CONS','O','U','FV','L','AI','E','MBP','rest'],ti=0;
function tick(){['male','female'].forEach(function(g){var el=document.getElementById('td_'+g);if(el){TC[g]=TC[g]||compose(g,0,0);el.innerHTML=headSvg(TC[g],SEQ[ti%SEQ.length],150)}});ti++}
function render(){var h='<h1>'+pack.name+'</h1>',bad=[];['male','female'].forEach(function(g){if(pack.bodies[g]&&miss(g).length)bad.push(g+': '+miss(g).join(', '))});
h+=bad.length?'<div style="background:#7f1d1d;color:#fff;padding:10px;border-radius:8px;margin:8px 0;font-weight:700">MOUTHS MISSING - '+bad.join(' | ')+'. This character cannot lip sync. Add the missing pieces to bodies.male.mouths / bodies.female.mouths (all 13 names) and reload.</div>':'<div style="background:#14532d;color:#d1fae5;padding:8px 10px;border-radius:8px;margin:8px 0">All 13 mouth shapes are present for every body (lip sync ready).</div>';
['male','female'].forEach(function(g){if(!pack.bodies[g])return;TC[g]=compose(g,0,0);var os=pack.outfits.filter(function(o){return o.gender==g||o.gender=='any'}),n=Math.max(os.length,1);
h+='<h2>'+g+'</h2><div class=row>';for(var i=0;i<n;i++){var c=compose(g,i,i);h+='<figure><div>'+['front','side','back'].map(function(v){return draw(c,v)}).join('')+'</div><figcaption>'+c.label+'</figcaption></figure>'}h+='</div>';
h+='<h2>'+g+' mouth sheet (the 13 shapes the app uses to lip sync) and talking demo</h2><div class=row><figure style="text-align:center"><div id="td_'+g+'"></div><figcaption>talking</figcaption></figure>';
NM.forEach(function(n){var ok=miss(g).indexOf(n)<0;h+='<figure style="text-align:center">'+headSvg(TC[g],n,88)+'<figcaption style="'+(ok?'':'color:#f87171;font-weight:700')+'">'+n+(ok?'':' MISSING')+'</figcaption></figure>'});h+='</div>'});
document.getElementById('sheet').innerHTML=h;tick()}
var ct=document.createElement('div');ct.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0;font-size:12px;color:#9fb3d1';
function sel(label,opts,fn){var l=document.createElement('label');l.textContent=label+' ';var e=document.createElement('select');e.style.cssText='background:#1b2030;color:#eee;border:1px solid #33405e;border-radius:6px;padding:3px';opts.forEach(function(o){var q=document.createElement('option');q.textContent=o;e.appendChild(q)});e.onchange=function(){fn(e.value);render()};l.appendChild(e);ct.appendChild(l)}
sel('Pose test (joints)',['relaxed','wave','both arms up','point sideways','arms forward'],function(v){PV={relaxed:[8,-2,8,-2],wave:[8,-2,150,168],'both arms up':[160,172,160,172],'point sideways':[8,-2,80,82],'arms forward':[45,-5,45,-5]}[v]});
sel('Face test: mouth',['rest','smile','grin','smirk','frown','AI','E','O','U','MBP','FV','L','CONS'],function(v){FS.mouth=v});
sel('brows',['calm','happy','sad','angry','surprised'],function(v){var m={calm:[0,0],happy:[.2,.3],sad:[.9,-.1],angry:[-.9,-.2],surprised:[0,1]}[v];FS.tilt=m[0];FS.raise=m[1]});
sel('eyes look',['centre','left','right','up','down'],function(v){var m={centre:[0,0],left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]}[v];FS.gx=m[0];FS.gy=m[1]});
var sh=document.getElementById('sheet');sh.parentNode.insertBefore(ct,sh);render();setInterval(tick,150)})();`;

export function buildMakerPrompt() {
  const STARTER = Object.entries(defaultMouths({ width: 40 })).map(([k, v]) => '"' + k + '":"' + v.replace(/"/g, "'") + '"').join('\n');
  return `${MAKER_MARKER} · works with ChatGPT, Claude, Gemini, Google AI Studio or any AI model

YOUR JOB: turn the reference image I attach into a CHARACTER PACK: one downloadable .html file that holds a complete, animatable character, drawn as SVG, in the exact look of my reference image. The Animato app imports the file and uses the character in animated videos.

STEP 0. THE IMAGES. If no image is attached yet, reply ONLY: "Please attach the reference image of your character (a clear picture; a full-body picture is best). If you also have a SIDE view and a BACK view of the same character, attach them in the same message (optional). If you don't have them, I will work them out precisely from the front view." Do nothing else until the image is attached. As soon as it is attached, start (do not wait for the optional views) and work silently. Treat the FIRST image as the front reference. If a side view and/or back view is attached, those are the master blueprint for those views (copy them exactly: hair length, clothes details, shoes, accessories). Any view that is NOT attached, you must CALCULATE precisely from the front reference (see SIDE AND BACK VIEWS below).

THE REFERENCE IMAGE IS THE MASTER BLUEPRINT. Your aim is a PERFECT REPLICA of this character, from the hair down to the shoes, in the same art style: someone who puts your drawing next to the image must say "that is the same character, drawn by the same artist". Use all the effort and length you have; do not shortcut, do not simplify, do not fall back to a generic character, do not stop at "close enough". Whatever you can see in the image must be in the drawing: if you cannot copy a detail exactly, get as close as you possibly can. QUALITY BEATS QUANTITY: one character copied perfectly is worth more than many outfits drawn roughly, so the reference look is finished at full detail FIRST (see THE ORDER OF THE FILES).

NON-NEGOTIABLE: THE TALKING MOUTHS. A character that cannot talk is useless to the app, and the mouths are the part that is most often forgotten or cut off. So: the pack MUST contain the "mouths" set (13 SVG pieces, listed in MOVING FACE below) for the male body AND for the female body; write the "mouths" object FIRST inside each body in the JSON (before "parts"), so a length limit can never cut it off; the mouths are NOT drawn inside the head. A pack with a missing or incomplete "mouths" object is unfinished and is rejected by my own check. The mouths copy the reference's mouth: the same lip shape, lip colour, line weight, teeth and tongue style as the image (a plain dot or line mouth in the image means a simple dot or line style, but still 13 different shapes). Starter set to restyle (a neutral cartoon, centred on 0,0, mouth about 40 wide; change every colour, curve and detail so each one looks like the reference's mouth, do not hand it back unchanged unless the reference really is this plain):
${STARTER}

WORK IN THIS ORDER (every step is required):
0. MEASURE FIRST: TURN THE PICTURE INTO NUMBERS (this is how you get the proportions exactly right instead of guessing). Imagine the reference figure scaled so it stands 660 units tall, soles at y=0 and the top of the head (or hair) at y=-660, centred on x=0. Read these off the image and write them in your inventory as numbers: y of the crown, hairline, brow line, eye line, nose tip, mouth line, chin, base of the neck, shoulder line, chest, waist, crotch, wrists, fingertips, knees, ankles; widths of the head, the face at the cheeks, the neck, the shoulders, the waist, the hips, the upper arm, the forearm, the wrist, the thigh, the calf, the shoe; the eye width, the gap between the eyes, the iris size, the mouth width, the nose width; the outline thickness. Count heads: how many head heights is the whole figure (a chibi of 2.5 heads stays 2.5 heads; a realistic adult of 7.5 stays 7.5). Then set the rig from these numbers (torso = neck base to crotch, upperArm = shoulder to elbow, foreArm = elbow to fingertips, upperLeg = hip to knee, lowerLeg = knee to sole) and draw every piece to these exact measurements.
0b. SAMPLE THE COLOURS: for every region (skin, hair, eyes, lips, each garment, shoes, accessories, outline) write the BASE colour, the SHADOW colour and the HIGHLIGHT colour as hex, read from the image. Use exactly these hex values; never swap them for "nicer" ones.
1. INVENTORY (write it for yourself before any drawing). List what you see, part by part: art style (outline thickness and colour, flat or shaded, realistic or cartoon or stick or anime), head shape and size, face (eyes, irises, brows, nose, mouth, lips, ears, cheeks, freckles, wrinkles, makeup), skin tone (hex), hair (style, length, parting, fringe, volume, texture, colours as hex), facial hair, neck, shoulders and body build, every garment (type, cut, colours as hex, buttons, pockets, logos, patterns, sleeves, collar), belt, trousers or skirt, socks, shoes, jewellery, glasses, hats, bags, scars, tattoos, and anything unusual. Note the body proportions (head height compared with the body, arm and leg length). If the image shows only part of the body, continue it in the same style.
2. BUILD THE BODY of the character you see (the reference gender): the head and face drawn exactly like the image, then the clothes exactly like the image. This is the REFERENCE LOOK and it must be a faithful copy.
2b. DRAW THE 13 MOUTHS NOW (right after the head, before any hair or outfit): rest, smile, grin, smirk, frown, AI, E, O, U, MBP, FV, L, CONS, each in the reference's lip style, each clearly different, then the same 13 for the opposite gender. Do not move on until all 13 exist.
3. BUILD THE OPPOSITE GENDER in the same art style, the same face language (eyes, nose, line weight) and the same proportions, adapted naturally (hair, build, clothes).
4. BUILD THE WARDROBE: at least 4 different outfits for each gender (outfit 1 = the reference outfit; then for example casual, formal suit or dress, sporty, work or uniform), each in the same art style and fitting the same body.
5. BUILD THE HAIRSTYLES: at least 4 for each gender (hairstyle 1 = the reference hair; then clearly different styles and lengths, one can be bald/very short).
5b. DETAIL PASS (what makes it look like the reference and not a simplified copy): every piece is built in layers like the reference artist would: base fill, then the shadow shapes on the side away from the light in the reference, then the highlights, then the texture and folds (hair strands, cloth creases at elbows, knees and waist, seams, stitching, prints and patterns repeated exactly: count the buttons, stripes, pockets and laces and draw the same number), then the outline in the reference's line colour and thickness (LINE ART: the outer silhouette line about twice as thick as inner detail lines, round caps and joins, smooth curves with no wobble, gaps or doubled strokes). Head and hair at least 4 layers; every garment at least 3. If the reference is flat colour with no shading, stay flat; if it is painted or 3D-looking, use gradients for the same soft shading.
6. COMPARE AND FIX (a strict fidelity check). Put your drawing next to the reference image and score each of these from 0 to 10: head shape, eyes, brows, nose, mouth and lips, skin tone, hair shape and colour, body proportions (your numbers from step 0), each garment, shoes, accessories, line style. Every score under 9 means that part is redrawn, then scored again. Write the final scores in one line in the pack's "notes" (for example "fidelity: head 9, eyes 10, hair 9 ..."). List every remaining difference you can see and fix it.
7. CHECK THE FILE (see the checklist) and deliver it.

IT MUST BE ANIMATABLE: the app moves each piece like a puppet (walking, running, waving, pointing, sitting, talking, blinking, turning). So the character is NOT one flat picture.
JOINTS THAT BEND CLEANLY (this decides whether the movement looks professional or broken): every limb piece starts 12 units ABOVE its pivot with a rounded end (a circle or round cap in the piece's own colour, as wide as the limb) that tucks under the parent piece, so a shoulder, elbow, hip or knee can rotate 150 degrees with no gap and no sharp corner. Sleeves and trouser legs cover their joint; the torso overlaps the tops of the arms and legs; the neck stub of the head reaches 14 units below the head's pivot under the collar. No shadow, stripe or outline line crosses a joint (each piece is shaded on its own). Hands are relaxed and open with a visible thumb, shoes have a flat sole on y=0 of the lower leg. Imagine the arm raised straight up, the leg kicked forward 60 degrees and the person sitting: every pose must still look like the reference. Draw SEPARATE PIECES, each around its OWN PIVOT at (0,0), one unit = one pixel, the whole person about 660 units tall (matching the rig numbers below):
HUMAN KINEMATICS (the app moves the character with a real two-bone rig: shoulder -> elbow -> hand and hip -> knee -> foot, solved like inverse kinematics from where the hand or foot must go; every pose, walk, wave, point, hug and sit depends on these rules, so a character that breaks them moves badly):
- Bone lengths are the truth. rig.upperArm = shoulder joint to elbow joint. rig.foreArm = elbow joint to the tip of the middle finger (the HAND IS PART OF THE FOREARM). rig.upperLeg = hip joint to knee joint, rig.lowerLeg = knee joint to the sole (the foot is part of the lower leg). Draw every piece exactly that long. Use real proportions unless the reference is stylised: upperArm about equal to foreArm; with the arms hanging, the fingertips reach about mid-thigh (shoulderDown + upperArm + foreArm is about torso + 0.35 x upperLeg); upperLeg about equal to lowerLeg; the legs are 45 to 50 percent of a realistic adult's height (a chibi or cartoon keeps its own shorter legs and longer head).
- The pivot is the CENTRE of the joint: the middle of the shoulder cap, the elbow, the hip and the knee. The round overlap end of each piece sits exactly on its pivot.
- Every limb piece hangs STRAIGHT DOWN in a relaxed neutral stance: no bent elbow, no raised hand, no stride, no hand in a pocket, no held object. The app bends the elbow one way only (the forearm folds up toward the shoulder, up to about 150 degrees), swings the shoulder from across the chest to straight up, folds the knee, and may shorten a leg piece vertically by up to 45 percent when a knee comes up. Sleeves, cuffs, trouser legs, folds and highlights must still look right at those extremes: no seams, stripes or shadows that only work straight.
- The same arm piece is used for BOTH arms and the same leg piece for both legs (they are not mirrored), so draw each limb so it works on both sides: a hand seen from the front that is symmetrical enough (a relaxed hand, thumb folded or small), no one-sided watch, logo or pocket on a sleeve.
- The arms and legs exist ONLY in their own pieces. The torso piece does not draw arms or legs; it covers the shoulder ends and the tops of the legs (the sleeve cap and the waistband overlap them), so every joint stays hidden while it moves.
- Head, neck and torso keep their centre on x=0; the shoulders sit at +-shoulderX, the hips at +-hipX.
- head: the pivot is the NECK. The head goes UP (negative y): about 150 to 190 tall and 130 to 170 wide, centred on x=0, with a short neck stub just below y=0. Draw here everything FIXED on the head: skin, ears, nose, cheeks, blush, freckles, wrinkles, makeup, the eye SOCKETS and eye WHITES (with their outline and eyelashes), but NOT the irises/pupils, NOT the eyebrows, NOT the mouth or lips (those are the moving face pieces below, drawn separately; if you left them in the head they would be drawn twice and never move), and NOT the hair (hair is a separate layer, see below). Facing the camera.
- headSide: the same head in true PROFILE, facing RIGHT (+x), nose pointing right, the ear showing. headBack: the back of the head and neck seen from behind (skin, ears; hair is added by the hair layer).
SIDE AND BACK VIEWS MUST BE CORRECT, not a mirrored or squashed copy of the front. If I attached a side or back image, copy it. If not, CALCULATE them from the front reference like a character model sheet: keep the SAME head height, chin line, eye line, shoulder line, waist, hem and shoe line in all three views (draw the three views mentally on one grid). Profile: the skull is as deep as it is wide, the face is a profile silhouette (forehead, brow ridge, nose that sticks out to the right with the true nose shape and size from the front, lips, chin and jaw line), ONE visible eye (narrower, at the front of the head), the ear sits just behind the middle of the head at the eye-to-nose height, the neck leans slightly forward, the torso is about 60% as wide as the front (chest and back curves, the belly, the bust or the hips as they would really look), the arms hang from the middle of the shoulder, and clothing details wrap around correctly (a collar opening, buttons or a zip line on the front edge, pockets, hem lines, a skirt that is narrower). Back view: the back of the head with the real hair shape and the hairline, both ears, the back of the neck, the collar, the back of the clothes (seams, hood, straps, a bag, labels, back pockets), no face. Accessories (glasses arms, earrings, hat, bag straps, necklace, watch) must appear consistently in every view.
- MOVING FACE (required, this is what makes the character come alive; draw it in the SAME art style as the reference, with the same line weight, colours and lip style):
  pupil: ONE eye's iris + pupil + highlight (the coloured round part that looks around), drawn around its own centre (0,0), sized to sit INSIDE the eye white with a few units to spare on each side. The app draws it twice (left eye and right eye) and slides it to make the eyes look left, right, up and down, so the eye whites in the head must be big enough for it to travel. eyes: {"l":[x,y],"r":[x,y],"range":[5,3.5]} gives the centre of the left and right eye (in head space) and how far the pupil may slide (x, y units). If the reference has big anime eyes or a simple dot, keep that style (a dot eye is just a small pupil). 
  browL: ONE eyebrow (the one over the character's LEFT eye on the screen, x<0), drawn around its own centre (0,0), the INNER end (towards the nose) on the +x side. The app mirrors it for the other brow (or give browR too if they differ). brows: {"l":[x,y],"r":[x,y]} gives where the brows sit. The app raises, lowers and tilts them for happy, sad, angry, surprised and worried faces, so draw them as clean separate shapes with a bit of room above the eye.
  mouths: a SET of mouth shapes, each drawn around the SAME centre (0,0) (the app puts it at the body's mouth:[x,y]), same width scale, same style, same lip colour and shape language as the reference mouth, including lips, lipstick, teeth, tongue and mouth corners. They are used for LIP SYNC (the app picks the shape that matches the sound being spoken) and for moods. Draw ALL of these keys: "rest" (relaxed closed mouth, the reference's neutral mouth), "smile", "grin" (big smile with teeth), "smirk" (one corner up), "frown", "AI" (wide open, the "ah" sound), "E" (wide and thin, teeth showing, "ee"), "O" (round open, "oh"), "U" (small rounded pucker, "oo"), "MBP" (lips pressed together, for m, b, p), "FV" (upper teeth resting on the lower lip, for f, v), "L" (mouth half open, tongue tip up behind the upper teeth, for l, th), "CONS" (slightly open, teeth close, for t, d, s, k). They must read clearly at small size and match each other (same head, same jaw width), so the jump from one to the next looks like one person talking. Accurate lip sync is a core goal: make AI, E, O, U, MBP, FV and L clearly different from each other. WHICH SOUND USES WHICH SHAPE (so you draw each for its real job): AI = a and i (jaw dropped, tall open mouth); E = e (wide, thin, teeth); O = o and ou (tall round); U = u, oo, w, sh, ch, r (small round pucker); MBP = m, b, p (lips shut); FV = f, v (top teeth on the bottom lip); L = l, th, n (half open, tongue tip up); CONS = t, d, s, z, k, g and other consonants (barely open, teeth close); rest = silence. The app glides between these shapes word by word while the person talks, so the jump from any shape to any other must look natural (same centre, same width scale, same lip colour).
  eyesClosed: closed eyes drawn in head space ON TOP of the head, with shapes in the skin colour under them that cover the open eyes AND the pupils; shown while blinking.
  Optional for the profile: pupilSide (+ eyes.side [x,y]), browSide (+ brows.side [x,y]), mouthsSide (the same set of mouth shapes in profile, facing RIGHT, + mouthSide [x,y]). If you give a profile piece, leave that feature OUT of headSide (it is drawn by the app); if you do not give it, draw that feature fixed inside headSide. 
  Old style (only if you truly cannot draw the set): mouthOpen, an open talking mouth ON TOP of the head, with mouth:[x,y] its centre. Prefer the mouths set.
- torso: the pivot is the middle of the PELVIS; the body goes UP to the neck at y = -torso (190 by default). The clothes on the chest, belly and hips, the shoulders. torsoSide: the torso in profile (narrower). torsoBack: seen from behind.
- upperArm: the pivot is the SHOULDER, the arm hangs straight DOWN to the elbow (rig.upperArm long), sleeve included. foreArm: the pivot is the ELBOW, hangs straight DOWN to the fingertips, hand included (rig.foreArm long), cuff or glove included.
- upperLeg: the pivot is the HIP, hangs straight DOWN to the knee (rig.upperLeg). lowerLeg: the pivot is the KNEE, hangs straight DOWN to the ground (rig.upperLeg + rig.lowerLeg from the hip) and ends in the shoe. lowerLegSide: the same in profile with the shoe pointing RIGHT (+x). A skirt or dress belongs to the torso piece (it may hang over the legs); the leg pieces under it are the bare or stockinged legs.
- Hair: each hairstyle is up to five layers, drawn in head space (pivot = the neck), and the app stacks them in this order, back to front: [back] behind the WHOLE body, then the legs, torso and arms, then the head, then [front] on top of the face.
  back = ONLY the hair that hangs BEHIND the person (long hair behind the neck and shoulders, a ponytail, a bun's tail). It is drawn BEHIND the neck, shoulders, torso and arms, so it must never be needed to cover them; do not put fringe, crown or anything that should lie on the face or in front of the neck in back.
  front = hair that lies ON TOP of the head and face seen from the front: fringe, crown, parting, sideburns, and locks that fall IN FRONT of the shoulders. Keep it clear of the neck (the neck stub is x -13 to 13) unless the hair really covers it.
  side = the hair in profile, drawn over headSide. sideBack = hair behind the profile body (the long hair falling behind the back in profile), drawn behind the body like back.
  rear = the hair seen from behind, drawn over headBack, on top of the back of the head and the neck and shoulders (long hair seen from behind does cover the back and neck, that is correct).
- rig (numbers): {upperLeg:150, lowerLeg:150, torso:190, shoulderX:58, shoulderDown:25, hipX:32, upperArm:105, foreArm:100}. Adjust them if the character is taller, shorter, thinner or chibi, and draw the pieces to those lengths. size: overall scale (default 1.1).

COLOUR TOKENS (so one drawing can be re-coloured by the app: use them in fill and stroke instead of fixed colours where a colour should be changeable):
@skin (skin tone), @skinShade (a darker skin shade), @hair, @hairShade, @eye, @line (the outline colour), @c1 (main clothing colour: shirt, dress, jacket), @c2 (second clothing colour: trousers, skirt), @c3 (accent: tie, trim, belt), @c4 (shoes). Write them as plain text inside the attribute: fill="@skin", stroke="@line". Use real hex colours for things that must stay fixed (a logo, a button). In "defaults" put the REAL colours from the reference image (skin, hair, line, eye, lip = the lip colour, colors:[c1,c2,c3,c4]); "mouthWidth" is the width of the reference mouth in units so the reference look appears exactly as in the image.

GRADIENTS (a broken gradient makes a whole face or body INVISIBLE, so follow this exactly): under every gradient-filled shape draw a plain solid base shape first (fill="@skin" for skin, @c1 for a shirt...) so the part is still coloured if a gradient fails; every gradient defines its own <stop> colours (never an empty gradient, never one that only points at another with href); gradient ids are unique in the whole file, named after the piece (headSkin, torsoShade, hairShine); write fill="url(#headSkin)" with no quotes inside the parentheses; no href, xlink:href, <use>, <image>, filters or masks anywhere.

SVG RULES: each piece is an SVG fragment string: path, circle, ellipse, rect, polygon, line, g, linearGradient and radialGradient (inside <defs>, with unique ids), stroke, opacity. NO <svg> wrapper, no <image>, no <script>, no <style>, no <use>, no <a>, no external links, no text or fonts. Every piece under 30,000 characters. Straight quotes only. Smooth curves (C, Q) and layered shapes make it look professional: add gradients, shadows, highlights, folds, texture lines, whatever the reference style has.

THE PACK FILE: ONE self-contained HTML file named character-pack.html. It contains exactly this JSON inside a script tag, then the viewer script. In the JSON write "</" as "<\\/" and keep it valid JSON (double quotes, no comments, no trailing commas).
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CHARACTER NAME · Animato character pack</title>
<style>body{margin:0;padding:16px;font:14px system-ui;background:#10131a;color:#eee}h1{font-size:20px}h2{font-size:15px;color:#9fb3d1}.row{display:flex;gap:14px;flex-wrap:wrap}figure{margin:0;background:#1b2030;border-radius:10px;padding:8px}figure>div{display:flex}figcaption{font-size:11px;color:#9fb3d1;text-align:center}</style></head><body><div id="sheet"></div>
<script type="application/json" id="animato-character-pack">
{
 "format":"animato-character-pack","version":1,"name":"Character name","id":"character-name",
 "notes":"one line: what the reference is (art style, who)",
 "defaults":{"skin":"#d9a679","line":"#1a1a1a","eye":"#2b1a10","hair":"#1b1b1b","lip":"#c4505a","colors":["#3b82f6","#1e3a8a","#f5b700","#e2eafc"]},
 "rig":{"upperLeg":150,"lowerLeg":150,"torso":190,"shoulderX":58,"shoulderDown":25,"hipX":32,"upperArm":105,"foreArm":100},"size":1.1,
 "bodies":{
  "male":{"mouth":[0,-48],"mouthWidth":40,"eyes":{"l":[-26,-80],"r":[26,-80],"range":[5,3.5]},"brows":{"l":[-26,-104],"r":[26,-104]},
   "mouths":{"rest":"<svg piece>","smile":"...","grin":"...","smirk":"...","frown":"...","AI":"...","E":"...","O":"...","U":"...","MBP":"...","FV":"...","L":"...","CONS":"..."},
   "parts":{"head":"<svg fragment>","headSide":"...","headBack":"...","pupil":"...","browL":"...","eyesClosed":"..."}},
  "female":{"mouth":[0,-48],"mouthWidth":40,"eyes":{...},"brows":{...},"mouths":{...the same 13 shapes, drawn for her...},"parts":{...same pieces...}}
 },
 "outfits":[
  {"id":"reference","label":"Reference outfit","gender":"male","colors":["#hex","#hex","#hex","#hex"],"parts":{"torso":"...","torsoSide":"...","torsoBack":"...","upperArm":"...","foreArm":"...","upperLeg":"...","lowerLeg":"...","lowerLegSide":"..."}},
  ...at least 4 per gender, "gender" is "male", "female" or "any"...
 ],
 "hairs":[
  {"id":"reference","label":"Reference hair","gender":"male","color":"#hex","parts":{"back":"...","front":"...","side":"...","rear":"..."}},
  ...at least 4 per gender...
 ]
}
</script>
<script>
${VIEWER_SCRIPT}
</script></body></html>
(Copy the viewer script exactly as printed above, it draws every person in front, side and back view so we can both check the result.)

CHECKLIST BEFORE YOU SEND (silently, fix anything that fails):
[ ] MOUTHS FIRST: bodies.male.mouths AND bodies.female.mouths each hold ALL 13 keys (rest, smile, grin, smirk, frown, AI, E, O, U, MBP, FV, L, CONS), each a real drawing (not "...", not empty), written before "parts", in the reference's lip style, and none of them drawn inside the head. I counted them.
[ ] I measured the reference (step 0) and every piece follows those numbers; the head-to-body ratio is the reference's.
[ ] I compared every part with the reference image and fixed every difference: hair, face, skin, clothes, colours, shoes, proportions, line style. Every fidelity score is 9 or 10 and the scores are in "notes".
[ ] Every joint has a rounded overlapping end, so arms and legs bend without gaps; no shading crosses a joint.
[ ] Male and female bodies both exist; each has head, headSide, headBack, eyesClosed, pupil, browL, eyes, brows, mouth and ALL 13 mouth shapes (rest, smile, grin, smirk, frown, AI, E, O, U, MBP, FV, L, CONS).
[ ] The head has NO pupils, NO eyebrows and NO mouth drawn in it (they are the moving pieces); the pupil sits inside the eye white with room to move; the mouth shapes are all centred on (0,0) and clearly different (AI, E, O, U, MBP, FV, L), in the reference's lip style.
[ ] The face matches the reference exactly (eye shape and colour, brow shape and thickness, lips, nose, ears, skin marks).
[ ] Side and back views are correct and consistent with the front (same heights, lines, accessories); taken from my side/back images if I gave them, calculated precisely if I did not.
[ ] At least 4 outfits for each gender, each with torso, torsoSide, torsoBack, upperArm, foreArm, upperLeg, lowerLeg and lowerLegSide.
[ ] At least 4 hairstyles for each gender, each with front, side and rear (and back / sideBack when hair falls behind the person). Hair that hangs behind the neck and shoulders is in back, never in front.
[ ] KINEMATICS: bone lengths match the rig numbers exactly (hand included in foreArm, foot included in lowerLeg); every joint pivot is the middle of the joint; arms and legs hang straight and relaxed; limbs are symmetric enough to serve both sides; no arms or legs drawn inside the torso; I tried the viewer's "Pose test (joints)" (relaxed, wave, both arms up, point sideways, arms forward) and no gap, bump or sharp corner opens at the shoulder or elbow.
[ ] Every skin or clothing shape that uses a gradient has a solid base shape under it, and every gradient has its own <stop> colours.
[ ] Every piece is drawn around its own pivot as described; arms and legs hang straight down; shoes point right in the side pieces.
[ ] Colours use the @tokens where they should change, and the defaults hold the real reference colours.
[ ] The JSON is valid and every SVG fragment is well-formed (every tag closed).
[ ] The file is complete: no "...", no placeholders, no "and so on".

THE ORDER OF THE FILES (so the most important part is never cut short):
- FILE 1, always complete and at full detail: the REFERENCE character exactly as in the image (the reference gender's body with all face pieces and the 13 mouths, outfit 1 = the reference outfit, hairstyle 1 = the reference hair). If you have room, the rest of the pack goes in the same file.
- If your length limit is close, stop after a complete piece, close the JSON properly and deliver. When I say "continue", send the next file with the SAME "id" and "name": first the opposite gender body with its reference-style outfit and hair, then the extra outfits and hairstyles, until there are at least 4 different outfits and 4 hairstyles for each gender. The app adds every file to the first one.
HOW TO DELIVER: create a real downloadable file named character-pack.html (use your file, canvas, artifact or code-interpreter tool). If you CAN preview HTML, open it and look at it: the top of the page must show the GREEN line "All 13 mouth shapes are present", every body must show a mouth sheet with 13 different mouths and a talking head that moves; a RED line means mouths are missing, so fix them first. Fix anything else that looks wrong too. Your chat reply is short: the download link, then 3 steps: 1) Download the file. 2) Open Animato Studio Pro, then Tools, then Code to stickman. 3) Choose the Reference Image character, tap "Import character file" and pick the file. If you CANNOT make a downloadable file, say so in one line and print the whole file in ONE code block.
(If your length limit cuts the file short, follow THE ORDER OF THE FILES above.)

Start now: if there is no image yet, ask for it.`;
}
