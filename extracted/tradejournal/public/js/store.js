/* store.js — app state, filters, cached fetches, formatting for trade rows */
(function (global) {
  'use strict';
  const LS = {
    get(k) { try { return global.localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { global.localStorage.setItem(k, v); } catch {} },
  };
  const S = {
    user: null,
    accounts: [],
    strategies: [],
    instruments: [],
    classLabels: {}, unitLabels: {},
    accountId: Number(LS.get('tj_account') || 0) || null,
    filters: { from: null, to: null, symbol: '', strategy_id: '', status: 'all', q: '', tag: '' },
    route: 'dashboard',
    cache: {},
    booted: false,
  };

  S.account = () => S.accounts.find((a) => a.id === Number(S.accountId)) || S.accounts[0] || null;
  S.strategyById = (id) => S.strategies.find((x) => x.id === Number(id));
  S.instrumentBy = (sym) => S.instruments.find((i) => i.symbol === String(sym).toUpperCase());
  S.setAccount = (id) => { S.accountId = Number(id); LS.set('tj_account', String(id)); };

  S.queryParams = () => ({
    account_id: S.accountId || undefined,
    from: S.filters.from || undefined,
    to: S.filters.to || undefined,
    symbol: S.filters.symbol || undefined,
    strategy_id: S.filters.strategy_id || undefined,
    status: S.filters.status && S.filters.status !== 'all' ? S.filters.status : undefined,
    q: S.filters.q || undefined,
    tag: S.filters.tag || undefined,
  });

  S.activeFilterCount = () => ['from', 'to', 'symbol', 'strategy_id', 'q', 'tag'].filter((k) => S.filters[k]).length + (S.filters.status && S.filters.status !== 'all' ? 1 : 0);

  S.resetFilters = () => { S.filters = { from: null, to: null, symbol: '', strategy_id: '', status: 'all', q: '', tag: '' }; };

  S.load = async function (force) {
    if (S.booted && !force) return;
    const b = await API.get('/bootstrap');
    S.user = b.user; S.accounts = b.accounts; S.strategies = b.strategies; S.instruments = b.instruments;
    S.classLabels = b.meta.class_labels; S.unitLabels = b.meta.unit_labels; S.stats = b.stats;
    if (!S.accountId || !S.accounts.some((a) => a.id === Number(S.accountId))) S.accountId = S.accounts[0] ? S.accounts[0].id : null;
    S.booted = true;
  };

  /** Cached GET — used by dashboard/analytics so tab switches feel instant. */
  S.fetch = async function (path, params, ttl = 20000) {
    const key = path + JSON.stringify(params || {});
    const hit = S.cache[key];
    if (hit && Date.now() - hit.at < ttl) return hit.data;
    const data = await API.get(path, params);
    S.cache[key] = { data, at: Date.now() };
    return data;
  };
  S.invalidate = () => { S.cache = {}; };

  /* presets for date filters */
  S.presets = {
    '7d': () => ({ from: isoDaysAgo(6), to: isoToday() }),
    '30d': () => ({ from: isoDaysAgo(29), to: isoToday() }),
    '90d': () => ({ from: isoDaysAgo(89), to: isoToday() }),
    'ytd': () => ({ from: new Date().getFullYear() + '-01-01', to: isoToday() }),
    'all': () => ({ from: null, to: null }),
    'month': () => { const d = new Date(); return { from: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10), to: isoToday() }; },
    'mtd': () => { const d = new Date(); return { from: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10), to: isoToday() }; },
  };
  function isoDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
  function isoToday() { return new Date().toISOString().slice(0, 10); }
  S.isoToday = isoToday; S.isoDaysAgo = isoDaysAgo;

  /* --------------------------------------------------------- trade helpers */
  S.dirClass = (t) => (String(t.direction).toLowerCase() === 'short' ? 'chip neg' : 'chip pos');
  S.rClass = (v) => (v > 0.05 ? 'pos' : v < -0.05 ? 'neg' : 'muted');

  S.tagList = (t) => String(t.tags || '').split(',').map((x) => x.trim()).filter(Boolean);
  S.mistakeList = (t) => String(t.mistakes || '').split(',').map((x) => x.trim()).filter(Boolean);

  /** Full label for an instrument: "EURUSD · Forex · lots". */
  S.instLabel = (t) => {
    const i = S.instrumentBy(t.symbol);
    if (!i) return t.symbol;
    return `${t.symbol} · ${S.classLabels[i.asset_class] || i.asset_class}`;
  };

  S.reloadAll = async function () { S.invalidate(); await S.load(true); };

  global.Store = S;
})(window);
