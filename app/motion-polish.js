// Motion polish for every character style (Original, Stickman, Doodle, Human, custom puppets).
//
// The scene engine describes a character's pose with a handful of numbers (arm angles, leg swing, lean, head, squash...).
// This module is the layer between those numbers and the pictures. It never draws anything. It makes the numbers move like
// a person instead of like a machine:
//
//   motionDNA(look)          every character gets their own way of moving (tempo, stride, arm swing, posture, habits),
//                            from their persona words and seed, so two people never walk or gesture identically.
//   gaitPose(...)            a real walking / running cycle: step length locked to the distance covered (no sliding
//                            feet), knees that bend on the swing, arms that counter-swing, a body that rocks and bobs.
//   smoothPose(...)          removes the snaps between scripted actions (if t<3 ... else ...) with a zero-lag blend, and
//                            lets the head and hands trail the body a fraction of a second (follow-through).
//   turnAmount(...)          a quick squash-and-open when a character turns between front, side and back views.
//   mouthTrack / lipAt(...)  lip sync from the spoken words themselves (letters -> mouth shapes), timed by the word
//                            timings or the speech curve, blended so the mouth glides instead of flickering.
//   speechBeats(...)         when the voice stresses a syllable, the hand and head accent it.
//
// Everything here is a pure function of the film clock, so the preview and the exported video match frame for frame.

