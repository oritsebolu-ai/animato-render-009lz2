// Body acting: the person's whole body does what the narrator says, so the film can be understood with the sound off.
//
// The AI only has to NAME an action ('slam', 'grab', 'flinch'...). This module supplies the animation craft that makes it
// look alive instead of mechanical: a small wind-up (anticipation) before the move, a fast strike that overshoots, a settle,
// a hold, and a soft release. Nothing here draws anything; it describes a pose as a pure function of the film clock, so the
// preview and the exported video match frame for frame.
//
//   actPose(kind, t, t0, t1)     the pose for an action at film time t (null when it is not active)
//   applyTo(target, pose)        blends that pose into any {a:[4 arm angles], tr, hr, hy, dx, dy}
//   detectActions(text, dur)     reads the verbs in a narration and says which action each one calls for, and when
//   directActing(SC)             gives every scene the body actions its narration calls for but the file never acted out
//   actingRule()                 the short block added to every prompt sent to an AI model

const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (v) => Math.round(v * 100) / 100;
const smooth = (u) => { u = cl(u, 0, 1); return u * u * (3 - 2 * u); };
const easeOut = (u) => { u = cl(u, 0, 1); return 1 - (1 - u) * (1 - u); };
const easeIn = (u) => { u = cl(u, 0, 1); return u * u; };

// arm angles: [left upper, left lower, right upper, right lower]; bigger upper angle = hand higher. Same numbers as the gestures.
const NEUTRAL = { a0: 34, a1: -36, a2: 34, a3: -36, tr: 0, hr: 0, hy: 0, dx: 0, dy: 0 };
const CHANNELS = Object.keys(NEUTRAL);

