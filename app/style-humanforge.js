// HumanForge character style for the Animato scene engine.
// A port of the HumanForge procedural character generator (3D skeleton, capsule limbs,
// sphere hair, per-seed wardrobe) that outputs SVG instead of drawing on a canvas, so it
// can be used by the scene player and the video exporter exactly like the stickman rig.
//
// Entry points:
//   renderHumanForge(look, pose, talk, mouthOpen, blink, view, uid, index) -> svg string
//   hfSpec(look, index)  -> resolved unique character + expression
//   hfRandomLook(seed)   -> small serialisable look object for a unique character

const PI = Math.PI, sin = Math.sin, cos = Math.cos;
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const f2 = (n) => { n = +n; return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };

export function hashSeed(input) {
  const s = typeof input === 'string' ? input : JSON.stringify(input);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 0) || 1;
}
const rng = (s) => () => {
  s |= 0; s = s + 0x6D2B79F5 | 0;
  let t = Math.imul(s ^ s >>> 15, 1 | s);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const hx = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16));
const hex = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const sh = (h, k) => hex(hx(h).map((v) => v * k));
const lt = (h, k) => hex(hx(h).map((v) => v + (255 - v) * k));
const HEX6 = /^#[0-9a-f]{6}$/i, HEX3 = /^#[0-9a-f]{3}$/i;
const asHex = (v) => {
  const s = String(v == null ? '' : v).trim();
  if (HEX6.test(s)) return s.toLowerCase();
  if (HEX3.test(s)) return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
  return '';
};

// ---- palettes (from the HumanForge palette) ----
const SKIN = ['#fbe2d0', '#f7d3bb', '#f0c3a1', '#e8b48c', '#dda578', '#d09468', '#bf8259', '#a86d46', '#8d5638', '#74432c', '#5b3322', '#442418'];
const HAIRC = ['#16110e', '#2e2118', '#4a3222', '#6b4a2f', '#8a6038', '#b88a4e', '#d8b872', '#e9d8a6', '#8c2f1f', '#b5472a', '#6e6e72', '#d9d9dc', '#3a2a5c', '#2b5f8a', '#c2548a'];
const EYEC = ['#3b2a1c', '#5a3a22', '#2f5d8c', '#3f7f5a', '#6b6f3a', '#586a78'];
const TOPC = ['#f3f0ea', '#202126', '#2f5b4a', '#762235', '#243255', '#e0b34a', '#c9564a', '#6aa0d4', '#7a5a9c', '#e8a0b4', '#4a4d55', '#d96b2b'];
const BOTC = ['#36507a', '#202126', '#3d4048', '#7396c0', '#b98c5c', '#4a3a2c', '#2f5b4a', '#8c9097', '#762235'];
const SHOEC = ['#f1efea', '#202126', '#5a3a2a', '#c9564a', '#2f4a7a'];
const HSTY = {
  short: { hf: 38, hb: -20, rs: .48, rad: .86 }, buzz: { hf: 34, hb: -15, rs: .4, rad: .9 },
  quiff: { hf: 40, hb: -20, rs: .48, rad: .86, top: 1 }, afro: { hf: 45, hb: -40, rs: .62, rad: 1.08 },
  long: { hf: 40, hb: -45, rs: .5, rad: .88, back: 5, side: 4 }, bob: { hf: 40, hb: -40, rs: .5, rad: .92, back: 2, side: 2 },
  pixie: { hf: 30, hb: -30, rs: .46, rad: .88 }, pony: { hf: 38, hb: -15, rs: .46, rad: .86, tail: 1 },
  bun: { hf: 38, hb: -15, rs: .46, rad: .86, bun: 1 }, braid: { hf: 38, hb: -30, rs: .47, rad: .87, braid: 1 }, bald: null,
};
export const HF_OPTIONS = {
  gender: ['male', 'female'],
  hair: ['short', 'buzz', 'quiff', 'afro', 'long', 'bob', 'pixie', 'pony', 'bun', 'braid', 'bald'],
  top: ['tee', 'long', 'hoodie', 'jacket', 'suit', 'stripe', 'tank'],
  bottom: ['pants', 'shorts', 'skirt', 'dress'],
  headwear: ['none', 'cap', 'beanie', 'bucket'],
  eyewear: ['none', 'glasses'],
  facialHair: ['none', 'beard'],
  mouth: ['smile', 'grin', 'open', 'smirk', 'frown', 'flat'],
  brow: ['calm', 'happy', 'sad', 'angry'],
};
const HAIR_ALIAS = {
  swept: 'quiff', pompadour: 'quiff', crop: 'buzz', spiky: 'quiff', curly: 'afro', 'curly-afro': 'afro', 'long-wavy': 'long', wavy: 'long',
  ponytail: 'pony', 'twin-buns': 'bun', pigtails: 'pony', tousled: 'short', 'side-part': 'short', 'side part': 'short', sidepart: 'short', messy: 'short', bowl: 'bob', none: 'bald',
};
const TOP_ALIAS = {
  tshirt: 'tee', 't-shirt': 'tee', shirt: 'tee', sweater: 'long', crew: 'long', turtle: 'long', zip: 'jacket', coat: 'jacket', labcoat: 'jacket', blazer: 'suit',
  jersey: 'stripe', overalls: 'stripe', striped: 'stripe', top: 'tee',
};
const BOT_ALIAS = {
  jeans: 'pants', joggers: 'pants', trousers: 'pants', slacks: 'pants', 'cuffed-shorts': 'shorts', 'straight-shorts': 'shorts',
};
const HAT_ALIAS = { hat: 'cap', baseball: 'cap', beanie: 'beanie', bucket: 'bucket', cap: 'cap' };

