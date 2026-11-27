// Human character style for the Animato scene engine.
//
// Draws the Animato Studio "presenter" people (a layered vector rig with a million looks per gender) as SVG, so
// they play in the scene player and the video exporter exactly like the stickman rig. Everything that makes a
// person *this* person is a plain look object that the AI writes for each character:
//
//   { seed, gender, name, age, persona, quirk,
//     skin, face, hair, hairc, eyec, top, topc, pattern, bottom, bottomc, shoec, glasses, beard, accessory, ... }
//
// The seed alone already gives a complete, unique, dressed person with their own personality. Every option the AI
// writes on top of that replaces what the seed would have chosen, so the AI can design each character for the story.
// A per-film salt means two films that use the same seed still give different people.
//
// Entry points:
//   renderHuman(look, pose, talk, mouthOpen, blink, view, uid, index) -> { svg, chair, defs, defsId }
//   humanSpec(look, index)   -> { spec, persona, key }
//   humanRandomLook(seed)    -> small serialisable look for a brand-new unique person
//   setCastSalt(text), setClock(seconds)

import * as L from './animato-human-lib.js';
import { hashSeed, seedFromLook, resolveExpression } from './style-humanforge.js';
import { getLip } from './motion-polish.js';
import { profileBody, profileArm } from './human-profile.js';

