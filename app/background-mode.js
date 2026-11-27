// Background: what the pictures behind the characters are made of.
// Pure functions only (no DOM), so they can be unit tested in Node. index.html loads this file and wires it to the page.
//
// There is ONE way now: the AI builds every background itself, in code, as a richly detailed, shaded, lit place (layers, perspective, textures,
// shadows, light shafts) so the film feels like a real place, and the app lights the characters from the same light so they belong in it.
// The old "Realistic" choice (a found photo behind the story) is gone. Real pictures are used only for facts: when the narration names
// something real and checkable, the AI can ask for a picture of it (web search) or of a look (Pinterest) to show on screen for a moment
// (see photo-tags.js and photo-store.js). Every background also gets a quality layer (see polishBackground).

export const BG_STORAGE_KEY = 'stk_bg_mode';
export const BG_MODES = Object.freeze([
  Object.freeze({
    id: 'cartoon',
    label: 'Detailed',
    short: 'Detailed',
    blurb: 'The AI builds every place in rich, shaded detail with real lighting, and shows a real picture only when something factual is named.',
    ready: true,
  }),
]);
export const DEFAULT_BG_MODE = 'cartoon';

/** There is only one background style now. Every old saved name ("realistic", "css", "drawn") becomes it. */
export function normalizeBgMode() {
  return DEFAULT_BG_MODE;
}

export function bgModeInfo(m) {
  const id = normalizeBgMode(m);
  return BG_MODES.find((x) => x.id === id);
}

/** The mode that is really used. */
export function effectiveBgMode(m) {
  return normalizeBgMode(m);
}

/** One short sentence for the screen, saying what the person will get with this choice. */
export function bgModeNote(m) {
  return bgModeInfo(m).blurb;
}

/* ---------- prompt text ---------- */

const LIGHT_RULE = `- LIGHT (the app lights the characters from the same light as your set, so they sit inside the place instead of on top of it): on EVERY beat write light:{x:<where the light source is drawn>, y:<its height>, color:'#hex'} next to m: (the mood). Put the numbers where your lamp, window, sun, screen or fire really is in the set. The app then gives every character a lit side facing that light, a shaded side, a soft shadow on the floor away from it, and the colour of the room. Examples: light:{x:520,y:140,color:'#ffd9a0'} (warm window on the left), light:{x:800,y:60,color:'#fff3d6'} (lamp straight above), light:{x:1250,y:300,color:'#6fa8ff'} (cold screen on the right). A new place or a new time of day means a new light.`;

const FACT_PICTURES = `- REAL PICTURES ARE ONLY FOR FACTS. The background is always drawn by you. When the narration names something real and checkable (a company logo, a product, a coin, a real building, city or landmark, a public figure the story is about, a flag, a map, a headline, a chart), you may show a picture of it for a moment: the compact item ['photo','fact:Nvidia logo', 2, 6.5, {label:'Nvidia'}] (or the prop {photo:'fact:Nvidia logo', show:[2,6.5], label:'Nvidia'}). The app searches the web for 'fact:' pictures and Pinterest for 'mood:' pictures (a look or a feeling: ['photo','mood:rainy neon street',2,6]), places them neatly (never over a face), and the speaker points at them. Name the thing exactly, in 2 to 8 plain words. Use one at a time, only while the words talk about it, and never for invented story things, private people or to fill a scene. Never use a picture as a background.`;

const DETAILED_GUIDED = `BACKGROUND STYLE: DETAILED (you build every place in code; there is no limit to what you can draw). The app draws nothing for you, so every place, object, vehicle, machine, creature and effect comes from your SVG, and the app adds depth and the character lighting on top:
- BUILD EACH PLACE LIKE A REAL ILLUSTRATOR, NEVER A FLAT BACKDROP: at least 6 stacked layers (sky or back wall gradient, far shapes, middle furniture and architecture at real size, floor with perspective lines, the light source with its glow, a dark foreground). Give every surface a lit side and a shaded side with gradients, soft contact shadows where things touch the floor or wall, highlights on glass, wood and metal, and small believable details (grain, tiles, posters, books, plants, cables, stains, dust in a light beam).
- One light source per place, drawn (window, lamp, sun, screen, fire) with a radial glow and a soft light beam, and declared on the beat with light:{x,y,color} so the characters are lit by it.
${LIGHT_RULE}
- Always set m: to match the light and mood of the place (night, rain, warm, cold, storm...). Change location at least every 2 beats and never use the same place 3 beats in a row.
- The ground line and the set's floor are the same line (see CHARACTER SIZE GUIDE), furniture and doors are drawn at real size next to the people, and the bottom quarter stays calm for captions.
- Build depth in every beat: a crowd or foreground figure with par (['crowd',4,'idle',700,{view:'back',scale:0.5,par:-0.25}]) and a light prop (['spot',x,y,260,'#ffd54a',0,5] or ['dim',0.2,0,5]).
- Illustrate what the narration says with drawn icons, items, labels and headlines, so something on screen shows every noun and verb.
${FACT_PICTURES}`;

