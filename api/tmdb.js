// Vercel serverless proxy for TMDB. The token lives in the TMDB_TOKEN environment variable,
// so it never reaches the browser. Only whitelisted read-only endpoints are forwarded.
const ALLOWED = [
  /^\/discover\/(movie|tv)$/,
  /^\/search\/(multi|movie|tv)$/,
  /^\/trending\/(all|movie|tv)\/(day|week)$/,
  /^\/(movie|tv)\/(popular|top_rated|now_playing|on_the_air)$/,
  /^\/(movie|tv)\/\d{1,9}(\/(recommendations|similar))?$/
];

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const token = process.env.TMDB_TOKEN;
  if (!token) { res.status(500).json({ error: 'TMDB_TOKEN not configured' }); return; }

  const q = req.query || {};
  const path = String(q.path || '');
  if (!ALLOWED.some(r => r.test(path))) { res.status(400).json({ error: 'bad_path' }); return; }

  const url = new URL('https://api.themoviedb.org/3' + path);
  for (const [k, v] of Object.entries(q)) {
    if (k === 'path' || k === 'api_key') continue;
    if (typeof v === 'string' && v.length < 200) url.searchParams.set(k, v);
  }

  try {
    const r = await fetch(url, { headers: { accept: 'application/json', Authorization: `Bearer ${token}` } });
    const body = await r.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', r.ok ? 'public, s-maxage=300, stale-while-revalidate=600' : 'no-store');
    res.status(r.status).send(body);
  } catch (e) {
    res.status(502).json({ error: 'upstream_failed' });
  }
};
