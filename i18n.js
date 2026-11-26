/* ============================================================
   Bengali / English UI toggle.
   Translates exact UI strings (including ones added later) by watching the DOM.
   Movie titles, descriptions and cast names are never touched.
   ============================================================ */
(function () {
  'use strict';
  const BN = {
    'Explore Content': 'কনটেন্ট দেখুন', 'SHANFLIX ORIGINAL EXPERIENCE': 'শানফ্লিক্স অরিজিনাল অভিজ্ঞতা',
    'All': 'সব', 'Movies': 'মুভি', 'Movie': 'মুভি', 'TV Series': 'টিভি সিরিজ', 'TV': 'টিভি', 'Drama': 'ড্রামা', 'Anime': 'অ্যানিমে',
    'Continue Watching': 'দেখা চালিয়ে যান', 'My List': 'আমার তালিকা', '＋ My List': '＋ আমার তালিকা', '✓ In My List': '✓ তালিকায় আছে',
    'Trending Today': 'আজকের ট্রেন্ডিং', 'Top Rated Movies': 'সেরা রেটিংয়ের মুভি', 'Top Rated Series': 'সেরা রেটিংয়ের সিরিজ',
    'Cast': 'অভিনেতা-অভিনেত্রী', 'More Like This': 'আরও এরকম', 'RESOURCES': 'রিসোর্স', 'Info': 'তথ্য', 'ⓘ Info': 'ⓘ তথ্য',
    'Loading more from TMDB...': 'আরও লোড হচ্ছে…', 'No results found': 'কিছু পাওয়া যায়নি',
    "We couldn't find anything matching your search. Try different keywords.": 'আপনার সার্চের সাথে মিলে এমন কিছু পাওয়া যায়নি। অন্য শব্দ দিয়ে চেষ্টা করুন।',
    'Search failed': 'সার্চ ব্যর্থ হয়েছে', 'Install App': 'অ্যাপ ইনস্টল করুন', 'Got it': 'বুঝেছি',
    'Reset': 'রিসেট', 'All types': 'সব ধরন', 'Any genre': 'যেকোনো জনরা', 'Any year': 'যেকোনো বছর',
    'Any language': 'যেকোনো ভাষা', 'Any rating': 'যেকোনো রেটিং', 'No matches': 'কিছু মেলেনি',
    'Nothing fits those filters. Try loosening them.': 'এই ফিল্টারে কিছু মেলেনি। ফিল্টার কমিয়ে দেখুন।',
    'Recent searches': 'সাম্প্রতিক সার্চ', 'Clear': 'মুছুন',
    'Action': 'অ্যাকশন', 'Adventure': 'অ্যাডভেঞ্চার', 'Animation': 'অ্যানিমেশন', 'Comedy': 'কমেডি', 'Crime': 'ক্রাইম',
    'Documentary': 'ডকুমেন্টারি', 'Family': 'ফ্যামিলি', 'Fantasy': 'ফ্যান্টাসি', 'Horror': 'হরর', 'Mystery': 'মিস্ট্রি',
    'Romance': 'রোম্যান্স', 'Sci-Fi': 'সায়েন্স ফিকশন', 'Thriller': 'থ্রিলার', 'War': 'যুদ্ধ',
    'Download': 'ডাউনলোড', 'Reload player': 'প্লেয়ার রিলোড', 'Try another server': 'অন্য সার্ভার চেষ্টা করুন',
    'Report problem': 'সমস্যা জানান', '⚠ Video not working? Report': '⚠ ভিডিও চলছে না? জানান',
    "This video isn't playing": 'ভিডিওটি চলছে না', "You're offline": 'আপনি অফলাইনে আছেন',
    "Couldn't load content": 'কনটেন্ট লোড হয়নি', 'Try again': 'আবার চেষ্টা করুন',
    'Added to My List': 'আমার তালিকায় যোগ হয়েছে', 'Removed from My List': 'আমার তালিকা থেকে সরানো হয়েছে',
    'Next episode…': 'পরের এপিসোড…', 'Next season…': 'পরের সিজন…', 'Download started': 'ডাউনলোড শুরু হয়েছে',
    'Back online': 'ইন্টারনেট ফিরেছে', 'Thanks — reported. We will check it.': 'ধন্যবাদ — জানানো হয়েছে। আমরা দেখব।',
    'NEW EP': 'নতুন এপি', 'Privacy': 'গোপনীয়তা', 'DMCA / Contact': 'DMCA / যোগাযোগ', 'Sign in': 'সাইন ইন',
    'Released': 'রিলিজ হয়েছে', 'RELEASED': 'রিলিজ হয়েছে', 'COMING SOON': 'শীঘ্রই আসছে', 'Cast ': 'অভিনেতা-অভিনেত্রী'
  };
  const PATTERNS = [
    [/^Season (\d+)$/, 'সিজন $1'],
    [/^Server (\d+)$/, 'সার্ভার $1'],
    [/^(\d+) Seasons? · (\d+) Episodes$/, '$1 সিজন · $2 এপিসোড'],
    [/^Trying Server (\d+)…$/, 'সার্ভার $1 চেষ্টা করছি…'],
    [/^Because you watched (.+)$/, '"$1" দেখেছেন বলে'],
    [/^New episode: (.+)$/, 'নতুন এপিসোড: $1'],
    [/^Search Results for: (.+)$/, 'সার্চ ফলাফল: $1'],
    [/^Before (\d{4})$/, '$1-এর আগে']
  ];

  let lang = 'en';
  try { lang = localStorage.getItem('sf_lang') || 'en'; } catch (e) {}
  const orig = new WeakMap();   // text node -> original English
  const setTo = new WeakMap();  // text node -> translated value we wrote

  function translate(str) {
    if (BN[str]) return BN[str];
    for (const [re, rep] of PATTERNS) if (re.test(str)) return str.replace(re, rep);
    return null;
  }

  function trNode(n) {
    if (setTo.get(n) === n.data) return;          // our own write
    const src = n.data;
    const t = src.trim();
    if (!t) return;
    const out = translate(t);
    if (!out) { orig.delete(n); return; }
    orig.set(n, src);
    const lead = src.slice(0, src.length - src.trimStart().length);
    const trail = src.slice(src.trimEnd().length);
    const val = lead + out + trail;
    setTo.set(n, val);
    n.data = val;
  }

  function walk(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => /^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.parentNode && n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    const nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    return nodes;
  }

  function applyAll() {
    walk(document.body).forEach(trNode);
    const si = document.getElementById('searchInput');
    if (si) {
      if (!si.dataset.enPh) si.dataset.enPh = si.placeholder;
      si.placeholder = 'টাইটেল সার্চ করুন...';
    }
  }
  function restoreAll() {
    walk(document.body).forEach(n => {
      if (orig.has(n)) { n.data = orig.get(n); orig.delete(n); setTo.delete(n); }
    });
    const si = document.getElementById('searchInput');
    if (si && si.dataset.enPh) si.placeholder = si.dataset.enPh;
  }

  const mo = new MutationObserver(muts => {
    if (lang !== 'bn') return;
    for (const m of muts) {
      if (m.type === 'characterData') { if (m.target.nodeType === 3) trNode(m.target); }
      else m.addedNodes.forEach(n => {
        if (n.nodeType === 3) trNode(n);
        else if (n.nodeType === 1 && !/^(SCRIPT|STYLE)$/.test(n.nodeName)) walk(n).forEach(trNode);
      });
    }
  });

  function setLang(l) {
    lang = l;
    try { localStorage.setItem('sf_lang', l); } catch (e) {}
    document.documentElement.lang = l === 'bn' ? 'bn' : 'en';
    if (l === 'bn') applyAll(); else restoreAll();
    btn.textContent = l === 'bn' ? 'EN' : 'বাং';
    btn.title = l === 'bn' ? 'Switch to English' : 'বাংলায় দেখুন';
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sf-acc';
  btn.style.minWidth = '44px';
  btn.onclick = () => setLang(lang === 'bn' ? 'en' : 'bn');

  function init() {
    const hr = document.querySelector('.header-right');
    if (hr) hr.insertBefore(btn, hr.firstChild);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    setLang(lang);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
