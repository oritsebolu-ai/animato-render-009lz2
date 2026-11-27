// Video output settings: the frame rate and resolution the person picks, and the maths the exporter needs for them.
// Pure functions only (no DOM), so they can be unit tested in Node. index.html loads this file and wires it to the page.
//
// The scene itself is always drawn in a 1600x900 (16:9) world. These settings decide how that world is turned into
// the finished MP4: how many pixels, how many frames per second, and what to do when the chosen shape is not 16:9.

export const WORLD_W = 1600;
export const WORLD_H = 900;

export const STORAGE_KEY = 'stk_video_settings_v1';

// Full HD at 30 fps: flat vector pictures and text stay sharp, and motion is smoother than the old 720p at 24 fps.
// (A person's own saved choice always wins. Phones that cannot do it are stepped down by fallbackSteps, never failed.)
export const DEFAULT_SETTINGS = Object.freeze({ width: 1920, height: 1080, fps: 30, fit: 'fit' });

// The two canvases a project can be made for. YouTube is the full 1600x900 world. TikTok is a tall 506x900 window of
// that same world (the engine centres it on the camera), so scenes are written and rendered for a vertical screen.
export const ASPECTS = Object.freeze({
  '16:9': Object.freeze({ id: '16:9', label: 'YouTube 16:9', name: 'YouTube', frameW: 1600, frameH: 900, ratio: 16 / 9 }),
  '9:16': Object.freeze({ id: '9:16', label: 'TikTok 9:16', name: 'TikTok', frameW: 506, frameH: 900, ratio: 9 / 16 }),
});
export const DEFAULTS_BY_ASPECT = Object.freeze({
  '16:9': DEFAULT_SETTINGS,
  '9:16': Object.freeze({ width: 1080, height: 1920, fps: 30, fit: 'fit' }),
});
export function normalizeAspect(v) {
  return v === '9:16' ? '9:16' : '16:9';
}
export function defaultSettingsFor(aspect) {
  return { ...DEFAULTS_BY_ASPECT[normalizeAspect(aspect)] };
}

// Limits. Sizes are kept even because H.264 (4:2:0) cannot encode odd widths or heights.
export const MIN_SIDE = 144;
export const MAX_SIDE = 3840;
export const MAX_PIXELS = 3840 * 2160;
export const MIN_FPS = 1;
export const MAX_FPS = 120;

export const FPS_OPTIONS = Object.freeze([12, 15, 24, 25, 30, 48, 50, 60]);

// aspect: the canvas a preset belongs to ('any' = offered on both, the scene is fitted or cropped into it)
export const RESOLUTION_PRESETS = Object.freeze([
  { id: '360p', label: '360p', width: 640, height: 360, aspect: '16:9', note: 'Smallest file' },
  { id: '480p', label: '480p', width: 854, height: 480, aspect: '16:9', note: 'SD' },
  { id: '720p', label: '720p HD', width: 1280, height: 720, aspect: '16:9', note: 'Default' },
  { id: '1080p', label: '1080p Full HD', width: 1920, height: 1080, aspect: '16:9', note: 'YouTube standard' },
  { id: '1440p', label: '1440p 2K', width: 2560, height: 1440, aspect: '16:9', note: 'Sharper' },
  { id: '2160p', label: '2160p 4K', width: 3840, height: 2160, aspect: '16:9', note: 'Slowest, biggest file' },
  { id: 'v720', label: '720p vertical', width: 720, height: 1280, aspect: '9:16', note: 'Smaller file' },
  { id: 'v1080', label: '1080p vertical', width: 1080, height: 1920, aspect: '9:16', note: 'TikTok, Reels, Shorts standard' },
  { id: 'v1440', label: '1440p vertical', width: 1440, height: 2560, aspect: '9:16', note: 'Sharper' },
  { id: 'v2160', label: '4K vertical', width: 2160, height: 3840, aspect: '9:16', note: 'Slowest, biggest file' },
  { id: 'square', label: 'Square 1:1', width: 1080, height: 1080, aspect: 'any', note: 'Feed posts (scene is fitted)' },
]);

export function presetsFor(aspect) {
  const a = normalizeAspect(aspect);
  return RESOLUTION_PRESETS.filter((p) => p.aspect === a || p.aspect === 'any');
}

export const CUSTOM_ID = 'custom';

