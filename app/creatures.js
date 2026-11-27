// ANIMALS AND CREATURES THE APP DRAWS AND ANIMATES ITSELF.
//
// A story about a man running from dogs, a cat that steals food, a lion in the market: the person gets exactly the animal they asked
// for, drawn in clean cartoon line art and moving properly (walk, run, sit, bark or roar, sleep, jump), without the AI having to draw it.
//   ['animal','dog',x,ground,scale,t0,'run',{chase:'hero', dx:-280}]       a dog running after the hero
//   ['animal','lion',1200,800,1,0,'walk',{to:900, t2:3}]                   a lion walking in, then standing
//   ['animal','cat',600,800,0.9,'@"cat"','sit',{bark:[2.1], color:'#333'}] a black cat sitting, meowing at 2.1 s
// Every creature is drawn around (0,0) = the middle of its feet on the ground, facing right, at real size next to a 600-tall person.
// creatureSvg is a pure function of the clock, so the preview and the exported video match frame for frame. No look-behind regex.

const r1 = (v) => Math.round(v * 10) / 10;
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const D2R = Math.PI / 180;
function shade(hex, k) {
  let h = String(hex || '#888888').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-f]{6}$/i.test(h)) h = '888888';
  const c = [0, 2, 4].map((i) => cl(Math.round(parseInt(h.slice(i, i + 2), 16) * k), 0, 255));
  return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
}

// body: L length, leg, bh body height, hr head radius, sn snout, neck; ear: flop|point|round|horn|long|big|none; tail: wag|long|tuft|bushy|curl|short|hair|none
const Q = {
  dog:      { L: 230, leg: 105, bh: 92, hr: 50, sn: 40, neck: 34, ear: 'flop', tail: 'wag', fur: '#c98a4b', belly: '#f2d6ad', voice: 'bark' },
  puppy:    { L: 150, leg: 62, bh: 66, hr: 44, sn: 26, neck: 22, ear: 'flop', tail: 'wag', fur: '#e0b07a', belly: '#f6e3c6', voice: 'bark' },
  wolf:     { L: 270, leg: 125, bh: 96, hr: 50, sn: 50, neck: 40, ear: 'point', tail: 'bushy', fur: '#7d8590', belly: '#d4d8de', voice: 'howl' },
  fox:      { L: 190, leg: 70, bh: 66, hr: 40, sn: 40, neck: 26, ear: 'point', tail: 'bushy', fur: '#e07a2e', belly: '#fbeee0', tip: '#ffffff', voice: 'bark' },
  cat:      { L: 175, leg: 72, bh: 64, hr: 42, sn: 14, neck: 22, ear: 'point', tail: 'long', fur: '#8a8f99', belly: '#d9dce2', voice: 'meow', whisk: 1 },
  kitten:   { L: 115, leg: 46, bh: 48, hr: 36, sn: 10, neck: 16, ear: 'point', tail: 'long', fur: '#f0a95b', belly: '#fbe3c4', voice: 'meow', whisk: 1 },
  lion:     { L: 330, leg: 140, bh: 125, hr: 62, sn: 36, neck: 40, ear: 'round', tail: 'tuft', fur: '#d9a441', belly: '#efd29a', mane: '#8a4b1c', voice: 'roar', whisk: 1 },
  lioness:  { L: 310, leg: 135, bh: 112, hr: 54, sn: 36, neck: 40, ear: 'round', tail: 'tuft', fur: '#d4a24c', belly: '#efd5a3', voice: 'roar', whisk: 1 },
  tiger:    { L: 340, leg: 135, bh: 120, hr: 60, sn: 34, neck: 38, ear: 'round', tail: 'long', fur: '#e8862e', belly: '#fbefe0', stripes: '#2a1a12', voice: 'roar', whisk: 1 },
  leopard:  { L: 300, leg: 125, bh: 105, hr: 52, sn: 30, neck: 36, ear: 'round', tail: 'long', fur: '#e6b45a', belly: '#f8ecd2', spots: '#3a2a18', voice: 'roar', whisk: 1 },
  bear:     { L: 330, leg: 120, bh: 170, hr: 66, sn: 36, neck: 30, ear: 'round', tail: 'short', fur: '#6b4628', belly: '#a87a52', voice: 'roar' },
  horse:    { L: 380, leg: 235, bh: 140, hr: 44, sn: 64, neck: 120, ear: 'point', tail: 'hair', fur: '#8b5a2b', belly: '#a8764a', mane: '#2b1a10', voice: 'neigh' },
  donkey:   { L: 300, leg: 170, bh: 125, hr: 42, sn: 56, neck: 80, ear: 'long', tail: 'tuft', fur: '#8d8a86', belly: '#d9d4cc', voice: 'neigh' },
  cow:      { L: 370, leg: 150, bh: 165, hr: 52, sn: 46, neck: 50, ear: 'horn', tail: 'tuft', fur: '#f4f1ea', belly: '#f4f1ea', spots: '#2b2b2b', voice: 'moo' },
  goat:     { L: 230, leg: 120, bh: 100, hr: 40, sn: 40, neck: 60, ear: 'horn', tail: 'short', fur: '#e8e2d6', belly: '#f6f2ea', voice: 'baa', beard: 1 },
  sheep:    { L: 230, leg: 95, bh: 120, hr: 38, sn: 32, neck: 40, ear: 'flop', tail: 'short', fur: '#f5f2ea', belly: '#f5f2ea', face: '#3a3532', wool: 1, voice: 'baa' },
  pig:      { L: 250, leg: 70, bh: 130, hr: 50, sn: 22, neck: 18, ear: 'point', tail: 'curl', fur: '#f2a7b0', belly: '#f8c6cc', snout: 'flat', voice: 'oink' },
  deer:     { L: 280, leg: 190, bh: 110, hr: 40, sn: 48, neck: 90, ear: 'point', tail: 'short', fur: '#b5763d', belly: '#f2e2c6', antler: 1, voice: 'none' },
  giraffe:  { L: 300, leg: 300, bh: 140, hr: 38, sn: 54, neck: 330, ear: 'point', tail: 'tuft', fur: '#e6b75a', belly: '#f3dfb0', spots: '#9a5a22', ossi: 1, voice: 'none' },
  elephant: { L: 420, leg: 200, bh: 250, hr: 92, sn: 0, neck: 10, ear: 'big', tail: 'short', fur: '#9aa1a8', belly: '#b6bcc2', trunk: 1, voice: 'trumpet' },
  rabbit:   { L: 120, leg: 40, bh: 70, hr: 36, sn: 16, neck: 14, ear: 'long', tail: 'short', fur: '#e9e3dc', belly: '#ffffff', hop: 1, voice: 'none' },
  mouse:    { L: 70, leg: 16, bh: 34, hr: 22, sn: 18, neck: 6, ear: 'round', tail: 'long', fur: '#9b9590', belly: '#d8d2cc', voice: 'squeak', whisk: 1 },
  rat:      { L: 110, leg: 22, bh: 44, hr: 26, sn: 26, neck: 8, ear: 'round', tail: 'long', fur: '#6f6a66', belly: '#b6b0aa', voice: 'squeak', whisk: 1 },
  crocodile:{ L: 460, leg: 40, bh: 60, hr: 40, sn: 120, neck: 10, ear: 'none', tail: 'long', fur: '#4f7a3a', belly: '#c9d48f', scales: 1, low: 1, voice: 'hiss' },
  dinosaur: { L: 460, leg: 210, bh: 170, hr: 64, sn: 70, neck: 120, ear: 'none', tail: 'long', fur: '#5f9b4a', belly: '#d7e4a0', spikes: 1, voice: 'roar' },
};
const ALIAS = { doggy: 'dog', hound: 'dog', puppies: 'puppy', dogs: 'dog', pup: 'puppy', cats: 'cat', kitty: 'kitten', lions: 'lion', tigers: 'tiger', wolves: 'wolf', bears: 'bear', horses: 'horse', pony: 'horse', cows: 'cow', bull: 'cow', ox: 'cow', goats: 'goat', sheeps: 'sheep', lamb: 'sheep', pigs: 'pig', hog: 'pig', boar: 'pig', bunny: 'rabbit', hare: 'rabbit', rabbits: 'rabbit', mice: 'mouse', rats: 'rat', cheetah: 'leopard', jaguar: 'leopard', panther: 'leopard', elephants: 'elephant', alligator: 'crocodile', croc: 'crocodile', dino: 'dinosaur', 'tyrannosaurus': 'dinosaur', 't-rex': 'dinosaur', trex: 'dinosaur', reindeer: 'deer', antelope: 'deer', hyena: 'wolf', coyote: 'wolf', jackal: 'fox', camel: 'donkey', mule: 'donkey', zebra: 'horse' };
const BIRDS = { bird: { s: 1, fur: '#4a90d9', belly: '#f3f6fb', beak: '#f2a541' }, chicken: { s: 1.5, fur: '#ffffff', belly: '#f6f1e6', beak: '#f2a541', comb: '#d9342b' }, hen: { s: 1.5, fur: '#c27a3a', belly: '#e9c69a', beak: '#f2a541', comb: '#d9342b' }, rooster: { s: 1.7, fur: '#b94a1d', belly: '#e9c69a', beak: '#f2a541', comb: '#d9342b' }, duck: { s: 1.4, fur: '#f7d548', belly: '#fbe98c', beak: '#f28c28' }, eagle: { s: 2, fur: '#5a3a22', belly: '#5a3a22', beak: '#f2c641', head: '#ffffff' }, parrot: { s: 1.2, fur: '#2fae4f', belly: '#f2d03b', beak: '#2b2b2b', head: '#e33b2f' }, owl: { s: 1.3, fur: '#8a6a48', belly: '#d8c3a2', beak: '#f2a541', owl: 1 }, crow: { s: 1.2, fur: '#22252b', belly: '#33373f', beak: '#22252b' }, pigeon: { s: 1.1, fur: '#8f97a3', belly: '#b9c0ca', beak: '#3a3a3a' }, penguin: { s: 1.6, fur: '#1f232b', belly: '#ffffff', beak: '#f2a541', peng: 1 } };
const BIRD_ALIAS = { birds: 'bird', chickens: 'chicken', ducks: 'duck', eagles: 'eagle', hawk: 'eagle', vulture: 'eagle', parrots: 'parrot', owls: 'owl', crows: 'crow', raven: 'crow', pigeons: 'pigeon', dove: 'pigeon', penguins: 'penguin' };
const OTHER = { snake: 'snake', snakes: 'snake', serpent: 'snake', python: 'snake', cobra: 'snake', fish: 'fish', fishes: 'fish', shark: 'shark', sharks: 'shark', monkey: 'monkey', monkeys: 'monkey', ape: 'monkey', gorilla: 'monkey', chimp: 'monkey', butterfly: 'butterfly', bee: 'bee', bees: 'bee', spider: 'spider', spiders: 'spider', dragon: 'dragon', dragons: 'dragon', frog: 'frog', frogs: 'frog', turtle: 'turtle', tortoise: 'turtle' };

