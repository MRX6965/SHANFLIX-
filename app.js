/* ============================================================
   TMDB API CONFIGURATION
   ============================================================ */
const DEFAULT_TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5YzE2ZGIwODUxNjI5NzYxMzIxNTczZTVmNDZjNmIyNSIsIm5iZiI6MTc4Nzc0MjAzNi42NDIsInN1YiI6IjZhOGVjNzU0NzAyYmIxYTA3YzExMjI1NiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.E552pWRjPD57I0lW6C5Jz9iLV1mouqnCxZskqv4F5c4";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w342";
const TMDB_BACKDROP = "https://image.tmdb.org/t/p/w1280";
const TMDB_IMG_PROFILE = "https://image.tmdb.org/t/p/w185";

async function tmdbFetch(endpoint, params = {}) {
  const url = new URL(TMDB_API + endpoint);
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${DEFAULT_TMDB_TOKEN}`
    }
  });
  if (!res.ok) throw new Error("TMDB API Error");
  return await res.json();
}

/* ============================================================
   VIDEO SERVERS
   ============================================================ */
const VIDEO_SERVERS = [
  { id:'vidlink',   name:'Server 1 (VidLink)',
    movie: id => `https://vidlink.pro/movie/${id}`,
    tv: (id,s,e) => `https://vidlink.pro/tv/${id}/${s}/${e}` },
  { id:'vidrift',   name:'Server 2 (VidRift)',
    movie: id => `https://embed.vidrift.net/embed/movie/${id}`,
    tv: (id,s,e) => `https://embed.vidrift.net/embed/tv/${id}/${s}/${e}` },
  { id:'vidsync',   name:'Server 3 (VidSync)',
    movie: id => `https://vidsync.pro/movie/${id}`,
    tv: (id,s,e) => `https://vidsync.pro/tv/${id}/${s}/${e}` },
  { id:'multiembed', name:'Server 4 (MultiEmbed)',
    movie: id => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
    tv: (id,s,e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}` }
];

/* ============================================================
   POPUP & REDIRECT BLOCKER
   ============================================================ */
(function blockRedirects(){
  try { 
    window.open = function(){ 
      console.warn("SHANFLIX: popup blocked");
      if(typeof showToast === 'function') showToast("Popup blocked");
      return null;
    }; 
  } catch(e){}
  const _assign = window.location.assign.bind(window.location);
  const _replace = window.location.replace.bind(window.location);
  function sameOrigin(url){
    try { return new URL(url, window.location.href).origin === window.location.origin; }
    catch(e){ return false; }
  }
  try {
    window.location.assign = function(url){
      if (sameOrigin(url)) return _assign(url);
      console.warn("SHANFLIX: external navigation blocked →", url);
      if(typeof showToast === 'function') showToast("External link blocked");
    };
    window.location.replace = function(url){
      if (sameOrigin(url)) return _replace(url);
      console.warn("SHANFLIX: external navigation blocked →", url);
      if(typeof showToast === 'function') showToast("External link blocked");
    };
  } catch(e){}
})();

/* ============================================================
   STATE MANAGEMENT
   ============================================================ */
let allContent = [];
let searchResultsCache = [];
let currentContent = null;
let currentEpisode = null;
let currentCategory = "All";
let currentServerId = "vidlink";
let currentSeasonIndex = 0;
let currentSlideIndex = 0;
let slideInterval = null;
let currentPlayToken = 0;

let currentPlatform = null;
const PLATFORMS = [
  { id: 'all', name: 'All', provider: null, logo: '', color: 'rgba(255,255,255,0.1)', region: 'IN' },
  { id: 'netflix', name: 'Netflix', provider: '8', logo: 'https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg', color: 'rgba(0,0,0,0.4)', region: 'IN' },
  { id: 'prime', name: 'Prime Video', provider: '9|119', logo: 'https://upload.wikimedia.org/wikipedia/commons/1/11/Amazon_Prime_Video_logo_%282024%29.svg', color: 'rgba(255,255,255,0.05)', region: 'IN' },
  { id: 'hotstar', name: 'JioHotstar', provider: '122|337', logo: 'https://upload.wikimedia.org/wikipedia/commons/f/f1/JioHotstar_Logo.svg', color: 'rgba(255,255,255,0.05)', region: 'IN' },
  { id: 'sonyliv', name: 'SonyLIV', provider: '237', logo: 'https://upload.wikimedia.org/wikipedia/en/1/1f/SonyLIV_Logo.svg', color: 'rgba(255,255,255,0.05)', region: 'IN' },
  { id: 'zee5', name: 'ZEE5', provider: '232', logo: 'https://upload.wikimedia.org/wikipedia/en/2/2f/ZEE5_logo.svg', color: 'rgba(255,255,255,0.05)', region: 'IN' },
  { id: 'hoichoi', name: 'hoichoi', provider: '315', logo: 'https://upload.wikimedia.org/wikipedia/en/2/24/Hoichoi_logo.svg', color: 'rgba(255,255,255,0.05)', region: 'IN' },
  { id: 'hbomax', name: 'HBO Max', provider: '1899', logo: 'https://upload.wikimedia.org/wikipedia/commons/e/e5/HBO_Max_logo.svg', color: 'rgba(255,255,255,0.05)', region: 'US' },
  { id: 'hulu', name: 'Hulu', provider: '15', logo: 'https://upload.wikimedia.org/wikipedia/commons/e/e4/Hulu_Logo.svg', color: 'rgba(255,255,255,0.05)', region: 'US' }
];

let currentPage = 1;
let totalPages = 1;
let isLoading = false;

const IMG_CACHE_NAME = "shanflix-img-v1";

let _scrollPos = 0;
let _scrollLocked = false;
function lockBodyScroll(){
  if(_scrollLocked) return;
  _scrollPos = window.scrollY || window.pageYOffset || 0;
  document.body.classList.add('player-open');
  document.body.style.position = 'fixed';
  document.body.style.top = `-${_scrollPos}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
  _scrollLocked = true;
}
function unlockBodyScroll(){
  if(!_scrollLocked) return;
  document.body.classList.remove('player-open');
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  window.scrollTo(0, _scrollPos);
  _scrollLocked = false;
}

