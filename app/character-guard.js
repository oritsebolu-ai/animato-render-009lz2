/* Makes sure a finished video always has a character on screen.
 *
 * A scene file can arrive broken in many ways: scenes with only captions, a reference-image character that was never drawn,
 * a character that sits off the screen or is hidden the whole scene, a size of zero, a style the app does not know.
 * The guard looks at every scene, fixes what it can, adds a character from the ones the app already has when there is none,
 * and returns a plain list of what was wrong and what was done, so the user is told instead of left guessing.
 * All of it is pure code (the app passes in how to measure a character), so it is tested without a browser.
 */
import { EXPRESSION_MARKER, expressionRule } from './expressions.js';
import { ACTING_MARKER, actingRule } from './acting.js';
import { DIRECTOR_MARKER, directorRule } from './director.js';
import { SHOTS_MARKER, shotRule } from './shots.js';
import { ART_MARKER, artDirectionRule } from './engage.js';
import { creatureRule } from './creatures.js';
import { CAST_MARKER, castRule } from './cast-identity.js';

export const CHARACTER_MARKER = 'CHARACTER GUARANTEE';
export { EXPRESSION_MARKER, expressionRule, ACTING_MARKER, actingRule };
export const BUILTIN_STYLES = ['original', 'stickman', 'human', 'doodle'];
const STYLE_NAME = { original: 'the default character', stickman: 'the stickman', human: 'a Human character', doodle: 'a Doodle character' };

export const SCENE_PRECISION_MARKER = 'SCENE PRECISION';
export const SCENE_PRECISION_RULE = `SCENE PRECISION (very important):
- Work scene by scene and give each scene your full attention, however long the video is (even 25 or 30 minutes). Never rush, never pad, never repeat a scene to fill time.
- Every scene must show exactly what the narration of that moment says: the right place, the right people, the right props, the right emotion. Before writing a scene, ask: what does the viewer need to SEE while hearing these words?
- Every scene needs its own staging: a clear location, where each person stands, who is talking, who is reacting, a camera move that suits the feeling, and at least one piece of real acting (a walk, a gesture, a look, a reaction), not people standing still.
- Design every character for the story (age, job, clothes, colours, personality) so no two people look or act alike, and keep each one identical in every scene they appear in. Characters talk with their mouths, react to each other, turn to look at who is speaking and move through the space.`;

/** Rule added to every prompt that asks an AI for scene code. */
export function characterRule(selected = 'original') {
  const sel = BUILTIN_STYLES.includes(selected) ? selected : '';
  return `${CHARACTER_MARKER} (very important, read twice):
- EVERY scene must have at least one visible character in its characters list, for the whole scene, standing on screen (x 300 to 1300 on a wide canvas, the same wide stage on a vertical one, the app fits them, scale 0.4 or bigger). A scene with only captions, props or a graphic and nobody on screen is a failed scene. Even a chart or headline scene needs a host or a reacting character beside it.
- Never use a character name, custom character or style that you did not define in the file yourself.
- If the user chose a reference-image character but NO reference image was attached or you cannot use it, do not leave the cast empty and do not invent half a character. Pick the best fit from the characters this app already has: the default character, the stickman (character:'stickman'), Human (character:'human') or Doodle (character:'doodle')${sel ? '. The user picked ' + STYLE_NAME[sel] + ', so use that one' : ''}. Use the same one in every scene.
- Whatever happens, the video must end with a character in every scene. Never skip the cast to save space.

${SCENE_PRECISION_RULE}`;
}