// Each action: ant (the wind-up), hit (the strike, a little past the rest pose), rest (where it settles and holds),
// tA/tH/tS the seconds of each stage, hold (seconds it stays before releasing; Infinity = until the action ends),
// osc (a shake on top: channel: [amount, hertz]), bob (a hop on top), feel (the face that goes with it).
const ACTIONS = {
  slam:      { ant: { a2: 168, a3: 62, tr: -7, dy: -4, hr: -3 }, hit: { a2: 84, a3: 8, tr: 13, dy: 10, hr: 5 }, rest: { a2: 70, a3: 18, tr: 7, dy: 3, hr: 3 }, tA: .2, tH: .09, tS: .24, hold: .7, feel: 'furious' },
  punch:     { ant: { a2: 28, a3: 112, tr: -11, dx: -6 }, hit: { a2: 104, a3: -6, tr: 15, dx: 14 }, rest: { a2: 62, a3: 38, tr: 6, dx: 5 }, tA: .17, tH: .07, tS: .22, hold: .5, feel: 'furious' },
  grab:      { ant: { a2: 60, a3: 14, tr: 3 }, hit: { a2: 112, a3: -4, tr: 10, dx: 6 }, rest: { a2: 92, a3: 66, tr: 4 }, tA: .16, tH: .1, tS: .2, hold: .9 },
  push:      { ant: { a0: 20, a1: 74, a2: 20, a3: 74, tr: -7, dx: -5 }, hit: { a0: 104, a1: 2, a2: 104, a3: 2, tr: 13, dx: 12 }, rest: { a0: 84, a1: 8, a2: 84, a3: 8, tr: 8, dx: 8 }, tA: .2, tH: .1, tS: .22, hold: .7 },
  pull:      { ant: { a0: 104, a1: 6, a2: 104, a3: 6, tr: 6, dx: 6 }, hit: { a0: 40, a1: 90, a2: 40, a3: 90, tr: -12, dx: -10 }, rest: { a0: 48, a1: 80, a2: 48, a3: 80, tr: -8, dx: -6 }, tA: .17, tH: .12, tS: .22, hold: .7 },
  flinch:    { hit: { a0: 64, a1: 150, a2: 64, a3: 150, tr: -9, hr: -9, dy: 7, dx: -6 }, rest: { a0: 58, a1: 156, a2: 58, a3: 156, tr: -5, hr: -5, dy: 3, dx: -3 }, tA: 0, tH: .07, tS: .2, hold: .8, feel: 'scared' },
  recoil:    { ant: { tr: 3 }, hit: { a0: 78, a1: 96, a2: 78, a3: 96, tr: -15, hr: -9, dx: -16 }, rest: { a0: 70, a1: 104, a2: 70, a3: 104, tr: -9, hr: -5, dx: -10 }, tA: .08, tH: .1, tS: .26, hold: 1, feel: 'shocked' },
  cower:     { hit: { a0: 112, a1: 170, a2: 112, a3: 170, tr: 15, hr: 12, hy: 5, dy: 34 }, rest: { a0: 108, a1: 172, a2: 108, a3: 172, tr: 13, hr: 10, hy: 5, dy: 30 }, osc: { tr: [1.4, 9], hr: [1.6, 11] }, tA: 0, tH: .12, tS: .3, hold: Infinity, feel: 'scared' },
  tremble:   { hit: { a0: 46, a1: 164, a2: 46, a3: 164, tr: 3, hr: -3 }, rest: { a0: 44, a1: 168, a2: 44, a3: 168, tr: 3, hr: -3 }, osc: { tr: [2.6, 19], hr: [3.2, 23], dx: [1.8, 21] }, tA: 0, tH: .15, tS: .3, hold: Infinity, feel: 'scared' },
  slump:     { ant: { dy: -5, tr: -2, hy: -3 }, hit: { a0: 14, a1: -32, a2: 14, a3: -32, tr: 13, hr: 15, hy: 7, dy: 18 }, rest: { a0: 18, a1: -30, a2: 18, a3: -30, tr: 10, hr: 13, hy: 6, dy: 14 }, tA: .25, tH: .5, tS: .5, hold: Infinity, feel: 'sad' },
  sigh:      { ant: { a0: 44, a1: -26, a2: 44, a3: -26, dy: -6, tr: -3, hy: -3 }, hit: { a0: 20, a1: -34, a2: 20, a3: -34, tr: 7, hr: 9, hy: 5, dy: 8 }, rest: { a0: 24, a1: -34, a2: 24, a3: -34, tr: 5, hr: 7, hy: 4, dy: 5 }, tA: .45, tH: .6, tS: .5, hold: 1.2, feel: 'sad' },
  stagger:   { ant: { tr: 9, dx: 7 }, hit: { a0: 66, a1: 20, a2: 66, a3: 20, tr: -17, hr: -7, dx: -20 }, rest: { a0: 50, a1: 8, a2: 50, a3: 8, tr: -6, hr: -3, dx: -9 }, osc: { tr: [2, 2.4], dx: [3, 2.4] }, tA: .1, tH: .14, tS: .3, hold: 1.1, feel: 'shocked' },
  leanin:    { ant: { tr: -3, dx: -3 }, hit: { tr: 13, hr: 7, dx: 16, hy: 2 }, rest: { tr: 11, hr: 5, dx: 14, hy: 2 }, tA: .2, tH: .45, tS: .3, hold: Infinity, feel: 'curious' },
  turnaway:  { ant: { hr: 4 }, hit: { a0: 34, a1: 176, a2: 34, a3: 176, tr: -9, hr: -17, dx: -8 }, rest: { a0: 36, a1: 176, a2: 36, a3: 176, tr: -8, hr: -15, dx: -7 }, tA: .15, tH: .3, tS: .3, hold: Infinity, feel: 'smug' },
  hug:       { ant: { a0: 112, a1: 28, a2: 112, a3: 28, tr: -3 }, hit: { a0: 58, a1: 140, a2: 58, a3: 140, tr: 7, hr: 8, dx: 7 }, rest: { a0: 60, a1: 136, a2: 60, a3: 136, tr: 5, hr: 9, dx: 5 }, tA: .3, tH: .22, tS: .3, hold: 1.6, feel: 'love' },
  clutchhead:{ ant: { a0: 90, a1: 60, a2: 90, a3: 60, tr: -2 }, hit: { a0: 118, a1: 160, a2: 118, a3: 160, tr: 6, hr: -7, dy: 6 }, rest: { a0: 116, a1: 158, a2: 116, a3: 158, tr: 5, hr: -6, dy: 4 }, osc: { hr: [1.6, 3] }, tA: .18, tH: .14, tS: .26, hold: 1.4, feel: 'worried' },
  showoff:   { ant: { a2: 74, a3: 40, tr: 3 }, hit: { a2: 146, a3: 22, tr: -4, hr: 5, dy: -3 }, rest: { a2: 138, a3: 26, tr: -3, hr: 4 }, tA: .2, tH: .16, tS: .24, hold: 1.5, feel: 'proud' },
  knock:     { hit: { a2: 100, a3: 42, tr: 4 }, rest: { a2: 100, a3: 42, tr: 4 }, osc: { a3: [24, 4.2], tr: [1.5, 4.2] }, tA: .1, tH: .2, tS: .1, hold: 1.4 },
  eureka:    { ant: { dy: 7, a2: 60, a3: -4, hy: 2 }, hit: { a2: 170, a3: 4, dy: -9, hr: -5, hy: -4 }, rest: { a2: 162, a3: 8, dy: -3, hr: -3, hy: -2 }, tA: .16, tH: .1, tS: .26, hold: 1.2, feel: 'excited' },
  gasp:      { ant: { dy: 4, tr: 3 }, hit: { a0: 60, a1: 170, a2: 60, a3: 170, hr: -5, dy: -6, tr: -6 }, rest: { a0: 56, a1: 172, a2: 56, a3: 172, hr: -4, dy: -2, tr: -4 }, tA: .1, tH: .08, tS: .22, hold: 1.1, feel: 'shocked' },
  // holding a thing up in front of the chest with both hands (the wallet, the cup, the letter the narrator talks about)
  present:   { ant: { a0: 30, a1: -70, a2: 30, a3: -70 }, hit: { a0: 50, a1: -132, a2: 50, a3: -132, tr: 3 }, rest: { a0: 46, a1: -128, a2: 46, a3: -128, tr: 2 }, tA: .14, tH: .12, tS: .2, hold: Infinity },
  hop:       { hit: { a0: 126, a1: 118, a2: 126, a3: 118, tr: 0 }, rest: { a0: 128, a1: 120, a2: 128, a3: 120 }, bob: [15, 3.2], osc: { tr: [3, 3.2] }, tA: 0, tH: .12, tS: .15, hold: 1.4, feel: 'excited' },
};
export const ACTION_NAMES = Object.keys(ACTIONS);

