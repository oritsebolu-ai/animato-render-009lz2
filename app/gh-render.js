// "Render on GitHub": the phone sends a video job to a PUBLIC repo in the person's own GitHub account (everything private is encrypted), a GitHub Actions
// run draws the frames and makes the MP4 (saved as a one-day artifact), and the phone downloads it and deletes it.
//
// This file is the phone side and has no page code in it (so it is tested in Node):
//   caps         what one person may render (per run, per day, per month), counted here and again inside the workflow
//   GhApi        the few GitHub REST calls used (create repo, push a job branch, start the workflow, read runs and artifacts)
//   zip reader   an artifact comes back as a zip; the MP4 is stored inside it without compression
//   job helpers  ids, the audio split, the parts plan, the job file

export const CAPS = {
  maxSeconds: 30 * 60,        // one video: up to 30 minutes
  perDay: 3,                  // renders in 24 hours
  secondsPerDay: 30 * 60,     // video minutes in 24 hours
  secondsPerMonth: 900 * 60,  // video minutes in 30 days (public repos use no one's free Actions minutes; this only keeps use sensible)
  partSeconds: 120,           // each parallel piece is about 2 minutes of video
  maxParts: 10,               // never more than 10 pieces at once (gentle on GitHub, still fast)
  maxParallel: 10,
  cooldownSec: 300,           // at least 5 minutes between two renders
  keepDays: 1,                // the finished video is kept 1 day, and removed as soon as it has been downloaded
};
export const REPO_PREFIX = 'animato-render-';
export const WORKFLOW_FILE = 'render.yml';
export const AUDIO_PIECE_BYTES = 18 * 1024 * 1024;
const DAY = 86400e3;

export class GhError extends Error {
  constructor(message, code = 'error', status = 0) { super(message); this.name = 'GhError'; this.code = code; this.status = status; }
}

/* ---------- caps ---------- */
/** usage: [{t: ms, sec}]. Returns { ok, reason, usage } (usage with old entries dropped). */
export function capCheck(usage, seconds, now = Date.now()) {
  const list = (Array.isArray(usage) ? usage : []).filter((u) => u && now - u.t < 30 * DAY);
  const day = list.filter((u) => now - u.t < DAY);
  const sec = Math.max(0, +seconds || 0);
  const mins = (s) => Math.round(s / 60);
  if (sec <= 0) return { ok: false, reason: 'There is nothing to render yet.', usage: list };
  if (sec > CAPS.maxSeconds) return { ok: false, reason: 'GitHub rendering takes videos up to ' + mins(CAPS.maxSeconds) + ' minutes. This one is ' + mins(sec) + '. Render it on this device, or shorten it.', usage: list };
  const last = list.reduce((m, u) => Math.max(m, u.t), 0);
  if (last && now - last < CAPS.cooldownSec * 1000) return { ok: false, reason: 'Please wait ' + Math.ceil((CAPS.cooldownSec * 1000 - (now - last)) / 60000) + ' more minute(s) before the next GitHub render. This keeps your GitHub account in good standing.', usage: list };
  if (day.length >= CAPS.perDay) return { ok: false, reason: 'You have used your ' + CAPS.perDay + ' GitHub renders for today. Try again tomorrow, or render on this device.', usage: list };
  if (day.reduce((a, u) => a + u.sec, 0) + sec > CAPS.secondsPerDay) return { ok: false, reason: 'That would pass today\'s ' + mins(CAPS.secondsPerDay) + ' minutes of GitHub rendering. Try again tomorrow, or render on this device.', usage: list };
  if (list.reduce((a, u) => a + u.sec, 0) + sec > CAPS.secondsPerMonth) return { ok: false, reason: 'You have used this month\'s GitHub rendering (' + mins(CAPS.secondsPerMonth) + ' minutes). Render on this device, or try later.', usage: list };
  return { ok: true, reason: '', usage: list };
}
export const recordUse = (usage, seconds, now = Date.now()) => [...capCheck(usage, 0, now).usage, { t: now, sec: Math.max(0, Math.round(+seconds || 0)) }];
export function capSummary(usage, now = Date.now()) {
  const list = capCheck(usage, 1, now).usage, day = list.filter((u) => now - u.t < DAY);
  return { rendersLeftToday: Math.max(0, CAPS.perDay - day.length), minutesLeftToday: Math.max(0, Math.round((CAPS.secondsPerDay - day.reduce((a, u) => a + u.sec, 0)) / 60)) };
}