/** The kind for a word ('dogs' -> 'dog', 'T-Rex' -> 'dinosaur'), or '' when the app has no such creature. */
export function creatureKind(word) {
  const w = String(word || '').toLowerCase().trim().replace(/[^a-z-]/g, '');
  if (!w) return '';
  if (Q[w]) return w; if (ALIAS[w]) return ALIAS[w];
  if (BIRDS[w]) return w; if (BIRD_ALIAS[w]) return BIRD_ALIAS[w];
  if (OTHER[w]) return OTHER[w];
  if (w.endsWith('s') && (Q[w.slice(0, -1)] || BIRDS[w.slice(0, -1)])) return w.slice(0, -1);
  return '';
}
export const CREATURE_NAMES = Object.keys(Q).concat(Object.keys(BIRDS), ['snake', 'fish', 'shark', 'monkey', 'butterfly', 'bee', 'spider', 'dragon', 'frog', 'turtle']);

// ---------- drawing helpers ----------
const ln = (c, w) => `stroke="${c}" stroke-width="${r1(w)}" stroke-linejoin="round" stroke-linecap="round"`;
const eye = (x, y, r, o) => {
  if (o.closed) return `<path d="M${r1(x - r)} ${r1(y)} Q${r1(x)} ${r1(y + r * .7)} ${r1(x + r)} ${r1(y)}" fill="none" ${ln(o.ink, Math.max(2.2, r * .35))}/>`;
  const p = o.angry ? `<path d="M${r1(x - r * 1.2)} ${r1(y - r * 1.25)} L${r1(x + r * 1.1)} ${r1(y - r * .55)}" ${ln(o.ink, Math.max(2.4, r * .4))}/>` : '';
  return `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(r)}" ry="${r1(r * 1.12)}" fill="#fff" ${ln(o.ink, Math.max(1.6, r * .22))}/><circle cx="${r1(x + r * .22)}" cy="${r1(y + r * .1)}" r="${r1(r * .62)}" fill="${o.iris || '#2b1a10'}"/><circle cx="${r1(x + r * .38)}" cy="${r1(y - r * .2)}" r="${r1(r * .22)}" fill="#fff"/>` + p;
};

/** A leg: hip (x,y) -> knee -> paw, swinging by `a` degrees, bending at the knee by `k` degrees. */
function leg(x, y, len, a, k, w, fill, ink, paw) {
  const l1 = len * .52, l2 = len * .5;
  const kx = x + Math.sin(a * D2R) * l1, ky = y + Math.cos(a * D2R) * l1;
  const b = (a - k) * D2R, px = kx + Math.sin(b) * l2, py = ky + Math.cos(b) * l2;
  return `<path d="M${r1(x)} ${r1(y)} L${r1(kx)} ${r1(ky)} L${r1(px)} ${r1(py)}" fill="none" stroke="${ink}" stroke-width="${r1(w + 5)}" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<path d="M${r1(x)} ${r1(y)} L${r1(kx)} ${r1(ky)} L${r1(px)} ${r1(py)}" fill="none" stroke="${fill}" stroke-width="${r1(w)}" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<ellipse cx="${r1(px + w * .25)}" cy="${r1(py - w * .12)}" rx="${r1(w * .62)}" ry="${r1(w * .38)}" fill="${paw || fill}" ${ln(ink, 2.6)}/>`;
}

