// Pure transcript normalization, out-of-order clip re-ordering,
// word-timestamp alignment, piecewise audio-to-scene time-warping,
// and random-audio caption/action reconciliation for Animato Stickman Studio.
// Works in browsers (ES module) and in Node.js unit tests.

import {
  tokenizeWords,
  normalizeWord,
  estimateSpokenWeight,
  alignNarrationToScenes,
  buildSpeechProfile,
  reconcileSceneCaptionsWithNarration,
  computeSyncedSceneCaptions,
  snapBoundariesToPauses,
} from './sync.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function wordSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (la >= 3 && lb >= 3 && (a.startsWith(b) || b.startsWith(a))) {
    return Math.min(la, lb) / Math.max(la, lb);
  }
  const maxLen = Math.max(la, lb);
  if (maxLen <= 2) return 0;
  if (Math.abs(la - lb) > 2) return 0;
  // Fast bounded Levenshtein for small typos / ASR phonetic variants
  const dp = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) dp[j] = j;
  for (let i = 1; i <= la; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= lb; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  const dist = dp[lb];
  if (dist === 1 && maxLen >= 4) return 0.78;
  if (dist === 2 && maxLen >= 6) return 0.6;
  return 0;
}

/**
 * Normalize Moonshine (or generic ASR) transcript lines into a flat, strictly monotonic
 * word timeline `{ text, lines, words: [{ text, norm, start, end, lineIndex, confidence }] }`.
 * When `line.words` is absent, synthesizes word timestamps inside `[startTime, endTime]`
 * using spoken syllable/punctuation weights and optional PCM speech energy bounds.
 */
