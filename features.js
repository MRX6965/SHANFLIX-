/* ============================================================
   SHANFLIX features
   My List · Continue Watching · resume season/episode ·
   new-episode alerts · search filters · recent searches ·
   stream-stall handling
   (loaded after app.js; wraps a few of its global functions)
   ============================================================ */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- safe storage ---------- */
  const LS = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const K_LIST = 'sf_list', K_PROG = 'sf_progress', K_RECENT = 'sf_recent',
        K_LASTEP = 'sf_lastep', K_NEW = 'sf_new';

  function changed() {
    LS.set('sf_updated', Date.now());
    document.dispatchEvent(new Event('sf:changed')); // sync.js listens
  }
  const toast = m => { try { showToast(m); } catch (e) {} };
  const isMovie = it => /movie/i.test((it && it.category) || '');

  function snap(it) {
    return {
      id: String(it.id), tmdbId: String(it.tmdbId || it.id), title: it.title, category: it.category,
      year: it.year, rating: it.rating, poster: it.poster, backdrop: it.backdrop,
      description: it.description, status: it.status,
      genreIds: it.genreIds || [], lang: it.lang || '', ratingNum: it.ratingNum || 0
    };
  }

  /* ============================================================
     MY LIST
     ============================================================ */
  const getList = () => LS.get(K_LIST, []);
  const inList = id => getList().some(x => x.id === String(id));

  function toggleList() {
    const c = currentContent;
    if (!c) return;
    let l = getList();
    if (inList(c.id)) { l = l.filter(x => x.id !== String(c.id)); toast('Removed from My List'); }
    else { l.unshift(snap(c)); toast('Added to My List'); }
    LS.set(K_LIST, l);
    changed();
    updateListBtn();
    renderRows();
  }
  window.sfToggleList = toggleList;

  function injectListButton() {
    const row = $('.modal-title-row');
    if (!row || $('#listBtn')) return;
    const b = document.createElement('button');
    b.id = 'listBtn';
    b.className = 'list-btn';
    b.type = 'button';
    b.onclick = toggleList;
    row.insertBefore(b, $('.info-btn', row));
    updateListBtn();
  }
  function updateListBtn() {
    const b = $('#listBtn');
    if (!b || !currentContent) return;
    const on = inList(currentContent.id);
    b.textContent = on ? '✓ In My List' : '＋ My List';
    b.classList.toggle('on', on);
  }

  /* ============================================================
     PROGRESS / CONTINUE WATCHING / RESUME
     ============================================================ */
  const getProg = () => LS.get(K_PROG, {});

  function recordProgress() {
    const c = currentContent;
    if (!c || !currentEpisode || (typeof isUpcoming === 'function' && isUpcoming(c))) return;
    const seasons = c.seasons || [];
    const si = seasons.findIndex(s => (s.episodes || []).includes(currentEpisode));
    if (si < 0) return;
    const sn = seasons[si];
    const ei = sn.episodes.indexOf(currentEpisode);
    const all = getProg();
    const prev = all[String(c.id)];
    const sNum = sn.number || si + 1, eNum = currentEpisode.number || ei + 1;
    const same = prev && prev.s === sNum && prev.e === eNum;
    all[String(c.id)] = {
      item: snap(c),
      s: sNum,
      e: eNum,
      t: Date.now(),
      pos: same ? prev.pos : 0,
      dur: same ? prev.dur : 0
    };
    // keep only the 30 most recent
    const keep = Object.entries(all).sort((a, b) => b[1].t - a[1].t).slice(0, 30);
    LS.set(K_PROG, Object.fromEntries(keep));
    changed();
    renderRows();
  }

  window.sfRemoveProgress = function (id) {
    const all = getProg();
    delete all[String(id)];
    LS.set(K_PROG, all);
    changed();
    renderRows();
  };

  let resume = null;

  function syncSeasonUI(idx) {
    const lbl = $('#seasonLabel');
    const lis = $$('#seasonOptionsList li');
    if (lbl && lis[idx]) {
      lbl.textContent = lis[idx].textContent.trim();
      lis.forEach((l, i) => l.classList.toggle('active', i === idx));
    }
  }

  /* ============================================================
     NEW-EPISODE ALERTS (for titles in My List)
     ============================================================ */
  function clearNew(id) {
    const nw = LS.get(K_NEW, {});
    if (!nw[id]) return;
    const last = LS.get(K_LASTEP, {});
    last[id] = nw[id];
    delete nw[id];
    LS.set(K_LASTEP, last);
    LS.set(K_NEW, nw);
  }

  async function checkNewEpisodes() {
    const tv = getList().filter(x => !isMovie(x)).slice(0, 12);
    if (!tv.length || !navigator.onLine) return;
    const last = LS.get(K_LASTEP, {}), nw = LS.get(K_NEW, {});
    const fresh = [];
    for (const it of tv) {
      try {
        const d = await tmdbFetch('/tv/' + it.tmdbId);
        const e = d.last_episode_to_air;
        if (!e) continue;
        const key = e.season_number + 'x' + e.episode_number;
        if (!last[it.id]) last[it.id] = key;
        else if (last[it.id] !== key && nw[it.id] !== key) { nw[it.id] = key; fresh.push(it.title); }
      } catch (e) { /* ignore */ }
    }
    LS.set(K_LASTEP, last);
    LS.set(K_NEW, nw);
    if (fresh.length) toast('New episode: ' + fresh.slice(0, 2).join(', ') + (fresh.length > 2 ? '…' : ''));
    renderRows();
  }

  /* ============================================================
     HOME ROWS (Continue Watching / My List)
     ============================================================ */
  function rowCard(item, sub, opts) {
    opts = opts || {};
    const poster = item.poster || 'https://placehold.co/400x600/050a14/3b82f6?text=SHANFLIX';
    const id = escapeAttribute(item.id);
    return `<div class="movie-card" onclick="openDetails('${id}')">
      <div class="poster">
        <img src="${escapeAttribute(poster)}" alt="${escapeAttribute(item.title)}" loading="lazy" decoding="async"
             onerror="this.src='https://placehold.co/400x600/050a14/3b82f6?text=SHANFLIX'">
        <span class="poster-label">${escapeHTML(sub)}</span>
        ${opts.isNew ? '<span class="poster-status new-ep">NEW EP</span>' : ''}
        ${opts.pct ? `<div class="row-bar"><i style="width:${opts.pct}%"></i></div>` : ''}
        ${opts.removable ? `<button class="row-x" aria-label="Remove" onclick="event.stopPropagation();sfRemoveProgress('${id}')">×</button>` : ''}
      </div>
      <div class="movie-info"><h3>${escapeHTML(item.title)}</h3>
      <p>${escapeHTML(item.year || '')} <span class="star">★</span> ${escapeHTML(item.rating || 'N/A')}</p></div>
    </div>`;
  }

  function renderRows() {
    let host = $('#sfRows');
    if (!host) {
      const cat = $('#catalogue');
      if (!cat) return;
      host = document.createElement('div');
      host.id = 'sfRows';
      cat.insertBefore(host, cat.firstChild);
    }
    const prog = Object.values(getProg()).sort((a, b) => b.t - a.t).slice(0, 12);
    const list = getList();
    const nw = LS.get(K_NEW, {});
    let html = '';
    if (prog.length) {
      html += `<div class="section-heading"><h2>Continue Watching</h2></div><div class="h-row">` +
        prog.map(p => rowCard(p.item, isMovie(p.item) ? 'Movie' : `S${p.s} · E${p.e}`, { removable: true, pct: p.dur > 0 ? Math.min(100, Math.round(p.pos / p.dur * 100)) : 0 })).join('') + '</div>';
    }
    if (list.length) {
      html += `<div class="section-heading"><h2>My List</h2></div><div class="h-row">` +
        list.map(it => rowCard(it, it.category, { isNew: !!nw[it.id] })).join('') + '</div>';
    }
    host.innerHTML = html;
  }

  /* ---------- wrap app.js functions ---------- */
  const _open = window.openDetails;
  window.openDetails = function (id) {
    id = String(id);
    const known = allContent.find(x => String(x.id) === id) || searchResultsCache.find(x => String(x.id) === id);
    if (!known) {
      const sn = getList().find(x => x.id === id) || (getProg()[id] || {}).item;
      if (sn) searchResultsCache.push(Object.assign({ seasons: [], cast: [] }, sn));
    }
    resume = getProg()[id] || null;
    clearNew(id);
    const r = _open.apply(this, arguments);
    injectListButton();
    updateListBtn();
    renderRows();
    return r;
  };

  const _play = window.playEpisode;
  window.playEpisode = function (si, ei) {
    if (resume && si === 0 && ei === 0 && currentContent && !isMovie(currentContent) &&
        currentContent.seasons && currentContent.seasons.length) {
      const r = resume; resume = null;
      const sIdx = currentContent.seasons.findIndex(s => s.number === r.s);
      if (sIdx > -1) {
        let eIdx = currentContent.seasons[sIdx].episodes.findIndex(e => e.number === r.e);
        if (eIdx < 0) eIdx = 0;
        currentSeasonIndex = sIdx;
        syncSeasonUI(sIdx);
        si = sIdx; ei = eIdx;
      }
    } else {
      resume = null;
    }
    const out = _play.call(this, si, ei);
    try { recordProgress(); } catch (e) {}
    return out;
  };

  /* ---------- stalled / failed stream ---------- */
  const _lvp = window.loadVideoPlayer;
  window.loadVideoPlayer = function (container, source) {
    _lvp.apply(this, arguments);
    const iframe = container.querySelector('iframe');
    if (!iframe) return;
    let ok = false;
    iframe.addEventListener('load', () => {
      ok = true;
      const e = container.querySelector('.sf-stream-err');
      if (e) e.remove();
    });
    setTimeout(() => {
      if (ok || !iframe.isConnected || container.querySelector('.sf-stream-err')) return;
      if (typeof window.sfFailover === 'function' && window.sfFailover('stall')) return;
      showStreamErr(container, iframe, source);
    }, 12000);
  };

  function showStreamErr(container, iframe, source) {
    if (!container || container.querySelector('.sf-stream-err')) return;
    const box = document.createElement('div');
    box.className = 'sf-stream-err';
    box.innerHTML = `<h3>${navigator.onLine ? "This video isn't playing" : "You're offline"}</h3>
      <p>${navigator.onLine ? 'We tried the other servers too. You can reload, try again, or report it.' : 'Reconnect to the internet and try again.'}</p>
      <button class="err-btn" type="button" data-reload>Reload player</button>
      <button class="err-btn ghost" type="button" data-next>Try another server</button>
      <button class="err-btn ghost" type="button" data-report>Report problem</button>`;
    $('[data-reload]', box).onclick = () => { box.remove(); if (iframe && source) iframe.src = source; };
    $('[data-next]', box).onclick = () => {
      const i = VIDEO_SERVERS.findIndex(x => x.id === currentServerId);
      const n = (i + 1) % VIDEO_SERVERS.length;
      const li = $$('#serverOptionsList li')[n];
      box.remove();
      if (li) selectServer(VIDEO_SERVERS[n].id, li);
    };
    $('[data-report]', box).onclick = () => { if (window.sfReport) window.sfReport('broken'); };
    container.appendChild(box);
  }
  window.sfShowStreamErr = showStreamErr;

  window.addEventListener('offline', () => toast("You're offline"));
  window.addEventListener('online', () => toast('Back online'));

  /* ============================================================
     SEARCH: FILTERS + RECENT SEARCHES
     ============================================================ */
  const GENRES = [
    ['Action', [28, 10759]], ['Adventure', [12, 10759]], ['Animation', [16]], ['Comedy', [35]],
    ['Crime', [80]], ['Documentary', [99]], ['Drama', [18]], ['Family', [10751]], ['Fantasy', [14, 10765]],
    ['Horror', [27]], ['Mystery', [9648]], ['Romance', [10749]], ['Sci-Fi', [878, 10765]],
    ['Thriller', [53]], ['War', [10752, 10768]]
  ];
  const LANGS = [['hi', 'Hindi'], ['en', 'English'], ['bn', 'Bengali'], ['ta', 'Tamil'], ['te', 'Telugu'],
    ['ml', 'Malayalam'], ['ja', 'Japanese'], ['ko', 'Korean'], ['es', 'Spanish'], ['fr', 'French']];

  function buildFilters() {
    const page = $('#searchPage');
    if (!page || $('#sfFilters')) return;
    const yr = new Date().getFullYear();
    const years = Array.from({ length: 12 }, (_, i) => yr - i);
    const bar = document.createElement('div');
    bar.id = 'sfFilters';
    bar.className = 'sf-filters';
    const FIELDS = [
      ['fType', [['', 'All types'], ['movie', 'Movies'], ['tv', 'TV']]],
      ['fGenre', [['', 'Any genre']].concat(GENRES.map((g, i) => [String(i), g[0]]))],
      ['fYear', [['', 'Any year']].concat(years.map(y => [String(y), String(y)]), [['old', 'Before ' + years[years.length - 1]]])],
      ['fLang', [['', 'Any language']].concat(LANGS)],
      ['fRate', [['', 'Any rating'], ['5', '5+ ★'], ['6', '6+ ★'], ['7', '7+ ★'], ['8', '8+ ★']]]
    ];
    // Custom dropdowns: the option list opens inside the page, not as a native popup
    FIELDS.forEach(([id, opts]) => {
      const dd = document.createElement('div');
      dd.className = 'custom-select sf-dd';
      dd.id = id;
      dd.dataset.value = '';
      dd.innerHTML = `<button type="button" class="select-trigger" onclick="toggleDropdown('${id}')">
          <span>${escapeHTML(opts[0][1])}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button><ul class="select-options"></ul>`;
      const ul = $('ul', dd);
      opts.forEach(([val, label], i) => {
        const li = document.createElement('li');
        li.textContent = label;
        if (i === 0) li.classList.add('active');
        li.onclick = () => {
          dd.dataset.value = val;
          $('.select-trigger span', dd).textContent = label;
          $$('li', ul).forEach(x => x.classList.remove('active'));
          li.classList.add('active');
          dd.classList.remove('open');
          applyFilters();
        };
        ul.appendChild(li);
      });
      bar.appendChild(dd);
    });
    const rb = document.createElement('button');
    rb.type = 'button'; rb.id = 'fReset'; rb.className = 'f-reset'; rb.textContent = 'Reset';
    bar.appendChild(rb);
    const title = $('#searchTitle');
    title.parentNode.insertBefore(bar, title.nextSibling);
    rb.onclick = () => {
      $$('.sf-dd', bar).forEach(dd => {
        dd.dataset.value = '';
        const first = $('li', dd);
        $('.select-trigger span', dd).textContent = first.textContent;
        $$('li', dd).forEach((x, i) => x.classList.toggle('active', i === 0));
      });
      applyFilters();
    };

    const nm = document.createElement('div');
    nm.id = 'sfNoMatch';
    nm.className = 'err-box';
    nm.style.display = 'none';
    nm.innerHTML = '<h3>No matches</h3><p>Nothing fits those filters. Try loosening them.</p>';
    $('#searchGrid').parentNode.insertBefore(nm, $('#searchGrid').nextSibling);

    new MutationObserver(() => { applyFilters(); maybeSaveRecent(); })
      .observe($('#searchGrid'), { childList: true });
  }

  function applyFilters() {
    const grid = $('#searchGrid');
    if (!grid) return;
    const val = id => { const e = $('#' + id); return e ? e.dataset.value || '' : ''; };
    const f = {
      type: val('fType'), genre: val('fGenre'), year: val('fYear'),
      lang: val('fLang'), rate: parseFloat(val('fRate')) || 0
    };
    const cards = $$('.movie-card', grid);
    const yrMin = new Date().getFullYear() - 11;
    let shown = 0;
    cards.forEach((card, i) => {
      const it = searchResultsCache[i];
      let ok = true;
      if (it) {
        if (f.type === 'movie' && !isMovie(it)) ok = false;
        if (f.type === 'tv' && isMovie(it)) ok = false;
        if (ok && f.genre !== '') ok = (it.genreIds || []).some(g => GENRES[+f.genre][1].includes(g));
        if (ok && f.year) {
          const y = parseInt(it.year, 10) || 0;
          ok = f.year === 'old' ? (y && y < yrMin) : String(y) === f.year;
        }
        if (ok && f.lang) ok = it.lang === f.lang;
        if (ok && f.rate) ok = (it.ratingNum || 0) >= f.rate;
      }
      card.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });
    const nm = $('#sfNoMatch');
    if (nm) nm.style.display = cards.length && !shown ? 'block' : 'none';
  }

  /* ---------- recent searches ---------- */
  const getRecent = () => LS.get(K_RECENT, []);
  function addRecent(q) {
    q = (q || '').trim();
    if (q.length < 2) return;
    const l = getRecent().filter(x => x.toLowerCase() !== q.toLowerCase());
    l.unshift(q);
    LS.set(K_RECENT, l.slice(0, 8));
    changed();
  }
  function maybeSaveRecent() {
    const input = $('#searchInput');
    if (input && $('.movie-card', $('#searchGrid'))) addRecent(input.value);
  }

  function buildRecent() {
    const input = $('#searchInput');
    const wrap = $('.search-container');
    if (!input || !wrap || $('#sfRecent')) return;
    const box = document.createElement('div');
    box.id = 'sfRecent';
    box.className = 'sf-recent';
    wrap.appendChild(box);

    function render() {
      const l = getRecent();
      if (!l.length || input.value.trim()) { box.style.display = 'none'; return; }
      box.innerHTML = `<div class="rc-head"><span>Recent searches</span><button type="button" data-clear>Clear</button></div>` +
        l.map((q, i) => `<div class="rc" data-q="${escapeAttribute(q)}"><span>${escapeHTML(q)}</span><button type="button" data-x="${i}" aria-label="Remove">×</button></div>`).join('');
      box.style.display = 'block';
    }
    input.addEventListener('focus', render);
    input.addEventListener('input', render);
    input.addEventListener('blur', () => setTimeout(() => (box.style.display = 'none'), 150));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') addRecent(input.value); });
    box.addEventListener('mousedown', e => {
      e.preventDefault();
      const clr = e.target.closest('[data-clear]');
      const x = e.target.closest('[data-x]');
      const row = e.target.closest('.rc');
      if (clr) { LS.set(K_RECENT, []); changed(); render(); return; }
      if (x) { const l = getRecent(); l.splice(+x.dataset.x, 1); LS.set(K_RECENT, l); changed(); render(); return; }
      if (row) { input.value = row.dataset.q; box.style.display = 'none'; handleSearchInput(); }
    });
    box.addEventListener('touchstart', e => { /* allow taps without blur race */ }, { passive: true });
  }

  /* ---------- init ---------- */
  function init() {
    renderRows();
    injectListButton();
    buildFilters();
    buildRecent();
    setTimeout(checkNewEpisodes, 4000);
    const q = new URLSearchParams(location.search).get('q');
    if (q && $('#searchInput')) { $('#searchInput').value = q; handleSearchInput(); }
  }
  document.addEventListener('sf:reload', () => { renderRows(); updateListBtn(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
