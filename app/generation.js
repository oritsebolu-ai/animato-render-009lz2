import { STYLE_API_RULE, STYLE_CAST_EXAMPLE } from './character-styles.js';
import { isAction, busyWindows, ACTION_NAMES } from './acting.js';
import { autoProps } from './scenery.js';
import { anchorBeat } from './shots.js';
import { creatureSvg, creatureKind } from './creatures.js';
// Pure AI model ranking, free-tier filtering, downward fallback, and duration-locked
// multi-chapter generation utilities for Animato Stickman Studio.
// Works both in browsers (as an ES module attached to window.AnimatoGen) and in Node.js.

export const RECOMMENDED_GEMINI_MODEL = 'gemini-4-hydrogen';

export const DEFAULT_FREE_TIER_GEMINI_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
];

import { boxRule } from './box-rule.js';
import { creativeBlock } from './creative-mandate.js';
const DEPRECATED_GEMINI_RE = /^(gemini-1\.|gemini-2\.0|gemini-pro$)/i;
const NON_TEXT_GEMINI_RE =
  /embedding|imagen|veo|tts|audio|live|robotics|aqa|bison|gecko|learnlm|image|nano-banana|omni|lyria|decision|transcribe|translate|computer-use|deep-research|tuning/i;
const PAID_ONLY_GEMINI_RE = /(?:^|-)pro(?:$|-)|argon|carbon|ultra/i;

/**
 * Parse a UI duration string (e.g. "30 seconds", "10 minutes", "30 minutes") into seconds.
 */
export function parseDurationSeconds(label) {
  if (typeof label === 'number' && Number.isFinite(label) && label > 0) {
    return Math.round(label);
  }
  const str = String(label || '60 seconds').trim().toLowerCase();
  const num = parseFloat(str);
  if (!Number.isFinite(num) || num <= 0) return 60;
  if (/sec|\bs\b/.test(str)) return Math.max(5, Math.round(num));
  if (/hour|\bhr\b/.test(str)) return Math.max(60, Math.round(num * 3600));
  return Math.max(15, Math.round(num * 60));
}

/**
 * Determine whether a Gemini model ID is an active free-tier Google AI Studio text/multimodal model.
 */