const PI = Math.PI, sin = Math.sin, cos = Math.cos;
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const f2 = (n) => { n = +n; return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, v) => { const t = cl((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mulberry = (s) => () => {
  s |= 0; s = s + 0x6D2B79F5 | 0;
  let t = Math.imul(s ^ s >>> 15, 1 | s);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const hashInt = (n) => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return h >>> 0; };
const hash01 = (n) => hashInt(n) / 4294967296;

// ---------------------------------------------------------------------------------------------------------
// Film-level state: a salt that makes every film's cast its own, and the clock the idle life runs on.
// ---------------------------------------------------------------------------------------------------------
const STATE = { salt: '', clock: 0 };
export function setCastSalt(s) { STATE.salt = String(s == null ? '' : s).slice(0, 200); }
export function getCastSalt() { return STATE.salt; }
export function setClock(t) { STATE.clock = Number.isFinite(+t) ? +t : 0; }

// ---------------------------------------------------------------------------------------------------------
// Vocabulary the AI can use (everything is optional; anything unknown is ignored, never an error).
// ---------------------------------------------------------------------------------------------------------
export const HUMAN_OPTIONS = {
  gender: ['male', 'female'],
  age: ['child', 'teen', 'young adult', 'adult', 'middle-aged', 'senior'],
  hair: [...L.HAIR_STYLES],
  hairMode: [...L.HAIR_MODES],
  hairOrnament: [...L.ALL_HAIR_ORNAMENTS].filter((x) => x !== 'none'),
  outfit: [...L.OUTFITS],
  bottom: [...L.ALL_BOTTOMS],
  pattern: [...L.FABRIC_PATTERNS].filter((x) => x !== 'solid'),
  trim: [...L.TRIMS].filter((x) => x !== 'none'),
  layer: [...L.OUTFIT_LAYERS].filter((x) => x !== 'none'),
  glasses: [...L.GLASSES].filter((x) => x !== 'none'),
  beard: [...L.BEARDS].filter((x) => x !== 'none'),
  accessory: [...L.ACCESSORIES].filter((x) => x !== 'none'),
  necklace: [...L.ALL_NECKLACES].filter((x) => x !== 'none'),
  earrings: [...L.ALL_EARRINGS].filter((x) => x !== 'none'),
  headpiece: [...L.ALL_HEAD_PIECES].filter((x) => x !== 'none'),
  pin: [...L.ALL_PINS].filter((x) => x !== 'none'),
  face: [...L.FACE_SHAPES],
  skin: Object.keys(L.SKIN || {}),
  persona: ['calm', 'warm', 'bubbly', 'confident', 'bold', 'shy', 'nervous', 'grumpy', 'playful', 'dreamy', 'nerdy', 'cool', 'dramatic', 'serious'],
  mouth: ['smile', 'grin', 'open', 'smirk', 'frown', 'flat'],
  brow: ['calm', 'happy', 'sad', 'angry'],
  expression: ['happy', 'excited', 'sad', 'angry', 'shock', 'surprised', 'cool', 'quirky', 'wink', 'shy', 'chill', 'calm', 'scared', 'worried', 'confused', 'thinking', 'laughing', 'proud', 'love', 'sleepy', 'cry'],
};
// The skin names live in the library bundle only as a record of colours; keep a safe fallback list for prompts.
if (!HUMAN_OPTIONS.skin.length) HUMAN_OPTIONS.skin = ['porcelain', 'fair', 'light', 'medium', 'olive', 'tan', 'caramel', 'brown', 'dark brown', 'deep'];

const SKIN_WORDS = { porcelain: '#f6dccb', pale: '#f4d8c4', fair: '#f0c9a8', light: '#ecc39c', medium: '#d8a478', olive: '#c99a6b', tan: '#b98558', caramel: '#a8704a', brown: '#8d5a3b', 'dark brown': '#6d432c', dark: '#5b3a29', deep: '#46291d', ebony: '#3a2218' };
const HAIR_ALIAS = {
  pony: 'ponytail', 'pony tail': 'ponytail', braid: 'braids', plaits: 'braids', pigtails: 'braids', quiff: 'sidepart', swept: 'sidepart', pompadour: 'sidepart', 'side-part': 'sidepart', 'side part': 'sidepart',
  crop: 'buzz', buzzcut: 'buzz', shaved: 'bald', none: 'bald', spiky: 'short', messy: 'short', tousled: 'short', crew: 'short', 'long-wavy': 'wavy', curls: 'curly', 'curly-afro': 'afro',
  dreadlocks: 'locs', dreads: 'locs', 'twin-buns': 'bun', 'top knot': 'bun', topknot: 'bun', bowl: 'bob', mohawk: 'buzz', 'short wavy': 'wavy', 'long straight': 'long', straight: 'long',
};
const OUTFIT_ALIAS = {
  tee: ['tshirt'], 't-shirt': ['tshirt'], shirt: ['shirt'], tank: ['tshirt'], long: ['sweater'], crew: ['sweater'], jumper: ['sweater'], knit: ['sweater'], stripe: ['shirt', 'stripes'], striped: ['shirt', 'stripes'],
  zip: ['jacket'], labcoat: ['coat'], 'lab coat': ['coat'], robe: ['coat'], gown: ['dress'], uniform: ['blazer'], jersey: ['polo', 'colorblock'], hawaiian: ['shirt', 'floral'], overalls: ['denim'],
  jeans: ['denim'], formal: ['suit'], tux: ['suit'], tuxedo: ['suit'], business: ['suit'], sport: ['hoodie'], sweatshirt: ['hoodie'], windbreaker: ['bomber'], pajamas: ['shirt', 'stripes'], apron: ['vest'], tshirt: ['tshirt'],
};
const BOTTOM_ALIAS = {
  jeans: 'pants', trousers: 'pants', slacks: 'pants', chinos: 'pants', leggings: 'pants', joggers: 'wide', baggy: 'wide', 'cuffed-shorts': 'shorts', 'straight-shorts': 'shorts',
  skirt: 'skirt-midi', miniskirt: 'skirt-mini', mini: 'skirt-mini', midi: 'skirt-midi', maxi: 'skirt-long', 'long skirt': 'skirt-long', 'skirt-short': 'skirt-mini', kilt: 'skirt-midi', cargos: 'cargo',
};
const BEARD_ALIAS = { beard: 'full', 'full beard': 'full', 'long beard': 'full', mustache: 'mustache', moustache: 'mustache', goatee: 'goatee', stubble: 'stubble', 'five o\'clock': 'stubble', shadow: 'stubble', trimmed: 'short', yes: 'full', true: 'full' };
const GLASSES_ALIAS = { glasses: 'round', specs: 'round', spectacles: 'round', round: 'round', square: 'square', shades: 'sunglasses', sunglasses: 'sunglasses', yes: 'round', true: 'round' };
const HEAD_ALIAS = { cap: 'headband', hat: 'headband', beanie: 'bandana', bucket: 'bandana', baseball: 'headband', hood: 'bandana' };
const GENDER_RE_F = /^(f|w|girl|lady|female|woman|she)/i, GENDER_RE_M = /^(m|b|boy|man|male|he|guy)/i;

const asHex = (v) => { const s = String(v == null ? '' : v).trim(); if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase(); if (/^#[0-9a-f]{3}$/i.test(s)) return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase(); return ''; };
const colorIn = (v) => { if (v == null || v === '') return ''; const s = String(v).trim(); return asHex(s) || (/^[a-z][a-z ]{1,24}$/i.test(s) ? s.toLowerCase() : ''); };
const word = (v) => String(v == null ? '' : v).trim().toLowerCase();
const pick = (...vals) => { for (const v of vals) if (v !== undefined && v !== null && v !== '') return v; return undefined; };

// ---------------------------------------------------------------------------------------------------------
// Personality: how a person idles, listens, gestures and holds themselves. Always derived, never blank, so two
// people that share a style still move differently.
// ---------------------------------------------------------------------------------------------------------
const PERSONAS = {
  calm: { en: .7, sway: .6, tilt: .7, gest: .7, rest: 'smile', brow: 'calm', post: 0, tempo: .8, sac: .7, restPose: 'rest', hand: 'relaxed', reps: ['explain', 'offer', 'chest', 'low'] },
  warm: { en: .95, sway: .8, tilt: 1.2, gest: 1, rest: 'smile', brow: 'happy', post: .2, tempo: .95, sac: 1, restPose: 'rest', hand: 'relaxed', reps: ['offer', 'explain', 'chest', 'explainWide'] },
  bubbly: { en: 1.6, sway: 1.4, tilt: 1.4, gest: 1.5, rest: 'happy', brow: 'happy', post: .4, tempo: 1.3, sac: 1.4, restPose: 'rest', hand: 'open', reps: ['handsUp', 'explainWide', 'offer', 'wave', 'beat'], bounce: 1 },
  confident: { en: 1, sway: .7, tilt: .6, gest: 1.1, rest: 'smirk', brow: 'calm', post: .9, tempo: 1, sac: .8, restPose: 'rest', hand: 'relaxed', reps: ['beat', 'point', 'explainWide', 'explain'] },
  bold: { en: 1.3, sway: .9, tilt: .7, gest: 1.3, rest: 'smirk', brow: 'angry', post: 1, tempo: 1.1, sac: .8, restPose: 'rest', hand: 'fist', reps: ['beat', 'point', 'pointAcross', 'explainWide'] },
  shy: { en: .6, sway: .5, tilt: 1.5, gest: .45, rest: 'smile', brow: 'sad', post: -.8, tempo: .85, sac: 1.4, restPose: 'clasp', hand: 'relaxed', reps: ['clasp', 'chest', 'low'], gaze: { x: .5, y: .7 } },
  nervous: { en: 1.1, sway: 1.3, tilt: .8, gest: .8, rest: 'flat', brow: 'sad', post: -.4, tempo: 1.35, sac: 1.8, restPose: 'clasp', hand: 'relaxed', reps: ['clasp', 'chest', 'shrug', 'count'] },
  grumpy: { en: .8, sway: .5, tilt: .5, gest: .85, rest: 'flat', brow: 'angry', post: -.2, tempo: .85, sac: .6, restPose: 'rest', hand: 'fist', reps: ['beat', 'pointAcross', 'shrug'] },
  playful: { en: 1.4, sway: 1.2, tilt: 1.6, gest: 1.3, rest: 'grin', brow: 'happy', post: .3, tempo: 1.25, sac: 1.5, restPose: 'rest', hand: 'open', reps: ['wave', 'handsUp', 'offer', 'shrug', 'point'], bounce: 1 },
  dreamy: { en: .65, sway: .9, tilt: 1.7, gest: .6, rest: 'smile', brow: 'calm', post: -.1, tempo: .7, sac: .55, restPose: 'rest', hand: 'relaxed', reps: ['chin', 'offer', 'chest'], gaze: { x: 0, y: -.6 } },
  nerdy: { en: .9, sway: .7, tilt: 1, gest: 1.1, rest: 'smile', brow: 'calm', post: -.3, tempo: 1.1, sac: 1.1, restPose: 'rest', hand: 'relaxed', reps: ['count', 'explain', 'chin', 'pointAcross'] },
  cool: { en: .75, sway: .6, tilt: .9, gest: .8, rest: 'smirk', brow: 'calm', post: .5, tempo: .85, sac: .6, restPose: 'rest', hand: 'relaxed', reps: ['shrug', 'offer', 'beat', 'low'] },
  dramatic: { en: 1.5, sway: 1.1, tilt: 1.4, gest: 1.6, rest: 'smile', brow: 'happy', post: .6, tempo: 1.1, sac: 1.2, restPose: 'rest', hand: 'open', reps: ['handsUp', 'explainWide', 'chest', 'pointUp', 'shrug'] },
  serious: { en: .75, sway: .45, tilt: .5, gest: .8, rest: 'flat', brow: 'calm', post: .6, tempo: .85, sac: .7, restPose: 'rest', hand: 'relaxed', reps: ['beat', 'explain', 'count', 'pointAcross'] },
};
const PERSONA_WORDS = [
  [/bubbl|energetic|excit|cheer|upbeat|enthusias|lively|peppy|chipper|sparkl/, 'bubbly'], [/playful|goofy|silly|funny|mischiev|prank|joker|cheeky|quirky/, 'playful'],
  [/shy|timid|quiet|introvert|bashful|meek|reserved|gentle/, 'shy'], [/nervous|anxious|worried|jitter|twitchy|skittish|scared|fearful/, 'nervous'],
  [/grump|angry|cranky|stern|irritab|surly|bitter|hostile|menac|villain|cunning|ruthless/, 'grumpy'], [/confiden|brave|heroic|leader|proud|charism|bossy|commanding|determined|fearless/, 'confident'],
  [/bold|fierce|aggressive|rebel|tough|warrior|strong/, 'bold'], [/dream|whimsic|sleepy|spacey|poetic|artsy|romantic|wistful/, 'dreamy'],
  [/nerd|geek|smart|curious|clever|scholar|scientist|professor|inventor|analytical|bookish/, 'nerdy'], [/cool|aloof|mysterious|laid.?back|smooth|suave|detached|sarcastic|dry/, 'cool'],
  [/dramatic|theatrical|showman|flamboyant|expressive|animated|loud|diva/, 'dramatic'], [/serious|focused|professional|formal|stoic|disciplined|severe|solemn/, 'serious'],
  [/warm|friendly|kind|caring|nice|sweet|loving|helpful|supportive|motherly|fatherly|wise|gentle/, 'warm'], [/calm|relaxed|peaceful|chill|patient|steady|zen|easygoing/, 'calm'],
];
const PERSONA_KEYS = Object.keys(PERSONAS);
export function resolvePersona(look, seedNum) {
  const raw = pick(look.persona, look.personality, look.vibe, look.temperament, look.mood_base);
  const txt = word(raw);
  let key = '';
  if (txt) { if (PERSONAS[txt]) key = txt; else for (const [re, k] of PERSONA_WORDS) if (re.test(txt)) { key = k; break; } }
  const derived = !key;
  if (!key) key = PERSONA_KEYS[hashInt(seedNum ^ 0x51ed27) % PERSONA_KEYS.length];
  const base = PERSONAS[key];
  // Every person also gets their own small variations, so even two "calm" people do not move identically.
  const r = mulberry(hashInt(seedNum ^ 0xa11ce));
  const vary = (v, k = .18) => v * (1 + (r() - .5) * 2 * k);
  const en = +look.energy; const enK = Number.isFinite(en) && en > 0 ? cl(en, .3, 2) : 1;
  return {
    key, derived, phase: r() * PI * 2, phase2: r() * PI * 2,
    en: vary(base.en) * enK, sway: vary(base.sway) * enK, tilt: vary(base.tilt), gest: vary(base.gest) * enK, tempo: vary(base.tempo, .12), sac: vary(base.sac),
    post: cl(base.post + (r() - .5) * .3, -1, 1), rest: base.rest, brow: base.brow, restPose: base.restPose, hand: base.hand, reps: base.reps, bounce: base.bounce ? 1 : 0,
    gaze: base.gaze || { x: 0, y: 0 }, quirk: word(look.quirk || look.habit || look.mannerism),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Look -> Animato spec
// ---------------------------------------------------------------------------------------------------------
function resolveGender(Lk, num) {
  const g = word(pick(Lk.gender, Lk.sex));
  if (GENDER_RE_F.test(g)) return 'female';
  if (GENDER_RE_M.test(g)) return 'male';
  return hash01(num ^ 0x7f4a7c15) < .5 ? 'female' : 'male';
}
function ageInfo(Lk) {
  const a = pick(Lk.age, Lk.ageGroup);
  if (a === undefined) return { scale: 1, group: '' };
  const n = +a;
  if (Number.isFinite(n)) return { scale: n < 8 ? .66 : n < 13 ? .78 : n < 18 ? .92 : 1, group: n < 13 ? 'child' : n < 18 ? 'teen' : n >= 65 ? 'senior' : n >= 45 ? 'middle' : 'adult' };
  const t = word(a);
  if (/baby|toddler|kid|child|little/.test(t)) return { scale: .72, group: 'child' };
  if (/teen|young/.test(t) && !/adult/.test(t)) return { scale: .92, group: 'teen' };
  if (/senior|old|elder|grand/.test(t)) return { scale: .97, group: 'senior' };
  if (/middle/.test(t)) return { scale: 1, group: 'middle' };
  return { scale: 1, group: 'adult' };
}
const clamp01 = (v, a, b) => cl(+v, a, b);

// ---------------------------------------------------------------------------------------------------------
// Role wardrobe: a person's job or part in the story dresses them when the file leaves the clothes out, so a nurse
// never turns up in a random party top. Colours still vary by seed, so two nurses in two films do not look alike.
// Only fields the file did not write are filled in.
// ---------------------------------------------------------------------------------------------------------
const ROLE_WARDROBE = [
  [/\b(nurse|paramedic|caregiver|medic)\b/, { top: 'shirt', topc: ['#3e8f8c', '#5aa9c9', '#7aa6c2', '#4f7fb8'], bottom: 'pants', bottomc: 'same', shoec: ['#f3f3f1', '#34373d'] }],
  [/\b(doctor|surgeon|dentist|pharmacist|vet|physician)\b/, { top: 'coat', topc: ['#f3f3f1', '#eef1f4'], innerc: ['#7db2e0', '#98d6bb', '#1f2c4c'], bottom: 'pants', bottomc: ['#34373d', '#1f2c4c', '#56606e'], tie: 0.4 }],
  [/\b(scientist|chemist|lab|researcher|professor|inventor)\b/, { top: 'coat', topc: ['#f3f3f1'], innerc: ['#b09cd8', '#7493b8', '#caa23a', '#34373d'], bottom: 'pants', bottomc: ['#34373d', '#6b4a33', '#1f2c4c'], glasses: 0.6 }],
  [/\b(chef|cook|baker)\b/, { top: 'coat', topc: ['#f3f3f1', '#efe6d1'], innerc: ['#f3f3f1'], bottom: 'pants', bottomc: ['#1c1c21', '#34373d', '#56606e'] }],
  [/\b(ceo|boss|executive|banker|lawyer|attorney|businessman|businesswoman|manager|investor|politician|president|senator|mayor|director|founder|entrepreneur|billionaire|agent|detective)\b/, { top: 'suit', ftop: 'blazer', topc: ['#1f2c4c', '#1c1c21', '#34373d', '#56606e', '#6b1f2c', '#3e5f86'], innerc: ['#f3f3f1', '#efe6d1', '#a8cdef'], bottom: 'pants', fbottom: ['pants', 'skirt-midi'], bottomc: 'same', tie: 0.6, shoec: ['#1c1c21', '#4f3021'] }],
  [/\b(police|officer|cop|guard|security|sheriff)\b/, { top: 'shirt', topc: ['#1f2c4c', '#2747a6', '#34373d'], bottom: 'pants', bottomc: ['#1f2c4c', '#1c1c21'], layer: 'epaulets', shoec: ['#1c1c21'] }],
  [/\b(soldier|army|military|ranger|commander|general|marine)\b/, { top: 'jacket', topc: ['#6a6d38', '#56603a', '#4f5a3a'], bottom: 'cargo', bottomc: 'same', layer: 'belt', shoec: ['#2a1d16', '#1c1c21'] }],
  [/\b(pilot|captain|flight attendant|steward|stewardess|sailor)\b/, { top: 'blazer', topc: ['#1f2c4c', '#1c1c21'], innerc: ['#f3f3f1'], bottom: 'pants', fbottom: ['skirt-midi'], bottomc: 'same', layer: 'epaulets', tie: 0.7 }],
  [/\b(student|pupil|schoolboy|schoolgirl|kid|child|teen|teenager|boy|girl)\b/, { top: ['hoodie', 'tshirt', 'sweater', 'polo', 'bomber'], topc: ['#2e62b4', '#d9408a', '#2bb2b0', '#e8c33a', '#df7a2e', '#6a43a6', '#2f7d4f', '#b8303a'], bottom: ['pants', 'shorts', 'cargo'], fbottom: ['pants', 'skirt-mini', 'skirt-midi', 'shorts'], bottomc: ['#3e5f86', '#34373d', '#b98d57', '#7493b8'], shoec: ['#f3f3f1', '#1c1c21', '#d9408a', '#2e62b4'] }],
  [/\b(uniform|school uniform)\b/, { top: 'blazer', topc: ['#1f2c4c', '#6b1f2c', '#2f7d4f', '#3e5f86'], innerc: ['#f3f3f1'], bottom: 'pants', fbottom: ['skirt-midi'], bottomc: ['#34373d', '#56606e'], tie: 0.8 }],
  [/\b(teacher|librarian|tutor|counselor|counsellor|principal)\b/, { top: ['cardigan', 'sweater', 'blouse', 'shirt'], topc: ['#9c4a26', '#2f7d4f', '#7c1e26', '#3e5f86', '#a07890', '#caa23a'], innerc: ['#f3f3f1', '#efe6d1'], bottom: 'pants', fbottom: ['skirt-midi', 'skirt-long', 'pants'], bottomc: ['#6b4a33', '#34373d', '#d9c7a5', '#1f2c4c'], glasses: 0.45 }],
  [/\b(farmer|rancher|gardener|cowboy|villager|fisherman)\b/, { top: ['denim', 'shirt'], topc: ['#3e5f86', '#b8303a', '#6a6d38', '#9c4a26'], pattern: ['plaid', 'solid', 'solid'], bottom: 'pants', bottomc: ['#3e5f86', '#6b4a33', '#a99a6a'], shoec: ['#4f3021'] }],
  [/\b(mechanic|plumber|builder|construction|worker|engineer|electrician|carpenter|technician|janitor)\b/, { top: ['denim', 'shirt', 'vest'], topc: ['#3e5f86', '#df7a2e', '#56606e', '#1f2c4c'], innerc: ['#56606e', '#f3f3f1'], bottom: 'cargo', bottomc: ['#3e5f86', '#56606e', '#34373d'], layer: 'chestpocket', shoec: ['#4f3021', '#1c1c21'] }],
  [/\b(athlete|runner|player|footballer|boxer|coach|trainer|gym|fitness|sport)\b/, { top: ['tshirt', 'polo', 'hoodie'], topc: ['#b8303a', '#2e62b4', '#e8c33a', '#2f7d4f', '#1c1c21', '#df7a2e'], pattern: ['colorblock', 'solid'], bottom: 'shorts', bottomc: ['#1c1c21', '#f3f3f1', '#1f2c4c'], shoec: ['#f3f3f1', '#e8c33a', '#b8303a'] }],
  [/\b(king|queen|prince|princess|royal|emperor|empress|chief|sultan)\b/, { top: 'coat', ftop: 'dress', topc: ['#6a43a6', '#7c1e26', '#1f2c4c', '#c9a13b'], innerc: ['#c9a13b', '#f3f3f1'], trim: 'band', accentc: ['#c9a13b'], headpiece: 'crown', bottomc: ['#1c1c21', '#6a43a6'] }],
  [/\b(bride|wedding|groom)\b/, { top: 'suit', ftop: 'dress', topc: ['#f3f3f1', '#efe6d1', '#1c1c21'], bottom: 'pants', fbottom: ['skirt-long'], bottomc: 'same', tie: 0.8 }],
  [/\b(rapper|singer|musician|artist|dancer|influencer|youtuber|streamer|model|celebrity|star)\b/, { top: ['leather', 'bomber', 'jacket', 'hoodie', 'denim'], topc: ['#1c1c21', '#d9408a', '#6a43a6', '#e8c33a', '#2bb2b0', '#b8303a'], innerc: ['#f3f3f1', '#1c1c21', '#e8c33a'], bottom: ['pants', 'wide', 'cargo'], fbottom: ['pants', 'skirt-mini', 'wide'], bottomc: ['#1c1c21', '#3e5f86', '#f3f3f1'], necklace: ['chain', 'pendant', 'layered'] }],
  [/\b(thief|robber|criminal|hacker|spy|villain|gangster)\b/, { top: ['hoodie', 'leather', 'jacket'], topc: ['#1c1c21', '#34373d', '#1f2c4c'], bottom: 'pants', bottomc: ['#1c1c21', '#34373d'], shoec: ['#1c1c21'] }],
  [/\b(grandma|grandmother|granny|grandpa|grandfather|elder|old man|old woman|retiree|pensioner)\b/, { top: ['cardigan', 'sweater', 'shirt'], topc: ['#9c4a26', '#a07890', '#6b4a33', '#9cae8f', '#7493b8'], bottom: 'pants', fbottom: ['skirt-long', 'skirt-midi'], bottomc: ['#6b4a33', '#56606e', '#d9c7a5'], glasses: 0.6, age: 'senior' }],
  [/\b(waiter|waitress|barista|cashier|shopkeeper|seller|vendor|trader|clerk|receptionist)\b/, { top: ['shirt', 'polo', 'vest'], topc: ['#1c1c21', '#f3f3f1', '#6b1f2c', '#2f7d4f'], innerc: ['#f3f3f1'], bottom: 'pants', bottomc: ['#1c1c21', '#34373d'], layer: ['chestpocket', 'none'] }],
  [/\b(office|employee|accountant|developer|programmer|designer|analyst|intern|staff|secretary)\b/, { top: ['shirt', 'blouse', 'sweater', 'polo', 'cardigan'], topc: ['#a8cdef', '#f3f3f1', '#7493b8', '#98d6bb', '#e8a9a9', '#56606e', '#efe6d1'], bottom: 'pants', fbottom: ['pants', 'skirt-midi'], bottomc: ['#34373d', '#1f2c4c', '#d9c7a5', '#56606e'], glasses: 0.35 }],
  [/\b(pastor|priest|preacher|imam|monk|bishop)\b/, { top: 'suit', topc: ['#1c1c21', '#34373d'], innerc: ['#f3f3f1'], bottom: 'pants', bottomc: 'same', tie: 0.2 }],
];
function roleText(Lk) {
  return word([Lk.role, Lk.job, Lk.occupation, Lk.profession, Lk.costume, Lk.part].filter((v) => v != null && v !== '').join(' '));
}
/** Fills clothes the file left out from the person's role in the story. Returns a new look (the input is not changed). */
export function dressForRole(look, seedNum) {
  const Lk = look && typeof look === 'object' ? look : {};
  const txt = roleText(Lk);
  if (!txt) return Lk;
  const hit = ROLE_WARDROBE.find(([re]) => re.test(txt));
  if (!hit || !Object.keys(hit[1]).length) return Lk;
  const W = hit[1];
  const r = mulberry(hashInt((seedNum | 0) ^ 0x5eed0b));
  const one = (v) => Array.isArray(v) ? v[Math.floor(r() * v.length) % v.length] : v;
  const female = GENDER_RE_F.test(word(pick(Lk.gender, Lk.sex)));
  const out = { ...Lk };
  const has = (...k) => k.some((x) => Lk[x] !== undefined && Lk[x] !== null && Lk[x] !== '');
  if (!has('top', 'outfit', 'outfitType', 'clothes', 'shirt')) out.top = one(female && W.ftop ? W.ftop : W.top);
  const topc = one(W.topc);
  if (!has('topc', 'outfitc', 'shirtc', 'topColor', 'color') && topc) out.topc = topc;
  if (!has('innerc', 'inner', 'undershirt') && W.innerc) out.innerc = one(W.innerc);
  if (!has('bottom', 'pants', 'legwear') && (W.bottom || W.fbottom)) out.bottom = one(female && W.fbottom ? W.fbottom : W.bottom);
  if (!has('bottomc', 'pantsc', 'bottomColor') && W.bottomc) out.bottomc = W.bottomc === 'same' ? (out.topc || topc) : one(W.bottomc);
  if (!has('shoec', 'shoeColor', 'shoe') && W.shoec) out.shoec = one(W.shoec);
  if (!has('pattern') && W.pattern) out.pattern = one(W.pattern);
  if (!has('layer') && W.layer) out.layer = one(W.layer);
  if (!has('trim') && W.trim) out.trim = W.trim;
  if (!has('accentc', 'patternc', 'accentColor') && W.accentc) out.accentc = one(W.accentc);
  if (!has('tie') && typeof W.tie === 'number' && !female) out.tie = r() < W.tie;
  if (!has('glasses', 'eyewear') && typeof W.glasses === 'number' && r() < W.glasses) out.glasses = 'round';
  if (!has('headwear', 'hat', 'headpiece') && W.headpiece) out.headwear = W.headpiece;
  if (!has('necklace') && W.necklace) out.necklace = one(W.necklace);
  if (!has('age', 'ageGroup') && W.age) out.age = W.age;
  return out;
}

/** Builds the full, normalised Animato spec for a look: the seed's person + every override the AI wrote. */
const SPEC_CACHE = new Map();
/** Cached: the same look in the same film is built once, not on every frame (it was rebuilt 30 times a second per person). */
export function humanSpec(look, idx = 0) {
  let ck = '';
  try { ck = STATE.salt + '|' + idx + '|' + JSON.stringify(look && typeof look === 'object' ? look : {}); } catch (e) { ck = ''; }
  if (ck) { const hit = SPEC_CACHE.get(ck); if (hit) return hit; }
  const out = humanSpecRaw(look, idx);
  if (ck) { SPEC_CACHE.set(ck, out); if (SPEC_CACHE.size > 400) SPEC_CACHE.delete(SPEC_CACHE.keys().next().value); }
  return out;
}

/* ---------- wardrobe variety ----------
 * The library gives every seed a person, but always plain solid clothes and plain trousers. Everything the AI did not write
 * (skirts, shorts, patterns, layers, trims, jewellery, hair accessories, hair colour effects, scarves, freckles) is chosen here
 * from the person's own seed, so a cast built from seeds looks like different people with their own wardrobe. Anything the file wrote wins. */
const CASUAL_TOPS = new Set(['tshirt', 'hoodie', 'polo', 'sweater', 'bomber', 'denim', 'shirt', 'jacket', 'vest']);
const FORMAL_TOPS = new Set(['suit', 'blazer', 'coat']);
const PATTERN_TOPS = new Set(['shirt', 'tshirt', 'polo', 'sweater', 'blouse', 'dress', 'cardigan', 'bomber', 'turtleneck']);
const LAYERS_FOR = {
  shirt: ['suspenders', 'chestpocket', 'buttons'], blouse: ['buttons', 'lace', 'embroidery', 'sash'], tshirt: ['chestpocket', 'embroidery'], polo: ['buttons', 'chestpocket'],
  hoodie: ['zip', 'embroidery'], bomber: ['zip', 'embroidery'], jacket: ['zip', 'belt', 'embroidery'], denim: ['chestpocket', 'buttons', 'embroidery'], dress: ['belt', 'sash', 'lace', 'embroidery'],
  sweater: ['embroidery'], cardigan: ['buttons'], vest: ['buttons'], turtleneck: ['belt'],
};
const HAIR_HOLD = new Set(['long', 'wavy', 'curly', 'ponytail', 'bun', 'braids', 'bob', 'locs', 'afro']);
const HAIR_TINTS = ['#c99a55', '#8c2f1f', '#6e6e72', '#b5472a', '#d8b872', '#6a43a6', '#2f5d8c', '#e9d8a6'];
const METALS = ['gold', 'silver', 'rose gold', 'bronze'];
function fillWardrobe(sp, Lk, num, gender, ageGroup, has) {
  const r = mulberry(hashInt((num | 0) ^ 0x7a11d0 ^ hashInt(STATE.salt + gender)));
  const ch = (a) => a[Math.floor(r() * a.length) % a.length];
  const chance = (p) => r() < p;
  const O = sp.outfit || (sp.outfit = {});
  const female = gender === 'female';
  const kid = ageGroup === 'child', teen = ageGroup === 'teen', senior = ageGroup === 'senior';
  const type = String(O.type || 'shirt');
  const roleSet = !!roleText(Lk);
  // bottoms
  if (!has('bottom', 'pants', 'legwear') && type !== 'dress') {
    const formal = FORMAL_TOPS.has(type);
    const fb = formal ? ['pants', 'pants', 'pants', 'skirt-midi', 'skirt-long', 'wide'] : ['pants', 'pants', 'skirt-midi', 'skirt-mini', 'skirt-long', 'wide', 'cargo', 'shorts', 'skirt-midi'];
    const mb = formal ? ['pants', 'pants', 'pants', 'wide'] : ['pants', 'pants', 'pants', 'cargo', 'wide', 'shorts', 'cargo'];
    let b = ch(female ? fb : mb);
    if (senior && (b === 'skirt-mini' || b === 'shorts')) b = 'pants';
    if (roleSet && formal) b = 'pants';
    if (b === 'pants') delete O.bottom; else O.bottom = b;
  }
  // pattern, layer, trim
  if (!has('pattern') && (!O.pattern || O.pattern === 'solid')) {
    if (PATTERN_TOPS.has(type) && chance(kid || teen ? .5 : .36)) {
      const pool = ['stripes', 'plaid', 'gingham', 'dots', 'chevron', 'colorblock', 'ombre'];
      if (female && (type === 'dress' || type === 'blouse')) pool.push('floral', 'floral', 'sequin');
      if (!female && (type === 'shirt' || type === 'polo')) pool.push('plaid', 'stripes');
      O.pattern = ch(pool);
    } else if (FORMAL_TOPS.has(type) && chance(.2)) O.pattern = ch(['pinstripe', 'houndstooth', 'plaid']);
  }
  if (!has('layer') && (!O.layer || O.layer === 'none') && chance(.24)) { const l = LAYERS_FOR[type]; if (l) O.layer = ch(l); }
  if (!has('trim') && (!O.trim || O.trim === 'none') && chance(.18) && ['blazer', 'jacket', 'coat', 'cardigan', 'dress', 'polo', 'suit', 'bomber'].includes(type)) O.trim = ch(['piping', 'band', 'collar']);
  // hair colour effects and hair accessories
  const hair = sp.hair || (sp.hair = {});
  const hairColorSet = has('hairc', 'hairC', 'hairColor') || (Lk.hair && typeof Lk.hair === 'object' && Lk.hair.color);
  if (!hairColorSet && !has('hairMode', 'hairmode') && hair.style !== 'bald' && hair.style !== 'buzz' && !senior && chance(.16)) {
    hair.mode = ch(['highlights', 'ombre', 'twotone', 'roots']);
    hair.second = ch(HAIR_TINTS);
  }
  const ornSet = has('ornament', 'hairAccessory', 'headwear', 'hat');
  if (!ornSet && (!hair.ornament || hair.ornament === 'none') && HAIR_HOLD.has(hair.style)) {
    if (female && chance(kid || teen ? .4 : .24)) hair.ornament = ch(hair.style === 'braids' ? ['beads', 'ribbon', 'bow', 'clips'] : ['bow', 'clips', 'scrunchie', 'flower', 'headband', 'ribbon', 'pearls', 'butterfly', 'comb', 'pins']);
    else if (!female && hair.style === 'braids' && chance(.35)) hair.ornament = 'beads';
  }
  // jewellery
  const J = sp.jewelry || defaultJewelry();
  let jch = false;
  const noJ = (v) => !v || v === 'none';
  if (!has('earrings') && noJ(J.ear) && noJ(sp.earrings) && !kid && chance(female ? .5 : .06)) { J.ear = ch(female ? ['studs', 'hoops', 'huggies', 'drops', 'pearls', 'gems', 'climber', 'chandelier', 'star', 'heart', 'bar', 'cuff'] : ['studs', 'hoops', 'cuff']); jch = true; }
  if (!has('necklace') && noJ(J.neck) && !kid && !/^turtleneck$/.test(type) && chance(female ? .34 : .08)) { J.neck = ch(female ? ['chain', 'choker', 'pendant', 'pearls', 'layered', 'beads', 'locket', 'bar', 'charm', 'coin'] : ['chain', 'dogtag', 'cord', 'pendant', 'coin']); jch = true; }
  if (!has('pin') && noJ(J.pin) && (FORMAL_TOPS.has(type) || type === 'jacket') && chance(.16)) { J.pin = ch(['lapel', 'badge', 'brooch', 'star']); jch = true; }
  if (jch) { if (!has('metal')) J.metal = ch(METALS); sp.jewelry = J; }
  if (!has('accessory', 'accessories', 'acc') && (!sp.accessory || sp.accessory === 'none') && ['sweater', 'coat', 'jacket', 'cardigan', 'bomber', 'hoodie'].includes(type) && chance(.1)) sp.accessory = 'scarf';
  if (Lk.freckles === undefined && !senior && chance(.12)) sp.freckles = true;
}
function humanSpecRaw(look, idx = 0) {
  const Lk0 = look && typeof look === 'object' ? look : {};
  const num = seedFromLook(Lk0, idx);
  const Lk = dressForRole(Lk0, num);
  const has0 = (...k) => k.some((x) => Lk[x] !== undefined && Lk[x] !== null && Lk[x] !== '');
  const gender = resolveGender(Lk, num);
  const style = word(Lk.render || Lk.artStyle) === 'basic' ? 'basic' : 'classic';
  const key = `${STATE.salt}|${num}|${gender}`;
  const sp = JSON.parse(JSON.stringify(L.uniqueSpec(key, gender, style)));
  sp.fullBody = true; sp.style = style;
  const age = ageInfo(Lk);
  const nm = pick(Lk.name, Lk.label); if (nm) sp.name = String(nm);
  // skin, hair, eyes, lips
  const skin = pick(Lk.skin, Lk.skinTone);
  if (skin !== undefined) { const w = word(skin); sp.skin = asHex(skin) || SKIN_WORDS[w] || w; }
  const hairIn = pick(Lk.hair, Lk.hairStyle);
  if (hairIn && typeof hairIn === 'object') {
    if (hairIn.style) sp.hair.style = HAIR_ALIAS[word(hairIn.style)] || word(hairIn.style);
    if (hairIn.color) sp.hair.color = colorIn(hairIn.color) || sp.hair.color;
    if (hairIn.mode) sp.hair.mode = word(hairIn.mode);
    if (hairIn.second) sp.hair.second = colorIn(hairIn.second);
    if (hairIn.ornament) sp.hair.ornament = word(hairIn.ornament);
    if (hairIn.ornamentColor) sp.hair.ornamentColor = colorIn(hairIn.ornamentColor);
  } else if (hairIn) { const h = word(hairIn); sp.hair.style = HAIR_ALIAS[h] || h; }
  const hc = colorIn(pick(Lk.hairc, Lk.hairC, Lk.hairColor)); if (hc) sp.hair.color = hc;
  const hc2 = colorIn(pick(Lk.hairc2, Lk.hairSecond, Lk.hairColor2)); if (hc2) { sp.hair.second = hc2; if (!sp.hair.mode || sp.hair.mode === 'solid') sp.hair.mode = 'highlights'; }
  const hm = word(pick(Lk.hairMode, Lk.hairmode)); if (hm) sp.hair.mode = hm;
  const orn = word(pick(Lk.ornament, Lk.hairAccessory)); if (orn) sp.hair.ornament = HEAD_ALIAS[orn] || orn;
  const orc = colorIn(pick(Lk.ornamentc, Lk.ornamentColor)); if (orc) sp.hair.ornamentColor = orc;
  const hw = word(pick(Lk.headwear, Lk.hat));
  if (hw && !/^(none|no|false)$/.test(hw)) { if (L.ALL_HEAD_PIECES.includes(hw)) { sp.jewelry = Object.assign(sp.jewelry || defaultJewelry(), { head: hw }); } else if (!sp.hair.ornament || sp.hair.ornament === 'none') sp.hair.ornament = HEAD_ALIAS[hw] || (L.ALL_HAIR_ORNAMENTS.includes(hw) ? hw : 'headband'); }
  if (age.group === 'senior' && !hc && !hairIn) sp.hair.color = hash01(num ^ 77) < .7 ? '#d9d9dc' : '#9a9a9f';
  const eye = colorIn(pick(Lk.eyec, Lk.eyeColor, Lk.eyes)); if (eye) sp.eyes = eye;
  const lip = colorIn(pick(Lk.lipc, Lk.lipstick, Lk.lips)); if (lip) sp.lips = lip;
  // outfit
  const O = sp.outfit;
  const topIn = word(pick(Lk.top, Lk.outfit, Lk.outfitType, Lk.clothes, Lk.shirt));
  if (topIn) {
    const a = OUTFIT_ALIAS[topIn];
    if (a) { O.type = a[0]; if (a[1] && !pick(Lk.pattern)) O.pattern = a[1]; } else O.type = topIn;
  }
  if (typeof Lk.outfit === 'object' && Lk.outfit) Object.assign(O, Lk.outfit);
  const tc = colorIn(pick(Lk.topc, Lk.outfitc, Lk.shirtc, Lk.topColor, Lk.color)); if (tc) { O.color = tc; if (!pick(Lk.accentc)) delete O.accent; }
  const inner = colorIn(pick(Lk.innerc, Lk.inner, Lk.undershirt)); if (inner) O.inner = inner;
  const bIn = word(pick(Lk.bottom, Lk.pants, Lk.legwear));
  if (bIn) {
    if (bIn === 'dress') O.type = 'dress';
    else { const b = BOTTOM_ALIAS[bIn] || bIn; if (b === 'pants') delete O.bottom; else if (L.ALL_BOTTOMS.includes(b)) O.bottom = b; }
  }
  const bc = colorIn(pick(Lk.bottomc, Lk.pantsc, Lk.bottomColor)); if (bc) O.pants = bc;
  const shc = colorIn(pick(Lk.shoec, Lk.shoeColor, asHex(Lk.shoe) ? Lk.shoe : '')); if (shc) O.shoes = shc;
  const pat = word(Lk.pattern); if (pat && L.FABRIC_PATTERNS.includes(pat)) O.pattern = pat;
  const acc2 = colorIn(pick(Lk.accentc, Lk.patternc, Lk.accentColor)); if (acc2) O.accent = acc2;
  const trim = word(Lk.trim); if (trim && L.TRIMS.includes(trim)) O.trim = trim;
  const layer = word(Lk.layer); if (layer && L.OUTFIT_LAYERS.includes(layer)) O.layer = layer;
  if (Lk.tie !== undefined) O.tie = !!Lk.tie && !/^(no|false|none)$/i.test(String(Lk.tie));
  const tiec = colorIn(Lk.tiec); if (tiec) O.tieColor = tiec;
  // accessories, face hair, glasses
  const g = word(pick(Lk.glasses, Lk.eyewear)); if (g) sp.glasses = /^(none|no|false)$/.test(g) ? 'none' : (GLASSES_ALIAS[g] || (L.GLASSES.includes(g) ? g : 'round'));
  const fh = word(pick(Lk.beard, Lk.facialHair)); if (fh) sp.beard = /^(none|no|false|clean|shaved)$/.test(fh) ? 'none' : (BEARD_ALIAS[fh] || (L.BEARDS.includes(fh) ? fh : 'full'));
  const acc = Array.isArray(Lk.acc) ? Lk.acc.map(word) : Array.isArray(Lk.accessories) ? Lk.accessories.map(word) : [];
  const ac = word(Lk.accessory); if (ac && L.ACCESSORIES.includes(ac)) sp.accessory = ac; else if (acc.includes('scarf')) sp.accessory = 'scarf';
  if (Lk.freckles !== undefined) sp.freckles = !!Lk.freckles;
  const jw = Lk.jewelry && typeof Lk.jewelry === 'object' ? Lk.jewelry : null;
  const neck = word(pick(Lk.necklace, jw && jw.neck)), ear = word(pick(Lk.earrings, jw && jw.ear)), pin = word(pick(Lk.pin, jw && jw.pin)), metal = word(pick(Lk.metal, jw && jw.metal));
  if (neck || ear || pin || metal || jw) {
    const J = Object.assign(sp.jewelry || defaultJewelry(), jw || {});
    if (neck) J.neck = neck; if (ear) J.ear = ear; if (pin) J.pin = pin; if (metal) J.metal = metal;
    sp.jewelry = J;
  }
  // wardrobe variety: whatever the file did not choose is picked from the whole wardrobe, per person (never the same plain look twice)
  fillWardrobe(sp, Lk, num, gender, age.group, has0);
  // face and body (what makes the person look like themselves)
  const I = Object.assign({}, sp.identity || {});
  const face = word(Lk.face || Lk.faceShape); if (face && L.FACE_SHAPES.includes(face)) I.face = face;
  if (Lk.identity && typeof Lk.identity === 'object') Object.assign(I, Lk.identity);
  const dials = ['faceW', 'faceH', 'jaw', 'chin', 'cheek', 'eyeSize', 'eyeSpacing', 'eyeOpen', 'iris', 'browThick', 'browRaise', 'noseW', 'noseLen', 'mouthW', 'lipFull', 'earSize', 'neck', 'shoulders'];
  for (const d of dials) if (Lk[d] !== undefined && Number.isFinite(+Lk[d])) I[d] = +Lk[d];
  const bld = +Lk.build; if (Number.isFinite(bld) && bld > 0) I.build = cl(bld, .75, 1.3);
  if (age.group === 'child') { I.eyeSize = Math.max(+I.eyeSize || 1, 1.12); I.faceW = (+I.faceW || 1) * 1.04; }
  sp.identity = I;
  const norm = L.normalizeSpec(Object.assign(sp, { fullBody: true }), gender);
  norm.fullBody = true;
  const hgt = +Lk.height; const scale = cl((Number.isFinite(hgt) && hgt > 0 ? cl(hgt, .75, 1.25) : 1) * age.scale, .55, 1.3);
  return { spec: norm, persona: resolvePersona(Lk, num), seed: num, gender, scale, age: age.group, key: JSON.stringify(norm) + '|' + scale };
}
function defaultJewelry() { return { neck: 'none', ear: 'none', head: 'none', pin: 'none', metal: 'gold', gem: 'ruby', scale: 'classic', finish: 'polished' }; }

/** A small serialisable look for a brand-new unique person. */
export function humanRandomLook(seed) {
  const s = (Math.abs(Math.floor(+seed || 1)) % 2147483647) || 1;
  const num = s;
  const gender = resolveGender({ seed: s }, num);
  const p = resolvePersona({}, num);
  return { seed: s, gender, persona: p.key };
}

// ---------------------------------------------------------------------------------------------------------
// Rig cache: one prepared rig (SVG parts turned into reusable <g> symbols) per distinct person.
// ---------------------------------------------------------------------------------------------------------
const RIGS = new Map();
const RIG_MAX = 48;
const VIEW_ONLY = new Set(['hair_back_fr', 'head_back', 'face_profile', 'ear_l_fr', 'ear_r_fr', 'torso_back']);
const dataUrlSvg = (u) => decodeURIComponent(String(u).slice(String(u).indexOf(',') + 1));
const tidyPaths = (s) => s.replace(/\sd="([^"]*)"/g, (m, d) => ' d="' + d.replace(/(\d+\.\d)\d+/g, '$1').replace(/\s+/g, ' ').trim() + '"');
function symbolize(svg, pfx, gid) {
  const m = /<svg[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*)<\/svg>\s*$/.exec(svg);
  if (!m) return null;
  let inner = m[2];
  inner = inner.replace(/\sid="([^"]+)"/g, (_, a) => ` id="${pfx}${a}"`)
    .replace(/url\(#([^)]+)\)/g, (_, a) => `url(#${pfx}${a})`)
    .replace(/(xlink:)?href="#([^"]+)"/g, (_, x, a) => `href="#${pfx}${a}"`)
    .replace(/<!--[\s\S]*?-->/g, '').replace(/>\s+</g, '><');
  inner = tidyPaths(inner);
  return `<g id="${gid}">${inner}</g>`;
}
function prepare(h) {
  let e = RIGS.get(h.key);
  if (e) { RIGS.delete(h.key); RIGS.set(h.key, e); return e; }
  const rig = L.buildCssRig(h.spec, undefined, { views: false, splitLegs: true });
  const char = rig.characters[0], comp = char.composition;
  const pfx = 'h' + hashSeed(h.key).toString(36) + '_';
  const sym = {};
  for (const id of Object.keys(comp)) {
    const p = comp[id];
    if (!p || !p.imageUrl || id === 'mouth') continue;
    const gid = pfx + 'P_' + id;
    const g = symbolize(dataUrlSvg(p.imageUrl), pfx + id + '_', gid);
    if (g) sym[id] = { id: gid, g };
  }
  const mouths = {};
  const mouthDefs = (mood) => {
    if (mouths[mood]) return mouths[mood];
    const set = rig.mouthSets[mood] || rig.mouthSets.neutral;
    const ids = {}; let out = '';
    for (const v of L.VISEMES) {
      const gid = `${pfx}M_${mood}_${v}`;
      const g = symbolize(dataUrlSvg(set[v]), `${pfx}m${mood[0]}${v}_`, gid);
      if (g) { out += g; ids[v] = gid; }
    }
    return (mouths[mood] = { defs: out, ids });
  };
  let frontDefs = '', turnExtra = '';
  for (const id of Object.keys(sym)) { if (VIEW_ONLY.has(id)) turnExtra += sym[id].g; else frontDefs += sym[id].g; }
  // draw order: the rig lists parts front -> back (a depth-first walk gives the stack), so draw it reversed
  const order = [];
  const seen = new Set();
  const walk = (id) => { if (seen.has(id)) return; seen.add(id); const p = comp[id]; if (!p) return; order.push(id); for (const c of (p.children || [])) walk(c); };
  walk('root');
  order.reverse();
  e = { key: h.key, rig, char, comp, pfx, sym, mouthDefs, frontDefs, turnExtra, order, G: rig.geometry, R: L.view25Rig(char, rig.geometry, null), defsCache: new Map() };
  RIGS.set(h.key, e);
  if (RIGS.size > RIG_MAX) RIGS.delete(RIGS.keys().next().value);
  return e;
}
function defsFor(e, mood, turned) {
  const k = mood + (turned ? '|t' : '|f');
  let d = e.defsCache.get(k);
  if (!d) { d = e.frontDefs + (turned ? e.turnExtra : '') + e.mouthDefs(mood).defs; e.defsCache.set(k, d); }
  return d;
}

// ---------------------------------------------------------------------------------------------------------
// Pose mapping: the app's pose model (arm angles 0 = down, 90 = sideways, 180 = up) -> Animato arm poses
// ---------------------------------------------------------------------------------------------------------
const knots = (x, K) => {
  if (x <= K[0][0]) return K[0][1] + (x - K[0][0]);
  for (let i = 1; i < K.length; i++) if (x <= K[i][0]) { const a = K[i - 1], b = K[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
  const z = K[K.length - 1]; return z[1] + (x - z[0]);
};
// The stickman's relaxed arms (34, -36) hold the hands in front of the hips; a person's relaxed arms simply hang.
const UA_K = [[-60, -40], [0, 0], [34, 8], [90, 70], [130, 126], [150, 150], [180, 180]];
const FLEX_K = [[-90, -90], [-20, -16], [0, 4], [40, 10], [70, 16], [90, 30], [130, 108], [175, 160]];
const DEF_ARMS = [34, -36, 34, -36];
const armAt = (a, i) => ({ ua: +a[i * 2], fa: +a[i * 2 + 1] });
function mapArm(ua, fa, hand) {
  const out = knots(ua, UA_K);
  let flex = knots(ua - fa, FLEX_K);
  // a person's arm held out to the side is never ruler-straight: the elbow bends a little more the higher it goes
  if (out > 25 && out < 122) flex = Math.max(flex, (38 + (out - 25) * .24) * (1 - smooth(104, 122, out)));
  return { out: cl(out, -35, 178), flex: cl(flex, -160, 160), wrist: cl(-flex * .1, -22, 22), hand: hand || (out > 118 ? 'open' : 'relaxed') };
}
const mix = (a, b, t) => ({ out: lerp(a.out, b.out, t), flex: lerp(a.flex, b.flex, t), wrist: lerp(a.wrist || 0, b.wrist || 0, t), hand: t < .5 ? a.hand : b.hand, lift: lerp(a.lift || 0, b.lift || 0, t), upperScale: lerp(a.upperScale ?? 1, b.upperScale ?? 1, t), foreScale: lerp(a.foreScale ?? 1, b.foreScale ?? 1, t) });
const HANDS = ['relaxed', 'open', 'point', 'fist'];
const handName = (v) => { const s = word(v); return s === 'closed' ? 'fist' : s === 'pointing' ? 'point' : HANDS.includes(s) ? s : ''; };

// ---------------------------------------------------------------------------------------------------------
// Mouth: letters of speech from the voice level
// ---------------------------------------------------------------------------------------------------------
function visemeFor(T, mo, phase) {
  // the mouth of the word being said (letters -> shapes, see public/motion-polish.js); the voice level only decides how wide
  const lip = getLip();
  if (lip && lip.v && lip.m) {
    let v = lip.v;
    if (v === 'AI' && lip.m.open < .5) v = 'CONS';
    else if (v === 'O' && lip.m.open < .34) v = 'U';
    else if (v === 'E' && lip.m.open < .16) v = 'CONS';
    return v;
  }
  const step = Math.floor(T * 13 + phase * 3), h = hashInt(step * 7919 + 13);
  if (mo < .09) return (Math.floor(T * 9 + phase * 5) & 3) === 0 ? 'MBP' : 'REST';
  if (mo > .72) return ['AI', 'O', 'AI', 'E'][h & 3];
  if (mo > .42) return ['AI', 'E', 'O', 'U', 'AI', 'E'][h % 6];
  if (mo > .2) return ['E', 'U', 'L', 'FV', 'CONS', 'E'][h % 6];
  return ['CONS', 'L', 'MBP', 'U'][h & 3];
}
const MOOD_OF = { smile: 'smile', grin: 'happy', open: 'happy', smirk: 'smile', frown: 'sad', flat: 'neutral' };

// ---------------------------------------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------------------------------------
const SCALE = 0.46;           // scene pixels per character unit -> a standing person is ~590px tall in 1600x900
const NEAR = (v, t, tol) => Math.abs(v - t) <= tol;

export function renderHuman(look, P, talk, mo, blk, view, uid, idx) {
  const Lk = look && typeof look === 'object' ? look : {};
  P = P || {};
  const h = humanSpec(Lk, idx);
  const e = prepare(h);
  const { G, comp, R, rig } = e;
  const per = h.persona;
  const T = STATE.clock, tt = T * per.tempo;
  const vw = view === 'side' ? 'side' : view === 'back' ? 'back' : 'front';
  const cid = e.char.id;
  const key = (id, f) => `part:${cid}:${id}:${f}`;
  const anim = {};
  const set = (id, f, v) => { if (comp[id]) anim[key(id, f)] = v; };
  const talking = !!talk;
  const mouthOpen = cl(Number.isFinite(+mo) ? +mo : .5, 0, 1);
  const lvl = talking ? mouthOpen : 0;

  // ---- expression ----
  const ex = resolveExpression(Lk);
  const exWord = word(Lk.expression);
  const explicit = Lk.mouth !== undefined || Lk.brow !== undefined || exWord !== '';
  let mouthWord = explicit ? ex.mouth : per.rest;
  let browWord = explicit ? ex.brow : per.brow;
  if (Lk.mouth === undefined && exWord === '') mouthWord = per.rest;
  if (Lk.brow === undefined && exWord === '') browWord = per.brow;
  // the acting face (public/expressions.js) also sets the MOUTH: a scared, sad or angry person no longer keeps their resting smile
  const emo0 = P.emo && typeof P.emo === 'object' ? P.emo : null;
  if (emo0 && typeof emo0.m === 'string' && emo0.m) mouthWord = emo0.m;
  else if (emo0 && Number.isFinite(+emo0.smile)) mouthWord = +emo0.smile < -.25 ? 'frown' : +emo0.smile > .6 ? (mouthWord === 'grin' ? 'grin' : 'smile') : mouthWord;
  const mood = emo0 && /^(scream|wobble|frown|wail|grit|snarl)$/.test(emo0.mf || '') ? 'sad' : (MOOD_OF[mouthWord] || 'smile');
  const wide = !!ex.wide || /^(shock|surprised|scared)$/.test(exWord) || !!(emo0 && emo0.ek === 'wide');
  const happyEyes = (mouthWord === 'grin' && browWord === 'happy') || /^(laughing|laugh|love|wink)$/.test(exWord);
  const crying = exWord === 'cry' || exWord === 'crying' || exWord === 'sob';
  const closed = (Number.isFinite(+blk) ? +blk : 1) < .5 || exWord === 'sleepy' && hash01(Math.floor(T * 2)) < .5;
  // the face is acting (public/expressions.js passes the continuous dials in the pose, so the cached spec of the person is untouched)
  const emo = P.emo && typeof P.emo === 'object' ? P.emo : null;

  // ---- time-based life (a pure function of the clock, so a preview and an export match frame for frame) ----
  const ph = per.phase, ph2 = per.phase2;
  const breath = sin(tt * 1.7 + ph) * .006 * per.en;
  const shift = sin(tt * .45 + ph) * .9 * per.sway + sin(tt * 1.1 + ph2) * .35 * per.sway;     // weight shifting, degrees
  const ptype = per.quirk;
  // eyes wander: a new target every second or so, with a quick glide to it
  const sper = (1.5 + hash01(h.seed) * 1.2) / Math.max(.4, per.sac);
  const sidx = Math.floor((T + ph * 2) / sper), sfrac = smooth(0, .16, ((T + ph * 2) / sper) - sidx);
  const tgt = (i) => ({ x: (hash01(i * 131 + h.seed) - .5) * 2 + per.gaze.x * .6, y: (hash01(i * 977 + h.seed) - .5) * 1.2 + per.gaze.y * .5 });
  const g0 = tgt(sidx - 1), g1 = tgt(sidx);
  let gx = lerp(g0.x, g1.x, sfrac), gy = lerp(g0.y, g1.y, sfrac);
  const hx = +P.hx || 0, hy = +P.hy || 0;
  gx = cl(gx * .65 + hx * .25, -1, 1); gy = cl(gy * .6 + hy * -.05, -1, 1);
  if (emo) { gx = cl(gx * .35 + (+emo.gx || 0) * .9, -1, 1); gy = cl(gy * .35 + (+emo.gy || 0) * .9, -1, 1); }

  // ---- arms ----
  const a = Array.isArray(P.a) && P.a.length >= 4 ? P.a.map((v) => +v || 0) : DEF_ARMS.slice();
  const handsIn = Array.isArray(P.hands) ? P.hands : P.hand !== undefined ? [P.hand, P.hand] : [];
  const atRest = NEAR(a[0], 34, 13) && NEAR(a[1], -36, 15) && NEAR(a[2], 34, 13) && NEAR(a[3], -36, 15);
  const clap = a[0] < -8 && a[2] < -8 && a[1] < -4 && a[3] < -4;
  let pr, pl;   // pr = the arm on the screen's left (a[0], a[1]); pl = the screen's right (a[2], a[3])
  if (clap) {
    const k = cl((-a[0] - 20) / 34, 0, 1);
    pr = { out: 4 - 4 * k, flex: 98 + 18 * k, wrist: 8, hand: 'open' }; pl = { ...pr };
  } else if (atRest) {
    const rp = L.POSES[per.restPose] || L.POSES.rest;
    const micro = (i) => ({ out: rp.out + sin(tt * 1.3 + ph + i) * 1.4 * per.sway, flex: rp.flex + sin(tt * 1.9 + ph2 + i * 2) * 2 * per.sway, wrist: rp.wrist, hand: 'relaxed', foreScale: rp.foreScale });
    pr = micro(0); pl = micro(1);
    if (talking && per.gest > .05) {
      const gp = 3.0 / per.tempo, gi = Math.floor((T + ph) / gp), u = ((T + ph) / gp) - gi;
      // a person gestures on most phrases, not on every breath: about four in five, then the hands rest
      const gOn = hashInt(gi * 53 + h.seed) % 5 !== 0 ? 1 : 0;
      const env = gOn * Math.pow(sin(PI * cl(u * 1.5, 0, 1)), .8) * cl(.4 + lvl * .8, 0, 1) * cl(per.gest, 0, 1.2);
      const name = per.reps[hashInt(gi * 31 + h.seed) % per.reps.length], gpose = L.POSES[name] || L.POSES.explain;
      const hnd = hashInt(gi * 17 + h.seed) % 3;      // 0 = the screen-left hand, 1 = the screen-right hand, 2 = both
      const beat = sin(T * 7.5 + ph) * 5.5 * lvl * per.gest;
      const mk = (i, w) => { const m = mix(i ? pl : pr, gpose, cl(env * w, 0, 1.1)); m.out += beat * w * .5; m.flex += beat * w * 1.3; if (gpose.hand && env * w > .6) m.hand = gpose.hand; return m; };
      pr = mk(0, hnd === 1 ? .28 : 1); pl = mk(1, hnd === 0 ? .28 : 1);
      if (name === 'shrug') { pr.lift = (gpose.lift || 0) * env; pl.lift = pr.lift; }
    }
  } else {
    pr = mapArm(a[0], a[1]); pl = mapArm(a[2], a[3]);
  }
  const hn0 = handName(handsIn[0]), hn1 = handName(handsIn[1] !== undefined ? handsIn[1] : handsIn[0]);
  if (hn0) pr.hand = hn0; if (hn1) pl.hand = hn1;
  if (vw === 'back') {
    // seen from behind, hands held in front of the body (clasped, explaining, on the chest) are hidden by the body:
    // the front-view art would swing those forearms outward and leave hands floating beside the person
    for (const pz of [pr, pl]) if (pz.flex > 24 && pz.out < 70) { pz.flex = 18; pz.wrist = 2; pz.foreScale = 1; pz.hand = 'relaxed'; }
  }
  const sideArms = { [-1]: pr, [1]: pl };
  for (const arm of rig.arms) {
    const pose = sideArms[arm.side];
    L.applyArmPose(anim, cid, arm, { out: pose.out, flex: pose.flex, wrist: pose.wrist, hand: pose.hand, lift: pose.lift || 0, upperScale: pose.upperScale, foreScale: pose.foreScale }, { x: 0, y: 0 }, 0);
  }

  // ---- legs (front art: a stride shortens the leg and swings it a little; in profile it swings from the hip) ----
  const l = Array.isArray(P.l) && P.l.length >= 4 ? P.l.map((v) => +v || 0) : [0, 0, 0, 0];
  const kb = Math.max(0, +P.k || 0), sitting = !!P.chair && kb > 1;
  const legIds = Object.keys(comp).filter((id) => /^leg/.test(id));
  const gait = Array.isArray(P.kn);
  let reachMax = 0;
  const kneeDeg = {};
  for (const id of legIds) {
    const p = comp[id], screenLeft = (p.transform.anchorX ?? 50) < 50, i = screenLeft ? 0 : 1;
    const sw = l[i], lift = l[2 + i];
    let rot = 0, sy = 1, dy = 0;
    if (sitting) {
      if (vw === 'side') { rot = -62; sy = .78; } else { sy = .52; }
    } else if (vw === 'side') {
      const kb2 = gait ? cl(+P.kn[i] || 0, 0, 140) : 0;       // knee bend of the walking cycle: the foot trails back and rises
      // a real knee: the thigh swings from the hip, the shin folds back about the knee (drawn as two clipped copies of the leg, see below)
      rot = -cl(sw, -70, 70) * .95 + kb2 * .1; sy = 1 - Math.abs(sin(rot * PI / 180)) * .05; dy = -lift * 2.2;
      kneeDeg[id] = kb2 * .66;
      if (gait) reachMax = Math.max(reachMax, cos(rot * PI / 180) * sy);
    } else {
      rot = (screenLeft ? 1 : -1) * Math.abs(sw) * .14 * (sw > 0 ? 1 : .6);
      const kb2 = gait ? cl(+P.kn[i] || 0, 0, 140) : 0;
      sy = cl(cos(sw * PI / 180 * .85) - kb2 * .004, .5, 1); dy = -(lift * 2.2) - Math.abs(sin(sw * PI / 180)) * 14;
      if (kb > 1) sy = cl(sy * cos(kb * PI / 180 * .4), .55, 1);
    }
    set(id, 'rotation', rot); set(id, 'scaleY', sy); set(id, 'y', p.transform.y + dy);
  }

  // ---- face ----
  const eyesOpen = !closed && !happyEyes;
  for (const s of ['l', 'r']) {
    for (const id of ['eyeball', 'pupil', 'lashes']) set(`${id}_${s}`, 'opacity', eyesOpen ? 1 : 0);
    set(`blink_${s}`, 'opacity', closed && !happyEyes ? 1 : 0);
    set(`smile_eyes_${s}`, 'opacity', happyEyes ? 1 : 0);
    set(`tear_${s}`, 'opacity', crying ? 1 : 0);
    if (eyesOpen && wide) { set(`eyeball_${s}`, 'scaleY', 1.12); set(`eyeball_${s}`, 'scaleX', 1.04); }
    if (emo && eyesOpen) {
      // how open the eyes are: heavy lids for tired, smug or angry, stunned and wide for shock and fear
      const eo = cl(+emo.eye || 1, .22, 1.5), sy = cl(eo, .26, 1.3);
      set(`eyeball_${s}`, 'scaleY', sy); set(`pupil_${s}`, 'scaleY', cl(sy, .3, 1.15));
      if (eo > 1.12) set(`eyeball_${s}`, 'scaleX', 1 + (eo - 1) * .12);
      if (eo < .3) { set(`blink_${s}`, 'opacity', 1); for (const id of ['eyeball', 'pupil', 'lashes']) set(`${id}_${s}`, 'opacity', 0); }
    }
    if (emo && Array.isArray(emo.fx) && emo.fx.includes('tear')) set(`tear_${s}`, 'opacity', 1);
    const pc = comp[`pupil_${s}`];
    if (pc && eyesOpen) { set(`pupil_${s}`, 'x', pc.transform.x + gx * 5.5); set(`pupil_${s}`, 'y', pc.transform.y + gy * 3.2); }
  }
  const blushFx = !!(emo && Array.isArray(emo.fx) && emo.fx.includes('blush'));
  set('cheek_glow', 'opacity', blushFx ? .95 : mood === 'happy' ? .9 : mood === 'smile' ? .45 : (crying ? .7 : 0));
  let talkBrow = -lvl * 2.6, bAdj = browWord === 'angry' ? { r: 14, y: 3.5 } : browWord === 'sad' ? { r: -12, y: -1.5 } : browWord === 'happy' ? { r: -2, y: -4 } : { r: 0, y: 0 };
  let surprise = wide ? -8 : 0;
  // continuous brows: slant by the feeling (angry = inner ends down, worried or sad = inner ends up), lifted or lowered, one higher for doubt
  if (emo) {
    const tl = cl(+emo.tilt || 0, -1.4, 1.4), ra = cl(+emo.raise || 0, -.8, 1.2);
    bAdj = { r: -tl * 19, y: (tl < 0 ? -tl * 5 : -tl * 2.2) + (ra < 0 ? -ra * 7 : 0) };
    surprise = -ra * (ra > 0 ? 11 : 0);
  }
  const asy = emo ? cl(+emo.as || 0, 0, 1) : 0;
  for (const s of ['l', 'r']) {
    const b = comp[`brow_${s}`]; if (!b) continue;
    const dirn = s === 'l' ? -1 : 1;       // brow_l sits on the screen's right
    set(`brow_${s}`, 'rotation', dirn * bAdj.r);
    set(`brow_${s}`, 'y', b.transform.y + bAdj.y + talkBrow + surprise + (s === 'l' ? -asy * 6 : asy * 1.2) + sin(tt * .8 + ph2) * .5);
  }
  // mouth: a picture per letter of speech, drawn from the voice level
  const emoWide = emo && /^(scream|laugh|open|wail)$/.test(emo.mf || '') && (+emo.open || 0) > .5;
  const vis = talking ? visemeFor(T, mouthOpen, ph) : (mouthWord === 'open' && !explicitClosed(Lk) ? (emoWide ? 'AI' : 'O') : 'REST');
  const mset = e.mouthDefs(mood);
  const mouthSym = mset.ids[vis] || mset.ids.REST;

  // ---- head and body ----
  const rawTr0 = +P.tr || 0, fwd0 = vw === 'side' ? 0 : smooth(10, 32, Math.abs(rawTr0));
  const yawIn = clamp01(hx * 2.6, -16, 16);
  const pitchIn = cl(-hy * 1.6, -26, 26);
  const nod = lvl * 2.4 * sin(T * 5.1 + ph);
  const aim = vw === 'front' ? cl((+P.yaw || 0), -1, 1) * 34 : 0;      // 2.5D head turn toward the person being talked to (public/gaze.js); the body stays
  const yaw = yawIn + sin(tt * .42 + ph) * 2.6 * per.tilt + gx * 3.5 + aim;
  const pitch = cl(pitchIn + sin(tt * .5 + ph2) * 1.4 + nod + gy * -2.2 - per.post * 1.2 - fwd0 * 20, -34, 34);
  const roll = (+P.hr || 0) + sin(tt * .62 + ph2) * 1.5 * per.tilt + sin(T * 3.1 + ph) * 1.1 * lvl * per.tilt;
  // a small lean is a sway; a big one in a front or back view is a bow, which reads as a nod forward, not a tilt sideways
  const rawTr = +P.tr || 0, fwd = vw === 'side' ? 0 : smooth(10, 32, Math.abs(rawTr));
  let tr = (vw === 'side' ? rawTr : cl(rawTr, -10, 10)) + shift;
  if (ptype && /tap|fidget|bounce/.test(ptype) && !talking) tr += sin(T * 9 + ph) * .5;
  const lean = tr;
  let bodyYaw, headYaw = yaw;
  if (vw === 'side') { headYaw = 84 + yaw * .25; bodyYaw = 80; } else if (vw === 'back') { headYaw = 180 - yaw * .25; bodyYaw = 180; } else bodyYaw = (yaw - aim) * .3;
  if (Math.abs(headYaw) > .2 || Math.abs(pitch) > .2 || Math.abs(bodyYaw) > .2) L.applyView25(R, anim, { yaw: headYaw, pitch, bodyYaw });
  const dxh = clamp01(hx * .3, -2, 2) * 2;       // head drift in character units

  // ---- compose ----
  const turned = vw !== 'front' || Math.abs(headYaw) > 12;
  const defs = defsFor(e, mood, turned) ;
  const defsId = e.pfx + mood + (turned ? 't' : 'f');
  const bendQ = 1 - .13 * fwd;
  const pelvis = G.frame.pelvis;
  const upperXf = `translate(0 ${f2(pelvis)}) rotate(${f2(lean)}) scale(1 ${f2((1 + breath + per.post * .008) * bendQ)}) translate(0 ${f2(-pelvis)})`;
  const neck = comp.neck;
  const pivotY = neck ? neck.transform.y + neck.height / 2 - 6 : G.headC.y + G.faceH * .5;
  const headDy = clamp01(hy * .9 + (per.post < 0 ? -per.post * 3 : 0) + lvl * Math.abs(sin(T * 5.1 + ph)) * .8, -6, 16);
  // animation proportions: the generator's fashion-figure head (about 1/8.5 of the body) is read as tiny on a phone, so faces could not act.
  // The head (and the hair behind it) is drawn a little bigger around the neck, like character animation does (about 1/7).
  const HS = Number.isFinite(+look?.headScale) ? Math.max(.85, Math.min(1.35, +look.headScale)) : 1.17;
  const headXf = `translate(${f2(dxh)} ${f2(headDy)}) translate(0 ${f2(pivotY)}) rotate(${f2(roll)}) scale(${f2(HS)}) translate(0 ${f2(-pivotY)})`;
  const hairBackXf = `translate(${f2(dxh)} ${f2(headDy)}) translate(0 ${f2(pivotY)}) scale(${f2(HS)}) translate(0 ${f2(-pivotY)})`;
  const partXf = (id) => {
    const p = comp[id], t = p.transform;
    const ox = p.width * ((t.anchorX ?? 50) / 100 - .5), oy = p.height * ((t.anchorY ?? 50) / 100 - .5);
    const g = (f, d) => { const v = anim[key(id, f)]; return v === undefined ? d : v; };
    const x = g('x', t.x), y = g('y', t.y), r = g('rotation', t.rotation || 0), sx = g('scaleX', t.scaleX ?? 1), sy = g('scaleY', t.scaleY ?? 1);
    return `translate(${f2(x + ox)} ${f2(y + oy)})${r ? ` rotate(${f2(r)})` : ''}${(sx !== 1 || sy !== 1) ? ` scale(${f2(sx)} ${f2(sy)})` : ''} translate(${f2(-ox)} ${f2(-oy)})`;
  };
  let body = '';
  let sideDrop = 0;
  if (vw === 'side') {
    // ---- real profile body (see human-profile.js): only the head comes from the front-view rig ----
    const armOf = (raw, pz, hnd) => {
      if (gait || !atRest || clap) { const m = profileArm(raw[0], raw[1]); return { up: m.up, fore: m.fore, hand: hnd || pz.hand || 'relaxed', lift: pz.lift || 0 }; }
      const up = cl(pz.out, -40, 180);
      return { up, fore: up + Math.abs(pz.flex || 0) * .95 + 4, hand: hnd || pz.hand || 'relaxed', lift: pz.lift || 0 };
    };
    const legOf = (i) => {
      const sw = l[i], kn = gait ? cl(+P.kn[i] || 0, 0, 140) : 0, ft = Array.isArray(P.ft) ? cl(+P.ft[i], 0, 1) : 1;
      if (sitting) return { thigh: 84 - i * 6, shin: -4 + i * 4, foot: 1 };
      if (kb > 1) { const k2 = cl(kb, 0, 120); return { thigh: k2 * .55 + (i ? 4 : -4), shin: k2 * .55 - k2 * 1.05, foot: 1 }; }
      const th = cl(sw, -70, 70) * .95 + kn * .12;
      // standing still, the far foot rests a little behind the near one, as people stand
      const stance = gait ? 0 : (i ? 2.5 : -3.5);
      return { thigh: th + stance, shin: th + stance - kn * .75, foot: ft };
    };
    const hh0 = G.frame.feet - G.frame.pelvis;
    const PB = profileBody(h.spec, G, { arms: [armOf([a[0], a[1]], pr, hn0), armOf([a[2], a[3]], pl, hn1)], legs: [legOf(0), legOf(1)], sitting, sitDrop: sitting ? hh0 * .44 : 0 }, e.pfx + 's');
    sideDrop = PB.drop;
    body += `<g transform="${upperXf}">${PB.back}</g>` + PB.legs + `<g transform="${upperXf}">${PB.torso}${PB.neck}</g>`;
    for (const id of e.order) {
      const p = comp[id];
      if (!p || p.isGroup) continue;
      if (p.parentId !== 'headGroup' && id !== 'hair_back') continue;
      let op = anim[key(id, 'opacity')]; if (op === undefined) op = p.opacity ?? 1;
      if (op < .01) continue;
      let sid;
      if (id === 'mouth') sid = mouthSym; else { const s = e.sym[id]; if (!s) continue; sid = s.id; }
      let xf = partXf(id);
      if (p.parentId === 'headGroup') xf = headXf + ' ' + xf; else if (id === 'hair_back') xf = hairBackXf + ' ' + xf;
      xf = upperXf + ' ' + xf;
      body += `<use href="#${sid}" transform="${xf}"${op < .995 ? ` opacity="${f2(op)}"` : ''}/>`;
    }
    body += `<g transform="${upperXf}">${PB.front}</g>`;
  }
  if (vw !== 'side') for (const id of e.order) {
    const p = comp[id];
    if (!p || p.isGroup) continue;
    let op = anim[key(id, 'opacity')]; if (op === undefined) op = p.opacity ?? 1;
    if (op < .01) continue;
    let sid;
    if (id === 'mouth') sid = mouthSym; else { const s = e.sym[id]; if (!s) continue; sid = s.id; }
    const isLeg = /^leg/.test(id);
    const inHead = p.parentId === 'headGroup';
    let xf = partXf(id);
    if (inHead) xf = headXf + ' ' + xf; else if (id === 'hair_back') xf = hairBackXf + ' ' + xf;
    if (!isLeg) xf = upperXf + ' ' + xf;
    const kd = isLeg ? kneeDeg[id] || 0 : 0;
    if (kd > 1.5) {
      // thigh above the knee, shin below it folded back about the knee, a round joint hiding the seam
      const w = p.width, hgt = p.height, kx = w / 2, ky = hgt * .48, R = w * .56, ido = e.pfx + 'k';
      const opa = op < .995 ? ` opacity="${f2(op)}"` : '';
      body += `<clipPath id="${ido}u${id}"><rect x="-6" y="-6" width="${f2(w + 12)}" height="${f2(ky + 6)}"/><circle cx="${f2(kx)}" cy="${f2(ky)}" r="${f2(R)}"/></clipPath>`
        + `<clipPath id="${ido}l${id}"><rect x="-6" y="${f2(ky)}" width="${f2(w + 12)}" height="${f2(hgt - ky + 12)}"/></clipPath>`
        + `<use href="#${sid}" transform="${xf} translate(${f2(kx)} ${f2(ky)}) rotate(${f2(kd)}) translate(${f2(-kx)} ${f2(-ky)})" clip-path="url(#${ido}l${id})"${opa}/>`
        + `<use href="#${sid}" transform="${xf}" clip-path="url(#${ido}u${id})"${opa}/>`;
    } else body += `<use href="#${sid}" transform="${xf}"${op < .995 ? ` opacity="${f2(op)}"` : ''}/>`;
  }

  // ---- outer transform: the same conventions as the stickman rig (shadow, move, squash, spin, scale) ----
  const dx = +P.dx || 0, pDy = +P.dy || 0, sq = Math.max(.2, +P.sq || 1), scl = Math.max(.2, +P.sc || 1);
  const bounce = per.bounce && talking ? -Math.max(0, sin(T * 6.2 + ph)) * 3 * lvl : 0;
  const hh = G.frame.feet - G.frame.pelvis;
  const sitDrop = sitting ? hh * .44 : 0;
  const S = SCALE * h.scale;
  // while walking, the foot that carries the weight stays on the ground: the body drops as the stride opens
  const plantDrop = 0;   // side view: the profile body puts the planted foot on the ground itself (sideDrop)
  const effDy = (sitting ? Math.min(pDy, 0) : pDy) + bounce + plantDrop;
  const shScaleY = pDy < 0 ? Math.max(.18, 1 + pDy / 500) : 1;
  const shadowRx = Math.round(90 * h.scale * shScaleY * (vw === 'side' ? .75 : 1));
  const seatY = Math.round(880 - (hh - sitDrop) * S + 8);
  const chairInfo = P.chair ? { seatY, vk: vw === 'side' ? 's' : vw === 'back' ? 'b' : 'f' } : null;
  const svg =
    `<ellipse cx="${f2(dx)}" cy="880" rx="${shadowRx}" ry="${f2(11 * shScaleY)}" fill="#000" opacity=".16"/>` +
    '<!--CHAIR_B-->' +
    `<g transform="translate(${f2(dx)},${f2(effDy)}) translate(0,880) scale(${f2(1 / sq)},${f2(sq)}) translate(0,-880) translate(0,560) rotate(${f2(P.rot || 0)}) scale(${f2(scl)}) translate(0,-560)">` +
    `<g transform="translate(0,880) scale(${f2(S)}) translate(0,${f2(-G.frame.feet + sitDrop + sideDrop)})">${body}</g></g>` +
    '<!--CHAIR_F-->';
  return { svg, chair: chairInfo, defs, defsId };
}
const explicitClosed = (Lk) => Lk.mouth !== undefined && Lk.mouth !== 'open';

/** How many distinct people are prepared (for tests and diagnostics). */
export function humanCacheSize() { return RIGS.size; }
export function clearHumanCache() { RIGS.clear(); }
