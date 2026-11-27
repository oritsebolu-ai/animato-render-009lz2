// Pure audio/text synchronization utilities for Animato Stickman Studio.
// Works both in browsers (as an ES module attached to window.AnimatoSync) and in Node.js unit tests.

export function tokenizeWords(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

export function normalizeWord(word) {
  return String(word || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const NUMBER_WORD_COST = 1.6;

export function estimateSpokenWeight(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return 0;
  const words = s.split(' ');
  let weight = 0;
  for (let i = 0; i < words.length; i++) {
    const raw = words[i];
    const clean = raw.replace(/[^a-zA-Z0-9]/g, '');
    if (!clean) {
      weight += 0.15;
      continue;
    }
    if (/^\d+([.,]\d+)*$/.test(raw.replace(/[^0-9.,]/g, '')) && /\d/.test(raw)) {
      // Numbers take longer to speak (e.g. "2026" -> four digits/words)
      const digits = clean.replace(/\D/g, '').length;
      weight += 0.25 + digits * 0.28;
    } else {
      // Approximate syllable/phoneme duration
      weight += 0.22 + Math.min(14, clean.length) * 0.048;
    }
    // Punctuation pause weight
    if (/[.!?]["')\]]*$/.test(raw)) weight += 0.42;
    else if (/[,;:—–-]["')\]]*$/.test(raw)) weight += 0.22;
  }
  return Math.max(0.3, weight);
}

function splitIntoSentences(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const matches = clean.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g);
  return matches ? matches.map(s => s.trim()).filter(Boolean) : [clean];
}

function findAnchorRange(normNarr, normCap, minStart, maxEnd) {
  if (!normCap.length || minStart >= maxEnd) return null;
  const firstAnchor = normCap[0];
  let best = null;

  for (let i = minStart; i < maxEnd; i++) {
    if (normNarr[i] !== firstAnchor) continue;
    // Try matching as many caption words as possible allowing small gaps (paraphrased adjectives/articles)
    let matched = 1;
    let ni = i + 1;
    let ci = 1;
    while (ci < normCap.length && ni < maxEnd) {
      // Look ahead up to 5 words in narration for the next caption word
      let found = -1;
      const limit = Math.min(maxEnd, ni + 6);
      for (let k = ni; k < limit; k++) {
        if (normNarr[k] === normCap[ci]) {
          found = k;
          break;
        }
      }
      if (found !== -1) {
        matched++;
        ni = found + 1;
      }
      ci++;
    }
    const coverage = matched / normCap.length;
    if (coverage >= 0.5 || (normCap.length === 1 && matched === 1)) {
      if (!best || coverage > best.coverage || (coverage === best.coverage && i < best.start)) {
        best = { start: i, end: ni, coverage };
        if (coverage === 1 && ni - i === normCap.length) break;
      }
    }
  }
  return best;
}

/**
 * Align full voiceover narration to an ordered list of scenes.
 * Priority:
 * 1) Explicit `scene.narration` / `scene.say` if supplied on scenes.
 * 2) Sequential anchor alignment matching `scene.captions` into `voiceover.text`,
 *    expanding between matched anchors at sentence boundaries so words not shown
 *    in short captions stay bound to the right scene!
 * 3) Proportional fallback by scene spoken weights / durations.
 */
export function stripVoiceoverHeaders(rawText) {
  return String(rawText || '')
    .replace(/\r\n?/g, '\n')
    .replace(/^[ \t]*(?:\/\/\s*)?(?:={2,}|-{3,})?\s*(?:END\s+)?VOICEOVER(?:\s+(?:SCRIPT|TEXT))?\s+(?:BATCH|PART)\s+\d+(?:\s*(?:OF|\/)\s*\d+)?[^\n]*$/gim, '')
    .replace(/^[ \t]*(?:={2,}|-{3,})\s*(?:END\s+)?(?:PART|BATCH)\s+\d+(?:\s*(?:OF|\/)\s*\d+)?\s*(?:={2,}|-{3,})[ \t]*$/gim, '')
    .replace(/\n[ \t]*(?:\*\*|#{1,3}|={2,})?\s*BEST\s+(?:ELEVENLABS|GOOGLE\s+AI\s+STUDIO[^\n]*)\s+VOICES\s+FOR\s+THIS\s+VIDEO[\s\S]*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function alignNarrationToScenes(narration, scenes) {
  if (!Array.isArray(scenes) || !scenes.length) return [];

  const cleanedNarration = stripVoiceoverHeaders(narration);

  const explicit = scenes.map(s =>
    typeof s?.narration === 'string' && s.narration.trim()
      ? s.narration.trim()
      : typeof s?.say === 'string' && s.say.trim()
        ? s.say.trim()
        : ''
  );
  if (explicit.every(Boolean)) return explicit;

  const narrWords = tokenizeWords(cleanedNarration);
  if (!narrWords.length) {
    return scenes.map((s, idx) => {
      if (explicit[idx]) return explicit[idx];
      const cap = (s?.captions || []).map(c => String(c?.text || '').trim()).filter(Boolean).join(' ');
      return cap;
    });
  }

  const normNarr = narrWords.map(normalizeWord);
  const N = narrWords.length;
  const M = scenes.length;

  // Attempt anchor match for each scene using its captions
  const anchors = new Array(M).fill(null);
  let cursor = 0;
  for (let i = 0; i < M; i++) {
    const capText = explicit[i] || (scenes[i]?.captions || []).map(c => c?.text || '').join(' ');
    const capTokens = tokenizeWords(capText).map(normalizeWord).filter(Boolean);
    if (!capTokens.length) continue;
    // Leave at least 0 words; cap lookahead generously but prevent one late false match from starving remaining scenes
    const hit = findAnchorRange(normNarr, capTokens, cursor, N);
    if (hit) {
      anchors[i] = hit;
      cursor = hit.end;
    }
  }

  const matchedCount = anchors.filter(Boolean).length;
  const boundaries = new Array(M + 1).fill(0);
  boundaries[0] = 0;
  boundaries[M] = N;

  if (matchedCount >= Math.max(1, Math.ceil(M * 0.4))) {
    // Fill anchored boundaries first
    // For scene i with anchor[i] and scene i-1 with anchor[i-1]:
    // The narration slice for scene i logically ends at anchor[i].end (or continues up to sentence end / anchor[i+1].start)
    for (let i = 1; i < M; i++) {
      if (anchors[i]) {
        // Scene i begins at or right after previous sentence end up to anchors[i].start
        let split = anchors[i].start;
        // If there are leftover words between prev anchor end and anchors[i].start,
        // attach words up to the first sentence terminator to the previous scene, and start Scene i cleanly on the new sentence!
        const prevEnd = anchors[i - 1] ? anchors[i - 1].end : boundaries[i - 1];
        if (split > prevEnd) {
          for (let w = prevEnd; w < split; w++) {
            if (/[.!?]["')\]]*$/.test(narrWords[w])) {
              split = w + 1;
              break;
            }
          }
        }
        boundaries[i] = Math.max(boundaries[i - 1], Math.min(N, split));
      } else {
        boundaries[i] = -1; // mark for interpolation
      }
    }

    // Interpolate any unanchored gaps proportionally using scene caption weights / durations
    let i = 1;
    while (i < M) {
      if (boundaries[i] !== -1) {
        i++;
        continue;
      }
      const leftBoundIdx = i - 1;
      let j = i;
      while (j < M && boundaries[j] === -1) j++;
      const startWord = boundaries[leftBoundIdx];
      const endWord = boundaries[j];
      const span = Math.max(0, endWord - startWord);

      const priors = [];
      let totalPrior = 0;
      for (let k = leftBoundIdx; k < j; k++) {
        const cap = (scenes[k]?.captions || []).map(c => c?.text || '').join(' ');
        const p = estimateSpokenWeight(explicit[k] || cap) || Math.max(1, +scenes[k]?.duration || 4);
        priors.push(p);
        totalPrior += p;
      }

      let acc = 0;
      for (let k = leftBoundIdx + 1; k < j; k++) {
        acc += priors[k - 1 - leftBoundIdx];
        let cut = startWord + Math.round((span * acc) / (totalPrior || 1));
        // Snap lightly to nearest sentence end within +-3 words if within bounds
        let snapped = cut;
        for (let d = 0; d <= 3; d++) {
          if (cut - d > boundaries[k - 1] && cut - d < endWord && /[.!?]["')\]]*$/.test(narrWords[cut - d - 1])) {
            snapped = cut - d;
            break;
          }
          if (cut + d > boundaries[k - 1] && cut + d <= endWord && /[.!?]["')\]]*$/.test(narrWords[cut + d - 1])) {
            snapped = cut + d;
            break;
          }
        }
        boundaries[k] = Math.max(boundaries[k - 1], Math.min(endWord, snapped));
      }
      i = j;
    }
  } else {
    // No literal caption matches: distribute sentences/words proportionally by scene weights
    const sentences = splitIntoSentences(cleanedNarration);
    const priors = scenes.map((s, idx) => {
      const cap = explicit[idx] || (s?.captions || []).map(c => c?.text || '').join(' ');
      return estimateSpokenWeight(cap) || Math.max(1, +s?.duration || 4);
    });
    const totalPrior = priors.reduce((a, b) => a + b, 0) || 1;

    if (sentences.length >= M) {
      // Distribute whole sentences greedily to match target prior proportions
      const sentWeights = sentences.map(estimateSpokenWeight);
      const totalSW = sentWeights.reduce((a, b) => a + b, 0) || 1;
      const out = new Array(M).fill('');
      let si = 0;
      let targetAcc = 0;
      let currentAcc = 0;
      for (let idx = 0; idx < M; idx++) {
        targetAcc += (priors[idx] / totalPrior) * totalSW;
        const bucket = [];
        const remainingScenes = M - 1 - idx;
        while (si < sentences.length - remainingScenes) {
          const w = sentWeights[si];
          const nextAcc = currentAcc + w;
          if (bucket.length === 0 || Math.abs(nextAcc - targetAcc) <= Math.abs(currentAcc - targetAcc)) {
            bucket.push(sentences[si++]);
            currentAcc = nextAcc;
          } else {
            break;
          }
        }
        out[idx] = explicit[idx] || bucket.join(' ');
      }
      while (si < sentences.length) {
        out[M - 1] = (out[M - 1] ? out[M - 1] + ' ' : '') + sentences[si++];
      }
      return out;
    }

    let acc = 0;
    for (let idx = 1; idx < M; idx++) {
      acc += priors[idx - 1];
      boundaries[idx] = Math.max(boundaries[idx - 1], Math.min(N, Math.round((N * acc) / totalPrior)));
    }
  }

  return scenes.map((s, idx) => {
    if (explicit[idx]) return explicit[idx];
    const slice = narrWords.slice(boundaries[idx], boundaries[idx + 1]).join(' ');
    if (slice) return slice;
    return (s?.captions || []).map(c => String(c?.text || '').trim()).filter(Boolean).join(' ');
  });
}

function computeRmsFrames(pcm, rate, winSec = 0.02) {
  const step = Math.max(1, Math.round(rate * winSec));
  const count = Math.floor(pcm.length / step);
  const rms = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    const base = i * step;
    for (let j = 0; j < step; j++) {
      const v = pcm[base + j];
      sum += v * v;
    }
    rms[i] = Math.sqrt(sum / step);
  }
  return { rms, step, frameDur: step / rate };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Analyze PCM audio into a lightweight speech activity profile:
 * - Adaptive ambient noise-floor estimation (15th percentile RMS)
 * - Soft-compressed cumulative speech activity curve (`cumSpeech`) that pauses during silences
 * - Smoothed amplitude envelope (`env`) for real-time lip-sync modulation
 * - Detected low-energy pause valleys for clean scene and caption transitions
 */
export function buildSpeechProfile(pcm, rate, winSec = 0.02) {
  if (!pcm || !pcm.length || !(rate > 0)) {
    return null;
  }
  const totalSec = pcm.length / rate;
  const { rms, frameDur } = computeRmsFrames(pcm, rate, winSec);
  const N = rms.length;
  if (!N) return null;

  let peak = 0;
  for (let i = 0; i < N; i++) {
    if (rms[i] > peak) peak = rms[i];
  }
  if (peak < 0.004) {
    return {
      rms,
      frameDur,
      totalSec,
      peak,
      noiseFloor: 0,
      speechThresh: 0.006,
      pauseCeiling: 0.008,
      cumSpeech: new Float64Array(N + 1),
      env: new Float32Array(N),
      silent: true,
    };
  }

  // Estimate ambient background noise floor from lower 15th percentile of RMS frames
  const sorted = Float32Array.from(rms).sort();
  const p15 = sorted[Math.min(N - 1, Math.floor(N * 0.15))];
  const noiseFloor = Math.min(peak * 0.25, p15);

  const speechThresh = Math.max(0.006, noiseFloor * 2.6, peak * 0.04);
  const pauseCeiling = Math.max(0.008, noiseFloor * 2.1, peak * 0.075);

  const cumSpeech = new Float64Array(N + 1);
  const env = new Float32Array(N);
  const normDenom = Math.max(1e-5, peak - noiseFloor * 0.8);

  for (let i = 0; i < N; i++) {
    const val = rms[i];
    const above = Math.max(0, val - noiseFloor * 0.8);
    env[i] = clamp(above / normDenom, 0, 1);

    // Silence below ~82% of pauseCeiling contributes 0 speech progress so karaoke pauses cleanly
    const active = val >= speechThresh ? Math.max(0.02, val - noiseFloor) : val > pauseCeiling * 0.85 ? (val - pauseCeiling * 0.85) * 0.35 : 0;
    const soft = active > 0 ? Math.pow(active / normDenom, 0.72) : 0;
    cumSpeech[i + 1] = cumSpeech[i] + soft;
  }

  return {
    rms,
    frameDur,
    totalSec,
    peak,
    noiseFloor,
    speechThresh,
    pauseCeiling,
    cumSpeech,
    env,
    silent: cumSpeech[N] <= 1e-6,
  };
}

function evalCumSpeech(profile, sec) {
  if (!profile || !profile.cumSpeech || !profile.cumSpeech.length) return 0;
  const maxF = profile.rms.length;
  const f = clamp(sec / profile.frameDur, 0, maxF);
  const i0 = Math.floor(f);
  const i1 = Math.min(maxF, i0 + 1);
  const frac = f - i0;
  return profile.cumSpeech[i0] + (profile.cumSpeech[i1] - profile.cumSpeech[i0]) * frac;
}

function invertCumSpeech(profile, targetCum, minSec, maxSec) {
  if (!profile || !profile.rms.length) return clamp((minSec + maxSec) * 0.5, minSec, maxSec);
  const loF = clamp(Math.floor(minSec / profile.frameDur), 0, profile.rms.length);
  const hiF = clamp(Math.ceil(maxSec / profile.frameDur), loF, profile.rms.length);
  const cum = profile.cumSpeech;
  if (targetCum <= cum[loF]) return minSec;
  if (targetCum >= cum[hiF]) return maxSec;

  // Binary search inside [loF, hiF]
  let l = loF;
  let r = hiF;
  while (l < r) {
    const m = (l + r) >> 1;
    if (cum[m] < targetCum) l = m + 1;
    else r = m;
  }
  const idx = Math.max(loF + 1, l);
  const c0 = cum[idx - 1];
  const c1 = cum[idx];
  const frac = c1 > c0 ? (targetCum - c0) / (c1 - c0) : 0;
  return clamp((idx - 1 + frac) * profile.frameDur, minSec, maxSec);
}

/**
 * Sample a compact scene speech curve object `{ t0, dt, cum, env }` stored on PL / export snapshot.
 */
export function sampleSpeechCurve(curve, sec) {
  if (!curve || !curve.cum || !curve.cum.length || !(curve.dt > 0)) return 0;
  const idxF = clamp((sec - curve.t0) / curve.dt, 0, curve.cum.length - 1);
  const i0 = Math.floor(idxF);
  const i1 = Math.min(curve.cum.length - 1, i0 + 1);
  const frac = idxF - i0;
  return curve.cum[i0] + (curve.cum[i1] - curve.cum[i0]) * frac;
}

export function sampleSpeechEnv(curve, sec) {
  if (!curve || !curve.env || !curve.env.length || !(curve.dt > 0)) return 0;
  const idxF = clamp((sec - curve.t0) / curve.dt, 0, curve.env.length - 1);
  const i0 = Math.floor(idxF);
  const i1 = Math.min(curve.env.length - 1, i0 + 1);
  const frac = idxF - i0;
  return curve.env[i0] + (curve.env[i1] - curve.env[i0]) * frac;
}

/**
 * Find the start and end seconds of actual speech in PCM audio using adaptive noise-floor
 * estimation + brief onset/offset hysteresis so leading room noise or trailing breath silence
 * does not pull scene transitions or first captions out of sync.
 */
export function findSpeechBounds(pcm, rate, prebuiltProfile = null) {
  if (!pcm || !pcm.length || !(rate > 0)) {
    return { startSec: 0, endSec: 0 };
  }
  const totalSec = pcm.length / rate;
  const prof = prebuiltProfile || buildSpeechProfile(pcm, rate, 0.02);
  if (!prof || prof.silent || !prof.rms.length) return { startSec: 0, endSec: totalSec };

  const { rms, frameDur, speechThresh, pauseCeiling } = prof;
  const N = rms.length;

  // Require sustained or clear onset (>= threshold, confirmed if followed within 2 frames by pauseCeiling+)
  let first = -1;
  for (let i = 0; i < N; i++) {
    if (rms[i] >= speechThresh) {
      const strong = rms[i] >= speechThresh * 1.45;
      const sustained = (i + 1 < N && rms[i + 1] >= pauseCeiling) || (i + 2 < N && rms[i + 2] >= pauseCeiling);
      if (strong || sustained || N <= 4) {
        first = i;
        break;
      }
    }
  }
  if (first < 0) return { startSec: 0, endSec: totalSec };

  let last = first;
  for (let i = N - 1; i >= first; i--) {
    if (rms[i] >= speechThresh) {
      const strong = rms[i] >= speechThresh * 1.45;
      const sustained = (i - 1 >= first && rms[i - 1] >= pauseCeiling) || (i - 2 >= first && rms[i - 2] >= pauseCeiling);
      if (strong || sustained || N <= 4) {
        last = i;
        break;
      }
    }
  }

  const startSec = Math.max(0, first * frameDur - 0.03);
  const endSec = Math.min(totalSec, (last + 1) * frameDur + 0.04);
  return { startSec, endSec: Math.max(startSec + 0.08, endSec) };
}

function findWindowSpeechBounds(profile, fromSec, toSec) {
  if (!profile || profile.silent || !profile.rms.length) {
    return { startSec: fromSec, endSec: toSec, voiced: false };
  }
  const { rms, frameDur, speechThresh, pauseCeiling } = profile;
  const N = rms.length;
  const lo = clamp(Math.floor(fromSec / frameDur), 0, N - 1);
  const hi = clamp(Math.ceil(toSec / frameDur) - 1, lo, N - 1);

  let first = -1;
  for (let i = lo; i <= hi; i++) {
    if (rms[i] >= speechThresh || (rms[i] >= pauseCeiling && i + 1 <= hi && rms[i + 1] >= speechThresh)) {
      first = i;
      break;
    }
  }
  if (first < 0) {
    return { startSec: fromSec, endSec: toSec, voiced: false };
  }
  let last = first;
  for (let i = hi; i >= first; i--) {
    if (rms[i] >= speechThresh || (rms[i] >= pauseCeiling && i - 1 >= first && rms[i - 1] >= speechThresh)) {
      last = i;
      break;
    }
  }

  const startSec = clamp(Math.max(fromSec, first * frameDur - 0.025), fromSec, toSec);
  const endSec = clamp(Math.min(toSec, (last + 1) * frameDur + 0.035), startSec + 0.06, toSec);
  return { startSec, endSec: Math.min(toSec, endSec), voiced: true };
}

function collectPauseValleys(profile, loSec, hiSec) {
  const { rms, frameDur, pauseCeiling } = profile;
  const loIdx = clamp(Math.floor(loSec / frameDur), 1, rms.length - 2);
  const hiIdx = clamp(Math.ceil(hiSec / frameDur), loIdx, rms.length - 2);
  const valleys = [];

  let i = loIdx;
  while (i <= hiIdx) {
    const local = (rms[i - 1] + rms[i] + rms[i + 1]) / 3;
    if (local <= pauseCeiling) {
      let rEnd = i;
      let minRms = rms[i];
      while (rEnd < hiIdx && ((rms[rEnd] + rms[rEnd + 1]) * 0.5) <= pauseCeiling) {
        rEnd++;
        if (rms[rEnd] < minRms) minRms = rms[rEnd];
      }
      const startSec = i * frameDur;
      const endSec = (rEnd + 1) * frameDur;
      const midSec = (startSec + endSec) * 0.5;
      const dur = Math.max(frameDur, endSec - startSec);
      // Higher quality score for deeper & wider silent valleys
      const energyRatio = clamp(minRms / Math.max(1e-5, pauseCeiling), 0, 1);
      valleys.push({ sec: midSec, startSec, endSec, dur, energyRatio });
      i = rEnd + 1;
    } else {
      i++;
    }
  }
  return valleys;
}

/**
 * Refine interior scene boundaries toward natural silent/low-energy pause valleys
 * in the PCM audio. Uses adaptive search range and dynamic programming over pause
 * candidates so uneven pacing or dramatic pauses (> 1s) never knock scenes out of sync.
 */
export function snapBoundariesToPauses(pcm, rate, targetStarts, totalDuration, prebuiltProfile = null) {
  if (!Array.isArray(targetStarts) || targetStarts.length <= 2) return targetStarts;
  const out = targetStarts.slice();
  if (!prebuiltProfile && (!pcm || !pcm.length || !(rate > 0))) return out;

  const prof = prebuiltProfile || buildSpeechProfile(pcm, rate, 0.02);
  if (!prof || prof.rms.length < 4 || prof.silent) return out;

  const n = out.length - 1;
  const avgLen = Math.max(0.5, totalDuration / Math.max(1, n));
  const minSceneDur = Math.min(0.45, Math.max(0.18, avgLen * 0.25));

  // Build candidate pause valleys near each interior target boundary
  const candidatesPerCut = [];
  for (let k = 1; k < n; k++) {
    const t = out[k];
    const leftGap = Math.max(0.2, t - out[k - 1]);
    const rightGap = Math.max(0.2, (out[k + 1] ?? totalDuration) - t);
    const maxShift = clamp(Math.max(1.4, Math.min(leftGap, rightGap) * 0.65), 0.35, 3.8);
    const loSec = Math.max(minSceneDur * k, t - maxShift);
    const hiSec = Math.min(totalDuration - minSceneDur * (n - k), t + maxShift);

    const rawValleys = hiSec > loSec ? collectPauseValleys(prof, loSec, hiSec) : [];
    const cands = rawValleys.map((v) => {
      const dist = Math.abs(v.sec - t);
      const silenceBonus = Math.min(0.45, v.dur * 0.6);
      const nodeCost = v.energyRatio * 0.8 + (dist / Math.max(0.8, maxShift)) * 0.9 - silenceBonus;
      return { sec: v.sec, cost: nodeCost };
    });

    // Always retain the predicted boundary as a fallback candidate (slightly higher penalty if surrounded by speech)
    cands.push({ sec: clamp(t, loSec, hiSec), cost: 1.05 });
    cands.sort((a, b) => a.sec - b.sec);
    // Keep top <= 14 candidates sorted by timestamp
    if (cands.length > 14) {
      cands.sort((a, b) => a.cost - b.cost);
      cands.length = 14;
      cands.sort((a, b) => a.sec - b.sec);
    }
    candidatesPerCut.push(cands);
  }

  // Forward DP across interior boundaries k = 1 .. n - 1
  if (!candidatesPerCut.length) return out;
  const dpCost = candidatesPerCut.map((cs) => new Float64Array(cs.length).fill(Infinity));
  const dpPrev = candidatesPerCut.map((cs) => new Int32Array(cs.length).fill(-1));

  for (let j = 0; j < candidatesPerCut[0].length; j++) {
    if (candidatesPerCut[0][j].sec >= minSceneDur) {
      dpCost[0][j] = candidatesPerCut[0][j].cost;
    }
  }

  for (let step = 1; step < candidatesPerCut.length; step++) {
    const prevCs = candidatesPerCut[step - 1];
    const curCs = candidatesPerCut[step];
    const targetSpan = Math.max(minSceneDur, out[step + 1] - out[step]);

    for (let j = 0; j < curCs.length; j++) {
      let bestC = Infinity;
      let bestP = -1;
      for (let p = 0; p < prevCs.length; p++) {
        if (!Number.isFinite(dpCost[step - 1][p])) continue;
        const span = curCs[j].sec - prevCs[p].sec;
        if (span < minSceneDur) continue;
        // Encourage neighboring boundaries to preserve relative scene pacing ratio
        const ratioErr = Math.abs(span - targetSpan) / Math.max(0.8, targetSpan);
        const total = dpCost[step - 1][p] + curCs[j].cost + ratioErr * 0.38;
        if (total < bestC) {
          bestC = total;
          bestP = p;
        }
      }
      dpCost[step][j] = bestC;
      dpPrev[step][j] = bestP;
    }
  }

  // Backtrack best boundary sequence
  const lastStep = candidatesPerCut.length - 1;
  let bestFinalIdx = -1;
  let bestFinalCost = Infinity;
  for (let j = 0; j < candidatesPerCut[lastStep].length; j++) {
    if (totalDuration - candidatesPerCut[lastStep][j].sec >= minSceneDur && dpCost[lastStep][j] < bestFinalCost) {
      bestFinalCost = dpCost[lastStep][j];
      bestFinalIdx = j;
    }
  }

  if (bestFinalIdx >= 0) {
    let cur = bestFinalIdx;
    for (let step = lastStep; step >= 0; step--) {
      if (cur >= 0) {
        out[step + 1] = candidatesPerCut[step][cur].sec;
        cur = dpPrev[step][cur];
      }
    }
  } else {
    // Monotonic safe fallback if minSceneDur constraint was too tight
    for (let k = 1; k < n; k++) {
      const prev = out[k - 1] + minSceneDur * 0.5;
      const next = totalDuration - minSceneDur * 0.5 * (n - k);
      out[k] = clamp(candidatesPerCut[k - 1][0]?.sec ?? out[k], prev, Math.max(prev, next));
    }
  }

  out[0] = 0;
  out[n] = totalDuration;
  return out;
}

function splitCaptionSpan(caption, segSpeechStart, segSpeechEnd, scAudioStart, scAudioEnd) {
  return {
    text: caption.text,
    pos: caption.pos,
    size: caption.size,
    color: caption.color,
    maxChars: caption.maxChars,
    from: segSpeechStart,
    to: segSpeechEnd,
    speechFrom: segSpeechStart,
    speechTo: segSpeechEnd,
    sceneStart: scAudioStart,
    sceneEnd: scAudioEnd,
  };
}

/**
 * Lock every scene's captions & karaoke progress curves directly onto the actual PCM voiced
 * timeline (`[starts[i], starts[i+1]]`) so leading silence, breath gaps, and uneven speaking
 * rates never make captions or word highlights jump ahead of the narrator's voice.
 */
export function computeSyncedSceneCaptions(scenes, starts, speechProfile = null) {
  const M = Array.isArray(scenes) ? scenes.length : 0;
  const syncedCaptions = [];
  const speechCurves = [];

  for (let i = 0; i < M; i++) {
    const sc = scenes[i] || {};
    const caps = Array.isArray(sc.captions) ? sc.captions.filter((c) => c && c.text != null) : [];
    const scStart = starts[i] ?? 0;
    const scEnd = starts[i + 1] ?? scStart + Math.max(0.5, +sc.duration || 5);
    const scLen = Math.max(0.08, scEnd - scStart);
    const origDur = Math.max(0.1, +sc.duration || scLen);

    // Build compact normalized per-scene cumulative speech & amplitude curve (~40ms resolution)
    if (speechProfile && !speechProfile.silent) {
      const dt = 0.04;
      const nPts = Math.max(3, Math.ceil(scLen / dt) + 1);
      const cumArr = new Float32Array(nPts);
      const envArr = new Float32Array(nPts);
      const cStart = evalCumSpeech(speechProfile, scStart);
      const cEnd = evalCumSpeech(speechProfile, scEnd);
      const cSpan = Math.max(1e-6, cEnd - cStart);

      for (let p = 0; p < nPts; p++) {
        const t = Math.min(scEnd, scStart + p * dt);
        cumArr[p] = clamp((evalCumSpeech(speechProfile, t) - cStart) / cSpan, 0, 1);
        const fIdx = clamp(Math.round(t / speechProfile.frameDur), 0, speechProfile.env.length - 1);
        envArr[p] = speechProfile.env[fIdx] || 0;
      }
      speechCurves.push({ t0: scStart, dt, cum: cumArr, env: envArr, active: cSpan > 0.02 });
    } else {
      speechCurves.push(null);
    }

    if (!caps.length) {
      syncedCaptions.push([]);
      continue;
    }

    // Without usable PCM speech energy, proportionally map original from/to into [scStart, scEnd]
    if (!speechProfile || speechProfile.silent) {
      const scale = scLen / origDur;
      syncedCaptions.push(
        caps.map((c) => {
          const cf = clamp(scStart + (Number(c.from) || 0) * scale, scStart, scEnd - 0.05);
          const ct = clamp(scStart + (Number(c.to) || origDur) * scale, cf + 0.1, scEnd);
          return splitCaptionSpan(c, cf, ct, scStart, scEnd);
        })
      );
      continue;
    }

    // Locate where actual voice starts & ends inside THIS scene's audio slice
    const winBounds = findWindowSpeechBounds(speechProfile, scStart, scEnd);
    const segStart = winBounds.voiced ? winBounds.startSec : scStart;
    const segEnd = winBounds.voiced ? winBounds.endSec : scEnd;

    if (!winBounds.voiced || segEnd - segStart < 0.12) {
      const scale = scLen / origDur;
      syncedCaptions.push(
        caps.map((c) => {
          const cf = clamp(scStart + (Number(c.from) || 0) * scale, scStart, scEnd - 0.05);
          const ct = clamp(scStart + (Number(c.to) || origDur) * scale, cf + 0.1, scEnd);
          return splitCaptionSpan(c, cf, ct, scStart, scEnd);
        })
      );
      continue;
    }

    if (caps.length === 1) {
      const c = caps[0];
      // Show caption right as speech starts in this scene (never early during intro silence)
      // and hold briefly past the last spoken word up to scene cut.
      const aFrom = Math.max(scStart, segStart - 0.04);
      const aTo = Math.min(scEnd, Math.max(segEnd + 0.18, scEnd - 0.02));
      const mapped = splitCaptionSpan(c, aFrom, aTo, scStart, scEnd);
      mapped.speechFrom = segStart;
      mapped.speechTo = segEnd;
      syncedCaptions.push([mapped]);
      continue;
    }

    // Multi-caption scene: distribute captions strictly over cumulative active voiced energy,
    // snapping split points cleanly onto real mid-scene silent pause valleys!
    const capWeights = caps.map((c) => estimateSpokenWeight(c.text) || Math.max(0.4, String(c.text || '').length * 0.06));
    const totalCapW = capWeights.reduce((a, b) => a + b, 0) || caps.length;
    const cSeg0 = evalCumSpeech(speechProfile, segStart);
    const cSeg1 = evalCumSpeech(speechProfile, segEnd);
    const segCumSpan = Math.max(1e-5, cSeg1 - cSeg0);

    // Compute exact speech onset/offset windows per caption
    const splitPoints = [segStart];
    let wAcc = 0;
    for (let j = 0; j < caps.length - 1; j++) {
      wAcc += capWeights[j];
      const targetCum = cSeg0 + segCumSpan * (wAcc / totalCapW);
      const approxSec = invertCumSpeech(speechProfile, targetCum, splitPoints[j] + 0.12, segEnd - 0.12);

      // Look for an intra-scene pause valley near approxSec
      const searchSpan = Math.max(0.55, (segEnd - segStart) * 0.35);
      const loS = Math.max(splitPoints[j] + 0.12, approxSec - searchSpan);
      const hiS = Math.min(segEnd - 0.12, approxSec + searchSpan);
      const valleys = hiS > loS ? collectPauseValleys(speechProfile, loS, hiS) : [];

      if (valleys.length) {
        let bestV = valleys[0];
        let bestS = Infinity;
        for (const v of valleys) {
          const s = v.energyRatio * 0.7 + Math.abs(v.sec - approxSec) * 0.5 - Math.min(0.4, v.dur * 0.5);
          if (s < bestS) {
            bestS = s;
            bestV = v;
          }
        }
        splitPoints.push(clamp(bestV.sec, splitPoints[j] + 0.12, segEnd - 0.12));
      } else {
        splitPoints.push(clamp(approxSec, splitPoints[j] + 0.12, segEnd - 0.12));
      }
    }
    splitPoints.push(segEnd);

    // Inside each sub-span [splitPoints[j], splitPoints[j+1]], trim silent breath gaps so
    // each caption activates cleanly right when the narrator speaks that line (not during a 1s gap!)
    const subBounds = [];
    for (let j = 0; j < caps.length; j++) {
      const wb = findWindowSpeechBounds(speechProfile, splitPoints[j], splitPoints[j + 1]);
      subBounds.push({
        speechFrom: wb.voiced ? wb.startSec : splitPoints[j],
        speechTo: wb.voiced ? wb.endSec : splitPoints[j + 1],
      });
    }

    const outCaps = [];
    for (let j = 0; j < caps.length; j++) {
      const sb = subBounds[j];
      const nextSb = subBounds[j + 1];
      const aFrom = j === 0
        ? Math.max(scStart, sb.speechFrom - 0.04)
        : Math.max(subBounds[j - 1].speechTo + 0.02, sb.speechFrom - 0.05);

      let aTo;
      if (nextSb) {
        const gap = nextSb.speechFrom - sb.speechTo;
        // Across short natural pauses (<0.32s), keep caption visible right up to the next caption;
        // across longer dramatic pauses (>=0.32s), end the previous caption shortly after it finishes
        // so the upcoming phrase does not prematurely pop in while nobody is speaking!
        aTo = gap >= 0.32
          ? Math.min(nextSb.speechFrom - 0.04, sb.speechTo + 0.18)
          : Math.max(sb.speechTo, nextSb.speechFrom - 0.02);
      } else {
        aTo = Math.min(scEnd, Math.max(sb.speechTo + 0.18, scEnd - 0.02));
      }

      const item = splitCaptionSpan(caps[j], aFrom, Math.max(aFrom + 0.08, aTo), scStart, scEnd);
      item.speechFrom = sb.speechFrom;
      item.speechTo = Math.max(sb.speechFrom + 0.06, sb.speechTo);
      outCaps.push(item);
    }
    syncedCaptions.push(outCaps);
  }

  return { syncedCaptions, speechCurves };
}

function buildVerbatimSubtitles(text, duration = 5) {
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

function measureSubtitleMatch(spokenTokens, capTokens) {
  if (!spokenTokens.length || !capTokens.length) return { capAccuracy: 0, spokenCoverage: 0 };
  const spokenSet = new Set(spokenTokens);
  const capSet = new Set(capTokens);
  let capInSpoken = 0;
  for (const w of capTokens) {
    if (spokenSet.has(w)) capInSpoken++;
  }
  let spokenInCap = 0;
  for (const w of spokenTokens) {
    if (capSet.has(w)) spokenInCap++;
  }
  return {
    capAccuracy: capInSpoken / capTokens.length,
    spokenCoverage: spokenInCap / spokenTokens.length,
  };
}

/**
 * Guarantee that each scene's displayed bottom subtitle captions match what the narrator is
 * actually speaking in `sceneTexts[i]`, preventing "narrator says A while captions show B" drift.
 * Center chapter cards and top corner stat callouts are preserved intact.
 */
export function reconcileSceneCaptionsWithNarration(scenes, sceneTexts = []) {
  if (!Array.isArray(scenes)) return [];
  return scenes.map((sc, idx) => {
    if (!sc || typeof sc !== 'object') return sc;
    const spoken = stripVoiceoverHeaders(sceneTexts[idx] ?? sc.narration ?? sc.say ?? '').replace(/\s+/g, ' ').trim();
    if (!spoken) return sc;

    const existing = Array.isArray(sc.captions) ? sc.captions.filter((c) => c && c.text != null) : [];
    const specialCaps = existing.filter((c) => c.pos === 'center' || c.pos === 'top');
    const bottomCaps = existing.filter((c) => c.pos !== 'center' && c.pos !== 'top');

    const spokenTokens = tokenizeWords(spoken).map(normalizeWord).filter(Boolean);
    const bottomText = bottomCaps.map((c) => String(c.text || '').trim()).filter(Boolean).join(' ');
    const bottomTokens = tokenizeWords(bottomText).map(normalizeWord).filter(Boolean);

    const { capAccuracy, spokenCoverage } = measureSubtitleMatch(spokenTokens, bottomTokens);
    const needsRebuild =
      bottomCaps.length === 0 ||
      capAccuracy < 0.72 ||
      (spokenTokens.length >= 3 && spokenCoverage < 0.6);

    if (!needsRebuild) return sc;

    const rebuiltBottom = buildVerbatimSubtitles(spoken, sc.duration);
    const merged = [...specialCaps, ...rebuiltBottom].sort((a, b) => (Number(a.from) || 0) - (Number(b.from) || 0));
    return { ...sc, captions: merged };
  });
}

/**
 * Format narration into clean scene-by-scene paragraphs (blank line between scenes) so
 * voiceover generation naturally pauses at scene cuts without altering spoken words.
 */
export function formatVoiceoverScriptForPacing(narration, scenes = []) {
  const cleanRaw = stripVoiceoverHeaders(narration);
  const list = Array.isArray(scenes) ? scenes : [];
  if (list.length > 0) {
    const parts = alignNarrationToScenes(cleanRaw, list)
      .map((s) => String(s || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (parts.length > 0) return parts.join('\n\n');
  }
  const clean = cleanRaw.replace(/\r\n?/g, '\n').trim();
  if (!clean) return '';
  if (/\n\s*\n/.test(clean)) {
    return clean
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n');
  }
  return clean.replace(/\s+/g, ' ').trim();
}

/**
 * Split a formatted voiceover script cleanly at whole scene/paragraph boundaries so mobile
 * phone clipboards can copy every batch completely without truncation.
 * Short/medium scripts that fit inside mobile clipboard limits return 1 single batch.
 */
export function splitVoiceoverIntoCopyBatches(narration, scenes = [], opts = {}) {
  const maxWords = Math.max(200, Number(opts?.maxWords) || 1050);
  const maxChars = Math.max(1200, Number(opts?.maxChars) || 6300);
  const singleMaxWords = Math.max(maxWords, Number(opts?.singleMaxWords) || 1650);
  const singleMaxChars = Math.max(maxChars, Number(opts?.singleMaxChars) || 10500);

  const list = Array.isArray(scenes) ? scenes : [];
  let paragraphs = [];
  if (list.length > 0) {
    paragraphs = alignNarrationToScenes(narration, list)
      .map((txt, idx) => ({
        text: String(txt || '').replace(/\s+/g, ' ').trim(),
        sceneIndex: idx,
      }))
      .filter((p) => p.text.length > 0);
  }
  if (!paragraphs.length) {
    const formatted = formatVoiceoverScriptForPacing(narration, []);
    if (!formatted) return [];
    const blocks = /\n\s*\n/.test(formatted) ? formatted.split(/\n\s*\n/) : splitIntoSentences(formatted);
    paragraphs = blocks
      .map((txt, idx) => ({ text: String(txt || '').replace(/\s+/g, ' ').trim(), sceneIndex: idx }))
      .filter((p) => p.text.length > 0);
  }
  if (!paragraphs.length) return [];

  const fullText = paragraphs.map((p) => p.text).join('\n\n');
  const totalWords = tokenizeWords(fullText).length;
  const totalChars = fullText.length;

  if (totalWords <= singleMaxWords && totalChars <= singleMaxChars) {
    return [
      {
        index: 1,
        total: 1,
        text: fullText,
        words: totalWords,
        chars: totalChars,
        startScene: 0,
        endScene: list.length || paragraphs.length,
      },
    ];
  }

  // Expand any oversized single paragraph along sentence boundaries
  const units = [];
  for (const p of paragraphs) {
    const pw = tokenizeWords(p.text).length;
    if (pw > maxWords || p.text.length > maxChars) {
      const sents = splitIntoSentences(p.text);
      for (const s of sents) {
        units.push({ text: s, sceneIndex: p.sceneIndex, isParaBreak: false });
      }
      if (units.length) units[units.length - 1].isParaBreak = true;
    } else {
      units.push({ text: p.text, sceneIndex: p.sceneIndex, isParaBreak: true });
    }
  }

  const batches = [];
  let curTexts = [];
  let curWords = 0;
  let curChars = 0;
  let curStartScene = units[0].sceneIndex;
  let curEndScene = units[0].sceneIndex + 1;

  for (const u of units) {
    const uw = tokenizeWords(u.text).length;
    const uc = u.text.length;
    const sep = curTexts.length ? 2 : 0;
    if (curTexts.length > 0 && (curWords + uw > maxWords || curChars + sep + uc > maxChars)) {
      const text = curTexts.join('\n\n');
      batches.push({
        index: batches.length + 1,
        total: 0,
        text,
        words: curWords,
        chars: text.length,
        startScene: curStartScene,
        endScene: curEndScene,
      });
      curTexts = [u.text];
      curWords = uw;
      curChars = uc;
      curStartScene = u.sceneIndex;
      curEndScene = u.sceneIndex + 1;
    } else {
      curTexts.push(u.text);
      curWords += uw;
      curChars += sep + uc;
      curEndScene = Math.max(curEndScene, u.sceneIndex + 1);
    }
  }
  if (curTexts.length) {
    const text = curTexts.join('\n\n');
    batches.push({
      index: batches.length + 1,
      total: 0,
      text,
      words: curWords,
      chars: text.length,
      startScene: curStartScene,
      endScene: Math.max(curEndScene, list.length || curEndScene),
    });
  }

  const total = batches.length;
  for (let i = 0; i < total; i++) {
    batches[i].index = i + 1;
    batches[i].total = total;
    if (i === 0) batches[i].startScene = 0;
    if (i > 0) batches[i].startScene = Math.min(batches[i].startScene, batches[i - 1].endScene);
  }
  return batches;
}

/**
 * Map K ordered uploaded voiceover audio files (durations in seconds) directly to contiguous
 * scene groups so multi-part ElevenLabs / Google AI Studio voiceover batches lock onto the
 * timeline with zero cross-batch drift.
 */
export function buildMultiAudioAnchors(batchDurationsSec, scenes, sceneTexts = null) {
  const durs = Array.isArray(batchDurationsSec)
    ? batchDurationsSec.map((d) => Math.max(0.05, Number(d) || 0)).filter((d) => d > 0)
    : [];
  const M = Array.isArray(scenes) ? scenes.length : 0;
  const K = durs.length;
  if (K < 2 || M < K) return null;

  const totalAudio = durs.reduce((a, b) => a + b, 0);
  if (!(totalAudio > 0)) return null;

  const texts = Array.isArray(sceneTexts) && sceneTexts.length === M
    ? sceneTexts
    : alignNarrationToScenes('', scenes);
  const weights = texts.map((txt, idx) => estimateSpokenWeight(txt) || Math.max(0.5, +scenes[idx]?.duration || 4));
  const totalWeight = weights.reduce((a, b) => a + b, 0) || M;

  const anchors = [];
  let cursorScene = 0;
  let cumAudio = 0;
  let cumWeight = 0;

  for (let b = 0; b < K; b++) {
    const startSec = cumAudio;
    cumAudio += durs[b];
    const endSec = b === K - 1 ? totalAudio : cumAudio;

    let endScene;
    if (b === K - 1) {
      endScene = M;
    } else {
      const targetWeightRatio = cumAudio / totalAudio;
      const targetCumWeight = targetWeightRatio * totalWeight;
      const maxEnd = M - (K - 1 - b);
      let bestEnd = cursorScene + 1;
      let bestErr = Infinity;
      let wRun = cumWeight;
      for (let s = cursorScene + 1; s <= maxEnd; s++) {
        wRun += weights[s - 1];
        const err = Math.abs(wRun - targetCumWeight);
        if (err < bestErr) {
          bestErr = err;
          bestEnd = s;
        }
      }
      endScene = bestEnd;
      for (let s = cursorScene; s < endScene; s++) cumWeight += weights[s];
    }

    anchors.push({
      startScene: cursorScene,
      endScene,
      startSec,
      endSec,
    });
    cursorScene = endScene;
  }

  return anchors;
}

function solveSegmentStarts(weights, startIdx, endIdx, startSec, endSec, totalDuration, prof, isLeadingClip, isTrailingClip) {
  const count = endIdx - startIdx;
  if (count <= 0) return [];
  if (count === 1) return [startSec];

  const sliceW = weights.slice(startIdx, endIdx);
  const wTotal = sliceW.reduce((a, b) => a + b, 0) || count;

  let activeStart = startSec;
  let activeEnd = endSec;
  if (prof && !prof.silent) {
    const bounds = findWindowSpeechBounds(prof, startSec, endSec);
    if (bounds.voiced && bounds.endSec - bounds.startSec > 0.25) {
      if (isLeadingClip) activeStart = bounds.startSec;
      if (isTrailingClip) activeEnd = bounds.endSec;
    }
  }

  const rawTargets = [startSec];
  let wAcc = 0;

  if (prof && !prof.silent) {
    const c0 = evalCumSpeech(prof, activeStart);
    const c1 = evalCumSpeech(prof, activeEnd);
    const cSpan = c1 - c0;
    if (cSpan > 0.05) {
      for (let i = 0; i < count - 1; i++) {
        wAcc += sliceW[i];
        const targetCum = c0 + (cSpan * wAcc) / wTotal;
        rawTargets.push(invertCumSpeech(prof, targetCum, activeStart, activeEnd));
      }
    } else {
      const span = Math.max(0.2, activeEnd - activeStart);
      for (let i = 0; i < count - 1; i++) {
        wAcc += sliceW[i];
        rawTargets.push(activeStart + (span * wAcc) / wTotal);
      }
    }
  } else {
    const span = Math.max(0.2, activeEnd - activeStart);
    for (let i = 0; i < count - 1; i++) {
      wAcc += sliceW[i];
      rawTargets.push(activeStart + (span * wAcc) / wTotal);
    }
  }
  rawTargets.push(endSec);

  let solved = rawTargets;
  if (prof && !prof.silent) {
    // Snap relative to segment [startSec, endSec] by shifting coordinates or directly calling snapBoundariesToPauses
    // For single-segment calls (startSec === 0 && endSec === totalDuration), use full PCM;
    // for multi-chunk segments, constrain interior cuts strictly inside [startSec, endSec].
    if (startSec === 0 && endSec === totalDuration) {
      solved = snapBoundariesToPauses(prof.rms, 1 / prof.frameDur, rawTargets, totalDuration, prof);
    } else {
      const avgLen = Math.max(0.4, (endSec - startSec) / count);
      const minD = Math.min(0.4, Math.max(0.15, avgLen * 0.25));
      solved = rawTargets.slice();
      for (let k = 1; k < count; k++) {
        const lo = Math.max(solved[k - 1] + minD, rawTargets[k] - Math.min(1.6, avgLen * 0.6));
        const hi = Math.min(endSec - minD * (count - k), rawTargets[k] + Math.min(1.6, avgLen * 0.6));
        const valleys = hi > lo ? collectPauseValleys(prof, lo, hi) : [];
        if (valleys.length) {
          let best = valleys[0];
          let bestScore = Infinity;
          for (const v of valleys) {
            const s = v.energyRatio * 0.8 + Math.abs(v.sec - rawTargets[k]) * 0.5 - Math.min(0.4, v.dur * 0.5);
            if (s < bestScore) {
              bestScore = s;
              best = v;
            }
          }
          solved[k] = clamp(best.sec, lo, hi);
        }
      }
    }
  }
  return solved.slice(0, count);
}

/**
 * Compute synchronized timeline boundaries `[t0, t1, ..., totalDuration]`,
 * plus sub-scene audio-locked `syncedCaptions` and `speechCurves`.
 * Accepts optional `{ chunkAnchors }` from scene-grouped TTS generation to guarantee
 * zero cumulative drift across long multi-chunk voiceovers.
 */
export function computeSyncedTimeline(narration, scenes, audioDuration, audioData = null, options = null) {
  const M = Array.isArray(scenes) ? scenes.length : 0;
  if (!M) {
    return { starts: [0], total: Math.max(0, +audioDuration || 0), sceneTexts: [], durations: [], syncedCaptions: [], speechCurves: [] };
  }

  const sceneTexts = alignNarrationToScenes(narration, scenes);
  const weights = sceneTexts.map((txt, idx) => {
    const w = estimateSpokenWeight(txt);
    if (w > 0) return w;
    return Math.max(0.5, +scenes[idx]?.duration || 4);
  });

  const total = audioDuration > 0
    ? audioDuration
    : scenes.reduce((a, s) => a + Math.max(0.5, +s?.duration || 5), 0);

  const pcm = audioData && audioData.a;
  const rate = audioData && audioData.rate;
  const prof = pcm && rate > 0 && audioDuration > 0 ? buildSpeechProfile(pcm, rate, 0.02) : null;

  const chunkAnchors = Array.isArray(options?.chunkAnchors) && options.chunkAnchors.length
    ? options.chunkAnchors
    : Array.isArray(audioData?.chunkAnchors) && audioData.chunkAnchors.length
      ? audioData.chunkAnchors
      : null;

  let starts;
  if (chunkAnchors && chunkAnchors.length > 1) {
    // Solve each scene group cleanly within its known TTS audio chunk bounds -> 0 cross-chunk drift!
    starts = new Array(M + 1).fill(0);
    starts[0] = 0;
    for (let c = 0; c < chunkAnchors.length; c++) {
      const ch = chunkAnchors[c];
      const s0 = clamp(Number(ch.startScene) || 0, 0, M - 1);
      const s1 = clamp(Number(ch.endScene) || M, s0 + 1, M);
      const t0 = c === 0 ? 0 : clamp(Number(ch.startSec) || 0, 0, total);
      const t1 = c === chunkAnchors.length - 1 ? total : clamp(Number(ch.endSec) || total, t0 + 0.1, total);
      const segStarts = solveSegmentStarts(weights, s0, s1, t0, t1, total, prof, c === 0, c === chunkAnchors.length - 1);
      for (let k = 0; k < segStarts.length; k++) {
        starts[s0 + k] = k === 0 ? t0 : Math.max(starts[s0 + k - 1] + 0.1, segStarts[k]);
      }
    }
    starts[M] = total;
  } else {
    const segStarts = solveSegmentStarts(weights, 0, M, 0, total, total, prof, true, true);
    starts = [...segStarts, total];
    starts[0] = 0;
    starts[M] = total;
  }

  // Enforce strictly monotonic boundaries within [0, total]
  for (let i = 1; i < M; i++) {
    starts[i] = clamp(starts[i], starts[i - 1] + 0.05, total - 0.05 * (M - i));
  }

  const durations = [];
  for (let i = 0; i < M; i++) {
    durations.push(starts[i + 1] - starts[i]);
  }

  const reconciledScenes = reconcileSceneCaptionsWithNarration(scenes, sceneTexts);
  const { syncedCaptions, speechCurves } = computeSyncedSceneCaptions(reconciledScenes, starts, prof);

  return { starts, total, sceneTexts, durations, syncedCaptions, speechCurves };
}

function splitTextToMaxChars(text, maxChars) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];
  const sentences = splitIntoSentences(clean);
  const out = [];
  let cur = '';
  for (const s of sentences) {
    if (s.length > maxChars) {
      if (cur) {
        out.push(cur);
        cur = '';
      }
      let tmp = '';
      for (const w of s.split(' ')) {
        if (tmp && (tmp + ' ' + w).length > maxChars) {
          out.push(tmp);
          tmp = w;
        } else {
          tmp = tmp ? tmp + ' ' + w : w;
        }
      }
      if (tmp) cur = tmp;
      continue;
    }
    if (cur && (cur + ' ' + s).length > maxChars) {
      out.push(cur);
      cur = s;
    } else {
      cur = cur ? cur + ' ' + s : s;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Group whole scenes into sequential TTS request chunks bounded by `maxChars`
 * so multi-part TTS returns exact per-group audio anchors (`startScene..endScene`)
 * preventing cumulative timing drift between scenes across long videos.
 */
export function buildSceneTtsChunks(narration, scenes, maxChars = 1800) {
  const mx = Math.max(120, Number(maxChars) || 1800);
  const M = Array.isArray(scenes) ? scenes.length : 0;
  if (!M) {
    const parts = splitTextToMaxChars(narration, mx);
    return parts.map((p) => ({ startScene: 0, endScene: 0, parts: [p], text: p }));
  }

  const sceneTexts = alignNarrationToScenes(narration, scenes).map((t) =>
    String(t || '').replace(/\s+/g, ' ').trim()
  );
  if (!sceneTexts.some(Boolean)) {
    const parts = splitTextToMaxChars(narration, mx);
    if (!parts.length) return [];
    return [{ startScene: 0, endScene: M, parts, text: parts.join(' ') }];
  }

  const groups = [];
  let startScene = 0;
  let buf = '';

  for (let i = 0; i < M; i++) {
    const t = sceneTexts[i];
    if (!t) continue;
    if (t.length > mx) {
      if (buf) {
        groups.push({ startScene, endScene: i, parts: [buf], text: buf });
        startScene = i;
        buf = '';
      }
      const subParts = splitTextToMaxChars(t, mx);
      groups.push({ startScene, endScene: i + 1, parts: subParts, text: t });
      startScene = i + 1;
      continue;
    }
    if (buf && (buf + ' ' + t).length > mx) {
      groups.push({ startScene, endScene: i, parts: [buf], text: buf });
      startScene = i;
      buf = t;
    } else {
      buf = buf ? buf + ' ' + t : t;
    }
  }

  if (buf) {
    groups.push({ startScene, endScene: M, parts: [buf], text: buf });
  } else if (groups.length && groups[groups.length - 1].endScene < M) {
    groups[groups.length - 1].endScene = M;
  }

  return groups;
}