/* ---------- exact character size, sent to the AI so it can scale and place people (and the things around them) correctly ---------- */
export const SIZE_MARKER = 'CHARACTER SIZE GUIDE';
/** Measured in the app: how big one person is at scale 1 on the 1600 x 900 scene canvas (feet on the ground line). Every style is drawn to the same standing height on purpose. */
export const CHARACTER_DIMENSIONS = Object.freeze({
  original: Object.freeze({ name: 'the default character', height: 600, width: 333, note: 'round head, arms out a little' }),
  stickman: Object.freeze({ name: 'the stickman', height: 596, width: 229, note: 'thin body, round head' }),
  human: Object.freeze({ name: 'the Human character', height: 603, width: 180, note: 'lifelike proportions, narrow when facing the camera' }),
  doodle: Object.freeze({ name: 'the Doodle character', height: 580, width: 431, note: 'big head and wide shoulders, so it needs more room sideways' }),
  custom: Object.freeze({ name: 'the custom character', height: 640, width: 260, note: 'drawn by the file itself, about 640 tall at scale 1' }),
});
export const FRAME = Object.freeze({
  wide: Object.freeze({ w: 1600, h: 900, ground: 790, safeX: [160, 1440] }),
  tall: Object.freeze({ w: 506, h: 900, ground: 790, safeX: [547, 1053] }),
});

const r0 = (n) => Math.round(n);

/**
 * The size guide for the chosen character style and screen shape.
 * @param {{style?:string, aspect?:string}} o   style: original | stickman | human | doodle | custom | builder; aspect: '16:9' | '9:16'
 */
export function characterSizeBlock({ style = 'original', aspect = '16:9' } = {}) {
  const key = style === 'builder' ? 'custom' : (CHARACTER_DIMENSIONS[style] ? style : 'original');
  const d = CHARACTER_DIMENSIONS[key];
  const tall = aspect === '9:16';
  const f = tall ? FRAME.tall : FRAME.wide;
  const g = f.ground;
  const row = (s) => `scale ${s}: ${r0(d.height * s)} tall, ${r0(d.width * s)} wide, head top at y ${r0(g - d.height * s)}`;
  const H = (s) => r0(d.height * s);
  const sizes = tall ? [0.95, 0.85, 0.7] : [0.95, 0.85, 0.7, 0.5];
  const lines = [
    `${SIZE_MARKER} (exact numbers from the app, use them to place and scale everything):`,
    `- The scene canvas is 1600 x 900 units. ${tall ? 'This film is VERTICAL 9:16: the phone shows a tall strip of the canvas. Write people on the normal wide stage (x 300 to 1300) with room between them; the app scales them down, staggers them in rows and frames the group so nobody overlaps. Do not squeeze them together.' : 'This film is WIDE 16:9: the whole canvas shows. Keep people between x 160 and 1440.'}`,
    `- The ground line is y ${g}. A character's feet stand on ground (default ground:${g}); y grows downwards.`,
    `- You chose ${d.name}: ${d.height} units tall at scale 1 and about ${d.width} wide (${d.note}). Size grows with scale, so height = ${d.height} x scale and the head top is at y = ${g} - ${d.height} x scale. ${sizes.map(row).join('; ')}.`,
    `- Pick the scale from the shot: ${tall ? 'one or two people 0.8 to 0.95 (never below 0.7), three people 0.7 to 0.85' : 'one or two people 0.8 to 0.95 (never below 0.7), three or four 0.6 to 0.75, a crowd 0.35 to 0.5'}. Far-away people use par and a smaller scale on purpose. Never draw a main person tiny.`,
    `- Spacing: neighbours stand at least ${r0(d.width * (tall ? 0.85 : 0.85) * 0.9)} units apart centre to centre at scale ${'0.85'} (more at bigger scales) so bodies never overlap by accident.`,
    `- Size every object against the person (H = the person's height in units, ${H(0.85)} at scale ${'0.85'}): door 1.15 H tall and 0.45 H wide; desk or counter top at 0.45 H high; chair seat 0.27 H; table 0.42 H high; window 0.55 H tall; blackboard 0.6 H tall and 1.4 H wide; laptop 0.07 H tall; phone in a hand 0.14 H long; exam paper or book 0.17 H; car 0.65 H tall and 2.4 H long; the head is about 0.16 H tall. Held things sit at hand height (about 0.5 H to 0.6 H above the ground) and a speech bubble sits just above the head top.`,
    `- Build every set to match: the floor starts at about y ${g - 30}, so the set's floor line and the characters' ground line are the same line, and furniture and doorways are drawn at the sizes above. Nothing floats and nothing is a toy next to a person.`,
    `- If a drawing of yours (SVGS.*) is for something people hold or stand beside, draw it at that real size around (0,0) = where it touches the ground.`,
  ];
  return lines.join('\n');
}

