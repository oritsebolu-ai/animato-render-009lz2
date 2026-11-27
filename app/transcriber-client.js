// Main-thread client managing Moonshine Tiny Cache API detection, background worker lifecycle,
// 16 kHz resampling, pause-bounded chunking, and sequential multi-clip transcription.

export const MOONSHINE_TINY_TOTAL_BYTES = 85000000; // speech model + word-timing file (about 85 MB, downloaded once)
const MODEL_DB = 'animato-transcriber-v1';

let workerInstance = null;
let readyPromise = null;
let jobSeq = 0;
const initWaiters = new Set();
const initProgressListeners = new Set();
const activeJobs = new Map();

// True when the Tiny model files are already stored on this device (the worker keeps them in IndexedDB).
export async function isMoonshineModelCached() {
  try {
    if (typeof indexedDB === 'undefined') return false;
    const rows = await new Promise((resolve, reject) => {
      const open = indexedDB.open(MODEL_DB, 1);
      open.onupgradeneeded = () => { open.result.createObjectStore('files', { keyPath: 'key' }); };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const d = open.result;
        const r = d.transaction('files', 'readonly').objectStore('files').getAllKeys();
        r.onsuccess = () => { d.close(); resolve(r.result || []); };
        r.onerror = () => { d.close(); reject(r.error); };
      };
    });
    const keys = rows.map(String).filter((k) => k.includes('/tiny-streaming-en/'));
    return keys.some((k) => /encoder\.ort$/.test(k)) && keys.some((k) => /decoder_kv\.ort$/.test(k)) && keys.some((k) => k.endsWith('decoder_kv_with_attention.ort'));
  } catch {
    return false;
  }
}

