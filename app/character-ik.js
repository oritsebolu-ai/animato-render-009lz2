// Human arm and leg kinematics for the drawn characters (character packs).
//
// The animation scripts of the app write every arm as two angles (a = [upper, fore, upper, fore], in degrees): the upper arm's swing away
// from the body and the forearm's ABSOLUTE angle, both measured the way the stickman is built (rest = [34, -36], an elbow-out pose with
// the hand in front of the hip). Drawn with that rest pose, a real person with long straight arms looks like it has chicken wings.
//
// This module reads those two angles as what they mean, a WHERE: the place the hand goes. It then solves a real two-bone chain
// (shoulder -> elbow -> hand) for THE CHARACTER'S OWN bone lengths, like inverse kinematics in a game rig:
//   - the hand reaches the same place whatever the arm length (a tall or a chibi character),
//   - the arm never over-stretches (no popping at full reach) and the elbow only bends as far as a real elbow (about 150 degrees),
//   - the elbow bends outward and down, the way a person's does, and keeps its side while the hand crosses the body,
//   - near the rest pose the arm hangs relaxed and nearly straight instead of bent into wings; the further the hand is from rest the less
//     that relaxation applies, so waves, points and cheers land exactly where they were written.
// Legs: a lifted foot folds the knee (the thigh and shin foreshorten toward the camera) instead of sliding the whole leg up.
// Pure functions, no DOM. Local arm space: x is OUTWARD from the body (the same for both arms), y is DOWN, the shoulder is (0,0).

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const smooth = (u) => { u = cl(u, 0, 1); return u * u * (3 - 2 * u); };

/** The arm the pose angles were written for (the app's reference rig: upperArm 105, foreArm 100). */
export const REF = { upper: 105, fore: 100, rest: [34, -36] };
export const LIMITS = {
  upperMin: -42, upperMax: 178,   // arm across the chest ... straight up
  elbowMax: 150,                  // a real elbow folds about this far
  reach: 0.993,                   // never fully straight (a locked elbow looks like a snap)
  hang: { x: 10, y: 0.975 },      // where a relaxed hand hangs (outward, share of the full arm length)
  relaxRange: 110,                // distance from the rest hand position over which the relaxed hang fades out (reference units)
};

/** Where the hand is, in the reference rig, for the pose angles (upper, fore absolute). */
export function poseHand(ua, fa) {
  return [REF.upper * Math.sin(ua * RAD) + REF.fore * Math.sin(fa * RAD), REF.upper * Math.cos(ua * RAD) + REF.fore * Math.cos(fa * RAD)];
}

/**
 * Solves a two-bone chain. L1, L2: bone lengths; (tx, ty): the hand target from the shoulder (x outward, y down).
 * Returns { ua, fa, elbow: [x,y], hand: [x,y], flex, reached } with ua the upper bone's angle from straight down (outward positive)
 * and fa the forearm's absolute angle from straight down, in degrees.
 */
export function solveTwoBone(L1, L2, tx, ty, o = {}) {
  L1 = Math.max(1, num(L1, REF.upper)); L2 = Math.max(1, num(L2, REF.fore));
  const lim = { ...LIMITS, ...(o.limits || {}) };
  let d = Math.hypot(tx, ty);
  const dmax = (L1 + L2) * lim.reach;
  const dmin = Math.sqrt(Math.max(1, L1 * L1 + L2 * L2 - 2 * L1 * L2 * Math.cos((180 - lim.elbowMax) * RAD)));
  const reached = d <= dmax && d >= dmin;
  if (d < 1e-6) { tx = 0; ty = 1; d = 1; }
  const dd = cl(d, dmin, dmax), k = dd / d;
  const x = tx * k, y = ty * k;
  const phi = Math.atan2(x, y);                                                        // direction of the target, from straight down
  const alpha = Math.acos(cl((L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd), -1, 1));   // angle at the shoulder between the target line and the upper arm
  // two mirror solutions: the elbow on one side of the shoulder-hand line or on the other
  const cand = [phi - alpha, phi + alpha].map((u) => {
    const e = [L1 * Math.sin(u), L1 * Math.cos(u)], f = Math.atan2(x - e[0], y - e[1]);
    let b = (f - u) * DEG; b = ((b + 540) % 360) - 180;       // which way the elbow is bent: + or -
    return { u, e, bend: b };
  });
  // WHICH side: the bend of the pose the script wrote (o.bend = +1 / -1) decides, because the script was built with the elbow where it wants it,
  // so the arm never flips between two frames. With no hint (a straight pose) the elbow goes OUTWARD, the way a person's does.
  let pickIdx;
  if (o.bend === 1 || o.bend === -1) {
    const m = cand.filter((c) => Math.sign(c.bend) === o.bend);
    pickIdx = m.length === 1 ? cand.indexOf(m[0]) : (cand[1].e[0] > cand[0].e[0] ? 1 : 0);
  } else pickIdx = cand[1].e[0] > cand[0].e[0] ? 1 : 0;
  let ua = cand[pickIdx].u, e = cand[pickIdx].e;
  let lo = lim.upperMin * RAD, hi = lim.upperMax * RAD;
  if (ua < lo || ua > hi) { ua = cl(ua, lo, hi); e = [L1 * Math.sin(ua), L1 * Math.cos(ua)]; }
  const fx = x - e[0], fy = y - e[1];
  let fa = Math.atan2(fx, fy);
  // after a clamp the hand may fall a little short of the target; that is the joint limit doing its job
  const hand = [e[0] + L2 * Math.sin(fa), e[1] + L2 * Math.cos(fa)];
  let flex = Math.abs(fa - ua) * DEG; if (flex > 180) flex = 360 - flex;
  return { ua: ua * DEG, fa: fa * DEG, elbow: e, hand, flex, reached, bend: Math.sign(cand[pickIdx].bend) };
}

