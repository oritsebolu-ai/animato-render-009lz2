// Content type: what kind of video is being made. Each type adds a block to the prompt that sets who speaks, how the
// cast is used, the structure, and a hard pace rule so people never get bored.
export const CONTENT_TYPES = [
  { id: 'movie', name: 'Cinematic movie', hint: 'Characters speak and act, filmed like a real film' },
  { id: 'narration', name: 'Narration animation', hint: 'A voice tells the story and the characters act out every word' },
  { id: 'presenter', name: 'Storyteller in the scene', hint: 'A host explains while the people in the scene act it out' },
];
export const DEFAULT_TYPE = 'narration';
export const CT_MARKER = 'CONTENT TYPE:';
export const isType = (id) => CONTENT_TYPES.some((t) => t.id === id);
export const typeOf = (id) => CONTENT_TYPES.find((t) => t.id === id) || CONTENT_TYPES.find((t) => t.id === DEFAULT_TYPE);

const PACE = `NEVER BORING: PACE RULES (viewers leave when nothing changes, so something new must happen every 2 to 3 seconds):
- Hook in the first 2 seconds: start on the most striking moment (a shout, a crash, a shocking line, a big question). No slow openings, no logo, no "hello".
- A new shot, prop, expression or on-screen word every 2 to 3 seconds. Never hold the same framing longer than 4 seconds.
- Big moments get big pictures: punch-in on the key word, impact shake and flash on hits, big on-screen words and numbers for the facts, pops on surprises.
- Every scene ends on a small cliffhanger, question or surprise that makes the next scene necessary. Plant a twist and pay it off.
- Characters are always doing something: gesturing on stressed words, reacting the second something is said, moving through the space. Nobody just stands.
- Vary the rhythm: fast burst, one beat of calm, fast burst. The last scene lands with a payoff, then one line that makes people want to watch again or follow.`;

// How a professional storyboard artist turns words into pictures. Shared by narration and presenter videos.
const WORD_TO_PICTURE = `WORD BY WORD: HOW EACH KIND OF PHRASE IS FILMED (this is how professional animated stories are storyboarded; follow it phrase by phrase):
- Split every say into phrases of 3 to 7 words. EVERY phrase gets its own shot (cut on its key word with @"word"), its own action (on its verb), its own face (on its feeling word) and its own drawn things (every noun in it).
- walked / ran / entered / crept / came  -> feet:who on the verb, then track:who while they really move (walkR with [fromX,toX]).
- big / hefty / huge / strong / the boss / the monster -> tiltup:big (feet to face) then low:big; draw the big one at scale 1.2 to 1.3. The small, scared or lonely one -> high:small.
- carried / picked up / held / tied / opened / poured / wrote / gave -> hands:who on the verb, and the object is drawn and HELD ({hold:'who'}); after tying or putting on, it is WORN ({wear:'who', at:'waist'}).
- saw / noticed / heard / looked / realised -> eyes:who on the verb, then pov:who>thing on the thing (the thing is on screen).
- felt / was afraid / smiled / cried / hated -> close:who, with the face changing on that very word.
- said / told / asked / shouted -> ots:who>listener; a quoted line moves the speaker's mouth (speak), a shout is crash:who.
- hit / struck / pushed / slammed / grabbed -> two:a+b on the wind-up, crash:victim on the impact, flash on that word, the victim reacts in the same second.
- fell / collapsed / gave up -> full:who, then high:who.
- suddenly / appeared / there stood / behind her -> whip or pull to the new thing.
- later / that night / years passed / in the city -> establish of the new place or time with a tag card ('3 YEARS LATER').
- a number or a name of a thing -> it is on screen on its word (counter, card, item or your own drawing).
EXAMPLE: "She walked past the men, as hefty as they were. She carried a towel and tied it around her waist." =
  shot:'feet:amara@0->tiltup:guard@"hefty"->low:guard@"were"->high:amara@"She#2"->hands:amara@"carried"->medium:amara@"waist"'
  moves: amara 'walkR@0->idle@"hefty"->reach@"carried"'; guards drawn at scale 1.25, arms crossed, faces suspicious on "hefty"
  props: ['svg','towel',0,0,0.8,'@"carried"','none',{hold:'amara',t1:'@"tied"'}], ['svg','towelWrap',0,0,1,'@"tied"','none',{wear:'amara',at:'waist'}]`;

