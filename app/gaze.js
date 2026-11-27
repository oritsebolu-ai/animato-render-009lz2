// 2.5D head turn: the body stays where it is and faces the camera, but the FACE turns toward the person being talked to.
//
// Nothing here draws. gazeFor() answers one question for one person at one moment: how far has the head turned (yaw, -1 = to the
// screen's left, +1 = to its right, 0 = straight at the camera) and how far has it tipped (pitch)? The renderers then slide the
// eyes, brows, mouth and nose sideways inside the head and squeeze them a little (foreshortening), which reads as depth.
//
// Who looks at whom:
//   - the speaker looks at the person they talk to; listeners look at the speaker (a little less when nobody is talking)
//   - the actor option gaze:'boss' (or 'camera') overrides it, or gaze:'boss@0->camera@3->boss@5' changes it over the beat
//   - now and then a person glances away (toward the camera) for half a second, so nobody stares like a doll
//   - the turn starts a moment BEFORE the speaker's first word and eases in and out; it is smoothed over the last 0.3 s
// Everything is a pure function of the film clock, so the preview and the exported video match frame for frame.

const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const r3 = (v) => Math.round(v * 1000) / 1000;
const hash01 = (n) => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };

/** 'boss@0->camera@3->boss@5' -> [{t, who}] (who is a cast name or 'camera'). A plain 'boss' is one entry at 0. */
export function parseLookTrack(spec) {
  if (spec === undefined || spec === null || spec === false || typeof spec === 'function') return [];
  const out = [];
  for (const part of String(spec).split('->')) {
    const m = /^\s*([a-zA-Z0-9_#-]+)\s*(?:@\s*([\d.]+))?\s*$/.exec(part);
    if (!m) continue;
    out.push({ t: out.length === 0 ? 0 : num(m[2], 0), who: m[1].toLowerCase() });
  }
  return out.sort((a, b) => a.t - b.t);
}

const isBackground = (c) => !c || c.hide === true || num(c.par, 0) < 0 || num(c.scale, .85) < .5;
const isShown = (c, T) => !(Array.isArray(c.show) && (T < num(c.show[0], 0) || T >= num(c.show[1], 1e9)));

function isTalking(c, T, fallback) {
  if (c.talk === true) return true;
  if (Array.isArray(c.talk)) return c.talk.some((r) => Array.isArray(r) ? (T >= num(r[0]) - 0.15 && T < num(r[1])) : false);
  return !!fallback;
}

/**
 * The turn of one person's head at scene time T.
 *   chars  the scene's characters;  i  which one;  T  the scene time
 *   ctx.px[j]      where each person stands (any consistent horizontal number; bigger = further right)
 *   ctx.speakerK   the person who speaks the voiceover when the file marked nobody (or -1)
 *   ctx.noTalkMarks true when no person in the scene is marked as talking
 *   ctx.strength   0..1, how far to turn at most (default .8)
 * Returns {yaw, pitch, who} or null when this person keeps looking at the camera (back view, background, alone).
 */
export function gazeFor(chars, i, T, ctx = {}) {
  const me = chars && chars[i];
  if (!me || typeof me !== 'object' || isBackground(me)) return null;
  const view = String(me.view || 'front');
  if (view === 'back') return null;
  const px = ctx.px || [];
  const strength = cl(num(ctx.strength, .9), 0, 1);
  const track = Array.isArray(me._lookTrack) ? me._lookTrack : [];
  const fallbackFor = (j) => ctx.noTalkMarks && j === ctx.speakerK;

  const targetAt = (t) => {
    const others = [];
    for (let j = 0; j < chars.length; j++) {
      if (j === i) continue;
      const o = chars[j];
      if (!o || typeof o !== 'object' || isBackground(o) || !isShown(o, t) || String(o.view || 'front') === 'back') continue;
      others.push(j);
    }
    let want = null;
    // an order from the file wins
    if (track.length) {
      let cur = track[0];
      for (const s of track) if (t >= s.t) cur = s;
      if (cur.who === 'camera' || cur.who === 'none') return { yaw: 0, weight: 1, who: 'camera' };
      const j = others.find((q) => String(chars[q]._who || '').toLowerCase() === cur.who);
      if (j !== undefined) want = { j, weight: 1 };
    }
    if (!want) {
      if (!others.length) return null;
      const meTalks = isTalking(me, t, fallbackFor(i));
      const talkers = others.filter((j) => isTalking(chars[j], t, fallbackFor(j)));
      const nearest = (list) => list.slice().sort((a, b) => Math.abs(num(px[a]) - num(px[i])) - Math.abs(num(px[b]) - num(px[i])))[0];
      if (meTalks) want = { j: nearest(others), weight: 1 };
      else if (talkers.length) want = { j: nearest(talkers), weight: .9 };
      else want = { j: nearest(others), weight: .5 };
    }
    const dx = num(px[want.j]) - num(px[i]);
    if (Math.abs(dx) < 40) return { yaw: 0, weight: want.weight, who: chars[want.j]._who || '' };
    const mag = cl(.38 + Math.abs(dx) / 900, .38, 1);
    return { yaw: Math.sign(dx) * mag, weight: want.weight, who: chars[want.j]._who || '' };
  };

  // a glance away now and then (toward the camera), different for every person
  const glance = (t) => {
    const P = 3.4 + hash01(i * 7 + 3) * 2.8, ph = hash01(i * 13 + 5) * P, d = .45 + hash01(i * 17 + 1) * .3;
    const m = (t + ph) % P;
    if (m > d) return 0;
    const x = m / d;
    return Math.sin(x * Math.PI);           // 0 -> 1 -> 0
  };

  // smooth over the last 0.3 s (a pure, causal filter), looking slightly ahead of the voice so the turn leads the word
  const N = 7, W = .3;
  let ys = 0, ws = 0, who = '', wsum = 0;
  for (let q = 0; q < N; q++) {
    const age = q / (N - 1) * W;
    const t = Math.max(0, T - age + .1);
    const tg = targetAt(t);
    const wt = 1 - age / (W * 1.4);
    if (!tg) { ws += wt; continue; }
    const g = tg.who === 'camera' ? 0 : glance(t) * .75;
    ys += tg.yaw * tg.weight * (1 - g) * wt; ws += wt; wsum += tg.weight * wt;
    if (q === 0) who = tg.who;
  }
  if (!ws || !wsum) return null;
  const yaw = cl((ys / ws) * strength * (num(me.turn, 1)), -1, 1);
  // a tiny, slow tip of the head so it is never rigid; people looking at someone lift their chin a touch
  const pitch = Math.sin(T * .9 + i * 2.1) * .04 + (Math.abs(yaw) > .3 ? -.03 : 0);
  return { yaw: r3(yaw), pitch: r3(pitch), who };
}

/** Compile the file's gaze:'boss@0->camera@3' orders onto the characters (call once after the scenes are built). */
export function directGaze(SC) {
  let n = 0;
  if (!Array.isArray(SC)) return n;
  for (const sc of SC) {
    if (!sc || !Array.isArray(sc.characters)) continue;
    for (const c of sc.characters) {
      if (!c || typeof c !== 'object') continue;
      const spec = c.gaze !== undefined ? c.gaze : c._gazeSpec;
      if (spec === undefined) continue;
      const tr = parseLookTrack(spec);
      if (tr.length) { c._lookTrack = tr; n++; }
    }
  }
  return n;
}

export const GAZE_MARKER = '2.5D HEAD TURN';
