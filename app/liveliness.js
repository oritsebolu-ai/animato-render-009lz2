// The puppeteer: every person is always performing, even when the file's animate() does nothing.
//
// What a hand-animated film has that a stiff cut-out does not, and what this adds on top of any pose (it only ADDS offsets):
//   - anticipation, overshoot and settle on every gesture (a small dip before the move, a little past the target, then rest)
//   - weight shifts, head turns, glances and leans on a rhythm of their own (each person has a manner: calm, animated, fidgety)
//   - gestures that land on the stressed words while speaking, a head-bob and lean on the emphasis
//   - reactions while listening: nods, leaning in, a glance away, a tilt of doubt on the speaker's strong words
//   - the elbows and hands trail the shoulders a moment (follow-through), so arms never move like one stiff piece
// Pure function of film time (no randomness), so the preview and the exported video match frame for frame.
//
//   ambientPose(k, T, o)  o = { talking, listening, stress 0..1, busy, beat }
//        beat = { t: seconds since the current word started, emph: 0..1 how strong the word is, n: word number in the line, count: words in the line, first: true on the first word }
//   applyAmbient(P, d, w) adds the result to a pose
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const sm = (u) => { u = cl(u, 0, 1); return u * u * (3 - 2 * u); };

/** One move: a small dip (anticipation), a rise that goes a little past (overshoot), a settle, a hold, a release. u = 0..1 */
export function move(u) {
  if (!(u > 0 && u < 1)) return 0;
  if (u < 0.12) return -0.14 * Math.sin((u / 0.12) * Math.PI / 2);
  if (u < 0.34) return -0.14 + 1.28 * sm((u - 0.12) / 0.22);
  if (u < 0.5) return 1.14 - 0.14 * sm((u - 0.34) / 0.16);
  if (u < 0.76) return 1;
  return 1 - sm((u - 0.76) / 0.24);
}

/** A person's manner: 0 calm, 1 animated, 2 fidgety. Stable per person. */
const manner = (k) => Math.floor(hash(k * 3.1 + 5) * 3);
const energyOf = (k) => [0.8, 1.15, 1.0][manner(k)];

// the idle rhythm: every few seconds a new little behaviour begins; which one depends on the person and the moment
const BEHAVE = [
  // 0 shift weight   1 look away   2 open hands   3 one arm out   4 lean in   5 tilt head   6 settle
  [3, 2, 1, 0, 1, 2, 3],   // calm
  [1, 1, 3, 3, 2, 1, 1],   // animated
  [2, 2, 2, 1, 1, 2, 2],   // fidgety
];

export function ambientPose(k, T, o = {}) {
  const ph = hash(k + 1) * 6.283, sp = 0.9 + hash(k + 7) * 0.25, man = manner(k), en = energyOf(k);
  const breath = Math.sin(T * 1.55 * sp + ph);
  const sway = Math.sin(T * 0.42 * sp + ph * 1.7) * 0.6 + Math.sin(T * 0.97 + ph) * 0.4;
  const d = { dy: breath * 2.2, tr: sway * 1.6, hr: Math.sin(T * 0.63 + ph) * 1.8, hx: Math.sin(T * 0.31 + ph * 2) * 0.12, hy: 0, dx: sway * 3.2, sq: 1 + breath * 0.004, a: [0, 0, 0, 0] };
  d.a[0] = breath * 2.2 + sway * 2; d.a[2] = breath * 2.2 - sway * 2;
  if (o.busy) { d.dx = 0; d.a = [0, 0, 0, 0]; d.tr *= 0.3; d.hx *= 0.3; return d; }

  // ----- the idle rhythm (always running, a little stronger when nobody is speaking) -----
  const quiet = o.talking ? 0.55 : 1;
  const L = 2.2 + hash(k + 11) * 1.6 + man * 0.2, off = hash(k + 2) * 5;
  const seg = Math.floor((T + off) / L), u = ((T + off) / L) - seg;
  const pick = Math.floor(hash(seg * 7.31 + k * 3.7) * 7), what = BEHAVE[man][pick % 7];
  const side = hash(seg * 3.3 + k) > 0.5 ? 1 : -1;
  const e = move(u) * en * quiet, lag = move(Math.max(0, u - 0.05)) * en * quiet;      // the hands trail the shoulders
  if (what === 0) { d.dx += side * 12 * e; d.tr += -side * 3.6 * e; d.dy += 2 * Math.abs(e); d.a[0] += side * 6 * lag; d.a[2] += side * 6 * lag; }
  else if (what === 1) { d.hx += side * 0.5 * e; d.hr += side * 3.5 * e; d.tr += side * 1.8 * e; }
  else if (what === 2) { d.a[0] += 34 * e; d.a[2] += 34 * e; d.a[1] += 26 * lag; d.a[3] += 26 * lag; d.hr += 2.4 * e; d.dy += -2 * e; }
  else if (what === 3) { const i = side > 0 ? 0 : 2; d.a[i] += 56 * e; d.a[i + 1] += 34 * lag; d.hr += side * 3 * e; d.tr += side * 2.4 * e; }
  else if (what === 4) { d.tr += 4.4 * e; d.dy += -3.4 * e; d.hy += 0.16 * e; }
  else if (what === 5) { d.hr += side * 6 * e; d.hx += side * 0.18 * e; }

  // ----- speaking: the arms, head and body land on the words -----
  if (o.talking) {
    const st = cl(o.stress == null ? 0.5 : o.stress, 0, 1), b = o.beat;
    let amp = 0, t = 0, n = 0;
    if (b && Number.isFinite(b.t)) {
      // every strong word gets a gesture; plain words only now and then (every third), the first word of a line a small one
      const strong = (b.emph || 0) >= 0.5;
      const every = (b.n % 3 === 0);
      if (strong || every || b.first) { amp = strong ? 0.75 + 0.5 * (b.emph || 0) : b.first ? 0.55 : 0.4; t = b.t; n = b.n; }
    } else {
      // no word timing at all: a beat about every second
      const per = 1.05 + hash(k + 3) * 0.35, uu = ((T + hash(k) * 2) % per) / per;
      amp = 0.6 + st * 0.5; t = uu * 0.9; n = Math.floor((T + hash(k) * 2) / per);
    }
    const g = move(t / 0.85) * amp * en;
    const hand = (n + k) % 2;                 // the hands take turns
    const big = 1 + st * 0.5;
    d.a[hand * 2] += 62 * g * big; d.a[hand * 2 + 1] += 40 * g * big;
    if (amp > 0.7) { d.a[(1 - hand) * 2] += 22 * g; d.a[(1 - hand) * 2 + 1] += 14 * g; }      // a strong word brings the other hand too
    d.dy += -4.5 * g; d.hr += (hand ? 1 : -1) * 4.2 * g; d.tr += (hand ? -1 : 1) * 2.8 * g; d.hy += 0.12 * g;
    d.dx += (hand ? 1 : -1) * 4 * g;
    d.sq += -0.012 * Math.max(0, -move(t / 0.85)) * 3;   // the squash before the beat
    d.hx += Math.sin(T * 1.9 + ph) * 0.18;
  } else if (o.listening) {
    // ----- listening: nods that follow the speaker's strong words, a lean toward them, a glance away now and then -----
    const b = o.beat, strong = b && (b.emph || 0) >= 0.5;
    const nod = Math.max(0, Math.sin(T * 1.25 + ph * 2)) ** 3;
    let react = 0;
    if (b && Number.isFinite(b.t) && (strong || b.first)) react = move(b.t / 0.8) * (strong ? 1 : 0.6);
    d.hr += 2.4 + nod * -3.6 + react * (hash(k + 9) > 0.5 ? 4 : -4);
    d.dy += nod * 2.6 + react * 3.6; d.tr += 1.8 + react * 2.6; d.hy += nod * 0.2 + react * 0.2;
    d.dx += react * 3;
  }
  return d;
}