async function cacheImage(url){
  if (!('caches' in window) || !url) return;
  try {
    const cache = await caches.open(IMG_CACHE_NAME);
    const hit = await cache.match(url);
    if (!hit) await cache.add(url);
  } catch(e){}
}
function prefetchImages(urls){
  if (!('caches' in window)) return;
  urls.slice(0, 8).forEach(u => { if (u) cacheImage(u); });
}

function getStatus(item){
  const s = String(item.status || "").toLowerCase().trim();
  if (s === "upcoming") return "upcoming";
  if (s === "completed" || s === "complete" || s === "released" || s === "release") return "completed";
  return "";
}
function isUpcoming(item){ return getStatus(item) === "upcoming"; }

function escapeHTML(value){
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
}
function escapeAttribute(v){ return escapeHTML(v); }

function isValidEmbedUrl(value){
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch(e) { return false; }
}

function preconnectToVideoDomain(url){
  try {
    const domain = new URL(url).origin;
    if (!document.querySelector(`link[rel="preconnect"][href="${domain}"]`)) {
      const link = document.createElement('link');
      link.rel = 'preconnect'; link.href = domain; link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
      const dnsLink = document.createElement('link');
      dnsLink.rel = 'dns-prefetch'; dnsLink.href = domain;
      document.head.appendChild(dnsLink);
    }
  } catch(e){}
}

function showToast(msg){
  const t = document.getElementById("toast");
  if(!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => t.classList.remove("show"), 2500);
}

/* ============================================================
   UPCOMING DETECTION
   ============================================================ */
const UPCOMING_STATUSES = ['In Production', 'Planned', 'Rumored', 'Post Production', 'Pilot', 'Canceled'];

function isContentUpcoming(data, isMovie) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (isMovie) {
    if (UPCOMING_STATUSES.includes(data.status)) return true;
    if (data.release_date) return new Date(data.release_date) > today;
    return true;
  } else {
    if (UPCOMING_STATUSES.includes(data.status)) return true;
    if (data.last_episode_to_air) return false;
    if (data.first_air_date) {
      const d = new Date(data.first_air_date);
      if (d > today) return true;
      if (data.number_of_episodes > 0) return false;
      return true;
    }
    return true;
  }
}

function buildTVSeasons(data) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const allSeasons = (data.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
  if (!allSeasons.length) return [];
  const lastAired = data.last_episode_to_air;
  const lastSeasonNum = lastAired ? lastAired.season_number : 0;
  const lastEpNum = lastAired ? lastAired.episode_number : 0;
  const result = [];
  for (const s of allSeasons) {
    if (s.air_date) {
      const sd = new Date(s.air_date);
      if (sd > today) continue;
    }
    let epCount = 0;
    if (lastSeasonNum === 0) epCount = s.episode_count;
    else if (s.season_number < lastSeasonNum) epCount = s.episode_count;
    else if (s.season_number === lastSeasonNum) epCount = lastEpNum;
    else continue;
    if (epCount <= 0) continue;
    const eps = Array.from({length: epCount}, (_, i) => ({ number: i + 1, sources: {} }));
    result.push({ number: s.season_number, name: s.name || `Season ${s.season_number}`, episodes: eps });
  }
  return result;
}

/* ============================================================
   TMDB DATA MAPPING & FETCHING
   ============================================================ */
