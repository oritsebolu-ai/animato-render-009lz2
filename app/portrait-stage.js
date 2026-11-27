// PORTRAIT (TikTok 9:16) STAGING: how much room each person gets in the tall frame.
//
// A 9:16 video is a 506-wide window onto a 1600-wide world, but one person is wide: about 430 units for the Original and Doodle looks and
// about 240-260 for Human and Stickman (measured, arms included). The old stage squeezed everybody's position into a narrow column and then
// made them BIGGER, and the camera followed whoever was talking, so two people stood on top of each other and the camera cut one in half.
//
// The new rules (nothing here draws; the player calls these three functions):
//   planStage()   how big may each person be so ALL of them fit with room to spare?  People are scaled DOWN to fit (never up past a
//                 small close-up boost for one person), spread across the whole width in the order the file put them, and three or more
//                 are staggered in two rows (front row, and a smaller back row a little higher) so a crowd does not shrink to nothing.
//   separate()    every frame: nobody is allowed to stand on top of a neighbour. Overlapping people are pushed apart (continuous, so
//                 a walker never jumps).
//   frameGroup()  the camera: the whole group always stays in the picture. A push-in is limited to what still shows everybody; the
//                 camera may drift only inside the spare room; it no longer chases the talker out of the frame.
// Everything is a pure function, so the live preview and the exported video agree frame for frame.

export const V_W = 506;               // width of the tall window, in world units
export const MARGIN = 26;             // empty edge kept on each side
export const GROUP_PAD = 18;          // extra edge kept around the group by the camera
export const BREATH = .93;            // with two or more people, nobody is drawn bigger than 93% of what the file asked for
export const SINGLE_BOOST = 1.0;      // one person alone is never drawn bigger than the file asked for ...
export const SINGLE_FIT = .74;        // ... and never wider than this share of the usable width, so even a lone person has air around them
export const MIN_F = .32;             // never smaller than this (a very large crowd)
export const GAP = .14;               // empty space between neighbours, as a share of a body width
export const BACK_ROW = { scale: .88, up: 84 };

/** Visible width of one person at scale 1 (after the style's own size factor), arms included. Measured on the real renderers. */
export const FOOT = { human: 238, stickman: 258, doodle: 425, original: 432, custom: 320 };

/** Which footprint a person has. `norm` is CharStyles.normalizeStyle (optional). */
export function kindOf(c, sceneStyle, norm) {
  if (c && c.custom != null) return 'custom';
  const rs = String((c && (c.style || c.type)) || sceneStyle || '');
  const ns = typeof norm === 'function' ? norm(rs) : '';
  if (ns === 'human') return 'human';
  if (ns === 'doodle') return 'doodle';
  if (rs === 'stickman') return 'stickman';
  if (rs === 'custom') return 'custom';
  return 'original';
}
/** The style's own size factor the renderer multiplies every scale by (same numbers as the player). */
export const STYLE_K = { human: 1, stickman: .92, doodle: .91, original: .83, custom: 1 };

const sum = (a) => a.reduce((x, y) => x + y, 0);

/**
 * people: [{ k, m, w, g, xs }]   k = index in the scene, m = where the person mostly stands, w = their visible width at the scale the file
 *   asked for, g = ground line, xs = every x they stand on during the scene.
 * Returns { n, f, mid, k, stag, back: Set of k that stand in the back row }.
 *   f   multiply every person's scale by this (<1 shrinks, a little >1 only for one person)
 *   mid, k   the position map: x' = 800 + (x - mid) * k  (the same map is used for props and the camera)
 */