export function isFreeTierGeminiModel(id, supportedMethods = null) {
  const cleanId = String(id || '').replace(/^models\//, '').trim();
  if (!cleanId || !/^gemini-/i.test(cleanId)) return false;
  if (Array.isArray(supportedMethods) && supportedMethods.length > 0 && !supportedMethods.includes('generateContent')) {
    return false;
  }
  if (DEPRECATED_GEMINI_RE.test(cleanId)) return false;
  if (NON_TEXT_GEMINI_RE.test(cleanId)) return false;
  if (PAID_ONLY_GEMINI_RE.test(cleanId)) return false;
  // On Google AI Studio free tier, general text models are hydrogen and flash / flash-lite models.
  return /hydrogen|flash/i.test(cleanId);
}

/**
 * Score a free-tier Gemini model from smartest (highest score) to least smartest (lowest score).
 */
export function geminiIntelligenceScore(id) {
  const s = String(id || '').replace(/^models\//, '').trim().toLowerCase();
  if (!s) return 0;

  let base = 1000;
  if (s === 'gemini-4-hydrogen') {
    base = 5000;
  } else if (/^gemini-4/.test(s)) {
    base = /hydrogen/.test(s) ? 4900 : /lite/.test(s) ? 4200 : 4700;
  } else {
    const verMatch = /^gemini-(\d+)(?:\.(\d+))?/.exec(s);
    const major = verMatch ? parseInt(verMatch[1], 10) : 2;
    const minor = verMatch && verMatch[2] ? parseInt(verMatch[2], 10) : 0;
    const isLite = /\blite\b|-lite/i.test(s);
    // Full Flash models outrank Flash-Lite models of the same or slightly newer era
    // (e.g., gemini-3-flash > gemini-2.5-flash > gemini-3.1-flash-lite > gemini-2.5-flash-lite).
    if (!isLite) {
      base = major * 1000 + minor * 50 + 400;
    } else {
      base = major * 700 + minor * 40 + 100;
    }
  }

  // Prefer stable aliases over preview/experimental/dated snapshots within the exact same tier
  let modifier = 0;
  if (/preview/i.test(s)) modifier -= 12;
  if (/exp/i.test(s)) modifier -= 20;
  if (/-\d{2}-\d{4}|-\d{4}|-\d{3}$/.test(s)) modifier -= 8;
  if (/latest/i.test(s)) modifier -= 2;

  return base + modifier;
}

function friendlyGeminiLabel(id, displayName) {
  if (id === 'gemini-4-hydrogen') return 'Gemini 4 Hydrogen';
  const dn = String(displayName || '').trim();
  if (dn) return dn;
  return id;
}

/**
 * Filter and sort Google AI Studio models to free-tier only, ordered smartest -> least smartest.
 */
export function buildFreeTierGeminiModelList(discoveredRows = []) {
  const byId = new Map();

  const upsert = (id, displayName) => {
    const cleanId = String(id || '').replace(/^models\//, '').trim();
    if (!cleanId || !isFreeTierGeminiModel(cleanId)) return;
    if (!byId.has(cleanId)) {
      byId.set(cleanId, {
        id: cleanId,
        p: 'gemini',
        label: friendlyGeminiLabel(cleanId, displayName),
        score: geminiIntelligenceScore(cleanId),
      });
    }
  };

  // Always include Gemini 4 Hydrogen as the top free-tier recommended model
  upsert(RECOMMENDED_GEMINI_MODEL, 'Gemini 4 Hydrogen');

  const validDiscovered = [];
  if (Array.isArray(discoveredRows)) {
    for (const row of discoveredRows) {
      const id = String(row?.name || row?.id || '').replace(/^models\//, '').trim();
      const methods = row?.supportedGenerationMethods;
      if (isFreeTierGeminiModel(id, methods)) {
        validDiscovered.push({ id, displayName: row?.displayName || row?.label || '' });
      }
    }
  }

  if (validDiscovered.length > 0) {
    for (const item of validDiscovered) upsert(item.id, item.displayName);
  } else {
    for (const defId of DEFAULT_FREE_TIER_GEMINI_MODELS) upsert(defId, '');
  }

  const sorted = [...byId.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return sorted.map((m, idx) => ({
    id: m.id,
    p: 'gemini',
    label: m.label,
    rank: idx + 1,
    freeTier: true,
    note:
      idx === 0
        ? 'Google AI Studio · Free tier · #1 Smartest (auto-fallback enabled)'
        : `Google AI Studio · Free tier · #${idx + 1} smartest`,
  }));
}

/**
 * Build the downward model fallback queue starting at selectedModelId.
 */
export function buildDownwardGeminiQueue(selectedModelId, orderedGeminiModels) {
  const ids = (Array.isArray(orderedGeminiModels) ? orderedGeminiModels : [])
    .filter((m) => m && m.p === 'gemini' && m.id)
    .map((m) => m.id);
  if (!ids.length) return [selectedModelId || RECOMMENDED_GEMINI_MODEL];
  const target = selectedModelId || ids[0];
  const idx = ids.indexOf(target);
  if (idx >= 0) return ids.slice(idx);
  return [target, ...ids];
}

/**
 * Execute a generation call with up to maxPrimaryTrials (3 fast trials by default) on the primary
 * model (e.g., Gemini 4 Hydrogen), rotating keys if multiple exist, then automatically moving
 * downward through orderedModels without user intervention.
 */
export async function executeWithModelFallback({
  selectedModelId,
  orderedModels,
  keys,
  maxPrimaryTrials = 3,
  maxFallbackTrials = 2,
  retryDelayMs = ({ status, attempt }) =>
    status === 429 ? Math.min(280, 120 * (attempt + 1)) : Math.min(200, 80 * (attempt + 1)),
  invoke,
  onStatus,
  sleepFn = (ms) => new Promise((r) => setTimeout(r, ms)),
  signal = null,
}) {
  const keyList = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (!keyList.length) {
    const err = new Error('No Google AI Studio API key available.');
    err.status = 401;
    throw err;
  }

  const queue = buildDownwardGeminiQueue(selectedModelId, orderedModels);
  const labelOf = (id) => {
    const found = (orderedModels || []).find((m) => m.id === id);
    return found?.label || id;
  };

  let lastErr = null;
  let deadKeys = 0;
  const trialsByModel = {};

  for (let mi = 0; mi < queue.length; mi++) {
    const modelId = queue[mi];
    const modelLabel = labelOf(modelId);
    const maxTrials = mi === 0 ? Math.max(1, maxPrimaryTrials) : Math.max(1, maxFallbackTrials);
    trialsByModel[modelId] = 0;

    if (mi > 0 && onStatus) {
      const prevLabel = labelOf(queue[mi - 1]);
      onStatus(`${prevLabel} failed after ${trialsByModel[queue[mi - 1]]} attempts — moving down to ${modelLabel}…`);
    }

    let modelNotFound = false;
    for (let attempt = 0; attempt < maxTrials; attempt++) {
      if (signal && signal.aborted) {
        throw new DOMException('Cancelled', 'AbortError');
      }
      const apiKey = keyList[attempt % keyList.length];
      trialsByModel[modelId]++;

      if (attempt === 0 && mi === 0 && onStatus) {
        onStatus(`Trying ${modelLabel}…`);
      } else if (attempt > 0 && onStatus) {
        onStatus(`Retrying ${modelLabel} (${attempt + 1}/${maxTrials})…`);
      }

      try {
        const result = await invoke({ modelId, apiKey, attempt: attempt + 1, modelIndex: mi });
        return { result, modelUsed: modelId, trialsByModel };
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        lastErr = e;
        const st = Number(e?.status) || 0;
        const msg = String(e?.message || '');

        // Bad API key: don't spin through fallback models when all keys fail authentication
        if (st === 401 || (st === 403 && /api key|permission|unauthenticated|forbidden/i.test(msg)) || (st === 400 && /api key not valid|invalid api key/i.test(msg))) {
          deadKeys++;
          if (deadKeys >= keyList.length && attempt + 1 >= keyList.length) {
            throw e;
          }
          continue;
        }

        // For secondary fallback models (mi > 0), skip immediately on 404;
        // for primary (mi === 0, e.g. Gemini 4 Hydrogen), run all 3 fast trials before moving downward.
        if (st === 404 && mi > 0) {
          modelNotFound = true;
          break;
        }

        if (attempt + 1 < maxTrials) {
          const delayMs = Math.max(0, Number(retryDelayMs({ status: st, attempt, modelId })) || 0);
          if (delayMs > 0) await sleepFn(delayMs);
        }
      }
    }

    if (modelNotFound && mi + 1 < queue.length && onStatus) {
      onStatus(`${modelLabel} unavailable — moving down to ${labelOf(queue[mi + 1])}…`);
    }
  }

  throw lastErr || new Error('All available Gemini models failed to generate.');
}

/**
 * Split a script into `chunkCount` proportional parts along sentence boundaries without dropping words.
 */
export function splitScriptByDuration(scriptText, chunkCount) {
  const clean = String(scriptText || '').replace(/\s+/g, ' ').trim();
  const count = Math.max(1, Math.floor(chunkCount || 1));
  if (!clean) return Array.from({ length: count }, () => '');
  if (count === 1) return [clean];

  const sentences = clean.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [clean];
  if (sentences.length <= 1) {
    const words = clean.split(' ').filter(Boolean);
    const out = [];
    for (let i = 0; i < count; i++) {
      const a = Math.floor((i * words.length) / count);
      const b = Math.floor(((i + 1) * words.length) / count);
      out.push(words.slice(a, b).join(' '));
    }
    return out;
  }

  const wordCounts = sentences.map((s) => s.split(/\s+/).filter(Boolean).length || 1);
  const totalWords = wordCounts.reduce((a, b) => a + b, 0) || 1;
  const out = [];
  let si = 0;
  let accWords = 0;

  for (let c = 0; c < count; c++) {
    const targetCumulative = ((c + 1) * totalWords) / count;
    const bucket = [];
    const remainingChunks = count - 1 - c;
    while (si < sentences.length - remainingChunks) {
      const nextWords = accWords + wordCounts[si];
      if (bucket.length === 0 || Math.abs(nextWords - targetCumulative) <= Math.abs(accWords - targetCumulative)) {
        bucket.push(sentences[si++]);
        accWords = nextWords;
      } else {
        break;
      }
    }
    out.push(bucket.join(' '));
  }
  while (si < sentences.length) {
    out[count - 1] = (out[count - 1] ? out[count - 1] + ' ' : '') + sentences[si++];
  }
  return out;
}

/**
 * Plan generation batches so multi-minute videos (2 min up to 30 min) are generated
 * in reliable ~100-120s chapters instead of getting truncated into a 1-minute response.
 */
export function planGenerationBatches(targetSec, scriptText = '') {
  const sec = Math.max(15, Math.round(Number(targetSec) || 60));
  const cleanScript = String(scriptText || '').replace(/\s+/g, ' ').trim();
  const scriptWords = cleanScript ? cleanScript.split(/\s+/).filter(Boolean).length : 0;

  // Short videos (<= 95s) use single-pass with continuation guard
  if (sec <= 95 && scriptWords <= 260) {
    return {
      isMultiChapter: false,
      targetSec: sec,
      batches: [
        {
          index: 0,
          targetSec: sec,
          targetWords: Math.max(20, Math.round(sec * 2.65)),
          scriptSlice: cleanScript,
        },
      ],
    };
  }

  // Multi-minute videos: ~120s per chapter batch (max 15 batches for 30 min = 1800s)
  const batchCount = Math.max(2, Math.min(18, Math.ceil(sec / 120)));
  const useVerbatimSlices = scriptWords >= sec * 1.4;
  const slices = useVerbatimSlices ? splitScriptByDuration(cleanScript, batchCount) : Array(batchCount).fill('');

  const baseSec = Math.floor(sec / batchCount);
  const rem = sec - baseSec * batchCount;
  const batches = [];

  for (let i = 0; i < batchCount; i++) {
    const slice = slices[i];
    const sliceWords = slice ? slice.split(/\s+/).filter(Boolean).length : 0;
    const batchSec = baseSec + (i < rem ? 1 : 0);
    batches.push({
      index: i,
      targetSec: batchSec,
      targetWords: useVerbatimSlices && sliceWords > 0 ? sliceWords : Math.max(40, Math.round(batchSec * 2.65)),
      scriptSlice: slice,
    });
  }

  return {
    isMultiChapter: true,
    targetSec: sec,
    useVerbatimSlices,
    batches,
  };
}

/**
 * Normalize an AI-generated chapter plan so chapter count and durations always match the planned batches.
 */
export function normalizeChapterPlan(rawChapters, plannedBatches) {
  const list = Array.isArray(rawChapters) ? rawChapters : [];
  return plannedBatches.map((batch, idx) => {
    const src = list[idx] || {};
    return {
      index: idx,
      title: String(src.title || `Part ${idx + 1}`).trim(),
      summary: String(src.summary || src.beat || `Continue the story cleanly into Part ${idx + 1}.`).trim(),
      setting: String(src.setting || '').trim(),
      mood: String(src.mood || '').trim(),
      targetSec: batch.targetSec,
      targetWords: batch.targetWords,
      scriptSlice: batch.scriptSlice || '',
    };
  });
}

/**
 * Strip duplicate movie(), voiceover(), thumbnail(), or markdown fences from a chapter scenes snippet
 * so only scene({...}) blocks and local chapter helpers remain.
 */
export function stripTopLevelMovieCalls(code) {
  let s = String(code || '')
    .trim()
    .replace(/^\s*```[a-z]*\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .replace(/^\s*(javascript|js)\s*\n/i, '')
    .trim();

  // Remove accidental movie(...), voiceover(...), thumbnail(...) calls inside a chapter batch
  const fnNames = ['movie', 'voiceover', 'thumbnail'];
  for (const fn of fnNames) {
    const re = new RegExp(`(?:^|\\n)\\s*${fn}\\s*\\(`, 'g');
    let match;
    while ((match = re.exec(s)) !== null) {
      const start = match.index + (s[match.index] === '\n' ? 1 : 0);
      const openParen = s.indexOf('(', start);
      if (openParen < 0) break;
      let depth = 0;
      let inStr = '';
      let esc = false;
      let end = -1;
      for (let i = openParen; i < s.length; i++) {
        const ch = s[i];
        if (esc) {
          esc = false;
          continue;
        }
        if (inStr) {
          if (ch === '\\') esc = true;
          else if (ch === inStr) inStr = '';
          continue;
        }
        if (ch === "'" || ch === '"' || ch === '`') {
          inStr = ch;
          continue;
        }
        if (ch === '(') depth++;
        else if (ch === ')') {
          depth--;
          if (depth === 0) {
            end = i + 1;
            if (s[end] === ';') end++;
            break;
          }
        }
      }
      if (end > start) {
        s = s.slice(0, start) + s.slice(end);
        re.lastIndex = start;
      } else {
        break;
      }
    }
  }
  return s.trim();
}

/**
 * Assemble master setup, thumbnail, and chapter scene blocks into one complete scene-file.txt.
 */
export function assembleChunkedSceneCode({
  title,
  characterStyle = '',
  voice = '',
  ownAudio = false,
  noNarration = false,
  setupCode = '',
  thumbnailCode = '',
  chapterCodes = [],
  fullNarration = '',
  aspect = '16:9',
}) {
  const safeTitle = JSON.stringify(String(title || 'Generated Video'));
  const charPart =
    characterStyle === 'human' || characterStyle === 'doodle'
      ? `, character:'${characterStyle}'`
      : characterStyle === 'stickman'
      ? ", character:'stickman'"
      : characterStyle === 'custom' || characterStyle === 'builder'
        ? ", character:'custom'"
        : '';

  const lines = [`movie({title:${safeTitle}, aspect:'${aspect === '9:16' ? '9:16' : '16:9'}'${charPart}});`];

  if (!noNarration && fullNarration.trim()) {
    const safeNar = JSON.stringify(fullNarration.trim());
    if (ownAudio) {
      lines.push(`voiceover({text:${safeNar}, mode:'own'});`);
    } else {
      const safeVoice = JSON.stringify(voice || 'Charon');
      lines.push(`voiceover({text:${safeNar}, voice:${safeVoice}});`);
    }
  }

  const cleanSetup = stripTopLevelMovieCalls(setupCode);
  if (cleanSetup) lines.push(cleanSetup);

  const cleanThumb = String(thumbnailCode || '')
    .trim()
    .replace(/^\s*```[a-z]*\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim();
  if (cleanThumb && /\bthumbnail\s*\(/.test(cleanThumb)) {
    lines.push(cleanThumb);
  }

  for (const ch of chapterCodes) {
    const cleanCh = stripTopLevelMovieCalls(ch);
    if (cleanCh) {
      // Wrap each chapter in its own block scope so repeated local const/let names across chapters cannot collide.
      lines.push(`{\n${cleanCh}\n}`);
    }
  }

  return lines.join('\n\n');
}

/**
 * Parse a JSON response string defensively (handling markdown fences or surrounding prose).
 */
export function parseLooseJson(rawText, fallbackKey = null) {
  const s = String(rawText || '').trim();
  const tryParse = (txt) => {
    try {
      const parsed = JSON.parse(txt);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
    return null;
  };
  const direct = tryParse(s);
  if (direct) return direct;
  const unfenced = s.replace(/^\s*```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  const fromFence = tryParse(unfenced);
  if (fromFence) return fromFence;
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) {
    const sliced = tryParse(s.slice(a, b + 1));
    if (sliced) return sliced;
  }
  if (fallbackKey) return { [fallbackKey]: unfenced };
  return null;
}

/**
 * Sum the total duration (in seconds) of an array of parsed scenes.
 */
export function sumSceneDurations(scenes) {
  if (!Array.isArray(scenes)) return 0;
  return scenes.reduce((acc, s) => acc + Math.max(0.5, Number(s?.duration) || 5), 0);
}

/**
 * Fine-tune scene durations inside generated JS code when total duration is already within
 * reasonable range of targetSec (e.g. within 25%) so runtime hits targetSec accurately.
 */
export function calibrateSceneCodeDurations(code, actualSec, targetSec) {
  if (!(actualSec > 0) || !(targetSec > 0)) return code;
  const ratio = targetSec / actualSec;
  if (Math.abs(1 - ratio) <= 0.03) return code;
  // Only apply gentle fine calibration (0.72x to 1.45x); larger gaps must be filled with real scenes!
  if (ratio < 0.72 || ratio > 1.45) return code;

  return String(code).replace(/(^|[{,\s])((?:duration|d)\s*:\s*)(\d+(?:\.\d+)?)/g, (_m, lead, prefix, numStr) => {
    const orig = parseFloat(numStr);
    if (!Number.isFinite(orig) || orig <= 0) return _m;
    const scaled = Math.max(1.5, Math.round(orig * ratio * 10) / 10);
    return `${lead}${prefix}${scaled}`;
  });
}

export const VOICEOVER_PLATFORMS = {
  elevenlabs: 'ElevenLabs',
  aistudio: 'Google AI Studio',
};

export function normalizeVoiceoverPlatform(platform) {
  const raw = String(platform || '').trim().toLowerCase();
  if (/ai\s*studio|google|playground/.test(raw)) return 'aistudio';
  return 'elevenlabs';
}

/**
 * Determine whether a voiceover script fits comfortably in a single mobile phone clipboard
 * copy (<=10 min / <=1,650 words / <=10,500 chars) or should be split into numbered
 * mobile-safe copy batches so long videos (e.g. 15–30 minutes) never truncate mid-copy.
 */
export function getVoiceoverCopyBatchPlan(durationLabel = '60 seconds', scriptOrWords = '') {
  const totalSec = parseDurationSeconds(durationLabel);
  const minutes = Math.round((totalSec / 60) * 10) / 10;
  let estWords = 0;
  let estChars = 0;
  if (typeof scriptOrWords === 'number' && Number.isFinite(scriptOrWords) && scriptOrWords > 0) {
    estWords = Math.round(scriptOrWords);
    estChars = estWords * 6;
  } else {
    const clean = String(scriptOrWords || '').trim();
    if (clean) {
      estWords = clean.split(/\s+/).filter(Boolean).length;
      estChars = clean.length;
    } else {
      estWords = Math.max(25, Math.round(totalSec * 2.65));
      estChars = estWords * 6;
    }
  }

  const maxWordsPerBatch = 1050;
  const maxCharsPerBatch = 6300;
  const singleClipboardSafe = totalSec <= 600 && estWords <= 1650 && estChars <= 10500;
  const batchCount = singleClipboardSafe
    ? 1
    : Math.max(2, Math.min(20, Math.ceil(Math.max(estWords / maxWordsPerBatch, estChars / maxCharsPerBatch))));

  return {
    totalSec,
    minutes,
    estWords,
    estChars,
    batchCount,
    singleBatch: batchCount === 1,
    maxWordsPerBatch,
    maxCharsPerBatch,
  };
}

/**
 * Build platform-specific final voiceover formatting + mobile clipboard batching + post-script
 * voice recommendation instructions for ElevenLabs or Google AI Studio Playground.
 */
export function buildVoiceoverDeliveryInstructions({
  platform = 'elevenlabs',
  durationLabel = '60 seconds',
  hasCustomScript = false,
  tone = '',
  scriptText = '',
  totalSceneBatches = 1,
} = {}) {
  const platKey = normalizeVoiceoverPlatform(platform);
  const platLabel = VOICEOVER_PLATFORMS[platKey];
  const copyPlan = getVoiceoverCopyBatchPlan(durationLabel, scriptText);
  const sceneDoneNote =
    totalSceneBatches > 1
      ? `ONLY AFTER Batch ${totalSceneBatches} of ${totalSceneBatches} is finished, in its OWN NEW reply (never in the same reply as a scene batch, so no reply runs past your length limit; if you cannot tell, end the scene reply with "Say VOICEOVER for the voiceover script." and write it only when I say so)`
      : 'RIGHT AFTER outputting the complete scene code';
  const toneHint = String(tone || '').trim() || 'matching the story mood and pacing';

  const mobileBatchRule = copyPlan.singleBatch
    ? `- **ONE SINGLE COPY-AND-PASTE BLOCK (Mobile-Friendly)**: Output the ENTIRE voiceover (~${copyPlan.estWords} words) inside **1 single plain-text copy-and-paste block** (plus downloadable \`voiceover-script.txt\` if your chat supports file downloads) so the user can copy everything cleanly on a phone in one tap without any part cutting off.`
    : `- **MOBILE-SAFE CLIPBOARD BATCHES (${copyPlan.batchCount} VOICEOVER BATCHES — NEVER TRUNCATE ON A PHONE)**:
  * A ${copyPlan.minutes}-minute script (~${copyPlan.estWords} words) exceeds a mobile phone clipboard's single-copy limit and will cut off if placed in one huge block.
  * Split the FULL voiceover cleanly at **whole scene/paragraph boundaries** into **${copyPlan.batchCount} sequential copy-and-paste blocks** labeled above each block as \`=== VOICEOVER BATCH 1 OF ${copyPlan.batchCount} ===\` through \`=== VOICEOVER BATCH ${copyPlan.batchCount} OF ${copyPlan.batchCount} ===\` (about **900–1,050 words / <=6,300 chars max per batch** so every block copies completely on any phone).
  * NEVER split inside a sentence, NEVER drop words between batches, and keep every spoken paragraph aligned in exact Scene 1 -> Final Scene order.`;

  const platformRules =
    platKey === 'aistudio'
      ? `- **GOOGLE AI STUDIO PLAYGROUND VOICE GENERATION FORMAT**:
  * Format the spoken text specifically for **Google AI Studio Playground** voice/speech generation so it reads smoothly with crystal-clear inflection.
  * Write one clean spoken paragraph per scene separated by blank lines (\`\\n\\n\`) with natural punctuation cadence (periods, commas, em-dashes) so Playground pauses naturally between scenes.
  * Keep any Playground style/tone/delivery hint *outside* the copy-and-paste block(s) — NEVER put timestamps, scene titles, \`[pause]\`/[stage directions], speaker labels (\`Narrator:\`), or code inside the copy-and-paste voiceover block(s).`
      : `- **ELEVENLABS VOICE GENERATION FORMAT**:
  * Format the spoken text specifically for **ElevenLabs** speech synthesis so breathing, emphasis, and pacing sound human and engaging.
  * Write one clean spoken paragraph per scene separated by blank lines (\`\\n\\n\`) with clean natural punctuation cadence (commas, periods, em-dashes, rhetorical beats) so ElevenLabs pauses cleanly at scene transitions.
  * NEVER put timestamps, scene numbers, \`[stage directions]\`, speaker labels (\`Narrator:\`), or code inside the copy-and-paste voiceover block(s).`;

  const voiceRecRules =
    platKey === 'aistudio'
      ? `- **BEST VOICES RECOMMENDATION (REQUIRED OUTSIDE / AFTER THE VOICEOVER SCRIPT)**:
  * Immediately AFTER (and completely OUTSIDE) the copy-and-paste voiceover block(s), add a short **BEST GOOGLE AI STUDIO PLAYGROUND VOICES FOR THIS VIDEO** section recommending the **top 2–3 Google AI Studio voices** suited to this video's tone (${toneHint}) — choosing accurately from Playground voices such as **Charon** (deep authoritative documentary), **Fenrir** (intense thriller/suspense), **Puck** (energetic punchy hook), **Kore** (crisp modern explainer), **Aoede** (warm expressive storytelling), **Sulafat** (steady warm narrator), **Gacrux** (calm cinematic gravity), **Iapetus** (balanced educational), or **Zephyr** (upbeat creator) — plus a 1-line **Playground Style Prompt** the user can enter for delivery tone.`
      : `- **BEST VOICES RECOMMENDATION (REQUIRED OUTSIDE / AFTER THE VOICEOVER SCRIPT)**:
  * Immediately AFTER (and completely OUTSIDE) the copy-and-paste voiceover block(s), add a short **BEST ELEVENLABS VOICES FOR THIS VIDEO** section recommending the **top 2–3 ElevenLabs voice profiles/presets** tailored to this video's tone (${toneHint}) — e.g. authoritative documentary baritone (like Adam/Antoni-style voices), crisp modern storyteller (Brian/Rachel-style voices), or high-energy creator cadence — plus brief **Stability / Similarity / Style** slider tips for clean pacing.`;

  const parityRule = hasCustomScript
    ? '- Keep every spoken word identical to the supplied script, `voiceover.text`, each scene `narration`/`say`, and on-screen captions so audio, subtitles, and character acting match 100%.'
    : '- **STRICT VOICEOVER <-> CAPTION <-> SCENE LOCK**: Every word in the voiceover batch block(s) MUST match each scene\'s `narration`/`say` AND on-screen captions word-for-word in exact order — the narrator must NEVER say A while the caption shows B or characters act C.';

  return `FINAL VOICEOVER STEP FOR ${platLabel.toUpperCase()} (REQUIRED ${sceneDoneNote}):
${mobileBatchRule}
${platformRules}
${parityRule}
${voiceRecRules}`;
}

export const GEN_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sceneCode: {
      type: 'STRING',
      description: 'Valid JavaScript code for Animato Stickman Studio starting with movie({...}) — no markdown fences.',
    },
    voiceoverScript: {
      type: 'STRING',
      description: 'Plain spoken narration text formatted as one clean paragraph per scene separated by blank lines matching voiceover.text, scene narration, and captions word-for-word (no code or stage directions).',
    },
  },
  required: ['sceneCode', 'voiceoverScript'],
};

/**
 * Concise, non-contradictory technical system instruction for API calls (no "Phase 1 / Wait for GO" chat rules).
 */
export function buildApiSystemInstruction({ characterStyle = 'original', voPlatform = 'elevenlabs', customCharacterName = '' } = {}) {
  const isStick = characterStyle === 'stickman';
  const isCustom = characterStyle === 'custom';
  const isBuilder = characterStyle === 'builder';
  const safeCustomName = String(customCharacterName || 'Hero').trim() || 'Hero';
  const platKey = normalizeVoiceoverPlatform(voPlatform);
  const platLabel = VOICEOVER_PLATFORMS[platKey];

  const charRule = STYLE_API_RULE[characterStyle]
    ? STYLE_API_RULE[characterStyle]
    : isBuilder
    ? `Use movie({title:'...', aspect:'16:9', character:'custom'}). Auto-generated unique geometric character ${JSON.stringify(safeCustomName)} is active; define 3-view customCharacter(${JSON.stringify(safeCustomName)}, {size, rig, head, headSide, headBack, mouthOpen, mouthOpenSide, eyesClosed, eyesClosedSide, torso, torsoSide, torsoBack, upperArm, foreArm, upperLeg, lowerLeg, lowerLegSide}) + secondary cast in matching geometric shape DNA and render via {custom:${JSON.stringify(safeCustomName)}, x, ground, scale, view:'front'|'side'|'back', animate:t=>{...}}.`
    : isCustom
      ? "Use movie({title:'...', aspect:'16:9', character:'custom'}) and define 3-view customCharacter('Name', {size, rig, head, headSide, headBack, mouthOpen, eyesClosed, torso, torsoSide, torsoBack, upperArm, foreArm, upperLeg, lowerLeg, lowerLegSide}) matching the reference image, rendering characters via {custom:'Name', x, ground, scale, view:'front'|'side'|'back', animate:t=>{...}}."
      : isStick
        ? "Use movie({title:'...', aspect:'16:9', character:'stickman'}). Redesign every lead character with a distinct copyright-safe wardrobe/palette/eyewear/silhouette (never default clone). Fields: gender('male'|'female'), hair, hairc, top, topc, bottom, bottomc, shoe, shoec, headwear, eyewear, expression, smile(-12..14), browMood(-10..10)."
        : "Use movie({title:'...', aspect:'16:9'}). Redesign every lead character with a distinct copyright-safe palette/outfit/hair/expression. Fields: gender('male'|'female'), hair('short'|'spiky'|'curly'|'long'|'ponytail'|'bun'|'bob'|'bald'), hairc, glasses('none'|'round'|'rect'|'shades'), brow, mouth, outfit, outfitc, skin.";

  const voRule = `VOICEOVER (${platLabel.toUpperCase()}): Include voiceover({text:'FULL NARRATION', mode:'own'}) once near the top. Format voiceoverScript into one clean spoken paragraph per scene separated by blank lines tuned for ${platLabel}${platKey === 'aistudio' ? ' Playground voice generation' : ''}, locking narration, captions, and visuals 100% word-for-word.`;

  return `You are an elite Studio Creative Council (Movie Director, Executive Producer, Stage Artist, Lead Animator, Viral Strategist) for Animato Stickman Studio. Push beyond ordinary limits to craft breathtaking, theatrical, marvel-worthy animated cinema—output clean executable JS immediately, ZERO chatter, ZERO placeholders.

VIRAL 10X & STRATEGIC VISUAL STORYTELLING & NARRATION BLENDING:
- First benchmark what goes viral in this niche, then elevate story tension, metaphors, plot twists, and visual spectacle 10x higher so viewers stay hooked start to finish.
- Eye-to-ear lock: every spoken sentence dictates exact real-world stage, weather, lighting, readable signs/logos, and character emotion. Captions MUST match spoken words verbatim.
- Studio craft in EVERY scene: 3-plane custom SVG world + visible light source (glow/cone) + custom reusable SVG illustration helpers + 3-5+ illustrated props/graphics (icon, item, chartLine, bars, counter, year, headline, titleCard, bubble, flyMany, stackUp, rocketLaunch) + 3+ ambient motions (clouds, twinkles, dust, rain, clock hands, flickering screens).
- Retention cadence: 3s shock cold open, pattern interrupt every 8-12s (black chapter cards, crash push-in, whip pan, graphic insert), continuous camera choreography, and seamless loop ending echoing Frame 1.

ENGINE SYNTAX (1600x900 16:9, ground 720-850):
- Top: movie({title:'...', aspect:'16:9'...}); voiceover({...}); thumbnail({aspect:'16:9', background:'...', camera:{zoom:1.1,x:800,y:450}, props:[...], characters:[...]});
- Scene/Beat: scene({ name:'...', duration:5.4, narration:'...', background:LOC.street(), camera:t=>cam(...), props:[...], characters:[...], captions:[{from:0.2, to:5.0, text:'...'}] }); OR beat({n:'...', d:5.4, s:'street', m:'rain', c:'pushFace', a:[['HERO','walkR:front@0->speak@2.2->point:side@4.0',[320,640],[780,820]]], p:[['item','chip','H100',1150,540,1.1,0.4]], say:'...'});
- 3-VIEW STAGING: Direct front (dialogue/close-ups), side (walking/profile acting/sitting/confrontations), and back (silhouettes/foreground observers) cleanly—characters never remain stuck in one view.
- ${charRule}
- ${voRule}
- Scenery & Props: BLACK, LOC.*, sky, skyline, flooring, room, windowPane, doorway, bookshelf, deskSvg, signboard, glow, cone, pendant, LOGO.*, brandSign, icon, item, flyMany, slide, rocketLaunch, counter, year, chartLine, bars, titleCard, headline, labelTag, bubble, bullets, typewriter, clouds, twinkles, dust, rain, flashes, crowd.
- Acting: walk(t,t0,t1,x0,y0,x1,y1,view,style), speak(t,amt), react(t,kind), gesture(t,kind,t0,t1), act(t,'slam',t0,t1) (a body action with wind-up, strike and settle built in; kinds: ${ACTION_NAMES.join(', ')}), arms, leftArm, rightArm, leftLeg, rightLeg, head, move, lean, squash, chair, kneeBend, face, tween, sin, cos, abs, min, max, clamp, ease.

ZERO-ERROR JAVASCRIPT SAFETY:
- Straight ASCII quotes only (never curly quotes). Always escape apostrophes inside single-quoted strings (\`didn\\'t\`) or use double quotes.
- Full runtime lock: match ~2.65 spoken words/sec (~4,800 words for 30 min) with ZERO truncated blocks; summed durations MUST reach 100% of target length (never stop at 25-26 min).`;
}

/**
 * Determine whether a target video duration (9 to 30 minutes) should be broken into
 * 3 compact high-craft batches using the beat({...}) engine so AI code blocks never truncate
 * or overflow to plain text even for full 30-minute (1800s) documentaries.
 */
export function getPromptBatchPlan(durationLabel = '60 seconds') {
  const totalSec = parseDurationSeconds(durationLabel);
  const minutes = Math.round((totalSec / 60) * 10) / 10;
  const isBatched = totalSec >= 540; // 9 minutes (540s) up to 30 minutes (1800s)
  if (!isBatched) {
    return {
      isBatched: false,
      totalBatches: 1,
      totalSec,
      minutes,
      secondsPerBatch: totalSec,
      scenesPerBatchHint: Math.max(4, Math.round(totalSec / 5.5)),
    };
  }
  // Small batches: about 150 s each (a 10-minute film = 4 batches, 30 minutes = 12), so every batch fits easily in one chat reply, also for models that cannot make files.
  const totalBatches = Math.max(4, Math.ceil(totalSec / 150));
  const secondsPerBatch = Math.round(totalSec / totalBatches);
  const scenesPerBatchHint = Math.max(12, Math.round(secondsPerBatch / 5.8));
  return {
    isBatched: true,
    totalBatches,
    totalSec,
    minutes,
    secondsPerBatch,
    scenesPerBatchHint,
  };
}

/**
 * Build the 3-Batch Compact Documentary Protocol for 9-to-30-minute videos.
 * Uses Animato's native `beat({...})` + Batch-1 `SETS`/`CAST`/`SVGS` library so 3 batches
 * deliver 30 full minutes (~1800s) of richly illustrated scenes inside safe code-block token limits.
 */
export function summarizeCustomCharacter(saved) {
  if (!saved || typeof saved !== 'object' || !saved.views || typeof saved.views !== 'object') {
    return { hasCharacter: false, name: '', layerCount: 0, viewCount: 0 };
  }
  let layerCount = 0;
  let viewCount = 0;
  for (const viewKey of ['front', 'back', 'side']) {
    const viewMap = saved.views[viewKey];
    if (!viewMap || typeof viewMap !== 'object') continue;
    let viewLayers = 0;
    for (const id of Object.keys(viewMap)) {
      if (Array.isArray(viewMap[id]) && viewMap[id].length > 0) viewLayers++;
    }
    if (viewLayers > 0) {
      viewCount++;
      layerCount += viewLayers;
    }
  }
  return {
    hasCharacter: layerCount > 0,
    name: String(saved.name || 'My character').trim() || 'My character',
    layerCount,
    viewCount,
  };
}

export function buildBatchPromptProtocol({
  durationLabel = '10 minutes',
  voPlatform = 'elevenlabs',
  tone = '',
  custom = false,
  builder = false,
  customCharacterName = '',
  stick = false,
  style = '',
} = {}) {
  const plan = getPromptBatchPlan(durationLabel);
  if (!plan.isBatched) return '';
  const N = plan.totalBatches;

  const useCustomSyntax = custom || builder;
  const safeCustomName = String(customCharacterName || 'Hero').trim() || 'Hero';
  const charDecl = STYLE_API_RULE[style] ? `, character:'${style}'` : useCustomSyntax ? ", character:'custom'" : stick ? ", character:'stickman'" : '';
  const minBeatsPerBatch = Math.max(24, Math.round(plan.secondsPerBatch / 6.2));
  const maxBeatsPerBatch = Math.max(minBeatsPerBatch + 16, Math.round(plan.secondsPerBatch / 4.8));
  const targetWordsPerBatch = Math.round(plan.secondsPerBatch * 2.65);
  const voiceoverStep = buildVoiceoverDeliveryInstructions({
    platform: voPlatform,
    durationLabel,
    tone,
    totalSceneBatches: plan.totalBatches,
  });

  return `${creativeBlock({ ownCharacter: custom })}

BEYOND-LIMITS STUDIO CREATIVE COUNCIL & 10X VIRAL BENCHMARK:
- Think simultaneously as **Executive Producer, Movie Director, Stage Artist, Cinematographer, Lead Animator, and Viral Retention Strategist** — push far beyond ordinary limits so viewers marvel at every single frame and story turn.
- First mentally audit what has gone **viral** in this exact topic/niche (hooks, pacing spikes, visual metaphors, emotional reversals, shock statistics), then engineer a story & theatrical staging that is **10x sharper, deeper, and more visually gripping** than those viral benchmarks.

${N}-BATCH COMPACT DOCUMENTARY STRATEGY (${plan.minutes} MINUTES = ${plan.totalSec} SECONDS -> EXACTLY ${N} SMALL, SAFE BATCHES):
To guarantee your full ${plan.minutes}-minute video stays 100% INSIDE downloadable code blocks WITHOUT hitting LLM output limits or dropping quality, Animato's **Compact Documentary Engine (\`beat({...})\`)** compiles every call into a FULL cinematic Animato \`scene({...})\` (layered 3-plane custom backdrop + visible lighting + 3 auto-ambient motions + timed multi-phase acting & lip-sync + custom SVG illustrations + karaoke captions + optional raw \`scene\` objects), at ~4x fewer code tokens than writing raw \`scene({...})\` boilerplate!

EQUAL-OR-BETTER QUALITY MANDATE (ZERO QUALITY LOSS VS 12-BATCH):
- **EVERYTHING THE ENGINE CAN DO WORKS IN \`beat({...})\`**: Never settle for empty walls or stiff poses. You have 100% access to layered \`SETS.*\` with light beams (\`SCN.glow\`, \`SCN.cone\`, \`SCN.pendant\`), custom vector \`SVGS.*\`, \`CAST.*\`, timed multi-phase acting across camera-facing views (\`front\`, \`back\`), depth walks (\`[x0,x1], [y0,y1]\`), foreground \`view:'back'\` silhouettes, black handwritten \`chapter:true\` cards, pulsing spotlights, camera flashes, ticking clocks, sliding vehicles/doors, surveillance \`fx:'rec'\`, newspaper collages, AND raw \`{svg:..., animate:t=>...}\` props or \`{look:..., talk:..., animate:t=>...}\` character objects whenever a hero shot demands custom kinematics!
- **CAMERA-FACING CHOREOGRAPHY**: People always face the camera (never a side view): when someone walks or runs, they face the camera while the camera pans with them (c:'panR' / 'panL' / 'cover'); someone watching from the foreground is view:'back'. Use \`view:'front'\` for walking, running, talking and reactions, and \`view:'back'\` only for foreground observers. Never write \`view:'side'\`.
- **UNIQUE ANTI-COPYRIGHT CHARACTER IDENTITY**: Even for Stickman or Original presets, never produce generic clone silhouettes — give the cast cohesive signature colours, outfits, accessories, and geometric accents tailored uniquely to this creator's video!
- **VIRAL RETENTION & STORYTELLING GRAMMAR (ALL ${N} BATCHES)**:
  * **3-Second Cold Open**: Beat 1 (\`d<=4\`) drops straight into shock/crisis with motion on Frame 1 and a bold 4–9 word hook. End the VERY LAST beat of Batch ${N} on a visual + spoken echo of Beat 1 for seamless loop replay.
  * **Pattern Interrupt Every 8–12s**: Alternate \`c:'pushFace'|'crash'|'whipR'|'wide'\`, \`cut:true\`, black \`chapter:true\` cards, \`flash:1.2\`, giant counters/charts, and pure-graphic beats (~1 in every 4–5 beats).
  * **Living 2.5D Acting**: Never frozen talking heads! Leave mouths closed unless a character actually speaks in-story; trigger timed actions right on the spoken verbs, add background/foreground reaction actors (\`crowd\` + overlapping \`view:'back'\` reporters/observers with \`par:-0.25\`).

MANDATORY ${N}-BATCH DURATION & ANTI-UNDER-RUN LOCK (NEVER FINISH A 30-MINUTE FILM AT 25–26 MINUTES!):
- Total runtime MUST hit **100% OF ${plan.totalSec} SECONDS (${plan.minutes} minutes — exact full target)** split evenly across **${N} batches (~${plan.secondsPerBatch}s = about ${Math.round(plan.secondsPerBatch / 6) / 10} minutes per batch)**:
  * **Batch 1 of ${N}**: Act 1 (Setup + World/Prop Library + Thumbnail + Opening **~${plan.secondsPerBatch}s exact**)
  * **Batches 2 to ${N - 1} of ${N}**: Act 2 (Escalation, Conflict & Turning Point, the story growing batch by batch, **~${plan.secondsPerBatch}s exact each**)
  * **Batch ${N} of ${N}**: Act 3 (Climax, Payoff & Loop Ending **~${plan.secondsPerBatch}s exact**)
- Write **${minBeatsPerBatch} to ${maxBeatsPerBatch} complete compact \`beat({...});\` calls per batch**, averaging **5.0s to 6.2s each** (paired with **~${targetWordsPerBatch} spoken words per batch** at ~2.65 words/sec). Before outputting ANY batch, mentally sum every numeric \`d\` value in that batch and add beats until \`SUM(d) >= ${plan.secondsPerBatch}\` so all ${N} batches together total the FULL **${plan.totalSec} SECONDS** (never stop early at 85% / ~26 minutes!).
- Keep EVERY \`beat({...});\` call crisp (1 to 3 lines, ~200 chars) using your Batch-1 reusable \`SETS\`, \`CAST\`, \`SVGS\` libraries — keeping each batch comfortably **under ~28 KB (~6,500 tokens)** with full cinematic density through Batch ${N}!
- End every batch with a verified tally comment: \`// Batch K subtotal: XX beats, SUM(d)=${plan.secondsPerBatch}s\`

COMPACT \`beat({...})\` FULL-POWER REFERENCE:
- Define reusable art/sets/cast ONCE at top of Batch 1 directly on \`SETS\`, \`CAST\`, \`SVGS\` (NO \`const\`/\`let\` needed so Batches 1–3 share cleanly):
  * \`CAST.hero = {${STYLE_CAST_EXAMPLE[style] ? STYLE_CAST_EXAMPLE[style] : useCustomSyntax ? `custom:${JSON.stringify(builder ? safeCustomName : 'Hero')}, ground:800, scale:0.6` : stick ? "gender:'male', hair:'tousled', hairc:'#1e293b', top:'jacket', topc:'#2563eb', bottom:'jeans', bottomc:'#111827', shoe:'sneakers', eyewear:'none', expression:'cool'" : "gender:'male', hair:'short', hairc:'#1e293b', outfit:'suit', outfitc:'#2563eb', skin:'#e8b896'"}};\`
  * \`SVGS.vaultDoor = '<circle cx="0" cy="0" r="95" fill="#94a3b8" stroke="#1e293b" stroke-width="8"/>...';\` (brand marks, machines, documents, vehicles, landmarks!)
  * \`SETS.hq = () => LOC.office() + SCN.pendant(800, 0, 220, {op:0.28}) + SCN.signboard('APEX HQ', 800, 120, 380, 62, {bg:'#0f172a', color:'#ffd54a'});\`
- Full-craft beat examples:
  \`beat({n:'Cold Open', d:5.8, s:'hq', m:'tense', c:'crash', flash:1.6, topNote:'$430M AT RISK', a:[['hero','walkR:side@0->speak:front@2.2->point:side@4.2',[320,640],[780,820],{brow:'angry',mouth:'open'}],['rival','react:shock',1080],['crowd',4,'cam:0.6|shock',860,{view:'back',scale:0.6,par:-0.25}]], p:[['svg','vaultDoor',1140,480,0.9,0.5,'float',{layer:'back'}],['headline','30 DAYS LEFT','BREAKING',0.4],['counter',1000000,0,'$','',800,150,1.2,4.8,'#ff6b6b'],['bubble','WE ARE OUT OF CASH',640,290,'say',2.2,5.5]], say:'When he stepped inside headquarters, the company had just thirty days of cash left.'});\`
  \`beat({n:'The Turn', chapter:true, d:3.2, say:'But nobody checked the encrypted drive.'});\`
- \`beat\` fields:
  * \`n\`: short scene name · \`d\`: duration \`words/2.65 + 0.55s\` · \`say\`: exact narration (auto-generates word-by-word karaoke \`captions\`; or pass \`cap:[...]\`, \`topNote:'$430B'\`, \`chapter:true\` for black handwritten center card!).
  * \`s\`: \`SETS\` key, \`LOC\` key (\`'apartment'|'garage'|'office'|'bank'|'street'|'cityDay'|'rooftop'|'space'|'lab'|'stage:TITLE'|'BLACK'\`), or raw SVG string.
  * \`light\`: where the set's light is: \`light:{x:520,y:140,color:'#ffd9a0'}\` (the lamp, window, sun or screen you drew; x 0-1600, y 0-900). The app lights every character from it: a lit side facing it, a shaded side, a soft floor shadow away from it, tinted by the mood. Also \`'left'|'right'|'top'|'front'|'back'\` or a colour. Set it on every beat and change it when the place or time changes.
  * \`m\`: mood tint + **3 auto-ambient motions** (\`'warm'|'tense'|'cold'|'night'|'rain'|'hype'|'city'|'space'|'storm'|'dark'|'calm'\`). Wait: set \`ambient:false\` only for silent held beats.
  * \`c\`: camera (\`'wide'|'push'|'pushSlow'|'pushFace'|'crash'|'pull'|'zoomOut'|'panR'|'panL'|'dollyR'|'dollyL'|'whipR'|'whipL'|'drama'|'shake'|'heroUp'|'hold'|'cover'\` ('cover' = editor-style cuts between wide, medium and close-up every ~2 s; it is also what a beat with people gets when you leave c out), \`[z0,z1,x0,y0,x1,y1]\`, or \`t=>cam(...)\`). Vary framing every scene!
  * \`flash\`: \`t0\` number (e.g. \`1.4\`), \`true\`, or \`t=>0..1\`. \`cut:true\` for crisp hard cuts.
  * \`a\`: cast list — supports \`walkR/L\`, \`runR/L\`, \`sneak\`, \`tired\`, \`speak\` (auto-syncs timed lip-sync \`talk\` window!), \`shoot\`, \`throw\`, \`collapse\`, the body actions ${ACTION_NAMES.map((n) => '`' + n + '`').join(', ')} (wind-up, strike and settle are built in), \`sit\` (or \`sit:floor\`), \`lie\`, \`bow\`, \`jump\`, \`dance\`, \`kick\`, \`squat\`, \`rubhands\`, \`react:<kind>\`, \`gesture:<kind>\` chained with \`->\` & optional \`@sec\` & \`:endView\`, depth walks \`[x0,x1],[y0,y1]\`, \`{brow,mouth,face,par,show,scale,view,flip}\` (\`brow\`/\`mouth\` = the resting face; \`face:'worried@0->shocked@1.8->angry@3.4'\` = the feelings that move across the face over the beat, see FACIAL ACTING), \`['crowd',n,'cam:0.6|shock',y,opts]\`, AND full raw Animato character objects!
  * \`p\`: 3–5+ rich visual props/illustrations/graphics per beat — compact tuples: \`['svg','KEY',x,y,scale,t0,'float|pulse|slideR|slideL|spin',{t1,layer,par}]\`, \`['brand','LOGO_KEY',x,y,w,h,bg,t0]\`, \`['item','iconName','LABEL',x,y,scale,t0,t1]\`, \`['card','TEXT',x,y,size,col,t0,t1]\`, \`['headline','TEXT','TAG',t0,t1]\`, \`['tag','LOC · YEAR',x,y,t0,t1]\`, \`['counter',a,b,'$','',x,y,t0,t1,col]\`, \`['year',1999,2026,x,y,t0,t1]\`, \`['chart',[...],x,y,w,h,'LABEL',t0,t1]\`, \`['bars',[...],['L1','L2'],x,y,t0]\`, \`['bubble','TEXT',x,y,'say|think',t0,t1]\`, \`['bullets',[...],x,y,t0]\`, \`['fly','bill',8,x0,y0,x1,y1,t0]\`, \`['stack','coin',6,x,y,t0]\`, \`['slide','KEY',x0,y0,x1,y1,t0,t1]\`, \`['clock',x,y,scale,speed,t0,t1]\`, \`['typewriter','TEXT',x,y,size,t0,speed,col]\`, \`['spot',x,y,r,col,t0,t1]\`, \`['dim',op,t0,t1]\`, \`['puffs',x,y,t0,t1]\`, \`['collage',['H1','H2','H3'],x,y,t0]\`, \`['rocket','LABEL',x,t0,t1]\`, raw \`{svg,animate}\` props, AND \`fx:'confetti'|'flashes'|'speed'|'rec'|'dim'|'spot'\`! Short-film tools: \`['timer','STUDIED',0,14400,680,90,t0,t1,'#ffd54a']\` (HUD clock counting up or down, repeat it each beat), \`['note','RULE #1','TEXT',x,y,t0,t1]\` (sticky-note rule or punchline), \`['phone','3:12',['alert one','alert two'],x,y,t0,t1]\` (phone screen with notifications), \`['choice','OPTION A','OPTION B',t0,t1]\` (A/B decision cards).

MANDATORY ORDER INDICATOR & ZERO-SYNTAX-ERROR CONTRACT (EVERY BATCH):
- Line 1 of every downloadable batch TXT file MUST be a plain JS comment (NO \`\`\` fences or chat text inside the \`.txt\` file):
  Batch 1:  // === ANIMATO BATCH 1 OF ${N} ===
  Batch 2:  // === ANIMATO BATCH 2 OF ${N} ===
  ... and so on, up to  // === ANIMATO BATCH ${N} OF ${N} ===
  EVERY batch, including the last one, is ONLY code inside its own code block: never write the last batch (or any batch) as plain chat text.
- ZERO SYNTAX ERRORS:
  * Straight ASCII quotes ONLY (\`'\`, \`"\`, \`\`\`) — NEVER curly quotes. Inside single-quoted strings, ALWAYS escape apostrophes (\`'didn\\'t'\`) or wrap text containing apostrophes in double quotes (\`"didn't"\`).
  * Assign shared libraries directly on \`SETS.x = ...\`, \`CAST.x = ...\`, \`SVGS.x = ...\` (or top-level \`var\`) in Batch 1 BEFORE the first \`beat()\`, and reuse/extend them across Batches 1–${N}!
  * Balanced \`{}\`, \`[]\`, \`()\`, numeric \`d\`, NO \`// ...\` shortcuts, and DO NOT repeat \`movie()\`, \`voiceover()\`, or \`thumbnail()\` in Batches 2 to ${N}.

HOW TO STRUCTURE THE ${N} BATCHES:
1) BATCH 1 OF ${N} (~${plan.secondsPerBatch}s exact):
   - Line 1: \`// === ANIMATO BATCH 1 OF ${N} ===\`
   - \`movie({title:'...', aspect:'16:9'${charDecl}});\`
   - \`voiceover({text:'...', mode:'own'});\` (Animato combines all batches' spoken lines automatically).
   - Shared \`SVGS.*\`, \`CAST.*\`${useCustomSyntax ? `, 3-view \`customCharacter(...)\` factory (${builder ? 'matching the auto-generated geometric character DNA' : 'matching reference art'}),` : ''} and rich 3-plane \`SETS.*\` builders + \`thumbnail({aspect:'16:9', ...});\`
   - **${minBeatsPerBatch}–${maxBeatsPerBatch} compact \`beat({...});\` calls summing to >=${plan.secondsPerBatch}s (~${targetWordsPerBatch} spoken words)** opening with a 3-second shock cold open.
2) BATCH 2 OF ${N} TO BATCH ${N} OF ${N} (~${plan.secondsPerBatch}s exact EACH):
   - Line 1: \`// === ANIMATO BATCH K OF ${N} ===\` (K = 2, 3 ... ${N})
   - Seamless story + visual continuity + **${minBeatsPerBatch}–${maxBeatsPerBatch} compact \`beat({...});\` calls summing to >=${plan.secondsPerBatch}s (~${targetWordsPerBatch} spoken words)** each, keeping FULL illustration density, pattern interrupts every 8–12s, midpoint turn (~60–70%), and loop ending!

INTERACTIVE DELIVERY RULE (${N} BATCHES TOTAL):
- ${custom ? `FIRST STEP — ASK FOR THE REFERENCE IMAGE: Do NOT generate Batch 1 yet! Right now, ask me to upload/attach my **reference character image** (plus any quick outfit/cast notes). Once I reply with my image, output **Batch 1 of ${N}** as downloadable \`scene-batch-1-of-${N}.txt\` starting with \`// === ANIMATO BATCH 1 OF ${N} ===\`.` : `Right now, output ONLY **Batch 1 of ${N}** as a downloadable TXT file (\`scene-batch-1-of-${N}.txt\`) containing ONLY pure executable JavaScript starting with \`// === ANIMATO BATCH 1 OF 3 ===\`. Stay comfortably inside ONE code block!`}
- Do NOT stop and do NOT wait for me to say NEXT while there is room. As soon as Batch 1 is written, write Batch 2, then Batch 3 and so on, one after the other. Each batch is its own separate code block (or its own file), with a one-line label above it ("Batch 1 of 3", "Batch 2 of 3"...).
- ROOM RULE (a batch cut off halfway breaks the whole film): never START a batch unless you are sure the WHOLE batch fits in what is left of this reply. If you have already written about 3 batches, or this reply is already long, finish the batch you are on, then end the reply with exactly this one line: \`Batch K of ${plan.totalBatches} done. Say NEXT.\` A finished batch followed by a pause is fine; a cut-off batch is not. When I say NEXT (or "continue"), write only the next batch.
- ${boxRule({ batchWord: 'batch' })}
- KEEP EVERY BATCH THE SAME SIZE: Batch ${plan.totalBatches} must be no longer than Batch 1. Stop as soon as the running SUM(d) reaches the target. No epilogue, no summary, no extra beats after the tally comment.
- If your own length limit cuts you off anyway, I will say "continue": start a NEW code block with the same batch line (\`// === ANIMATO BATCH K OF ${plan.totalBatches} ===\`), then carry on from the very next whole beat. Never repeat a beat and never restart the batch.
- NEVER put the voiceover script, voice recommendations or any other text in the same reply as a scene batch. They come in their own reply (see the final voiceover step).
- Keep going until all ${plan.totalBatches} batches (**${plan.totalSec}s total = ${plan.minutes} full minutes**) are complete (Animato auto-orders the numbered batch files and also still supports legacy 12-batch files uploaded together, even out of order).
- Keep going until all ${N} batches (**${plan.totalSec}s total = ${plan.minutes} full minutes**) are complete (Animato auto-orders the numbered batch files and also still supports legacy 12-batch files uploaded together, even out of order).

${voiceoverStep}`;
}