function mapTmdbToLocal(item, catType = "") {
  let category = catType;
  if (!category) {
    if (item.first_air_date) category = "TV Series";
    else if (item.release_date) category = "Movie";
    else category = "TV Series";
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateStr = item.release_date || item.first_air_date;
  let status = "completed";
  if (dateStr) {
    const d = new Date(dateStr);
    if (d > today) status = "upcoming";
  } else {
    status = "upcoming";
  }
  return {
    id: String(item.id),
    tmdbId: String(item.id),
    title: item.title || item.name || item.original_title || item.original_name,
    category: category,
    year: (item.release_date || item.first_air_date || "").substring(0, 4),
    rating: item.vote_average ? item.vote_average.toFixed(1) : "N/A",
    poster: item.poster_path ? TMDB_IMG + item.poster_path : "https://placehold.co/400x600/050a14/3b82f6?text=SHANFLIX",
    backdrop: item.backdrop_path ? TMDB_BACKDROP + item.backdrop_path : (item.poster_path ? TMDB_BACKDROP + item.poster_path : ""),
    description: item.overview || "No description available for this title.",
    status: status,
    genreIds: item.genre_ids || [],
    lang: item.original_language || "",
    ratingNum: item.vote_average || 0,
    seasons: [], 
    cast: []
  };
}

function renderPlatforms() {
  const container = document.getElementById('platformsContainer');
  if (!container) return;
  
  container.innerHTML = PLATFORMS.map(p => {
    const isActive = p.id === 'all' ? 'active' : '';
    const bgColor = p.color || 'rgba(255,255,255,0.05)';
    
    let logoHTML = '';
    if (p.logo) {
      logoHTML = `
        <img src="${p.logo}" alt="${p.name}" class="platform-logo" referrerpolicy="no-referrer" 
             onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
        <span class="platform-fallback-text">${p.name}</span>
      `;
    } else {
      logoHTML = `<span style="font-weight:900;font-size:16px;color:#fff;letter-spacing:1px;">${p.name}</span>`;
    }

    return `
      <div class="platform-wrapper" onclick="selectPlatform('${p.provider || ''}', this)">
        <div class="platform-box ${isActive}" style="background: ${bgColor};">
          ${logoHTML}
        </div>
        <span class="platform-name">${p.name}</span>
      </div>
    `;
  }).join('');
}

function selectPlatform(providerId, wrapperEl) {
  currentPlatform = providerId || null;
  
  document.querySelectorAll('.platform-box').forEach(el => el.classList.remove('active'));
  wrapperEl.querySelector('.platform-box').classList.add('active');
  
  document.querySelectorAll(".cat-tab").forEach(b => b.classList.remove("active"));
  document.querySelector('.cat-tab').classList.add('active'); 
  currentCategory = 'All';
  
  const catalogueTop = document.getElementById("catalogue").offsetTop - 70;
  window.scrollTo({ top: catalogueTop, behavior: 'smooth' });

  loadHomeContent('All', false);
}

async function loadHomeContent(category, isAppend = false) {
  if (isLoading) return;

  if (!isAppend) {
    currentCategory = category;
    currentPage = 1;
    allContent = [];
    document.getElementById("movieGrid").innerHTML = '<div class="skeleton-card"></div>'.repeat(12);
    document.getElementById("heroSection").innerHTML = `
      <div class="hero-slide active" style="background:#050a14;">
        <div class="hero-content" style="max-width:620px;">
          <div class="skeleton-text" style="width:200px;height:22px;margin-bottom:18px;"></div>
          <div class="skeleton-text" style="width:80%;height:60px;margin-bottom:18px;"></div>
          <div class="skeleton-text" style="width:90%;height:14px;margin-bottom:8px;"></div>
          <div class="skeleton-text" style="width:70%;height:14px;margin-bottom:26px;"></div>
          <div class="skeleton-text" style="width:150px;height:44px;"></div>
        </div>
      </div>`;
  }

  isLoading = true;
  if (isAppend) document.getElementById("loadMoreIndicator").style.display = "block";

  let baseParams = { sort_by: "popularity.desc", page: currentPage };
  
  if (currentPlatform) {
    const plat = PLATFORMS.find(p => p.provider === currentPlatform);
    baseParams.with_watch_providers = currentPlatform;
    baseParams.watch_region = plat && plat.region ? plat.region : "IN"; 
  }

  try {
    let results = [];
    let endpoint = "/discover/movie";
    let catLabel = "";

    if (category === "Movie") {
      catLabel = "Movie"; 
      const data = await tmdbFetch(endpoint, baseParams);
      results = data.results || [];
      totalPages = data.total_pages || 1;

    } else if (category === "TV Series") {
      catLabel = "TV Series";
      if (currentPlatform) {
        const data = await tmdbFetch("/discover/tv", baseParams);
        results = data.results || [];
        totalPages = data.total_pages || 1;
      } else {
        const discoverPromise = tmdbFetch("/discover/tv", baseParams).catch(() => ({ results: [], total_pages: 1 }));
        const biggBossPromise = tmdbFetch("/search/tv", { query: "Bigg Boss", page: 1 }).catch(() => ({ results: [], total_pages: 1 }));
        const [discoverData, biggBossData] = await Promise.all([discoverPromise, biggBossPromise]);

        const discoverResults = discoverData.results || [];
        const biggBossResults = biggBossData.results || [];

        const mergedMap = new Map();
        [...biggBossResults, ...discoverResults].forEach(item => {
          if (!mergedMap.has(item.id)) mergedMap.set(item.id, item);
        });
        results = Array.from(mergedMap.values());
        totalPages = Math.max(discoverData.total_pages || 1, biggBossData.total_pages || 1);
      }

    } else if (category === "All") {
      const moviePromise = tmdbFetch("/discover/movie", baseParams).catch(() => ({ results: [], total_pages: 1 }));
      const tvPromise = tmdbFetch("/discover/tv", baseParams).catch(() => ({ results: [], total_pages: 1 }));
      
      const [movieData, tvData] = await Promise.all([moviePromise, tvPromise]);
      
      const movies = (movieData.results || []).map(m => ({ ...m, media_type: 'movie' }));
      const tvs = (tvData.results || []).map(t => ({ ...t, media_type: 'tv' }));
      
      const combined = [];
      const maxLen = Math.max(movies.length, tvs.length);
      for (let i = 0; i < maxLen; i++) {
        if (movies[i]) combined.push(movies[i]);
        if (tvs[i]) combined.push(tvs[i]);
      }
      results = combined;
      totalPages = Math.max(movieData.total_pages || 1, tvData.total_pages || 1);

    } else if (category === "Drama") {
      catLabel = "Drama";
      baseParams.with_original_language = "ko";
      const data = await tmdbFetch("/discover/tv", baseParams);
      results = data.results || [];
      totalPages = data.total_pages || 1;

    } else if (category === "Anime") {
      catLabel = "Anime";
      baseParams.with_original_language = "ja"; 
      baseParams.with_genres = "16"; 
      const data = await tmdbFetch("/discover/tv", baseParams);
      results = data.results || [];
      totalPages = data.total_pages || 1;
    }

    const newItems = results.map(item => {
      let type = catLabel;
      if (!type) type = item.media_type === 'movie' ? 'Movie' : 'TV Series';
      return mapTmdbToLocal(item, type);
    });

    const existingIds = new Set(allContent.map(x => x.id));
    const uniqueNewItems = newItems.filter(x => !existingIds.has(x.id));

    allContent = [...allContent, ...uniqueNewItems];

    if (isAppend) {
      appendContentToGrid(uniqueNewItems);
    } else {
      renderContent(allContent);
      renderHeroSlider();
    }

    currentPage++;
  } catch (e) {
    console.error(e);
    if (!isAppend) document.getElementById("movieGrid").innerHTML = `
      <div class="err-box" style="grid-column:1/-1">
        <h3>${navigator.onLine ? "Couldn't load content" : "You're offline"}</h3>
        <p>${navigator.onLine ? "The movie database didn't respond. Please try again." : "Check your internet connection and try again."}</p>
        <button class="err-btn" onclick="loadHomeContent(currentCategory, false)">Try again</button>
      </div>`;
  } finally {
    isLoading = false;
    if (isAppend) document.getElementById("loadMoreIndicator").style.display = "none";
  }
}

/* ============================================================
   RENDERING MAIN CONTENT
   ============================================================ */
function renderHeroSlider(){
  const heroSection = document.getElementById("heroSection");
  let sliderItems = allContent.slice(0, 5); 
  
  if (!sliderItems.length) return;

  heroSection.innerHTML = sliderItems.map((item, index) => {
    const bgUrl = item.backdrop || item.poster || "";
    const isFirst = index === 0;
    const bgStyle = isFirst && bgUrl ? `style="background-image:url('${escapeAttribute(bgUrl)}')"` : "";
    const dataBg = !isFirst && bgUrl ? `data-bg="${escapeAttribute(bgUrl)}"` : "";
    const up = isUpcoming(item);
    const tagText = 'SHANFLIX ORIGINAL';
    const btn = up
      ? `<button class="primary-btn notify-btn" onclick="openDetails('${escapeAttribute(item.id)}')">🔔 Coming Soon</button>`
      : `<button class="primary-btn" onclick="openDetails('${escapeAttribute(item.id)}')">▶ Play</button>`;
    
    return `
      <div class="hero-slide ${isFirst ? 'active' : ''}" ${bgStyle} ${dataBg}>
        <div class="hero-content">
          <div class="tag"><span class="tag-n">S</span> ${tagText}</div>
          <h1>${escapeHTML(item.title)}</h1>
          <div class="hero-meta">
            <span class="match">98% Match</span>
            <span>${escapeHTML(item.year || "")}</span>
            <span class="badge">16+</span>
            <span class="badge">HD</span>
            ${up ? '<span class="badge badge-upcoming">COMING SOON</span>' : ''}
          </div>
          <p>${escapeHTML(item.description || "")}</p>
          <div class="hero-btns">${btn}</div>
        </div>
      </div>`;
  }).join("");

  prefetchImages(sliderItems.slice(1, 3).map(i => i.backdrop || i.poster));
  startSlider(sliderItems.length);
}

function startSlider(total){
  clearInterval(slideInterval);
  if (total <= 1) return;
  currentSlideIndex = 0;
  slideInterval = setInterval(() => {
    const slides = document.querySelectorAll(".hero-slide");
    if (!slides.length) return;
    slides[currentSlideIndex].classList.remove("active");
    currentSlideIndex = (currentSlideIndex + 1) % slides.length;
    const next = slides[currentSlideIndex];
    if (next.dataset.bg && !next.style.backgroundImage) {
      next.style.backgroundImage = `url('${next.dataset.bg}')`;
    }
    next.classList.add("active");
    const after = slides[(currentSlideIndex + 1) % slides.length];
    if (after && after.dataset.bg && !after.dataset.preloaded) {
      after.dataset.preloaded = "1";
      new Image().src = after.dataset.bg;
    }
  }, 6000);
}

function createCardHTML(item, idx) {
  const poster = item.poster || "https://placehold.co/400x600/050a14/3b82f6?text=SHANFLIX";
  const fp = idx < 3 ? 'fetchpriority="high"' : 'fetchpriority="low"';
  const rating = item.rating || "N/A";
  const up = isUpcoming(item);
  const upcomingBadge = up ? '<span class="poster-status upcoming">COMING SOON</span>' : '';
  const posterClass = up ? 'poster poster-upcoming' : 'poster';
  const labelText = item.category;
  const labelClass = "poster-label";
  return `
    <div class="movie-card" data-id="${escapeAttribute(item.id)}" onclick="openDetails('${escapeAttribute(item.id)}')">
      <div class="${posterClass}">
        <img src="${escapeAttribute(poster)}" alt="${escapeAttribute(item.title)}"
             loading="${idx < 6 ? 'eager' : 'lazy'}" decoding="async" ${fp}
             onerror="this.src='https://placehold.co/400x600/050a14/3b82f6?text=SHANFLIX'">
        <span class="${labelClass}">${escapeHTML(labelText)}</span>
        ${upcomingBadge}
      </div>
      <div class="movie-info">
        <h3>${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(item.year || "")} <span class="star">★</span> ${escapeHTML(rating)}</p>
      </div>
    </div>`;
}

function renderContent(data = allContent){
  const grid = document.getElementById("movieGrid");
  if (!data.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#888;">No content found.</div>';
    return;
  }
  grid.innerHTML = data.map((item, idx) => createCardHTML(item, idx)).join("");
  prefetchImages(data.slice(0, 6).map(i => i.poster));
}

function appendContentToGrid(items) {
  const grid = document.getElementById("movieGrid");
  const startIdx = allContent.length - items.length;
  const html = items.map((item, idx) => createCardHTML(item, startIdx + idx)).join("");
  grid.insertAdjacentHTML('beforeend', html);
}

function updateCardUpcomingStatus(id) {
  const item = allContent.find(x => String(x.id) === String(id));
  if (!item) return;
  const up = isUpcoming(item);
  document.querySelectorAll('.movie-card').forEach(card => {
    const onclickAttr = card.getAttribute('onclick') || '';
    if (!onclickAttr.includes(`'${id}'`)) return;
    const posterDiv = card.querySelector('.poster');
    if (!posterDiv) return;
    const existing = posterDiv.querySelector('.poster-status');
    if (up && !existing) {
      const badge = document.createElement('span');
      badge.className = 'poster-status upcoming';
      badge.textContent = 'COMING SOON';
      posterDiv.appendChild(badge);
    } else if (!up && existing) {
      existing.remove();
    }
  });
}

function filterCategory(category, button = null){
  currentCategory = category;
  
  document.getElementById("searchPage").style.display = "none";
  document.getElementById("catalogue").style.display = "block";
  document.getElementById("heroSection").style.display = "block";

  document.querySelectorAll(".cat-tab").forEach(b => b.classList.remove("active"));
  
  if (button) {
    button.classList.add("active");
  } else {
    document.querySelectorAll(".cat-tab").forEach(b => {
      if ((b.textContent.trim() === category) || (category === 'Movie' && b.textContent.trim() === 'Movies')) {
        b.classList.add("active");
      }
    });
  }

  if (button) {
    const catalogueTop = document.getElementById("catalogue").offsetTop - 70;
    window.scrollTo({ top: catalogueTop, behavior: 'smooth' });
  }

  loadHomeContent(category, false);
}

/* ============================================================
   SEARCH SYSTEM (Dedicated Page)
   ============================================================ */
let searchTimeout = null;

function handleSearchInput(){
  const input = document.getElementById("searchInput");
  const btn = document.getElementById("clearSearchBtn");
  
  if (input.value.trim().length > 0) btn.style.display = "flex";
  else { 
    btn.style.display = "none"; 
    if (document.getElementById("searchPage").style.display === "block") {
      showHome();
    }
    return; 
  }

  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    const query = input.value.trim();
    if (!query) return;

    document.getElementById("heroSection").style.display = "none";
    document.getElementById("catalogue").style.display = "none";
    document.getElementById("searchPage").style.display = "block";
    
    document.getElementById("searchTitle").innerHTML = `Search Results for: <span>"${escapeHTML(query)}"</span>`;
    
    const grid = document.getElementById("searchGrid");
    const emptyState = document.getElementById("searchEmpty");
    emptyState.style.display = "none";
    grid.innerHTML = '<div class="skeleton-card"></div>'.repeat(6);

    try {
      const data = await tmdbFetch('/search/multi', { query: query });
      const filtered = (data.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv');
      
      const mappedResults = filtered.map(item => {
        return mapTmdbToLocal(item, item.media_type === 'movie' ? 'Movie' : 'TV Series');
      });

      searchResultsCache = mappedResults;

      if (!mappedResults.length) {
        grid.innerHTML = "";
        emptyState.style.display = "flex";
      } else {
        emptyState.style.display = "none";
        grid.innerHTML = mappedResults.map((item, idx) => createCardHTML(item, idx)).join("");
        prefetchImages(mappedResults.slice(0, 6).map(i => i.poster));
      }
    } catch(e) {
      grid.innerHTML = "";
      emptyState.style.display = "flex";
      emptyState.querySelector('h3').textContent = "Search failed";
      emptyState.querySelector('p').textContent = "An error occurred while searching. Please try again.";
    }
  }, 500);
}