export function planStage(people) {
  const P = (people || []).filter((p) => p && p.w > 0).map((p) => ({ ...p })).sort((a, b) => a.m - b.m);
  const n = P.length;
  const U = V_W - 2 * MARGIN;
  const allX = [].concat(...P.map((p) => (p.xs && p.xs.length ? p.xs : [p.m])));
  const lo = allX.length ? Math.min(...allX) : 800, hi = allX.length ? Math.max(...allX) : 800;
  const out = { n, f: 1, mid: (lo + hi) / 2, k: 1, stag: false, back: new Set(), U };
  if (!n) return out;
  const grounds = P.map((p) => p.g);
  out.stag = n >= 3 && Math.max(...grounds) - Math.min(...grounds) <= 40;   // a file that placed people at different depths on purpose is left alone
  P.forEach((p, j) => { if (out.stag && j % 2 === 1) { p.back = true; out.back.add(p.k); } });
  const wOf = (p) => p.w * (p.back ? BACK_ROW.scale : 1);
  const row = (list) => (list.length ? sum(list.map(wOf)) + (list.length - 1) * GAP * (sum(list.map(wOf)) / list.length) : 0);
  const avg = sum(P.map(wOf)) / n;
  const need = Math.max(row(P.filter((p) => !p.back)), row(P.filter((p) => p.back))) + (out.stag ? .5 * avg : 0);
  const span = hi - lo;
  P.forEach((p, j) => { p.o = j; p.mob = p.xs && p.xs.length > 1 && Math.max(...p.xs) - Math.min(...p.xs) > 30 ? 1 : .25; });
  const place = (f) => {
    // spread everybody across the width the window leaves them, in the order and relative spacing the file gave
    const room = Math.max(0, U - avg * f * (out.stag ? 1.5 : 1)), k = n === 1 || span < 1 ? 1 : Math.min(1.6, room / span);
    const it = P.map((p) => ({ o: p.o, mob: p.mob, back: !!p.back, gx: 800 + (p.m - out.mid) * k, hw: wOf(p) * f / 2 }));
    separate(it);
    return { k, width: Math.max(...it.map((i) => i.gx + i.hw)) - Math.min(...it.map((i) => i.gx - i.hw)) };
  };
  let f = Math.max(MIN_F, n === 1 ? Math.min(SINGLE_BOOST, (U * SINGLE_FIT) / need) : Math.min(BREATH, U / need));
  let r = place(f);
  for (let i = 0; i < 24 && r.width > U && f > MIN_F; i++) { f = Math.max(MIN_F, f * .95); r = place(f); }   // the plan checks its own result: spaced out, the group must still fit
  out.f = f; out.k = r.k;
  out.ord = {}; out.mob = {};
  P.forEach((p) => { out.ord[p.k] = p.o; out.mob[p.k] = p.mob; });
  return out;
}

/** Spacing the neighbours need between their centres (same row: touching plus a gap; other row: they may overlap in depth). */
const needed = (a, b) => {
  const full = a.hw + b.hw + GAP * 2 * Math.min(a.hw, b.hw);
  return !!a.back === !!b.back ? full : full * .7;
};

/**
 * items: [{ gx, hw, back, o, mob }] (hw = half the visible width at the scale the person is drawn; o = place in the file's left-to-right
 * order; mob = how much this person may be moved, 1 for a walker, less for somebody standing).
 * Mutates gx so nobody overlaps a neighbour. The order of the FILE is kept, so two people who cross paths never swap places in one frame:
 * the walker stops short of the other, who gives way only a little. A few relaxation passes; continuous in the inputs.
 */
export function separate(items) {
  const L = (items || []).filter((i) => i && i.hw > 0);
  if (L.length < 2 || L.length > 12) return items;
  L.forEach((i, idx) => { if (i.o === undefined) i._o = idx; });
  const ord = (i) => (i.o !== undefined ? i.o : i._o);
  L.sort((a, b) => (L.every((i) => i.o === undefined) ? a.gx - b.gx : ord(a) - ord(b)));
  for (let pass = 0; pass < 10; pass++) {
    let moved = false;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < Math.min(L.length, i + 3); j++) {
      const a = L[i], b = L[j], need = needed(a, b), d = b.gx - a.gx;
      if (d < need - .01) {
        const wa = a.mob === undefined ? 1 : a.mob, wb = b.mob === undefined ? 1 : b.mob, t = wa + wb || 1, gap = need - d;
        a.gx -= gap * wa / t; b.gx += gap * wb / t; moved = true;
      }
    }
    if (!moved) break;
  }
  L.forEach((i) => { delete i._o; });
  return items;
}