export function normalizeTranscriptLines(rawTranscript, totalDurationSec = 0, speechProfile = null) {
  const rawLines = Array.isArray(rawTranscript)
    ? rawTranscript
    : Array.isArray(rawTranscript?.lines)
      ? rawTranscript.lines
      : [];

  const lines = [];
  const words = [];

  for (let li = 0; li < rawLines.length; li++) {
    const src = rawLines[li];
    if (!src) continue;
    const text = String(src.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const rawStart = Math.max(0, Number(src.startTime ?? src.start) || 0);
    const rawDur = Number(src.duration);
    const rawEnd = Number(src.endTime ?? src.end);
    const endTime = Number.isFinite(rawEnd) && rawEnd > rawStart
      ? rawEnd
      : rawStart + Math.max(0.12, Number.isFinite(rawDur) && rawDur > 0 ? rawDur : 0.45);
    const clampedEnd = totalDurationSec > 0 ? Math.min(totalDurationSec, endTime) : endTime;
    const startTime = Math.min(rawStart, Math.max(0, clampedEnd - 0.05));
    const duration = Math.max(0.05, clampedEnd - startTime);

    const lineObj = {
      text,
      startTime,
      duration,
      endTime: startTime + duration,
      words: [],
    };

    const rawWords = Array.isArray(src.words) && src.words.length ? src.words : null;
    if (rawWords) {
      for (const rw of rawWords) {
        const wTxt = String(rw?.text || '').trim();
        const norm = normalizeWord(wTxt);
        if (!wTxt) continue;
        const ws = clamp(Number(rw.start ?? rw.startTime) || startTime, startTime, lineObj.endTime - 0.02);
        const we = clamp(Number(rw.end ?? rw.endTime) || ws + 0.08, ws + 0.02, lineObj.endTime);
        const wObj = {
          text: wTxt,
          norm,
          start: ws,
          end: we,
          lineIndex: lines.length,
          confidence: clamp(Number(rw.confidence ?? 0.9) || 0.9, 0, 1),
        };
        lineObj.words.push(wObj);
        if (norm) words.push(wObj);
      }
    } else {
      const tokens = tokenizeWords(text);
      const weights = tokens.map((tok) => Math.max(0.18, estimateSpokenWeight(tok)));
      const totalW = weights.reduce((a, b) => a + b, 0) || tokens.length || 1;

      // Narrow [segStart, segEnd] inside [startTime, endTime] using PCM speech energy if available
      let segStart = startTime;
      let segEnd = lineObj.endTime;
      if (speechProfile && !speechProfile.silent && speechProfile.rms?.length) {
        const loF = clamp(Math.floor(startTime / speechProfile.frameDur), 0, speechProfile.rms.length - 1);
        const hiF = clamp(Math.ceil(lineObj.endTime / speechProfile.frameDur) - 1, loF, speechProfile.rms.length - 1);
        let first = -1;
        let last = -1;
        for (let f = loF; f <= hiF; f++) {
          if (speechProfile.rms[f] >= speechProfile.speechThresh * 0.85) {
            if (first < 0) first = f;
            last = f;
          }
        }
        if (first >= 0 && last >= first) {
          const candS = Math.max(startTime, first * speechProfile.frameDur - 0.02);
          const candE = Math.min(lineObj.endTime, (last + 1) * speechProfile.frameDur + 0.03);
          if (candE - candS >= Math.min(0.18, duration * 0.35)) {
            segStart = candS;
            segEnd = candE;
          }
        }
      }

      const span = Math.max(0.05, segEnd - segStart);
      let wAcc = 0;
      for (let ti = 0; ti < tokens.length; ti++) {
        const tok = tokens[ti];
        const norm = normalizeWord(tok);
        const ws = segStart + (span * wAcc) / totalW;
        wAcc += weights[ti];
        const we = segStart + (span * wAcc) / totalW;
        const wObj = {
          text: tok,
          norm,
          start: ws,
          end: Math.max(ws + 0.02, we),
          lineIndex: lines.length,
          confidence: 0.85,
        };
        lineObj.words.push(wObj);
        if (norm) words.push(wObj);
      }
    }

    lines.push(lineObj);
  }

  // Enforce monotonic non-decreasing timestamps across lines/words
  for (let i = 1; i < words.length; i++) {
    if (words[i].start < words[i - 1].start) {
      words[i].start = words[i - 1].start;
    }
    if (words[i].end < words[i].start + 0.02) {
      words[i].end = words[i].start + 0.02;
    }
  }

  return {
    text: lines.map((l) => l.text).join(' '),
    lines,
    words,
  };
}

/**
 * Match a single clip's normalized words against the full ordered script word stream
 * using n-gram offset voting + banded ordered subsequence DP.
 */
export function scoreClipAgainstScript(clipNormWords, scriptNormWords) {
  const C = Array.isArray(clipNormWords) ? clipNormWords.filter(Boolean) : [];
  const S = Array.isArray(scriptNormWords) ? scriptNormWords.filter(Boolean) : [];
  if (!C.length || !S.length) {
    return { matched: false, startWord: -1, endWord: -1, centerWord: -1, matchedWords: 0, coverage: 0, precision: 0, score: 0 };
  }

  // Index script unigrams and bigrams
  const uniIndex = new Map();
  const biIndex = new Map();
  for (let i = 0; i < S.length; i++) {
    const w = S[i];
    if (!uniIndex.has(w)) uniIndex.set(w, []);
    uniIndex.get(w).push(i);
    if (i + 1 < S.length) {
      const bi = `${w}\u0000${S[i + 1]}`;
      if (!biIndex.has(bi)) biIndex.set(bi, []);
      biIndex.get(bi).push(i);
    }
  }

  // Offset histogram voting: scriptPos - clipPos
  const bucketSize = Math.max(4, Math.min(18, Math.round(C.length * 0.15)));
  const votes = new Map();
  const addVote = (offset, weight) => {
    const bucket = Math.round(offset / bucketSize);
    for (let b = bucket - 1; b <= bucket + 1; b++) {
      const w = b === bucket ? weight : weight * 0.5;
      votes.set(b, (votes.get(b) || 0) + w);
    }
  };

  for (let ci = 0; ci < C.length; ci++) {
    if (ci + 1 < C.length) {
      const bi = `${C[ci]}\u0000${C[ci + 1]}`;
      const hits = biIndex.get(bi);
      if (hits && hits.length <= 24) {
        for (const si of hits) addVote(si - ci, 3.0);
      }
    }
    const uHits = uniIndex.get(C[ci]);
    if (uHits && uHits.length <= 32) {
      const weight = C[ci].length >= 5 ? 1.2 : 0.6;
      for (const si of uHits) addVote(si - ci, weight);
    }
  }

  // Gather candidate script start offsets (plus 0 and proportional anchors as fallback)
  const sortedBuckets = [...votes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([b]) => clamp(b * bucketSize, 0, Math.max(0, S.length - 1)));

  if (!sortedBuckets.length) sortedBuckets.push(0);

  let best = null;
  for (const approxStart of sortedBuckets) {
    const winPad = Math.max(16, Math.round(C.length * 0.6));
    const winStart = Math.max(0, approxStart - winPad);
    const winEnd = Math.min(S.length, approxStart + C.length + winPad);
    const subLen = winEnd - winStart;
    if (subLen <= 0) continue;

    // Banded ordered matching inside S[winStart .. winEnd-1]
    const n = C.length;
    const m = subLen;
    // Semi-global DP: free start in S, free end in S, align all of C
    const dp = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
    const startCol = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let j = 0; j <= m; j++) startCol[0][j] = j;

    for (let i = 1; i <= n; i++) {
      dp[i][0] = dp[i - 1][0] - 1.0;
      startCol[i][0] = 0;
      for (let j = 1; j <= m; j++) {
        const sim = wordSimilarity(C[i - 1], S[winStart + j - 1]);
        const diagScore = dp[i - 1][j - 1] + (sim >= 0.6 ? sim * 3.0 : -1.5);
        const upScore = dp[i - 1][j] - 1.0;
        const leftScore = dp[i][j - 1] - 0.9;
        if (diagScore >= upScore && diagScore >= leftScore) {
          dp[i][j] = diagScore;
          startCol[i][j] = i === 1 ? j - 1 : startCol[i - 1][j - 1];
        } else if (upScore >= leftScore) {
          dp[i][j] = upScore;
          startCol[i][j] = startCol[i - 1][j];
        } else {
          dp[i][j] = leftScore;
          startCol[i][j] = startCol[i][j - 1];
        }
      }
    }

    let bestJ = 0;
    let bestScore = -Infinity;
    for (let j = 0; j <= m; j++) {
      if (dp[n][j] > bestScore) {
        bestScore = dp[n][j];
        bestJ = j;
      }
    }

    // Count actual matched tokens by greedy forward pass inside [sStart .. sEnd]
    const sStart = winStart + clamp(startCol[n][bestJ], 0, Math.max(0, m - 1));
    const sEnd = Math.max(sStart + 1, winStart + bestJ);
    let matchedWords = 0;
    let sc = sStart;
    for (let ci = 0; ci < n && sc < sEnd; ci++) {
      const lookMax = Math.min(sEnd, sc + 5);
      for (let k = sc; k < lookMax; k++) {
        if (wordSimilarity(C[ci], S[k]) >= 0.6) {
          matchedWords++;
          sc = k + 1;
          break;
        }
      }
    }

    const coverage = matchedWords / Math.max(1, n);
    const spanLen = Math.max(1, sEnd - sStart);
    const precision = matchedWords / spanLen;
    if (!best || bestScore > best.score || (bestScore === best.score && coverage > best.coverage)) {
      best = {
        matched: matchedWords >= Math.min(2, n) && coverage >= 0.25,
        startWord: sStart,
        endWord: sEnd,
        centerWord: (sStart + sEnd) * 0.5,
        matchedWords,
        coverage,
        precision,
        score: bestScore,
      };
    }
  }

  return best || { matched: false, startWord: -1, endWord: -1, centerWord: -1, matchedWords: 0, coverage: 0, precision: 0, score: 0 };
}