// Only numbers and numeric text count. null, true, [] and the like would turn into 0 or 1 with Number(), so they are rejected.
const toInt = (v) => {
  const n = typeof v === 'string' ? parseFloat(v.trim()) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.round(n) : NaN;
};
const toEven = (n) => Math.round(n / 2) * 2;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Frame rate as a whole number between MIN_FPS and MAX_FPS. Anything unusable falls back to the default. */
export function normalizeFps(v, fallback = DEFAULT_SETTINGS.fps) {
  const n = toInt(v);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, MIN_FPS, MAX_FPS);
}

/**
 * Turns whatever was typed into a size the encoder can use: whole, even numbers inside the limits,
 * and no more than MAX_PIXELS (a size that is too big is scaled down, keeping its shape).
 * Returns { width, height, changed, reason } where reason explains a change in plain words.
 */
export function normalizeResolution(w, h, fallback = DEFAULT_SETTINGS) {
  const rw = toInt(w);
  const rh = toInt(h);
  if (!Number.isFinite(rw) || !Number.isFinite(rh) || rw <= 0 || rh <= 0) {
    return { width: fallback.width, height: fallback.height, changed: true, reason: 'Enter a width and a height in pixels.' };
  }
  let width = rw;
  let height = rh;
  const reasons = [];

  if (width * height > MAX_PIXELS) {
    const k = Math.sqrt(MAX_PIXELS / (width * height));
    width = Math.floor((width * k) / 2) * 2;
    height = Math.floor((height * k) / 2) * 2;
    reasons.push('Scaled down to fit 4K (3840×2160), the largest size supported.');
  }
  const cw = clamp(width, MIN_SIDE, MAX_SIDE);
  const ch = clamp(height, MIN_SIDE, MAX_SIDE);
  if (cw !== width || ch !== height) {
    if (!reasons.length) reasons.push('Each side must be between ' + MIN_SIDE + ' and ' + MAX_SIDE + ' pixels.');
    width = cw;
    height = ch;
  }
  // The side clamp can push the area back over the limit (for example 3840×3840 after a MIN_SIDE bump); settle it once more.
  if (width * height > MAX_PIXELS) {
    const k = Math.sqrt(MAX_PIXELS / (width * height));
    width = Math.max(MIN_SIDE, Math.floor((width * k) / 2) * 2);
    height = Math.max(MIN_SIDE, Math.floor((height * k) / 2) * 2);
  }
  const ew = toEven(width);
  const eh = toEven(height);
  if ((ew !== width || eh !== height) && !reasons.length) reasons.push('Sizes must be even numbers, so it was rounded.');
  width = ew;
  height = eh;
  return { width, height, changed: width !== rw || height !== rh, reason: reasons[0] || '' };
}

/** The preset id that matches this exact size, or 'custom'. */
export function presetIdFor(width, height) {
  const p = RESOLUTION_PRESETS.find((x) => x.width === width && x.height === height);
  return p ? p.id : CUSTOM_ID;
}

export function normalizeFit(v) {
  return v === 'fill' ? 'fill' : 'fit';
}

/** Cleans a saved or typed settings object into one that is always safe to render with. */
export function normalizeSettings(raw, aspect = '16:9') {
  const d = DEFAULTS_BY_ASPECT[normalizeAspect(aspect)];
  const r = raw && typeof raw === 'object' ? raw : {};
  const res = normalizeResolution(r.width ?? d.width, r.height ?? d.height, d);
  return { width: res.width, height: res.height, fps: normalizeFps(r.fps, d.fps), fit: normalizeFit(r.fit) };
}

// Each canvas remembers its own choice, so switching between YouTube and TikTok projects never mixes the sizes up.
export function storageKeyFor(aspect) {
  return normalizeAspect(aspect) === '9:16' ? STORAGE_KEY + ':9x16' : STORAGE_KEY;
}

export function loadSettings(storage, aspect = '16:9') {
  try {
    const s = storage && storage.getItem(storageKeyFor(aspect));
    return normalizeSettings(s ? JSON.parse(s) : null, aspect);
  } catch {
    return defaultSettingsFor(aspect);
  }
}

export function saveSettings(storage, settings, aspect = '16:9') {
  try {
    storage.setItem(storageKeyFor(aspect), JSON.stringify(normalizeSettings(settings, aspect)));
    return true;
  } catch {
    return false;
  }
}

/** True when the size is 16:9 (a rounding error either way is fine), the shape the scene world is drawn in. */
export function isWidescreen(width, height) {
  return Math.abs(width / height - WORLD_W / WORLD_H) < 0.012;
}

/** SVG preserveAspectRatio for the chosen shape: keep the whole picture (bars) or fill the frame (crop the edges). */
export function preserveAspectFor(fit) {
  return normalizeFit(fit) === 'fill' ? 'xMidYMid slice' : 'xMidYMid meet';
}