/**
 * The camera for the tall frame. cam = { z, cx } (what the file / the follow-the-walker rule asked for); group = [{ x, hw }].
 * Returns { z, cx }: everybody stays inside the picture; a push-in is limited to what still shows the whole group.
 */
export function frameGroup(cam, group) {
  const G = (group || []).filter((o) => o && o.hw > 0);
  if (!G.length) return cam;
  const L = Math.min(...G.map((o) => o.x - o.hw)), R = Math.max(...G.map((o) => o.x + o.hw));
  const GW = R - L, GC = (L + R) / 2;
  let z = cam.z;
  if (G.length >= 2) z = Math.min(z, Math.max(1, V_W / (GW + 2 * GROUP_PAD)));   // two or more: never zoom in past showing all of them
  const slack = Math.max(0, (V_W / z - GW - 2 * GROUP_PAD) / 2);                  // spare room each side
  const cx = Math.min(GC + slack, Math.max(GC - slack, cam.cx));
  return { z, cx };
}

// ---------------------------------------------------------------------------------------------------------
// BODY ALWAYS SHOWS: a shot may never zoom in until only a hand (or a nose) fills the tall frame.
// ---------------------------------------------------------------------------------------------------------
export const BODY_H = 598;            // a person stands about this tall at scale 1 (every style, measured)
export const MIN_BODY_SHOWN = .6;     // the tall frame always shows at least this share of the person's height (about head to hip)
export const WORLD_H = 900;

/**
 * The most the 9:16 camera may zoom, given the people in the picture (their drawn scales). The bigger the person is drawn, the less
 * the camera may zoom, so the same share of the body is always visible. The person the camera is near decides (default: the biggest).
 */
export function bodyZoomCap(people, cx) {
  const L = (people || []).filter((p) => p && p.s > 0);
  if (!L.length) return 4.2;
  let m = L[0];
  if (cx != null && isFinite(cx)) L.forEach((p) => { if (Math.abs(p.x - cx) < Math.abs(m.x - cx) - 1e-6) m = p; });
  else L.forEach((p) => { if (p.s > m.s) m = p; });
  return Math.max(1, Math.min(4.2, WORLD_H / (MIN_BODY_SHOWN * BODY_H * m.s)));
}

/** When the zoom was held back, slide the camera from the face/hand it aimed at toward the middle of the body, so the head or the feet
 *  are not left half out of the picture. `k` = how much of the asked zoom was taken away (0..1). */
export function bodyCentreY(cy, zWanted, zCap, person) {
  if (!person || zWanted <= zCap + 1e-6) return cy;
  const k = Math.min(.6, 1 - zCap / zWanted), mid = person.gy - BODY_H * person.s * .55;
  return cy + (mid - cy) * k;
}

// ---------------------------------------------------------------------------------------------------------
// DEPTH PARALLAX: the far background follows the camera a little less than the people do.
// ---------------------------------------------------------------------------------------------------------
export const PAR_PAN = .28;           // the backdrop slides 28% less than the world when the camera pans
export const PAR_ZOOM = .06;          // ... and zooms 6% less when the camera pushes in
export const PAR_BACK_ROW = .05;      // the back row of a crowd drifts a hair less than the front row

/** Transform of the BACKDROP layer for camera c = {x, y, z, r} on a stage FW wide. Pure, so preview and export agree. */
export function backdropCamera(c, FW) {
  const hw = FW / 2, z = Math.max(1, +c.z || 1), zb = 1 + (z - 1) * (1 - PAR_ZOOM);
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const x = cl(800 + ((+c.x || 800) - 800) * (1 - PAR_PAN), Math.min(hw / zb, 800), Math.max(1600 - hw / zb, 800));
  const y = cl(+c.y || 450, 450 / zb, 900 - 450 / zb);
  return { x, y, z: zb, r: +c.r || 0 };
}

export const PORTRAIT_STAGE_MARKER = 'PORTRAIT ROOM TO BREATHE';