const ALIASES = {
  smash: 'slam', bang: 'slam', pound: 'slam', hit: 'punch', strike: 'punch', slap: 'punch', snatch: 'grab', seize: 'grab', take: 'grab',
  shove: 'push', drag: 'pull', yank: 'pull', duck: 'flinch', dodge: 'flinch', cringe: 'flinch', stepback: 'recoil', backaway: 'recoil',
  crouch: 'cower', hide: 'cower', shiver: 'tremble', shake: 'tremble', deflate: 'slump', droop: 'slump', stumble: 'stagger', sway: 'stagger',
  lean: 'leanin', closer: 'leanin', ignore: 'turnaway', turn: 'turnaway', embrace: 'hug', headache: 'clutchhead', overwhelmed: 'clutchhead', stressed: 'clutchhead',
  present: 'showoff', display: 'showoff', holdup: 'showoff', reveal: 'showoff', knocking: 'knock', idea: 'eureka', aha: 'eureka', realize: 'eureka',
  gasped: 'gasp', jumpforjoy: 'hop', joyhop: 'hop', exhale: 'sigh',
};
export function normalizeAction(raw) {
  const k = String(raw == null ? '' : raw).toLowerCase().replace(/[^a-z]/g, '');
  if (!k) return null;
  if (ACTIONS[k]) return k;
  return ALIASES[k] && ACTIONS[ALIASES[k]] ? ALIASES[k] : null;
}
export const isAction = (raw) => !!normalizeAction(raw);
export const actionFeel = (raw) => { const k = normalizeAction(raw); return k ? ACTIONS[k].feel || null : null; };

