/* ============================================================
   Optional cloud sync via Supabase (email code sign-in).
   Syncs: My List, Continue Watching, recent searches.
   Inactive until config.js has supabaseUrl + supabaseAnonKey.
   ============================================================ */
(function () {
  'use strict';
  const cfg = window.SHANFLIX_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

  const KEYS = ['sf_list', 'sf_progress', 'sf_recent'];
  const $ = s => document.querySelector(s);
  const get = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const toast = m => { try { showToast(m); } catch (e) {} };

  let sb = null, user = null, pushTimer = null, applying = false;

  function localData() { const d = {}; KEYS.forEach(k => (d[k] = get(k, k === 'sf_progress' ? {} : []))); return d; }

  function unionById(a, b) {
    const seen = new Set(), out = [];
    [...a, ...b].forEach(x => { if (x && !seen.has(x.id)) { seen.add(x.id); out.push(x); } });
    return out;
  }
  function mergeData(local, remote) {
    const prog = Object.assign({}, remote.sf_progress || {});
    Object.entries(local.sf_progress || {}).forEach(([id, v]) => { if (!prog[id] || v.t > prog[id].t) prog[id] = v; });
    const rec = [...(local.sf_recent || []), ...(remote.sf_recent || [])].filter((q, i, a) => a.findIndex(x => x.toLowerCase() === q.toLowerCase()) === i).slice(0, 8);
    return { sf_list: unionById(local.sf_list || [], remote.sf_list || []), sf_progress: prog, sf_recent: rec };
  }
  function applyLocal(d, ts) {
    applying = true;
    KEYS.forEach(k => set(k, d[k]));
    set('sf_updated', ts);
    set('sf_synced_at', ts);
    applying = false;
    document.dispatchEvent(new Event('sf:reload'));
  }

  async function push() {
    if (!sb || !user) return;
    const ts = get('sf_updated', Date.now());
    const { error } = await sb.from('user_data').upsert({ user_id: user.id, data: localData(), updated_at: ts });
    if (!error) set('sf_synced_at', ts);
  }

  async function pull() {
    if (!sb || !user) return;
    const { data: row, error } = await sb.from('user_data').select('data,updated_at').eq('user_id', user.id).maybeSingle();
    if (error) return;
    const localTs = get('sf_updated', 0), syncedAt = get('sf_synced_at', 0);
    if (!row) { await push(); return; }
    if (!syncedAt) { // first sign-in on this device: merge both sides
      const merged = mergeData(localData(), row.data || {});
      applyLocal(merged, Date.now());
      await push();
    } else if (row.updated_at > localTs) {
      applyLocal(Object.assign(localData(), row.data || {}), row.updated_at);
    } else if (localTs > row.updated_at) {
      await push();
    }
  }

  document.addEventListener('sf:changed', () => {
    if (applying || !user) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 2000);
  });

  /* ---------- UI ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .sf-acc{height:36px;padding:0 14px;border-radius:18px;font-size:13px;font-weight:700;color:#fff;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);cursor:pointer;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis}
  .sf-acc:hover{background:#2563eb}
  .sf-auth{position:fixed;inset:0;z-index:100001;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(2,4,8,.8)}
  .sf-auth.show{display:flex}
  .sf-auth-box{width:100%;max-width:380px;background:#0f172a;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:24px;color:#fff;text-align:center}
  .sf-auth-box h3{font-size:20px;margin-bottom:8px}
  .sf-auth-box p{font-size:14px;color:#94a3b8;margin-bottom:16px;line-height:1.5}
  .sf-auth-box input{width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:15px;margin-bottom:12px}
  .sf-auth-box button{width:100%;padding:12px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:8px}
  .sf-auth-box button.ghost{background:transparent;border:1px solid rgba(255,255,255,.18);color:#94a3b8}`;
  document.head.appendChild(css);

  const modal = document.createElement('div');
  modal.className = 'sf-auth';
  modal.innerHTML = '<div class="sf-auth-box" id="sfAuthBox"></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });

  const btn = document.createElement('button');
  btn.className = 'sf-acc';
  btn.type = 'button';
  const hr = document.querySelector('.header-right');
  if (hr) hr.insertBefore(btn, hr.firstChild);

  function renderBtn() { btn.textContent = user ? (user.email || 'Account') : 'Sign in'; }
  const box = () => $('#sfAuthBox');

  function showEmail() {
    box().innerHTML = `<h3>Sync across devices</h3><p>Enter your email. We'll send a 6-digit code to sign you in. Your My List and Continue Watching will follow you everywhere.</p>
      <input id="sfEmail" type="email" placeholder="you@example.com" autocomplete="email">
      <button id="sfSend">Send code</button><button class="ghost" id="sfCancel">Cancel</button>`;
    $('#sfCancel').onclick = () => modal.classList.remove('show');
    $('#sfSend').onclick = async () => {
      const email = $('#sfEmail').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Enter a valid email');
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) return toast(error.message);
      showCode(email);
    };
  }
  function showCode(email) {
    box().innerHTML = `<h3>Enter your code</h3><p>We sent a code to <b>${email.replace(/[<>&]/g, '')}</b>.</p>
      <input id="sfCode" inputmode="numeric" maxlength="8" placeholder="123456" autocomplete="one-time-code">
      <button id="sfVerify">Verify</button><button class="ghost" id="sfBack">Back</button>`;
    $('#sfBack').onclick = showEmail;
    $('#sfVerify').onclick = async () => {
      const { error } = await sb.auth.verifyOtp({ email, token: $('#sfCode').value.trim(), type: 'email' });
      if (error) return toast(error.message);
      modal.classList.remove('show');
      toast('Signed in');
    };
  }
  function showAccount() {
    box().innerHTML = `<h3>Signed in</h3><p>${(user.email || '').replace(/[<>&]/g, '')}<br>Your list and progress are syncing.</p>
      <button id="sfSyncNow">Sync now</button><button class="ghost" id="sfOut">Sign out</button><button class="ghost" id="sfClose">Close</button>`;
    $('#sfClose').onclick = () => modal.classList.remove('show');
    $('#sfSyncNow').onclick = async () => { await pull(); toast('Synced'); };
    $('#sfOut').onclick = async () => { await sb.auth.signOut(); set('sf_synced_at', 0); modal.classList.remove('show'); };
  }
  btn.onclick = () => { (user ? showAccount : showEmail)(); modal.classList.add('show'); };
  renderBtn();

  /* ---------- load Supabase client ---------- */
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  s.onload = async () => {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await sb.auth.getSession();
    user = data.session ? data.session.user : null;
    renderBtn();
    if (user) pull();
    sb.auth.onAuthStateChange((ev, session) => {
      const was = !!user;
      user = session ? session.user : null;
      renderBtn();
      if (user && !was) pull();
    });
  };
  document.head.appendChild(s);
})();