/* ---------- ids, parts, audio ---------- */
export const jobId = (now = Date.now(), rnd = Math.random()) => 'j' + now.toString(36) + Math.floor(rnd * 36 ** 3).toString(36).padStart(3, '0');
export const branchOf = (id) => 'job-' + id;
export function repoNameFor(login, seed = '') {
  let h = 5381; const s = String(login || '').toLowerCase() + '|' + seed;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return REPO_PREFIX + h.toString(36).slice(0, 6).padStart(6, '0');
}
/** frames split into about-2-minute pieces, at most 10 (all drawn side by side) */
export function partsFor(totalSec, partSec = CAPS.partSeconds) {
  return Math.max(1, Math.min(CAPS.maxParts, Math.ceil((+totalSec || 0) / partSec)));
}
/** The narration is sent as raw 16-bit mono PCM in pieces, at the best rate that keeps the whole job small. */
export function audioRateFor(seconds) {
  const bytesAt = (r) => r * 2 * seconds;
  for (const r of [48000, 32000, 24000, 16000]) if (bytesAt(r) <= 110e6) return r;
  return 16000;
}
export function pcmPieces(int16, pieceBytes = AUDIO_PIECE_BYTES) {
  const per = Math.max(2, Math.floor(pieceBytes / 2)), out = [];
  for (let i = 0; i < int16.length; i += per) out.push(new Uint8Array(int16.buffer, int16.byteOffset + i * 2, Math.min(per, int16.length - i) * 2));
  return out;
}
export function floatToInt16(f32) {
  const o = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) { const v = Math.max(-1, Math.min(1, f32[i])); o[i] = v < 0 ? v * 32768 : v * 32767; }
  return o;
}
/** linear resample of one channel (good enough for speech) */
export function resampleMono(f32, from, to) {
  if (from === to) return f32;
  const n = Math.max(1, Math.round(f32.length * to / from)), o = new Float32Array(n), k = from / to;
  for (let i = 0; i < n; i++) { const x = i * k, i0 = Math.floor(x), i1 = Math.min(f32.length - 1, i0 + 1), t = x - i0; o[i] = f32[i0] * (1 - t) + f32[i1] * t; }
  return o;
}

/* ---------- bytes <-> base64 ---------- */
export function toB64(u8) {
  let s = ''; const step = 0x8000;
  for (let i = 0; i < u8.length; i += step) s += String.fromCharCode.apply(null, u8.subarray(i, i + step));
  return btoa(s);
}
export const textToB64 = (t) => toB64(new TextEncoder().encode(String(t)));

/* ---------- encryption: AES-256-GCM in 4 MB chunks, the same format tools/crypt.mjs reads and writes on the runner ---------- */
const CH = 4 * 1024 * 1024;
const b64u = (u8) => toB64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (t) => { const s = String(t).replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(s + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)); };
export const newKey = () => b64u(crypto.getRandomValues(new Uint8Array(32)));
const cryptoKey = (k, use) => crypto.subtle.importKey('raw', unb64u(k), 'AES-GCM', false, [use]);
export async function encryptBytes(u8, key) {
  const k = await cryptoKey(key, 'encrypt'), out = [];
  const head = new Uint8Array(8); head.set([65, 71, 67, 49]); new DataView(head.buffer).setUint32(4, CH, true); out.push(head);
  for (let i = 0; i < u8.length; i += CH) {
    const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, u8.subarray(i, Math.min(u8.length, i + CH))));
    const h = new Uint8Array(4); new DataView(h.buffer).setUint32(0, ct.length, true); out.push(h, iv, ct);
  }
  const all = new Uint8Array(out.reduce((n, a) => n + a.length, 0)); let p = 0; for (const a of out) { all.set(a, p); p += a.length; }
  return all;
}
export async function decryptBytes(u8, key) {
  if (String.fromCharCode(...u8.subarray(0, 4)) !== 'AGC1') throw new GhError('The video file is not in the expected format.', 'crypt');
  const k = await cryptoKey(key, 'decrypt'), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = [];
  let p = 8, n = 0;
  while (p < u8.length) {
    const len = dv.getUint32(p, true), iv = u8.subarray(p + 4, p + 16), ct = u8.subarray(p + 16, p + 16 + len); p += 16 + len;
    try { const d = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, ct)); out.push(d); n += d.length; }
    catch (e) { throw new GhError('The video could not be unlocked.', 'crypt'); }
  }
  const all = new Uint8Array(n); let q = 0; for (const a of out) { all.set(a, q); q += a.length; }
  return all;
}

