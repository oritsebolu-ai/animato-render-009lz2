/* Voiceover transcription for iPhone / iPad / in-app browsers (phones that cannot run the speech model themselves), and the optional
 * "make my voiceover from the script".
 *
 * This app does NOT ask Animato Studio Pro for anything here, and it never touched GitHub. Its own Worker (src/groq.js) holds the Groq keys
 * (wrangler.jsonc) and answers these routes on the tool's own address:
 *
 *   POST /api/transcribe?offset=<sec>   body = 16 kHz mono WAV      -> { success, lines:[{ text, start, end, words:[{ text, start, end, confidence }] }] }
 *   GET  /api/speech/quota                                          -> { success, limit, used, remaining, maxChars, ready }
 *   POST /api/speech/generate           { text }                    -> audio/wav
 *   GET  /api/stt/ready                                             -> { success, ready }
 *
 * Same contract as the on-device transcriber: clips in, [{ index, name, durationSec, transcript:{ text, lines } }] out, so sync is unchanged.
 * (The file keeps its old name so nothing that imports it has to change.)
 */
export const REPO_NAME = 'own-worker-keys';
export class GithubTranscribeError extends Error {
  constructor(message, code = 'error') { super(message); this.name = 'GithubTranscribeError'; this.code = code; }
}
const cfg = {};
/** configure({ fetch, base }) - tests pass a fake fetch; the page passes nothing. */
export function configure(o = {}) { Object.assign(cfg, o); }
// Kept so older callers keep working: there is no token any more.
export function getSavedToken() { return ''; }
export function saveToken() {}
export function forgetToken() {}
export function requestParentToken() { return Promise.resolve(''); }
export function pausedForMs() { return 0; }
export const _state = { ready: false };

const PART_SECONDS = 10 * 60;            // one request carries at most 10 minutes of audio
const SPEAK_PART_CHARS = 700;            // the Worker accepts up to 800 characters per call
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const doFetch = (path, init) => (cfg.fetch || globalThis.fetch)((cfg.base || '') + path, { cache: 'no-store', ...(init || {}) });
async function readJson(res) { try { return await res.json(); } catch { return {}; } }

/** Is this tool's own transcriber set up? (A network hiccup is not "not set up".) */
async function serverReady() {
  try {
    const r = await doFetch('/api/stt/ready');
    if (!r.ok) return true;
    const j = await readJson(r);
    return j.ready !== false;
  } catch { return true; }
}

/** Nothing to connect: the Worker holds the keys. */
export async function connect({ onStatus } = {}) {
  try { onStatus && onStatus('Ready'); } catch { /* ignore */ }
  return { login: '', repo: REPO_NAME };
}
export async function ensureTranscriberReady({ onProgress } = {}) {
  if (!(await serverReady())) throw new GithubTranscribeError('Voiceover sync is not set up on the server yet.', 'no-keys');
  _state.ready = true;
  try { onProgress && onProgress({ percent: 100, message: 'Ready' }); } catch { /* ignore */ }
}
export async function warmUp({ onStatus } = {}) {
  const say = (state, message) => { try { onStatus && onStatus({ state, message }); } catch { /* ignore */ } };
  if (!(await serverReady())) { say('error', 'Voiceover sync is not set up on the server yet.'); return { state: 'error', code: 'no-keys' }; }
  say('ready', 'Voiceover sync is ready');            // nothing is started here: the transcriber is only used when a voiceover is synced
  return { state: 'ready', skipped: true };
}

/** 16 kHz mono copy of a clip's audio (the transcriber's own rate), so the phone sends the smallest thing that works. */
function to16k(pcm, rate) {
  const src = pcm instanceof Float32Array ? pcm : Float32Array.from(pcm || []);
  const r = num(rate, 16000);
  if (!src.length || r === 16000) return new Float32Array(src);
  const ratio = r / 16000, n = Math.max(1, Math.round(src.length / ratio)), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i * ratio, i0 = Math.min(src.length - 1, Math.floor(p)), i1 = Math.min(src.length - 1, i0 + 1); out[i] = src[i0] + (src[i1] - src[i0]) * (p - i0); }
  return out;
}

export function pcmToWavBlob(pcm, rate) {
  const n = pcm.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0, o = 44; i < n; i++, o += 2) { const x = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(o, x < 0 ? x * 32768 : x * 32767, true); }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Turns the transcriber's answer into the shape the app expects. Throws a clear error when the job failed. */