export function adaptPromptForCharacters(text, selected = 'original', opts = {}) {
  let src = String(text ?? '');
  if (!src) return src;
  if (!src.includes(CHARACTER_MARKER)) src = src + '\n\n' + characterRule(selected);
  if (!src.includes(CAST_MARKER)) src = src + '\n\n' + castRule();
  src = withFacialActing(src, selected);
  return withCharacterSize(src, selected, opts.aspect);
}

/** Adds the facial acting rule once (safe to call on a prompt that already has it): the AI directs the faces, not only the bodies. */
export function withFacialActing(text, style = 'original') {
  const src = String(text ?? '');
  if (!src) return src;
  let out = src;
  if (!out.includes(EXPRESSION_MARKER)) out = out.trimEnd() + '\n\n' + expressionRule(style);
  // the short body-acting card goes last: models follow the end of a long prompt best
  if (!out.includes(ACTING_MARKER)) out = out.trimEnd() + '\n\n' + actingRule();
  // guided prompts carry the named-shot block instead (it covers the director's rule in fewer words)
  if (!out.includes(DIRECTOR_MARKER) && !out.includes(SHOTS_MARKER)) out = out.trimEnd() + '\n\n' + directorRule();
  if (!out.includes(SHOTS_MARKER)) out = out.trimEnd() + '\n\n' + shotRule({ tall: /aspect:\s*'9:16'|VERTICAL 9:16/.test(out) });
  if (!out.includes(ART_MARKER)) out = out.trimEnd() + '\n\n' + artDirectionRule();
  if (!out.includes('ANIMALS AND CREATURES (')) out = out.trimEnd() + '\n\n' + creatureRule();
  return out;
}

/** Adds the size guide once (safe to call on a prompt that already has it). */
export function withCharacterSize(text, style = 'original', aspect = '16:9') {
  const src = withFacialActing(String(text ?? ''), style);
  if (!src || src.includes(SIZE_MARKER)) return src;
  return src.trimEnd() + '\n\n' + characterSizeBlock({ style, aspect });
}

/** Which built-in character to use when the file has none that can be drawn. */
export function pickFallbackStyle({ selected = '', fileStyle = '' } = {}) {
  const fs = String(fileStyle || '').toLowerCase();
  if (BUILTIN_STYLES.includes(fs)) return fs;
  if (BUILTIN_STYLES.includes(selected)) return selected;
  return 'original';
}
const styleValue = (s) => (s === 'original' ? '' : s);

const num = (v, d) => (Number.isFinite(+v) && v !== null && v !== '' && v !== true && v !== false ? +v : d);
const chars = (s) => (s && Array.isArray(s.characters) ? s.characters.filter((c) => c && typeof c === 'object') : []);
const firstCustom = (customs) => Object.keys(customs || {})[0] || '';

/**
 * Checks and repairs every scene (and the thumbnail) in place.
 * opts: { style, customs, selected, idle, probe(character, time, scene) -> {x, s, shown}, wide }
 * Returns { style, repairs: string[] }
 */
