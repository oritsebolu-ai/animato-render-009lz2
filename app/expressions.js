// Facial acting for every character style: what the face is feeling, second by second.
//
// Before this module a person had ONE face for the whole film (the "look": brow, mouth, expression) unless an action such as
// react:shock happened to swap it for a moment. A film needs the face to follow the story: worried, then shocked, then angry.
//
//   EMOTIONS / EMOTION_NAMES   the closed list of feelings the AI may write, each one a set of face "dials"
//                              (brow tilt, brow raise, eye openness, smile, mouth opening, gaze, eye shape, mouth shape, extras)
//   parseFaceTrack(spec, dur)  'worried@0->shocked:1.3@1.8->angry@3.4'  ->  [{t, emo, k}]
//   faceFor(c, T, dur)         what the face of character c is doing at scene time T (a pure function of the clock, so the
//                              preview and the exported video match frame for frame): the words for the old renderers
//                              (brow, mouth, expression, smile, browMood) and the dials for the new face drawing
//   directFaces(SC)            compiles the AI's face tracks and, for anyone the AI did not direct, writes one from the narration
//                              (the feeling of each sentence), the mood of the scene and who is speaking, so nobody keeps one
//                              expression through the whole film
//   expressionRule(style)      the block added to every prompt sent to an AI model so it directs the faces itself
//
// Nothing here draws. It never throws on bad input: an unknown word is dropped, a missing track means "keep the resting face".

const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth01 = (u) => { const t = cl(u, 0, 1); return t * t * (3 - 2 * t); };
const num = (v, d = 0) => (Number.isFinite(+v) && v !== null && v !== '' && v !== true && v !== false ? +v : d);
const r2 = (n) => Math.round(n * 100) / 100;