export function resampleTo16kMono(src, fromRate) {
  if (!src || !src.length) return new Float32Array(0);
  const srcRate = Number(fromRate) || 16000;
  if (srcRate === 16000) return new Float32Array(src);
  const ratio = srcRate / 16000;
  const outLen = Math.max(1, Math.round(src.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.min(src.length - 1, Math.floor(pos));
    const i1 = Math.min(src.length - 1, i0 + 1);
    const frac = pos - i0;
    out[i] = src[i0] + (src[i1] - src[i0]) * frac;
  }
  return out;
}

export function findPauseSegments(pcm16k, sampleRate = 16000, buildSpeechProfile = null) {
  const sr = Math.max(8000, Number(sampleRate) || 16000);
  const totalSec = pcm16k && pcm16k.length ? pcm16k.length / sr : 0;
  if (totalSec <= 0) return [];
  if (totalSec <= 34) {
    return [{ startSec: 0, endSec: totalSec }];
  }

  let rms = null;
  let frameDur = 0.02;
  let pauseCeiling = 0.015;
  if (typeof buildSpeechProfile === 'function') {
    const prof = buildSpeechProfile(pcm16k, sr, 0.02);
    if (prof && prof.rms && prof.rms.length) {
      rms = prof.rms;
      frameDur = prof.frameDur || 0.02;
      pauseCeiling = prof.pauseCeiling || 0.015;
    }
  }
  if (!rms) {
    const step = Math.max(1, Math.round(sr * frameDur));
    const nFrames = Math.ceil(pcm16k.length / step);
    rms = new Float32Array(nFrames);
    for (let f = 0; f < nFrames; f++) {
      const s0 = f * step;
      const s1 = Math.min(pcm16k.length, s0 + step);
      let acc = 0;
      for (let i = s0; i < s1; i++) acc += pcm16k[i] * pcm16k[i];
      rms[f] = Math.sqrt(acc / Math.max(1, s1 - s0));
    }
  }

  const segments = [];
  let cursor = 0;
  while (cursor < totalSec - 0.1) {
    if (totalSec - cursor <= 32) {
      segments.push({ startSec: cursor, endSec: totalSec });
      break;
    }
    const target = cursor + 26;
    const lo = Math.max(cursor + 12, target - 5);
    const hi = Math.min(totalSec - 2, target + 5);
    const fLo = Math.max(0, Math.floor(lo / frameDur));
    const fHi = Math.min(rms.length - 1, Math.ceil(hi / frameDur));

    let bestFrame = Math.round(target / frameDur);
    let bestScore = Infinity;
    for (let f = fLo; f <= fHi; f++) {
      const e = rms[f];
      const t = f * frameDur;
      const distPenalty = Math.abs(t - target) * 0.002;
      const silenceBonus = e <= pauseCeiling ? -0.02 : 0;
      const sc = e + distPenalty + silenceBonus;
      if (sc < bestScore) {
        bestScore = sc;
        bestFrame = f;
      }
    }
    const cutSec = Math.max(cursor + 8, Math.min(totalSec - 1, bestFrame * frameDur));
    segments.push({ startSec: cursor, endSec: cutSec });
    cursor = cutSec;
  }

  return segments;
}

function getOrCreateWorker() {
  if (workerInstance) return workerInstance;
  const w = new Worker('/transcriber-worker.js', { type: 'module' });
  w.addEventListener('message', (event) => {
    const msg = event.data || {};
    if (msg.type === 'progress') {
      const loaded = Math.max(0, Number(msg.loaded) || 0);
      const total = Math.max(1, Number(msg.total) || MOONSHINE_TINY_TOTAL_BYTES);
      const pct = Math.min(100, Math.max(0, Math.round((loaded / total) * 100)));
      const payload = { loaded, total, file: String(msg.file || ''), percent: pct };
      for (const cb of initProgressListeners) {
        try { cb(payload); } catch {}
      }
      return;
    }
    if (msg.type === 'ready') {
      for (const waiter of initWaiters) waiter.resolve(true);
      initWaiters.clear();
      return;
    }
    if (msg.type === 'error') {
      const err = new Error(msg.error || 'Failed to prepare audio transcriber.');
      for (const waiter of initWaiters) waiter.reject(err);
      initWaiters.clear();
      readyPromise = null;
      return;
    }
    if (msg.type === 'clip-progress') {
      const job = activeJobs.get(msg.id);
      if (job && typeof job.onProgress === 'function') {
        try { job.onProgress(Math.min(1, Math.max(0, Number(msg.ratio) || 0))); } catch {}
      }
      return;
    }
    if (msg.type === 'clip-result') {
      const job = activeJobs.get(msg.id);
      if (job) {
        activeJobs.delete(msg.id);
        job.resolve(msg.transcript || { text: '', lines: [] });
      }
      return;
    }
    if (msg.type === 'clip-error') {
      const job = activeJobs.get(msg.id);
      if (job) {
        activeJobs.delete(msg.id);
        job.reject(new Error(msg.error || 'Audio transcription failed.'));
      }
    }
  });
  w.addEventListener('error', (ev) => {
    const detail = (ev && ev.message) ? ev.message : 'the transcriber script could not start — rebuild the app (npm run build) so /transcriber-worker.js and /moonshine/ exist';
    const err = new Error('Audio transcriber worker crashed: ' + detail);
    for (const waiter of initWaiters) waiter.reject(err);
    initWaiters.clear();
    for (const [, job] of activeJobs) job.reject(err);
    activeJobs.clear();
    readyPromise = null;
    workerInstance = null;
  });
  workerInstance = w;
  return w;
}

export function ensureTranscriberReady({ onProgress } = {}) {
  if (typeof Worker === 'undefined') {
    return Promise.reject(new Error('Web Workers are not supported in this browser.'));
  }
  if (typeof onProgress === 'function') {
    initProgressListeners.add(onProgress);
  }
  if (!readyPromise) {
    const worker = getOrCreateWorker();
    readyPromise = new Promise((resolve, reject) => {
      initWaiters.add({ resolve, reject });
      worker.postMessage({ type: 'init' });
    }).finally(() => {
      if (typeof onProgress === 'function') {
        initProgressListeners.delete(onProgress);
      }
    });
  } else if (typeof onProgress === 'function') {
    readyPromise.finally(() => initProgressListeners.delete(onProgress));
  }
  return readyPromise;
}

export async function transcribeClips(decodedClips, { buildSpeechProfile = null, onProgress = null } = {}) {
  const clips = Array.isArray(decodedClips) ? decodedClips : [];
  if (!clips.length) return [];

  await ensureTranscriberReady();
  const worker = getOrCreateWorker();

  const out = [];
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const pcm16k = resampleTo16kMono(clip.pcm, clip.rate);
    const segments = findPauseSegments(pcm16k, 16000, buildSpeechProfile);
    const durationSec = clip.durationSec > 0 ? clip.durationSec : (pcm16k.length / 16000);
    const id = ++jobSeq;

    const transcript = await new Promise((resolve, reject) => {
      activeJobs.set(id, {
        resolve,
        reject,
        onProgress: (clipRatio) => {
          if (typeof onProgress === 'function') {
            onProgress({
              clipIndex: i,
              clipCount: clips.length,
              clipName: String(clip.name || `Clip ${i + 1}`),
              clipRatio,
              overallRatio: (i + clipRatio) / clips.length,
            });
          }
        },
      });
      worker.postMessage(
        {
          type: 'transcribe-clip',
          id,
          pcmBuffer: pcm16k.buffer,
          sampleRate: 16000,
          segments,
        },
        [pcm16k.buffer]
      );
    });

    out.push({
      index: clip.index ?? i,
      name: String(clip.name || `Clip ${i + 1}`),
      durationSec,
      transcript,
    });
  }

  return out;
}