/**
 * Rearrange uploaded audio clips (even if uploaded completely out of order or with
 * arbitrary filenames) into the true narrative order of the `.txt` script/captions
 * using their Moonshine transcripts.
 */
export function orderAudioClipsByTranscript(clipResults, scenes, fullNarration = '') {
  const clips = Array.isArray(clipResults) ? clipResults : [];
  if (!clips.length) {
    return { orderedIndices: [], reordered: false, clipMatches: [], isMostlyRandom: false };
  }

  const sceneList = Array.isArray(scenes) ? scenes : [];
  const sceneTexts = sceneList.length ? alignNarrationToScenes(fullNarration, sceneList) : [String(fullNarration || '')];

  const scriptWords = [];
  const scriptWordScene = [];
  for (let si = 0; si < sceneTexts.length; si++) {
    const toks = tokenizeWords(sceneTexts[si]).map(normalizeWord).filter(Boolean);
    for (const t of toks) {
      scriptWords.push(t);
      scriptWordScene.push(si);
    }
  }

  const evaluations = clips.map((clip, idx) => {
    const normObj = normalizeTranscriptLines(clip?.transcript, Number(clip?.durationSec) || 0);
    const clipNormWords = normObj.words.map((w) => w.norm).filter(Boolean);
    const match = scoreClipAgainstScript(clipNormWords, scriptWords);
    const startScene = match.matched && match.startWord >= 0 && match.startWord < scriptWordScene.length
      ? scriptWordScene[match.startWord]
      : -1;
    const endIdx = clamp(match.endWord - 1, 0, Math.max(0, scriptWordScene.length - 1));
    const endScene = match.matched && scriptWordScene.length
      ? scriptWordScene[endIdx]
      : -1;

    return {
      originalIndex: idx,
      name: String(clip?.name || `Clip ${idx + 1}`),
      durationSec: Math.max(0.05, Number(clip?.durationSec) || 0),
      transcriptText: normObj.text,
      wordCount: clipNormWords.length,
      match,
      matchedStartScene: startScene,
      matchedEndScene: endScene,
      isMatched: !!match.matched && clipNormWords.length > 0,
      isRandomAudio: clipNormWords.length > 0 && (!match.matched || match.coverage < 0.35),
    };
  });

  // Sort matched clips by script position (startWord -> centerWord -> originalIndex);
  // keep unmatched clips in relative order after matched clips.
  const sorted = evaluations.slice().sort((a, b) => {
    if (a.isMatched !== b.isMatched) return a.isMatched ? -1 : 1;
    if (a.isMatched && b.isMatched) {
      if (a.match.startWord !== b.match.startWord) return a.match.startWord - b.match.startWord;
      if (a.match.centerWord !== b.match.centerWord) return a.match.centerWord - b.match.centerWord;
    }
    return a.originalIndex - b.originalIndex;
  });

  const orderedIndices = sorted.map((e) => e.originalIndex);
  const reordered = orderedIndices.some((orig, pos) => orig !== pos);
  const matchedCount = sorted.filter((e) => e.isMatched).length;

  return {
    orderedIndices,
    reordered,
    isMostlyRandom: matchedCount === 0 && sorted.some((e) => e.wordCount > 0),
    clipMatches: sorted.map((e, newIdx) => ({
      ...e,
      arrangedIndex: newIdx,
      confidence: Math.round((e.match.coverage || 0) * 100) / 100,
    })),
  };
}

/**
 * Detect physical action & expression cues from spoken words so when random audio
 * diverges from a scene `.txt`, character acting on stage stays coherent with narration.
 */