// ---- procedural character (HumanForge `mk`) ----
function mk(g, seed) {
  const r = rng(seed), P = (a) => a[r() * a.length | 0], m = g === 'm';
  const c = {
    g, seed, skin: P(SKIN), hairC: P(r() < .8 ? HAIRC.slice(0, 11) : HAIRC), eye: P(EYEC),
    h: m ? 1.0 + r() * .14 : .92 + r() * .13, bulk: m ? .92 + r() * .35 : .82 + r() * .3, hs: .95 + r() * .12,
    hair: P(m ? ['short', 'short', 'buzz', 'quiff', 'bald', 'afro', 'long'] : ['long', 'long', 'pony', 'bun', 'bob', 'pixie', 'braid', 'afro']),
    top: P(TOPC), bot: P(m ? ['pants', 'pants', 'pants', 'shorts'] : ['pants', 'skirt', 'shorts', 'skirt', 'dress']), botC: P(BOTC), shoe: P(SHOEC),
    sleeve: P([0, 1, 1, 2, 2]), beard: m && r() < .3, glasses: r() < .2, lip: P(['#c9564a', '#b0384a', '#d98a82', '#8c3f3f']),
  };
  c.ts = P(m ? ['tee', 'tee', 'long', 'hoodie', 'jacket', 'suit', 'stripe', 'tank'] : ['tee', 'long', 'tank', 'hoodie', 'jacket', 'stripe', 'tee']);
  c.inner = P(['#f3f0ea', '#f3f0ea', '#6aa0d4', '#e8a0b4', '#202126']); c.sc = P(TOPC); c.packC = P(TOPC);
  c.sleeve = ({ tank: 0, tee: 1 })[c.ts] ?? 2;
  if (c.ts === 'suit' || (c.ts === 'jacket' && r() < .4)) {
    c.top = P(['#202126', '#243255', '#3d4048', '#4a3a2c']);
    if (c.ts === 'suit') { c.bot = (c.bot === 'skirt' && !m) ? 'skirt' : 'pants'; c.botC = c.top; c.inner = '#f3f0ea'; }
  }
  c.hat = r() < .3 ? P(['cap', 'beanie', 'bucket']) : null; c.scarf = r() < .12; c.pack = r() < .25; c.boots = r() < .3;
  if (c.bot === 'dress') c.botC = c.top;
  if (c.hair === 'bald') c.beard = m && r() < .5;
  return c;
}

const IDENTITY_SKIP = new Set(['expression', 'brow', 'mouth', 'smile', 'browMood', '__dna', 'dna', 'talk', 'animate', 'view', 'flip', 'x', 'ground', 'scale']);
function identityKey(L, idx) {
  const keys = Object.keys(L).filter((k) => !IDENTITY_SKIP.has(k)).sort();
  if (!keys.length) return 'anon#' + (idx || 0);
  const o = {}; for (const k of keys) o[k] = L[k];
  return JSON.stringify(o);
}
export function seedFromLook(L, idx) {
  const s = L && L.seed;
  if (s !== undefined && s !== null && s !== '' && Number.isFinite(+s)) return (Math.abs(Math.floor(+s)) % 2147483647) || 1;
  if (typeof s === 'string' && s.trim()) return hashSeed(s.trim());
  return hashSeed(identityKey(L || {}, idx));
}

export function resolveExpression(L) {
  let mouth = String(L.mouth || ''), brow = String(L.brow || '');
  const ex = String(L.expression || '').toLowerCase();
  const E = {
    happy: ['grin', 'happy'], excited: ['grin', 'happy'], sad: ['frown', 'sad'], angry: ['flat', 'angry'], shock: ['open', 'happy'], surprised: ['open', 'happy'],
    cool: ['smirk', 'calm'], quirky: ['smirk', 'calm'], wink: ['smirk', 'happy'], shy: ['flat', 'sad'], chill: ['smile', 'calm'], calm: ['smile', 'calm'], scared: ['open', 'sad'],
  };
  if (!HF_OPTIONS.mouth.includes(mouth) && E[ex]) mouth = E[ex][0];
  if (!HF_OPTIONS.brow.includes(brow) && E[ex]) brow = E[ex][1];
  if (!HF_OPTIONS.mouth.includes(mouth)) mouth = 'smile';
  if (!HF_OPTIONS.brow.includes(brow)) brow = 'calm';
  return { mouth, brow, wide: ex === 'shock' || ex === 'surprised' || ex === 'scared' };
}

