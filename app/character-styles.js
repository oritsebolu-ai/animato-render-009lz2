// Character styles that plug into the scene engine next to Original / Stickman / Reference image.
//   human:  lifelike Animato people (a million looks per gender), designed per story, with personality, lip sync and acting
//   doodle: hand-drawn pencil + watercolor big-head kids (Doodle Maker)
// Every character in a scene is generated from a seed, so every person in a film is unique,
// and the same seed always gives the same person, so the cast stays consistent across scenes.
// The style is only HOW a person is drawn. WHO they are (face, hair, clothes, age, personality, habits) is designed
// by the AI for each story, and a per-film salt makes sure two films never share the same cast.

import { renderStickChairSvg } from './character-engine.js';
import { hfSpec, hfRandomLook, HF_OPTIONS, hashSeed, seedFromLook, renderHumanForge } from './style-humanforge.js';
import { renderHuman, humanSpec, humanRandomLook, HUMAN_OPTIONS, setCastSalt, getCastSalt, setClock } from './style-human.js';
import { renderDoodle, ddSpec, DOODLE_OPTIONS } from './style-doodle.js';

export { hfSpec, ddSpec, hfRandomLook, hashSeed, seedFromLook, HF_OPTIONS, DOODLE_OPTIONS, HUMAN_OPTIONS, humanSpec, humanRandomLook, setCastSalt, getCastSalt, setClock };

export const NEW_STYLES = ['human', 'doodle'];

export function normalizeStyle(v) {
  const s = String(v == null ? '' : v).toLowerCase().replace(/[^a-z]/g, '');
  if (['human', 'humanforge', 'hf', 'forge', 'animato', 'people', 'person', 'realistic', 'lifelike'].includes(s)) return 'human';
  if (s === 'doodle' || s === 'doodles' || s === 'doodlemaker') return 'doodle';
  return '';
}
export function isNewStyle(v) { return NEW_STYLES.includes(normalizeStyle(v)); }

const EMPTY_POSE = { dx: 0, dy: 0, sq: 1, tr: 0, hr: 0, hx: 0, hy: 0, a: [34, -36, 34, -36], l: [0, 0, 0, 0], rot: 0, sc: 1, k: 0, chair: 0 };

function drawStyle(st, look, pose, talk, mo, blk, vw, uid, idx) {
  if (st === 'doodle') return renderDoodle(look, pose, talk, mo, blk, vw, uid, idx);
  try {
    const r = renderHuman(look, pose, talk, mo, blk, vw, uid, idx);
    if (r && r.svg) return r;
  } catch (e) { /* fall through to the built-in drawing below */ }
  return renderHumanForge(look, pose, talk, mo, blk, vw, uid, idx);
}

/** Like renderCharacterStyle, but also returns the shared drawing parts (`defs`, with a stable `defsId`) the picture refers to. */
export function renderCharacterStyleEx(style, look, P, talk, mo, blk, view, uid, idx = 0) {
  const st = normalizeStyle(style);
  const vw = view === 'side' ? 'side' : view === 'back' ? 'back' : 'front';
  const pose = Object.assign({}, EMPTY_POSE, P || {});
  let out;
  try { out = drawStyle(st, look, pose, talk, mo, blk, vw, uid, idx); } catch (e) { return { svg: '', defs: '', defsId: '' }; }
  let svg = out.svg;
  if (out.chair) {
    const ch = renderStickChairSvg(out.chair.vk, out.chair.seatY);
    svg = svg.replace('<!--CHAIR_B-->', ch.b || '').replace('<!--CHAIR_F-->', ch.f || '');
  } else {
    svg = svg.replace('<!--CHAIR_B-->', '').replace('<!--CHAIR_F-->', '');
  }
  return { svg, defs: out.defs || '', defsId: out.defsId || '' };
}

/** Render one character as an SVG fragment in the 1600x900 scene space (feet at y=880, centred on x=0). Shared parts are inlined. */
export function renderCharacterStyle(style, look, P, talk, mo, blk, view, uid, idx = 0) {
  const r = renderCharacterStyleEx(style, look, P, talk, mo, blk, view, uid, idx);
  return r.defs ? `<defs>${r.defs}</defs>${r.svg}` : r.svg;
}

/** A small, serialisable look for a brand-new unique character of a style. */
export function randomCharacterLook(style, seed) {
  const s = (Math.abs(Math.floor(+seed || Math.random() * 1e9)) % 2147483647) || 1;
  if (normalizeStyle(style) === 'doodle') return { seed: s };
  return humanRandomLook(s);
}