/** True when the size has the same shape as the canvas the project is made for (16:9 or 9:16). */
export function matchesAspect(width, height, aspect = '16:9') {
  return Math.abs(width / height - ASPECTS[normalizeAspect(aspect)].ratio) < 0.012;
}

/** Only a "fit" picture in a frame of another shape has bars, and only then must anything outside the canvas be hidden. */
export function needsWorldClip(settings, aspect = '16:9') {
  const s = normalizeSettings(settings, aspect);
  return s.fit === 'fit' && !matchesAspect(s.width, s.height, aspect);
}

export function describeSettings(settings) {
  const s = normalizeSettings(settings);
  return s.width + '×' + s.height + ' · ' + s.fps + ' fps';
}

/** A short plain-words heads-up when the choice will take a while or the picture shape differs from the scene. */
export function settingsNotes(settings, aspect = '16:9') {
  const a = normalizeAspect(aspect);
  const s = normalizeSettings(settings, a);
  const notes = [];
  if (!matchesAspect(s.width, s.height, a)) {
    notes.push(
      s.fit === 'fill'
        ? 'Fill crops the sides (or top and bottom) of the ' + a + ' scene to fill this shape.'
        : 'Fit keeps the whole ' + a + ' scene and adds black bars to reach this shape.',
    );
  }
  if (isHeavy(s)) notes.push('This is a heavy setting: rendering takes longer and needs a strong device.');
  return notes;
}

/** Pixels drawn per second of video. Above about 1080p at 60 fps the browser starts to struggle. */
export function pixelRate(settings) {
  const s = normalizeSettings(settings);
  return s.width * s.height * s.fps;
}
export function isHeavy(settings) {
  return pixelRate(settings) > 1920 * 1080 * 30;
}

// ---- Encoder maths --------------------------------------------------------------------------------------------

// H.264 levels: [level_idc, max macroblocks per second, max frame size in macroblocks].
const H264_LEVELS = [
  [0x1f, 108000, 3600], // 3.1
  [0x20, 216000, 5120], // 3.2
  [0x28, 245760, 8192], // 4.0
  [0x29, 245760, 8192], // 4.1
  [0x2a, 522240, 8704], // 4.2
  [0x32, 589824, 22080], // 5.0
  [0x33, 983040, 36864], // 5.1
  [0x34, 2073600, 36864], // 5.2
];
const hex2 = (n) => n.toString(16).padStart(2, '0');

/**
 * H.264 codec strings to try, best first, for a size and frame rate. A level that is too low for the size
 * is rejected by the encoder, so the candidates start at the lowest level that fits (never below 4.0 for High and
 * Main, matching what the app always used for 720p), and include the next level up as a spare.
 */
export function h264Candidates(width, height, fps) {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const rate = mbs * fps;
  const fits = H264_LEVELS.filter(([, maxRate, maxSize]) => mbs <= maxSize && rate <= maxRate);
  const levels = fits.length ? fits : [H264_LEVELS[H264_LEVELS.length - 1]];
  const out = [];
  for (const [profile, floor] of [
    [0x64, 0x28], // High
    [0x4d, 0x28], // Main
    [0x42, 0x1f], // Baseline (last resort, works for small sizes only)
  ]) {
    const usable = levels.filter(([id]) => id >= floor).slice(0, 2);
    for (const [id] of usable) out.push('avc1.' + hex2(profile) + '00' + hex2(id));
  }
  return out;
}
/** Bits per second for the video track. 720p at 24 fps stays at the 5 Mbps the app always used, other sizes scale from it. */
/** Bits per second for the video track. About 0.3 bits per pixel per frame (1080x1920 at 30 fps is about 18 Mbps): flat colours, gradients and fine caption edges stay clean instead of blocky. Small sizes keep the 2.5 Mbps floor. */
export function targetBitrate(width, height, fps) {
  const raw = width * height * fps * 0.226;
  return clamp(Math.round(raw / 1e5) * 1e5, 2.5e6, 60e6);
}

/** How many frames to prepare ahead while encoding. Big frames take a lot of memory, so fewer are kept at large sizes. */
export function lookAhead(width, height, low = false) {
  if (low) return clamp(Math.round((2 * 1280 * 720) / (width * height)), 1, 2);
  return clamp(Math.round((8 * 1280 * 720) / (width * height)), 2, 8);
}

// ---- Making sure an export always finishes, on any device ------------------------------------------------------

