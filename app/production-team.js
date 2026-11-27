// The "production team" part of every prompt sent to an AI, and the per-film brand kit that makes every character unique.
//
// Two jobs:
//  1. PRODUCTION TEAM: the AI plans like a strategist plus a full studio (writer, director, character designer, animator, QA editor) before it writes a line of
//     scene code, and checks its own work against a retention checklist. The planning stays inside the AI; the person only gets the files and a short publish kit.
//  2. BRAND KIT: a different, random look-and-feel for every film and every device, in the SAME character style the person picked. Two users never get the same kit,
//     so no two channels end up with the same-looking cast. (The kit is a design brief for the AI; it never names a real character, logo or brand.)
//
// Pure functions only (no DOM), so everything is unit tested in Node.

export const TEAM_MARK = '=== PRODUCTION TEAM (YOU ARE THE WHOLE STUDIO) ===';

function hash(str) { let h = 2166136261 >>> 0; const s = String(str); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function rng(seed) { let a = hash(seed) || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
const hex = (n) => Math.round(n).toString(16).padStart(2, '0');
function hsl(h, s, l) { s /= 100; l /= 100; const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return '#' + hex(255 * f(0)) + hex(255 * f(8)) + hex(255 * f(4)); }

const MOTIFS = ['a thin collar line', 'a small chest badge', 'a stripe down one sleeve', 'a pocket patch', 'a wristband on one arm', 'a knotted scarf', 'a shoulder stripe', 'a hem trim', 'a belt buckle shape', 'a sock band', 'an ear accessory', 'a hat or cap shape'];
const SHAPES = ['diamond', 'chevron', 'circle', 'triangle', 'hexagon', 'bolt', 'crescent', 'star with four points', 'arrow', 'wave'];
const BUILDS = ['tall and slim', 'short and round', 'broad shoulders and a small head', 'long arms and a long neck', 'small and quick', 'solid and heavy', 'average height with a big head', 'wiry and tall'];
const FACES = ['wide-set eyes', 'sleepy eyelids', 'one raised brow as a habit', 'small eyes and a big nose', 'big round eyes', 'a long face', 'a square jaw', 'a button nose', 'strong cheek lines', 'freckle dots'];
const ACCESSORIES = ['round glasses', 'a watch on the left wrist', 'a headband', 'a backpack strap', 'a lanyard', 'a beanie', 'a scarf', 'hoop earrings', 'a bracelet', 'a pen behind the ear', 'a cap worn backwards', 'a pin on the jacket'];
const HAIR = ['a tall quiff', 'a bob cut', 'short curls', 'long straight hair', 'a high bun', 'a shaved side', 'a messy mop', 'twists', 'a neat side part', 'a ponytail', 'a bald head with a beard', 'a wavy mid-length cut'];
const PALETTE_MOODS = ['warm and sunny', 'cool and calm', 'neon night', 'earthy and muted', 'pastel and soft', 'bold primary colours', 'dark with one bright pop', 'retro orange and teal'];
const LINES = {
  original: 'Keep the default round-head cartoon look, but change every proportion, outfit, hair and face detail below so it is its own cast.',
  stickman: 'Keep the clean articulated stickman, but give each one its own build, line weight, clothing, hair and accessories so it is its own cast.',
  human: 'Keep the lifelike Human style, but design every person from scratch with the details below (face, build, age, clothes, hair) so nobody looks like anyone else.',
  doodle: 'Keep the hand-drawn Doodle style, but give every character its own line quality, shapes, colours and details below so it is its own cast.',
  custom: 'Keep the reference-image style exactly, but vary clothes, hair, accessories and colours as below so each person is distinct.',
};

/** A random, repeatable design brief for one film. Same seed gives the same kit, a different seed gives a different one. */
export function brandKit(seed, style = 'original') {
  const r = rng(String(seed) + '|' + style);
  const baseHue = Math.floor(r() * 360);
  const mood = pick(r, PALETTE_MOODS);
  const sat = mood.startsWith('pastel') ? 45 : mood.startsWith('bold') || mood.startsWith('neon') ? 78 : mood.startsWith('earthy') ? 38 : 62;
  const lig = mood.startsWith('pastel') ? 74 : mood.startsWith('dark') ? 34 : 52;
  const colours = [hsl(baseHue, sat, lig), hsl((baseHue + 150 + Math.floor(r() * 60)) % 360, sat, Math.max(30, lig - 6)), hsl((baseHue + 30 + Math.floor(r() * 40)) % 360, Math.min(90, sat + 18), Math.min(70, lig + 12))];
  return {
    seed: String(seed), style,
    code: 'KIT-' + hash(seed + style).toString(36).toUpperCase().padStart(6, '0').slice(-6),
    mood, colours,
    motif: pick(r, MOTIFS), shape: pick(r, SHAPES),
    builds: [pick(r, BUILDS), pick(r, BUILDS), pick(r, BUILDS)],
    faces: [pick(r, FACES), pick(r, FACES), pick(r, FACES)],
    accessories: [pick(r, ACCESSORIES), pick(r, ACCESSORIES), pick(r, ACCESSORIES)],
    hair: [pick(r, HAIR), pick(r, HAIR), pick(r, HAIR)],
    headScale: Number((0.9 + r() * 0.25).toFixed(2)),
    lineWeight: Number((0.85 + r() * 0.45).toFixed(2)),
  };
}

/** The brand kit as instructions for the AI. */
export function brandKitDirective(kit) {
  if (!kit) return '';
  const k = kit;
  return `UNIQUE BRAND KIT FOR THIS FILM (${k.code}) - NO OTHER CHANNEL WILL HAVE THIS CAST:
- ${LINES[k.style] || LINES.original}
- Signature colours (${k.mood}): ${k.colours.join(', ')}. Use them across clothes, props, chapter cards and the background accents. Different people wear different mixes of them.
- Signature detail on every person: ${k.motif} that contains a ${k.shape} mark. Make it small and tasteful, and the same on every character so the cast reads as one family.
- Design ideas to mix, never copy as a set: builds (${k.builds.join('; ')}); faces (${k.faces.join('; ')}); hair (${k.hair.join('; ')}); accessories (${k.accessories.join('; ')}). Head size about ${k.headScale}x normal, line weight about ${k.lineWeight}x normal.
- Every character in this film must look different from every other one (silhouette, hair, colours, accessory), and each keeps the same look in every scene.
- Write cast:'${k.code}' inside movie({...}) (for example movie({title:'...', cast:'${k.code}', ...the other movie fields})). It keeps this cast unique to this creator.
- COPYRIGHT SAFETY: never copy or imitate any existing cartoon, movie, game, anime or brand character, mascot, logo, costume or catchphrase, and never use a real brand name or logo unless the narration is factually about it. If a design starts to remind you of a known character, change it.`;
}

// ---------------------------------------------------------------------------------------------------------------
// The brief. It makes the AI behave like a whole studio: it reads the brief like a producer, storyboards every shot
// (words -> what we see -> where -> what is shown -> camera), passes the MUTE TEST (a deaf viewer understands the film
// with no sound), dresses every person for their role, and checks its own work before it outputs.
// The storyboard is written INTO the file as one comment line per scene/beat: it costs nothing (the app ignores comments),
// it forces even a fast, non-thinking model to really plan each shot, and the person can read it.
// ---------------------------------------------------------------------------------------------------------------

const SCRIPT_LOCK = `SCRIPT LOCK (the person wrote the script): their words are the film. Every word, in the same order, goes into the narration and captions. Never add, drop, summarise, reorder or "improve" a sentence (only fix obvious typos and escape quotes). Your creative work is the PICTURE: what we see during each of their sentences. Cut beats only at their natural pauses (full stops, commas, line breaks).`;
const IDEA_WRITE = `If the person gave only an idea, write the narration yourself: spoken, plain sentences, one idea per beat, concrete nouns and real numbers, no filler, nothing repeated. Everything is true, or clearly a story or an opinion. Never invent facts, quotes or statistics about real people or companies.`;

const METAPHORS = `VISUAL METAPHORS (when the words are abstract, SHOW the idea, never just people standing or walking): time = clock, ticking year counter, sky going from day to night; money = coins flying, a stack growing, a counter racing up; growth or success = rising chart, rocket, trophy, crown, cheering crowd; loss or failure = dim, rain mood, falling chart, a cross, the hero collapsing; hope = spotlight opening on the hero, sunrise mood, a star; a choice = two signs, a question icon, the hero looking left then right; pressure = shake camera, clock, red headline; love or family = heart, house; an idea = bulb popping; big questions about life = the hero alone on a rooftop or in space, slow push to the face, a typewriter question, then a quick montage of the answer (one icon per idea, each popping in on its word).`;
const MOTION = `CINEMATOGRAPHER + MOTION DESIGNER (every beat is a designed shot, like a studio film, not people walking around): every beat has (1) a camera move chosen for the feeling (crash or whip for shock, pushFace for emotion, heroUp for triumph, zoomOut for endings, drama for reveals), (2) at least one motion-graphics layer timed to the words: the KEY WORD of the line as big kinetic text (card or typewriter) the moment it is said, icons popping, flying or stacking on their nouns, a counter or chart on every number, (3) light that tells the feeling (spot, dim, flash on a reveal, the mood), and (4) the people acting in full body (reactions, gestures, sitting, collapsing, cheering, never idle for a whole beat). Main people are BIG (scale 0.85 to 1.0, close-ups 1.1 to 1.25); use crowds and par depth for scale. Open with the most epic image of the film.`;

const SHORT_FILM = `SHORT-FILM STYLE (how the best animated story channels cut their videos; copy the craft, never their characters): (a) a new shot every 1.5 to 2.5 seconds, alternating wide, medium and close-up (c:'cover' does this for you; use pushFace or crash for the big moments); (b) when the story has a number that changes (time left, hours studied, money, snoozes, score), keep it on screen the whole story as a HUD timer or counter at the top and let it tick; (c) rules, lessons and key facts appear as sticky notes; real things people look at appear as the thing itself (a phone screen with alerts, a headline, a chart); (d) cinematic light: dark rooms lit by one lamp, window or doorway (dim + spot), bright open daylight for happy moments; (e) acting you can read with no sound: anticipation, action, reaction (he sees the coin, looks around, crouches, grabs it, jumps for joy); (f) one strong idea per shot, simple sets, big faces; (g) end on a punchline card or a choice (A or B) that makes people comment, or "FOLLOW FOR PART 2" on a cliffhanger.`;

// THE FORCED WORKFLOW: storyboard first (written into the file), then each scene designed and checked like a web page,
// then two review passes. A literal-picture rule and a drawing guide for anything the app does not have yet.
const LITERAL = `LITERAL PICTURE RULE: the picture shows exactly what the words say, the same subject doing the same verb to the same object. "A thief jumped over the fence into the building" = draw a fence and a building, a person dressed all in black (a thief look) runs at the fence and JUMPS over it (action 'jump' while moving across it), lands on the other side. NOT a man walking to a building. "He sneaks into the house" = the same thief, crouched, slow 'sneak' steps, looking left and right, at a door. "A man walks his dog to the park" = the man walking (facing the camera, the camera panning with him), a drawn dog trotting beside him ON A LEASH from his hand, a park set. If the words name it, it is on screen; if it is not in the app, you DRAW it.`;
const DRAW_GUIDE = `DESIGN AND DRAW FREELY (like a front-end developer building and animating a page; the app only supplies the characters): define it once at the top, SVGS.dog = '<g>...</g>' (SVG shapes only: path, rect, circle, ellipse, polygon, line, with fill and stroke; drawn around (0,0) = where it touches the ground, facing RIGHT, about the real size next to a 640-tall person: a dog about 120 wide, a fence about 500 wide and 220 tall). Then place it: ['svg','dog',x,790,1,t0,'trot',{follow:'hero',dx:170,leash:true}] walks beside that person on a leash; ['svg','fence',1000,790,1,0,'none'] stands still; motions: 'trot' (walking animal), 'move' with {to:[x1,y1],t2:seconds}, 'jump' with {to:[x1,y1],h:220}, 'sneak', 'float', 'none'. Use the app's characters for every person; design everything else freely: your own sets (SETS.name = a full 1600 x 900 SVG drawing), objects, effects and animated props ({svg, animate:t=>({x,y,rot,scale,opacity})} or {svgFn:t=>'...'}). Built-in icons and locations are optional shortcuts, never a limit.`;
const WORKFLOW_FULL = `THE WORKFLOW (forced, in this order; steps A and B are written into the file, so do them for real):
   A. STORYBOARD FIRST. Before any scene code, right after movie(), voiceover() and the cast, write the whole plan as one call:
      storyboard([
        {n:1, say:'the exact words of scene 1', see:'one plain sentence a deaf viewer would use to describe the picture', do:{hero:'pose or action, when'}, build:['fence','dog'], set:'place, time of day, light', cam:'shot and move', text:'words or HUD on screen'},
        {n:2, ...}, ...one entry for EVERY scene, in order
      ]);
      The 'see' sentence must say the same thing as 'say' (subject, verb, object). 'build' lists every thing in the picture the app does not already have; each one must be drawn as SVGS.<name>. The app checks the film against this storyboard and tells the person about every scene that does not match or anything that was never drawn.
   B. DESIGN SCENE BY SCENE, like building a website page by page. Take storyboard entry 1 and build scene 1 completely: its set, the drawings it needs, every person placed and posed, every action timed to the word that triggers it (the jump starts on "jumped"), the on-screen text, the camera. Then CHECK scene 1: watch it in your head with the sound off; would a deaf viewer say the 'see' sentence? If not, fix it now. Only then move to scene 2, and so on to the last scene. Never leave a scene "for later".
   C. REVIEW PASS 1, MEANING: go through every scene again against its storyboard entry: right people, right action, right place, right objects, right feeling, right order. Fix every mismatch.
   D. REVIEW PASS 2, POLISH (like checking a website on a phone): every move starts on its word and eases in and out (no snaps, no teleporting, nobody frozen for more than 2 seconds); captions are the exact words, readable size, never over a face; on-screen text and drawings are inside the frame and do not cover faces; things carried, worn or drawn stay the same from scene to scene (continuity); the cut from each scene to the next makes sense.
   ${LITERAL}
   ${DRAW_GUIDE}`;
const WORKFLOW_SHORT = `FORCED WORKFLOW: (A) STORYBOARD FIRST: right after movie(), voiceover() and the cast, write storyboard([{n:1, say:'exact words', see:'what a deaf viewer sees, same subject, verb and object as the words', do:{hero:'action'}, build:['dog','fence'], set:'place, time', cam:'shot', text:'on-screen words'}, ...one per beat]); (B) then build the beats ONE BY ONE like web pages: beat 1 complete and checked with the sound off before beat 2; (C) review every beat against its storyboard entry and fix mismatches; (D) review timing (each move starts on its word), captions and continuity. LITERAL: "a thief jumped over the fence" = a fence and an all-black thief jumping over it, never a man walking. DESIGN FREELY: the app gives only the characters; draw your own sets (SETS.x = full 1600x900 SVG) and objects, e.g. SVGS.dog = '<g>...</g>' (SVG shapes, ground at (0,0), facing right), then ['svg','dog',x,790,1,0,'trot',{follow:'hero',dx:170,leash:true}] or ['svg','fence',1000,790,1,0,'none'].`;

function verticalNotes() {
  return `VERTICAL (9:16) CAMERA: write every scene on the normal wide stage (x 300 to 1300) with people about 150 to 250 apart, never overlapping. The app crops it to a tall frame, scales the people down, staggers them in rows and frames the group so they have room to breathe: do not squeeze them together or zoom in to fit. At most 3 main people per shot; close-ups with one person for feelings. The illustrating picture or icon goes ABOVE the heads (y 120 to 330), near the middle. Captions live in the lower third, so nothing important goes below the knees. Fast cuts (2 to 4 s shots).`;
}
function realisticNotes() {
  return `REALISTIC BACKGROUNDS ARE ON: every scene's SET is a picture tag background:'photo:scene:<place + time of day + light + 1 or 2 details>' (for example 'photo:scene:quiet street leading to a school on a sunny morning'). The app finds a 2D illustrated background of exactly that place, so write the place the words are in. Keep the same tag while the story stays in one place; change it when the place changes. Real, named things the narration mentions appear as 'photo:fact:...' pictures at the moment they are said.`;
}

/** The production-team brief. opts: { short, aspect, bgMode, script (true when the person wrote the script) } */
export function teamBrief({ short = false, aspect = '16:9', bgMode = 'cartoon', script = false } = {}) {
  const tall = String(aspect) === '9:16';
  const real = String(bgMode) === 'realistic';
  const words = script ? SCRIPT_LOCK : IDEA_WRITE;
  if (short) {
    return `${TEAM_MARK}
You are a whole animation studio, not a code writer. The person has ONE idea; your job is that exact idea, told so well that people watch to the end. Work through this before and while you write:
1. PRODUCER: say to yourself in one line what was asked (topic, audience, tone, length, format). Every choice serves it. ${script ? SCRIPT_LOCK : 'Write plain spoken narration, one idea per beat, true or clearly labelled; never invent facts about real people.'}
2. MASTER STRATEGIST: a hook in the first 3 seconds, a curiosity gap kept open, a turn at 60 to 70 percent, a last beat that echoes the first.
3. ${WORKFLOW_SHORT}
4. MUTE TEST: with no sound and no captions, a deaf viewer must still follow who, where, what happens, how they feel and how it ends. Act every verb with the body, show every feeling on face and body, put every key noun and number on screen, show cause before effect, show time jumps (clock, sky, "3 YEARS LATER") and every change of place with a new set. A beat that only works with sound fails. Show every sound (a knock, a ring, a shout, a crash, applause) as a picture plus a short pop-up word; the speaker's mouth moves and the listener reacts; name tags on first speech; when a thing is named, a person points to, reaches for or holds that exact thing with the whole arm; in 9:16 keep faces and key words large and central.
5. CASTING AND COSTUME: every person is designed for their role (write role:'...' for Human people): age, outfit that shows their job and status at a glance, one signature detail, the same look in every scene, nobody looks like a known character.
6. MOTION DESIGN: every beat = named shots for the feeling (low for power, high for weakness, eyes for realising, hands for objects) + the KEY WORD as big kinetic text (card or typewriter) when it is said + icons, counters or charts on its nouns and numbers + light (spot, dim, flash). Abstract words get a visual metaphor (time = clock or year counter, money = coins flying, hope = spotlight, success = trophy and cheering crowd, a big life question = hero alone on a rooftop at night, slow push to the face, then a fast montage of icons). Main people big (scale 0.85 to 1.0). Never just people walking around. Short-film craft: a new named shot every 1.5 to 2.5 s (shot:'...'), a HUD timer or counter on top when a number drives the story, sticky notes for rules, the real thing on screen (phone alerts, headline), one lamp of light in dark rooms, acting readable with no sound, end on a punchline card or an A/B choice.
7. ANIMATOR: everyone moves every second; moves match the verbs (walked = walk, pointed = point); people always face the camera (no side views): walkers face the camera and the camera pans with them; mouths move only for the person speaking.
8. QA: before you output, check every beat: someone on screen, a camera move, kinetic text or icons on the key words, the picture matches the words, something changes every 2 seconds, captions match narration, total length is right, no copied character or logo, the code runs.
${tall ? verticalNotes() + '\n' : ''}${real ? realisticNotes() + '\n' : ''}PUBLISH KIT: at the very end of the LAST part, inside its code, add one comment /* PUBLISH KIT: 3 honest curiosity-driven titles (under 70 characters) | a 2-sentence description | 8 to 10 tags | one thumbnail idea */. Nothing outside the code.`;
  }
  return `${TEAM_MARK}
You are not "an AI that writes code". You are a complete animation studio delivering a finished film that a creator will publish today. The person had ONE idea and answered your questions; your whole job is that this exact idea reaches the screen, so clearly and so well that people watch to the end. Work through every department below in order, and keep going back to stage 3 for every single shot.

1. PRODUCER (read the brief): state to yourself in one line what was asked: topic, audience, tone, length, format, character style, background style. Every later choice must serve that line. Do not drift into a different story, a different tone or a lecture.
   ${words}

2. MASTER STRATEGIST (YouTube automation, the video must earn money): who watches (country, age, interest), the ONE promise of the video, the first-3-seconds hook, the curiosity gap that stays open until late, the turning point at about 60 to 70 percent, the quotable line, the emotion curve (never two scenes in a row with the same feeling), and a last frame that echoes the first so the video loops. Pick a title and thumbnail idea that promise exactly what the video delivers.

${WORKFLOW_FULL}

4. MUTE TEST (the deaf-viewer rule): imagine the film playing with no sound and no captions. A deaf viewer must still understand who the people are, where they are, what happens, how they feel and how it ends. So: every action is acted big and clear with the body, never only told; every feeling shows on the face AND in the body (slumped, jumping, hands on head); every important noun, number and place is on screen as a picture, icon, sign or number; cause comes before effect (we SEE the letter arrive before she cries); time jumps are shown (clock, calendar, sky changing, a "3 YEARS LATER" card); a new place always has a new set. Any shot that only makes sense with sound must be redesigned. SOUND MADE VISIBLE (a deaf viewer cannot hear it, so draw it): a knock = the door shakes plus a KNOCK pop; a phone ring = the phone buzzing with ring waves; a shout = the mouth wide, the body leaning in, the screen shaking and the word as a bold burst; a whisper = small text and two heads close together; a crash, a bang, an alarm, applause, laughter and music each get a picture and a short pop-up word or notes floating up. WHO IS SPEAKING: the speaker's mouth moves and they face the listener, the listener turns to the speaker and reacts, and each person's name or role appears once as a small tag the first time they speak. HOW IT IS SAID: sarcasm, fear, anger and joy show in the brows, the posture and the shot (a slow push in for fear, a shake for anger). HANDS TELL THE STORY: when the narration names a thing, a person points to that exact thing, reaches for it, holds it or touches it, with the whole arm (shoulder, elbow and hand), never a tiny wiggle. FRAMING: in 9:16 keep every face and every key word large and in the middle of the frame, one or two people per shot, big text; in 16:9 use the width (two or three people, the set and the key object all readable).

5. PRODUCTION DESIGNER (sets): one set per place, the same set every time the story returns there, and specific to the words ("small kitchen at dawn", not "room"). Light and weather match the feeling.

6. CASTING AND COSTUME DESIGNER: design the whole cast before scene 1. Each person gets a name, age, role in the story (write role:'...' in a Human look), personality, and an outfit that tells their job, status, era and place at a glance (a nurse looks like a nurse, a CEO like a CEO, a village farmer like a village farmer), hair, one accessory, colours, and keeps them in every scene. Nobody looks like anybody else, and nobody looks like a known character.

7. ${MOTION}
   ${METAPHORS}
   ${SHORT_FILM}

8. ANIMATOR (acting): every person moves every second (breathing, looking, reacting). Moves match the verbs in the words: "walked" walks, "turned" turns, "this" points, "laughed" laughs. People ALWAYS face the camera, never a side view: someone walking or running faces the camera while the camera pans to follow them (c:'panR' / 'panL' / 'cover'); back only for someone watching from the foreground. Cut to reactions. Mouths move only when that person speaks, in sync with the voice. Faces (brow and mouth) are chosen on purpose in every shot.

9. QA EDITOR (run before you output, and fix any shot that fails): a character on screen; every beat has a camera move, a motion-graphics layer on its key word and full-body acting; the picture shows exactly what the words say at that moment; the mute test passes; a hook in the first 3 seconds; something visible changes every 1.5 to 2.5 seconds and a pattern interrupt at least every 10 seconds; no empty or static shot; captions match the narration in spoken order; durations add up to the requested runtime; every storyboard entry was really built and every 'build' item was drawn; no copied character, logo or music; the code runs without errors.
${tall ? '\n' + verticalNotes() + '\n' : ''}${real ? '\n' + realisticNotes() + '\n' : ''}
PUBLISH KIT: after the file link(s) and steps, add at most 10 short lines: 3 title options (under 70 characters, honest, curiosity-driven), a 2-sentence description with the main keyword in the first line, 8 to 10 tags, and one thumbnail idea. Nothing else.
These rules decide how you plan and build; they do not change the questions or steps asked earlier in this prompt.`;
}

/** The full production-team brief (used with the full prompt). */
export const PRODUCTION_TEAM_FULL = teamBrief({});

/** The shorter brief (used with the Guided prompt, which has a much tighter size budget). */
export const PRODUCTION_TEAM_SHORT = teamBrief({ short: true });

/**
 * Adds the production team and the brand kit to a finished prompt (once).
 * @param p      the prompt
 * @param opts   { style, seed, short }
 */
export function withProductionTeam(p, { style = 'original', seed = '', short = false, aspect = '16:9', bgMode = 'cartoon', script = false } = {}) {
  p = String(p == null ? '' : p);
  if (p.includes(TEAM_MARK)) return p;
  const kit = brandKit(seed || 'default', style);
  return `${p}\n\n${teamBrief({ short, aspect, bgMode, script })}\n\n${brandKitDirective(kit)}`;
}
