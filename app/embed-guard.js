/* EMBED LOCK, client side (the Worker refuses the requests too: see EMBED_LOCK.md and EMBEDDING_APPS.md in Animato Studio Pro).
   This app only runs inside Animato Studio Pro. Opened on its own, or inside any other website, it shows a notice and does not start.
   Also hands every saved file to the Animato page, so downloads come from animatostudiopro.com and never show this app's address.
   Classic script: load it first in <head>, after <meta name="embed-allowed" content="https://animatostudiopro.com,...">. */
(function () {
  var list = ((document.querySelector('meta[name="embed-allowed"]') || {}).content || 'https://animatostudiopro.com,https://www.animatostudiopro.com')
    .split(',').map(function (x) { return x.trim().replace(/\/+$/, ''); }).filter(Boolean);
  var ok = function (o) { return !!o && list.some(function (a) { return a === o || (a.slice(-2) === ':*' && o.indexOf(a.slice(0, -1)) === 0 && /^\d+$/.test(o.slice(a.length - 1))); }); };
  var parent = '', allowed = false;
  try {
    var framed = window.top !== window, anc = location.ancestorOrigins;
    if (anc && anc.length) { parent = anc[0]; allowed = framed && Array.prototype.every.call(anc, ok); }
    else if (framed) {
      if (document.referrer) { parent = new URL(document.referrer).origin; allowed = ok(parent); }
      else allowed = true;   // the browser tells neither who the parent is: frame-ancestors (sent by the server) still refuses every other parent page
    }
  } catch (e) {}
  if (!allowed && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) { allowed = true; parent = ''; }   // running on your own computer (development)
  // pages that stay open: this app's own public host(s) and open paths (e.g. an operator /admin login), named in <meta name="embed-open-hosts"> / <meta name="embed-open-paths">
  var meta = function (n) { return ((document.querySelector('meta[name="' + n + '"]') || {}).content || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); };
  if (!allowed) {
    var oh = meta('embed-open-hosts'), op = meta('embed-open-paths');
    if (oh.indexOf(location.hostname.toLowerCase()) > -1 || op.some(function (p) { return location.pathname === p || location.pathname.indexOf(p + '/') === 0; })) { allowed = true; parent = ''; }
  }
  var seq = 0;
  /* Hands a file to the Animato page (resent until it answers). Resolves true when Animato saved it, false when nobody answered (then save it here). */
  function saveFile(blob, name) {
    return new Promise(function (done) {
      var id = Date.now() + '-' + (++seq);
      if (!allowed || !parent || window.parent === window) return done(false);
      var tries = 0, timer;
      var finish = function (v) { clearTimeout(timer); removeEventListener('message', on); done(v); };
      var on = function (e) { if (e.origin === parent && e.source === window.parent && e.data && e.data.type === 'animato:download-ack' && e.data.id === id) finish(true); };
      addEventListener('message', on);
      var send = function () { if (++tries > 4) return finish(false); try { window.parent.postMessage({ type: 'animato:download', id: id, name: name, blob: blob }, parent); } catch (e) { return finish(false); } timer = setTimeout(send, 1200); };
      send();
    });
  }
  window.__EMBED = { allowed: allowed, parent: allowed ? parent : '', saveFile: saveFile };
  if (allowed) return;
  document.documentElement.setAttribute('data-embed-blocked', '');
  var NOTICE = '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open in Animato Studio Pro</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0e12;color:#eceef3;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px"><div><h1 style="font-size:20px;margin:0 0 8px">This tool only works inside Animato Studio Pro</h1><p style="margin:0 0 18px;color:#9aa0ad">Open it from the Tools section of the app.</p><a href="' + (list[0] || '#') + '" style="display:inline-block;background:#e4cb9a;color:#15161b;padding:12px 22px;border-radius:12px;font-weight:700;text-decoration:none">Open Animato Studio Pro</a></div></body>';
  // Stop loading the rest of the page (the app's own scripts are never started), then show the notice.
  try { window.stop(); } catch (e) {}
  setTimeout(function () { document.documentElement.innerHTML = NOTICE; }, 0);
  try { navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then(function (r) { r.forEach(function (x) { x.unregister(); }); }); } catch (e) {}
})();