/** What kind of device this is, from what the browser reports. Memory is unknown on iPhone and Firefox. */
export function deviceProfile(nav = globalThis.navigator || {}) {
  const ua = String(nav.userAgent || '');
  const touchMac = /Macintosh/.test(ua) && Number(nav.maxTouchPoints || 0) > 1;
  const mobile = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua) || touchMac;
  const mem = Number(nav.deviceMemory);
  return { mobile, memoryGB: mem > 0 ? mem : null, cores: Number(nav.hardwareConcurrency) || 4 };
}

/** How big the finished file may be for this device before it risks the tab being closed by the browser, in megabytes. */
export function fileBudgetMB(profile = {}, crashes = 0) {
  let mb;
  if (profile.memoryGB) mb = clamp(profile.memoryGB * 80, 60, 800);
  else mb = profile.mobile ? 100 : 500;
  if (profile.mobile) mb = Math.min(mb, 200);
  if (crashes > 0) mb = Math.max(40, mb / 2);
  return Math.round(mb);
}

/**
 * Settings for one export that keep the chosen size and frame rate and stay inside what the device can hold:
 *  - bitrate: the ideal one, lowered only when the file would be too big for the device (never below a clear floor),
 *  - stream: write the file into a Blob as it is made instead of one big memory buffer,
 *  - lookAhead and queue: how many frames are prepared and waiting at once.
 */
export function exportPlan({ width, height, fps, seconds, hasAudio = true, profile = {}, crashes = 0 } = {}) {
  const sec = Math.max(1, Number(seconds) || 1);
  const ideal = targetBitrate(width, height, fps);
  const audioBytes = hasAudio ? sec * 16000 : 0;
  const budget = fileBudgetMB(profile, crashes);
  const fit = ((budget * 1e6 * 0.8 - audioBytes) * 8) / sec;
  const floor = Math.min(ideal, clamp(width * height * fps * 0.05, 0.8e6, 60e6));
  let bitrate = clamp(Math.min(ideal, fit), floor, ideal);
  if (crashes > 0) bitrate = Math.max(floor, Math.min(bitrate, ideal * 0.7));
  bitrate = Math.round(bitrate / 1e5) * 1e5;
  const estimatedMB = Math.round(((bitrate * sec) / 8 + audioBytes) / 1e5) / 10;
  const low = !!profile.mobile || (profile.memoryGB !== null && profile.memoryGB !== undefined && profile.memoryGB <= 4) || crashes > 0 || estimatedMB > budget / 2;
  const notes = [];
  if (bitrate < ideal * 0.95) notes.push('The picture quality was adjusted slightly so the file fits this device’s memory. Size and frame rate are as you chose.');
  if (crashes > 0) notes.push('Safe mode was used because an earlier export at this size stopped this device.');
  return {
    bitrate,
    idealBitrate: ideal,
    budgetMB: budget,
    estimatedMB,
    stream: estimatedMB > 24 || low,
    lowMemory: low,
    lookAhead: crashes > 0 ? 1 : lookAhead(width, height, low),
    queue: low ? 3 : 8,
    notes,
  };
}

/** A gentler version of a plan, for a second try after the first one failed. */
export function saferPlan(plan) {
  return { ...plan, bitrate: Math.max(0.8e6, Math.round((plan.bitrate * 0.8) / 1e5) * 1e5), stream: true, lowMemory: true, lookAhead: 1, queue: 2 };
}

/**
 * Sizes to try, best first, when an export cannot be made at the chosen size and frame rate.
 * The first step is always exactly what was asked for. The shape of the picture never changes.
 */
export function fallbackSteps(width, height, fps) {
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  const scale = (k) => {
    const long = Math.max(width, height);
    const target = Math.max(MIN_SIDE, even(long * k));
    const f = target / long;
    return { width: even(width * f), height: even(height * f) };
  };
  const steps = [{ width, height, fps, why: 'chosen' }];
  const add = (w, h, f, why) => {
    const last = steps[steps.length - 1];
    if (w === last.width && h === last.height && f === last.fps) return;
    steps.push({ width: w, height: h, fps: f, why });
  };
  if (fps > 30) add(width, height, 30, 'frame rate lowered to 30');
  const a = scale(0.75);
  add(a.width, a.height, Math.min(fps, 30), 'smaller size');
  const b = scale(0.5);
  add(b.width, b.height, Math.min(fps, 24), 'much smaller size');
  const c = scale(0.33);
  add(c.width, c.height, Math.min(fps, 24), 'smallest size');
  return steps;
}

/** How many frames the export will make for a video of this length. */
export function frameCount(seconds, fps) {
  return Math.max(1, Math.ceil(seconds * normalizeFps(fps)));
}