const PI = Math.PI, sin = Math.sin, cos = Math.cos;
export const cl = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (a, b, v) => { const t = cl((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

// ---------------------------------------------------------------------------------------------------------------
// Small deterministic random helpers
// ---------------------------------------------------------------------------------------------------------------
export function hashStr(input) {
  const str = String(input == null ? '' : input);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function hashInt(n) { let h = Math.imul((n | 0) ^ 0x9e3779b9, 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return h >>> 0; }
export const hash01 = (n) => hashInt(n) / 4294967296;
function mulberry(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------------------------------------------------------
// 1. Motion DNA: who this character is, in how they move
// ---------------------------------------------------------------------------------------------------------------
// tempo: how quickly they do everything; stride: step length; swing: arm swing; bob: up and down in the step;
// lean: posture (positive = forward, hunched; negative = chest out); sway: weight shifting; gest: how much and how big
// they gesture while talking; tilt: head tilt habit; reps: the gestures they reach for first.
const ARCH = {
  calm:      { tempo: .82, stride: .98, swing: .85, bob: .8, lean: .5, sway: .8, gest: .75, tilt: .9, bounce: 0, reps: ['explain', 'offer', 'low'] },
  warm:      { tempo: .95, stride: 1, swing: 1, bob: 1, lean: 0, sway: 1, gest: 1, tilt: 1.3, bounce: 0, reps: ['offer', 'explain', 'chest'] },
  bubbly:    { tempo: 1.3, stride: 1.05, swing: 1.3, bob: 1.5, lean: -1, sway: 1.3, gest: 1.5, tilt: 1.4, bounce: 1, reps: ['handsUp', 'explainWide', 'offer', 'beat'] },
  confident: { tempo: 1, stride: 1.1, swing: 1.1, bob: .9, lean: -2.5, sway: .8, gest: 1.1, tilt: .6, bounce: 0, reps: ['beat', 'point', 'explainWide'] },
  bold:      { tempo: 1.1, stride: 1.15, swing: 1.25, bob: 1, lean: -1, sway: 1, gest: 1.3, tilt: .6, bounce: 0, reps: ['beat', 'point', 'explainWide'] },
  shy:       { tempo: .85, stride: .85, swing: .55, bob: .6, lean: 4, sway: .6, gest: .45, tilt: 1.6, bounce: 0, reps: ['low', 'chest', 'offer'] },
  nervous:   { tempo: 1.35, stride: .85, swing: .7, bob: .9, lean: 3, sway: 1.5, gest: .8, tilt: .9, bounce: 0, reps: ['chest', 'shrug', 'low'] },
  grumpy:    { tempo: .85, stride: .95, swing: .7, bob: .6, lean: 2, sway: .5, gest: .85, tilt: .5, bounce: 0, reps: ['beat', 'shrug', 'point'] },
  playful:   { tempo: 1.25, stride: 1, swing: 1.3, bob: 1.4, lean: -.5, sway: 1.3, gest: 1.3, tilt: 1.6, bounce: 1, reps: ['handsUp', 'offer', 'shrug', 'beat'] },
  dreamy:    { tempo: .7, stride: .92, swing: .8, bob: .7, lean: 1, sway: 1, gest: .6, tilt: 1.7, bounce: 0, reps: ['chest', 'offer', 'low'] },
  nerdy:     { tempo: 1.1, stride: .95, swing: .85, bob: .8, lean: 2.5, sway: .7, gest: 1.1, tilt: 1, bounce: 0, reps: ['count', 'explain', 'point'] },
  cool:      { tempo: .85, stride: 1.02, swing: .75, bob: .7, lean: -1, sway: .6, gest: .75, tilt: .9, bounce: 0, reps: ['shrug', 'offer', 'low'] },
  dramatic:  { tempo: 1.1, stride: 1.05, swing: 1.3, bob: 1.1, lean: -1.5, sway: 1.1, gest: 1.6, tilt: 1.4, bounce: 0, reps: ['handsUp', 'explainWide', 'chest', 'point'] },
  serious:   { tempo: .85, stride: 1, swing: .8, bob: .7, lean: -1, sway: .45, gest: .8, tilt: .5, bounce: 0, reps: ['beat', 'explain', 'count'] },
};
const ARCH_WORDS = [
  [/bubbl|energetic|excit|cheer|upbeat|enthusias|lively|peppy|chipper|sparkl|happy/, 'bubbly'], [/playful|goofy|silly|funny|mischiev|prank|joker|cheeky|quirky/, 'playful'],
  [/shy|timid|quiet|introvert|bashful|meek|reserved|humble/, 'shy'], [/nervous|anxious|worried|jitter|twitchy|skittish|scared|fearful|panic/, 'nervous'],
  [/grump|angry|cranky|stern|irritab|surly|bitter|hostile|menac|villain|cunning|ruthless|greedy/, 'grumpy'], [/confiden|brave|heroic|leader|proud|charism|bossy|commanding|determined|fearless|ceo|boss/, 'confident'],
  [/bold|fierce|aggressive|rebel|tough|warrior|strong|athlet/, 'bold'], [/dream|whimsic|sleepy|spacey|poetic|artsy|romantic|wistful|tired|exhaust/, 'dreamy'],
  [/nerd|geek|smart|curious|clever|scholar|scientist|professor|inventor|analytical|bookish|engineer/, 'nerdy'], [/cool|aloof|mysterious|laid.?back|smooth|suave|detached|sarcastic|dry/, 'cool'],
  [/dramatic|theatrical|showman|flamboyant|expressive|animated|loud|diva|salesman|host/, 'dramatic'], [/serious|focused|professional|formal|stoic|disciplined|severe|solemn|detective|doctor|teacher/, 'serious'],
  [/warm|friendly|kind|caring|nice|sweet|loving|helpful|supportive|motherly|fatherly|wise|gentle/, 'warm'], [/calm|relaxed|peaceful|chill|patient|steady|zen|easygoing/, 'calm'],
];
const EXPRESSION_TO_ARCH = { happy: 'warm', excited: 'bubbly', cool: 'cool', shy: 'shy', quirky: 'playful', wink: 'playful', chill: 'calm', surprised: 'bubbly', sad: 'dreamy', angry: 'grumpy', calm: 'calm', serious: 'serious' };
const ARCH_KEYS = Object.keys(ARCH);
const word = (v) => String(v == null ? '' : v).trim().toLowerCase();

/** A stable, serialisable motion personality for a look object of any style. */
export function motionDNA(look, idx = 0) {
  const L = look && typeof look === 'object' ? look : {};
  const sk = L.seed != null && L.seed !== '' ? 'seed:' + L.seed : (() => { try { return JSON.stringify(L, (k, v) => (k === '__dna' || k === 'dna' ? undefined : v)) + '|' + idx; } catch (e) { return 'x|' + idx; } })();
  const h = hashStr(sk);
  const r = mulberry(h);
  const txt = word([L.persona, L.personality, L.vibe, L.temperament, L.mood_base, L.quirk].filter(Boolean).join(' '));
  let key = '';
  if (txt) { if (ARCH[txt]) key = txt; else for (const [re, k] of ARCH_WORDS) if (re.test(txt)) { key = k; break; } }
  if (!key) { const ex = word(L.expression); if (EXPRESSION_TO_ARCH[ex] && r() < .6) key = EXPRESSION_TO_ARCH[ex]; }
  const derived = !key;
  if (!key) key = ARCH_KEYS[hashInt(h ^ 0x51ed27) % ARCH_KEYS.length];
  const base = ARCH[key];
  const vary = (v, k = .16) => v * (1 + (r() - .5) * 2 * k);
  let age = +L.age; if (!Number.isFinite(age)) { const a = word(L.age); age = /child|kid|little|baby|toddler/.test(a) ? 8 : /teen|young/.test(a) ? 16 : /senior|old|elder|grand/.test(a) ? 72 : /middle/.test(a) ? 50 : 30; }
  const kid = age < 13, elder = age >= 62;
  const en = +L.energy; const enK = Number.isFinite(en) && en > 0 ? cl(en, .4, 1.9) : 1;
  const tempo = cl(vary(base.tempo, .1) * (kid ? 1.18 : elder ? .8 : 1) * Math.sqrt(enK), .55, 1.6);
  return {
    key, derived, kid, elder,
    tempo,
    stride: cl(vary(base.stride, .08) * (kid ? .78 : elder ? .82 : 1), .6, 1.3),
    swing: cl(vary(base.swing) * (elder ? .8 : 1) * Math.sqrt(enK), .4, 1.6),
    bob: cl(vary(base.bob) * (kid ? 1.25 : elder ? .7 : 1) * enK, .4, 1.8),
    lean: base.lean + (r() - .5) * 1.6 + (elder ? 3 : 0),
    sway: cl(vary(base.sway) * enK, .3, 1.8),
    gest: cl(vary(base.gest) * enK, .25, 1.8),
    tilt: cl(vary(base.tilt), .3, 2),
    bounce: base.bounce ? 1 : 0,
    reps: base.reps,
    handed: r() < .62 ? 1 : 0,                 // 1 = favours the right arm (screen-right arm slot)
    phase: r() * PI * 2, phase2: r() * PI * 2, phase3: r() * PI * 2,
    blinkEvery: 2.6 + r() * 2.4,
    seed: h,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 2. The actor context: which character the toolkit (walk, idle, speak...) is posing right now
// ---------------------------------------------------------------------------------------------------------------
const ACTOR = { dna: null, scale: .85, idx: 0, envAt: null, talking: false, dk: 1 };
export function setActor(a) {
  ACTOR.dna = (a && a.dna) || null; ACTOR.scale = num(a && a.scale, .85) || .85; ACTOR.idx = num(a && a.idx, 0);
  ACTOR.envAt = (a && typeof a.envAt === 'function') ? a.envAt : null; ACTOR.talking = !!(a && a.talking);
  ACTOR.dk = cl(num(a && a.dk, 1), .15, 1);
}
export function getActor() { if (!ACTOR.dna) ACTOR.dna = motionDNA({}, 0); return ACTOR; }

// ---------------------------------------------------------------------------------------------------------------
// 3. Walking and running
// ---------------------------------------------------------------------------------------------------------------
// Preset values are degrees. A = hip swing, K = knee bend in the swing, SW = arm swing, EB = elbow bend, lean = forward lean,
// bob = extra up/down, drop = lower the whole body (sneaking), sway = side-to-side weight shift in front and back views.
export const GAITS = {
  walk:    { A: 23, K: 58, SW: 21, EB: 16, lean: 3,  bob: 4,  drop: 0,  sway: 7,  head: 0,  flight: 0,  cad: 1.0 },
  proud:   { A: 26, K: 52, SW: 24, EB: 13, lean: -2, bob: 5,  drop: 0,  sway: 8,  head: -3, flight: 0,  cad: .92 },
  happy:   { A: 25, K: 62, SW: 30, EB: 20, lean: 0,  bob: 9,  drop: 0,  sway: 9,  head: -2, flight: 0,  cad: 1.1 },
  strut:   { A: 27, K: 50, SW: 20, EB: 12, lean: -3, bob: 5,  drop: 0,  sway: 13, head: -4, flight: 0,  cad: .88 },
  nervous: { A: 17, K: 66, SW: 13, EB: 28, lean: 5,  bob: 3,  drop: 3,  sway: 6,  head: 0,  flight: 0,  cad: 1.3 },
  sneak:   { A: 15, K: 88, SW: 8,  EB: 30, lean: 12, bob: 1,  drop: 22, sway: 4,  head: 4,  flight: 0,  cad: .75 },
  tired:   { A: 14, K: 34, SW: 9,  EB: 8,  lean: 9,  bob: 2,  drop: 4,  sway: 7,  head: 9,  flight: 0,  cad: .7 },
  run:     { A: 42, K: 96, SW: 46, EB: 70, lean: 11, bob: 6,  drop: 4,  sway: 7,  head: 2,  flight: 26, cad: 1.7 },
};
const LEG_UNITS = 268;                      // thigh + shin of the stickman rig, in rig units; used to turn a step length into a hip angle
const easeWalk = (k) => { const e = k * k * (3 - 2 * k); return k + (e - k) * .35; };
const easeWalkVel = (k) => 1 + (6 * k * (1 - k) - 1) * .35;          // derivative of easeWalk

/**
 * The pose of a character walking from (x0,y0) to (x1,y1) between t0 and t1, evaluated at t.
 * Returns { k, pose } where k = progress 0..1 and pose holds the pose fields to apply (view, flip, arms, legs, knees...).
 * The step length is locked to the distance covered, so the feet never slide, whatever the speed or distance.
 */
export function gaitPose(t, t0, t1, x0, y0, x1, y1, end = 'front', style = '', actor) {
  const act = actor || getActor();
  const dna = act.dna || motionDNA({}, 0);
  const dur = Math.max(.05, t1 - t0);
  const k = cl((t - t0) / dur, 0, 1);
  const p = easeWalk(k);
  const x = x0 + (x1 - x0) * p, y = y0 + (y1 - y0) * p;
  const pose = { px: x, py: y, flip: x1 < x0 };
  if (!(k > 0 && k < 1)) { pose.view = end; return { k, pose, moving: false }; }
  const G = GAITS[String(style || '').toLowerCase()] || GAITS.walk;
  // dk: how much of the horizontal travel is really seen on screen (a vertical 9:16 stage squeezes the stage sideways). The steps are locked to the distance
  // that is SEEN, so the feet never slide and the legs never run faster than the body moves.
  const dk = cl(num(act.dk, 1), .15, 1);
  const dist = Math.hypot((x1 - x0) * dk, y1 - y0);
  const scale = Math.max(.15, act.scale || .85);
  // step length from the stride the character prefers, then widened if the walk is fast enough to need a longer step
  const A0 = G.A * dna.stride;
  const stepPx0 = 2 * LEG_UNITS * Math.sin(A0 * PI / 180) * scale;
  const vPeak = 1.18 * dist / dur;
  const maxCad = 2.35 * (G.cad >= 1.5 ? 1.3 : 1);
  const stepPx = Math.max(stepPx0, vPeak / maxCad);
  const widen = stepPx / stepPx0;
  const A = Math.min(G.flight ? 58 : 44, A0 * Math.pow(widen, .85));
  const phi = PI * dist * p / stepPx + dna.phase * .12;
  const speed = dist * easeWalkVel(k) / dur;
  const cad = speed / stepPx;                                   // steps per second right now
  // arrive and depart gently: as the speed falls the strides shrink and the body settles upright
  const w = smooth(.04, .42, cad / Math.max(.6, G.cad * 1.4));
  const sP = sin(phi), cP = cos(phi);
  const view = 'side';
  const kneeCurve = (ph) => Math.pow(Math.max(0, cos(ph + .35)), 1.25);
  const flat = (ph) => 1 - .7 * Math.max(0, cos(ph + .35));    // foot flat while it carries weight, pointed in the swing
  const K = G.K * (.8 + .2 * widen) * w;
  const sw = dna.swing * G.SW * w, eb = G.EB * w;
  const armF = (s) => s * (s > 0 ? 1 : .75);                   // forward swing is bigger than the backswing
  const aL = -sP, aR = sP;                                      // arms swing against the legs
  const lean = (G.lean + dna.lean * (G.flight ? .4 : 1)) * w;
  const bobAmp = (G.bob * dna.bob) * w;
  const bounce = dna.bounce ? 1.25 : 1;
  pose.view = view;
  pose.l = [A * sP * w, -A * sP * w, 0, 0];
  pose.kn = [K * kneeCurve(phi), K * kneeCurve(phi + PI)];
  pose.ft = [flat(phi), flat(phi + PI)];
  pose.a = [
    34 + armF(aL) * sw, -36 - eb * (.45 + .55 * aL) + (G.flight ? -20 * Math.max(0, aL) * w : 0),
    34 + armF(aR) * sw, -36 - eb * (.45 + .55 * aR) + (G.flight ? -20 * Math.max(0, aR) * w : 0),
  ];
  pose.tr = lean + sin(2 * phi + 1.1) * (G.flight ? 1.8 : .9) * w;
  pose.hr = -(lean * .45) + sin(phi + .6) * .7 * w + G.head * w;
  pose.hx = 0;
  pose.hy = -Math.abs(cP) * .6 * w;
  pose.dy = (-Math.abs(cP) * bobAmp * bounce) + G.drop * w - (G.flight ? G.flight * Math.pow(Math.abs(sP), 1.1) * w : 0);
  pose.sq = 1 - .012 * (1 - Math.abs(cP)) * w;
  pose.gait = { phi, w, sway: G.sway * dna.sway * w, A };
  return { k, pose, moving: true, cad };
}

// ---------------------------------------------------------------------------------------------------------------
// 4. Smoothing the pose over time
// ---------------------------------------------------------------------------------------------------------------
// Scene scripts switch actions with if/else on the clock, so a pose can jump in one frame. smoothPose blends the script's
// own poses on both sides of the moment with a symmetric kernel, so there is no lag and no overshoot, only no snap.
// Each body part also gets a small lag of its own (hands after arms, head after body), which is "follow-through".
const NUM_KEYS = ['dx', 'dy', 'sq', 'tr', 'hr', 'hx', 'hy', 'k', 'rot', 'sc'];
// [sigma, lag] in seconds
const GROUPS = {
  legs: { sigma: .022, lag: 0 },
  body: { sigma: .05, lag: .012 },
  arm: { sigma: .06, lag: .022 },
  fore: { sigma: .06, lag: .05 },
  head: { sigma: .07, lag: .06 },
};
const TAP_W = [Math.exp(-2), Math.exp(-.5), 1, Math.exp(-.5), Math.exp(-2)];
const copyArr = (a, n, d) => { const o = []; for (let i = 0; i < n; i++) o.push(Number.isFinite(+(a && a[i])) ? +a[i] : d); return o; };
const hasKey = (o, k) => o && o[k] !== undefined && o[k] !== null;

/**
 * @param sample  function(t) -> raw pose object (the script's own pose at scene time t). Called a handful of times.
 * @param t       the scene time to evaluate
 * @param opts    { cheap: true } uses fewer samples (crowds)
 */
export function smoothPose(sample, t, opts = {}) {
  const center = sample(t) || {};
  if (opts.off) return center;
  const taps = opts.cheap ? [1, 2, 3] : [0, 1, 2, 3, 4];
  const wts = opts.cheap ? [TAP_W[1], TAP_W[2], TAP_W[3]] : TAP_W;
  const cache = new Map();
  const at = (tt) => { const key = Math.round(tt * 10000); let v = cache.get(key); if (!v) { v = sample(tt) || {}; cache.set(key, v); } return v; };
  const blend = (group, read, n, dflt, present) => {
    // read(pose, i) -> number or undefined; blend only when the centre pose says the channel is in use somewhere nearby
    const g = GROUPS[group];
    const out = new Array(n).fill(0), tot = new Array(n).fill(0);
    for (let j = 0; j < taps.length; j++) {
      const off = (taps[j] - 2) * g.sigma;
      const pz = at(t - g.lag + off);
      for (let i = 0; i < n; i++) { const v = read(pz, i); const val = Number.isFinite(+v) && v !== null && v !== undefined ? +v : dflt[i]; out[i] += val * wts[j]; tot[i] += wts[j]; }
    }
    return out.map((v, i) => v / tot[i]);
  };
  const out = { ...center };
  // arms
  const usesArms = [t - .2, t, t + .2].some((tt) => hasKey(at(tt), 'a'));
  if (usesArms) {
    const A = [34, -36, 34, -36];
    const up = blend('arm', (p, i) => (p.a ? p.a[i] : undefined), 4, A);
    const fo = blend('fore', (p, i) => (p.a ? p.a[i] : undefined), 4, A);
    out.a = [up[0], fo[1], up[2], fo[3]];
  }
  const usesLegs = [t - .2, t, t + .2].some((tt) => hasKey(at(tt), 'l'));
  if (usesLegs) out.l = blend('legs', (p, i) => (p.l ? p.l[i] : undefined), 4, [0, 0, 0, 0]);
  const usesKn = [t - .2, t, t + .2].some((tt) => hasKey(at(tt), 'kn'));
  if (usesKn) out.kn = blend('legs', (p, i) => (p.kn ? p.kn[i] : undefined), 2, [0, 0]);
  const usesFt = [t - .2, t, t + .2].some((tt) => hasKey(at(tt), 'ft'));
  if (usesFt) out.ft = blend('legs', (p, i) => (p.ft ? p.ft[i] : undefined), 2, [1, 1]);
  const NUM = { dx: ['body', 0], dy: ['legs', 0], sq: ['legs', 1], tr: ['body', 0], hr: ['head', 0], hx: ['head', 0], hy: ['head', 0], k: ['legs', 0] };
  for (const key of Object.keys(NUM)) {
    const used = [t - .2, t, t + .2].some((tt) => hasKey(at(tt), key));
    if (!used) continue;
    out[key] = blend(NUM[key][0], (p) => p[key], 1, [NUM[key][1]])[0];
  }
  return out;
}

/**
 * Turn squash. If the character changes view (front / side / back) within a short window around t, returns 0..1 where 1 is the
 * instant of the switch. The player narrows the picture horizontally by that amount so the switch reads as a turn, not a pop.
 */
export function turnAmount(viewAt, t, half = .13) {
  const v0 = viewAt(t - half), v1 = viewAt(t + half);
  if (v0 === v1) return 0;
  // find the switch time with a few steps
  let lo = t - half, hi = t + half, vlo = v0;
  for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2; if (viewAt(mid) === vlo) lo = mid; else hi = mid; }
  const ts = (lo + hi) / 2;
  const u = 1 - Math.abs(t - ts) / half;
  return u > 0 ? u * u * (3 - 2 * u) : 0;
}

// ---------------------------------------------------------------------------------------------------------------
// 5. Lip sync from the words
// ---------------------------------------------------------------------------------------------------------------
// Mouth shapes ("visemes"). The names match the Animato mouth set. Parameters drive the drawn rigs:
//   open 0..1 how far the jaw drops, wide -1..1 (negative = rounded, positive = stretched), teeth (upper teeth show),
//   press (lips pressed together), fv (top teeth on the bottom lip), tongue.
export const MOUTH = {
  REST: { open: 0,   wide: 0,   teeth: 0, press: 0, fv: 0, tongue: 0 },
  MBP:  { open: 0,   wide: -.1, teeth: 0, press: 1, fv: 0, tongue: 0 },
  AI:   { open: 1,   wide: .25, teeth: .5, press: 0, fv: 0, tongue: .5 },
  E:    { open: .42, wide: 1,   teeth: 1, press: 0, fv: 0, tongue: .1 },
  O:    { open: .72, wide: -.85, teeth: 0, press: 0, fv: 0, tongue: .2 },
  U:    { open: .32, wide: -1,  teeth: 0, press: 0, fv: 0, tongue: 0 },
  L:    { open: .46, wide: .3,  teeth: 1, press: 0, fv: 0, tongue: 1 },
  FV:   { open: .16, wide: .35, teeth: 1, press: 0, fv: 1, tongue: 0 },
  CONS: { open: .3,  wide: .3,  teeth: .8, press: 0, fv: 0, tongue: .3 },
};
export const VISEME_NAMES = Object.keys(MOUTH);

// letters -> mouth shapes (English spelling is irregular; this is close enough that the mouth reads right at video speed)
const DIGRAPHS = [
  ['tion', ['CONS', 'AI', 'CONS']], ['sion', ['CONS', 'AI', 'CONS']], ['ough', ['O']], ['igh', ['AI']], ['eigh', ['E']],
  ['ph', ['FV']], ['th', ['CONS']], ['sh', ['U']], ['ch', ['U']], ['wh', ['U']], ['ck', ['CONS']], ['ng', ['CONS']], ['qu', ['U', 'E']],
  ['oo', ['U']], ['ou', ['O']], ['ow', ['O']], ['oa', ['O']], ['oi', ['O', 'E']], ['oy', ['O', 'E']], ['au', ['O']], ['aw', ['O']],
  ['ee', ['E']], ['ea', ['E']], ['ie', ['E']], ['ei', ['E']], ['ai', ['AI']], ['ay', ['AI']], ['ey', ['E']], ['ew', ['U']], ['ue', ['U']],
];
const LETTER = {
  a: 'AI', e: 'E', i: 'AI', o: 'O', u: 'U', y: 'E',
  m: 'MBP', b: 'MBP', p: 'MBP', f: 'FV', v: 'FV', l: 'L', w: 'U', q: 'U', r: 'CONS',
};
const VOWELS = new Set(['AI', 'E', 'O', 'U']);
const tokenCache = new Map();
/** Mouth shapes for one spoken word, in order, each with a relative length. */
export function visemesForWord(raw) {
  const w = String(raw == null ? '' : raw).toLowerCase().replace(/[^a-z']/g, '').replace(/'/g, '');
  if (!w) return [];
  const hit = tokenCache.get(w); if (hit) return hit;
  const s = w.length > 3 && /[^aeiou]e$/.test(w) && !/(le|ee)$/.test(w) ? w.slice(0, -1) : w;   // silent final e
  const out = [];
  const push = (v) => { const last = out[out.length - 1]; if (last && last.v === v && v !== 'MBP') { last.len += .4; return; } out.push({ v, len: VOWELS.has(v) ? 1.6 : (v === 'MBP' ? .8 : .7) }); };
  let i = 0;
  while (i < s.length) {
    let done = false;
    for (const [dg, vis] of DIGRAPHS) { if (s.startsWith(dg, i)) { vis.forEach(push); i += dg.length; done = true; break; } }
    if (done) continue;
    const ch = s[i];
    push(LETTER[ch] || 'CONS');
    i++;
  }
  // consonant runs collapse to one small movement
  const merged = [];
  for (const t of out) { const last = merged[merged.length - 1]; if (last && last.v === 'CONS' && t.v === 'CONS') { last.len = Math.max(last.len, t.len) + .1; } else merged.push({ ...t }); }
  // the mouth does not return to a neutral shape for every consonant: it keeps the shape of the vowel it is moving to (or from),
  // only less open. So "stand", "bright", "world" keep a round or wide mouth through the consonants, as a real mouth does.
  for (let i = 0; i < merged.length; i++) {
    const q = merged[i];
    if (q.v !== 'CONS') continue;
    const nx = merged[i + 1] && VOWELS.has(merged[i + 1].v) ? merged[i + 1].v : null, pv = merged[i - 1] && VOWELS.has(merged[i - 1].v) ? merged[i - 1].v : null;
    const to = nx || pv;
    if (to) q.to = to;
  }
  if (tokenCache.size > 4000) tokenCache.clear();
  tokenCache.set(w, merged);
  return merged;
}

const blendMouth = (a, b, k) => ({
  open: lerp(a.open, b.open, k), wide: lerp(a.wide, b.wide, k), teeth: lerp(a.teeth, b.teeth, k),
  press: lerp(a.press, b.press, k), fv: lerp(a.fv, b.fv, k), tongue: lerp(a.tongue, b.tongue, k),
});

/**
 * The mouth at fractional word position `pos` of `words` (pos 3.25 = a quarter of the way through word 3).
 * Returns { v, m } where v is the dominant viseme name and m the blended parameters.
 */
export function lipAtWord(words, pos) {
  const n = words.length;
  if (!n) return { v: 'REST', m: MOUTH.REST };
  const wi = cl(Math.floor(pos), 0, n - 1), u = cl(pos - wi, 0, 1);
  const seq = visemesForWord(words[wi]);
  if (!seq.length) return { v: 'REST', m: MOUTH.REST };
  const total = seq.reduce((s, q) => s + q.len, 0);
  // key frames at the middle of each viseme; glide between them
  const keys = []; let acc = 0;
  for (const q of seq) { keys.push({ c: (acc + q.len / 2) / total, v: q.v, to: q.to }); acc += q.len; }
  // a consonant that sits next to a vowel is drawn part-way toward that vowel's shape (see visemesForWord)
  const shapeOf = (key) => key.to ? blendMouth(MOUTH.CONS, MOUTH[key.to], .55) : MOUTH[key.v];
  const nameOf = (key) => key.to && shapeOf(key).open >= .34 ? key.to : key.v;
  let a = keys[0], b = keys[0];
  if (u <= keys[0].c) { a = b = keys[0]; }
  else if (u >= keys[keys.length - 1].c) { a = b = keys[keys.length - 1]; }
  else { for (let i = 1; i < keys.length; i++) if (u <= keys[i].c) { a = keys[i - 1]; b = keys[i]; break; } }
  let m, dom, va, vb, kk = 0;
  if (a === b) { m = shapeOf(a); dom = va = vb = nameOf(a); }
  else { kk = smooth(0, 1, (u - a.c) / Math.max(1e-6, b.c - a.c)); m = blendMouth(shapeOf(a), shapeOf(b), kk); va = nameOf(a); vb = nameOf(b); dom = kk < .5 ? va : vb; }
  // end of a word: the lips close a little before the next one
  const tail = smooth(.82, 1, u);
  if (tail > 0) m = blendMouth(m, { ...MOUTH.REST, open: Math.min(m.open, .18) }, tail * .55);
  // va -> vb is the glide in progress (kk 0..1): drawn characters with a set of mouth drawings dissolve from one to the other instead of flashing
  return { v: dom, m, va, vb, k: kk };
}

/**
 * Where in the captions' words the speaker is. Returns { words, pos } or null.
 *   caps    the caption list of the scene (objects with text, from, to, optional wordTimings [{text,start,end}])
 *   t       the time the captions are on
 *   o       { locked, curve, sampleCurve } curve: the scene speech curve, sampleCurve(curve, t) -> cumulative speech 0..n
 */
export function activeWordPos(caps, t, o = {}) {
  if (!Array.isArray(caps)) return null;
  for (const c of caps) {
    if (!(t >= c.from && t < c.to + .22)) continue;
    const words = String(c.text == null ? '' : c.text).split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const wt = c.wordTimings;
    if (o.locked && Array.isArray(wt) && wt.length === words.length) {
      let idx = -1;
      for (let i = 0; i < wt.length; i++) { if (t >= wt[i].start) idx = i; else break; }
      if (idx < 0) return { words, pos: 0, silent: true };
      const w = wt[idx], end = Number.isFinite(+w.end) ? +w.end : (wt[idx + 1] ? wt[idx + 1].start : w.start + .35);
      if (t > end + .12) return { words, pos: idx + 1 - 1e-3, silent: true };       // a pause after the word
      const u = cl((t - w.start) / Math.max(.06, end - w.start), 0, 1);
      return { words, pos: idx + u, wordIndex: idx };
    }
    // no word timings: spread the words over the span the voice is actually heard in
    let pr;
    const from = o.locked && c.speechFrom != null ? c.speechFrom : c.from, to = o.locked && c.speechTo != null ? c.speechTo : c.to;
    if (o.curve && o.curve.active && typeof o.sampleCurve === 'function' && o.locked) {
      const c0 = o.sampleCurve(o.curve, from), c1 = o.sampleCurve(o.curve, to);
      pr = c1 - c0 > .02 ? cl((o.sampleCurve(o.curve, t) - c0) / (c1 - c0), 0, 1) : cl((t - from) / Math.max(.25, to - from), 0, 1);
    } else pr = cl((t - from) / Math.max(.4, (to - from) * .92), 0, 1);
    // longer words take longer to say
    const wts = words.map((w) => w.replace(/[^a-zA-Z0-9]/g, '').length + 2.2 + (/[.!?,;:]$/.test(w) ? 2.2 : 0));
    const tot = wts.reduce((s, x) => s + x, 0);
    let acc = 0, pos = words.length - 1e-3;
    for (let i = 0; i < words.length; i++) { if (pr * tot < acc + wts[i]) { pos = i + (pr * tot - acc) / wts[i]; break; } acc += wts[i]; }
    return { words, pos };
  }
  return null;
}

/**
 * The mouth for one frame.
 *   wp    activeWordPos(...) result or null
 *   env   voice loudness 0..1 at this instant, or null when there is no audio to follow
 *   t     the clock (used only for the fallback chatter when there are no words)
 */
export function lipAt(wp, env, t, phase = 0) {
  const loud = env == null ? null : cl(env, 0, 1);
  if (loud != null && loud < .04) return { v: 'REST', m: MOUTH.REST, open: 0 };
  if (wp && !wp.silent) {
    const r = lipAtWord(wp.words, wp.pos);
    // the voice level shapes how far the jaw opens; stressed syllables open wider
    const gain = loud == null ? 1 : cl(.55 + loud * 1.05, .5, 1.25);
    const m = { ...r.m, open: cl(r.m.open * gain, 0, 1) };
    return { v: r.v, va: r.va, vb: r.vb, k: r.k, m, open: m.open };
  }
  if (wp && wp.silent) return { v: 'REST', m: MOUTH.REST, open: 0 };
  // no words known: chatter that still follows the voice level
  const step = Math.floor(t * 9 + phase * 3);
  const names = ['AI', 'E', 'O', 'CONS', 'U', 'L', 'AI', 'MBP'];
  const a = names[hashInt(step * 7919 + 13) % names.length], b = names[hashInt((step + 1) * 7919 + 13) % names.length];
  const k = smooth(0, 1, t * 9 + phase * 3 - step);
  const m = blendMouth(MOUTH[a], MOUTH[b], k);
  const gain = loud == null ? 1 : cl(.4 + loud * 1.2, .3, 1.3);
  const mm = { ...m, open: cl(m.open * gain, 0, 1) };
  return { v: k < .5 ? a : b, va: a, vb: b, k, m: mm, open: mm.open };
}

// The mouth the renderers read. computeFrame sets it just before it draws a talking character and clears it right after.
let LIP = null;
export function setLip(l) { LIP = l || null; globalThis.__animatoLip = LIP; }
export function getLip() { return LIP; }

/** Parameters for a renderer: from the current lip state, or derived from a plain openness number when there is none. */
export function mouthParams(mo) {
  const lip = (typeof globalThis !== 'undefined' && globalThis.__animatoLip) || LIP;
  if (lip && lip.m) return { ...lip.m, v: lip.v };
  const o = cl(num(mo, .5), 0, 1);
  return { open: o, wide: .15 * (1 - o), teeth: o > .35 ? .6 : 0, press: 0, fv: 0, tongue: o > .55 ? .5 : 0, v: o < .1 ? 'REST' : o > .6 ? 'AI' : 'E' };
}

// ---------------------------------------------------------------------------------------------------------------
// 6. Speech beats: the voice moves the body
// ---------------------------------------------------------------------------------------------------------------
/** Accent 0..1: how strongly a syllable is being stressed at t (a rise in loudness over the last quarter second). */
export function stressAt(envAt, t) {
  if (typeof envAt !== 'function') return null;
  const e0 = envAt(t);
  if (e0 == null) return null;
  const prev = ((envAt(t - .12) ?? e0) + (envAt(t - .24) ?? e0) + (envAt(t - .36) ?? e0)) / 3;
  return cl((e0 - prev) * 3.2 + (e0 - .45) * .6, 0, 1);
}