function quadruped(sp, o) {
  const t = o.t, g = o.gait;
  const fur = o.color || sp.fur, belly = o.belly || sp.belly, ink = shade(fur, .42), far = shade(fur, .78), farB = shade(far, .42);
  const run = g === 'run' || g === 'chase', walk = g === 'walk', sit = g === 'sit', sleep = g === 'sleep' || g === 'lie', jump = g === 'jump' || g === 'pounce';
  const voice = g === 'bark' || g === 'roar' || g === 'speak' || o.voiceOn;
  // the body is drawn about 1.7 times as long as it is tall (cartoon animals are compact; a longer body read as a sausage)
  const L = sp.low ? sp.L : Math.min(sp.L, sp.bh * 1.9 + 40), bh = sp.bh, legL = sp.leg, low = !!sp.low;
  const freq = run ? 2.6 * Math.sqrt(230 / Math.max(80, L)) : 1.25 * Math.sqrt(230 / Math.max(80, L)), ph = t * freq * Math.PI * 2;
  const amp = run ? 42 : walk ? 22 : 0;
  const hop = sp.hop && (run || walk) ? Math.max(0, Math.sin(ph)) * legL * .9 : 0;
  const bob = run ? Math.abs(Math.sin(ph)) * bh * .16 : walk ? Math.abs(Math.sin(ph)) * bh * .04 : Math.sin(t * 2.1) * bh * .012;
  const jy = jump ? Math.max(0, Math.sin(cl((t % 1.6) / 1.1, 0, 1) * Math.PI)) * legL * 1.4 : 0;
  let by = -(legL + bh * .5) - bob - hop - jy;      // body centre
  if (sleep) by = -bh * .5; else if (sit) by = -(legL * .45 + bh * .5);
  const tilt = sit ? -32 : run ? Math.sin(ph) * 4 : 0;
  const hx = L * .44, rx = -L * .44;
  // sitting: the body pivots up around the rump; the shoulders and head follow, the front legs reach straight down to the ground
  const ca = Math.cos(tilt * D2R), sa = Math.sin(tilt * D2R);
  const rot = (x, y) => (sit ? [rx + (x - rx) * ca - (y - by) * sa, by + (x - rx) * sa + (y - by) * ca] : [x, y]);                  // shoulder / hip x
  const legW = Math.max(11, bh * (sp.trunk ? .34 : .28));
  const swing = (off) => (sleep ? 70 : sit ? 0 : Math.sin(ph + off) * amp);
  const kneeBend = (off) => (run ? 20 + Math.max(0, Math.sin(ph + off + 1)) * 40 : walk ? Math.max(0, Math.sin(ph + off + 1)) * 22 : 4);
  const hipY = by + bh * .12, shY = by + bh * .08;
  let s = '';
  // far legs (darker), then tail, then body
  const backLeg = (off, fill, inkc) => sit ? `<ellipse cx="${r1(rx + L * .08)}" cy="${r1(-legL * .22)}" rx="${r1(L * .2)}" ry="${r1(legL * .28)}" fill="${fill}" ${ln(inkc, 4.5)}/>` + leg(rx + L * .2, -legL * .25, legL * .3, 70, 0, legW, fill, inkc, fill)
    : leg(rx + L * .06, hipY, legL + (by + bh * .5 + legL < 0 ? 0 : 0) + bob * .3, -swing(off) * (sleep ? -1 : 1), -kneeBend(off), legW * 1.08, fill, inkc);
  if (!low || true) {
    { const [fx, fy] = rot(hx - L * .1, shY); s += leg(fx, fy, sit ? -fy : legL + bob * .3, swing(Math.PI), kneeBend(Math.PI), legW, far, farB); }
    s += backLeg(0, far, farB);
  }
  // tail
  const tw = sp.tail === 'wag' ? Math.sin(t * (voice || run ? 14 : 7)) * 24 : Math.sin(t * 2.4) * 10;
  const tx = rx - 4, ty = by - bh * .2;
  if (sp.tail === 'wag' || sp.tail === 'bushy' || sp.tail === 'long' || sp.tail === 'tuft' || sp.tail === 'hair') {
    const len = sp.tail === 'long' ? L * .6 : sp.tail === 'bushy' ? L * .42 : sp.tail === 'hair' ? L * .38 : sp.tail === 'tuft' ? L * .5 : L * .3;
    const up = sp.tail === 'wag' ? 55 : sp.tail === 'long' ? (run ? 10 : 35) : sp.tail === 'hair' ? -40 : sp.tail === 'tuft' ? -10 : 15;
    const a = (180 + up + tw) * D2R, ex = tx + Math.cos(a) * len, ey = ty - Math.sin(a) * len * -1;
    const mx = tx + Math.cos(a + .5) * len * .55, my = ty + Math.sin(a + .5) * len * .55;
    const tw2 = sp.tail === 'bushy' ? legW * 1.6 : sp.tail === 'hair' ? legW * 1.3 : legW * .55;
    const col = sp.tail === 'hair' ? (sp.mane || ink) : fur;
    s += `<path d="M${r1(tx)} ${r1(ty)} Q${r1(mx)} ${r1(my)} ${r1(ex)} ${r1(ey)}" fill="none" stroke="${shade(col, .42)}" stroke-width="${r1(tw2 + 5)}" stroke-linecap="round"/><path d="M${r1(tx)} ${r1(ty)} Q${r1(mx)} ${r1(my)} ${r1(ex)} ${r1(ey)}" fill="none" stroke="${col}" stroke-width="${r1(tw2)}" stroke-linecap="round"/>`;
    if (sp.tail === 'tuft') s += `<ellipse cx="${r1(ex)}" cy="${r1(ey)}" rx="${r1(legW * .7)}" ry="${r1(legW * .95)}" fill="${sp.mane || ink}" ${ln(shade(sp.mane || ink, .5), 3)}/>`;
    if (sp.tip) s += `<circle cx="${r1(ex)}" cy="${r1(ey)}" r="${r1(tw2 * .45)}" fill="${sp.tip}"/>`;
  } else if (sp.tail === 'curl') {
    s += `<path d="M${r1(tx)} ${r1(ty)} c-16 -6 -22 -24 -8 -28 c12 -3 12 14 0 12" fill="none" ${ln(ink, 7)}/><path d="M${r1(tx)} ${r1(ty)} c-16 -6 -22 -24 -8 -28 c12 -3 12 14 0 12" fill="none" stroke="${fur}" stroke-width="3.5" stroke-linecap="round"/>`;
  } else if (sp.tail === 'short') {
    s += `<circle cx="${r1(tx - 4)}" cy="${r1(ty - 2)}" r="${r1(legW * .7)}" fill="${sp.belly && sp.hop ? '#fff' : fur}" ${ln(ink, 3.5)}/>`;
  }
  // body
  const bw = L * .56, bhh = bh * .56;
  const body = `M${r1(rx - bw * .08)} ${r1(by)} C${r1(rx - bw * .1)} ${r1(by - bhh * 1.1)} ${r1(hx - bw * .35)} ${r1(by - bhh * 1.15)} ${r1(hx + bw * .12)} ${r1(by - bhh * .85)} C${r1(hx + bw * .32)} ${r1(by - bhh * .6)} ${r1(hx + bw * .3)} ${r1(by + bhh * .8)} ${r1(hx)} ${r1(by + bhh * .95)} C${r1(hx - bw * .5)} ${r1(by + bhh * 1.15)} ${r1(rx + bw * .2)} ${r1(by + bhh * 1.1)} ${r1(rx - bw * .08)} ${r1(by)} Z`;
  let bodyG = `<path d="${body}" fill="${fur}" ${ln(ink, 5)}/>`;
  bodyG += `<path d="M${r1(rx + bw * .15)} ${r1(by + bhh * .55)} Q${r1((rx + hx) / 2)} ${r1(by + bhh * 1.12)} ${r1(hx - bw * .1)} ${r1(by + bhh * .6)}" fill="none" stroke="${belly}" stroke-width="${r1(bh * .22)}" stroke-linecap="round" opacity=".9"/>`;
  bodyG += `<path d="M${r1(rx + bw * .1)} ${r1(by - bhh * .55)} Q${r1((rx + hx) / 2)} ${r1(by - bhh * .95)} ${r1(hx - bw * .1)} ${r1(by - bhh * .55)}" fill="none" stroke="#ffffff" stroke-opacity=".18" stroke-width="${r1(bh * .12)}" stroke-linecap="round"/>`;
  if (sp.stripes) for (let i = 0; i < 6; i++) { const x = rx + bw * .05 + i * L * .16; bodyG += `<path d="M${r1(x)} ${r1(by - bhh * .95)} q${r1(L * .03)} ${r1(bhh * .5)} ${r1(-L * .01)} ${r1(bhh * .9)}" fill="none" stroke="${sp.stripes}" stroke-width="${r1(bh * .07)}" stroke-linecap="round"/>`; }
  if (sp.spots) { const sd = [[.15, -.3, .14], [.42, .1, .11], [.62, -.45, .1], [.3, .45, .09], [.78, .2, .12], [.05, .25, .08]]; for (const [u, v, r] of sd) bodyG += `<ellipse cx="${r1(rx + L * u)}" cy="${r1(by + bhh * v)}" rx="${r1(bh * r * 1.3)}" ry="${r1(bh * r)}" fill="${sp.spots}" opacity=".9"/>`; }
  if (sp.wool) for (let i = 0; i < 9; i++) { const u = (i % 5) / 4, v = i < 5 ? -.55 : .1; bodyG += `<circle cx="${r1(rx + bw * .05 + u * L * .62)}" cy="${r1(by + bhh * v)}" r="${r1(bh * .2)}" fill="${fur}" ${ln(shade(fur, .6), 3)}/>`; }
  if (sp.scales) for (let i = 0; i < 8; i++) bodyG += `<path d="M${r1(rx + i * L * .1)} ${r1(by - bhh * .9)} l${r1(L * .03)} ${r1(-bh * .18)} l${r1(L * .03)} ${r1(bh * .18)}" fill="${shade(fur, .8)}" ${ln(ink, 2.5)}/>`;
  if (sp.spikes) for (let i = 0; i < 7; i++) bodyG += `<path d="M${r1(rx + i * L * .12)} ${r1(by - bhh * .95)} l${r1(L * .035)} ${r1(-bh * .22)} l${r1(L * .035)} ${r1(bh * .2)}" fill="${shade(fur, .7)}" ${ln(ink, 3)}/>`;
  // haunch and shoulder: rounded muscle shapes where the legs join, so the legs grow out of the body instead of sticking out of it
  if (!sp.low && !sleep) {
    bodyG += `<path d="M${r1(rx + L * .12 - bh * .32)} ${r1(hipY + bh * .05)} Q${r1(rx + L * .1)} ${r1(by - bhh * .75)} ${r1(rx + L * .12 + bh * .34)} ${r1(hipY + bh * .1)}" fill="none" ${ln(shade(fur, .6), 3)} opacity=".55"/>`;
    bodyG += `<path d="M${r1(hx - L * .04 - bh * .26)} ${r1(shY + bh * .1)} Q${r1(hx - L * .02)} ${r1(by - bhh * .55)} ${r1(hx + bh * .2)} ${r1(shY + bh * .05)}" fill="none" ${ln(shade(fur, .6), 3)} opacity=".45"/>`;
  }
  s += `<g transform="rotate(${r1(tilt)} ${r1(rx)} ${r1(by)})">${bodyG}</g>`;
  // near legs
  s += backLeg(Math.PI, fur, ink);
  if (!sleep) { const [fx, fy] = rot(hx - L * .02, shY); s += leg(fx, fy, sit ? -fy : legL + bob * .3, swing(0), kneeBend(0), legW, fur, ink); }
  // neck and head
  const hr = sp.hr * (sp.trunk || sp.neck > 200 ? 1 : 1.22), nk = sp.neck;
  const headUp = sit ? 8 : run ? -4 : 0, nod = voice ? Math.sin(t * 16) * 4 : Math.sin(t * 1.7) * 2;
  let hxp = hx + nk * .45 + (sp.trunk ? 20 : 0), hyp = (sleep ? by - bhh * .2 : by - bhh * .55 - nk * .85 - headUp) + nod;
  if (sit) { const q = rot(hxp, hyp); hxp = q[0] + 10; hyp = q[1]; }
  const [nx0, ny0] = rot(hx - nk * .1, by - bhh * .3);
  if (nk > 25) s += `<path d="M${r1(nx0)} ${r1(ny0)} L${r1(hxp - hr * .15)} ${r1(hyp + hr * .3)}" stroke="${ink}" stroke-width="${r1(Math.max(legW * 1.6, hr * .9) + 5)}" stroke-linecap="round"/><path d="M${r1(nx0)} ${r1(ny0)} L${r1(hxp - hr * .15)} ${r1(hyp + hr * .3)}" stroke="${fur}" stroke-width="${r1(Math.max(legW * 1.6, hr * .9))}" stroke-linecap="round"/>`;
  if (sp.ossi) s += `<path d="M${r1(hxp - 6)} ${r1(hyp - hr * .9)} l-4 -22 M${r1(hxp + 6)} ${r1(hyp - hr * .9)} l4 -22" ${ln(ink, 6)}/>`;
  if (sp.spots && sp.neck > 200) for (let i = 1; i < 5; i++) { const u = i / 5; s += `<ellipse cx="${r1(hx + (hxp - hx) * u)}" cy="${r1(by - bhh * .3 + (hyp - by + bhh * .3) * u)}" rx="10" ry="8" fill="${sp.spots}"/>`; }
  if (sp.mane && sp.neck < 60) s += `<circle cx="${r1(hxp - hr * .1)}" cy="${r1(hyp)}" r="${r1(hr * 1.55)}" fill="${sp.mane}" ${ln(shade(sp.mane, .55), 5)}/>` + Array.from({ length: 10 }, (_, i) => { const a = i / 10 * Math.PI * 2; return `<circle cx="${r1(hxp - hr * .1 + Math.cos(a) * hr * 1.5)}" cy="${r1(hyp + Math.sin(a) * hr * 1.5)}" r="${r1(hr * .32)}" fill="${sp.mane}"/>`; }).join('');
  else if (sp.mane) s += `<path d="M${r1(hx - 10)} ${r1(by - bhh * .7)} Q${r1((hx + hxp) / 2 - 14)} ${r1((by + hyp) / 2 - 20)} ${r1(hxp - hr * .5)} ${r1(hyp - hr * .6)}" fill="none" stroke="${sp.mane}" stroke-width="${r1(hr * .5)}" stroke-linecap="round"/>`;
  // ears behind
  const eo = { ink };
  const ear = sp.ear;
  if (ear === 'big') s += `<path d="M${r1(hxp - hr * .4)} ${r1(hyp - hr * .6)} C${r1(hxp - hr * 1.7)} ${r1(hyp - hr * .9)} ${r1(hxp - hr * 1.8)} ${r1(hyp + hr * 1.1)} ${r1(hxp - hr * .5)} ${r1(hyp + hr * .7)}" fill="${far}" ${ln(ink, 4.5)}/>`;
  // head
  let head = `<circle cx="${r1(hxp)}" cy="${r1(hyp)}" r="${r1(hr)}" fill="${sp.face || fur}" ${ln(ink, 5)}/>`;
  const snx = hxp + hr * .7, sny = hyp + hr * .25; void snx; void sny;
  const open = voice ? (.5 + .5 * Math.abs(Math.sin(t * (sp.voice === 'roar' ? 7 : 13)))) : 0;
  if (sp.trunk) {
    const sw = Math.sin(t * 1.8) * 18 + (voice ? -50 : 0);
    head += `<path d="M${r1(hxp + hr * .55)} ${r1(hyp + hr * .1)} C${r1(hxp + hr * 1.2)} ${r1(hyp + hr * .5)} ${r1(hxp + hr * 1.1)} ${r1(hyp + hr * 1.3)} ${r1(hxp + hr * 1.0 + sw * .4)} ${r1(hyp + hr * 1.7 + sw * .6)}" fill="none" stroke="${ink}" stroke-width="${r1(hr * .42 + 5)}" stroke-linecap="round"/><path d="M${r1(hxp + hr * .55)} ${r1(hyp + hr * .1)} C${r1(hxp + hr * 1.2)} ${r1(hyp + hr * .5)} ${r1(hxp + hr * 1.1)} ${r1(hyp + hr * 1.3)} ${r1(hxp + hr * 1.0 + sw * .4)} ${r1(hyp + hr * 1.7 + sw * .6)}" fill="none" stroke="${sp.fur}" stroke-width="${r1(hr * .42)}" stroke-linecap="round"/>`;
    head += `<path d="M${r1(hxp + hr * .35)} ${r1(hyp + hr * .55)} q14 18 26 14" fill="#f4f1ea" ${ln(ink, 3)}/>`;
  } else if (sp.snout === 'flat') {
    head += `<ellipse cx="${r1(hxp + hr * .82)}" cy="${r1(sny)}" rx="${r1(hr * .32)}" ry="${r1(hr * .38)}" fill="${shade(fur, .92)}" ${ln(ink, 4)}/><circle cx="${r1(hxp + hr * .86)}" cy="${r1(sny - 7)}" r="3.4" fill="${ink}"/><circle cx="${r1(hxp + hr * .86)}" cy="${r1(sny + 7)}" r="3.4" fill="${ink}"/>`;
  } else if (sp.sn > 0) {
    // a rounded muzzle: a soft oval out of the face, the nose at its tip, the mouth line underneath (the jaw drops for barks and roars)
    const sl = sp.sn, mh = Math.max(hr * .5, Math.min(hr * .78, sl * .7)), mcx = hxp + hr * .5 + sl * .42, my = hyp + hr * .3, mrx = hr * .38 + sl * .5;
    const mx1 = mcx + mrx, jaw = open * mh * .9, muz = sp.face || shade(fur, 1.08);
    if (jaw > 1) head += `<ellipse cx="${r1(mcx - mrx * .1)}" cy="${r1(my + mh * .38 + jaw * .5)}" rx="${r1(mrx * .82)}" ry="${r1(mh * .32 + jaw * .25)}" fill="#7a2230" ${ln(ink, 4)}/><ellipse cx="${r1(mcx - mrx * .15)}" cy="${r1(my + mh * .55 + jaw * .6)}" rx="${r1(mrx * .45)}" ry="${r1(mh * .14)}" fill="#e86a7a"/>`;
    head += `<ellipse cx="${r1(mcx)}" cy="${r1(my)}" rx="${r1(mrx)}" ry="${r1(mh * .55)}" fill="${muz}" ${ln(ink, 4.5)}/>`;
    head += `<path d="M${r1(hxp + hr * .32)} ${r1(my - mh * .42)} Q${r1(hxp + hr * .1)} ${r1(my)} ${r1(hxp + hr * .32)} ${r1(my + mh * .42)}" fill="${muz}" stroke="none"/>`;
    if (jaw > 1 && (sp.voice === 'roar' || sp.voice === 'hiss' || sp.voice === 'howl')) head += `<path d="M${r1(mcx + mrx * .5)} ${r1(my + mh * .45)} l3 ${r1(mh * .3)} l4 ${r1(-mh * .3)} M${r1(mcx - mrx * .1)} ${r1(my + mh * .5)} l3 ${r1(mh * .28)} l4 ${r1(-mh * .28)}" fill="#fff" ${ln(ink, 1.6)}/>`;
    else if (jaw <= 1) head += `<path d="M${r1(mx1 - mrx * .15)} ${r1(my + mh * .12)} q${r1(-mrx * .35)} ${r1(mh * .38)} ${r1(-mrx * .9)} ${r1(mh * .22)}" fill="none" ${ln(ink, 3)}/>`;
    head += `<ellipse cx="${r1(mx1 - mrx * .12)}" cy="${r1(my - mh * .22)}" rx="${r1(Math.max(6, mh * .24))}" ry="${r1(Math.max(5, mh * .18))}" fill="${shade(ink, .6)}"/><ellipse cx="${r1(mx1 - mrx * .18)}" cy="${r1(my - mh * .3)}" rx="${r1(Math.max(2, mh * .08))}" ry="${r1(Math.max(1.5, mh * .05))}" fill="#fff" opacity=".7"/>`;
    if (sp.whisk) head += `<path d="M${r1(mx1 - mrx * .4)} ${r1(my)} l${r1(hr * .75)} -8 M${r1(mx1 - mrx * .4)} ${r1(my + 6)} l${r1(hr * .75)} 6" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`;
  }
  if (sp.beard) head += `<path d="M${r1(snx)} ${r1(sny + hr * .4)} l-6 22 l12 -8 z" fill="${shade(fur, .8)}" ${ln(ink, 3)}/>`;
  const blink = (t * 1.3 + (o.seed || 0)) % 3.7 < .12;
  head += eye(hxp + hr * .3, hyp - hr * .22, Math.max(5, hr * .2), { ink, closed: blink || sleep, angry: o.mood === 'angry' || sp.voice === 'roar' && voice, iris: sp.iris });
  // ears in front
  if (ear === 'flop') { const sw = Math.sin(ph) * (run ? 18 : 4); head += `<path d="M${r1(hxp - hr * .35)} ${r1(hyp - hr * .7)} C${r1(hxp - hr * 1.0)} ${r1(hyp - hr * .5)} ${r1(hxp - hr * 1.0 - sw)} ${r1(hyp + hr * .6)} ${r1(hxp - hr * .55 - sw * .5)} ${r1(hyp + hr * .5)} C${r1(hxp - hr * .2)} ${r1(hyp + hr * .2)} ${r1(hxp - hr * .1)} ${r1(hyp - hr * .4)} ${r1(hxp - hr * .35)} ${r1(hyp - hr * .7)} Z" fill="${shade(fur, .7)}" ${ln(ink, 4)}/>`; }
  else if (ear === 'point') head += `<path d="M${r1(hxp - hr * .55)} ${r1(hyp - hr * .55)} L${r1(hxp - hr * .45)} ${r1(hyp - hr * 1.55)} L${r1(hxp + hr * .05)} ${r1(hyp - hr * .85)} Z" fill="${fur}" ${ln(ink, 4)}/><path d="M${r1(hxp - hr * .42)} ${r1(hyp - hr * .78)} L${r1(hxp - hr * .4)} ${r1(hyp - hr * 1.25)} L${r1(hxp - hr * .12)} ${r1(hyp - hr * .86)} Z" fill="#f2b8c0" opacity=".8"/>`;
  else if (ear === 'round') head += `<circle cx="${r1(hxp - hr * .45)}" cy="${r1(hyp - hr * .8)}" r="${r1(hr * .32)}" fill="${fur}" ${ln(ink, 4)}/><circle cx="${r1(hxp - hr * .45)}" cy="${r1(hyp - hr * .8)}" r="${r1(hr * .15)}" fill="${shade(fur, .7)}"/>`;
  else if (ear === 'long') { const w2 = Math.sin(t * 2) * 6; head += `<path d="M${r1(hxp - hr * .3)} ${r1(hyp - hr * .7)} q${r1(-hr * .5 + w2)} ${r1(-hr * 1.6)} ${r1(-hr * .1 + w2)} ${r1(-hr * 2.1)} q${r1(hr * .5)} ${r1(hr * .6)} ${r1(hr * .45)} ${r1(hr * 1.9)} z" fill="${fur}" ${ln(ink, 4)}/>`; }
  else if (ear === 'horn') head += `<path d="M${r1(hxp - hr * .35)} ${r1(hyp - hr * .75)} q${r1(-hr * .4)} ${r1(-hr * .8)} ${r1(-hr * .95)} ${r1(-hr * .75)}" fill="none" stroke="#efe3c8" stroke-width="${r1(hr * .2)}" stroke-linecap="round"/><path d="M${r1(hxp - hr * .2)} ${r1(hyp - hr * .3)} q${r1(-hr * .6)} ${r1(-hr * .05)} ${r1(-hr * .85)} ${r1(hr * .15)}" fill="${shade(fur, .8)}" ${ln(ink, 3.5)}/>`;
  else if (ear === 'big') head += `<path d="M${r1(hxp - hr * .2)} ${r1(hyp - hr * .7)} C${r1(hxp - hr * 1.3)} ${r1(hyp - hr * 1.1)} ${r1(hxp - hr * 1.5)} ${r1(hyp + hr * .9)} ${r1(hxp - hr * .3)} ${r1(hyp + hr * .6)} Z" fill="${shade(fur, .92)}" ${ln(ink, 4.5)}/>`;
  if (sp.antler) head += `<path d="M${r1(hxp - hr * .2)} ${r1(hyp - hr * .8)} l-10 -48 m4 18 l-18 -12 m10 -2 l6 -20 M${r1(hxp + hr * .1)} ${r1(hyp - hr * .85)} l8 -44 m-3 16 l16 -10" fill="none" stroke="#8a6a44" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
  s += head;
  if (sleep) s += `<text x="${r1(hxp + hr)}" y="${r1(hyp - hr - 10 - (t * 20) % 30)}" font-size="34" font-weight="900" fill="#ffffff" stroke="${ink}" stroke-width="3" paint-order="stroke" font-family="Arial">z</text>`;
  // ground shadow under it
  const shadow = `<ellipse cx="0" cy="0" rx="${r1(L * .6)}" ry="${r1(Math.max(8, legL * .1))}" fill="#000" opacity="${r1(.22 - Math.min(.12, (jy + hop) / 600))}"/>`;
  return shadow + s;
}

function bird(sp, o) {
  const t = o.t, g = o.gait, sc = sp.s || 1, ink = shade(sp.fur, .42);
  const fly = g === 'fly' || g === 'run' || g === 'chase', flap = Math.sin(t * (fly ? 16 : 3));
  const y0 = fly ? -160 - Math.sin(t * 2.2) * 30 : -42 * sc, hop = !fly && g === 'walk' ? Math.abs(Math.sin(t * 7)) * 8 : 0;
  const r = 26 * sc, cy = y0 - hop;
  let s = fly ? '' : `<ellipse cx="0" cy="0" rx="${r1(r * 1.1)}" ry="6" fill="#000" opacity=".2"/><path d="M-6 ${r1(cy + r * .7)} l-2 ${r1(-cy - r * .7)} m14 ${r1(cy + r * .7)} l2 ${r1(-cy - r * .7)}" stroke="#e39b3a" stroke-width="5" stroke-linecap="round"/>`;
  if (fly) s += `<ellipse cx="0" cy="0" rx="${r1(r)}" ry="5" fill="#000" opacity=".1"/>`;
  s += `<path d="M${r1(-r * 1.1)} ${r1(cy)} l${r1(-r * .9)} ${r1(-r * .35)} l${r1(r * .2)} ${r1(r * .6)} z" fill="${shade(sp.fur, .8)}" ${ln(ink, 3.5)}/>`;
  s += `<ellipse cx="0" cy="${r1(cy)}" rx="${r1(r * 1.2)}" ry="${r1(r)}" fill="${sp.fur}" ${ln(ink, 4.5)}/><ellipse cx="${r1(r * .25)}" cy="${r1(cy + r * .3)}" rx="${r1(r * .7)}" ry="${r1(r * .55)}" fill="${sp.belly}"/>`;
  const wy = fly ? flap * r * 1.4 : flap * 3;
  s += `<path d="M${r1(-r * .4)} ${r1(cy - r * .1)} Q${r1(-r * .2)} ${r1(cy - r * .4 - wy)} ${r1(-r * 1.3)} ${r1(cy - r * .2 - wy * 1.2)} Q${r1(-r * .6)} ${r1(cy + r * .4)} ${r1(-r * .4)} ${r1(cy - r * .1)} Z" fill="${shade(sp.fur, .85)}" ${ln(ink, 3.5)}/>`;
  const hx = r * 1.0, hy = cy - r * .85, hr = r * .62;
  s += `<circle cx="${r1(hx)}" cy="${r1(hy)}" r="${r1(hr)}" fill="${sp.head || sp.fur}" ${ln(ink, 4)}/>`;
  if (sp.comb) s += `<path d="M${r1(hx - hr * .5)} ${r1(hy - hr * .8)} q6 -16 10 -2 q6 -14 10 0 q8 -10 8 4" fill="${sp.comb}" ${ln(shade(sp.comb, .5), 3)}/>`;
  const op = g === 'bark' || g === 'speak' ? Math.abs(Math.sin(t * 12)) * 6 : 0;
  s += `<path d="M${r1(hx + hr * .8)} ${r1(hy - 4)} l${r1(hr * .8)} ${r1(4 - op * .3)} l${r1(-hr * .8)} ${r1(6 + op)} z" fill="${sp.beak}" ${ln(shade(sp.beak, .5), 2.5)}/>`;
  s += eye(hx + hr * .25, hy - hr * .15, Math.max(4, hr * .3), { ink, closed: (t * 1.1) % 3.3 < .12 });
  return s;
}

function other(kind, o) {
  const t = o.t, g = o.gait, moving = g === 'walk' || g === 'run' || g === 'chase';
  if (kind === 'snake') {
    const fur = o.color || '#5f9b3a', ink = shade(fur, .4), n = 14, len = 360, pts = [];
    for (let i = 0; i <= n; i++) { const u = i / n; pts.push([u * len - len * .6, -14 - Math.sin(u * 8 - t * (moving ? 8 : 2)) * 16 * (1 - u * .3) - (i === n ? 0 : 0)]); }
    const head = pts[n], rise = g === 'bark' || g === 'speak' || g === 'idle' ? 60 : 20;
    const d = 'M' + pts.map((p) => r1(p[0]) + ' ' + r1(p[1])).join(' L');
    return `<ellipse cx="0" cy="0" rx="200" ry="10" fill="#000" opacity=".18"/><path d="${d}" fill="none" stroke="${ink}" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${fur}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${shade(fur, 1.3)}" stroke-width="6" stroke-dasharray="10 18" stroke-linecap="round"/>`
      + `<path d="M${r1(head[0])} ${r1(head[1])} q20 ${-rise} 50 ${-rise}" fill="none" stroke="${ink}" stroke-width="30" stroke-linecap="round"/><path d="M${r1(head[0])} ${r1(head[1])} q20 ${-rise} 50 ${-rise}" fill="none" stroke="${fur}" stroke-width="22" stroke-linecap="round"/><ellipse cx="${r1(head[0] + 56)}" cy="${r1(head[1] - rise)}" rx="26" ry="18" fill="${fur}" ${ln(ink, 4)}/>` + eye(head[0] + 62, head[1] - rise - 6, 6, { ink, angry: true, iris: '#d4a017' }) + `<path d="M${r1(head[0] + 80)} ${r1(head[1] - rise + 4)} l${r1(14 + Math.abs(Math.sin(t * 9)) * 10)} 0 l6 -5 m-6 5 l6 5" fill="none" stroke="#d9342b" stroke-width="3" stroke-linecap="round"/>`;
  }
  if (kind === 'fish' || kind === 'shark') {
    const big = kind === 'shark', fur = o.color || (big ? '#7d8fa3' : '#f39c32'), ink = shade(fur, .42), L = big ? 320 : 90, y = -L * .9 + Math.sin(t * 2) * 10, w = Math.sin(t * 8) * (big ? 10 : 14);
    return `<g transform="translate(0 ${r1(y)})"><path d="M${r1(-L * .55)} 0 l${r1(-L * .3)} ${r1(-L * .25 + w)} l0 ${r1(L * .5)} z" fill="${shade(fur, .85)}" ${ln(ink, 4)}/><ellipse cx="0" cy="0" rx="${r1(L * .6)}" ry="${r1(L * .28)}" fill="${fur}" ${ln(ink, 5)}/><ellipse cx="${r1(L * .05)}" cy="${r1(L * .1)}" rx="${r1(L * .45)}" ry="${r1(L * .12)}" fill="${big ? '#eef2f6' : shade(fur, 1.25)}"/>${big ? `<path d="M${r1(-L * .05)} ${r1(-L * .26)} l${r1(L * .12)} ${r1(-L * .3)} l${r1(L * .12)} ${r1(L * .3)} z" fill="${fur}" ${ln(ink, 4)}/><path d="M${r1(L * .3)} ${r1(L * .12)} l8 8 l8 -8 l8 8 l8 -8" fill="#fff" ${ln(ink, 2)}/>` : ''}${eye(L * .38, -L * .06, Math.max(4, L * .06), { ink, angry: big })}</g>`;
  }
  if (kind === 'monkey') {
    const fur = o.color || '#7a5230', ink = shade(fur, .42), sw = moving ? Math.sin(t * 9) * 30 : Math.sin(t * 2) * 6, bob = moving ? Math.abs(Math.sin(t * 9)) * 8 : 0;
    return `<ellipse cx="0" cy="0" rx="70" ry="9" fill="#000" opacity=".2"/><g transform="translate(0 ${r1(-bob)})">` + leg(-14, -110, 110, sw, -10, 16, fur, ink) + leg(14, -110, 110, -sw, -10, 16, fur, ink)
      + `<path d="M-30 -120 q-60 10 -50 -60" fill="none" stroke="${ink}" stroke-width="12" stroke-linecap="round"/><path d="M-30 -120 q-60 10 -50 -60" fill="none" stroke="${fur}" stroke-width="7" stroke-linecap="round"/><ellipse cx="0" cy="-160" rx="42" ry="60" fill="${fur}" ${ln(ink, 5)}/><ellipse cx="4" cy="-150" rx="24" ry="38" fill="#e2b98a"/>`
      + leg(-34, -200, 120, 40 + sw, 30, 13, fur, ink) + leg(34, -200, 120, -40 - sw, -30, 13, fur, ink)
      + `<circle cx="-46" cy="-250" r="16" fill="#e2b98a" ${ln(ink, 4)}/><circle cx="46" cy="-250" r="16" fill="#e2b98a" ${ln(ink, 4)}/><circle cx="0" cy="-250" r="44" fill="${fur}" ${ln(ink, 5)}/><ellipse cx="2" cy="-238" rx="32" ry="28" fill="#e2b98a"/>` + eye(-12, -256, 8, { ink }) + eye(14, -256, 8, { ink }) + `<path d="M-10 -226 q12 ${g === 'bark' ? 16 : 8} 24 0" fill="${g === 'bark' ? '#7a2230' : 'none'}" ${ln(ink, 3)}/></g>`;
  }
  if (kind === 'butterfly' || kind === 'bee') {
    const y = -220 - Math.sin(t * 2.5) * 40, f = Math.abs(Math.sin(t * 18)), c = o.color || (kind === 'bee' ? '#f4c430' : '#8e5bd9');
    return `<g transform="translate(${r1(Math.sin(t * 1.3) * 30)} ${r1(y)})"><ellipse cx="-8" cy="-10" rx="${r1(22 * f + 4)}" ry="18" fill="${kind === 'bee' ? '#dff1ff' : c}" opacity=".9" ${ln(shade(c, .4), 2.5)}/><ellipse cx="8" cy="-10" rx="${r1(18 * f + 4)}" ry="14" fill="${kind === 'bee' ? '#dff1ff' : shade(c, 1.2)}" opacity=".9" ${ln(shade(c, .4), 2.5)}/><ellipse cx="0" cy="0" rx="${kind === 'bee' ? 16 : 6}" ry="${kind === 'bee' ? 11 : 16}" fill="${kind === 'bee' ? c : '#2b2b2b'}" ${ln('#2b2b2b', 2.5)}/>${kind === 'bee' ? '<path d="M-5 -10 v20 M4 -10 v20" stroke="#2b2b2b" stroke-width="4"/>' : ''}</g>`;
  }
  if (kind === 'spider') {
    const ink = '#15151a', w = Math.sin(t * (moving ? 14 : 2)) * 10;
    let s = '<ellipse cx="0" cy="0" rx="60" ry="7" fill="#000" opacity=".2"/>';
    for (let i = 0; i < 4; i++) for (const sg of [-1, 1]) s += `<path d="M${sg * 10} -34 q${sg * (34 + i * 6)} ${-30 + i * 10 + (i % 2 ? w : -w)} ${sg * (50 + i * 8)} 34" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`;
    return s + `<ellipse cx="-14" cy="-40" rx="34" ry="26" fill="#2a2a33" ${ln(ink, 4)}/><circle cx="22" cy="-36" r="18" fill="#2a2a33" ${ln(ink, 4)}/><circle cx="28" cy="-40" r="4" fill="#e33"/><circle cx="18" cy="-40" r="4" fill="#e33"/>`;
  }
  if (kind === 'frog') {
    const c = o.color || '#4caf50', ink = shade(c, .42), j = moving ? Math.max(0, Math.sin(t * 6)) * 60 : 0;
    return `<ellipse cx="0" cy="0" rx="50" ry="7" fill="#000" opacity="${r1(.2 - j / 600)}"/><g transform="translate(0 ${r1(-j)})"><ellipse cx="0" cy="-34" rx="48" ry="32" fill="${c}" ${ln(ink, 4.5)}/><ellipse cx="6" cy="-26" rx="30" ry="18" fill="${shade(c, 1.35)}"/><circle cx="-16" cy="-64" r="14" fill="${c}" ${ln(ink, 4)}/><circle cx="18" cy="-64" r="14" fill="${c}" ${ln(ink, 4)}/>` + eye(-16, -66, 8, { ink }) + eye(18, -66, 8, { ink }) + `<path d="M-18 -40 q18 12 36 0" fill="none" ${ln(ink, 3.5)}/></g>`;
  }
  if (kind === 'turtle') {
    const c = o.color || '#6c9a3c', ink = shade(c, .42), sw = moving ? Math.sin(t * 3) * 14 : 0;
    return `<ellipse cx="0" cy="0" rx="90" ry="9" fill="#000" opacity=".2"/>` + leg(-40, -24, 26, sw, 0, 16, '#9cc17a', ink) + leg(40, -24, 26, -sw, 0, 16, '#9cc17a', ink) + `<circle cx="${r1(82 + sw * .3)}" cy="-40" r="20" fill="#9cc17a" ${ln(ink, 4)}/>` + eye(90 + sw * .3, -46, 5, { ink }) + `<path d="M-80 -20 Q-70 -100 0 -100 Q70 -100 80 -20 Z" fill="${c}" ${ln(ink, 5)}/><path d="M-40 -30 l20 -40 l40 0 l20 40 M-20 -70 l0 -24 M20 -70 l0 -24" fill="none" stroke="${shade(c, .7)}" stroke-width="5" stroke-linejoin="round"/>`;
  }
  if (kind === 'dragon') {
    const base = quadruped({ ...Q.dinosaur, fur: o.color || '#b23a3a', belly: '#f2c46b', L: 440, leg: 160, bh: 160, voice: 'roar' }, o);
    const f = Math.sin(t * (moving ? 10 : 3)) * 40;
    return base + `<path d="M-40 -300 Q-120 ${r1(-470 - f)} -260 ${r1(-420 - f)} Q-190 -380 -200 -320 Q-130 -340 -40 -300 Z" fill="#7a1f2a" stroke="#3a0d12" stroke-width="5" stroke-linejoin="round"/>` + (g === 'bark' || g === 'roar' ? `<path d="M300 -380 q120 -20 200 ${r1(-10 + Math.sin(t * 20) * 20)} q-60 40 -200 30 z" fill="#ff9a2e" opacity=".85"/><path d="M300 -375 q80 -10 140 0 q-50 20 -140 15 z" fill="#ffe27a"/>` : '');
  }
  return '';
}