export function guardScenes(SC, opts = {}) {
  const { customs = {}, selected = '', idle = null, probe = null, wide = true } = opts;
  const repairs = [];
  const note = (m) => { if (repairs.length < 60 && !repairs.includes(m)) repairs.push(m); };
  const list = Array.isArray(SC) ? SC : [];
  const hasCustoms = Object.keys(customs).length > 0;
  let style = String(opts.style || '');
  const fallback = pickFallbackStyle({ selected, fileStyle: style });
  const fbName = STYLE_NAME[fallback];

  // 1) a reference-image style with nothing drawn: use a character the app already has
  if (style === 'custom' && !hasCustoms) {
    style = styleValue(fallback);
    note('The file asked for a reference-image character but did not define one. Used ' + fbName + ' instead.');
  }

  const fixOne = (c, sc, n) => {
    // a custom character that was never defined
    if (c.custom != null && c.custom !== '' && !customs[String(c.custom)]) {
      if (hasCustoms) { const to = firstCustom(customs); note('Scene ' + n + ': character "' + c.custom + '" was not defined. Used "' + to + '" instead.'); c.custom = to; }
      else { const gone = c.custom; delete c.custom; if (!c.style && !c.type && fallback !== 'original') c.style = fallback; note('Scene ' + n + ': character "' + gone + '" was not defined. Used ' + fbName + ' instead.'); }
    }
    if (style !== 'custom' && c.style === 'custom' && !hasCustoms) { delete c.style; note('Scene ' + n + ': a reference-image character was not defined. Used ' + fbName + ' instead.'); }
    const x = num(c.x, NaN); if (!Number.isFinite(x)) { if (c.x !== undefined) note('Scene ' + n + ': a character had no usable position. Placed on screen.'); c.x = 800; }
    const g = num(c.ground, NaN); if (!Number.isFinite(g) || g < 300 || g > 1100) { if (c.ground !== undefined) note('Scene ' + n + ': a character stood off the ground line. Moved back.'); c.ground = 790; }
    const s = num(c.scale, NaN);
    if (c.scale !== undefined && (!Number.isFinite(s) || s < 0.12 || s > 3)) { note('Scene ' + n + ': a character was too small or too big to see. Resized.'); c.scale = 0.6; }
    // a person who is one of the main people in a shot stays big enough to read (crowds and far-away people may be small on purpose)
    { const few = chars(sc).length <= 3; const sv = num(c.scale, NaN); const floor = few ? (wide ? 0.78 : 0.88) : (wide ? 0.5 : 0.6);   // the main people fill the frame like a real shot (about half its height or more)
      if (Number.isFinite(sv) && sv >= 0.12 && sv < floor && !(c.par < 0) && !c.far) { c.scale = floor; note('Scene ' + n + ': a character was drawn very small. Made bigger so it can be seen.'); } }
    if (c.show !== undefined) {
      const sh = c.show;
      const ok = Array.isArray(sh) && Number.isFinite(+sh[0]) && Number.isFinite(+sh[1]) && +sh[1] > +sh[0] && +sh[0] < sc.duration;
      if (!ok) { delete c.show; note('Scene ' + n + ': a character had a broken show time. It now stays on screen.'); }
    }
  };

  const visibleIn = (sc) => {
    const cs = chars(sc);
    if (!cs.length) return false;
    if (!probe) return true;
    const d = Math.max(0.5, +sc.duration || 5);
    for (const c of cs) {
      for (const f of [0.02, 0.25, 0.5, 0.75, 0.97]) {
        let r = null;
        try { r = probe(c, d * f, sc); } catch (e) { r = null; }
        if (!r) return true; // cannot measure: do not claim it is hidden
        if (r.shown !== false && Number.isFinite(r.x) && r.x > -60 && r.x < 1660 && (!Number.isFinite(r.s) || r.s >= 0.1)) return true;
      }
    }
    return false;
  };

  const makeDefault = (n, slot = 0, count = 1) => {
    const base = 800;
    const spread = count > 1 ? (slot - (count - 1) / 2) * 260 : 0;
    const c = { look: {}, x: base + spread, ground: 790, scale: wide ? 0.62 : 0.8 };
    if (fallback !== 'original') c.style = fallback;
    if (typeof idle === 'function') c.animate = (t) => idle(t, slot);
    return c;
  };

  const cloneFrom = (src) => {
    const out = [];
    const keep = chars(src).slice(0, 2);
    keep.forEach((c, i) => {
      const k = { ...c };
      delete k.show;
      delete k.flip;
      k.x = 800 + (keep.length > 1 ? (i - (keep.length - 1) / 2) * 260 : 0);
      k.ground = Number.isFinite(+c.ground) ? +c.ground : 790;
      k.scale = wide ? Math.min(0.75, Math.max(0.45, num(c.scale, 0.6))) : Math.min(1, Math.max(0.6, num(c.scale, 0.8)));
      if (typeof idle === 'function') k.animate = (t) => idle(t, i);
      out.push(k);
    });
    return out;
  };

  list.forEach((sc, i) => {
    if (!sc || typeof sc !== 'object') return;
    const n = i + 1;
    sc.characters = Array.isArray(sc.characters) ? sc.characters.filter((c) => c && typeof c === 'object') : [];
    sc.characters.forEach((c) => fixOne(c, sc, n));
    if (visibleIn(sc)) return;
    if (sc.chapter === true && !sc.characters.length) return;   // a black chapter card is a title, not a scene: nobody stands behind the words
    const had = sc.characters.length;
    // nearest scene that does have someone to show: before, then after
    let src = null;
    for (let j = i - 1; j >= 0 && !src; j--) if (list[j] && chars(list[j]).length && (list[j].__guardOk || visibleIn(list[j]))) src = list[j];
    for (let j = i + 1; j < list.length && !src; j++) if (list[j] && chars(list[j]).length && visibleIn(list[j])) src = list[j];
    const add = src ? cloneFrom(src) : [makeDefault(n)];
    sc.characters = had ? sc.characters.concat(add) : add;
    sc.__guardOk = true;
    note(had
      ? 'Scene ' + n + ': its character was never on screen. Added ' + (src ? 'the same cast from a nearby scene' : fbName) + '.'
      : 'Scene ' + n + ' had no character, only captions. Added ' + (src ? 'the same cast from a nearby scene' : fbName) + '.');
  });

  if (opts.TH && typeof opts.TH === 'object') {
    const th = opts.TH;
    th.characters = Array.isArray(th.characters) ? th.characters.filter((c) => c && typeof c === 'object') : [];
    th.characters.forEach((c) => fixOne(c, { duration: 10 }, 'thumbnail'));
    if (!th.characters.length) {
      const src = list.find((s) => chars(s).length);
      th.characters = src ? cloneFrom(src).slice(0, 1).map((c) => { c.scale = 0.9; c.x = 560; return c; }) : [makeDefault('thumbnail')];
      note('The thumbnail had no character. Added one.');
    }
  }
  list.forEach((s) => { if (s) delete s.__guardOk; });
  return { style, repairs };
}