/* ---------- zip (an artifact is a zip; the MP4 inside is stored, because the workflow uploads with compression 0) ---------- */
export async function readZip(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new GhError('The downloaded file is not a zip.', 'zip');
  const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new GhError('The zip is damaged.', 'zip');
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
    const lnl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true), start = off + 30 + lnl + lel;
    let data = u8.subarray(start, start + csize);
    if (method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new GhError('This browser cannot unzip the video.', 'zip');
      const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(data); w.close();
      data = new Uint8Array(await new Response(ds.readable).arrayBuffer());
    } else if (method !== 0) throw new GhError('The zip uses a format this app cannot read.', 'zip');
    if (data.length !== usize && method === 0) data = data.subarray(0, usize);
    out.push({ name, data });
    p += 46 + nl + el + cl;
  }
  return out;
}

/* ---------- GitHub REST ---------- */
const API = 'https://api.github.com';
export class GhApi {
  constructor(token, { fetch: f, base } = {}) { this.token = token; this.f = f || ((...a) => globalThis.fetch(...a)); this.base = base || API; }
  /** Writes are paced (well under GitHub's limits) and a "slow down" answer is waited out once, as GitHub asks. */
  async req(method, path, body, opts = {}) {
    if (method !== 'GET') { const wait = (this.lastWrite || 0) + (this.gap == null ? 350 : this.gap) - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); this.lastWrite = Date.now(); }
    try { return await this.req1(method, path, body, opts); }
    catch (e) {
      /* GitHub said 401: ask for a fresh sign-in once (the app gets it from Animato), then repeat this same call */
      if (e.code === 'auth' && !opts._authRetried && typeof this.refresh === 'function') {
        let t = null; try { t = await this.refresh(this.token); } catch (x) { /* no new token */ }
        if (t && t !== this.token) { this.token = t; return this.req(method, path, body, Object.assign({}, opts, { _authRetried: true })); }
      }
      if (e.code === 'rate' && !opts._retried && (e.retryAfter || 0) <= 90) { await new Promise((r) => setTimeout(r, Math.max(2, e.retryAfter || 30) * 1000)); return this.req(method, path, body, Object.assign({}, opts, { _retried: true })); }
      throw e;
    }
  }
  async req1(method, path, body, { raw = false, accept } = {}) {
    const res = await this.f(this.base + path, {
      method,
      headers: Object.assign({ Authorization: 'Bearer ' + this.token, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (res.status === 204) return null;
    if (!res.ok) {
      let m = ''; try { const j = await res.json(); m = j.message || ''; } catch (e) { /* no body */ }
      if (res.status === 401) throw new GhError('GitHub did not accept the sign-in. Connect again.', 'auth', 401);
      if (res.status === 403 || res.status === 429) {
        const lim = /rate|abuse|secondary/i.test(m);
        const err = new GhError(lim ? 'GitHub asked us to slow down. Try again in a few minutes.' : 'GitHub refused this: ' + (m || 'no permission') + '.', lim ? 'rate' : 'forbidden', res.status); err.retryAfter = Number(res.headers && res.headers.get && res.headers.get('retry-after')) || 0; throw err;
      }
      if (res.status === 404) throw new GhError('GitHub could not find that (' + (m || path) + ').', 'notfound', 404);
      throw new GhError('GitHub said: ' + (m || res.status), 'error', res.status);
    }
    return raw ? res : res.json();
  }
  user() { return this.req('GET', '/user'); }
  async repoExists(owner, name) { try { return await this.req('GET', `/repos/${owner}/${name}`); } catch (e) { if (e.code === 'notfound') return null; throw e; } }
  createRepo(name) { return this.req('POST', '/user/repos', { name, private: false, auto_init: true, description: 'Video builds made with Animato Stickman Studio (encrypted)' }); }
  /** One commit that writes files [{path, b64}] onto a branch (created from the default branch when it is new). */
  async pushFiles(owner, repo, branch, files, message, { fromBranch = 'main', onFile } = {}) {
    const R = `/repos/${owner}/${repo}`;
    let baseSha = null, parent = null;
    try { parent = (await this.req('GET', `${R}/git/ref/heads/${branch}`)).object.sha; baseSha = parent; } catch (e) { if (e.code !== 'notfound') throw e; }
    if (!baseSha) baseSha = (await this.req('GET', `${R}/git/ref/heads/${fromBranch}`)).object.sha;
    const baseCommit = await this.req('GET', `${R}/git/commits/${baseSha}`);
    const tree = [];
    let n = 0;
    for (const f of files) {
      if (onFile) onFile(n++, files.length);
      const b = await this.req('POST', `${R}/git/blobs`, { content: f.b64, encoding: 'base64' });
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: b.sha });
    }
    const t = await this.req('POST', `${R}/git/trees`, { base_tree: baseCommit.tree.sha, tree });
    const c = await this.req('POST', `${R}/git/commits`, { message, tree: t.sha, parents: [baseSha] });
    if (parent) await this.req('PATCH', `${R}/git/refs/heads/${branch}`, { sha: c.sha, force: true });
    else await this.req('POST', `${R}/git/refs`, { ref: 'refs/heads/' + branch, sha: c.sha });
    return c.sha;
  }
  async fileText(owner, repo, path, ref) {
    try { const j = await this.req('GET', `/repos/${owner}/${repo}/contents/${path}${ref ? '?ref=' + encodeURIComponent(ref) : ''}`); return atob(String(j.content || '').replace(/\n/g, '')); }
    catch (e) { if (e.code === 'notfound') return null; throw e; }
  }
  dispatch(owner, repo, ref, inputs) { return this.req('POST', `/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`, { ref, inputs }); }
  async findRun(owner, repo, id) {
    const j = await this.req('GET', `/repos/${owner}/${repo}/actions/runs?event=workflow_dispatch&per_page=20`);
    return (j.workflow_runs || []).find((r) => String(r.display_title || r.name || '').includes(id)) || null;
  }
  async activeRuns(owner, repo) {
    const out = [];
    for (const st of ['queued', 'in_progress']) out.push(...((await this.req('GET', `/repos/${owner}/${repo}/actions/runs?status=${st}&per_page=10`)).workflow_runs || []));
    return out;
  }
  run(owner, repo, runId) { return this.req('GET', `/repos/${owner}/${repo}/actions/runs/${runId}`); }
  async artifacts(owner, repo, runId) { return (await this.req('GET', `/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`)).artifacts || []; }
  async downloadArtifact(owner, repo, artifactId) {
    const res = await this.req('GET', `/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`, undefined, { raw: true });
    return new Uint8Array(await res.arrayBuffer());
  }
  deleteArtifact(owner, repo, artifactId) { return this.req('DELETE', `/repos/${owner}/${repo}/actions/artifacts/${artifactId}`).catch(() => null); }
  deleteBranch(owner, repo, branch) { return this.req('DELETE', `/repos/${owner}/${repo}/git/refs/heads/${branch}`).catch(() => null); }
  deleteRun(owner, repo, runId) { return this.req('DELETE', `/repos/${owner}/${repo}/actions/runs/${runId}`).catch(() => null); }
  cancelRun(owner, repo, runId) { return this.req('POST', `/repos/${owner}/${repo}/actions/runs/${runId}/cancel`).catch(() => null); }
}

/** Where a run stands, for the progress text. */
export function runState(run) {
  if (!run) return { phase: 'starting', done: false, ok: false };
  if (run.status === 'completed') return { phase: run.conclusion === 'success' ? 'done' : 'failed', done: true, ok: run.conclusion === 'success', conclusion: run.conclusion };
  if (run.status === 'in_progress') return { phase: 'rendering', done: false, ok: false };
  return { phase: 'queued', done: false, ok: false };
}
export const phaseText = (p) => ({ starting: 'Starting on GitHub...', queued: 'Waiting for GitHub to start it...', rendering: 'Rendering on GitHub...', done: 'Ready', failed: 'The render did not finish' }[p] || 'Working...');

/** The job file the runner reads. */
export function buildJob({ id, origin, code, ar, W, H, FPS, par, clip, sync, sel, pack, bgs, audio, seconds, sub }) {
  return { v: 1, id, origin: origin || '', code, ar: ar || '16:9', W, H, FPS, par: par || 'xMidYMid meet', clip: !!clip, sync: sync || null, sel: sel || 'original', pack: pack || null, bgs: bgs || [], audio: audio || null, sub: sub || null, seconds, parts: partsFor(seconds), keepDays: CAPS.keepDays };
}