function canCompileJs(code) {
  try {
    new Function('movie', 'scene', 'voiceover', 'thumbnail', 'ENV_', 'with(ENV_){\n' + String(code || '') + '\n}');
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract a balanced `fnName(...)` call starting at `callStartIndex` (where `fnName(` begins),
 * properly skipping strings, template literals, line comments (`//`), and block comments (`/* *\/`).
 */
function extractBalancedCallAt(src, callStartIndex) {
  const openParen = src.indexOf('(', callStartIndex);
  if (openParen < 0) return null;
  let depth = 0;
  let inStr = '';
  let esc = false;
  let inLineComment = false;
  let inBlockComment = false;
  let end = -1;

  for (let i = openParen; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === inStr) {
        inStr = '';
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      continue;
    }
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        while (src[end] === ' ' || src[end] === '\t') end++;
        if (src[end] === ';') end++;
        break;
      }
    }
  }

  if (end <= callStartIndex) return null;
  return {
    text: src.slice(callStartIndex, end).trim(),
    start: callStartIndex,
    end,
  };
}

/**
 * Find the index of the first depth-0 `scene(` call outside strings and comments.
 */
function findFirstTopLevelSceneIndex(src) {
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let inStr = '';
  let esc = false;
  let inLineComment = false;
  let inBlockComment = false;
  let atStmtStart = true;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        atStmtStart = true;
      }
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === inStr) inStr = '';
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      atStmtStart = false;
      continue;
    }

    if (ch === '{') {
      braceDepth++;
      atStmtStart = true;
      continue;
    }
    if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      atStmtStart = true;
      continue;
    }
    if (ch === '(') {
      parenDepth++;
      atStmtStart = false;
      continue;
    }
    if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      atStmtStart = false;
      continue;
    }
    if (ch === '[') {
      bracketDepth++;
      atStmtStart = false;
      continue;
    }
    if (ch === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      atStmtStart = false;
      continue;
    }

    if (braceDepth === 0 && parenDepth === 0 && bracketDepth === 0 && atStmtStart && (ch === 's' || ch === 'b')) {
      if (/^(?:scene|beat)\s*\(/.test(src.slice(i))) {
        return i;
      }
    }

    if (ch === ';' || ch === '\n') atStmtStart = true;
    else if (!/\s/.test(ch)) atStmtStart = false;
  }

  return -1;
}

