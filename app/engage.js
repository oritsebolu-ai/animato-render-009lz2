// THE ENGAGEMENT CURVE: no boring second, whatever the AI wrote.
//
// What the research on short-form and YouTube retention keeps finding, and what this module does about it:
//  - The first 3 seconds decide most of a video's reach. -> the film opens on a snap zoom, a person on screen and a hook word on screen.
//  - Attention resets when something changes (a "pattern interrupt"): a new shot, a graphic, a word, a zoom. Top channels change
//    something every 2 to 5 seconds. -> every scene is measured, and any stretch where nothing new appears for too long gets a camera
//    punch-in on a spoken word and, in a long gap, the key word popping on screen.
//  - Viewers drift around 15 s and 30 s. -> a re-hook beat is guaranteed near those marks.
//  - Most people watch on mute and animated, word-by-word captions keep eyes on the screen. -> keyword pops come from the captions.
//  - Faces and the subject must stand out from busy sets. -> close-ups dim and cool the set behind the people (subject separation),
//    like a film's shallow focus, without a costly blur.
//
// engageFilm(SC, opts) changes the scenes in place and returns {score, before, fixes, curve, notes}.
// Everything it adds is a pure function of the scene clock, so the preview and the exported video match frame for frame.
// A scene with engage:false (or movie({engage:false})) is left alone. No look-behind regex (older iPhones).

const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const ez = (u) => { u = cl(u, 0, 1); return 1 - Math.pow(1 - u, 3); };
const sm = (u) => { u = cl(u, 0, 1); return u * u * (3 - 2 * u); };

export const ENGAGE = {
  gap: 3.2,          // seconds without anything new before a punch-in is added
  popGap: 4.6,       // seconds without anything new before the key word also pops on screen
  hookBy: 1.0,       // something must happen by this second of the film
  rehooks: [15, 30, 60],
};

const STOP = new Set('the a an and or but of to in on at for with by from is was were are be been it its this that these those he she they we you i me him her them his their our your my as so then than just very really into out up down over about after before when while what who how why all some any no not do did does have has had will would can could should there here one two'.split(' '));

