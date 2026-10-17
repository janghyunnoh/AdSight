const $ = selector => document.querySelector(selector);
const select = $('#sheet');
const refresh = $('#refresh');
const table = $('#data');
const status = $('#status');
const count = $('#count');
const updated = $('#updated');
const sourceInput = $('#source');
const connectionStatus = $('#connection-status');
let busy = false;
let activeSource = null;
let currentData = null;
let dashboardProfile = null;
let dashboardSchema = '';
let metricSettings = [];
let metricReferences = new Map();
let comparisonKeys = [];
let comparisonSort = {index: 0, direction: 1};
const calculationNames = {sum: '합계', mean: '평균', min: '최솟값', max: '최댓값'};
let sortColumn = -1;
let sortDirection = 0;
const D = AdSightData;
const recentSelect = $('#recent-document');
let recentStorage = null;
try { recentStorage = window.localStorage; } catch { /* Private storage may be unavailable. */ }
let recentDocuments = AdSightRecent.read(recentStorage);
function renderRecent() {
  recentSelect.replaceChildren(new Option(recentDocuments.length ? '최근 문서 선택' : '최근 문서 없음', ''), ...recentDocuments.map((entry, index) => new Option(entry.title, String(index))));
  recentSelect.disabled = busy || !recentDocuments.length;
}
function rememberDocument(source, title) {
  recentDocuments = AdSightRecent.remember(recentDocuments, source, title);
  AdSightRecent.write(recentStorage, recentDocuments);
  renderRecent();
}
renderRecent();