function stripLeadingAiProse(s) {
  const codeStartRe =
    /^\s*(?:\/\/|\/\*|movie\s*\(|voiceover\s*\(|thumbnail\s*\(|scene\s*\(|beat\s*\(|customCharacter\s*\(|packCharacter\s*\(|defineCharacter\s*\(|createCharacter\s*\(|(?:SETS|CAST|SVGS)\s*\.|(?:export\s+)?(?:const|let|var|function)\b|\{)/;
  if (codeStartRe.test(s)) return s;

  const lines = s.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (codeStartRe.test(line)) {
      return lines.slice(i).join('\n').trim();
    }
  }
  return s;
}

function looksLikeJsLine(line) {
  const t = String(line || '').trim();
  if (!t) return false;
  if (/^(?:[}\]);,]+|\/\/|\/\*|\*\/|\.\.\.)/.test(t)) return true;
  if (/^(?:scene|beat|movie|voiceover|thumbnail|customCharacter|packCharacter|defineCharacter|createCharacter|function|const|let|var|export|return|if|else|for|while|switch|try|catch)\b/.test(t)) {
    return true;
  }
  if (/^(?:[\w$]+(?:\.[\w$]+)*)\s*=\s*/.test(t) || /=>/.test(t)) return true;
  if (/^[A-Za-z_$][\w$]*\s*:\s*(?:['"`\[{/\d-]|true\b|false\b|null\b|LOC\.|BGP\.|BLACK\b|t\s*=>)/.test(t)) {
    return true;
  }
  if (/[{};,\]`]\s*(?:\/\/.*)?$/.test(t)) return true;
  if (/\)\s*[;,]?\s*(?:\/\/.*)?$/.test(t) && !/[.!?]\s*$/.test(t)) return true;
  return false;
}

function stripTrailingAiProse(s) {
  if (!s || canCompileJs(s)) return s;
  const lines = s.split(/\r?\n/);
  // Trim non-code trailing chat lines (e.g. "Download Batch 11...", "All 12 batches...") from bottom up
  // while stopping immediately upon reaching JS code so a single mid-file syntax error never causes
  // subsequent valid scenes to be chewed away.
  let end = lines.length;
  while (end > 0) {
    const tail = lines[end - 1].trim();
    if (!tail) {
      end--;
      continue;
    }
    if (looksLikeJsLine(tail)) break;
    end--;
    const candidate = lines.slice(0, end).join('\n').trim();
    if (candidate && canCompileJs(candidate)) {
      return candidate;
    }
  }
  const sliced = lines.slice(0, end).join('\n').trim();
  return sliced || s;
}

/**
 * A chat page can break its code box when the code is long: the rest of the code then arrives OUTSIDE any box, as plain text
 * (Google AI Studio does this). This puts the whole reply back together in order: the boxed code, plus every line outside a box
 * that is clearly our code (beat(...), SETS.x = ..., a batch header, and the lines that finish those statements).
 * Returns null when nothing outside the boxes looks like code (then the normal path is used).
 */
export function rescueUnfencedCode(raw) {
  let text = String(raw || '').replace(/\r\n?/g, '\n');
  const fenceRe = /^[ \t]*```[^\n]*$/gm;
  const marks = [...text.matchAll(fenceRe)];
  if (marks.length === 0) return null;
  const STRONG = /^\s*(?:(?:beat|scene|movie|thumbnail|voiceover|packCharacter|customCharacter|defineCharacter|storyboard)\s*\(|(?:SETS|CAST|SVGS)\s*\.\s*[A-Za-z_$][\w$]*\s*=|\/\/\s*=+\s*ANIMATO\b)/;
  const depthOf = (line, d) => {
    let q = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
      if (c === "'" || c === '"' || c === '`') q = c;
      else if (c === '/' && line[i + 1] === '/') break;
      else if (c === '{' || c === '[' || c === '(') d++;
      else if (c === '}' || c === ']' || c === ')') d--;
    }
    return d;
  };
  const JS_BLOCK = /\b(?:scene|beat|movie|voiceover|thumbnail|customCharacter|packCharacter|SETS|CAST|SVGS|const|let|var|function)\b/;
  const parts = [];
  let pos = 0;
  let open = false;
  let found = 0;
  const gap = (g) => {
    const out = [];
    let d = 0;
    for (const ln of g.split('\n')) {
      if (d > 0) { out.push(ln); d = Math.max(0, depthOf(ln, d)); continue; }
      if (STRONG.test(ln)) { out.push(ln.replace(/^\s*\*\*|\*\*\s*$/g, '')); found++; d = Math.max(0, depthOf(ln, 0)); }
    }
    return out.join('\n');
  };
  for (const m of marks) {
    const seg = text.slice(pos, m.index);
    parts.push(open ? (JS_BLOCK.test(seg) ? seg : '') : gap(seg));
    open = !open;
    pos = m.index + m[0].length;
  }
  const tail = text.slice(pos);
  parts.push(open ? (JS_BLOCK.test(tail) ? tail : '') : gap(tail));
  if (!found) return null;
  return parts.map((p) => p.replace(/^\n+|\n+$/g, '')).filter(Boolean).join('\n');
}

function cleanUploadedSnippet(raw) {
  let s = String(raw || '').replace(/^\uFEFF/, '').trim();
  {
    const rescued = s.includes('```') ? rescueUnfencedCode(s) : null;
    if (rescued) s = rescued;
  }
  if (s.startsWith('{') && s.endsWith('}')) {
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed.sceneCode === 'string') {
        s = parsed.sceneCode.trim();
      }
    } catch {}
  }

  // Extract fenced code blocks whenever ``` fences appear (preserving any leading // === ANIMATO BATCH ... === comment)
  const batchHeaderMatch = /^[ \t]*(\/\/[^\n]*ANIMATO[^\n]*BATCH[^\n]*)/i.exec(s);
  const allFences = [...s.matchAll(/```[a-z0-9_-]*\s*\n([\s\S]*?)\n?```/gi)];
  const startsAsJs =
    /^\s*(?:\/\/|\/\*|movie\s*\(|voiceover\s*\(|thumbnail\s*\(|scene\s*\(|customCharacter\s*\(|packCharacter\s*\(|defineCharacter\s*\(|createCharacter\s*\(|const\s+|let\s+|var\s+|function\s+)/.test(
      s
    );
  if (allFences.length > 0 && (!startsAsJs || s.includes('```'))) {
    const jsBlocks = allFences
      .map((m) => m[1].trim())
      .filter((blk) =>
        /\b(?:scene|beat|movie|voiceover|thumbnail|customCharacter|packCharacter|const|let|var|function)\b/.test(blk)
      );
    if (jsBlocks.length > 0) {
      const joined = jsBlocks.join('\n\n');
      s = batchHeaderMatch && !/ANIMATO[^\n]*BATCH/i.test(joined.slice(0, 400))
        ? `${batchHeaderMatch[1].trim()}\n${joined}`
        : joined;
    } else if (!startsAsJs) {
      s = allFences[0][1].trim();
    }
  }

  s = s
    .replace(/^\s*```[a-z0-9_-]*\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .replace(/^\s*(?:<>\s*)?(?:javascript|js|txt|text|plaintext)\s*\n/i, '')
    .trim();

  if (/\b(?:scene|beat|movie|voiceover|thumbnail|customCharacter|packCharacter)\s*\(/.test(s)) {
    s = stripLeadingAiProse(s);
    s = s.replace(/^\s*(?:<>\s*)?(?:javascript|js|txt|text|plaintext)\s*\n/i, '').trim();
    s = stripTrailingAiProse(s);
  }

  return s.trim();
}

/**
 * Extract top-level balanced calls matching `fnName(...)` (outside strings and comments)
 * and return both the call strings and the code with those top-level calls removed.
 */
function extractCalls(code, fnName) {
  let s = String(code || '');
  const found = [];
  const fnRe = new RegExp(`^${fnName}\\s*\\(`);

  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let inStr = '';
  let esc = false;
  let inLineComment = false;
  let inBlockComment = false;
  let atStmtStart = true;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        atStmtStart = true;
      }
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === inStr) inStr = '';
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      atStmtStart = false;
      continue;
    }

    if (braceDepth === 0 && parenDepth === 0 && bracketDepth === 0 && atStmtStart && ch === fnName[0]) {
      if (fnRe.test(s.slice(i))) {
        const call = extractBalancedCallAt(s, i);
        if (call) {
          found.push(call.text);
          s = s.slice(0, call.start) + s.slice(call.end);
          i = call.start - 1;
          atStmtStart = true;
          continue;
        }
      }
    }

    if (ch === '{') {
      braceDepth++;
      atStmtStart = true;
    } else if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      atStmtStart = true;
    } else if (ch === '(') {
      parenDepth++;
      atStmtStart = false;
    } else if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      atStmtStart = false;
    } else if (ch === '[') {
      bracketDepth++;
      atStmtStart = false;
    } else if (ch === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      atStmtStart = false;
    } else if (ch === ';' || ch === '\n') {
      atStmtStart = true;
    } else if (!/\s/.test(ch)) {
      atStmtStart = false;
    }
  }

  return { calls: found, stripped: s.trim() };
}

/**
 * Remove top-level balanced calls to `fnName(...)` and return the stripped code.
 */
export function stripBalancedCalls(code, fnName) {
  return extractCalls(code, fnName).stripped;
}

/**
 * Parse a file's batch indicator (in-code marker first, then filename) and classify whether
 * it holds scene code or a companion plain-text voiceover script.
 */
export function parseBatchIndicator(content, filename = '') {
  const raw = String(content || '').trim();
  const cleanName = String(filename || '').trim();
  const cleanedCode = cleanUploadedSnippet(raw);

  const hasSceneCode =
    /\b(?:scene|beat)\s*\(/.test(cleanedCode) ||
    /\bmovie\s*\(/.test(cleanedCode) ||
    /\bthumbnail\s*\(/.test(cleanedCode) ||
    /\b(?:customCharacter|packCharacter)\s*\(/.test(cleanedCode);

  if (
    !hasSceneCode &&
    raw.length > 0 &&
    (/voiceover|narration|script|elevenlabs|aistudio|playground/i.test(cleanName) || !/[{};]/.test(cleanedCode))
  ) {
    let voBatch = null;
    let voTotal = null;
    const voHead = raw.slice(0, 1200);
    const voPatterns = [
      /(?:VOICEOVER(?:\s+(?:SCRIPT|TEXT))?|PART|BATCH)\s*#?\s*(\d+)\s*(?:OF|\/)\s*(\d+)/i,
      /(?:VOICEOVER|BATCH|PART)\s*#?\s*(\d+)\b/i,
    ];
    for (const re of voPatterns) {
      const m = re.exec(voHead);
      if (m) {
        const b = parseInt(m[1], 10);
        const t = m[2] ? parseInt(m[2], 10) : null;
        if (Number.isFinite(b) && b >= 1 && b <= 99) {
          voBatch = b;
          if (Number.isFinite(t) && t >= b && t <= 99) voTotal = t;
          break;
        }
      }
    }
    if (voBatch === null && cleanName) {
      const mFn = /(?:batch|part|vo|voiceover|chapter|chunk)[_\s-]*(\d+)(?:\s*(?:of|_|-)\s*(\d+))?/i.exec(cleanName);
      if (mFn) {
        const b = parseInt(mFn[1], 10);
        const t = mFn[2] ? parseInt(mFn[2], 10) : null;
        if (Number.isFinite(b) && b >= 1 && b <= 99) {
          voBatch = b;
          if (Number.isFinite(t) && t >= b && t <= 99) voTotal = t;
        }
      }
    }
    const strippedVo = raw
      .replace(/^[ \t]*(?:\/\/\s*)?(?:={2,}|-{3,})?\s*(?:END\s+)?VOICEOVER(?:\s+(?:SCRIPT|TEXT))?\s+(?:BATCH|PART)\s+\d+(?:\s*(?:OF|\/)\s*\d+)?[^\n]*\n*/gim, '')
      .replace(/\n[ \t]*(?:\*\*|#{1,3}|={2,})?\s*BEST\s+(?:ELEVENLABS|GOOGLE\s+AI\s+STUDIO[^\n]*)\s+VOICES\s+FOR\s+THIS\s+VIDEO[\s\S]*$/i, '')
      .trim();
    return {
      kind: 'voiceover',
      batchNumber: voBatch,
      totalBatches: voTotal,
      cleanedCode: strippedVo || raw,
    };
  }

  let batchNumber = null;
  let totalBatches = null;
  const headerSlice = cleanedCode.slice(0, 2000);
  const rawHeaderSlice = raw.slice(0, 2000);

  const patterns = [
    /ANIMATO[_\s-]*BATCH\s*[:#-]?\s*(\d+)\s*(?:OF|\/)\s*(\d+)/i,
    /ANIMATO[_\s-]*BATCH\s*[:#-]?\s*(\d+)\b/i,
    /(?:\/\/|\/\*)\s*=*\s*(?:ANIMATO\s+)?(?:BATCH|PART|CHAPTER)\s*#?\s*(\d+)\s*(?:OF|\/)\s*(\d+)/i,
    /(?:\/\/|\/\*)\s*=*\s*(?:ANIMATO\s+)?(?:BATCH|PART|CHAPTER)\s*#?\s*(\d+)\b/i,
    /\bbatch\s*\(\s*\{\s*(?:index|number|batch)\s*:\s*(\d+)(?:\s*,\s*total\s*:\s*(\d+))?/i,
  ];

  for (const re of patterns) {
    const m = re.exec(headerSlice) || re.exec(cleanedCode) || re.exec(rawHeaderSlice);
    if (m) {
      const b = parseInt(m[1], 10);
      const t = m[2] ? parseInt(m[2], 10) : null;
      if (Number.isFinite(b) && b >= 1 && b <= 99) {
        batchNumber = b;
        if (Number.isFinite(t) && t >= b && t <= 99) totalBatches = t;
        break;
      }
    }
  }

  if (batchNumber === null && cleanName) {
    const fnPatterns = [
      /(?:batch|part|chapter|chunk)[_\s-]*(\d+)(?:\s*(?:of|_|-)\s*(\d+))?/i,
      /^(\d+)[_\s.-]/,
      /\((\d+)\)\.[a-z0-9]+$/i,
      /[_-](\d+)\.[a-z0-9]+$/i,
    ];
    for (const re of fnPatterns) {
      const m = re.exec(cleanName);
      if (m) {
        const b = parseInt(m[1], 10);
        const t = m[2] ? parseInt(m[2], 10) : null;
        if (Number.isFinite(b) && b >= 1 && b <= 99) {
          batchNumber = b;
          if (Number.isFinite(t) && t >= b && t <= 99) totalBatches = t;
          break;
        }
      }
    }
  }

  return {
    kind: 'scene',
    batchNumber,
    totalBatches,
    cleanedCode,
  };
}

/**
 * If a user pastes multiple concatenated batches into one textarea separated by
 * `// === ANIMATO BATCH X OF Y ===`, split them into virtual file entries first.
 */
export function splitConcatenatedBatches(rawText) {
  const text = String(rawText || '').trim();
  const markerRe = /^[ \t]*(?:\/\/|\/\*)\s*=*\s*ANIMATO[_\s-]*BATCH\s*[:#-]?\s*\d+[^\n]*/gim;
  const matches = [...text.matchAll(markerRe)];
  if (matches.length <= 1) return null;

  const chunks = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const slice = text.slice(start, end).trim();
    if (slice) {
      chunks.push({ name: `pasted-chunk-${i + 1}.txt`, text: slice });
    }
  }
  return chunks.length > 1 ? chunks : null;
}

/**
 * Convert depth-0 `const` and `let` declarations to `var` outside strings/comments
 * so cross-batch reassignments or re-declarations never throw `Assignment to constant variable`
 * or Temporal Dead Zone errors.
 */
function convertTopLevelConstLetToVar(code) {
  const s = String(code || '');
  let depth = 0;
  let inStr = '';
  let esc = false;
  let inLine = false;
  let inBlock = false;
  let atStmtStart = true;
  const edits = [];

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];

    if (inLine) {
      if (ch === '\n') {
        inLine = false;
        atStmtStart = true;
      }
      continue;
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === inStr) inStr = '';
      continue;
    }
    if (ch === '/' && next === '/') {
      inLine = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlock = true;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      atStmtStart = false;
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '[') {
      depth++;
      atStmtStart = ch === '{';
      continue;
    }
    if (ch === '}' || ch === ')' || ch === ']') {
      depth = Math.max(0, depth - 1);
      atStmtStart = ch === '}';
      continue;
    }

    if (depth === 0) {
      if (atStmtStart && (ch === 'c' || ch === 'l')) {
        const m = /^(const|let)\s+(?=[A-Za-z_${[])/.exec(s.slice(i));
        if (m) {
          edits.push({ index: i, len: m[1].length });
          i += m[0].length - 1;
          atStmtStart = false;
          continue;
        }
      }
      if (ch === ';' || ch === '\n') atStmtStart = true;
      else if (!/\s/.test(ch)) atStmtStart = false;
    }
  }

  if (!edits.length) return s;
  let out = s;
  for (let k = edits.length - 1; k >= 0; k--) {
    const ed = edits[k];
    out = out.slice(0, ed.index) + 'var' + out.slice(ed.index + ed.len);
  }
  return out;
}

/**
 * Find real `fnName(` call offsets outside strings, comments, and nested calls (up to maxBraceDepth).
 */
function findCallOffsets(src, fnName = 'scene', maxBraceDepth = 0) {
  const s = String(src || '');
  const fnRe = new RegExp(`^${fnName}\\s*\\(`);
  const offsets = [];
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let inStr = '';
  let esc = false;
  let inLineComment = false;
  let inBlockComment = false;
  let atStmtStart = true;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        atStmtStart = true;
      }
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === inStr) inStr = '';
      continue;
    }
    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      atStmtStart = false;
      continue;
    }

    if (braceDepth <= maxBraceDepth && parenDepth === 0 && bracketDepth === 0 && atStmtStart && ch === fnName[0]) {
      if (fnRe.test(s.slice(i))) {
        offsets.push(i);
      }
    }

    if (ch === '{') {
      braceDepth++;
      atStmtStart = true;
    } else if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      atStmtStart = true;
    } else if (ch === '(') {
      parenDepth++;
      atStmtStart = false;
    } else if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      atStmtStart = false;
    } else if (ch === '[') {
      bracketDepth++;
      atStmtStart = false;
    } else if (ch === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      atStmtStart = false;
    } else if (ch === ';' || ch === '\n') {
      atStmtStart = true;
    } else if (!/\s/.test(ch)) {
      atStmtStart = false;
    }
  }
  return offsets;
}

/**
 * Extract valid depth-0 statements/declarations and balanced valid `scene(...)` calls
 * from a single broken batch so syntax corruption in one scene inside Batch K
 * never breaks Batches K+1..N or valid scenes in Batch K.
 */
function salvageBatchBody(bodySrc) {
  const s = String(bodySrc || '');
  const parts = [];
  const items = [];
  const coveredSpans = [];
  const isInsideCovered = (pos) => coveredSpans.some((sp) => pos >= sp.start && pos < sp.end);

  // 1) Resiliently recover valid top-level declarations (const/let/var/function) and standalone assignments
  const declRe = /(?:^|\n)[ \t]*(?:(?:const|let|var|function)\s+[A-Za-z_$][\w$]*|(?:SETS|CAST|SVGS)\.[A-Za-z_$][\w$]*\s*=|[A-Za-z_$][\w$]*\s*=)/g;
  let dm;
  while ((dm = declRe.exec(s)) !== null) {
    const start = dm.index + (s[dm.index] === '\n' ? 1 : 0);
    const rel = s.slice(start).search(/\S/);
    if (rel < 0) continue;
    const trimmedStart = start + rel;
    if (isInsideCovered(trimmedStart)) continue;
    const slice = s.slice(trimmedStart);
    if (/^(?:scene|beat|movie|voiceover|thumbnail|try|catch|if|for|while|switch|return)\b/.test(slice)) continue;
    const isFnDecl = /^function\b/.test(slice);
    let b = 0, p = 0, br = 0, s2 = '', e2 = false, l2 = false, b2 = false, end = -1;
    for (let j = trimmedStart; j < s.length; j++) {
      const c = s[j], nx = s[j + 1];
      if (l2) { if (c === '\n') l2 = false; continue; }
      if (b2) { if (c === '*' && nx === '/') { b2 = false; j++; } continue; }
      if (s2) {
        if (e2) e2 = false;
        else if (c === '\\') e2 = true;
        else if (c === s2) s2 = '';
        else if (c === '\n' && s2 !== '`') break;
        continue;
      }
      if (c === '/' && nx === '/') { l2 = true; j++; continue; }
      if (c === '/' && nx === '*') { b2 = true; j++; continue; }
      if (c === "'" || c === '"' || c === '`') { s2 = c; continue; }
      if (c === '{') b++;
      else if (c === '}') {
        b = Math.max(0, b - 1);
        if (isFnDecl && b === 0 && p === 0 && br === 0) { end = j + 1; break; }
      } else if (c === '(') p++;
      else if (c === ')') p = Math.max(0, p - 1);
      else if (c === '[') br++;
      else if (c === ']') br = Math.max(0, br - 1);
      else if (c === ';' && b === 0 && p === 0 && br === 0) { end = j + 1; break; }
    }
    if (end > trimmedStart) {
      let stmt = s.slice(trimmedStart, end).trim().replace(/^(const|let)\s+/, 'var ');
      if (canCompileJs(stmt)) {
        items.push({ pos: trimmedStart, text: stmt, isScene: false });
        coveredSpans.push({ start: trimmedStart, end });
        declRe.lastIndex = end;
      }
    }
  }

  // 2) Recover every valid balanced `scene(...)` or `beat(...)` call independently so an unclosed quote inside
  // one damaged scene never poisons finding or compiling subsequent scenes in the same batch.
  const sceneRe = /(?:^|\n)[ \t]*(?:scene|beat)\s*\(/g;
  let totalSceneCandidates = 0;
  let keptScenes = 0;
  let sm;
  while ((sm = sceneRe.exec(s)) !== null) {
    const start = sm.index + (s[sm.index] === '\n' ? 1 : 0);
    const rel = s.slice(start).search(/\S/);
    if (rel < 0) continue;
    const callStart = start + rel;
    if (isInsideCovered(callStart)) continue;
    totalSceneCandidates++;
    const call = extractBalancedCallAt(s, callStart);
    if (call) {
      if (canCompileJs(call.text)) {
        items.push({ pos: callStart, text: call.text, isScene: true });
        coveredSpans.push({ start: callStart, end: call.end });
        keptScenes++;
        sceneRe.lastIndex = call.end;
      } else {
        const qFixed = normalizeSmartQuotes(call.text);
        if (qFixed !== call.text && canCompileJs(qFixed)) {
          items.push({ pos: callStart, text: qFixed, isScene: true });
          coveredSpans.push({ start: callStart, end: call.end });
          keptScenes++;
          sceneRe.lastIndex = call.end;
        }
      }
    }
  }

  items.sort((a, b) => a.pos - b.pos);
  for (const it of items) {
    parts.push(it.text);
  }
  return {
    code: parts.join('\n\n'),
    droppedScenes: Math.max(0, totalSceneCandidates - keptScenes),
    keptScenes,
  };
}

function scanStatementPositions(src) {
  const items = [];
  let depth = 0;
  let inStr = '';
  let esc = false;
  let inLine = false;
  let inBlock = false;
  let atStmtStart = true;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    if (inLine) {
      if (ch === '\n') {
        inLine = false;
        atStmtStart = true;
      }
      continue;
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === inStr) inStr = '';
      continue;
    }
    if (ch === '/' && next === '/') {
      inLine = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlock = true;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      atStmtStart = false;
      continue;
    }

    if (depth === 0 && atStmtStart && /[cflvs]/.test(ch)) {
      const slice = src.slice(i);
      const isDecl = /^(?:const|let|var|function)\b/.test(slice);
      if (isDecl) {
        const isFn = /^function\b/.test(slice);
        let b = 0, p = 0, br = 0, s2 = '', e2 = false, l2 = false, b2 = false, end = -1;
        for (let j = i; j < src.length; j++) {
          const c = src[j], nx = src[j + 1];
          if (l2) { if (c === '\n') l2 = false; continue; }
          if (b2) { if (c === '*' && nx === '/') { b2 = false; j++; } continue; }
          if (s2) { if (e2) e2 = false; else if (c === '\\') e2 = true; else if (c === s2) s2 = ''; continue; }
          if (c === '/' && nx === '/') { l2 = true; j++; continue; }
          if (c === '/' && nx === '*') { b2 = true; j++; continue; }
          if (c === "'" || c === '"' || c === '`') { s2 = c; continue; }
          if (c === '{') b++;
          else if (c === '}') {
            b = Math.max(0, b - 1);
            if (isFn && b === 0 && p === 0 && br === 0) { end = j + 1; break; }
          } else if (c === '(') p++;
          else if (c === ')') p = Math.max(0, p - 1);
          else if (c === '[') br++;
          else if (c === ']') br = Math.max(0, br - 1);
          else if (c === ';' && b === 0 && p === 0 && br === 0) { end = j + 1; break; }
        }
        if (end > i) {
          let stmt = src.slice(i, end).trim().replace(/^(const|let)\s+/, 'var ');
          if (canCompileJs(stmt)) {
            items.push({ pos: i, text: stmt, isScene: false });
          }
          i = end - 1;
          atStmtStart = true;
          continue;
        }
      }
    }

    if (ch === '{' || ch === '(' || ch === '[') {
      depth++;
      atStmtStart = ch === '{';
    } else if (ch === '}' || ch === ')' || ch === ']') {
      depth = Math.max(0, depth - 1);
      atStmtStart = ch === '}';
    } else if (ch === ';' || ch === '\n') {
      atStmtStart = true;
    } else if (!/\s/.test(ch)) {
      atStmtStart = false;
    }
  }
  return items;
}

function estimateBatchStats(src) {
  const s = String(src || '');
  const offsets = [
    ...findCallOffsets(s, 'scene', 1),
    ...findCallOffsets(s, 'beat', 1),
  ].sort((a, b) => a - b);
  let sceneCount = 0;
  let durationSec = 0;
  let skipUntil = -1;
  for (const offset of offsets) {
    if (offset < skipUntil) continue;
    const call = extractBalancedCallAt(s, offset);
    if (!call) continue;
    sceneCount++;
    const dm = /\b(?:duration|d)\s*:\s*(\d+(?:\.\d+)?)/.exec(call.text.slice(0, 600));
    if (dm) {
      durationSec += Math.max(0.5, parseFloat(dm[1]) || 5);
    } else {
      const sayM = /\b(?:say|narration)\s*:\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/.exec(call.text);
      const words = sayM ? sayM[2].trim().split(/\s+/).filter(Boolean).length : 0;
      durationSec += words > 0 ? Math.max(3.5, Math.round((words / 2.65 + 0.55) * 10) / 10) : 5;
    }
    skipUntil = call.end;
  }
  return { sceneCount, durationSec: Math.round(durationSec * 10) / 10 };
}

/**
 * Reorganize, deduplicate top-level metadata, hoist shared setup declarations from Batch 1,
 * scope and validate each batch independently, and merge up to 24 uploaded batch TXT/JS files —
 * even when uploaded out of order — so no later batch is ever silently dropped.
 */
export function mergeUploadedBatchFiles(fileEntries) {
  const list = (Array.isArray(fileEntries) ? fileEntries : []).filter((f) => f && String(f.text || '').trim());
  if (!list.length) {
    return {
      code: '',
      isMultiBatch: false,
      orderedBatches: [],
      warnings: [],
      voiceoverText: '',
    };
  }

  const parsedEntries = list.map((f, uploadIndex) => {
    const meta = parseBatchIndicator(f.text, f.name);
    return {
      name: String(f.name || `file-${uploadIndex + 1}.txt`),
      uploadIndex,
      ...meta,
    };
  });

  const voiceoverEntries = parsedEntries.filter((e) => e.kind === 'voiceover');
  voiceoverEntries.sort((a, b) => {
    const ka = a.batchNumber !== null ? a.batchNumber : 10000 + a.uploadIndex;
    const kb = b.batchNumber !== null ? b.batchNumber : 10000 + b.uploadIndex;
    return ka - kb || a.uploadIndex - b.uploadIndex;
  });
  const voiceoverText = voiceoverEntries.map((v) => v.cleanedCode.trim()).filter(Boolean).join('\n\n').trim();
  const sceneEntries = parsedEntries.filter((e) => e.kind === 'scene');

  if (!sceneEntries.length) {
    return {
      code: voiceoverText,
      isMultiBatch: false,
      orderedBatches: [],
      warnings: ['Uploaded file appears to be text-only (no scene({...}) blocks found).'],
      voiceoverText,
    };
  }

  // Single non-batched file passthrough (preserve exact original behavior)
  if (sceneEntries.length === 1 && !voiceoverText) {
    const single = sceneEntries[0];
    const st = estimateBatchStats(single.cleanedCode);
    return {
      code: single.cleanedCode,
      isMultiBatch: false,
      orderedBatches: [
        {
          name: single.name,
          batchNumber: single.batchNumber,
          totalBatches: single.totalBatches,
          sceneCount: st.sceneCount,
          durationSec: st.durationSec,
        },
      ],
      warnings: [],
      voiceoverText: '',
    };
  }

  // Sort deterministically: explicit batchNumber first (1, 2, 3...), else file containing movie(), else upload order
  const hasExplicitBatchOne = sceneEntries.some((e) => e.batchNumber === 1);
  const sortKey = (entry) => {
    if (entry.batchNumber !== null) return entry.batchNumber;
    if (!hasExplicitBatchOne && /\bmovie\s*\(/.test(entry.cleanedCode)) return 1;
    return 10000 + entry.uploadIndex;
  };
  sceneEntries.sort((a, b) => sortKey(a) - sortKey(b) || a.uploadIndex - b.uploadIndex);

  let movieCall = '';
  let thumbnailCall = '';
  let voiceoverCall = '';
  let sharedPrelude = '';
  const bodyBlocks = [];
  const warnings = [];

  // Collect batch bodies first so we can hoist any const/let/function declared in one batch
  // (e.g., between scenes in Batch 1 or inside Batch 2) that is referenced in another batch.
  const rawBodies = [];
  const batchStats = [];
  for (let i = 0; i < sceneEntries.length; i++) {
    const entry = sceneEntries[i];
    let body = entry.cleanedCode;

    const mv = extractCalls(body, 'movie');
    if (!movieCall && mv.calls.length) movieCall = mv.calls[0];
    body = mv.stripped;

    const th = extractCalls(body, 'thumbnail');
    if (!thumbnailCall && th.calls.length) thumbnailCall = th.calls[0];
    body = th.stripped;

    const vo = extractCalls(body, 'voiceover');
    if (!voiceoverCall && vo.calls.length) voiceoverCall = vo.calls[0];
    body = vo.stripped;

    if (i === 0) {
      // Hoist everything declared before the first top-level scene(...) in Batch 1 so Batches 2..N can reference shared constants/functions!
      const firstSceneIdx = findFirstTopLevelSceneIndex(body);
      if (firstSceneIdx > 0) {
        sharedPrelude = convertTopLevelConstLetToVar(body.slice(0, firstSceneIdx).trim());
        body = body.slice(firstSceneIdx).trim();
      }
    }

    if (body) {
      // Validate & repair each batch independently BEFORE combining so a syntax bug in Batch K
      // can NEVER truncate or corrupt Batches K+1..N!
      if (!canCompileJs(body)) {
        const quoted = normalizeSmartQuotes(body);
        if (canCompileJs(quoted)) {
          body = quoted;
        } else {
          const trimmed = trimIncompleteTail(quoted);
          const origScenes = (quoted.match(/\b(?:scene|beat)\s*\(/g) || []).length;
          const trimScenes = trimmed ? (trimmed.match(/\b(?:scene|beat)\s*\(/g) || []).length : 0;
          if (trimmed && canCompileJs(trimmed) && trimScenes >= Math.max(1, origScenes - 1)) {
            body = trimmed;
            if (origScenes > trimScenes) {
              warnings.push(`${entry.name}: trimmed 1 incomplete scene at end of batch.`);
            }
          } else {
            const salvaged = salvageBatchBody(quoted);
            if (salvaged.code && canCompileJs(salvaged.code)) {
              body = salvaged.code;
              if (salvaged.droppedScenes > 0) {
                warnings.push(
                  `${entry.name}: skipped ${salvaged.droppedScenes} syntax-damaged scene(s); kept ${salvaged.keptScenes}.`
                );
              }
            }
          }
        }
      }
      const label =
        entry.batchNumber !== null
          ? `// Batch ${entry.batchNumber}${entry.totalBatches ? ' of ' + entry.totalBatches : ''} (${entry.name})`
          : `// File ${i + 1} (${entry.name})`;
      const st = estimateBatchStats(body);
      batchStats[i] = st;
      rawBodies.push({ label, body });
    } else {
      batchStats[i] = { sceneCount: 0, durationSec: 0 };
    }
  }

  const hoistedVars = hoistCrossBatchSymbols(rawBodies);
  for (const item of rawBodies) {
    bodyBlocks.push(`${item.label}\n{\n${item.body}\n}`);
  }

  // Detect any missing batch numbers when explicit totalBatches or numbered batches were supplied
  const numbered = sceneEntries.map((e) => e.batchNumber).filter((n) => n !== null);
  if (numbered.length > 0) {
    const declaredMax = Math.max(...sceneEntries.map((e) => e.totalBatches || 0), ...numbered);
    const present = new Set(numbered);
    const missing = [];
    for (let k = 1; k <= declaredMax; k++) {
      if (!present.has(k)) missing.push(k);
    }
    if (missing.length) {
      warnings.push(
        `Missing batch ${missing.join(', ')} of ${declaredMax} — upload remaining batch file(s) for the complete video.`
      );
    }
  }

  if (voiceoverText) {
    voiceoverCall = `voiceover({text:${JSON.stringify(voiceoverText)}, mode:'own'});`;
  }

  const outParts = [];
  if (movieCall) outParts.push(movieCall);
  else outParts.push(`movie({title:'Merged Video', aspect:'16:9'});`);
  if (voiceoverCall) outParts.push(voiceoverCall);
  if (sharedPrelude) outParts.push(sharedPrelude);
  if (hoistedVars.length) outParts.push(hoistedVars.map((n) => `var ${n};`).join('\n'));
  if (thumbnailCall) outParts.push(thumbnailCall);
  outParts.push(...bodyBlocks);

  return {
    code: outParts.filter(Boolean).join('\n\n'),
    isMultiBatch: sceneEntries.length > 1,
    orderedBatches: sceneEntries.map((e, idx) => ({
      name: e.name,
      batchNumber: e.batchNumber ?? idx + 1,
      totalBatches: e.totalBatches,
      originalIndex: e.uploadIndex,
      sceneCount: batchStats[idx]?.sceneCount || 0,
      durationSec: batchStats[idx]?.durationSec || 0,
    })),
    warnings,
    voiceoverText,
  };
}

/**
 * Find depth-0 variable/function declarations inside a batch body that are referenced
 * by another batch (and not declared there), and promote them to shared `var` declarations
 * so constants like `const BG_CARAVAN_ROAD = ...` defined mid-Batch-1 stay accessible in Batches 2..N.
 */
function hoistCrossBatchSymbols(rawBodies) {
  if (!Array.isArray(rawBodies) || rawBodies.length < 2) return [];

  const scanTopLevelDecls = (src) => {
    const decls = new Map();
    let depth = 0;
    let inStr = '';
    let esc = false;
    let inLineComment = false;
    let inBlockComment = false;
    let atStmtStart = true;

    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      const next = src[i + 1];

      if (inLineComment) {
        if (ch === '\n') {
          inLineComment = false;
          atStmtStart = true;
        }
        continue;
      }
      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          i++;
        }
        continue;
      }
      if (inStr) {
        if (esc) {
          esc = false;
        } else if (ch === '\\') {
          esc = true;
        } else if (ch === inStr) {
          inStr = '';
        }
        continue;
      }

      if (ch === '/' && next === '/') {
        inLineComment = true;
        i++;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i++;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        inStr = ch;
        atStmtStart = false;
        continue;
      }

      if (ch === '{' || ch === '(' || ch === '[') {
        depth++;
        atStmtStart = ch === '{';
        continue;
      }
      if (ch === '}' || ch === ')' || ch === ']') {
        depth = Math.max(0, depth - 1);
        atStmtStart = ch === '}';
        continue;
      }

      if (depth === 0) {
        if (atStmtStart && /[a-z]/.test(ch)) {
          const slice = src.slice(i);
          const varMatch = /^(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(slice);
          if (varMatch) {
            const name = varMatch[2];
            if (!decls.has(name)) decls.set(name, []);
            decls.get(name).push({ kind: varMatch[1], index: i, kwLen: varMatch[1].length });
            i += varMatch[0].length - 1;
            atStmtStart = false;
            continue;
          }
          const fnMatch = /^function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(slice);
          if (fnMatch) {
            const name = fnMatch[1];
            if (!decls.has(name)) decls.set(name, []);
            decls.get(name).push({ kind: 'function', index: i, kwLen: 8 });
            i += fnMatch[0].length - 1;
            atStmtStart = false;
            continue;
          }
        }
        if (ch === ';' || ch === '\n') {
          atStmtStart = true;
        } else if (!/\s/.test(ch)) {
          atStmtStart = false;
        }
      }
    }
    return decls;
  };

  const perBatchDecls = rawBodies.map((b) => scanTopLevelDecls(b.body));
  const toHoist = new Set();

  for (let i = 0; i < rawBodies.length; i++) {
    for (const [name] of perBatchDecls[i]) {
      const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      for (let j = 0; j < rawBodies.length; j++) {
        if (j === i) continue;
        if (!perBatchDecls[j].has(name) && re.test(rawBodies[j].body)) {
          toHoist.add(name);
          break;
        }
      }
    }
  }

  if (!toHoist.size) return [];

  // Only hoist symbols that aren't declared in conflicting ways across multiple batches
  const finalHoisted = [];
  for (const name of toHoist) {
    let declCount = 0;
    let ownerIdx = -1;
    for (let i = 0; i < perBatchDecls.length; i++) {
      if (perBatchDecls[i].has(name)) {
        declCount++;
        ownerIdx = i;
      }
    }
    if (declCount === 1 && ownerIdx >= 0) {
      const entries = perBatchDecls[ownerIdx].get(name);
      // Rewrite from right to left so indices stay valid
      let body = rawBodies[ownerIdx].body;
      for (let k = entries.length - 1; k >= 0; k--) {
        const entry = entries[k];
        if (entry.kind === 'function') {
          body = `${body.slice(0, entry.index)}${name} = function ${body.slice(entry.index + entry.kwLen + 1)}`;
        } else {
          // Replace `const NAME =` / `let NAME =` / `var NAME =` with `NAME =`
          const afterKw = body.slice(entry.index + entry.kwLen).replace(/^\s+/, '');
          body = `${body.slice(0, entry.index)}${afterKw}`;
        }
      }
      rawBodies[ownerIdx].body = body;
      finalHoisted.push(name);
    }
  }

  return finalHoisted;
}

/**
 * Strip markdown fences, ES module export prefixes, placeholder ellipsis lines,
 * separate back-to-back top-level calls on the same line,
 * and deduplicate repeated top-level const/let declarations so scripts execute cleanly.
 */
/**
 * Everyday models often forget the closing quote on a timeline string: `{face:'worried@0->determined@3.1}` or
 * `a:'walkR@0->speak@2.2],` . One missing quote swallows the rest of the line and the whole file stops with
 * "Unexpected identifier 'Lila'". A timeline string always ends in `@number`, so when a single-quoted string that ends
 * in `@number` meets a `}`, `]`, `)`, `,` or the end of the line, the closing quote is put back there.
 * Strings that are already closed are never touched.
 */
export function closeTimelineQuotes(code) {
  const src = String(code || '');
  let out = '';
  let i = 0;
  const n = src.length;
  let str = '';
  let buf = '';
  while (i < n) {
    const c = src[i];
    if (!str) {
      if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); const end = e < 0 ? n : e; out += src.slice(i, end); i = end; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; out += src.slice(i, end); i = end; continue; }
      if (c === "'" || c === '"' || c === '`') { str = c; buf = ''; }
      out += c; i++; continue;
    }
    if (c === '\\') { out += c + (src[i + 1] ?? ''); buf += c + (src[i + 1] ?? ''); i += 2; continue; }
    if (c === str) { str = ''; out += c; i++; continue; }
    if (str === "'" && (c === '}' || c === ']' || c === ')' || c === ',' || c === '\n') && /@-?\d+(?:\.\d+)?$/.test(buf)) {
      out += "'";
      str = '';
      continue; // handle c again outside the string
    }
    buf += c; out += c; i++;
  }
  return out;
}

export function repairSceneSyntax(rawCode) {
  let code = cleanUploadedSnippet(rawCode);
  if (!canCompileJs(code)) {
    const closed = closeTimelineQuotes(code);
    if (closed !== code) code = closed;
  }
  // Strip stray markdown fence lines that sometimes appear between pasted batches
  code = code.replace(/^[ \t]*```[a-z0-9_-]*[ \t]*$/gim, '');
  // Strip standalone placeholder ellipsis lines left by AI models
  code = code.replace(/^[ \t]*(?:\/\/\s*\.\.\.[^\n]*|\.\.\.)[ \t]*$/gm, '');
  // Strip accidental ES module `export default` or `export ` before declarations
  code = code.replace(/(?:^|\n)[ \t]*export\s+default\s+/g, '\n');
  code = code.replace(/(?:^|\n)[ \t]*export\s+(?=(?:const|let|var|function)\b)/g, '\n');

  // Deduplicate repeated top-level `const IDENT =` / `let IDENT =` at brace depth 0
  // so concatenated files do not throw `Identifier 'X' has already been declared` or `Assignment to constant variable`.
  const topDecls = new Map();
  let depth = 0;
  let inStr = '';
  let esc = false;
  let inLineComment = false;
  let inBlockComment = false;
  let atStmtStart = true;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        atStmtStart = true;
      }
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === inStr) inStr = '';
      continue;
    }
    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      atStmtStart = false;
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '[') {
      depth++;
      atStmtStart = ch === '{';
      continue;
    }
    if (ch === '}' || ch === ')' || ch === ']') {
      depth = Math.max(0, depth - 1);
      atStmtStart = ch === '}';
      continue;
    }

    if (depth === 0) {
      if (atStmtStart && (ch === 'c' || ch === 'l' || ch === 'v')) {
        const m = /^(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(code.slice(i));
        if (m) {
          const name = m[2];
          if (!topDecls.has(name)) topDecls.set(name, []);
          topDecls.get(name).push({ kw: m[1], index: i, kwLen: m[1].length });
          i += m[0].length - 1;
          atStmtStart = false;
          continue;
        }
      }
      if (ch === ';' || ch === '\n') atStmtStart = true;
      else if (!/\s/.test(ch)) atStmtStart = false;
    }
  }

  const edits = [];
  for (const [, list] of topDecls) {
    if (list.length > 1) {
      if (list[0].kw === 'const' || list[0].kw === 'let') {
        edits.push({ index: list[0].index, len: list[0].kwLen, repl: 'var' });
      }
      for (let k = 1; k < list.length; k++) {
        edits.push({ index: list[k].index, len: list[k].kwLen, stripSpace: true, repl: '' });
      }
    }
  }
  edits.sort((a, b) => b.index - a.index);
  for (const ed of edits) {
    const after = ed.stripSpace ? code.slice(ed.index + ed.len).replace(/^\s+/, '') : code.slice(ed.index + ed.len);
    code = `${code.slice(0, ed.index)}${ed.repl}${after}`;
  }

  return fixRedeclared(code.trim());
}

/**
 * `Identifier 'fxSky' has already been declared`: the AI wrote the same name twice in one scope
 * (two `const fxSky = ...`, a `const` next to a `function`, or the same helper in two batches).
 * The error names the culprit, so every declaration of that name, at any depth, is turned into
 * `var`. `var` may be repeated and may sit next to a `function` of the same name, and nothing else
 * in the code changes. Repeats until the code compiles (or nothing more can be done).
 */
export function fixRedeclared(code) {
  let out = String(code || '');
  const seen = new Set();
  for (let guard = 0; guard < 40; guard++) {
    let msg = '';
    try {
      new Function('movie', 'scene', 'voiceover', 'thumbnail', 'ENV_', 'with(ENV_){\n' + out + '\n}');
      return out;
    } catch (e) { msg = String((e && e.message) || ''); }
    const m = /Identifier '([^']+)' has already been declared/.exec(msg);
    if (!m || seen.has(m[1])) return out;
    seen.add(m[1]);
    const name = m[1].replace(/[$]/g, '\\$&');
    const hasName = new RegExp('(?:^|[^\\w$])' + name + '(?![\\w$])');
    // a `function X` already uses the name: its twin `const X = ...` becomes a plain assignment (var next to a block function is also refused)
    const hasFn = new RegExp('\\bfunction\\s*\\*?\\s+' + name + '\\s*\\(').test(out);
    const plainAssign = new RegExp('^\\s+' + name + '\\s*=(?!=)');
    let next = out.replace(/\b(const|let)\b(?=\s)/g, (all, kw, off) => {
      const rest = out.slice(off + kw.length, off + kw.length + 400).split(/[;\n]/)[0];
      if (!hasName.test(rest)) return all;
      return hasFn && plainAssign.test(rest) ? '' : 'var';
    });
    if (next === out) {
      // a `class X` or a function parameter clash: give the later declaration its own name
      next = out.replace(new RegExp('\\bclass\\s+' + name + '\\b', 'g'), (all, off) => (off === out.search(new RegExp('\\bclass\\s+' + name + '\\b')) ? all : 'class ' + m[1] + '__' + (guard + 2)));
    }
    if (next === out) return out;
    out = next;
  }
  return out;
}

function normalizeSmartQuotes(code) {
  return String(code || '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function trimIncompleteTail(code) {
  const s = String(code || '').trim();
  const matches = [...s.matchAll(/(?:^|\n)\s*(?:scene|beat)\s*\(/g)];
  if (!matches.length) return s;

  // Walk backwards from the last scene(...) call to find the latest balanced complete scene(...);
  for (let mIdx = matches.length - 1; mIdx >= 0; mIdx--) {
    const start = matches[mIdx].index + (s[matches[mIdx].index] === '\n' ? 1 : 0);
    const call = extractBalancedCallAt(s, start);
    if (call) {
      let cut = s.slice(0, call.end).trim();
      // Count remaining unbalanced curly braces outside strings and comments (e.g. an open batch `{` wrapper)
      let braceDepth = 0;
      let str = '';
      let isEsc = false;
      let inLine = false;
      let inBlock = false;
      for (let i = 0; i < cut.length; i++) {
        const ch = cut[i];
        const next = cut[i + 1];
        if (inLine) {
          if (ch === '\n') inLine = false;
          continue;
        }
        if (inBlock) {
          if (ch === '*' && next === '/') {
            inBlock = false;
            i++;
          }
          continue;
        }
        if (isEsc) {
          isEsc = false;
          continue;
        }
        if (str) {
          if (ch === '\\') isEsc = true;
          else if (ch === str) str = '';
          continue;
        }
        if (ch === '/' && next === '/') {
          inLine = true;
          i++;
          continue;
        }
        if (ch === '/' && next === '*') {
          inBlock = true;
          i++;
          continue;
        }
        if (ch === "'" || ch === '"' || ch === '`') str = ch;
        else if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
      }
      if (braceDepth > 0) {
        cut += '\n' + '}'.repeat(braceDepth);
      }
      return cut;
    }
  }
  return s;
}

/**
 * Extract the missing identifier name from a browser/Node ReferenceError message.
 */
export function extractUndefinedSymbolName(errMessage) {
  const msg = String(errMessage || '');
  const m1 = /^([A-Za-z_$][\w$]*)\s+is not defined\b/.exec(msg);
  if (m1) return m1[1];
  const m2 = /Can't find variable:\s*([A-Za-z_$][\w$]*)/.exec(msg);
  if (m2) return m2[1];
  const m3 = /\b([A-Za-z_$][\w$]*)\s+is not defined\b/.exec(msg);
  if (m3) return m3[1];
  return null;
}

function buildSemanticSvgBackground(name, env = {}) {
  const lower = String(name || '').toLowerCase();
  const loc = env.LOC || {};
  const bgp = env.BGP || {};

  if (/space|galaxy|cosmos|planet|star|orbit/.test(lower) && typeof loc.space === 'function') return loc.space();
  if (/night|midnight|moon|dark/.test(lower)) return bgp.night || (typeof loc.street === 'function' ? loc.street() : '');
  if (/office|boardroom|desk|corp|studio/.test(lower) && typeof loc.office === 'function') return loc.office();
  if (/garage|workshop|shed/.test(lower) && typeof loc.garage === 'function') return loc.garage();
  if (/bank|vault|treasury/.test(lower) && typeof loc.bank === 'function') return loc.bank();
  if (/lab|science|server|cyber|tech/.test(lower) && typeof loc.lab === 'function') return loc.lab();
  if (/rooftop|sunset|dusk|evening/.test(lower) && typeof loc.rooftop === 'function') return loc.rooftop();
  if (/apt|apartment|home|house|room|kitchen|bedroom|living|indoors|interior/.test(lower) && typeof loc.apartment === 'function') {
    return loc.apartment();
  }
  if (/stage|theater|theatre|auditorium|spotlight/.test(lower) && typeof loc.stage === 'function') return loc.stage('');
  if (/caravan|desert|sand|dune|oasis|camel|sahara|canyon/.test(lower)) {
    return `<defs><linearGradient id="ds_sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e79a53"/><stop offset="1" stop-color="#fae1af"/></linearGradient></defs><rect width="1600" height="900" fill="url(#ds_sky)"/><circle cx="1280" cy="180" r="78" fill="#fff0a6"/><path d="M0,620 Q360,510 760,610 T1600,590 V900 H0Z" fill="#d9a45b"/><path d="M0,690 Q460,610 920,695 T1600,670 V900 H0Z" fill="#c78b44"/><path d="M520,900 Q720,730 920,675 L1020,680 Q860,750 780,900Z" fill="#a86d31" opacity=".85"/>`;
  }
  if (/road|street|highway|trail|path|city|town|market|village|avenue/.test(lower) && typeof loc.cityDay === 'function') {
    return loc.cityDay();
  }
  if (bgp.outdoor) return bgp.outdoor;
  return `<rect width="1600" height="900" fill="#8fd0ff"/><rect y="720" width="1600" height="180" fill="#5fae5a"/>`;
}

function makeSafeUniversalProxy(defaultStr = '') {
  const fn = function () {
    return makeSafeUniversalProxy(defaultStr);
  };
  const handler = {
    get(_target, prop) {
      if (prop === Symbol.toPrimitive) {
        return (hint) => (hint === 'number' ? 0 : defaultStr);
      }
      if (prop === Symbol.iterator) {
        return function* () {};
      }
      if (prop === 'toString' || prop === 'valueOf') return () => defaultStr;
      if (prop === 'length') return 0;
      if (prop === 'map' || prop === 'filter' || prop === 'slice' || prop === 'concat') return () => [];
      if (prop === 'forEach') return () => {};
      if (prop === 'trim' || prop === 'toLowerCase' || prop === 'toUpperCase') return () => defaultStr;
      if (typeof prop === 'string' && /^(bg|sky|wall|floor|sand|gold|red|blue|green|dark|light|ink|skin|hair|accent|primary|secondary|color|c)$/i.test(prop)) {
        return makeColorFallback(prop);
      }
      return makeSafeUniversalProxy(defaultStr);
    },
    ownKeys() {
      return [];
    },
    apply() {
      return makeSafeUniversalProxy(defaultStr);
    },
  };
  return new Proxy(fn, handler);
}

function makeColorFallback(propName) {
  const p = String(propName || '').toLowerCase();
  if (/gold|yellow|sun|amber/.test(p)) return '#ffd54a';
  if (/sand|desert|tan|beige/.test(p)) return '#d9a45b';
  if (/sky|blue|ocean|water/.test(p)) return '#4f8cff';
  if (/red|crimson|danger|warn/.test(p)) return '#e05a4f';
  if (/green|forest|grass|ok/.test(p)) return '#5fae5a';
  if (/dark|night|ink|black/.test(p)) return '#1a1f2b';
  if (/light|white|cream/.test(p)) return '#f4f1ea';
  if (/skin/.test(p)) return '#e8b896';
  return '#4f8cff';
}

/**
 * Infer a smart, scene-safe fallback value for an undefined identifier in scene code
 * (such as `BG_CARAVAN_ROAD`, character templates, color palettes, props, or helper functions)
 * so missing declarations do not abort video loading.
 */
export function inferMissingSymbolFallback(name, code = '', env = {}) {
  const escName = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lower = String(name || '').toLowerCase();
  const isCalled = new RegExp(`\\b${escName}\\s*\\(`).test(code);
  const isUsedAsBg =
    new RegExp(`background\\s*:\\s*${escName}\\b`).test(code) ||
    /^(?:bg|backdrop|scene_bg|stage_bg|world)_/i.test(name) ||
    /_(?:bg|backdrop|background)$/i.test(name);
  const isSpreadOrChar =
    new RegExp(`\\.\\.\\.${escName}\\b`).test(code) ||
    new RegExp(`characters\\s*:\\s*\\[[^\\]]*\\b${escName}\\b`).test(code) ||
    /^(?:char|hero|actor|cast|npc|look|person|leader|merchant|traveler|narrator|guard|boss|king|queen)_/i.test(name);
  const isPropsArr =
    new RegExp(`props\\s*:\\s*${escName}\\b`).test(code) || /^(?:props|items|extras)_|_(?:props|items)$/i.test(name);
  const isColor =
    new RegExp(`(?:color|fill|stroke|skin|hairc|outfitc)\\s*:\\s*${escName}\\b`).test(code) ||
    /^(?:col|pal|color|palette|theme)_|_(?:color|col|c)$/i.test(name);
  const hasDotAccess = new RegExp(`\\b${escName}\\s*\\.`).test(code);

  if (isCalled) {
    if (/^cam/i.test(name)) {
      return () => ({ zoom: 1, x: 800, y: 450, rot: 0 });
    }
    if (isUsedAsBg || /bg|loc|room|sky|road|desert|caravan|city|street|office|stage|world|env/i.test(lower)) {
      const svg = buildSemanticSvgBackground(name, env);
      return () => svg;
    }
    if (isSpreadOrChar || /char|hero|actor|npc|person|look|cast|crowd/i.test(lower)) {
      return (over = {}) => ({
        gender: /female|woman|girl|queen|princess/i.test(lower) ? 'female' : 'male',
        hair: 'short',
        hairc: '#3a2d28',
        outfit: 'jacket',
        outfitc: '#3e6b89',
        skin: '#e8b896',
        x: 800,
        ground: 790,
        ...(over && typeof over === 'object' ? over : {}),
      });
    }
    return makeSafeUniversalProxy('');
  }

  if (isUsedAsBg) {
    return buildSemanticSvgBackground(name, env);
  }

  if (isPropsArr) {
    return [];
  }

  if (isColor) {
    if (hasDotAccess) {
      return makeSafeUniversalProxy('#4f8cff');
    }
    return makeColorFallback(name);
  }

  if (isSpreadOrChar) {
    return {
      gender: /female|woman|girl|queen|princess/i.test(lower) ? 'female' : 'male',
      hair: 'short',
      hairc: '#3a2d28',
      outfit: 'jacket',
      outfitc: '#3e6b89',
      skin: '#e8b896',
      x: 800,
      ground: 790,
    };
  }

  if (hasDotAccess) {
    return makeSafeUniversalProxy('');
  }

  return makeSafeUniversalProxy('');
}

/**
 * Wrap individual `scene(...)` calls (at brace depth 0 or depth 1 inside a batch `{ ... }` block)
 * AND top-level batch `{ ... }` blocks inside `try { ... } catch (...)` so neither a failing scene
 * nor a failing helper inside Batch 3 can abort execution of Batches 4..12.
 */
function isolateScenesWithTryCatch(code) {
  let out = String(code || '');
  const offsets = [
    ...findCallOffsets(out, 'scene', 1),
    ...findCallOffsets(out, 'beat', 1),
  ].sort((a, b) => a - b);
  const spans = [];
  let skipUntil = -1;
  for (const offset of offsets) {
    if (offset < skipUntil) continue;
    const call = extractBalancedCallAt(out, offset);
    if (call) {
      spans.push(call);
      skipUntil = call.end;
    }
  }
  for (let k = spans.length - 1; k >= 0; k--) {
    const sp = spans[k];
    const cleanCall = sp.text.replace(/;\s*$/, '');
    const wrapped = `try { ${cleanCall}; } catch (__animatoSceneErr) { __animatoOnSceneErr(__animatoSceneErr); }`;
    out = out.slice(0, sp.start) + wrapped + out.slice(sp.end);
  }

  // Also wrap depth-0 statement-start `{ ... }` batch blocks in try/catch
  const blkSpans = [];
  let depth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let inStr = '';
  let esc = false;
  let inLine = false;
  let inBlock = false;
  let atStmtStart = true;
  let curBlkStart = -1;

  for (let i = 0; i < out.length; i++) {
    const ch = out[i];
    const next = out[i + 1];
    if (inLine) {
      if (ch === '\n') {
        inLine = false;
        atStmtStart = true;
      }
      continue;
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === inStr) inStr = '';
      continue;
    }
    if (ch === '/' && next === '/') {
      inLine = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlock = true;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      atStmtStart = false;
      continue;
    }

    if (ch === '{') {
      if (depth === 0 && parenDepth === 0 && bracketDepth === 0 && atStmtStart) {
        curBlkStart = i;
      }
      depth++;
      atStmtStart = true;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && curBlkStart >= 0) {
        blkSpans.push({ start: curBlkStart, end: i + 1 });
        curBlkStart = -1;
      }
      atStmtStart = true;
    } else if (ch === '(') {
      parenDepth++;
      atStmtStart = false;
    } else if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      atStmtStart = false;
    } else if (ch === '[') {
      bracketDepth++;
      atStmtStart = false;
    } else if (ch === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      atStmtStart = false;
    } else if (ch === ';' || ch === '\n') {
      atStmtStart = true;
    } else if (!/\s/.test(ch)) {
      atStmtStart = false;
    }
  }

  for (let k = blkSpans.length - 1; k >= 0; k--) {
    const b = blkSpans[k];
    const blkCode = out.slice(b.start, b.end);
    const wrappedBlk = `try ${blkCode} catch (__animatoBlkErr) { __animatoOnSceneErr(__animatoBlkErr); }`;
    out = out.slice(0, b.start) + wrappedBlk + out.slice(b.end);
  }

  return out;
}

/**
 * Execute Animato scene code with automatic syntax repair, truncated-tail recovery,
 * cross-batch const->var relaxation, iterative missing-symbol recovery, and per-scene
 * isolation so a single defective scene in Batch 3 NEVER truncates a 30-minute (12-batch) film.
 */
export function compileSceneCodeWithRepair(
  rawCode,
  { env = {}, movie, scene, voiceover, thumbnail, onReset, getSceneCount, onExecEnv } = {}
) {
  let workingCode = repairSceneSyntax(rawCode);
  if (/\b(?:const|let|var)\s+(?:SETS|CAST|SVGS)\s*=/.test(workingCode)) {
    workingCode = workingCode.replace(/(^|\n)([ \t]*)(?:const|let|var)[ \t]+((?:SETS|CAST|SVGS)[ \t]*=)/g, '$1$2$3');
  }
  const execEnv = Object.assign(Object.create(null), env);
  if (!execEnv.SETS || typeof execEnv.SETS !== 'object') execEnv.SETS = Object.create(null);
  if (!execEnv.CAST || typeof execEnv.CAST !== 'object') execEnv.CAST = Object.create(null);
  if (!execEnv.SVGS || typeof execEnv.SVGS !== 'object') execEnv.SVGS = Object.create(null);
  if (typeof onExecEnv === 'function') onExecEnv(execEnv);
  const repairs = [];
  const repairedSymbols = new Set();
  const repairedFnPaths = new Set();
  let lastErrMsg = '';
  let stuckCount = 0;
  let triedSmartQuotes = false;
  let triedVarRelax = false;
  let triedTailTrim = false;
  let triedSalvage = false;
  let triedSceneIsolation = false;
  let skippedSceneErrors = 0;

  if (execEnv && typeof execEnv.storyboard !== 'function') execEnv.storyboard = () => {};
  if (execEnv && typeof execEnv.packCharacter !== 'function') execEnv.packCharacter = () => {};
  execEnv.__animatoOnSceneErr = () => {
    skippedSceneErrors++;
  };

  for (let attempt = 0; attempt < 55; attempt++) {
    if (typeof onReset === 'function') onReset();
    skippedSceneErrors = 0;
    try {
      const fn = new Function(
        'movie',
        'scene',
        'voiceover',
        'thumbnail',
        'ENV_',
        'with(ENV_){\n' + workingCode + '\n}'
      );
      fn(movie, scene, voiceover, thumbnail, execEnv);
      if (skippedSceneErrors > 0) {
        repairs.push(`isolated-recovery (${skippedSceneErrors} skipped)`);
      }
      return {
        ok: true,
        err: '',
        repairs,
        skippedSceneErrors,
        repairedCode: workingCode,
        execEnv,
      };
    } catch (e) {
      const msg = String((e && e.message) || e || 'Unknown error');
      // Loop guard: the same error twice in a row means the targeted fixes below are not helping.
      // Skip them and go straight to scene isolation / partial recovery instead of spinning.
      stuckCount = msg === lastErrMsg ? stuckCount + 1 : 0;
      lastErrMsg = msg;
      const stuck = stuckCount >= 2;

      if (!stuck && e && e.name === 'ReferenceError') {
        // Handle TDZ (`Cannot access 'X' before initialization`) by converting top-level const/let to var
        if (/before initialization/i.test(msg) && !triedVarRelax) {
          triedVarRelax = true;
          const relaxed = convertTopLevelConstLetToVar(workingCode);
          if (relaxed !== workingCode) {
            workingCode = relaxed;
            repairs.push('var-relax');
            continue;
          }
        }
        const missing = extractUndefinedSymbolName(msg);
        if (missing && !repairedSymbols.has(missing)) {
          repairedSymbols.add(missing);
          execEnv[missing] = inferMissingSymbolFallback(missing, workingCode, execEnv);
          repairs.push(missing);
          continue;
        }
      }

      if (!stuck && e && e.name === 'TypeError') {
        if (/Assignment to constant variable/i.test(msg) && !triedVarRelax) {
          triedVarRelax = true;
          const relaxed = convertTopLevelConstLetToVar(workingCode);
          if (relaxed !== workingCode) {
            workingCode = relaxed;
            repairs.push('const-to-var');
            continue;
          }
        }
        // "X is not a function" AND member calls like "LOC.night is not a function".
        // Old code only captured the LAST word ("night"), patched execEnv.night, and the real
        // LOC.night stayed undefined -> same error 55 times -> "Could not auto-repair".
        const fnMatch = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s+is not a function/.exec(msg);
        if (fnMatch && fnMatch[1] && !repairedFnPaths.has(fnMatch[1])) {
          const path = fnMatch[1];
          repairedFnPaths.add(path);
          const parts = path.split('.');
          if (parts.length === 1) {
            const prev = execEnv[path];
            const ret = typeof prev === 'string' ? prev : '';
            execEnv[path] = () => ret;
          } else {
            const prop = parts[parts.length - 1];
            const baseName = parts[0];
            let holder = execEnv;
            let ok = true;
            for (let pi = 0; pi < parts.length - 1; pi++) {
              const key = parts[pi];
              let next = holder[key];
              if (next == null || (typeof next !== 'object' && typeof next !== 'function')) {
                next = Object.create(null);
                try { holder[key] = next; } catch (_) { ok = false; break; }
              } else if (pi === 0 && Object.isFrozen(next)) {
                // never mutate shared app objects (e.g. the real LOC); work on a private copy
                next = Object.assign(Object.create(null), next);
                holder[key] = next;
              } else if (pi === 0) {
                next = Object.assign(Object.create(null), next);
                holder[key] = next;
              }
              holder = next;
            }
            if (ok) {
              const prev = holder[prop];
              if (baseName === 'LOC') {
                const svg = buildSemanticSvgBackground(prop, execEnv);
                holder[prop] = () => svg || '<rect width="1600" height="900" fill="#1e293b"/>';
              } else {
                const ret = typeof prev === 'string' ? prev : '';
                holder[prop] = () => ret;
              }
            }
          }
          if (!repairs.includes(path + '()')) repairs.push(path + '()');
          continue;
        }
      }

      if (e && e.name === 'SyntaxError') {
        if (!triedSmartQuotes) {
          triedSmartQuotes = true;
          const fixedQuotes = normalizeSmartQuotes(workingCode);
          if (fixedQuotes !== workingCode) {
            workingCode = fixedQuotes;
            repairs.push('smart-quotes');
            continue;
          }
        }
        // Prefer balanced salvage BEFORE trimIncompleteTail on multi-scene scripts so an error
        // in Batch 3 never chops off Batches 4..12!
        if (!triedSalvage) {
          triedSalvage = true;
          const salvaged = salvageValidScenes(workingCode);
          if (salvaged && salvaged !== workingCode) {
            workingCode = salvaged;
            repairs.push('salvaged-scenes');
            continue;
          }
        }
        if (!triedTailTrim) {
          triedTailTrim = true;
          const trimmed = trimIncompleteTail(workingCode);
          if (trimmed && trimmed !== workingCode) {
            workingCode = trimmed;
            repairs.push('truncated-tail');
            continue;
          }
        }
      }

      // Before falling back to stopping at first failure, isolate every scene(...) in try/catch
      // so a single broken scene mid-film (e.g., in Batch 3) still executes all remaining Batches 4..12!
      if (!triedSceneIsolation && e && e.name !== 'SyntaxError') {
        triedSceneIsolation = true;
        const relaxed = convertTopLevelConstLetToVar(workingCode);
        const isolated = isolateScenesWithTryCatch(relaxed);
        if (isolated && isolated !== workingCode && canCompileJs(isolated)) {
          workingCode = isolated;
          continue;
        }
      }

      // If at least one scene was already registered before a non-scene-call error (e.g., bad helper between scenes),
      // salvage valid scenes + isolate in try/catch so Batches 4..12 are still preserved if possible.
      if (typeof getSceneCount === 'function' && getSceneCount() > 0) {
        repairs.push('partial-recovery');
        return {
          ok: true,
          err: '',
          repairs,
          skippedSceneErrors,
          repairedCode: workingCode,
          execEnv,
        };
      }

      return {
        ok: false,
        err: msg,
        repairs,
        skippedSceneErrors,
        repairedCode: workingCode,
        execEnv,
      };
    }
  }

  return {
    ok: typeof getSceneCount === 'function' ? getSceneCount() > 0 : false,
    err: 'Could not auto-repair all errors in the scene file.',
    repairs,
    skippedSceneErrors,
    repairedCode: workingCode,
    execEnv,
  };
}

/**
 * Extract valid setup declarations (across the entire file, including mid-batch helpers)
 * and movie, voiceover, thumbnail, customCharacter, and scene blocks from a malformed script
 * containing SyntaxErrors using balanced comment/string-aware parsing and per-block checks.
 */
export function salvageValidScenes(rawCode) {
  const s = String(rawCode || '');

  const extractValidTopCall = (fnName) => {
    const re = new RegExp(`\\b${fnName}\\s*\\(`, 'g');
    let m;
    while ((m = re.exec(s)) !== null) {
      const call = extractBalancedCallAt(s, m.index);
      if (call && canCompileJs(call.text)) {
        return call.text;
      }
    }
    return null;
  };

  const movieCall = extractValidTopCall('movie') || "movie({title:'Recovered Video', aspect:'16:9'});";
  const voiceoverCall = extractValidTopCall('voiceover');
  const thumbnailCall = extractValidTopCall('thumbnail');

  // Preserve valid customCharacter / setup declarations (const/let/var/function) anywhere at statement level
  const setupEntries = [];
  const seenOffsets = new Set();
  for (const fn of ['customCharacter', 'packCharacter', 'defineCharacter', 'createCharacter']) {
    const re = new RegExp(`(?:^|\\n)[ \\t]*${fn}\\s*\\(`, 'g');
    let m;
    while ((m = re.exec(s)) !== null) {
      const idx = m.index + (s[m.index] === '\n' ? 1 : 0);
      const rel = s.slice(idx).search(/\S/);
      if (rel < 0) continue;
      const trimmedIdx = idx + rel;
      const call = extractBalancedCallAt(s, trimmedIdx);
      if (call && canCompileJs(call.text) && !seenOffsets.has(trimmedIdx)) {
        seenOffsets.add(trimmedIdx);
        setupEntries.push({ pos: trimmedIdx, text: call.text });
        re.lastIndex = call.end;
      }
    }
  }

  // Scan top-level and batch-level const/let/var/function declarations and SETS/CAST/SVGS assignments across the WHOLE file
  const declRe = /(?:^|\n)[ \t]*(?:(?:const|let|var|function)\s+[A-Za-z_$][\w$]*|(?:SETS|CAST|SVGS)\.[A-Za-z_$][\w$]*\s*=)/g;
  let dm;
  while ((dm = declRe.exec(s)) !== null) {
    const start = dm.index + (s[dm.index] === '\n' ? 1 : 0);
    const rel = s.slice(start).search(/\S/);
    if (rel < 0) continue;
    const trimmedStart = start + rel;
    let b = 0, p = 0, br = 0, str = '', esc = false, lc = false, bc = false, end = -1;
    const isFnDecl = /^function\b/.test(s.slice(trimmedStart));
    for (let i = trimmedStart; i < s.length; i++) {
      const c = s[i], nx = s[i + 1];
      if (lc) { if (c === '\n') lc = false; continue; }
      if (bc) { if (c === '*' && nx === '/') { bc = false; i++; } continue; }
      if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === str) str = ''; continue; }
      if (c === '/' && nx === '/') { lc = true; i++; continue; }
      if (c === '/' && nx === '*') { bc = true; i++; continue; }
      if (c === "'" || c === '"' || c === '`') { str = c; continue; }
      if (c === '{') b++;
      else if (c === '}') { b = Math.max(0, b - 1); if (isFnDecl && b === 0 && p === 0 && br === 0) { end = i + 1; break; } }
      else if (c === '(') p++;
      else if (c === ')') p = Math.max(0, p - 1);
      else if (c === '[') br++;
      else if (c === ']') br = Math.max(0, br - 1);
      else if (c === ';' && b === 0 && p === 0 && br === 0) { end = i + 1; break; }
    }
    if (end > trimmedStart && !seenOffsets.has(trimmedStart)) {
      let stmt = s.slice(trimmedStart, end).trim().replace(/^(const|let)\s+/, 'var ');
      if (canCompileJs(stmt)) {
        seenOffsets.add(trimmedStart);
        setupEntries.push({ pos: trimmedStart, text: stmt });
        declRe.lastIndex = end;
      }
    }
  }
  setupEntries.sort((a, b) => a.pos - b.pos);
  const setupDecls = setupEntries.map((e) => e.text);

  const scenes = [];
  const sceneRe = /\b(?:scene|beat)\s*\(/g;
  let match;
  while ((match = sceneRe.exec(s)) !== null) {
    const call = extractBalancedCallAt(s, match.index);
    if (call) {
      if (canCompileJs(call.text)) {
        scenes.push(call.text);
        sceneRe.lastIndex = call.end;
      } else {
        const quotedFixed = normalizeSmartQuotes(call.text);
        if (quotedFixed !== call.text && canCompileJs(quotedFixed)) {
          scenes.push(quotedFixed);
          sceneRe.lastIndex = call.end;
        }
      }
    }
  }

  if (scenes.length > 0) {
    const parts = [movieCall];
    if (voiceoverCall) parts.push(voiceoverCall);
    if (setupDecls.length) parts.push(...setupDecls);
    if (thumbnailCall) parts.push(thumbnailCall);
    parts.push(...scenes);
    return parts.join('\n\n');
  }
  return null;
}

/**
 * Split narration cleanly into 5–9 word karaoke subtitle captions weighted by spoken length & punctuation.
 */
export function buildAutoCaptions(text, duration = 5) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const dur = Math.max(0.8, Number(duration) || 5);
  if (!clean) return [];

  const words = clean.split(' ').filter(Boolean);
  if (!words.length) return [];

  const chunks = [];
  let cur = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    cur.push(w);
    const endsSentence = /[.!?;:]$/.test(w);
    const softBreak = /,$/.test(w) && cur.length >= 4;
    const maxLen = cur.length >= 9 || cur.join(' ').length >= 52;
    if ((endsSentence && cur.length >= 3) || softBreak || maxLen || i === words.length - 1) {
      chunks.push(cur.join(' '));
      cur = [];
    }
  }
  if (cur.length) chunks.push(cur.join(' '));

  const startPad = Math.min(0.18, dur * 0.05);
  const endPad = Math.min(0.18, dur * 0.05);
  const usable = Math.max(0.4, dur - startPad - endPad);
  const weights = chunks.map((c) => Math.max(2, c.length + (/[.!?]$/.test(c) ? 6 : /,$/.test(c) ? 3 : 0)));
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;

  let cursor = startPad;
  return chunks.map((c, idx) => {
    const span = (usable * weights[idx]) / totalW;
    const from = Math.round(cursor * 100) / 100;
    cursor += span;
    const to = idx === chunks.length - 1 ? Math.round((dur - endPad) * 100) / 100 : Math.round(cursor * 100) / 100;
    return { from, to: Math.max(from + 0.25, to), text: c };
  });
}

function resolvePropAsset(keyOrSvg, env) {
  if (typeof keyOrSvg === 'string' && keyOrSvg.includes('<')) return keyOrSvg;
  const k = String(keyOrSvg || '');
  if (env.SVGS && typeof env.SVGS[k] === 'string') return env.SVGS[k];
  if (env.SVGS && typeof env.SVGS[k] === 'function') return env.SVGS[k]();
  if (typeof env[k] === 'string' && env[k].includes('<')) return env[k];
  if (typeof env[k] === 'function') {
    try {
      const r = env[k]();
      if (typeof r === 'string') return r;
    } catch {}
  }
  if (typeof env.icon === 'function') return env.icon(k || 'star');
  return '<circle cx="0" cy="0" r="24" fill="#ffd54a" stroke="#222" stroke-width="5"/>';
}

function parseCompactPhases(actSpec, dur) {
  const actStr = String(actSpec || 'idle').trim();
  const rawPhases = actStr.split(/\s*->\s*/).filter(Boolean);
  if (!rawPhases.length) rawPhases.push('idle');

  const count = rawPhases.length;
  const seg = dur / count;
  const round2 = (n) => Math.round(n * 100) / 100;

  return rawPhases.map((raw, i) => {
    const mAt = /@([\d.]+)$/.exec(raw);
    const start = i === 0 ? 0 : mAt ? parseFloat(mAt[1]) : round2(i * seg);
    const nextAt = i + 1 < count ? /@([\d.]+)$/.exec(rawPhases[i + 1]) : null;
    const end = i === count - 1 ? dur : nextAt ? parseFloat(nextAt[1]) : round2((i + 1) * seg);
    const clean = raw.replace(/@[\d.]+$/, '').trim();
    const parts = clean.split(':').map((p) => p.trim()).filter(Boolean);
    const cmd = (parts[0] || 'idle').toLowerCase();
    const args = parts.slice(1).map((p) => p.toLowerCase());
    return { raw, clean, cmd, args, start, end };
  });
}

function buildCompactActorFn(actSpec, walkCoords, dur, env, isStickman = false) {
  const { x0, y0, x1, y1 } = walkCoords;
  const phases = parseCompactPhases(actSpec, dur);
  // "runR->jump" over something: the run stops short of the end point and the jump carries the person the rest of the way in
  // one arc, landing on the far side (a thief over a fence), instead of jumping on the spot at the end of the run
  {
    const TRAVEL = /^(walkr|walkl|walk|walkto|runr|runl|run|sneak|tired)$/;
    const j = phases.findIndex((ph, i) => ph.cmd === 'jump' && i > 0 && TRAVEL.test(phases[i - 1].cmd));
    if (j > 0 && x0 !== undefined && Number.isFinite(+x0) && Number.isFinite(+x1) && Math.abs(x1 - x0) > 120) {
      const dir = Math.sign(x1 - x0), jt = Math.min(380, Math.abs(x1 - x0) * 0.42), from = x1 - dir * jt;
      for (let i = 0; i < j; i++) if (TRAVEL.test(phases[i].cmd)) phases[i]._tx = from;
      phases[j]._jumpFrom = from; phases[j]._dir = dir;
    }
  }

  const easeFn = (u) => {
    const cl = Math.min(1, Math.max(0, u));
    return cl * cl * (3 - 2 * cl);
  };
  const lerpNum = (a, b, k) => a + (b - a) * k;

  const pickWalkOpts = (args, defaultEnd = 'front') => {
    let style = '';
    let endView = defaultEnd;
    for (const a of args) {
      if (a === 'front' || a === 'side' || a === 'back') endView = a;
      else if (a) style = a;
    }
    return { style: style || 'proud', endView };
  };

  const runSingleAct = (phase, t, t0, t1, totalDur) => {
    const { cmd, args } = phase;
    const arg = args[0] || '';

    if (cmd === 'walkr' || cmd === 'walkl' || cmd === 'walk' || cmd === 'walkto') {
      const { style, endView } = pickWalkOpts(args, 'front');
      const fromX = x0 !== undefined ? x0 : Math.max(120, Math.min(1480, x1 + (cmd === 'walkl' ? 240 : -240)));
      const fromY = y0 !== undefined ? y0 : y1;
      if (typeof env.walk === 'function') {
        const k = env.walk(t, t0, t1, fromX, fromY, phase._tx ?? x1, y1, endView, style);
        if (k >= 1 && typeof env.idle === 'function') env.idle(t);
      }
      return;
    }
    if (cmd === 'runr' || cmd === 'runl' || cmd === 'run') {
      const { endView } = pickWalkOpts(args, 'front');
      const fromX = x0 !== undefined ? x0 : Math.max(120, Math.min(1480, x1 + (cmd === 'runl' ? 320 : -320)));
      const fromY = y0 !== undefined ? y0 : y1;
      if (typeof env.walk === 'function') {
        const k = env.walk(t, t0, t1, fromX, fromY, phase._tx ?? x1, y1, endView, 'run');
        if (k >= 1 && typeof env.idle === 'function') env.idle(t);
      }
      return;
    }
    if (cmd === 'sneak' || cmd === 'tired') {
      const { endView } = pickWalkOpts(args, 'front');
      const fromX = x0 !== undefined ? x0 : Math.max(120, x1 - 180);
      const fromY = y0 !== undefined ? y0 : y1;
      if (typeof env.walk === 'function') {
        const k = env.walk(t, t0, t1, fromX, fromY, phase._tx ?? x1, y1, endView, cmd);
        if (k >= 1 && typeof env.idle === 'function') env.idle(t);
      }
      return;
    }
    if (cmd === 'speak') {
      if (typeof env.speak === 'function') env.speak(t, 0.9);
      if (typeof env.idle === 'function') env.idle(t);
      return;
    }
    if (cmd === 'shoot') {
      if (typeof env.shoot === 'function') env.shoot(t, t0);
      else if (typeof env.arms === 'function') {
        const k = easeFn((t - t0) / 0.5);
        env.arms(34 + k * 112, -36 + k * 148);
      }
      if (typeof env.idle === 'function') env.idle(t);
      return;
    }
    if (cmd === 'throw') {
      if (typeof env.throwMotion === 'function') env.throwMotion(t, t0 + 0.15, arg === 'left' || arg === 'l' ? -1 : 1);
      if (typeof env.idle === 'function') env.idle(t);
      return;
    }
    if (cmd === 'collapse') {
      if (typeof env.collapse === 'function') env.collapse(t, t0 + 0.2);
      return;
    }
    if (cmd === 'sit') {
      if (arg === 'floor') {
        if (typeof env.move === 'function') env.move(0, 75);
        if (typeof env.leftLeg === 'function') env.leftLeg(90, 75);
        if (typeof env.rightLeg === 'function') env.rightLeg(90, 75);
      } else {
        if (typeof env.chair === 'function') env.chair(true);
        if (!isStickman && typeof env.move === 'function') env.move(0, 40);
        if (typeof env.kneeBend === 'function') env.kneeBend(90);
        const lift = isStickman ? 0 : 40;
        if (typeof env.leftLeg === 'function') env.leftLeg(90, lift);
        if (typeof env.rightLeg === 'function') env.rightLeg(90, lift);
      }
      if (typeof env.idle === 'function') env.idle(t);
      return;
    }
    if (cmd === 'lie') {
      const p = easeFn((t - t0) / 0.9);
      if (typeof env.spin === 'function') env.spin(-90 * p);
      if (typeof env.size === 'function') env.size(1 - 0.38 * p);
      if (typeof env.move === 'function') env.move(0, 245 * p + Math.sin(t * 2) * 2 * p);
      if (typeof env.arms === 'function') env.arms(lerpNum(34, 20, p), lerpNum(-36, -10, p));
      return;
    }
    if (cmd === 'bow') {
      const p = easeFn((t - t0) / 0.7) * easeFn((t1 - t) / 0.5);
      if (typeof env.lean === 'function') env.lean(32 * p);
      if (typeof env.head === 'function') env.head(12 * p);
      if (typeof env.squash === 'function') env.squash(1 - 0.04 * p);
      if (typeof env.arms === 'function') env.arms(lerpNum(34, 15, p), lerpNum(-36, -20, p));
      return;
    }
    if (cmd === 'jump' && phase._jumpFrom !== undefined) {
      // one travelling jump: crouch, take off, fly over in an arc with the knees tucked, land and absorb
      const T = Math.min(1.1, Math.max(0.6, t1 - t0)), u = Math.min(1, Math.max(0, (t - t0) / T));
      const crouch = u < 0.18 ? Math.sin((Math.PI * u) / 0.18) : 0, airU = Math.min(1, Math.max(0, (u - 0.15) / 0.75)), land = u > 0.88 ? Math.sin((Math.PI * (u - 0.88)) / 0.12) : 0;
      const x = phase._jumpFrom + (x1 - phase._jumpFrom) * (airU * airU * (3 - 2 * airU));
      if (typeof env.at === 'function') env.at(x, y1, 'side', phase._dir < 0);
      const k = Math.sin(Math.PI * airU);
      if (typeof env.move === 'function') env.move(0, -250 * k);
      if (typeof env.squash === 'function') env.squash(1 - 0.14 * (crouch + land));
      if (typeof env.lean === 'function') env.lean(14 * k);
      if (typeof env.arms === 'function') env.arms(lerpNum(30, 140, k), lerpNum(-30, 40, k));
      if (typeof env.leftLeg === 'function') env.leftLeg(26 * k, 40 * k);
      if (typeof env.rightLeg === 'function') env.rightLeg(-18 * k, 52 * k);
      if (u >= 1 && typeof env.idle === 'function') env.idle(t);
      return;
    }
    if (cmd === 'jump') {
      const ph = ((t - t0) % 1.3) / 1.3;
      if (ph < 0.22) {
        const k = Math.sin((Math.PI * ph) / 0.22);
        if (typeof env.squash === 'function') env.squash(1 - 0.16 * k);
        if (typeof env.arms === 'function') env.arms(20, -10);
      } else {
        const k = Math.sin((Math.PI * (ph - 0.22)) / 0.78);
        if (typeof env.move === 'function') env.move(0, -190 * k);
        if (typeof env.squash === 'function') env.squash(1 + 0.04 * k);
        if (typeof env.arms === 'function') env.arms(lerpNum(30, 150, k), lerpNum(-30, 165, k));
        if (typeof env.leftLeg === 'function') env.leftLeg(0, 18 * k);
        if (typeof env.rightLeg === 'function') env.rightLeg(0, 18 * k);
      }
      return;
    }
    if (cmd === 'dance') {
      const s = Math.sin(t * 5);
      const c = (Math.sin(t * 5 + Math.PI) + 1) / 2;
      const d = (s + 1) / 2;
      if (typeof env.move === 'function') env.move(s * 22, -Math.abs(s) * 10);
      if (typeof env.lean === 'function') env.lean(s * 9);
      if (typeof env.head === 'function') env.head(-s * 12);
      if (typeof env.leftArm === 'function') env.leftArm(lerpNum(30, 150, c), lerpNum(-30, 165, c));
      if (typeof env.rightArm === 'function') env.rightArm(lerpNum(30, 150, d), lerpNum(-30, 165, d));
      if (typeof env.leftLeg === 'function') env.leftLeg(0, Math.max(0, s) * 14);
      if (typeof env.rightLeg === 'function') env.rightLeg(0, Math.max(0, -s) * 14);
      return;
    }
    if (cmd === 'kick') {
      const s = Math.sin(t * 6);
      const u = Math.max(0, s);
      const v = Math.max(0, -s);
      if (typeof env.lean === 'function') env.lean(-6 * (u + v));
      if (typeof env.move === 'function') env.move(0, -(u + v) * 4);
      if (typeof env.leftLeg === 'function') env.leftLeg(u * 85, u * 30);
      if (typeof env.rightLeg === 'function') env.rightLeg(v * 85, v * 30);
      return;
    }
    if (cmd === 'squat') {
      const k = (1 - Math.cos((t - t0) * 3)) / 2;
      if (typeof env.squash === 'function') env.squash(1 - 0.2 * k);
      if (typeof env.arms === 'function') env.arms(lerpNum(34, 70, k), lerpNum(-36, -20, k));
      return;
    }
    if (cmd === 'stretch') {
      const p = easeFn((t - t0) / 0.8);
      if (typeof env.arms === 'function') env.arms(lerpNum(34, 172, p), lerpNum(-36, 178, p));
      if (typeof env.lean === 'function') env.lean(Math.sin(t * 3) * 3 * p);
      if (typeof env.move === 'function') env.move(0, -4 * p);
      return;
    }
    if (cmd === 'rubhands' || cmd === 'scheme') {
      if (typeof env.arms === 'function') env.arms(40 + Math.sin(t * 8) * 8, 100);
      if (typeof env.lean === 'function') env.lean(4);
      if (typeof env.idle === 'function') env.idle(t);
      return;
    }
    if (cmd === 'gesture') {
      if (typeof env.gesture === 'function') env.gesture(t, arg || 'present', t0, t1);
      if (typeof env.idle === 'function') env.idle(t);
      return;
    }
    if (cmd === 'point' || cmd === 'shrug' || cmd === 'fist' || cmd === 'handsup' || cmd === 'present' || cmd === 'chest' || cmd === 'facepalm' || cmd === 'wave' || cmd === 'reach') {
      if (typeof env.gesture === 'function') env.gesture(t, cmd, t0, t1);
      if (typeof env.idle === 'function') env.idle(t);
      return;
    }
    if (cmd === 'react') {
      if (typeof env.react === 'function') env.react(t, arg || 'shock', 0);
      if (typeof env.idle === 'function') env.idle(t);
      return;
    }
    const reactKinds = new Set([
      'shock', 'fear', 'sad', 'angry', 'laugh', 'cheer', 'clap', 'think',
      'nod', 'no', 'struggle', 'exhausted', 'type', 'pray', 'sleep', 'proud',
      'celebrate', 'scared', 'cry', 'stare',
      'excited', 'worried', 'embarrassed', 'smug', 'love', 'confused', 'relieved', 'determined', 'awe', 'nervous',
    ]);
    if (reactKinds.has(cmd)) {
      if (typeof env.react === 'function') env.react(t, cmd, 0);
      if (typeof env.idle === 'function') env.idle(t);
      return;
    }
    // body acting (public/acting.js): the AI names the action, the engine adds the wind-up, the strike and the settle
    if (isAction(cmd)) {
      if (typeof env.act === 'function') env.act(t, cmd, t0, t1);
      if (typeof env.idle === 'function') env.idle(t);
      return;
    }
    if (cmd === 'lookaround') {
      if (typeof env.idle === 'function') env.idle(t);
      if (typeof env.lookAround === 'function') env.lookAround(t, 0, 10);
      return;
    }
    if (typeof env.idle === 'function') env.idle(t);
    if (typeof env.lookAround === 'function' && totalDur > 2) env.lookAround(t, 0, 8);
  };

  if (phases.length <= 1) {
    const p0 = phases[0];
    return (t) => runSingleAct(p0, t, 0.2, Math.min(dur - 0.3, Math.max(1.8, dur * 0.65)), dur);
  }

  return (t) => {
    for (let i = 0; i < phases.length; i++) {
      const ph = phases[i];
      if (t >= ph.start && (t < ph.end || i === phases.length - 1)) {
        runSingleAct(ph, t, ph.start, Math.max(ph.start + 0.6, ph.end - 0.15), dur);
        return;
      }
    }
  };
}

function resolveTalkTimeline(actSpec, dur) {
  const phases = parseCompactPhases(actSpec, dur);
  if (phases.length <= 1) {
    return phases[0]?.cmd === 'speak';
  }
  const windows = phases.filter((p) => p.cmd === 'speak').map((p) => [p.start, p.end]);
  return windows.length ? windows : false;
}

function resolveActorSpec(entry, env, dur) {
  if (!entry) return [];
  const isGlobalStick = env._charStyle === 'stickman' || env._charStyle === 'human' || env._charStyle === 'doodle';
  const hasCustomName = (id) => Boolean(id && env._customNames && env._customNames[id]);

  if (!Array.isArray(entry) && typeof entry === 'object') {
    const id = entry.id || entry.cast;
    const tpl = id && ((env.CAST && env.CAST[id]) || env[id]);
    const look = Object.assign({}, tpl && typeof tpl === 'object' ? tpl.look || tpl : {}, entry.look || {});
    const xRaw = entry.x ?? 800;
    const yRaw = entry.ground ?? entry.y ?? 795;
    const xEnd = Array.isArray(xRaw) ? (xRaw[1] ?? xRaw[0] ?? 800) : xRaw;
    const yEnd = Array.isArray(yRaw) ? (yRaw[1] ?? yRaw[0] ?? 795) : yRaw;
    const walkCoords = {
      x0: Array.isArray(xRaw) ? xRaw[0] : entry.fromX,
      x1: xEnd,
      y0: Array.isArray(yRaw) ? yRaw[0] : entry.fromY,
      y1: yEnd,
    };
    const isStick = isGlobalStick || entry.style === 'stickman' || entry.type === 'stickman' || look.top !== undefined;
    const customName = entry.custom || (tpl && typeof tpl === 'object' && tpl.custom) || (hasCustomName(id) ? id : undefined);
    const out = {
      ...(customName ? { custom: customName } : {}),
      ...entry,
      look,
      x: xEnd,
      ground: yEnd,
      scale: entry.scale ?? 0.84,
      ...(id ? { _who: String(id) } : {}),
    };
    if (!out.animate && entry.act) {
      out.animate = buildCompactActorFn(entry.act, walkCoords, dur, env, isStick);
      out._busy = busyWindows(parseCompactPhases(entry.act, dur));
      if (out.talk === undefined) out.talk = resolveTalkTimeline(entry.act, dur);
    }
    return [out];
  }

  if (typeof entry === 'string') {
    const [head, posPart] = entry.split('@');
    const [id, act] = head.split(':');
    const x = posPart ? parseFloat(posPart) || 800 : 800;
    return resolveActorSpec([id, act || 'idle', x], env, dur);
  }

  if (Array.isArray(entry)) {
    const id = String(entry[0] || 'hero');
    if (id.toLowerCase() === 'crowd') {
      const n = Math.max(2, parseInt(entry[1], 10) || 6);
      const rawSpec = String(entry[2] || 'shock');
      const ground = typeof entry[3] === 'number' ? entry[3] : 790;
      const extra = typeof entry[4] === 'object' && entry[4] ? { ...entry[4] } : {};
      // Support 'cam:0.6|shock' shorthand in crowd tuple
      let reactKind = rawSpec;
      if (/cam:/i.test(rawSpec)) {
        const parts = rawSpec.split('|');
        for (const pt of parts) {
          if (/^cam:([\d.]+)$/i.test(pt)) extra.cam = parseFloat(RegExp.$1);
          else reactKind = pt;
        }
      }
      if (typeof env.crowd === 'function') {
        const members = env.crowd(n, { ground, react: reactKind, ...extra });
        if (extra.par !== undefined) {
          members.forEach((m) => {
            if (m && typeof m === 'object') m.par = extra.par;
          });
        }
        return members;
      }
      return [];
    }

    const act = String(entry[1] || 'idle');
    let xRaw = entry[2];
    let groundRaw = 795;
    let opts = {};
    for (let k = 3; k < entry.length; k++) {
      const v = entry[k];
      if (Array.isArray(v) && v.length >= 2) {
        groundRaw = v;
      } else if (typeof v === 'number') {
        if (k === 3 && v >= 500) groundRaw = v;
        else opts.scale = v;
      } else if (typeof v === 'string') {
        if (v === 'side' || v === 'front' || v === 'back') opts.view = v;
        else opts.styleTag = v;
      } else if (v && typeof v === 'object') {
        opts = { ...opts, ...v };
      }
    }

    const x1 = Array.isArray(xRaw) ? (Number(xRaw[1]) || Number(xRaw[0]) || 800) : typeof xRaw === 'number' ? xRaw : 800;
    const x0 = Array.isArray(xRaw) ? Number(xRaw[0]) : opts.fromX;
    const y1 = Array.isArray(groundRaw) ? (Number(groundRaw[1]) || Number(groundRaw[0]) || 795) : groundRaw;
    const y0 = Array.isArray(groundRaw) ? Number(groundRaw[0]) : opts.fromY;

    const tpl = (env.CAST && env.CAST[id]) || env[id];
    const baseLook = tpl && typeof tpl === 'object' ? tpl.look || tpl : { gender: 'male', outfit: 'suit', outfitc: '#3b5b84', hairc: '#26201c' };
    const look = { ...baseLook };
    for (const k of ['brow', 'mouth', 'expression', 'smile', 'browMood', 'outfit', 'outfitc', 'top', 'topc', 'bottom', 'bottomc', 'hair', 'hairc', 'glasses', 'eyewear', 'facialHair', 'headwear', 'acc', 'skin']) {
      if (opts[k] !== undefined) look[k] = opts[k];
    }
    for (const ck of ['skin', 'hairc', 'outfitc', 'topc', 'bottomc', 'shoec']) {
      if (typeof look[ck] === 'string' && /^#[0-9a-f]{3}$/i.test(look[ck].trim())) {
        const h = look[ck].trim();
        look[ck] = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
      }
    }

    const customName = opts.custom || baseLook.custom || (hasCustomName(id) ? id : undefined);
    const isStick = isGlobalStick || opts.style === 'stickman' || opts.type === 'stickman' || baseLook.top !== undefined;
    const firstCmd = parseCompactPhases(act, dur)[0]?.cmd || '';
    const isPureWalkL = /^(?:walkl|runl)$/.test(act.trim().toLowerCase());

    const charObj = {
      ...(customName ? { custom: customName } : {}),
      _who: String(id),          // the cast name, so a drawing can follow this person (follow:'hero')
      look,
      x: x1,
      ground: y1,
      scale: opts.scale ?? baseLook.scale ?? 0.84,
      view: opts.view || (isPureWalkL ? 'side' : 'front'),
      flip: opts.flip ?? (isPureWalkL || (firstCmd === 'walkl' && x0 !== undefined && x1 < x0)),
      talk: opts.talk !== undefined ? opts.talk : resolveTalkTimeline(act, dur),
      animate:
        typeof opts.animate === 'function'
          ? opts.animate
          : buildCompactActorFn(act, { x0, y0, x1, y1 }, dur, env, isStick),
    };
    if (opts.show) charObj.show = opts.show;
    // which stretches of the film this person already acts out (a walk, a reaction, a named action), so the automatic acting never fights them
    charObj._busy = busyWindows(parseCompactPhases(act, dur));
    // the face track the AI wrote ('worried@0->shocked@1.8->angry@3.4'): compiled for the scene by directFaces (public/expressions.js)
    if (opts.face !== undefined && typeof opts.face !== 'function' && typeof opts.face !== 'boolean') charObj.feel = opts.face;
    else if (opts.feel !== undefined && typeof opts.feel !== 'function') charObj.feel = opts.feel;
    // who this person looks at ('boss' or 'boss@0->camera@3'), see public/gaze.js
    if (opts.gaze !== undefined && typeof opts.gaze !== 'function') charObj._gazeSpec = opts.gaze;
    if (opts.turn !== undefined) charObj.turn = opts.turn;
    if (opts.par !== undefined) charObj.par = opts.par;
    if (opts.style) charObj.style = opts.style;
    return [charObj];
  }

  return [];
}

function resolveCompactProps(rawProps, mood, isBlackBg, setKey, dur, env, opts = {}) {
  const out = [];
  const pushItem = (val) => {
    if (!val) return;
    if (Array.isArray(val)) {
      for (const sub of val) {
        if (sub && typeof sub === 'object' && !Array.isArray(sub)) out.push(sub);
      }
    } else if (typeof val === 'object') {
      out.push(val);
    }
  };
  const trailingOpts = (arr, minOptIdx) => {
    const last = arr[arr.length - 1];
    return arr.length > minOptIdx && last && typeof last === 'object' && !Array.isArray(last) ? last : {};
  };

  for (const itemSpec of Array.isArray(rawProps) ? rawProps : []) {
    if (!itemSpec) continue;
    if (!Array.isArray(itemSpec)) {
      pushItem(itemSpec);
      continue;
    }
    const kind = String(itemSpec[0] || '').toLowerCase();
    if (kind === 'item') {
      const extra = trailingOpts(itemSpec, 3);
      const [, name, label, x = 800, y = 520, scale = 1, t0 = 0.3, t1] = itemSpec;
      if (typeof env.item === 'function') {
        const cfg = { x, y, scale, t0, ...extra };
        if (typeof t1 === 'number') cfg.t1 = t1;
        pushItem(env.item(name || 'star', label ?? null, cfg));
      }
    } else if (kind === 'card' || kind === 'titlecard') {
      const extra = trailingOpts(itemSpec, 3);
      const [, text, x = 800, y = 260, size = 90, color = '#ffd54a', t0 = 0.4, t1] = itemSpec;
      if (typeof env.titleCard === 'function') {
        const cfg = { x, y, size, color, t0, ...extra };
        if (typeof t1 === 'number') cfg.t1 = t1;
        pushItem(env.titleCard(String(text || ''), cfg));
      }
    } else if (kind === 'headline') {
      const extra = trailingOpts(itemSpec, 2);
      const [, text, tag = 'BREAKING', t0 = 0.4, t1] = itemSpec;
      if (typeof env.headline === 'function') {
        const cfg = { y: 655, tag: typeof tag === 'string' ? tag : 'BREAKING', t0: typeof t0 === 'number' ? t0 : 0.4, ...extra };
        if (typeof t1 === 'number') cfg.t1 = t1;
        pushItem(env.headline(String(text || ''), cfg));
      }
    } else if (kind === 'timer' || kind === 'hud' || kind === 'countdown') {
      // HUD clock like the short-film references: a small label over a big time that counts up or down ("STUDIED 4:00:00", "IMPACT IN 14:58")
      const [, label = '', a = 0, b = 60, x = 160, y = 90, t0 = 0, t1 = dur, color = '#ffd54a'] = itemSpec;
      const fmtT = (v) => { v = Math.max(0, Math.round(v)); const h = Math.floor(v / 3600), m = Math.floor((v % 3600) / 60), sec = v % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(sec).padStart(2, '0'); };
      const lab = escXml(String(label || '').toUpperCase());
      const col = String(color);
      out.push({ screen: true, x: +x, y: +y, show: [Math.max(0, +t0 || 0), Math.max(0.5, Number.isFinite(+t1) ? +t1 : dur)], svgFn: (t) => {
        const k = Math.max(0, Math.min(1, (t - (+t0 || 0)) / Math.max(0.2, (Number.isFinite(+t1) ? +t1 : dur) - (+t0 || 0))));
        const v = (+a || 0) + ((+b || 0) - (+a || 0)) * k;
        const blink = (+b < +a) && v < 10 && Math.floor(t * 4) % 2 ? 0.55 : 1;
        return `<g opacity="${blink}"><text x="0" y="-34" text-anchor="middle" font-size="22" font-weight="700" letter-spacing="3" fill="#cfd3da" font-family="Arial,sans-serif">${lab}</text><text x="0" y="16" text-anchor="middle" font-size="54" font-weight="900" fill="${col}" stroke="#000" stroke-width="6" paint-order="stroke" font-family="'Courier New',monospace">${fmtT(v)}</text></g>`;
      } });
    } else if (kind === 'note' || kind === 'rule' || kind === 'sticky') {
      // a sticky-note card that pops in, slightly tilted ("RULE #1" over "DON'T LOOK AT THE FLASH")
      const [, title = '', text = '', x = 800, y = 230, t0 = 0.3, t1 = dur] = itemSpec;
      const words = String(text || '').toUpperCase().split(/\s+/).filter(Boolean), lines = [];
      let cur = '';
      for (const w of words) { if (cur && (cur + ' ' + w).length > 16) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; }
      if (cur) lines.push(cur);
      const H = 70 + lines.length * 46, W = 360, tilt = ((String(text).length % 5) - 2) * 1.2;
      out.push({ screen: true, x: +x, y: +y, show: [+t0 || 0, Number.isFinite(+t1) ? +t1 : dur], svgFn: (t) => {
        const u = Math.max(0, Math.min(1, (t - (+t0 || 0)) / 0.28)), pop = u < 1 ? 0.6 + 0.4 * (1 - Math.pow(1 - u, 3)) + Math.sin(u * Math.PI) * 0.08 : 1;
        return `<g transform="rotate(${tilt}) scale(${pop.toFixed(3)})"><rect x="${-W / 2 + 6}" y="${-H / 2 + 8}" width="${W}" height="${H}" fill="#000" opacity=".35"/><rect x="${-W / 2}" y="${-H / 2}" width="${W}" height="${H}" fill="#f6e27a"/><rect x="-46" y="${-H / 2 - 12}" width="92" height="24" fill="#fff" opacity=".55" transform="rotate(-3)"/>`
          + (title ? `<text x="0" y="${-H / 2 + 40}" text-anchor="middle" font-size="24" font-weight="800" fill="#c0392b" font-family="Arial,sans-serif" letter-spacing="2">${escXml(String(title).toUpperCase())}</text>` : '')
          + lines.map((l, i) => `<text x="0" y="${-H / 2 + (title ? 84 : 58) + i * 46}" text-anchor="middle" font-size="40" font-weight="900" fill="#1c1c21" font-family="Arial Black,Arial,sans-serif">${escXml(l)}</text>`).join('') + '</g>';
      } });
    } else if (kind === 'phone') {
      // a phone screen: the time, then notifications sliding in one by one
      const [, clock = '9:41', rows = [], x = 800, y = 420, t0 = 0.2, t1 = dur] = itemSpec;
      const list = (Array.isArray(rows) ? rows : [rows]).map((r) => String(r)).slice(0, 5);
      out.push({ screen: true, x: +x, y: +y, show: [+t0 || 0, Number.isFinite(+t1) ? +t1 : dur], svgFn: (t) => {
        const u = Math.max(0, Math.min(1, (t - (+t0 || 0)) / 0.35)), rise = (1 - (1 - Math.pow(1 - u, 3))) * 120;
        let o = `<g transform="translate(0 ${rise.toFixed(1)}) scale(.8)" opacity="${u.toFixed(2)}"><rect x="-150" y="-280" width="300" height="560" rx="38" fill="#111" stroke="#3a3d44" stroke-width="6"/><rect x="-136" y="-266" width="272" height="532" rx="28" fill="#2a2f6b"/><rect x="-40" y="-258" width="80" height="18" rx="9" fill="#000"/>`
          + `<text x="0" y="-150" text-anchor="middle" font-size="76" font-weight="300" fill="#fff" font-family="Arial,sans-serif">${escXml(String(clock))}</text>`;
        list.forEach((r, i) => {
          const tin = (+t0 || 0) + 0.5 + i * 0.55, k = Math.max(0, Math.min(1, (t - tin) / 0.25));
          if (k <= 0) return;
          const yy = -110 + i * 74;
          o += `<g opacity="${k.toFixed(2)}" transform="translate(${((1 - k) * 60).toFixed(1)} 0)"><rect x="-124" y="${yy}" width="248" height="62" rx="14" fill="#fff" opacity=".92"/><circle cx="-98" cy="${yy + 31}" r="13" fill="${i === 0 ? '#e74c3c' : '#f39c12'}"/><text x="-76" y="${yy + 38}" font-size="19" font-weight="700" fill="#1c1c21" font-family="Arial,sans-serif">${escXml(r.length > 22 ? r.slice(0, 21) + '…' : r)}</text></g>`;
        });
        return o + '</g>';
      } });
    } else if (kind === 'choice' || kind === 'options') {
      // two answer cards, A and B, popping in one after the other (a cliffhanger or a decision)
      const [, a = 'OPTION A', b = 'OPTION B', t0 = 0.3, t1 = dur, x = 800, y = 430] = itemSpec;   // between the face and the captions
      out.push({ screen: true, x: +x, y: +y, show: [+t0 || 0, Number.isFinite(+t1) ? +t1 : dur], svgFn: (t) => {
        const card = (L, txt, i) => { const k = Math.max(0, Math.min(1, (t - (+t0 || 0) - i * 0.45) / 0.25)); if (k <= 0) return ''; const yy = i * 92;
          return `<g opacity="${k.toFixed(2)}" transform="translate(0 ${yy}) scale(${(0.85 + 0.15 * k).toFixed(3)})"><rect x="-220" y="-36" width="440" height="72" rx="10" fill="#14161c" stroke="${i ? '#ffd54a' : '#e74c3c'}" stroke-width="4"/><rect x="-206" y="-22" width="44" height="44" rx="6" fill="${i ? '#ffd54a' : '#e74c3c'}"/><text x="-184" y="13" text-anchor="middle" font-size="30" font-weight="900" fill="#111" font-family="Arial,sans-serif">${L}</text><text x="-146" y="12" font-size="${txt.length > 20 ? 22 : 28}" font-weight="800" fill="#fff" font-family="Arial,sans-serif">${escXml(txt.toUpperCase())}</text></g>`; };
        return card('A', String(a), 0) + card('B', String(b), 1);
      } });
    } else if (kind === 'tag' || kind === 'labeltag') {
      const extra = trailingOpts(itemSpec, 2);
      const [, text, x = 1320, y = 110, from = 0.25, to = Math.max(2, dur - 0.3)] = itemSpec;
      if (typeof env.labelTag === 'function') {
        pushItem(env.labelTag(String(text || ''), { x, y, from, to, ...extra }));
      }
    } else if (kind === 'counter') {
      const extra = trailingOpts(itemSpec, 4);
      const [, a = 0, b = 100, prefix = '', suffix = '', x = 800, y = 160, t0 = 0.6, t1 = Math.max(2, dur - 0.5), color = '#6fe08a'] = itemSpec;
      if (typeof env.counter === 'function') {
        pushItem(env.counter(a, b, { prefix, suffix, x, y, t0, t1, color, ...extra }));
      }
    } else if (kind === 'year') {
      const extra = trailingOpts(itemSpec, 3);
      const [, a = 2000, b = 2026, x = 1320, y = 130, t0 = 0.3, t1 = Math.max(2, dur - 0.4)] = itemSpec;
      if (typeof env.year === 'function') {
        pushItem(env.year(a, b, { x, y, t0, t1, ...extra }));
      }
    } else if (kind === 'typewriter') {
      const extra = trailingOpts(itemSpec, 2);
      const [, text = '', x = 800, y = 450, size = 56, t0 = 0.2, speed = 18, color = '#e8e6e0'] = itemSpec;
      if (typeof env.typewriter === 'function') {
        pushItem(env.typewriter(String(text), { x, y, size, t0, speed, color, ...extra }));
      } else {
        out.push({
          screen: true,
          x,
          y,
          show: [t0, 999],
          svgFn: (t) => {
            const n = Math.min(String(text).length, Math.floor((t - t0) * speed));
            return `<text text-anchor="middle" font-size="${size}" fill="${color}">${String(text).slice(0, Math.max(0, n))}</text>`;
          },
        });
      }
    } else if (kind === 'clock') {
      const extra = trailingOpts(itemSpec, 3);
      const [, x = 320, y = 230, scale = 1.2, speed = 180, t0 = 0.15, t1 = 999] = itemSpec;
      const faceSvg = (typeof env.clockFace === 'function' && env.clockFace(60)) || (typeof env.icon === 'function' && env.icon('clock')) || '<circle r="56" fill="#fffdf5" stroke="#222" stroke-width="6"/>';
      const handSvg = (typeof env.clockHand === 'function' && env.clockHand(42, 6, extra.color || '#222')) || '<path d="M0,6 V-42" stroke="#222" stroke-width="6" stroke-linecap="round"/>';
      const hourSvg = (typeof env.clockHand === 'function' && env.clockHand(28, 7, extra.hourColor || '#b3261e')) || '<path d="M0,4 V-28" stroke="#b3261e" stroke-width="7" stroke-linecap="round"/>';
      const easeFn = typeof env.ease === 'function' ? env.ease : (k) => Math.min(1, Math.max(0, k));
      const popAt = (t) => Math.min(t < t0 ? 0 : easeFn((t - t0) / 0.28), t1 < 900 ? easeFn((t1 - t) / 0.25) : 1);
      const layer = extra.layer || 'back';
      out.push({ svg: faceSvg, x, y, scale, layer, show: [t0, t1], animate: (t) => ({ opacity: popAt(t) }) });
      out.push({ svg: hourSvg, x, y, scale, layer, show: [t0, t1], animate: (t) => ({ opacity: popAt(t), rot: t * speed * 0.12 }) });
      out.push({ svg: handSvg, x, y, scale, layer, show: [t0, t1], animate: (t) => ({ opacity: popAt(t), rot: t * speed }) });
    } else if (kind === 'slide') {
      const extra = trailingOpts(itemSpec, 6);
      const [, asset, x0 = 200, y0 = 500, x1 = 1400, y1 = 500, t0 = 0.2, t1 = Math.max(1.5, dur - 0.3)] = itemSpec;
      const svg = resolvePropAsset(asset, env);
      if (typeof env.slide === 'function') {
        pushItem(env.slide(svg, { x0, y0, x1, y1, t0, t1, ...extra }));
      } else {
        out.push({
          svg,
          x: x0,
          y: y0,
          layer: extra.layer || 'back',
          show: [t0, extra.hide ?? 999],
          animate: (t) => {
            const k = Math.min(1, Math.max(0, (t - t0) / Math.max(0.1, t1 - t0)));
            return { x: (x1 - x0) * k, y: (y1 - y0) * k, opacity: 1 };
          },
        });
      }
    } else if (kind === 'puffs') {
      const extra = trailingOpts(itemSpec, 4);
      const [, x = 800, y = 700, t0 = 0.4, t1 = Math.max(2, dur - 0.4), n = 12, color = '#e8e6e0', size = 28] = itemSpec;
      if (typeof env.puffs === 'function') {
        pushItem(env.puffs({ x, y, t0, t1, n, color, size, ...extra }));
      }
    } else if (kind === 'spot') {
      const extra = trailingOpts(itemSpec, 4);
      const [, x = 800, y = 500, r = 280, color = '#fff6c8', t0 = 0.1, t1 = 999, op = 0.45] = itemSpec;
      if (typeof env.spot === 'function') {
        pushItem(env.spot(x, y, r, { color, t0, t1, op, ...extra }));
      }
    } else if (kind === 'dim') {
      const extra = trailingOpts(itemSpec, 2);
      const [, opacity = 0.48, t0 = 0.2, t1 = 999] = itemSpec;
      if (typeof env.dim === 'function') {
        pushItem(env.dim({ opacity, t0, t1, ...extra }));
      }
    } else if (kind === 'glow') {
      const extra = trailingOpts(itemSpec, 3);
      const [, x = 800, y = 420, r = 240, color = '#ffd76b', op = 0.45, t0 = 0, t1 = 999] = itemSpec;
      const gSvg = typeof env.glow === 'function' ? env.glow(0, 0, r, color, op) : `<circle r="${r}" fill="${color}" opacity="${op}"/>`;
      out.push({
        svg: gSvg,
        x,
        y,
        layer: extra.layer || 'back',
        show: [t0, t1],
        animate: (t) => ({ scale: 1 + 0.04 * Math.sin(t * 2.4), opacity: 0.9 + 0.1 * Math.sin(t * 2.4) }),
      });
    } else if (kind === 'rec') {
      const [, x = 800, y = 450, t0 = 0, t1 = 999] = itemSpec;
      out.push({
        screen: true,
        x,
        y,
        show: [t0, t1],
        svgFn: (t) => {
          const blink = ((t * 2) | 0) % 2 === 0 ? 1 : 0.25;
          return '<path d="M-720,-340 V-390 H-670 M670,-390 H720 V-340 M-720,340 V390 H-670 M670,390 H720 V340" fill="none" stroke="#fff" stroke-width="6" opacity=".82"/>'
            + '<path d="M-24,0 H24 M0,-24 V24" stroke="#fff" stroke-width="3" opacity=".45"/>'
            + `<circle cx="-630" cy="-348" r="14" fill="#ef4444" opacity="${blink}"/><text x="-604" y="-338" font-size="28" font-weight="900" fill="#fff" font-family="Arial">REC</text>`;
        },
      });
    } else if (kind === 'collage') {
      const extra = trailingOpts(itemSpec, 3);
      const [, headlines = ['BREAKING', 'CRISIS', 'THE TRUTH'], x = 800, y = 440, t0 = 0.3, dt = 0.55] = itemSpec;
      const rots = [-9, 7, -4, 11, -6];
      const offsets = [[-220, -40], [210, -25], [-40, 45], [-260, 70], [230, 60]];
      const list = Array.isArray(headlines) ? headlines : [String(headlines)];
      list.slice(0, 5).forEach((hd, idx) => {
        const paperSvg = (env.icon && env.icon('newspaper', String(hd))) || `<rect x="-100" y="-120" width="200" height="240" fill="#f4efe3" stroke="#222" stroke-width="6"/><text y="0" text-anchor="middle" font-size="24" fill="#111">${String(hd)}</text>`;
        const ti = t0 + idx * dt;
        const [ox, oy] = offsets[idx % offsets.length];
        const easeFn = typeof env.ease === 'function' ? env.ease : (k) => Math.min(1, Math.max(0, k));
        out.push({
          svg: paperSvg,
          x: x + ox,
          y: y + oy,
          scale: extra.scale ?? 0.9,
          layer: 'front',
          show: [ti, 999],
          animate: (t) => {
            const k = easeFn((t - ti) / 0.28);
            return { opacity: k, scale: 1.25 - 0.25 * k, rot: rots[idx % rots.length] + (1 - k) * 18 };
          },
        });
      });
    } else if (kind === 'chart' || kind === 'chartline') {
      const extra = trailingOpts(itemSpec, 2);
      const [, vals = [1, 2, 4, 8], x = 1180, y = 360, w = 280, h = 140, label = '', t0 = 0.5, t1 = Math.max(2, dur - 0.4)] = itemSpec;
      if (typeof env.chartLine === 'function') {
        pushItem(env.chartLine(vals, { x, y, w, h, label, t0, t1, screen: false, ...extra }));
      }
    } else if (kind === 'bars') {
      const extra = trailingOpts(itemSpec, 2);
      const [, vals = [20, 50, 90], labels = [], x = 1180, y = 400, t0 = 0.5] = itemSpec;
      if (typeof env.bars === 'function') {
        pushItem(env.bars(vals, { labels, x, y, t0, ...extra }));
      }
    } else if (kind === 'bubble') {
      const extra = trailingOpts(itemSpec, 3);
      const [, text, x = 760, y = 290, bKind = 'say', t0 = 0.8, t1 = Math.max(2, dur - 0.4)] = itemSpec;
      if (typeof env.bubble === 'function') {
        pushItem(env.bubble(String(text || ''), { x, y, kind: bKind, t0, t1, ...extra }));
      }
    } else if (kind === 'bullets') {
      const extra = trailingOpts(itemSpec, 2);
      const [, list = [], x = 420, y = 280, t0 = 0.5] = itemSpec;
      if (typeof env.bullets === 'function') {
        pushItem(env.bullets(list, { x, y, t0, ...extra }));
      }
    } else if (kind === 'fly') {
      const extra = trailingOpts(itemSpec, 4);
      const [, asset, n = 6, x0 = 600, y0 = 600, x1 = 1150, y1 = 620, t0 = 1.2] = itemSpec;
      if (typeof env.flyMany === 'function') {
        pushItem(env.flyMany(resolvePropAsset(asset, env), n, { x0, y0, x1, y1, t0, gap: 0.28, scale: 0.55, ...extra }));
      }
    } else if (kind === 'stack') {
      const extra = trailingOpts(itemSpec, 3);
      const [, asset, n = 5, x = 1150, y = 760, t0 = 0.6] = itemSpec;
      if (typeof env.stackUp === 'function') {
        pushItem(env.stackUp(resolvePropAsset(asset, env), n, { x, y, t0, scale: 0.65, ...extra }));
      }
    } else if (kind === 'rocket') {
      const extra = trailingOpts(itemSpec, 3);
      const [, label = '', x = 800, t0 = 0.8, t1 = Math.max(2.6, dur - 0.5)] = itemSpec;
      if (typeof env.rocketLaunch === 'function') {
        pushItem(env.rocketLaunch({ label, x, t0, t1, scale: 1.2, ...extra }));
      }
    } else if (kind === 'confetti') {
      const [, n = 30, t0 = 1.5] = itemSpec;
      if (typeof env.confetti === 'function') pushItem(env.confetti(n, { t0 }));
    } else if (kind === 'flashes') {
      const [, n = 12, t0 = 0.8, t1 = 999] = itemSpec;
      if (typeof env.flashes === 'function') pushItem(env.flashes(n, { t0, t1 }));
    } else if (kind === 'speed' || kind === 'speedlines') {
      const [, n = 16, t0 = 0.4, t1 = dur] = itemSpec;
      if (typeof env.speedLines === 'function') pushItem(env.speedLines(n, { show: [t0, t1] }));
    } else if (kind === 'photo' || kind === 'picture') {
      // Realistic mode: ['photo','fact:Nvidia logo', x, y, w, h, t0, t1, {label, kb, fit, frame, screen, layer}]
      const extra = trailingOpts(itemSpec, 3);
      // short form: ['photo', tag, t0, t1, {label}] (the app places the picture itself)
      const shortForm = typeof itemSpec[2] === 'number' && (itemSpec[4] === undefined || (itemSpec[4] && typeof itemSpec[4] === 'object')) && itemSpec.length <= 5;
      const [, tag, x = 800, y = 330, w = 640, h = 360, t0 = 0.4, t1] = shortForm ? [itemSpec[0], itemSpec[1], 800, 330, 640, 360, itemSpec[2], itemSpec[3]] : itemSpec;
      const tg = String(tag || '').trim();
      if (tg) {
        const end = typeof t1 === 'number' ? t1 : typeof extra.t1 === 'number' ? extra.t1 : 999;
        out.push({
          ...extra,
          photo: tg,
          x,
          y,
          w,
          h,
          layer: extra.layer || 'back',
          show: [Math.max(0, Number(t0) || 0), end],
        });
      }
    } else if (kind === 'brand') {
      const extra = trailingOpts(itemSpec, 3);
      const [, logoKey, x = 1120, y = 260, w = 320, h = 130, bg = '#0f172a', t0 = 0.4] = itemSpec;
      const logoSvg =
        (env.LOGO && typeof env.LOGO[logoKey] === 'function' && env.LOGO[logoKey]()) ||
        resolvePropAsset(logoKey, env);
      if (typeof env.brandSign === 'function') {
        pushItem(env.brandSign(logoSvg, { x, y, w, h, bg, t0, glow: true, ...extra }));
      } else {
        out.push({ svg: logoSvg, x, y, scale: 1, animate: () => ({ opacity: 1 }) });
      }
    } else if (kind === 'animal' || kind === 'creature' || kind === 'pet') {
      // an animal the app draws and animates itself (public/creatures.js): ['animal','dog',x,ground,scale,t0,'run',{to, t2, chase, dx, bark, color, t1}]
      const extra = trailingOpts(itemSpec, 3);
      const [, who = 'dog', x0 = 1100, gy = 800, scale = 1, t0n = 0, motion = 'idle'] = itemSpec;
      const ck = creatureKind(who) || 'dog';
      const t0 = Number.isFinite(+t0n) ? +t0n : 0;
      const t1 = Number.isFinite(+extra.t1) ? +extra.t1 : 999;
      let m = String(typeof motion === 'string' ? motion : extra.gait || 'idle').toLowerCase();
      if (m === 'chase') m = 'run';
      const chase = extra.chase || extra.follow || '';
      const fdx = Number(extra.dx ?? (chase ? -300 : 0));
      let to = Array.isArray(extra.to) ? Number(extra.to[0]) : Number.isFinite(+extra.to) ? +extra.to : null;
      const moving = m === 'walk' || m === 'run';
      if (to === null && moving && !chase) to = Number(x0) + (Number(x0) > 800 ? -1 : 1) * (m === 'run' ? 900 : 520);
      const t2 = Number.isFinite(+extra.t2) ? +extra.t2 : t0 + (to !== null ? Math.max(1.2, Math.abs(to - x0) / (m === 'run' ? 520 : 220)) : 0);
      const facing = extra.face === 'left' || extra.facing === -1 ? -1 : extra.face === 'right' || extra.facing === 1 ? 1 : chase ? (extra.near ? (fdx < 0 ? 1 : -1) : (fdx < 0 ? 1 : -1)) : to !== null ? (to >= x0 ? 1 : -1) : (Number(x0) > 800 ? -1 : 1);
      const barks = (Array.isArray(extra.bark) ? extra.bark : extra.bark !== undefined ? [extra.bark] : []).map(Number).filter(Number.isFinite);
      const ez = (u) => { u = Math.max(0, Math.min(1, u)); return u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; };
      const gaitAt = (t) => {
        if (barks.some((b) => t >= b && t < b + .9)) return 'bark';
        if (chase && !extra.near) return m === 'idle' ? 'run' : m;
        if (to !== null && t >= t0 && t < t2) return m === 'idle' ? 'walk' : m;
        if (to !== null) return extra.then || 'idle';
        return m;
      };
      const seed = String(who).length * 7 + Math.round(Number(x0) || 0);
      pushItem({
        svgFn: (t) => creatureSvg(ck, { t: t + seed * .37, gait: gaitAt(t), facing, color: extra.color, belly: extra.belly, seed, mood: extra.mood }),
        x: Number(x0), y: Number(gy) || 800, scale: Number(scale) || 1, layer: extra.layer || 'front', _creature: ck, _who: extra.id || ck,
        ...(chase ? { follow: String(chase), fdx, fdy: Number(extra.dy ?? 0), leash: '', flipWith: false } : {}),
        ...(t0 > 0 || t1 < 900 ? { show: [Math.max(0, t0 - .02), t1] } : {}),
        animate: (t) => ({ x: to !== null && !chase ? (to - x0) * ez((t - t0) / Math.max(.2, t2 - t0)) : 0, opacity: t1 < 900 ? Math.max(0, Math.min(1, (t1 - t) / .2)) : 1 }),
      });
    } else if (kind === 'svg') {
      const extra = trailingOpts(itemSpec, 3);
      const [, keyOrSvg, x = 800, y = 500, scale = 1, t0 = 0.25, motion = 'float', maybeT1] = itemSpec;
      const svg = resolvePropAsset(keyOrSvg, env);
      const easeFn = typeof env.ease === 'function' ? env.ease : (k) => Math.min(1, Math.max(0, k));
      const t1 = typeof extra.t1 === 'number' ? extra.t1 : typeof maybeT1 === 'number' ? maybeT1 : 999;
      const m = String(typeof motion === 'string' ? motion : extra.motion || 'float').toLowerCase();
      const propObj = {
        svg,
        x,
        y,
        scale,
        // hold:'amara' = in her hand, wear:'amara' (+ at:'waist'|'head'|'back'|'shoulder'|'neck') = on her body; both move with her
        ...((extra.hold || extra.wear) && !extra.follow ? { follow: String(extra.hold || extra.wear), fat: String(extra.at || (extra.hold ? 'hand' : 'waist')), fdx: Number(extra.dx ?? (extra.hold ? 55 : 0)), fdy: Number(extra.dy ?? 0), leash: '', flipWith: extra.flip !== false } : {}),
        ...(extra.follow ? { follow: String(extra.follow), fdx: Number(extra.dx ?? 150), fdy: Number(extra.dy ?? 0), leash: extra.leash ? (extra.leash === true ? '#3a2a1e' : String(extra.leash)) : '', leashAt: Array.isArray(extra.leashAt) ? extra.leashAt : [0, -60], flipWith: extra.flip !== false } : {}),
        layer: extra.layer || (extra.follow || extra.hold || extra.wear ? 'front' : 'back'),
        ...(extra.par !== undefined ? { par: extra.par } : {}),
        ...(extra.screen !== undefined ? { screen: extra.screen } : {}),
        ...(t1 < 900 || t0 > 0 ? { show: [Math.max(0, t0 - 0.05), t1] } : {}),
        animate: (t) => {
          const popIn = t < t0 ? 0 : easeFn((t - t0) / 0.28);
          const popOut = t1 < 900 ? easeFn((t1 - t) / 0.25) : 1;
          const pop = Math.min(popIn, popOut);
          // move: from (x, y) to extra.to:[x1, y1] between t0 and extra.t2 (or t1); trot: a walking animal or rolling thing (bob + rock);
          // jump: an arc over something (extra.h = height); sneak: low and slow, a little lean
          const tEnd = typeof extra.t2 === 'number' ? extra.t2 : t1 < 900 ? t1 : t0 + 2;
          const mk = Math.max(0, Math.min(1, (t - t0) / Math.max(0.1, tEnd - t0))), me = mk * mk * (3 - 2 * mk);
          const to = Array.isArray(extra.to) ? extra.to : null;
          const mx = to ? ((+to[0] || x) - x) * (m === 'move' || m === 'trot' || m === 'jump' || m === 'sneak' ? (m === 'jump' ? mk : me) : 0) : 0;
          const my = to ? ((Number.isFinite(+to[1]) ? +to[1] : y) - y) * (m === 'move' || m === 'trot' || m === 'jump' || m === 'sneak' ? me : 0) : 0;
          const trot = m === 'trot' ? -Math.abs(Math.sin(t * 9)) * (extra.amp ?? 10) : 0;
          const jump = m === 'jump' ? -Math.sin(Math.PI * mk) * (extra.h ?? 220) : 0;
          return {
            opacity: pop * (extra.opacity ?? 1),
            scale: (m === 'trot' || m === 'move' || m === 'jump' || m === 'sneak' ? 1 : 0.72 + 0.28 * pop) + (m === 'pulse' ? Math.sin(t * 4) * 0.05 : 0),
            y: (m === 'float' ? Math.sin(t * 2.2) * (extra.amp ?? 8) : m === 'drop' ? (1 - pop) * -80 : 0) + my + trot + jump,
            x: (m === 'slider' ? (1 - pop) * -90 : m === 'slidel' ? (1 - pop) * 90 : 0) + mx,
            rot: (extra.rot || 0) + (m === 'spin' ? t * (extra.speed ?? 40) : 0) + (m === 'trot' ? Math.sin(t * 9) * 3 : 0) + (m === 'jump' ? (mk - 0.5) * 30 : 0) + (m === 'sneak' ? 6 : 0),
          };
        },
      };
      out.push(propObj);
    }
  }

  // Layer automatic subtle 3-channel ambient life matched to scene mood & backdrop (unless opt-out or pure black graphic card)
  if (opts.ambient !== false) {
    const moodKey = String(mood || '').toLowerCase();
    const locKey = String(setKey || '').toLowerCase();
    const effectiveMood =
      moodKey ||
      (locKey === 'space'
        ? 'space'
        : locKey === 'rooftop' || locKey === 'cityday'
          ? 'city'
          : locKey === 'street'
            ? 'night'
            : 'city');

    if (!isBlackBg) {
      if ((effectiveMood === 'rain' || effectiveMood === 'storm') && typeof env.rain === 'function') {
        pushItem(env.rain(48, {}));
      }
      if (
        typeof env.clouds === 'function' &&
        (effectiveMood === 'city' || effectiveMood === 'warm' || effectiveMood === 'calm' || effectiveMood === 'rain' || effectiveMood === 'storm' || locKey === 'rooftop' || locKey === 'cityday')
      ) {
        pushItem(env.clouds(3, { color: effectiveMood === 'warm' || locKey === 'rooftop' ? '#ffc4d6' : '#94a3b8', layer: 'back' }));
      }
      if (
        typeof env.twinkles === 'function' &&
        (effectiveMood === 'night' || effectiveMood === 'space' || effectiveMood === 'hype' || effectiveMood === 'tense' || locKey === 'street' || locKey === 'space')
      ) {
        pushItem(env.twinkles(effectiveMood === 'space' ? 50 : 18, { color: effectiveMood === 'hype' ? '#ffd54a' : '#dbeafe' }));
      }
      if (typeof env.dust === 'function') {
        pushItem(env.dust(12, { x0: 260, x1: 1340, y0: 140, y1: 680 }));
      }
    } else if (effectiveMood === 'space' && typeof env.twinkles === 'function') {
      pushItem(env.twinkles(45, {}));
    }
  }

  return out;
}

function resolveBeatFlash(rawFlash, mood) {
  if (typeof rawFlash === 'function') return rawFlash;
  if (rawFlash === false) return undefined;
  if (rawFlash === true) {
    return (t) => (t >= 0 && t < 0.16 ? 0.72 * (1 - t / 0.16) : 0);
  }
  if (typeof rawFlash === 'number' && Number.isFinite(rawFlash)) {
    const t0 = Math.max(0, rawFlash);
    return (t) => (t >= t0 && t < t0 + 0.18 ? 0.74 * (1 - (t - t0) / 0.18) : 0);
  }
  if (Array.isArray(rawFlash)) {
    const t0 = Number(rawFlash[0]) || 0;
    const span = Math.max(0.06, Number(rawFlash[1]) || 0.18);
    const peak = Math.min(1, Math.max(0.1, Number(rawFlash[2]) || 0.75));
    return (t) => (t >= t0 && t < t0 + span ? peak * (1 - (t - t0) / span) : 0);
  }
  if (String(mood || '').toLowerCase() === 'storm') {
    return (t) => (t >= 1.8 && t < 1.95 ? 0.42 * (1 - (t - 1.8) / 0.15) : 0);
  }
  return undefined;
}

/**
 * Expand a compact documentary `beat({...})` call into a complete high-craft Animato `scene({...})`
 * object with 3-plane backdrop, auto ambient motion, multi-phase acting, toolkit/custom props,
 * dynamic camera choreography, chapter cards, flash envelopes, and auto-sliced karaoke captions.
 */
const escXml = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function expandCompactBeat(spec = {}, env = {}, onEmitScene = null) {
  const s = spec && typeof spec === 'object' ? spec : {};
  // word anchors: 'grab@"towel"', face:'calm@0->scared@"suddenly"', shot:'feet:hero@0->low:guard@"hefty"' become seconds (public/shots.js)
  try { anchorBeat(s); } catch (e) { /* a malformed beat keeps its own times */ }
  const narration = typeof s.say === 'string' ? s.say : typeof s.narration === 'string' ? s.narration : '';
  const wordCount = narration.trim() ? narration.trim().split(/\s+/).length : 0;
  const rawDur = s.d ?? s.duration;
  const duration =
    typeof rawDur === 'number' && rawDur > 0
      ? rawDur
      : wordCount > 0
        ? Math.max(3.5, Math.round((wordCount / 2.65 + 0.55) * 10) / 10)
        : 5;

  // 1. Resolve backdrop (`SETS[key]`, `LOC[key]()`, `BGP[key]`, `'BLACK'`, `chapter:true`, or raw SVG)
  const isChapterCard = Boolean(s.chapter);
  const rawSet = s.s !== undefined ? s.s : s.bg !== undefined ? s.bg : s.background !== undefined ? s.background : isChapterCard ? 'BLACK' : undefined;
  let background = '';
  let isBlackBg = false;
  let setKeyName = '';
  if (typeof rawSet === 'function') {
    background = rawSet();
  } else if (typeof rawSet === 'string') {
    const k = rawSet.trim();
    setKeyName = k;
    if (/^black$/i.test(k)) {
      isBlackBg = true;
      background = env.BLACK || '<rect width="1600" height="900" fill="#000"/>';
    } else if (typeof env.realSceneTag === 'function' && !s.chapter && env.realSceneTag(k, s.m || s.mood || '')) {
      background = env.realSceneTag(k, s.m || s.mood || '');   // Realistic mode picked: a drawn location word becomes a found 2D background of that place
    } else if (/^(photo\s*:\s*)?(my|mine)\s*:/i.test(k)) {
      background = k;   // the person's own saved picture ('my:Classroom'); the app draws it (public/my-backgrounds.js)
    } else if (/^photo\s*:/i.test(k)) {
      background = k;   // Realistic mode: a picture tag ('photo:mood:rainy neon street'). The app finds the real picture (public/photo-store.js).
    } else if (k.startsWith('<')) {
      background = k;
    } else if (env.SETS && typeof env.SETS[k] === 'function') {
      background = env.SETS[k]();
    } else if (env.SETS && typeof env.SETS[k] === 'string') {
      background = env.SETS[k];
    } else if (k.startsWith('stage:') && env.LOC && typeof env.LOC.stage === 'function') {
      background = env.LOC.stage(k.slice(6));
    } else if (env.LOC && typeof env.LOC[k] === 'function') {
      background = env.LOC[k]();
    } else if (env.BGP && typeof env.BGP[k] === 'string') {
      background = env.BGP[k];
    } else if (typeof env[k] === 'function') {
      background = env[k]();
    } else if (typeof env[k] === 'string' && env[k].includes('<')) {
      background = env[k];
    }
  }
  if (!background) {
    background = (env.LOC && typeof env.LOC.cityDay === 'function' && env.LOC.cityDay()) || (env.BGP && env.BGP.outdoor) || '<rect width="1600" height="900" fill="#1e293b"/>';
  }

  // 2. Resolve actors (`a` or `characters`)
  const rawActors = s.a !== undefined ? s.a : s.actors !== undefined ? s.actors : s.characters;
  const characters = [];
  for (const entry of Array.isArray(rawActors) ? rawActors : []) {
    const resolved = resolveActorSpec(entry, env, duration);
    characters.push(...resolved);
  }

  // 3. Resolve mood tint, light override, props (`p` or `props` + `fx`)
  const mood = s.m || s.mood || '';
  const moodTintMap = {
    tense: ['#0f1f3a', 0.16],
    cold: ['#102542', 0.14],
    night: ['#080e24', 0.18],
    space: ['#05091a', 0.14],
    rain: ['#0d192b', 0.2],
    storm: ['#0b1322', 0.24],
    warm: ['#ff9d42', 0.08],
    hype: ['#ffd54a', 0.06],
    dark: ['#000000', 0.22],
  };
  const tint = Array.isArray(s.tint) ? s.tint : moodTintMap[String(mood).toLowerCase()] || undefined;
  // scenery that says what the narrator says: objects the words name but the beat never showed are added at the word (public/scenery.js)
  const ownProps = s.p !== undefined ? s.p : s.props;
  const sceneryProps = s.auto === false || isChapterCard || isBlackBg || typeof env.item !== 'function' ? [] : autoProps(narration, duration, ownProps, characters);
  const props = resolveCompactProps(sceneryProps.length ? (Array.isArray(ownProps) ? ownProps.concat(sceneryProps) : sceneryProps) : ownProps, mood, isBlackBg, setKeyName, duration, env, {
    ambient: s.ambient,
  });

  if (Array.isArray(s.light)) {
    const [lx = 800, ly = 420, lr = 280, lc = '#fff6c8', lop = 0.45] = s.light;
    if (typeof env.spot === 'function') props.push(env.spot(lx, ly, lr, { color: lc, op: lop, t0: 0, t1: 999 }));
  }

  const fxList = Array.isArray(s.fx) ? s.fx : s.fx ? [s.fx] : [];
  for (const fx of fxList) {
    const f = String(fx || '').toLowerCase();
    if (f === 'confetti' && typeof env.confetti === 'function') props.push(...env.confetti(30, { t0: Math.min(duration * 0.45, 2.2) }));
    if (f === 'flashes' && typeof env.flashes === 'function') props.push(...env.flashes(12, { t0: 0.8 }));
    if (f === 'speed' && typeof env.speedLines === 'function') props.push(...env.speedLines(16, { show: [0.4, duration] }));
    if (f === 'dim' && typeof env.dim === 'function') props.push(env.dim({ t0: 0.4, opacity: 0.45 }));
    if (f === 'spot' && typeof env.spot === 'function') props.push(env.spot(characters[0]?.x || 800, 520, 320, { t0: 0.2, t1: duration }));
    if (f === 'rec') props.push(...resolveCompactProps([['rec', 800, 450, 0, 999]], mood, true, '', duration, env, { ambient: false }));
  }

  // 4. Resolve camera (`c`, `cam`, `camera` + optional `focus`)
  const rawCam = s.c !== undefined ? s.c : s.cam !== undefined ? s.cam : s.camera;
  const focusPt = Array.isArray(s.focus)
    ? s.focus
    : typeof s.focus === 'number' && characters[s.focus]
      ? [characters[s.focus].x, 450]
      : null;
  const fxTarget = focusPt
    ? Math.max(300, Math.min(1300, Number(focusPt[0]) || 800))
    : characters[0] && typeof characters[0].x === 'number'
      ? Math.max(360, Math.min(1240, characters[0].x))
      : 800;
  const fyTarget = focusPt ? Math.max(220, Math.min(680, Number(focusPt[1]) || 450)) : 450;
  const camHelper = typeof env.cam === 'function' ? env.cam : (_t, _a, _b, z0 = 1) => ({ zoom: z0, x: 800, y: 450, rot: 0 });
  const shakeFn = typeof env.shake === 'function' ? env.shake : (t, a = 5) => Math.sin(t * 31) * a * 0.7;
  let camera;
  if (typeof rawCam === 'function') {
    camera = rawCam;
  } else if (Array.isArray(rawCam) && rawCam.length >= 2) {
    const [z0 = 1, z1 = 1.15, x0 = fxTarget, y0 = 460, x1 = x0, y1 = y0, t0 = 0, t1 = duration] = rawCam;
    camera = (t) => camHelper(t, t0, t1, z0, z1, x0, y0, x1, y1);
  } else {
    // no camera written: a beat with people that lasts 4 s or more gets editor-style COVERAGE (cuts between wide, medium and close-up),
    // like the short-film references, instead of one slow push for the whole beat
    const autoKey = rawCam === undefined || rawCam === null || rawCam === '' ? (duration >= 4 && characters.length ? 'cover' : 'push') : rawCam;
    const key = String(autoKey).toLowerCase();
    if (key === 'cover' || key === 'cuts' || key === 'coverage') {
      const who = characters.filter((c) => c && typeof c === 'object' && !(c.par < 0)).slice(0, 2);
      // the centre of the face: people are about 640 units tall at scale 1, the face sits about 90 % of the way up
      const head = (c) => { const g = Number.isFinite(+c.ground) ? +c.ground : 790, sc = Number.isFinite(+c.scale) ? +c.scale : 0.84; return { x: Math.max(360, Math.min(1240, Number.isFinite(+c.x) ? +c.x : 800)), y: g - 590 * sc }; };
      const H = who.length ? who.map(head) : [{ x: fxTarget, y: 330 }];
      const seg = Math.max(1.5, Math.min(2.4, duration / Math.max(2, Math.round(duration / 2))));
      const seed = String(s.n || s.name || '').length;
      const PAT = ['medium', 'close', 'wide', 'medium2', 'close2', 'wide'];   // any three shots in a row are a medium, a close-up and a wide
      camera = (t) => {
        const k = Math.floor(t / seg), u = (t - k * seg) / seg, shot = PAT[(k + seed) % PAT.length];
        const h = H[(shot.endsWith('2') && H[1]) ? 1 : 0];
        const drift = 1 + 0.035 * u;                       // every shot still breathes a little
        if (shot.startsWith('close')) return { zoom: 1.75 * drift, x: h.x, y: Math.max(230, h.y + 95), rot: 0 };   // face in the upper third, shoulders in frame
        if (shot.startsWith('medium')) return { zoom: 1.35 * drift, x: h.x, y: Math.max(300, h.y + 200), rot: 0 };  // head to waist
        return { zoom: 1.0 * drift, x: 800, y: 450, rot: 0 };
      };
    } else if (key === 'wide') camera = (t) => camHelper(t, 0, duration, 1.0, 1.06, 800, 455, 800, 445);
    else if (key === 'pushface' || key === 'closeup' || key === 'cu') camera = (t) => camHelper(t, 0, duration, 1.15, 1.72, fxTarget, fyTarget, fxTarget, Math.max(280, fyTarget - 80));
    else if (key === 'pushslow') camera = (t) => camHelper(t, 0, duration, 1.02, 1.16, fxTarget, 460, fxTarget, 425);
    else if (key === 'crash') {
      camera = (t) => {
        const base = camHelper(t, 0, 0.32, 1.02, 1.65, 800, 460, fxTarget, Math.max(280, fyTarget - 70));
        return t >= 0.25 && t < 0.75 ? { ...base, x: (base.x ?? fxTarget) + shakeFn(t, 6) } : base;
      };
    } else if (key === 'pull' || key === 'pullout') camera = (t) => camHelper(t, 0, duration, 1.32, 1.0, fxTarget, 430, 800, 450);
    else if (key === 'zoomout') camera = (t) => camHelper(t, 0, duration, 1.55, 1.0, fxTarget, 410, 800, 450);
    else if (key === 'panr' || key === 'dollyr') camera = (t) => camHelper(t, 0, duration, 1.14, 1.16, 600, 460, 1000, 460);
    else if (key === 'panl' || key === 'dollyl') camera = (t) => camHelper(t, 0, duration, 1.14, 1.16, 1000, 460, 600, 460);
    else if (key === 'dolly') camera = (t) => camHelper(t, 0, duration, 1.12, 1.2, Math.max(480, fxTarget - 140), 460, Math.min(1120, fxTarget + 140), 445);
    else if (key === 'whipr') camera = (t) => camHelper(t, 0, Math.min(0.45, duration * 0.25), 1.06, 1.24, 500, 455, fxTarget, 445);
    else if (key === 'whipl') camera = (t) => camHelper(t, 0, Math.min(0.45, duration * 0.25), 1.06, 1.24, 1100, 455, fxTarget, 445);
    else if (key === 'heroup') camera = (t) => camHelper(t, 0, duration, 1.18, 1.32, fxTarget, 590, fxTarget, 390);
    else if (key === 'hold' || key === 'static') camera = (t) => ({ zoom: 1.04, x: fxTarget + Math.sin(t * 0.4) * 2, y: 452, rot: 0 });
    else if (key === 'drama') camera = (t) => camHelper(t, 0, duration, 1.05, 1.48, fxTarget, 470, fxTarget, 380);
    else if (key === 'shake') {
      camera = (t) => ({ zoom: 1.1 + t * 0.015, x: fxTarget + shakeFn(t, 5), y: 450, rot: 0 });
    } else {
      camera = (t) => camHelper(t, 0, duration, 1.0, 1.22, fxTarget, 465, fxTarget, 430);
    }
  }

  // 5. Resolve captions (`cap` / `captions` or auto-karaoke chunks + `chapter` / `capPos` + optional `topNote`)
  const rawCaps = Array.isArray(s.cap) ? s.cap : Array.isArray(s.captions) ? s.captions : null;
  let captions;
  if (rawCaps && rawCaps.length) {
    captions = rawCaps;
  } else if (isChapterCard || s.capPos === 'center') {
    captions = narration.trim()
      ? [{ from: 0.2, to: Math.max(1.2, duration - 0.2), text: narration.trim(), pos: 'center', ...(s.capColor ? { color: s.capColor } : {}), ...(s.capSize ? { size: s.capSize } : {}) }]
      : [];
  } else {
    captions = buildAutoCaptions(narration, duration);
    if (s.capPos === 'top' || s.capColor || s.capSize) {
      captions = captions.map((c) => ({
        ...c,
        ...(s.capPos ? { pos: s.capPos } : {}),
        ...(s.capColor ? { color: s.capColor } : {}),
        ...(s.capSize ? { size: s.capSize } : {}),
      }));
    }
  }

  if (s.topNote) {
    if (Array.isArray(s.topNote)) {
      captions.push({
        from: Number(s.topNote[1]) ?? 0.3,
        to: Number(s.topNote[2]) ?? Math.max(2, duration - 0.3),
        text: String(s.topNote[0] || ''),
        pos: 'top',
        color: s.topNote[3] || '#ffd54a',
      });
    } else {
      captions.push({
        from: 0.3,
        to: Math.max(2, duration - 0.3),
        text: String(s.topNote),
        pos: 'top',
        color: '#ffd54a',
      });
    }
  }

  const sceneObj = {
    _autoScenery: true,
    name: s.n || s.name || undefined,
    duration,
    narration,
    background,
    tint,
    mood: String(mood || ''),
    light: s.light !== undefined ? s.light : undefined,   // where the set's light comes from: {x, y, color} or 'left' | 'right' | 'top' | 'front' | 'back' | '#hex'. The app lights every character from it.
    cut: s.cut !== undefined ? !!s.cut : isChapterCard,
    fade: s.fade,
    flash: resolveBeatFlash(s.flash, mood),
    camera,
    props,
    characters,
    captions,
  };
  // named shots (shot:'feet:hero@0->tiltup:guard@1.4'): the director frames them on the people (public/shots.js, director.js)
  const shotTrack = s.shot !== undefined ? s.shot : s.shots;
  if (typeof shotTrack === 'string' ? shotTrack.trim() : Array.isArray(shotTrack) && shotTrack.length) sceneObj.shot = shotTrack;
  if (s.grade) sceneObj.grade = s.grade;
  if (isChapterCard) sceneObj.chapter = true;
  // what is in the scene by name (the set, the drawings, the icons): the faces read it to fit the situation (no smiles in a fire)
  try { sceneObj._things = [setKeyName].concat((Array.isArray(ownProps) ? ownProps : []).filter(Array.isArray).map((p) => (typeof p[1] === 'string' && p[1].length < 40 ? p[0] + ':' + p[1] : String(p[0])))).filter(Boolean); } catch (e) { /* only a hint */ }

  if (typeof onEmitScene === 'function') {
    onEmitScene(sceneObj);
  }
  return sceneObj;
}

/**
 * Extract statement-level `scene(...)` and `beat(...)` source spans from full scene code,
 * skipping comments, strings, method calls (`obj.scene(...)`), and `function` helper bodies
 * while scanning through batch `{ ... }` and `try { ... }` blocks.
 */
export function extractSceneBlocks(rawCode) {
  const s = String(rawCode || '');
  const blocks = [];
  let inStr = '';
  let esc = false;
  let inLine = false;
  let inBlock = false;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  const fnBraceStack = [];
  let pendingFnBody = false;
  let atStmtStart = true;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];

    if (inLine) {
      if (ch === '\n') {
        inLine = false;
        atStmtStart = true;
      }
      continue;
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === inStr) inStr = '';
      continue;
    }

    if (ch === '/' && next === '/') {
      inLine = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlock = true;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      atStmtStart = false;
      continue;
    }

    if (ch === '(') {
      parenDepth++;
      atStmtStart = false;
      continue;
    }
    if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      atStmtStart = false;
      continue;
    }
    if (ch === '[') {
      bracketDepth++;
      atStmtStart = false;
      continue;
    }
    if (ch === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      atStmtStart = false;
      continue;
    }
    if (ch === '{') {
      braceDepth++;
      if (pendingFnBody && parenDepth === 0) {
        fnBraceStack.push(braceDepth);
        pendingFnBody = false;
      }
      atStmtStart = true;
      continue;
    }
    if (ch === '}') {
      if (fnBraceStack.length && fnBraceStack[fnBraceStack.length - 1] === braceDepth) {
        fnBraceStack.pop();
      }
      braceDepth = Math.max(0, braceDepth - 1);
      atStmtStart = true;
      continue;
    }

    if (fnBraceStack.length === 0 && parenDepth === 0 && bracketDepth === 0) {
      if (ch === 'f' && s.slice(i, i + 8) === 'function' && /[\s*(]/.test(s[i + 8] || '')) {
        const prev = i > 0 ? s[i - 1] : '';
        if (!/[A-Za-z0-9_$.]/.test(prev)) {
          pendingFnBody = true;
        }
      }
      if (atStmtStart && (ch === 's' || ch === 'b')) {
        const slice = s.slice(i);
        const m = /^(scene|beat)\s*\(/.exec(slice);
        if (m) {
          const prev = i > 0 ? s[i - 1] : '';
          if (!/[A-Za-z0-9_$.]/.test(prev)) {
            const call = extractBalancedCallAt(s, i);
            if (call) {
              const nameMatch = /\b(?:name|n)\s*:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/.exec(call.text);
              const sayMatch = /\b(?:say|narration)\s*:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/.exec(call.text);
              blocks.push({
                index: blocks.length,
                kind: m[1],
                start: call.start,
                end: call.end,
                code: call.text,
                name: nameMatch ? nameMatch[2] : '',
                snippet: sayMatch ? sayMatch[2] : '',
              });
              i = call.end - 1;
              atStmtStart = true;
              continue;
            }
          }
        }
      }
    }

    if (ch === ';' || ch === '\n') {
      atStmtStart = true;
    } else if (!/\s/.test(ch)) {
      atStmtStart = false;
    }
  }

  return blocks;
}