export function hfSpec(look, idx = 0) {
  const L = look && typeof look === 'object' ? look : {};
  const seed = seedFromLook(L, idx);
  const gs = String(L.gender || L.sex || '').toLowerCase();
  const g = /^f|^w|^girl/.test(gs) ? 'f' : /^m|^b/.test(gs) ? 'm' : (rng(seed ^ 0x9e3779b9)() < .5 ? 'f' : 'm');
  const c = mk(g, seed);
  const skin = asHex(L.skin); if (skin) c.skin = skin;
  const hairc = asHex(L.hairc || L.hairC || L.hairColor); if (hairc) c.hairC = hairc;
  const eye = asHex(L.eyec || L.eyeColor || L.eye); if (eye) c.eye = eye;
  if (L.hair !== undefined) {
    let hk = String(L.hair).toLowerCase(); hk = HAIR_ALIAS[hk] || hk;
    if (hk in HSTY) { c.hair = hk; if (hk === 'bald' && g === 'm' && L.facialHair === undefined) c.beard = c.beard; }
  }
  let ts = L.top !== undefined && !asHex(L.top) ? String(L.top).toLowerCase() : (L.outfit !== undefined ? String(L.outfit).toLowerCase() : '');
  if (ts === 'dress') { c.bot = 'dress'; ts = ''; }
  if (ts) { ts = TOP_ALIAS[ts] || ts; if (HF_OPTIONS.top.includes(ts)) { c.ts = ts; c.sleeve = ({ tank: 0, tee: 1 })[ts] ?? 2; } }
  const topc = asHex(L.topc || L.topColor || L.outfitc || (asHex(L.top) ? L.top : ''));
  if (topc) c.top = topc;
  let bt = L.bottom !== undefined ? String(L.bottom).toLowerCase() : '';
  if (bt) { bt = BOT_ALIAS[bt] || bt; if (HF_OPTIONS.bottom.includes(bt)) c.bot = bt; }
  const botc = asHex(L.bottomc || L.bottomColor || L.botc);
  if (c.ts === 'suit' && !botc && c.bot !== 'skirt') { c.bot = c.bot === 'skirt' ? 'skirt' : 'pants'; c.botC = c.top; }
  if (botc) c.botC = botc;
  if (c.bot === 'dress' && !botc) c.botC = c.top;
  const shoeRaw = L.shoec || L.shoeColor || (asHex(L.shoe) ? L.shoe : '');
  const shoec = asHex(shoeRaw); if (shoec) c.shoe = shoec;
  if (typeof L.shoe === 'string' && /boot/i.test(L.shoe)) c.boots = true;
  const eyew = L.eyewear !== undefined ? L.eyewear : L.glasses;
  if (eyew !== undefined) c.glasses = !!eyew && !/^(none|no|false)$/i.test(String(eyew));
  const fh = L.facialHair !== undefined ? L.facialHair : L.beard;
  if (fh !== undefined) c.beard = !!fh && !/^(none|no|false)$/i.test(String(fh));
  const hw = L.headwear !== undefined ? L.headwear : L.hat;
  if (hw !== undefined) {
    const k = String(hw).toLowerCase();
    c.hat = /^(none|no|false|)$/.test(k) ? null : (HAT_ALIAS[k] || (HF_OPTIONS.headwear.includes(k) ? k : 'cap'));
  }
  const acc = Array.isArray(L.acc) ? L.acc : Array.isArray(L.accessories) ? L.accessories : [];
  if (acc.includes('scarf')) c.scarf = true;
  if (acc.includes('backpack')) c.pack = true;
  const ac = asHex(L.accentc || L.hatc || L.scarfc); if (ac) c.sc = ac;
  const hgt = +L.height; if (Number.isFinite(hgt) && hgt > 0) c.h *= cl(hgt, .8, 1.2);
  const bld = +L.build; if (Number.isFinite(bld) && bld > 0) c.bulk = cl(bld, .75, 1.3);
  if (c.hair === 'bald' && L.facialHair === undefined && L.beard === undefined) { /* keep generated beard */ }
  return { c, ex: resolveExpression(L) };
}

export function hfRandomLook(seed) {
  const s = (Math.abs(Math.floor(+seed || 1)) % 2147483647) || 1;
  const { c } = hfSpec({ seed: s });
  return { seed: s, gender: c.g === 'm' ? 'male' : 'female' };
}

// ---- pose mapping: app pose model -> HumanForge joint angles ----
const D2R = PI / 180;
function mapPose(P, view) {
  const a = Array.isArray(P.a) ? P.a : [34, -36, 34, -36];
  const l = Array.isArray(P.l) ? P.l : [0, 0, 0, 0];
  const kb = Math.max(0, +P.k || 0), bend = kb > 1;
  const side = view === 'side', back = view === 'back';
  const o = { tl: 0, tr: 0, kl: 0, kr: 0, al: 0, ar: 0, el: .2, er: .2, sl: .08, sr: .08, esl: 0, esr: 0, lean: .03, ll: 0, tw: 0, pw: 0, hy: 0, j: 0, spl: [0, 0] };
  const armIdx = (i) => (side ? i : back ? i : 1 - i);
  const legIdx = (i) => (side ? 1 - i : back ? i : 1 - i);
  const arm = [{}, {}], leg = [{}, {}];
  for (let i = 0; i < 2; i++) {
    const ua = +a[i * 2] || 0, fa = +a[i * 2 + 1] || 0, h = armIdx(i);
    if (side) {
      const uW = (ua - 34) * 1.15 + 4;
      const rawF = fa > 0 ? (uW + 18) + (fa - (uW + 18)) * .72 : 22 + (-36 - fa) * 1.05;
      arm[h] = { a: cl(uW, -85, 175) * D2R, s: .1, e: cl(rawF - uW, -10, 120) * D2R, es: 0 };
    } else {
      arm[h] = { a: .05, s: ua * D2R, e: .15, es: (fa - ua) * D2R };
    }
    const sw = +l[i] || 0, lift = bend ? 0 : (+l[2 + i] || 0), lh = legIdx(i);
    let t, spl = 0;
    if (side) t = cl(sw, -110, 110) * D2R;
    else { spl = cl(sw * (bend ? .15 : .42), -30, 30) * D2R; t = sw * D2R * (bend ? 1 : .55); }
    leg[lh] = { t: t + lift * .004, k: (bend ? kb * D2R : 0) + lift * .033, spl };
  }
  o.al = arm[0].a; o.sl = arm[0].s; o.el = arm[0].e; o.esl = arm[0].es;
  o.ar = arm[1].a; o.sr = arm[1].s; o.er = arm[1].e; o.esr = arm[1].es;
  o.tl = leg[0].t; o.kl = leg[0].k; o.tr = leg[1].t; o.kr = leg[1].k; o.spl = [leg[0].spl, leg[1].spl];
  const tr = (+P.tr || 0) * D2R;
  if (side) o.lean = .03 + tr * .9; else o.ll = back ? -tr : tr;
  o.hy = cl((+P.hx || 0) * .04, -.35, .35);
  return o;
}

