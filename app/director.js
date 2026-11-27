// The film's director: what the narrator says decides where the camera is and where people stand, second by second.
//
// The AI writes the story; this module makes sure the picture follows the words even when the file's own camera is a static shot.
//   directScenes(SC, {probe})   for every scene: (1) entrances: a person the narration says walks in or comes over arrives at the right moment
//                               instead of standing there from the first frame, (2) a camera that cuts to what each phrase is about:
//                               "she walked into the room"      feet, then the walk followed from the front
//                               "and saw the demons"            her face, then the thing she sees
//                               "she picked up the mop"         the hands
//                               "she struck the demon"          wind-up, then both of them, with a shake on the hit
//                               "the demon screamed"            snap close-up on the face
//   directorRule()              the short block added to every prompt sent to an AI model
//
// Only static cameras are replaced: a scene whose file already moves the camera (zoom, pan or tilt) keeps its own.
// Everything is a pure function of the scene clock (no randomness), so the preview and the exported video match frame for frame.
// No regex look-behind anywhere (older iPhones cannot read it).

import { parseShots, shotCamera, frameShot } from './shots.js';
import { creatureHeight } from './creatures.js';

const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (v) => Math.round(v * 100) / 100;
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (u) => { u = cl(u, 0, 1); return u * u * (3 - 2 * u); };
const easeOut = (u) => { u = cl(u, 0, 1); return 1 - (1 - u) * (1 - u) * (1 - u); };

export const DIRECTOR_MARKER = 'SHOT BY SHOT';

// ---------------------------------------------------------------------------------------------------------
// Reading the narration: what happens, and when it is said
// ---------------------------------------------------------------------------------------------------------
// Checked in this order inside one sentence; every verb found becomes an event, in the order it is said.
const KINDS = [
  ['shout', /\b(scream|shout|yell|roar|howl|shriek|bellow|wail|groan|screech|cried out|cry out)\w*/gi],
  ['strike', /\b(struck|strike[sd]?|striking|hit|hits|hitting|swung|swing|swings|punch|kick|slam|smash|stab|slash|whack|bash|thrash|chop|hurl|threw|throw|attack)\w*/gi],
  ['fall', /\b(fell|fall|falls|collaps|tripp|slipp|crash|tumbl|knocked down)\w*/gi],
  ['see', /\b(saw|sees|seeing|noticed|notice|spotted|spot|stared|looked|looks|watched|glanced|gazed|heard|hear|realiz|discover|froze|gasp|found out|came face to face|eyes widened)\w*/gi],
  ['hands', /\b(picked|pick|grabbed|grab|took|take|held|holds|lifted|lift|raised|raise|opened|opens|reached|clutch|gripp|grip|wield|carried|carry|pressed|poured|typed|wrote|drew|knocked)\w*/gi],
  ['enter', /\b(walk|enter|came in|came into|stepped|step into|arriv|ran|run into|rush|march|climb|crept|creep|sneak|approach|headed|burst|stroll|wander|went into|went to|moved)\w*/gi],
  ['reveal', /\b(appear|emerg|suddenly|there stood|revealed|rose from|rising|behind her|behind him)\w*/gi],
  // size and power words: the camera looks UP at the big one (low angle) or DOWN at the small one (high angle), like a film would
  ['loom', /\b(hefty|huge|giant|gigantic|towering|tower|massive|enormous|muscular|burly|beefy|mighty|hulking|colossal|monstrous)\w*/gi],
  ['small', /\b(tiny|helpless|alone|trapped|powerless|outnumbered|small and|so small|little girl|little boy|cornered)\w*/gi],
];
const INTO = /\b(into|in the|entered|enter|arrived|arrive|burst in|came in|came into|walked in|stepped in|through the door)\b/i;

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

/**
 * The moments a narration calls for: [{t, kind, verb, at, sentence}] with t in seconds from the scene start, in the order they are said.
 * Two events of the same kind closer than 6 letters are one (a verb group like "walked and walked").
 */
