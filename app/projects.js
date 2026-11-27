// Project manager: every video the person starts is a saved project that autosaves on the device.
// This file is pure helpers plus the store (IndexedDB with a memory fallback). index.html does the screens.
//
// A project record:
//   { id, name, named (the person renamed it), at (last edit), made (created),
//     state: { form:{id:value}, sel:{char,ctype,bgsrc,tier,ar}, view:'landing'|'wizard'|'pro'|'import'|'player', wiz:n, pro:n, code:'scene source' },
//     audio: [{name,type,blob}],   // voiceover clips, kept so a reopened video is the same video
//     meta:  { type, ar, scenes } }  // what the list row shows

export const DB = 'animato-stk-projects';
export const STORE = 'projects';
export const MAX_NAME = 60;
export const DEFAULT_NAME = 'Untitled project';

const TYPE_NAMES = { movie: 'Animated movie', narration: 'Narration', presenter: 'Documentary' };

export function cleanName(raw) {
  const s = String(raw == null ? '' : raw).replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.slice(0, MAX_NAME).trim();
}

/** A name from what the person typed: the title, else the first words of the idea or script. */
export function autoName(form) {
  const f = form || {};
  const t = cleanName(f.title || f.proTitle);
  if (t) return t;
  const src = String(f.idea || f.proScript || '').replace(/\s+/g, ' ').trim();
  if (!src) return '';
  const words = src.split(' ').slice(0, 7).join(' ').replace(/[.,;:!?\-–—]+$/, '');
  return cleanName(words);
}

export function newProject(now = Date.now(), name = DEFAULT_NAME) {
  const id = 'p' + now.toString(36) + Math.random().toString(36).slice(2, 7);
  return { id, name: cleanName(name) || DEFAULT_NAME, named: false, at: now, made: now, state: { form: {}, sel: {}, view: 'landing', wiz: 0, pro: 0, code: '' }, audio: [], meta: { type: '', ar: '16:9', scenes: 0 } };
}

export function relTime(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - (+ts || 0)) / 1000));
  if (s < 45) return 'Just now';
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? '1 minute ago' : m + ' minutes ago';
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? '1 hour ago' : h + ' hours ago';
  const d = Math.round(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 30) return d + ' days ago';
  const mo = Math.round(d / 30);
  return mo <= 1 ? 'Last month' : mo + ' months ago';
}

/** What the list row shows. */
export function summarize(p) {
  const meta = (p && p.meta) || {};
  const st = (p && p.state) || {};
  const scenes = +meta.scenes || 0;
  const typeName = st.code ? (TYPE_NAMES[meta.type] || 'Video') : 'Draft';
  return { typeName, ar: meta.ar === '9:16' ? '9:16' : '16:9', scenes, hasVideo: !!st.code };
}

/** Newest first. */
export function sortProjects(list) {
  return [...(list || [])].sort((a, b) => (b.at || 0) - (a.at || 0));
}

/** Meaningful work is worth keeping; an untouched new project is not (so empty ones do not pile up). */
export function hasContent(p) {
  const st = (p && p.state) || {};
  if (st.code) return true;
  const f = st.form || {};
  return ['title', 'idea', 'cast', 'setting', 'extra', 'proTitle', 'proScript', 'proExtra'].some((k) => String(f[k] || '').trim());
}

/** Same audio list? (name and size), so the same clips are not rewritten on every save. */
export function sameAudio(a, b) {
  a = a || []; b = b || [];
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.name === b[i].name && (x.blob ? x.blob.size : x.size) === (b[i].blob ? b[i].blob.size : b[i].size));
}

/** Voiceover clips live in a separate record ('a:' + id) so a save of the form does not rewrite big audio files. */
export const AUDIO_PREFIX = 'a:';
/** The transcript of the project's voiceover lives in its own record ('tx:' + id), kept so a reopened project never transcribes again. */
export const TX_PREFIX = 'tx:';
export const isProject = (r) => !!r && typeof r.id === 'string' && !r.id.startsWith(AUDIO_PREFIX) && !r.id.startsWith(TX_PREFIX);

export function createProjectStore(env = {}) {
  const idb = env.indexedDB !== undefined ? env.indexedDB : (typeof indexedDB !== 'undefined' ? indexedDB : null);
  const mem = new Map();
  let db = null;
  const open = () => new Promise((res) => {
    if (!idb) return res(null);
    if (db) return res(db);
    try {
      const rq = idb.open(DB, 1);
      rq.onupgradeneeded = () => { try { rq.result.createObjectStore(STORE, { keyPath: 'id' }); } catch (e) { /* exists */ } };
      rq.onsuccess = () => { db = rq.result; res(db); };
      rq.onerror = () => res(null);
      rq.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
  const tx = (mode, fn) => open().then((d) => new Promise((res) => {
    if (!d) return res(undefined);
    try { const t = d.transaction(STORE, mode); fn(t.objectStore(STORE)); t.oncomplete = () => res(true); t.onerror = () => res(undefined); t.onabort = () => res(undefined); } catch (e) { res(undefined); }
  }));
  return {
    async all() {
      const d = await open();
      if (d) {
        const list = await new Promise((res) => { try { const r = d.transaction(STORE, 'readonly').objectStore(STORE).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res(null); } catch (e) { res(null); } });
        if (list) return sortProjects(list.filter(isProject));
      }
      return sortProjects([...mem.values()].filter(isProject));
    },
    async get(id) {
      const d = await open();
      if (d) {
        const r = await new Promise((res) => { try { const q = d.transaction(STORE, 'readonly').objectStore(STORE).get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } });
        if (r) return r;
      }
      return mem.get(id) || null;
    },
    async put(rec) { mem.set(rec.id, rec); await tx('readwrite', (s) => s.put(rec)); return true; },
    async remove(id) { mem.delete(id); mem.delete(AUDIO_PREFIX + id); mem.delete(TX_PREFIX + id); await tx('readwrite', (s) => { s.delete(id); s.delete(AUDIO_PREFIX + id); s.delete(TX_PREFIX + id); }); return true; },
    persistent: () => !!idb,
  };
}
