// Subscribe overlay: a card that slides in, a hand that taps "Subscribe" / "Follow", then a bell.
// One module drives three things, so they can never disagree:
//   * the picture   -> overlaySvg(T, total, settings, FW)   (drawn into every preview AND export frame)
//   * the timing    -> windows(total, settings)             (beginning / middle / end, never overlapping)
//   * the sound     -> cues(total, settings), renderSfx()   (live preview plays them, exports mix them in)
// Pure functions: no DOM is needed except OfflineAudioContext / AudioContext when sound is rendered.

export const STORE_KEY = 'stk_sub_overlay';
export const DEFAULTS = Object.freeze({
  on: false, platform: 'yt', yt: '@YourChannel', tt: '@yourtiktok',
  start: false, middle: true, end: true, sound: true,
});

const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
export function clean(o) {
  o = o && typeof o === 'object' ? o : {};
  const d = DEFAULTS;
  const b = (k) => (o[k] === undefined ? d[k] : !!o[k]);
  const p = ['yt', 'tt', 'both'].includes(o.platform) ? o.platform : d.platform;
  const s = { on: b('on'), platform: p, yt: clip(o.yt, 40) || d.yt, tt: clip(o.tt, 40) || d.tt, start: b('start'), middle: b('middle'), end: b('end'), sound: b('sound') };
  return s;
}

export function load(storage) {
  try { const raw = (storage || globalThis.localStorage).getItem(STORE_KEY); return clean(raw ? JSON.parse(raw) : null); } catch (e) { return clean(null); }
}
export function save(s, storage) {
  try { (storage || globalThis.localStorage).setItem(STORE_KEY, JSON.stringify(clean(s))); return true; } catch (e) { return false; }
}

const rowsOf = (s) => (s.platform === 'both' ? ['yt', 'tt'] : [s.platform]);
/** How long one showing lasts, in seconds (a second row adds a second tap). */
export const durationOf = (s) => 4.6 + 1.5 * (rowsOf(s).length - 1);

/** The times (seconds) at which the overlay is on screen: [{at, dur, kind}] in time order, no overlaps. */
export function windows(total, s) {
  s = clean(s);
  total = +total;
  if (!s.on || !(total > 0)) return [];
  const dur = durationOf(s);
  const want = [];
  if (s.start) want.push({ kind: 'start', at: 1.2 });
  if (s.middle) want.push({ kind: 'middle', at: total / 2 - dur / 2 });
  if (s.end) want.push({ kind: 'end', at: total - dur - 0.8 });
  const out = [];
  for (const w of want) {
    const at = Math.max(0, w.at);
    if (at + dur > total) continue;                                  // a film too short for it: skip it, never cut it off
    const prev = out[out.length - 1];
    if (prev && at < prev.at + prev.dur + 1.5) continue;             // keep a breathing gap between showings
    out.push({ kind: w.kind, at, dur });
  }
  // a very short film still gets one showing at the end if it fits at all
  if (want.length && !out.length && total >= dur + 0.4) out.push({ kind: 'end', at: Math.max(0, total - dur - 0.2), dur });
  return out;
}