/**
 * Two different people must never share a seed (the seed is the face). If a file gives different looks the same seed,
 * the later one gets a new seed, and the same look keeps the same new seed in every scene. Returns how many were changed.
 */
const SIG_SKIP = new Set(['expression', 'mouth', 'brow', 'talk', 'view', 'flip', 'x', 'animate', 'ground', 'scale']);
export function dedupeCastSeeds(SC) {
  const bySeed = new Map(), remap = new Map();
  let changed = 0;
  const sigOf = (l) => JSON.stringify(Object.keys(l).filter((k) => !SIG_SKIP.has(k)).sort().map((k) => [k, l[k]]));
  for (const sc of Array.isArray(SC) ? SC : []) {
    for (const c of chars(sc)) {
      const l = c.look;
      if (!l || typeof l !== 'object' || l.seed === undefined || !Number.isFinite(+l.seed)) continue;
      const sig = sigOf(l), rk = sig;
      if (remap.has(rk)) { if (+l.seed !== remap.get(rk)) { c.look = { ...l, seed: remap.get(rk) }; } continue; }
      let s = Math.floor(+l.seed);
      while (bySeed.has(s) && bySeed.get(s) !== sig) s = (s + 7919) % 2147483647 || 1;
      bySeed.set(s, sig); remap.set(rk, s);
      if (s !== Math.floor(+l.seed)) { c.look = { ...l, seed: s }; changed++; }
    }
  }
  return changed;
}

/* ---------- storyboard check: did the film really draw what the storyboard said to build? ----------
 * The first version only looked for SVGS.<name>. But a good file draws things in many ways: a whole place is SETS.<name>, an animated
 * drawing is a helper function (svgFn: tearPaper(...)), and the app's own items (counter, bars, tag, card, phone, timer...) need no drawing at all.
 * Those were all reported as "never drawn". Now every way of drawing counts, and the words are matched loosely (tearing = tearPaper).
 */
