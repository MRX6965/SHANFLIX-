/* ============================================================
   Extra home rows: Trending, Top rated, Because you watched
   ============================================================ */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const cache = new Map(); // id -> mapped item, so openDetails can find row items

  const _open = window.openDetails;
  window.openDetails = function (id) {
    id = String(id);
    const known = allContent.find(x => String(x.id) === id) || searchResultsCache.find(x => String(x.id) === id);
    if (!known && cache.has(id)) searchResultsCache.push(cache.get(id));
    return _open.apply(this, arguments);
  };

  function card(item) {
    cache.set(String(item.id), item);
    const id = escapeAttribute(item.id);
    return `<div class="movie-card" onclick="openDetails('${id}')">
      <div class="poster">
        <img src="${escapeAttribute(item.poster)}" alt="${escapeAttribute(item.title)}" loading="lazy" decoding="async"
             onerror="this.src='https://placehold.co/400x600/050a14/3b82f6?text=SHANFLIX'">
        <span class="poster-label">${escapeHTML(item.category)}</span>
      </div>
      <div class="movie-info"><h3>${escapeHTML(item.title)}</h3>
      <p>${escapeHTML(item.year || '')} <span class="star">★</span> ${escapeHTML(item.rating || 'N/A')}</p></div>
    </div>`;
  }

  function section(title, items) {
    if (!items.length) return '';
    return `<div class="section-heading"><h2>${escapeHTML(title)}</h2></div><div class="h-row">${items.slice(0, 14).map(card).join('')}</div>`;
  }

  const mapList = (res, cat) => (res.results || [])
    .filter(r => r.poster_path && (cat || r.media_type === 'movie' || r.media_type === 'tv'))
    .map(r => mapTmdbToLocal(r, cat || (r.media_type === 'movie' ? 'Movie' : 'TV Series')));

  function lastWatched() {
    try {
      const p = Object.values(JSON.parse(localStorage.getItem('sf_progress')) || {}).sort((a, b) => b.t - a.t)[0];
      if (p) return p.item;
      return (JSON.parse(localStorage.getItem('sf_list')) || [])[0] || null;
    } catch (e) { return null; }
  }

  async function render() {
    let host = $('#sfExtraRows');
    if (!host) {
      const anchor = $('#sfRows') || $('#catalogue');
      if (!anchor) return;
      host = document.createElement('div');
      host.id = 'sfExtraRows';
      if (anchor.id === 'sfRows') anchor.parentNode.insertBefore(host, anchor.nextSibling);
      else anchor.insertBefore(host, anchor.firstChild);
    }
    const jobs = [
      ['Trending Today', tmdbFetch('/trending/all/day').then(r => mapList(r))],
      ['Top Rated Movies', tmdbFetch('/movie/top_rated').then(r => mapList(r, 'Movie'))],
      ['Top Rated Series', tmdbFetch('/tv/top_rated').then(r => mapList(r, 'TV Series'))]
    ];
    const lw = lastWatched();
    if (lw && lw.tmdbId) {
      const kind = /movie/i.test(lw.category) ? 'movie' : 'tv';
      jobs.push(['Because you watched ' + lw.title,
        tmdbFetch(`/${kind}/${lw.tmdbId}/recommendations`).then(r => mapList(r, kind === 'movie' ? 'Movie' : 'TV Series'))]);
    }
    const out = await Promise.all(jobs.map(([t, p]) => p.then(items => section(t, items)).catch(() => '')));
    // personalised row first, then the rest
    if (jobs.length === 4) out.unshift(out.pop());
    host.innerHTML = out.join('');
  }

  function init() { setTimeout(render, 1200); }
  document.addEventListener('sf:reload', () => { clearTimeout(init.t); init.t = setTimeout(render, 600); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