export function detectActionCueFromText(text) {
  const s = String(text || '').toLowerCase();
  if (!s.trim()) return null;

  const rules = [
    { re: /\b(jump|jumped|jumping|leap|leaped|leapt|bounce|hop|hopped)\b/, anim: 'jump', react: 'cheer', brow: 'happy', mouth: 'grin' },
    { re: /\b(ran|run|running|sprint|sprinted|chase|chased|rush|rushed|fled)\b/, anim: 'run', react: 'fear', brow: 'angry', mouth: 'open' },
    { re: /\b(walk|walked|walking|stroll|strolled|stepped|arrived|approached|entered)\b/, anim: 'walk', react: 'nod', brow: 'calm', mouth: 'smile' },
    { re: /\b(fell|fall|collapse|collapsed|fainted|knocked|crashed|dropped|died)\b/, anim: 'lie', react: 'shock', brow: 'sad', mouth: 'frown' },
    { re: /\b(sat|sit|sitting|chair|desk|seated)\b/, anim: 'sit', react: 'think', brow: 'calm', mouth: 'flat' },
    { re: /\b(cheer|cheered|celebrate|celebrated|won|victory|success|amazing|rich|million|billion)\b/, anim: 'cheer', react: 'cheer', brow: 'happy', mouth: 'grin' },
    { re: /\b(dance|danced|dancing|party)\b/, anim: 'dance', react: 'laugh', brow: 'happy', mouth: 'grin' },
    { re: /\b(clap|clapped|applause|bravo)\b/, anim: 'clap', react: 'clap', brow: 'happy', mouth: 'smile' },
    { re: /\b(wave|waved|hello|goodbye|bye|hey)\b/, anim: 'wave', react: 'wave', brow: 'happy', mouth: 'smile' },
    { re: /\b(shock|shocked|suddenly|exploded|vanished|impossible|what|whoa|secret|twist|panic)\b/, anim: null, react: 'shock', brow: 'angry', mouth: 'open' },
    { re: /\b(cry|cried|sad|tears|lost|failed|alone|sorry|tragic|heartbreak)\b/, anim: null, react: 'sad', brow: 'sad', mouth: 'frown' },
    { re: /\b(angry|furious|yelled|shouted|screamed|fought|hate)\b/, anim: null, react: 'angry', brow: 'angry', mouth: 'open' },
    { re: /\b(laugh|laughed|funny|joke|smiled|happy)\b/, anim: null, react: 'laugh', brow: 'happy', mouth: 'grin' },
    { re: /\b(think|thought|wondered|realized|idea|noticed|checked)\b/, anim: null, react: 'think', brow: 'calm', mouth: 'flat' },
    { re: /\b(pointed|look|looked|saw|stared|spotted)\b/, anim: null, react: 'point', brow: 'calm', mouth: 'open' },
  ];

  for (const r of rules) {
    const m = r.re.exec(s);
    if (m) {
      return {
        keyword: m[1],
        anim: r.anim,
        react: r.react,
        brow: r.brow,
        mouth: r.mouth,
      };
    }
  }
  return null;
}

/**
 * Evaluate a per-scene piecewise audio-to-scene time warp.
 * Maps real audio clock `audioT` (seconds) inside scene `[scStart, scEnd]` to
 * normalized scene animation time `[0, scDuration]` so actions inside the scene
 * (e.g. "and he jumped") fire at the exact second the narrator speaks those words.
 */
export function warpSceneTime(warpPoints, audioT, scStart, scEnd, scDuration) {
  const dur = Math.max(0.1, Number(scDuration) || 5);
  const len = Math.max(0.1, (scEnd ?? scStart + dur) - (scStart ?? 0));
  const fallback = clamp(((audioT - scStart) / len) * dur, 0, dur);
  if (!Array.isArray(warpPoints) || warpPoints.length < 2) return fallback;

  if (audioT <= warpPoints[0].audioT) return clamp(warpPoints[0].sceneT, 0, dur);
  const last = warpPoints[warpPoints.length - 1];
  if (audioT >= last.audioT) return clamp(last.sceneT, 0, dur);

  for (let i = 1; i < warpPoints.length; i++) {
    const p0 = warpPoints[i - 1];
    const p1 = warpPoints[i];
    if (audioT <= p1.audioT) {
      const span = p1.audioT - p0.audioT;
      const frac = span > 1e-4 ? (audioT - p0.audioT) / span : 0;
      return clamp(p0.sceneT + (p1.sceneT - p0.sceneT) * frac, 0, dur);
    }
  }
  return fallback;
}