// ---- timeline of one showing (t = seconds since the showing began) ----
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const easeInOut = (x) => (x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const cl01 = (x) => Math.max(0, Math.min(1, x));
const IN = 0.5, OUT = 0.5, TAP_FIRST = 1.8, TAP_GAP = 1.5, REACH = 0.9;
export const tapTime = (row) => TAP_FIRST + TAP_GAP * row;

const f = (n) => Math.round(n * 100) / 100;

/** Which showing is on screen at film time T, and how far into it (or null). */
export function phase(T, total, s) {
  for (const w of windows(total, s)) if (T >= w.at && T <= w.at + w.dur) return { ...w, t: T - w.at };
  return null;
}

const FONT = 'Arial, Helvetica, sans-serif';
const COL = { yt: '#e62117', tt: '#fe2c55' };
const WORD = { yt: ['Subscribe on YouTube', 'Subscribe', 'Subscribed'], tt: ['Follow on TikTok', 'Follow', 'Following'] };
const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function icon(kind, x, y, w) {
  if (kind === 'yt') {
    const h = w * 0.72, k = w / 64;
    return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(k)})"><rect width="64" height="46" rx="12" fill="#f00"/><path d="M26 13l18 10-18 10z" fill="#fff"/></g>`;
  }
  const k = w / 56;
  const note = 'M31 12v22.5a6.5 6.5 0 1 1-6.5-6.5M31 12c1 5 4 8 9 8.5';
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(k)})"><rect width="56" height="56" rx="14" fill="#111"/>`
    + `<path d="${note}" fill="none" stroke="#25f4ee" stroke-width="5" transform="translate(-2 1)"/>`
    + `<path d="${note}" fill="none" stroke="#fe2c55" stroke-width="5" transform="translate(2 -1)"/>`
    + `<path d="${note}" fill="none" stroke="#fff" stroke-width="5"/></g>`;
}

const BELL = 'M12 2a2 2 0 0 0-2 2v.7A6 6 0 0 0 6 10.5V15l-2 2v1h16v-1l-2-2v-4.5a6 6 0 0 0-4-5.8V4a2 2 0 0 0-2-2zm-2 18a2 2 0 0 0 4 0z';
const HAND = 'M26 6c0-3 2-5 5-5s5 2 5 5v26l3-1c3-1 5 1 5 3l1-1c3-1 5 1 5 3l1-.5c3-1 5 1 5 3v20c0 10-8 18-18 18H34c-7 0-11-4-15-10L7 49c-2-3 0-6 3-6 2 0 4 1 6 3l10 9z';

/**
 * The picture for film time T. Returns '' when nothing shows. Coordinates are the film's own (width FW, height 900),
 * so it works for 16:9 (FW 1600) and 9:16 (FW 506). Safe to put inside any <svg>.
 */
