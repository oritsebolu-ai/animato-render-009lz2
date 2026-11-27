// Lights the characters like they stand inside the set (pure functions, no DOM, so they are unit tested in Node).
//
// A flat cartoon person pasted onto a lit room looks like a sticker. This gives every character what an object in a real place has:
//   - a lit side that faces the set's light, and a shaded side away from it (soft gradients, clipped to the character's own outline)
//   - a warm or cold highlight in the light's colour, and a little light on the head and shoulders from above
//   - the colour of the room (night is blue, a lamp is warm, a storm is dark) mixed into the character
//   - darkening toward the feet where the body meets the floor (ambient occlusion)
//   - a soft contact shadow under the feet and a longer cast shadow on the floor, away from the light
// Where the light is comes from the scene: `light:{x,y,color}` (the lamp, window, sun or screen the AI drew), else from the mood.
// The shading is drawn with gradients and a mask (no filters), so it plays smoothly and exports exactly as it looks.

export const LIGHT_MARK = 'data-charlight';

/** How each mood lights a person: key = colour of the main light, amb = colour of the room, ambA = how much of it, shade = darkness of the shaded side, keyA = strength of the highlight. */
export const MOOD_LIGHT = Object.freeze({
  night: { key: '#8fa8ff', amb: '#0a1233', ambA: 0.26, shade: 0.46, keyA: 0.34 },
  cold: { key: '#a9c4ff', amb: '#0c2144', ambA: 0.16, shade: 0.38, keyA: 0.3 },
  tense: { key: '#9fb4e8', amb: '#0b1a33', ambA: 0.18, shade: 0.42, keyA: 0.28 },
  rain: { key: '#9db4d8', amb: '#0d192b', ambA: 0.2, shade: 0.44, keyA: 0.26 },
  storm: { key: '#b8c7ff', amb: '#0a1220', ambA: 0.24, shade: 0.5, keyA: 0.32 },
  space: { key: '#7aa0ff', amb: '#05091a', ambA: 0.2, shade: 0.5, keyA: 0.32 },
  dark: { key: '#ffffff', amb: '#000000', ambA: 0.3, shade: 0.56, keyA: 0.24 },
  warm: { key: '#ffc079', amb: '#ff9d42', ambA: 0.1, shade: 0.3, keyA: 0.36 },
  hype: { key: '#ffe27a', amb: '#ffd54a', ambA: 0.06, shade: 0.26, keyA: 0.34 },
  city: { key: '#ffd9a0', amb: '#1c2541', ambA: 0.08, shade: 0.32, keyA: 0.3 },
  calm: { key: '#fff3d6', amb: '#ffe9c4', ambA: 0.04, shade: 0.28, keyA: 0.3 },
  default: { key: '#fff1d0', amb: '#000000', ambA: 0, shade: 0.3, keyA: 0.28 },
});

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (v !== null && v !== '' && v !== true && v !== false && Number.isFinite(+v) ? +v : d);
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const f1 = (n) => (Math.round(n * 10) / 10).toString();
const f2 = (n) => (Math.round(n * 100) / 100).toString();

/** The scene's light as plain numbers: { x, y, key, amb, ambA, shade, keyA, off }. */
export function sceneLight(sc) {
  const s = sc || {};
  const mood = String(s.mood || s.m || '').toLowerCase().trim();
  const base = MOOD_LIGHT[mood] || MOOD_LIGHT.default;
  const out = { x: 480, y: 140, key: base.key, amb: base.amb, ambA: base.ambA, shade: base.shade, keyA: base.keyA, off: false };
  const L = s.light;
  if (L === false || s.lighting === false) { out.off = true; return out; }
  if (typeof L === 'string') {
    const w = L.toLowerCase().trim();
    if (HEX.test(w)) out.key = w;
    else if (w === 'left') { out.x = 200; out.y = 300; }
    else if (w === 'right') { out.x = 1400; out.y = 300; }
    else if (w === 'top' || w === 'above') { out.x = 800; out.y = 40; }
    else if (w === 'front') { out.x = 800; out.y = 450; }
    else if (w === 'back') { out.x = 800; out.y = 450; out.shade = Math.min(0.62, out.shade + 0.16); out.keyA *= 0.6; }
  } else if (L && typeof L === 'object') {
    out.x = clamp(num(L.x, out.x), -400, 2000);
    out.y = clamp(num(L.y, out.y), -200, 1100);
    if (typeof L.color === 'string' && HEX.test(L.color.trim())) out.key = L.color.trim();
    const st = num(L.strength, NaN);
    if (Number.isFinite(st)) { const k = clamp(st, 0, 2); out.keyA = clamp(out.keyA * k, 0, 0.7); out.shade = clamp(out.shade * (0.6 + 0.4 * k), 0, 0.7); }
  }
  return out;
}

/**
 * Lights one character.
 * @param {object} o
 * @param {object} o.scene   the scene (mood, light)
 * @param {number} o.x       where the character stands on screen (scene units)
 * @param {boolean} o.flip   the character is mirrored
 * @param {string} o.id      a unique id prefix for this character in this frame
 * @param {string} o.svg     the character's drawing (centred on x=0, feet at y=880)
 * @param {number} o.height  how tall that drawing is at scale 1 (its head top is at y = 880 - height)
 * @returns {{shadow:string, body:string}}  `shadow` is drawn first (on the floor), `body` is the lit character.
 */