function clearSearch(){
  const input = document.getElementById("searchInput");
  input.value = "";
  document.getElementById("clearSearchBtn").style.display = "none";
  showHome();
}

function showHome(){
  document.getElementById("searchPage").style.display = "none";
  document.getElementById("catalogue").style.display = "block";
  document.getElementById("heroSection").style.display = "block";
  
  const emptyState = document.getElementById("searchEmpty");
  emptyState.querySelector('h3').textContent = "No results found";
  emptyState.querySelector('p').textContent = "We couldn't find anything matching your search. Try different keywords.";

  filterCategory('All');
}

/* ============================================================
   MODAL & PLAYER LOGIC
   ============================================================ */
function toggleDropdown(id){
  const el = document.getElementById(id);
  if (el.classList.contains('fixed-language')) return;
  const isOpen = el.classList.contains("open");
  document.querySelectorAll(".custom-select").forEach(d => d.classList.remove("open"));
  if (!isOpen) el.classList.add("open");
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".custom-select")) {
    document.querySelectorAll(".custom-select").forEach(d => d.classList.remove("open"));
  }
}, { passive: true });

function populateServerDropdown() {
  const list = document.getElementById("serverOptionsList");
  if (!list) return;
  list.innerHTML = VIDEO_SERVERS.map(s =>
    `<li class="${s.id === currentServerId ? 'active' : ''}" onclick="selectServer('${s.id}', this)">${escapeHTML(s.name)}</li>`
  ).join("");
}

