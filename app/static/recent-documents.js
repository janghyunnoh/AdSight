/* Browser-local document shortcuts. No credentials or cell data are stored. */
(function (root) {
  const KEY = 'adsight.recent-documents.v1';
  const LIMIT = 5;
  function normalizeSource(source) {
    if (typeof source !== 'string') return null;
    source = source.trim();
    if (/^[A-Za-z0-9]{10,128}$/.test(source)) return {source, key: 'sheets:' + source};
    try {
      const url = new URL(source);
      if (url.protocol !== 'https:' || !['larksuite.com', 'feishu.cn'].some(host => url.hostname === host || url.hostname.endsWith('.' + host))) return null;
      const match = url.pathname.match(/^\/(sheets|wiki)\/([A-Za-z0-9]{10,128})\/*$/);
      if (!match) return null;
      return {source: url.origin + '/' + match[1] + '/' + match[2], key: match[1] + ':' + match[2]};
    } catch { return null; }
  }
  function clean(entries) {
    const seen = new Set();
    return (Array.isArray(entries) ? entries : []).filter(entry => {
      const parsed = entry && normalizeSource(entry.source);
      if (!parsed || typeof entry.title !== 'string' || !entry.title.trim() || seen.has(parsed.key)) return false;
      seen.add(parsed.key); return true;
    }).slice(0, LIMIT).map(entry => ({source: normalizeSource(entry.source).source, title: entry.title.slice(0, 500)}));
  }
  function read(storage) {
    try { return clean(JSON.parse(storage.getItem(KEY) || '[]')); } catch { return []; }
  }
  function remember(entries, source, title) {
    const parsed = normalizeSource(source);
    if (!parsed) return clean(entries);
    return clean([{source: parsed.source, title}, ...clean(entries).filter(entry => normalizeSource(entry.source).key !== parsed.key)]);
  }
  function write(storage, entries) {
    try { storage.setItem(KEY, JSON.stringify(clean(entries))); return true; } catch { return false; }
  }
  function clear(storage) { try { storage.removeItem(KEY); return true; } catch { return false; } }
  // Test phase: do not restore previous AI interpretations or column settings.
  function resetTestHistory(storage) {
    try {
      const keys=Array.from({length:storage.length},(_,i)=>storage.key(i));
      for(const key of keys)if(['adsight.column-settings.v1:','adsight.interpretation.v1:','adsight.column-review.v1:'].some(prefix=>key?.startsWith(prefix)))storage.removeItem(key);
    }catch{}
  }
  const api = {resetTestHistory, read, remember, write, clear, normalizeSource, KEY};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AdSightRecent = api;
})(globalThis);
