/* Pure data helpers shared by the UI and Node checks. */
(function (root) {
  function number(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\d{1,3}(?:,\d{3})+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
    const result = Number(text.replaceAll(',', ''));
    return Number.isFinite(result) ? result : null;
  }
  function text(value) { return value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value); }
  function blank(value) { return value == null || value === ''; }
  function date(value) {
    if (typeof value !== 'string') return null;
    const iso = value.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    const us = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!iso && !us) return null;
    const [year, month, day] = iso ? iso.slice(1).map(Number) : [Number(us[3]), Number(us[1]), Number(us[2])];
    const result = new Date(Date.UTC(year, month - 1, day));
    return result.getUTCFullYear() === year && result.getUTCMonth() === month - 1 && result.getUTCDate() === day ? result.getTime() : null;
  }
  function sortRows(rows, index, direction) {
    if (!direction) return rows.slice();
    const values = rows.map(row => row.values[index]).filter(value => !blank(value));
    const parse = values.length && values.every(value => number(value) !== null) ? number : values.length && values.every(value => date(value) !== null) ? date : null;
    return rows.map((row, position) => ({row, position})).sort((a, b) => {
      const x = a.row.values[index], y = b.row.values[index];
      if (blank(x) || blank(y)) return blank(x) === blank(y) ? a.position - b.position : blank(x) ? 1 : -1;
      const order = parse ? parse(x) - parse(y) : text(x).localeCompare(text(y), 'ko', {numeric: true});
      return order * direction || a.position - b.position;
    }).map(item => item.row);
  }
  function aggregate(rows, group, metric, operation) {
    const groups = new Map();
    for (const row of rows) {
      const key = text(row[group]);
      if (!groups.has(key)) groups.set(key, {key, rows: 0, values: []});
      const item = groups.get(key); item.rows++;
      const value = number(row[metric]);
      if (value !== null) item.values.push(value);
    }
    return [...groups.values()].map(item => {
      const values = item.values;
      let value = null;
      if (values.length) {
        if (operation === 'min') value = values.reduce((a, b) => Math.min(a, b));
        else if (operation === 'max') value = values.reduce((a, b) => Math.max(a, b));
        else { value = values.reduce((a, b) => a + b, 0); if (operation === 'mean') value /= values.length; }
      }
      return {...item, value, valid: values.length};
    });
  }
  function profile(columns, rows) {
    const info = columns.map((name, index) => {
      const values = rows.map(row => row[index]).filter(value => !blank(value));
      const numeric = values.length > 0 && values.every(value => number(value) !== null);
      const dates = values.length > 0 && values.every(value => date(value) !== null);
      return {name, index, numeric, dates, distinct: new Set(values.map(text)).size};
    });
    const dateColumn = info.find(item => item.dates)?.index ?? -1;
    const categories = info.filter(item => !item.numeric && !item.dates && item.distinct > 0);
    const preferred = categories.find(item => /^(회사|회사명|광고주|광고주명|company|advertiser)$/i.test(item.name.trim()));
    const category = preferred || categories.find(item => item.distinct > 1 && item.distinct < rows.length) || categories[0];
    return {info, dateColumn, groupColumn: category?.index ?? 0, numeric: info.filter(item => item.numeric).map(item => item.index)};
  }
  function compareGroups(rows, group, settings) {
    const keys = [...new Set(rows.map(row => text(row[group])))];
    const metrics = settings.map(setting => new Map(aggregate(rows, group, setting.index, setting.operation).map(item => [item.key, item.value])));
    return keys.map(key => ({key, values: metrics.map(metric => metric.get(key) ?? null)}));
  }
  function timeSeries(rows, dateColumn, group, metric, operation, keys = null) {
    const dated = rows.filter(row => date(row[dateColumn]) !== null);
    const days = [...new Set(dated.map(row => date(row[dateColumn])))].sort((a, b) => a - b);
    const selected = keys || [null];
    const buckets = new Map(selected.map(key => [key, new Map()]));
    dated.forEach(row => {
      const key = keys ? text(row[group]) : null;
      if (!buckets.has(key)) return;
      const day = date(row[dateColumn]);
      const daily = buckets.get(key);
      if (!daily.has(day)) daily.set(day, []);
      daily.get(day).push(row);
    });
    return selected.map(key => ({key, points: days.map(day => ({day, value: aggregate(buckets.get(key).get(day) || [], -1, metric, operation)[0]?.value ?? null}))}));
  }
  function niceScale(values) {
    const finite = values.filter(Number.isFinite);
    let low = finite.reduce((min, value) => Math.min(min, value), 0), high = finite.reduce((max, value) => Math.max(max, value), 0);
    if (low === high) high = low + 1;
    const raw = (high - low) / 4;
    const power = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].find(value => value * power >= raw) * power;
    low = Math.floor(low / step) * step; high = Math.ceil(high / step) * step;
    const ticks = [];
    for (let i = 0; i <= Math.round((high - low) / step); i++) ticks.push(Number((low + i * step).toPrecision(12)));
    return {low, high, ticks};
  }
  function displayNumber(value, reference = 0) {
    if (value === null || !Number.isFinite(value)) return '—';
    const magnitude = Math.abs(reference);
    const [divisor, suffix] = magnitude >= 1e8 ? [1e8, '억'] : magnitude >= 1e4 ? [1e4, '만'] : [1, ''];
    if (value === 0) return '0';
    const scaled = value / divisor;
    const options = Math.abs(scaled) < .01 ? {maximumSignificantDigits: 3} : {maximumFractionDigits: 2};
    return scaled.toLocaleString('ko-KR', options) + suffix;
  }
  function dateTicks(days) {
    const sorted = [...new Set(days)].sort((a, b) => a - b);
    if (sorted.length <= 4) return sorted;
    return Array.from({length: 4}, (_, index) => sorted[Math.round(index * (sorted.length - 1) / 3)]);
  }
  const api = {number, text, date, profile, sortRows, aggregate, compareGroups, timeSeries, niceScale, displayNumber, dateTicks};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AdSightData = api;
})(globalThis);