function syncServerDropdown(serverId) {
  const serverList = document.getElementById("serverOptionsList");
  const serverLabel = document.getElementById("serverLabel");
  if (!serverList) return;
  const server = VIDEO_SERVERS.find(s => s.id === serverId);
  if (!server) return;
  serverList.querySelectorAll("li").forEach(li => {
    const onclick = li.getAttribute("onclick") || "";
    if (onclick.includes(`'${serverId}'`)) li.classList.add("active");
    else li.classList.remove("active");
  });
  serverLabel.textContent = server.name.split(' (')[0];
}

function selectServer(serverId, el) {
  const server = VIDEO_SERVERS.find(s => s.id === serverId);
  if (!server) return;
  currentServerId = serverId;
  document.getElementById("serverLabel").textContent = server.name.split(' (')[0];
  el.parentElement.querySelectorAll("li").forEach(li => li.classList.remove("active"));
  el.classList.add("active");
  document.getElementById("serverDropdown").classList.remove("open");

  if (currentContent && currentEpisode) {
    const season = currentContent.seasons[currentSeasonIndex];
    const epIndex = season.episodes.indexOf(currentEpisode);
    if (epIndex !== -1) {
      playEpisode(currentSeasonIndex, epIndex);
    }
  }
}

function selectSeason(index, el){
  currentSeasonIndex = index;
  document.getElementById("seasonLabel").textContent = el.textContent;
  const list = el.parentElement;
  list.querySelectorAll("li").forEach(li => li.classList.remove("active"));
  el.classList.add("active");
  document.getElementById("seasonDropdown").classList.remove("open");

  const season = currentContent.seasons[index];
  if (season && season.episodes && season.episodes.length > 0) {
    playEpisode(index, 0);
  } else {
    currentEpisode = null;
    document.getElementById("playerContainer").innerHTML =
      '<div class="player-placeholder"><span>▶</span> VIDEO PLAYER</div>';
    renderEpisodes();
  }
}

function renderCast(castArr) {
  const wrap = document.getElementById("castWrap");
  const grid = document.getElementById("castGrid");
  
  if (!castArr || !castArr.length) {
    wrap.style.display = "none";
    return;
  }
  
  wrap.style.display = "block";
  grid.innerHTML = castArr.slice(0, 15).map(c => {
    const imgUrl = c.profile_path ? TMDB_IMG_PROFILE + c.profile_path : `https://placehold.co/150x150/1e293b/fff?text=${encodeURIComponent((c.name || '?').charAt(0))}`;
    return `
      <div class="cast-card">
        <img class="cast-img" src="${escapeAttribute(imgUrl)}" loading="lazy" alt="${escapeAttribute(c.name)}" onerror="this.src='https://placehold.co/150x150/1e293b/fff?text=User'">
        <div class="cast-name" title="${escapeAttribute(c.name)}">${escapeHTML(c.name)}</div>
        <div class="cast-char" title="${escapeAttribute(c.character || '')}">${escapeHTML(c.character || '')}</div>
      </div>
    `;
  }).join("");
}

function showComingSoonPlayer() {
  const container = document.getElementById("playerContainer");
  container.innerHTML = `
    <div class="player-placeholder coming-soon">
      <div class="cs-icon">🔔</div>
      <div class="cs-title">COMING SOON</div>
      <div class="cs-sub">STAY TUNED FOR RELEASE</div>
    </div>
  `;
}