export function lightCharacter({ scene, x = 800, flip = false, id = 'lc', svg = '', height = 640, lite = false } = {}) {
  const L = sceneLight(scene);
  const art = String(svg || '');
  if (L.off || !art.trim()) return { shadow: '', body: art };
  // which way does the light fall on this person, as seen on screen? -1 = from the left, +1 = from the right, 0 = straight on
  const dx = clamp((L.x - num(x, 800)) / 520, -1, 1);
  const front = 1 - Math.abs(dx);                                   // 1 when the light is right in front or above
  const top = clamp(1 - L.y / 700, 0.25, 1);                        // a high light shines on the head and shoulders more
  const sd = flip ? -dx : dx;                                       // the drawing is mirrored when flipped, so mirror the light too
  const hh = clamp(num(height, 640), 300, 900), W = 300, y0 = Math.max(0, Math.round(880 - hh - 14)), y1 = 910, H = y1 - y0, TOPH = Math.round(hh * 0.34);
  const shade = clamp(L.shade * 1.25, 0, 0.64), keyA = clamp(L.keyA * 1.4, 0, 0.62);
  const aL = sd > 0 ? shade * (0.45 + 0.55 * sd) : shade * (0.45 - 0.45 * -sd);   // darkness at the left edge
  const aR = sd < 0 ? shade * (0.45 + 0.55 * -sd) : shade * (0.45 - 0.45 * sd);   // darkness at the right edge
  const mid = shade * (0.12 + 0.2 * Math.abs(sd));
  const hiA = keyA * (0.45 + 0.55 * Math.abs(sd));
  const edge = sd >= 0 ? 'r' : 'l';                                  // which edge is lit
  const gid = (n) => `${id}${n}`;
  const defs =
    `<linearGradient id="${gid('s')}" gradientUnits="userSpaceOnUse" x1="${-W}" y1="0" x2="${W}" y2="0">` +
    `<stop offset="0" stop-color="#0a0f24" stop-opacity="${f2(aL)}"/><stop offset=".5" stop-color="#0a0f24" stop-opacity="${f2(mid)}"/><stop offset="1" stop-color="#0a0f24" stop-opacity="${f2(aR)}"/></linearGradient>` +
    `<linearGradient id="${gid('h')}" gradientUnits="userSpaceOnUse" x1="${edge === 'r' ? W : -W}" y1="0" x2="${edge === 'r' ? W * 0.05 : -W * 0.05}" y2="0">` +
    `<stop offset="0" stop-color="${L.key}" stop-opacity="${f2(Math.min(0.85, hiA * 1.5))}"/><stop offset=".16" stop-color="${L.key}" stop-opacity="${f2(hiA * 0.7)}"/><stop offset=".55" stop-color="${L.key}" stop-opacity="${f2(hiA * 0.22)}"/><stop offset="1" stop-color="${L.key}" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="${gid('t')}" gradientUnits="userSpaceOnUse" x1="0" y1="${y0}" x2="0" y2="${y0 + TOPH}">` +
    `<stop offset="0" stop-color="${L.key}" stop-opacity="${f2(0.2 * top * (0.5 + 0.5 * front) * (keyA / 0.3))}"/><stop offset="1" stop-color="${L.key}" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="${gid('f')}" gradientUnits="userSpaceOnUse" x1="0" y1="${y1 - 240}" x2="0" y2="${y1}">` +
    `<stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${f2(0.2 + shade * 0.22)}"/></linearGradient>` +
    `<radialGradient id="${gid('c')}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".42"/><stop offset=".6" stop-color="#000" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>` +
    `<mask id="${gid('m')}" maskUnits="userSpaceOnUse" x="${-W}" y="${y0}" width="${2 * W}" height="${H}" style="mask-type:alpha"><use href="#${gid('g')}"/></mask>`;
  const light =
    `<g ${LIGHT_MARK}="1" mask="url(#${gid('m')})" pointer-events="none">` +
    (L.ambA > 0 ? `<rect x="${-W}" y="${y0}" width="${2 * W}" height="${H}" fill="${L.amb}" opacity="${f2(L.ambA)}"/>` : '') +
    `<rect x="${-W}" y="${y0}" width="${2 * W}" height="${H}" fill="url(#${gid('s')})"/>` +
    `<rect x="${-W}" y="${y0}" width="${2 * W}" height="${H}" fill="url(#${gid('h')})"/>` +
    `<rect x="${-W}" y="${y0}" width="${2 * W}" height="${TOPH}" fill="url(#${gid('t')})"/>` +
    `<rect x="${-W}" y="${y1 - 240}" width="${2 * W}" height="240" fill="url(#${gid('f')})"/></g>`;
  // the character is drawn ONCE, in place; the mask reads the same group. (Drawing it again with <use> doubled the work of every frame.)
  // lite = a live preview on a phone that cannot keep up: no mask, so the lit-side shading is left out and only the floor shadow stays.
  // Exports never use lite, so the finished video always has the full lighting.
  const body = lite ? art : `<defs>${defs}</defs><g id="${gid('g')}">${art}</g>${light}`;
  // the shadow on the floor: a tight one right under the feet, and a longer one thrown away from the light
  const throwX = -sd * (46 + 44 * Math.abs(sd));                      // away from the light (in the drawing's own mirrored space)
  const long = 118 + 70 * Math.abs(sd);
  const shadow =
    `<g ${LIGHT_MARK}="floor" pointer-events="none"><defs><radialGradient id="${gid('c2')}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity="${f2(0.3 + 0.2 * Math.abs(sd))}"/><stop offset=".7" stop-color="#000" stop-opacity="${f2(0.1)}"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>${''}</defs>` +
    `<ellipse cx="${f1(throwX)}" cy="884" rx="${f1(long)}" ry="${f1(15 + 4 * Math.abs(sd))}" fill="url(#${gid('c2')})"/>` +
    `<ellipse cx="0" cy="882" rx="${f1(64 + 10 * front)}" ry="10" fill="#000" opacity="${f2(0.16 + 0.08 * front)}"/></g>`;
  return { shadow, body };
}
