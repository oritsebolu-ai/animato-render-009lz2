/**
 * Pure geometry, hair-derivation, freehand body sculpting, and per-part palette helpers
 * for Animato Stickman Studio's Custom Character Builder (600x1060 vector board).
 */

export const BOARD_W = 600;
export const BOARD_H = 1060;

export const SKIN_PALETTE = [
  '#ffe0c7',
  '#ffd9b8',
  '#f1c27d',
  '#e0ac69',
  '#c68642',
  '#8d5524',
  '#5c3a21',
];

export const HAIR_PALETTE = [
  '#111111',
  '#3b2a1e',
  '#6b3f1d',
  '#a9672b',
  '#e6c35c',
  '#d9d9d9',
  '#e63946',
  '#7b2cbf',
  '#2a9df4',
];

export const GARMENT_PALETTE = [
  '#ffffff',
  '#111111',
  '#2b2d42',
  '#2d3a5a',
  '#4f8cff',
  '#2a9df4',
  '#2fbf71',
  '#ffd400',
  '#ff9f1c',
  '#e63946',
  '#ff6fb5',
  '#7b2cbf',
  '#c2a878',
  '#8d5524',
];

const R1 = (v) => Math.round(v * 10) / 10;
const hyp = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function flattenPoints(pts) {
  const out = [];
  for (const p of pts) {
    out.push(R1(p[0]), R1(p[1]));
  }
  return out;
}

export function chaikin(pts, iterations = 2) {
  let arr = pts.slice();
  for (let k = 0; k < iterations; k++) {
    if (arr.length < 3) break;
    const next = [];
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      const q = arr[(i + 1) % arr.length];
      next.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]]);
      next.push([0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
    }
    arr = next;
  }
  return arr;
}

