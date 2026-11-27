// Voiceover from Animato's own voice studio (Fast = Pocket TTS, Pro = Chatterbox), for a film whose person has no recording of their own.
//
// This app does NOT run a voice engine and does NOT touch GitHub for it. Animato Studio Pro already makes the person's own `animato-tts` repo
// (when it is missing), runs its workflow and keeps the models in the GitHub Actions cache, and its Text to speech tool uses the same repo.
// This app only asks Animato (the page this app is framed in) for voices, previews and speech, through postMessage:
//
//   app -> Animato   { type:'stickman:tts-start' | 'stickman:tts-status-request' | 'stickman:tts-voices-request' |
//                            'stickman:tts-preview-request' (engine, voice) | 'stickman:tts-speak-request' (engine, voice, text) | 'stickman:tts-cancel', id }
//   Animato -> app   { type:'animato:tts-ack', id }                     (heard you, at once)
//                    { type:'animato:tts-progress', id, stage, part, parts, state }
//                    { type:'animato:tts-result', id, kind, ok, ... }   (status | voices | blob | blob+seconds | error)
//
// Outside Animato (no parent page) nothing here is offered: the app starts as it always did.

const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

/** Words to speak from what the AI wrote: plain spoken text, no labels, brackets, markdown or emoji. */
export function cleanNarration(text, stripHeaders) {
  let s = String(text == null ? '' : text);
  if (typeof stripHeaders === 'function') { try { s = stripHeaders(s) || s; } catch { /* keep s */ } }
  s = s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[[^\]]{0,80}\]/g, ' ')                                   // [pause] [music] [SCENE 3]
    .replace(/^\s*(?:scene|part|batch|chapter)\s*\d+\s*[:.\-–—)]?\s*$/gim, ' ')
    .replace(/^\s*(?:scene|part|batch|chapter)\s*\d+\s*[:.\-–—)]\s*/gim, '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/[*_`~]+/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  return s;
}

// ---------------------------------------------------------------------------------------------------------
// The client: requests to Animato and their answers
// ---------------------------------------------------------------------------------------------------------
/**
 * transport = { post(message) -> boolean, listen(fn) -> unlisten } (fn receives each message from Animato; the caller has already checked who sent it).
 * Every request is answered with an immediate ack; no ack means this app is not inside Animato (or Animato is too old to know voices).
 */