function keyframes(A) {
  const kf = [{ t: 0, p: NEUTRAL, ease: smooth }];
  let t = 0;
  if (A.ant && A.tA > 0) { t += A.tA; kf.push({ t, p: A.ant, ease: easeOut }); }
  t += Math.max(.04, A.tH); kf.push({ t, p: A.hit, ease: A.ant ? easeIn : easeOut });
  t += Math.max(.08, A.tS); kf.push({ t, p: A.rest, ease: smooth });
  return kf;
}
const KF = {};
const kfOf = (name) => KF[name] || (KF[name] = keyframes(ACTIONS[name]));
const chan = (p, k) => (p[k] === undefined ? NEUTRAL[k] : p[k]);

/** The pose of an action at film time t. Returns null when it is not active, else {w, ch:{a0..a3,tr,hr,hy,dx,dy}}; w is how strongly it holds the body. */
export function actPose(kind, t, t0, t1) {
  const name = normalizeAction(kind);
  if (!name) return null;
  const A = ACTIONS[name], kf = kfOf(name);
  const u = t - t0;
  if (!(u >= 0)) return null;
  const tIn = kf[kf.length - 1].t, tR = .3;
  const natural = A.hold === Infinity ? Infinity : tIn + A.hold;
  const span = Number.isFinite(t1) ? Math.max(tIn + .1, t1 - t0) : Infinity;
  const end = Math.min(natural, span);
  const relAt = Math.max(tIn, end - tR);
  if (u > relAt + tR) return null;
  const ch = {};
  let k = 0;
  while (k < kf.length - 2 && u > kf[k + 1].t) k++;
  const a = kf[k], b = kf[Math.min(k + 1, kf.length - 1)];
  const f = b.t > a.t ? b.ease(cl((u - a.t) / (b.t - a.t), 0, 1)) : 1;
  for (const c of CHANNELS) ch[c] = u >= tIn ? chan(kf[kf.length - 1].p, c) : chan(a.p, c) + (chan(b.p, c) - chan(a.p, c)) * f;
  // a held pose keeps a little life: a shake, a hop
  if (A.osc && u > tIn * .5) {
    const env = smooth((u - tIn * .5) / Math.max(.1, tIn * .5));
    for (const c of Object.keys(A.osc)) ch[c] += Math.sin(u * Math.PI * 2 * A.osc[c][1]) * A.osc[c][0] * env;
  }
  if (A.bob && u > .05) ch.dy -= Math.abs(Math.sin(u * Math.PI * A.bob[1])) * A.bob[0];
  // breathing out of the pose
  let w = 1;
  if (u > relAt) w = 1 - smooth((u - relAt) / tR);
  if (w <= .001) return null;
  return { kind: name, w, ch, u };
}

/** The time, after the start of an action, at which it lands (the strike). Used to put the impact on the spoken verb. */
export function impactOffset(kind) {
  const name = normalizeAction(kind);
  if (!name) return 0;
  const A = ACTIONS[name];
  return (A.ant && A.tA > 0 ? A.tA : 0) + Math.max(.04, A.tH);
}

/** Blend an action pose into a target pose object: {a:[l0,l1,r0,r1], tr, hr, hy, dx, dy}. The target's arm array is replaced by a copy. */
export function applyTo(tgt, pose) {
  if (!tgt || !pose) return tgt;
  const w = cl(pose.w, 0, 1), ch = pose.ch;
  const arms = Array.isArray(tgt.a) ? tgt.a.slice() : [34, -36, 34, -36];
  const mixv = (cur, goal) => cur + (goal - cur) * w;
  ['a0', 'a1', 'a2', 'a3'].forEach((c, i) => { arms[i] = mixv(num(arms[i], NEUTRAL[c]), ch[c]); });
  tgt.a = arms;
  for (const c of ['tr', 'hr', 'hy', 'dx', 'dy']) tgt[c] = mixv(num(tgt[c], 0), ch[c]);
  return tgt;
}