export function rdpPoints(pts, eps) {
  if (pts.length < 3) return pts;
  let maxDist = 0;
  let splitIdx = 0;
  const [x1, y1] = pts[0];
  const [x2, y2] = pts[pts.length - 1];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  for (let i = 1; i < pts.length - 1; i++) {
    const d =
      len < 4
        ? Math.hypot(pts[i][0] - x1, pts[i][1] - y1)
        : Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len;
    if (d > maxDist) {
      maxDist = d;
      splitIdx = i;
    }
  }
  if (maxDist > eps) {
    const left = rdpPoints(pts.slice(0, splitIdx + 1), eps);
    const right = rdpPoints(pts.slice(splitIdx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [pts[0], pts[pts.length - 1]];
}

export function boundingBoxFromOps(ops) {
  if (!Array.isArray(ops) || !ops.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let hasStroke = false;
  for (const s of ops) {
    if (!s || s.e || s.f || !Array.isArray(s.p) || s.p.length < 2) continue;
    hasStroke = true;
    for (let i = 0; i < s.p.length; i += 2) {
      x0 = Math.min(x0, s.p[i]);
      x1 = Math.max(x1, s.p[i]);
      y0 = Math.min(y0, s.p[i + 1]);
      y1 = Math.max(y1, s.p[i + 1]);
    }
  }
  if (!hasStroke || x0 > x1 || y0 > y1) return null;
  return {
    x0,
    y0,
    x1,
    y1,
    w: x1 - x0,
    h: y1 - y0,
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
  };
}

/**
 * Determine the hair color used on a view (checking front hair fills first, then back hair fills).
 */
export function resolveFrontHairColor(frontView, fallbackColor = '#3b2a1e') {
  if (!frontView || typeof frontView !== 'object') return fallbackColor;
  for (const layerId of ['hairF', 'hairB']) {
    const ops = frontView[layerId];
    if (!Array.isArray(ops)) continue;
    for (let i = ops.length - 1; i >= 0; i--) {
      if (ops[i] && ops[i].f && typeof ops[i].c === 'string' && ops[i].c) {
        return ops[i].c;
      }
    }
  }
  return fallbackColor;
}

/**
 * Measure exact front-view hair geometry relative to the drawn head box
 * so back and side views match the user's haircut proportions and length.
 */
export function analyzeFrontHair(frontView, headBox) {
  const hb = headBox || boundingBoxFromOps(frontView?.head);
  if (!frontView || !hb) {
    return {
      headBox: hb || null,
      hasFrontHair: false,
      hasBackHair: false,
      hasAny: false,
      crownLift: 12,
      sideOverhang: 14,
      bangsY: 0,
      frontLowY: 0,
      backLowY: 0,
      isLongFront: false,
      isLongBack: false,
      hasFill: false,
    };
  }

  const hairFOps = Array.isArray(frontView.hairF) ? frontView.hairF : [];
  const hairBOps = Array.isArray(frontView.hairB) ? frontView.hairB : [];
  const hfB = boundingBoxFromOps(hairFOps);
  const hbB = boundingBoxFromOps(hairBOps);

  const hasFrontHair = Boolean(hfB);
  const hasBackHair = Boolean(hbB);
  const hasAny = hasFrontHair || hasBackHair;
  const hasFill =
    hairFOps.some((s) => s && s.f) || hairBOps.some((s) => s && s.f);

  const rawCrownLift = Math.max(
    hfB ? hb.y0 - hfB.y0 : 0,
    hbB ? hb.y0 - hbB.y0 : 0
  );
  const crownLift = clamp(
    rawCrownLift > 0 ? rawCrownLift : hb.h * 0.1,
    hb.h * 0.06,
    hb.h * 0.48
  );

  const rawSideOverhang = Math.max(
    hfB ? Math.max(hb.x0 - hfB.x0, hfB.x1 - hb.x1) : 0,
    hbB ? Math.max(hb.x0 - hbB.x0, hbB.x1 - hbB.x1) : 0
  );
  const sideOverhang = clamp(
    rawSideOverhang > 0 ? rawSideOverhang : hb.w * 0.09,
    hb.w * 0.06,
    hb.w * 0.42
  );

  // Sample front-hair points over the central forehead band to detect bangs height accurately.
  let bangsBottom = hb.y0 + hb.h * 0.24;
  if (hfB) {
    const midLeft = hb.x0 + hb.w * 0.22;
    const midRight = hb.x1 - hb.w * 0.22;
    const eyeLineY = hb.cy - hb.h * 0.04;
    let lowestForeheadY = -Infinity;
    for (const s of hairFOps) {
      if (!s || s.e || s.f || !Array.isArray(s.p)) continue;
      for (let i = 0; i < s.p.length; i += 2) {
        const px = s.p[i];
        const py = s.p[i + 1];
        if (px >= midLeft && px <= midRight && py >= hb.y0 - crownLift && py <= eyeLineY) {
          if (py > lowestForeheadY) lowestForeheadY = py;
        }
      }
    }
    if (lowestForeheadY > -Infinity) {
      bangsBottom = clamp(lowestForeheadY, hb.y0 + hb.h * 0.08, hb.cy - hb.h * 0.05);
    }
  }

  const frontLowY = hfB ? hfB.y1 : hb.y1;
  const backLowY = hbB ? hbB.y1 : frontLowY;

  return {
    headBox: hb,
    hasFrontHair,
    hasBackHair,
    hasAny,
    crownLift,
    sideOverhang,
    bangsY: bangsBottom,
    frontLowY,
    backLowY,
    isLongFront: Boolean(hfB && hfB.y1 > hb.y1 + hb.h * 0.12),
    isLongBack: Boolean(hbB && hbB.y1 > hb.y1 + hb.h * 0.12),
    hasFill,
  };
}

/**
 * Derive a complete back-view wig around the entire head using the front hair (or front+back hair)
 * and exact front hair color, so back view never shows a bald patch.
 */
export function buildBackViewWig(frontView, headBox, hairColor = '#3b2a1e', canvasHeight = BOARD_H) {
  const info = analyzeFrontHair(frontView, headBox);
  const hb = info.headBox;
  if (!hb || !info.hasAny) {
    return null;
  }

  const cx = hb.cx;
  const cy = hb.cy;
  const rx = hb.w / 2;
  const ry = hb.h / 2;
  const rxWig = rx + Math.max(8, info.sideOverhang);
  const topY = Math.max(12, hb.y0 - info.crownLift);
  const ryTop = cy - topY;

  // Determine overall back hair length:
  // - If front has no back hair, build a complete wig from front hair wrapping down to the nape or long hem.
  // - If front has back hair, carry the full combined silhouette to backLowY/frontLowY.
  const targetLowY = info.hasBackHair
    ? Math.max(hb.y1 + hb.h * 0.05, info.backLowY, info.frontLowY)
    : info.isLongFront
      ? Math.max(hb.y1 + hb.h * 0.18, info.frontLowY)
      : Math.max(hb.y1 + hb.h * 0.04, Math.min(hb.y1 + hb.h * 0.16, info.frontLowY));

  const bottomY = Math.min(canvasHeight - 50, targetLowY);
  const isLongWig = bottomY > hb.y1 + hb.h * 0.1;

  const pts = [];
  // Upper crown arch (PI -> 2*PI)
  const crownSteps = 26;
  for (let i = 0; i <= crownSteps; i++) {
    const t = Math.PI + (i / crownSteps) * Math.PI;
    pts.push([cx + Math.cos(t) * rxWig, cy + Math.sin(t) * ryTop]);
  }

  if (isLongWig) {
    // Full curtain down right side, gently contoured hem, back up left side
    pts.push([cx + rxWig * 1.03, cy + (bottomY - cy) * 0.55]);
    const hemSteps = 12;
    for (let i = 0; i <= hemSteps; i++) {
      const k = i / hemSteps;
      const hx = cx + rxWig * 1.02 - 2 * rxWig * 1.02 * k;
      const hy = bottomY + Math.sin(k * Math.PI) * Math.min(18, hb.h * 0.08);
      pts.push([hx, hy]);
    }
    pts.push([cx - rxWig * 1.03, cy + (bottomY - cy) * 0.55]);
  } else {
    // Complete skull-covering short/medium wig with clean rounded nape
    const ryBot = bottomY - cy;
    const botSteps = 22;
    for (let i = 1; i < botSteps; i++) {
      const t = (i / botSteps) * Math.PI;
      pts.push([cx + Math.cos(t) * rxWig, cy + Math.sin(t) * ryBot]);
    }
  }

  const closed = pts.concat([pts[0].slice()]);
  const fillX = Math.round(cx);
  const fillY = Math.round(topY + (bottomY - topY) * 0.42);

  return {
    hairF: [
      { p: flattenPoints(closed), w: 5, e: 0, t: 1, b: 1 },
      { f: 1, x: fillX, y: fillY, c: hairColor, b: 1 },
    ],
    hairB: [],
    color: hairColor,
    bounds: { x0: cx - rxWig, y0: topY, x1: cx + rxWig, y1: bottomY },
  };
}

/**
 * Calculate precision side-view hair placement fitted to the side-facing (+x) head.
 * Produces a complete fitted cap+fringe+back-of-head `hairF` when no `hairB` exists,
 * and interlocking `hairF` + `hairB` when `hairB` exists.
 */
export function buildSideViewHair(frontView, headBox, hairColor = '#3b2a1e', canvasHeight = BOARD_H) {
  const info = analyzeFrontHair(frontView, headBox);
  const hb = info.headBox;
  if (!hb || !info.hasAny) {
    return null;
  }

  const cx = hb.cx;
  const cy = hb.cy;
  const rx = hb.w / 2;
  const ry = hb.h / 2;

  const topY = Math.max(12, hb.y0 - info.crownLift);
  const backPad = Math.max(8, Math.min(rx * 0.42, info.sideOverhang));
  const backX = cx - rx - backPad;
  const bangY = clamp(info.bangsY, hb.y0 + hb.h * 0.08, cy - ry * 0.08);

  // Side face points RIGHT (+x): forehead front edge sits near cx + rx * 0.96, eye near cx + rx * 0.5
  const foreheadX = cx + rx * 0.94;
  const earX = cx - rx * 0.14;
  const templeX = cx + rx * 0.16;
  const templeY = cy - ry * 0.06;

  // Determine how low the side hair sweeps at the back-left (-x) of the skull
  const napeBaseY = hb.y1 - ry * 0.06;
  const frontHairBackDrop =
    !info.hasBackHair && info.isLongFront
      ? Math.min(canvasHeight - 50, info.frontLowY)
      : clamp(Math.max(napeBaseY, info.frontLowY), napeBaseY, hb.y1 + ry * 0.28);

  let frontPoly = [];
  if (info.hasFrontHair || !info.hasBackHair) {
    const rawPts = [];
    // 1. Crown arc from front forehead hairline up over top to back-left skull
    const crownSteps = 14;
    const ryCrown = cy - topY;
    for (let i = 0; i <= crownSteps; i++) {
      const a = -0.18 * Math.PI - (i / crownSteps) * 0.82 * Math.PI; // -0.18PI (forehead) -> -PI (back)
      const px = cx + Math.cos(a) * (a < -0.5 * Math.PI ? rx + backPad : rx * 1.03);
      const py = cy + Math.sin(a) * ryCrown;
      rawPts.push([px, py]);
    }
    // 2. Back-left skull down to nape / long back-of-head drop
    rawPts.push([backX, cy + ry * 0.35]);
    if (!info.hasBackHair && info.isLongFront) {
      rawPts.push([backX - 4, (cy + frontHairBackDrop) * 0.52]);
      rawPts.push([backX + 4, frontHairBackDrop]);
      rawPts.push([cx - rx * 0.06, frontHairBackDrop]);
      rawPts.push([cx - rx * 0.04, hb.y1]);
    } else {
      rawPts.push([backX + backPad * 0.35, frontHairBackDrop]);
      rawPts.push([cx - rx * 0.36, hb.y1 - ry * 0.06]);
    }
    // 3. Around ear / sideburn up to temple and forward across bangs to forehead
    rawPts.push([earX, cy + ry * 0.34]);
    rawPts.push([templeX, templeY]);
    rawPts.push([cx + rx * 0.56, bangY]);
    rawPts.push([foreheadX, Math.min(bangY + ry * 0.04, cy - ry * 0.22)]);

    frontPoly = chaikin(rawPts, 1);
  }

  const hairFOps = frontPoly.length
    ? [
        { p: flattenPoints(frontPoly.concat([frontPoly[0]])), w: 5, e: 0, t: 1, b: 1 },
        {
          f: 1,
          x: Math.round(cx - rx * 0.32),
          y: Math.round(topY + info.crownLift * 0.45 + ry * 0.26),
          c: hairColor,
          b: 1,
        },
      ]
    : [];

  // If user also drew back hair in Front view, derive matching side.hairB behind the head
  let hairBOps = [];
  if (info.hasBackHair) {
    const backDropY = Math.min(canvasHeight - 50, Math.max(hb.y1 + ry * 0.16, info.backLowY));
    const bPts = [
      [cx - rx * 0.25, topY + ry * 0.18],
      [backX - backPad * 0.25, cy - ry * 0.15],
      [backX - backPad * 0.3, (cy + backDropY) * 0.52],
      [backX + 4, backDropY],
      [cx - rx * 0.08, backDropY],
      [cx - rx * 0.05, hb.y1 - ry * 0.1],
    ];
    const smoothB = chaikin(bPts, 1);
    hairBOps = [
      { p: flattenPoints(smoothB.concat([smoothB[0]])), w: 5, e: 0, t: 1, b: 1 },
      {
        f: 1,
        x: Math.round(cx - rx * 0.58),
        y: Math.round(Math.min(backDropY - 12, cy + ry * 0.45)),
        c: hairColor,
        b: 1,
      },
    ];
  }

  return {
    hairF: hairFOps,
    hairB: hairBOps,
    color: hairColor,
    fitMetrics: {
      topY,
      bangY,
      backX,
      foreheadX,
      frontHairBackDrop,
      hasBackHair: info.hasBackHair,
    },
  };
}

/**
 * Sculpt freehand body strokes: preserves irregular shapes (curved waist, wide shoulders,
 * capes, custom torsos) while smoothing hand jitter, closing near-closed shapes for bucket fill,
 * and subtly snapping near-axis-aligned sub-segments into crisp cartoon lines.
 */
export function sculptFreehandBodyStroke(flatPts) {
  if (!Array.isArray(flatPts) || flatPts.length < 6) return flatPts;
  let pts = [];
  for (let i = 0; i < flatPts.length; i += 2) {
    pts.push([flatPts[i], flatPts[i + 1]]);
  }
  if (pts.length < 3) return flatPts;

  let totalLen = 0;
  for (let i = 1; i < pts.length; i++) {
    totalLen += hyp(pts[i], pts[i - 1]);
  }
  if (totalLen < 16) return flatPts;

  const first = pts[0];
  const last = pts[pts.length - 1];
  const closed = pts.length > 6 && hyp(first, last) < Math.max(36, totalLen * 0.25);

  // Uniformly resample (~7px) + light averaging to clear micro-jitter while keeping irregular contour
  const resampled = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const d = hyp(p0, p1);
    const steps = Math.max(1, Math.ceil(d / 7));
    for (let j = 1; j <= steps; j++) {
      resampled.push([
        p0[0] + ((p1[0] - p0[0]) * j) / steps,
        p0[1] + ((p1[1] - p0[1]) * j) / steps,
      ]);
    }
  }
  pts = resampled;

  // Single gentle weighted smoothing pass clears micro-jitter without shrinking drawn flares/corners
  if (pts.length > 2) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      next.push([
        0.2 * pts[i - 1][0] + 0.6 * pts[i][0] + 0.2 * pts[i + 1][0],
        0.2 * pts[i - 1][1] + 0.6 * pts[i][1] + 0.2 * pts[i + 1][1],
      ]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }

  let simplified = rdpPoints(pts, clamp(totalLen * 0.0045, 1.8, 5.0));

  if (closed) {
    simplified = simplified.slice(0, -1);
    if (simplified.length < 3) return flattenPoints(pts);

    // Gentle axis-alignment snap on straight sub-segments (within ~5.5 degrees) without destroying irregular curves
    const n = simplified.length;
    for (let i = 0; i < n; i++) {
      const a = simplified[i];
      const b = simplified[(i + 1) % n];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const segLen = Math.hypot(dx, dy);
      if (segLen > 34) {
        if (Math.abs(dy) < segLen * 0.095) {
          const avgY = (a[1] + b[1]) / 2;
          a[1] = avgY;
          b[1] = avgY;
        } else if (Math.abs(dx) < segLen * 0.095) {
          const avgX = (a[0] + b[0]) / 2;
          a[0] = avgX;
          b[0] = avgX;
        }
      }
    }

    // One gentle Chaikin round for clean cartoon flow, keeping distinct irregular corners crisp
    const smoothed = chaikin(simplified, 1);
    return flattenPoints(smoothed.concat([smoothed[0].slice()]));
  }

  // Open stroke: smooth flow preserving bends & contours
  if (simplified.length > 2) {
    const out = [simplified[0]];
    for (let i = 0; i < simplified.length - 1; i++) {
      const p = simplified[i];
      const q = simplified[i + 1];
      out.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]]);
      out.push([0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
    }
    out.push(simplified[simplified.length - 1]);
    return flattenPoints(out);
  }
  return flattenPoints(simplified);
}

/**
 * Return curated + full garment/skin/hair color swatches for any layer so users can
 * individually color upper body, lower body, arms, legs, feet, and clothes.
 */
export function getPaletteForLayer(layerId) {
  const id = String(layerId || '');
  if (/^(head|neck|hand)/.test(id)) {
    return SKIN_PALETTE.concat(GARMENT_PALETTE.filter((c) => !SKIN_PALETTE.includes(c)));
  }
  if (id.startsWith('hair')) {
    return HAIR_PALETTE.concat(GARMENT_PALETTE.filter((c) => !HAIR_PALETTE.includes(c)));
  }
  if (/^(uLeg|lLeg|foot)/.test(id)) {
    // Denim, dark trousers, shoes, and full colors + skin option
    const ordered = ['#2d3a5a', '#111111', '#2b2d42', '#4f8cff', '#c2a878', '#8d5524', '#e63946', '#2fbf71', '#ffffff', '#ffd400', '#ff6fb5', '#7b2cbf'];
    return ordered.concat(SKIN_PALETTE.slice(0, 4));
  }
  if (/^(body|cloth|uArm|lArm|chest)/.test(id)) {
    return GARMENT_PALETTE.concat(SKIN_PALETTE.slice(0, 5));
  }
  return GARMENT_PALETTE;
}

/**
 * Pick a sensible default Fill color when switching layers without altering look.skin.
 */
export function getDefaultFillForLayer(layerId, look = {}) {
  const id = String(layerId || '');
  if (/^(head|neck|hand)/.test(id)) return look.skin || '#ffd9b8';
  if (id.startsWith('hair')) return look.hair || '#3b2a1e';
  if (/^(uLeg|lLeg)/.test(id)) return look.bottom || '#2d3a5a';
  if (/^foot/.test(id)) return '#222222';
  if (/^(body|cloth|uArm|lArm)/.test(id)) return look.clothes || '#4f8cff';
  if (id === 'pupils') return look.pupil || '#222222';
  if (id === 'eyes') return look.white || '#ffffff';
  return '#ffffff';
}
