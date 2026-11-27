/* Decides how a voiceover is synced on this device.
 *
 * The AI speech model is a big download that Safari on iPhone and iPad (and in-app browsers, and very low-memory phones)
 * cannot be trusted to finish or keep. Those devices use the app's own timing instead: it listens to the pauses and rhythm of
 * the audio and locks captions, scenes and mouths to them. Everything else keeps the AI model.
 * The user can always override this (on = AI, off = in-app timing).
 */
export const OVERRIDE_KEY = 'stk_ai_sync';

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|BytedanceWebview|Snapchat|Twitter|MicroMessenger|; wv\)/i;

export function detectDevice(nav = globalThis.navigator || {}) {
  const ua = String(nav.userAgent || '');
  const touchMac = /Macintosh/.test(ua) && Number(nav.maxTouchPoints || 0) > 1;
  const ios = /iPhone|iPad|iPod/.test(ua) || touchMac;
  const inApp = IN_APP.test(ua);
  const mem = Number(nav.deviceMemory);
  const lowMemory = mem > 0 && mem <= 2;
  return { ios, inApp, lowMemory, memoryGB: mem > 0 ? mem : null };
}

export function readOverride(storage) {
  try {
    const v = storage && storage.getItem(OVERRIDE_KEY);
    return v === 'on' || v === 'off' ? v : 'auto';
  } catch (e) {
    return 'auto';
  }
}

/** Why the AI model is not used here, or '' when it is. */
export function skipReason(device = {}, override = 'auto') {
  if (override === 'on') return '';
  if (override === 'off') return 'chosen';
  if (device.ios) return 'ios';
  if (device.inApp) return 'inapp';
  if (device.lowMemory) return 'lowmemory';
  return '';
}
export const useAI = (device, override) => skipReason(device, override) === '';

/**
 * Where the speech model runs:
 *   'local'  on this device (Android and desktop),
 *   'github' on the person's own GitHub Actions (iPhone, iPad, in-app browsers: they cannot run the model),
 *   'timing' nowhere: the app's own pause-and-rhythm timing (very low-memory phones, or when the person chose it).
 */
export function syncRoute(device = {}, override = 'auto') {
  if (override === 'on') return 'local';
  if (override === 'off') return 'timing';
  if (override === 'github') return 'github';
  if (device.ios || device.inApp) return 'github';
  if (device.lowMemory) return 'timing';
  return 'local';
}
export const useGithub = (device, override) => syncRoute(device, override) === 'github';

/**
 * Runs a job that reports progress, and gives up if nothing happens for `ms`, so a stuck download or a stuck
 * transcription can never freeze the app: the caller then carries on with the in-app timing.
 * run(tick) must call tick() whenever it makes progress.
 */
export function withIdle(run, ms = 30000) {
  return new Promise((resolve, reject) => {
    let timer = null;
    let over = false;
    const fail = () => { if (!over) { over = true; reject(new Error('The speech tools did not respond in time.')); } };
    const tick = () => { if (over) return; clearTimeout(timer); timer = setTimeout(fail, ms); };
    tick();
    Promise.resolve()
      .then(() => run(tick))
      .then((v) => { if (!over) { over = true; clearTimeout(timer); resolve(v); } },
        (e) => { if (!over) { over = true; clearTimeout(timer); reject(e); } });
  });
}

export function syncNote(usedAI, reason, detail = '') {
  if (usedAI) return '';
  if (reason === 'github-skip') return 'The AI transcriber was skipped, so your voiceover was synced with in-app timing. Try the AI transcriber again for word-perfect sync.';
  if (reason === 'github-fail') return 'The AI transcriber could not finish' + (detail ? ' (' + String(detail).slice(0, 160) + ')' : '') + ', so your voiceover was synced with in-app timing instead.';
  if (reason === 'ios' || reason === 'inapp') return 'Synced with in-app timing (fast, and works on every phone). Captions, scenes and mouths follow the pauses and rhythm of your voice.';
  if (reason === 'chosen') return 'Synced with in-app timing, as you chose.';
  if (reason === 'lowmemory') return 'Synced with in-app timing, which is lighter on this phone.';
  return 'The AI speech tools were not available, so your voiceover was synced with in-app timing instead. Captions, scenes and mouths still follow your voice.';
}
