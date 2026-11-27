/* The files written into the person's own PUBLIC GitHub repo (animato-render-xxxxxx) so a GitHub Actions run can draw the
 * frames of their video and make the MP4.
 *
 *   .github/workflows/render.yml   starts only when the app starts it (workflow_dispatch). No schedule, no retries.
 *   tools/render.mjs               opens this app's engine in headless Chrome (served on localhost from app/), draws one part of the frames
 *   tools/join.mjs                 joins the parts, adds the voiceover, writes video.mp4
 *   tools/serve.mjs                the tiny localhost file server for app/
 *   tools/plan.mjs                 checks the job against the limits and says how many parts to make
 *
 * The app files themselves (app/...) are copied in by the phone from the running app, so the engine is always the same one the
 * person is using. Jobs are branches called job-<id> that the phone deletes when the video has been downloaded.
 *
 * The repo is public (so it needs no extra GitHub permission and uses no one's free minutes), so everything private is encrypted (AES-256-GCM):
 * the job (script, voices), the audio, the parts and the finished video. The key is made on the phone for each job and given to the workflow as an
 * input. That keeps the content out of casual view and search; it is not secrecy against someone who reads the run page while the job exists.
 *
 * Bump PIPELINE_VERSION whenever any file below changes: the app then updates the person's repo by itself.
 */
export const PIPELINE_VERSION = 3;
export const MAX_RUNS_PER_DAY = 3;
export const MAX_SECONDS = 1800;

const WORKFLOW = String.raw`# animato-render-pipeline v@VERSION@
# Made by Animato Stickman Studio. Builds the video for one job (a branch called job-<id>) and saves the encrypted video as an artifact
# that is kept for one day. Nothing here runs unless the app starts it for a real job: there is no schedule and no retry.
name: render
run-name: render @{{ inputs.job }}

on:
  workflow_dispatch:
    inputs:
      job:
        description: Job id made by the app
        required: true
      key:
        description: Key that unlocks this job (made by the app)
        required: true

permissions:
  contents: read
  actions: write

concurrency:
  group: render
  cancel-in-progress: false

jobs:
  plan:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    outputs:
      parts: @{{ steps.plan.outputs.parts }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          ref: job-@{{ inputs.job }}
          path: jobdata
      - name: Check the limits
        env:
          GH_TOKEN: @{{ github.token }}
        run: |
          SINCE=$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)
          N=$(gh api "repos/@{{ github.repository }}/actions/workflows/render.yml/runs?created=%3E%3D$SINCE&per_page=100" --jq '.total_count')
          echo "runs in the last 24 hours: $N"
          if [ "$N" -gt ${MAX_RUNS_PER_DAY} ]; then echo "Daily limit reached"; exit 1; fi
          SINCE5=$(date -u -d '4 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
          M=$(gh api "repos/@{{ github.repository }}/actions/workflows/render.yml/runs?created=%3E%3D$SINCE5&per_page=100" --jq '.total_count')
          if [ "$M" -gt 1 ]; then echo "Please wait a few minutes between renders"; exit 1; fi
      - id: plan
        run: node tools/plan.mjs jobdata/job/meta.json

  render:
    needs: plan
    runs-on: ubuntu-latest
    timeout-minutes: 30
    strategy:
      fail-fast: true
      max-parallel: 10
      matrix:
        part: @{{ fromJson(needs.plan.outputs.parts) }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          ref: job-@{{ inputs.job }}
          path: jobdata
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install
        run: |
          sudo apt-get update -qq && sudo apt-get install -y -qq --no-install-recommends ffmpeg
          npm install --no-audit --no-fund --loglevel=error
      - name: Draw part @{{ matrix.part }}
        env:
          CHROME_PATH: /usr/bin/google-chrome
          KEY: @{{ inputs.key }}
        run: node tools/render.mjs jobdata/job out @{{ matrix.part }}
      - uses: actions/upload-artifact@v4
        with:
          name: part-@{{ matrix.part }}-@{{ inputs.job }}
          path: out/part-@{{ matrix.part }}.enc
          retention-days: 1
          compression-level: 0

  join:
    needs: render
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with:
          ref: job-@{{ inputs.job }}
          path: jobdata
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: sudo apt-get update -y && sudo apt-get install -y ffmpeg
      - uses: actions/download-artifact@v4
        with:
          pattern: part-*-@{{ inputs.job }}
          path: parts
          merge-multiple: true
      - name: Join and add the voiceover
        env:
          KEY: @{{ inputs.key }}
        run: node tools/join.mjs jobdata/job parts final
      - uses: actions/upload-artifact@v4
        with:
          name: video-@{{ inputs.job }}
          path: final/video.enc
          retention-days: 1
          compression-level: 0
      - name: Remove the part files
        env:
          GH_TOKEN: @{{ github.token }}
        run: |
          for id in $(gh api "repos/@{{ github.repository }}/actions/runs/@{{ github.run_id }}/artifacts" --jq '.artifacts[] | select(.name | startswith("part-")) | .id'); do
            gh api -X DELETE "repos/@{{ github.repository }}/actions/artifacts/$id" || true
          done
`.split('${MAX_RUNS_PER_DAY}').join(String(MAX_RUNS_PER_DAY));