async function openDetails(id){
  let item = allContent.find(x => String(x.id) === String(id));
  if (!item) {
    item = searchResultsCache.find(x => String(x.id) === String(id));
    if (item) {
      allContent.push(item);
    } else {
      return;
    }
  }

  currentContent = item;
  currentEpisode = null;
  
  document.getElementById("detailTitle").textContent = item.title || "Loading...";
  document.getElementById("detailMeta").innerHTML = `<span class="muted">Loading details from TMDB...</span>`;
  document.getElementById("castWrap").style.display = "none";
  document.getElementById("playerContainer").innerHTML = '<div class="player-placeholder"><span>▶</span> LOADING...</div>';
  document.getElementById("detailModal").classList.add("show");
  lockBodyScroll();
  
  if (!history.state || !history.state.modalOpen) {
    try { history.pushState({ modalOpen: true }, ""); } catch(e){}
  }

  try {
    const isMovie = item.category.toLowerCase().includes('movie');
    const endpoint = isMovie ? `/movie/${item.tmdbId}` : `/tv/${item.tmdbId}`;
    const data = await tmdbFetch(endpoint, { append_to_response: 'credits' });

    const upcoming = isContentUpcoming(data, isMovie);
    item.status = upcoming ? 'upcoming' : 'completed';

    item.title = data.title || data.name || item.title;
    item.description = data.overview || item.description;
    item.year = (data.release_date || data.first_air_date || "").substring(0, 4);
    item.rating = data.vote_average ? data.vote_average.toFixed(1) : item.rating;
    item.backdrop = data.backdrop_path ? TMDB_BACKDROP + data.backdrop_path : item.backdrop;
    item.cast = data.credits && data.credits.cast ? data.credits.cast : [];

    document.getElementById("detailTitle").textContent = item.title;
    
    let statusBadgeHTML;
    if (upcoming) {
      statusBadgeHTML = `<span class="badge-status upcoming">COMING SOON</span>`;
    } else if (data.status === 'Ended' || data.status === 'Canceled') {
      statusBadgeHTML = `<span class="badge-status completed">Ended</span>`;
    } else {
      statusBadgeHTML = `<span class="badge-status completed">Released</span>`;
    }

    document.getElementById("detailMeta").innerHTML = `
      <span class="badge-hd">HD</span>
      <span>${escapeHTML(item.year || "N/A")}</span><span>|</span>
      <span>${item.rating ? "★ " + item.rating : "—"}</span><span>|</span>
      <span>${escapeHTML(item.category)}</span>
      ${statusBadgeHTML}`;

    renderCast(item.cast);

    const newControls = document.getElementById("newControls");
    const seasonDropdown = document.getElementById("seasonDropdown");
    const episodeList = document.getElementById("episodeList");
    const seasonCount = document.getElementById("detailSeasonCount");
    const resourcesHeader = document.getElementById("resourcesHeader");
    const uploadInfo = document.getElementById("uploadInfo");

    updateCardUpcomingStatus(item.id);

    if (upcoming) {
      newControls.style.display = "none";
      episodeList.style.display = "none";
      seasonDropdown.style.display = "none";
      seasonCount.style.display = "none";
      if (resourcesHeader) resourcesHeader.style.display = "none";
      if (uploadInfo) uploadInfo.style.display = "none";

      item.seasons = [];
      currentEpisode = null;
      currentSeasonIndex = 0;

      showComingSoonPlayer();
      generateRelatedContent(item);
      return;
    }

    if (resourcesHeader) resourcesHeader.style.display = "flex";
    if (uploadInfo) uploadInfo.style.display = "block";
    newControls.style.display = "flex";
    episodeList.style.display = "flex";

    if (!isMovie) {
      item.seasons = buildTVSeasons(data);
      if (!item.seasons.length) {
        newControls.style.display = "none";
        episodeList.style.display = "none";
        if (resourcesHeader) resourcesHeader.style.display = "none";
        if (uploadInfo) uploadInfo.style.display = "none";
        showComingSoonPlayer();
        generateRelatedContent(item);
        return;
      }
    } else {
      item.seasons = [{ number: 1, name: "Movie", episodes: [{ number: 1, sources: {} }] }];
    }

    if (isMovie) {
      seasonCount.style.display = "none";
      seasonDropdown.style.display = "none";
      episodeList.style.display = "none";
    } else {
      seasonCount.style.display = "block";
      seasonDropdown.style.display = "block";
      episodeList.style.display = "flex";
      const totalEpisodes = item.seasons.reduce((sum, s) => sum + s.episodes.length, 0);
      seasonCount.textContent = `${item.seasons.length} Season${item.seasons.length > 1 ? "s" : ""} · ${totalEpisodes} Episodes`;
    }

    currentSeasonIndex = 0;
    const seasonList = document.getElementById("seasonOptionsList");
    if (!item.seasons.length) {
      document.getElementById("seasonLabel").textContent = "N/A";
      seasonList.innerHTML = "";
    } else {
      document.getElementById("seasonLabel").textContent = item.seasons[0].name || "Season 1";
      seasonList.innerHTML = item.seasons.map((s, i) => `
        <li class="${i === 0 ? 'active' : ''}" onclick="selectSeason(${i}, this)">
          ${escapeHTML(s.name || "Season " + (i + 1))}
        </li>`).join("");
    }

    syncServerDropdown(currentServerId);

    document.getElementById("playerContainer").innerHTML = '<div class="player-placeholder"><span>▶</span> VIDEO PLAYER</div>';
    
    if (item.seasons.length > 0 && item.seasons[0].episodes.length > 0) {
      playEpisode(0, 0);
    } else {
      renderEpisodes();
    }

    generateRelatedContent(item);

  } catch (err) {
    document.getElementById("detailMeta").innerHTML = `<span style="color:red">Failed to load details: ${escapeHTML(err.message)}</span>`;
  }
}

function generateRelatedContent(currentItem){
  const relatedGrid = document.getElementById("relatedGrid");
  let related = allContent.filter(x => String(x.id) !== String(currentItem.id));
  related = related.sort(() => 0.5 - Math.random()).slice(0, 6);
  
  if (!related.length) {
    relatedGrid.innerHTML = '<div style="color:#888;font-size:13px;">No related content.</div>';
    return;
  }
  relatedGrid.innerHTML = related.map(item => {
    const poster = item.poster || "https://placehold.co/400x600/050a14/3b82f6?text=SHANFLIX";
    const up = isUpcoming(item);
    return `
      <div class="related-card" onclick="openDetails('${escapeAttribute(item.id)}')">
        <img class="related-poster" src="${escapeAttribute(poster)}" loading="lazy"
             onerror="this.src='https://placehold.co/400x600/050a14/3b82f6?text=SHANFLIX'">
        <div class="related-title">${escapeHTML(item.title)}</div>
        ${up ? '<div class="poster-status upcoming" style="position:absolute;top:8px;right:8px;font-size:8px;padding:3px 6px;">COMING SOON</div>' : ''}
      </div>`;
  }).join("");
}

function closeModal(){
  const modal = document.getElementById("detailModal");
  if (!modal.classList.contains("show")) return;
  forceCloseModal();
  if (history.state && history.state.modalOpen) {
    try { history.replaceState(null, ""); } catch(e){}
  }
}