export function overlaySvg(T, total, s, FW, H = 900) {
  s = clean(s);
  const ph = phase(T, total, s);
  if (!ph) return '';
  const rows = rowsOf(s), nR = rows.length, t = ph.t, dur = ph.dur;
  const narrow = FW < 900;
  const cw = narrow ? FW * 0.9 : 600, k = cw / 600;                 // card width and scale (card is designed 600 wide)
  const rowH = 168, chH = 36 + rowH * nR, ch = chH;
  const x0 = (FW - cw) / 2, yShow = narrow ? 150 : 56;
  // slide in from above with a little bounce, slide out the same way
  const tin = cl01(t / IN), tout = cl01((t - (dur - OUT)) / OUT);
  const slide = tout > 0 ? easeInOut(tout) : 1 - easeOutBack(tin);  // 0 = in place, 1 = off the top
  const yOff = -(yShow + ch * k + 30) * slide;
  const op = tout > 0 ? 1 - tout : cl01(t / 0.2);
  let g = `<g opacity="${f(op)}" transform="translate(${f(x0)} ${f(yShow + yOff)}) scale(${f(k)})" font-family="${FONT}">`;
  g += `<rect x="6" y="10" width="600" height="${ch}" rx="30" fill="#000" opacity=".28"/>`;
  g += `<rect width="600" height="${ch}" rx="30" fill="#0e0e14" opacity=".94"/>`;
  let handTarget = null;
  rows.forEach((kind, r) => {
    const y = 18 + r * rowH, tap = tapTime(r);
    const pressed = t >= tap && t < tap + 0.16;
    const done = t >= tap + 0.2;
    const label = done ? WORD[kind][2] : WORD[kind][1];
    g += icon(kind, 40, y + 14, 74);
    g += `<text x="136" y="${y + 48}" fill="#fff" font-size="30" font-weight="800">${esc(WORD[kind][0])}</text>`;
    g += `<text x="136" y="${y + 80}" fill="#b8bcc8" font-size="22" font-weight="600">${esc(kind === 'yt' ? s.yt : s.tt)}</text>`;
    const bw = 250, bh = 58, bx = 300 - bw / 2, by = y + 98;
    const sc = pressed ? 0.92 : 1, cx = 300, cy = by + bh / 2;
    g += `<g transform="translate(${cx} ${cy}) scale(${sc}) translate(${-cx} ${-cy})">`;
    g += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="29" fill="${done ? '#3a3d48' : COL[kind]}"/>`;
    const tw = label.length * 14.5 + (done ? 34 : 0);
    g += `<text x="${f(cx - (done ? 17 : 0))}" y="${by + 38}" text-anchor="middle" fill="${done ? '#dcdfe6' : '#fff'}" font-size="28" font-weight="800">${esc(label)}</text>`;
    if (done) {
      const bt = t - (tap + 0.2), ang = bt < 0.7 ? Math.sin(bt * 24) * 22 * (1 - bt / 0.7) : 0;
      g += `<g transform="translate(${f(cx + tw / 2 - 4)} ${by + 16}) rotate(${f(ang)} 12 4) scale(1)"><path d="${BELL}" fill="#ffd54a"/></g>`;
    }
    g += `</g>`;
    if (!handTarget && t < tap + 0.9) handTarget = { x: cx + 78, y: cy + 2, tap, r };
  });
  // the hand: flies in, taps, flies on to the next button, then away
  if (handTarget) {
    const hs = narrow ? 1.25 : 1.0;
    const farX = 760, farY = ch + 90;
    const prevEnd = handTarget.r === 0 ? 0 : tapTime(handTarget.r - 1) + 0.5;
    const startT = handTarget.r === 0 ? handTarget.tap - REACH - 0.9 : prevEnd;
    const arrive = handTarget.tap - 0.1;
    const q = cl01((t - startT) / Math.max(0.1, arrive - startT));
    const e = easeInOut(q);
    const fromX = handTarget.r === 0 ? farX : handTarget.x + 30, fromY = handTarget.r === 0 ? farY : handTarget.y + 70;
    const hx = fromX + (handTarget.x - fromX) * e, hy = fromY + (handTarget.y - fromY) * e;
    const tapping = t >= handTarget.tap && t < handTarget.tap + 0.16;
    const sc = (tapping ? 0.86 : 1) * hs * 1.1;
    if (t >= startT) {
      g += `<g transform="translate(${f(hx)} ${f(hy)}) scale(${f(sc)}) translate(-31 -2)">`
        + `<path d="${HAND}" fill="#c68a5e" stroke="#7a4a2a" stroke-width="2" stroke-linejoin="round" transform="translate(2 3)" opacity=".35"/>`
        + `<path d="${HAND}" fill="#c68a5e" stroke="#7a4a2a" stroke-width="2" stroke-linejoin="round"/>`
        + `<path d="M26 6v36M36 33v8M43 36v7M50 38v7" stroke="#7a4a2a" stroke-width="1.5" fill="none" opacity=".6"/></g>`;
    }
    // a ring that spreads from the tap
    const rt = t - handTarget.tap;
    if (rt >= 0 && rt < 0.5) g += `<circle cx="${f(handTarget.x)}" cy="${f(handTarget.y)}" r="${f(10 + rt * 90)}" fill="none" stroke="#fff" stroke-width="3" opacity="${f(0.8 * (1 - rt / 0.5))}"/>`;
  }
  g += `</g>`;
  return g;
}

// ---------------------------------------------------------------------------------------------------------
// Sound. Everything is made in code (no audio files), and every sound is scheduled on an absolute time.
// ---------------------------------------------------------------------------------------------------------
export const SFX = {
  whoosh(c, t, dur = 0.45, f0 = 300, f1 = 2200, vol = 0.5) {
    const n = c.createBufferSource(), len = Math.max(1, Math.floor(c.sampleRate * dur)), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    n.buffer = b;
    const fl = c.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 1.2;
    fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(fl); fl.connect(g); g.connect(c.destination); n.start(t);
  },
  pop(c, t) {
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.12);
    g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.2);
  },
  click(c, t) {
    const o = c.createOscillator(), g = c.createGain(); o.type = 'square';
    o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(300, t + 0.04);
    g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.08);
    const o2 = c.createOscillator(), g2 = c.createGain(); o2.type = 'sine'; o2.frequency.value = 140;
    g2.gain.setValueAtTime(0.5, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o2.connect(g2); g2.connect(c.destination); o2.start(t); o2.stop(t + 0.1);
  },
  bell(c, t) {
    [[880, 1, 0.5], [1760, 0.55, 0.35], [2640, 0.3, 0.25], [1175, 0.4, 0.4]].forEach(([fr, v, d]) => {
      for (const k of [0, 0.28, 0.56]) {
        const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = fr; const s = t + k;
        g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.22 * v * (1 - k * 0.8), s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s + d + 0.5);
        o.connect(g); g.connect(c.destination); o.start(s); o.stop(s + d + 0.55);
      }
    });
  },
  ding(c, t) {
    [1318, 1760].forEach((fr, i) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = fr; const s = t + i * 0.09;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.25, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.35);
      o.connect(g); g.connect(c.destination); o.start(s); o.stop(s + 0.4);
    });
  },
};
const PLAYERS = {
  card: (c, t) => { SFX.whoosh(c, t, 0.4, 400, 2600, 0.6); SFX.pop(c, t + 0.02); },
  hand: (c, t) => SFX.whoosh(c, t, 0.7, 200, 1400, 0.8),
  click: (c, t) => SFX.click(c, t),
  bell: (c, t) => { SFX.ding(c, t); SFX.bell(c, t + 0.05); },
  out: (c, t) => SFX.whoosh(c, t, 0.6, 1800, 250, 0.7),
};

/** Every sound of the film, in time order: [{at, kind}] (seconds). Empty when sound is off. */
export function cues(total, s) {
  s = clean(s);
  if (!s.on || !s.sound) return [];
  const out = [];
  for (const w of windows(total, s)) {
    out.push({ at: w.at + 0.0, kind: 'card' });
    out.push({ at: w.at + TAP_FIRST - REACH - 0.0, kind: 'hand' });
    rowsOf(s).forEach((_, r) => {
      if (r > 0) out.push({ at: w.at + tapTime(r - 1) + 0.5, kind: 'hand' });
      out.push({ at: w.at + tapTime(r), kind: 'click' });
      out.push({ at: w.at + tapTime(r) + 0.25, kind: 'bell' });
    });
    out.push({ at: w.at + w.dur - OUT, kind: 'out' });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Play one cue on a live AudioContext (the preview). `delay` seconds from now. */
export function playCue(ctx, kind, delay = 0) { const p = PLAYERS[kind]; if (p) p(ctx, ctx.currentTime + Math.max(0, delay)); }

/** The cues that start inside (a, b] of film time: what the live preview should fire this tick. */
export function cuesBetween(list, a, b) { return list.filter((c) => c.at > a && c.at <= b); }

/**
 * All the sounds as one mono track (Float32Array) for exporting. Returns null when there is nothing to play.
 * Needs OfflineAudioContext (browser). `rate` is the sample rate of the video's audio.
 */
export async function renderSfx(total, s, rate = 48000, Offline = globalThis.OfflineAudioContext) {
  const list = cues(total, s);
  if (!list.length || !Offline) return null;
  const len = Math.ceil((total + 1) * rate);
  const oc = new Offline(1, len, rate);
  for (const c of list) { const p = PLAYERS[c.kind]; if (p) p(oc, c.at); }
  const buf = await oc.startRendering();
  return buf.getChannelData(0);
}

/** Add the sounds into an existing AudioBuffer-like narration ({sampleRate, getChannelData, numberOfChannels}) in place. */
export function mixInto(buf, sfx) {
  if (!buf || !sfx) return buf;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch), n = Math.min(d.length, sfx.length);
    for (let i = 0; i < n; i++) { const v = d[i] + sfx[i] * 0.55; d[i] = v > 1 ? 1 : v < -1 ? -1 : v; }
  }
  return buf;
}