/** File name part that records what the video was made at, for example "1920x1080-30fps". */
export function fileTag(settings) {
  const s = normalizeSettings(settings);
  return s.width + 'x' + s.height + '-' + s.fps + 'fps';
}

// ---- Making the AI write for the chosen canvas -----------------------------------------------------------------

/** The scene file says which canvas it is for: movie({aspect:'9:16'}). Anything else is the YouTube canvas. */
export function aspectFromCode(code) {
  const m = /\bmovie\s*\(\s*\{[^}]*?\baspect\s*:\s*(['"`])\s*(\d+)\s*:\s*(\d+)\s*\1/.exec(String(code || ''));
  return m && +m[2] === 9 && +m[3] === 16 ? '9:16' : '16:9';
}

/** Rewrites the aspect inside the first movie({...}) call (adds it when missing). Code without a movie call is returned unchanged. */
export function setMovieAspect(code, aspect) {
  const a = normalizeAspect(aspect);
  const src = String(code || '');
  const i = src.search(/\bmovie\s*\(\s*\{/);
  if (i < 0) return src;
  const open = src.indexOf('{', i);
  const head = src.slice(0, open + 1);
  const rest = src.slice(open + 1);
  const re = /\baspect\s*:\s*(['"`])\d+\s*:\s*\d+\1/;
  const end = rest.indexOf('}');
  const inside = end < 0 ? rest : rest.slice(0, end);
  if (re.test(inside)) return head + inside.replace(re, (m, q) => 'aspect:' + q + a + q) + (end < 0 ? '' : rest.slice(end));
  return head + "aspect:'" + a + "'," + rest;
}

export const TIKTOK_MARKER = '=== FORMAT OVERRIDE: THIS IS A TIKTOK VIDEO';
export const TIKTOK_BLOCK = `=== FORMAT OVERRIDE: THIS IS A TIKTOK VIDEO (VERTICAL 9:16, 1080x1920). THIS BLOCK BEATS EVERYTHING BELOW ===
The app will render this film on a vertical TikTok canvas, NOT a YouTube widescreen canvas. Anything below that says 16:9, widescreen, YouTube, 1280x720, "the full 1600x900 canvas is visible", or asks for a thumbnail is replaced by these rules:
- Write movie({title:'...', aspect:'9:16'...}) (always '9:16'). Do NOT write thumbnail(...).
- The scene coordinates are still the 1600x900 grid, but the screen only shows a TALL WINDOW of it: 506 wide x 900 high, centred on the camera x (default x=800). At zoom 1 the visible x range is about 547 to 1053 (y 0 to 900). Anything outside that is cut off.
- Place people on the normal wide stage (x about 300 to 1300), 150 to 250 apart, exactly as you would for a wide video. The app fits them into the tall frame itself: it scales them down, staggers them in two rows and frames the group so they never overlap. Do NOT crowd everyone into the centre and do NOT zoom in to fit; at most 3 main people per shot, a close-up for one person's feelings. Key props and key background details go near the centre (x 620..980).
- Use the full height: faces and the key prop in the upper-middle, ground around y 720 to 850, subtitles in the bottom third.
- Backgrounds may still be drawn 1600 wide, but put the interesting part in the centre column. Big simple props, short on-screen text (at most about 18 characters per line, use maxChars:18 for captions), screen-space props centred at x=800 and no wider than 470.
- Pace for TikTok: a hook in the first 2 seconds, scenes of 2 to 5 seconds, fast cuts, punchy narration.
=== END OF FORMAT OVERRIDE ===`;

const TIKTOK_REMINDER = `\n\nREMINDER: this is a TikTok vertical 9:16 video. Use aspect:'9:16', place people on the normal wide stage with space between them (the app fits and frames them), key props near the centre, no thumbnail(...).`;

/** For the TikTok canvas: fixes the aspect and size words inside a prompt and puts the vertical-canvas rules first and last. 16:9 prompts are returned untouched. */
export function adaptPromptForFormat(text, aspect) {
  const src = String(text ?? '');
  if (normalizeAspect(aspect) !== '9:16' || src.includes(TIKTOK_MARKER)) return src;
  const body = src
    .replace(/aspect\s*:\s*(['"`])16:9\1/g, (m, q) => 'aspect:' + q + '9:16' + q)
    .replace(/16:9 YouTube Widescreen \(1280[×x]720\)/gi, 'TikTok Vertical 9:16 (1080×1920)')
    .replace(/YouTube widescreen/gi, 'TikTok vertical')
    .replace(/1280\s*[×x]\s*720/g, '1080×1920');
  return TIKTOK_BLOCK + '\n\n' + body + TIKTOK_REMINDER;
}
