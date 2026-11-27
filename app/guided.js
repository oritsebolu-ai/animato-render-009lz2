/* Guided mode: prompts that let ChatGPT and other everyday models write scene files as well as the top models.
 *
 * Why it exists: the full prompt is ~70,000 characters of "think like a genius" instructions with an open
 * vocabulary. Top models cope. Everyday models drift, invent functions, cut corners or answer with chat.
 * Guided mode removes all of that and gives the model what weaker models actually need:
 *   - a short contract (one code block, nothing else),
 *   - a closed word list (only things the engine really has),
 *   - a fill-in-the-blank beat template,
 *   - a complete worked example that is tested to compile in the app,
 *   - a beat budget with real numbers (no arithmetic left for the model),
 *   - small parts for long videos, and
 *   - a repair step (healModelOutput) that fixes the usual mistakes before the file is loaded.
 *
 * Pure functions only, so it can be unit-tested in Node and used from the page.
 */

import { backgroundPromptBlock } from './background-mode.js';
import { NOUN_NAMES } from './noun-icons.js';
import { boxRule } from './box-rule.js';
import { creativeBlock } from './creative-mandate.js';

import { EMOTION_NAMES, EXPRESSION_MARKER } from './expressions.js';
import { ACTION_NAMES, ACTING_MARKER } from './acting.js';
import { livelinessRule } from './liveliness.js';
import { contentTypeBlock, isType } from './content-types.js';
import { shotRule, SHOTS_MARKER } from './shots.js';

export const GUIDED_MARKER = 'ANIMATO GUIDED MODE';
export const TIERS = ['guided', 'full'];
export const DEFAULT_TIER = 'guided';

export function normalizeTier(t) {
  return t === 'full' ? 'full' : 'guided';
}

/* Words per second the narration runs at, and the beat length the budget aims for. */
export const WPS = 2.65;
export const BEAT_SEC = 5.5;
export const PART_SEC = 90; /* small parts: each one fits easily in a reply of an everyday chat model */

export const VOCAB = {
  locations: ['apartment', 'garage', 'office', 'bank', 'street', 'cityDay', 'rooftop', 'space', 'lab', 'outdoor', 'room', 'night', 'BLACK'],
  moods: ['warm', 'tense', 'cold', 'night', 'rain', 'storm', 'hype', 'city', 'space', 'dark', 'calm'],
  cameras: ['cover', 'wide', 'push', 'pushSlow', 'pushFace', 'crash', 'pull', 'zoomOut', 'panR', 'panL', 'whipR', 'whipL', 'drama', 'shake', 'heroUp', 'hold'],
  actions: ['idle', 'walkR', 'walkL', 'runR', 'runL', 'sneak', 'tired', 'speak', 'point', 'wave', 'present', 'shrug', 'fist', 'handsup', 'facepalm', 'bow', 'jump', 'dance', 'kick', 'throw', 'shoot', 'collapse', 'sit', 'lie', 'type', 'reach', 'rubhands', 'lookaround', 'react', ...ACTION_NAMES],
  reactions: ['shock', 'fear', 'sad', 'angry', 'laugh', 'cheer', 'clap', 'think', 'point', 'nod', 'no', 'wave'],
  emotions: EMOTION_NAMES,
  icons: [...new Set(['coin', 'bill', 'stack', 'bag', 'box', 'well', 'rocket', 'flame', 'chartUp', 'chartDown', 'bulb', 'gear', 'laptop', 'house', 'trophy', 'crown', 'phone', 'newspaper', 'chip', 'globe', 'lock', 'star', 'heart', 'fire', 'storm', 'factory', 'tower', 'car', 'flag', 'question', 'check', 'cross', 'clock', 'folder', 'sign', 'person'].concat(NOUN_NAMES))],
};

/* ---------- beat budget ---------- */

/** Split a runtime into parts of at most PART_SEC seconds, with exact beat and word counts for each part. */
export function planParts(totalSec, { partSec = PART_SEC, beatSec = BEAT_SEC } = {}) {
  const total = Math.max(15, Math.round(Number(totalSec) || 60));
  const nParts = Math.max(1, Math.ceil(total / partSec));
  const base = Math.floor(total / nParts);
  const parts = [];
  let used = 0;
  let beatNo = 1;
  for (let i = 0; i < nParts; i++) {
    const sec = i === nParts - 1 ? total - used : base;
    const beats = Math.max(3, Math.round(sec / beatSec));
    const words = Math.max(10, Math.round(sec * WPS));
    parts.push({ index: i + 1, of: nParts, sec, beats, words, firstBeat: beatNo, lastBeat: beatNo + beats - 1 });
    used += sec;
    beatNo += beats;
  }
  return {
    totalSec: total,
    parts,
    totalBeats: parts.reduce((a, p) => a + p.beats, 0),
    totalWords: Math.round(total * WPS),
  };
}

/** How many beats a ready-made script needs (used when the person supplies the narration). */
export function beatsForScript(scriptText) {
  const words = String(scriptText || '').trim().split(/\s+/).filter(Boolean).length;
  return { words, beats: Math.max(3, Math.round(words / ((BEAT_SEC - 0.55) * WPS))), seconds: Math.round(words / WPS) };
}

export const beatSeconds = (words) => Math.round((words / WPS + 0.55) * 10) / 10;

/* ---------- character looks ---------- */

const ORIGINAL_LOOK = `look options (all optional): gender: male | female   hair: swept | pompadour | crop | bald   hairc: '#hex'
glasses: rect | round | none   brow: angry | calm | happy | sad   mouth: grin | smile | open | smirk | frown | flat
outfit: zip | crew | suit | hoodie | tee | dress | turtle | labcoat | overalls | jersey | coat   outfitc: '#hex'   skin: '#f2c28f' | '#e0a878' | '#c68b5c' | '#8d5a3b'`;

const ORIGINAL_CAST = [
  "CAST.hero = {gender:'female', hair:'swept', hairc:'#3a2418', skin:'#b97c52', outfit:'hoodie', outfitc:'#7a5a8a', glasses:'round'};",
  "CAST.boss = {gender:'male', hair:'bald', hairc:'#222222', skin:'#e8b896', outfit:'suit', outfitc:'#2b3a55', glasses:'none'};",
];

/**
 * Pick what the prompt says about characters for the chosen style.
 * `lookOptions` is the app's own option text for that style (it is the truth for stickman, human and doodle).
 */
export function characterKit(style, lookOptions = '', packCast = []) {
  const s = String(style || 'original');
  if (s === 'stickman') {
    return {
      movieChar: ", character:'stickman'",
      look: lookOptions || "look options: gender: male | female   hair, hairc, top, topc, bottom, bottomc, shoe, eyewear, expression",
      cast: [
        "CAST.hero = {gender:'female', hair:'bob', hairc:'#3a2418', top:'hoodie', topc:'#7a5a8a', bottom:'jeans', bottomc:'#1f2937', shoe:'sneakers', eyewear:'round', expression:'worried'};",
        "CAST.boss = {gender:'male', hair:'bald', hairc:'#222222', top:'suit', topc:'#2b3a55', bottom:'suit', bottomc:'#2b3a55', shoe:'boots', eyewear:'none', expression:'cool'};",
      ],
    };
  }
  if (s === 'human' || s === 'doodle') {
    return {
      movieChar: `, character:'${s}'`,
      look: lookOptions || 'Every person is a look object with their own invented whole-number seed (same person = same seed everywhere). Design each person for the story: age, persona, hair, clothes, colours.',
      cast:
        s === 'human'
          ? ["CAST.hero = {seed:73920415, gender:'female', name:'Mara', age:29, persona:'determined but anxious', hair:'wavy', hairc:'#3a2418', top:'hoodie', topc:'#7a5a8a', pattern:'stripes', bottom:'skirt-midi', bottomc:'#1f2937', glasses:'round', earrings:'hoops', ornament:'scrunchie'};", "CAST.boss = {seed:18264037, gender:'male', name:'Mr. Voss', age:55, persona:'cold and serious', hair:'sidepart', hairc:'#9a9a9f', top:'suit', topc:'#2b3a55', tie:true};"]
          : ["CAST.hero = {seed:1807, bit:'goggles', topc:'#7a5a8a', hair:'messy'};", "CAST.boss = {seed:2210, bit:'tie', topc:'#2b3a55', hair:'bald'};"],
    };
  }
  if (s === 'custom' && Array.isArray(packCast) && packCast.length) {
    return { movieChar: ", character:'custom'", look: lookOptions || 'Every person is made with packCharacter(...) from the saved character pack (see MY SAVED CHARACTERS).', cast: packCast };
  }
  return { movieChar: '', look: ORIGINAL_LOOK, cast: ORIGINAL_CAST };
}