const LIGHT_DESIGN = `CINEMATIC LIGHT (every scene is lit like a film, not lit flat): one motivated light per scene that you DRAW in the set (a window, a lamp, the sun, a fire, a phone screen) and declare with light:{x,y,color} where you drew it; a colour story for the film (warm = safe or happy, cold blue = danger or sadness, green = sickness or envy, red = anger or alarm); night scenes lit by practical lights with deep shadows; silhouettes against a bright window for mystery; the light changes when the feeling changes (m: and a new light); a flash on every impact or reveal.`;

const BLOCKS = {
  movie: `${CT_MARKER} ANIMATED MOVIE (a short cinematic film, not a narrated story):
- NO narrator. The characters carry everything through their own spoken lines. A beat's say holds the line(s) spoken in it; the speaker has 'speak' on those words (['boss','speak@0->idle@"No"',...], ['hero','idle@0->speak@"No"',...]) and the listener reacts on the face. In scene({...}) files: captions plus that character's talk:[[from,to]].
- STRUCTURE like a real film, fitted to the length asked: (1) cold open that hooks, (2) a bold animated title card, (3) setup: who wants what, (4) rising trouble, a reversal at the middle, (5) the darkest moment, (6) climax, (7) resolution and an ending card. Every part gets its full time.
- COVERAGE (how films are shot): every new place opens with establish; a conversation is ots:a>b, then ots:b>a (shot / reverse shot), then close on whoever feels most; a reaction shot (reaction:listener) after every line that lands; hands for every prop that matters; low on the threat, high on the one in danger; push on a realisation; crash on a shock; pull to end a scene.
- STAGING: keep each person on their side of the screen for the whole scene (if the hero is left and the boss right, they stay so: the 180-degree rule), and move people with purpose (they walk to something as the line is said).
- ACTING: the face shows the feeling BEFORE the line is said; one silent beat (a look, a breath, 1.5 s, d:1.5 with no say) before the biggest line; subtext: characters often say less than they feel.
- Give each character a goal, a way of speaking and a distinct manner. Conflict in every scene. Dialogue is short, punchy, and different for each character; no speech longer than two sentences.
${LIGHT_DESIGN}
${PACE}`,
  narration: `${CT_MARKER} NARRATION ANIMATION (a voice-over tells the story and the characters act out every word, like a live illustration):
- A narrator's voice (not on screen) tells it. The characters do NOT talk to each other; they ACT exactly what the narrator says, in the same second. The narrator's lines are the captions.
- The picture is a word-for-word illustration: a viewer with the sound OFF must be able to say the sentence back. Every verb is acted, every feeling is on a face, every noun is drawn, every number is on screen, each on its own word.
- The narration itself is conversational, vivid and fast, written to be heard: short sentences, strong verbs, concrete details (what she carried, how big they were), questions to the viewer.
${WORD_TO_PICTURE}
${LIGHT_DESIGN}
${PACE}`,
  presenter: `${CT_MARKER} DOCUMENTARY WITH A PRESENTER (a host in the story explains, and the people in the scene act out what the host says):
- Character number 1 in the characters list is the PRESENTER. Give him presenter:'right' (or presenter:'left'). The app pins him in a corner of the screen for the whole video, outside the camera, so he is always there. Only he talks ('speak' on his lines, or talk:true); he looks and gestures toward the viewer and toward the action on the key words (point, present), and reacts with the face to his own punchlines.
- The presenter's lines are the captions and the narration. He never leaves the corner and has no walk, no x or ground changes.
- Every other character (character 2 and up) is an ACTOR who stays silent and acts out, in the main scene area, exactly what the presenter is saying in that second, word by word, in the set the line describes. Change the set when the topic changes. Their mouths stay closed.
- The camera (shot:'...') works on the actors only; the presenter is pinned outside it. Each scene has a new subject, a new set and a new actor action.
- The presenter's voice is conversational: he talks like a smart friend, with questions, surprising facts and jokes, never like reading a report.
${WORD_TO_PICTURE}
${LIGHT_DESIGN}
${PACE}`,
};

export function contentTypeBlock(id) {
  return BLOCKS[isType(id) ? id : DEFAULT_TYPE];
}
export function injectContentType(prompt, id) {
  const text = String(prompt == null ? '' : prompt);
  if (!isType(id) || text.includes(CT_MARKER)) return text;
  const blk = BLOCKS[id];
  const at = text.indexOf('\nSCENE BY SCENE');
  return at > 0 ? text.slice(0, at) + '\n' + blk + '\n' + text.slice(at) : text + '\n\n' + blk;
}