export function createVoiceClient(transport, opts = {}) {
  const ackMs = num(opts.ackMs, 9000);
  const pending = new Map();
  let seq = 0;
  const newId = () => `v${Date.now().toString(36)}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let off = null;
  const ensureListening = () => {
    if (off) return;
    off = transport.listen((d) => {
      if (!d || typeof d.type !== 'string' || !d.id) return;
      const p = pending.get(d.id);
      if (!p) return;
      if (d.type === 'animato:tts-ack') { clearTimeout(p.ackTimer); p.acked = true; return; }
      if (d.type === 'animato:tts-progress') { try { p.onProgress && p.onProgress(d); } catch { /* the caller's problem */ } return; }
      if (d.type === 'animato:tts-result') {
        clearTimeout(p.ackTimer); pending.delete(d.id);
        if (d.ok) p.resolve(d); else { const e = new Error(d.error || 'The voice studio did not answer.'); e.signedIn = d.signedIn; p.reject(e); }
      }
    });
  };
  /** retries: only for requests that are safe to send twice (not speech). */
  function request(type, payload = {}, o = {}) {
    ensureListening();
    return new Promise((resolve, reject) => {
      const id = newId();
      const p = { resolve, reject, onProgress: o.onProgress, acked: false, ackTimer: 0 };
      pending.set(id, p);
      const fail = (err) => { clearTimeout(p.ackTimer); pending.delete(id); reject(err); };
      let tries = 0;
      const send = () => {
        tries++;
        let sent = false;
        try { sent = transport.post({ type, id, ...payload }); } catch { sent = false; }
        if (!sent) return fail(Object.assign(new Error('Voices are only available inside Animato Studio Pro.'), { noBridge: true }));
        p.ackTimer = setTimeout(() => {
          if (p.acked || !pending.has(id)) return;
          if (o.retry && tries < 3) return send();
          fail(Object.assign(new Error('Animato did not answer. Please reopen Code to stickman from Animato Studio Pro and try again.'), { noBridge: true }));
        }, o.retry ? Math.round(ackMs / 3) : ackMs);
      };
      if (o.signal) {
        if (o.signal.aborted) return fail(new Error('Stopped.'));
        o.signal.addEventListener('abort', () => { if (!pending.has(id)) return; try { transport.post({ type: 'stickman:tts-cancel', id }); } catch { /* gone */ } fail(new Error('Stopped.')); }, { once: true });
      }
      send();
    });
  }
  return {
    request,
    start: () => request('stickman:tts-start', {}, { retry: true }).then((d) => d.status || {}),
    status: () => request('stickman:tts-status-request', {}, { retry: true }).then((d) => d.status || {}),
    voices: () => request('stickman:tts-voices-request', {}, { retry: true }).then((d) => d.voices || { fast: [], pro: [], previews: { fast: [], pro: [] }, mine: [] }),
    preview: (engine, voice) => request('stickman:tts-preview-request', { engine, voice }, { retry: true }).then((d) => d.blob),
    speak: ({ engine, voice, text, onProgress, signal }) => request('stickman:tts-speak-request', { engine, voice, text }, { onProgress, signal }).then((d) => ({ blob: d.blob, seconds: num(d.seconds) })),
    close() { if (off) { off(); off = null; } pending.forEach((p) => clearTimeout(p.ackTimer)); pending.clear(); },
  };
}

/** The real transport: Animato's page (the parent), addressed to its exact origin only, listened to only from that window. */
export function parentTransport(win = globalThis.window) {
  const origin = (win && win.__EMBED && win.__EMBED.allowed && win.__EMBED.parent) || '';
  if (!win || !origin || win.top === win.self) return null;
  return {
    origin,
    post: (m) => { try { win.parent.postMessage(m, origin); return true; } catch { return false; } },
    listen: (fn) => {
      const on = (e) => { if (e.origin === origin && e.source === win.parent) fn(e.data); };
      win.addEventListener('message', on);
      return () => win.removeEventListener('message', on);
    },
  };
}
export const voicesAvailable = (win = globalThis.window) => !!parentTransport(win);

// ---------------------------------------------------------------------------------------------------------
// The choice: Fast / Pro / None, the voice list with previews, Proceed
// ---------------------------------------------------------------------------------------------------------
const CSS = `
.vsv-bg{position:fixed;inset:0;z-index:100000;background:rgba(8,10,14,.72);display:flex;align-items:center;justify-content:center;padding:14px;font-family:var(--sans,system-ui,sans-serif)}
.vsv{width:min(520px,100%);max-height:min(88vh,720px);display:flex;flex-direction:column;background:var(--card,#1d2027);color:var(--fg,#e4e6eb);border:1px solid var(--line2,#3d4350);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.5);overflow:hidden}
.vsv h2{margin:0;font-size:18px;font-weight:700}
.vsv-head{padding:16px 18px 6px;display:flex;align-items:center;gap:10px}
.vsv-head button.vsv-back{background:none;border:0;color:var(--mu,#98a0ad);font-size:20px;cursor:pointer;padding:2px 8px 2px 0}
.vsv-sub{padding:0 18px 12px;color:var(--mu,#98a0ad);font-size:13.5px;line-height:1.45}
.vsv-body{padding:0 18px 14px;overflow:auto;flex:1}
.vsv-foot{padding:12px 18px 16px;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;border-top:1px solid var(--line,#2e333d)}
.vsv button{font:inherit}
.vsv-btn{border:1px solid var(--line2,#3d4350);background:var(--card2,#242831);color:var(--fg,#e4e6eb);border-radius:10px;padding:10px 16px;font-size:14px;cursor:pointer;min-height:42px}
.vsv-btn.pri{background:var(--ac,#4f8cff);border-color:var(--ac,#4f8cff);color:var(--acf,#fff);font-weight:600}
.vsv-btn[disabled]{opacity:.45;cursor:not-allowed}
.vsv-big{display:flex;flex-direction:column;gap:10px}
.vsv-big button{text-align:left;border:1px solid var(--line2,#3d4350);background:var(--card2,#242831);color:inherit;border-radius:12px;padding:14px 16px;cursor:pointer}
.vsv-big button b{display:block;font-size:16px;margin-bottom:3px}
.vsv-big button span{color:var(--mu,#98a0ad);font-size:13px;line-height:1.4}
.vsv-big button:hover,.vsv-big button:focus-visible{border-color:var(--ac,#4f8cff);outline:none}
.vsv-grp{margin:12px 0 6px;color:var(--mu,#98a0ad);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
.vsv-v{display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--line,#2e333d);border-radius:10px;margin-bottom:6px;cursor:pointer;background:var(--card2,#242831)}
.vsv-v.on{border-color:var(--ac,#4f8cff);box-shadow:0 0 0 1px var(--ac,#4f8cff) inset}
.vsv-v .nm{flex:1;min-width:0}
.vsv-v .nm b{font-size:14.5px;font-weight:600}
.vsv-v .nm small{display:block;color:var(--mu,#98a0ad);font-size:12px}
.vsv-pv{width:40px;height:40px;border-radius:50%;border:1px solid var(--line2,#3d4350);background:var(--card,#1d2027);color:var(--fg,#e4e6eb);cursor:pointer;font-size:14px;flex:none}
.vsv-pv[disabled]{opacity:.4;cursor:not-allowed}
.vsv-st{font-size:13px;color:var(--mu,#98a0ad);margin:4px 0 10px;min-height:18px}
.vsv-st.err,.vsv-err{color:var(--err,#f2897f)}
.vsv-bar{height:8px;border-radius:6px;background:var(--line,#2e333d);overflow:hidden;margin:14px 0 8px}
.vsv-bar i{display:block;height:100%;width:0;background:var(--ac,#4f8cff);transition:width .4s}
.vsv-bar.ind i{width:40%;animation:vsvslide 1.3s ease-in-out infinite}
@keyframes vsvslide{0%{margin-left:-40%}100%{margin-left:100%}}
@media (prefers-reduced-motion:reduce){.vsv-bar.ind i{animation:none;width:100%;opacity:.5}}
`;

const ENGINE_INFO = {
  fast: { name: 'Fast', blurb: 'Starts speaking almost at once. Clear and natural. Many voices to choose from.' },
  pro: { name: 'Pro', blurb: 'More lifelike and expressive, but slower to make. A few polished voices.' },
};
const langName = { en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese' };

/**
 * Shows the chooser and resolves with exactly one of:
 *   { file }          the finished voiceover (a File, audio/wav) - the film is synced to it
 *   { none: true }    "None": no voice, start the film
 *   { cancel: true }  the person backed out: do not start
 * ctx = { client, text, doc?, onFile? } - doc defaults to the page. Playing previews uses doc.createElement('audio').
 */
export function chooseVoiceover(ctx) {
  const doc = ctx.doc || globalThis.document;
  const client = ctx.client, text = String(ctx.text || '').trim();
  return new Promise((resolve) => {
    if (!doc.getElementById('vsvStyle')) { const st = doc.createElement('style'); st.id = 'vsvStyle'; st.textContent = CSS; doc.head.appendChild(st); }
    const bg = doc.createElement('div'); bg.className = 'vsv-bg'; bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-modal', 'true');
    const box = doc.createElement('div'); box.className = 'vsv'; bg.appendChild(box);
    doc.body.appendChild(bg);
    let done = false, audio = null, audioUrl = '', speakCtl = null, pollTimer = 0, previewSeq = 0;
    const finish = (v) => {
      if (done) return; done = true;
      clearInterval(pollTimer); try { speakCtl && speakCtl.abort(); } catch { /* ok */ }
      stopAudio(); bg.remove(); resolve(v);
    };
    function stopAudio() { try { if (audio) { audio.pause(); audio.src = ''; } } catch { /* ok */ } if (audioUrl) { try { URL.revokeObjectURL(audioUrl); } catch { /* ok */ } } audio = null; audioUrl = ''; }
    const el = (tag, cls, html) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.textContent = html; return e; };
    const clear = () => { box.textContent = ''; };
    let voices = null, loadErr = '', engine = 'fast', chosen = '';

    // ---- step 1: Fast / Pro / None ----
    function stepEngine() {
      stopAudio(); clearInterval(pollTimer); clear();
      const head = el('div', 'vsv-head'); head.appendChild(el('h2', '', 'Add a voiceover?'));
      const sub = el('div', 'vsv-sub', 'You did not upload a recording, but your file includes the narration. Animato can speak it for you, or you can start without a voice.');
      const body = el('div', 'vsv-body'); const big = el('div', 'vsv-big'); body.appendChild(big);
      for (const k of ['fast', 'pro']) {
        const b = el('button'); b.type = 'button'; b.dataset.pick = k;
        b.appendChild(el('b', '', ENGINE_INFO[k].name + ' voice')); b.appendChild(el('span', '', ENGINE_INFO[k].blurb));
        b.onclick = () => { engine = k; chosen = ''; stepVoices(); };
        big.appendChild(b);
      }
      const nb = el('button'); nb.type = 'button'; nb.dataset.pick = 'none';
      nb.appendChild(el('b', '', 'None')); nb.appendChild(el('span', '', 'No voice. The film starts right away and you can add a recording later.'));
      nb.onclick = () => finish({ none: true });
      big.appendChild(nb);
      const foot = el('div', 'vsv-foot'); const cb = el('button', 'vsv-btn', 'Cancel'); cb.type = 'button'; cb.dataset.act = 'cancel'; cb.onclick = () => finish({ cancel: true }); foot.appendChild(cb);
      box.append(head, sub, body, foot);
      // the studio wakes while they decide, so a first start is already under way (models are cached after the first time)
      client.start().catch(() => {});
      if (!voices && !loadErr) loadVoices();
    }
    function loadVoices() {
      return client.voices().then((v) => { voices = v; loadErr = ''; if (box.dataset.step === 'voices') stepVoices(); })
        .catch((e) => { loadErr = e && e.message ? e.message : 'The voices could not be loaded.'; if (box.dataset.step === 'voices') stepVoices(); });
    }

    // ---- step 2: the list of voices with previews ----
    function stepVoices() {
      stopAudio(); clear(); box.dataset.step = 'voices';
      const head = el('div', 'vsv-head');
      const back = el('button', 'vsv-back', '‹'); back.type = 'button'; back.setAttribute('aria-label', 'Back'); back.onclick = () => { box.dataset.step = 'engine'; stepEngine(); };
      head.append(back, el('h2', '', ENGINE_INFO[engine].name + ' voices'));
      const sub = el('div', 'vsv-sub', 'Tap ▶ to hear a voice, tap the voice to choose it, then Proceed.');
      const body = el('div', 'vsv-body');
      const st = el('div', 'vsv-st'); st.id = 'vsvStatus'; body.appendChild(st);
      const foot = el('div', 'vsv-foot');
      const nb = el('button', 'vsv-btn', 'Start without a voice'); nb.type = 'button'; nb.dataset.act = 'none'; nb.onclick = () => finish({ none: true });
      const go = el('button', 'vsv-btn pri', 'Proceed'); go.type = 'button'; go.dataset.act = 'proceed'; go.disabled = true;
      foot.append(nb, go);
      box.append(head, sub, body, foot);
      const setGo = () => { go.disabled = !chosen; };
      if (loadErr) {
        st.className = 'vsv-st err'; st.textContent = loadErr;
        const rb = el('button', 'vsv-btn', 'Try again'); rb.type = 'button'; rb.onclick = () => { loadErr = ''; voices = null; stepVoices(); loadVoices(); }; body.appendChild(rb);
        return;
      }
      if (!voices) { st.textContent = 'Loading voices…'; return; }
      const list = (engine === 'pro' ? voices.pro : voices.fast) || [];
      const have = new Set(((voices.previews || {})[engine]) || []);
      const mine = voices.mine || [];
      const row = (v, isMine) => {
        const r = el('div', 'vsv-v'); r.dataset.voice = v.id; r.tabIndex = 0; r.setAttribute('role', 'radio');
        const pv = el('button', 'vsv-pv', '▶'); pv.type = 'button'; pv.dataset.preview = v.id; pv.setAttribute('aria-label', 'Preview ' + v.label);
        const canPreview = isMine || have.has(v.id);
        if (!canPreview) { pv.disabled = true; pv.title = 'No preview yet'; }
        const nm = el('div', 'nm'); nm.appendChild(el('b', '', v.label));
        nm.appendChild(el('small', '', isMine ? 'Your cloned voice' : `${v.gender === 'm' ? 'Male' : 'Female'} · ${langName[v.lang] || v.lang || 'English'}`));
        r.append(pv, nm);
        const mark = () => { r.classList.toggle('on', chosen === v.id); r.setAttribute('aria-checked', chosen === v.id ? 'true' : 'false'); };
        r.onclick = (e) => { if (e.target === pv) return; chosen = v.id; body.querySelectorAll('.vsv-v').forEach((x) => { x.classList.toggle('on', x.dataset.voice === chosen); x.setAttribute('aria-checked', x.dataset.voice === chosen ? 'true' : 'false'); }); setGo(); };
        r.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); r.onclick({ target: r }); } };
        pv.onclick = () => preview(v.id, pv, isMine);
        mark();
        return r;
      };
      if (mine.length) { body.appendChild(el('div', 'vsv-grp', 'My voices')); mine.forEach((v) => body.appendChild(row(v, true))); }
      body.appendChild(el('div', 'vsv-grp', ENGINE_INFO[engine].name + ' voices'));
      list.forEach((v) => body.appendChild(row(v, false)));
      if (!chosen && list.length) { chosen = list[0].id; const first = body.querySelector(`.vsv-v[data-voice="${CSS_ESC(chosen)}"]`); if (first) { first.classList.add('on'); first.setAttribute('aria-checked', 'true'); } }
      setGo();
      go.onclick = () => stepMaking();
      // studio state, so a first start explains itself
      const poll = () => client.status().then((s) => {
        if (done || box.dataset.step !== 'voices') return;
        const m = (s && s[engine]) || 'off';
        if (m === 'ready') { st.className = 'vsv-st'; st.textContent = 'The voice studio is ready.'; }
        else if (m === 'unavailable') { st.className = 'vsv-st err'; st.textContent = ENGINE_INFO[engine].name + ' is not available right now. Try the other one, or start without a voice.'; }
        else { st.className = 'vsv-st'; st.textContent = 'Starting your voice studio on GitHub… the first time can take several minutes while the voices are set up. Later it is quick. You can keep browsing the voices.'; }
      }).catch(() => {});
      poll(); clearInterval(pollTimer); pollTimer = setInterval(poll, 5000);
    }
    const CSS_ESC = (s) => String(s).replace(/["\\]/g, '\\$&');

    async function preview(id, btn, isMine) {
      const my = ++previewSeq;
      const wasPlaying = btn.dataset.playing === '1';
      stopAudio();
      box.querySelectorAll('.vsv-pv').forEach((b) => { b.textContent = '▶'; b.dataset.playing = ''; });
      const status = box.querySelector('#vsvStatus');
      if (wasPlaying) return;
      btn.textContent = '…'; btn.disabled = true;
      try {
        const blob = await client.preview(isMine ? 'fast' : engine, id);
        if (done || my !== previewSeq) return;
        if (!blob) throw new Error('No preview yet.');
        audioUrl = URL.createObjectURL(blob);
        audio = new (doc.defaultView.Audio)(audioUrl);
        audio.onended = () => { btn.textContent = '▶'; btn.dataset.playing = ''; };
        btn.textContent = '■'; btn.dataset.playing = '1';
        await audio.play();
      } catch (e) {
        if (my !== previewSeq) return;
        btn.textContent = '▶'; btn.dataset.playing = '';
        if (status) { status.className = 'vsv-st err'; status.textContent = (e && e.message) || 'The preview could not be played.'; }
      } finally { if (!done) btn.disabled = false; }
    }

    // ---- step 3: making the voiceover ----
    async function stepMaking() {
      stopAudio(); clearInterval(pollTimer); clear(); box.dataset.step = 'making';
      const head = el('div', 'vsv-head'); head.appendChild(el('h2', '', 'Making your voiceover'));
      const sub = el('div', 'vsv-sub', `${ENGINE_INFO[engine].name} voice. This turns the narration in your file into speech and syncs the film to it.`);
      const body = el('div', 'vsv-body');
      const bar = el('div', 'vsv-bar ind'); const fill = el('i'); bar.appendChild(fill);
      const line = el('div', 'vsv-st', 'Starting…'); line.id = 'vsvMaking';
      body.append(bar, line);
      const foot = el('div', 'vsv-foot');
      const nb = el('button', 'vsv-btn', 'Start without a voice'); nb.type = 'button'; nb.dataset.act = 'none'; nb.onclick = () => finish({ none: true });
      const cb = el('button', 'vsv-btn', 'Back'); cb.type = 'button'; cb.dataset.act = 'back'; cb.onclick = () => { try { speakCtl && speakCtl.abort(); } catch { /* ok */ } box.dataset.step = 'voices'; stepVoices(); };
      foot.append(cb, nb);
      box.append(head, sub, body, foot);
      speakCtl = new AbortController();
      try {
        const r = await client.speak({
          engine: chosen.startsWith('clone:') ? 'fast' : engine, voice: chosen, text, signal: speakCtl.signal,
          onProgress: (p) => {
            if (done) return;
            line.textContent = p.stage || 'Speaking…';
            if (p.parts > 1) { bar.classList.remove('ind'); fill.style.width = Math.min(97, Math.round(((p.part - 1 + (p.state === 'done' ? 1 : 0.3)) / p.parts) * 100)) + '%'; }
          },
        });
        if (done) return;
        if (!r.blob || !(r.blob.size > 1000)) throw new Error('The voice came back empty. Please try again.');
        const file = new (doc.defaultView.File)([r.blob], 'voiceover.wav', { type: 'audio/wav' });
        finish({ file, seconds: r.seconds });
      } catch (e) {
        if (done || (speakCtl && speakCtl.signal.aborted)) return;
        clear(); box.dataset.step = 'error';
        const h2 = el('div', 'vsv-head'); h2.appendChild(el('h2', '', 'The voiceover could not be made'));
        const b2 = el('div', 'vsv-body'); const em = el('div', 'vsv-err', (e && e.message) || 'Something went wrong.'); em.id = 'vsvError'; b2.appendChild(em);
        const f2 = el('div', 'vsv-foot');
        const again = el('button', 'vsv-btn pri', 'Try again'); again.type = 'button'; again.dataset.act = 'again'; again.onclick = () => stepMaking();
        const other = el('button', 'vsv-btn', 'Choose another voice'); other.type = 'button'; other.onclick = () => { box.dataset.step = 'voices'; stepVoices(); };
        const none2 = el('button', 'vsv-btn', 'Start without a voice'); none2.type = 'button'; none2.dataset.act = 'none'; none2.onclick = () => finish({ none: true });
        f2.append(again, other, none2); box.append(h2, b2, f2);
      }
    }
    bg.addEventListener('keydown', (e) => { if (e.key === 'Escape') finish({ cancel: true }); });
    box.dataset.step = 'engine';
    stepEngine();
    const first = box.querySelector('button'); if (first && first.focus) first.focus();
  });
}