/**
 * Clean pasted AI output for a single scene replacement (removes markdown fences, chat prose,
 * smart quotes, optional bare object literals, and validates JavaScript syntax).
 */
export function normalizeAiSceneReplacement(pastedSnippet, originalKind = 'beat') {
  let raw = String(pastedSnippet || '').trim();
  if (!raw) {
    return { ok: false, err: 'Paste the updated scene code before applying.' };
  }

  // Extract fenced code block if the AI wrapped its response in ```js ... ```
  const fenceMatch = /```(?:js|javascript|txt)?\s*\n?([\s\S]*?)```/i.exec(raw);
  if (fenceMatch && fenceMatch[1] && fenceMatch[1].trim()) {
    raw = fenceMatch[1].trim();
  }

  raw = raw.replace(/^[ \t]*(?:javascript|js)\s*\n/i, '').trim();

  // Only convert curly quotes that act as delimiters unless raw needs full normalization
  const smartNormalized = normalizeSmartQuotes(raw);
  const escapeContractions = (s) => s.replace(/([A-Za-z0-9])'(?=[A-Za-z])/g, "$1\\'");
  const tryVariants = (txt) => {
    const cands = [txt, repairSceneSyntax(txt), escapeContractions(smartNormalized), repairSceneSyntax(escapeContractions(smartNormalized)), repairSceneSyntax(smartNormalized)];
    for (const c of cands) {
      if (canCompileJs(c)) return c;
    }
    return null;
  };

  // If AI pasted a bare object `{ t: 8, ... }` instead of `beat({...})` / `scene({...})`
  if (raw.startsWith('{') && raw.endsWith('}') && !/\b(?:beat|scene)\s*\(/.test(raw)) {
    const kind = originalKind === 'scene' ? 'scene' : 'beat';
    const validBare = tryVariants(`${kind}(${raw});`);
    if (validBare) {
      return { ok: true, code: validBare };
    }
  }

  // Scan for balanced `beat(...)` / `scene(...)` calls inside prose or declarations
  let calls = extractSceneBlocks(raw);
  if (!calls.length) calls = extractSceneBlocks(smartNormalized);
  const srcForCalls = extractSceneBlocks(raw).length ? raw : smartNormalized;
  if (calls.length > 0) {
    // Keep any preceding variable/helper declarations inside a scoped block so duplicate `const` never collides
    const prelude = srcForCalls.slice(0, calls[0].start).trim();
    const afterLast = srcForCalls.slice(calls[calls.length - 1].end).trim();
    const looksLikeProse = (txt) =>
      txt &&
      !/^\s*(?:const|let|var|function|SETS\.|CAST\.|SVGS\.|\/\/|\/\*)/.test(txt) &&
      !canCompileJs(txt);

    let candidate = srcForCalls;
    if (looksLikeProse(prelude) || looksLikeProse(afterLast)) {
      candidate = calls.map((c) => c.code.replace(/;?\s*$/, ';')).join('\n\n');
    } else if (prelude) {
      // Wrap prelude + calls in `{ ... }` block so repeated edits never redeclare top-level `const`
      const core = srcForCalls.slice(0, calls[calls.length - 1].end).trim();
      candidate = `{\n${core}\n}`;
    } else {
      candidate = calls.map((c) => c.code.replace(/;?\s*$/, ';')).join('\n\n');
    }

    const validBlock = tryVariants(candidate);
    if (validBlock) {
      return { ok: true, code: validBlock };
    }
  }

  const validDirect = tryVariants(raw);
  if (validDirect) {
    if (!/\b(?:beat|scene)\s*\(/.test(validDirect)) {
      return { ok: false, err: 'Code must include a beat({...}) or scene({...}) call.' };
    }
    return { ok: true, code: validDirect };
  }

  try {
    new Function(repairSceneSyntax(smartNormalized));
  } catch (e) {
    return { ok: false, err: `Syntax error in scene code: ${e.message}` };
  }
  return { ok: false, err: 'Could not parse the pasted scene code.' };
}

/**
 * Replace a single scene block (by 0-based scene index) inside the full scene code.
 */
export function replaceSceneBlockInCode(fullCode, sceneIndex, pastedSnippet) {
  const src = String(fullCode || '');
  const blocks = extractSceneBlocks(src);
  if (!blocks.length) {
    return { ok: false, err: 'No editable scene({...}) or beat({...}) blocks found in this project.' };
  }
  const idx = Number(sceneIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= blocks.length) {
    return { ok: false, err: `Scene ${idx + 1} could not be matched cleanly in the source code.` };
  }
  const target = blocks[idx];
  const norm = normalizeAiSceneReplacement(pastedSnippet, target.kind);
  if (!norm.ok) {
    return norm;
  }

  const nextCode = src.slice(0, target.start) + norm.code + src.slice(target.end);
  return {
    ok: true,
    code: nextCode,
    replacedCode: norm.code,
    originalCode: target.code,
    originalKind: target.kind,
  };
}

/**
 * Build a concise, self-contained AI edit prompt for one specific scene from the Timeline editor.
 */
export function buildSceneAiPrompt(sceneBlock, fullCode = '', meta = {}) {
  const code = typeof sceneBlock === 'string' ? sceneBlock : (sceneBlock?.code || '');
  const kind = (typeof sceneBlock === 'object' && sceneBlock?.kind) || (/\bbeat\s*\(/.test(code) ? 'beat' : 'scene');
  const title = meta.title ? `Project: "${meta.title}"` : '';
  const style = meta.style ? `Character style: ${meta.style}` : '';
  const sceneNum = Number.isInteger(meta.sceneIndex) ? `Scene ${meta.sceneIndex + 1}` : 'This scene';

  // Detect referenced uppercase / shared constants declared earlier in fullCode
  const sharedContext = [];
  if (fullCode) {
    const declMatches = [...String(fullCode).matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)];
    const declaredNames = [...new Set(declMatches.map((m) => m[1]))];
    const usedNames = declaredNames.filter(
      (n) => !/^(SETS|CAST|SVGS)$/.test(n) && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(code)
    );
    if (usedNames.length) {
      sharedContext.push(`Defined symbols already available in scope: ${usedNames.slice(0, 12).join(', ')}`);
    }
    const setKeys = [...new Set([...code.matchAll(/\b(?:SETS|CAST|SVGS)\.([A-Za-z_$][\w$]*)/g)].map((m) => m[0]))];
    if (setKeys.length) {
      sharedContext.push(`Registry references in scope: ${setKeys.slice(0, 10).join(', ')}`);
    }
  }

  const contextLines = [title, style, ...sharedContext].filter(Boolean);
  return [
    `Update ONLY ${sceneNum} for Animato Stickman Studio below.`,
    `Requirements:`,
    `- Keep it as a single ${kind}({...}) JavaScript call (no extra scenes, no markdown explanation).`,
    `- Keep any referenced shared variables/styles listed in context unless I asked to change them.`,
    `- Escape apostrophes inside single-quoted strings (or use double quotes).`,
    contextLines.length ? `\nContext:\n${contextLines.map((l) => `- ${l}`).join('\n')}` : '',
    `\nCurrent ${sceneNum} code:\n${code}`,
    `\nMy requested change for ${sceneNum}: `,
  ]
    .filter(Boolean)
    .join('\n');
}