function forceCloseModal(){
  document.getElementById("detailModal").classList.remove("show");
  unlockBodyScroll();
  currentContent = null;
  currentEpisode = null;
  currentPlayToken++;
  const pc = document.getElementById("playerContainer");
  if (pc) pc.innerHTML = '<div class="player-placeholder"><span>▶</span> VIDEO PLAYER</div>';

  try {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitFullscreenElement) {
      document.webkitExitFullscreen().catch(() => {});
    }
  } catch(e){}
  try {
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
  } catch(e){}
}

window.addEventListener("popstate", () => {
  if (document.getElementById("detailModal").classList.contains("show")) {
    forceCloseModal();
  }
});

function renderEpisodes(){
  if (!currentContent) return;
  updateDownloadButton();
  const season = (currentContent.seasons || [])[currentSeasonIndex];
  const list = document.getElementById("episodeList");

  if (!season || !season.episodes || !season.episodes.length) {
    list.innerHTML = "<p style='color:#888;font-size:12px;'>No episodes available.</p>";
    return;
  }

  list.innerHTML = season.episodes.map((ep, idx) =>
    `<button class="ep-btn ${currentEpisode === ep ? "active" : ""}" onclick="playEpisode(${currentSeasonIndex},${idx})">${String(idx + 1).padStart(2, "0")}</button>`
  ).join("");
}

function buildServerUrl(content, seasonIndex, episodeIndex){
  if (!content || !content.tmdbId) return null;
  const tmdbId = String(content.tmdbId).trim();
  if (!/^\d+$/.test(tmdbId)) return null;

  const server = VIDEO_SERVERS.find(s => s.id === currentServerId) || VIDEO_SERVERS[0];
  const cat = (content.category || "").toLowerCase();
  
  if (cat.includes("movie")) {
    return server.movie(tmdbId);
  }

  const season = content.seasons && content.seasons[seasonIndex];
  const episode = season && season.episodes && season.episodes[episodeIndex];
  if (!season || !episode) return null;

  const sNum = season.number || (seasonIndex + 1);
  const eNum = episode.number || (episodeIndex + 1);
  return server.tv(tmdbId, sNum, eNum);
}

function playEpisode(seasonIndex, episodeIndex){
  if (!currentContent) return;

  if (isUpcoming(currentContent)) {
    showComingSoonPlayer();
    return;
  }

  const season = currentContent.seasons[seasonIndex];
  const episode = season && season.episodes ? season.episodes[episodeIndex] : null;
  currentEpisode = episode;

  const myToken = ++currentPlayToken;
  const container = document.getElementById("playerContainer");

  const sourceUrl = buildServerUrl(currentContent, seasonIndex, episodeIndex);

  if (!sourceUrl) {
    container.innerHTML = '<div class="player-placeholder">TMDB ID is required for this title.</div>';
    renderEpisodes();
    return;
  }

  if (!isValidEmbedUrl(sourceUrl)) {
    container.innerHTML = '<div class="player-placeholder">Invalid video URL.</div>';
    return;
  }

  preconnectToVideoDomain(sourceUrl);
  renderEpisodes();

  if (myToken === currentPlayToken) {
    loadVideoPlayer(container, sourceUrl, currentContent);
  }
}

function loadVideoPlayer(container, source, content){
  const bgImage = content.backdrop || content.poster || "";
  const bgStyle = bgImage ? `style="background-image: url('${escapeAttribute(bgImage)}');"` : "";

  container.innerHTML = `
    <div class="video-loader-overlay" id="videoLoaderOverlay" ${bgStyle}>
      <div class="video-loader-content">
        <div class="spinner"></div>
        <div class="video-loader-text">LOADING PLAYER...</div>
      </div>
    </div>
  `;

  const iframe = document.createElement("iframe");
  iframe.className = "video-frame";
  iframe.src = source;

  iframe.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media; orientation; gyroscope; accelerometer; clipboard-write";
  iframe.setAttribute("allowfullscreen", "true");
  iframe.setAttribute("webkitallowfullscreen", "true");
  iframe.setAttribute("mozallowfullscreen", "true");
  iframe.setAttribute("playsinline", "true");
  iframe.setAttribute("webkit-playsinline", "true");
  iframe.referrerPolicy = "strict-origin-when-cross-origin";

  const removeLoader = () => {
    const loader = document.getElementById("videoLoaderOverlay");
    if (loader) {
      loader.style.opacity = "0";
      setTimeout(() => loader.remove(), 300);
    }
  };

  iframe.addEventListener("load", removeLoader);
  setTimeout(removeLoader, 15000);
  container.appendChild(iframe);
}

function handleFullscreenChange(){
  const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
  try {
    if (isFullscreen) {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } else {
      if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    }
  } catch(e){}
}
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

/* ============================================================
   INFINITE SCROLL OBSERVER
   ============================================================ */
function setupInfiniteScroll() {
  const sentinel = document.getElementById("loadMoreSentinel");
  if (!sentinel) return;

  const observer = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    if (isLoading || currentPage > totalPages || allContent.length === 0) return;

    const searchPage = document.getElementById("searchPage");
    if (getComputedStyle(searchPage).display === "none") {
      loadHomeContent(currentCategory, true);
    }
  }, { rootMargin: "300px" });

  observer.observe(sentinel);
}

/* ============================================================
   DOWNLOADS (only for titles listed in downloads.json)
   Key format:  movie:<tmdbId>   |   tv:<tmdbId>:<season>:<episode>
   ============================================================ */
let downloadCatalog = {};

async function loadDownloadCatalog() {
  try {
    const res = await fetch('downloads.json', { cache: 'no-cache' });
    if (res.ok) downloadCatalog = await res.json();
  } catch (e) { downloadCatalog = {}; }
  updateDownloadButton();
}

function currentDownloadKey() {
  const c = currentContent;
  if (!c || !c.tmdbId) return null;
  if ((c.category || '').toLowerCase().includes('movie')) return `movie:${c.tmdbId}`;
  if (!currentEpisode) return null;
  const seasons = c.seasons || [];
  const si = seasons.findIndex(sn => (sn.episodes || []).includes(currentEpisode));
  if (si === -1) return null;
  const sn = seasons[si];
  const ei = sn.episodes.indexOf(currentEpisode);
  return `tv:${c.tmdbId}:${sn.number || si + 1}:${currentEpisode.number || ei + 1}`;
}

