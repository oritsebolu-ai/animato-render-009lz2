// DEPTH: layers of air between the camera and the set, so every camera move is felt in depth (parallax).
//
//   far motes   tiny specks of dust/light floating in the air BEHIND the people: they slide slower than the people when the camera moves
//   near bokeh  big soft out-of-focus discs of light IN FRONT of everyone: they slide faster than the people and grow when the camera
//               pushes in, like dust or lights right in front of a real lens
// Together with the backdrop that already follows the camera a little less than the people (portrait-stage.js backdropCamera), a pan or
// a push-in now shows three speeds: far, middle, near. That difference IS depth.
//
// No blur filters (they were what made phones stall): soft discs are radial gradients. Pure function of (scene, time, camera), so the
// preview and the exported video match frame for frame.

export const DEPTH_MARKER = 'DEPTH LAYERS';
export const FAR = { n: 16, q: .55, r: [2, 5.5], op: [.25, .6] };     // screen slide per world unit: 55% of the people's
export const NEAR = { n: 5, q: 1.7, r: [36, 80], op: [.09, .18] };    // 170% of the people's (in front of them)

const frac = (v) => v - Math.floor(v);
function rng(seed) { let h = (seed >>> 0) || 1; return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; }; }
export function seedOf(sc, i = 0) {
  const s = String((sc && (sc.name || sc.background && String(sc.background).slice(0, 40))) || '') + '|' + i;
  let h = 2166136261; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const lerp = (a, b, k) => a + (b - a) * k;

/** Palette of the air from the scene's tint: warm light by default, cool at night or in a storm. */
export function airColor(sc) {
  const t = sc && Array.isArray(sc.tint) ? String(sc.tint[0] || '').toLowerCase() : '';
  if (/^#(0|1)/.test(t)) return { dot: '#cfe2ff', glow: '#9cc2ff' };
  if (/^#(ff9|ffa|ffb|ffc|ffd|ffe)/.test(t)) return { dot: '#fff0c8', glow: '#ffd27a' };
  return { dot: '#fff8e6', glow: '#fff1c4' };
}

/**
 * The two depth layers of one frame.
 *   cam = {x, y, z} (the people's camera), FW = stage width (1600 wide, 506 tall format), T = scene time, fx = id prefix
 *   opt.lite = fewer pieces (slow phone)
 * Returns { back, front, defs }:  back is drawn in WORLD space inside the camera group (behind the people);
 * front and defs in SCREEN space above the picture (under the captions).
 */
export function depthLayers(sc, T, cam, FW, fx = '', opt = {}) {
  if (!sc || sc.depth === false) return { back: '', front: '', defs: '' };
  const z = Math.max(1, +cam.z || 1), cx = +cam.x || 800, cy = +cam.y || 450, t = +T || 0;
  const col = airColor(sc), lite = !!opt.lite;
  const W = FW, H = 900, M = 90;
  // FAR MOTES (world space): screen place first, then back into the world through the camera
  let back = '';
  const rf = rng(seedOf(sc, 1)), nf = lite ? Math.round(FAR.n / 2) : FAR.n;
  for (let i = 0; i < nf; i++) {
    const u = rf(), v = rf(), sp = .006 + rf() * .012, ph = rf() * 6.28, rr = lerp(FAR.r[0], FAR.r[1], rf()), op = lerp(FAR.op[0], FAR.op[1], rf());
    const sx = frac(u + t * sp * .6 - (cx - 800) * FAR.q * z / (W + 2 * M)) * (W + 2 * M) - M;
    const sy = frac(v - t * sp - (cy - 450) * FAR.q * z / (H + 2 * M)) * (H + 2 * M) - M;
    const wx = cx + (sx - W / 2) / z, wy = cy + (sy - H / 2) / z;
    const tw = .6 + .4 * Math.sin(t * 1.3 + ph);
    back += `<circle cx="${wx.toFixed(1)}" cy="${wy.toFixed(1)}" r="${(rr / z * (1 + .25 * (z - 1))).toFixed(2)}" fill="${col.dot}" opacity="${(op * tw).toFixed(3)}"/>`;
  }
  // NEAR BOKEH (screen space): faster than the people, bigger when the camera pushes in
  let front = '';
  const rn = rng(seedOf(sc, 2)), nn = lite ? 3 : NEAR.n, gid = fx + 'bk';
  for (let i = 0; i < nn; i++) {
    const u = rn(), v = rn(), sp = .004 + rn() * .006, ph = rn() * 6.28, rr = lerp(NEAR.r[0], NEAR.r[1], rn()), op = lerp(NEAR.op[0], NEAR.op[1], rn());
    // near discs keep to the edges and the top, never over the middle of the picture where the faces are
    const edge = i % 2 ? .08 + .2 * u : .72 + .2 * u;
    const sx = frac(edge + t * sp - (cx - 800) * NEAR.q * z / (W + 2 * M)) * (W + 2 * M) - M;
    const sy = (.08 + .55 * v) * H + Math.sin(t * .4 + ph) * 18 - (cy - 450) * NEAR.q * .35;
    const r = rr * (1 + .55 * (z - 1));
    front += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#${gid})" opacity="${(op * (.75 + .25 * Math.sin(t * .7 + ph))).toFixed(3)}"/>`;
  }
  const defs = `<radialGradient id="${gid}"><stop offset="0" stop-color="${col.glow}" stop-opacity=".9"/><stop offset=".55" stop-color="${col.glow}" stop-opacity=".45"/><stop offset="1" stop-color="${col.glow}" stop-opacity="0"/></radialGradient>`;
  return { back: `<g class="depth-far" pointer-events="none">${back}</g>`, front: `<g class="depth-near" pointer-events="none">${front}</g>`, defs };
}