function hash01(n) {
  let h = Math.imul((Math.floor(n) ^ 0x9e3779b9) >>> 0, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function hashStr(s) {
  let h = 2166136261 >>> 0;
  const str = String(s == null ? '' : s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

// ---------------------------------------------------------------------------------------------------------
// The feelings
// ---------------------------------------------------------------------------------------------------------
// b = brow word, m = mouth word (the old renderers), x = expression word for Human and Doodle, s7 = the nearest of the stickman's seven.
// tilt   brow slant: +1 worried or sad (inner ends up), -1 angry (inner ends down)
// raise  brows up (+) or pushed down (-)
// eye    how open the eyes are: 0.3 squeezed, 0.6 heavy lids, 1 normal, 1.4 stunned wide
// smile  mouth curve: -1 deep frown ... +1 huge smile
// open   how far the mouth is open when it is not speaking (0 to 1)
// gx gy  where the eyes look (-1 to 1; negative gy = up)       as  one brow higher than the other (0 to 1)
// ek     eye shape: open | wide | arc (happy ^ ^) | lid (heavy lids / glare) | closed
// mf     mouth shape: smile | grin | open | oh | frown | flat | smirk | grit | wobble | laugh | scream | wail | tight
// fx     extras: sweat | tear | blush | vein | spark
const D = (o) => Object.freeze({ gx: 0, gy: 0, as: 0, open: 0, ek: 'open', fx: Object.freeze([]), ...o, ...(o.fx ? { fx: Object.freeze(o.fx) } : {}) });

export const EMOTIONS = Object.freeze({
  neutral:      D({ b: 'calm',  m: 'flat',  x: 'chill',    s7: 'quirky',    tilt: 0,    raise: 0,    eye: 1,    smile: .1,   mf: 'flat' }),
  calm:         D({ b: 'calm',  m: 'smile', x: 'calm',     s7: 'chill',     tilt: .05,  raise: 0,    eye: .92,  smile: .3,   mf: 'smile' }),
  happy:        D({ b: 'happy', m: 'smile', x: 'happy',    s7: 'happy',     tilt: .2,   raise: .2,   eye: 1,    smile: .8,   mf: 'smile' }),
  excited:      D({ b: 'happy', m: 'grin',  x: 'excited',  s7: 'happy',     tilt: .1,   raise: .55,  eye: 1.15, smile: 1,    mf: 'grin', gy: -.1, fx: ['spark'] }),
  laughing:     D({ b: 'happy', m: 'open',  x: 'laughing', s7: 'happy',     tilt: .15,  raise: .3,   eye: .3,   smile: 1,    mf: 'laugh', open: .75, ek: 'arc' }),
  proud:        D({ b: 'calm',  m: 'smirk', x: 'proud',    s7: 'cool',      tilt: -.1,  raise: .25,  eye: .85,  smile: .5,   mf: 'smile', gy: -.15, ek: 'lid' }),
  smug:         D({ b: 'calm',  m: 'smirk', x: 'cool',     s7: 'cool',      tilt: -.3,  raise: 0,    eye: .62,  smile: .35,  mf: 'smirk', as: .5, gx: .3, ek: 'lid' }),
  love:         D({ b: 'happy', m: 'smile', x: 'love',     s7: 'happy',     tilt: .3,   raise: .2,   eye: .95,  smile: .85,  mf: 'smile', ek: 'arc', fx: ['blush', 'spark'] }),
  relieved:     D({ b: 'calm',  m: 'smile', x: 'chill',    s7: 'chill',     tilt: .45,  raise: .1,   eye: .7,   smile: .5,   mf: 'smile', gy: .15, ek: 'lid', fx: ['sweat'] }),
  hopeful:      D({ b: 'happy', m: 'smile', x: 'happy',    s7: 'quirky',    tilt: .6,   raise: .45,  eye: 1.08, smile: .3,   mf: 'smile', gy: -.45 }),
  thinking:     D({ b: 'calm',  m: 'flat',  x: 'thinking', s7: 'cool',      tilt: -.1,  raise: .1,   eye: .85,  smile: 0,    mf: 'flat', as: .6, gx: .6, gy: -.6 }),
  curious:      D({ b: 'happy', m: 'flat',  x: 'quirky',   s7: 'quirky',    tilt: .15,  raise: .5,   eye: 1.1,  smile: .1,   mf: 'oh', open: .12, as: .5, gx: .5 }),
  confused:     D({ b: 'sad',   m: 'flat',  x: 'confused', s7: 'shy',       tilt: .5,   raise: .3,   eye: 1,    smile: -.15, mf: 'wobble', as: .8, gx: .3, gy: -.2 }),
  surprised:    D({ b: 'happy', m: 'open',  x: 'surprised', s7: 'surprised', tilt: .1,  raise: .85,  eye: 1.3,  smile: 0,    mf: 'oh', open: .5, ek: 'wide' }),
  shocked:      D({ b: 'happy', m: 'open',  x: 'shock',    s7: 'surprised', tilt: .15,  raise: 1,    eye: 1.42, smile: -.1,  mf: 'open', open: .9, ek: 'wide' }),
  awe:          D({ b: 'happy', m: 'open',  x: 'surprised', s7: 'surprised', tilt: .25, raise: .65,  eye: 1.25, smile: .35,  mf: 'oh', open: .3, gy: -.5, ek: 'wide', fx: ['spark'] }),
  worried:      D({ b: 'sad',   m: 'frown', x: 'worried',  s7: 'shy',       tilt: .85,  raise: .3,   eye: 1.05, smile: -.35, mf: 'wobble', gx: .3, gy: .25, fx: ['sweat'] }),
  nervous:      D({ b: 'sad',   m: 'flat',  x: 'worried',  s7: 'shy',       tilt: .6,   raise: .2,   eye: 1.1,  smile: -.15, mf: 'wobble', gx: .6, fx: ['sweat'] }),
  scared:       D({ b: 'sad',   m: 'open',  x: 'scared',   s7: 'surprised', tilt: .95,  raise: .8,   eye: 1.38, smile: -.5,  mf: 'scream', open: .55, ek: 'wide', fx: ['sweat'] }),
  sad:          D({ b: 'sad',   m: 'frown', x: 'sad',      s7: 'shy',       tilt: 1,    raise: -.15, eye: .78,  smile: -.85, mf: 'frown', gy: .5, ek: 'lid' }),
  crying:       D({ b: 'sad',   m: 'open',  x: 'cry',      s7: 'shy',       tilt: 1.1,  raise: 0,    eye: .55,  smile: -1,   mf: 'wail', open: .5, gy: .4, ek: 'lid', fx: ['tear'] }),
  disappointed: D({ b: 'sad',   m: 'frown', x: 'sad',      s7: 'shy',       tilt: .6,   raise: -.25, eye: .72,  smile: -.55, mf: 'frown', gy: .6, ek: 'lid' }),
  embarrassed:  D({ b: 'sad',   m: 'smile', x: 'shy',      s7: 'shy',       tilt: .5,   raise: .1,   eye: .95,  smile: .1,   mf: 'wobble', gx: -.6, gy: .4, fx: ['blush', 'sweat'] }),
  annoyed:      D({ b: 'angry', m: 'flat',  x: 'angry',    s7: 'cool',      tilt: -.5,  raise: -.25, eye: .62,  smile: -.3,  mf: 'flat', as: .2, ek: 'lid' }),
  angry:        D({ b: 'angry', m: 'frown', x: 'angry',    s7: 'cool',      tilt: -1,   raise: -.4,  eye: .78,  smile: -.75, mf: 'frown', ek: 'lid', fx: ['vein'] }),
  furious:      D({ b: 'angry', m: 'open',  x: 'angry',    s7: 'cool',      tilt: -1.2, raise: -.55, eye: .85,  smile: -1,   mf: 'scream', open: .8, ek: 'lid', fx: ['vein'] }),
  disgusted:    D({ b: 'sad',   m: 'frown', x: 'sad',      s7: 'shy',       tilt: -.2,  raise: -.2,  eye: .55,  smile: -.7,  mf: 'wobble', as: .4, gx: .5, ek: 'lid' }),
  suspicious:   D({ b: 'angry', m: 'flat',  x: 'cool',     s7: 'cool',      tilt: -.4,  raise: -.05, eye: .55,  smile: -.15, mf: 'flat', as: .8, gx: .7, ek: 'lid' }),
  scheming:     D({ b: 'angry', m: 'smirk', x: 'cool',     s7: 'cool',      tilt: -.65, raise: -.1,  eye: .62,  smile: .65,  mf: 'smirk', gx: .6, ek: 'lid' }),
  determined:   D({ b: 'angry', m: 'flat',  x: 'cool',     s7: 'cool',      tilt: -.75, raise: -.2,  eye: .92,  smile: -.05, mf: 'tight' }),
  tired:        D({ b: 'sad',   m: 'flat',  x: 'chill',    s7: 'chill',     tilt: .35,  raise: -.3,  eye: .38,  smile: -.2,  mf: 'flat', gy: .6, ek: 'lid' }),
  bored:        D({ b: 'calm',  m: 'flat',  x: 'chill',    s7: 'chill',     tilt: 0,    raise: -.2,  eye: .5,   smile: -.15, mf: 'flat', gx: -.6, ek: 'lid' }),
  deadpan:      D({ b: 'calm',  m: 'flat',  x: 'cool',     s7: 'cool',      tilt: 0,    raise: 0,    eye: .8,   smile: 0,    mf: 'flat', ek: 'lid' }),
  pain:         D({ b: 'sad',   m: 'frown',  x: 'sad',      s7: 'shy',       tilt: .8,   raise: -.1,  eye: .22,  smile: -.7,  mf: 'tight', open: .25, ek: 'closed', fx: ['sweat'] }),
});

/** The words the AI may write (neutral is the resting face and is also accepted, but is not advertised). */
export const EMOTION_NAMES = Object.freeze(Object.keys(EMOTIONS).filter((k) => k !== 'neutral'));

const ALIASES = {
  shock: 'shocked', stunned: 'shocked', gasp: 'shocked', shocking: 'shocked', surprise: 'surprised', amazed: 'awe', wonder: 'awe', amazement: 'awe',
  afraid: 'scared', terrified: 'scared', fear: 'scared', fearful: 'scared', frightened: 'scared', panic: 'scared', panicked: 'scared',
  anxious: 'nervous', uneasy: 'nervous', worry: 'worried', concerned: 'worried',
  mad: 'angry', anger: 'angry', rage: 'furious', enraged: 'furious', livid: 'furious', irritated: 'annoyed', frustrated: 'annoyed', jealous: 'annoyed',
  upset: 'sad', unhappy: 'sad', heartbroken: 'sad', sorrow: 'sad', grief: 'sad', gloomy: 'sad', hurt: 'sad', cry: 'crying', sob: 'crying', sobbing: 'crying', tears: 'crying',
  laugh: 'laughing', laughs: 'laughing', lol: 'laughing', hysterical: 'laughing', joy: 'happy', joyful: 'happy', glad: 'happy', cheerful: 'happy', smile: 'happy', smiling: 'happy', grin: 'happy',
  thrilled: 'excited', hyped: 'excited', eager: 'excited', celebrate: 'excited', celebrating: 'excited', cheer: 'excited',
  sarcastic: 'smug', smirk: 'smug', cocky: 'smug', arrogant: 'smug', confident: 'proud', pride: 'proud',
  guilty: 'embarrassed', ashamed: 'embarrassed', shy: 'embarrassed', awkward: 'embarrassed', sleepy: 'tired', exhausted: 'tired', weary: 'tired', drained: 'tired',
  thoughtful: 'thinking', think: 'thinking', pondering: 'thinking', puzzled: 'confused', confusion: 'confused', serious: 'deadpan', stern: 'deadpan', blank: 'deadpan', stoic: 'deadpan',
  grateful: 'relieved', relief: 'relieved', hope: 'hopeful', optimistic: 'hopeful', loving: 'love', adoring: 'love', inlove: 'love',
  disgust: 'disgusted', gross: 'disgusted', doubtful: 'suspicious', skeptical: 'suspicious', sceptical: 'suspicious', wary: 'suspicious', sly: 'scheming', devious: 'scheming', evil: 'scheming',
  resolute: 'determined', focused: 'determined', fierce: 'determined', angryface: 'angry', hurting: 'pain', ouch: 'pain', agony: 'pain', neutral: 'neutral', rest: 'neutral', normal: 'neutral', default: 'neutral', idle: 'neutral',
};

/** 'Shock' -> 'shocked', 'afraid' -> 'scared', 'zzz' -> null. */
export function normalizeEmotion(word) {
  const w = String(word == null ? '' : word).toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return null;
  if (EMOTIONS[w]) return w;
  return ALIASES[w] || null;
}

// ---------------------------------------------------------------------------------------------------------
// Tracks: what the AI writes, and what the engine keeps
// ---------------------------------------------------------------------------------------------------------
/**
 * 'worried@0->shocked:1.3@1.8->angry@3.4'   or   [[0,'worried'],[1.8,'shocked',1.3]]   or   [{t:0,emo:'worried',k:1}]
 * emotion[:strength][@second]. Strength is 0.2 (a hint) to 1.5 (extreme), default 1. A segment without @second is spread evenly.
 * Returns [{t, emo, k}] sorted by time, first segment at t=0, unknown words dropped.
 */
export function parseFaceTrack(spec, dur = 6) {
  const total = Math.max(0.5, num(dur, 6));
  let raw = [];
  if (typeof spec === 'string') {
    const parts = spec.trim().split(/\s*(?:->|=>|→|,|;|\|)\s*/).filter(Boolean);
    const n = parts.length;
    raw = parts.map((p, i) => {
      const at = /@\s*(-?[\d.]+)\s*s?$/.exec(p);
      const body = p.replace(/@\s*-?[\d.]+\s*s?$/, '').trim();
      const [w, ks] = body.split(':').map((s) => s.trim());
      const kk = ks !== undefined && ks !== '' && Number.isFinite(+ks) ? +ks : 1;
      return { t: at ? +at[1] : (i === 0 ? 0 : (i * total) / n), word: w, k: kk };
    });
  } else if (Array.isArray(spec)) {
    raw = spec.map((e, i) => {
      if (Array.isArray(e)) return { t: num(e[0], i === 0 ? 0 : (i * total) / spec.length), word: e[1], k: e[2] === undefined ? 1 : num(e[2], 1) };
      if (e && typeof e === 'object') return { t: num(e.t ?? e.at ?? e.from, i === 0 ? 0 : (i * total) / spec.length), word: e.emo ?? e.emotion ?? e.face ?? e.feel ?? e.word, k: e.k === undefined && e.strength === undefined ? 1 : num(e.k ?? e.strength, 1) };
      return { t: i === 0 ? 0 : (i * total) / spec.length, word: e, k: 1 };
    });
  } else return [];
  const out = [];
  for (const s of raw) {
    const emo = normalizeEmotion(s.word);
    if (!emo) continue;
    out.push({ t: cl(num(s.t, 0), 0, total + 30), emo, k: cl(num(s.k, 1), 0.15, 1.6) });
  }
  out.sort((a, b) => a.t - b.t);
  if (!out.length) return [];
  out[0] = { ...out[0], t: Math.min(out[0].t, 0) };
  // two feelings at the same instant: the later one wins
  return out.filter((s, i) => !(i + 1 < out.length && out[i + 1].t - s.t < 0.04));
}

// ---------------------------------------------------------------------------------------------------------
// Evaluating a face at a time
// ---------------------------------------------------------------------------------------------------------
const REST = { tilt: 0, raise: 0, eye: 1, smile: .1, open: 0, gx: 0, gy: 0, as: 0 };
const NUMS = ['tilt', 'raise', 'eye', 'smile', 'open', 'gx', 'gy', 'as'];
const LIM = { tilt: [-1.4, 1.4], raise: [-.8, 1.2], eye: [.15, 1.5], smile: [-1.1, 1.1], open: [0, 1], gx: [-1, 1], gy: [-1, 1], as: [0, 1] };
const TRANS = 0.24;        // seconds a change of feeling takes
const LEAD = 0.07;         // the face starts to move this long before the written time (a face leads the words)

/** The dials of one feeling at strength k. */
export function dialsOf(emo, k = 1) {
  const e = EMOTIONS[emo] || EMOTIONS.neutral;
  const kk = cl(num(k, 1), 0.15, 1.6);
  const d = { emo, k: kk, ek: e.ek, mf: e.mf, fx: kk >= .55 ? e.fx : [], b: e.b, m: e.m, x: e.x, s7: e.s7 };
  for (const n of NUMS) d[n] = cl(REST[n] + (e[n] - REST[n]) * kk, LIM[n][0], LIM[n][1]);
  if (kk < .35) { d.ek = 'open'; d.mf = d.smile < -.1 ? 'flat' : d.smile > .35 ? 'smile' : 'flat'; d.b = 'calm'; d.m = d.smile > .35 ? 'smile' : 'flat'; d.x = 'chill'; d.s7 = 'quirky'; }
  return d;
}

function mixDials(a, b, u) {
  const d = {};
  for (const n of NUMS) d[n] = lerp(a[n], b[n], u);
  const w = u < .5 ? a : b;
  d.emo = b.emo; d.k = lerp(a.k, b.k, u);
  d.ek = w.ek; d.mf = w.mf; d.b = w.b; d.m = w.m; d.x = w.x; d.s7 = w.s7;
  d.fx = u < .5 ? a.fx : b.fx;
  return d;
}

function segAt(track, T) {
  let i = 0;
  for (let j = 0; j < track.length; j++) if (T >= track[j].t - LEAD) i = j; else break;
  return i;
}

/**
 * The face of character `c` at scene time `T`.
 * Priority: the AI's own track (c._feelTrack, from face:'...') > the engine's track written from the narration (c._autoFeel).
 * Returns null when the character should simply keep the resting face.
 *   { emo, k, src: 'explicit'|'auto', look:{brow,mouth,x,s7,smile,browMood}|null, dials, blink (0..1: a quick blink that hides the change) }
 */
export function faceFor(c, T, opts = {}) {
  if (!c || typeof c !== 'object') return null;
  const src = c._feelTrack && c._feelTrack.length ? 'explicit' : c._autoFeel && c._autoFeel.length ? 'auto' : '';
  if (!src) return null;
  const track = src === 'explicit' ? c._feelTrack : c._autoFeel;
  const t = num(T, 0);
  const i = segAt(track, t);
  const cur = track[i], prev = i > 0 ? track[i - 1] : null;
  const dc = dialsOf(cur.emo, cur.k);
  let dials = dc, blink = 0;
  const since = t - (cur.t - LEAD);
  if (prev && since < TRANS) {
    const u = smooth01(since / TRANS);
    dials = mixDials(dialsOf(prev.emo, prev.k), dc, u);
    // a quick blink hides the swap of eye and mouth shapes, the way a real face changes (only for a real change of feeling)
    if (prev.emo !== cur.emo) { const big = Math.abs(dc.tilt - dialsOf(prev.emo, prev.k).tilt) + Math.abs(dc.eye - dialsOf(prev.emo, prev.k).eye); if (big > .25) blink = Math.pow(Math.sin(Math.PI * cl(since / TRANS, 0, 1)), 2) * .85; }
  }
  const seed = (c._feelSeed ??= hashStr(c._who || c.id || (c.look && (c.look.name || c.look.seed)) || 'x') % 997);
  // the pop of a sudden feeling: eyes and brows overshoot for a moment, then settle
  const popAmt = (cur.emo === 'shocked' || cur.emo === 'surprised' || cur.emo === 'scared' || cur.emo === 'furious' || cur.emo === 'excited') ? .16 : cur.emo === 'angry' || cur.emo === 'worried' ? .07 : 0;
  const pu = cl((t - cur.t) / .34, 0, 1);
  const pop = prev ? popAmt * Math.sin(Math.PI * pu) * (1 - pu * .3) : 0;
  const m = (opts.micro === false) ? 0 : 1;
  const out = { ...dials };
  out.raise = cl(dials.raise + pop * 1.2 + m * (Math.sin(t * 1.3 + seed) * .035), LIM.raise[0], LIM.raise[1]);
  out.eye = cl(dials.eye * (1 + pop), LIM.eye[0], LIM.eye[1]);
  out.smile = cl(dials.smile + m * (Math.sin(t * .9 + seed * 1.7) * .04), LIM.smile[0], LIM.smile[1]);
  out.gx = cl(dials.gx + m * (Math.sin(t * .6 + seed) * .12 + (cur.emo === 'nervous' ? Math.sin(t * 5 + seed) * .25 : 0)), -1, 1);
  out.gy = cl(dials.gy + m * (Math.sin(t * .5 + seed * 2.1) * .08), -1, 1);
  // a steady "neutral" means: back to the resting face the character was designed with
  if (cur.emo === 'neutral' && (!prev || since >= TRANS)) return null;
  const asLook = (d) => ({ brow: d.b, mouth: d.m, x: d.x, s7: d.s7, smile: cl(Math.round(d.smile * 13), -12, 14), browMood: cl(Math.round(d.tilt * 9), -10, 10) });
  return { emo: cur.emo, k: cur.k, src, look: asLook(dials), dials: out, blink };
}

/**
 * Writes a face onto a look for the old renderers. `style` is 'human'/'doodle' (they know the long list of expression words) or anything else.
 * Returns a new look object (the character's own look is never changed) and does not include the continuous dials: those travel in the pose (pose.emo),
 * because a look that changed every frame would defeat the renderers' caches.
 */
export function lookWithFace(look, fa, style = '') {
  const base = look && typeof look === 'object' ? look : {};
  if (!fa || !fa.look) return base;
  const long = style === 'human' || style === 'doodle';
  return { ...base, brow: fa.look.brow, mouth: fa.look.mouth, expression: long ? fa.look.x : fa.look.s7, smile: fa.look.smile, browMood: fa.look.browMood };
}

// ---------------------------------------------------------------------------------------------------------
// Writing a track from the story (for anyone the AI did not direct)
// ---------------------------------------------------------------------------------------------------------
// [pattern, feeling, weight]
const LEXICON = [
  // THE SITUATION ITSELF (heat, fire, injury, cold, danger): a person walking through fire or baking in the sun is never smiling
  [/\b(fire|flames?|on fire|burn(?:ing|ed|t|s)?|blaze|blazing|inferno|scorch\w*|lava|boiling|so hot|too hot|very hot|hot sun|scorching|heat ?wave|the heat|sweltering|sweat\w*|injur\w*|wound\w*|hurt(?:ing|s)?|bleed\w*|blood\w*|limp\w*|broke (?:his|her|my) \w+|punched|stabbed|shot (?:him|her|me)|bitten|stung|ouch|agony|in pain|painful|freezing|frozen|shiver\w*|frostbit\w*|thirst\w*|starv\w*|fever|vomit\w*|choking|drowning)\b/i, 'pain', 1.8],
  [/\b(chas(?:ed|ing|es)|ran from|running from|run from|fled|fleeing|run away|ran away|ran for (?:his|her|their|my) life|barking|growl\w*|snarl\w*|roar\w*|hunted|ambush\w*|gun|knife|falling|fell off|ghost\w*|haunted|zombie\w*|creature|predator|earthquake|tsunami|flood\w*|explod\w*)\b/i, 'scared', 1.6],
  [/\b(suddenly|shock(?:ed|ing)?|stunned|gasp(?:ed)?|couldn'?t believe|unbelievable|out of nowhere|exploded|explosion|crash(?:ed)?|vanished|disappeared|impossible|breaking news|just then)\b/i, 'shocked', 1.4],
  [/\b(terrif\w*|scared|afraid|fear(?:ed)?|horror|panic\w*|danger\w*|threat\w*|chased|trapped|monster|deadly|nightmare|screamed|run for your life)\b/i, 'scared', 1.5],
  [/\b(worr\w*|trouble|problem|risk\w*|struggl\w*|doubt\w*|uncertain|anxious|nervous|deadline|running out|broke|debt|behind|failing|pressure|warning|crisis|bankrupt\w*|only \w+ days left|days left)\b/i, 'worried', 1.2],
  [/\b(sad|lost everything|cried|crying|tears|died|death|funeral|grief|lonely|alone|heartbr\w*|goodbye|hopeless|gave up|empty|miserable|suffer\w*)\b/i, 'sad', 1.3],
  [/\b(disappoint\w*|let down|didn'?t work|rejected|rejection|denied|declined|turned down|failed|failure|no one believed|nobody believed|laughed at|mocked|ridiculed)\b/i, 'disappointed', 1.25],
  [/\b(angry|furious|rage|hate[ds]?|betray\w*|cheat\w*|lied|lies|stole|unfair|scam\w*|fraud\w*|revenge|yelled|shouted|attack\w*|insult\w*)\b/i, 'angry', 1.4],
  [/\b(annoy\w*|irritat\w*|ignored|waste of time|complain\w*)\b/i, 'annoyed', 1.1],
  [/\b(embarrass\w*|ashamed|shame|blush\w*|awkward|humiliat\w*|oops)\b/i, 'embarrassed', 1.2],
  [/\b(disgust\w*|gross|rotten|filthy|nasty|revolting)\b/i, 'disgusted', 1.2],
  [/\b(suspicious|secret|secretly|hidden|watching|followed|too good to be true|fake|something was off|strange noise)\b/i, 'suspicious', 1.2],
  [/\b(plan(?:ned)? to|scheme\w*|plot(?:ted)?|cunning|sneak\w*|trick(?:ed)?|devious|mastermind)\b/i, 'scheming', 1.1],
  [/\b(determin\w*|refus\w*|never give up|decided to|fight(?:ing)? back|promised|vowed|no matter what|stood up|said no|rise up|comeback|try again|kept going)\b/i, 'determined', 1.3],
  [/\b(tired|exhaust\w*|sleepless|late night|every single night|all night|day and night|grind\w*|overwork\w*)\b/i, 'tired', 1.1],
  [/\b(bored|boring|same routine|every day the same|dull)\b/i, 'bored', 1.1],
  [/\b(beautiful|breathtaking|magnificent|stunning|vast|enormous|giant|massive|spectacular|never seen anything)\b/i, 'awe', 1.1],
  [/\b(love[ds]?|kiss(?:ed)?|married|wedding|adore\w*|romance|soulmate)\b/i, 'love', 1.3],
  [/\b(relie\w+|safe|saved|survived|escaped|made it out|finally over|thank god)\b/i, 'relieved', 1.2],
  [/\b(proud|built it|achiev\w*|accomplish\w*|made it|top of|champion|graduat\w*|award\w*)\b/i, 'proud', 1.2],
  [/\b(won|win|winning|victory|success\w*|celebrat\w*|cheer\w*|dream came true|million|billion|record|viral|promotion|hired|congrat\w*|jackpot|best day)\b/i, 'excited', 1.3],
  [/\b(laugh\w*|funny|joke[ds]?|hilarious|haha|giggl\w*)\b/i, 'laughing', 1.1],
  [/\b(happy|joy\w*|glad|smil\w*|delight\w*|wonderful|great news|good news)\b/i, 'happy', 1.1],
  [/\b(hope\w*|maybe|someday|one day|dream(?:ed|s)? of|wish\w*)\b/i, 'hopeful', 1.0],
  [/\b(confus\w*|strange|weird|odd|mysterious|didn'?t understand|made no sense|puzzl\w*|unclear)\b/i, 'confused', 1.1],
  [/\b(think\w*|thought|wonder\w*|idea|decid\w*|figure[ds]?|realiz\w*|remember\w*|what if|considered|puzzle)\b/i, 'thinking', 1.0],
  [/\b(surpris\w*|unexpected|twist|wow|whoa|turns? out|but then|until one|out of the blue)\b/i, 'surprised', 1.1],
  [/\b(smug|boast\w*|cocky|arrogant|smirk\w*|showed off|rival)\b/i, 'smug', 1.0],
];

/** The feeling of one sentence: { emo, k } or null when the words give no clear feeling. */
export function detectEmotion(sentence) {
  const s = String(sentence || '');
  if (!s.trim()) return null;
  const score = {};
  for (const [re, emo, w] of LEXICON) {
    const hits = s.match(new RegExp(re.source, 'gi'));
    if (hits) score[emo] = (score[emo] || 0) + w * Math.min(2, hits.length);
  }
  let best = null, bv = 0;
  for (const [emo, v] of Object.entries(score)) if (v > bv + 1e-9) { best = emo; bv = v; }
  const bang = /!/.test(s), q = /\?/.test(s);
  if (!best) {
    if (q) return { emo: /\b(why|how|what)\b/i.test(s) ? 'curious' : 'thinking', k: .9 };
    if (bang) return { emo: 'excited', k: .9 };
    return null;
  }
  let k = cl(.75 + bv * .12, .6, 1.25);
  if (bang) k = Math.min(1.45, k + .2);
  return { emo: best, k: r2(k) };
}

/** Scene mood (the m: word of a beat) -> a background feeling. */
const MOOD_FEEL = {
  tense: ['worried', .8], dark: ['worried', .8], storm: ['scared', .7], cold: ['deadpan', .8], rain: ['sad', .65], night: ['calm', .8], warm: ['calm', .6], fire: ['pain', 1], hot: ['pain', .9], danger: ['scared', .9], horror: ['scared', 1],
  hype: ['excited', .85], calm: ['calm', .8], space: ['awe', .8], city: null, sad: ['sad', .8], happy: ['happy', .8], scary: ['scared', .8], angry: ['angry', .8],
};
export function moodFeeling(mood) {
  const f = MOOD_FEEL[String(mood || '').toLowerCase()];
  return f ? { emo: f[0], k: f[1] } : null;
}

const splitSentences = (text) => String(text || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+(?=[A-Z"'“‘(0-9])/).map((s) => s.trim()).filter(Boolean);

// how the person who is NOT speaking feels about what is being said
const LISTEN = {
  angry: 'worried', furious: 'scared', annoyed: 'nervous', scheming: 'suspicious', smug: 'annoyed', sad: 'worried', crying: 'worried', happy: 'happy', excited: 'happy', laughing: 'happy',
  proud: 'happy', shocked: 'shocked', scared: 'worried', worried: 'worried', suspicious: 'nervous', determined: 'hopeful', thinking: 'curious', confused: 'curious', disappointed: 'worried',
  love: 'happy', awe: 'awe', surprised: 'surprised', embarrassed: 'curious', disgusted: 'disgusted', tired: 'worried', pain: 'worried',
};

/** Writes the feeling of every sentence onto the time it is spoken. [{t, emo, k}] or [] when the scene gives nothing. */
export function trackFromNarration(narration, dur, mood, situation = null) {
  const total = Math.max(0.8, num(dur, 5));
  const sents = splitSentences(narration);
  const base = situation || moodFeeling(mood);
  const segs = [];
  if (sents.length) {
    const words = sents.map((s) => Math.max(1, s.split(/\s+/).length));
    const sum = words.reduce((a, b) => a + b, 0);
    const t0 = Math.min(0.2, total * .06), span = Math.max(0.6, total - t0 - Math.min(0.35, total * .08));
    let acc = 0;
    sents.forEach((s, i) => {
      const start = t0 + (acc / sum) * span;
      acc += words[i];
      const f = detectEmotion(s) || base;
      segs.push({ t: Math.max(0, i === 0 ? 0 : start - 0.2), emo: f ? f.emo : 'neutral', k: f ? f.k : 1 });
    });
  } else if (base) {
    segs.push({ t: 0, emo: base.emo, k: base.k });
  }
  // hold a feeling for at least a second, and merge repeats
  const out = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.emo === s.emo) { last.k = Math.max(last.k, s.k); continue; }
    if (last && s.t - last.t < 0.9 && out.length > 0) { if (s.emo !== 'neutral') { last.emo = s.emo; last.k = s.k; } continue; }
    out.push({ ...s });
  }
  if (out.length) out[0].t = 0;
  return out.every((s) => s.emo === 'neutral') ? [] : out;
}

const POSITIVE = new Set(['happy', 'excited', 'laughing', 'proud', 'love', 'calm', 'relieved', 'hopeful', 'smug', 'scheming', 'awe', 'bored', 'neutral']);
const NEGATIVE = new Set(['pain', 'scared', 'shocked', 'sad', 'crying', 'angry', 'furious', 'worried', 'disgusted']);
const JOY = /\b(laugh\w*|smil\w*|grin\w*|happ\w*|joy\w*|celebrat\w*|cheer\w*|excit\w*|love[ds]?|proud|relie\w+|safe at last|enjoy\w*|fun|delight\w*|unbothered|calmly|didn'?t care|loved it)\b/i;
/** What is happening in the scene, read from its set and the things drawn in it (a fire, a storm, a monster): {emo,k} or null. */
export function situationOf(sc) {
  if (!sc || typeof sc !== 'object') return null;
  const bits = [];
  if (typeof sc.background === 'string') bits.push(sc.background.slice(0, 4000));
  if (Array.isArray(sc._things)) bits.push(sc._things.join(' '));
  for (const p of sc.props || []) if (p && typeof p === 'object') { if (p._creature) bits.push('creature:' + p._creature + (p.follow ? ' chase' : '')); if (p._key) bits.push(String(p._key)); }
  const s = bits.join(' ').toLowerCase();
  const m = String(sc.mood || '').toLowerCase();
  if (/\b(fire|flame|lava|inferno|burning|blaze|ember)/.test(s) || /fire|hot|lava/.test(m)) return { emo: 'pain', k: 1.15 };
  if (/creature:(lion|tiger|wolf|bear|dog|crocodile|dinosaur|dragon|shark|snake|spider|leopard)[^ ]* chase/.test(s)) return { emo: 'scared', k: 1.2 };
  if (/\b(monster|zombie|ghost|explosion)/.test(s)) return { emo: 'scared', k: 1.1 };
  return null;
}
function sentenceTimes(narration, dur) {
  const sents = splitSentences(narration), total = Math.max(.8, num(dur, 5));
  const words = sents.map((x) => Math.max(1, x.split(/\s+/).length)), sum = words.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return sents.map((text, i) => { const t0 = (acc / sum) * total; acc += words[i]; return { text, t0: i === 0 ? 0 : t0 - .2, t1: i === sents.length - 1 ? total + 1 : (acc / sum) * total - .2 }; });
}

const isBackground = (c) => !c || c.far === true || num(c.par, 0) < 0 || num(c.scale, .85) < 0.5 || c.hidden === true;
const isTalker = (c) => c && (c.talk === true || (Array.isArray(c.talk) && c.talk.length > 0));

/**
 * Prepares every scene's faces, in place. Returns { explicit, auto } = how many characters got a track.
 *  - A face:'...' (or feel) the AI wrote is compiled for the scene's length.
 *  - Anyone else who is on screen and big enough gets a track written from what the narration says: the speaker acts the sentence,
 *    the others react to it a moment later. Where the words give nothing, the mood of the scene decides. If there is still nothing,
 *    the person simply keeps the resting face.
 */
export function directFaces(SC, opts = {}) {
  const res = { explicit: 0, auto: 0, dropped: 0, corrected: 0 };
  if (!Array.isArray(SC)) return res;
  const autoOn = opts.auto !== false;
  for (const sc of SC) {
    if (!sc || typeof sc !== 'object' || !Array.isArray(sc.characters)) continue;
    const dur = Math.max(0.8, num(sc.duration, 5));
    const chars = sc.characters.filter((c) => c && typeof c === 'object');
    for (const c of chars) {
      const spec = c.feel !== undefined && typeof c.feel !== 'function' ? c.feel : (typeof c.face !== 'function' && c.face !== undefined && typeof c.face !== 'boolean' ? c.face : undefined);
      if (spec === undefined || spec === null || spec === '') continue;
      const tr = parseFaceTrack(spec, dur);
      if (tr.length) { c._feelTrack = tr; res.explicit++; } else res.dropped++;
    }
    if (!autoOn) continue;
    const narration = sc.narration || sc.say || (Array.isArray(sc.captions) ? sc.captions.map((x) => (x && x.text) || '').join(' ') : '');
    const mood = sc.mood || sc.m || '';
    const situ = situationOf(sc);
    const lead = trackFromNarration(narration, dur, mood, situ);
    // THE FACE MUST FIT THE SITUATION: a feeling the file wrote that contradicts what is happening (a smile while walking through fire,
    // a happy face while being chased) is replaced by the situation's feeling, unless the words themselves say this person is happy
    const sentences = sentenceTimes(narration, dur);
    for (const c of chars) {
      if (!(c._feelTrack && c._feelTrack.length) || isBackground(c)) continue;
      const nm = String(c._who || (c.look && c.look.name) || '').toLowerCase();
      const fixed = c._feelTrack.map((seg, i) => {
        if (!POSITIVE.has(seg.emo)) return seg;
        const end = i + 1 < c._feelTrack.length ? c._feelTrack[i + 1].t : dur;
        const mid = (seg.t + Math.min(end, dur)) / 2;
        const sent = sentences.find((x) => mid >= x.t0 && mid < x.t1) || sentences[sentences.length - 1] || null;
        const f = sent ? detectEmotion(sent.text) : null;
        const bad = f && NEGATIVE.has(f.emo) ? f : (situ && NEGATIVE.has(situ.emo) ? situ : null);
        if (!bad) return seg;
        const joy = sent && JOY.test(sent.text) && (!nm || sent.text.toLowerCase().indexOf(nm) >= 0 || chars.filter((x) => !isBackground(x)).length === 1);
        if (joy) return seg;
        const villain = seg.emo === 'smug' || seg.emo === 'scheming' || (seg.emo === 'laughing' && nm && sent && sent.text.toLowerCase().indexOf(nm) < 0);
        if (villain) return seg;
        res.corrected++;
        return { ...seg, emo: bad.emo, k: Math.max(seg.k, bad.k) };
      });
      c._feelTrack = fixed;
    }
    if (!lead.length) continue;
    const eligible = chars.filter((c) => !isBackground(c) && !(c._feelTrack && c._feelTrack.length) && !(c.hide === true));
    if (!eligible.length) continue;
    const all = chars.filter((c) => !isBackground(c));
    const speaker = all.find(isTalker) || all[0];
    for (const c of eligible) {
      if (c === speaker || all.length === 1) {
        c._autoFeel = lead.map((s) => ({ ...s }));
      } else {
        // listeners react a beat later, to what the speaker is feeling, with their own (softer) face
        c._autoFeel = lead.map((s, i) => ({ t: i === 0 ? 0 : s.t + .3, emo: LISTEN[s.emo] || (s.emo === 'neutral' ? 'neutral' : 'curious'), k: r2(Math.max(.4, s.k * .8)) }));
      }
      res.auto++;
    }
  }
  return res;
}

// ---------------------------------------------------------------------------------------------------------
// What the AI is told
// ---------------------------------------------------------------------------------------------------------
export const EXPRESSION_MARKER = 'FACIAL ACTING';

/** The block added to every prompt sent to an AI model. */
export function expressionRule(style = 'original') {
  const list = EMOTION_NAMES.join(', ');
  return `${EXPRESSION_MARKER} (very important: the face tells the story even with the sound off):
- A person's face must CHANGE with what is happening to them, many times in one film. Never leave one expression running through a whole scene, and never through the whole film. brow:/mouth:/expression: only set the RESTING face; face: is what makes it act.
- Give every main person a face track on their actor, written like their moves: face:'emotion:strength@second->emotion@second'. Strength is optional: 0.3 a hint, 1 normal, 1.5 extreme.
  In a beat():   ['hero','react:shock@0->idle@2.4',[540,700],[790,800],{face:'worried@0->shocked:1.3@1.6->angry@3.4'}]
  In a scene file: characters:[{look:CAST.hero, x:540, ground:800, face:'worried@0->shocked@1.6->angry@3.4', animate:t=>{ idle(t); }}]   (inside animate you can also call feel(t,'shocked'))
- EMOTIONS (use ONLY these words): ${list}.
1. Read the narration sentence by sentence and put the feeling of each sentence on the speaker's face as it is said: a hook is shocked or worried, a failure is sad or disappointed, a win is excited then proud, a lie is suspicious, a plan is scheming, a refusal is determined.
2. Every beat longer than 4 seconds has at least two different emotions, and every turn of the story (setup, problem, twist, decision, payoff) gets a new one. A face may hold for more than 3 seconds only when the moment is truly still.
3. Build arcs, not jumps: worried -> scared -> shocked, or hopeful -> disappointed -> determined. Start the new face about 0.2 seconds BEFORE the word that causes it.
4. Everyone in the shot has a face and they are never identical: the speaker acts the words, the listener REACTS (the boss is smug while the hero is nervous; the crowd is awe, then excited). Two people share an emotion only when the story says so.
5. The face agrees with the body and the words: react:shock with shocked, cheer with excited, walking home in the rain with sad or tired. Put the biggest changes in close-ups (c:'pushFace').
6. Never a smile on a sad moment, never a frown on a joke. The viewer must understand the feeling with the sound off.`;
}
