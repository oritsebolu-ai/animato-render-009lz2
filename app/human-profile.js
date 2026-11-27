// True side (profile) body for the Human style.
//
// The Animato human rig is drawn from front-view art. Turning that art 80 degrees squeezes it: the lapels, both legs
// side by side and both feet pointing at the camera stay visible, so a "side view" looked like a thin front view.
// This module draws the body in real profile instead (chest and back, one shoulder, near and far arm, near and far leg
// with knees, shoes pointing where the person faces), in the person's own colours and clothes. The head still comes
// from the rig's own profile head, so the face is the same person in every view.
//
// Everything is in the rig's character units (head centre near y = -117, feet at G.frame.feet) and faces +x.
// Pure functions, no DOM.

const PI = Math.PI, sin = Math.sin, cos = Math.cos;
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const f1 = (n) => { n = +n; return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0; };
const rad = (d) => d * PI / 180;

function rgb(hex) {
  const s = String(hex || '').trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(s) || /^#?([0-9a-f]{3})$/i.exec(s);
  if (!m) return null;
  let h = m[1]; if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const NAMED = { black: '#1c1c21', white: '#f3f3f1', red: '#b8303a', blue: '#2e62b4', navy: '#1f2c4c', green: '#2f7d4f', yellow: '#e8c33a', orange: '#df7a2e', pink: '#e27aa3', purple: '#6a43a6', brown: '#6b4a33', gray: '#6c7179', grey: '#6c7179', beige: '#d9c7a5', cream: '#efe6d1', teal: '#1d8583', maroon: '#7c1e26', gold: '#c9a13b', silver: '#b9bdc3', khaki: '#a99a6a', olive: '#6a6d38', tan: '#b98d57' };
export function toHex(c, d = '#777777') {
  const s = String(c == null ? '' : c).trim().toLowerCase();
  if (rgb(s)) { const v = rgb(s); return '#' + v.map((x) => x.toString(16).padStart(2, '0')).join(''); }
  for (const k of Object.keys(NAMED)) if (s.includes(k)) return NAMED[k];
  return d;
}
export function shade(hex, k) {
  const v = rgb(toHex(hex)); if (!v) return hex;
  const f = (x) => Math.round(k < 1 ? x * k : x + (255 - x) * (k - 1));
  return '#' + v.map((x) => cl(f(x), 0, 255).toString(16).padStart(2, '0')).join('');
}

// smooth piecewise interpolation through knots [[y, v], ...] (cosine ease between knots, so the outline has no corners)
function curveAt(K, y) {
  if (y <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) {
    if (y <= K[i][0]) { const a = K[i - 1], b = K[i]; const t = (y - a[0]) / Math.max(1e-6, b[0] - a[0]); const s = (1 - cos(t * PI)) / 2; return a[1] + (b[1] - a[1]) * s; }
  }
  return K[K.length - 1][1];
}
const pts = (arr) => arr.map((p) => f1(p[0]) + ' ' + f1(p[1])).join(' L ');

const LONG_TOP = { coat: 1 };
const HIP_TOP = { blazer: 1, suit: 1, jacket: 1, leather: 1, denim: 1, bomber: 1, hoodie: 1, sweater: 1, cardigan: 1 };
const SHORT_SLEEVE = { tshirt: 1, polo: 1, dress: 1 };
const OPEN_FRONT = { blazer: 1, suit: 1, jacket: 1, coat: 1, cardigan: 1, leather: 1, denim: 1, bomber: 1 };
const COLLARED = { shirt: 1, polo: 1, blouse: 1 };

/**
 * Builds the profile body.
 * @param spec   normalised Animato spec (skin, outfit, gender, identity)
 * @param G      rig geometry (headC, faceW, neckW, shoulderY, upperLen, foreLen, handLen, upperW, foreW, waistHalf, hipHalf, frame)
 * @param pose   { arms: [far, near] each {up, fore, hand, lift}, legs: [far, near] each {thigh, shin, foot}, sitting, kneel }
 * @param uid    unique id prefix for clip paths
 * @returns { back, legs, torso, neck, front, drop }  SVG fragments (character units) and how far the body must drop so a foot is on the ground
 */
export function profileBody(spec, G, pose, uid = 'p') {
  const O = (spec && spec.outfit) || {};
  const I = (spec && spec.identity) || {};
  const female = spec && spec.gender === 'female';
  const b = cl(+I.build || 1, .75, 1.3), shK = cl(+I.shoulders || 1, .8, 1.25);
  const skin = toHex(spec && spec.skin, '#c99a6b');
  const type = String(O.type || 'shirt');
  const top = toHex(O.color, '#2e62b4'), inner = toHex(O.inner, '#f3f3f1'), pantsC = toHex(O.pants, '#34373d'), shoeC = toHex(O.shoes, '#2a1d16');
  const accent = toHex(O.accent || O.color, top);
  const bottom = type === 'dress' ? 'dress' : String(O.bottom || 'pants');
  const skirt = /^skirt/.test(bottom) || bottom === 'dress';
  const shorts = bottom === 'shorts';
  const wide = bottom === 'wide' || bottom === 'cargo';
  const line = (c) => shade(c, .62);
  const FAR = .8;                     // the far arm and leg are a little darker, so the body reads as round

  const F = G.frame;
  const cx = -G.faceW * .1;          // the neck and spine sit a little behind the centre of the profile head
  const nw = (G.neckW || 60) * .92;
  const chestY = F.chest, waistY = F.waist, hipY = F.hip, pelvis = F.pelvis, feet = F.feet;
  const shY = G.shoulderY;
  const chestD = 196 * b * (female ? .94 : 1.04) * (.9 + .1 * shK);
  const waistD = Math.max(130, (G.waistHalf || 104) * 1.45) * b;
  const hipD = Math.max(150, (G.hipHalf || 116) * 1.42) * b * (female ? 1.06 : 1);
  const bust = female ? 22 * b : 0;
  const y0 = shY - 46;               // base of the neck

  // ---- torso outline (x as a function of y) ----
  const FRONT = [[y0 - 12, nw * .55], [shY + 18, chestD * .4], [chestY - 10, chestD * .5 + bust * .7], [chestY + 18, chestD * .5 + bust], [chestY + 52, chestD * .44 + bust * .2], [waistY, waistD * .42], [hipY - 40, hipD * .44], [pelvis + 40, hipD * .38]];
  const BACK = [[y0 - 16, -nw * .62], [shY + 26, -chestD * .47], [chestY, -chestD * .52], [waistY - 20, -waistD * .5], [waistY + 40, -waistD * .5], [pelvis - 10, -hipD * (female ? .56 : .52)], [pelvis + 30, -hipD * .5], [pelvis + 50, -hipD * .4]];
  const yTop = y0 - 14, yBot = pelvis + 50;
  const outline = (ya, yb, padF = 0, padB = 0) => {
    const fr = [], bk = [];
    const n = Math.max(2, Math.ceil((yb - ya) / 9));
    for (let i = 0; i <= n; i++) { const y = ya + (yb - ya) * i / n; fr.push([cx + curveAt(FRONT, y) + padF, y]); bk.push([cx + curveAt(BACK, y) - padB, y]); }
    return fr.concat(bk.reverse());
  };
  const shoulderJ = { x: cx - chestD * .05, y: shY + 26 - (pose.arms && pose.arms[1] && pose.arms[1].lift ? pose.arms[1].lift * 2 : 0) };

  // ---- legs ----
  const hipJ = { x: cx - hipD * .04, y: pelvis + 10 };
  const footH = 40;
  const legLen = feet - footH - hipJ.y;
  const thighL = legLen * .5, shinL = legLen * .5;
  const wT = 128 * b * (female ? 1.04 : 1) * (wide ? 1.1 : 1), wK = 70 * b * (wide ? 1.3 : 1), wA = 50 * b * (wide ? 1.5 : 1);
  const legs = (pose.legs || []).map((lg) => {
    const th = rad(lg.thigh || 0), sh = rad(lg.shin || 0);
    const knee = { x: hipJ.x + sin(th) * thighL, y: hipJ.y + cos(th) * thighL };
    let shinLen = lg.shinLen || shinL;
    // seated: the shin reaches exactly to the floor below the chair
    if (pose.sitting) shinLen = cl(((feet - footH - (pose.sitDrop || 0)) - knee.y) / Math.max(.3, cos(sh)), 60, shinL * 1.3);
    const ankle = { x: knee.x + sin(sh) * shinLen, y: knee.y + cos(sh) * shinLen };
    return { th, sh, knee, ankle, foot: lg.foot || 0 };
  });
  // how far the hips must drop so the lowest foot stands on the ground
  let lowest = -Infinity;
  for (const l of legs) lowest = Math.max(lowest, l.ankle.y);
  const drop = pose.sitting ? 0 : Math.max(0, (feet - footH) - lowest);

  const quad = (a, b2, wa, wb) => {
    const dx = b2.x - a.x, dy = b2.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    return `M ${f1(a.x + nx * wa / 2)} ${f1(a.y + ny * wa / 2)} L ${f1(b2.x + nx * wb / 2)} ${f1(b2.y + ny * wb / 2)} L ${f1(b2.x - nx * wb / 2)} ${f1(b2.y - ny * wb / 2)} L ${f1(a.x - nx * wa / 2)} ${f1(a.y - ny * wa / 2)} Z`;
  };
  const lerpP = (a, b2, t) => ({ x: a.x + (b2.x - a.x) * t, y: a.y + (b2.y - a.y) * t });
  const shoe = (l, c) => {
    // the shoe sits under the ankle and points forward; it tips with the shin only when the foot leaves the ground
    const tilt = cl(-(1 - (l.foot === undefined ? 1 : l.foot)) * 0, -40, 40);
    const k = b * (female && skirt ? .92 : 1);
    const ax = l.ankle.x, ay = l.ankle.y;
    const rot = cl((l.sh * 180 / PI) * (1 - cl(l.foot, 0, 1)) * -.6, -35, 35) + tilt;
    const d = `M ${f1(-30 * k)} ${f1(-8)} C ${f1(-40 * k)} 8 ${f1(-38 * k)} 34 ${f1(-24 * k)} 40 L ${f1(80 * k)} 40 C ${f1(102 * k)} 40 ${f1(104 * k)} 20 ${f1(86 * k)} 10 C ${f1(62 * k)} -2 ${f1(36 * k)} -12 ${f1(16 * k)} -20 L ${f1(-20 * k)} -20 Z`;
    return `<g transform="translate(${f1(ax)} ${f1(ay)}) rotate(${f1(rot)})"><path d="${d}" fill="${c}" stroke="${line(c)}" stroke-width="4" stroke-linejoin="round"/><path d="M ${f1(-26 * k)} 36 L ${f1(84 * k)} 36" stroke="${shade(c, .5)}" stroke-width="5" stroke-linecap="round"/><path d="M ${f1(8 * k)} -6 C ${f1(30 * k)} 0 ${f1(52 * k)} 8 ${f1(70 * k)} 14" stroke="${shade(c, 1.35)}" stroke-width="3" fill="none" opacity=".55"/></g>`;
  };
  const drawLeg = (l, dark) => {
    const k = dark ? FAR : 1;
    const pc = shade(pantsC, k), sc = shade(skin, k);
    const thighC = skirt ? sc : pc;
    const shinC = skirt || shorts ? sc : pc;
    const ankleW = skirt || shorts ? wA * .86 : wA;
    const kneeW = skirt || shorts ? wK * .9 : wK;
    let s = '';
    const outlineCol = (c) => line(c);
    // outline pass then fill pass, so the knee joint has no seam
    const shapes = [];
    if (shorts) {
      const mid = lerpP({ x: hipJ.x, y: hipJ.y }, l.knee, .72);
      shapes.push([quad(hipJ, mid, wT, wT * .9 + 6), pc]);
      shapes.push([quad(mid, l.knee, wT * .74, kneeW), sc]);
    } else shapes.push([quad(hipJ, l.knee, skirt ? wT * .86 : wT, kneeW), thighC]);
    shapes.push([`M ${f1(l.knee.x + kneeW / 2)} ${f1(l.knee.y)} A ${f1(kneeW / 2)} ${f1(kneeW / 2)} 0 1 0 ${f1(l.knee.x - kneeW / 2)} ${f1(l.knee.y)} A ${f1(kneeW / 2)} ${f1(kneeW / 2)} 0 1 0 ${f1(l.knee.x + kneeW / 2)} ${f1(l.knee.y)} Z`, shinC]);
    shapes.push([quad(l.knee, l.ankle, kneeW, ankleW), shinC]);
    shapes.push([`M ${f1(hipJ.x + wT / 2)} ${f1(hipJ.y)} A ${f1(wT / 2)} ${f1(wT / 2)} 0 1 0 ${f1(hipJ.x - wT / 2)} ${f1(hipJ.y)} A ${f1(wT / 2)} ${f1(wT / 2)} 0 1 0 ${f1(hipJ.x + wT / 2)} ${f1(hipJ.y)} Z`, thighC]);
    for (const [d, c] of shapes) s += `<path d="${d}" fill="${c}" stroke="${outlineCol(c)}" stroke-width="5" stroke-linejoin="round"/>`;
    for (const [d, c] of shapes) s += `<path d="${d}" fill="${c}"/>`;
    // trouser crease / hem
    if (!skirt && !shorts) {
      const h1 = lerpP(l.knee, l.ankle, .97);
      s += `<path d="M ${f1(l.knee.x)} ${f1(l.knee.y)} L ${f1(h1.x)} ${f1(h1.y)}" stroke="${shade(pc, .8)}" stroke-width="2" opacity=".5"/>`;
    }
    s += shoe(l, shade(shoeC, k));
    return s;
  };

  // ---- arms ----
  const upL = (G.upperLen || 216) * .92, foL = (G.foreLen || 180) * .9, handL = (G.handLen || 127) * .62;
  const wU = Math.max(56, (G.upperW || 58)) * b * 1.18, wF = Math.max(46, (G.foreW || 48)) * b * 1.08;
  const shortSleeve = !!SHORT_SLEEVE[type];
  const sleeveC = type === 'vest' ? inner : top;
  const drawHand = (w, ang, name, c) => {
    const a = ang * 180 / PI;
    const lc = line(c);
    let d;
    if (name === 'fist') d = `<ellipse cx="0" cy="${f1(handL * .38)}" rx="${f1(wF * .52)}" ry="${f1(handL * .42)}" fill="${c}" stroke="${lc}" stroke-width="4"/><path d="M ${f1(wF * .3)} ${f1(handL * .2)} q ${f1(wF * .25)} ${f1(handL * .2)} 0 ${f1(handL * .4)}" stroke="${lc}" stroke-width="3" fill="none"/>`;
    else {
      const len = name === 'point' ? handL * 1.05 : handL;
      d = `<path d="M ${f1(-wF * .44)} 0 C ${f1(-wF * .55)} ${f1(len * .45)} ${f1(-wF * .4)} ${f1(len * .95)} 0 ${f1(len)} C ${f1(wF * .42)} ${f1(len * .95)} ${f1(wF * .5)} ${f1(len * .5)} ${f1(wF * .44)} 0 Z" fill="${c}" stroke="${lc}" stroke-width="4" stroke-linejoin="round"/>`
        + `<path d="M ${f1(wF * .4)} ${f1(len * .12)} C ${f1(wF * .9)} ${f1(len * .3)} ${f1(wF * .8)} ${f1(len * .55)} ${f1(wF * .45)} ${f1(len * .55)}" fill="${c}" stroke="${lc}" stroke-width="3.5"/>`;
      if (name === 'point') d += `<path d="M 0 ${f1(len * .9)} L 0 ${f1(len * 1.45)}" stroke="${lc}" stroke-width="${f1(wF * .32 + 4)}" stroke-linecap="round"/><path d="M 0 ${f1(len * .9)} L 0 ${f1(len * 1.45)}" stroke="${c}" stroke-width="${f1(wF * .32)}" stroke-linecap="round"/>`;
      else if (name === 'open') d += `<path d="M ${f1(-wF * .2)} ${f1(len * .6)} L ${f1(-wF * .2)} ${f1(len * .9)} M ${f1(wF * .08)} ${f1(len * .62)} L ${f1(wF * .08)} ${f1(len * .95)}" stroke="${lc}" stroke-width="2" opacity=".55"/>`;
    }
    return `<g transform="translate(${f1(w.x)} ${f1(w.y)}) rotate(${f1(-a)})">${d}</g>`;
  };
  const drawArm = (arm, dark) => {
    if (!arm) return '';
    const k = dark ? FAR : 1;
    const up = rad(arm.up || 0), fo = rad(arm.fore != null ? arm.fore : arm.up || 0);
    const sj = { x: shoulderJ.x + (dark ? chestD * .04 : 0), y: shoulderJ.y - (arm.lift || 0) * 2 };
    const el = { x: sj.x + sin(up) * upL, y: sj.y + cos(up) * upL };
    const wr = { x: el.x + sin(fo) * foL, y: el.y + cos(fo) * foL };
    const sc = shade(sleeveC, k), sk = shade(skin, k);
    const shapes = [];
    const cap = (p, w, c) => [`M ${f1(p.x + w / 2)} ${f1(p.y)} A ${f1(w / 2)} ${f1(w / 2)} 0 1 0 ${f1(p.x - w / 2)} ${f1(p.y)} A ${f1(w / 2)} ${f1(w / 2)} 0 1 0 ${f1(p.x + w / 2)} ${f1(p.y)} Z`, c];
    if (shortSleeve) {
      const mid = lerpP(sj, el, .5);
      shapes.push([quad(mid, el, wU * .82, wF * 1.02), sk], cap(el, wF * 1.02, sk), [quad(el, wr, wF, wF * .78), sk]);
      shapes.push(cap(sj, wU * 1.12, sc), [quad(sj, mid, wU * 1.1, wU * 1.02), sc]);
    } else {
      shapes.push(cap(sj, wU * 1.12, sc), [quad(sj, el, wU * 1.08, wF * 1.08), sc], cap(el, wF * 1.08, sc), [quad(el, wr, wF * 1.08, wF * .98), sc]);
    }
    let s = '';
    for (const [d, c] of shapes) s += `<path d="${d}" fill="${c}" stroke="${line(c)}" stroke-width="5" stroke-linejoin="round"/>`;
    for (const [d, c] of shapes) s += `<path d="${d}" fill="${c}"/>`;
    if (!shortSleeve) {
      // cuff
      const c1 = lerpP(el, wr, .9);
      const ang = Math.atan2(wr.y - el.y, wr.x - el.x) + PI / 2;
      s += `<path d="M ${f1(c1.x + cos(ang) * wF * .5)} ${f1(c1.y + sin(ang) * wF * .5)} L ${f1(c1.x - cos(ang) * wF * .5)} ${f1(c1.y - sin(ang) * wF * .5)}" stroke="${line(sc)}" stroke-width="3" opacity=".7"/>`;
    }
    s += drawHand(wr, fo, arm.hand || 'relaxed', sk);
    return s;
  };

  // ---- torso and clothes ----
  const tc = top;
  const hemY = LONG_TOP[type] ? pelvis + 110 : HIP_TOP[type] ? pelvis + 44 : type === 'dress' ? pelvis + 40 : waistY + 70;
  let torso = '';
  // trousers / hips
  const hipShape = outline(waistY - 20, yBot);
  if (!skirt) torso += `<path d="M ${pts(hipShape)} Z" fill="${pantsC}" stroke="${line(pantsC)}" stroke-width="5" stroke-linejoin="round"/>`;
  else torso += `<path d="M ${pts(hipShape)} Z" fill="${bottom === 'dress' ? tc : toHex(O.pants, tc)}" stroke="${line(tc)}" stroke-width="5" stroke-linejoin="round"/>`;
  // top
  const topEnd = Math.min(hemY, yBot);
  const topShape = outline(yTop, topEnd, 4, 4);
  torso += `<path d="M ${pts(topShape)} Z" fill="${tc}" stroke="${line(tc)}" stroke-width="5" stroke-linejoin="round"/>`;
  // soft shading on the back half
  const shadeShape = outline(yTop + 10, topEnd - 4, -curveAt(FRONT, chestY) * .55, 0);
  torso += `<path d="M ${pts(shadeShape)} Z" fill="#000" opacity=".07"/>`;
  // belt line when the top is tucked
  if (!HIP_TOP[type] && !LONG_TOP[type] && type !== 'dress' && !skirt) {
    const bx0 = cx + curveAt(BACK, waistY + 70) - 2, bx1 = cx + curveAt(FRONT, waistY + 70) + 2;
    torso += `<path d="M ${f1(bx0)} ${f1(waistY + 70)} L ${f1(bx1)} ${f1(waistY + 70)}" stroke="${shade(pantsC, .55)}" stroke-width="12" stroke-linecap="round"/>`;
  }
  // front details: open jackets show the shirt, collars, a tie, a hoodie's hood
  const fx = (y) => cx + curveAt(FRONT, y);
  if (OPEN_FRONT[type]) {
    torso += `<path d="M ${f1(fx(y0) - 2)} ${f1(y0 - 4)} L ${f1(fx(chestY - 30) + 2)} ${f1(chestY - 30)} L ${f1(fx(chestY - 30) - 26)} ${f1(chestY - 30)} L ${f1(cx + nw * .15)} ${f1(y0 + 4)} Z" fill="${inner}" stroke="${line(inner)}" stroke-width="3" stroke-linejoin="round"/>`;
    torso += `<path d="M ${f1(cx + nw * .1)} ${f1(y0 + 2)} L ${f1(fx(chestY) - 30)} ${f1(chestY + 10)} L ${f1(fx(waistY) - 8)} ${f1(waistY + 6)}" stroke="${line(tc)}" stroke-width="4" fill="none" stroke-linejoin="round"/>`;
    for (let i = 0; i < 2; i++) { const y = waistY - 20 + i * 52; torso += `<circle cx="${f1(fx(y) - 6)}" cy="${f1(y)}" r="5" fill="${shade(tc, .55)}"/>`; }
    if (O.tie) torso += `<path d="M ${f1(fx(y0 + 14) - 4)} ${f1(y0 + 14)} L ${f1(fx(chestY + 20) + 6)} ${f1(chestY + 20)} L ${f1(fx(chestY + 20) - 8)} ${f1(chestY + 34)} Z" fill="${toHex(O.tieColor, '#56606e')}"/>`;
  } else if (COLLARED[type]) {
    torso += `<path d="M ${f1(cx - nw * .5)} ${f1(y0 - 10)} L ${f1(fx(y0) + 4)} ${f1(y0 + 2)} L ${f1(fx(y0) - 22)} ${f1(y0 + 30)} Z" fill="${shade(tc, 1.12)}" stroke="${line(tc)}" stroke-width="3" stroke-linejoin="round"/>`;
    torso += `<path d="M ${f1(fx(y0 + 20) - 6)} ${f1(y0 + 20)} L ${f1(fx(chestY + 40) - 10)} ${f1(chestY + 40)}" stroke="${line(tc)}" stroke-width="2.5" opacity=".6"/>`;
  } else if (type === 'turtleneck') {
    torso += `<path d="M ${f1(cx - nw * .66)} ${f1(y0 - 44)} L ${f1(cx + nw * .62)} ${f1(y0 - 44)} L ${f1(fx(y0) + 2)} ${f1(y0 + 6)} L ${f1(cx - nw * .7)} ${f1(y0 + 6)} Z" fill="${tc}" stroke="${line(tc)}" stroke-width="4" stroke-linejoin="round"/>`;
  } else if (type === 'hoodie') {
    torso += `<path d="M ${f1(cx - nw * .4)} ${f1(y0 - 8)} C ${f1(cx - nw * 2.4)} ${f1(y0 - 30)} ${f1(cx - nw * 2.6)} ${f1(y0 + 50)} ${f1(cx - nw * 1.6)} ${f1(y0 + 60)} L ${f1(cx - nw * .2)} ${f1(y0 + 10)} Z" fill="${shade(tc, .9)}" stroke="${line(tc)}" stroke-width="4" stroke-linejoin="round"/>`;
    torso += `<path d="M ${f1(fx(y0 + 6) - 10)} ${f1(y0 + 6)} L ${f1(fx(chestY) - 14)} ${f1(chestY + 20)}" stroke="${shade(inner, .9)}" stroke-width="3"/>`;
    torso += `<path d="M ${f1(fx(waistY) - 70)} ${f1(waistY + 20)} L ${f1(fx(waistY) + 2)} ${f1(waistY + 20)} L ${f1(fx(waistY + 60) + 2)} ${f1(waistY + 66)}" stroke="${line(tc)}" stroke-width="3" fill="none"/>`;
  } else {
    torso += `<path d="M ${f1(cx - nw * .55)} ${f1(y0 - 8)} Q ${f1(cx + nw * .2)} ${f1(y0 + 14)} ${f1(fx(y0) + 2)} ${f1(y0 - 2)}" stroke="${line(tc)}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  }
  if (O.trim && O.trim !== 'none') torso += `<path d="M ${f1(cx + curveAt(BACK, topEnd - 8) + 2)} ${f1(topEnd - 8)} L ${f1(fx(topEnd - 8) - 2)} ${f1(topEnd - 8)}" stroke="${accent}" stroke-width="8"/>`;

  // skirts and dresses fall over the thighs and follow the knees a little
  let skirtSvg = '';
  if (skirt) {
    const len = bottom === 'skirt-mini' ? thighL * .55 : bottom === 'skirt-long' ? legLen * .92 : thighL + shinL * .28;
    const hemAt = pelvis + 16 + len;
    let fwd = 0, back = 0;
    for (const l of legs) { const kx = sin(l.th) * Math.min(len, thighL); fwd = Math.max(fwd, kx); back = Math.min(back, kx); }
    const sc = bottom === 'dress' ? tc : toHex(O.pants, tc);
    const topY = waistY + 20;
    const fx0 = fx(topY), bx0 = cx + curveAt(BACK, topY);
    const fH = Math.max(fx(pelvis) + 24, hipJ.x + fwd + wT * .62), bH = Math.min(cx + curveAt(BACK, pelvis) - 26, hipJ.x + back - wT * .62);
    if (pose.sitting) {
      // seated: the skirt lies over the thighs and drapes a little past the knees
      const kn = legs[1] || legs[0];
      const drape = cl(len - thighL, 12, shinL * .7);
      const kx = kn ? kn.knee.x : hipJ.x + thighL, ky = kn ? kn.knee.y : hipJ.y;
      skirtSvg = `<path d="M ${f1(bx0)} ${f1(topY)} L ${f1(fx0)} ${f1(topY)} C ${f1(fx0 + 20)} ${f1(hipJ.y - wT * .7)} ${f1(kx - 40)} ${f1(ky - wK * .75)} ${f1(kx + wK * .55)} ${f1(ky - wK * .6)} L ${f1(kx + wK * .75)} ${f1(ky + drape)} L ${f1(kx - wK * .35)} ${f1(ky + drape * .9)} L ${f1(kx - wK * .5)} ${f1(ky + wK * .5)} L ${f1(hipJ.x - wT * .4)} ${f1(hipJ.y + wT * .5)} C ${f1(bx0 - 40)} ${f1(hipJ.y + wT * .4)} ${f1(bx0 - 30)} ${f1(pelvis - 10)} ${f1(bx0)} ${f1(topY)} Z" fill="${sc}" stroke="${line(sc)}" stroke-width="5" stroke-linejoin="round"/>`;
    } else skirtSvg = `<path d="M ${f1(bx0)} ${f1(topY)} L ${f1(fx0)} ${f1(topY)} C ${f1(fx(pelvis) + 6)} ${f1(pelvis - 10)} ${f1(fH)} ${f1(hemAt - 60)} ${f1(fH + 8)} ${f1(hemAt)} Q ${f1((fH + bH) / 2)} ${f1(hemAt + 14)} ${f1(bH - 8)} ${f1(hemAt)} C ${f1(bH)} ${f1(hemAt - 60)} ${f1(bx0 - 30)} ${f1(pelvis - 10)} ${f1(bx0)} ${f1(topY)} Z" fill="${sc}" stroke="${line(sc)}" stroke-width="5" stroke-linejoin="round"/>`
      + `<path d="M ${f1((fH + bH) / 2 + 10)} ${f1(pelvis + 30)} L ${f1((fH + bH) / 2 + 16)} ${f1(hemAt)}" stroke="${shade(sc, .75)}" stroke-width="3" opacity=".6"/>`;
    if (pose.sitting) skirtSvg = skirtSvg.replace(/<path d="M [^"]*" stroke="[^"]*" stroke-width="3" opacity=".6"\/>$/, '');
    if (type !== 'dress') skirtSvg += `<path d="M ${f1(bx0)} ${f1(topY)} L ${f1(fx0)} ${f1(topY)}" stroke="${shade(sc, .6)}" stroke-width="10" stroke-linecap="round"/>`;
  }
  // a long coat hangs over the thighs
  let coatSvg = '';
  if (LONG_TOP[type]) {
    // one piece from the waist: it follows the body to the hips, then hangs to mid-thigh and opens with the stride
    const y1 = waistY, y2 = pelvis + 30;
    const hem = pose.sitting ? y2 + 40 : pelvis + 120;
    let fwd = 0, bck = 0; for (const l of legs) { const kx = sin(l.th) * thighL * .7; fwd = Math.max(fwd, kx); bck = Math.min(bck, kx); }
    const fr = [], bk = [];
    for (let i = 0; i <= 8; i++) { const y = y1 + (y2 - y1) * i / 8; fr.push([fx(y) + 5, y]); bk.push([cx + curveAt(BACK, y) - 5, y]); }
    const fH = pose.sitting ? fx(y2) + 30 : Math.max(fx(y2) + 10, hipJ.x + fwd + wT * .55), bH = Math.min(cx + curveAt(BACK, y2) - 14, hipJ.x + bck - wT * .6);
    coatSvg = `<path d="M ${pts(fr)} L ${f1(fH)} ${f1(hem)} L ${f1(bH)} ${f1(hem)} L ${pts(bk.reverse())} Z" fill="${tc}" stroke="${line(tc)}" stroke-width="5" stroke-linejoin="round"/>`
      + `<path d="M ${f1(fx(y2) - 4)} ${f1(y2)} L ${f1(fH - 8)} ${f1(hem - 4)}" stroke="${line(tc)}" stroke-width="3" opacity=".7"/>`
      + `<path d="M ${f1(bH + 4)} ${f1(hem - 10)} L ${f1(fH - 4)} ${f1(hem - 10)}" stroke="${shade(tc, .7)}" stroke-width="4" opacity=".5"/>`;
  }

  // ---- neck ----
  const chinY = G.headC.y + G.faceH * .5;
  const sk = skin;
  const neck = `<path d="M ${f1(cx - nw * .62)} ${f1(chinY - 30)} L ${f1(cx + nw * .55)} ${f1(chinY - 30)} L ${f1(cx + nw * .7)} ${f1(y0 + 6)} L ${f1(cx - nw * .72)} ${f1(y0 + 6)} Z" fill="${sk}" stroke="${line(sk)}" stroke-width="4" stroke-linejoin="round"/>`
    + `<path d="M ${f1(cx - nw * .55)} ${f1(chinY - 10)} L ${f1(cx - nw * .1)} ${f1(chinY + 6)} L ${f1(cx - nw * .5)} ${f1(y0)} Z" fill="#000" opacity=".08"/>`;

  const arms = pose.arms || [];
  const lg = legs;
  return {
    back: drawArm(arms[0], true),
    legs: (lg[0] ? drawLeg(lg[0], true) : '') + (lg[1] ? drawLeg(lg[1], false) : ''),
    torso: torso + skirtSvg + coatSvg,
    neck,
    front: drawArm(arms[1], false),
    drop,
  };
}

/** The profile arm angles from the app's pose numbers (0 = down, 90 = forward, 180 = up). */
export function profileArm(ua, fa) {
  ua = +ua || 0; fa = +fa || 0;
  // the stickman rest (34, -36) is a hanging arm; walking swings it both ways around that
  let up;
  if (ua <= 34) up = (ua - 34) * .9 + 6;
  else if (ua <= 60) up = 6 + (ua - 34);
  else if (ua <= 90) up = 32 + (ua - 60) * (58 / 30);
  else up = 90 + (ua - 90);
  const bend = cl(ua - fa - 70, 0, 150) * (ua > 90 ? .3 : .5);   // rest (34 - -36 = 70) gives a soft elbow
  return { up: cl(up, -60, 185), fore: cl(up + bend + 8, -40, 200) };
}
