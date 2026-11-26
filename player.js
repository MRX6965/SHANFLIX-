/* ============================================================
   SHANFLIX player integration
   - exact resume position (VidLink startAt / VidRift resume message)
   - saves playback position from player messages
   - auto-next episode when a video ends
   - automatic server fallback
   - "Report problem" + client error log (/api/report)
   - optional Plausible analytics (config.js)
   ============================================================ */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const toast = m => { try { showToast(m); } catch (e) {} };
  const isMovie = it => /movie/i.test((it && it.category) || '');
  const K_PROG = 'sf_progress';

  const readProg = () => { try { return JSON.parse(localStorage.getItem(K_PROG)) || {}; } catch (e) { return {}; } };
  const writeProg = p => { try { localStorage.setItem(K_PROG, JSON.stringify(p)); } catch (e) {} };

  /* ---------- where are we? ---------- */
  function where() {
    const c = currentContent;
    if (!c || !currentEpisode) return null;
    const seasons = c.seasons || [];
    const si = seasons.findIndex(s => (s.episodes || []).includes(currentEpisode));
    if (si < 0) return null;
    const ei = seasons[si].episodes.indexOf(currentEpisode);
    return { c, si, ei, s: seasons[si].number || si + 1, e: currentEpisode.number || ei + 1 };
  }

  /* ---------- resume position ---------- */
  function resumeSeconds(content, s, e) {
    const entry = readProg()[String(content.id)];
    if (!entry || entry.s !== s || entry.e !== e) return 0;
    if (!(entry.pos > 20) || !(entry.dur > 0) || entry.pos > entry.dur - 90) return 0;
    return Math.floor(entry.pos);
  }

  const _build = window.buildServerUrl;
  window.buildServerUrl = function (content, si, ei) {
    let url = _build.apply(this, arguments);
    try {
      if (url && currentServerId === 'vidlink') {
        const season = content.seasons && content.seasons[si];
        const sn = isMovie(content) ? 1 : (season && (season.number || si + 1));
        const en = isMovie(content) ? 1 : (season && season.episodes[ei] && (season.episodes[ei].number || ei + 1));
        const sec = resumeSeconds(content, sn, en);
        if (sec) url += (url.includes('?') ? '&' : '?') + 'startAt=' + sec;
      }
    } catch (err) {}
    return url;
  };

  /* ---------- failover bookkeeping ---------- */
  let tried = new Set();
  let failing = false;

  const _play = window.playEpisode;
  window.playEpisode = function () {
    if (!failing) tried = new Set();
    return _play.apply(this, arguments);
  };

  function failover(reason) {
    const w = where();
    if (!w || failing) return false;
    tried.add(currentServerId);
    const next = VIDEO_SERVERS.findIndex(sv => !tried.has(sv.id));
    if (next < 0) return false;
    const li = $$('#serverOptionsList li')[next];
    if (!li) return false;
    failing = true;
    try {
      toast(`Trying ${VIDEO_SERVERS[next].name.split(' (')[0]}…`);
      selectServer(VIDEO_SERVERS[next].id, li);
    } finally { failing = false; }
    report('failover', reason);
    return true;
  }
  window.sfFailover = failover;

  /* ---------- resume via VidRift message after load ---------- */
  const _lvp = window.loadVideoPlayer;
  window.loadVideoPlayer = function (container, source, content) {
    _lvp.apply(this, arguments);
    try {
      const iframe = container.querySelector('iframe');
      const w = where();
      if (iframe && w && currentServerId === 'vidrift') {
        const sec = resumeSeconds(w.c, isMovie(w.c) ? 1 : w.s, isMovie(w.c) ? 1 : w.e);
        if (sec) iframe.addEventListener('load', () => {
          try { iframe.contentWindow.postMessage({ type: 'vidrift:resume', currentTime: sec }, 'https://embed.vidrift.net'); } catch (e) {}
        }, { once: true });
      }
    } catch (e) {}
  };

  /* ---------- messages from players ---------- */
  let lastSave = 0, lastAutoNext = 0;

  function savePos(pos, dur) {
    const w = where();
    if (!w || !(pos >= 0)) return;
    const now = Date.now();
    if (now - lastSave < 5000) return;
    lastSave = now;
    const all = readProg();
    const entry = all[String(w.c.id)];
    if (!entry) return;
    entry.pos = pos;
    if (dur > 0) entry.dur = dur;
    entry.t = now;
    writeProg(all);
    document.dispatchEvent(new Event('sf:changed'));
  }

  function autoNext() {
    const now = Date.now();
    if (now - lastAutoNext < 8000) return;
    const w = where();
    if (!w || isMovie(w.c)) return;
    lastAutoNext = now;
    const all = readProg();
    if (all[String(w.c.id)]) { all[String(w.c.id)].pos = 0; writeProg(all); }
    const seasons = w.c.seasons;
    if (w.ei + 1 < seasons[w.si].episodes.length) {
      toast('Next episode…');
      playEpisode(w.si, w.ei + 1);
    } else if (w.si + 1 < seasons.length) {
      const li = $$('#seasonOptionsList li')[w.si + 1];
      if (li) { toast('Next season…'); selectSeason(w.si + 1, li); }
    }
  }

  window.addEventListener('message', ev => {
    const d = ev.data;
    if (!d || typeof d !== 'object') return;
    if (ev.origin === 'https://vidlink.pro') {
      if (d.type === 'PLAYER_EVENT' && d.data) {
        const x = d.data;
        if (x.event === 'timeupdate' || x.event === 'pause') savePos(x.currentTime, x.duration);
        if (x.event === 'ended') autoNext();
      }
    } else if (ev.origin === 'https://embed.vidrift.net') {
      if (d.type === 'vidrift:progress' || d.type === 'vidrift:paused') savePos(d.currentTime, d.duration);
      else if (d.type === 'vidrift:ended') autoNext();
      else if (d.type === 'vidrift:wont-play') {
        if (!failover('wont-play')) {
          const container = $('#playerContainer');
          if (window.sfShowStreamErr && container) window.sfShowStreamErr(container, $('iframe', container), null);
        }
      }
    }
  });

  // refresh the home rows (progress bars) when the player closes
  const _close = window.forceCloseModal;
  if (typeof _close === 'function') {
    window.forceCloseModal = function () {
      const r = _close.apply(this, arguments);
      document.dispatchEvent(new Event('sf:reload'));
      return r;
    };
  }

  /* ---------- reports & error log ---------- */
  function report(kind, msg) {
    try {
      const w = where();
      const body = JSON.stringify({
        kind, msg: msg || '',
        id: w ? w.c.id : (currentContent && currentContent.id) || '',
        title: (w ? w.c.title : (currentContent && currentContent.title)) || '',
        s: w ? w.s : '', e: w ? w.e : '', server: currentServerId
      });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/report', new Blob([body], { type: 'application/json' }));
      else fetch('/api/report', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true });
    } catch (e) {}
  }
  window.sfReport = function (kind) {
    report(kind || 'broken');
    toast('Thanks — reported. We will check it.');
  };

  function addReportLink() {
    if ($('#sfReportRow')) return;
    const anchor = $('#downloadRow');
    if (!anchor) return;
    const row = document.createElement('div');
    row.id = 'sfReportRow';
    row.innerHTML = '<button type="button" class="sf-report">⚠ Video not working? Report</button>';
    row.firstChild.onclick = () => window.sfReport('broken');
    anchor.parentNode.insertBefore(row, anchor.nextSibling);
  }

  let errCount = 0;
  const logErr = msg => {
    if (errCount >= 5 || !msg || /^Script error\.?$/i.test(msg)) return;
    errCount++;
    report('error', String(msg).slice(0, 180));
  };
  window.addEventListener('error', e => logErr(e.message));
  window.addEventListener('unhandledrejection', e => logErr(e.reason && (e.reason.message || e.reason)));

  /* ---------- optional analytics ---------- */
  const cfg = window.SHANFLIX_CONFIG || {};
  if (cfg.plausibleDomain && !/SHANFLIXApp/.test(navigator.userAgent)) {
    const s = document.createElement('script');
    s.defer = true;
    s.dataset.domain = cfg.plausibleDomain;
    s.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addReportLink);
  else addReportLink();
})();
