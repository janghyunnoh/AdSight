/* Pure data helpers shared by the UI and Node checks. */
(function (root) {
  function parsedNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? {value, unit: ''} : null;
    if (typeof value !== 'string') return null;
    let source = value.trim();
    const negative = source.startsWith('(') && source.endsWith(')');
    if (negative) source = source.slice(1, -1).trim();
    const currencies = {'$':'USD', '₩':'KRW', '￦':'KRW', '€':'EUR', '£':'GBP', '¥':'JPY', '원':'KRW'};
    const unitName = text => currencies[text] || text.toUpperCase();
    const marker = /^(USD|KRW|EUR|GBP|JPY|CNY|[$₩￦€£¥])\s*/i;
    const suffix = /\s*(USD|KRW|EUR|GBP|JPY|CNY|원|[$₩￦€£¥])$/i;
    let sign = '';
    if (/^[+-]/.test(source)) {sign = source[0]; source = source.slice(1).trim();}
    const prefix = source.match(marker); let unit = '';
    if (prefix) {unit = unitName(prefix[1]); source = source.slice(prefix[0].length).trim();}
    const tail = source.match(suffix);
    if (tail) {
      const next = unitName(tail[1]); if (unit && unit !== next) return null;
      unit = next; source = source.slice(0, -tail[0].length).trim();
    }
    if (source.endsWith('%')) {if (unit) return null; unit = '%'; source = source.slice(0,-1).trim();}
    if (negative && (sign || /^[+-]/.test(source))) return null;
    if (sign && /^[+-]/.test(source)) return null;
    source = sign + source;
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\d{1,3}(?:,\d{3})+(?:\.\d*)?|\.\d+)$/.test(source)) return null;
    let result = Number(source.replaceAll(',', ''));
    if (negative) result = -result;
    if (unit === '%') result /= 100;
    return Number.isFinite(result) ? {value: result, unit} : null;
  }
  function number(value) {return parsedNumber(value)?.value ?? null;}
  function metricType(rows, index, name = '') {
    const parsed = rows.map(row => parsedNumber(row[index])).filter(Boolean);
    const units = [...new Set(parsed.map(item => item.unit).filter(Boolean))];
    const identifier = false; // Identifier roles are confirmed in column settings.
    const conflict = units.length > 1;
    return {eligible: !!parsed.length && !identifier && !conflict, unit: conflict ? '' : units[0] || '', conflict, identifier};
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
    const category = categories.find(item => item.distinct > 1 && item.distinct < rows.length) || categories[0];
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
  function columnSamples(rows,index,limit=10,random=Math.random) {
    const unique=[...new Set(rows.map(row=>text(row[index]).trim().slice(0,160)).filter(Boolean))];
    // Partial Fisher–Yates: uniform sampling without replacement, independent of row order.
    const count=Math.min(limit,unique.length);
    for(let i=0;i<count;i++){
      const j=i+Math.floor(random()*(unique.length-i));
      [unique[i],unique[j]]=[unique[j],unique[i]];
    }
    return unique.slice(0,count);
  }
  const api = {columnSamples, number, parsedNumber, metricType, text, date, profile, sortRows, aggregate, compareGroups, timeSeries, niceScale, displayNumber, dateTicks};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AdSightData = api;
})(globalThis);