async function api(path, source) {
  const response = await fetch(path, {method: 'POST', cache: 'no-store', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({source})});
  let data;
  try { data = await response.json(); } catch { throw new Error('서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도하세요.'); }
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '입력 내용을 확인하고 다시 시도하세요.');
  return data;
}
function cell(tag, value) {
  const el = document.createElement(tag);
  el.textContent = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (tag === 'th') el.scope = 'col';
  return el;
}
function setBusy(value) {
  busy = value;
  recentSelect.disabled = value || !recentDocuments.length;
  sourceInput.disabled = $('#connect').disabled = value;
  select.disabled = value || !select.value;
  refresh.disabled = value || activeSource === null;
  $('#connect').textContent = value ? '불러오는 중…' : '불러오기 →';
}
function clearTable() {
  currentData = null;
  renderDashboard();
  table.hidden = true;
  table.tHead.replaceChildren(); table.tBodies[0].replaceChildren();
  count.textContent = ''; updated.textContent = '';
}
async function load({connect = false, source = activeSource, reloadList = false} = {}) {
  if (busy || source === null) return;
  setBusy(true);
  clearTable();
  $('#empty-state').hidden = true;
  status.hidden = false; status.className = ''; status.textContent = 'Lark에서 최신 데이터를 불러오고 있습니다…';
  if (connect) {
    activeSource = null;
    $('#document-info').hidden = true;
    $('#document-title').textContent = '';
    select.replaceChildren();
    $('#data-toolbar').hidden = $('#data-meta').hidden = true;
    connectionStatus.className = ''; connectionStatus.textContent = '문서의 접근 권한과 시트 목록을 확인하고 있습니다…';
  }
  try {
    if (connect || reloadList) {
      const previous = select.value;
      const {sheets, document: sheetDocument} = await api('/api/source/sheets', source);
      select.replaceChildren(...sheets.map(s => new Option(s.title, s.id)));
      if (!connect && sheets.some(s => s.id === previous)) select.value = previous;
      activeSource = source;
      $('#document-title').textContent = sheetDocument.title;
      $('#document-title').title = sheetDocument.title;
      $('#document-info').hidden = false;
      $('#data-toolbar').hidden = $('#data-meta').hidden = false;
      connectionStatus.className = '';
      connectionStatus.textContent = `연결 완료 · ${sheets.length}개의 시트를 찾았습니다.`;
      $('#preview-description').textContent = '시트를 선택하고 최신 데이터를 확인하세요.';
      $('#connection-badge').textContent = '연결됨';
      $('#connection-badge').classList.add('connected');
    }
    if (!select.value) {count.textContent = '시트 없음'; status.textContent = '조회 가능한 시트가 없습니다.'; return;}
    const data = await api('/api/source/sheets/' + encodeURIComponent(select.value), source);
    rememberDocument(source, $('#document-title').textContent);
    currentData = data;
    sortColumn = -1; sortDirection = 0;
    renderPreview();
    configureDashboard();
    table.hidden = data.columns.length === 0;
    count.textContent = `${data.rows.length.toLocaleString()}개 행 · ${data.columns.length.toLocaleString()}개 컬럼`;
    updated.textContent = '최근 조회 ' + new Date().toLocaleString('ko-KR');
    status.hidden = data.columns.length > 0;
    status.textContent = '시트가 비어 있습니다.';
  } catch (error) {
    status.className = 'error'; status.textContent = error.message; count.textContent = '조회 실패';
    connectionStatus.className = 'error'; connectionStatus.textContent = error.message;
    $('#connection-badge').textContent = '확인 필요'; $('#connection-badge').classList.remove('connected');
  } finally {setBusy(false);}
}
$('#connect-form').addEventListener('submit', event => {
  event.preventDefault();
  const source = sourceInput.value.trim();
  if (source) load({connect: true, source});
});
select.addEventListener('change', () => load());
refresh.addEventListener('click', () => load({reloadList: true}));
const pages = {
  dashboard: ['대시보드', '연결한 데이터를 한눈에 살펴볼 대시보드를 준비 중입니다. 데이터 연결에서 문서를 불러와 주세요.'],
  analysis: ['특이사항', '데이터의 급격한 변화와 점검할 항목을 근거와 함께 안내할 예정입니다.'],
  agent: ['AI 어시스턴트', '시트 데이터에 질문하고 인사이트를 얻는 기능은 이후 단계에서 제공할 예정입니다.']
};
function navigate(view) {
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  $('#sheets-view').hidden = view !== 'sheets';
  $('#dashboard-view').hidden = view !== 'dashboard';
  $('#coming-view').hidden = view === 'sheets' || view === 'dashboard';
  $('#breadcrumb').textContent = view === 'sheets' ? '데이터 연결' : pages[view][0];
  if (view !== 'sheets' && view !== 'dashboard') {$('#coming-title').textContent = pages[view][0]; $('#coming-description').textContent = pages[view][1];}
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
$('#back-to-sheets').addEventListener('click', () => navigate('sheets'));
navigate('sheets');

function renderPreview() {
  if (!currentData) return;
  const head = document.createElement('tr');
  ['행', ...currentData.columns].forEach((label, position) => {
    const index = position - 1;
    const th = cell('th', '');
    th.setAttribute('aria-sort', sortColumn === index && sortDirection ? sortDirection === 1 ? 'ascending' : 'descending' : 'none');
    const button = document.createElement('button'); button.className = 'sort-button';
    button.textContent = label + (sortColumn === index && sortDirection ? sortDirection === 1 ? ' ↑' : ' ↓' : ' ↕');
    button.addEventListener('click', () => {
      sortDirection = sortColumn === index ? sortDirection === 1 ? -1 : sortDirection === -1 ? 0 : 1 : 1;
      sortColumn = index; renderPreview();
    });
    th.append(button); head.append(th);
  });
  table.tHead.replaceChildren(head);
  const indexed = currentData.rows.map((values, i) => ({values: [currentData.row_numbers[i], ...values]}));
  const fragment = document.createDocumentFragment();
  D.sortRows(indexed, sortColumn + 1, sortDirection).forEach(row => {
    const tr = document.createElement('tr'); tr.append(...row.values.map(value => cell('td', value))); fragment.append(tr);
  });
  table.tBodies[0].replaceChildren(fragment);
}
function configureDashboard() {
  const data = currentData;
  const columnLabel = index => {
    const name = data.columns[index];
    const matches = data.columns.filter(value => value === name).length;
    return matches > 1 ? `${name} (${data.columns.slice(0, index + 1).filter(value => value === name).length})` : name;
  };
  dashboardProfile = D.profile(data.columns, data.rows);
  metricReferences = new Map(data.columns.map((_, index) => [index, data.rows.reduce((max, row) => Math.max(max, Math.abs(D.number(row[index]) ?? 0)), 0)]));
  const schema = JSON.stringify([activeSource, data.sheet.id, data.columns]);
  const same = dashboardSchema === schema;
  dashboardSchema = schema;
  const previousGroup = same ? $('#group-column').value : '';
  const previousMetric = same ? $('#metric-column').value : '';
  $('#group-column').replaceChildren(...data.columns.map((name, index) => new Option(columnLabel(index), index)));
  const numeric = data.columns.map((_, index) => index).filter(index => data.rows.some(row => D.number(row[index]) !== null));
  $('#metric-column').replaceChildren(...numeric.map(index => new Option(columnLabel(index), index)));
  if (!numeric.length) $('#metric-column').append(new Option('숫자 데이터가 없습니다', ''));
  $('#group-column').value = previousGroup !== '' ? previousGroup : String(dashboardProfile.groupColumn);
  if (numeric.includes(Number(previousMetric)) && previousMetric !== '') $('#metric-column').value = previousMetric;
  if (!same) {
    $('#aggregation').value = 'mean';
    $('#date-from').value = $('#date-to').value = '';
  }
  $('#date-filters').hidden = dashboardProfile.dateColumn < 0;
  if (!same) {
    const defaults = dashboardProfile.numeric.filter(index => !/^(id|.*[_ ]id|编号|번호)$/i.test(data.columns[index])).slice(0, 4);
    metricSettings = Array.from({length: 4}, (_, slot) => ({index: defaults[slot] ?? -1, operation: 'mean'}));
    comparisonSort = {index: 0, direction: 1};
  } else {
    metricSettings = metricSettings.map(item => numeric.includes(item.index) ? item : {index: -1, operation: 'mean'});
  }
  syncMetricOptions(previousMetric === '' ? metricSettings.find(item => item.index >= 0)?.index : Number(previousMetric));
  configureRelatedMetrics(numeric, same);
  configureValues(); renderDashboard();
}
function configureValues() {
  comparisonKeys = [];
  $('#target-search').value = '';
  $('#group-filter-label').textContent = currentData?.columns[Number($('#group-column').value)] || '대상';
  const values = [...new Set((currentData?.rows || []).map(row => D.text(row[Number($('#group-column').value)])))].sort((a, b) => a.localeCompare(b, 'ko', {numeric: true}));
  $('#group-value').replaceChildren(new Option('전체 대상', ''), ...values.map((value, index) => new Option(value || '(빈 값)', String(index + 1))));
  $('#group-value')._values = values;
}
function selectedRows() {
  if (!currentData) return [];
  const choice = $('#group-value').value;
  const group = Number($('#group-column').value);
  const key = choice ? $('#group-value')._values[Number(choice) - 1] : null;
  const from = D.date($('#date-from').value);
  const to = D.date($('#date-to').value);
  return currentData.rows.map((values, i) => ({values, number: currentData.row_numbers[i]})).filter(row => {
    if (comparisonKeys.length ? !comparisonKeys.includes(D.text(row.values[group])) : key !== null && D.text(row.values[group]) !== key) return false;
    if (dashboardProfile.dateColumn < 0 || (from === null && to === null)) return true;
    const day = D.date(row.values[dashboardProfile.dateColumn]);
    return day !== null && (from === null || day >= from) && (to === null || day <= to);
  });
}
function format(value) { return value === null ? '—' : value.toLocaleString('ko-KR', {maximumFractionDigits: 2}); }
function svgElement(name, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
  return el;
}
function renderDashboard() {
  hideTooltip();
  renderComparisonSelection();
  const ready = !!currentData?.columns.length;
  $('#dashboard-empty').hidden = ready;
  $('#dashboard-content').hidden = !ready;
  if (!ready) {
    $('#dashboard-source').textContent = '연결된 시트의 데이터 개요와 변화를 한눈에 확인하세요.';
    return;
  }
  $('#dashboard-source').textContent = `${$('#document-title').textContent} / ${currentData.sheet.title} · 마지막으로 불러온 데이터 기준`;
  const group = Number($('#group-column').value);
  const metricValue = $('#metric-column').value;
  const metric = metricValue === '' ? -1 : Number(metricValue);
  const operation = $('#aggregation').value;
  const operationLabel = $('#aggregation').selectedOptions[0].textContent;
  $('#shared-metric-label').textContent = metric < 0 ? '위 카드에서 지표를 선택하세요.' : `${metricName(metric)} · ${operationLabel} 기준으로 그래프와 비교 표를 표시합니다.`;
  const indexed = selectedRows();
  const rows = indexed.map(row => row.values);
  const groups = D.aggregate(rows, group, metric, operation).sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  renderOverview(rows);
  renderTrend(rows, metric, operation, operationLabel);
  renderRelatedMetrics(rows, metric, operation, operationLabel);
  $('#chart-title').textContent = metric < 0 ? '그룹별 비교' : `${currentData.columns[group]}별 ${currentData.columns[metric]} · ${operationLabel}`;
  const chart = $('#group-chart'); chart.replaceChildren();
  const display = groups.filter(item => item.value !== null).slice(0, 15);
  const minimum = Math.min(0, ...display.map(item => item.value));
  const maximum = Math.max(0, ...display.map(item => item.value));
  const span = maximum - minimum || 1;
  const zero = (0 - minimum) / span * 300;
  display.forEach(item => {
    const button = document.createElement('button'); button.className = 'chart-bar';
    const label = document.createElement('span'); label.className = 'bar-label'; label.textContent = item.key || '(빈 값)'; label.title = label.textContent;
    const svg = svgElement('svg', {viewBox: '0 0 300 24', 'aria-hidden': 'true', preserveAspectRatio: 'none'});
    const endpoint = (item.value - minimum) / span * 300;
    svg.append(svgElement('rect', {x: Math.min(zero, endpoint), y: 3, width: Math.abs(endpoint - zero), height: 18, rx: 3, fill: item.value < 0 ? '#e09a9e' : '#818ce5'}), svgElement('line', {x1: zero, x2: zero, y1: 0, y2: 24, stroke: '#bdc5d6'}));
    const value = document.createElement('strong'); value.textContent = metricFormat(item.value, metric);
    button.append(label, svg, value);
    attachTooltip(button, [item.key || '(빈 값)', `${metricName(metric)} · ${operationLabel}`, exact(item.value), `${item.valid}개 숫자 값을 계산`]);
    button.addEventListener('click', () => {comparisonKeys = []; $('#group-value').value = String($('#group-value')._values.indexOf(item.key) + 1); renderDashboard();});
    chart.append(button);
  });
  $('#chart-note').textContent = metric < 0 ? '선택할 수 있는 숫자 데이터가 없습니다. 원본 셀의 형식을 확인하세요.' : !display.length ? '계산 가능한 숫자 데이터가 없습니다.' : `숫자 이외의 값과 빈 값은 계산에서 제외합니다. 그래프는 값 내림차순 상위 ${display.length}개이며 아래 표는 전체 그룹을 표시합니다.`;
  renderComparison(rows, group);
  fillTable($('#detail-table'), ['원본 행', ...currentData.columns], indexed.slice(0, 200).map(row => [row.number, ...row.values]));
  $('#detail-note').textContent = `선택된 ${format(indexed.length)}행 중 최대 200행을 표시합니다. 전체 행 정렬은 데이터 연결에서 이용하세요.`;
}
function fillTable(target, columns, rows) {
  const head = document.createElement('tr'); head.append(...columns.map(value => cell('th', value))); target.tHead.replaceChildren(head);
  const fragment = document.createDocumentFragment();
  rows.forEach(row => {const tr = document.createElement('tr'); tr.append(...row.map(value => cell('td', value))); fragment.append(tr);});
  target.tBodies[0].replaceChildren(fragment);
}
$('#group-column').addEventListener('change', () => {configureValues(); renderDashboard();});
$('#group-value').addEventListener('change', renderDashboard);
$('#metric-column').addEventListener('change', () => {syncMetricOptions(Number($('#metric-column').value)); renderDashboard();});
$('#aggregation').addEventListener('change', () => {
  const setting = metricSettings.find(item => String(item.index) === $('#metric-column').value);
  if (setting) setting.operation = $('#aggregation').value;
  renderDashboard();
});
$('#reset-filter').addEventListener('click', () => {comparisonKeys = []; $('#group-value').value = ''; renderDashboard();});
$('#dashboard-back').addEventListener('click', () => navigate('sheets'));

recentSelect.addEventListener('change', () => {
  if (busy || recentSelect.value === '') return;
  const entry = recentDocuments[Number(recentSelect.value)];
  if (!entry) return;
  sourceInput.value = entry.source;
  load({connect: true, source: entry.source});
});


function renderOverview(rows) {
  const container = $('#metric-overview'); container.replaceChildren();
  $('#overview-context').textContent = `${format(rows.length)} / ${format(currentData.rows.length)}행 · 카드에서 지표를 변경하세요`;
  metricSettings.forEach((setting, slot) => {
    const index = setting.index;
    const card = document.createElement('div'); card.className = 'metric-card editable-card';
    const remove = document.createElement('button'); remove.className = 'remove-card'; remove.textContent = '×'; remove.setAttribute('aria-label', `요약 카드 ${slot + 1} 삭제`);
    remove.addEventListener('click', () => {metricSettings.splice(slot, 1); syncMetricOptions(); renderDashboard();});
    card.append(remove);
    const active = index >= 0 && $('#metric-column').value === String(index);
    card.classList.toggle('selected-card', active);
    const controls = document.createElement('div'); controls.className = 'card-controls';
    const selector = document.createElement('select'); selector.setAttribute('aria-label', `요약 카드 ${slot + 1} 지표`);
    selector.append(new Option('지표 선택', '-1'));
    currentData.columns.forEach((_, candidate) => {
      if (!currentData.rows.some(row => D.number(row[candidate]) !== null)) return;
      const option = new Option(metricName(candidate), candidate);
      option.disabled = metricSettings.some((item, other) => other !== slot && item.index === candidate);
      selector.append(option);
    });
    selector.value = String(index);
    selector.addEventListener('change', () => {
      setting.index = Number(selector.value);
      syncMetricOptions(setting.index >= 0 ? setting.index : undefined);
      comparisonSort = {index: 0, direction: 1}; renderDashboard();
    });
    const operationLabel = document.createElement('span'); operationLabel.className = 'card-operation-label';
    operationLabel.textContent = index < 0 ? '' : calculationNames[setting.operation];
    controls.append(selector, operationLabel); card.append(controls);
    const value = document.createElement('button'); value.className = 'card-value';
    const summary = index < 0 ? null : D.aggregate(rows, -1, index, setting.operation)[0];
    value.textContent = metricFormat(summary?.value ?? null, index); value.disabled = index < 0;
    value.setAttribute('aria-label', index < 0 ? '지표를 선택하세요' : `${metricName(index)} ${calculationNames[setting.operation]} ${value.textContent}, 그래프로 보기`);
    value.addEventListener('click', () => {syncMetricOptions(index); renderDashboard();});
    if (index >= 0) attachTooltip(value, [metricName(index), `${calculationNames[setting.operation]} ${exact(summary?.value ?? null)}`, `${summary?.valid || 0}개 숫자 값을 계산`, '클릭하면 아래 그래프에 표시']);
    const range = document.createElement('small');
    if (index < 0) range.textContent = '원하는 숫자 지표를 선택하세요';
    else {
      const min = D.aggregate(rows, -1, index, 'min')[0]?.value ?? null;
      const max = D.aggregate(rows, -1, index, 'max')[0]?.value ?? null;
      range.textContent = `최소 ${metricFormat(min, index)} / 최대 ${metricFormat(max, index)}`;
    }
    const hint = document.createElement('span'); hint.className = 'card-state'; hint.textContent = index < 0 ? '미선택' : active ? '● 그래프에 표시 중' : '값을 눌러 그래프로 보기';
    card.append(value, range, hint); container.append(card);
  });
  const add = document.createElement('button'); add.className = 'add-metric-card'; add.textContent = '＋ 카드 추가';
  add.disabled = !currentData.columns.some((_, index) => !metricSettings.some(item => item.index === index) && currentData.rows.some(row => D.number(row[index]) !== null));
  add.addEventListener('click', () => {
    const candidate = currentData.columns.findIndex((_, index) => !metricSettings.some(item => item.index === index) && currentData.rows.some(row => D.number(row[index]) !== null));
    if (candidate < 0) return;
    metricSettings.push({index: candidate, operation: 'mean'}); syncMetricOptions(candidate); renderDashboard();
    container.lastElementChild?.scrollIntoView({behavior: 'smooth', block: 'nearest', inline: 'end'});
  });
  container.append(add);
}
function syncMetricOptions(preferred) {
  const selected = metricSettings.filter(item => item.index >= 0);
  const previous = $('#metric-column').value;
  $('#metric-column').replaceChildren(...selected.map(item => new Option(metricName(item.index), item.index)));
  if (!selected.length) $('#metric-column').append(new Option('카드에서 지표를 선택하세요', ''));
  const wanted = preferred === undefined ? previous : String(preferred);
  if (selected.some(item => String(item.index) === wanted)) $('#metric-column').value = wanted;
  const setting = selected.find(item => String(item.index) === $('#metric-column').value);
  $('#aggregation').value = setting?.operation || 'mean';
  $('#aggregation').disabled = !setting;
}
function renderTrend(rows, metric, operation, operationLabel, prefix = 'trend') {
  const dateColumn = dashboardProfile.dateColumn;
  $(`#${prefix}-panel`).hidden = dateColumn < 0 || metric < 0;
  const chart = $(`#${prefix}-chart`); chart.replaceChildren();
  if (dateColumn < 0 || metric < 0) return;
  $(`#${prefix}-title`).textContent = `${currentData.columns[metric]} 추이`;
  $(`#${prefix}-description`).textContent = `${currentData.columns[dateColumn]} 기준 · 날짜별 ${operationLabel}`;
  const series = D.timeSeries(rows, dateColumn, Number($('#group-column').value), metric, operation, comparisonKeys.length ? comparisonKeys : null);
  const points = series[0]?.points || [];
  const values = series.flatMap(item => item.points.filter(point => point.value !== null).map(point => point.value));
  const legend = $(`#${prefix}-legend`); legend.replaceChildren();
  const seriesColor = index => `hsl(${(225 + index * 137.508) % 360} 48% 53%)`;
  series.forEach((item, index) => {
    const badge = document.createElement('span'); badge.className = `series-label series-${index}`;
    const swatch = document.createElement('i'); swatch.className = 'series-swatch'; swatch.style.backgroundColor = seriesColor(index);
    const label = document.createElement('span'); label.textContent = item.key === null ? '선택 범위 전체' : item.key || '(빈 값)';
    badge.append(swatch, label); legend.append(badge);
  });
  if (!values.length) {$(`#${prefix}-note`).textContent = '선택한 범위에 그래프로 표시할 데이터가 없습니다.'; return;}
  const scale = D.niceScale(values);
  const {low, high} = scale;
  const first = points[0].day, last = points[points.length - 1].day;
  const x = day => first === last ? 310 : 66 + (day - first) / (last - first) * 500;
  const y = value => 200 - (value - low) / (high - low) * 160;
  const svg = svgElement('svg', {viewBox: '0 0 620 250', role: 'img', 'aria-label': `${currentData.columns[metric]}의 날짜별 ${operationLabel} 추이`});
  for (const value of scale.ticks) {
    svg.append(svgElement('line', {x1: 66, x2: 566, y1: y(value), y2: y(value), stroke: '#edf0f6'}));
    const label = svgElement('text', {x: 58, y: y(value) + 4, 'text-anchor': 'end', fill: '#8d99ae', 'font-size': 10}); label.textContent = metricFormat(value, metric);
    const tickTitle = svgElement('title', {}); tickTitle.textContent = exact(value); label.append(tickTitle);
    svg.append(label);
  }
  series.forEach((item, seriesIndex) => {
    const color = seriesColor(seriesIndex);
    let segment = [];
    function flush() {if (segment.length > 1) svg.append(svgElement('polyline', {points: segment.join(' '), fill: 'none', stroke: color, 'stroke-width': 2.5})); segment = [];}
    item.points.forEach(point => {if (point.value === null) flush(); else segment.push(`${x(point.day)},${y(point.value)}`);}); flush();
    item.points.filter(point => point.value !== null).forEach(point => {
      const dot = svgElement('circle', {cx: x(point.day), cy: y(point.value), r: 4, fill: color, tabindex: 0});
      const lines = () => relatedTooltip(rows, point.day, item.key, metric, operation, operationLabel);
      dot.setAttribute('aria-label', `${item.key ?? '선택 범위 전체'}, ${new Date(point.day).toISOString().slice(0, 10)}, ${exact(point.value)}`); attachTooltip(dot, lines); svg.append(dot);
      const hit = svgElement('circle', {cx: x(point.day), cy: y(point.value), r: 12, fill: 'transparent', 'aria-hidden': 'true'});
      attachTooltip(hit, lines); svg.append(hit);
    });
  });
  [...new Set([first, last])].forEach(day => {
    const label = svgElement('text', {x: x(day), y: 230, 'text-anchor': 'middle', fill: '#8d99ae', 'font-size': 11}); label.textContent = new Date(day).toISOString().slice(5, 10).replace('-', '/'); svg.append(label);
  });
  chart.append(svg);
  $(`#${prefix}-note`).textContent = `${points.length}개 관측 날짜 · ${series.length}개 추이 · 날짜별 ${operationLabel} · 없는 값은 0으로 채우지 않습니다.`;
}
['#date-from', '#date-to'].forEach(selector => $(selector).addEventListener('change', renderDashboard));
$('#dashboard-reset').addEventListener('click', () => {
  comparisonKeys = []; $('#group-value').value = ''; $('#date-from').value = $('#date-to').value = ''; renderDashboard();
});

function metricName(index) {
  const name = currentData.columns[index];
  return currentData.columns.filter(value => value === name).length > 1 ? `${name} (${currentData.columns.slice(0, index + 1).filter(value => value === name).length})` : name;
}
function renderComparison(rows, group) {
  const selected = metricSettings.filter(item => item.index >= 0);
  const columns = [metricName(group), ...selected.map(setting => `${metricName(setting.index)} · ${calculationNames[setting.operation]}`)];
  const groups = D.compareGroups(rows, group, selected);
  if (comparisonSort.index >= columns.length) comparisonSort = {index: 0, direction: 1};
  const sorted = D.sortRows(groups.map(item => ({values: [item.key, ...item.values], key: item.key})), comparisonSort.index, comparisonSort.direction);
  const target = $('#summary-table');
  const head = document.createElement('tr');
  columns.forEach((name, index) => {
    const th = cell('th', '');
    th.setAttribute('aria-sort', comparisonSort.index === index ? comparisonSort.direction === 1 ? 'ascending' : 'descending' : 'none');
    const button = document.createElement('button'); button.className = 'sort-button';
    button.textContent = name + (comparisonSort.index === index ? comparisonSort.direction === 1 ? ' ↑' : ' ↓' : ' ↕');
    button.addEventListener('click', () => {comparisonSort = {index, direction: comparisonSort.index === index ? -comparisonSort.direction : 1}; renderDashboard();});
    if (index > 0 && String(selected[index - 1].index) === $('#metric-column').value) th.classList.add('active-metric-cell');
    th.append(button); head.append(th);
  });
  target.tHead.replaceChildren(head);
  const fragment = document.createDocumentFragment();
  sorted.forEach(item => {
    const tr = document.createElement('tr');
    const name = cell('td', ''); const button = document.createElement('button'); button.className = 'group-link'; button.textContent = item.key || '(빈 값)';
    button.addEventListener('click', () => {
      comparisonKeys = []; $('#group-value').value = String($('#group-value')._values.indexOf(item.key) + 1); renderDashboard();
      const detail = $('.detail-section'); detail.open = true; detail.scrollIntoView({behavior: 'smooth', block: 'start'});
    });
    name.append(button);
    tr.append(name, ...item.values.slice(1).map((value, position) => {
      const setting = selected[position];
      const td = cell('td', metricFormat(value, setting.index)); td.tabIndex = 0;
      if (String(setting.index) === $('#metric-column').value) td.classList.add('active-metric-cell');
      attachTooltip(td, [item.key || '(빈 값)', `${metricName(setting.index)} · ${calculationNames[setting.operation]}`, exact(value)]);
      return td;
    })); fragment.append(tr);
  });
  if (!selected.length) {const tr = document.createElement('tr'); const td = cell('td', '위 카드에서 비교할 지표를 선택해 주세요.'); td.colSpan = columns.length; tr.append(td); fragment.replaceChildren(tr);}
  target.tBodies[0].replaceChildren(fragment);
}



function exact(value) { return value === null ? '계산 가능한 값 없음' : value.toLocaleString('ko-KR', {maximumFractionDigits: 12}); }
function hideTooltip() { const tooltip = $('#data-tooltip'); if (tooltip) tooltip.hidden = true; }
function attachTooltip(element, lines) {
  element.setAttribute('aria-describedby', 'data-tooltip');
  let resolved = null;
  function show(event) {
    const tooltip = $('#data-tooltip');
    const content = resolved || (resolved = typeof lines === 'function' ? lines() : lines);
    tooltip.textContent = content.join('\n'); tooltip.hidden = false;
    const rect = element.getBoundingClientRect();
    const x = event.clientX || rect.left + rect.width / 2;
    const y = event.clientY || rect.bottom;
    tooltip.style.left = `${Math.max(8, Math.min(x + 14, window.innerWidth - tooltip.offsetWidth - 12))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(y + 14, window.innerHeight - tooltip.offsetHeight - 12))}px`;
  }
  element.addEventListener('pointerenter', show); element.addEventListener('pointermove', show);
  element.addEventListener('pointerleave', hideTooltip); element.addEventListener('focus', show); element.addEventListener('blur', hideTooltip);
  element.addEventListener('keydown', event => {if (event.key === 'Escape') hideTooltip();});
}
window.addEventListener('scroll', hideTooltip, true);

function renderComparisonSelection() {
  const chips = $('#comparison-chips'); chips.replaceChildren();
  const selectedChoice = $('#group-value').value;
  const single = comparisonKeys.length === 0 && selectedChoice !== '';
  const selectedName = single ? ($('#group-value')._values?.[Number(selectedChoice) - 1] || '(빈 값)') : '';
  $('#single-target-filter').hidden = !single;
  $('#single-target-name').textContent = single ? `${selectedName}만 보는 중` : '';
  $('#comparison-filter-status').textContent = comparisonKeys.length ? `${comparisonKeys.length}개 대상 비교 중` : single ? `${selectedName}만 표시 중` : '전체 대상 표시 중';
  $('#comparison-show-all').disabled = !single && comparisonKeys.length === 0;
  $('#comparison-selection').hidden = comparisonKeys.length === 0;
  $('#comparison-message').textContent = comparisonKeys.length ? `${comparisonKeys.length}개 대상 비교 중` : '';
  $('#target-picker-title').textContent = comparisonKeys.length ? `${comparisonKeys.length}개 대상 선택` : single ? selectedName : '전체 대상 · 선택해서 비교';
  renderTargetOptions();
}
$('#clear-comparison').addEventListener('click', () => {comparisonKeys = []; $('#group-value').value = ''; renderDashboard();});

function showAllTargets() {
  comparisonKeys = []; $('#group-value').value = ''; renderDashboard();
}
$('#comparison-show-all').addEventListener('click', showAllTargets);
$('#clear-single-target').addEventListener('click', showAllTargets);

function metricFormat(value, index) { return D.displayNumber(value, metricReferences.get(index) || 0); }

function matchingTargets() {
  const query = $('#target-search').value.trim().toLocaleLowerCase();
  return ($('#group-value')._values || []).filter(value => (value || '(빈 값)').toLocaleLowerCase().includes(query));
}
function renderTargetOptions() {
  const container = $('#target-options'); container.replaceChildren();
  const singleChoice = $('#group-value').value;
  const singleKey = singleChoice ? $('#group-value')._values[Number(singleChoice) - 1] : null;
  const values = matchingTargets();
  if (!values.length) {const message = document.createElement('p'); message.textContent = '검색 결과가 없습니다.'; container.append(message);}
  values.forEach(key => {
    const label = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = key;
    checkbox.checked = comparisonKeys.length ? comparisonKeys.includes(key) : singleKey === key;
    checkbox.addEventListener('change', () => {
      if (!comparisonKeys.length && singleKey !== null) comparisonKeys = [singleKey];
      comparisonKeys = checkbox.checked ? [...new Set([...comparisonKeys, key])] : comparisonKeys.filter(value => value !== key);
      const scroll = container.scrollTop;
      $('#group-value').value = ''; renderDashboard();
      container.scrollTop = scroll;
      const replacement = [...container.children].find(child => child.children[0]?.value === key)?.children[0];
      replacement?.focus();
    });
    const name = document.createElement('span'); name.textContent = key || '(빈 값)'; label.append(checkbox, name); container.append(label);
  });
}
$('#target-search').addEventListener('input', renderTargetOptions);
$('#select-all-targets').addEventListener('click', () => {
  comparisonKeys = [...new Set([...comparisonKeys, ...matchingTargets()])]; $('#group-value').value = ''; renderDashboard();
});
$('#picker-clear').addEventListener('click', showAllTargets);
$('#cards-prev').addEventListener('click', () => $('#metric-overview').scrollBy({left: -280, behavior: 'smooth'}));
$('#cards-next').addEventListener('click', () => $('#metric-overview').scrollBy({left: 280, behavior: 'smooth'}));
document.addEventListener('click', event => {if (!$('#target-picker').contains(event.target)) $('#target-picker').open = false;});
$('#target-picker').addEventListener('keydown', event => {if (event.key === 'Escape') $('#target-picker').open = false;});

$('#metric-overview').addEventListener('wheel', event => {
  const rail = $('#metric-overview');
  if (event.ctrlKey || event.deltaX || !event.deltaY) return;
  const canMove = event.deltaY > 0 ? rail.scrollLeft < rail.scrollWidth - rail.clientWidth - 1 : rail.scrollLeft > 0;
  if (canMove) {event.preventDefault(); rail.scrollLeft += event.deltaY;}
}, {passive: false});

function configureRelatedMetrics(numeric, same) {
  const defaults = [index => /^(clicks?|클릭수?|클릭 수)$/i.test(currentData.columns[index].trim()), index => /^(conversions?|전환수?|전환 수)$/i.test(currentData.columns[index].trim())];
  ['#related-metric-a', '#related-metric-b'].forEach((selector, slot) => {
    const target = $(selector), previous = same ? target.value : '';
    target.replaceChildren(new Option('선택 안 함', ''), ...numeric.map(index => new Option(metricName(index), index)));
    if (same && (previous === '' || numeric.includes(Number(previous)))) target.value = previous;
    else {const index = numeric.find(defaults[slot]); target.value = index === undefined ? '' : String(index);}
  });
}
function renderRelatedMetrics(rows, primary, operation, label) {
  const ready = dashboardProfile.dateColumn >= 0 && primary >= 0;
  $('#related-metrics').hidden = !ready;
  if (!ready) return;
  const selected = [primary];
  $('#related-primary-caption').textContent = `기준 지표: ${metricName(primary)} · ${label}. 같은 지표를 다시 선택해도 기준 그래프에서 확인할 수 있습니다.`;
  renderTrend(rows, primary, operation, label, 'related-primary');
  ['#related-metric-a', '#related-metric-b'].forEach((selector, slot) => {
    const value = $(selector).value;
    const metric = value === '' ? -1 : Number(value);
    const duplicate = metric >= 0 && selected.includes(metric);
    renderTrend(rows, duplicate ? -1 : metric, operation, label, slot === 0 ? 'related-a' : 'related-b');
    if (metric >= 0 && !duplicate) selected.push(metric);
  });
  const dateColumn = dashboardProfile.dateColumn;
  const series = selected.map(metric => D.timeSeries(rows, dateColumn, Number($('#group-column').value), metric, operation)[0]);
  const dates = series[0]?.points || [];
  const target = $('#daily-metrics-table');
  fillTable(target, ['날짜', ...selected.map(metric => `${metricName(metric)} · ${label}`)], dates.map((point, index) => [new Date(point.day).toISOString().slice(0,10), ...selected.map((metric, j) => metricFormat(series[j].points[index]?.value ?? null, metric))]));
  [...target.tBodies[0].children].forEach((row, index) => {
    [...row.children].slice(1).forEach((td, position) => {
      td.tabIndex = 0;
      attachTooltip(td, [new Date(dates[index].day).toISOString().slice(0,10), `${metricName(selected[position])} · ${label}`, exact(series[position].points[index]?.value ?? null)]);
    });
  });
}
['#related-metric-a', '#related-metric-b'].forEach(selector => $(selector).addEventListener('change', renderDashboard));

function relatedTooltip(rows, day, key, hoveredMetric, operation, label) {
  const group = Number($('#group-column').value);
  const primary = $('#metric-column').value;
  const metrics = [...new Set([hoveredMetric, ...(primary === '' ? [] : [Number(primary)]), ...['#related-metric-a', '#related-metric-b'].map(selector => $(selector).value).filter(value => value !== '').map(Number)])];
  const daily = rows.filter(row => D.date(row[dashboardProfile.dateColumn]) === day && (key === null || D.text(row[group]) === key));
  return [new Date(day).toISOString().slice(0,10), key === null ? '선택 범위 전체' : key || '(빈 값)', `날짜별 ${label}`, ...metrics.map(metric => `${metricName(metric)}: ${exact(D.aggregate(daily, -1, metric, operation)[0]?.value ?? null)}`)];
}
