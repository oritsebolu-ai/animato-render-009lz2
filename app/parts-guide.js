// Long videos arrive from the AI in parts ("batches"). This module answers, in plain words, the three questions a person has:
//   1. Before sending: how many parts will the AI write, and what should I see?
//   2. After the AI answers: did I get ALL the parts?
//   3. If not: what exactly do I send to the AI so it carries on (it must not ask me anything)?
import { planParts, PART_SEC } from './guided.js';

const BATCH_RE = /ANIMATO[_\s-]*BATCH\s*[:#-]?\s*(\d+)\s*(?:OF|\/)\s*(\d+)/gi;

/** Which part numbers appear in these texts, and how many parts they say the video has. */
export function scanBatches(texts) {
  const have = new Set();
  let declared = 0;
  for (const t of texts || []) {
    const s = String(t || '');
    BATCH_RE.lastIndex = 0;
    let m;
    while ((m = BATCH_RE.exec(s))) {
      const k = +m[1], n = +m[2];
      if (k > 0 && k <= 99) have.add(k);
      if (n > declared && n <= 99) declared = n;
    }
  }
  return { have: [...have].sort((a, b) => a - b), declared };
}

/** What to tell the person before they send the prompt. */
export function explainParts(totalSec) {
  const plan = planParts(totalSec);
  const n = plan.parts.length;
  const mins = Math.round((plan.totalSec / 60) * 10) / 10;
  return {
    parts: n,
    long: n > 1,
    title: n > 1 ? `Your ${mins}-minute video comes in ${n} parts` : 'Your video comes in one part',
    lines: n > 1 ? [
      `The AI writes ${n} separate code blocks, one after another, in the same reply. It should not ask you anything.`,
      `Count them: you need Part 1 of ${n}, Part 2 of ${n} ... Part ${n} of ${n}.`,
      `If the reply stops early, come back here: we tell you exactly which parts are missing and give you the message to send so it carries on.`,
    ] : ['Send the prompt, wait for the reply, then bring it back here.'],
  };
}

/**
 * Did we get everything?
 *   texts        the scene file texts the person loaded
 *   expectedSec  the length they asked for (0 if unknown)
 *   loadedSec    the running time of what was loaded
 */
export function checkParts({ texts = [], expectedSec = 0, loadedSec = 0 } = {}) {
  const scan = scanBatches(texts);
  const plan = expectedSec > 0 ? planParts(expectedSec) : null;
  let total = Math.max(scan.declared, plan ? plan.parts.length : 0);
  if (!total) return { status: 'unknown', total: 0, have: [], missing: [], loadedSec, expectedSec };
  let have = scan.have.slice();
  // files that carry no part numbers: guess how many parts they hold from the running time
  if (!have.length && loadedSec > 0) {
    const per = plan ? plan.totalSec / plan.parts.length : PART_SEC;
    const n = Math.max(1, Math.min(total, Math.floor(loadedSec / per + 0.25)));
    have = Array.from({ length: n }, (_, i) => i + 1);
  }
  const missing = [];
  for (let k = 1; k <= total; k++) if (!have.includes(k)) missing.push(k);
  // numbered parts are all there but the running time is far short: the last part was cut off
  const thin = !missing.length && plan && loadedSec > 0 && loadedSec < expectedSec * 0.7;
  return { status: missing.length ? 'short' : thin ? 'thin' : 'ok', total, have, missing, cutOff: 0, loadedSec, expectedSec };
}

/** The message the person pastes into the AI to make it carry on. It never asks a question. */
export function continueMessage(res) {
  if (!res || !res.total) return '';
  if (res.status === 'thin') return `Your ${res.total} parts add up to only ${Math.round(res.loadedSec / 60 * 10) / 10} minutes, but the video must be ${Math.round(res.expectedSec / 60 * 10) / 10} minutes. Rewrite every part again, longer: each part needs about ${Math.round(res.expectedSec / res.total)} seconds (about ${Math.round(res.expectedSec / res.total / 5.5)} full beats). Same story, same CAST lines, each part as its own code block with the first line // === ANIMATO BATCH k OF ${res.total} ===, one after another in this reply. Do not ask me anything. Do not summarise; show every moment.`;
  const first = res.cutOff || (res.missing && res.missing[0]) || 1;
  const n = res.total;
  const fix = res.cutOff ? `Part ${first} of ${n} was cut off: write it again, complete, from its first beat.` : `${(res.have || []).length ? (res.have.length > 1 ? 'Parts ' : 'Part ') + res.have.join(', ') + (res.have.length > 1 ? ' are' : ' is') + ' done.' : 'Nothing is done yet.'} Continue with Part ${first} of ${n} now.`;
  return `${fix}
- Write each remaining part from Part ${first} to Part ${n} of ${n} as its own code block, one after another in this same reply, each with the first line exactly: // === ANIMATO BATCH k OF ${n} === (k = its number).
- Keep the same CAST lines at the top of every part. Carry on right after the last beat you wrote: no recap, no summary, no explanation.
- Do not ask me anything. Do not wait for me to say "next". Keep every part as detailed and as full as Part 1. If you run out of space, finish the part you are in completely and stop; I will say "continue".`;
}

/** The words shown to the person about what they loaded. */
export function partsHeadline(res) {
  if (!res || res.status === 'unknown') return '';
  const fmt = (s) => { s = Math.round(s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  if (res.status === 'ok') return `All ${res.total} parts found${res.loadedSec ? ` (${fmt(res.loadedSec)})` : ''}. Your video is complete.`;
  if (res.status === 'thin') return `All ${res.total} parts are here, but they only add up to ${fmt(res.loadedSec)} of the ${fmt(res.expectedSec)} you asked for.`;
  const got = res.have.length;
  const miss = `missing: Part ${res.missing.join(', Part ')}`;
  return `Only ${got} of ${res.total} parts found${res.loadedSec ? ` (${fmt(res.loadedSec)}${res.expectedSec ? ' of ' + fmt(res.expectedSec) : ''})` : ''} · ${miss}.`;
}