const PLAN = String.raw`// Reads the job, refuses anything over the limits, prints the part numbers for the build matrix.
import fs from 'node:fs';
const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));   // meta.json: only { seconds, parts }, nothing private
const secs = Number(job.seconds) || 0;
if (!(secs > 0) || secs > ${MAX_SECONDS} + 5) { console.error('This video is longer than the limit of ${MAX_SECONDS} seconds.'); process.exit(1); }
const parts = Math.max(1, Math.min(99, Number(job.parts) || 1));
const list = Array.from({ length: parts }, (_, i) => i);
fs.appendFileSync(process.env.GITHUB_OUTPUT || '/dev/stdout', 'parts=' + JSON.stringify(list) + '\n');
console.log('parts', list.length, 'seconds', secs);
`.split('${MAX_SECONDS}').join(String(MAX_SECONDS));

const SERVE = String.raw`// A tiny static file server for app/ on localhost (the app only starts on localhost or inside Animato).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm' };
export function serve(dir) {
  const root = path.resolve(dir);
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('not found'); }
    r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ srv, port: srv.address().port })));
}
`;

const CRYPT = String.raw`// AES-256-GCM in 4 MB chunks: [u32 length][12-byte iv][ciphertext + 16-byte tag], after the 8 bytes "AGC1" + u32 chunk size.
// The same format is written and read by the app in the browser (public/gh-render.js).
import fs from 'node:fs';
import crypto from 'node:crypto';
const CH = 4 * 1024 * 1024, MAGIC = Buffer.from('AGC1');
const keyOf = (k) => Buffer.from(String(k || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
export function encryptFile(src, dst, key) {
  const k = keyOf(key), fi = fs.openSync(src, 'r'), fo = fs.openSync(dst, 'w'), buf = Buffer.alloc(CH);
  const head = Buffer.alloc(8); MAGIC.copy(head); head.writeUInt32LE(CH, 4); fs.writeSync(fo, head);
  for (;;) {
    const n = fs.readSync(fi, buf, 0, CH, null); if (!n) break;
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', k, iv), ct = Buffer.concat([c.update(buf.subarray(0, n)), c.final(), c.getAuthTag()]);
    const h = Buffer.alloc(4); h.writeUInt32LE(ct.length); fs.writeSync(fo, Buffer.concat([h, iv, ct]));
  }
  fs.closeSync(fi); fs.closeSync(fo);
}
export function decryptBuffer(data, key) {
  const k = keyOf(key); if (data.subarray(0, 4).toString() !== 'AGC1') throw new Error('Not an encrypted file');
  const out = []; let p = 8;
  while (p < data.length) {
    const len = data.readUInt32LE(p), iv = data.subarray(p + 4, p + 16), ct = data.subarray(p + 16, p + 16 + len); p += 16 + len;
    const d = crypto.createDecipheriv('aes-256-gcm', k, iv); d.setAuthTag(ct.subarray(ct.length - 16));
    out.push(d.update(ct.subarray(0, ct.length - 16)), d.final());
  }
  return Buffer.concat(out);
}
export const decryptFile = (src, dst, key) => fs.writeFileSync(dst, decryptBuffer(fs.readFileSync(src), key));
export const readJobFile = (dir, key) => JSON.parse(decryptBuffer(fs.readFileSync(dir + '/job.enc'), key).toString('utf8'));
`;