function buildVerbatimSubtitlesWithWordTimings(spokenWords, fallbackText, scStart, scEnd) {
  if (!spokenWords || !spokenWords.length) {
    const clean = String(fallbackText || '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    return [{ from: scStart, to: scEnd, text: clean, speechFrom: scStart, speechTo: scEnd }];
  }

  const chunks = [];
  let cur = [];
  for (let i = 0; i < spokenWords.length; i++) {
    const w = spokenWords[i];
    cur.push(w);
    const txt = cur.map((x) => x.text).join(' ');
    const endsSentence = /[.!?;:]$/.test(w.text);
    const softBreak = /,$/.test(w.text) && cur.length >= 4;
    const maxLen = cur.length >= 9 || txt.length >= 52;
    if ((endsSentence && cur.length >= 3) || softBreak || maxLen || i === spokenWords.length - 1) {
      chunks.push(cur);
      cur = [];
    }
  }
  if (cur.length) chunks.push(cur);

  return chunks.map((grp, idx) => {
    const first = grp[0];
    const last = grp[grp.length - 1];
    const nextFirst = chunks[idx + 1]?.[0];
    const prevLast = chunks[idx - 1]?.[chunks[idx - 1].length - 1];

    const from = idx === 0
      ? Math.max(scStart, first.start - 0.04)
      : Math.max(prevLast.end + 0.01, first.start - 0.04);
    const rawTo = nextFirst
      ? Math.min(nextFirst.start - 0.02, Math.max(last.end + 0.16, last.end))
      : Math.min(scEnd, Math.max(last.end + 0.18, scEnd - 0.02));
    const to = Math.max(from + 0.12, rawTo);

    return {
      text: grp.map((w) => w.text).join(' '),
      from,
      to,
      speechFrom: first.start,
      speechTo: Math.max(first.start + 0.06, last.end),
      wordTimings: grp.map((w) => ({ text: w.text, start: w.start, end: w.end })),
    };
  });
}

function alignWordsDP(scriptItems, transcriptWords) {
  const N = scriptItems.length;
  const M = transcriptWords.length;
  if (!N || !M) return new Array(N).fill(-1);

  // Use banded DP when lengths are very large (e.g. 30-min video = 4500 words) so alignment completes in <25ms
  const maxDim = Math.max(N, M);
  const band = maxDim > 450 ? Math.max(120, Math.round(Math.abs(N - M) + maxDim * 0.22)) : maxDim + 1;

  if (band >= maxDim) {
    const dp = Array.from({ length: N + 1 }, () => new Float32Array(M + 1));
    const trace = Array.from({ length: N + 1 }, () => new Uint8Array(M + 1)); // 1=diag, 2=up(skip script), 3=left(skip trans)
    for (let i = 1; i <= N; i++) { dp[i][0] = -i * 1.1; trace[i][0] = 2; }
    for (let j = 1; j <= M; j++) { dp[0][j] = -j * 1.1; trace[0][j] = 3; }

    for (let i = 1; i <= N; i++) {
      const sw = scriptItems[i - 1].norm;
      for (let j = 1; j <= M; j++) {
        const sim = wordSimilarity(sw, transcriptWords[j - 1].norm);
        const diag = dp[i - 1][j - 1] + (sim >= 0.6 ? sim * 3.2 : -1.8);
        const up = dp[i - 1][j] - 1.1;
        const left = dp[i][j - 1] - 1.1;
        if (diag >= up && diag >= left) {
          dp[i][j] = diag;
          trace[i][j] = 1;
        } else if (up >= left) {
          dp[i][j] = up;
          trace[i][j] = 2;
        } else {
          dp[i][j] = left;
          trace[i][j] = 3;
        }
      }
    }

    const mapped = new Array(N).fill(-1);
    let i = N;
    let j = M;
    while (i > 0 || j > 0) {
      const tr = trace[i][j];
      if (tr === 1 && i > 0 && j > 0) {
        if (wordSimilarity(scriptItems[i - 1].norm, transcriptWords[j - 1].norm) >= 0.6) {
          mapped[i - 1] = j - 1;
        }
        i--;
        j--;
      } else if (tr === 2 && i > 0) {
        i--;
      } else if (j > 0) {
        j--;
      } else {
        break;
      }
    }
    return mapped;
  }

  // Banded DP around diagonal j = round(i * M / N)
  const stride = band * 2 + 1;
  const scores = Array.from({ length: N + 1 }, () => new Float32Array(stride).fill(-1e9));
  const trace = Array.from({ length: N + 1 }, () => new Uint8Array(stride));
  const jCenter = (i) => Math.round((i * M) / Math.max(1, N));
  const toSlot = (i, j) => j - (jCenter(i) - band);

  scores[0][band] = 0;
  for (let j = 1; j <= Math.min(M, band); j++) {
    scores[0][band + j] = -j * 1.1;
    trace[0][band + j] = 3;
  }

  for (let i = 1; i <= N; i++) {
    const c = jCenter(i);
    const jMin = Math.max(0, c - band);
    const jMax = Math.min(M, c + band);
    const sw = scriptItems[i - 1].norm;

    for (let j = jMin; j <= jMax; j++) {
      const slot = j - (c - band);
      let best = -1e9;
      let tr = 0;

      if (j > 0) {
        const prevSlot = toSlot(i - 1, j - 1);
        if (prevSlot >= 0 && prevSlot < stride) {
          const sim = wordSimilarity(sw, transcriptWords[j - 1].norm);
          const d = scores[i - 1][prevSlot] + (sim >= 0.6 ? sim * 3.2 : -1.8);
          if (d > best) { best = d; tr = 1; }
        }
        const leftSlot = slot - 1;
        if (leftSlot >= 0) {
          const l = scores[i][leftSlot] - 1.1;
          if (l > best) { best = l; tr = 3; }
        }
      }
      const upSlot = toSlot(i - 1, j);
      if (upSlot >= 0 && upSlot < stride) {
        const u = scores[i - 1][upSlot] - 1.1;
        if (u > best) { best = u; tr = 2; }
      }
      scores[i][slot] = best;
      trace[i][slot] = tr;
    }
  }

  const mapped = new Array(N).fill(-1);
  let i = N;
  let j = M;
  while (i > 0 || j > 0) {
    const slot = toSlot(i, j);
    const tr = slot >= 0 && slot < stride ? trace[i][slot] : 0;
    if (tr === 1 && i > 0 && j > 0) {
      if (wordSimilarity(scriptItems[i - 1].norm, transcriptWords[j - 1].norm) >= 0.6) {
        mapped[i - 1] = j - 1;
      }
      i--;
      j--;
    } else if (tr === 2 && i > 0) {
      i--;
    } else if (j > 0) {
      j--;
    } else {
      break;
    }
  }
  return mapped;
}

/**
 * Align a full ordered Moonshine transcript (with real audio timestamps) to the `.txt` scenes.
 * Produces:
 * - `starts`: exact scene boundary timestamps `[0, ..., totalDuration]`
 * - `syncedCaptions`: caption timelines locked onto real spoken words + `wordTimings`
 * - `timeWarps`: per-scene piecewise-linear audio->scene time curves so mid-scene actions hit on the exact word
 * - `sceneTexts`: reconciled spoken narration per scene (updates to actual transcript when random audio diverges)
 * - `actionCues`: detected character acting/expression cues for divergent scenes
 * - `matchReport`: diagnostics (`overallSimilarity`, `divergentScenes`, `mode`: `'aligned' | 'random-reconciled'`)
 */
export function alignTranscriptToScenes({
  transcript,
  scenes,
  narration = '',
  totalDuration = 0,
  pcm = null,
  rate = 0,
  speechProfile = null,
  clipAnchors = null,
}) {
  const M = Array.isArray(scenes) ? scenes.length : 0;
  const total = totalDuration > 0
    ? totalDuration
    : (Array.isArray(scenes) ? scenes.reduce((a, s) => a + Math.max(0.5, +s?.duration || 5), 0) : 0);

  if (!M) {
    return {
      starts: [0],
      total,
      durations: [],
      sceneTexts: [],
      syncedCaptions: [],
      speechCurves: [],
      timeWarps: [],
      actionCues: [],
      matchReport: { overallSimilarity: 1, divergentScenes: [], mode: 'empty' },
    };
  }

  const prof = speechProfile || (pcm && rate > 0 && total > 0 ? buildSpeechProfile(pcm, rate, 0.02) : null);
  const normTx = normalizeTranscriptLines(transcript, total, prof);
  const txWords = normTx.words;

  const baseSceneTexts = alignNarrationToScenes(narration, scenes);
  const scriptItems = [];
  const sceneWordRanges = [];
  for (let si = 0; si < M; si++) {
    const startIdx = scriptItems.length;
    const rawTokens = tokenizeWords(baseSceneTexts[si]);
    const dur = Math.max(0.5, +scenes[si]?.duration || 5);
    const localCount = rawTokens.filter((t) => normalizeWord(t)).length || 1;
    let wOrd = 0;
    for (const raw of rawTokens) {
      const nw = normalizeWord(raw);
      if (!nw) continue;
      const frac = (wOrd + 0.5) / localCount;
      scriptItems.push({
        raw,
        norm: nw,
        sceneIndex: si,
        sceneTime: frac * dur,
      });
      wOrd++;
    }
    sceneWordRanges.push({ start: startIdx, end: scriptItems.length });
  }

  // If transcript is empty (silent audio or ASR unavailable), fall back gracefully to energy sync
  if (!txWords.length) {
    const { syncedCaptions, speechCurves } = computeSyncedSceneCaptions(
      reconcileSceneCaptionsWithNarration(scenes, baseSceneTexts),
      [0, ...scenes.slice(0, -1).reduce((arr, s) => { arr.push((arr[arr.length - 1] || 0) + Math.max(0.5, +s?.duration || 5)); return arr; }, []), total],
      prof
    );
    const st = [0];
    const sumD = scenes.reduce((a, s) => a + Math.max(0.5, +s?.duration || 5), 0) || 1;
    let acc = 0;
    for (let i = 0; i < M - 1; i++) {
      acc += (Math.max(0.5, +scenes[i]?.duration || 5) / sumD) * total;
      st.push(acc);
    }
    st.push(total);
    return {
      starts: st,
      total,
      durations: st.slice(1).map((v, i) => v - st[i]),
      sceneTexts: baseSceneTexts,
      syncedCaptions,
      speechCurves,
      timeWarps: new Array(M).fill(null),
      actionCues: new Array(M).fill(null),
      matchReport: { overallSimilarity: 1, divergentScenes: [], mode: 'fallback' },
    };
  }

  // Run word-level alignment (respecting clipAnchors if multi-clip order anchors exist)
  const mappedScriptToTx = new Array(scriptItems.length).fill(-1);
  if (Array.isArray(clipAnchors) && clipAnchors.length > 1) {
    for (const anc of clipAnchors) {
      const s0 = clamp(anc.startScene, 0, M - 1);
      const s1 = clamp(anc.endScene, s0 + 1, M);
      const wStart = sceneWordRanges[s0].start;
      const wEnd = sceneWordRanges[s1 - 1].end;
      const subScript = scriptItems.slice(wStart, wEnd);

      const txIndices = [];
      for (let ti = 0; ti < txWords.length; ti++) {
        const mid = (txWords[ti].start + txWords[ti].end) * 0.5;
        if (mid >= anc.startSec - 0.15 && mid <= anc.endSec + 0.15) txIndices.push(ti);
      }
      const subTx = txIndices.map((ti) => txWords[ti]);
      const localMap = alignWordsDP(subScript, subTx);
      for (let k = 0; k < localMap.length; k++) {
        if (localMap[k] >= 0) mappedScriptToTx[wStart + k] = txIndices[localMap[k]];
      }
    }
  } else {
    const globalMap = alignWordsDP(scriptItems, txWords);
    for (let k = 0; k < globalMap.length; k++) mappedScriptToTx[k] = globalMap[k];
  }

  // Measure overall script match quality across all scenes
  const totalScriptWords = Math.max(1, scriptItems.length);
  const totalMatchedWords = mappedScriptToTx.filter((x) => x >= 0).length;
  const overallSimilarity = totalMatchedWords / totalScriptWords;

  // Determine scene boundaries [starts[0..M]]
  const starts = new Array(M + 1).fill(0);
  starts[0] = 0;
  starts[M] = total;

  // Compute spoken time span for each scene from matched words
  const sceneMatchedBounds = [];
  for (let si = 0; si < M; si++) {
    const r = sceneWordRanges[si];
    let matchedInScene = 0;
    let firstTx = -1;
    let lastTx = -1;
    for (let k = r.start; k < r.end; k++) {
      const ti = mappedScriptToTx[k];
      if (ti >= 0) {
        matchedInScene++;
        if (firstTx < 0 || ti < firstTx) firstTx = ti;
        if (ti > lastTx) lastTx = ti;
      }
    }
    const swCount = Math.max(1, r.end - r.start);
    const sim = matchedInScene / swCount;
    sceneMatchedBounds.push({ si, matchedInScene, swCount, sim, firstTx, lastTx });
  }

  const isGlobalRandom = overallSimilarity < 0.28;

  if (isGlobalRandom) {
    // Random audio that does not follow the `.txt` script: distribute transcript lines/words
    // evenly by spoken weight across scenes so every scene gets crisp real spoken words + action cues
    const txWeights = txWords.map((w) => Math.max(0.2, estimateSpokenWeight(w.text)));
    const totalTxW = txWeights.reduce((a, b) => a + b, 0) || 1;
    const scenePriors = scenes.map((s) => Math.max(0.5, +s?.duration || 5));
    const totalPrior = scenePriors.reduce((a, b) => a + b, 0) || 1;

    let ti = 0;
    let wAcc = 0;
    let targetPrior = 0;
    for (let si = 1; si < M; si++) {
      targetPrior += (scenePriors[si - 1] / totalPrior) * totalTxW;
      while (ti < txWords.length - (M - si) && wAcc + txWeights[ti] * 0.5 < targetPrior) {
        wAcc += txWeights[ti];
        ti++;
      }
      const prevEnd = ti > 0 ? txWords[ti - 1].end : 0;
      const nextStart = ti < txWords.length ? txWords[ti].start : total;
      starts[si] = clamp((prevEnd + nextStart) * 0.5, starts[si - 1] + 0.2, total - 0.2 * (M - si));
    }
  } else {
    // Grounded boundaries from matched words, interpolating any unanchored gaps smoothly
    for (let si = 1; si < M; si++) {
      const prevB = sceneMatchedBounds[si - 1];
      const curB = sceneMatchedBounds[si];
      if (curB.firstTx >= 0 && curB.sim >= 0.25) {
        const curStart = txWords[curB.firstTx].start;
        const prevEnd = prevB.lastTx >= 0 && prevB.lastTx < curB.firstTx ? txWords[prevB.lastTx].end : curStart;
        starts[si] = (prevEnd + curStart) * 0.5;
      } else if (prevB.lastTx >= 0 && prevB.sim >= 0.25) {
        const prevEnd = txWords[prevB.lastTx].end;
        const nextWord = prevB.lastTx + 1 < txWords.length ? txWords[prevB.lastTx + 1].start : total;
        starts[si] = (prevEnd + nextWord) * 0.5;
      } else {
        starts[si] = -1;
      }
    }

    // Interpolate any unanchored gaps (-1) proportionally by script spoken weights
    let si = 1;
    while (si < M) {
      if (starts[si] >= 0) { si++; continue; }
      const leftIdx = si - 1;
      let rightIdx = si;
      while (rightIdx < M && starts[rightIdx] < 0) rightIdx++;
      const t0 = starts[leftIdx];
      const t1 = starts[rightIdx];
      const weights = [];
      let sumW = 0;
      for (let k = leftIdx; k < rightIdx; k++) {
        const w = estimateSpokenWeight(baseSceneTexts[k]) || Math.max(0.5, +scenes[k]?.duration || 5);
        weights.push(w);
        sumW += w;
      }
      let acc = 0;
      for (let k = leftIdx + 1; k < rightIdx; k++) {
        acc += weights[k - 1 - leftIdx];
        starts[k] = t0 + ((t1 - t0) * acc) / (sumW || 1);
      }
      si = rightIdx;
    }

    // Enforce strictly monotonic boundaries
    for (let i = 1; i < M; i++) {
      starts[i] = clamp(starts[i], starts[i - 1] + 0.12, total - 0.12 * (M - i));
    }

    // Snap boundaries gently to PCM pause valleys when available (never straying > 0.35s from transcript cut)
    if (prof && !prof.silent) {
      const snapped = snapBoundariesToPauses(prof.rms, 1 / prof.frameDur, starts, total, prof);
      for (let i = 1; i < M; i++) {
        if (Math.abs(snapped[i] - starts[i]) <= 0.45 && snapped[i] > starts[i - 1] + 0.12 && snapped[i] < starts[i + 1] - 0.12) {
          starts[i] = snapped[i];
        }
      }
    }
  }

  const durations = [];
  for (let i = 0; i < M; i++) {
    durations.push(Math.max(0.08, starts[i + 1] - starts[i]));
  }

  // Reconcile captions, speech curves, timeWarps, and actionCues per scene
  const finalSceneTexts = [];
  const finalSyncedCaptions = [];
  const timeWarps = [];
  const actionCues = [];
  const divergentScenes = [];

  // Build base speechCurves from PCM profile
  const { speechCurves } = computeSyncedSceneCaptions(scenes, starts, prof);

  for (let si = 0; si < M; si++) {
    const sc = scenes[si] || {};
    const scStart = starts[si];
    const scEnd = starts[si + 1];
    const scDur = Math.max(0.5, +sc.duration || 5);
    const scLen = Math.max(0.1, scEnd - scStart);

    // Collect spoken transcript words inside [scStart, scEnd]
    const sliceWords = txWords.filter((w) => {
      const mid = (w.start + w.end) * 0.5;
      return mid >= scStart - 0.03 && mid <= scEnd + 0.03;
    });

    const mb = sceneMatchedBounds[si];
    const isDivergent = isGlobalRandom || (sliceWords.length >= 3 && mb.sim < 0.38);

    const specialCaps = (Array.isArray(sc.captions) ? sc.captions : [])
      .filter((c) => c && (c.pos === 'center' || c.pos === 'top'))
      .map((c) => {
        const scale = scLen / scDur;
        return {
          ...c,
          from: clamp(scStart + (Number(c.from) || 0) * scale, scStart, scEnd - 0.05),
          to: clamp(scStart + (Number(c.to) || scDur) * scale, scStart + 0.08, scEnd),
        };
      });

    if (isDivergent && sliceWords.length > 0) {
      divergentScenes.push(si);
      const spokenText = sliceWords.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
      finalSceneTexts.push(spokenText);

      const bottomCaps = buildVerbatimSubtitlesWithWordTimings(sliceWords, spokenText, scStart, scEnd);
      finalSyncedCaptions.push([...specialCaps, ...bottomCaps].sort((a, b) => a.from - b.from));

      // Build action cues per phrase/sentence in the divergent spoken transcript
      const cueList = [];
      const firstCue = detectActionCueFromText(spokenText);
      if (firstCue) {
        cueList.push({
          ...firstCue,
          from: sliceWords[0].start,
          to: sliceWords[sliceWords.length - 1].end,
        });
      }
      actionCues.push(cueList.length ? cueList : null);
      timeWarps.push(null);
    } else {
      finalSceneTexts.push(baseSceneTexts[si]);
      actionCues.push(null);

      // Build piecewise audio->scene time warp from matched words in this scene
      const r = sceneWordRanges[si];
      const pts = [{ audioT: scStart, sceneT: 0 }];
      for (let k = r.start; k < r.end; k++) {
        const ti = mappedScriptToTx[k];
        if (ti >= 0) {
          const w = txWords[ti];
          const aMid = clamp((w.start + w.end) * 0.5, scStart, scEnd);
          const sTime = clamp(scriptItems[k].sceneTime, 0, scDur);
          const prev = pts[pts.length - 1];
          if (aMid > prev.audioT + 0.04 && sTime >= prev.sceneT) {
            pts.push({ audioT: aMid, sceneT: sTime });
          }
        }
      }
      pts.push({ audioT: scEnd, sceneT: scDur });
      timeWarps.push(pts.length >= 3 ? pts : null);

      // Build exact spoken-word-grounded captions for this scene
      if (sliceWords.length > 0) {
        const reconciled = reconcileSceneCaptionsWithNarration([sc], [baseSceneTexts[si]])[0];
        const bottomCaps = (reconciled.captions || []).filter((c) => c.pos !== 'center' && c.pos !== 'top');
        if (bottomCaps.length === 1) {
          const first = sliceWords[0];
          const last = sliceWords[sliceWords.length - 1];
          const c = bottomCaps[0];
          const capItem = {
            ...c,
            from: Math.max(scStart, first.start - 0.04),
            to: Math.min(scEnd, Math.max(last.end + 0.18, scEnd - 0.02)),
            speechFrom: first.start,
            speechTo: Math.max(first.start + 0.06, last.end),
            wordTimings: sliceWords.map((w) => ({ text: w.text, start: w.start, end: w.end })),
          };
          finalSyncedCaptions.push([...specialCaps, capItem].sort((a, b) => a.from - b.from));
        } else if (bottomCaps.length > 1) {
          // Distribute sliceWords across bottomCaps proportionally by word count
          const outBottom = [];
          let cursor = 0;
          const capWordCounts = bottomCaps.map((c) => Math.max(1, tokenizeWords(c.text).length));
          const totalCW = capWordCounts.reduce((a, b) => a + b, 0) || 1;
          let accCW = 0;
          for (let ci = 0; ci < bottomCaps.length; ci++) {
            accCW += capWordCounts[ci];
            const targetEnd = ci === bottomCaps.length - 1
              ? sliceWords.length
              : clamp(Math.round((accCW / totalCW) * sliceWords.length), cursor + 1, sliceWords.length - (bottomCaps.length - 1 - ci));
            const grp = sliceWords.slice(cursor, targetEnd);
            cursor = targetEnd;
            const first = grp[0] || sliceWords[sliceWords.length - 1];
            const last = grp[grp.length - 1] || first;
            const nextFirst = ci < bottomCaps.length - 1 && sliceWords[cursor] ? sliceWords[cursor] : null;
            const prevLast = outBottom.length ? outBottom[outBottom.length - 1] : null;
            const from = prevLast ? Math.max(prevLast.speechTo + 0.01, first.start - 0.04) : Math.max(scStart, first.start - 0.04);
            const rawTo = nextFirst ? Math.min(nextFirst.start - 0.02, last.end + 0.16) : Math.min(scEnd, Math.max(last.end + 0.18, scEnd - 0.02));
            outBottom.push({
              ...bottomCaps[ci],
              from,
              to: Math.max(from + 0.1, rawTo),
              speechFrom: first.start,
              speechTo: Math.max(first.start + 0.06, last.end),
              wordTimings: grp.map((w) => ({ text: w.text, start: w.start, end: w.end })),
            });
          }
          finalSyncedCaptions.push([...specialCaps, ...outBottom].sort((a, b) => a.from - b.from));
        } else {
          finalSyncedCaptions.push(specialCaps);
        }
      } else {
        const { syncedCaptions: fallbackCaps } = computeSyncedSceneCaptions(
          reconcileSceneCaptionsWithNarration([sc], [baseSceneTexts[si]]),
          [scStart, scEnd],
          prof
        );
        finalSyncedCaptions.push(fallbackCaps[0] || []);
      }
    }
  }

  return {
    starts,
    total,
    durations,
    sceneTexts: finalSceneTexts,
    syncedCaptions: finalSyncedCaptions,
    speechCurves,
    timeWarps,
    actionCues,
    matchReport: {
      overallSimilarity: Math.round(overallSimilarity * 100) / 100,
      divergentScenes,
      mode: isGlobalRandom ? 'random-reconciled' : (divergentScenes.length ? 'partial-reconciled' : 'aligned'),
      transcriptText: normTx.text,
      wordCount: txWords.length,
    },
  };
}
