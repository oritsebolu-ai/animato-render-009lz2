// CAST IDENTITY: the same person looks like the same person in every scene.
//
// A film is about somebody. The AI model that writes the scene file sometimes describes that somebody again in every scene and gets
// it slightly (or very) wrong: scene 1 shows a boy, scene 2 gives "him" a girl's look, scene 3 has other hair or another skin tone.
// A viewer who cannot hear the narration (or who is simply watching on mute) then has no way to know it is still the same person.
//
// What counts as WHO a person is (never changes between scenes): seed, gender, skin, face, hair style and colour, beard, glasses,
// eye colour, body build. What counts as WHAT they wear (may change with the story): outfit, top, bottom, colours of clothes,
// accessories, expression. lockCast() makes every scene of a person use the identity written first (field by field), fills fields a
// scene forgot, and when nobody wrote a gender at all it reads the narration ("a boy who loved dogs", "the lady who lived...").
//
// Pure code: no browser needed. The player calls lockCast(SC, { narration }) once, right after the scenes are read.

export const CAST_MARKER = 'CAST IDENTITY';

/** Fields that say WHO the person is. Everything else in a look (clothes, accessories, mood) is free to change. */
export const IDENTITY_FIELDS = ['seed', 'gender', 'skin', 'face', 'hair', 'hairMode', 'hairc', 'eyec', 'eye', 'beard', 'glasses', 'height', 'shape', 'k', 'bw'];
/** Written once, may be filled when missing, but a later scene that writes another value is trusted (a flashback to being a child). */
export const SOFT_FIELDS = ['age'];
/** Clothes and mood: shown here only so the documentation is complete; lockCast never touches them. */
export const WARDROBE_FIELDS = ['outfit', 'outfitc', 'top', 'topc', 'bottom', 'bottomc', 'layer', 'pattern', 'trim', 'accessory', 'necklace', 'earrings', 'headpiece', 'pin', 'hairOrnament', 'shoec', 'accentc', 'stripes', 'bit', 'expression', 'mouth', 'brow', 'persona'];

const FEMALE = /\b(she|her|hers|herself|girl|girls|woman|women|lady|ladies|mother|mom|mum|mama|daughter|queen|princess|sister|wife|grandmother|grandma|aunt|niece|actress|waitress|heroine|girlfriend|bride|madam|ms|mrs|miss)\b/gi;
const MALE = /\b(he|him|his|himself|boy|boys|man|men|guy|gentleman|father|dad|daddy|papa|son|king|prince|brother|husband|grandfather|grandpa|uncle|nephew|actor|waiter|hero|boyfriend|groom|sir|mr)\b/gi;

const count = (s, re) => (String(s || '').match(re) || []).length;

/** 'male' | 'female' | '' (not clear). Needs at least one clear hit and a clear lead. */
export function inferGender(text) {
  const f = count(text, FEMALE), m = count(text, MALE);
  if (f > m && f >= 1 && f - m >= Math.max(1, Math.round(m * .5))) return 'female';
  if (m > f && m >= 1 && m - f >= Math.max(1, Math.round(f * .5))) return 'male';
  return '';
}

/** The words about one named person: the sentences that mention the name and the one after each (so "She..." counts). */
export function aboutName(text, name) {
  const t = String(text || ''), n = String(name || '').trim();
  if (!n || n.length < 2) return '';
  const re = new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
  const parts = t.split(/(?<=[.!?])\s+/), out = [];
  parts.forEach((p, i) => { if (re.test(p)) { out.push(p); if (parts[i + 1]) out.push(parts[i + 1]); } });
  return out.join(' ');
}

const lc = (v) => String(v == null ? '' : v).trim().toLowerCase();
const has = (v) => v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && !isFinite(v));
const same = (a, b) => (typeof a === 'string' || typeof b === 'string') ? lc(a) === lc(b) : a === b;

/** The names and numbers that say two appearances are the same person. */
export function personKeys(c) {
  const L = (c && c.look && typeof c.look === 'object') ? c.look : {};
  const keys = [];
  const nm = lc(c && (c.id || c.name || c.key || c.who || c.role)) || lc(L.name || L.id);
  if (nm) keys.push('n:' + nm);
  const seed = +(L.seed !== undefined ? L.seed : (c && c.seed));
  if (isFinite(seed) && seed !== 0) keys.push('s:' + seed);
  return keys;
}

const isPerson = (c) => c && typeof c === 'object' && !c.far && !c.animal && !c.creature && !(c.par < 0);
const genderOf = (c) => lc((c.look && c.look.gender) || c.gender);
const sceneText = (s) => [s && s.narration, s && s.say, ...((s && s.captions) || []).map((x) => x && x.text)].filter(Boolean).join(' ');

/**
 * Makes every appearance of the same person share one identity. Mutates the scenes (copies a look object before changing it, so a look
 * shared by many scenes is never edited in place). Returns a list of plain sentences for the repair report.
 *   SC: scenes [{characters:[...], narration, captions}]   opt.narration: the whole narration (for reading the gender)
 */
