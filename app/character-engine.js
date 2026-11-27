/**
 * Animato Character Engine
 * Decoupled pure module for:
 *  1. Unique Per-User / Per-Video Anti-Copyright Character DNA (resists YouTube duplicate/reused-content flags)
 *  2. Zero-Distortion Articulated Stickman Vector Rig across Front, Side, and Back views
 *  3. Automatic Procedural Geometric Character Generator ("Generate Character" with Front/Side/Back views)
 */

import { mouthParams } from './motion-polish.js';

const CL = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const LERP = (a, b, k) => a + (b - a) * k;
const f2 = (v) => (Number(v) || 0).toFixed(2);
const HX = /^#[0-9a-f]{6}$/i;

export function normHex(h, fallback = '#4f8cff') {
  const s = String(h || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
  }
  return fallback;
}

export function shadeHex(hex, factor = 1) {
  const h = normHex(hex, '#888888');
  return (
    '#' +
    [1, 3, 5]
      .map((i) =>
        Math.round(CL(parseInt(h.slice(i, i + 2), 16) * factor, 0, 255))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  );
}

export function mixHex(hexA, hexB, t = 0.5) {
  const a = normHex(hexA, '#888888');
  const b = normHex(hexB, '#111111');
  const k = CL(t, 0, 1);
  return (
    '#' +
    [1, 3, 5]
      .map((i) => {
        const va = parseInt(a.slice(i, i + 2), 16);
        const vb = parseInt(b.slice(i, i + 2), 16);
        return Math.round(va + (vb - va) * k)
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}

export function escXml(s) {
  return String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function hashSeed(input) {
  const str = String(input ?? 'animato');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1337;
}

export function makeRng(seed) {
  let a = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// 1. UNIQUE ANTI-COPYRIGHT CHARACTER DNA ENGINE
// ============================================================================

export const DNA_PALETTES = [
  { name: 'Cobalt Amber', primary: '#2b59c3', secondary: '#1c2541', accent: '#f5b700', trim: '#e2eafc', shoeTrim: '#f5b700', ink: '#12151f' },
  { name: 'Teal Coral', primary: '#1d7874', secondary: '#24303c', accent: '#ff6b6b', trim: '#d8f3dc', shoeTrim: '#ff6b6b', ink: '#11181c' },
  { name: 'Crimson Slate', primary: '#c83e4d', secondary: '#2b2d42', accent: '#ffd166', trim: '#edf2f4', shoeTrim: '#ffd166', ink: '#14141c' },
  { name: 'Emerald Gold', primary: '#2d6a4f', secondary: '#1b263b', accent: '#e9c46a', trim: '#f1faee', shoeTrim: '#e9c46a', ink: '#101915' },
  { name: 'Indigo Mint', primary: '#5e60ce', secondary: '#22223b', accent: '#4ea8de', trim: '#e0fbfc', shoeTrim: '#64dfdf', ink: '#141422' },
  { name: 'Terracotta Sky', primary: '#d96b43', secondary: '#2f3e46', accent: '#8ecae6', trim: '#fdf0d5', shoeTrim: '#8ecae6', ink: '#1a1615' },
  { name: 'Plum Champagne', primary: '#7b2cbf', secondary: '#242038', accent: '#f4a261', trim: '#f7ede2', shoeTrim: '#f4a261', ink: '#181421' },
  { name: 'Steel Tangerine', primary: '#3d5a80', secondary: '#1d2d44', accent: '#ee6c4d', trim: '#e0fbfc', shoeTrim: '#ee6c4d', ink: '#12161d' },
  { name: 'Ochre Pine', primary: '#ca6702', secondary: '#001219', accent: '#94d2bd', trim: '#fefae0', shoeTrim: '#94d2bd', ink: '#141310' },
  { name: 'Rosewood Ice', primary: '#b56576', secondary: '#355070', accent: '#eaac8b', trim: '#faf3dd', shoeTrim: '#eaac8b', ink: '#1a1518' },
];

export const DNA_MOTIFS = [
  'collar-piping',
  'chest-emblem',
  'lapel-stripe',
  'pocket-badge',
  'cuff-band',
  'scarf-knot',
  'shoulder-stripe',
];

const DNA_EYE_STYLES = ['crisp', 'glint', 'classic'];

export function createCharacterDNA(seedInput = '') {
  const rawSeed = String(seedInput || '').trim() || `session-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const num = hashSeed(rawSeed);
  const r = makeRng(num);
  const pal = DNA_PALETTES[Math.floor(r() * DNA_PALETTES.length)];
  const motif = DNA_MOTIFS[Math.floor(r() * DNA_MOTIFS.length)];
  const eyeStyle = DNA_EYE_STYLES[Math.floor(r() * DNA_EYE_STYLES.length)];
  const code = num.toString(36).toUpperCase().padStart(6, '0').slice(-5);

  return {
    seed: rawSeed,
    dnaCode: `DNA-${code}`,
    paletteName: pal.name,
    palette: { ...pal },
    motif,
    eyeStyle,
    proportion: {
      headScale: Number((0.97 + r() * 0.08).toFixed(3)),
      torsoRatio: Number((0.95 + r() * 0.1).toFixed(3)),
      limbWeight: Number((12.5 + r() * 2.5).toFixed(2)),
    },
    accentBadgeShape: r() > 0.5 ? 'diamond' : 'chevron',
  };
}

export function applyDnaToStickLook(look = {}, dna = null) {
  if (!dna) return look;
  const src = look && typeof look === 'object' ? look : {};
  const out = { ...src, __dna: dna };
  if (!src.topc && !src.topColor && !src.outfitc) out.topc = dna.palette.primary;
  if (!src.bottomc && !src.bottomColor) out.bottomc = dna.palette.secondary;
  if (!src.shoec && !src.shoeColor) out.shoec = dna.palette.trim;
  return out;
}

export function applyDnaToOrigLook(look = {}, dna = null) {
  if (!dna) return look;
  const src = look && typeof look === 'object' ? look : {};
  const out = { ...src, __dna: dna };
  if (!src.outfitc) out.outfitc = dna.palette.primary;
  return out;
}

export function formatCharacterDnaPrompt(dna, style = 'stickman', topicHint = '') {
  if (!dna || typeof dna !== 'object') return '';
  const pal = dna.palette || DNA_PALETTES[0];
  const topicNote = String(topicHint || '').trim()
    ? ` tailored specifically to "${String(topicHint).trim().slice(0, 90)}"`
    : '';
  return `UNIQUE CREATOR VISUAL IDENTITY (${dna.dnaCode} — Anti-Reused-Content Shield):
- To guarantee this creator's channel never looks identical to other channels or triggers YouTube reused-content detection, infuse ALL cast designs and framing with signature identity **${dna.dnaCode}** (${pal.name}${topicNote}):
  * Primary Palette: main silhouette accent \`${pal.primary}\`, grounded shadow tone \`${pal.secondary}\`, pop highlight \`${pal.accent}\`, trim \`${pal.trim}\`.
  * Signature Wardrobe Motif: incorporate **${dna.motif}** + **${dna.accentBadgeShape}** insignia subtly across cast outfits, props, and recurring chapter cards so the whole film shares a recognizable, copyright-safe boutique animation brand.
  * Style Mode (${style}): give every hero and side character individualized proportions, distinct eyewear/hair/outfit combinations, and custom topic-matched color harmonies rather than factory defaults.`;
}

// ============================================================================
// 2. ZERO-DISTORTION ARTICULATED STICKMAN RIG (Front / Side / Back)
// ============================================================================

export const STICK_OPTIONS = {
  hair: ['ponytail', 'tousled', 'bob', 'long-wavy', 'twin-buns', 'pigtails', 'curly-afro', 'spiky', 'side-part', 'buzz', 'bald'],
  expression: ['quirky', 'happy', 'cool', 'shy', 'wink', 'chill', 'surprised'],
  top: ['tshirt', 'hoodie', 'jacket', 'sweater', 'tank'],
  bottom: ['cuffed-shorts', 'straight-shorts', 'jeans', 'joggers', 'skirt'],
  shoe: ['sneakers', 'hightops', 'boots', 'slipons'],
  headwear: ['none', 'cap', 'beanie', 'bucket', 'headphones', 'headband'],
  eyewear: ['none', 'round', 'square', 'shades', 'pinkshades'],
  facialHair: ['none', 'stubble', 'mustache', 'goatee', 'beard'],
  acc: ['backpack', 'crossbody', 'scarf', 'necklace', 'earrings', 'blush'],
};

const STICK_DEFAULTS = {
  female: { hair: 'ponytail', topc: '#e06d94', bottom: 'cuffed-shorts', bottomc: '#355070', build: 0.98 },
  male: { hair: 'tousled', topc: '#4f7cac', bottom: 'straight-shorts', bottomc: '#2f3e46', build: 1.02 },
};

const OLD_HAIR_MAP = { swept: 'tousled', pompadour: 'side-part', crop: 'buzz', bald: 'bald', short: 'side-part', long: 'long-wavy', curly: 'curly-afro', bun: 'twin-buns' };
const OLD_TOP_MAP = { zip: 'jacket', crew: 'sweater', suit: 'jacket', hoodie: 'hoodie', tee: 'tshirt', dress: 'tshirt', turtle: 'sweater', labcoat: 'jacket', overalls: 'tank', jersey: 'tshirt', coat: 'jacket', shirt: 'tshirt' };
const OLD_EYE_MAP = { rect: 'square', round: 'round', glasses: 'square', shades: 'shades', none: 'none' };

export function cleanStickLook(look = {}) {
  const l = look && typeof look === 'object' ? look : {};
  const g = l.gender === 'female' ? 'female' : 'male';
  const D = STICK_DEFAULTS[g];
  const pick = (k, v, d) => (STICK_OPTIONS[k].includes(v) ? v : d);

  let hair = l.hair;
  if (OLD_HAIR_MAP[hair]) hair = OLD_HAIR_MAP[hair];
  let top = l.top;
  if (!top && l.outfit) top = OLD_TOP_MAP[l.outfit];
  let eye = l.eyewear;
  if (!eye && l.glasses) eye = OLD_EYE_MAP[l.glasses];
  else if (OLD_EYE_MAP[eye]) eye = OLD_EYE_MAP[eye];

  const col = (v, d) => (HX.test(String(v || '').trim()) ? String(v).trim().toLowerCase() : d);
  const clampNum = (v, d, a, b) => {
    const n = +v;
    return Number.isFinite(n) ? CL(n, a, b) : d;
  };

  let age = +l.age;
  if (!Number.isFinite(age)) age = 18;
  else if (age <= 1) age = 18 + age * 45;

  let ex = l.expression;
  let sm = l.smile;
  let bm = l.browMood;
  if (!ex || !STICK_OPTIONS.expression.includes(ex)) {
    ex = 'quirky';
    const m = l.mouth;
    const b = l.brow;
    if (m === 'grin') ex = 'happy';
    else if (m === 'open') ex = 'surprised';
    else if (m === 'smirk') ex = 'cool';
    else if (m === 'flat') ex = b === 'sad' ? 'shy' : 'chill';
    else if (m === 'frown') {
      ex = 'quirky';
      if (sm === undefined) sm = -9;
    } else if (m === 'smile') {
      ex = 'quirky';
      if (sm === undefined) sm = 8;
    }
    if (bm === undefined) bm = b === 'sad' ? 6 : b === 'angry' ? -7 : b === 'happy' ? 3 : 0;
  }

  return {
    gender: g,
    hair: pick('hair', hair, D.hair),
    top: pick('top', top, 'tshirt'),
    bottom: pick('bottom', l.bottom, D.bottom),
    shoe: pick('shoe', l.shoe, 'sneakers'),
    headwear: pick('headwear', l.headwear, 'none'),
    eyewear: pick('eyewear', eye, 'none'),
    facialHair: pick('facialHair', l.facialHair, 'none'),
    skin: col(l.skin, '#ffffff'),
    hairc: col(l.hairc || l.hairColor, '#1b1b1b'),
    topc: col(l.topc || l.topColor || l.outfitc, D.topc),
    bottomc: col(l.bottomc || l.bottomColor, D.bottomc),
    shoec: col(l.shoec || l.shoeColor, '#ffffff'),
    age: Math.round(CL(age, 5, 80)),
    height: clampNum(l.height, 1, 0.8, 1.2),
    build: clampNum(l.build, D.build, 0.8, 1.25),
    headWidth: clampNum(l.headWidth, 1, 0.85, 1.2),
    eyeSize: clampNum(l.eyeSize, 1, 0.7, 1.4),
    eyeSpace: clampNum(l.eyeSpace, 0, -10, 10),
    expression: ex,
    smile: clampNum(sm, 6, -12, 14),
    browMood: clampNum(bm, 0, -10, 10),
    acc: (Array.isArray(l.acc) ? l.acc : Array.isArray(l.accessories) ? l.accessories : []).filter((a) => STICK_OPTIONS.acc.includes(a)).sort(),
    dna: l.__dna || l.dna || null,
  };
}

export function renderStickChairSvg(v, seatY) {
  const wood = '#8a6a47';
  const hi = '#a8845d';
  const stroke = 'stroke="#111111" stroke-width="3.2" stroke-linejoin="round"';
  const rect = (x, y, w, h, f = wood) => `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" rx="4" fill="${f}" ${stroke}/>`;
  const legH = 880 - (seatY + 14);
  if (v === 's') {
    const backH = seatY - 540 + 18;
    return {
      b:
        rect(-86, 540, 14, 880 - 540) +
        rect(-88, 534, 42, 16, hi) +
        rect(-84, seatY, 140, 14, hi) +
        rect(40, seatY + 14, 12, legH) +
        rect(-84, seatY + 14, 12, legH),
      f: '',
      backH,
    };
  }
  const legs = rect(-78, seatY + 14, 12, legH) + rect(66, seatY + 14, 12, legH);
  const seat = rect(-86, seatY, 172, 14, hi);
  const backRest = rect(-72, 540, 10, seatY - 540) + rect(62, 540, 10, seatY - 540) + rect(-78, 530, 156, 22, hi);
  return v === 'b' ? { b: legs + seat, f: backRest } : { b: backRest + legs + seat, f: '' };
}

function renderStickHairBack(o, view, hy, ink) {
  const hc = o.hairc;
  const sheen = shadeHex(hc, 1.35);
  const ribbon = (o.dna && o.dna.palette && o.dna.palette.accent) || '#eb84a6';
  const side = view === 's';
  const back = view === 'b';

  if (o.hair === 'bald' || o.hair === 'buzz' || o.hair === 'side-part' || o.hair === 'tousled' || o.hair === 'spiky') {
    return '';
  }
  if (side) {
    if (o.hair === 'ponytail') {
      return `<path d="M-54,${f2(hy - 28)} C-96,${f2(hy - 46)} -128,${f2(hy - 8)} -118,${f2(hy + 48)} C-112,${f2(hy + 84)} -92,${f2(hy + 106)} -74,${f2(hy + 104)} C-84,${f2(hy + 74)} -84,${f2(hy + 26)} -56,${f2(hy + 4)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.4" stroke-linejoin="round"/><path d="M-76,${f2(hy - 24)} C-102,${f2(hy - 6)} -102,${f2(hy + 38)} -88,${f2(hy + 74)}" fill="none" stroke="${sheen}" stroke-width="3" stroke-linecap="round" opacity=".55"/><circle cx="-54" cy="${f2(hy - 22)}" r="10" fill="${ribbon}" stroke="${ink}" stroke-width="3"/>`;
    }
    if (o.hair === 'long-wavy' || o.hair === 'bob') {
      const bot = o.hair === 'long-wavy' ? hy + 135 : hy + 72;
      return `<path d="M-10,${f2(hy - 72)} C-84,${f2(hy - 64)} -102,${f2(hy + 10)} -90,${f2(bot)} C-70,${f2(bot + 14)} -32,${f2(bot + 4)} -24,${f2(hy + 48)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.4" stroke-linejoin="round"/>`;
    }
    if (o.hair === 'pigtails') {
      return `<path d="M-46,${f2(hy - 12)} C-92,${f2(hy + 6)} -100,${f2(hy + 74)} -72,${f2(hy + 112)} C-56,${f2(hy + 82)} -52,${f2(hy + 32)} -42,${f2(hy + 8)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.2" stroke-linejoin="round"/>`;
    }
    if (o.hair === 'twin-buns') {
      return `<circle cx="-54" cy="${f2(hy - 56)}" r="24" fill="${hc}" stroke="${ink}" stroke-width="4.2"/>`;
    }
    if (o.hair === 'curly-afro') {
      return `<path d="M-36,${f2(hy - 78)} C-96,${f2(hy - 84)} -112,${f2(hy + 14)} -58,${f2(hy + 54)} L-22,${f2(hy + 34)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.4"/>`;
    }
    return '';
  }

  // Front or Back behind-head hair layer
  if (o.hair === 'ponytail') {
    if (back) {
      return `<path d="M-12,${f2(hy - 10)} C-34,${f2(hy + 42)} -28,${f2(hy + 116)} 0,${f2(hy + 148)} C28,${f2(hy + 116)} 34,${f2(hy + 42)} 12,${f2(hy - 10)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.4" stroke-linejoin="round"/><circle cx="0" cy="${f2(hy - 12)}" r="12" fill="${ribbon}" stroke="${ink}" stroke-width="3"/>`;
    }
    return `<path d="M36,${f2(hy - 56)} C84,${f2(hy - 72)} 114,${f2(hy - 18)} 108,${f2(hy + 46)} C104,${f2(hy + 88)} 82,${f2(hy + 114)} 64,${f2(hy + 108)} C74,${f2(hy + 76)} 74,${f2(hy + 20)} 44,${f2(hy - 14)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.4" stroke-linejoin="round"/><circle cx="48" cy="${f2(hy - 54)}" r="10" fill="${ribbon}" stroke="${ink}" stroke-width="3"/>`;
  }
  if (o.hair === 'long-wavy') {
    return `<path d="M-66,${f2(hy - 20)} C-92,${f2(hy + 30)} -88,${f2(hy + 106)} -64,${f2(hy + 146)} Q0,${f2(hy + 160)} 64,${f2(hy + 146)} C88,${f2(hy + 106)} 92,${f2(hy + 30)} 66,${f2(hy - 20)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.4" stroke-linejoin="round"/>`;
  }
  if (o.hair === 'bob') {
    return `<path d="M-74,${f2(hy - 14)} C-88,${f2(hy + 30)} -82,${f2(hy + 78)} -58,${f2(hy + 90)} H58 C82,${f2(hy + 78)} 88,${f2(hy + 30)} 74,${f2(hy - 14)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.4" stroke-linejoin="round"/>`;
  }
  if (o.hair === 'pigtails') {
    return `<path d="M-64,${f2(hy - 18)} C-104,${f2(hy - 8)} -110,${f2(hy + 66)} -84,${f2(hy + 108)} C-70,${f2(hy + 80)} -66,${f2(hy + 34)} -56,${f2(hy + 4)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.2"/><path d="M64,${f2(hy - 18)} C104,${f2(hy - 8)} 110,${f2(hy + 66)} 84,${f2(hy + 108)} C70,${f2(hy + 80)} 66,${f2(hy + 34)} 56,${f2(hy + 4)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.2"/><circle cx="-68" cy="${f2(hy - 16)}" r="8" fill="${ribbon}" stroke="${ink}" stroke-width="2.6"/><circle cx="68" cy="${f2(hy - 16)}" r="8" fill="${ribbon}" stroke="${ink}" stroke-width="2.6"/>`;
  }
  if (o.hair === 'twin-buns') {
    return `<circle cx="-62" cy="${f2(hy - 56)}" r="25" fill="${hc}" stroke="${ink}" stroke-width="4.2"/><circle cx="62" cy="${f2(hy - 56)}" r="25" fill="${hc}" stroke="${ink}" stroke-width="4.2"/>`;
  }
  if (o.hair === 'curly-afro') {
    return `<circle cx="-58" cy="${f2(hy - 30)}" r="34" fill="${hc}" stroke="${ink}" stroke-width="4"/><circle cx="58" cy="${f2(hy - 30)}" r="34" fill="${hc}" stroke="${ink}" stroke-width="4"/><circle cx="-40" cy="${f2(hy - 62)}" r="34" fill="${hc}" stroke="${ink}" stroke-width="4"/><circle cx="40" cy="${f2(hy - 62)}" r="34" fill="${hc}" stroke="${ink}" stroke-width="4"/><circle cx="0" cy="${f2(hy - 72)}" r="36" fill="${hc}" stroke="${ink}" stroke-width="4"/>`;
  }
  return '';
}

function renderStickHairFrontOrBack(o, view, hy, rx, ry, ink) {
  const hc = o.hairc;
  const sheen = shadeHex(hc, 1.35);
  const side = view === 's';
  const back = view === 'b';

  if (o.hair === 'bald') return '';

  if (back) {
    // True rear hair crown completely covers rear cranium — zero face or front bangs bleed!
    if (o.hair === 'buzz') {
      return `<path d="M-${f2(rx - 3)},${f2(hy + 12)} C-${f2(rx)},${f2(hy - ry - 4)} ${f2(rx)},${f2(hy - ry - 4)} ${f2(rx - 3)},${f2(hy + 12)} C${f2(rx * 0.6)},${f2(hy + 28)} -${f2(rx * 0.6)},${f2(hy + 28)} -${f2(rx - 3)},${f2(hy + 12)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.2"/>`;
    }
    const lowerY = o.hair === 'spiky' ? hy + 36 : hy + 46;
    let s = `<path d="M-${f2(rx + 2)},${f2(hy + 14)} C-${f2(rx + 6)},${f2(hy - ry - 10)} ${f2(rx + 6)},${f2(hy - ry - 10)} ${f2(rx + 2)},${f2(hy + 14)} C${f2(rx - 6)},${f2(lowerY)} -${f2(rx - 6)},${f2(lowerY)} -${f2(rx + 2)},${f2(hy + 14)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.4" stroke-linejoin="round"/>`;
    if (o.hair === 'spiky') {
      s += `<path d="M-58,${f2(hy - 48)} L-74,${f2(hy - 84)} L-34,${f2(hy - 68)} L-8,${f2(hy - 98)} L14,${f2(hy - 70)} L48,${f2(hy - 90)} L46,${f2(hy - 56)}" fill="${hc}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>`;
    }
    s += `<path d="M-34,${f2(hy - 44)} Q0,${f2(hy - 56)} 34,${f2(hy - 44)} M-22,${f2(hy - 18)} Q0,${f2(hy - 26)} 24,${f2(hy - 18)}" fill="none" stroke="${sheen}" stroke-width="3" stroke-linecap="round" opacity=".48"/>`;
    return s;
  }

  if (side) {
    if (o.hair === 'buzz') {
      return `<path d="M-66,${f2(hy + 12)} C-74,${f2(hy - 48)} -20,${f2(hy - 74)} 36,${f2(hy - 60)} C48,${f2(hy - 56)} 56,${f2(hy - 44)} 52,${f2(hy - 32)} C22,${f2(hy - 44)} -16,${f2(hy - 34)} -32,${f2(hy + 10)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.2"/>`;
    }
    if (o.hair === 'spiky') {
      return `<path d="M-56,${f2(hy + 12)} L-78,${f2(hy - 18)} L-54,${f2(hy - 34)} L-68,${f2(hy - 66)} L-28,${f2(hy - 58)} L-14,${f2(hy - 96)} L14,${f2(hy - 66)} L48,${f2(hy - 80)} L44,${f2(hy - 46)} C66,${f2(hy - 40)} 68,${f2(hy - 24)} 48,${f2(hy - 20)} C16,${f2(hy - 32)} -16,${f2(hy - 24)} -28,${f2(hy + 12)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.2" stroke-linejoin="round"/>`;
    }
    if (o.hair === 'tousled' || o.hair === 'side-part') {
      return `<path d="M-68,${f2(hy + 14)} C-80,${f2(hy - 44)} -32,${f2(hy - 84)} 32,${f2(hy - 68)} C62,${f2(hy - 60)} 74,${f2(hy - 34)} 54,${f2(hy - 24)} C28,${f2(hy - 38)} -6,${f2(hy - 34)} -28,${f2(hy + 10)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.4" stroke-linejoin="round"/><path d="M-24,${f2(hy - 56)} Q14,${f2(hy - 64)} 42,${f2(hy - 44)}" fill="none" stroke="${sheen}" stroke-width="3" stroke-linecap="round" opacity=".5"/>`;
    }
    // Swept crown for ponytail/bob/long-wavy/pigtails/twin-buns/curly-afro
    return `<path d="M-66,${f2(hy + 10)} C-76,${f2(hy - 46)} -24,${f2(hy - 78)} 34,${f2(hy - 64)} C58,${f2(hy - 56)} 66,${f2(hy - 36)} 52,${f2(hy - 28)} C22,${f2(hy - 44)} -16,${f2(hy - 32)} -30,${f2(hy + 12)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.4" stroke-linejoin="round"/>`;
  }

  // Front hair crown
  if (o.hair === 'buzz') {
    return `<path d="M-70,${f2(hy - 10)} C-62,${f2(hy - 66)} 62,${f2(hy - 66)} 70,${f2(hy - 10)} C42,${f2(hy - 38)} -42,${f2(hy - 38)} -70,${f2(hy - 10)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.2"/>`;
  }
  if (o.hair === 'spiky') {
    return `<path d="M-70,${f2(hy - 10)} L-84,${f2(hy - 44)} L-56,${f2(hy - 48)} L-52,${f2(hy - 88)} L-22,${f2(hy - 64)} L0,${f2(hy - 102)} L24,${f2(hy - 64)} L54,${f2(hy - 86)} L56,${f2(hy - 48)} L84,${f2(hy - 44)} L70,${f2(hy - 10)} C40,${f2(hy - 38)} -40,${f2(hy - 38)} -70,${f2(hy - 10)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.2" stroke-linejoin="round"/>`;
  }
  if (o.hair === 'tousled') {
    return `<path d="M-72,${f2(hy - 4)} C-80,${f2(hy - 46)} -48,${f2(hy - 84)} 0,${f2(hy - 78)} C48,${f2(hy - 84)} 80,${f2(hy - 46)} 72,${f2(hy - 4)} C54,${f2(hy - 36)} 26,${f2(hy - 30)} 8,${f2(hy - 14)} C-6,${f2(hy - 32)} -34,${f2(hy - 36)} -72,${f2(hy - 4)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.2" stroke-linejoin="round"/><path d="M-38,${f2(hy - 56)} Q0,${f2(hy - 68)} 38,${f2(hy - 56)}" fill="none" stroke="${sheen}" stroke-width="3" stroke-linecap="round" opacity=".5"/>`;
  }
  if (o.hair === 'curly-afro') {
    return `<path d="M-72,${f2(hy - 8)} C-64,${f2(hy - 58)} 64,${f2(hy - 58)} 72,${f2(hy - 8)} C44,${f2(hy - 32)} 16,${f2(hy - 28)} 0,${f2(hy - 34)} C-16,${f2(hy - 28)} -44,${f2(hy - 32)} -72,${f2(hy - 8)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.2"/>`;
  }
  // Parted front crown (ponytail / long-wavy / bob / side-part / twin-buns / pigtails)
  return `<path d="M-73,${f2(hy - 4)} C-76,${f2(hy - 62)} -16,${f2(hy - 78)} 24,${f2(hy - 72)} C64,${f2(hy - 66)} 76,${f2(hy - 32)} 73,${f2(hy - 4)} C52,${f2(hy - 34)} 18,${f2(hy - 48)} -8,${f2(hy - 52)} C-34,${f2(hy - 44)} -58,${f2(hy - 26)} -73,${f2(hy - 4)} Z" fill="${hc}" stroke="${ink}" stroke-width="4.2" stroke-linejoin="round"/><path d="M-38,${f2(hy - 52)} Q0,${f2(hy - 64)} 40,${f2(hy - 52)}" fill="none" stroke="${sheen}" stroke-width="3" stroke-linecap="round" opacity=".5"/>`;
}

function renderStickHeadwear(o, view, hy, ink) {
  if (o.headwear === 'none') return '';
  const side = view === 's';
  const back = view === 'b';
  if (o.headwear === 'cap') {
    const capC = '#d9534f';
    const brimC = '#b23b38';
    if (side) {
      return `<path d="M-64,${f2(hy - 34)} C-54,${f2(hy - 84)} 48,${f2(hy - 86)} 62,${f2(hy - 36)} Z" fill="${capC}" stroke="${ink}" stroke-width="4.2" stroke-linejoin="round"/><path d="M26,${f2(hy - 38)} L102,${f2(hy - 24)} Q92,${f2(hy - 14)} 22,${f2(hy - 28)} Z" fill="${brimC}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>`;
    }
    if (back) {
      return `<path d="M-70,${f2(hy - 32)} C-62,${f2(hy - 84)} 62,${f2(hy - 84)} 70,${f2(hy - 32)} Z" fill="${capC}" stroke="${ink}" stroke-width="4.2"/><rect x="-26" y="${f2(hy - 42)}" width="52" height="14" rx="7" fill="${brimC}" stroke="${ink}" stroke-width="3.2"/>`;
    }
    return `<path d="M-70,${f2(hy - 34)} C-62,${f2(hy - 84)} 62,${f2(hy - 84)} 70,${f2(hy - 34)} Z" fill="${capC}" stroke="${ink}" stroke-width="4.2"/><path d="M-64,${f2(hy - 34)} Q0,${f2(hy - 54)} 74,${f2(hy - 32)} Q0,${f2(hy - 20)} -64,${f2(hy - 34)} Z" fill="${brimC}" stroke="${ink}" stroke-width="4"/>`;
  }
  if (o.headwear === 'beanie') {
    const bc = '#e59a3c';
    const bc2 = '#c97e24';
    const w = side ? 66 : 72;
    return `<path d="M-${w},${f2(hy - 34)} C-${w - 4},${f2(hy - 90)} ${w - 4},${f2(hy - 90)} ${w},${f2(hy - 34)} Z" fill="${bc}" stroke="${ink}" stroke-width="4.2"/><circle cx="0" cy="${f2(hy - 86)}" r="13" fill="${bc}" stroke="${ink}" stroke-width="3.8"/><rect x="-${w + 2}" y="${f2(hy - 42)}" width="${(w + 2) * 2}" height="20" rx="9" fill="${bc2}" stroke="${ink}" stroke-width="4"/>`;
  }
  if (o.headwear === 'bucket') {
    const gc = '#6e9f7d';
    const w = side ? 64 : 68;
    return `<path d="M-${w * 0.78},${f2(hy - 38)} L-${w * 0.62},${f2(hy - 82)} H${w * 0.62} L${w * 0.78},${f2(hy - 38)} Z" fill="${gc}" stroke="${ink}" stroke-width="4.2"/><ellipse cx="0" cy="${f2(hy - 36)}" rx="${w + 22}" ry="14" fill="${shadeHex(gc, 0.88)}" stroke="${ink}" stroke-width="4.2"/>`;
  }
  if (o.headwear === 'headphones') {
    if (side) {
      return `<path d="M-26,${f2(hy)} C-28,${f2(hy - 86)} 22,${f2(hy - 88)} 26,${f2(hy - 62)}" fill="none" stroke="${ink}" stroke-width="11" stroke-linecap="round"/><path d="M-26,${f2(hy)} C-28,${f2(hy - 86)} 22,${f2(hy - 88)} 26,${f2(hy - 62)}" fill="none" stroke="#424954" stroke-width="5" stroke-linecap="round"/><rect x="-40" y="${f2(hy - 18)}" width="24" height="44" rx="11" fill="#2e343d" stroke="${ink}" stroke-width="4"/>`;
    }
    return `<path d="M-76,${f2(hy - 4)} C-78,${f2(hy - 88)} 78,${f2(hy - 88)} 76,${f2(hy - 4)}" fill="none" stroke="${ink}" stroke-width="11" stroke-linecap="round"/><path d="M-76,${f2(hy - 4)} C-78,${f2(hy - 88)} 78,${f2(hy - 88)} 76,${f2(hy - 4)}" fill="none" stroke="#424954" stroke-width="5" stroke-linecap="round"/><rect x="-86" y="${f2(hy - 22)}" width="22" height="44" rx="10" fill="#2e343d" stroke="${ink}" stroke-width="4"/><rect x="64" y="${f2(hy - 22)}" width="22" height="44" rx="10" fill="#2e343d" stroke="${ink}" stroke-width="4"/>`;
  }
  if (o.headwear === 'headband') {
    return `<path d="M-${side ? 54 : 68},${f2(hy - 36)} Q0,${f2(hy - 72)} ${side ? 54 : 68},${f2(hy - 36)}" fill="none" stroke="#e780a2" stroke-width="10" stroke-linecap="round"/>`;
  }
  return '';
}

function renderStickShoe(x, y, side, back, style, shoeCol, accentCol, ink) {
  const fill = style === 'boots' && shoeCol === '#ffffff' ? '#4b3b34' : shoeCol;
  const topY = style === 'boots' ? y - 28 : style === 'hightops' ? y - 22 : y - 14;
  if (side) {
    // Facing cleanly RIGHT (+x) in profile with flat sole resting at y+14 (ground 880)
    return `<g transform="translate(${f2(x)},${f2(y)})">
      <path d="M-18,${f2(topY - y)} L12,${f2(topY - y)} Q24,${f2((topY - y) * 0.3)} 44,4 Q54,10 46,16 H-22 Q-26,4 -18,${f2(topY - y)} Z" fill="${fill}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
      <rect x="-23" y="10" width="72" height="7" rx="3.5" fill="#ffffff" stroke="${ink}" stroke-width="3.2"/>
      <path d="M12,${f2((topY - y) * 0.45)} H30" stroke="${accentCol}" stroke-width="3.2" stroke-linecap="round"/>
    </g>`;
  }
  if (back) {
    return `<g transform="translate(${f2(x)},${f2(y)})">
      <rect x="-18" y="${f2(topY - y)}" width="36" height="${f2(y - topY + 12)}" rx="9" fill="${fill}" stroke="${ink}" stroke-width="4"/>
      <rect x="-20" y="9" width="40" height="7" rx="3.5" fill="#ffffff" stroke="${ink}" stroke-width="3.2"/>
      <path d="M-8,${f2((topY - y) + 4)} V6" stroke="${shadeHex(fill, 0.72)}" stroke-width="3" stroke-linecap="round"/>
    </g>`;
  }
  // Front shoe
  return `<g transform="translate(${f2(x)},${f2(y)})">
    <path d="M-19,${f2(topY - y)} H19 Q25,2 28,12 H-25 Q-25,2 -19,${f2(topY - y)} Z" fill="${fill}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
    <rect x="-26" y="10" width="54" height="7" rx="3.5" fill="#ffffff" stroke="${ink}" stroke-width="3.2"/>
    <path d="M-9,-4 H9 M-9,2 H9" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>
  </g>`;
}

// A talking mouth drawn from the mouth shape of the word being said (see public/motion-polish.js): pressed lips for M B P,
// teeth on the lip for F V, a round O or U, a wide E, a tall open A, with teeth and tongue showing as the jaw opens.
function renderStickTalkMouth(mp, my, ink) {
  const open = CL(mp.open, 0, 1);
  const lip = '#2a0f14', tongueC = '#d9707a';
  if (mp.press > 0.5 && open < 0.1) {
    return `<path d="M-19,${f2(my + 1)} Q0,${f2(my + 5)} 19,${f2(my + 1)}" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/><path d="M-12,${f2(my + 4)} Q0,${f2(my + 8)} 12,${f2(my + 4)}" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>`;
  }
  if (mp.fv > 0.5) {
    const w = 20, h = 9;
    return `<path d="M-${w},${f2(my - 2)} Q0,${f2(my)} ${w},${f2(my - 2)} Q${w - 3},${f2(my + h)} 0,${f2(my + h)} Q-${w - 3},${f2(my + h)} -${w},${f2(my - 2)} Z" fill="${lip}" stroke="${ink}" stroke-width="3.6"/>` +
      `<path d="M-${w - 3},${f2(my - 1)} Q0,${f2(my + 1)} ${w - 3},${f2(my - 1)} L${w - 5},${f2(my + 5)} Q0,${f2(my + 7)} -${w - 5},${f2(my + 5)} Z" fill="#ffffff"/>` +
      `<path d="M-${w - 5},${f2(my + 7)} Q0,${f2(my + 13)} ${w - 5},${f2(my + 7)}" fill="none" stroke="#c9566a" stroke-width="3.4" stroke-linecap="round"/>`;
  }
  const wide = CL(mp.wide, -1, 1);
  const mh = 6 + open * 24;
  const mw = wide >= 0 ? 21 + wide * 9 : 21 + wide * 10;        // stretched for E, narrow for O and U
  if (wide < -0.35) {
    // round mouth (O, U)
    const rx = Math.max(7, mw * 0.58), ry = Math.max(7, mh * 0.62 + 2);
    return `<ellipse cx="0" cy="${f2(my + ry * 0.55)}" rx="${f2(rx)}" ry="${f2(ry)}" fill="${lip}" stroke="${ink}" stroke-width="3.8"/>` +
      (open > 0.5 ? `<ellipse cx="0" cy="${f2(my + ry * 0.55 + ry * 0.45)}" rx="${f2(rx * 0.62)}" ry="${f2(ry * 0.34)}" fill="${tongueC}"/>` : '');
  }
  const top = my - 3;
  const path = `M-${f2(mw)},${f2(top)} Q0,${f2(top + 2 - wide * 2)} ${f2(mw)},${f2(top)} Q${f2(mw - 2)},${f2(my + mh)} 0,${f2(my + mh)} Q-${f2(mw - 2)},${f2(my + mh)} -${f2(mw)},${f2(top)} Z`;
  let g = `<path d="${path}" fill="${lip}" stroke="${ink}" stroke-width="3.8" stroke-linejoin="round"/>`;
  if (mp.teeth > 0.4 && open > 0.2) {
    const th = Math.min(7, mh * 0.34);
    g += `<path d="M-${f2(mw - 4)},${f2(top + 1.5)} Q0,${f2(top + 3.5 - wide * 2)} ${f2(mw - 4)},${f2(top + 1.5)} L${f2(mw - 5)},${f2(top + 1.5 + th)} Q0,${f2(top + th + 3)} -${f2(mw - 5)},${f2(top + 1.5 + th)} Z" fill="#ffffff"/>`;
  }
  if (mp.tongue > 0.25 && open > 0.25) {
    const ty = mp.tongue > 0.8 ? top + 11 : my + mh - 5;
    g += `<ellipse cx="0" cy="${f2(ty)}" rx="${f2(Math.min(12, mw * 0.5))}" ry="${f2(2.6 + open * 3.2)}" fill="${tongueC}"/>`;
  }
  return g;
}


// 2.5D head turn: the body keeps facing the camera, only the face slides and squeezes sideways inside the head (yaw -1..1, pitch -1..1).
// The far side of the face gets narrower (foreshortening) and a small nose line appears on the side being looked at, which reads as depth.
export function turnHead(face, yaw, pitch, hy, ink, o) {
  const y = CL(+yaw || 0, -1, 1), p = CL(+pitch || 0, -1, 1);
  if (Math.abs(y) < 0.02 && Math.abs(p) < 0.02) return face;
  const ay = Math.abs(y), sx = 1 - 0.24 * ay, sh = 36 * y, py = p * 7 + ay * 1.5;
  const nose = ay > 0.2
    ? `<path d="M${f2(y * 2)},${f2(hy + 1)} Q${f2(y * 15)},${f2(hy + 8)} ${f2(y * 13)},${f2(hy + 17)} Q${f2(y * 6)},${f2(hy + 20)} ${f2(-y * 2)},${f2(hy + 17)}" fill="none" stroke="${ink}" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round" opacity="${f2(Math.min(0.95, ay * 1.5))}"/>`
    : '';
  return `<g transform="translate(${f2(sh)},${f2(py)}) scale(${f2(sx)},1)">${face}${nose}</g>`;
}
export function turnHair(hair, yaw, pitch) {
  const y = CL(+yaw || 0, -1, 1), p = CL(+pitch || 0, -1, 1);
  if (Math.abs(y) < 0.02 && Math.abs(p) < 0.02) return hair;
  return `<g transform="translate(${f2(9 * y)},${f2(p * 3)}) scale(${f2(1 - 0.045 * Math.abs(y))},1)">${hair}</g>`;
}
function renderStickFace(o, side, hy, blk, talk, mo, ink, emo) {
  const E = emo && typeof emo === 'object' ? emo : null;
  const ex = o.expression;
  const es = o.eyeSize;
  const sp = o.eyeSpace;
  const bm = o.browMood;
  const sm = o.smile;
  const hasGlint = (o.dna && o.dna.eyeStyle === 'glint') || ex === 'quirky' || ex === 'cool';
  const mouthOpenAmt = talk ? CL(mo, 0.08, 1) : 0;

  let eyeS = '';
  const drawEye = (cx, cy, kind) => {
    if (kind === 'happy') {
      return `<path d="M${f2(cx - 12)},${f2(cy + 3)} Q${f2(cx)},${f2(cy - 10)} ${f2(cx + 12)},${f2(cy + 3)}" fill="none" stroke="${ink}" stroke-width="4.5" stroke-linecap="round"/>`;
    }
    if (kind === 'sleepy') {
      return `<path d="M${f2(cx - 12)},${f2(cy + 1)} Q${f2(cx)},${f2(cy + 7)} ${f2(cx + 12)},${f2(cy + 1)}" fill="none" stroke="${ink}" stroke-width="4.2" stroke-linecap="round"/>`;
    }
    if (kind === 'wide') {
      return `<g transform="translate(${f2(cx)},${f2(cy)}) scale(1,${f2(Math.max(0.1, blk))})"><circle cx="0" cy="0" r="${f2(14 * es)}" fill="#ffffff" stroke="${ink}" stroke-width="4"/><circle cx="${side ? 3 : 0}" cy="0" r="${f2(6.5 * es)}" fill="${ink}"/></g>`;
    }
    const ry = 13.5 * es * Math.max(0.08, blk);
    const rx = (side ? 8.5 : 10) * es;
    return `<ellipse cx="${f2(cx)}" cy="${f2(cy)}" rx="${f2(rx)}" ry="${f2(ry)}" fill="${ink}"/>` +
      (hasGlint && blk > 0.45 ? `<circle cx="${f2(cx + (side ? 2 : -3))}" cy="${f2(cy - 4 * es)}" r="${f2(2.8 * es)}" fill="#ffffff"/>` : '');
  };

  let lm = 'open';
  let rm = 'open';
  if (ex === 'happy') lm = rm = 'happy';
  else if (ex === 'wink') rm = 'happy';
  else if (ex === 'chill') lm = rm = 'sleepy';
  else if (ex === 'surprised') lm = rm = 'wide';

  const eyeY = hy - 2;
  const yl = ex === 'surprised' ? -8 : ex === 'chill' ? 4 : 0;
  const tl = bm * 0.85;
  const bw = o.gender === 'male' ? 4.4 : 3.8;

  if (side) {
    const ecx = 40 + sp * 0.5;
    eyeS = drawEye(ecx, eyeY, rm);
    // Profile brow
    const bY0 = hy - 26 + yl + tl * 0.5;
    const bY1 = hy - 28 + yl - tl * 0.45;
    const brow = `<path d="M${f2(ecx - 13)},${f2(bY0)} Q${f2(ecx)},${f2(Math.min(bY0, bY1) - 5)} ${f2(ecx + 14)},${f2(bY1)}" fill="none" stroke="${ink}" stroke-width="${bw}" stroke-linecap="round"/>`;
    // Cute profile nose bridge + ear
    const nose = `<path d="M68,${f2(hy - 8)} Q84,${f2(hy + 3)} 67,${f2(hy + 12)}" fill="${o.skin}" stroke="${ink}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
    const ear = `<ellipse cx="-20" cy="${f2(hy + 6)}" rx="7" ry="11" fill="${o.skin}" stroke="${ink}" stroke-width="3.6"/><path d="M-21,${f2(hy + 2)} Q-17,${f2(hy + 6)} -20,${f2(hy + 10)}" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`;
    // Profile mouth on right contour
    let mouth = '';
    const my = hy + 30;
    if (talk && mouthOpenAmt > 0.05) {
      const mh = 5 + mouthOpenAmt * 17;
      mouth = `<path d="M40,${f2(my - 2)} Q58,${f2(my - 2)} 65,${f2(my)} Q62,${f2(my + mh)} 48,${f2(my + mh)} Q38,${f2(my + mh * 0.6)} 40,${f2(my - 2)} Z" fill="#2a0f14" stroke="${ink}" stroke-width="3.5"/><ellipse cx="52" cy="${f2(my + mh - 3)}" rx="6" ry="${f2(2 + mouthOpenAmt * 2.5)}" fill="#d9707a"/>`;
    } else if (ex === 'happy') {
      mouth = `<path d="M36,${f2(my - 2)} Q54,${f2(my + 2)} 66,${f2(my - 8)} Q60,${f2(my + 18)} 36,${f2(my - 2)} Z" fill="#2a0f14" stroke="${ink}" stroke-width="3.5"/>`;
    } else if (ex === 'surprised') {
      mouth = `<ellipse cx="54" cy="${f2(my + 2)}" rx="8" ry="10" fill="#2a0f14" stroke="${ink}" stroke-width="3.5"/>`;
    } else if (sm < 0) {
      mouth = `<path d="M38,${f2(my + 6)} Q52,${f2(my - 4)} 64,${f2(my + 6)}" fill="none" stroke="${ink}" stroke-width="3.8" stroke-linecap="round"/>`;
    } else {
      const lift = CL(sm, 0, 14) * 0.9;
      mouth = `<path d="M38,${f2(my + 2)} Q52,${f2(my + 8)} 65,${f2(my + 2 - lift)}" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
    }
    let eyeWear = '';
    if (o.eyewear === 'round') {
      eyeWear = `<circle cx="${f2(ecx)}" cy="${f2(eyeY)}" r="21" fill="rgba(210,235,255,0.22)" stroke="${ink}" stroke-width="3.8"/><path d="M${f2(ecx - 21)},${f2(eyeY - 2)} L-14,${f2(eyeY - 2)}" stroke="${ink}" stroke-width="3.8"/>`;
    } else if (o.eyewear === 'square') {
      eyeWear = `<rect x="${f2(ecx - 20)}" y="${f2(eyeY - 17)}" width="38" height="32" rx="6" fill="rgba(255,255,255,0.18)" stroke="${ink}" stroke-width="4.2"/><path d="M${f2(ecx - 20)},${f2(eyeY - 4)} L-14,${f2(eyeY - 2)}" stroke="${ink}" stroke-width="4"/>`;
    } else if (o.eyewear === 'shades' || o.eyewear === 'pinkshades') {
      const sf = o.eyewear === 'pinkshades' ? '#eb7399' : '#181818';
      eyeWear = `<rect x="${f2(ecx - 22)}" y="${f2(eyeY - 16)}" width="42" height="32" rx="8" fill="${sf}" stroke="${ink}" stroke-width="4.2"/><path d="M${f2(ecx - 22)},${f2(eyeY - 5)} L-14,${f2(eyeY - 2)}" stroke="${ink}" stroke-width="4.2"/>`;
    }
    return ear + nose + eyeS + brow + mouth + eyeWear;
  }

  // Front face
  const lx = -28 - sp;
  const rx = 28 + sp;
  let brows = '', mouth = '', fxMarkup = '';
  if (E) {
    // the face is acting (public/expressions.js): eye shape and lids, brow slant and lift, mouth shape, gaze, tears, sweat, blush
    const fe = renderStickFaceEmo(o, E, hy, blk, talk, mo, ink, lx, rx, eyeY);
    eyeS = fe.eyes; brows = fe.brows; mouth = fe.mouth; fxMarkup = fe.fx;
  } else {
    eyeS = drawEye(lx, eyeY, lm) + drawEye(rx, eyeY, rm);
    const lo = hy - 25 + yl + tl * 0.55;
    const li = hy - 29 + yl - tl * 0.7;
    const ri = hy - 29 + yl - tl * 0.7;
    const ro = hy - 25 + yl + tl * 0.55;
    brows = `<path d="M${f2(lx - 14)},${f2(lo)} Q${f2(lx)},${f2(Math.min(lo, li) - 5)} ${f2(lx + 12)},${f2(li)}" fill="none" stroke="${ink}" stroke-width="${bw}" stroke-linecap="round"/><path d="M${f2(rx - 12)},${f2(ri)} Q${f2(rx)},${f2(Math.min(ri, ro) - 5)} ${f2(rx + 14)},${f2(ro)}" fill="none" stroke="${ink}" stroke-width="${bw}" stroke-linecap="round"/>`;

    mouth = '';
    const my = hy + 30;
    const mp = talk ? mouthParams(mo) : null;
    if (talk && mp && (mp.open > 0.06 || mp.fv > 0.5 || mp.press > 0.5)) {
      mouth = renderStickTalkMouth(mp, my, ink);
    } else if (talk && mp) {
      // a pause between words: lips closed, with the curve of the person's expression
      const cd = (ex === 'happy' ? 12 : o.smile) * 1.15;
      mouth = `<path d="M-22,${f2(my + 3 - cd * 0.2)} Q0,${f2(my + 5 + cd)} 22,${f2(my + 3 - cd * 0.4)}" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
    } else if (ex === 'happy') {
      mouth = `<path d="M-24,${f2(my - 4)} Q0,${f2(my + 2)} 24,${f2(my - 4)} Q18,${f2(my + 22)} 0,${f2(my + 22)} Q-18,${f2(my + 22)} -24,${f2(my - 4)} Z" fill="#2a0f14" stroke="${ink}" stroke-width="3.8"/><ellipse cx="0" cy="${f2(my + 16)}" rx="10" ry="5" fill="#d9707a"/>`;
    } else if (ex === 'surprised') {
      mouth = `<ellipse cx="0" cy="${f2(my + 4)}" rx="10" ry="12" fill="#2a0f14" stroke="${ink}" stroke-width="3.8"/>`;
    } else if (ex === 'shy') {
      mouth = `<path d="M-18,${f2(my + 4)} Q-8,${f2(my - 2)} 0,${f2(my + 4)} Q8,${f2(my + 10)} 18,${f2(my + 2)}" fill="none" stroke="${ink}" stroke-width="3.8" stroke-linecap="round"/>`;
    } else if (ex === 'cool') {
      mouth = `<path d="M-16,${f2(my + 4)} Q4,${f2(my + 6)} 22,${f2(my - 5)}" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
    } else {
      const cd = sm * 1.15;
      mouth = `<path d="M-22,${f2(my + 3 - cd * 0.2)} Q0,${f2(my + 5 + cd)} 22,${f2(my + 3 - cd * 0.4)}" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
    }
  }

  let blush = '';
  if (o.acc.includes('blush')) {
    blush = `<ellipse cx="-44" cy="${f2(hy + 16)}" rx="11" ry="6" fill="#f49fb6" opacity=".62"/><ellipse cx="44" cy="${f2(hy + 16)}" rx="11" ry="6" fill="#f49fb6" opacity=".62"/>`;
  }

  let facialHair = '';
  if (o.facialHair === 'mustache') {
    facialHair = `<path d="M0,${f2(hy + 22)} Q-16,${f2(hy + 16)} -26,${f2(hy + 28)} Q-12,${f2(hy + 28)} 0,${f2(hy + 25)} Q12,${f2(hy + 28)} 26,${f2(hy + 28)} Q16,${f2(hy + 16)} 0,${f2(hy + 22)} Z" fill="${o.hairc}" stroke="${ink}" stroke-width="3"/>`;
  } else if (o.facialHair === 'goatee') {
    facialHair = `<path d="M-16,${f2(hy + 44)} Q0,${f2(hy + 40)} 16,${f2(hy + 44)} Q12,${f2(hy + 66)} 0,${f2(hy + 66)} Q-12,${f2(hy + 66)} -16,${f2(hy + 44)} Z" fill="${o.hairc}" stroke="${ink}" stroke-width="3"/>`;
  } else if (o.facialHair === 'beard') {
    facialHair = `<path d="M-66,${f2(hy + 12)} C-58,${f2(hy + 64)} 58,${f2(hy + 64)} 66,${f2(hy + 12)} C48,${f2(hy + 30)} 24,${f2(hy + 26)} 0,${f2(hy + 24)} C-24,${f2(hy + 26)} -48,${f2(hy + 30)} -66,${f2(hy + 12)} Z" fill="${o.hairc}" stroke="${ink}" stroke-width="3.6"/>`;
  }

  let eyeWear = '';
  if (o.eyewear === 'round') {
    eyeWear = `<circle cx="${f2(lx)}" cy="${f2(eyeY)}" r="21" fill="rgba(210,235,255,0.22)" stroke="${ink}" stroke-width="3.8"/><circle cx="${f2(rx)}" cy="${f2(eyeY)}" r="21" fill="rgba(210,235,255,0.22)" stroke="${ink}" stroke-width="3.8"/><path d="M${f2(lx + 21)},${f2(eyeY)} H${f2(rx - 21)} M${f2(lx - 21)},${f2(eyeY)} L-72,${f2(eyeY - 2)} M${f2(rx + 21)},${f2(eyeY)} L72,${f2(eyeY - 2)}" stroke="${ink}" stroke-width="3.8"/>`;
  } else if (o.eyewear === 'square') {
    eyeWear = `<rect x="${f2(lx - 22)}" y="${f2(eyeY - 17)}" width="42" height="32" rx="6" fill="rgba(255,255,255,0.18)" stroke="${ink}" stroke-width="4.2"/><rect x="${f2(rx - 20)}" y="${f2(eyeY - 17)}" width="42" height="32" rx="6" fill="rgba(255,255,255,0.18)" stroke="${ink}" stroke-width="4.2"/><path d="M${f2(lx + 20)},${f2(eyeY - 3)} H${f2(rx - 20)} M${f2(lx - 22)},${f2(eyeY - 4)} L-72,${f2(eyeY - 3)} M${f2(rx + 22)},${f2(eyeY - 4)} L72,${f2(eyeY - 3)}" stroke="${ink}" stroke-width="4"/>`;
  } else if (o.eyewear === 'shades' || o.eyewear === 'pinkshades') {
    const sf = o.eyewear === 'pinkshades' ? '#eb7399' : '#181818';
    eyeWear = `<rect x="${f2(lx - 24)}" y="${f2(eyeY - 17)}" width="46" height="33" rx="8" fill="${sf}" stroke="${ink}" stroke-width="4.2"/><rect x="${f2(rx - 22)}" y="${f2(eyeY - 17)}" width="46" height="33" rx="8" fill="${sf}" stroke="${ink}" stroke-width="4.2"/><path d="M${f2(lx + 22)},${f2(eyeY - 4)} H${f2(rx - 22)} M${f2(lx - 24)},${f2(eyeY - 4)} L-72,${f2(eyeY - 2)} M${f2(rx + 24)},${f2(eyeY - 4)} L72,${f2(eyeY - 2)}" stroke="${ink}" stroke-width="4.2"/><path d="M${f2(lx - 12)},${f2(eyeY - 8)} L${f2(lx - 2)},${f2(eyeY + 8)} M${f2(rx - 10)},${f2(eyeY - 8)} L${f2(rx)},${f2(eyeY + 8)}" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" opacity=".65"/>`;
  }

  let wrinkles = '';
  if (o.age >= 52) {
    wrinkles = `<path d="M-24,${f2(hy - 44)} Q0,${f2(hy - 48)} 24,${f2(hy - 44)}" fill="none" stroke="${ink}" stroke-width="2" opacity=".4"/>`;
  }

  return wrinkles + blush + eyeS + brows + facialHair + mouth + eyeWear + fxMarkup;
}

/**
 * The stickman's face when it is acting (E = the dials from public/expressions.js, passed in the pose as P.emo).
 * Eyes: round dots, wide whites, happy arcs, squeezed shut, with heavy or angry lids drawn over them; brows: slant and lift, one can rise higher;
 * mouth: a shape for each feeling; extras: sweat, tears, blush, an anger vein, sparkles.
 */
function renderStickFaceEmo(o, E, hy, blk, talk, mo, ink, lx, rx, eyeY) {
  const es = o.eyeSize || 1;
  const eye = CL(+E.eye || 1, 0.15, 1.5);
  const tilt = CL(+E.tilt || 0, -1.4, 1.4);
  const gxp = CL((+E.gx || 0) * 4.5, -5, 5), gyp = CL((+E.gy || 0) * 3.5, -4, 4);
  const ek = E.ek || 'open';
  const k = CL(+E.k || 1, 0.2, 1.5);
  const f = (n) => f2(n);
  const bw = o.gender === 'male' ? 4.4 : 3.8;
  const hasGlint = (o.dna && o.dna.eyeStyle === 'glint') || o.expression === 'quirky' || o.expression === 'cool';

  // ---- eyes ----
  const oneEye = (cx, side) => {          // side: -1 = the eye on the screen's left (its outer corner is on the left), +1 = the right eye
    const cy = eyeY;
    let g = '';
    if (ek === 'arc') {
      g = `<path d="M${f(cx - 12)},${f(cy + 4)} Q${f(cx)},${f(cy - 11)} ${f(cx + 12)},${f(cy + 4)}" fill="none" stroke="${ink}" stroke-width="4.6" stroke-linecap="round"/>`;
    } else if (ek === 'closed') {
      const s2 = -side;                   // the squeezed-shut ">" "<" point toward the nose
      g = `<path d="M${f(cx - s2 * 10)},${f(cy - 8)} L${f(cx + s2 * 8)},${f(cy)} L${f(cx - s2 * 10)},${f(cy + 8)}" fill="none" stroke="${ink}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else if (ek === 'wide') {
      const r = 14 * es * CL(eye / 1.15, 0.9, 1.25);
      g = `<g transform="translate(${f(cx)},${f(cy)}) scale(1,${f(Math.max(0.1, blk))})"><circle cx="0" cy="0" r="${f(r)}" fill="#ffffff" stroke="${ink}" stroke-width="4"/><circle cx="${f(gxp * 1.3)}" cy="${f(gyp * 1.2)}" r="${f(6.2 * es * (1.15 - (eye - 1) * 0.3))}" fill="${ink}"/></g>`;
    } else {
      const ry = 13.5 * es * Math.max(0.08, blk) * CL(eye > 1 ? 1 + (eye - 1) * 0.6 : 1, 1, 1.25);
      const rxe = 10 * es;
      g = `<ellipse cx="${f(cx + gxp)}" cy="${f(cy + gyp)}" rx="${f(rxe)}" ry="${f(ry)}" fill="${ink}"/>` +
        (hasGlint && blk > 0.45 ? `<circle cx="${f(cx + gxp - 3)}" cy="${f(cy + gyp - 4 * es)}" r="${f(2.8 * es)}" fill="#ffffff"/>` : '');
      // lids: heavy (tired, bored, smug), angry (inner end low) or sad (outer end low); a skin-coloured lid is drawn over the top of the eye
      const flat = ek === 'lid' || eye < 0.9 ? CL(1 - eye, 0, 0.78) * 24 : 0;
      const angry = CL(-tilt, 0, 1.3), sad = ek === 'lid' || eye < 1 ? CL(tilt, 0, 1.2) : 0;
      const inner = flat + angry * 13 + sad * 1, outer = flat + angry * 2 + sad * 9;
      if (inner + outer > 3) {
        const xo = cx + side * 17, xi = cx - side * 17;
        const yo = cy - 15 + outer, yi = cy - 15 + inner;
        g += `<path d="M${f(xo - side * 4)},${f(cy - 34)} L${f(xi + side * 4)},${f(cy - 34)} L${f(xi + side * 4)},${f(yi)} L${f(xo - side * 4)},${f(yo)} Z" fill="${o.skin}"/>` +
          `<path d="M${f(xo)},${f(yo)} L${f(xi)},${f(yi)}" stroke="${ink}" stroke-width="3.8" stroke-linecap="round"/>`;
      }
    }
    return g;
  };
  const eyes = oneEye(lx, -1) + oneEye(rx, 1);

  // ---- brows: the same slant formula as the old face, with a lift and a higher brow for doubt ----
  const tl = tilt * 7.6, lift = -(+E.raise || 0) * 9, as = CL(+E.as || 0, 0, 1);
  let lo = hy - 25 + lift + tl * 0.55 + as * 1.5, li = hy - 29 + lift - tl * 0.7 + as * 1.5;
  let ro = hy - 25 + lift + tl * 0.55 - as * 7, ri = hy - 29 + lift - tl * 0.7 - as * 7;
  {
    // the hair is drawn over the top of the face, so keep the brows below the hairline (the eyes and mouth carry the rest of a big lift)
    const top = Math.min(lo, li, ro, ri), floor = hy - 31;
    if (top < floor) { const d = floor - top; lo += d; li += d; ro += d; ri += d; }
  }
  const bwt = bw * (1 + CL(-tilt, 0, 1.2) * 0.22);
  const ctl = (a, b) => Math.min(a, b) - 5 + CL(-tilt, 0, 1) * 4;
  const brows = `<path d="M${f(lx - 14)},${f(lo)} Q${f(lx)},${f(ctl(lo, li))} ${f(lx + 12)},${f(li)}" fill="none" stroke="${ink}" stroke-width="${f(bwt)}" stroke-linecap="round"/><path d="M${f(rx - 12)},${f(ri)} Q${f(rx)},${f(ctl(ri, ro))} ${f(rx + 14)},${f(ro)}" fill="none" stroke="${ink}" stroke-width="${f(bwt)}" stroke-linecap="round"/>`;

  // ---- mouth ----
  const my = hy + 30;
  const mf = E.mf || 'smile', op = CL(+E.open || 0, 0, 1);
  const dark = '#2a0f14';
  const curve = (cd) => `<path d="M-22,${f(my + 3 - cd * 0.2)} Q0,${f(my + 5 + cd)} 22,${f(my + 3 - cd * 0.4)}" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
  const mp = talk ? mouthParams(mo) : null;
  let mouth;
  if (talk && mp && (mp.open > 0.06 || mp.fv > 0.5 || mp.press > 0.5)) {
    mouth = renderStickTalkMouth(mp, my, ink);
  } else if (talk && mp) {
    mouth = curve((+E.smile || 0) * 14 * 1.1);
  } else if (mf === 'grin') {
    mouth = `<path d="M-24,${f(my - 4)} Q0,${f(my + 2)} 24,${f(my - 4)} Q18,${f(my + 22)} 0,${f(my + 22)} Q-18,${f(my + 22)} -24,${f(my - 4)} Z" fill="${dark}" stroke="${ink}" stroke-width="3.8"/><ellipse cx="0" cy="${f(my + 16)}" rx="10" ry="5" fill="#d9707a"/>`;
  } else if (mf === 'laugh') {
    mouth = `<path d="M-30,${f(my - 6)} Q0,${f(my + 3)} 30,${f(my - 6)} Q24,${f(my + 18 + op * 14)} 0,${f(my + 18 + op * 14)} Q-24,${f(my + 18 + op * 14)} -30,${f(my - 6)} Z" fill="${dark}" stroke="${ink}" stroke-width="3.8"/><path d="M-24,${f(my - 3)} Q0,${f(my + 4)} 24,${f(my - 3)} L22,${f(my + 3)} Q0,${f(my + 9)} -22,${f(my + 3)} Z" fill="#ffffff"/><ellipse cx="0" cy="${f(my + 12 + op * 8)}" rx="11" ry="5" fill="#d9707a"/>`;
  } else if (mf === 'open') {
    mouth = `<ellipse cx="0" cy="${f(my + 4 + op * 4)}" rx="${f(11 + op * 6)}" ry="${f(8 + op * 14)}" fill="${dark}" stroke="${ink}" stroke-width="3.8"/>`;
  } else if (mf === 'oh') {
    mouth = `<ellipse cx="0" cy="${f(my + 4)}" rx="${f(7 + op * 6)}" ry="${f(6 + op * 14)}" fill="${dark}" stroke="${ink}" stroke-width="3.6"/>`;
  } else if (mf === 'scream') {
    // a scream of fear: narrow at the top, wide at the bottom, the corners pulled down (it must never read as a laugh)
    const h = 26 + op * 12;
    mouth = `<path d="M-17,${f(my + 1)} Q0,${f(my - 3)} 17,${f(my + 1)} L25,${f(my + h)} Q0,${f(my + h + 9)} -25,${f(my + h)} Z" fill="${dark}" stroke="${ink}" stroke-width="3.8" stroke-linejoin="round"/><path d="M-15,${f(my + 1)} Q0,${f(my - 2)} 15,${f(my + 1)} L16,${f(my + 5)} Q0,${f(my + 3)} -16,${f(my + 5)} Z" fill="#ffffff"/><ellipse cx="0" cy="${f(my + h - 4)}" rx="9" ry="4" fill="#d9707a"/>`;
  } else if (mf === 'wail') {
    mouth = `<path d="M-22,${f(my + 14)} Q0,${f(my - 10)} 22,${f(my + 14)} Q12,${f(my + 22 + op * 6)} 0,${f(my + 22 + op * 6)} Q-12,${f(my + 22 + op * 6)} -22,${f(my + 14)} Z" fill="${dark}" stroke="${ink}" stroke-width="3.8" stroke-linejoin="round"/>`;
  } else if (mf === 'grit') {
    mouth = `<rect x="-22" y="${f(my - 3)}" width="44" height="16" rx="7" fill="#ffffff" stroke="${ink}" stroke-width="3.8"/><path d="M-11,${f(my - 3)} V${f(my + 13)} M0,${f(my - 3)} V${f(my + 13)} M11,${f(my - 3)} V${f(my + 13)} M-22,${f(my + 5)} H22" stroke="${ink}" stroke-width="2.2" fill="none"/>`;
  } else if (mf === 'smirk') {
    const up = CL((+E.smile || 0) * 14, -6, 14);
    mouth = `<path d="M-17,${f(my + 5)} Q3,${f(my + 7)} 22,${f(my + 3 - up)}" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
  } else if (mf === 'wobble') {
    const dy = -(+E.smile || 0) * 5;
    mouth = `<path d="M-22,${f(my + 5 + dy)} Q-15,${f(my - 1 + dy)} -8,${f(my + 5 + dy)} T6,${f(my + 5 + dy)} T20,${f(my + 5 + dy)}" fill="none" stroke="${ink}" stroke-width="3.8" stroke-linecap="round"/>`;
  } else if (mf === 'tight') {
    // pain / effort: a grimace, clenched teeth with the corners pulled down (it used to be a small smile curve)
    mouth = `<path d="M-25,${f(my + 9)} Q-13,${f(my - 1)} 0,${f(my + 1)} Q13,${f(my - 1)} 25,${f(my + 9)} Q12,${f(my + 15)} 0,${f(my + 14)} Q-12,${f(my + 15)} -25,${f(my + 9)} Z" fill="#ffffff" stroke="${ink}" stroke-width="3.8" stroke-linejoin="round"/><path d="M-12,${f(my + 2)} V${f(my + 14)} M0,${f(my + 1)} V${f(my + 14)} M12,${f(my + 2)} V${f(my + 14)} M-21,${f(my + 8)} Q0,${f(my + 6)} 21,${f(my + 8)}" stroke="${ink}" stroke-width="2" fill="none"/>`;
  } else if (mf === 'flat') {
    mouth = curve((+E.smile || 0) * 8);
  } else {
    mouth = curve((+E.smile || 0) * 14);
  }

  // ---- extras ----
  let fx = '';
  const has = (n) => Array.isArray(E.fx) && E.fx.includes(n);
  if (has('blush')) fx += `<ellipse cx="-44" cy="${f(hy + 16)}" rx="11" ry="6" fill="#f49fb6" opacity="${f(0.55 * CL(k, 0.3, 1))}"/><ellipse cx="44" cy="${f(hy + 16)}" rx="11" ry="6" fill="#f49fb6" opacity="${f(0.55 * CL(k, 0.3, 1))}"/>`;
  if (has('sweat')) fx += `<path d="M58,${f(hy - 28)} Q67,${f(hy - 14)} 58,${f(hy - 4)} Q49,${f(hy - 14)} 58,${f(hy - 28)} Z" fill="#8ecbff" stroke="${ink}" stroke-width="2.4"/>`;
  if (has('tear')) {
    for (const cx of [lx, rx]) fx += `<path d="M${f(cx)},${f(eyeY + 14)} L${f(cx - (cx < 0 ? 3 : -3))},${f(hy + 44)}" stroke="#8ecbff" stroke-width="6" stroke-linecap="round" opacity=".85"/><path d="M${f(cx)},${f(eyeY + 12)} Q${f(cx - 7)},${f(eyeY + 28)} ${f(cx)},${f(eyeY + 33)} Q${f(cx + 7)},${f(eyeY + 28)} ${f(cx)},${f(eyeY + 12)} Z" fill="#8ecbff" stroke="${ink}" stroke-width="2"/>`;
  }
  if (has('vein')) fx += `<path d="M47,${f(hy - 24)} q5,2 7,-5 M61,${f(hy - 24)} q-5,2 -7,-5 M47,${f(hy - 12)} q5,-2 7,5 M61,${f(hy - 12)} q-5,-2 -7,5" stroke="#e63946" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
  if (has('spark')) fx += `<path d="M-100,${f(hy - 34)} l3.5,8 8,3.5 -8,3.5 -3.5,8 -3.5,-8 -8,-3.5 8,-3.5 Z" fill="#ffd54a" stroke="${ink}" stroke-width="1.6"/><path d="M102,${f(hy - 18)} l2.8,6.5 6.5,2.8 -6.5,2.8 -2.8,6.5 -2.8,-6.5 -6.5,-2.8 6.5,-2.8 Z" fill="#ffd54a" stroke="${ink}" stroke-width="1.4"/>`;
  return { eyes, brows, mouth, fx };
}

function renderStickTorsoSvg(o, view, shY, hipY, shW, ink) {
  const side = view === 's';
  const back = view === 'b';
  const tc = o.topc;
  const tcLt = shadeHex(tc, 1.18);
  const tcDk = shadeHex(tc, 0.8);
  const dna = o.dna || null;
  const trim = (dna && dna.palette && dna.palette.accent) || '#f5b700';
  const badgeCol = (dna && dna.palette && dna.palette.trim) || '#ffffff';
  const topY = shY - 12;
  const botY = hipY + 4;
  const tw = side ? 30 : Math.max(36, shW * 1.04);
  const bw = side ? 28 : Math.max(34, shW * 0.94);

  let s = `<path d="M-${f2(tw)},${f2(topY + 12)} Q-${f2(tw)},${f2(topY)} -${f2(tw * 0.55)},${f2(topY)} H${f2(tw * 0.55)} Q${f2(tw)},${f2(topY)} ${f2(tw)},${f2(topY + 12)} L${f2(bw)},${f2(botY)} Q0,${f2(botY + 12)} -${f2(bw)},${f2(botY)} Z" fill="${tc}" stroke="${ink}" stroke-width="4.4" stroke-linejoin="round"/>`;

  // Collar / neckline details
  if (!back && !side) {
    if (o.top === 'hoodie') {
      s += `<path d="M-28,${f2(topY + 2)} Q0,${f2(topY + 28)} 28,${f2(topY + 2)}" fill="${tcLt}" stroke="${ink}" stroke-width="3.6"/><path d="M-10,${f2(topY + 18)} V${f2(topY + 56)} M10,${f2(topY + 18)} V${f2(topY + 56)}" fill="none" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round"/><path d="M-${f2(bw * 0.64)},${f2(botY - 46)} H${f2(bw * 0.64)} L${f2(bw * 0.72)},${f2(botY - 8)} H-${f2(bw * 0.72)} Z" fill="${tcDk}" stroke="${ink}" stroke-width="3" opacity=".88"/>`;
    } else if (o.top === 'jacket') {
      s += `<path d="M-16,${f2(topY)} L0,${f2(topY + 38)} L16,${f2(topY)} Z" fill="#ffffff" stroke="${ink}" stroke-width="3.2"/><path d="M0,${f2(topY + 38)} V${f2(botY + 6)}" stroke="${ink}" stroke-width="3.6"/><path d="M-24,${f2(topY + 4)} L-10,${f2(topY + 44)} L-28,${f2(topY + 56)} M24,${f2(topY + 4)} L10,${f2(topY + 44)} L28,${f2(topY + 56)}" fill="none" stroke="${tcLt}" stroke-width="3.2" stroke-linejoin="round"/>`;
    } else if (o.top === 'sweater') {
      s += `<path d="M-${f2(tw - 4)},${f2(topY + 46)} Q0,${f2(topY + 54)} ${f2(tw - 4)},${f2(topY + 46)} M-${f2(tw - 2)},${f2(topY + 88)} Q0,${f2(topY + 96)} ${f2(tw - 2)},${f2(topY + 88)}" fill="none" stroke="#ffffff" stroke-width="6" opacity=".85"/><rect x="-${f2(bw)}" y="${f2(botY - 12)}" width="${f2(bw * 2)}" height="14" rx="4" fill="${tcDk}" stroke="${ink}" stroke-width="3.4"/>`;
    } else if (o.top === 'tank') {
      s += `<path d="M-20,${f2(topY)} Q0,${f2(topY + 30)} 20,${f2(topY)}" fill="${o.skin}" stroke="${ink}" stroke-width="3.4"/>`;
    } else {
      s += `<path d="M-22,${f2(topY)} Q0,${f2(topY + 22)} 22,${f2(topY)}" fill="${o.skin}" stroke="${ink}" stroke-width="3.4"/>`;
    }
  } else if (back) {
    if (o.top === 'hoodie') {
      s += `<path d="M-36,${f2(topY + 2)} Q0,${f2(topY - 12)} 36,${f2(topY + 2)} Q28,${f2(topY + 56)} 0,${f2(topY + 62)} Q-28,${f2(topY + 56)} -36,${f2(topY + 2)} Z" fill="${tcLt}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>`;
    } else if (o.top === 'jacket') {
      s += `<path d="M0,${f2(topY + 14)} V${f2(botY + 4)}" stroke="${tcDk}" stroke-width="3.2" stroke-linecap="round"/>`;
    }
    s += `<path d="M-20,${f2(topY + 6)} Q0,${f2(topY + 14)} 20,${f2(topY + 6)}" fill="none" stroke="${tcDk}" stroke-width="3"/>`;
  } else if (side) {
    if (o.top === 'hoodie') {
      s += `<path d="M-32,${f2(topY + 2)} C-48,${f2(topY + 14)} -46,${f2(topY + 46)} -18,${f2(topY + 42)} Z" fill="${tcLt}" stroke="${ink}" stroke-width="3.8"/>`;
    }
    s += `<path d="M-${f2(bw - 4)},${f2(botY - 8)} H${f2(bw - 4)}" stroke="${tcDk}" stroke-width="3.5" stroke-linecap="round"/>`;
  }

  // Unique anti-copyright DNA motif accent
  if (dna) {
    const midY = (topY + botY) * 0.48;
    if (dna.motif === 'chest-emblem' && !back && !side) {
      s += dna.accentBadgeShape === 'diamond'
        ? `<polygon points="18,${f2(midY - 10)} 28,${f2(midY)} 18,${f2(midY + 10)} 8,${f2(midY)}" fill="${trim}" stroke="${ink}" stroke-width="2.4"/>`
        : `<path d="M10,${f2(midY - 6)} L18,${f2(midY + 4)} L26,${f2(midY - 6)}" fill="none" stroke="${trim}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else if (dna.motif === 'collar-piping' && !side) {
      s += `<path d="M-24,${f2(topY + 3)} Q0,${f2(topY + 22)} 24,${f2(topY + 3)}" fill="none" stroke="${trim}" stroke-width="4" stroke-linecap="round"/>`;
    } else if (dna.motif === 'lapel-stripe' || dna.motif === 'shoulder-stripe') {
      s += side
        ? `<path d="M-6,${f2(topY + 4)} V${f2(botY - 6)}" stroke="${trim}" stroke-width="4.5" stroke-linecap="round"/>`
        : `<path d="M-${f2(tw - 7)},${f2(topY + 16)} L-${f2(bw - 7)},${f2(botY - 12)} M${f2(tw - 7)},${f2(topY + 16)} L${f2(bw - 7)},${f2(botY - 12)}" stroke="${badgeCol}" stroke-width="3.6" stroke-linecap="round" opacity=".88"/>`;
    } else if (dna.motif === 'pocket-badge' && !back) {
      const px = side ? 8 : 16;
      s += `<rect x="${px - 8}" y="${f2(midY - 8)}" width="16" height="16" rx="3" fill="${trim}" stroke="${ink}" stroke-width="2.4"/>`;
    }
  }

  // Scarf / Necklace / Crossbody on torso
  if (o.acc.includes('necklace') && !back && !side) {
    s += `<path d="M-18,${f2(topY + 4)} Q0,${f2(topY + 28)} 18,${f2(topY + 4)}" fill="none" stroke="#f2c44e" stroke-width="4" stroke-linecap="round"/><circle cx="0" cy="${f2(topY + 22)}" r="5" fill="#f2c44e" stroke="${ink}" stroke-width="2"/>`;
  }
  if (o.acc.includes('crossbody')) {
    if (side) {
      s += `<path d="M-22,${f2(topY + 8)} L22,${f2(botY - 18)}" stroke="#b87b35" stroke-width="8" stroke-linecap="round"/>`;
    } else {
      s += `<path d="M-${f2(tw * 0.72)},${f2(topY + 4)} L${f2(bw * 0.72)},${f2(botY - 18)}" stroke="${ink}" stroke-width="11" stroke-linecap="round"/><path d="M-${f2(tw * 0.72)},${f2(topY + 4)} L${f2(bw * 0.72)},${f2(botY - 18)}" stroke="#d99b52" stroke-width="6.5" stroke-linecap="round"/>`;
    }
  }
  if (o.acc.includes('scarf')) {
    s += `<rect x="-${f2(side ? 26 : 30)}" y="${f2(topY - 10)}" width="${f2(side ? 52 : 60)}" height="22" rx="10" fill="#d95f69" stroke="${ink}" stroke-width="3.8"/>`;
    if (!back) {
      s += `<path d="M${side ? 8 : 6},${f2(topY + 10)} L${side ? 22 : 20},${f2(topY + 64)} L${side ? 2 : 0},${f2(topY + 60)} Z" fill="#d95f69" stroke="${ink}" stroke-width="3.6" stroke-linejoin="round"/>`;
    }
  }
  return s;
}

function renderStickArm(uLen, fLen, sx, sy, tu, tf, armW, skin, sleeveCol, armMode, ink, shadeFactor = 1, cuffTrim = '') {
  const sC = shadeFactor < 1 ? mixHex(sleeveCol, '#000000', 1 - shadeFactor) : sleeveCol;
  const kC = shadeFactor < 1 ? mixHex(skin, '#000000', (1 - shadeFactor) * 0.85) : skin;
  const drawSeg = (y0, y1, w, col) =>
    `<path d="M0,${f2(y0)} L0,${f2(y1)}" fill="none" stroke="${ink}" stroke-width="${f2(w + 7)}" stroke-linecap="round"/>` +
    `<path d="M0,${f2(y0)} L0,${f2(y1)}" fill="none" stroke="${col}" stroke-width="${f2(w)}" stroke-linecap="round"/>`;

  let uPart = '';
  let fPart = '';
  if (armMode === 'long') {
    uPart = drawSeg(0, uLen, armW + 4, sC);
    fPart = drawSeg(0, fLen - 8, armW + 2, sC);
    if (cuffTrim) {
      fPart += `<path d="M-${f2((armW + 4) * 0.45)},${f2(fLen - 14)} H${f2((armW + 4) * 0.45)}" stroke="${cuffTrim}" stroke-width="4" stroke-linecap="round"/>`;
    }
  } else if (armMode === 'short') {
    uPart = drawSeg(0, uLen, armW, kC) + drawSeg(0, uLen * 0.58, armW + 5, sC);
    fPart = drawSeg(0, fLen - 4, armW - 1, kC);
  } else {
    uPart = drawSeg(0, uLen, armW, kC);
    fPart = drawSeg(0, fLen - 4, armW - 1, kC);
  }
  const hand = `<circle cx="0" cy="${f2(fLen)}" r="12" fill="${kC}" stroke="${ink}" stroke-width="4"/>`;
  return `<g transform="translate(${f2(sx)},${f2(sy)}) rotate(${f2(tu)})">${uPart}<g transform="translate(0,${f2(uLen)}) rotate(${f2(tf)})">${fPart}${hand}</g></g>`;
}

export function renderCleanStickman(look = {}, P = {}, talk = false, mo = 0.5, blk = 1, view = 'front', uid = 'st0', dna = null) {
  const effLook = dna ? applyDnaToStickLook(look, dna) : look;
  const o = cleanStickLook(effLook);
  const vk = view === 'side' ? 's' : view === 'back' ? 'b' : 'f';
  const side = vk === 's';
  const back = vk === 'b';
  const ink = (o.dna && o.dna.palette && o.dna.palette.ink) || '#111111';
  const shoeAccent = (o.dna && o.dna.palette && o.dna.palette.shoeTrim) || '#ffffff';
  const cuffTrim = o.dna && o.dna.motif === 'cuff-band' && o.dna.palette ? o.dna.palette.accent : '';

  const prop = (o.dna && o.dna.proportion) || { headScale: 1, torsoRatio: 1, limbWeight: 13.5 };
  const ageF = o.age < 18 ? (18 - o.age) / 14 : 0;
  const hScale = o.height * (1 - ageF * 0.12);
  const bScale = o.build * (1 - ageF * 0.04);
  const headSz = prop.headScale * o.headWidth * (1 + ageF * 0.13);

  // Core anatomical heights in G = 880 space (feet flat at y = 880)
  const hipY = 598;
  const thighLen = 136;
  const calfLen = 132;
  const legTotal = thighLen + calfLen + 14; // 282 -> 598 + 282 = 880
  const torsoH = Math.round(162 * prop.torsoRatio);
  const neckY = hipY - torsoH; // ~436
  const shY = neckY + 14; // ~450
  const hy = neckY - 114; // ~322
  const shX = side ? 0 : Math.round(44 * bScale);
  const hipX = side ? 0 : Math.round(25 * bScale);
  const uArmLen = 92;
  const fArmLen = 84;
  const legW = Math.round(prop.limbWeight + 2);
  const armW = Math.round(prop.limbWeight - 1);

  const a = Array.isArray(P.a) ? P.a : [34, -36, 34, -36];
  const l = Array.isArray(P.l) ? P.l : [0, 0, 0, 0];
  const kb = Math.max(0, Number(P.k) || 0);
  const bend = kb > 1;

  // 1. Legs & Pelvis (zero clipPath, smooth hip + knee rotation)
  // A pose with per-leg knees (P.kn, from the walking cycle) keeps the foot that carries the weight on the ground: the body
  // lowers as the stride opens and rises as the legs pass, instead of the feet floating or sliding.
  const planted = Array.isArray(P.kn);
  let ext = 0;
  let extW = 0;
  const buildLeg = (i, farTint = 1) => {
    const m = i ? 1 : -1;
    const sw = Number(l[i]) || 0;
    const lift = bend ? 0 : Number(l[2 + i]) || 0;
    const kx = planted && !bend ? CL(Number(P.kn[i]) || 0, 0, 140) : 0;
    const cK = Math.cos((kx * Math.PI) / 180);
    let hipDeg = 0;
    let knDeg = 0;
    let thighScaleY = 1;
    if (side) {
      hipDeg = -CL(sw, -110, 110);
      knDeg = (bend ? Math.min(150, kb) : 0) + kx;
      if (planted && !bend) {
        const th = (hipDeg * Math.PI) / 180;
        const kk = ((hipDeg + knDeg) * Math.PI) / 180;
        extW = Math.max(extW, thighLen * Math.cos(th) + (calfLen + 14) * Math.cos(kk));
      }
      if (bend) {
        const thR = (Math.max(0, sw) * Math.PI) / 180;
        const kkR = (knDeg * Math.PI) / 180;
        ext = Math.max(ext, thighLen * Math.cos(thR) + (calfLen + 14) * Math.cos(thR - kkR));
      }
    } else {
      hipDeg = -m * CL(sw * (bend ? 0.15 : 0.42), -30, 30);
      if (planted && !bend) extW = Math.max(extW, thighLen + (calfLen + 14) * cK);
      if (bend) {
        thighScaleY = 1 - 0.55 * Math.min(1, kb / 90);
        ext = Math.max(ext, thighLen * thighScaleY + calfLen + 14);
      }
    }

    const px = side ? (i ? -5 : 5) : m * hipX;
    const longPants = o.bottom === 'jeans' || o.bottom === 'joggers';
    const shorts = o.bottom === 'cuffed-shorts' || o.bottom === 'straight-shorts';
    const panC = farTint < 1 ? mixHex(o.bottomc, '#000000', 1 - farTint) : o.bottomc;
    const skinC = farTint < 1 ? mixHex(o.skin, '#000000', (1 - farTint) * 0.85) : o.skin;
    const shoeC = farTint < 1 ? mixHex(o.shoec, '#000000', (1 - farTint) * 0.75) : o.shoec;

    let upperSeg = '';
    if (longPants) {
      upperSeg = `<path d="M0,0 L0,${f2(thighLen)}" fill="none" stroke="${ink}" stroke-width="${legW + 9}" stroke-linecap="round"/><path d="M0,0 L0,${f2(thighLen)}" fill="none" stroke="${panC}" stroke-width="${legW + 2}" stroke-linecap="round"/>`;
    } else if (shorts) {
      upperSeg =
        `<path d="M0,0 L0,${f2(thighLen)}" fill="none" stroke="${ink}" stroke-width="${legW + 6}" stroke-linecap="round"/><path d="M0,0 L0,${f2(thighLen)}" fill="none" stroke="${skinC}" stroke-width="${legW - 1}" stroke-linecap="round"/>` +
        `<rect x="-${f2((legW + 10) / 2)}" y="-2" width="${legW + 10}" height="${f2(thighLen * 0.62)}" rx="7" fill="${panC}" stroke="${ink}" stroke-width="3.8"/>`;
    } else {
      upperSeg = `<path d="M0,0 L0,${f2(thighLen)}" fill="none" stroke="${ink}" stroke-width="${legW + 6}" stroke-linecap="round"/><path d="M0,0 L0,${f2(thighLen)}" fill="none" stroke="${skinC}" stroke-width="${legW - 1}" stroke-linecap="round"/>`;
    }

    let lowerSeg = '';
    if (longPants) {
      lowerSeg = `<path d="M0,0 L0,${f2(calfLen)}" fill="none" stroke="${ink}" stroke-width="${legW + 8}" stroke-linecap="round"/><path d="M0,0 L0,${f2(calfLen)}" fill="none" stroke="${panC}" stroke-width="${legW + 1}" stroke-linecap="round"/>`;
      if (o.bottom === 'joggers') {
        lowerSeg += `<rect x="-${f2((legW + 6) / 2)}" y="${f2(calfLen - 14)}" width="${legW + 6}" height="14" rx="4" fill="${shadeHex(panC, 0.78)}" stroke="${ink}" stroke-width="3.2"/>`;
      }
    } else {
      lowerSeg = `<path d="M0,0 L0,${f2(calfLen)}" fill="none" stroke="${ink}" stroke-width="${legW + 6}" stroke-linecap="round"/><path d="M0,0 L0,${f2(calfLen)}" fill="none" stroke="${skinC}" stroke-width="${legW - 1}" stroke-linecap="round"/>`;
    }

    const flatFoot = planted && Array.isArray(P.ft) ? CL(Number(P.ft[i]), 0, 1) : 0.25;
    const shoeCounterRot = side ? -(hipDeg + knDeg) * flatFoot : 0;
    const shinS = side ? 1 : cK;                 // front and back: the shin shortens as the knee bends away from us
    const shoeMarkup = `<g transform="translate(0,${f2(calfLen * shinS)}) rotate(${f2(shoeCounterRot)})">${renderStickShoe(0, 0, side, back, o.shoe, shoeC, shoeAccent, ink)}</g>`;
    const lowerWrapped = shinS < 0.999 ? `<g transform="scale(1,${f2(shinS)})">${lowerSeg}</g>` : lowerSeg;
    return `<g transform="translate(${f2(px)},${f2(hipY - lift)}) rotate(${f2(hipDeg)})"><g transform="scale(1,${f2(thighScaleY)})">${upperSeg}</g><g transform="translate(0,${f2(thighLen * thighScaleY)}) rotate(${f2(knDeg)})">${lowerWrapped}${shoeMarkup}</g></g>`;
  };

  const legsMarkup = side ? buildLeg(1, 0.8) + buildLeg(0, 1) : buildLeg(0, 1) + buildLeg(1, 1);

  // Pelvis / Bottom waist & skirt
  let pelvis = '';
  const pw = side ? 26 : Math.round(shX * 0.92);
  if (o.bottom === 'skirt') {
    pelvis = `<path d="M-${pw},${f2(hipY - 22)} H${pw} L${f2(pw * 1.45)},${f2(hipY + 56)} Q0,${f2(hipY + 68)} -${f2(pw * 1.45)},${f2(hipY + 56)} Z" fill="${o.bottomc}" stroke="${ink}" stroke-width="4.2" stroke-linejoin="round"/>`;
  } else {
    pelvis = `<path d="M-${pw},${f2(hipY - 18)} H${pw} L${f2(pw - 2)},${f2(hipY + 18)} Q0,${f2(hipY + 28)} -${f2(pw - 2)},${f2(hipY + 18)} Z" fill="${o.bottomc}" stroke="${ink}" stroke-width="4.2" stroke-linejoin="round"/>`;
  }

  // 2. Arms (Left / Right in Front & Back; Far behind torso + Near over torso in Side)
  const armMode = ['hoodie', 'jacket', 'sweater'].includes(o.top) ? 'long' : o.top === 'tshirt' ? 'short' : '';
  const computeArm = (i) => {
    const m = i ? 1 : -1;
    const ua = Number(a[i * 2]) || 0;
    const fa = Number(a[i * 2 + 1]) || 0;
    if (side) {
      const uWorld = (ua - 34) * 1.15 + 4;
      const rawFWorld = fa > 0 ? LERP(uWorld + 18, fa, 0.72) : 22 + (-36 - fa) * 1.05;
      const fWorld = uWorld + CL(rawFWorld - uWorld, -10, 120);
      return { sx: i ? -4 : 4, tu: -CL(uWorld, -85, 175), tf: uWorld - fWorld };
    }
    const tu = m < 0 ? ua : -ua;
    const tf = (m < 0 ? fa : -fa) - tu;
    return { sx: m * shX, tu, tf };
  };

  const aL = computeArm(0);
  const aR = computeArm(1);
  const armFarMarkup = side ? renderStickArm(uArmLen, fArmLen, aL.sx, shY, aL.tu, aL.tf, armW, o.skin, o.topc, armMode, ink, 0.8, cuffTrim) : '';
  const armNearMarkup = side
    ? renderStickArm(uArmLen, fArmLen, aR.sx, shY, aR.tu, aR.tf, armW, o.skin, o.topc, armMode, ink, 1, cuffTrim)
    : renderStickArm(uArmLen, fArmLen, aL.sx, shY, aL.tu, aL.tf, armW, o.skin, o.topc, armMode, ink, 1, cuffTrim) +
      renderStickArm(uArmLen, fArmLen, aR.sx, shY, aR.tu, aR.tf, armW, o.skin, o.topc, armMode, ink, 1, cuffTrim);

  // 3. Torso + Backpack + Neck
  const torsoMarkup = renderStickTorsoSvg(o, view, shY, hipY, shX, ink);
  const neckMarkup = `<rect x="-10" y="${f2(hy + 58)}" width="20" height="${f2(shY - (hy + 58) + 8)}" rx="6" fill="${o.skin}" stroke="${ink}" stroke-width="4"/>`;
  let backpackMarkup = '';
  if (o.acc.includes('backpack')) {
    if (side) {
      backpackMarkup = `<rect x="-64" y="${f2(shY - 4)}" width="44" height="106" rx="16" fill="#c95b5b" stroke="${ink}" stroke-width="4.2"/><rect x="-56" y="${f2(shY + 48)}" width="28" height="34" rx="8" fill="#a84444" stroke="${ink}" stroke-width="3.2"/>`;
    } else if (back) {
      backpackMarkup = `<rect x="-46" y="${f2(shY + 4)}" width="92" height="114" rx="18" fill="#c95b5b" stroke="${ink}" stroke-width="4.4"/><rect x="-32" y="${f2(shY + 60)}" width="64" height="40" rx="10" fill="#a84444" stroke="${ink}" stroke-width="3.4"/>`;
    } else {
      backpackMarkup = `<rect x="-52" y="${f2(shY + 6)}" width="16" height="96" rx="7" fill="#c95b5b" stroke="${ink}" stroke-width="3.8"/><rect x="36" y="${f2(shY + 6)}" width="16" height="96" rx="7" fill="#c95b5b" stroke="${ink}" stroke-width="3.8"/>`;
    }
  }

  // 4. Head (Skull + Back Hair + Face + Front Hair Crown + Headwear)
  const headRx = Math.round(74 * headSz);
  const headRy = 72;
  const earsFront = !side && o.hair !== 'long-wavy' && o.hair !== 'bob'
    ? (P && P.yaw
      ? [-1, 1].map((sd) => { const y = CL(+P.yaw, -1, 1), toward = sd * y > 0, a = Math.abs(y); return `<circle cx="${f2(sd * (headRx + 4) + (toward ? -sd * 22 * a : -sd * 8 * a))}" cy="${f2(hy + 6)}" r="${f2(toward ? 12 - 5 * a : 12)}" fill="${o.skin}" stroke="${ink}" stroke-width="3.8" opacity="${f2(toward ? 1 - 0.95 * a : 1)}"/>`; }).join('')
      : `<circle cx="-${headRx + 4}" cy="${f2(hy + 6)}" r="12" fill="${o.skin}" stroke="${ink}" stroke-width="3.8"/><circle cx="${headRx + 4}" cy="${f2(hy + 6)}" r="12" fill="${o.skin}" stroke="${ink}" stroke-width="3.8"/>`)
    : '';
  const skull = `<ellipse cx="0" cy="${f2(hy)}" rx="${headRx}" ry="${headRy}" fill="${o.skin}" stroke="${ink}" stroke-width="4.6"/>`;
  const hairBack = renderStickHairBack(o, view, hy, ink);
  const turned = !back && !side && P && (P.yaw || P.pitch);
  const faceMarkup = back ? '' : (turned ? turnHead(renderStickFace(o, side, hy, blk, talk, mo, ink, P && P.emo), P.yaw, P.pitch, hy, ink, o) : renderStickFace(o, side, hy, blk, talk, mo, ink, P && P.emo));
  const hairTop = turned ? turnHair(renderStickHairFrontOrBack(o, view, hy, headRx, headRy, ink), P.yaw, P.pitch) : renderStickHairFrontOrBack(o, view, hy, headRx, headRy, ink);
  const hatMarkup = renderStickHeadwear(o, view, hy, ink);
  const earrings = !back && !side && o.acc.includes('earrings')
    ? `<circle cx="-${headRx + 4}" cy="${f2(hy + 22)}" r="6" fill="none" stroke="#f2c44e" stroke-width="3.5"/><circle cx="${headRx + 4}" cy="${f2(hy + 22)}" r="6" fill="none" stroke="${ink}" stroke-width="1.2"/>`
    : '';

  // the hair behind the head is part of the BODY layer: it sits behind the neck, shoulders and torso (so long hair never covers the neck),
  // but it moves with the head (same turn and tilt). From the back, the hair is the front-most thing and stays on the head.
  const headXf = `translate(${f2(P.hx || 0)},${f2(P.hy || 0)}) rotate(${f2(P.hr || 0)} 0 ${f2(neckY)})`;
  const hairBehind = back || !hairBack ? '' : `<g transform="${headXf}">${hairBack}</g>`;
  const headGroup = `<g transform="${headXf}">${back ? hairBack : ''}${earsFront}${skull}${faceMarkup}${hairTop}${earrings}${hatMarkup}</g>`;

  // Layer ordering per view: back puts backpack behind/over torso & rear head properly
  const upperBody = back
    ? `<g transform="rotate(${f2(P.tr || 0)} 0 ${f2(hipY)})">${neckMarkup}${torsoMarkup}${armNearMarkup}${backpackMarkup}${headGroup}</g>`
    : side
      ? `<g transform="rotate(${f2(P.tr || 0)} 0 ${f2(hipY)})">${hairBehind}${armFarMarkup}${backpackMarkup}${neckMarkup}${torsoMarkup}${headGroup}${armNearMarkup}</g>`
      : `<g transform="rotate(${f2(P.tr || 0)} 0 ${f2(hipY)})">${hairBehind}${backpackMarkup}${neckMarkup}${torsoMarkup}${armNearMarkup}${headGroup}</g>`;

  const rawDrop = bend ? Math.max(0, legTotal - ext) : planted ? Math.max(0, legTotal - extW) : 0;
  const dx = Number(P.dx) || 0;
  const pDy = Number(P.dy) || 0;
  const effDy = P.chair && bend ? Math.max(pDy, rawDrop) : pDy + rawDrop;
  const sq = Math.max(0.2, Number(P.sq) || 1);
  const sc = Math.max(0.2, Number(P.sc) || 1);
  const shScaleY = (P.dy || 0) < 0 ? Math.max(0.18, 1 + P.dy / 500) : 1;
  const shadowRx = Math.round(96 * shScaleY * (side ? 0.78 : 1));
  const seatY = Math.round(hipY + rawDrop + 6);
  const chair = P.chair ? renderStickChairSvg(vk, seatY) : { b: '', f: '' };

  void uid;
  return (
    `<ellipse cx="${f2(dx)}" cy="880" rx="${shadowRx}" ry="${f2(11 * shScaleY)}" fill="#dcdbd6"/>` +
    chair.b +
    `<g transform="translate(${f2(dx)},${f2(effDy)}) translate(0,880) scale(${f2(1 / sq)},${f2(sq)}) translate(0,-880) translate(0,560) rotate(${f2(P.rot || 0)}) scale(${f2(sc * hScale)}) translate(0,-560)">` +
    legsMarkup +
    pelvis +
    upperBody +
    `</g>` +
    chair.f
  );
}

// ============================================================================
// 3. PROCEDURAL GEOMETRIC CHARACTER GENERATOR ("Generate Character")
// ============================================================================

export const GEN_ARCHETYPES = [
  { id: 'neo-geometric', label: 'Neo-Geometric Stickman', desc: 'Sleek geometric collar, visor hair crest & capsule limbs' },
  { id: 'editorial-minimal', label: 'Editorial Documentary', desc: 'Layered lapels, expressive brow & scarf silhouette' },
  { id: 'angular-kinetic', label: 'Angular Action Hero', desc: 'Sharp polygon jacket, chevron crest & boots' },
  { id: 'capsule-classic', label: 'Capsule Classic', desc: 'Friendly rounded geometric stickman with twin cuffs' },
];

const GEN_NAMES_M = ['Nova', 'Orion', 'Kael', 'Milo', 'Zane', 'Ronan', 'Atlas', 'Vex'];
const GEN_NAMES_F = ['Lyra', 'Sora', 'Nia', 'Vega', 'Aria', 'Kira', 'Zara', 'claire'];
const HAIR_COLS = ['#1a1b26', '#3b2416', '#7c4d2b', '#c4933f', '#a63a3a', '#4a5568'];
const SKIN_COLS = ['#ffffff', '#ffe5cc', '#f2c28f', '#d99d6e', '#9a633d', '#5c3824'];

export function generateShapeCharacter(options = {}) {
  const seedRaw = String(options.seed || '').trim() || `char-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const r = makeRng(hashSeed(seedRaw));
  const archetype = GEN_ARCHETYPES.some((a) => a.id === options.archetype)
    ? options.archetype
    : GEN_ARCHETYPES[Math.floor(r() * GEN_ARCHETYPES.length)].id;
  const gender = options.gender === 'female' ? 'female' : options.gender === 'male' ? 'male' : r() > 0.5 ? 'female' : 'male';
  const pal = options.dna && options.dna.palette ? options.dna.palette : DNA_PALETTES[Math.floor(r() * DNA_PALETTES.length)];

  const namePool = gender === 'female' ? GEN_NAMES_F : GEN_NAMES_M;
  const rawName = String(options.name || '').trim() || namePool[Math.floor(r() * namePool.length)];
  const name = rawName.charAt(0).toUpperCase() + rawName.slice(1).replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 24) || 'Nova';
  const skin = normHex(options.skin, SKIN_COLS[Math.floor(r() * SKIN_COLS.length)]);
  const hairc = normHex(options.hairc, HAIR_COLS[Math.floor(r() * HAIR_COLS.length)]);
  const top = pal.primary;
  const bottom = pal.secondary;
  const accent = pal.accent;
  const trim = pal.trim;
  const ink = pal.ink || '#161922';

  const rig = { upperLeg: 145, lowerLeg: 145, torso: 185, shoulderX: 54, shoulderDown: 24, hipX: 28, upperArm: 102, foreArm: 96 };
  const headRx = archetype === 'angular-kinetic' ? 66 : archetype === 'editorial-minimal' ? 64 : 70;
  const headRy = archetype === 'editorial-minimal' ? 74 : 70;
  const headCy = -headRy - 14;
  const eyeY = headCy + 2;
  const mouthY = headCy + 34;

  // Hair styles built strictly from crisp geometric primitives
  const srx = Math.round(headRx * 0.9);
  let hairFront = '';
  let hairSide = '';
  let hairBack = '';
  if (archetype === 'angular-kinetic') {
    hairFront = `<polygon points="-${headRx + 4},${headCy - 12} -${headRx - 6},${headCy - headRy - 20} -14,${headCy - headRy - 4} 16,${headCy - headRy - 26} ${headRx - 4},${headCy - headRy - 12} ${headRx + 4},${headCy - 12} 28,${headCy - 36} -20,${headCy - 28}" fill="${hairc}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>`;
    hairSide = `<polygon points="-${srx + 4},${headCy + 12} -${srx + 10},${headCy - 44} -${Math.round(srx * 0.48)},${headCy - headRy - 22} 16,${headCy - headRy - 24} ${srx - 2},${headCy - 34} 20,${headCy - 34} -22,${headCy - 14}" fill="${hairc}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>`;
    hairBack = `<polygon points="-${headRx + 2},${headCy + 18} -${headRx - 4},${headCy - headRy - 18} 0,${headCy - headRy - 24} ${headRx - 4},${headCy - headRy - 18} ${headRx + 2},${headCy + 18} 44,${headCy + 44} -44,${headCy + 44}" fill="${hairc}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>`;
  } else if (archetype === 'editorial-minimal') {
    hairFront = `<path d="M-${headRx},${headCy - 6} C-${headRx},${headCy - headRy - 16} ${headRx},${headCy - headRy - 16} ${headRx},${headCy - 6} C36,${headCy - 42} -14,${headCy - 42} -${headRx},${headCy - 6} Z" fill="${hairc}" stroke="${ink}" stroke-width="5"/>`;
    hairSide = `<path d="M-${srx + 4},${headCy + 16} C-${srx + 12},${headCy - headRy - 30} ${Math.round(srx * 0.65)},${headCy - headRy - 30} ${srx - 4},${headCy - 28} C18,${headCy - 42} -16,${headCy - 26} -26,${headCy + 14} Z" fill="${hairc}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>`;
    hairBack = `<path d="M-${headRx + 2},${headCy + 16} A${headRx + 2},${headRy + 2} 0 1,1 ${headRx + 2},${headCy + 16} Q0,${headCy + 54} -${headRx + 2},${headCy + 16} Z" fill="${hairc}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/><rect x="-34" y="${headCy + 26}" width="68" height="22" rx="10" fill="${hairc}" stroke="${ink}" stroke-width="4.5"/>`;
  } else {
    hairFront = `<path d="M-${headRx + 2},${headCy - 8} C-${headRx},${headCy - headRy - 14} 0,${headCy - headRy - 18} ${headRx},${headCy - headRy - 14} L${headRx + 2},${headCy - 8} Q26,${headCy - 36} 0,${headCy - 24} Q-26,${headCy - 36} -${headRx + 2},${headCy - 8} Z" fill="${hairc}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>`;
    hairSide = `<path d="M-${srx + 4},${headCy + 14} C-${srx + 10},${headCy - headRy - 32} ${Math.round(srx * 0.58)},${headCy - headRy - 30} ${srx - 4},${headCy - 30} C18,${headCy - 40} -14,${headCy - 26} -24,${headCy + 14} Z" fill="${hairc}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>`;
    hairBack = `<path d="M-${headRx + 1},${headCy + 18} A${headRx + 1},${headRy} 0 1,1 ${headRx + 1},${headCy + 18} Q0,${headCy + 56} -${headRx + 1},${headCy + 18} Z" fill="${hairc}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>`;
  }
  if (gender === 'female') {
    hairSide += `<path d="M-46,${headCy - 12} C-86,${headCy - 8} -92,${headCy + 64} -62,${headCy + 82} C-50,${headCy + 48} -46,${headCy + 16} -36,${headCy - 4} Z" fill="${hairc}" stroke="${ink}" stroke-width="4.5"/>`;
    hairBack += `<path d="M-24,${headCy + 12} L-36,${headCy + 96} H36 L24,${headCy + 12} Z" fill="${hairc}" stroke="${ink}" stroke-width="4.5" stroke-linejoin="round"/><rect x="-26" y="${headCy + 8}" width="52" height="12" rx="6" fill="${accent}" stroke="${ink}" stroke-width="3"/>`;
  }

  // Head pieces (front, side, back)
  const neck = `<rect x="-13" y="-18" width="26" height="24" rx="6" fill="${skin}" stroke="${ink}" stroke-width="4.5"/>`;
  const earsFront = `<circle cx="-${headRx + 2}" cy="${eyeY + 4}" r="11" fill="${skin}" stroke="${ink}" stroke-width="4.4"/><circle cx="${headRx + 2}" cy="${eyeY + 4}" r="11" fill="${skin}" stroke="${ink}" stroke-width="4.4"/>`;
  const eyesFront = `<ellipse cx="-24" cy="${eyeY}" rx="9" ry="12" fill="${ink}"/><ellipse cx="24" cy="${eyeY}" rx="9" ry="12" fill="${ink}"/><circle cx="-27" cy="${eyeY - 4}" r="3" fill="#ffffff"/><circle cx="21" cy="${eyeY - 4}" r="3" fill="#ffffff"/>`;
  const browsFront = `<path d="M-38,${eyeY - 22} L-12,${eyeY - 26} M12,${eyeY - 26} L38,${eyeY - 22}" fill="none" stroke="${ink}" stroke-width="4.8" stroke-linecap="round"/>`;
  const mouthRestFront = `<path d="M-20,${mouthY} Q0,${mouthY + 14} 20,${mouthY}" fill="none" stroke="${ink}" stroke-width="4.8" stroke-linecap="round"/>`;

  const head =
    neck +
    earsFront +
    `<ellipse cx="0" cy="${headCy}" rx="${headRx}" ry="${headRy}" fill="${skin}" stroke="${ink}" stroke-width="5"/>` +
    eyesFront +
    browsFront +
    mouthRestFront +
    hairFront;

  const noseSide = `<path d="M56,${eyeY - 4} L72,${eyeY + 12} L55,${eyeY + 18}" fill="${skin}" stroke="${ink}" stroke-width="4.4" stroke-linejoin="round"/>`;
  const eyeSide = `<ellipse cx="32" cy="${eyeY}" rx="8" ry="12" fill="${ink}"/><circle cx="34" cy="${eyeY - 4}" r="2.8" fill="#ffffff"/><path d="M20,${eyeY - 23} L44,${eyeY - 25}" stroke="${ink}" stroke-width="4.6" stroke-linecap="round"/>`;
  const mouthRestSide = `<path d="M26,${mouthY + 2} Q42,${mouthY + 10} 54,${mouthY}" fill="none" stroke="${ink}" stroke-width="4.6" stroke-linecap="round"/>`;

  const headSide =
    neck +
    `<ellipse cx="-2" cy="${headCy}" rx="${srx}" ry="${headRy}" fill="${skin}" stroke="${ink}" stroke-width="5"/>` +
    noseSide +
    `<ellipse cx="-16" cy="${eyeY + 8}" rx="7.5" ry="11" fill="${skin}" stroke="${ink}" stroke-width="3.8"/>` +
    eyeSide +
    mouthRestSide +
    hairSide;

  const headBack =
    neck +
    earsFront +
    `<ellipse cx="0" cy="${headCy}" rx="${headRx}" ry="${headRy}" fill="${skin}" stroke="${ink}" stroke-width="5"/>` +
    hairBack;

  const mouthOpen = `<ellipse cx="0" cy="${mouthY + 2}" rx="20" ry="14" fill="#6b1824" stroke="${ink}" stroke-width="4"/><ellipse cx="0" cy="${mouthY + 10}" rx="10" ry="5" fill="#eb7a88"/>`;
  const mouthOpenSide = `<ellipse cx="44" cy="${mouthY + 2}" rx="14" ry="12" fill="#6b1824" stroke="${ink}" stroke-width="4"/>`;
  const eyesClosed = `<circle cx="-24" cy="${eyeY}" r="14" fill="${skin}"/><circle cx="24" cy="${eyeY}" r="14" fill="${skin}"/><path d="M-36,${eyeY} Q-24,${eyeY + 8} -12,${eyeY} M12,${eyeY} Q24,${eyeY + 8} 36,${eyeY}" fill="none" stroke="${ink}" stroke-width="4.6" stroke-linecap="round"/>`;
  const eyesClosedSide = `<circle cx="32" cy="${eyeY}" r="14" fill="${skin}"/><path d="M22,${eyeY} Q32,${eyeY + 8} 42,${eyeY}" fill="none" stroke="${ink}" stroke-width="4.6" stroke-linecap="round"/>`;

  // Torso pieces (front, side, back)
  let torso = '';
  let torsoSide = '';
  let torsoBack = '';
  if (archetype === 'angular-kinetic') {
    torso = `<polygon points="-50,0 -62,-172 0,-192 62,-172 50,0" fill="${top}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/><polygon points="-24,-178 0,-132 24,-178" fill="${trim}" stroke="${ink}" stroke-width="4"/><polygon points="0,-112 18,-92 0,-72 -18,-92" fill="${accent}" stroke="${ink}" stroke-width="3.5"/>`;
    torsoSide = `<polygon points="-32,0 -38,-174 34,-174 30,0" fill="${top}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/><rect x="-8" y="-154" width="16" height="140" rx="5" fill="${accent}" opacity=".85"/>`;
    torsoBack = `<polygon points="-50,0 -62,-172 0,-192 62,-172 50,0" fill="${top}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/><polygon points="-22,-130 0,-100 22,-130 0,-116" fill="${accent}" stroke="${ink}" stroke-width="3"/>`;
  } else if (archetype === 'editorial-minimal') {
    torso = `<path d="M-48,0 L-58,-168 Q0,-196 58,-168 L48,0 Z" fill="${top}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/><path d="M-26,-178 L0,-118 L26,-178" fill="${trim}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/><rect x="-36" y="-190" width="72" height="24" rx="11" fill="${accent}" stroke="${ink}" stroke-width="4"/>`;
    torsoSide = `<rect x="-34" y="-176" width="68" height="176" rx="20" fill="${top}" stroke="${ink}" stroke-width="5"/><rect x="-36" y="-190" width="72" height="24" rx="11" fill="${accent}" stroke="${ink}" stroke-width="4"/>`;
    torsoBack = `<path d="M-48,0 L-58,-168 Q0,-196 58,-168 L48,0 Z" fill="${top}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/><rect x="-36" y="-190" width="72" height="24" rx="11" fill="${accent}" stroke="${ink}" stroke-width="4"/>`;
  } else {
    torso = `<rect x="-54" y="-182" width="108" height="182" rx="28" fill="${top}" stroke="${ink}" stroke-width="5"/><rect x="-54" y="-34" width="108" height="18" rx="4" fill="${bottom}" stroke="${ink}" stroke-width="4"/><circle cx="0" cy="-126" r="14" fill="${accent}" stroke="${ink}" stroke-width="4"/>`;
    torsoSide = `<rect x="-34" y="-182" width="68" height="182" rx="24" fill="${top}" stroke="${ink}" stroke-width="5"/><rect x="-34" y="-34" width="68" height="18" rx="4" fill="${bottom}" stroke="${ink}" stroke-width="4"/>`;
    torsoBack = `<rect x="-54" y="-182" width="108" height="182" rx="28" fill="${top}" stroke="${ink}" stroke-width="5"/><rect x="-54" y="-34" width="108" height="18" rx="4" fill="${bottom}" stroke="${ink}" stroke-width="4"/>`;
  }

  // Limbs (clean geometric capsule/stickman segments)
  const upperArm = `<rect x="-13" y="-10" width="26" height="114" rx="13" fill="${top}" stroke="${ink}" stroke-width="5"/><rect x="-14" y="80" width="28" height="14" rx="5" fill="${accent}" stroke="${ink}" stroke-width="3.4"/>`;
  const foreArm = `<rect x="-11" y="-8" width="22" height="90" rx="11" fill="${skin}" stroke="${ink}" stroke-width="5"/><circle cx="0" cy="88" r="15" fill="${skin}" stroke="${ink}" stroke-width="5"/>`;
  const upperLeg = `<rect x="-16" y="-10" width="32" height="156" rx="15" fill="${bottom}" stroke="${ink}" stroke-width="5"/>`;
  const lowerLeg = `<rect x="-14" y="-8" width="28" height="128" rx="13" fill="${bottom}" stroke="${ink}" stroke-width="5"/><rect x="-22" y="116" width="44" height="30" rx="11" fill="${trim}" stroke="${ink}" stroke-width="5"/><rect x="-22" y="138" width="44" height="9" rx="4" fill="${accent}" stroke="${ink}" stroke-width="3.2"/>`;
  const lowerLegSide = `<rect x="-14" y="-8" width="28" height="128" rx="13" fill="${bottom}" stroke="${ink}" stroke-width="5"/><path d="M-16,116 H22 Q44,122 46,144 H-18 Z" fill="${trim}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/><rect x="-18" y="138" width="64" height="9" rx="4" fill="${accent}" stroke="${ink}" stroke-width="3.2"/>`;

  return {
    name,
    seed: seedRaw,
    archetype,
    gender,
    palette: pal,
    skin,
    hairc,
    top,
    bottom,
    accent,
    trim,
    ink,
    size: 1.08,
    rig,
    mouth: [0, mouthY + 2],
    parts: {
      head,
      headSide,
      headBack,
      mouthOpen,
      mouthOpenSide,
      eyesClosed,
      eyesClosedSide,
      torso,
      torsoSide,
      torsoBack,
      upperArm,
      foreArm,
      upperLeg,
      lowerLeg,
      lowerLegSide,
    },
  };
}

export function generatedCharToCustomCode(spec) {
  if (!spec || !spec.parts) return '';
  const p = spec.parts;
  const def = {
    size: spec.size || 1.08,
    rig: spec.rig,
    mouth: spec.mouth,
    color: spec.top,
    skin: spec.skin,
    outline: spec.ink || '#161922',
    head: p.head,
    headSide: p.headSide,
    headBack: p.headBack,
    mouthOpen: p.mouthOpen,
    mouthOpenSide: p.mouthOpenSide,
    eyesClosed: p.eyesClosed,
    eyesClosedSide: p.eyesClosedSide,
    torso: p.torso,
    torsoSide: p.torsoSide,
    torsoBack: p.torsoBack,
    upperArm: p.upperArm,
    foreArm: p.foreArm,
    upperLeg: p.upperLeg,
    lowerLeg: p.lowerLeg,
    lowerLegSide: p.lowerLegSide,
  };
  return `customCharacter(${JSON.stringify(spec.name || 'Nova')}, ${JSON.stringify(def)})`;
}

export function renderGeneratedPreviewSvg(spec) {
  if (!spec || !spec.parts) return '';
  const p = spec.parts;
  const r = spec.rig || { upperLeg: 145, lowerLeg: 145, torso: 185, shoulderX: 54, shoulderDown: 24, hipX: 28 };
  const hipY = 880 - (r.upperLeg + r.lowerLeg); // 590
  const neckY = hipY - r.torso; // 405
  const shY = neckY + r.shoulderDown; // 429

  const drawView = (vw, ox) => {
    const hd = vw === 'side' ? p.headSide || p.head : vw === 'back' ? p.headBack || p.head : p.head;
    const td = vw === 'side' ? p.torsoSide || p.torso : vw === 'back' ? p.torsoBack || p.torso : p.torso;
    const ll = vw === 'side' ? p.lowerLegSide || p.lowerLeg : p.lowerLeg;
    const armF = (x, ang) => `<g transform="translate(${x},${shY}) rotate(${ang})">${p.upperArm}<g transform="translate(0,${r.upperArm}) rotate(${ang * -0.4})">${p.foreArm}</g></g>`;
    const legF = (x, ang) => `<g transform="translate(${x},${hipY}) rotate(${ang})">${p.upperLeg}<g transform="translate(0,${r.upperLeg})">${ll}</g></g>`;

    if (vw === 'side') {
      return `<g transform="translate(${ox},0)">
        <ellipse cx="0" cy="880" rx="74" ry="9" fill="#d0d7e2" opacity=".45"/>
        <g transform="translate(0,0)">${legF(-6, -10)}${legF(6, 12)}</g>
        <g opacity=".82">${armF(0, 14)}</g>
        <g transform="translate(0,${hipY})">${td}</g>
        ${armF(0, -16)}
        <g transform="translate(0,${neckY})">${hd}</g>
        <text x="0" y="922" text-anchor="middle" font-size="22" font-weight="700" fill="#8b95a8" font-family="Arial">SIDE</text>
      </g>`;
    }
    if (vw === 'back') {
      return `<g transform="translate(${ox},0)">
        <ellipse cx="0" cy="880" rx="84" ry="9" fill="#d0d7e2" opacity=".45"/>
        ${legF(-r.hipX, 0)}${legF(r.hipX, 0)}
        ${armF(-r.shoulderX, 14)}${armF(r.shoulderX, -14)}
        <g transform="translate(0,${hipY})">${td}</g>
        <g transform="translate(0,${neckY})">${hd}</g>
        <text x="0" y="922" text-anchor="middle" font-size="22" font-weight="700" fill="#8b95a8" font-family="Arial">BACK</text>
      </g>`;
    }
    return `<g transform="translate(${ox},0)">
      <ellipse cx="0" cy="880" rx="84" ry="9" fill="#d0d7e2" opacity=".45"/>
      ${legF(-r.hipX, 0)}${legF(r.hipX, 0)}
      ${armF(-r.shoulderX, 16)}${armF(r.shoulderX, -18)}
      <g transform="translate(0,${hipY})">${td}</g>
      <g transform="translate(0,${neckY})">${hd}</g>
      <text x="0" y="922" text-anchor="middle" font-size="22" font-weight="700" fill="#8b95a8" font-family="Arial">FRONT</text>
    </g>`;
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 175 780 768">${drawView('front', 140)}${drawView('side', 390)}${drawView('back', 640)}</svg>`;
}
