/* Chat pages (Google AI Studio above all) break a code box that gets too long: the box disappears and the rest of the code
 * turns into plain text. So the AI is told to keep every code box small and to open a new box (same batch line) when one is full.
 * The app also rescues code that ended up outside a box (see rescueUnfencedCode in generation.js). */
export const BOX_MARKER = 'ONE CODE BOX HOLDS AT MOST 12 BEATS';
export const BOX_BEATS = 12;

export function boxRule({ batchWord = 'batch' } = {}) {
  return `${BOX_MARKER} (a chat page breaks a code box that is too long: the box vanishes and the rest of the code turns into plain text, which ruins the file). Count your beats: when a box holds ${BOX_BEATS} beats (about 150 lines, 8,000 characters), close it with the closing code fence and open a NEW code box. The new box starts with the SAME ${batchWord} line as the box before it, then \`// (continued)\`, then the very next beat. Example: \`// === ANIMATO BATCH 2 OF 9 ===\` then \`// (continued)\`. Every box is complete on its own: never end a box in the middle of a beat, and never leave code outside a box.`;
}