const BOARD_STOP = new Set(['set', 'scene', 'the', 'a', 'an', 'of', 'with', 'and', 'in', 'on', 'to', 'for', 'at', 'by', 'from', 'into', 'its', 'his', 'her', 'their',
  'red', 'blue', 'green', 'big', 'small', 'new', 'old', 'little', 'large', 'real', 'drawn', 'item', 'prop', 'props', 'background', 'view', 'shot', 'effect', 'effects']);
const stemWord = (w) => {
  let x = String(w || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (x.length > 5 && x.endsWith('ing')) x = x.slice(0, -3);
  else if (x.length > 4 && x.endsWith('ies')) x = x.slice(0, -3) + 'y';
  else if (x.length > 4 && x.endsWith('es')) x = x.slice(0, -2);
  else if (x.length > 3 && x.endsWith('ed')) x = x.slice(0, -2);
  else if (x.length > 3 && x.endsWith('s')) x = x.slice(0, -1);
  return x;
};
const wordsOf = (s) => String(s || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).map((w) => w.toLowerCase()).filter(Boolean);
const sameStem = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

/** Every name the file used to draw or place something. */
export function drawnVocabulary({ svgKeys = [], setKeys = [], castKeys = [], code = '' } = {}) {
  const names = new Set([...svgKeys, ...setKeys, ...castKeys].map(String));
  const src = String(code || '');
  let m;
  const add = (re, i = 1) => { re.lastIndex = 0; while ((m = re.exec(src))) names.add(m[i]); };
  add(/function\s+([A-Za-z_$][\w$]*)\s*\(/g);                                              // helper functions that draw
  add(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g);
  add(/\b(?:SVGS|SETS|CAST)\s*\.\s*([A-Za-z_$][\w$]*)\s*=/g);
  add(/\b(?:SVGS|SETS|CAST)\s*\[\s*['"]([^'"]+)['"]\s*\]\s*=/g);
  add(/\bsvgFn\s*:\s*([A-Za-z_$][\w$]*)/g);
  add(/\[\s*['"]([A-Za-z][\w-]*)['"]\s*,/g);                                                // compact props: ['counter',...] ['bars',...] ['item',...]
  add(/\[\s*['"](?:item|svg)['"]\s*,\s*['"]([A-Za-z][\w-]*)['"]/g);                         // ['item','cross'] ['svg','dog']
  add(/\b(?:s|set|bg)\s*:\s*['"]([A-Za-z][\w-]*)['"]/g);                                    // s:'lectureHall'
  add(/\b(?:type|kind|tag)\s*:\s*['"]([A-Za-z][\w-]*)['"]/g);                               // long-form props
  const stems = new Set();
  names.forEach((n) => wordsOf(n).forEach((w) => { const st = stemWord(w); if (st.length >= 3) stems.add(st); }));
  return stems;
}

/** The list of storyboard "build" items that really were never drawn (and can be told to the person). */
export function findUndrawn(board, scenes, ctx = {}) {
  const notes = [];
  const list = Array.isArray(board) ? board : [];
  const nb = list.length, ns = Array.isArray(scenes) ? scenes.length : 0;
  if (nb && Math.abs(nb - ns) > Math.max(1, ns * 0.1)) notes.push('The storyboard planned ' + nb + ' scene' + (nb > 1 ? 's' : '') + ' but the file has ' + ns + '. Check that every planned scene was built.');
  const vocab = drawnVocabulary(ctx);
  list.forEach((b, i) => {
    const bl = Array.isArray(b && b.build) ? b.build : (b && b.build ? [b.build] : []);
    bl.forEach((it) => {
      const text = String(it || '').trim();
      if (!text) return;
      const words = wordsOf(text).filter((w) => !BOARD_STOP.has(w)).map(stemWord).filter((w) => w.length >= 3);
      if (!words.length) return;
      const found = words.some((w) => [...vocab].some((v) => sameStem(w, v)));
      if (!found) notes.push('Scene ' + (i + 1) + ': the storyboard asked for "' + text.slice(0, 40) + '" but it was never drawn (draw it as SVGS.' + (words[words.length - 1] || 'thing') + ' or use a built-in item).');
    });
  });
  return notes;
}