function updateDownloadButton() {
  const row = document.getElementById('downloadRow');
  if (!row) return;
  const key = currentDownloadKey();
  const entry = key && downloadCatalog[key];
  if (!entry || !entry.url) { row.style.display = 'none'; row.innerHTML = ''; return; }
  row.innerHTML = `<button class="dl-btn" onclick="startDownload('${escapeAttribute(key)}')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    Download${entry.size ? ` <small>${escapeHTML(entry.size)}</small>` : ''}</button>`;
  row.style.display = 'block';
}

function startDownload(key) {
  const entry = downloadCatalog[key];
  if (!entry || !entry.url) return;
  let url;
  try { url = new URL(entry.url, location.href); } catch (e) { return showToast('Invalid download link'); }
  if (url.protocol !== 'https:') return showToast('Download link must be https');
  if (url.hostname.endsWith('.blob.vercel-storage.com')) url.searchParams.set('download', '1');

  const ext = (url.pathname.match(/\.(mp4|mkv|webm|m4v|mov|zip)$/i) || ['', 'mp4'])[1];
  const label = (currentContent.title || 'SHANFLIX') + (key.startsWith('tv:') ? ' S' + key.split(':')[2].padStart(2,'0') + 'E' + key.split(':')[3].padStart(2,'0') : '');
  const filename = label.replace(/[\\/:*?"<>|]+/g, '').trim() + '.' + ext;

  if (window.ShanflixApp && typeof window.ShanflixApp.postMessage === 'function') {
    window.ShanflixApp.postMessage(JSON.stringify({ action: 'download', url: url.href, filename }));
    return;
  }
  const a = document.createElement('a');
  a.href = url.href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('Download started');
}

/* ============================================================
   AD-BLOCKER NOTICE
   ============================================================ */
function closeAdblockModal() {
  const m = document.getElementById('adblockModal');
  if (m) m.classList.remove('show');
  try { sessionStorage.setItem('adblockNoticeSeen', '1'); } catch (e) {}
  unlockBodyScrollSafe();
}
function unlockBodyScrollSafe() { try { if (!document.getElementById('detailModal').classList.contains('show')) document.body.style.overflow = ''; } catch (e) {} }

function showAdblockModal() {
  try { if (sessionStorage.getItem('adblockNoticeSeen')) return; } catch (e) {}
  if (!document.getElementById('bnFont')) {
    const l = document.createElement('link');
    l.id = 'bnFont'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&display=swap';
    document.head.appendChild(l);
  }
  document.getElementById('adblockModal').classList.add('show');
}

function detectAdblock() {
  if (/SHANFLIXApp/.test(navigator.userAgent)) return;
  if (/[?&]adblock=test/.test(location.search)) { try { sessionStorage.removeItem('adblockNoticeSeen'); } catch (e) {} showAdblockModal(); return; }

  const reasons = [];
  const baits = [];
  ['adsbox ad-banner adsbygoogle', 'ad-placement ad_unit advert banner_ad', 'google-ad sponsor textads'].forEach((cls, i) => {
    const d = document.createElement('div');
    d.className = cls + ' pub_300x250';
    if (i === 1) d.id = 'ad-banner';
    d.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:300px;height:250px;';
    d.innerHTML = '&nbsp;';
    document.body.appendChild(d);
    baits.push(d);
  });
  const baitCheck = new Promise(res => setTimeout(() => {
    baits.forEach(d => {
      const cs = getComputedStyle(d);
      if (!d.isConnected || d.offsetHeight === 0 || cs.display === 'none' || cs.visibility === 'hidden') reasons.push('bait');
      d.remove();
    });
    res();
  }, 500));

  const urls = [
    'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
    'https://googleads.g.doubleclick.net/pagead/id',
    'https://static.doubleclick.net/instream/ad_status.js'
  ];
  const netChecks = urls.map(u =>
    fetch(u, { method: 'GET', mode: 'no-cors', cache: 'no-store' }).catch(() => { reasons.push('net:' + u); })
  );

  Promise.all([baitCheck, ...netChecks]).then(() => {
    console.log('[SHANFLIX] adblock check:', reasons.length ? reasons : 'none detected');
    if (reasons.length) showAdblockModal();
  });
}

/* ============================================================
   PWA & INSTALL LOGIC
   ============================================================ */
let deferredInstallPrompt = null;

function setupPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(() => console.log('[SHANFLIX] SW registered'))
        .catch(err => console.log('[SHANFLIX] SW not registered:', err.message));
    });
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone || /SHANFLIXApp/.test(navigator.userAgent);
  
  if (isStandalone) {
    const btn = document.getElementById('installBtn');
    if (btn) btn.style.display = 'none';
    const fab = document.getElementById('floatingDownloadBtn');
    if (fab) fab.style.display = 'none';
  } else {
    if (isIOS) {
      document.getElementById('iosInstructions').style.display = 'block';
    } else {
      document.getElementById('androidInstructions').style.display = 'block';
    }
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  showToast('SHANFLIX installed! 🎉');
  const btn = document.getElementById('installBtn');
  if (btn) btn.style.display = 'none';
  const fab = document.getElementById('floatingDownloadBtn');
  if (fab) fab.style.display = 'none';
});

function promptInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then((choice) => {
      if (choice.outcome === 'accepted') {
        showToast('Installing SHANFLIX...');
      }
      deferredInstallPrompt = null;
    });
    return;
  }
  document.getElementById('installModal').classList.add('show');
}

function closeInstallModal() {
  document.getElementById('installModal').classList.remove('show');
}

/* ============================================================
   BOOT
   ============================================================ */
function boot(){
  renderPlatforms();
  populateServerDropdown();
  setupPWA();
  loadDownloadCatalog();
  detectAdblock();

  window.addEventListener("scroll", () => {
    document.getElementById("mainHeader").classList.toggle("scrolled", window.scrollY > 40);
  }, { passive: true });

  window.addEventListener("beforeunload", (e) => {
    const modal = document.getElementById("detailModal");
    if (modal && modal.classList.contains("show")) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  setupInfiniteScroll();
  loadHomeContent('All', false);
}
boot();

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeModal();
    closeInstallModal();
    closeAdblockModal();
  }
});