export function lockCast(SC, opt = {}) {
  const scenes = Array.isArray(SC) ? SC : [];
  const report = [];
  const narr = String(opt.narration || scenes.map(sceneText).join(' '));
  // 1) who is who: appearances grouped by name, by seed, and the nameless lone person of a scene (the film's main character)
  const people = [];                       // { keys:Set, apps:[{c, si}], ident:{}, name }
  const byKey = new Map();
  const join = (keys, app, display) => {
    let p = null;
    for (const k of keys) if (byKey.has(k)) { p = byKey.get(k); break; }
    if (!p) { p = { keys: new Set(), apps: [], ident: {}, name: display || '' }; people.push(p); }
    keys.forEach((k) => { if (!byKey.has(k)) byKey.set(k, p); p.keys.add(k); });
    if (!p.name && display) p.name = display;
    p.apps.push(app);
    return p;
  };
  scenes.forEach((s, si) => {
    const crew = ((s && s.characters) || []).filter(isPerson);
    crew.forEach((c) => {
      const keys = personKeys(c);
      const display = String(c.id || c.name || c.key || c.who || (c.look && c.look.name) || '').trim();
      if (!keys.length && crew.length === 1 && !c.custom) keys.push('lead'); // the nameless person alone on screen is the film's main character
      if (!keys.length) return;
      join(keys, { c, si, solo: keys[0] === 'lead' }, display);
    });
  });
  // 2) each person's identity: for every field, the first scene that wrote it decides
  people.forEach((p) => {
    p.apps.forEach(({ c }) => {
      const L = (c.look && typeof c.look === 'object') ? c.look : {};
      [...IDENTITY_FIELDS, ...SOFT_FIELDS].forEach((f) => { const v = f === 'gender' ? (L.gender || c.gender) : L[f]; if (has(v) && !has(p.ident[f])) p.ident[f] = v; });
    });
    if (!has(p.ident.gender)) {
      const g = inferGender(p.name ? aboutName(narr, p.name) || (people.length === 1 ? narr : '') : narr);
      if (g) { p.ident.gender = g; p.inferred = true; }
    }
  });
  // 3) apply it to every appearance
  people.forEach((p) => {
    const who = p.name || 'the main character';
    p.apps.forEach(({ c, si, solo }) => {
      const L0 = (c.look && typeof c.look === 'object') ? c.look : null;
      const text = sceneText(scenes[si]);
      const next = L0 ? { ...L0 } : {};
      const fixed = [];
      [...IDENTITY_FIELDS, ...SOFT_FIELDS].forEach((f) => {
        const want = p.ident[f];
        if (!has(want)) return;
        const cur = f === 'gender' ? (next.gender || c.gender) : next[f];
        if (!has(cur)) { next[f] = want; return; }                      // a scene that forgot a field gets it silently
        if (SOFT_FIELDS.includes(f) || same(cur, want)) return;
        // a nameless lone person in a scene that clearly talks about the other gender is somebody else: leave them be
        if (solo && f === 'gender' && inferGender(text) === lc(cur)) return;
        if (solo && f !== 'gender' && has(next.gender) && !same(next.gender, p.ident.gender)) return;
        next[f] = want; fixed.push(f);                                  // a scene that wrote another value is corrected
      });
      if (!has(next.gender) && has(p.ident.gender)) { next.gender = p.ident.gender; }
      const changed = !L0 ? Object.keys(next).length > 0 : fixed.length > 0 || Object.keys(next).some((k) => !same(next[k], L0[k]));
      if (!changed) return;
      c.look = next;
      if (c.gender !== undefined && has(next.gender)) c.gender = next.gender;
      if (fixed.length) report.push(`Scene ${si + 1}: ${who} was drawn with a different ${fixed.filter((f) => f !== 'seed').join(', ') || 'look'} - kept the same person as before (only clothes change).`);
    });
    if (p.inferred && p.apps.length) report.push(`${who} is ${p.ident.gender} in the story, so every scene draws a ${p.ident.gender === 'female' ? 'woman/girl' : 'man/boy'}.`);
  });
  return report;
}

/** The rule added to the prompt that asks an AI for scene code. Short on purpose so small models read it. */
export function castRule() {
  return `${CAST_MARKER} (very important: this is how a viewer who cannot hear the narration knows WHO the story is about):
- Decide the main character FIRST, from the narration: a name, a gender (male or female, from the words: boy, girl, man, lady, he, she...), an age and a look. Write them once, in setupCode, as one look object with a UNIQUE whole-number seed and an id/name, e.g. var HERO={id:'amara', seed:5821, gender:'female', age:'young adult', skin:'#8d5a3b', hair:'braids', hairc:'#1b1b1b'}; (every other person gets their own seed and id).
- In EVERY scene that person appears in, use that same object: characters:[{ look:HERO, ... }]. To change clothes, copy it and change ONLY clothes: look:{...HERO, outfit:'coat', outfitc:'#2563eb'} (or top/topc/bottom/bottomc/accessory). Never change seed, gender, skin, hair, hair colour, beard, glasses or build between scenes, and never write the main character again with a different look. The app fixes mistakes, but it can only guess, so write it right.
- A boy stays a boy and a woman stays a woman in all scenes, even when the story changes their clothes, place or year. Only a flashback to another AGE may change age (and then keep the same seed, skin, hair colour and face).
- Give the main character one signature thing a viewer can spot in a blink on mute (a red scarf, round glasses, a yellow cap, braids) and keep it in every outfit. Show their name once on screen the first time they appear (a short title or label), so a deaf viewer learns who they are.
- Different people must look clearly different from the main character (other gender, hair, colour of clothes), so nobody is confused with them.`;
}