/** Preview card art for the character slider (standing, smiling). */
export function renderStylePreview(style, seed = 20260518) {
  const st = normalizeStyle(style);
  const look = st === 'doodle'
    ? { seed, mouth: 'smile', brow: 'calm' }
    : { seed, gender: 'female', persona: 'warm', mouth: 'smile', brow: 'calm' };
  const pose = { ...EMPTY_POSE, a: [30, -30, 30, -30] };
  const g = renderCharacterStyle(st, look, pose, false, 0, 1, 'front', 'pv' + st, 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-250 250 500 660">${g}</svg>`;
}

// ---------- prompt blocks (so the AI writes scene code that uses these characters) ----------
export const STYLE_META = {
  human: {
    id: 'human',
    label: 'Human',
    blurb: 'Lifelike people that talk, move and act. Each one is designed for your story.',
    movieCharacter: 'human',
  },
  doodle: {
    id: 'doodle',
    label: 'Doodle',
    blurb: 'Hand-drawn pencil and watercolor big-head characters, each one unique.',
    movieCharacter: 'doodle',
  },
};

export function styleLookReference(style) {
  const st = normalizeStyle(style);
  if (st === 'human') {
    const O = HUMAN_OPTIONS;
    return `HUMAN LOOK OPTIONS. Every field is optional. The engine builds a complete, unique, fully dressed, lifelike person from "seed" and then applies everything you write on top, so YOU design each person for this story.
HOW TO DESIGN A CAST (do this for every person, before writing any scene):
1. Decide who they are in the story: job, age, place in the plot, how they feel about the situation. Then write a look object that shows it: a sleepy night nurse wears scrubs-like colours and tired eyes, a street-food seller wears an apron-like vest, a villain wears sharp dark clothes and a cold smile. Never leave the outfit to chance for a role that has a recognisable look.
2. WARDROBE VARIETY (never a predictable cast): the app has a big wardrobe, so use it. Give each person a different top, a different bottom (skirts, shorts, cargo, wide trousers, a dress), a pattern or layer or trim on some, different hair style and colour (highlights, ombre), and jewelry, a hair accessory, glasses or a scarf on some. Never put two people in the same outfit type, and do not leave everyone in plain trousers and a solid shirt. Anything you leave out, the app fills from that person's own seed, so each seed is still a different, fully dressed person.
3. Give every person a different silhouette: different age, height, build, hair, colours, face shape and one signature detail (glasses, scarf, beard, hair accessory, jewelry, pattern). No two people in a film may share a seed, an outfit colour and a hairstyle.
4. Give every person a personality ("persona") and, if you like, a "quirk". Personality changes how they stand, breathe, look around, gesture while talking and what their face does at rest, so two people who talk the same lines still act differently.
5. Invent your own random seeds (5 to 9 digit whole numbers). Do not reuse numbers from examples. The seed is the person: reuse a person's seed and look object in every scene they appear in.
FIELDS:
- role: ALWAYS WRITE IT. The person's job or part in this story in 1 to 3 words (nurse, CEO, student, chef, police officer, farmer, grandma, rapper, villain...). Anything you leave out of the clothes is dressed for this role by the app, so a nurse always looks like a nurse.
- seed: whole number. gender: ${O.gender.join(' | ')}. name: first name. age: a number or ${O.age.join(' | ')}. height: 0.8-1.2; build: 0.85-1.25.
- persona: ${O.persona.join(' | ')} (or a few words like "shy but curious"); energy: 0.5-1.8 (how animated they are); quirk: a few words (for example "taps foot", "always fidgets", "stands very straight").
- skin: a tone (${O.skin.join(' | ')}) or '#rrggbb'; face: ${O.face.join(' | ')}; optional face dials 0.8-1.2: faceW, faceH, jaw, chin, cheek, eyeSize, eyeSpacing, noseW, noseLen, mouthW, lipFull, browThick, earSize, neck, shoulders.
- hair: ${O.hair.join(' | ')}; hairc: colour name or '#rrggbb'; hairc2: second colour (gives highlights); hairMode: ${O.hairMode.join(' | ')}; ornament: ${O.hairOrnament.join(' | ')}; ornamentc; eyec: eye colour; lipc: lipstick colour.
- top: ${O.outfit.join(' | ')}; topc; innerc (shirt under a jacket); pattern: ${O.pattern.join(' | ')}; accentc (pattern colour); trim: ${O.trim.join(' | ')}; layer: ${O.layer.join(' | ')}; tie: true | false; tiec.
- bottom: ${O.bottom.join(' | ')} (or 'dress' as the top); bottomc; shoec.
- glasses: ${O.glasses.join(' | ')} | none; beard (men): ${O.beard.join(' | ')} | none; accessory: ${O.accessory.join(' | ')}; necklace: ${O.necklace.join(' | ')}; earrings: ${O.earrings.join(' | ')}; headpiece: ${O.headpiece.join(' | ')}; pin: ${O.pin.join(' | ')}; metal: gold | silver | rose gold | bronze; freckles: true | false.
- Expression (can change per scene without changing who the person is): expression ${O.expression.join(' | ')}, or mouth ${O.mouth.join(' | ')} with brow ${O.brow.join(' | ')}.
Example (write your own, never copy): CAST.nurse = {seed:48213907, role:'night nurse', gender:'female', name:'Imani', age:34, persona:'warm but exhausted', quirk:'rubs her neck', skin:'brown', face:'heart', hair:'bun', hairc:'#1f1a17', top:'cardigan', topc:'#3e8f8c', innerc:'#f3f3f1', bottom:'pants', bottomc:'#34373d', glasses:'round', accessory:'necklace'};
These people use the same acting toolkit as the other styles: poses, views (front, back; never side), walk(), speak(), react() and crowd(). They blink, breathe, look around, move their mouths to the voice and gesture while they talk, all by themselves, so you only direct the story: who walks where, who reacts to whom, who looks at whom (use face/look direction and turn views), and what each person feels in each line.`;
  }
  if (st === 'doodle') {
    return `DOODLE LOOK OPTIONS (every field is optional; the engine draws a complete, unique, hand-drawn pencil-and-watercolor big-head character from "seed"):
- seed: any whole number. THE SEED IS THE PERSON. Give EVERY different person in the film their own different seed (for example hero 1807, boss 4421, reporter 9033). The same seed always draws the same doodle, so reuse a character's seed in every scene they appear in. Never give two different people the same seed.
- gender: 'male' | 'female' (nudges hair and accessories); skin: '#rrggbb' (pale tones, or a playful pop colour); shape (head): ${DOODLE_OPTIONS.shape.join(' | ')}
- hair: ${DOODLE_OPTIONS.hair.join(' | ')}; hairc: '#rrggbb'; eye: ${DOODLE_OPTIONS.eye.join(' | ')}
- bit (signature accessory): ${DOODLE_OPTIONS.bit.join(' | ')}; topc: '#rrggbb' (shirt colour); stripes: true | false; blush: true | false
- Expression (can change per scene without changing who the person is): mouth ${DOODLE_OPTIONS.mouth.join(' | ')}; brow ${DOODLE_OPTIONS.brow.join(' | ')}
Only write the options that matter for the story (a role-defining accessory or shirt colour); leave the rest to the seed so each doodle stays different. Example: CAST.hero = {seed:1807, bit:'goggles', topc:'#7aa6c2', hair:'messy'};
Doodles are drawn big-headed with small bodies, so keep gestures large and readable. They use the same acting toolkit, poses, views (front, back; never side), walk(), speak(), react() and crowd() as the other styles.`;
  }
  return '';
}

export function styleDirective(style) {
  const st = normalizeStyle(style);
  const m = STYLE_META[st];
  if (!m) return '';
  return `${m.label.toUpperCase()} CHARACTER STYLE. Begin with \`movie({title:'...', aspect:'16:9', character:'${m.movieCharacter}'})\`. The app draws every character with its built-in ${m.label} engine, so do NOT write customCharacter(...) factories and do NOT ask for a reference image. Describe each person with a small look object containing a unique "seed" (see below) and the app generates and animates them in front, side and back views.\n${styleLookReference(st)}`;
}

export const STYLE_API_RULE = {
  human: "Use movie({title:'...', aspect:'16:9', character:'human'}). Do not write customCharacter factories. Design every person for the story: a look object with their own invented whole-number seed (same person = same seed and look in every scene) plus persona, age, gender, face, hair, hairc, top, topc, bottom, bottomc, glasses, accessory and any other option that fits their role. No two people share a seed.",
  doodle: "Use movie({title:'...', aspect:'16:9', character:'doodle'}). Do not write customCharacter factories. Every person is a look object with a unique whole-number seed (same person = same seed in every scene) plus optional gender, skin, shape, hair, hairc, eye, bit, topc, stripes, blush, mouth, brow.",
};

export const STYLE_CAST_EXAMPLE = {
  human: "seed:48213907, gender:'male', name:'Tomas', age:52, persona:'gruff but kind', top:'jacket', topc:'#2563eb', hairc:'#9a9a9f', beard:'short'",
  doodle: "seed:1807, bit:'goggles', topc:'#7aa6c2', hair:'messy'",
};