/* ---------- the tested worked example ---------- */

/** One short film, 7 beats, every kind of beat the app can do. It is compiled in the test suite and in the browser test. */
export function goldExample({ style = 'original', lookOptions = '', aspect = '16:9', batch = '// === ANIMATO BATCH 1 OF 1 ===', packCast = [] } = {}) {
  const kit = characterKit(style, lookOptions, packCast);
  const tall = aspect === '9:16';
  const narration = [
    'Three years ago, Mara had one hundred dollars and a crazy idea nobody believed in.',
    'The bank laughed. Her friends laughed. Even the landlord asked her to please stop dreaming.',
    'So she built it alone, every single night, until her little app had ten thousand users.',
    'But then the real trouble began.',
    'A giant rival copied everything and offered her one million dollars to walk away.',
    'Mara looked at the check, looked at her users, and did the unthinkable.',
    'She said no. And that one word built a company worth a billion.',
  ];
  const d = narration.map((t) => beatSeconds(t.split(/\s+/).length));
  d[3] = 3.4; // the chapter card is a fixed length
  const total = Math.round(d.reduce((a, b) => a + b, 0) * 10) / 10;
  const q = (s) => s.replace(/'/g, "\\'");
  const X = tall
    ? { a: 760, b: 840, c: 800, near: 640, far: 960, prop1: 800, prop2: 800, tag: 800 }
    : { a: 560, b: 1060, c: 700, near: 520, far: 1000, prop1: 1180, prop2: 1150, tag: 1180 };
  const thumb = tall
    ? ''
    : `
thumbnail({aspect:'16:9', background:LOC.office(), tint:['#ff0033',.08], camera:{zoom:1.1, x:800, y:450},
  props:[titleCard('NO TO $1,000,000', {x:1000, y:300, size:150, color:'#ffd54a', t0:0}), item('bag', '$1M', {x:1180, y:600, scale:1.8, t0:0})],
  characters:[{look:CAST.hero, x:420, ground:860, scale:1.1, view:'front'}]});`;
  const lines = [
    batch,
    `/* PLAN: 7 beats, ${total}s. 1 hook (street) | 2 problem (bank) | 3 progress (garage, chart) | 4 chapter card | 5 twist (office) | 6 decision close-up | 7 payoff (rooftop) */`,
    `movie({title:'The Hundred Dollar Idea', aspect:'${tall ? '9:16' : '16:9'}'${kit.movieChar}});`,
    ...kit.cast,
    ...(thumb ? [thumb.trim()] : []),
    `storyboard([
  {n:1, see:'Mara walks alone down a night street, a coin glowing beside her', do:{hero:'walk, stop, look at coin'}, build:[]},
  {n:2, see:'a banker laughs at Mara under a LOAN DENIED banner', do:{hero:'sad', boss:'laugh'}, build:[]},
  {n:3, see:'Mara types at night, a users chart climbs to 10,000', do:{hero:'type, cheer'}, build:[]},
  {n:4, see:'black chapter card', do:{}, build:[]},
  {n:5, see:'a smug boss offers $1,000,000, Mara stunned', do:{boss:'speak', hero:'shock'}, build:[]},
  {n:6, see:'close-up: Mara thinks, then clenches her fist', do:{hero:'think, fist'}, build:[]},
  {n:7, see:'Mara cheers on a rooftop with a cheering crowd', do:{hero:'cheer'}, build:[]}
]);`,
    '',
    `beat({n:'Hook', d:${d[0]}, s:'street', m:'night', light:{x:1250,y:150,color:'#9fb7ff'}, shot:'establish@0->feet:hero@"Mara"->close:hero@"crazy"', a:[['hero','walkR@0->idle@"crazy"',[${tall ? '700,820' : '200,700'}],[790,800],{brow:'sad',mouth:'flat',face:'hopeful@0->worried@3.4'}]], p:[['tag','CITY · 3 YEARS AGO',${X.tag},120,0.3,5.5],['item','coin','$100',${X.prop1},560,1.1,1.0],['card','ONE CHANCE...',800,170,72,'#ffd54a',2.4,5.8]], say:'${q(narration[0])}'});`,
    `beat({n:'Nobody believed', d:${d[1]}, s:'bank', m:'cold', shot:'two:hero+boss@0->low:boss@"laughed"->high:hero@"friends"->close:hero@"stop"', a:[['hero','react:sad',${X.near},{view:'front',face:'embarrassed@0->sad@2.8'}],['boss','react:laugh',${X.far},{brow:'happy',mouth:'grin',face:'laughing@0->smug@3.6'}]], p:[['headline','LOAN DENIED','BANK',0.5,5.4],['item','cross',null,${tall ? 800 : 1250},300,1.0,1.4],['card','HA HA HA',800,170,72,'#ffd54a',1.6,5.4]], say:'${q(narration[1])}'});`,
    `beat({n:'Building it', d:${d[2]}, s:'garage', m:'night', light:{x:${X.c},y:420,color:'#8fd3ff'}, shot:'hands:hero@0->medium:hero@"night"->push:hero@"users"', a:[['hero','type@0->cheer@4.4',${X.c},[780,800],{brow:'calm',mouth:'smile',face:'tired@0->determined@2.2->excited@4.2'}]], p:[['chart',[1,2,3,5,9,16,30],${tall ? 800 : 1100},${tall ? 380 : 330},${tall ? 400 : 360},200,'USERS',0.8,5.8],['counter',0,10000,'','',800,140,0.6,5.6,'#6fe08a'],['item','laptop','APP',${tall ? 800 : 480},${tall ? 640 : 620},1.0,0.4]], say:'${q(narration[2])}'});`,
    `beat({n:'The turn', chapter:true, d:3.4, say:'${q(narration[3])}'});`,
    `beat({n:'The offer', d:${d[4]}, s:'office', m:'tense', shot:'low:boss@0->ots:hero>boss@"offered"->push:boss@"walk"', flash:1.4, a:[['boss','speak:front',${X.far},{brow:'angry',mouth:'smirk',face:'smug@0->scheming@3'}],['hero','react:shock',${X.near},{view:'back'}]], p:[['headline','BUYOUT OFFER','BREAKING',0.4,5.2],['item','bag','$1,000,000',${tall ? 800 : 800},520,1.3,0.8],['spot',${tall ? 800 : 800},520,260,'#ffd54a',0.8,5.2]], say:'${q(narration[4])}'});`,
    `beat({n:'The choice', d:${d[5]}, s:'office', m:'tense', shot:'eyes:hero@0->close:hero@"users"->push:hero@"did"', a:[['hero','react:think@0->fist@3.6',${X.c},{view:'front',scale:0.9,face:'worried@0->thinking@1.6->determined@3.4'}]], p:[['item','check','OFFER',${tall ? 800 : 1150},330,1.0,0.5],['card','IS THIS THE END?',800,170,72,'#ffd54a',1.2,5.2],['dim',0.25,0,5.4]], say:'${q(narration[5])}'});`,
    `beat({n:'No deal', d:${d[6]}, s:'rooftop', m:'warm', light:{x:1300,y:200,color:'#ffcf8a'}, shot:'close:hero@0->low:hero@"word"->pull:hero@"company"', flash:0.4, a:[['hero','present@0->cheer@2.4',${tall ? 800 : 640},[780,800],{brow:'happy',mouth:'grin',face:'proud@0->excited@2.2'}],['crowd',6,'cheer',840,{view:'back',scale:0.4,par:-0.25}]], p:[['counter',0,1000000000,'$','',800,150,0.5,4.9,'#ffd54a'],['item','trophy',null,${tall ? 800 : 1150},560,1.2,1.2],['year',2021,2026,${tall ? 800 : 1380},300,0.3,5.2]], say:'${q(narration[6])}'});`,
    '// END OF FILE',
  ];
  return { code: lines.join('\n'), narration, beatSeconds: d, totalSec: total };
}

/* ---------- the prompt ---------- */

const FREEDOM = `YOUR CREATIVE TOOLS (all of these work inside beat({...}); mix them freely with the shortcuts):
- YOUR OWN SET: SETS.kitchen = '<defs><linearGradient id="kw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3d9a4"/><stop offset="1" stop-color="#c98f52"/></linearGradient></defs><rect width="1600" height="900" fill="url(#kw)"/>...cabinets, window, table, lamp...'; then s:'kitchen'. A full 1600 x 900 SVG drawing: wall, floor line near y 790, furniture, windows, light sources, depth. Make it specific to the words (a hospital ward, a village market, a bank vault, a forest at night).
- YOUR OWN OBJECT: SVGS.car = '<g>...</g>' (drawn around (0,0) = where it touches the ground, facing right, real size beside a 640-tall person); place it with ['svg','car',x,790,1,t0,'move',{to:[1400,790],t2:3}]. Motions: none | float | pulse | spin | trot | sneak | drop | move | jump. {follow:'hero',dx:170,leash:true} makes it walk with a person (a dog on a leash, a suitcase).
- YOUR OWN ANIMATION: any prop can be a raw object with its own JavaScript: {svg:'<g>...</g>', x:800, y:500, show:[0.5,5], layer:'back'|'front', animate:t=>({x:Math.sin(t*2)*40, y:-t*30, rot:t*90, scale:1+t*.1, opacity:1})}, or {svgFn:t=>'<g>...drawn for time t...</g>', x:800, y:450} for things that change shape (rain falling, fire flickering, a door swinging open, a glass filling, money raining, a bar growing, lightning). Add screen:true to draw on top of the camera (titles, HUDs).
- YOUR OWN CAMERA (only for a move no shot word covers): c:t=>({zoom:1+t*.05, x:800, y:450, rot:0}).
- THE CHARACTERS come from the app (the chosen style). You direct them with moves, expressions, positions, size and timing. People ALWAYS face the camera: walking and running are shown facing the camera while the camera pans to follow them; turned away = view:'back'. Never a side view.
- Draw with care: layered shapes, gradients, shadows, highlights, one light source, one palette; it must read instantly on a phone. SVG only (no <image>, <script> or links); unique gradient ids.`;

const SCENE_BY_SCENE = `SCENE BY SCENE: THE PICTURE IS WHAT THE NARRATOR SAYS (this is the most important rule; work in this order, and nothing limits what you may draw):
1. Cut the narration into scenes: one scene = one sentence or one action. Number them 1, 2, 3...
2. For EACH scene, in order, fill in this worksheet in the storyboard([...]) before any beat code (short entries: do NOT copy the narration into it, the beat's say holds the words):
   see = what a viewer with the sound OFF sees: the SAME subject doing the SAME verb to the SAME object as the words. If the words say "a thief jumped over the fence", the picture is a thief in black jumping over a fence, not a man walking.
   do = what each person does, and on which word it starts.
   build = every place, object, animal, vehicle or effect the words name that you must draw yourself (nothing is off limits; the built-in lists are only shortcuts).
   set = where and when it happens. cam = the shots, phrase by phrase (feet for arriving, low for someone big, hands for picking up or tying, eyes then pov for seeing, close for feelings).
3. Only after the whole storyboard is written, build the beats ONE BY ONE in the same order. Beat 1 shows scene 1 and nothing else. Then beat 2 shows scene 2. Never jump ahead, never show something before the narrator says it, never leave a sentence without its own picture.
4. Check each beat before the next: cover the sound and read only the screen. Could a stranger tell what the sentence said? If not, redraw that beat.
5. FACE AND BODY MATCH THE SITUATION: ask "what would this person truly feel doing this, here?". Walking through fire = pain, fury, grit (pain@0->furious@1.5->determined@3), never a smile. Smiles only for joy, pride or a smug villain. Listeners and victims show their own feeling (fear, shock, pain).
5b. NAME THE THINGS: write the real objects in the say lines (a clock, a bed, a door, a phone, a cup). The app draws every named thing on screen at the moment it is said, and puts the object a person holds in their hand; so never say it vaguely ("he checked it"), say it ("he checked his phone").
6. EVERY ELEMENT IN THE SET: every noun, place, weather, creature and effect the words name is drawn in that scene in rich detail (layered SVG with gradients, shadows, light and motion: flickering flames, drifting smoke, falling rain), plus the small details the situation implies (sparks, debris, bystanders reacting). Never a person in front of a plain wall.
7. When the narrator changes place, time or person, the picture changes with it (new set, new light, a "3 YEARS LATER" card).
8. ACT, DON'T STAND: gestures on stressed words, listeners react the moment a line lands, every person has a different manner, anticipation before a big move and a settle after it. The app adds breathing, blinks and idle motion; you make the BIG acting choices.`;

const MISTAKES = `MISTAKES THAT BREAK THE FILE (wrong -> right):
- say:'She didn't know'  ->  say:"She didn't know"   (a ' inside a ' string ends it. Use double quotes around text that has an apostrophe.)
- {face:'worried@0->determined@3.1}  ->  {face:'worried@0->determined@3.1'}   (every ' you open must be closed: check that each face:'...', shot:'...' and action string ends with a ' before the } or ].)
- “curly quotes”  ->  "straight quotes"   (straight ' and " only)
- // ... more beats here  ->  write every beat out in full. No placeholders, no "and so on".
- s:'warehouse' with no SETS.warehouse defined  ->  draw it first: SETS.warehouse = '<rect .../>...' (or use a built-in location).
- c:'zoom in'  ->  shot:'push:hero@0'   (shot kinds and c words must come from their lists.)
- ['item','rocketship',...]  ->  ['item','rocket',...] (a built-in icon) or draw SVGS.rocketship and use ['svg','rocketship',...].
- d:5   when the say text has 20 words  ->  leave d out; the app times the beat from its words.
- shot:'close:Amara@2' with CAST.amara  ->  shot:'close:amara@2'   (the cast name exactly as in CAST.name).
- the narrator says "she tied the towel" and nobody holds a towel  ->  draw SVGS.towel and give it {hold:'amara'}, then {wear:'amara',at:'waist'} on "tied", with shot hands:amara@"tied".
- movie(...) again in part 2  ->  movie() and thumbnail() appear ONLY in part 1. Never write voiceover(): the app makes the voiceover script from your say lines.
- writing the story as chat text, "Here is your file" or "Shall I continue?"  ->  the code (or the zip) is the whole answer; parts follow one another without asking.
- a speech or thought bubble  ->  never (captions carry the words); the face shows the feeling, the key word goes big: ['card','NO WAY',800,170,80,'#ffd54a',t0,t1].
- one face for the whole beat ({brow:'sad',mouth:'flat'} and nothing else)  ->  add face:'worried@0->shocked@2.2' so the face changes with the story. Words outside the EMOTIONS list (terrified, grumpy) are ignored: use scared, angry.
- view:'side' or walkR:side  ->  never. People always face the camera; c:'panR' / 'panL' / 'cover' follows them.
- no storyboard([...]) before the first beat  ->  the storyboard comes FIRST, one entry per beat, then the beats in the same order.
- "a thief jumped the fence" shown as a man walking  ->  draw the fence and the building, dress the thief in black, 'runR->jump' across it.`;

const RECIPES = `BEAT RECIPES (copy the shape, change the words):
HOOK (beat 1, 3 to 6 s, starts in the middle of the action):
  beat({n:'Hook', s:'street', m:'rain', shot:'crash:hero@0->feet:hero@1.2->reaction:hero@3.3', flash:1.2, a:[['hero','runR@0->react:shock@3.5',[200,700],[790,800],{face:'scared@0->shocked:1.3@3.3'}]], p:[['headline','30 DAYS LEFT','BREAKING',0.4,4.8],['item','clock',null,1200,300,1.1,0.8],['card','NOT AGAIN!',800,170,72,'#ffd54a',1.5,4.5]], say:'...'});
EXPLAIN (a fact, a number or a trend):
  beat({n:'The numbers', s:'office', m:'calm', shot:'medium:hero@0->push:hero@3', a:[['hero','present',520,{view:'front'}]], p:[['chart',[2,3,5,8,13,21],1100,340,360,200,'SALES',0.8,5.5],['counter',0,50000,'$','',800,140,0.6,5.5,'#6fe08a'],['tag','2024 · Q3',1380,110,0.3,5.5]], say:'...'});
EMOTION (close-up, nobody else needed):
  beat({n:'Alone', s:'apartment', m:'night', shot:'high:hero@0->push:hero@2->eyes:hero@4', a:[['hero','react:sad@0->idle@3',800,{view:'front',scale:0.9,face:'sad@0->disappointed@2.6'}]], p:[['item','heart',null,1150,320,1.0,1.0],['card','WHY ME?',800,170,72,'#ffd54a',1.2,4.8]], say:'...'});
SHORT-FILM STORY (a HUD timer on top, close-ups, sticky notes for rules):
  beat({n:'3:12 AM', s:'apartment', m:'night', shot:'eyes:hero@0->close:hero@1.6', a:[['hero','react:shock@0.4',800,{scale:0.95}]], p:[['timer','IMPACT IN',898,893,800,90,0,4.8,'#e74c3c'],['phone','3:12',['EMERGENCY ALERT','Mom: missed call'],800,330,0.3,4.6]], say:'...'});
MONTAGE: one icon per idea, each popping in on its own word: p:[['item','house','HOME',420,260,1,0.6,2.4],['item','laptop','WORK',800,230,1,2,3.9],['item','heart','LOVE',1180,260,1,3.5,6]]
CHAPTER CARD (black screen, 2 to 4 words of text, once or twice per video):
  beat({n:'Part two', chapter:true, d:3.2, say:'But nobody saw it coming.'});
CROWD OR REACTION (many people watching):
  beat({n:'The crowd', s:'cityDay', m:'hype', shot:'wide@0->low:hero@2.2->close:hero@4', a:[['hero','cheer',800,[780,800]],['crowd',8,'cheer',840,{view:'back',scale:0.4,par:-0.25}]], p:[['item','trophy',null,1150,520,1.2,0.8]], say:'...'});
WALK PAST SOMEONE BIG (size and power, word by word):
  beat({n:'The guards', s:'street', m:'warm', shot:'feet:amara@0->tiltup:guard@"hefty"->low:guard@"they"->high:amara@"kept"', a:[['amara','walkR@0',[250,700],790,{face:'calm@0->nervous@"hefty"->determined@"kept"'}],['guard','idle@0->turnaway@"kept"',1050,800,{scale:1.25,face:'deadpan@0->suspicious@"they"'}]], p:[['tag','MAIN GATE',1380,110,0.3,5]], say:'She walked past the guards, as hefty as they were, and kept going.'});
CONVERSATION (shot / reverse shot, the listener reacts):
  beat({n:'The deal', s:'office', m:'tense', shot:'two:boss+hero@0->ots:hero>boss@1.6->ots:boss>hero@"no"->close:hero@"never"', a:[['boss','speak@0->idle@"no"',1050,795,{face:'smug@0'}],['hero','idle@0->speak@"no"',560,795,{face:'worried@0->determined@"no"'}]], p:[['item','bag','$1M',800,560,1.0,0.6]], say:"Take the money, or lose everything. No. Never."});
PAYOFF (last beat, echoes beat 1):
  beat({n:'Full circle', s:'street', m:'warm', shot:'track:hero@0->close:hero@3->pull:hero@4.2', a:[['hero','walkL@0->wave@4',[1200,700],[790,800]]], p:[['item','star',null,1150,320,1.2,1.0]], say:'...'});`;

const TEMPLATE = `ONE BEAT = ONE FILLED-IN LINE. Every field, in this order:
beat({
  n:'Short name',                       // 1 to 3 words
  s:'street',                           // LOCATION: a built-in word (list below) or your own SETS.name
  m:'night',                            // MOOD (list below)
  light:{x:1250,y:160,color:'#ffd9a0'}, // where the light in your set is (lamp, window, sun): the people are lit from there
  shot:'establish@0->feet:hero@"walked"->close:hero@"saw"',   // THE CAMERA: named shots that cut on the spoken word (see CINEMATOGRAPHY BY NAME)
  a:[                                   // ACTORS, 1 to 3 per beat
    ['hero', 'walkR@0->idle@"saw"->react:shock@"door"', [200,700], 790, {face:'calm@0->worried@"saw"->shocked@"door"'}]
  ],                                    //   ['id', 'move@time->move@time', x or [fromX,toX], ground y or [fromY,toY], {options}]
                                        //   options: brow, mouth = the resting face;  face = the feelings that cross it during the beat
  p:[                                   // PROPS, 3 or more per beat (times can be words too: '@"door"')
    ['item','phone',null,1180,560,1.1,'@"saw"'],
    ['card','WHO IS THERE?',800,170,72,'#ffd54a','@"door"']
  ],
  say:'She walked to the window and saw the door move.'   // the exact narration of this beat; the caption and the voiceover script are made from it
});
d (seconds) is OPTIONAL: leave it out and the app times the beat from its words (2.65 words a second). Write d only for a beat with no words (d:3).
TIMES: a number is seconds from the start of the beat; @"word" means "the moment that word is spoken" (@"her#2" = the second "her"). Prefer words: they are always in sync.
x runs 0 to 1600. Ground y is 700 to 860. Actor scale is about 0.85 by default (main people fill about half the frame height), 1.1 to 1.3 for someone big, strong or scary, 0.4 only for crowds and far-away people.
Views for an actor: front (always, including walking and running: the person faces the camera and the camera follows them) or {view:'back'} for someone watching the action from the foreground. Never use side views.
c:'push' (a CAMERAS word) still works for one simple move, but shot:'...' is what makes it look like a film.`;

const PROPS = `PROP TUPLES (inside p:[ ... ]):
['item','ICON','LABEL or null',x,y,scale,t0,t1]   pops in at t0 seconds, out at t1 (t1 optional)
['headline','TEXT','TAG',t0,t1]                    news banner
['card','TEXT',x,y,size,'#fff',t0,t1]               big text on screen
['tag','TEXT',x,y,t0,t1]                            small corner label (place, date, counter)
['counter',from,to,'$','',x,y,t0,t1,'#6fe08a']      number that counts up
['year',from,to,x,y,t0,t1]                          year ticking forward
['chart',[numbers],x,y,w,h,'LABEL',t0,t1]           line chart that draws itself
['bars',[numbers],['A','B','C'],x,y,t0]             bar chart
['bullets',['one','two','three'],x,y,t0]            list that appears line by line
['fly','bill',8,x0,y0,x1,y1,t0]                     icons flying from one place to another
['stack','coin',6,x,y,t0]                           icons stacking up
['spot',x,y,radius,'#ffd54a',t0,t1]                 spotlight   ['dim',0.25,t0,t1]  darkens the screen
['clock',x,y,scale,speed,t0,t1]  ['typewriter','TEXT',x,y,size,t0,speed,'#fff']
SHORT-FILM TOOLS (the look of the best story channels):
['timer','LABEL',fromSeconds,toSeconds,x,y,t0,t1,'#ffd54a']   HUD clock at the top that counts up or down: ['timer','STUDIED',0,14400,680,90,0,5] or a countdown ['timer','IMPACT IN',898,887,920,90,0,5,'#e74c3c']. Repeat it in every beat of that story so it stays on screen and keeps ticking.
['note','RULE #1',"DON'T LOOK AT THE FLASH",x,y,t0,t1]   yellow sticky-note card for a rule, a lesson, a fact or the punchline
['phone','3:12',['Mom: missed call','City alert'],x,y,t0,t1]  a phone screen with the time and notifications sliding in
['choice','STAY IN THE BUNKER','RUN TO YOUR MOM',t0,t1]  A and B option cards (a decision or a cliffhanger ending)
OWN DRAWINGS (only things the words name that the lists lack: dog, fence, ladder, towel): SVGS.dog = '<g>...</g>' at the top (SVG shapes, (0,0) = ground, facing right, real size beside a 600-tall person); place it: ['svg','dog',x,790,1,t0,'trot',{follow:'hero',dx:170,leash:true}] (walks with the actor on a leash) or ['svg','fence',1000,790,1,0,'none']. Motions: none | float | trot | sneak | move {to:[x1,y1],t2} | jump {to:[x1,y1],h:220}
THINGS A PERSON HOLDS OR WEARS move with them: ['svg','towel',0,0,0.8,'@"carried"','none',{hold:'amara',t1:'@"tied"'}] = in her hand from "carried" until "tied"; then ['svg','towelWrap',0,0,1,'@"tied"','none',{wear:'amara',at:'waist'}] = around her waist from "tied" on. at: hand | waist | head | hat | neck | shoulder | chest | back | feet. Draw held things around (0,0) = their centre.`;

const GUIDED_FACES = `${EXPRESSION_MARKER} (the face tells the story with the sound off):
- brow: and mouth: are only the RESTING face. face:'emotion@second->emotion@second' inside {options} makes it ACT: {face:'worried@0->shocked@1.8->angry@3.4'} (strength is optional: shocked:1.4). Use only the EMOTIONS list.
- Every person seen from the front gets a face track in every beat, and the face must fit what that person is going through (pain walking through fire, fear when chased, never a smile there). A beat over 4 s has 2 or more different emotions. Put each sentence's feeling on the face as it is said (start 0.2 s early). Build arcs (worried -> scared -> shocked), never one face for a whole beat. Listeners react differently from the speaker. The face agrees with the body (react:shock + shocked).`;

const GUIDED_ACTING = `${ACTING_MARKER} (the film must make sense with the sound OFF; the engine adds the wind-up, impact and settle, you only name the action):
- In each beat's plan, write narrator phrase -> what the viewer SEES. Every verb is acted by the person doing it, starting on that word: ['hero','walkR@0->grab@2.1->slam@3.6->clutchhead@5',...]. Something visible changes every 1.5 to 2.5 s; nobody stands still for more than 2 s (speakers act the words, listeners react).
- A big moment gets a big move and a camera answer: slam + shake, flinch + close-up, gasp + cut to the cause.
- The set tells the story: the background is the place the narrator names; every named object is drawn as it is said; the world reacts to big moments.`;

function wordList(a) {
  return a.join(' | ');
}

function vocabBlock(kit) {
  return `BUILT-IN SHORTCUTS (quick, tested words; use them when they fit, and design your own whenever the story needs something they do not have):
LOCATIONS (s): ${wordList(VOCAB.locations)}
MOODS (m): ${wordList(VOCAB.moods)}
CAMERAS (c): ${wordList(VOCAB.cameras)}
ACTOR MOVES: ${wordList(VOCAB.actions)}
REACTIONS (write them as 'react:shock' or just 'shock'): ${wordList(VOCAB.reactions)}
EMOTIONS (the only words allowed inside face:'...'): ${wordList(VOCAB.emotions)}
ICONS: ${wordList(VOCAB.icons)}
${kit.look}`;
}

const THUMBNAIL_NOTE = `THUMBNAIL (YouTube only, part 1 only, written after the CAST lines): one still picture that makes people click.
thumbnail({aspect:'16:9', background:LOC.office(), props:[titleCard('2 TO 4 WORDS', {x:1000, y:300, size:150, color:'#ffd54a', t0:0}), item('bag', '$1M', {x:1180, y:600, scale:1.8, t0:0})], characters:[{look:CAST.hero, x:420, ground:860, scale:1.1, view:'front'}]});
It is a still image: everything is already on screen at second 0 (t0:0), no captions, no timing.`;

const STORY_RULES = `HOW TO MAKE IT GOOD (this is what separates a great video from a flat one):
1. Beat 1 is the hook. Start in the middle of the action with the most surprising fact or moment. No "Hello", no "Today we will".
2. Story shape: hook -> problem -> things get worse -> turn (around 65% of the way) -> payoff -> last beat echoes beat 1.
3. Narration: short sentences, concrete nouns, real numbers, one idea per beat. Read it aloud: it must sound like a person talking.
4. Every beat needs: a location, a mood, a light, a shot track with 2 to 4 shots (never the same opening shot as the beat before), at least 3 props, and an actor doing 2 moves in a row.
5. Change location at least every 2 beats. A chapter card (chapter:true) once or twice. A graphic moment (chart, counter, headline) in about 1 beat in 4, with an actor reacting beside it.
6. Mouths stay closed unless a character speaks in the story (use 'speak' only then). The narrator is a voiceover, not a character.
7. Do not invent facts about real people, companies or current events.
8. CHARACTER GUARANTEE: every single beat must have at least one actor on screen in its a:[...] list, even a chart or headline beat (put a host or a reacting actor beside it). A beat with no actor is a failed beat. Never use a cast name you did not define. If a reference image was chosen but you have none, use the stickman or the default character already in this app, the same one in every beat.`;

const VERTICAL_RULES = `TIKTOK VERTICAL CANVAS (9:16): the app crops the wide 1600x900 world to a tall frame and fits the people into it by itself, giving every character room to breathe.
- Write the scene exactly as for a wide video: put people where the story needs them on the wide stage (x 300 to 1300), about 150 to 250 apart, never on top of each other. Do NOT squeeze everyone into x 640 to 960 and do NOT shrink or zoom to fit: the app scales them down, staggers them in rows and frames the group.
- At most 3 main people in one shot (more only as small background crowds). Use close-ups with one person for feelings.
- Props, icons and pictures sit ABOVE the heads (y 120 to 330), near the middle (x 650 to 950); keep the bottom quarter calm for captions.
- Text is short: kinetic words 1 to 3 words, headlines 2 to 4 words. No thumbnail() in this video.
- Open on the face or the problem in the first second. Fast cuts: aim for beats of 3.5 to 5 s.`;

function platformLine(vo) {
  const p = String(vo || 'elevenlabs').toLowerCase() === 'aistudio' ? 'Google AI Studio' : 'ElevenLabs';
  return `Your say lines become the ${p} voiceover script: plain spoken sentences with natural commas and full stops. No timestamps, no stage directions, no speaker names inside say.`;
}

/** Cut a written narration into `n` parts of nearly equal length at sentence ends. */
export function sliceScript(script, n) {
  const text = String(script || '').trim();
  const parts = Math.max(1, Math.round(n) || 1);
  if (parts === 1 || !text) return [text];
  const sentences = (text.match(/[^.!?\n]+(?:[.!?]+["')\]]*|\n+|$)/g) || [text]).map((x) => x.trim()).filter(Boolean);
  const counts = sentences.map((x) => x.split(/\s+/).filter(Boolean).length);
  const total = counts.reduce((a, c) => a + c, 0);
  const cum = [];
  counts.reduce((a, c, i) => (cum[i] = a + c), 0);
  // cut after the sentence whose running total is closest to k/parts of the whole
  const cuts = [];
  let from = 0;
  for (let k = 1; k < parts; k++) {
    const goal = (total * k) / parts;
    let best = from;
    let bestGap = Infinity;
    for (let i = from; i < sentences.length - (parts - k); i++) {
      const gap = Math.abs(cum[i] - goal);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    cuts.push(best);
    from = best + 1;
  }
  const out = [];
  let start = 0;
  for (const c of cuts) {
    out.push(sentences.slice(start, c + 1).join(' '));
    start = c + 1;
  }
  out.push(sentences.slice(start).join(' '));
  return out;
}

/* ---------- long videos: the story map and the retention engine ---------- */

/** What each part of a long video is FOR, so the middle never goes flat. role: open | rise | twist | low | climb | payoff */
export function partRole(k, of) {
  if (of <= 1) return { role: 'whole', title: 'a complete story', job: 'hook, build, turn, payoff' };
  if (k === 1) return { role: 'open', title: 'HOOK AND SETUP', job: 'start in the middle of the most striking moment; show who wants what and the first obstacle; end on a cliffhanger' };
  if (k === of) return { role: 'payoff', title: 'CLIMAX AND PAYOFF', job: 'the biggest confrontation, the truth revealed, every open question answered, then one line that makes people rewatch or follow; no summary of the video' };
  const u = (k - 1) / (of - 1);
  if (u < 0.4) return { role: 'rise', title: 'ESCALATION', job: 'the obstacle gets bigger, a new person or place enters, the stakes rise, one small win that costs something' };
  if (u < 0.62) return { role: 'twist', title: 'MIDPOINT TWIST', job: 'a surprise that changes what the viewer believed; the goal changes or a secret comes out' };
  if (u < 0.85) return { role: 'low', title: 'LOWEST POINT', job: 'everything seems lost, a betrayal or a failure, the quietest and most emotional scenes, then one spark of hope' };
  return { role: 'climb', title: 'THE CLIMB', job: 'the hero acts with a new plan, the pace speeds up, the final fight or test is set up' };
}

const DEVICES = ['a big number or fact slamming onto the screen', 'a sticky note with a rule or lesson', 'a two-column comparison (before / after, them / us)', 'a map or route drawn as the person moves', 'a flashback in a different colour mood', 'a joke or a funny reaction shot', 'a question asked straight to the viewer', 'a time jump with a date label', 'a prop that appears and is used', 'a rumour or message popping up on a phone', 'a crowd reacting', 'a weather or lighting change that matches the feeling'];

/** The rules that keep a 3, 10, 20 or 30 minute video as good in minute 25 as in second 3. */
export function longformBlock(plan, k = 1, { api = false, narrated = false } = {}) {
  const of = plan.parts.length;
  if (of <= 1) return '';
  const r = partRole(k, of), p = plan.parts[k - 1] || plan.parts[0];
  // one request writes every part (pasted prompt), or one request per part (the app calling a model itself)
  const all = !api;
  const map = plan.parts.map((q) => { const x = partRole(q.index, of); return `  Part ${q.index}/${of} (${Math.round(q.sec)} s): ${x.title}: ${x.job}${!all && q.index === k ? '   <- THIS PART' : ''}`; }).join('\n');
  const mid = Math.round(p.beats / 2);
  return `LONG VIDEO: ${Math.round((plan.totalSec / 60) * 10) / 10} MINUTES. EVERY MINUTE MUST BE AS GOOD AS THE FIRST (this video is judged by its worst minute, not its best):
STORY MAP (plan the whole story along this map; keep to it):
${map}
${all ? 'IN EVERY PART:' : `THIS PART IS "${r.title}": ${r.job}.`}
- NO RUSHING AND NO SHORTCUTS: every part gets exactly the same care, detail and ${p.beats} full beats as part 1. Never summarise ("and then years passed", "after many days"): show the moment. The last beat of the last part is as drawn, acted and filmed as beat 1.
- RE-HOOK: ${all ? 'the first beat of every part after part 1 opens on a NEW striking moment that follows the last cliffhanger. Do not recap, do not say "previously".' : k === 1 ? 'beat 1 is the hook (see above).' : 'beat ' + p.firstBeat + ' opens on a NEW striking moment that follows the last cliffhanger (a line, a shock, a reveal). Do not recap, do not say "previously".'}
- ${all ? 'The last beat of every part except the last is a CLIFFHANGER (a question, a threat, a reveal cut short); the last part ends on the payoff.' : k === of ? 'The last beat is the payoff and the final line; no cliffhanger.' : 'The last beat of this part is a CLIFFHANGER: a question, a threat, a reveal cut short. The next part starts right there.'}
- A PATTERN INTERRUPT every 4 to 5 beats (so the eye never gets used to the rhythm). Rotate through these, never the same one twice in a row: ${DEVICES.slice((k * 3) % DEVICES.length).concat(DEVICES.slice(0, (k * 3) % DEVICES.length)).slice(0, 8).join('; ')}.
- NEW EVERY PART: at least one new location, one new prop or visual idea, one new emotion for the hero, and one callback to something planted earlier (a line, an object, a joke). Never use the same location for more than 3 beats in a row, and do not reuse an opening shot.
- EVERY BEAT CHANGES SOMETHING: someone decides, learns, loses, wins or lies. If a beat only explains, turn it into a scene: somebody does it, argues about it or sees it.
- ${narrated ? 'A REACTION SHOT in at least every other beat (someone reacts on the face to what just happened)' : 'DIALOGUE AND REACTION in at least every other beat (a spoken line, a quick answer, a reaction shot)'}, the energy rises and falls (fast burst, one calm beat, fast burst), and the middle of every part (around beat ${mid} of it) is a mini-peak (a laugh, a gasp or a hit).
- OPEN LOOPS: keep two or three questions unanswered for the viewer (who did it, will she make it, what is in the box) and answer an old one only when you open a new one.
- Keep every character looking and sounding the same all through (same CAST lines, same manner).`;
}

function partsBlock(plan, { partIndex = 1, api = false } = {}) {
  const p = plan.parts[partIndex - 1] || plan.parts[0];
  if (plan.parts.length === 1) {
    return `LENGTH: ${plan.totalSec} seconds = exactly ${p.beats} beats of about ${BEAT_SEC} s, about ${p.words} spoken words in total (about ${Math.round(p.words / Math.max(1, p.beats))} words per beat). The beats (their words) must add up to ${plan.totalSec} seconds.`;
  }
  if (api) {
    return `LENGTH: the whole video is ${plan.totalSec} seconds (${plan.totalBeats} beats) written in ${plan.parts.length} parts. THIS REQUEST IS PART ${p.index} OF ${p.of} ONLY: beats ${p.firstBeat} to ${p.lastBeat} (${p.beats} beats), ${p.sec} s, about ${p.words} words. The beats of this part must add up to ${p.sec} seconds.${p.index > 1 ? ' Write ONLY the CAST lines, your SETS / SVGS for this part and the beats: no movie(), no voiceover(), no thumbnail().' : ''}`;
  }
  const rows = plan.parts.map((q) => `  PART ${q.index} of ${q.of}: beats ${q.firstBeat} to ${q.lastBeat} (${q.beats} beats), ${q.sec} s, about ${q.words} words`).join('\n');
  return `LENGTH: ${plan.totalSec} seconds (${Math.round((plan.totalSec / 60) * 10) / 10} minutes) = ${plan.totalBeats} beats, written in ${plan.parts.length} parts so nothing gets cut off:
${rows}
- STORY BIBLE FIRST: Part 1 starts (after movie() and the CAST lines) with one comment: /* STORY BIBLE: Part 1 = ... | Part 2 = ... | ... | Part ${plan.parts.length} = ... (one line each: what happens, where, the cliffhanger) */. Plan the WHOLE story there before beat 1, then keep to it, so part ${plan.parts.length} pays off what part 1 set up.
- Write the parts one straight after the other. Do NOT stop after a part and do NOT wait for me to say NEXT while there is room. NEVER ask me a question and never ask "shall I continue?".
- ROOM RULE (a part cut off halfway breaks the film): never START a part unless the WHOLE part fits in what is left of this reply. After about 2 parts, or when the reply is already long, finish the part you are on and end with exactly this one line: Part K of ${plan.parts.length} done. Say NEXT.   When I say NEXT, write only the next part. A finished part followed by a pause is fine; a cut-off part is not.
- Every part, including the last one, is ONLY code inside its own code block, never plain chat text. The last part is no longer than the first and has no epilogue.
- First line of every part is exactly: // === ANIMATO BATCH k OF ${plan.parts.length} === (k = the part number).
- Part 1 has movie() and thumbnail(). Parts 2 and later have neither. Nobody writes voiceover(): the app builds the voiceover from the say lines.
- Copy the CAST lines unchanged at the top of every part, and define the SETS / SVGS each part uses inside that part, so every part works on its own.
- Every part has its full ${plan.parts[0].beats} beats with the same detail, shots, faces and drawings as Part 1. Never shorten, merge or summarise a part to fit.
- If your own length limit cuts you off, stop at the end of a complete beat line. When I say "continue", carry on with the very next beat (never repeat one) in a new block whose first line is the same // === ANIMATO BATCH k OF ${plan.parts.length} === line.
- After the very last part write exactly one line: ALL ${plan.parts.length} PARTS DONE. If that line is missing, I know you were cut off.`;
}

/**
 * The prompt a person pastes into ChatGPT (or any chat model), or that the app sends through an API.
 * Pass `script` when the person supplies the narration: the beats must then carry it word for word.
 * `api: true` builds one self-contained request for part `partIndex` (with `storySoFar` and `castText` for parts 2 and later).
 */
export function buildGuidedPrompt({
  title = '',
  idea = '',
  cast = '',
  setting = '',
  audience = 'General audience',
  tone = 'Funny and entertaining',
  extra = '',
  durationSec = 60,
  voPlatform = 'elevenlabs',
  aspect = '16:9',
  style = 'original',
  lookOptions = '',
  script = '',
  partIndex = 1,
  api = false,
  storySoFar = '',
  castText = '',
  bgMode = 'cartoon',
  myBg = '',
  packCast = [],
  contentType = '',
} = {}) {
  const ctBlock = isType(contentType) ? contentTypeBlock(contentType) : '';
  const tall = aspect === '9:16';
  const kit = characterKit(style, lookOptions, packCast);
  const hasScript = !!String(script || '').trim();
  const plan = hasScript ? planParts(Math.max(15, beatsForScript(script).seconds)) : planParts(durationSec);
  const k = Math.min(Math.max(1, partIndex), plan.parts.length);
  const part = plan.parts[k - 1];
  const of = plan.parts.length;
  const example = goldExample({ style, lookOptions, aspect, packCast });
  const formatLabel = tall ? 'TikTok vertical 9:16 (1080x1920)' : 'YouTube widescreen 16:9 (1280x720)';
  const continuing = api && k > 1;

  const brief = [
    `- TITLE: ${title || '(invent a title that makes people curious)'}`,
    hasScript ? '' : `- IDEA: ${idea || '(invent a gripping story with a surprising turn)'}`,
    `- CAST: ${cast || '(invent 2 to 3 characters with clear roles: people, animals or creatures, exactly what the idea needs)'}`,
    `- SETTING: ${setting || '(the places the story needs: draw them as your own SETS, or use the LOCATIONS words)'}`,
    `- AUDIENCE: ${audience}   TONE: ${tone}   FORMAT: ${formatLabel}`,
    extra ? `- EXTRA DIRECTIONS: ${extra}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  let scriptBlock = '';
  if (hasScript) {
    const slices = sliceScript(script, of);
    const shown = api ? [[k, slices[k - 1]]] : slices.map((t, i) => [i + 1, t]);
    scriptBlock = `
THE NARRATION IS ALREADY WRITTEN. Do not change, shorten or add words. Cut it into consecutive beats of about 13 words each, in order, and put each piece word for word in say:'...'. Then design the pictures for each piece.
${shown
  .map(([i, t]) => `=== NARRATION${of > 1 ? ` FOR PART ${i} OF ${of}` : ''} (word for word) ===\n${t}\n=== END ===`)
  .join('\n')}
`;
  }

  const story = continuing
    ? `
STORY SO FAR (do not repeat it; continue right after the last beat):
${String(storySoFar || '(none)').trim()}

CAST LINES (copy them unchanged at the top of this part):
${String(castText || kit.cast.join('\n')).trim()}
`
    : '';

  const skeleton = continuing
    ? `FILE SKELETON FOR THIS PART:
// === ANIMATO BATCH ${k} OF ${of} ===
CAST.hero = {...};   // the same lines as above, unchanged
SETS.x = '...'; SVGS.y = '...';   // the drawings this part uses
beat({...});         // one line per beat of this part
// END OF FILE`
    : `FILE SKELETON (copy this order exactly):
// === ANIMATO BATCH ${k} OF ${of} ===
/* PLAN: one line per beat: number, seconds, location, what happens. Total must equal ${part.sec}. */
movie({title:'...', aspect:'${tall ? '9:16' : '16:9'}'${kit.movieChar}});
CAST.hero = {...};   // one line per character, 2 to 4 characters${of > 1 ? "\n/* STORY BIBLE: Part 1 = ... | Part 2 = ... | ... */   // the whole story, planned before beat 1" : ''}${tall ? '' : "\nthumbnail({...});   // after the CAST lines: one big title card + one icon + the hero (see the example)"}
storyboard([...]);   // the plan FIRST: one short entry per beat (what we see, what each person does, the shots, what you must draw)
SETS.x = '...'; SVGS.y = '...';   // your own sets and drawings for this story
beat({...});         // one line per beat, built one by one and checked against its storyboard entry (with its shot track)
// END OF FILE`;

  const answerRule = api
    ? `HOW YOU ANSWER (this overrides any habit you have):
1. Reply with the complete file only: plain JavaScript, ideally inside one \`\`\`js block. No explanation, no questions, no text before or after.
2. Straight quotes only. Every beat written out in full.
${platformLine(voPlatform)}`
    : `HOW YOU ANSWER (this overrides any habit you have and any other delivery rule in this message):
1. Start with the code at once. No questions, no plan in the chat, no "Here is", no "Sure", no "shall I continue?".
2. IF YOU CAN CREATE FILES (ChatGPT with its file or code tool, Claude, Gemini with code execution): write ${of > 1 ? `every part as its own file (scene-file-1.txt to scene-file-${of}.txt) and put all of them in ONE zip named scene-files.zip` : 'the whole film in one file named scene-file.txt'}, then reply with the download link and one line: "Open Code to stickman, tap Add the AI's file(s), pick ${of > 1 ? 'the zip' : 'this file'}." The files hold only the code.
3. IF YOU CANNOT CREATE FILES: ${of > 1 ? `print Part 1 in its own \`\`\`js code block, then Part 2 in the next \`\`\`js block, and so on until Part ${of}, all in this reply, with only a one-line label above each block ("Part 2 of ${of}")` : 'print the whole file in one \`\`\`js code block'}. Everything stays inside the code block${of > 1 ? 's' : ''}; nothing else in the reply${of > 1 ? ' except the labels and the final ALL PARTS DONE line' : ''}.
4. The code is plain JavaScript that the app runs. Straight quotes only. Do not write voiceover() and do not add a separate voiceover block: the app builds the voiceover script from your say lines.
5. ${boxRule({ batchWord: 'part' })}
${platformLine(voPlatform)}`;

  const check = `CHECK BEFORE YOU SEND (silently, fix anything that fails):
[ ] Exactly ${part.beats} beat lines${of > 1 ? ' in every part' : ''}, about ${part.words} spoken words${of > 1 ? ' per part' : ''} (${part.sec} s).
[ ] storyboard([...]) comes before the first beat, one entry per beat, and every beat shows exactly what its entry (and its words) say.
[ ] Every beat has shot:'...' with 2 to 4 named shots, cut on its words (@"word"), and the person each shot names is in that beat's a:[...].
[ ] Every verb in say is acted on its word (moves), every feeling is on the face on its word (face), every object it names is drawn (item, svg, hold, wear).
[ ] Every built-in word is spelled exactly as listed; every own set or drawing you use (s:'myset', ['svg','mything',...]) is defined above as SETS.myset / SVGS.mything.
[ ] No side views. Walking people face the camera and the camera follows them.
[ ] Every person seen from the front has face:'...' with at least 2 different EMOTIONS in a beat longer than 4 s.
[ ] No apostrophe inside a single-quoted string (use double quotes for those).
${api ? '' : `[ ] ${of > 1 ? `All ${of} parts are written, each complete, and the last line is ALL ${of} PARTS DONE.` : 'The whole file is there, down to // END OF FILE.'}\n[ ] Nothing outside the code (or the zip link).`}`.trim();

  const finalLine = api
    ? `FINAL REMINDER: reply with the file only. Write ${of > 1 ? `part ${k} of ${of}` : 'the whole video'} now.`
    : `FINAL REMINDER: ${of > 1 ? `write all ${of} parts now, one after the other, without stopping (zip if you can make files, otherwise one \`\`\`js block per part)` : 'write the whole file now (a file if you can make files, otherwise one \`\`\`js block)'}. Start now.`;

  return `${GUIDED_MARKER} · works with ChatGPT, Gemini, Claude or any AI

YOUR JOB: write ONE JavaScript file that Animato turns into an animated ${tall ? 'TikTok' : 'YouTube'} video. You are the director, the set designer, the motion designer and the animator. The app gives you ONE thing: the characters, in the style the person chose, with their acting, lip sync and walking. EVERYTHING ELSE you design yourself with full creative freedom: every set, prop, object, vehicle, animal, effect, light, transition and motion graphic, drawn as SVG and animated with your own JavaScript, exactly like a front-end developer builds and animates a web page. The shortcuts listed later are optional help, never a limit.

${ctBlock ? ctBlock + '\n\n' : ''}${SCENE_BY_SCENE}

${creativeBlock({ ownCharacter: style === 'custom' && Array.isArray(packCast) && packCast.length > 0 })}

${longformBlock(plan, k, { api, narrated: contentType !== 'movie' }) ? longformBlock(plan, k, { api, narrated: contentType !== 'movie' }) + '\n\n' : ''}${FREEDOM}

${answerRule}

=== THE VIDEO ===
${brief}
${partsBlock(plan, { partIndex: k, api })}
${scriptBlock}${story}
=== HOW THE FILE IS BUILT ===
${skeleton}

${TEMPLATE}

${shotRule({ tall })}

${PROPS}

${vocabBlock(kit)}

${GUIDED_FACES}

${GUIDED_ACTING}

${tall ? VERTICAL_RULES + '\n\n' : THUMBNAIL_NOTE + '\n\n'}${STORY_RULES}

${myBg || backgroundPromptBlock({ mode: bgMode, tier: 'guided' })}

${RECIPES}

=== COMPLETE WORKED EXAMPLE (a different story, same shape. Copy the structure, never the story) ===
\`\`\`js
${example.code}
\`\`\`

${MISTAKES}

${check}

${finalLine}`;
}

/**
 * The shorter instruction the app sends as a system message when it calls a model itself.
 * The person-specific details travel in the user prompt; this carries the rules, lists and one tested example.
 */
export function buildGuidedSystemInstruction({ style = 'original', lookOptions = '', aspect = '16:9', packCast = [] } = {}) {
  const tall = aspect === '9:16';
  const kit = characterKit(style, lookOptions, packCast);
  const example = goldExample({ style, lookOptions, aspect, packCast });
  return `${GUIDED_MARKER}. You write Animato scene files. The app gives you the characters (the chosen style, with acting and lip sync); you design and draw everything else yourself in SVG and animate it with JavaScript, with full creative freedom. Built-in words are optional shortcuts.

${SCENE_BY_SCENE}

${FREEDOM}

${creativeBlock({ ownCharacter: style === 'custom' && Array.isArray(packCast) && packCast.length > 0 })}

LONG VIDEOS (3 to 30 minutes): every minute must be as good as the first. Never rush or summarise; show every moment as a full scene. Re-hook at the start of every part, end each part (except the last) on a cliffhanger, change something every beat, add a pattern interrupt (number slam, sticky note, comparison, flashback, joke, time jump) every 4 to 5 beats, bring a new place, prop and feeling into every part, keep 2 or 3 open questions alive, and keep the same characters all through.

OUTPUT RULES: answer with the file only (no chat, no explanation, no markdown outside one code block if you use one). Plain JavaScript, straight quotes only. Never write placeholders such as "// ... more". Every beat is written out in full. Never write voiceover(): the app builds it from the say lines.

${TEMPLATE}

${PROPS}

${vocabBlock(kit)}

${GUIDED_FACES}

${GUIDED_ACTING}

${shotRule({ tall })}

${tall ? VERTICAL_RULES + '\n\n' : ''}${STORY_RULES}

WORKED EXAMPLE (structure to copy, not the story):
${example.code}

${MISTAKES}`;
}

/* ---------- repair: fix the usual mistakes before the file is loaded ---------- */

const ZERO_WIDTH = /[​-‍﻿⁠]/g;

function extractFences(text) {
  const out = [];
  const re = /```[ \t]*([A-Za-z0-9_+-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g;
  let m;
  while ((m = re.exec(text))) out.push({ lang: (m[1] || '').toLowerCase(), body: m[2] });
  return out;
}

const LOOKS_LIKE_SCENE = /\b(?:beat|scene|movie|voiceover|thumbnail)\s*\(/;

/** Keep the code, drop the chat around it. Handles several fenced blocks, JSON wrappers and bare code with prose. */
export function extractCode(raw) {
  let text = String(raw ?? '').replace(/\r\n?/g, '\n').replace(ZERO_WIDTH, '').replace(/ /g, ' ');
  text = text.replace(/^﻿/, '');
  const t = text.trim();
  // a JSON wrapper such as {"sceneCode":"..."} or {"scenesCode":"..."}
  if (t.startsWith('{') && /"(?:sceneCode|scenesCode)"\s*:/.test(t)) {
    try {
      const j = JSON.parse(t);
      const v = j.sceneCode || j.scenesCode;
      if (typeof v === 'string') return v;
    } catch (_) {
      /* fall through to the other rules */
    }
  }
  const fences = extractFences(text);
  if (fences.length) {
    const js = fences.filter((f) => /^(?:js|javascript|jsx|ts|typescript|txt|text|)$/.test(f.lang) && LOOKS_LIKE_SCENE.test(f.body));
    if (js.length) return js.map((f) => f.body.trim()).join('\n\n');
    const any = fences.filter((f) => LOOKS_LIKE_SCENE.test(f.body));
    if (any.length) return any.map((f) => f.body.trim()).join('\n\n');
  }
  // bare code: drop prose lines before the first code line and after the last statement
  const lines = text.split('\n');
  const isCode = (l) => /^\s*(?:\/\/|\/\*|\*|beat\s*\(|scene\s*\(|movie\s*\(|voiceover\s*\(|thumbnail\s*\(|CAST\.|SETS\.|SVGS\.|const |let |var |function |\}|\)|\]|[A-Za-z_$][\w$.]*\s*=)/.test(l);
  let first = lines.findIndex(isCode);
  if (first < 0) first = 0;
  let last = -1;
  for (let i = lines.length - 1; i >= first; i--) {
    if (/[;})\]]\s*(?:\/\/.*)?$/.test(lines[i].trim()) && isCode(lines[i])) {
      last = i;
      break;
    }
  }
  if (last < first) last = lines.length - 1;
  // keep comment lines that follow the last statement (such as // END OF FILE)
  while (last + 1 < lines.length && /^\s*(?:\/\/.*|\/\*.*\*\/\s*)$/.test(lines[last + 1])) last++;
  return lines.slice(first, last + 1).join('\n');
}

/**
 * Walk the code once and repair string problems that models cause:
 *  - curly quotes used as code quotes become straight quotes,
 *  - an apostrophe inside a single-quoted string (didn't) is escaped,
 *  - a raw line break inside a '...' or "..." string becomes a space.
 * Anything it is not sure about is left exactly as it was.
 */
export function repairStrings(code) {
  const s = String(code);
  const n = s.length;
  let out = '';
  let i = 0;
  const closeMap = { "'": "'", '"': '"', '`': '`', '‘': '’', '“': '”' };
  const isLetter = (c) => !!c && /[A-Za-zÀ-ɏ]/.test(c);
  while (i < n) {
    const c = s[i];
    // comments pass through untouched
    if (c === '/' && s[i + 1] === '/') {
      const e = s.indexOf('\n', i);
      const end = e < 0 ? n : e;
      out += s.slice(i, end);
      i = end;
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      const e = s.indexOf('*/', i + 2);
      const end = e < 0 ? n : e + 2;
      out += s.slice(i, end);
      i = end;
      continue;
    }
    if (c in closeMap) {
      const curly = c === '‘' || c === '“';
      const outer = c === '‘' ? "'" : c === '“' ? '"' : c;
      const close = closeMap[c];
      out += outer;
      i++;
      let body = '';
      while (i < n) {
        const d = s[i];
        if (d === '\\' && outer !== '`') {
          body += d + (s[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (outer === '`' && d === '\\') {
          body += d + (s[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (d === '\n' && outer !== '`') {
          // an unfinished string: stop here and let the line break stand
          break;
        }
        const isClose = d === close || (outer === "'" && !curly && d === "'") || (curly && d === (c === '‘' ? '’' : '”')) || (!curly && d === c);
        if (isClose) {
          // word-internal apostrophe (didn't, it's) is part of the text, not the end
          const prev = s[i - 1];
          const next = s[i + 1];
          const apostrophe = (d === "'" || d === '’') && isLetter(prev) && isLetter(next);
          if (apostrophe) {
            body += outer === "'" ? "\\'" : d === '’' ? "'" : d;
            i++;
            continue;
          }
          // a curly closer must be followed by something that can follow a string, otherwise it is text
          if (curly) {
            let j = i + 1;
            while (j < n && (s[j] === ' ' || s[j] === '\t')) j++;
            const f = s[j];
            if (!(f === undefined || f === '\n' || /[,)\]};:+]/.test(f))) {
              body += outer === "'" ? "\\'" : d === '’' ? "'" : d;
              i++;
              continue;
            }
          }
          out += body + outer;
          i++;
          body = null;
          break;
        }
        // a curly quote inside a string is plain text; keep it
        body += d;
        i++;
      }
      if (body !== null) out += body;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Remove placeholder lines such as "...", "…" or "// ... (more beats)" that are not valid code or hide missing work. */
export function dropPlaceholders(code) {
  return String(code)
    .split('\n')
    .filter((l) => !/^\s*(?:\.{3,}|…)\s*,?\s*$/.test(l))
    .join('\n');
}

/** Everything above, in the right order. Safe to run on code that is already fine (it comes back unchanged). */
export function healModelOutput(raw) {
  let code = extractCode(raw);
  code = repairStrings(code);
  code = dropPlaceholders(code);
  return code.replace(/\n{4,}/g, '\n\n\n').trim();
}

/** The model names that need Guided mode by default are decided by the app; this tells whether a name looks top-tier. */
export function looksTopTier(modelId = '') {
  const id = String(modelId).toLowerCase();
  return /claude|opus|sonnet|fable|mythos|gemini-?[3-9][\w.-]*-?pro|gemini-4|gpt-5|o[1-9]\b|o[1-9]-/.test(id) && !/mini|nano|haiku|flash|lite|small/.test(id);
}