/**
 * One frame of a creature, drawn around (0,0) = its feet on the ground, facing right (facing:-1 mirrors it).
 * o: { t, gait: idle|walk|run|chase|sit|sleep|bark|roar|speak|jump|fly, facing, color, belly, seed, mood }
 */
export function creatureSvg(kind, o = {}) {
  const k = creatureKind(kind) || 'dog';
  const opt = { t: +o.t || 0, gait: String(o.gait || 'idle').toLowerCase(), color: o.color, belly: o.belly, seed: +o.seed || 0, mood: o.mood, voiceOn: !!o.voiceOn };
  let svg = '';
  if (Q[k]) svg = quadruped(Q[k], opt);
  else if (BIRDS[k]) svg = bird({ ...BIRDS[k], ...(o.color ? { fur: o.color } : {}) }, opt);
  else svg = other(k, opt);
  return (o.facing === -1 || o.facing === 'left') ? `<g transform="scale(-1,1)">${svg}</g>` : svg;
}

/** How tall a creature stands at scale 1 (scene units), for camera framing. */
export function creatureHeight(kind) {
  const k = creatureKind(kind) || 'dog';
  if (Q[k]) { const q = Q[k]; return q.leg + q.bh + q.hr * 1.6 + Math.min(q.neck, 330) * .8; }
  if (BIRDS[k]) return 90 * (BIRDS[k].s || 1);
  return { snake: 90, fish: 120, shark: 300, monkey: 300, butterfly: 260, bee: 260, spider: 80, dragon: 520, frog: 90, turtle: 110 }[k] || 200;
}