const SC = 325; // pixels per HumanForge unit -> a standing character is ~620px tall in 1600x900
const CP = cos(.2), SP = sin(.2), OUT = '#1a1524';

export function renderHumanForge(look, P, talk, mo, blk, view, uid, idx) {
  const { c, ex } = hfSpec(look, idx);
  P = P || {};
  const vw = view === 'side' ? 'side' : view === 'back' ? 'back' : 'front';
  const pp = mapPose(P, vw);
  const vCur = vw === 'side' ? PI / 2 : vw === 'back' ? PI - .22 : .22;
  const psi = vCur;
  const S = SC;
  const defs = new Map();
  let gid = 0;
  const safeUid = String(uid || 'hf').replace(/[^a-z0-9_]/gi, '');

  const T = (x, y, z) => {
    const c2 = cos(vCur), s2 = sin(vCur), X2 = x * c2 + z * s2, Z2 = -x * s2 + z * c2;
    return { x: X2, y: y * CP - Z2 * SP, z: y * SP + Z2 * CP };
  };
  const Tl = (a) => T(a[0], a[1], a[2]);
  const sx = (p) => p.x * S, sy = (p) => 880 - p.y * S;
  const dk = (col, z) => sh(col, Math.round((.78 + .22 * cl((z + .7) / 1.1, 0, 1)) * 25) / 25);
  const n2 = (v) => f2(v);

  // radial gradients are shared per colour so each sphere stays a single element
  const grad = (col, K) => {
    const key = col + '|' + K;
    let id = defs.get(key);
    if (!id) {
      id = safeUid + 'g' + (++gid);
      defs.set(key, id);
      defs.set('def' + id,
        `<radialGradient id="${id}" cx=".5" cy=".5" r=".5" fx=".325" fy=".3" fr=".05"><stop offset="0" stop-color="${lt(col, .22 * K)}"/><stop offset=".65" stop-color="${col}"/><stop offset="1" stop-color="${sh(col, 1 - .2 * K)}"/></radialGradient>`);
    }
    return id;
  };

  const cap = (a, b, r1, r2, col) => {
    const ax = sx(a), ay = sy(a), bx = sx(b), by = sy(b), R1 = r1 * S, R2 = r2 * S;
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    const fill = dk(col, (a.z + b.z) / 2);
    return `<path d="M${n2(ax + nx * R1)},${n2(ay + ny * R1)}L${n2(bx + nx * R2)},${n2(by + ny * R2)}A${n2(R2)},${n2(R2)} 0 0 0 ${n2(bx - nx * R2)},${n2(by - ny * R2)}L${n2(ax - nx * R1)},${n2(ay - ny * R1)}A${n2(R1)},${n2(R1)} 0 0 0 ${n2(ax + nx * R1)},${n2(ay + ny * R1)}Z" fill="${fill}" stroke="${OUT}" stroke-width="3" stroke-linejoin="round"/>`;
  };
  const sph = (p, r, col, ol, fl) => {
    const K = fl ? .3 : 1, x = sx(p), y = sy(p), R = r * S, cc = dk(col, p.z);
    return `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(R)}" fill="url(#${grad(cc, K)})"${ol ? ` stroke="${OUT}" stroke-width="3"` : ''}/>`;
  };

  // ---- skeleton ----
  const fk = (Y) => {
    const g = c.g === 'm', L = c.h, b = c.bulk;
    const th = .46 * L, sn = .45 * L, tor = .5 * L, ua = .29 * L, fa = .27 * L, hr = .112 * L * c.hs;
    const hw = (g ? .092 : .1) * L * b, sw = (g ? .2 : .165) * L * (g ? b : .96);
    const ry = (x, z, a) => [x * cos(a) + z * sin(a), -x * sin(a) + z * cos(a)];
    const J = { th, sn, tor, hr, hw, sw, L, b };
    J.pel = [0, Y, 0];
    const ls = sin(pp.ll) * tor;
    const chest = [ls, Y + cos(pp.lean) * cos(pp.ll) * tor, sin(pp.lean) * tor]; J.chest = chest;
    const nl = hr + .07 * L;
    J.head = [chest[0] + sin(pp.ll) * nl, chest[1] + cos(pp.lean * .5) * cos(pp.ll) * nl, chest[2] + sin(pp.lean * .5) * nl];
    const leg = (s, a, k, spl) => {
      const [x, z] = ry(s * hw, 0, pp.pw), h = [x, Y, z];
      const out = s * sin(spl);
      const kn = [x + out * th, h[1] - cos(a) * cos(spl) * th, z + sin(a) * th];
      const a2 = a - k;
      const an = [x + out * (th + sn), kn[1] - cos(a2) * cos(spl) * sn, kn[2] + sin(a2) * sn];
      const f = a2 * .6;
      return { h, kn, an, toe: [an[0], an[1] - .03 * L + .12 * L * sin(f), an[2] + .13 * L * cos(f)] };
    };
    J.leg = [leg(1, pp.tl, pp.kl, pp.spl[0]), leg(-1, pp.tr, pp.kr, pp.spl[1])];
    const dir = (a, s, sd) => [sd * sin(s), -cos(s) * cos(a), cos(s) * sin(a)];
    const arm = (s, a, sp, e, es) => {
      const [x, z] = ry(s * sw, 0, pp.tw), sh_ = [x + chest[0], chest[1] - .035 * L, chest[2] + z];
      const d1 = dir(a, sp, s), d2 = dir(a + e, sp + es, s);
      const el = [sh_[0] + d1[0] * ua, sh_[1] + d1[1] * ua, sh_[2] + d1[2] * ua];
      const wr = [el[0] + d2[0] * fa, el[1] + d2[1] * fa, el[2] + d2[2] * fa];
      return { sh: sh_, el, wr, hand: [wr[0] + d2[0] * .05 * L, wr[1] + d2[1] * .05 * L, wr[2] + d2[2] * .05 * L] };
    };
    J.arm = [arm(1, pp.al, pp.sl, pp.el, pp.esl), arm(-1, pp.ar, pp.sr, pp.er, pp.esr)];
    return J;
  };
  let J0 = fk(0), mnY = 1e9;
  for (const l of J0.leg) mnY = Math.min(mnY, l.an[1] - .04 * c.h, l.toe[1] - .035 * c.h);
  const J = fk(-mnY);

  // ---- draw ----
  const parts = [], head = [];
  const add = (z, s) => parts.push({ z, s });
  const m = c.g === 'm', { L, b, hr } = J, sk = c.skin;
  const dress = c.bot === 'dress', skirt = c.bot === 'skirt' || dress;
  const botC = dress ? c.top : c.botC, pants = c.bot === 'pants';
  const lerp = (p, q, k) => p.map((v, i) => v + (q[i] - v) * k);

  J.leg.forEach((l) => {
    const rt = .062 * L * (m ? b : b * .95), z = (T(...l.h).z + T(...l.an).z) / 2;
    const h = Tl(l.h), k = Tl(l.kn), a = Tl(l.an), t = Tl(l.toe);
    let s = '';
    if (pants) { s += cap(h, k, rt * 1.08, rt * .8, botC) + cap(k, a, rt * .8, rt * .62, botC); }
    else {
      const mid = Tl(lerp(l.h, l.kn, c.bot === 'shorts' ? .62 : .5));
      s += cap(h, k, rt, rt * .78, sk) + cap(k, a, rt * .76, rt * .58, sk) + cap(h, mid, rt * 1.1, rt * (c.bot === 'shorts' ? .98 : .95), botC);
    }
    if (c.boots) s += cap(a, Tl(lerp(l.an, l.kn, .38)), .045 * L, .042 * L, c.shoe);
    s += cap(a, t, .04 * L, .034 * L, c.shoe);
    s += cap(Tl([l.an[0], l.an[1] + .1 * L, l.an[2]]), a, .036 * L, .04 * L, c.shoe);
    add(z, s);
  });

  J.arm.forEach((a) => {
    const ru = .043 * L * (m ? b : .9), z = (T(...a.sh).z + T(...a.wr).z) / 2, sl = c.sleeve;
    const s0 = Tl(a.sh), e = Tl(a.el), w = Tl(a.wr), h = Tl(a.hand);
    let s = cap(s0, e, ru, ru * .82, sl === 2 ? c.top : sk) + cap(e, w, ru * .8, ru * .62, sl === 2 ? c.top : sk);
    if (sl === 1) s += cap(s0, Tl(lerp(a.sh, a.el, .55)), ru * 1.12, ru, c.top);
    s += sph(h, .037 * L, sk, 1) + sph(s0, ru * 1.15, sl ? c.top : sk);
    add(z, s);
  });

  // torso
  const chestP = Tl(J.chest), tz = chestP.z, N = 9;
  const wf = m ? [.165, .16, .2] : [.17, .13, .165], df = m ? [.11, .1, .12] : [.115, .09, .1];
  {
    const pts = [];
    for (let i = 0; i < N; i++) {
      const v = i / (N - 1), q = v < .3 ? v / .3 : (v - .3) / .7;
      const w = (v < .3 ? wf[0] + (wf[1] - wf[0]) * q : wf[1] + (wf[2] - wf[1]) * q) * L * b * (i === N - 1 ? .93 : 1);
      const d = (v < .3 ? df[0] + (df[1] - df[0]) * q : df[1] + (df[2] - df[1]) * q) * L * (.9 + b * .1);
      const p = Tl(lerp([J.pel[0], J.pel[1] - .03 * L, J.pel[2]], J.chest, v));
      pts.push({ x: sx(p), y: sy(p), rx: Math.hypot(w * cos(psi), d * sin(psi)) * S, v, i });
    }
    const colOf = (p) => (p.v < .2 && !dress ? (skirt ? c.top : botC) : (c.ts === 'stripe' && p.i % 2 ? c.sc : c.top));
    let s = '<path d="M' + pts.map((p) => `${n2(p.x - p.rx)},${n2(p.y)}`).join('L') + 'L' + pts.slice().reverse().map((p) => `${n2(p.x + p.rx)},${n2(p.y)}`).join('L') + `Z" fill="${OUT}" stroke="${OUT}" stroke-width="3" stroke-linejoin="round"/>`;
    for (let i = 0; i < N - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1], col = dk(colOf(p0), tz);
      s += `<path d="M${n2(p0.x - p0.rx)},${n2(p0.y)}L${n2(p1.x - p1.rx)},${n2(p1.y)}L${n2(p1.x + p1.rx)},${n2(p1.y)}L${n2(p0.x + p0.rx)},${n2(p0.y)}Z" fill="${col}" stroke="${col}" stroke-width="1.2"/>`;
    }
    const f = cos(psi), a0 = pts[N - 1], b0 = pts[1];
    if (f > .25 && !dress && (c.ts === 'jacket' || c.ts === 'suit' || c.ts === 'hoodie')) {
      const lc = c.ts === 'hoodie' ? sh(c.top, .72) : c.inner, lw = c.ts === 'hoodie' ? 2 : a0.rx * .45 * f;
      s += `<path d="M${n2(a0.x)},${n2(a0.y - 2)}L${n2(b0.x)},${n2(b0.y)}" stroke="${lc}" stroke-width="${n2(lw)}" fill="none"/>`;
      if (c.ts === 'suit') s += `<path d="M${n2(a0.x)},${n2(a0.y)}L${n2(pts[4].x)},${n2(pts[4].y)}" stroke="#b0384a" stroke-width="${n2(4 * f)}" fill="none"/>`;
    }
    s += cap(Tl(J.chest), Tl(J.head), .045 * L, .04 * L, sk);
    add(tz, s);
  }
  if (c.ts === 'hoodie' && !dress) { const p = Tl([J.chest[0], J.chest[1] + .01 * L, J.chest[2] - .05 * L]); add(p.z, sph(p, .1 * L, c.top, 1)); }
  if (c.scarf) {
    const a = Tl([J.chest[0], J.chest[1] - .025 * L, J.chest[2]]), b2 = Tl([J.chest[0], J.chest[1] + .005 * L, J.chest[2]]);
    const t1 = Tl([J.chest[0] + .04 * L, J.chest[1] - .03 * L, J.chest[2] + .075 * L]), t2 = Tl([J.chest[0] + .04 * L, J.chest[1] - .17 * L, J.chest[2] + .085 * L]);
    add(tz, cap(a, b2, .07 * L, .062 * L, c.sc) + cap(t1, t2, .028 * L, .024 * L, c.sc));
  }
  if (c.pack) { const a = Tl([J.chest[0], J.chest[1] - .04 * L, J.chest[2] - .13 * L]), b2 = Tl([J.chest[0], J.chest[1] - .27 * L, J.chest[2] - .13 * L]); add(a.z, cap(a, b2, .085 * L, .08 * L, c.packC)); }
  if (skirt) {
    const l0 = J.leg[0], l1 = J.leg[1], hm = lerp(lerp(l0.h, l0.kn, .7), lerp(l1.h, l1.kn, .7), .5);
    const z = Math.max(T(...l0.kn).z, T(...l1.kn).z) + .01;
    const pj = (w, d) => Math.hypot(w * cos(psi), d * sin(psi)) * S;
    const a = Tl([J.pel[0], J.pel[1] - .02 * L, J.pel[2]]), bt = Tl(hm);
    const wt = pj(J.hw + .06 * L, .1 * L), wb = pj(J.hw + (dress ? .2 : .14) * L * b, .17 * L);
    const ax = sx(a), ay = sy(a), bx = sx(bt), by = sy(bt);
    let s = '';
    for (const k of [1.5, 0]) {
      s += `<path d="M${n2(ax - wt - k)},${n2(ay)}L${n2(bx - wb - k)},${n2(by)}A${n2(wb + k)},${n2(wb * .2 + k)} 0 0 0 ${n2(bx + wb + k)},${n2(by)}L${n2(ax + wt + k)},${n2(ay)}Z" fill="${k ? OUT : dk(botC, z)}"/>`;
    }
    add(z, s);
  }

  // head (every piece goes through hadd so head roll / nudge applies as one transform)
  const hc = Tl(J.head), R = hr, hyaw = pp.hy;
  const pivot = Tl(J.chest);
  const hxo = f2(P.hx || 0), hyo = f2(P.hy || 0), hrot = f2(P.hr || 0);
  const headXf = (hxo || hyo || hrot) ? `translate(${hxo},${hyo}) rotate(${hrot} ${n2(sx(pivot))} ${n2(sy(pivot))})` : '';
  const hadd = (z, s) => head.push({ z, s });
  const lh = (x, y, z) => { const rx = x * cos(hyaw) + z * sin(hyaw), rz = -x * sin(hyaw) + z * cos(hyaw); return T(J.head[0] + rx, J.head[1] + y, J.head[2] + rz); };
  const H3 = (x, y, z) => lh(x * R, y * R, z * R);
  hadd(hc.z, sph(hc, R, sk, 1));
  const surf = (x, y) => Math.sqrt(Math.max(0, 1 - x * x - y * y));
  const ear = (s) => { const p = H3(s * .98, -.05, -.1); hadd(p.z, sph(p, .2 * R, sh(sk, .95), 1)); };
  ear(1); ear(-1);
  { const p = H3(0, -.1, 1.02); hadd(p.z, sph(p, .17 * R, sh(sk, .92))); }
  const face = (x, y, fn) => { const p = H3(x, y, surf(x, y) * .97), nz = (p.z - hc.z) / R; if (nz > .08) hadd(p.z + .1 * R, fn(sx(p), sy(p), nz)); };
  const eyeOpen = cl(Number.isFinite(+blk) ? +blk : 1, .1, 1);
  const bigEye = ex.wide ? 1.18 : 1;
  for (const s of [1, -1]) {
    face(s * .38, 0, (x, y, nz) => {
      const w = .2 * R * S * cl(nz, .3, 1) * bigEye, hgt = .13 * R * S * bigEye * eyeOpen;
      let o = `<ellipse cx="${n2(x)}" cy="${n2(y)}" rx="${n2(w)}" ry="${n2(hgt)}" fill="#fff"/>`;
      if (eyeOpen > .35) {
        o += `<ellipse cx="${n2(x)}" cy="${n2(y)}" rx="${n2(w * .55)}" ry="${n2(Math.min(.11 * R * S * bigEye, hgt))}" fill="${c.eye}"/><circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(Math.min(.05 * R * S, hgt * .8))}" fill="#111"/>`;
      } else {
        o += `<path d="M${n2(x - w)},${n2(y)}L${n2(x + w)},${n2(y)}" stroke="#111" stroke-width="2.4" stroke-linecap="round"/>`;
      }
      if (!m) o += `<path d="M${n2(x - w)},${n2(y - .01 * R * S)}Q${n2(x)},${n2(y - .2 * R * S * eyeOpen)} ${n2(x + w)},${n2(y - .04 * R * S)}" stroke="#111" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      return o;
    });
    face(s * .4, .26, (x, y, nz) => {
      const w = .2 * R * S * cl(nz, .3, 1), col = sh(c.hairC, .7), lw = m ? 3 : 2, k = R * S;
      const lift = ex.wide ? -.1 * k : 0;
      let d;
      if (ex.brow === 'happy') d = `M${n2(x - w)},${n2(y + lift)}Q${n2(x)},${n2(y - .1 * k + lift)} ${n2(x + w)},${n2(y + .02 * k + lift)}`;
      else if (ex.brow === 'sad') d = `M${n2(x - s * w)},${n2(y - .06 * k + lift)}L${n2(x + s * w)},${n2(y + .05 * k + lift)}`;
      else if (ex.brow === 'angry') d = `M${n2(x - s * w)},${n2(y + .06 * k + lift)}L${n2(x + s * w)},${n2(y - .06 * k + lift)}`;
      else d = `M${n2(x - w)},${n2(y + 1 + lift)}L${n2(x + w)},${n2(y - 2 + lift)}`;
      return `<path d="${d}" stroke="${col}" stroke-width="${lw}" fill="none" stroke-linecap="round"/>`;
    });
    if (c.glasses) face(s * .4, 0, (x, y, nz) => `<ellipse cx="${n2(x)}" cy="${n2(y)}" rx="${n2(.27 * R * S * cl(nz, .3, 1))}" ry="${n2(.22 * R * S)}" fill="none" stroke="#222" stroke-width="2"/>`);
  }
  face(0, -.46, (x, y, nz) => {
    const w = .22 * R * S * cl(nz, .3, 1), k = R * S, ink = m ? '#6b3b3b' : c.lip, lw = m ? 2 : 3;
    let mouth = ex.mouth;
    const mOpen = Number.isFinite(+mo) ? cl(+mo, 0, 1) : 0;
    if (talk && mOpen > .12) mouth = 'open';
    const openAmt = mouth === 'open' ? (talk ? .06 + .14 * mOpen : .17) : 0;
    if (mouth === 'open') {
      return `<ellipse cx="${n2(x)}" cy="${n2(y + openAmt * k * .6)}" rx="${n2(w * .62)}" ry="${n2(openAmt * k)}" fill="#4a1a22" stroke="${OUT}" stroke-width="1.6"/><ellipse cx="${n2(x)}" cy="${n2(y + openAmt * k * 1.15)}" rx="${n2(w * .36)}" ry="${n2(openAmt * k * .45)}" fill="#c8606a"/>`;
    }
    if (mouth === 'grin') {
      return `<path d="M${n2(x - w)},${n2(y)}Q${n2(x)},${n2(y + .34 * k)} ${n2(x + w)},${n2(y)}Z" fill="#6a2430" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/><path d="M${n2(x - w * .8)},${n2(y + 1.5)}L${n2(x + w * .8)},${n2(y + 1.5)}" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>`;
    }
    if (mouth === 'smirk') return `<path d="M${n2(x - w)},${n2(y + .02 * k)}Q${n2(x + w * .2)},${n2(y + .1 * k)} ${n2(x + w)},${n2(y - .07 * k)}" stroke="${ink}" stroke-width="${lw}" fill="none" stroke-linecap="round"/>`;
    if (mouth === 'frown') return `<path d="M${n2(x - w)},${n2(y + .06 * k)}Q${n2(x)},${n2(y - .1 * k)} ${n2(x + w)},${n2(y + .06 * k)}" stroke="${ink}" stroke-width="${lw}" fill="none" stroke-linecap="round"/>`;
    if (mouth === 'flat') return `<path d="M${n2(x - w * .8)},${n2(y)}L${n2(x + w * .8)},${n2(y)}" stroke="${ink}" stroke-width="${lw}" fill="none" stroke-linecap="round"/>`;
    return `<path d="M${n2(x - w)},${n2(y)}Q${n2(x)},${n2(y + .1 * k)} ${n2(x + w)},${n2(y)}" stroke="${ink}" stroke-width="${lw}" fill="none" stroke-linecap="round"/>`;
  });
  for (const s of [1, -1]) face(s * .6, -.22, (x, y, nz) => `<ellipse cx="${n2(x)}" cy="${n2(y)}" rx="${n2(.15 * R * S * cl(nz, .3, 1))}" ry="${n2(.1 * R * S)}" fill="rgba(230,110,110,.22)"/>`);

  // hair
  const hs = HSTY[c.hair], hcol = c.hairC;
  const hsp = (x, y, z, r, col) => { const p = H3(x, y, z); hadd(p.z, sph(p, r * R, col || hcol, 0, 1)); };
  if (hs) {
    for (let az = 0; az < 360; az += 30) for (const el of [0, 25, 50, 75]) {
      const a = az * PI / 180, e = el * PI / 180, thr = hs.hb + (hs.hf - hs.hb) * (.5 + .5 * cos(a));
      if (el >= thr && !(c.hat && el >= 50)) hsp(sin(a) * cos(e) * hs.rad, sin(e) * hs.rad, cos(a) * cos(e) * hs.rad, hs.rs);
    }
    if (!c.hat) { hsp(0, hs.rad, 0, hs.rs); if (hs.top) hsp(0, .95, .35, .5); if (hs.bun) hsp(0, 1.05, -.5, .45); }
    for (let k = 0; k < (hs.back || 0); k++) hsp(0, -.1 - k * .5, -.82, .78 - k * .05);
    for (let k = 0; k < (hs.side || 0); k++) for (const s of [1, -1]) hsp(s * .92, -.3 - k * .45, -.05, .34);
    if (hs.tail) for (let k = 0; k < 5; k++) hsp(0, .3 - k * .45, -1 - k * .2, .32 - k * .03);
    if (hs.braid) for (let k = 0; k < 7; k++) hsp(0, -.1 - k * .5, -1.05, .23);
  }
  if (c.hat) {
    const hc2 = c.sc, rim = sh(hc2, .8), bn = c.hat === 'beanie', hf = bn ? 28 : 48, hb = bn ? 10 : 25, rd = bn ? 1 : .95, rs = bn ? .58 : .55;
    for (let az = 0; az < 360; az += 30) for (const el of [0, 25, 50, 75]) {
      const a = az * PI / 180, e = el * PI / 180, thr = hb + (hf - hb) * (.5 + .5 * cos(a));
      if (el >= thr) hsp(sin(a) * cos(e) * rd, sin(e) * rd + .05, cos(a) * cos(e) * rd, rs, hc2);
    }
    hsp(0, rd + .05, 0, rs, hc2); if (bn) hsp(0, 1.4, 0, .25, c.inner);
    if (c.hat === 'cap') { const p1 = H3(0, .5, .9), p2 = H3(0, .4, 1.6); hadd(p2.z, cap(p1, p2, .18 * R, .13 * R, rim)); }
    if (c.hat === 'bucket') for (let az = 0; az < 360; az += 40) { const a = az * PI / 180; hsp(sin(a) * 1.35, .5, cos(a) * 1.35, .2, rim); }
  }
  if (c.beard) {
    const bc = sh(hcol, .9);
    hsp(0, -.64, .78, .3, bc); hsp(.4, -.5, .72, .27, bc); hsp(-.4, -.5, .72, .27, bc); hsp(.64, -.22, .55, .2, bc); hsp(-.64, -.22, .55, .2, bc);
  }
  head.sort((p, q) => p.z - q.z);
  const headParts = head.map((p) => ({ z: p.z, s: headXf ? `<g transform="${headXf}">${p.s}</g>` : p.s }));
  parts.push(...headParts);
  parts.sort((p, q) => p.z - q.z);

  // ---- chair + outer transform (same conventions as the stickman rig) ----
  const dx = +P.dx || 0, pDy = +P.dy || 0;
  const sq = Math.max(.2, +P.sq || 1), scl = Math.max(.2, +P.sc || 1);
  const shScaleY = pDy < 0 ? Math.max(.18, 1 + pDy / 500) : 1;
  const shadowRx = Math.round(96 * shScaleY * (vw === 'side' ? .8 : 1));
  const pelvisPx = sy(Tl(J.pel));
  const sitting = !!P.chair && (+P.k || 0) > 1;
  const effDy = sitting ? Math.min(pDy, 0) : pDy;
  const chairInfo = P.chair ? { seatY: Math.round(pelvisPx + 8), vk: vw === 'side' ? 's' : vw === 'back' ? 'b' : 'f' } : null;

  let defsSvg = '';
  for (const [k, v] of defs) if (k.startsWith('def')) defsSvg += v;
  const body = parts.map((p) => p.s).join('');
  const bodySvg =
    `<ellipse cx="${n2(dx)}" cy="880" rx="${shadowRx}" ry="${n2(11 * shScaleY)}" fill="#000" opacity=".16"/>` +
    '<!--CHAIR_B-->' +
    `<g transform="translate(${n2(dx)},${n2(effDy)}) translate(0,880) scale(${n2(1 / sq)},${n2(sq)}) translate(0,-880) translate(0,560) rotate(${n2(P.rot || 0)}) scale(${n2(scl)}) translate(0,-560)"><defs>${defsSvg}</defs>${body}</g>` +
    '<!--CHAIR_F-->';
  return { svg: bodySvg, chair: chairInfo };
}