const DETAILED_FULL = `BACKGROUND STYLE: DETAILED (you build every place in code, with real shading and lighting; there is no limit to what you can draw or animate):
- Never a flat colour, never a plain wall. Every location is a real set of at least 6 stacked layers: sky or back-wall gradient, far shapes (skyline, hills, far wall), middle shapes at real size (furniture, doors, windows, machines, vehicles, trees), a floor with perspective lines and reflections, the light source with glow and a light beam, and a dark foreground silhouette layer.
- SHADING: every object has a lit side and a shaded side (linearGradient or radialGradient, never one flat fill), soft contact shadows where it meets the floor or wall (a dark ellipse or polygon at low opacity), a cast shadow away from the light, highlights on shiny things, reflections in glass and polished floors, ambient occlusion in corners, and a gentle vignette. Add texture with thin lines (wood grain, brick, tile, folds, fabric) and tiny story details (signs, posters, shelves, papers, plants, cables, steam, rain, dust in the light beam).
- Build each set once in SETS.* with the SCN helpers (room, windowPane, skyline, flooring, glow, cone, pendant, dust) plus your own helper functions, then reuse it with a different camera, light and mood. A set can be as large and detailed as the story needs.
- One palette per video: 4 colours plus 1 accent, each with a light and a shadow tone. Outfits and props use the same palette so nothing clashes.
${LIGHT_RULE}
- Every set has a visible, drawn light source (window, lamp, sun, screen, fire) with glow() or cone(), and the beat's light:{x,y,color} points at it so the shading on the characters matches the shading in the set.
- Depth: far props small and soft with par .2 to .4, hero action in the middle, big dark foreground silhouettes with par -.2 to -.35. The characters' feet stand on the set's floor line (see CHARACTER SIZE GUIDE) and furniture is drawn at real size beside them.
- Illustrate every noun and verb of the narration with a drawn icon, item, label, chart or headline, so something on screen always shows what is being said. Invent anything the story needs (a courtroom, a spaceship, a market, a dragon, a machine): if you can describe it you can draw and animate it.
- Keep the bottom quarter calm for captions. No busy detail behind the text.
${FACT_PICTURES}
- For vertical 9:16 films keep overlays within x 250 to 1350 and make fact pictures w:560, h:420 or smaller.`;

/**
 * The background directions added to a prompt.
 * @param {{mode?:string, tier?:'guided'|'full', tall?:boolean}} o
 * @returns {string}
 */
export function backgroundPromptBlock({ tier = 'guided' } = {}) {
  const guided = tier !== 'full';
  return guided ? DETAILED_GUIDED : DETAILED_FULL;
}

/** Puts the block into a finished Full-tier prompt: before the engine reference when there is one, otherwise at the end. */
export function injectBackgroundBlock(prompt, { mode = DEFAULT_BG_MODE, tier = 'full' } = {}) {
  const text = String(prompt || '');
  const block = backgroundPromptBlock({ mode, tier });
  if (!text || text.includes('BACKGROUND STYLE:')) return text;
  const at = text.indexOf('ENGINE REFERENCE:');
  if (at > 0) return `${text.slice(0, at)}${block}\n\n${text.slice(at)}`;
  return `${text.trimEnd()}\n\n${block}\n`;
}

/* ---------- Realistic mode: drawn location words become a found 2D background of the same place ---------- */

