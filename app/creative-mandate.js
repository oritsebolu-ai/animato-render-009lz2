/* The creative brief every prompt carries: the AI is a film director with no limits, and the pictures must be top quality.
 * The app's lists (looks, sets, icons) are shortcuts, never limits. One exception stays: a character the PERSON supplied
 * (reference image or saved pack) keeps its face, hair, skin and build; only its clothes may change. */
export const CREATIVE_MARKER = 'CREATIVE DIRECTOR MANDATE';

export function creativeBlock({ ownCharacter = false } = {}) {
  const cast = ownCharacter
    ? "CHARACTERS: the person supplied the character(s). Never change their face, hair, skin or build (clothes may change). Everything else around them (sets, props, extra people, creatures, effects) you design yourself without limits."
    : "CHARACTERS: you may redesign the whole cast. Give every person a unmistakable silhouette, outfit, colour palette, accessory and attitude chosen for THIS story (draw your own with customCharacter or raw SVG when the listed looks are not enough). Keep each person looking identical in every scene.";
  return `${CREATIVE_MARKER} (your one goal: the most gripping, beautiful and surprising video this description can become; people must stop scrolling and say "how was this made?"):
- NO LIMITS: the app's lists are shortcuts, never limits. Invent, redesign, draw and animate anything the story can use.
- ${cast}
- BACKGROUNDS ARE TOP QUALITY, NEVER FLAT OR TACKY: every location is a designed picture in 3 depth layers (far: sky, skyline or distant hills; middle: the architecture; near: foreground framing such as a doorway, plant, railing or furniture) with gradients, ONE clear light source that glows and throws shadows, atmosphere (haze, dust, rain, fog, drifting particles), real architectural detail (windows, doors, signs, textures, perspective lines, floors with reflections) and one signature story object in sharp focus. Pick a colour palette per place and mood that matches the emotion. Rich but readable: one clear focal point, the middle free for the characters, the bottom quarter calm for captions.
- EVERY PLACE IS DIFFERENT: never reuse a location unless its time of day, weather or angle changes.
- NOTHING IS STILL: lights flicker, clouds, steam and leaves drift, parallax layers slide, objects react to the people.
- DIRECT LIKE A FILM: an establishing wide shot, close-ups for feelings, a hero shot, a visual metaphor, one surprise every few beats.
- Be creative inside the file rules: valid JavaScript, every quote closed, small code boxes. Define each set once (SETS.x) and reuse it: shorter code, richer pictures.`;
}

export function withCreative(prompt, opts = {}) {
  const p = String(prompt || '');
  if (!p || p.includes(CREATIVE_MARKER)) return p;
  return p + '\n\n' + creativeBlock(opts);
}