// adds the offsets to a POSE object (arms are [lu, ll, ru, rl] upper/lower angles)
export function applyAmbient(P, d, w = 1) {
  if (!P || !d) return P;
  for (const k of ['dy', 'tr', 'hr', 'hx', 'hy', 'dx']) P[k] = (+P[k] || 0) + d[k] * w;
  if (d.sq !== undefined) P.sq = (P.sq === undefined ? 1 : +P.sq) + (d.sq - 1) * w;
  const a = Array.isArray(P.a) ? P.a.slice() : [34, -36, 34, -36];
  for (let i = 0; i < 4; i++) a[i] = (+a[i] || 0) + d.a[i] * w;
  P.a = a; return P;
}

/** How strong a spoken word is, 0..1: long words, numbers, SHOUTING, "!" and "?" and the word before a pause. */
export function wordEmphasis(word) {
  const raw = String(word == null ? '' : word), w = raw.replace(/[^A-Za-z0-9']/g, '');
  if (!w) return 0;
  let s = 0;
  if (/[!?]/.test(raw)) s += 0.55;
  if (/[,;:.]$/.test(raw)) s += 0.25;
  if (/\d/.test(w)) s += 0.5;
  if (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)) s += 0.5;
  if (w.length >= 7) s += 0.45; else if (w.length >= 5) s += 0.2;
  if (/^(the|a|an|and|or|but|of|to|in|on|at|is|was|it|he|she|they|we|i|you|that|this|with|for|as|his|her|my|your)$/i.test(w)) s -= 0.5;
  return cl(s, 0, 1);
}

/**
 * The current word as the puppeteer needs it, from activeWordPos(...)'s result (or null) and the line's start time.
 * Returns { t, emph, n, count, first } or null when nobody is speaking.
 */
export function beatFrom(wp, wordSeconds = 0.4) {
  if (!wp || !Array.isArray(wp.words) || !wp.words.length || wp.silent) return null;
  const n = Math.max(0, Math.min(wp.words.length - 1, Math.floor(wp.pos)));
  const u = cl(wp.pos - Math.floor(wp.pos), 0, 1);
  return { t: u * wordSeconds, emph: wordEmphasis(wp.words[n]), n, count: wp.words.length, first: n === 0 };
}

export function livelinessRule() {
  return `ACT, DON'T STAND (the people must feel alive, like a hand-animated short film, never like cut-outs):
- Every beat the narrator says, the person ACTS: gesture with the arms on stressed words, change the face with each new feeling (face:'worried@0->shocked@1.8'), look at who they speak to, react with the body when something happens to them.
- Whoever is listening is never frozen: they nod, lean in, glance away, show surprise or doubt on the face the moment the other person says something that lands.
- Give every person a different manner (one fidgets, one is calm, one over-gestures). Use anticipation before a big move (a small dip first), overshoot on the arrival, and a settle after it.
- Talk with the narration: set the speaking person on each line so the mouth moves with the words, and cut to a close-up on the face for the emotional line.
- The app adds breathing, weight shifts, head turns, glances, beat gestures on the stressed words and listening nods on top, so your job is the BIG acting choices, not the idle motion.`;
}
