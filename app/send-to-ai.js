// "Send to AI": one tap copies the finished prompt, opens the AI's chat page and types a short opening message into its box,
// so the person only has to paste (press and hold, then Paste) and send. A web page cannot attach a file to another website, and the prompt
// (about 16,000 characters) is far too long to fit in a link, so the prompt travels through the clipboard. ChatGPT and Claude turn a long paste
// into an attachment by themselves. The prompt itself ends with the rule that the AI must answer with a downloadable .txt file.
// DOM helpers take the window as an argument so the logic can be tested in Node with a small fake.

/** The short message that is typed into the AI's box for the person (the pasted prompt follows it). */
export const OPENING_MESSAGE = 'Follow the instructions in the text I paste below exactly. When you are done, give me the result as a downloadable .txt file (do not write it in the chat) and tell me briefly how to use it.\n\n';

export const AI_TARGETS = Object.freeze([
  Object.freeze({ id: 'claude', name: 'Claude', label: 'Open Claude', url: 'https://claude.ai/new', prefill: 'q', primary: true }),
  Object.freeze({ id: 'chatgpt', name: 'ChatGPT', label: 'Open ChatGPT', url: 'https://chatgpt.com/', prefill: 'q', primary: false }),
  Object.freeze({ id: 'gemini', name: 'Gemini', label: 'Open Gemini', url: 'https://gemini.google.com/app', prefill: '', primary: false }),
]);

export function targetById(id) {
  return AI_TARGETS.find((t) => t.id === id) || AI_TARGETS[0];
}

/** The AI's address with the short message already in its box (when that AI supports it). */
export function openUrl(target) {
  if (!target.prefill) return target.url;
  return `${target.url}${target.url.includes('?') ? '&' : '?'}${target.prefill}=${encodeURIComponent(OPENING_MESSAGE)}`;
}

/** Copies right now, inside the tap, without asking the browser for clipboard permission (works inside frames too). */
export function copySync(text, doc) {
  try {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || !d.body || typeof d.createElement !== 'function') return false;
    const ta = d.createElement('textarea');
    ta.value = String(text);
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
    d.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      ta.setSelectionRange(0, ta.value.length);
    } catch (e) {
      /* some browsers do not support it on every element */
    }
    const ok = typeof d.execCommand === 'function' ? !!d.execCommand('copy') : false;
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

export async function copyAsync(text, win) {
  try {
    const w = win || (typeof window !== 'undefined' ? window : null);
    if (w && w.navigator && w.navigator.clipboard && typeof w.navigator.clipboard.writeText === 'function') {
      await w.navigator.clipboard.writeText(String(text));
      return true;
    }
  } catch (e) {
    /* blocked by the page host or by the browser */
  }
  return false;
}

export function openTab(url, win) {
  try {
    const w = (win || window).open(url, '_blank');
    if (w) {
      try {
        w.opener = null;
      } catch (e) {
        /* cross-origin windows may not allow it */
      }
    }
    return !!w;
  } catch (e) {
    return false;
  }
}

/**
 * Copy the prompt, then open the AI with the short message in its box. When the quick copy works nothing is awaited before the tab opens,
 * so the browser still counts it as the person's tap and does not block the new tab.
 * @returns {Promise<{copied:boolean, opened:boolean, target:object}>}
 */
export async function sendPrompt(id, text, { win, doc } = {}) {
  const w = win || (typeof window !== 'undefined' ? window : undefined);
  const target = targetById(id);
  let copied = copySync(text, doc || (w && w.document));
  let opened = false;
  if (copied) {
    opened = openTab(openUrl(target), w);
  } else {
    copied = await copyAsync(text, w);
    opened = openTab(openUrl(target), w);
  }
  return { copied, opened, target };
}

/** What to tell the person after a tap. */
export function sendMessage({ copied, opened, target }) {
  const typed = target.prefill ? ' with your message already typed in' : '';
  if (copied && opened) {
    return `Prompt copied! ${target.name} is opening${typed}. Tap the message box, press and hold, choose Paste, then press send.`;
  }
  if (copied) {
    return `Prompt copied! Open ${target.name} (tap the link below), tap the message box, press and hold, choose Paste, then press send.`;
  }
  return `Your browser would not copy for you. Tap the box below, copy everything in it, then open ${target.name} and paste.`;
}