/** What each built-in location looks like, as a background painter's brief (used when a file in Realistic mode names a drawn set). */
export const PRESET_SCENE = Object.freeze({
  apartment: 'cozy apartment living room interior', garage: 'garage workshop interior with tools', office: 'modern office interior with desks and windows',
  bank: 'bank hall interior with counters', street: 'city street with shops and sidewalk', cityDay: 'city skyline on a sunny day', rooftop: 'city rooftop at dusk',
  space: 'outer space with planets and stars', stage: 'theater stage with spotlights', lab: 'science laboratory interior', outdoor: 'green park with trees on a sunny day',
  room: 'simple cozy room interior', night: 'quiet city street at night', kitchen: 'home kitchen interior', classroom: 'school classroom interior', school: 'school building entrance',
  park: 'green park with trees', forest: 'forest path', beach: 'sunny beach with sea', hospital: 'hospital corridor', cafe: 'cozy cafe interior', bedroom: 'bedroom interior',
});
const MOOD_WORDS = { night: 'at night', rain: 'in the rain', rainy: 'in the rain', warm: 'warm evening light', dawn: 'at dawn', sunset: 'at sunset', dusk: 'at dusk', snow: 'in the snow', storm: 'in a storm', dark: 'dark and moody', morning: 'in the morning', day: 'daytime', city: '', space: '', fire: 'with fire glow' };

/**
 * The scene tag for a drawn location word in Realistic mode, or '' when the word is not a known place.
 * realisticSceneTag('office', 'night') -> 'photo:scene:modern office interior with desks and windows at night'
 */
export function realisticSceneTag(key, mood = '') {
  const k = String(key || '').trim();
  const base = PRESET_SCENE[k] || PRESET_SCENE[k.toLowerCase()];
  if (!base) return '';
  const m = MOOD_WORDS[String(mood || '').toLowerCase().trim()] || '';
  return `photo:scene:${base}${m && !base.includes(m) ? ' ' + m : ''}`;
}

/* ---------- picture quality: the layer added on top of every drawn background ---------- */

export const POLISH_MARK = 'data-bgpolish';

const POLISH_LAYER = `<g ${POLISH_MARK}="1" pointer-events="none"><defs>
<radialGradient id="bgpL" cx=".5" cy="0" r=".95"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset=".55" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="bgpH" x1="0" y1="0" x2="0" y2="1"><stop offset=".42" stop-color="#bcd0f0" stop-opacity="0"/><stop offset=".72" stop-color="#bcd0f0" stop-opacity=".1"/><stop offset=".86" stop-color="#bcd0f0" stop-opacity="0"/></linearGradient>
<linearGradient id="bgpF" x1="0" y1="0" x2="0" y2="1"><stop offset=".74" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".34"/></linearGradient>
<linearGradient id="bgpT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset=".2" stop-color="#000" stop-opacity="0"/></linearGradient>
<linearGradient id="bgpS" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".055"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>
<rect width="1600" height="900" fill="url(#bgpH)"/>
<polygon points="150,0 420,0 980,900 560,900" fill="url(#bgpS)"/>
<polygon points="520,0 640,0 1180,900 1000,900" fill="url(#bgpS)" opacity=".6"/>
<rect width="1600" height="900" fill="url(#bgpL)"/>
<rect width="1600" height="900" fill="url(#bgpT)"/>
<rect width="1600" height="900" fill="url(#bgpF)"/></g>`;

/** True for the plain black card used for chapter titles and cuts. It is left alone. */
export function isPlainBlack(svg) {
  const s = String(svg || '').replace(/\s+/g, ' ').trim();
  if (!s) return false;
  if (s.length > 400) return false;
  return /^<rect[^>]*fill=["']#0{3}(?:0{3})?["'][^>]*\/?>(<\/rect>)?$/i.test(s) || /^<rect[^>]*fill=["']black["'][^>]*\/?>$/i.test(s);
}

/**
 * Adds soft overhead light, atmospheric haze toward the horizon, light shafts and a shaded floor to a background, so
 * flat drawings look like lit places with depth and the characters stand on the ground instead of floating in front of it.
 * Gradients only (no filters), so it costs nothing while playing and nothing extra when exporting.
 * Safe to call twice and safe on anything that is not an SVG fragment.
 */
export function polishBackground(svg) {
  const s = String(svg || '');
  if (!s.trim() || s.includes(POLISH_MARK) || isPlainBlack(s)) return s;
  return s + POLISH_LAYER;
}