/** The relaxed hang pulls a hand that is near the rest pose to a natural, nearly straight arm. Returns [x, y, weight]: the new target in the reference rig and how much it was relaxed (0..1). */
export function relaxedTarget(tx, ty) {
  const rest = poseHand(REF.rest[0], REF.rest[1]);
  const full = REF.upper + REF.fore, h = LIMITS.hang;
  const hang = [h.x, h.y * full];
  const w = smooth(1 - Math.hypot(tx - rest[0], ty - rest[1]) / LIMITS.relaxRange);
  return [tx + w * (hang[0] - rest[0]), ty + w * (hang[1] - rest[1]), w];
}

/**
 * The two angles a puppet's arm needs, from the pose angles of the animation scripts.
 *   ua, fa   the pose angles (upper, fore absolute), as in POSE.a
 *   rig      { upperArm, foreArm } of the character
 * Returns { ua, fa } in the same convention (so the caller's rotations are unchanged) plus the solved chain.
 */
export function armFromPose(ua, fa, rig = {}) {
  const L1 = num(rig.upperArm, REF.upper), L2 = num(rig.foreArm, REF.fore);
  const sc = (L1 + L2) / (REF.upper + REF.fore);
  const t = poseHand(num(ua, REF.rest[0]), num(fa, REF.rest[1]));
  const r = relaxedTarget(t[0], t[1]);
  let db = ((num(fa, REF.rest[1]) - num(ua, REF.rest[0]) + 540) % 360) - 180;
  // a pose the script wrote is reachable by construction, so it may be fully straight; only a relaxed hang keeps a tiny bend (a locked elbow looks like a snap)
  const s = solveTwoBone(L1, L2, r[0] * sc, r[1] * sc, { limits: { reach: 1 - 0.007 * r[2] }, bend: Math.abs(db) < 0.5 ? 0 : Math.sign(db) });
  // keep each angle on the same turn as the script's own (170 and -190 are the same direction, but a frame that jumps 360 would spin a rotation)
  const turn = (a, ref) => a + 360 * Math.round((num(ref, a) - a) / 360);
  s.ua = turn(s.ua, ua); s.fa = turn(s.fa, fa);
  return { ua: s.ua, fa: s.fa, hand: s.hand, elbow: s.elbow, flex: s.flex, reached: s.reached };
}

/**
 * The SVG rotations for one arm of the puppet (i: 0 = the arm on the left of the screen, 1 = right).
 * tu rotates the upper arm about the shoulder; tf rotates the forearm about the elbow, relative to the upper arm.
 */
export function puppetArm(i, ua, fa, rig) {
  const q = armFromPose(ua, fa, rig), m = i ? 1 : -1;
  const tu = m < 0 ? q.ua : -q.ua;
  return { tu, tf: (m < 0 ? q.fa : -q.fa) - tu, flex: q.flex };
}

/**
 * A lifted foot (h units up, as the walk and run scripts write it): the knee folds toward the camera, so the thigh and the shin
 * are drawn a little shorter instead of the whole leg sliding up. Returns the vertical scales of the thigh and the shin.
 */
export function legLift(h, upper, lower) {
  h = Math.max(0, num(h));
  const u = Math.max(1, num(upper, 150)), l = Math.max(1, num(lower, 150));
  return { thigh: cl(1 - 0.9 * h / u, 0.55, 1), shin: cl(1 - 0.1 * h / l, 0.85, 1) };
}

export const _internal = { smooth };
