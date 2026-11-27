// CINEMATOGRAPHY BY NAME: the AI only names the shot, the app does the framing maths.
//
// Why: a weak model (ChatGPT free, Gemini Flash, small open models) can write "feet:hero" but cannot work out zoom, x and y
// for a close-up of a person who is walking. So the file says WHAT the camera shows and WHEN (in seconds or on a spoken word),
// and this module turns it into a camera that follows the people on screen, frame by frame.
//
//   shot:'feet:amara@0->tiltup:bouncer@"hefty"->low:bouncer@2.6->high:amara@"walked"'
//
// Times:   @2.6            seconds from the start of the scene
//          @"hefty"        the moment that word is spoken in the scene's narration (say), @"her#2" = the 2nd "her"
// Subject: kind:who        who = a cast name in the scene; kind:who>other (over the shoulder / point of view), kind:who+other (two shot)
//
// Word anchors also work in actor moves, face tracks and prop times ('walkR@0->grab@"towel"', face:'calm@0->scared@"suddenly"',
// ['item','phone',null,1100,400,1,'@"phone"']): resolveAnchors() turns them into seconds before anything else reads them.
//
// Pure functions of the scene clock (no randomness), so the preview and the exported MP4 match frame for frame. No look-behind regex.

const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (u) => { u = cl(u, 0, 1); return u * u * (3 - 2 * u); };
const easeIO = (u) => { u = cl(u, 0, 1); return u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
const easeOut = (u) => { u = cl(u, 0, 1); return 1 - Math.pow(1 - u, 3); };

export const SHOTS_MARKER = 'CINEMATOGRAPHY BY NAME';

/** Every shot the app knows, with what it is for (used in the prompt and for validation). */
export const SHOT_KINDS = {
  establish: 'the whole place, opens a scene',
  wide: 'everyone, full bodies',
  full: 'one person head to toe',
  medium: 'waist up, talking',
  close: 'face and shoulders, feelings',
  eyes: 'only the eyes, realising, fear',
  feet: 'only the feet, walking in, sneaking',
  hands: 'only the hands, holding, tying, opening',
  low: 'looking UP at them: big, strong, scary',
  high: 'looking DOWN at them: small, weak, alone',
  tiltup: 'feet up to the face: how big someone is',
  tiltdown: 'face down to the hands or feet',
  ots: 'over the shoulder, ots:a>b',
  pov: 'what a sees, pov:a>b',
  two: 'two people, two:a+b',
  track: 'follows a walker',
  push: 'slow push to the face, tension',
  crash: 'fast zoom on a face, shock',
  pull: 'close pulling back wide, reveal',
  dutch: 'tilted, danger',
  whip: 'fast swing to someone',
  reaction: 'snap close-up of a listener',
  insert: 'a detail (same as hands)',
};
const ALIAS = { est: 'establish', ews: 'establish', ws: 'wide', fs: 'full', ms: 'medium', mcu: 'close', cu: 'close', closeup: 'close', ecu: 'eyes', face: 'close', foot: 'feet', hand: 'hands', lowangle: 'low', highangle: 'high', overshoulder: 'ots', over: 'ots', twoshot: 'two', follow: 'track', pushin: 'push', zoom: 'crash', pullback: 'pull', reveal: 'pull', tilt: 'tiltup', react: 'reaction', detail: 'insert' };
export const normalizeShot = (k) => { const s = String(k || '').toLowerCase().replace(/[\s_-]+/g, ''); return SHOT_KINDS[s] ? s : (ALIAS[s] || ''); };

// ---------------------------------------------------------------------------------------------------------
// Word timing: when is a word spoken in a scene of `dur` seconds (same pacing model as the automatic captions)
// ---------------------------------------------------------------------------------------------------------
function wordClock(narration, dur) {
  const words = String(narration || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const D = Math.max(.8, num(dur, 5));
  if (!words.length) return [];
  const pad = Math.min(.18, D * .05), usable = Math.max(.4, D - 2 * pad);
  const w = words.map((x) => Math.max(2, x.length + 1 + (/[.!?]["')]*$/.test(x) ? 6 : /[,;:]["')]*$/.test(x) ? 3 : 0)));
  const tot = w.reduce((a, b) => a + b, 0) || 1;
  let c = pad;
  return words.map((x, i) => { const t = c; c += (usable * w[i]) / tot; return { w: x.toLowerCase().replace(/[^a-z0-9'À-ɏ]+/g, ''), t: Math.round(t * 100) / 100 }; });
}

/** Seconds at which `word` (or "word#n" for the n-th time) is spoken, or null when the narration does not contain it. */
export function wordTime(narration, dur, word) {
  let w = String(word || '').trim().toLowerCase(), nth = 1;
  const h = w.lastIndexOf('#');
  if (h > 0 && /^\d+$/.test(w.slice(h + 1))) { nth = Math.max(1, +w.slice(h + 1)); w = w.slice(0, h); }
  const parts = w.split(/\s+/).map((x) => x.replace(/[^a-z0-9'À-ɏ]+/g, '')).filter(Boolean);
  if (!parts.length) return null;
  const clock = wordClock(narration, dur);
  let seen = 0, firstStem = -1;
  for (let i = 0; i < clock.length; i++) {
    let ok = true;
    for (let j = 0; j < parts.length; j++) { const c = clock[i + j]; if (!c || !(c.w === parts[j] || (j === parts.length - 1 && parts[j].length > 3 && c.w.indexOf(parts[j]) === 0))) { ok = false; break; } }
    if (ok) { seen++; if (seen === nth) return clock[i].t; if (firstStem < 0) firstStem = i; }
  }
  return firstStem >= 0 ? clock[firstStem].t : null;   // asked for the 3rd but there are 2: the first one
}

const ANCHOR = /@\s*(?:"([^"]{1,40})"|“([^”]{1,40})”|`([^`]{1,40})`)/g;
/** Turns every @"word" in a move / face / shot string into @seconds. Unknown words become the nearest sensible time (kept in order). */
export function resolveAnchors(str, narration, dur) {
  if (typeof str !== 'string' || str.indexOf('@') < 0) return str;
  let last = 0;
  return str.replace(ANCHOR, (m, a, b, c) => {
    const t = wordTime(narration, dur, a || b || c);
    const v = t == null ? Math.min(Math.max(.1, num(dur, 5) - .4), last + .8) : t;
    last = Math.max(last, v);
    return '@' + (Math.round(v * 100) / 100);
  });
}
const SOLO = /^@\s*(?:"([^"]{1,40})"|“([^”]{1,40})”)$/;
/** A prop time written as '@"word"' (a whole tuple item) becomes seconds. */
export function anchorValue(v, narration, dur) {
  if (typeof v !== 'string') return v;
  const m = v.trim().match(SOLO);
  if (!m) return v;
  const t = wordTime(narration, dur, m[1] || m[2]);
  return t == null ? v : t;
}

/** Applies word anchors to one compact beat spec in place (actors, faces, gaze, shot, prop times). Returns the spec. */
export function anchorBeat(spec) {
  if (!spec || typeof spec !== 'object') return spec;
  const say = typeof spec.say === 'string' ? spec.say : typeof spec.narration === 'string' ? spec.narration : '';
  if (!say) return spec;
  const words = say.trim().split(/\s+/).length;
  const d = num(spec.d ?? spec.duration, 0) > 0 ? num(spec.d ?? spec.duration) : Math.max(3.5, Math.round((words / 2.65 + .55) * 10) / 10);
  const fix = (s) => resolveAnchors(s, say, d);
  const acts = Array.isArray(spec.a) ? spec.a : Array.isArray(spec.actors) ? spec.actors : null;
  if (acts) for (const e of acts) {
    if (Array.isArray(e)) {
      for (let i = 1; i < e.length; i++) {
        if (typeof e[i] === 'string') e[i] = fix(e[i]);
        else if (e[i] && typeof e[i] === 'object' && !Array.isArray(e[i])) for (const k of ['face', 'gaze', 'moves', 'act']) if (typeof e[i][k] === 'string') e[i][k] = fix(e[i][k]);
      }
    } else if (e && typeof e === 'object') for (const k of ['moves', 'face', 'gaze', 'act']) if (typeof e[k] === 'string') e[k] = fix(e[k]);
  }
  for (const k of ['shot', 'shots']) if (typeof spec[k] === 'string') spec[k] = fix(spec[k]);
  const props = Array.isArray(spec.p) ? spec.p : Array.isArray(spec.props) ? spec.props : null;
  if (props) for (const p of props) if (Array.isArray(p)) for (let i = 1; i < p.length; i++) {
    if (p[i] && typeof p[i] === 'object' && !Array.isArray(p[i])) { for (const k of ['t0', 't1', 't2', 'at0', 'until']) if (typeof p[i][k] === 'string') p[i][k] = anchorValue(p[i][k], say, d);
      if (Array.isArray(p[i].bark)) p[i].bark = p[i].bark.map((v) => anchorValue(v, say, d)); else if (typeof p[i].bark === 'string') p[i].bark = [anchorValue(p[i].bark, say, d)]; }
    else p[i] = anchorValue(p[i], say, d);
  }
  if (typeof spec.flash === 'string') { const v = anchorValue(spec.flash, say, d); if (typeof v === 'number') spec.flash = v; }
  return spec;
}

// ---------------------------------------------------------------------------------------------------------
// Reading a shot track
// ---------------------------------------------------------------------------------------------------------
/**
 * 'feet:hero@0->tiltup:boss@1.6->ots:hero>boss@3' or [{kind,who,other,t}] -> [{t0,t1,kind,who,other}] sorted, covering 0..dur.
 * Unknown shot words are dropped (the rest still works).
 */
export function parseShots(track, dur, narration = '') {
  const D = Math.max(.5, num(dur, 5));
  let items = [];
  if (Array.isArray(track)) {
    items = track.map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? `${x.kind || x.shot || ''}:${x.who || x.on || ''}${x.other ? '>' + x.other : ''}@${num(x.t ?? x.at, 0)}` : '')).filter(Boolean);
  } else if (typeof track === 'string') {
    items = resolveAnchors(track, narration, D).split(/->|→|,|\|/).map((x) => x.trim()).filter(Boolean);
  }
  const out = [];
  let lastT = -1;
  items.forEach((raw, i) => {
    const m = raw.match(/^([a-z_\- ]+)(?::\s*([^@]*?))?\s*(?:@\s*(-?[\d.]+))?$/i);
    if (!m) return;
    const kind = normalizeShot(m[1]);
    if (!kind) return;
    let who = '', other = '', join = '';
    const target = String(m[2] || '').trim();
    if (target) {
      const sp = target.split(/\s*([>+&]|\bto\b|\band\b)\s*/i);
      who = (sp[0] || '').toLowerCase();
      if (sp.length >= 3) { other = (sp[2] || '').toLowerCase(); join = sp[1] === '+' || /&|and/i.test(sp[1]) ? '+' : '>'; }
    }
    let t = m[3] != null ? num(m[3], 0) : (i === 0 ? 0 : null);
    if (t == null) t = Math.min(D - .3, lastT + Math.max(.9, D / Math.max(2, items.length)));
    t = cl(t, 0, Math.max(0, D - .2));
    if (t <= lastT) t = Math.min(D - .2, lastT + .35);
    lastT = t;
    out.push({ t0: Math.round(t * 100) / 100, kind, who, other, join });
  });
  if (!out.length) return [];
  out[0].t0 = 0;
  out.forEach((s, i) => { s.t1 = i + 1 < out.length ? out[i + 1].t0 : D; });
  return out.filter((s) => s.t1 - s.t0 > .05);
}

// ---------------------------------------------------------------------------------------------------------
// Framing
// ---------------------------------------------------------------------------------------------------------
// Where the body parts are on each character style, as a fraction of the person's height above the ground line
// (measured on the drawn characters: every style stands about 598 units tall at scale 1).
const BODY = {
  human:    { eye: .93, chin: .88, head: .13, chest: .76, hands: .56, waist: .55, feet: .05 },
  stickman: { eye: .88, chin: .77, head: .23, chest: .68, hands: .45, waist: .42, feet: .05 },
  original: { eye: .64, chin: .49, head: .5,  chest: .4,  hands: .25, waist: .22, feet: .05 },
  doodle:   { eye: .67, chin: .42, head: .56, chest: .34, hands: .24, waist: .22, feet: .05 },
  animal:   { eye: .8, chin: .66, head: .34, chest: .6, hands: .25, waist: .45, feet: .05 },
  custom:   { eye: .84, chin: .74, head: .27, chest: .64, hands: .44, waist: .42, feet: .05 },
};
export const bodyOf = (st) => BODY[String(st || '').toLowerCase()] || BODY.custom;
const HT = 598;
const hgt = (p) => HT * p.s;
const at = (p, f) => p.y - hgt(p) * f;
const B = (p) => bodyOf(p.st);
const faceY = (p) => at(p, (B(p).eye + B(p).chin) / 2);
const chestY = (p) => at(p, B(p).chest);
const bodyY = (p) => at(p, .5);
const waistY = (p) => at(p, B(p).waist);
const handsY = (p) => at(p, B(p).hands);
const feetY = (p) => at(p, .12);
const headH = (p) => hgt(p) * B(p).head;
const fitZ = (h) => cl(900 / Math.max(110, h), 1, 4.2);   // the zoom at which `h` scene units fill the frame height
const sz = (p) => cl(p.s / .85, .45, 1.8);                // the person's size relative to a normal main character
// frame heights for the classic shot sizes (scene units), whatever the style's proportions
const closeH = (p) => Math.min(hgt(p) * .56, Math.max(headH(p) * 1.7, hgt(p) * .25));
const medH = (p) => Math.min(hgt(p) * .8, Math.max(headH(p) * 2.4, hgt(p) * .6));
const eyesH = (p) => Math.min(hgt(p) * .3, Math.max(headH(p) * .7, hgt(p) * .14));

/** Camera {x,y,z,rot} of one shot at progress u (0..1) and scene time t. P(name) gives {x,y,s} of a person at time t. */
export function frameShot(sh, u, t, P, all) {
  const s = sh.who ? P(sh.who, t) : null;
  const o = sh.other ? P(sh.other, t) : null;
  const centre = () => {
    const ps = all(t);
    if (!ps.length) return { x: 800, span: 0, y: 790, s: .85 };
    const xs = ps.map((p) => p.x);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, span: Math.max(...xs) - Math.min(...xs), y: Math.max(...ps.map((p) => p.y)), s: Math.max(...ps.map((p) => p.s)), st: ps[0].st };
  };
  const d = Math.max(.3, sh.t1 - sh.t0), tt = u * d;
  const breathe = 1 + .035 * smooth(u);                     // every held shot still creeps in a little
  const subj = s || (() => { const c = centre(); return { x: c.x, y: c.y, s: c.s, st: c.st }; })();
  switch (sh.kind) {
    case 'establish': { const c = centre(); return { x: lerp(c.x - 40, c.x + 40, u), y: 455, z: lerp(1.0, 1.07, easeIO(u)), rot: 0 }; }
    case 'wide': { const c = centre(); return { x: c.x, y: lerp(c.y - 330, c.y - 345, u), z: cl(1500 / (c.span + 900), 1, 1.25) * breathe, rot: 0 }; }
    case 'full': { const p = subj; return { x: p.x, y: p.y - hgt(p) * .5, z: fitZ(hgt(p) * 1.22) * breathe, rot: 0 }; }
    case 'medium': { const p = subj; return { x: p.x, y: at(p, B(p).chin) + medH(p) * .12, z: fitZ(medH(p)) * breathe, rot: 0 }; }
    case 'close': case 'reaction': { const p = subj; const k = sh.kind === 'reaction' ? easeOut(tt / .18) : 1; return { x: p.x, y: faceY(p) + closeH(p) * .12, z: lerp(fitZ(closeH(p) * 1.35), fitZ(closeH(p)), k) * breathe, rot: 0 }; }
    case 'eyes': { const p = subj; return { x: p.x, y: at(p, B(p).eye), z: fitZ(eyesH(p)) * (1 + .05 * u), rot: 0 }; }
    case 'feet': { const p = subj; return { x: p.x + 10, y: feetY(p), z: fitZ(hgt(p) * .34) * breathe, rot: 0 }; }
    case 'hands': case 'insert': { const p = subj; return { x: p.x + 12 * sz(p), y: handsY(p), z: fitZ(hgt(p) * .34) * (1 + .06 * u), rot: 0 }; }
    case 'low': {
      // looking up: the whole person fills the frame bottom to top, feet near the lower edge, the head pushing out of the top as we creep in
      const p = subj, z = fitZ(hgt(p) * 1.02) * (1 + .08 * easeIO(u));
      return { x: p.x, y: lerp(bodyY(p) + 30 * sz(p), lerp(bodyY(p), faceY(p), .45), easeIO(u)), z, rot: lerp(-1.2, 0, u) };
    }
    case 'high': {
      // looking down: the person is small in the lower part of the frame with a lot of floor and the others towering around
      const p = subj, c = centre();
      return { x: lerp(p.x, c.x, .25), y: p.y - hgt(p) * 1.05, z: lerp(1.12, 1.02, easeIO(u)), rot: 0 };
    }
    case 'tiltup': { const p = subj, k = easeIO(cl(u * 1.15, 0, 1)); return { x: p.x, y: lerp(feetY(p), faceY(p) + closeH(p) * .2, k), z: lerp(fitZ(hgt(p) * .4), fitZ(medH(p)), k), rot: 0 }; }
    case 'tiltdown': { const p = subj, k = easeIO(cl(u * 1.15, 0, 1)); return { x: p.x, y: lerp(faceY(p) + closeH(p) * .12, handsY(p), k), z: lerp(fitZ(closeH(p)), fitZ(hgt(p) * .4), k), rot: 0 }; }
    case 'ots': case 'pov': {
      if (!o) { const p = subj; return { x: p.x, y: faceY(p) + closeH(p) * .2, z: fitZ(medH(p)) * breathe, rot: 0 }; }
      const p = subj, w = sh.kind === 'pov' ? .92 : .62;
      const span = Math.abs(p.x - o.x);
      const z = sh.kind === 'pov' ? fitZ(medH(o)) : cl(1150 / (span * .55 + 420), 1.35, 2.3);
      const hand = sh.kind === 'pov' ? Math.sin(t * 1.7) * 6 : 0;
      return { x: lerp(p.x, o.x, w) + hand, y: lerp(faceY(p), faceY(o), .65) + medH(o) * .15 + hand * .6, z: z * breathe, rot: sh.kind === 'pov' ? Math.sin(t * 1.1) * .6 : 0 };
    }
    case 'two': {
      if (!o) { const c = centre(); return { x: c.x, y: c.y - 330, z: cl(1500 / (c.span + 700), 1.05, 1.7) * breathe, rot: 0 }; }
      const p = subj, span = Math.abs(p.x - o.x);
      return { x: (p.x + o.x) / 2, y: lerp(faceY(p), faceY(o), .5) + hgt(o) * .22, z: cl(1400 / (span + 650), 1.08, 1.85) * breathe, rot: 0 };
    }
    case 'track': { const p = subj; const lead = s && sh._v ? cl(sh._v * 60, -120, 120) : 0; return { x: p.x + lead, y: p.y - hgt(p) * .55, z: fitZ(hgt(p) * 1.05), rot: Math.sin(t * 2.2) * .35 }; }
    case 'push': { const p = subj, k = easeIO(u); return { x: p.x, y: lerp(at(p, B(p).chin) + medH(p) * .12, faceY(p) + closeH(p) * .12, k), z: lerp(fitZ(medH(p)), fitZ(closeH(p)), k), rot: 0 }; }
    case 'crash': {
      const p = subj, k = easeOut(tt / .3), sh2 = tt > .25 ? Math.exp(-(tt - .25) * 8) * Math.sin(tt * 48) : 0;
      return { x: p.x + sh2 * 10, y: lerp(bodyY(p), faceY(p) + closeH(p) * .1, k) + sh2 * 6, z: lerp(1.15, fitZ(closeH(p) * .9), k), rot: sh2 * 1.2 };
    }
    case 'pull': { const p = subj, c = centre(), k = easeIO(u); return { x: lerp(p.x, c.x, k), y: lerp(faceY(p) + closeH(p) * .12, 455, k), z: lerp(fitZ(closeH(p)), 1.0, k), rot: 0 }; }
    case 'dutch': { const p = subj; return { x: p.x, y: faceY(p) + medH(p) * .18, z: fitZ(medH(p) * .85) * breathe, rot: lerp(5.5, 7, u) * (p.x < 800 ? -1 : 1) }; }
    case 'whip': { const p = subj; return { x: p.x, y: at(p, B(p).chin) + medH(p) * .12, z: fitZ(medH(p)) * breathe, rot: 0 }; }
    default: { const p = subj; return { x: p.x, y: at(p, B(p).chin) + medH(p) * .12, z: fitZ(medH(p)), rot: 0 }; }
  }
}
// how long the move INTO a shot takes: 0 = a hard cut (what film editors do), whip = a fast motion-blurred swing
const INTO = { whip: .16, track: .25, crash: 0 };

/**
 * Builds the camera function of a scene from its shot list.
 * P(name, t) -> {x,y,s} of a person (name '' = the main person). all(t) -> [{x,y,s}] of everyone. Returns t -> {zoom,x,y,rot}.
 */
export function shotCamera(shots, P, all) {
  if (!Array.isArray(shots) || !shots.length) return null;
  const at = (sh, t) => frameShot(sh, cl((t - sh.t0) / Math.max(.05, sh.t1 - sh.t0), 0, 1), t, P, all);
  return (t) => {
    let i = 0;
    while (i < shots.length - 1 && t >= shots[i + 1].t0) i++;
    const sh = shots[i];
    if (sh.kind === 'track' && sh.who) { const a = P(sh.who, t), b = P(sh.who, t + .2); sh._v = (b.x - a.x) / .2 / 100; }
    let c = at(sh, t);
    const into = INTO[sh.kind];
    if (i > 0 && into) {
      const k = smooth((t - sh.t0) / into);
      if (k < 1) { const p = at(shots[i - 1], Math.min(shots[i - 1].t1, sh.t0)); c = { x: lerp(p.x, c.x, k), y: lerp(p.y, c.y, k), z: lerp(p.z, c.z, k), rot: lerp(p.rot, c.rot, k) }; }
    }
    // a living camera: a very small handheld drift, never a frozen frame
    const hx = Math.sin(t * .9 + i * 1.7) * 4 + Math.sin(t * 2.3 + i) * 1.5, hy = Math.cos(t * .7 + i * 2.1) * 3;
    const z = cl(c.z, 1, 4.2);
    return { zoom: z, x: c.x + hx / z, y: c.y + hy / z, rot: c.rot };
  };
}

/** The prompt block: short on purpose, so even small models read it. */
export function shotRule({ tall = false } = {}) {
  const list = Object.keys(SHOT_KINDS).filter((k) => k !== 'insert').map((k) => `${k} (${SHOT_KINDS[k]})`).join('; ');
  return `${SHOTS_MARKER} (this is how a real film is shot; you NAME the shot, the app frames it on the person automatically, even while they move):
- On every beat write shot:'kind:who@time->kind:who@time->...'. The camera CUTS to each shot at its time. 2 to 4 shots per beat, a new shot every 1.5 to 2.5 s.
- time = seconds, OR the spoken word in double quotes: @"hefty" means "cut exactly when the narrator says hefty". Use the word form, it is always in sync.
- SHOTS: ${list}.
- two people: ots:amara>guard (over Amara's shoulder onto the guard), pov:amara>door, two:amara+guard.
- HOW PROFESSIONALS CHOOSE: power or size = low; weakness or loneliness = high; arriving = feet then track; picking up, tying, opening = hands; seeing or hearing something = eyes or close, then pov onto the thing; a big line = push; a shock = crash then reaction on the listener; a conversation = ots one way, ots the other way (shot / reverse shot), then close on the one who feels most; a new place = establish; the end of a scene = pull.
- Word anchors work everywhere: moves 'walkR@0->grab@"towel"', faces face:'calm@0->scared@"suddenly"', and prop times ['item','phone',null,1100,400,1,'@"phone"'].${tall ? '\n- Vertical 9:16: prefer close, medium, low, eyes, hands; wide shots only to open a place.' : ''}
- Example: say:"She walked past the guards, as hefty as they were, and tied the towel around her waist." -> shot:'feet:amara@0->tiltup:guard@"hefty"->high:amara@"they"->hands:amara@"tied"->medium:amara@"waist"'`;
}