/** The automatic actions for a character at scene time T: a list of {t0,t1,kind}. */
export function autoPose(list, T) {
  if (!Array.isArray(list)) return null;
  let best = null;
  for (const e of list) {
    if (T < e.t0 || T > e.t1 + .4) continue;
    const p = actPose(e.kind, T, e.t0, e.t1);
    if (p && (!best || p.u < best.u)) best = p;
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------
// Reading the narration: which verbs call for which body action
// ---------------------------------------------------------------------------------------------------------
const VERBS = [
  [/\b(slam(?:med|s)?|smash(?:ed|es)?|bang(?:ed|s)?|pound(?:ed|s)?|thump(?:ed|s)?)\b/i, 'slam'],
  [/\b(punch(?:ed|es)?|slap(?:ped|s)?|swung at|lashed out)\b/i, 'punch'],
  [/\b(grab(?:bed|s)?|snatch(?:ed|es)?|seiz(?:ed|es)|clutch(?:ed|es)? (?:the|a|his|her|their))\b/i, 'grab'],
  [/\b(push(?:ed|es)?|shov(?:ed|es)?|pressed against)\b/i, 'push'],
  [/\b(pull(?:ed|s)?|dragg?(?:ed|s)?|yank(?:ed|s)?|tug(?:ged|s)?)\b/i, 'pull'],
  [/\b(flinch(?:ed|es)?|duck(?:ed|s)?|dodg(?:ed|es)|cring(?:ed|es))\b/i, 'flinch'],
  [/\b(recoil(?:ed|s)?|backed away|stepped back|stumbled back|jumped back|pulled back)\b/i, 'recoil'],
  [/\b(cower(?:ed|s)?|crouch(?:ed|es)?|hid|hiding|cringing|crawled)\b/i, 'cower'],
  [/\b(trembl(?:ed|es|ing)|shiver(?:ed|s|ing)?|shak(?:ing)|quiver(?:ed|ing)?|terrified|petrified)\b/i, 'tremble'],
  [/\b(slump(?:ed|s)?|sank|sunk|deflated|gave up|crushed|defeated|broke down)\b/i, 'slump'],
  [/\b(sigh(?:ed|s)?|exhale[sd]?|exhausted|worn out|tired)\b/i, 'sigh'],
  [/\b(stagger(?:ed|s)?|stumbl(?:ed|es)|wobbl(?:ed|es)|swayed|dizzy)\b/i, 'stagger'],
  [/\b(lean(?:ed|s)? (?:in|closer|forward)|moved closer|whisper(?:ed|s)?|leaned over)\b/i, 'leanin'],
  [/\b(ignor(?:ed|es)|turned (?:away|his back|her back)|brushed (?:him|her|them) off|snubbed|refused to look)\b/i, 'turnaway'],
  [/\b(hugg?(?:ed|s)?|embrac(?:ed|es)|cuddl(?:ed|es))\b/i, 'hug'],
  [/\b(overwhelm(?:ed|ing)?|stress(?:ed|ful)?|headache|couldn'?t believe|could not believe|can'?t believe|panick?(?:ed|ing)|pulled (?:his|her|their) hair)\b/i, 'clutchhead'],
  [/\b(held up|showed|show(?:ing)? off|displayed|revealed|presented|unveiled|waved the)\b/i, 'showoff'],
  [/\b(knock(?:ed|s|ing)?|rapped|tapped on)\b/i, 'knock'],
  [/\b((?:had|got|have|great|brilliant|new) an? idea|realiz(?:ed|es)|figured (?:it )?out|discover(?:ed|s)|it hit (?:him|her|them)|suddenly (?:understood|knew|saw)|aha|eureka|lightbulb)\b/i, 'eureka'],
  [/\b(gasp(?:ed|s)?|couldn'?t speak|speechless|jaw dropped|mouth fell open)\b/i, 'gasp'],
  [/\b(hopp?(?:ed|ing)|jumped for joy|leapt for joy|celebrat(?:ed|es|ing)|cheered|danced for joy|can'?t stop smiling)\b/i, 'hop'],
];

/** Sentences in a narration, each with its share of the way through the whole text (0..1). */
function sentenceSpans(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  const out = [];
  const re = /[^.!?;]+[.!?;]*/g;
  let m;
  while ((m = re.exec(s))) {
    const body = m[0].trim();
    if (body) out.push({ text: body, from: m.index / s.length, to: (m.index + m[0].length) / s.length });
  }
  return out;
}

/** Which body action each verb in a narration calls for, and when it is said. [{t, kind, verb, sentence}] with t in seconds from the scene start. */
export function detectActions(text, dur, opts = {}) {
  const D = Math.max(.8, num(dur, 5));
  const first = .2, last = Math.max(first + .5, D - .35);
  const out = [];
  for (const sp of sentenceSpans(text)) {
    for (const [re, kind] of VERBS) {
      const m = re.exec(sp.text);
      if (!m) continue;
      const within = (m.index + m[0].length / 2) / Math.max(1, sp.text.length);
      const share = sp.from + (sp.to - sp.from) * within;
      out.push({ t: r2(cl(first + share * (last - first), first, last)), kind, verb: m[0].toLowerCase(), sentence: sp.text, subject: opts.subjectOf ? opts.subjectOf(sp.text, m.index) : null });
      break; // one action per sentence: the strongest verb wins by list order
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Directing a whole film: fill in the body acting the narration calls for and the file did not provide
// ---------------------------------------------------------------------------------------------------------
const bgOf = (c) => !c || c.hide === true || num(c.par, 0) < 0 || num(c.scale, .85) < .5;
const talkerOf = (c) => c && (c.talk === true || (Array.isArray(c.talk) && c.talk.length > 0));
const MOOD_FILL = { sad: 'sigh', sorrow: 'sigh', tense: 'leanin', dread: 'leanin', suspense: 'leanin', scary: 'flinch', fear: 'flinch', happy: 'hop', joy: 'hop', funny: 'hop', mystery: 'leanin', curious: 'leanin' };

/** Does the stretch [a,b] overlap anything the file already acts out for this person? c._busy is [[from,to],...] written by the beat compiler. */
function busyIn(c, a, b) {
  const list = Array.isArray(c._busy) ? c._busy : [];
  return list.some(([x, y]) => a < y && b > x);
}

/**
 * Writes c._autoAct = [{t0,t1,kind,verb}] on the people in each scene. The engine plays these only as a blend over a body that
 * is otherwise idle or speaking, never over a walk, a reaction or an action the file chose itself (those windows are in c._busy).
 * Returns {added, scenes, quiet}: how many actions were added, how many scenes got some, and how many long stretches stay still.
 */
export function directActing(SC, opts = {}) {
  const res = { added: 0, scenes: 0, quiet: 0 };
  if (!Array.isArray(SC)) return res;
  for (const sc of SC) {
    if (!sc || typeof sc !== 'object' || !Array.isArray(sc.characters)) continue;
    const dur = Math.max(.8, num(sc.duration, 5));
    const chars = sc.characters.filter((c) => c && typeof c === 'object');
    const cast = chars.filter((c) => !bgOf(c));
    if (!cast.length) continue;
    const speaker = cast.find(talkerOf) || cast[0];
    const narration = sc.narration || sc.say || (Array.isArray(sc.captions) ? sc.captions.map((x) => (x && x.text) || '').join(' ') : '');
    const subjectOf = (sentence, at) => {
      const head = sentence.slice(0, Math.max(0, at)).toLowerCase();
      let best = null, pos = -1;
      for (const c of cast) {
        const w = String(c._who || '').toLowerCase();
        if (w.length < 2) continue;
        const i = head.lastIndexOf(w);
        if (i > pos) { pos = i; best = c; }
      }
      if (best) return best;
      // "she flinched": the one woman (or man) in the shot, when there is exactly one
      const pr = /\b(she)\b/i.test(head) ? 'female' : /\b(he)\b/i.test(head) ? 'male' : '';
      if (pr) {
        const same = cast.filter((c) => String((c.look && c.look.gender) || '').toLowerCase() === pr);
        if (same.length === 1) return same[0];
      }
      return null;
    };
    let any = false;
    for (const ev of detectActions(narration, dur, { subjectOf })) {
      const c = ev.subject || speaker;
      if (!c || bgOf(c)) continue;
      const lead = impactOffset(ev.kind);
      const t0 = Math.max(0, r2(ev.t - lead));
      const t1 = r2(Math.min(dur, t0 + lead + 1.1));
      if (busyIn(c, t0, t1)) continue;
      if (Array.isArray(c._autoAct) && c._autoAct.some((e) => t0 < e.t1 + .25 && t1 > e.t0)) continue;
      if (Array.isArray(c._autoAct) && c._autoAct.length >= 8) continue;
      (c._autoAct = c._autoAct || []).push({ t0, t1, kind: ev.kind, verb: ev.verb });
      res.added++; any = true;
    }
    // a long stretch where nobody moves their body: give the mood a gesture, so the shot is never a still picture
    const mood = String(sc.mood || sc.m || '').toLowerCase();
    const fill = MOOD_FILL[mood];
    if (fill) {
      for (const c of cast) {
        const list = (c._autoAct || []).map((e) => [e.t0, e.t1]).concat(Array.isArray(c._busy) ? c._busy : []).sort((p, q) => p[0] - q[0]);
        let cur = 0, gap = null;
        for (const [x, y] of list.concat([[dur, dur]])) { if (x - cur > 3.2 && !gap) gap = [cur, x]; cur = Math.max(cur, y); }
        if (gap) {
          const t0 = r2(gap[0] + Math.min(1.2, (gap[1] - gap[0]) * .3));
          (c._autoAct = c._autoAct || []).push({ t0, t1: r2(Math.min(gap[1], t0 + 2)), kind: fill, verb: 'mood:' + mood, fill: true });
          res.added++; any = true;
        }
      }
    }
    if (any) res.scenes++;
    for (const c of cast) {
      if (!Array.isArray(c._busy)) continue;
      const marks = (c._autoAct || []).map((e) => [e.t0, e.t1]).concat(c._busy).sort((p, q) => p[0] - q[0]);
      let cur = 0;
      for (const [x, y] of marks.concat([[dur, dur]])) { if (x - cur > 4.5) res.quiet++; cur = Math.max(cur, y); }
    }
  }
  return res;
}

/** The windows of a compact act spec ('walkR@0->grab@2.1->idle@3.4') that are doing something other than standing or talking. */
export function busyWindows(phases) {
  const calm = /^(idle|speak|lookaround|stand|)$/;
  const out = [];
  for (const p of phases || []) {
    if (!p || calm.test(String(p.cmd || ''))) continue;
    out.push([r2(num(p.start, 0)), r2(num(p.end, 0))]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// What the AI is told
// ---------------------------------------------------------------------------------------------------------
export const ACTING_MARKER = 'BODY ACTING';

/** The short block added to every prompt sent to an AI model. Kept deliberately small: the engine supplies the animation craft. */
export function actingRule() {
  return `${ACTING_MARKER} (the film must make sense with the sound OFF; the engine adds the wind-up, impact and settle, you only choose the action):
- Before you write code, list for every scene: narrator phrase -> what the viewer SEES. Every noun and verb in the sentence is on screen: the object appears, the person touches or uses it, and the result is visible.
- Put an action on the person doing the verb, starting on that word: ['hero','walkR@0->grab@2.1->slam@3.6->clutchhead@5',...]. Extra actions: ${ACTION_NAMES.join(', ')}.
- Something visible changes every 1.5 to 2.5 seconds. Nobody stands still for more than 2 seconds: speakers act the words, listeners react, the crowd moves.
- The set tells the story too: the background is the place the narrator names and changes when the place changes; its colour and light match the feeling; every object named is drawn on screen as it is said, and the world reacts to big moments (lights go out, a crowd turns, papers fly). The engine adds common objects you forget.
- A big moment gets a big move: slam then camera shake, flinch then a close-up of the face, gasp then a cut to the cause.
- Heads turn toward whoever a person talks to or listens to by themselves (the body stays front). Only to override: {gaze:'boss@0->camera@3'}.
- The camera and the body agree with the feeling: slow push-in for dread, snap zoom for a shock, wide and still for loneliness.
- ALIVE: the speaker acts every sentence on its key word (point, count, open hands, lean in, step, turn, lift an object), a different move each sentence. Listeners react in the same second. Props get used. Characters walk to things. Each scene opens in motion and ends on a held reaction.`;
}