/** The most striking word of a caption: a number, then a long or emotional word. */
export function keyWord(text, names = []) {
  const skip = new Set((names || []).map((n) => String(n || '').toLowerCase()));
  const words = String(text || '').replace(/[“”"]/g, '').split(/\s+/).map((w) => w.replace(/^[^\w$€£₦#]+|[^\w%]+$/g, '')).filter(Boolean);
  if (!words.length) return '';
  const nums = words.filter((w) => /\d/.test(w));
  if (nums.length) return nums.sort((a, b) => b.length - a.length)[0];
  const content = words.filter((w) => !STOP.has(w.toLowerCase()) && w.length > 2 && !skip.has(w.toLowerCase()));
  if (!content.length) return '';
  const strong = /^(never|always|suddenly|secret|dead|death|money|million|billion|free|love|hate|war|fire|run|ran|stop|truth|lie|alone|danger|win|lost|gone|boom|why|how|life|angry|dog|lion|monster|chase|scream|help|trap|escape)/i;
  return content.find((w) => strong.test(w)) || content.sort((a, b) => b.length - a.length)[0];
}

/** Moments in a scene where something visibly new starts: cuts, props appearing, captions changing, flashes. Sorted, in scene seconds. */
export function sceneEvents(sc) {
  const dur = Math.max(.5, num(sc.duration, 5));
  const ev = [{ t: 0, w: 1, k: 'cut' }];
  if (Array.isArray(sc._directed)) for (const s of sc._directed) if (num(s.t0) > .05) ev.push({ t: num(s.t0), w: 1, k: 'shot' });
  if (typeof sc.camera === 'function' && !(Array.isArray(sc._directed) && sc._directed.length > 1)) {
    let prev = null, acc = 0;
    for (let t = 0; t <= dur; t += .2) {
      let c = null; try { c = sc.camera(t) || null; } catch (e) { c = null; }
      if (!c) continue;
      if (prev) {
        const dz = Math.abs(num(c.zoom, 1) - num(prev.zoom, 1)) / Math.max(.5, num(prev.zoom, 1)), dx = Math.hypot(num(c.x, 800) - num(prev.x, 800), num(c.y, 450) - num(prev.y, 450)) / 900;
        if (dz > .07 || dx > .08) ev.push({ t, w: 1, k: 'camjump' });
        else { acc += dz * 3 + dx * 2; if (acc > .22) { ev.push({ t, w: .5, k: 'move' }); acc = 0; } }
      }
      prev = c;
    }
  }
  for (const p of sc.props || []) {
    if (!p || typeof p !== 'object') continue;
    const a = Array.isArray(p.show) ? num(p.show[0], 0) : 0;
    if (a > .05 && a < dur) ev.push({ t: a, w: p.screen ? 1 : .8, k: 'prop' });
  }
  for (const c of sc.captions || []) if (c && num(c.from, -1) > .05) ev.push({ t: num(c.from), w: .35, k: 'caption' });
  if (typeof sc.flash === 'function') for (let t = .1; t < dur; t += .1) { let v = 0; try { v = +sc.flash(t) || 0; } catch (e) { v = 0; } if (v > .3) { ev.push({ t, w: 1, k: 'flash' }); t += .5; } }
  return ev.filter((e) => e.t <= dur).sort((a, b) => a.t - b.t);
}

/** Quiet stretches: [{t0,t1}] where the weighted change stays below one "new thing" for longer than `gap` seconds. */
export function quietSpans(events, dur, gap = ENGAGE.gap) {
  const out = [];
  let last = 0, acc = 0;
  for (const e of events.concat([{ t: dur, w: 1, k: 'end' }])) {
    acc += e.w;
    if (acc >= 1 || e.k === 'end') {
      if (e.t - last > gap) out.push({ t0: last, t1: e.t });
      last = e.t; acc = 0;
    }
  }
  return out;
}

// ---- what gets added ----
/** A quick camera punch-in at t (8 % in, held, eased back): the editor's "bump" on a stressed word. */
function bumpAt(t, b) {
  const u = t - b.t;
  if (u < 0 || u > b.len + .55) return 1;
  const k = u < .16 ? ez(u / .16) : u < b.len ? 1 : 1 - sm((u - b.len) / .55);
  return 1 + b.amt * k;
}
function wrapCamera(sc, bumps, hook, reveals = []) {
  const base = sc.camera;
  sc.camera = (t) => {
    let c = null;
    try { c = (typeof base === 'function' ? base(t) : base) || null; } catch (e) { c = null; }
    c = c ? { ...c } : { zoom: 1, x: 800, y: 450, rot: 0 };
    // an animal arrives: the camera eases out to show it (and the person beside it), then goes back to the story's own framing
    for (const r of reveals) { const u = t - r; if (u > 0 && u < 2.2) { const k = u < .35 ? sm(u / .35) : u > 1.7 ? 1 - sm((u - 1.7) / .5) : 1; c.zoom = num(c.zoom, 1) + (1.04 - num(c.zoom, 1)) * k; c.y = num(c.y, 450) + (470 - num(c.y, 450)) * k; } }
    let m = 1;
    for (const b of bumps) m *= bumpAt(t, b);
    if (hook && t < .42) m *= 1 + .16 * (1 - ez(t / .42));       // the film opens on a snap zoom
    c.zoom = num(c.zoom, 1) * m;
    return c;
  };
}
const escX = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** The key word slamming onto the screen (top third, away from the captions and most faces). */
export function wordPop(word, t0, t1, { tall = false, accent = '#ffd54a' } = {}) {
  const w = String(word).toUpperCase().slice(0, 18), size = tall ? 92 : Math.max(70, Math.min(112, 900 / Math.max(4, w.length)));
  return {
    screen: true, layer: 'front', x: 800, y: tall ? 250 : 175, show: [t0, t1], _engage: 'pop',
    svg: `<g><text text-anchor="middle" y="${Math.round(size * .34)}" font-size="${Math.round(size)}" font-weight="900" fill="${accent}" stroke="#0b0d12" stroke-width="${Math.round(size / 7)}" paint-order="stroke" stroke-linejoin="round" font-family="Arial Black,Impact,Arial,sans-serif" letter-spacing="1">${escX(w)}</text></g>`,
    animate: (t) => { const k = ez((t - t0) / .22), ov = k < 1 ? 1 + .25 * Math.sin(Math.PI * k) : 1, e = sm((t1 - t) / .22); return { scale: (.55 + .45 * k) * ov, opacity: Math.min(k, e), rot: -2 * (1 - k) }; },
  };
}
/** Close-ups dim the set behind the people a little (drawn first, under every other prop), so the subject pops off a busy background. */
function separation(sc) {
  const cam = sc.camera, mood = String(sc.mood || '').toLowerCase();
  const col = /warm|hype/.test(mood) ? '#2a1408' : /night|dark|space|storm|rain|cold|tense/.test(mood) ? '#050816' : '#0d1220';
  return {
    _engage: 'sep', layer: 'back', x: 800, y: 450,
    svg: `<rect x="-1400" y="-900" width="2800" height="1800" fill="${col}"/>`,
    animate: (t) => { let z = 1; try { const c = typeof cam === 'function' ? cam(t) : cam; z = num(c && c.zoom, 1); } catch (e) { z = 1; } return { opacity: .26 * sm((z - 1.3) / .6), scale: 1 }; },
  };
}

/**
 * The whole film: measure, then fix the quiet stretches. opts: {ar:'16:9'|'9:16', off:false}.
 * Returns {score (0-100, after the fixes), before (the file's own score), fixes:{bumps,pops,hook,rehooks,separation}, curve:[changes per 5 s], notes:[...]}.
 */
export function engageFilm(SC, opts = {}) {
  const res = { score: 0, before: 0, fixes: { bumps: 0, pops: 0, hook: false, rehooks: 0, separation: 0 }, curve: [], notes: [] };
  if (!Array.isArray(SC) || !SC.length) return res;
  const tall = opts.ar === '9:16';
  let T = 0, quietBefore = 0, quietAfter = 0, total = 0;
  const bins = [];
  const addBin = (t, w) => { const i = Math.floor(t / 5); while (bins.length <= i) bins.push(0); bins[i] += w; };
  const starts = [];
  SC.forEach((sc) => { starts.push(T); T += Math.max(.5, num(sc && sc.duration, 5)); });
  total = T;
  // long videos: a re-hook at 15 s, 30 s, 60 s and then every minute, so minute 25 gets the same jolt as second 15
  const marks = ENGAGE.rehooks.slice(); for (let m = 120; m < total - 3; m += 60) marks.push(m);
  const rehookDue = marks.filter((x) => x < total - 3);
  const ACC = ['#ffd54a', '#5ee7ff', '#ff6b9a', '#ffffff', '#9dff6b', '#ffb347'];
  SC.forEach((sc, i) => {
    if (!sc || typeof sc !== 'object') return;
    const dur = Math.max(.5, num(sc.duration, 5)), t0 = starts[i];
    const off = opts.off || sc.engage === false;
    const ev = sceneEvents(sc);
    for (const e of ev) addBin(t0 + e.t, e.w);
    const quiet0 = quietSpans(ev, dur);
    quietBefore += quiet0.reduce((a, q) => a + (q.t1 - q.t0 - ENGAGE.gap), 0);
    if (off || sc.chapter) { quietAfter += quiet0.reduce((a, q) => a + (q.t1 - q.t0 - ENGAGE.gap), 0); return; }
    const caps = (sc.captions || []).filter((c) => c && c.text && num(c.from, -1) >= 0);
    const names = (sc.characters || []).map((c) => c && (c._who || (c.look && c.look.name))).filter(Boolean);
    const bumps = [], pops = [];
    const capIn = (a, b) => caps.filter((c) => num(c.from) > a + .4 && num(c.from) < b - .3);
    // fill, measure again, fill what is still quiet (a few passes)
    for (let pass = 0; pass < 4; pass++) {
    const quiet = pass === 0 ? quiet0 : quietSpans(ev.concat(bumps.map((b) => ({ t: b.t, w: 1 })), pops.map((p) => ({ t: p.show[0], w: 1 }))).sort((a, b) => a.t - b.t), dur);
    if (!quiet.length) break;
    for (const q of quiet) {
      // one punch-in per quiet stretch, on a phrase start (the voice stresses it), every ~2.6 s for long stretches
      const n = Math.max(1, Math.floor((q.t1 - q.t0) / 2.6) - (q.t1 - q.t0 > ENGAGE.popGap ? 1 : 0));
      const cands = capIn(q.t0, q.t1);
      for (let k = 1; k <= n; k++) {
        const ideal = q.t0 + (q.t1 - q.t0) * k / (n + 1);
        const near = cands.length ? cands.reduce((a, c) => (Math.abs(num(c.from) - ideal) < Math.abs(num(a.from) - ideal) ? c : a)) : null;
        const t = near && Math.abs(num(near.from) - ideal) < 1.1 ? num(near.from) : ideal;
        if (bumps.some((b) => Math.abs(b.t - t) < 1.2) || t < .5 || t > dur - .4) continue;
        bumps.push({ t, len: 1.1, amt: .075 });
      }
      if (q.t1 - q.t0 > ENGAGE.popGap && pops.length < 1) {
        const c = cands[Math.floor(cands.length / 2)] || caps.find((x) => num(x.from) <= q.t0 + (q.t1 - q.t0) / 2 && num(x.to) > q.t0) || null;
        const w = c ? keyWord(c.text, names) : '';
        const own = (sc.props || []).filter((p) => p && p.screen && !p._engage).length;
        if (w && own < 2) { const a = c ? Math.max(q.t0 + .3, num(c.from)) : q.t0 + 1; pops.push(wordPop(w, a, Math.min(dur - .2, a + 1.6), { tall, accent: ACC[i % ACC.length] })); }
      }
    }
    }
    // re-hook near 15 s / 30 s / 60 s of the film: a punch-in (and the key word) right there if the stretch is calm
    for (const m of rehookDue) {
      if (m < t0 || m >= t0 + dur) continue;
      const lt = m - t0, busy = ev.some((e) => e.w >= 1 && Math.abs(e.t - lt) < .9) || bumps.some((b) => Math.abs(b.t - lt) < 1);
      if (!busy) { bumps.push({ t: Math.max(.1, Math.min(dur - .6, lt)), len: .9, amt: .11 }); res.fixes.rehooks++; }
    }
    // the hook: the film's first second must change something; open with a snap zoom and the strongest word
    let hook = false;
    if (i === 0) {
      const early = ev.filter((e) => e.t > .05 && e.t <= ENGAGE.hookBy && e.w >= 1);
      if (!early.length) { hook = true; res.fixes.hook = true; }
      const textEarly = (sc.props || []).some((p) => p && p.screen && Array.isArray(p.show) ? num(p.show[0]) < 2 : p && p.screen);
      const first = caps[0];
      if (!textEarly && first && !pops.some((p) => p.show[0] < 2.6)) { const w = keyWord(first.text, names); if (w) pops.unshift(wordPop(w, .25, Math.min(dur - .2, 1.9), { tall })); }
    }
    const reveals = (sc.props || []).filter((p) => p && p._creature && !(p.follow && !p._near && false)).map((p) => (Array.isArray(p.show) ? num(p.show[0], 0) : 0)).filter((a) => a > .2 && a < dur - .8);
    const rv = [...new Set(reveals.map((a) => Math.round(a * 4) / 4))].filter((a, k, arr) => !k || a - arr[k - 1] > 2);
    if (rv.length) { for (let k = bumps.length - 1; k >= 0; k--) if (rv.some((a) => bumps[k].t > a - .3 && bumps[k].t < a + 2.2)) bumps.splice(k, 1); res.fixes.reveals = (res.fixes.reveals || 0) + rv.length; }
    if (bumps.length || hook || rv.length) wrapCamera(sc, bumps, hook, rv);
    if (pops.length) sc.props = (sc.props || []).concat(pops);
    // subject separation in close-ups (only for drawn sets with people)
    if ((sc.characters || []).length && !(sc.props || []).some((p) => p && p._engage === 'sep')) { sc.props = [separation(sc)].concat(sc.props || []); res.fixes.separation++; }
    res.fixes.bumps += bumps.length; res.fixes.pops += pops.length;
    for (const b of bumps) addBin(t0 + b.t, 1);
    for (const p of pops) addBin(t0 + p.show[0], 1);
    const ev2 = ev.concat(bumps.map((b) => ({ t: b.t, w: 1 })), pops.map((p) => ({ t: p.show[0], w: 1 }))).sort((a, b) => a.t - b.t);
    quietAfter += quietSpans(ev2, dur).reduce((a, q) => a + (q.t1 - q.t0 - ENGAGE.gap), 0);
  });
  const score = (quiet) => Math.round(cl(100 - (quiet / Math.max(1, total)) * 160, 0, 100));
  res.before = score(quietBefore);
  res.score = Math.max(res.before, score(quietAfter) - (res.fixes.hook ? 0 : 0));
  res.curve = bins.map((x) => Math.round(x * 10) / 10);
  const f = res.fixes;
  const bits = [];
  if (f.hook) bits.push('a snap-zoom hook on the first second');
  if (f.bumps) bits.push(f.bumps + ' camera punch-in' + (f.bumps > 1 ? 's' : '') + ' on spoken words in quiet moments');
  if (f.pops) bits.push(f.pops + ' key word' + (f.pops > 1 ? 's' : '') + ' on screen');
  if (f.rehooks) bits.push(f.rehooks + ' re-hook' + (f.rehooks > 1 ? 's' : '') + ' at the 15 / 30 / 60 second marks');
  if (bits.length) res.notes.push('Engagement: added ' + bits.join(', ') + '.');
  return res;
}

/** The art-direction block for every prompt: what makes a frame look professional and keeps eyes on it. Short on purpose. */
export const ART_MARKER = 'ART DIRECTION (what makes every frame look professional and keeps eyes on it)';
export function artDirectionRule() {
  return `${ART_MARKER}:
- COMPOSITION: the main person big (fills half the frame or more), on a third line, not dead centre; 3 depth layers in every set (a dark foreground shape that frames the shot, the action in the middle, a softer background); leave clear air around faces; nothing important under the captions.
- VALUE AND COLOUR: the people must stand out from the set (a light figure on a darker set or the other way round, warm people against a cooler set); one palette per film (2 main colours + 1 accent used only for what matters); each place has its own colour; the brightest spot in the frame is where the viewer should look.
- LINE ART: clean, confident lines; the outer outline of every shape about twice as thick as the inner detail lines; round line ends and joins (stroke-linecap="round" stroke-linejoin="round"); outlines in a dark shade of the fill colour (not flat grey); shading as 2 to 3 flat tones with soft gradient light, never noisy; no gaps or overlaps in outlines.
- SHAPE LANGUAGE: round shapes = friendly and safe, squares = strong and stable, triangles and spikes = danger; design villains, heroes and places with it.
- ALWAYS ALIVE: every set has something moving (leaves, smoke, steam, rain, flickering lights, a passing car, birds, a crowd); light that breathes slightly; no frozen frame.
- TEXT ON SCREEN: at most 3 words at a time, huge, high contrast, popping in on the word; one number or key word per idea. NEVER speech or thought bubbles (they cover faces and look cheap): the captions carry the words, the face and body carry the feeling.
- ENERGY CURVE: hook in the first second (motion + a person + a striking word); something new every 2 to 4 seconds (a shot, a graphic, a word, an action); a bigger surprise around 15 s and 30 s; build to the payoff; the last frame links back to the first so people rewatch.`;
}
