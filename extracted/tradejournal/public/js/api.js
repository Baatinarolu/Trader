/* api.js — thin fetch wrapper + auth helpers */
(function (global) {
  'use strict';
  /** localStorage can throw in sandboxed iframes or private mode — never let that break the app. */
  const LS = {
    get(k) { try { return global.localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { global.localStorage.setItem(k, v); } catch {} },
    del(k) { try { global.localStorage.removeItem(k); } catch {} },
  };
  let token = LS.get('tj_token') || null;

  async function req(path, { method = 'GET', body, raw } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['x-session'] = token;
    const res = await fetch('/api' + path, {
      method, headers, credentials: 'same-origin',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) {
      const err = new Error(data.error || ('Request failed (' + res.status + ')'));
      err.status = res.status; err.data = data;
      if (res.status === 401) { token = null; LS.del('tj_token'); }
      throw err;
    }
    if (raw) return res;
    return data;
  }

  const qs = (params) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) if (v !== null && v !== undefined && v !== '') p.set(k, v);
    const s = p.toString();
    return s ? '?' + s : '';
  };

  global.API = {
    get: (p, params) => req(p + qs(params)),
    post: (p, body) => req(p, { method: 'POST', body: body || {} }),
    put: (p, body) => req(p, { method: 'PUT', body: body || {} }),
    del: (p) => req(p, { method: 'DELETE' }),
    async login(email, password) { const d = await req('/auth/login', { method: 'POST', body: { email, password } }); if (d.token) { token = d.token; LS.set('tj_token', token); } return d; },
    async register(payload) { const d = await req('/auth/register', { method: 'POST', body: payload }); if (d.token) { token = d.token; LS.set('tj_token', token); } return d; },
    /** Connect this browser to a workspace — the app has no sign-in wall. */
    async local(fresh) {
      const d = await req('/auth/local' + (fresh ? '?fresh=1' : ''), { method: 'POST', body: {} });
      if (d.token) { token = d.token; LS.set('tj_token', token); }
      return d;
    },
    /* ---------------------------------------------------------- workspaces
     * No accounts, no login: this browser keeps two slots — the workspace it is in
     * and the one it came from — so switching back and forth needs zero credentials.
     */
    setWorkspaceName(name) { if (name) LS.set('tj_workspace_name', String(name)); },
    workspaceName() { return LS.get('tj_workspace_name') || 'this workspace'; },
    /** Remember the workspace we are leaving (token + label). */
    stashWorkspace(name) {
      const cur = LS.get('tj_token');
      if (!cur) return;
      LS.set('tj_prev_session', cur);
      LS.set('tj_prev_name', name || this.workspaceName());
    },
    previousWorkspace() {
      const t = LS.get('tj_prev_session');
      return t ? { token: t, name: LS.get('tj_prev_name') || 'the previous workspace' } : null;
    },
    /** Adopt a stored token, but only if the server still recognises it. */
    async openWorkspace(t) {
      const old = token;
      token = t;
      try {
        const me = await req('/auth/me');
        if (!me.authenticated) throw new Error('That workspace is no longer available in this browser');
        LS.set('tj_token', t);
        return true;
      } catch (e) { token = old; throw e; }
    },
    async demo() { const d = await req('/auth/demo', { method: 'POST', body: {} }); if (d.token) { token = d.token; LS.set('tj_token', token); } return d; },
    async logout() { try { await req('/auth/logout', { method: 'POST', body: {} }); } catch {} token = null; LS.del('tj_token'); },
    me: () => req('/auth/me'),
    getToken: () => token,
    setToken: (t) => { token = t; if (t) LS.set('tj_token', t); },
    hasToken: () => !!token,
    /** Download an export endpoint as a file (session token sent via header). */
    async download(path, filename) {
      const res = await fetch('/api' + path, { headers: token ? { 'x-session': token } : {} });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
  };
})(window);