export function narrationEvents(text, dur, opts = {}) {
  const D = Math.max(.8, num(dur, 5));
  const first = .15, last = Math.max(first + .5, D - .3);
  const out = [];
  for (const sp of sentenceSpans(text)) {
    const found = [];
    for (const [kind, re] of KINDS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(sp.text))) {
        if (found.some((f) => Math.abs(f.at - m.index) < 6 && f.kind === kind)) continue;
        found.push({ kind, at: m.index, verb: m[0].toLowerCase() });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
    found.sort((a, b) => a.at - b.at);
    // "she saw it hit the wall": keep at most 4 events per sentence, and drop a repeat of the same kind right after itself
    let prev = null, n = 0;
    for (const f of found) {
      if (n >= 4) break;
      if (prev && prev.kind === f.kind) continue;
      const share = sp.from + (sp.to - sp.from) * (f.at / Math.max(1, sp.text.length));
      out.push({ t: r2(cl(first + share * (last - first), first, last)), kind: f.kind, verb: f.verb, at: f.at, sentence: sp.text, subject: opts.subjectOf ? opts.subjectOf(sp.text, f.at) : null, object: opts.objectOf ? opts.objectOf(sp.text, f.at) : null });
      prev = f; n++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Who is who
// ---------------------------------------------------------------------------------------------------------
const bgOf = (c) => !c || c.hide === true || num(c.par, 0) < 0 || num(c.scale, .85) < .5;
const talkerOf = (c) => c && (c.talk === true || (Array.isArray(c.talk) && c.talk.length > 0));
const nameOf = (c) => String((c && (c._who || (c.look && c.look.name) || c.name)) || '').toLowerCase();

function castOf(sc) {
  return (sc.characters || []).filter((c) => c && typeof c === 'object' && !bgOf(c));
}

function makeFinders(cast) {
  const mentions = (head) => {
    let best = null, pos = -1;
    for (const c of cast) {
      const w = nameOf(c);
      if (w.length < 3) continue;
      const stem = w.length > 4 ? w.slice(0, w.length - 1) : w;   // "demon" also finds "demons"
      const i = head.lastIndexOf(stem);
      if (i > pos) { pos = i; best = c; }
    }
    return best;
  };
  const subjectOf = (sentence, at) => {
    const head = sentence.slice(0, Math.max(0, at)).toLowerCase();
    const named = mentions(head);
    if (named) return named;
    const pr = /\b(she|her)\b/.test(head) ? 'female' : /\b(he|his|him)\b/.test(head) ? 'male' : '';
    if (pr) {
      const same = cast.filter((c) => String((c.look && c.look.gender) || '').toLowerCase() === pr);
      if (same.length === 1) return same[0];
    }
    return null;
  };
  const objectOf = (sentence, at) => {
    const tail = sentence.slice(Math.max(0, at)).toLowerCase();
    let best = null, pos = 1e9;
    for (const c of cast) {
      const w = nameOf(c);
      if (w.length < 3) continue;
      const i = tail.indexOf(w.length > 4 ? w.slice(0, w.length - 1) : w);
      if (i >= 0 && i < pos) { pos = i; best = c; }
    }
    return best;
  };
  return { subjectOf, objectOf };
}

// ---------------------------------------------------------------------------------------------------------
// Entrances: people arrive when the narration says they come
// ---------------------------------------------------------------------------------------------------------
/** Where a person is at scene time t because of an entrance: {x,y,moving,t0,t1,x0,x1} or null when no entrance applies at that time. */
export function autoMoveAt(list, t) {
  if (!Array.isArray(list) || !list.length) return null;
  const m = list[0];
  if (t < m.t0) return { x: m.x0, y: m.y, moving: false, t0: m.t0, t1: m.t1, x0: m.x0, x1: m.x1 };
  if (t >= m.t1) return { x: m.x1, y: m.y, moving: false, t0: m.t0, t1: m.t1, x0: m.x0, x1: m.x1 };
  const k = (t - m.t0) / Math.max(.05, m.t1 - m.t0), p = k + (k * k * (3 - 2 * k) - k) * .35;
  return { x: m.x0 + (m.x1 - m.x0) * p, y: m.y, moving: true, t0: m.t0, t1: m.t1, x0: m.x0, x1: m.x1 };
}

function isStatic(c, probe, dur) {
  const xs = [];
  for (let i = 0; i <= 8; i++) {
    const p = probe(c, dur * i / 8);
    if (p && p.walking) return false;
    xs.push(p ? p.x : 800);
  }
  return Math.max(...xs) - Math.min(...xs) < 40;
}

export function directStaging(SC, opts = {}) {
  const res = { moves: 0 };
  const probe = opts.probe;
  if (!Array.isArray(SC) || typeof probe !== 'function') return res;
  for (const sc of SC) {
    if (!sc || typeof sc !== 'object' || !Array.isArray(sc.characters) || sc.autoStage === false) continue;
    const dur = Math.max(.8, num(sc.duration, 5));
    const cast = castOf(sc);
    if (!cast.length) continue;
    const narration = sc.narration || sc.say || (Array.isArray(sc.captions) ? sc.captions.map((x) => (x && x.text) || '').join(' ') : '');
    const { subjectOf, objectOf } = makeFinders(cast);
    const speaker = cast.find(talkerOf) || cast[0];
    for (const ev of narrationEvents(narration, dur, { subjectOf, objectOf })) {
      if (ev.kind !== 'enter') continue;
      const c = ev.subject || (cast.length === 1 ? speaker : null);
      if (!c || c._autoMove || c.noAutoMove === true || Array.isArray(c.show)) continue;
      let static_ = false;
      try { static_ = isStatic(c, probe, dur); } catch (e) { static_ = false; }
      if (!static_) continue;
      const p0 = probe(c, 0) || { x: 800, y: 790 };
      const x1 = num(p0.x, 800), y = num(p0.y, 790);
      const into = INTO.test(ev.sentence);
      if (!into && ev.t > 1.4) continue;                       // "walked to the table" later in a scene: no safe starting place, leave them
      const side = x1 >= 800 ? 1 : -1;
      const x0 = into ? x1 + side * 760 : x1 - side * 340;
      const t0 = r2(Math.max(0, ev.t - .25));
      const t1 = r2(Math.min(dur - .3, t0 + cl(Math.abs(x1 - x0) / 300, 1.3, 3.2)));
      if (t1 - t0 < .8) continue;
      c._autoMove = [{ t0, t1, x0, x1, y, into }];
      res.moves++;
    }
  }
  return res;
}

// ---------------------------------------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------------------------------------
const H0 = 640;            // a standing person, in scene units at scale 1 (feet on the ground line)

const styleOf = (c, base) => {
  if (c && c.custom != null) return 'custom';
  const v = String((c && (c.style || c.type)) || base || '').toLowerCase();
  if (/human/.test(v)) return 'human';
  if (/doodle/.test(v)) return 'doodle';
  if (/stick/.test(v)) return 'stickman';
  if (/custom|builder|pack/.test(v)) return 'custom';
  return 'original';
};
function sampleTracks(cast, probe, dur, base, map) {
  const step = .1, n = Math.ceil(dur / step) + 1;
  return cast.map((c) => {
    const st = styleOf(c, base);
    const a = [];
    for (let i = 0; i < n; i++) {
      const t = Math.min(dur, i * step);
      let p = null;
      try { p = probe(c, t); } catch (e) { p = null; }
      const am = autoMoveAt(c._autoMove, t);
      let q = { x: am ? am.x : num(p && p.x, 800), y: am ? am.y : num(p && p.y, 790), s: num(p && p.s, .85) };
      if (typeof map === 'function') { try { const m = map(c, q); if (m && Number.isFinite(+m.x)) q = { x: +m.x, y: num(m.y, q.y), s: num(m.s, q.s) }; } catch (e) { /* keep the plain position */ } }
      a.push(q);
    }
    return { c, a, step, st };
  });
}
const posOf = (tr, t) => {
  const f = cl(t / tr.step, 0, tr.a.length - 1), i = Math.floor(f), j = Math.min(tr.a.length - 1, i + 1), k = f - i;
  const p = tr.a[i], q = tr.a[j];
  return { x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k), s: lerp(p.s, q.s, k), st: tr.st };
};
const faceY = (p) => p.y - H0 * p.s * .86;
const bodyY = (p) => p.y - H0 * p.s * .55;
const feetY = (p) => p.y - H0 * p.s * .16;

/** The camera of one shot at progress u (0..1 of the shot) and scene time t. Returns {x,y,z,rot}. */
function shotCam(sh, u, t, T) {
  const P = (tr) => posOf(tr, t);
  const s = sh.subj ? P(sh.subj) : null;
  const o = sh.obj ? P(sh.obj) : null;
  const centre = () => {
    const xs = T.map((tr) => P(tr).x);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, span: Math.max(...xs) - Math.min(...xs) };
  };
  switch (sh.kind) {
    case 'establish': { const c = centre(); return { x: c.x, y: 470, z: lerp(1.02, 1.12, u), rot: 0 }; }
    case 'enter': {
      // her feet first, then the walk followed
      if (!s) { const c = centre(); return { x: c.x, y: 470, z: 1.1, rot: 0 }; }
      const w = smooth((u - .3) / .3);
      return { x: s.x + (u < .5 ? 0 : 40), y: lerp(feetY(s), bodyY(s), w), z: lerp(1.95, 1.3, w), rot: 0 };
    }
    case 'see': {
      if (!s) { const c = centre(); return { x: c.x, y: 470, z: 1.15, rot: 0 }; }
      if (u < .5 || !o) return { x: s.x, y: faceY(s), z: lerp(2.2, 2.5, u / .5), rot: 0 };
      const w = easeOut((u - .5) / .12);
      return { x: lerp(s.x, o.x, w), y: lerp(faceY(s), bodyY(o) - 20, w), z: lerp(2.4, 1.55, w), rot: 0 };
    }
    case 'hands': {
      if (!s) { const c = centre(); return { x: c.x, y: 470, z: 1.3, rot: 0 }; }
      return { x: s.x + 20, y: bodyY(s) + 25, z: lerp(1.8, 2.1, u), rot: 0 };
    }
    case 'strike': {
      if (!s) { const c = centre(); return { x: c.x, y: 470, z: 1.2, rot: 0 }; }
      const v = o || null;
      if (u < .45) return { x: s.x, y: bodyY(s) - 40, z: lerp(1.5, 1.75, u / .45), rot: 0 };
      const mx = v ? (s.x + v.x) / 2 : s.x, span = v ? Math.abs(s.x - v.x) : 0;
      const z = cl(1100 / (span + 420), 1.15, 1.6), tt = (u - .45) * (sh.d || 1);
      const shake = tt >= 0 ? Math.exp(-tt * 7) * Math.sin(tt * 52) : 0;
      const push = smooth((u - .7) / .3);
      return { x: lerp(mx, v ? v.x : mx, push) + shake * 16, y: lerp(bodyY(s) - 30, v ? faceY(v) + 60 : bodyY(s), push) + shake * 9, z: lerp(z, v ? 1.9 : z, push), rot: shake * 1.6 };
    }
    case 'shout': {
      if (!s) { const c = centre(); return { x: c.x, y: 470, z: 1.3, rot: 0 }; }
      const tt = u * (sh.d || 1), shake = Math.exp(-tt * 5) * Math.sin(tt * 46);
      return { x: s.x + shake * 5, y: faceY(s), z: lerp(2.7, 2.9, u), rot: shake * .8 };
    }
    case 'fall': {
      if (!s) { const c = centre(); return { x: c.x, y: 470, z: 1.2, rot: 0 }; }
      const k = smooth(u * 1.4);
      return { x: s.x, y: lerp(bodyY(s), s.y - H0 * s.s * .25, k), z: lerp(1.35, 1.5, k), rot: lerp(0, (s.x < 800 ? -1 : 1) * 4, k) };
    }
    case 'reveal': { const c = centre(); return { x: c.x, y: 480, z: lerp(1.0, 1.1, u), rot: 0 }; }
    case 'loom': case 'small': {
      // feet first, then up the body of the big one (tilt up), or the small one seen from above
      const who = (n) => (n === 'a' ? (sh.subj ? P(sh.subj) : null) : null);
      const p = who('a');
      if (!p) { const c = centre(); return { x: c.x, y: 470, z: 1.1, rot: 0 }; }
      const kind = sh.kind === 'small' ? 'high' : (u < .55 ? 'tiltup' : 'low');
      const uu = sh.kind === 'small' ? u : (u < .55 ? u / .55 : (u - .55) / .45);
      const f = frameShot({ kind, who: 'a', t0: 0, t1: sh.d || 1 }, uu, t, () => p, () => T.map((tr) => P(tr)));
      return { x: f.x, y: f.y, z: f.z, rot: f.rot };
    }
    default: {   // 'talk' / 'mid': a medium close-up of whoever the sentence is about, slowly pushing in
      if (!s) { const c = centre(); return { x: c.x, y: 470, z: lerp(1.05, 1.14, u), rot: 0 }; }
      return { x: s.x, y: lerp(faceY(s), bodyY(s), .45), z: lerp(1.4, 1.58, u), rot: 0 };
    }
  }
}
const SNAP = { loom: .12, small: .2, strike: .1, shout: .07, see: .16, hands: .2, enter: .3, fall: .14, reveal: .3, talk: .35, mid: .35, establish: .4 };

/** A camera function for one scene from its shot list. shots = [{t0,t1,kind,subj,obj}] covering the scene in order. */
export function buildCamera(shots, tracks) {
  const at = (sh, t) => shotCam({ ...sh, d: sh.t1 - sh.t0 }, cl((t - sh.t0) / Math.max(.05, sh.t1 - sh.t0), 0, 1), t, tracks);
  return (t) => {
    let i = 0;
    while (i < shots.length - 1 && t >= shots[i + 1].t0) i++;
    const sh = shots[i];
    let c = at(sh, t);
    if (i > 0) {
      const tr = SNAP[sh.kind] || .3, k = smooth((t - sh.t0) / tr);
      if (k < 1) { const p = at(shots[i - 1], Math.min(shots[i - 1].t1, sh.t0)); c = { x: lerp(p.x, c.x, k), y: lerp(p.y, c.y, k), z: lerp(p.z, c.z, k), rot: lerp(p.rot, c.rot, k) }; }
    }
    return { zoom: cl(c.z, 1, 3), x: c.x, y: c.y, rot: c.rot };
  };
}

function cameraIsStatic(sc, dur) {
  const cam = sc.camera;
  if (cam === undefined || cam === null || cam === false) return true;
  if (typeof cam !== 'function') return true;
  let zs = [], xs = [], ys = [], rs = [];
  for (let i = 0; i <= 9; i++) {
    let c = null;
    try { c = cam(dur * i / 9); } catch (e) { return false; }
    c = c || {};
    zs.push(num(c.zoom, 1)); xs.push(num(c.x, 800)); ys.push(num(c.y, 450)); rs.push(num(c.rot, 0));
  }
  const rng = (a) => Math.max(...a) - Math.min(...a);
  return rng(zs) < .15 && rng(xs) < 110 && rng(ys) < 110 && rng(rs) < 1.2;
}

/** Turns narration events into a shot list covering 0..dur. */
export function shotList(events, dur, byChar, cast) {
  const D = Math.max(.8, num(dur, 5));
  const lead = { see: .12, strike: .3, shout: .1, hands: .2, enter: .2, fall: .15, reveal: .15, loom: .2, small: .15 };
  const keep = [];
  for (const e of events) {
    if (!['enter', 'see', 'hands', 'strike', 'shout', 'fall', 'reveal', 'loom', 'small'].includes(e.kind)) continue;
    const t0 = r2(Math.max(0, e.t - (lead[e.kind] || .15)));
    if (keep.length && t0 - keep[keep.length - 1].t0 < .7) continue;       // never cut faster than every 0.7 s
    keep.push({ t0, kind: e.kind, subj: e.subject, obj: e.object });
  }
  const shots = [];
  const talkerK = cast.find(talkerOf) || cast[0];
  if (!keep.length || keep[0].t0 > 1.1) shots.push({ t0: 0, kind: keep.length ? 'establish' : 'talk', subj: keep.length ? null : talkerK, obj: null });
  else if (keep[0].t0 > .05) keep[0].t0 = 0;
  for (const k of keep) shots.push(k);
  shots.forEach((s, i) => { s.t1 = i + 1 < shots.length ? shots[i + 1].t0 : D; });
  // the subject / object are characters; the camera follows their tracks
  // the big one is whoever is drawn biggest other than the person the sentence is about ("she walked past the men, as hefty as they were")
  const biggest = (not) => cast.filter((c) => c !== not).sort((a, b) => num(b.scale, .85) - num(a.scale, .85))[0] || null;
  for (const s of shots) {
    if (s.kind === 'loom') { const big = s.obj && s.obj !== s.subj ? s.obj : biggest(s.subj || talkerK); s.subj = big || s.subj; s.obj = null; }
  }
  for (const s of shots) {
    const sj = s.subj || (s.kind === 'small' || s.kind === 'enter' || s.kind === 'hands' || s.kind === 'see' || s.kind === 'shout' || s.kind === 'strike' || s.kind === 'fall' ? talkerK : null);
    s.subj = sj ? byChar.get(sj) || null : null;
    let ob = s.obj;
    if (!ob && (s.kind === 'strike' || s.kind === 'see')) ob = cast.find((c) => c !== sj && !talkerOf(c)) || cast.find((c) => c !== sj) || null;
    s.obj = ob ? byChar.get(ob) || null : null;
  }
  // a shout is the victim's: when the beat before is a strike, the one who shouts is the one who was hit
  for (let i = 1; i < shots.length; i++) {
    if (shots[i].kind === 'shout' && shots[i - 1].kind === 'strike' && !events.some((e) => e.kind === 'shout' && e.subject)) shots[i].subj = shots[i - 1].obj || shots[i].subj;
  }
  return shots;
}

/**
 * Entrances and camera for every scene. probe(c, t) -> {x, y, s, walking} is how the app asks "where does this person stand at scene time t".
 * Returns {moves, cameras, shots}.
 */
export function directScenes(SC, opts = {}) {
  const res = { moves: 0, cameras: 0, shots: 0 };
  const probe = opts.probe;
  if (!Array.isArray(SC) || typeof probe !== 'function') return res;
  const st = directStaging(SC, opts);
  res.moves = st.moves;
  for (const sc of SC) {
    if (!sc || typeof sc !== 'object' || !Array.isArray(sc.characters) || sc.autoCamera === false) continue;
    const dur = Math.max(.8, num(sc.duration, 5));
    if (dur < 1.6) continue;
    const cast = castOf(sc);
    if (!cast.length) continue;
    const narration = sc.narration || sc.say || (Array.isArray(sc.captions) ? sc.captions.map((x) => (x && x.text) || '').join(' ') : '');
    // the file NAMED its shots (shot:'feet:hero@0->low:guard@"hefty"'): they win over any other camera, framed on the moving people
    const named = sc.shot !== undefined ? sc.shot : sc.shots;
    if (named && (typeof named === 'string' || Array.isArray(named))) {
      const list = parseShots(named, dur, narration);
      if (list.length) {
        const tracks = sampleTracks(cast, probe, dur, opts.style);
        const main = tracks.find((tr) => talkerOf(tr.c)) || tracks[0];
        // animals the app draws (['animal',...]) can be filmed too: shot:'low:lion@0->pov:tunde>dog@2'
        const zoo = (sc.props || []).filter((p) => p && p._creature).map((p) => {
          const a = [], step = .1, n = Math.ceil(dur / step) + 1, h = creatureHeight(p._creature) * num(p.scale, 1) / 598;
          const ft = p.follow ? tracks.find((tr) => nameOf(tr.c) === String(p.follow).toLowerCase()) : null;
          for (let i = 0; i < n; i++) {
            const t = Math.min(dur, i * step); let dx = 0;
            try { const an = typeof p.animate === 'function' ? p.animate(t) : null; dx = num(an && an.x, 0); } catch (e) { dx = 0; }
            if (ft) { const q = posOf(ft, t); a.push({ x: q.x + num(p.fdx, 0) * q.s, y: q.y, s: h * q.s / .84 }); }
            else a.push({ x: num(p.x, 800) + dx, y: num(p.y, 800), s: h });
          }
          return { c: { _who: String(p._who || p._creature) }, a, step, st: 'animal' };
        });
        const find = (name) => {
          const n = String(name || '').toLowerCase().trim();
          if (!n) return main;
          const z = zoo.find((tr) => tr.c._who.toLowerCase() === n || tr.c._who.toLowerCase().indexOf(n) === 0 || n.indexOf(tr.c._who.toLowerCase()) === 0);
          if (z && !tracks.some((tr) => nameOf(tr.c) === n)) return z;
          return tracks.find((tr) => nameOf(tr.c) === n) || tracks.find((tr) => nameOf(tr.c).indexOf(n) === 0 || (nameOf(tr.c) && n.indexOf(nameOf(tr.c)) === 0)) || main;
        };
        // livePos (vertical films): where the person was really drawn in the last frame, when it is this scene and this moment
        const live = typeof opts.livePos === 'function' ? opts.livePos : null;
        if (live) sc._namedLive = true;
        const P = (name, t) => {
          const tr = find(name), p = posOf(tr, t);
          if (live) { const q = live(sc, nameOf(tr.c) || String(name || ''), t); if (q && Number.isFinite(+q.x)) return { x: +q.x, y: num(q.y, p.y), s: num(q.s, p.s), st: p.st }; }
          return p;
        };
        const all = (t) => tracks.filter((tr) => num(tr.c.scale, .85) >= .5 && !(tr.c.par < 0)).map((tr) => posOf(tr, t));
        sc.camera = shotCamera(list, P, all);
        sc._wk = -1;
        sc._named = true;
        sc._directed = list.map((s) => ({ t0: s.t0, t1: s.t1, kind: s.kind, who: s.who }));
        res.cameras++; res.shots += list.length; res.named = (res.named || 0) + list.length;
        continue;
      }
    }
    if (!String(narration).trim()) continue;
    if (!cameraIsStatic(sc, dur)) continue;
    const { subjectOf, objectOf } = makeFinders(cast);
    const events = narrationEvents(narration, dur, { subjectOf, objectOf });
    const tracks = sampleTracks(cast, probe, dur, opts.style);
    const byChar = new Map(tracks.map((tr) => [tr.c, tr]));
    const shots = shotList(events, dur, byChar, cast);
    // an animal the words named (the app's own, ['animal',...]) appears: the camera widens so it is seen, then the story goes on
    for (const p of sc.props || []) {
      if (!p || !p._creature) continue;
      const a = Array.isArray(p.show) ? num(p.show[0], 0) : 0;
      if (a < .3 || a > dur - 1) continue;
      let i = shots.findIndex((x) => x.t0 > a);
      if (i < 0) i = shots.length;
      const prev = shots[i - 1];
      if (prev && Math.abs(prev.t0 - a) < .5) { prev.kind = 'reveal'; continue; }
      shots.splice(i, 0, { t0: r2(a + .05), kind: 'reveal', subj: null, obj: null });
    }
    shots.forEach((x, i) => { x.t1 = i + 1 < shots.length ? shots[i + 1].t0 : dur; });
    if (!shots.length) continue;
    sc.camera = buildCamera(shots, tracks);
    sc._wk = -1;                         // the director follows the action itself: the app's own "follow the walker" would fight it
    sc._directed = shots.map((s) => ({ t0: s.t0, t1: s.t1, kind: s.kind }));
    res.cameras++; res.shots += shots.length;
  }
  return res;
}

// ---------------------------------------------------------------------------------------------------------
// What the AI is told
// ---------------------------------------------------------------------------------------------------------
/** The block added to every prompt sent to an AI model. Short on purpose: the app draws the camera craft, the AI supplies the story. */
export function directorRule() {
  return `${DIRECTOR_MARKER} (the number one rule: the character DOES and SHOWS exactly what the narrator says, in the same second):
- SCENE ORDER: take the narration one scene at a time (scene 1, then scene 2...). Scene 1 shows only what the narrator says in scene 1; only then move to scene 2. Draw anything the words name that the app lacks. You are never limited to a list.
- Cut each scene's narration into beats, one per verb. For EVERY beat write: what the camera shows -> what the person does -> what the other person does in reply. Then build the scene from that list.
- Example. "She walked into the room and saw the demons. She picked up the mop and struck the demon. It screamed." = (1) low shot of her feet and the room as she walks in, camera follows; (2) close-up of her face seeing; (3) cut to the demons; (4) close-up of her hands lifting the mop; (5) wind-up, then both of them in one shot as the mop lands, camera shakes; (6) the demon flinches, then a snap close-up of its face as it screams.
- Camera: NAME the shots on every scene or beat: shot:'feet:her@0->close:her@"saw"->pov:her>demon@"demons"->hands:her@"mop"->two:her+demon@"struck"->crash:demon@"screamed"' (see CINEMATOGRAPHY BY NAME; the app frames each shot on the moving people). Write camera:t=>({zoom,x,y,rot}) only for a special move no shot word covers. Hard cuts, shake only on impacts, never hold one framing over 3 s.
- Position people for the beat: the person who acts walks to the object or the other person (walk(...)) and arrives as the verb is said; whoever is hit reacts the same second (flinch, stagger, fall, shout) and is on screen in that shot. Nobody is in the frame without a reason.
- FACE MATCHES THE ACT: the face is chosen from what the person is going through (walking through fire = pain, fury, grit, never a smile), and every named element (fire, crowd, weather, objects) is drawn in detail in that scene's set.
- CRAFT (real animated shorts): HOOK in 3 s (a problem or striking image); every scene changes something (want, obstacle, worse, turn, payoff), none only talks. PEOPLE TALK: characters say short lines (<12 words) and answer each other (say on every beat); cut to the listener's reaction. ONE ACT + ONE FACE per beat, change the pose each beat. Anticipation (small dip back), fast action, overshoot, settle; arrive with a stop, never slide. Camera: wide to set, medium to talk, close on feeling, push in on the big line, cut every 2-3 s. 9:16: people big, upper two-thirds, captions at the bottom.
- Name each cast member as the narrator does (the demon is 'demon') so the app can tell who the words are about.`;
}