const RENDER = String.raw`// node tools/render.mjs <jobdir> <outdir> <part>
// Opens the app's engine in headless Chrome, draws this part's frames one by one and pipes them into ffmpeg.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';
import { readJobFile, encryptFile } from './crypt.mjs';

const [, , jobDir, outDir, partArg] = process.argv;
const part = Number(partArg) || 0;
const job = readJobFile(jobDir, process.env.KEY);
fs.mkdirSync(outDir, { recursive: true });

const { srv, port } = await serve(process.env.APP_DIR || 'app');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb'] });
let ff = null;
try {
  // Several pages draw frames side by side (one per CPU core, at most 3): each page is its own process, so the cores all work.
  const cores = Math.max(1, Math.min(3, Number(process.env.RENDER_PAGES) || (os.availableParallelism ? os.availableParallelism() : os.cpus().length)));
  const open = async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    page.on('pageerror', (e) => console.log('page error:', String(e).slice(0, 300)));
    await page.goto('http://127.0.0.1:' + port + '/index.html?render=1', { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__AnimatoRender, null, { timeout: 120000 });
    const info = await page.evaluate((j) => window.__AnimatoRender.load(j), job);
    return { page, info };
  };
  const pages = await Promise.all(Array.from({ length: cores }, open));
  const info = pages[0].info;
  const N = info.frames, FPS = info.fps, parts = Math.max(1, Number(job.parts) || 1);
  const f0 = Math.floor(part * N / parts), f1 = part === parts - 1 ? N : Math.floor((part + 1) * N / parts);
  console.log('part', part + 1, 'of', parts, 'frames', f0, 'to', f1, 'of', N, 'at', info.W + 'x' + info.H, FPS + 'fps', 'with', cores, 'page(s)');
  const out = path.join(outDir, 'part-' + part + '.mp4');   // plain file, only here on the runner
  ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS * 2), '-an', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, bad) => { ff.on('close', (c) => (c === 0 ? ok() : bad(new Error('ffmpeg stopped with code ' + c)))); ff.on('error', bad); });
  const grab = (i) => pages[(i - f0) % cores].page.evaluate((n) => window.__AnimatoRender.frame(n), i);
  const AHEAD = 3 * cores, q = [];
  let next = f0;
  while (next < f1 && q.length < AHEAD) q.push(grab(next++));
  for (let i = f0; i < f1; i++) {
    const d = await q.shift();
    if (next < f1) q.push(grab(next++));
    const buf = Buffer.from(d.slice(d.indexOf(',') + 1), 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((i - f0) % 600 === 0) console.log('frame', i, '/', f1);
  }
  ff.stdin.end();
  await done;
  encryptFile(out, path.join(outDir, 'part-' + part + '.enc'), process.env.KEY);
  fs.unlinkSync(out);
  console.log('part done', part + 1);
} finally {
  try { await browser.close(); } catch (e) { /* closed */ }
  srv.close();
}
`;

