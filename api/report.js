// Collects broken-link reports and client errors. Output appears in Vercel → Project → Logs.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    if (raw.length > 2000) { res.status(413).end(); return; }
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const clean = v => String(v == null ? '' : v).slice(0, 200);
    console.log('[SHANFLIX-REPORT]', JSON.stringify({
      kind: clean(b.kind), id: clean(b.id), title: clean(b.title), s: clean(b.s), e: clean(b.e),
      server: clean(b.server), msg: clean(b.msg), ua: clean(req.headers['user-agent']), t: new Date().toISOString()
    }));
  } catch (e) { /* ignore malformed */ }
  res.status(204).end();
};