const WORD_RE = new RegExp('\\b(' + Object.keys(Q).concat(Object.keys(ALIAS), Object.keys(BIRDS), Object.keys(BIRD_ALIAS), Object.keys(OTHER)).sort((a, b) => b.length - a.length).map((w) => w.replace('-', '\\-')).join('|') + ')\\b', 'gi');
const NUMW = { two: 2, three: 3, four: 4, five: 5, several: 3, many: 3, pack: 3, some: 2, both: 2 };
/** Animals the words name: [{kind, word, at (0..1 of the text), count, chase, voice}] (first mention of each kind). */
export function animalsIn(text) {
  const s = String(text || '');
  const out = [], seen = new Set();
  let m; WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(s))) {
    const kind = creatureKind(m[1]);
    if (!kind || seen.has(kind)) continue;
    seen.add(kind);
    const before = s.slice(Math.max(0, m.index - 22), m.index).toLowerCase(), plural = /s$/i.test(m[1]) && !/ss$/i.test(m[1]);
    const nm = before.match(/(\d+|two|three|four|five|several|many|pack of|some|both)\s+(?:\w+\s+){0,2}$/);
    const count = nm ? Math.min(4, +nm[1] || NUMW[nm[1].replace(' of', '')] || 2) : plural ? 2 : 1;
    const around = s.slice(Math.max(0, m.index - 60), m.index + 70).toLowerCase();
    out.push({ kind, word: m[1], at: (m.index + m[1].length / 2) / Math.max(1, s.length), count,
      chase: /(chas|behind (him|her|them)|ran for|running for|ran from|running from|run from|after (him|her|them)|fled|flee|run away|ran away|hunting|attack|bit(e|ing)? )/.test(around),
      voice: /(bark|roar|growl|meow|howl|moo|neigh|hiss|snarl|squeak|cluck|quack)/.test(around) });
  }
  return out;
}

/** The prompt line that tells the AI the app can draw animals for it. */
export function creatureRule() {
  return `ANIMALS AND CREATURES (the cast is EXACTLY what the person's idea asks for, not only people: if it says dogs, dogs are on screen in every scene they are in; if a cat is the hero, the cat is the hero). The app draws and animates these for you in clean line art, at real size: ${CREATURE_NAMES.join(', ')}.
  ['animal','dog',x,ground,scale,t0,'run',{chase:'hero', dx:-280}]   gaits: idle | walk | run | sit | sleep | bark (also meows, roars, moos) | jump | fly (birds). {to:900, t2:3} walks or runs it to x 900 by second 3; {chase:'hero'} keeps it running after that person; {bark:['@"barked"']} opens its mouth on those words; {color:'#333'} recolours it; several dogs = several tuples. A talking animal: give it 'bark' on its own words ({bark:['@"hello"','@"friend"']}). Name it in shots: shot:'low:lion@0->pov:tunde>dog@"dogs"'. Any other creature (an alien, a robot, a monster) you draw yourself as SVGS.name.`;
}