const JOIN = String.raw`// node tools/join.mjs <jobdir> <partsdir> <outdir>
// Joins the parts (in order) and adds the voiceover (raw 16-bit mono PCM pieces) as AAC.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readJobFile, decryptFile, decryptBuffer, encryptFile } from './crypt.mjs';
const [, , jobDir, partsDir, outDir] = process.argv;
const KEY = process.env.KEY;
const job = readJobFile(jobDir, KEY);
fs.mkdirSync(outDir, { recursive: true });
const run = (args) => { const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' }); if (r.status !== 0) throw new Error('ffmpeg failed'); };
const encParts = fs.readdirSync(partsDir).filter((n) => /^part-\d+\.enc$/.test(n)).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
if (!encParts.length) throw new Error('No parts to join');
for (const n of encParts) decryptFile(path.join(partsDir, n), path.join(partsDir, n.replace('.enc', '.mp4')), KEY);
const parts = encParts.map((n) => n.replace('.enc', '.mp4'));
const list = path.join(outDir, 'list.txt');
fs.writeFileSync(list, parts.map((n) => "file '" + path.resolve(partsDir, n) + "'").join('\n'));
const silent = path.join(outDir, 'silent.mp4');
run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent]);
const pcmFiles = fs.readdirSync(jobDir).filter((n) => /^audio-\d+\.enc$/.test(n)).sort();
const final = path.join(outDir, 'video.mp4');
if (job.audio && pcmFiles.length) {
  const raw = path.join(outDir, 'audio.raw');
  fs.writeFileSync(raw, Buffer.concat(pcmFiles.map((n) => decryptBuffer(fs.readFileSync(path.join(jobDir, n)), KEY))));
  run(['-i', silent, '-f', 's16le', '-ar', String(job.audio.rate), '-ac', '1', '-i', raw, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', final]);
} else {
  run(['-i', silent, '-c', 'copy', '-movflags', '+faststart', final]);
}
encryptFile(final, path.join(outDir, 'video.enc'), KEY);
console.log('video ready', final, (fs.statSync(final).size / 1048576).toFixed(1) + ' MB');
for (const f of ['list.txt', 'silent.mp4', 'audio.raw', 'video.mp4']) { try { fs.unlinkSync(path.join(outDir, f)); } catch (e) { /* none */ } }
`;

const PACKAGE = JSON.stringify({ name: 'animato-render', private: true, type: 'module', description: 'Builds videos made in Animato Stickman Studio', dependencies: { 'playwright-core': '1.49.1' } }, null, 2) + '\n';

const README = `# Video builds for Animato Stickman Studio

This public repo was made by Animato Stickman Studio in your own GitHub account. When you choose **Render on GitHub** in the app,
the app puts your video job on a temporary branch, starts the **render** workflow here, and downloads the finished MP4 when it is ready.

- Everything private (your script, voiceover, and the video itself) is **encrypted** before it is put here; only your phone and the render can read it.
- Your video is kept as a workflow artifact for **one day** and is removed as soon as the app has downloaded it.
- The job branch (job-...) is deleted after the download.
- The workflow only runs when you start a render in the app. There is no schedule.
- The app limits you to a few renders a day so your free GitHub Actions minutes are not used up.

You can delete this repo at any time. The app makes a new one the next time you use **Render on GitHub**.
`;

export function pipelineFiles() {
  return [
    ['.github/workflows/render.yml', WORKFLOW.split('@VERSION@').join(String(PIPELINE_VERSION)).split('@{{').join('$' + '{{')],
    ['tools/plan.mjs', PLAN],
    ['tools/serve.mjs', SERVE],
    ['tools/render.mjs', RENDER],
    ['tools/join.mjs', JOIN],
    ['tools/crypt.mjs', CRYPT],
    ['package.json', PACKAGE],
    ['README.md', README],
  ];
}
export const versionMarker = () => '# animato-render-pipeline v' + PIPELINE_VERSION;
export const WORKFLOW_PATH = '.github/workflows/render.yml';