export function parseResult(json, clips) {
  if (!json || typeof json !== 'object') throw new GithubTranscribeError('The transcriber returned an empty result.', 'bad-result');
  if (json.error) throw new GithubTranscribeError(String(json.error).slice(0, 300), 'run-failed');
  if (!Array.isArray(json.clips) || !json.clips.length) throw new GithubTranscribeError('The transcriber returned no transcript.', 'bad-result');
  return clips.map((clip, i) => {
    const c = json.clips.find((x) => Number(x.index) === Number(clip.index ?? i)) || json.clips[i] || {};
    const t = c.transcript || {};
    const lines = (Array.isArray(t.lines) ? t.lines : []).map((l) => ({
      text: String(l.text || '').replace(/\s+/g, ' ').trim(),
      startTime: Math.max(0, num(l.startTime, 0)),
      duration: Math.max(0.08, num(l.duration, 0.4)),
      words: (Array.isArray(l.words) ? l.words : []).map((w) => ({ text: String(w.text || ''), start: num(w.start, 0), end: num(w.end, num(w.start, 0)), confidence: num(w.confidence, 0.85) })).filter((w) => w.text),
    })).filter((l) => l.text);
    return { index: clip.index ?? i, name: String(clip.name || `Clip ${i + 1}`), durationSec: clip.durationSec > 0 ? clip.durationSec : num(c.durationSec, 0), transcript: { text: lines.map((l) => l.text).join(' ').trim(), lines } };
  });
}

/** One piece of audio (16 kHz mono samples) -> the transcriber's lines, shifted by offsetSec. Retries when the keys are busy. */
async function transcribePiece(samples, offsetSec, onWait) {
  const wav = pcmToWavBlob(samples, 16000);
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try { res = await doFetch(`/api/transcribe?offset=${offsetSec.toFixed(2)}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav }); }
    catch { throw new GithubTranscribeError('Could not reach the transcriber. Check the connection and try again.', 'upload'); }
    const j = await readJson(res);
    if (res.ok && j.success) return j;
    if (j.busy && attempt < 2) { try { onWait && onWait(); } catch { /* ignore */ } await sleep(cfg.retryMs ?? 8000); continue; }
    throw new GithubTranscribeError(String(j.error || `The transcriber answered HTTP ${res.status}.`).slice(0, 300), j.limit ? 'limit' : j.busy ? 'busy' : 'run-failed');
  }
  throw new GithubTranscribeError('The transcriber is busy. Please try again in a minute.', 'busy');
}

/** Clips in, transcripts out, on this tool's own Worker. */
export async function transcribeClips(clips, { onProgress = null } = {}) {
  const list = Array.isArray(clips) ? clips : [];
  if (!list.length) return [];
  const say = (ratio, message, i = 0) => { try { onProgress && onProgress({ clipIndex: i, clipCount: list.length, clipName: String(list[i].name || `Clip ${i + 1}`), clipRatio: ratio, overallRatio: ratio, message }); } catch { /* ignore */ } };
  const payload = list.map((c, i) => ({ index: c.index ?? i, name: String(c.name || `Clip ${i + 1}`), pcm: to16k(c.pcm, c.rate), durationSec: c.durationSec }));
  if (payload.some((c) => !c.pcm.length)) throw new GithubTranscribeError('There is no audio to send.', 'upload');
  const totalSamples = payload.reduce((a, c) => a + c.pcm.length, 0);
  let doneSamples = 0;
  const out = [];
  say(0.02, 'Sending your voiceover to be transcribed…');
  for (let i = 0; i < payload.length; i++) {
    const clip = payload[i], lines = [];
    const step = PART_SECONDS * 16000;
    for (let from = 0; from < clip.pcm.length; from += step) {
      const piece = clip.pcm.subarray(from, Math.min(clip.pcm.length, from + step));
      const j = await transcribePiece(piece, from / 16000, () => say(Math.max(0.02, Math.min(0.98, doneSamples / totalSamples)), 'The transcriber is busy, trying again…', i));
      for (const l of (j.lines || [])) lines.push({ text: l.text, startTime: num(l.start, 0), duration: Math.max(0.08, num(l.end, num(l.start, 0)) - num(l.start, 0)), words: (l.words || []).map((w) => ({ text: w.text, start: w.start, end: w.end, confidence: w.confidence })) });
      doneSamples += piece.length;
      say(Math.max(0.02, Math.min(0.98, doneSamples / totalSamples)), 'Transcribing speech…', i);
    }
    out.push({ index: clip.index, transcript: { lines } });
  }
  return parseResult({ clips: out }, payload);
}

// ---------------------------------------------------------------------------------------------------------------------
// Voiceover from the film's script, made by this tool's own Worker on its voice keys.
//   voiceCheck(text)  -> { ok, why, chars, words, minutes, remaining, limit }   does the script fit today's allowance?
//   voiceMake(text)   -> { check, audio: Blob(WAV) | null }                      speaks it (only when it fits)
// ---------------------------------------------------------------------------------------------------------------------
const cleanScript = (t) => String(t || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

async function quota() {
  try {
    const r = await doFetch('/api/speech/quota');
    const j = await readJson(r);
    return r.ok && j.success ? j : null;
  } catch { return null; }
}

/** About 900 characters of speech make a minute. */
export function checkScript(text, q) {
  const t = cleanScript(text), chars = t.length, words = t ? t.split(/\s+/).length : 0, minutes = Math.round((chars / 900) * 10) / 10;
  const base = { chars, words, minutes, remaining: q ? q.remaining : 0, limit: q ? q.limit : 0 };
  if (!chars) return { ok: false, ...base, why: 'There is no script.' };
  if (!q) return { ok: false, ...base, why: 'The voice could not be reached right now. Try again in a moment.' };
  if (q.ready === false) return { ok: false, ...base, why: 'Voiceover is not set up on the server yet.' };
  if (chars > q.remaining) {
    return { ok: false, ...base, why: q.remaining <= 0
      ? `You have used all of today's voice allowance (${q.limit} characters). It comes back at midnight UTC (1 am in Nigeria).`
      : `This script has ${chars} characters (about ${minutes} minute${minutes === 1 ? '' : 's'} of speech) but you have ${q.remaining} left today.` };
  }
  return { ok: true, ...base, why: '' };
}

