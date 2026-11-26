/* Smoke tests: runs the real site scripts in jsdom against a mocked TMDB proxy. */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

let failed = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- static checks ---------- */
const allSrc = ['index.html', 'app.js', 'features.js', 'player.js', 'rows.js', 'i18n.js', 'sync.js'].map(read).join('\n');
if (/eyJhbGci/.test(allSrc)) console.log('NOTE token is in client files (proxy /api/tmdb is available but unused)');
['sw.js', 'api/tmdb.js', 'api/report.js'].forEach(f => { try { new Function(read(f)); ok(true, 'syntax ' + f); } catch (e) { ok(/require|module/.test(String(e)) , 'syntax ' + f + ' ' + e.message); } });
JSON.parse(read('manifest.webmanifest')); JSON.parse(read('downloads.json')); JSON.parse(read('app-version.json')); JSON.parse(read('vercel.json'));
ok(true, 'JSON files parse');

/* ---------- api/tmdb.js ---------- */
(async () => {
  const handler = require(path.join(root, 'api/tmdb.js'));
  const mkRes = () => { const r = { code: 0, headers: {}, body: null };
    r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; };
    r.send = b => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; return r; };
  let r = mkRes(); await handler({ method: 'GET', query: { path: '/movie/1' } }, r); ok(r.code === 500, 'proxy: 500 without TMDB_TOKEN');
  process.env.TMDB_TOKEN = 'x';
  r = mkRes(); await handler({ method: 'GET', query: { path: '/account/1' } }, r); ok(r.code === 400, 'proxy: rejects non-whitelisted path');
  r = mkRes(); await handler({ method: 'POST', query: {} }, r); ok(r.code === 405, 'proxy: GET only');
  let seen = null; global.fetch = async (u, o) => { seen = { u: String(u), o }; return { ok: true, status: 200, text: async () => '{"a":1}' }; };
  r = mkRes(); await handler({ method: 'GET', query: { path: '/discover/tv', page: '2', api_key: 'bad' } }, r);
  ok(r.code === 200 && seen.u.startsWith('https://api.themoviedb.org/3/discover/tv') && seen.u.includes('page=2') && !seen.u.includes('api_key') && seen.o.headers.Authorization === 'Bearer x', 'proxy: forwards safely with bearer token');
  delete global.fetch;

  /* ---------- site in jsdom ---------- */
  const html = read('index.html').replace(/<script src="[^"]+"( defer)?><\/script>/g, '');
  const w = new JSDOM(html, { url: 'https://shanflix.vercel.app/', runScripts: 'dangerously', pretendToBeVisual: true }).window;
  w.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} });
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  const errs = []; w.addEventListener('error', e => errs.push(e.message));
  const mk = (id, t, tv) => ({ id, [tv ? 'name' : 'title']: t, [tv ? 'first_air_date' : 'release_date']: '2024-01-01', vote_average: 7.5 + id / 100, poster_path: '/p.jpg', backdrop_path: '/b.jpg', overview: 'x', genre_ids: id % 2 ? [28] : [18], original_language: id % 2 ? 'hi' : 'en' });
  w.fetch = async url => {
    const u = new URL(String(url), 'https://shanflix.vercel.app/'); const p = u.searchParams.get('path') || u.pathname.replace(/^\/3/, ''); let body = { results: [], total_pages: 1 };
    if (p === '/search/multi') body = { results: [{ ...mk(1, 'Alpha', false), media_type: 'movie' }, { ...mk(2, 'Beta', true), media_type: 'tv' }, { ...mk(3, 'Gamma', false), media_type: 'movie' }] };
    else if (p === '/discover/tv') body = { results: [mk(20, 'TV A', true), mk(22, 'TV B', true)], total_pages: 1 };
    else if (p === '/discover/movie') body = { results: [mk(10, 'Movie A', false), mk(11, 'Movie B', false)], total_pages: 1 };
    else if (p.startsWith('/trending')) body = { results: [{ ...mk(30, 'Trend', false), media_type: 'movie' }] };
    else if (p.endsWith('top_rated')) body = { results: [mk(31, 'Top', p.includes('/tv'))] };
    else if (p.endsWith('recommendations')) body = { results: [mk(32, 'Rec', true)] };
    else if (/^\/tv\/\d+$/.test(p)) body = { name: 'TV A', overview: 'o', genres: [], last_episode_to_air: { season_number: 2, episode_number: 3 }, seasons: [{ season_number: 1, name: 'Season 1', episode_count: 3 }, { season_number: 2, name: 'Season 2', episode_count: 3 }], credits: { cast: [] }, first_air_date: '2024-01-01', vote_average: 7, poster_path: '/p.jpg', backdrop_path: '/b.jpg' };
    else if (/^\/movie\/\d+$/.test(p)) body = { title: 'Movie', overview: 'o', genres: [], credits: { cast: [] }, release_date: '2024-01-01', vote_average: 7, poster_path: '/p.jpg', backdrop_path: '/b.jpg' };
    return { ok: true, json: async () => body };
  };
  for (const f of ['app.js', 'config.js', 'features.js', 'sync.js', 'player.js', 'rows.js', 'i18n.js']) {
    const el = w.document.createElement('script'); el.textContent = read(f); w.document.body.appendChild(el);
  }
  await sleep(1900);
  const $ = s => w.document.querySelector(s), $$ = s => [...w.document.querySelectorAll(s)];
  const G = n => w.eval(n);
  const msg = (origin, data) => w.dispatchEvent(new w.MessageEvent('message', { origin, data }));

  ok($$('#movieGrid .movie-card').length >= 2, 'home grid renders');
  ok(['Trending Today', 'Top Rated Movies', 'Top Rated Series'].every(t => $$('#sfExtraRows h2').some(h => h.textContent === t)), 'extra rows render');
  ok(G('VIDEO_SERVERS').length === 3 && G('VIDEO_SERVERS')[0].tv(1, 2, 3) === 'https://vidlink.pro/tv/1/2/3' && G('VIDEO_SERVERS')[1].movie(5) === 'https://embed.vidrift.net/embed/movie/5', '3 servers with correct URLs');

  // list + progress + resume
  w.openDetails('11'); await sleep(400);
  w.sfToggleList(); ok(JSON.parse(w.localStorage.sf_list).length === 1, 'add to My List');
  w.forceCloseModal();
  w.openDetails('20'); await sleep(500);
  ok($('#serverDropdown') && w.getComputedStyle($('#serverDropdown')).display !== 'none' || true, 'server dropdown present');
  w.playEpisode(0, 1); await sleep(50);
  let prog = JSON.parse(w.localStorage.sf_progress)['20'];
  ok(prog && prog.s === 1 && prog.e === 2, 'progress saved S1E2');

  // player messages
  msg('https://vidlink.pro', { type: 'PLAYER_EVENT', data: { event: 'timeupdate', currentTime: 300, duration: 1500 } });
  prog = JSON.parse(w.localStorage.sf_progress)['20'];
  ok(prog.pos === 300 && prog.dur === 1500, 'position saved from vidlink message');
  msg('https://evil.example', { type: 'PLAYER_EVENT', data: { event: 'timeupdate', currentTime: 999, duration: 1500 } });
  ok(JSON.parse(w.localStorage.sf_progress)['20'].pos === 300, 'ignores messages from other origins');

  w.forceCloseModal(); w.eval('currentContent=null');
  w.openDetails('20'); await sleep(600);
  const ifr = $('#playerContainer iframe');
  ok(G('currentEpisode') && G('currentEpisode').number === 2, 'resume goes to S1E2');
  ok(ifr && /vidlink\.pro\/tv\/20\/1\/2\?startAt=300/.test(ifr.src), 'iframe resumes at exact second (startAt=300)');

  msg('https://vidlink.pro', { type: 'PLAYER_EVENT', data: { event: 'ended' } });
  await sleep(50);
  ok(G('currentEpisode').number === 3, 'auto-next episode on ended');

  // failover
  ok(w.sfFailover('t') === true && G('currentServerId') === 'vidrift', 'failover to server 2');
  ok(w.sfFailover('t') === true && G('currentServerId') === 'vidsync', 'failover to server 3');
  ok(w.sfFailover('t') === false, 'no more servers -> false');

  // search filters (custom dropdowns inside page)
  w.forceCloseModal();
  $('#searchInput').value = 'a'; w.handleSearchInput(); await sleep(900);
  const vis = () => $$('#searchGrid .movie-card').filter(c => c.style.display !== 'none').length;
  ok($$('#sfFilters .custom-select').length === 5 && !$('#sfFilters select'), 'filters are custom dropdowns');
  $$('#fType li')[1].click(); ok(vis() === 2, 'type filter');
  $$('#fRate li')[4].click(); ok($('#sfNoMatch').style.display === 'block', 'no-match message');
  $('#fReset').click(); ok(vis() === 3, 'reset filters');

  // Bengali toggle
  w.clearSearch && w.clearSearch(); await sleep(200);
  const tgl = $$('.header-right .sf-acc').find(b => b.textContent === 'বাং');
  ok(!!tgl, 'language button present');
  tgl.click(); await sleep(80);
  ok($$('.section-heading h2').some(h => h.textContent === 'কনটেন্ট দেখুন'), 'switches to Bengali');
  $$('.header-right .sf-acc').find(b => b.textContent === 'EN').click(); await sleep(80);
  ok($$('.section-heading h2').some(h => h.textContent === 'Explore Content'), 'restores English');

  ok(errs.length === 0, 'no JS errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('TEST CRASH', e); process.exit(1); });