/** Split into pieces of at most `max` characters, at sentence ends where possible. */
export function scriptParts(text, max = SPEAK_PART_CHARS) {
  const sentences = cleanScript(text).replace(/\n+/g, ' ').match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [];
  const out = []; let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > max && cur) { out.push(cur.trim()); cur = ''; }
    if (s.length > max) { for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max).trim()); continue; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

function readWav(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (b.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new GithubTranscribeError('The voice sent audio in an unexpected format.', 'bad-result');
  let o = 12, rate = 24000, channels = 1, bits = 16, data = null;
  while (o + 8 <= b.length) {
    const id = tag(o); let size = dv.getUint32(o + 4, true); const body = o + 8;
    if (id === 'fmt ') { channels = dv.getUint16(body + 2, true); rate = dv.getUint32(body + 4, true); bits = dv.getUint16(body + 14, true); }
    else if (id === 'data') { if (size === 0 || size === 0xffffffff || body + size > b.length) size = b.length - body; data = b.subarray(body, body + size); break; }
    o = body + size + (size & 1);
  }
  if (!data) throw new GithubTranscribeError('The voice sent audio without sound.', 'bad-result');
  return { rate, channels, bits, data };
}
/** Several WAV files -> one WAV with a short breath between them. */
export function joinWavs(parts) {
  if (parts.length === 1) return parts[0];
  const pcm = parts.map(readWav), { rate, channels, bits } = pcm[0], frame = Math.max(1, (channels * bits) >> 3);
  const gap = Math.round((rate * 0.14)) * frame;
  let total = 0;
  pcm.forEach((p, i) => { total += p.data.length - (p.data.length % frame) + (i < pcm.length - 1 ? gap : 0); });
  const out = new Uint8Array(44 + total), dv = new DataView(out.buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + total, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, channels, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate * frame, true); dv.setUint16(32, frame, true); dv.setUint16(34, bits, true);
  w(36, 'data'); dv.setUint32(40, total, true);
  let at = 44;
  pcm.forEach((p, i) => { const n = p.data.length - (p.data.length % frame); out.set(p.data.subarray(0, n), at); at += n; if (i < pcm.length - 1) at += gap; });
  return out;
}

export const voiceCheck = async (text) => checkScript(text, await quota());

export async function voiceMake(text, { onProgress = null } = {}) {
  const check = checkScript(text, await quota());
  if (!check.ok) return { check, audio: null };       // a script that does not fit is never started
  const parts = scriptParts(text), wavs = [];
  for (let i = 0; i < parts.length; i++) {
    try { onProgress && onProgress(i / parts.length); } catch { /* ignore */ }
    let res;
    try { res = await doFetch('/api/speech/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: parts[i] }) }); }
    catch { throw new GithubTranscribeError('Could not reach the voice. Check the connection and try again.', 'upload'); }
    if (!res.ok) { const j = await readJson(res); throw new GithubTranscribeError(String(j.error || 'The voiceover could not be made. Please try again.').slice(0, 300), 'run-failed'); }
    wavs.push(new Uint8Array(await res.arrayBuffer()));
  }
  try { onProgress && onProgress(1); } catch { /* ignore */ }
  return { check, audio: new Blob([joinWavs(wavs)], { type: 'audio/wav' }) };
}

export function _reset() { _state.ready = false; }
