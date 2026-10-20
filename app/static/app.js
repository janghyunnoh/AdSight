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
let comparisonMetrics = [];
let selectedDetailMetric=-1;
let targetComparisonSort={metric:null,direction:-1};
let analysisMetricContext='',analysisMetrics=[],analysisGroup=-1,analysisTargets=[];
function analysisOperationFor(index){const value=$('#analysis-aggregation').value;return value&&value!=='configured'?value:columnSettings[index]?.aggregation||'mean';}
const findingExplanations=new Map();
let metricReferences = new Map();
let metricTypes = [];
let columnSettings = [], columnDraft = [], columnSettingsKey = '', columnSettingsConfirmed = false;
let pendingInterpretation = null, columnReviewPending = false;
let aiProvider = 'none', aiProviders = [], aiReady = false, aiBusy = false, datasetInterpretation = null;
function operationFor(index) {return $('#aggregation').value === 'configured' ? columnSettings[index]?.aggregation || 'mean' : $('#aggregation').value;}
function operationLabelFor(index) {return calculationNames[operationFor(index)];}
function metricEligible(index) {return metricTypes[index]?.eligible === true;}
let comparisonKeys = [];
const calculationNames = {configured: '지표별 기본값', sum: '합계', mean: '평균', min: '최솟값', max: '최댓값'};
let sortColumn = -1;
let sortDirection = 0;
const D = AdSightData;
const datePicker = AdSightDates.create({
  getDays: () => dashboardProfile?.dateColumn >= 0 ? (currentData?.rows || []).map(row => D.date(row[dashboardProfile.dateColumn])) : [],
  getRange: () => ({from: $('#date-from').value, to: $('#date-to').value}),
  onApply: ({from, to}) => {$('#date-from').value = from; $('#date-to').value = to; renderDashboard();}
});
const recentSelect = $('#recent-document');
let recentStorage = null;
try { recentStorage = window.localStorage; } catch { /* Private storage may be unavailable. */ }
AdSightRecent.resetTestHistory(recentStorage);
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
function setSetupStep(step,expanded) {
  $('#step-'+step+'-body').hidden=!expanded;
  const card=$(['#connection-card','#data-understanding-step','#column-settings-panel'][step-1]);
  card.classList.toggle('step-collapsed',!expanded);
  const toggle=$('#step-'+step+'-toggle');
  toggle.setAttribute('aria-expanded',String(expanded));
  toggle.setAttribute('aria-label',step+'단계 '+(expanded?'접기':'펼치기'));
  toggle.textContent=expanded?'⌃':'⌄';
}
function revealSetupStep(step) {
  const card=$(['#connection-card','#data-understanding-step','#column-settings-panel'][step-1]);
  const scroll=()=>card.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(scroll);else scroll();
}
[1,2,3].forEach(step=>$('#step-'+step+'-toggle').addEventListener('click',()=>{
  const expanded=$('#step-'+step+'-body').hidden;
  setSetupStep(step,expanded);
  if(expanded)revealSetupStep(step);
}));


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
    setSetupStep(1,true);setSetupStep(2,false);setSetupStep(3,false);
    $('#step-2-toggle').disabled=true;$('#step-3-toggle').disabled=true;
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
    $('#settings-save-status').textContent='';
    columnSettingsKey='';dashboardSchema='';
    $('#ai-interpret-status').textContent='';$('#ai-data-context').value='';
    setSetupStep(1,false);setSetupStep(2,true);setSetupStep(3,false);
    $('#step-2-toggle').disabled=false;$('#step-3-toggle').disabled=false;
    $('#step-1-status').textContent=$('#document-title').textContent;
    $('#step-2-status').textContent='데이터 불러오기 완료';
    sortColumn = -1; sortDirection = 0;
    renderPreview();
    configureDashboard();

    table.hidden = data.columns.length === 0;
    count.textContent = `${data.rows.length.toLocaleString()}개 행 · ${data.columns.length.toLocaleString()}개 컬럼`;
    updated.textContent = '최근 조회 ' + new Date().toLocaleString('ko-KR');
    status.hidden = data.columns.length > 0;
    status.textContent = '시트가 비어 있습니다.';
    if(!offerApprovedSettings(data)) {revealSetupStep(2);if(data.approved_settings)setSetupStep(3,true);}
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
  feedback: ['피드백', '필요한 기능과 수정할 점을 함께 기록하세요.']
};
function navigate(view) {
  if (['dashboard','analysis'].includes(view) && currentData && (!columnSettingsConfirmed || columnReviewPending)) {view = 'sheets'; $('#column-settings-status').textContent = '먼저 아래 컬럼 역할을 확인하고 시작해 주세요.';}
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  $('#sheets-view').hidden = view !== 'sheets';
  $('#dashboard-view').hidden = view !== 'dashboard';
  $('#analysis-view').hidden = view !== 'analysis';
  $('#feedback-view').hidden = view !== 'feedback';
  if (view === 'feedback') window.AdSightFeedback?.refresh();
  if (view === 'analysis') renderAnalysis();
  $('#breadcrumb').textContent = view === 'sheets' ? '데이터 연결' : pages[view][0];
  window.AdSightAssistant?.refresh();
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
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
  prepareColumnSettings();
  const columnLabel = index => metricName(index);
  updateAIControls();
  dashboardProfile = D.profile(data.columns, data.rows);
  dashboardProfile.dateColumn = columnSettings.findIndex(item => item.role === 'date');
  dashboardProfile.groupColumn = columnSettings.map((item,index)=>({...item,index})).filter(item=>item.role==='dimension').sort((a,b)=>(b.priority||0)-(a.priority||0))[0]?.index ?? -1;
  metricTypes = data.columns.map((name, index) => ({...D.metricType(data.rows, index), identifier: columnSettings[index]?.role === 'identifier', eligible: columnSettings[index]?.role === 'metric' && D.metricType(data.rows, index).eligible}));
  metricReferences = new Map(data.columns.map((_, index) => [index, data.rows.reduce((max, row) => Math.max(max, Math.abs(D.number(row[index]) ?? 0)), 0)]));
  const schema = JSON.stringify([activeSource, data.sheet.id, data.columns]);
  const same = dashboardSchema === schema;
  dashboardSchema = schema;
  const previousGroup = same ? $('#group-column').value : '';
  $('#group-column').replaceChildren(...data.columns.map((name, index) => ({name,index})).filter(item=>columnSettings[item.index]?.role==='dimension').map(item=>new Option(columnLabel(item.index),item.index)));
  if (!$('#group-column').children.length) $('#group-column').append(new Option('전체 데이터', '-1'));
  const numeric = data.columns.map((_, index) => index).filter(metricEligible);
  $('#group-column').value = previousGroup !== '' ? previousGroup : String(dashboardProfile.groupColumn);
  if (!same) {
    $('#aggregation').value = 'configured';
    $('#date-from').value = $('#date-to').value = '';
  }
  $('#date-filters').hidden = dashboardProfile.dateColumn < 0;
  if (!same) {
    const defaults = prioritizedMetrics(numeric).slice(0, 4);
    selectedDetailMetric=defaults[0]??-1;
    metricSettings = Array.from({length: 4}, (_, slot) => ({index: defaults[slot] ?? -1, operation: operationFor(defaults[slot])}));
  } else {
    metricSettings = metricSettings.map(item => numeric.includes(item.index) ? item : {index: -1, operation: 'mean'});
  }
  configureComparisonMetrics(numeric, same);
  syncMetricOptions(selectedDetailMetric);
  configureValues(); renderDashboard();
}
function configureValues() {
  comparisonKeys = [];
  $('#target-search').value = '';
  $('#group-filter-label').textContent = currentData ? metricName(Number($('#group-column').value)) : '대상';
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
  window.AdSightAssistant?.refresh();
  hideTooltip();
  datePicker.refresh();
  renderComparisonSelection();
  renderAnalysis();
  const ready = !!currentData?.columns.length;
  $('#dashboard-empty').hidden = ready;
  $('#dashboard-content').hidden = !ready;
  if (!ready) {
    $('#dashboard-source').textContent = '원하는 대상과 기간을 선택해 주요 수치와 변화를 비교하세요.';
    return;
  }
  $('#dashboard-source').textContent = '원하는 대상과 기간을 선택해 주요 수치와 변화를 비교하세요.';
  const group = Number($('#group-column').value);
  const metric = selectedDetailMetric;
  const operation = operationFor(metric);
  const operationLabel = calculationNames[operation];
  const indexed = selectedRows();
  const rows = indexed.map(row => row.values);
  const groups = D.aggregate(rows, group, metric, operation).sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  renderOverview(rows);
  renderMetricPicker();
  renderMetricComparison(rows, operation, operationLabel);
  $('#selected-metric-detail').hidden=selectedDetailMetric<0;
  if(selectedDetailMetric>=0){
    $('#selected-detail-title').textContent=metricName(selectedDetailMetric);
    renderTrend(rows,selectedDetailMetric,operationFor(selectedDetailMetric),operationLabelFor(selectedDetailMetric),'selected-trend');
    $('#selected-detail-empty').hidden=dashboardProfile.dateColumn>=0;

  }
  $('#chart-title').textContent = metric < 0 ? '그룹별 비교' : `${metricName(group)}별 차이 · ${operationLabel}`;
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
    attachTooltip(button, [item.key || '(빈 값)', `${metricName(metric)} · ${operationLabel}`, metricExact(item.value, metric), `${item.valid}개 숫자 값을 계산`]);
    button.addEventListener('click', () => {comparisonKeys = []; $('#group-value').value = String($('#group-value')._values.indexOf(item.key) + 1); renderDashboard();});
    chart.append(button);
  });
  $('#chart-note').textContent = metric < 0 ? '위에서 비교할 지표를 추가해 주세요.' : !display.length ? '계산 가능한 숫자 데이터가 없습니다.' : `숫자 이외의 값과 빈 값은 계산에서 제외합니다. 그래프는 값 내림차순 상위 ${display.length}개입니다.`;
  renderCombinedTargets(rows,group);

}
$('#group-column').addEventListener('change', () => {configureValues(); renderDashboard();});
$('#group-value').addEventListener('change', renderDashboard);
$('#aggregation').addEventListener('change', () => {
  metricSettings.forEach(setting => {setting.operation = operationFor(setting.index);});
  renderDashboard();
});
$('#reset-filter').addEventListener('click', () => {comparisonKeys = []; $('#group-value').value = ''; renderDashboard();});

recentSelect.addEventListener('change', () => {
  if (busy || recentSelect.value === '') return;
  const entry = recentDocuments[Number(recentSelect.value)];
  if (!entry) return;
  sourceInput.value = entry.source;
  load({connect: true, source: entry.source});
});


function renderOverview(rows) {
  const container = $('#metric-overview'); container.replaceChildren();
  $('#overview-context').textContent = `${format(rows.length)} / ${format(currentData.rows.length)}행`;
  metricSettings.forEach((setting, slot) => {
    const index = setting.index;
    setting.operation = operationFor(index);
    const card = document.createElement('div'); card.className = 'metric-card editable-card';
    const remove = document.createElement('button'); remove.className = 'remove-card'; remove.textContent = '×'; remove.setAttribute('aria-label', `요약 카드 ${slot + 1} 삭제`);
    remove.addEventListener('click', () => {metricSettings.splice(slot, 1);if(selectedDetailMetric===index)selectedDetailMetric=metricSettings.find(item=>item.index>=0)?.index??-1;syncMetricOptions(selectedDetailMetric);renderDashboard();persistDashboardLayout();});
    card.append(remove);
    const active = index >= 0 && selectedDetailMetric===index;
    card.classList.toggle('selected-card', active);
    const controls = document.createElement('div'); controls.className = 'card-controls';
    const selector = document.createElement('select'); selector.setAttribute('aria-label', `요약 카드 ${slot + 1} 지표`);
    selector.append(new Option('지표 선택', '-1'));
    currentData.columns.forEach((_, candidate) => {
      if (!metricEligible(candidate)) return;
      const option = new Option(metricName(candidate), candidate);
      option.disabled = metricSettings.some((item, other) => other !== slot && item.index === candidate);
      selector.append(option);
    });
    selector.value = String(index);
    selector.addEventListener('change', () => {
      const wasSelected=selectedDetailMetric===setting.index;
      setting.index = Number(selector.value);
      if(wasSelected)selectedDetailMetric=setting.index;
      syncMetricOptions(selectedDetailMetric);
      renderDashboard();persistDashboardLayout();
    });
    const operationLabel = document.createElement('span'); operationLabel.className = 'card-operation-label';
    operationLabel.textContent = index < 0 ? '' : calculationNames[setting.operation];
    controls.append(selector, operationLabel); card.append(controls);
    const value = document.createElement('button'); value.className = 'card-value';
    const summary = index < 0 ? null : D.aggregate(rows, -1, index, setting.operation)[0];
    value.textContent = metricFormat(summary?.value ?? null, index); value.disabled = index < 0;
    value.setAttribute('aria-label', index < 0 ? '지표를 선택하세요' : `${metricName(index)} ${calculationNames[setting.operation]} ${value.textContent}, 지표 상세 보기`);
    value.addEventListener('click', () => showMetricDetail(index));
    if (index >= 0) attachTooltip(value, [metricName(index), `${calculationNames[setting.operation]} ${metricExact(summary?.value ?? null, index)}`, `${summary?.valid || 0}개 숫자 값을 계산`, '클릭하면 지표 상세 보기']);
    const range = document.createElement('small');
    if (index < 0) range.textContent = '원하는 숫자 지표를 선택하세요';
    else {
      const min = D.aggregate(rows, -1, index, 'min')[0]?.value ?? null;
      const max = D.aggregate(rows, -1, index, 'max')[0]?.value ?? null;
      range.textContent = `최소 ${metricFormat(min, index)} / 최대 ${metricFormat(max, index)}`;
    }
    const hint = document.createElement('span'); hint.className = 'card-state'; hint.textContent = index < 0 ? '미선택' : active ? '● 상세 보기 중' : '클릭하여 자세히 보기';
    card.addEventListener('click',event=>{if(event.target===card||event.target===range||event.target===hint)showMetricDetail(index);});
    card.append(value, range, hint); container.append(card);
  });
  const add = document.createElement('button'); add.className = 'add-metric-card'; add.textContent = '＋ 카드 추가';
  add.disabled = !currentData.columns.some((_, index) => !metricSettings.some(item => item.index === index) && metricEligible(index));
  add.addEventListener('click', () => {
    const candidate = currentData.columns.findIndex((_, index) => !metricSettings.some(item => item.index === index) && metricEligible(index));
    if (candidate < 0) return;
    metricSettings.push({index: candidate, operation: operationFor(candidate)}); syncMetricOptions(); renderDashboard();persistDashboardLayout();
    container.lastElementChild?.scrollIntoView({behavior: 'smooth', block: 'nearest', inline: 'end'});
  });
  container.append(add);
}
function syncMetricOptions(preferred) {
  if(preferred!==undefined&&preferred>=0&&metricEligible(Number(preferred)))selectedDetailMetric=Number(preferred);
  else if(selectedDetailMetric>=0&&!metricEligible(selectedDetailMetric))selectedDetailMetric=metricSettings.find(item=>metricEligible(item.index))?.index??-1;
}
function renderTrend(rows, metric, operation, operationLabel, prefix = 'trend') {
  const dateColumn = dashboardProfile.dateColumn;
  $(`#${prefix}-panel`).hidden = dateColumn < 0 || metric < 0;
  const chart = $(`#${prefix}-chart`); chart.replaceChildren();
  if (dateColumn < 0 || metric < 0) return;
  $(`#${prefix}-title`).textContent = `${metricName(metric)} · 시간에 따른 변화`;
  $(`#${prefix}-description`).textContent = `${metricName(dateColumn)} 기준 · 날짜별 ${operationLabel}`;
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
    const tickTitle = svgElement('title', {}); tickTitle.textContent = metricExact(value, metric); label.append(tickTitle);
    svg.append(label);
  }
  series.forEach((item, seriesIndex) => {
    const color = seriesColor(seriesIndex);
    let segment = [];
    function flush() {if (segment.length > 1) svg.append(svgElement('polyline', {points: segment.join(' '), fill: 'none', stroke: color, 'stroke-width': 2.5})); segment = [];}
    item.points.forEach(point => {if (point.value === null) flush(); else segment.push(`${x(point.day)},${y(point.value)}`);}); flush();
    item.points.filter(point => point.value !== null).forEach(point => {
      const dot = svgElement('circle', {cx: x(point.day), cy: y(point.value), r: 4, fill: color, tabindex: 0});
      const lines = () => [new Date(point.day).toISOString().slice(0,10),item.key===null?'선택 범위 전체':item.key||'(빈 값)',metricName(metric)+' · '+operationLabel,metricExact(point.value,metric)];
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
  const original = currentData.columns[index];
  if (original === undefined) return '전체 데이터';
  const translated = columnSettings[index]?.label;
  const name = translated && translated !== original ? `${translated} (${original})` : original;
  return currentData.columns.filter(value => value === original).length > 1 ? `${name} (${currentData.columns.slice(0, index + 1).filter(value => value === original).length})` : name;
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
  comparisonKeys.forEach(key=>{
    const chip=document.createElement('button');chip.type='button';chip.className='comparison-chip';
    chip.textContent=(key||'(빈 값)')+' ×';chip.setAttribute('aria-label',(key||'빈 값')+' 선택 해제');
    chip.addEventListener('click',()=>{comparisonKeys=comparisonKeys.filter(value=>value!==key);renderDashboard();});
    chips.append(chip);
  });
  const selectedChoice = $('#group-value').value;
  const single = comparisonKeys.length === 0 && selectedChoice !== '';
  const selectedName = single ? ($('#group-value')._values?.[Number(selectedChoice) - 1] || '(빈 값)') : '';
  $('#single-target-filter').hidden = !single;
  $('#single-target-name').textContent = single ? `${selectedName}만 보는 중` : '';
  $('#comparison-selection').hidden = comparisonKeys.length === 0;
  $('#comparison-message').textContent = comparisonKeys.length ? `${comparisonKeys.length}개 대상 비교 중` : '';
  $('#target-picker-title').textContent = comparisonKeys.length ? `${comparisonKeys.length}개 대상 선택` : single ? selectedName : '전체 대상 · 선택해서 비교';
  renderTargetOptions();
}
$('#clear-comparison').addEventListener('click', () => {comparisonKeys = []; $('#group-value').value = ''; renderDashboard();});

function showAllTargets() {
  comparisonKeys = []; $('#group-value').value = ''; renderDashboard();
}
$('#clear-single-target').addEventListener('click', showAllTargets);

function metricFormat(value, index) {
  const unit = metricTypes[index]?.unit || '';
  if (value === null || value === undefined) return '—';
  if (unit === '%') return D.displayNumber(value * 100, (metricReferences.get(index) || 0) * 100) + '%';
  return D.displayNumber(value, metricReferences.get(index) || 0) + (unit ? ' ' + unit : '');
}
function metricExact(value, index) {
  if (value === null || value === undefined) return '계산 가능한 값 없음';
  const unit = metricTypes[index]?.unit || '';
  return unit === '%' ? exact(value * 100) + '%' : exact(value) + (unit ? ' ' + unit : '');
}

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

function configureComparisonMetrics(numeric, same) {
  if (same) comparisonMetrics = comparisonMetrics.filter(index => numeric.includes(index));
  else {
    comparisonMetrics = prioritizedMetrics(numeric).slice(0, 4);
    setComparisonTab('date');
  }
}
function renderMetricPicker() {
  const chips = $('#selected-metric-chips'); chips.replaceChildren();
  comparisonMetrics.forEach(index => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'metric-chip';
    button.textContent = metricName(index) + ' ×'; button.setAttribute('aria-label', metricName(index) + ' 비교에서 제거');
    button.addEventListener('click', () => {comparisonMetrics = comparisonMetrics.filter(value => value !== index); syncMetricOptions(); renderDashboard();persistDashboardLayout(); $('#metric-picker summary')?.focus();}); chips.append(button);
  });
  const options = $('#metric-options'); options.replaceChildren();
  const numeric = currentData.columns.map((_, index) => index).filter(index => metricEligible(index));
  numeric.forEach(index => {
    const label = document.createElement('label'); const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.checked = comparisonMetrics.includes(index);
    checkbox.addEventListener('change', () => {
      comparisonMetrics = checkbox.checked ? [...new Set([...comparisonMetrics, index])] : comparisonMetrics.filter(value => value !== index);
      syncMetricOptions(); renderDashboard();persistDashboardLayout(); $('#metric-options').children[numeric.indexOf(index)]?.children[0]?.focus();
    });
    const text = document.createElement('span'); text.textContent = metricName(index); label.append(checkbox, text); options.append(label);
  });
  const excluded = metricTypes.map((type, index) => ({...type, index})).filter(type => type.conflict || type.identifier);
  if (excluded.length) {const note = document.createElement('p'); note.className = 'metric-exclusion-note'; note.textContent = excluded.map(type => `${metricName(type.index)}: ${type.identifier ? '식별자이므로 계산에서 제외' : '서로 다른 단위가 섞여 계산에서 제외'}`).join(' / '); options.append(note);}
  if (!numeric.length) {const empty = document.createElement('p'); empty.textContent = '선택할 수 있는 숫자 지표가 없습니다.'; options.append(empty);}
  $('#comparison-metric-status').textContent = comparisonMetrics.length ? `${comparisonMetrics.length}개 지표 · ${$('#aggregation').selectedOptions[0].textContent} · 조회 조건이 모든 그래프에 동일하게 적용됩니다.` : '지표 추가를 눌러 비교할 항목을 선택하세요.';
}
function showMetricDetail(index) {
  if(!metricEligible(index))return;
  selectedDetailMetric=index;syncMetricOptions(index);renderDashboard();persistDashboardLayout();

}
$('#close-metric-detail').addEventListener('click',()=>{selectedDetailMetric=-1;renderDashboard();persistDashboardLayout();});
$('#comparison-chart-mode').addEventListener('change',renderDashboard);
function comparisonColor(index){return `hsl(${(225+index*137.508)%360} 48% 53%)`;}
function renderCombinedMetricChart(rows) {
  const metrics=comparisonMetrics,grid=$('#comparison-chart-grid'),legend=$('#combined-metric-legend');
  grid.replaceChildren();legend.replaceChildren();
  const mode=$('#comparison-chart-mode');
  const sameUnits=new Set(metrics.map(index=>metricTypes[index]?.unit||'')).size<=1;
  const actualOption=[...mode.options].find(option=>option.value==='actual');
  if(actualOption)actualOption.disabled=!sameUnits;
  if(!sameUnits&&mode.value==='actual')mode.value='change';
  const actual=mode.value==='actual';
  const series=metrics.map(metric=>{
    const points=D.timeSeries(rows,dashboardProfile.dateColumn,-1,metric,operationFor(metric))[0]?.points||[];
    const base=points.find(point=>point.value!==null);
    return {metric,base,points:points.map(point=>({...point,plot:point.value===null?null:actual?point.value:base&&base.value!==0?(point.value-base.value)/Math.abs(base.value)*100:null}))};
  });
  series.forEach((item,index)=>{
    const badge=document.createElement('span');badge.className='series-label';
    const swatch=document.createElement('i');swatch.className='series-swatch';swatch.style.backgroundColor=comparisonColor(index);
    const label=document.createElement('span');label.textContent=metricName(item.metric)+' · '+operationLabelFor(item.metric);
    badge.append(swatch,label);legend.append(badge);
  });
  const omitted=series.filter(item=>!actual&&item.base?.value===0);
  $('#comparison-chart-note').textContent=actual?'선택한 대상 전체의 날짜별 실제 집계값입니다.':`각 지표의 첫 관측값 대비 변화율(%)입니다. 실제 값은 그래프에 마우스를 올려 확인하세요.${omitted.length?' 시작값이 0인 지표는 변화율을 계산하지 않습니다.':''}`;
  const values=series.flatMap(item=>item.points.filter(point=>point.plot!==null).map(point=>point.plot));
  if(!values.length){$('#comparison-chart-empty').hidden=false;$('#comparison-chart-empty').textContent='계산 가능한 값이 없습니다. 시작값이 0이면 실제 값 비교나 개별 지표 상세를 이용하세요.';return;}
  const points=series[0]?.points||[],first=points[0].day,last=points[points.length-1].day;
  const scale=D.niceScale(values),x=day=>first===last?310:66+(day-first)/(last-first)*500,y=value=>200-(value-scale.low)/(scale.high-scale.low)*160;
  const svg=svgElement('svg',{viewBox:'0 0 620 250',role:'img','aria-label':actual?'선택 지표의 실제 값 비교':'선택 지표의 첫 관측값 대비 변화율 비교'});
  scale.ticks.forEach(value=>{
    svg.append(svgElement('line',{x1:66,x2:566,y1:y(value),y2:y(value),stroke:'#edf0f6'}));
    const tick=svgElement('text',{x:58,y:y(value)+4,'text-anchor':'end',fill:'#8d99ae','font-size':10});tick.textContent=actual?metricFormat(value,metrics[0]):D.displayNumber(value)+'%';svg.append(tick);
  });
  series.forEach((item,index)=>{
    const color=comparisonColor(index);let segment=[];
    const flush=()=>{if(segment.length>1)svg.append(svgElement('polyline',{points:segment.join(' '),fill:'none',stroke:color,'stroke-width':2.5}));segment=[];};
    item.points.forEach(point=>{if(point.plot===null)flush();else segment.push(`${x(point.day)},${y(point.plot)}`);});flush();
    item.points.filter(point=>point.plot!==null).forEach(point=>{
      const lines=[new Date(point.day).toISOString().slice(0,10),'선택 범위 전체',...series.map(other=>{
        const value=other.points.find(p=>p.day===point.day)?.value??null;
        return metricName(other.metric)+' · '+operationLabelFor(other.metric)+': '+metricExact(value,other.metric);
      })];
      if(!actual)lines.push(metricName(item.metric)+' 변화율: '+exact(point.plot)+'%','기준일: '+new Date(item.base.day).toISOString().slice(0,10));
      const dot=svgElement('circle',{cx:x(point.day),cy:y(point.plot),r:4,fill:color,tabindex:0});dot.setAttribute('aria-label',lines.join(', '));attachTooltip(dot,lines);svg.append(dot);
      const hit=svgElement('circle',{cx:x(point.day),cy:y(point.plot),r:11,fill:'transparent','aria-hidden':'true'});attachTooltip(hit,lines);svg.append(hit);
    });
  });
  [...new Set([first,last])].forEach(day=>{const label=svgElement('text',{x:x(day),y:230,'text-anchor':'middle',fill:'#8d99ae','font-size':11});label.textContent=new Date(day).toISOString().slice(5,10).replace('-','/');svg.append(label);});
  grid.append(svg);
}
function renderCombinedTargets(rows,group){
  const container=$('#combined-target-chart');container.replaceChildren();
  const metrics=comparisonMetrics;
  if(!metrics.length){const empty=document.createElement('p');empty.className='comparison-chart-empty';empty.textContent='비교할 지표를 추가해 주세요.';container.append(empty);return;}
  const groups=D.compareGroups(rows,group,metrics.map(index=>({index,operation:operationFor(index)})));
  if(!groups.length){const empty=document.createElement('p');empty.className='comparison-chart-empty';empty.textContent='선택한 조건에 해당하는 대상이 없습니다.';container.append(empty);return;}
  if(!metrics.includes(targetComparisonSort.metric))targetComparisonSort={metric:metrics[0],direction:-1};
  const sortPosition=metrics.indexOf(targetComparisonSort.metric);
  const sorted=[...groups].sort((a,b)=>{
    const x=a.values[sortPosition],y=b.values[sortPosition];
    if(x===null)return y===null?a.key.localeCompare(b.key):1;
    if(y===null)return -1;
    return (x-y)*targetComparisonSort.direction||a.key.localeCompare(b.key);
  });
  const scales=metrics.map((_,position)=>{
    const values=groups.map(item=>item.values[position]).filter(value=>value!==null);
    const low=Math.min(0,...values),high=Math.max(0,...values),span=high-low||1;
    const ranks=new Map();[...values].sort((a,b)=>b-a).forEach((value,index)=>{if(!ranks.has(value))ranks.set(value,index+1);});
    return {low,high,span,ranks};
  });
  const matrix=document.createElement('div');matrix.className='target-matrix';matrix.setAttribute('role','table');matrix.setAttribute('aria-label','대상별 지표 비교 차트');
  matrix.style.gridTemplateColumns=`minmax(165px,1fr) repeat(${metrics.length},minmax(180px,1fr))`;
  const header=document.createElement('div');header.className='target-matrix-row target-matrix-header';header.setAttribute('role','row');
  const corner=document.createElement('div');corner.className='target-matrix-name';corner.setAttribute('role','columnheader');corner.textContent=metricName(group)+' · '+groups.length+'개';header.append(corner);
  metrics.forEach((metric,position)=>{
    const cell=document.createElement('div');cell.className='target-matrix-column';cell.setAttribute('role','columnheader');
    const active=targetComparisonSort.metric===metric;cell.setAttribute('aria-sort',active?targetComparisonSort.direction===-1?'descending':'ascending':'none');
    const button=document.createElement('button');button.type='button';button.className='target-matrix-sort';
    const swatch=document.createElement('i');swatch.style.backgroundColor=comparisonColor(position);
    const title=document.createElement('span');title.textContent=metricName(metric)+(active?targetComparisonSort.direction===-1?' ↓':' ↑':' ↕');
    button.append(swatch,title);button.setAttribute('aria-label',metricName(metric)+' 값 순서로 정렬');
    button.addEventListener('click',()=>{targetComparisonSort={metric,direction:active?-targetComparisonSort.direction:-1};renderCombinedTargets(rows,group);});
    const calculation=document.createElement('small');calculation.textContent=operationLabelFor(metric);cell.append(button,calculation);header.append(cell);
  });matrix.append(header);
  sorted.forEach(item=>{
    const row=document.createElement('div');row.className='target-matrix-row';row.setAttribute('role','row');
    const name=document.createElement('div');name.className='target-matrix-name';name.setAttribute('role','rowheader');
    const label=document.createElement('button');label.type='button';label.textContent=item.key||'(빈 값)';label.title='이 대상만 보기';
    label.addEventListener('click',()=>{comparisonKeys=[];$('#group-value').value=String($('#group-value')._values.indexOf(item.key)+1);renderDashboard();});name.append(label);row.append(name);
    metrics.forEach((metric,position)=>{
      const value=item.values[position],scale=scales[position];
      const cell=document.createElement('div');cell.className='target-matrix-cell';cell.setAttribute('role','cell');cell.tabIndex=0;
      const numbers=document.createElement('div');numbers.className='target-matrix-numbers';
      const amount=document.createElement('strong');amount.textContent=metricFormat(value,metric);
      const rank=document.createElement('span');rank.textContent=value===null?'값 없음':scale.ranks.get(value)+'위';numbers.append(amount,rank);
      const track=document.createElement('div');track.className='target-matrix-track';track.setAttribute('aria-hidden','true');
      const zero=(0-scale.low)/scale.span*100,axis=document.createElement('i');axis.className='target-matrix-zero';axis.style.left=zero+'%';track.append(axis);
      if(value!==null){const end=(value-scale.low)/scale.span*100,bar=document.createElement('i');bar.className='target-matrix-bar';bar.style.left=Math.min(zero,end)+'%';bar.style.width=Math.abs(end-zero)+'%';bar.style.backgroundColor=value<0?'#bf8491':comparisonColor(position);track.append(bar);}
      cell.append(numbers,track);attachTooltip(cell,[item.key||'(빈 값)',metricName(metric)+' · '+operationLabelFor(metric),metricExact(value,metric),value===null?'계산 가능한 값이 없습니다.':'값이 큰 순서 '+scale.ranks.get(value)+'위 / '+groups.length+'개 대상']);row.append(cell);
    });matrix.append(row);
  });container.append(matrix);
}

function renderMetricComparison(rows, operation, label) {
  const selected = comparisonMetrics;
  const dateColumn = dashboardProfile.dateColumn;
  const ready = dateColumn >= 0 && selected.length > 0;
  const grid = $('#comparison-chart-grid'); grid.replaceChildren();
  $('#comparison-chart-empty').hidden = ready;
  $('#comparison-chart-empty').textContent = !selected.length ? '비교할 지표를 추가해 주세요.' : '날짜 컬럼을 찾지 못했습니다. 대상별 비교에서 집계를 확인하세요.';
  if (!ready) {$('#combined-metric-legend').replaceChildren();$('#comparison-chart-note').textContent='';return;}
  renderCombinedMetricChart(rows);
}
function setComparisonTab(name, focus = false) {
  for (const tab of ['date', 'target']) {
    const active = tab === name, button = $(`#${tab}-comparison-tab`);
    button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    $(`#${tab}-comparison-panel`).hidden = !active;
    if (active && focus) button.focus();
  }
  hideTooltip();
}
for (const name of ['date', 'target']) {
  const tab = $(`#${name}-comparison-tab`);
  tab.addEventListener('click', () => setComparisonTab(name));
  tab.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); setComparisonTab(event.key === 'Home' ? 'date' : event.key === 'End' ? 'target' : name === 'date' ? 'target' : 'date', true);
    }
  });
}
document.addEventListener('click', event => {if (!$('#metric-picker').contains(event.target)) $('#metric-picker').open = false;});
$('#metric-picker').addEventListener('keydown', event => {if (event.key === 'Escape') {$('#metric-picker').open = false; $('#metric-picker summary')?.focus();}});
async function initializeDefaultDocument() {
  // Always begin with manual connection; never open the server's test document.
  if (!currentData && !busy) {
    setSetupStep(1,true);setSetupStep(2,false);setSetupStep(3,false);
    $('#step-2-toggle').disabled=true;$('#step-3-toggle').disabled=true;
    navigate('sheets');
  }
}
initializeDefaultDocument();

function analysisCalendarDays(){return (currentData?.rows||[]).map(row=>D.date(row[dashboardProfile?.dateColumn??-1]));}
function analysisPreset(months,comparison){
  const result=AdSightAnomalies.resolvePeriods({days:analysisCalendarDays(),months:months||$('#analysis-window').value||'7d',from:$('#analysis-from').value,to:$('#analysis-to').value,comparison:comparison||$('#analysis-compare-mode').value||'previous',previousFrom:$('#analysis-previous-from').value,previousTo:$('#analysis-previous-to').value});
  return result.error?null:result;
}
const analysisCalendar=AdSightDates.create({prefix:'analysis-main-',getDays:analysisCalendarDays,getSelectableDays:()=>[...analysisCalendarDays(),D.date($('#analysis-from').value),D.date($('#analysis-to').value)],getRange:()=>({from:$('#analysis-from').value,to:$('#analysis-to').value}),onApply:range=>{$('#analysis-from').value=range.from;$('#analysis-to').value=range.to;$('#analysis-window').value=range.mode||'custom';renderAnalysis();},presetActions:[['week','7d'],['fortnight','14d'],['month','1'],['quarter','3']].map(([key,months])=>({id:'#date-preset-'+key,value:()=>{const range=analysisPreset(months);return range?{from:range.from,to:range.to,mode:months}:null;}}))});
const comparisonCalendar=AdSightDates.create({prefix:'analysis-ref-',getDays:analysisCalendarDays,getSelectableDays:()=>[...analysisCalendarDays(),D.date($('#analysis-previous-from').value),D.date($('#analysis-previous-to').value)],getRange:()=>({from:$('#analysis-previous-from').value,to:$('#analysis-previous-to').value}),onApply:range=>{$('#analysis-previous-from').value=range.from;$('#analysis-previous-to').value=range.to;$('#analysis-compare-mode').value=range.mode||'custom';renderAnalysis();},presetActions:['previous','month','quarter','year'].map(mode=>({id:'#date-preset-'+mode,value:()=>{const range=analysisPreset(null,mode);return range?{from:range.previousFrom,to:range.previousTo,mode}:null;}}))});
function buildFindingContext(rows,finding,period,metrics,group,dateColumn){
  if(!period)return null;
  const inPeriod=(start,end)=>rows.filter(row=>{const day=D.date(row[dateColumn]);return day!==null&&day>=D.date(start)&&day<=D.date(end);});
  const current=inPeriod(period.start,period.end),previous=inPeriod(period.previousStart,period.previousEnd);
  const pair=(index,aggregation)=>{
    const a=D.aggregate(current,-1,index,aggregation)[0],b=D.aggregate(previous,-1,index,aggregation)[0];
    return {before:b?.value??null,after:a?.value??null,current_samples:a?.valid||0,previous_samples:b?.valid||0};
  };
  const related=metrics.filter(item=>item.index!==finding.index).slice(0,3).map(item=>({name:item.name.slice(0,300),description:(columnSettings[item.index]?.description||'').slice(0,500),aggregation:item.aggregation,...pair(item.index,item.aggregation)}));
  const result={related_metrics:related,group_by:group>=0?metricName(group).slice(0,300):'',group_count:0,groups:[],daily:null};
  if(finding.index===undefined)return result;
  const metric=finding.index,aggregation=finding.aggregation||operationFor(metric);
  function daily(data){
    const byDay=new Map();data.forEach(row=>{const day=D.date(row[dateColumn]);if(!byDay.has(day))byDay.set(day,[]);byDay.get(day).push(row);});
    const points=[...byDay].sort((a,b)=>a[0]-b[0]).map(([day,rows])=>{const stat=D.aggregate(rows,-1,metric,aggregation)[0];return {date:new Date(day).toISOString().slice(0,10),value:stat?.value??null,samples:stat?.valid||0};});
    if(points.length<=30)return {points,total:points.length};
    // Retain endpoints and extreme values, plus an evenly spaced view of the period.
    const finite=points.map((p,i)=>({value:p.value,index:i})).filter(p=>p.value!==null).sort((a,b)=>a.value-b.value);
    const chosen=new Set([0,points.length-1,...(finite.length?[finite[0].index,finite[finite.length-1].index]:[])]);
    for(let i=0;i<26;i++)chosen.add(Math.round(i*(points.length-1)/25));
    return {points:[...chosen].sort((a,b)=>a-b).slice(0,30).map(i=>points[i]),total:points.length};
  }
  const a=daily(current),b=daily(previous);
  result.daily={current:a.points,previous:b.points,current_days:a.total,previous_days:b.total};
  if(group>=0){
    const old=new Map(D.aggregate(previous,group,metric,aggregation).map(item=>[item.key,item]));
    const fresh=new Map(D.aggregate(current,group,metric,aggregation).map(item=>[item.key,item]));
    const keys=[...new Set([...old.keys(),...fresh.keys()])];result.group_count=keys.length;
    if(keys.length>1)result.groups=keys.map(key=>({name:(key||'(빈 값)').slice(0,160),before:old.get(key)?.value??null,after:fresh.get(key)?.value??null,previous_samples:old.get(key)?.valid||0,current_samples:fresh.get(key)?.valid||0})).sort((a,b)=>Math.abs((b.after??0)-(b.before??0))-Math.abs((a.after??0)-(a.before??0))).slice(0,5);
  }
  return result;
}

function findingLabel(index){return columnSettings[index]?.label||currentData.columns[index]||'지표';}
function findingBreakdown(rows,finding,period,dateColumn,dimension){
  if(!period||dimension<0)return [];
  const aggregate=(start,end)=>new Map(D.aggregate(rows.filter(row=>{const day=D.date(row[dateColumn]);return day!==null&&day>=D.date(start)&&day<=D.date(end);}),dimension,finding.index,finding.aggregation||analysisOperationFor(finding.index)).map(item=>[item.key,item]));
  const before=aggregate(period.previousStart,period.previousEnd),after=aggregate(period.start,period.end);
  return [...new Set([...before.keys(),...after.keys()])].map(key=>{
    const a=before.get(key),b=after.get(key),valid=a?.valid>=3&&b?.valid>=3;
    return {key,before:a?.value??null,after:b?.value??null,previous:a?.valid||0,current:b?.valid||0,pct:valid&&a.value!==0?(b.value-a.value)/Math.abs(a.value)*100:null,valid};
  }).sort((a,b)=>{
    if(a.valid!==b.valid)return a.valid?-1:1;
    if(finding.pct<0)return (a.pct??Infinity)-(b.pct??Infinity);
    return (b.pct??-Infinity)-(a.pct??-Infinity);
  });
}
function renderFindingBreakdown(host,finding,rows,period,dateColumn,onSelect){
  const dimensions=columnSettings.map((item,index)=>({...item,index})).filter(item=>item.role==='dimension');
  if(!dimensions.length)return;
  const section=document.createElement('section');section.className='finding-breakdown';
  const heading=document.createElement('div');heading.className='finding-breakdown-heading';
  const title=document.createElement('h3');title.textContent='대상별 변화';
  const select=document.createElement('select');select.setAttribute('aria-label','상세 비교 기준');
  dimensions.forEach(item=>select.append(new Option(findingLabel(item.index),item.index)));
  const preferred=dimensions.some(item=>item.index===analysisGroup)?analysisGroup:dimensions[0].index;select.value=String(preferred);
  const body=document.createElement('div');heading.append(title,select);section.append(heading,body);host.append(section);
  const draw=()=>{
    body.replaceChildren();const dimension=Number(select.value),all=findingBreakdown(rows,finding,period,dateColumn,dimension),items=all.slice(0,8);
    const summary=document.createElement('p');summary.className='finding-breakdown-summary';
    const first=all.find(item=>item.valid&&item.pct!==null&&(finding.pct<0?item.pct<0:item.pct>0));
    summary.textContent=first?findingLabel(dimension)+'의 “'+(first.key||'(빈 값)')+'”에서 '+findingLabel(finding.index)+' '+calculationNames[finding.aggregation||analysisOperationFor(finding.index)]+'이 '+metricFormat(first.before,finding.index)+' → '+metricFormat(first.after,finding.index)+'로 '+Math.abs(first.pct).toFixed(1)+'% '+(first.pct<0?'감소':'증가')+'했습니다.':'대상별 값을 비교해 보세요. 두 기간 모두 숫자 값이 3개 이상인 대상만 증감률을 계산합니다.';
    body.append(summary);
    const max=Math.max(0,...items.flatMap(item=>[Math.abs(item.before??0),Math.abs(item.after??0)]))||1;
    const list=document.createElement('div');list.className='finding-breakdown-items';body.append(list);
    items.forEach(item=>{
      const row=document.createElement('div');row.className='finding-breakdown-row';
      const name=document.createElement('button');name.type='button';name.className='finding-target-button';name.textContent=item.key||'(빈 값)';name.setAttribute('aria-label',(item.key||'(빈 값)')+' 일별 추이 보기');name.addEventListener('click',()=>onSelect?.(dimension,item.key));row.append(name);
      for(const [label,value,count,color] of [['비교',item.before,item.previous,'#a0a9bc'],['확인',item.after,item.current,'#5965d8']]){
        const line=document.createElement('div');line.className='finding-breakdown-bar';const caption=document.createElement('span');caption.textContent=label;
        const track=document.createElement('div'),bar=document.createElement('i');bar.style.width=(value===null?0:Math.abs(value)/max*100)+'%';bar.style.backgroundColor=color;track.append(bar);
        const text=document.createElement('span');text.textContent=value===null?'데이터 없음':metricFormat(value,finding.index);text.title=metricExact(value,finding.index)+' · 숫자 값 '+count+'개';line.append(caption,track,text);row.append(line);
      }
      const delta=document.createElement('small');delta.textContent=item.pct!==null?(item.pct>0?'+':'')+item.pct.toFixed(1)+'%':!item.previous?'이전 기간 숫자 값 없음':!item.current?'현재 기간 숫자 값 없음':item.before===0?'이전 값 0 · 증감률 계산 불가':'표본 부족 · 기간별 3개 미만';row.append(delta);list.append(row);
    });
    const note=document.createElement('small');note.className='finding-breakdown-note';note.textContent=(all.length>8?'전체 '+all.length+'개 중 변화 방향 기준 상위 8개입니다. ':'')+'막대 길이는 값의 크기(절댓값)입니다. '+(finding.aggregation==='mean'?'대상별 평균 변화는 전체 평균 감소의 기여도나 원인을 뜻하지 않습니다.':'대상별 변화는 원인을 확정하는 근거가 아닙니다.');body.append(note);
  };select.addEventListener('change',draw);draw();
}
const expandedFindingCharts=new Set();
function renderFindingChart(host,finding,rows,period,dateColumn,trendOnly=false){
  host.replaceChildren();const root=host;
  if(!period){host.textContent='비교 기간을 먼저 선택해 주세요.';return;}
  const numeric=finding.kind==='change'&&finding.index!==undefined;
  if(numeric&&!trendOnly){
    const context=document.createElement('p');context.className='finding-detail-context';context.textContent='대상별 '+findingLabel(finding.index)+' '+calculationNames[finding.aggregation||analysisOperationFor(finding.index)]+' 비교';host.append(context);
    renderFindingBreakdown(host,finding,rows,period,dateColumn,(dimension,key)=>{
      const old=root.querySelectorAll('section');
      for(const section of old)if(section.className==='finding-timeline')section.hidden=true;
      let target=root._targetTrend;
      if(!target){target=document.createElement('section');target.className='finding-selected-trend';root._targetTrend=target;root.append(target);}
      target.replaceChildren();const label=document.createElement('h3');label.textContent=findingLabel(dimension)+' · '+(key||'(빈 값)');
      const back=document.createElement('button');back.type='button';back.className='text-button';back.textContent='대상별 비교로 돌아가기';back.addEventListener('click',()=>{target.hidden=true;for(const section of root.querySelectorAll('section'))if(section.className==='finding-breakdown')section.hidden=false;});
      const chart=document.createElement('div');target.append(back,label,chart);target.hidden=false;
      for(const section of root.querySelectorAll('section'))if(section.className==='finding-breakdown')section.hidden=true;
      renderFindingChart(chart,finding,rows.filter(row=>D.text(row[dimension])===key),period,dateColumn,true);
    });
  }
  const timeline=document.createElement('section');timeline.className='finding-timeline';timeline.hidden=numeric&&!trendOnly&&columnSettings.some(item=>item.role==='dimension');host.append(timeline);host=timeline;
  const heading=document.createElement('h3');heading.textContent=numeric?findingLabel(finding.index)+' · 일별 '+calculationNames[finding.aggregation||analysisOperationFor(finding.index)]:'기간별 데이터 분포';host.append(heading);
  const legend=document.createElement('p');legend.className='finding-chart-legend';legend.textContent='● 확인할 기간   ○ 비교할 기간';host.append(legend);
  const ranges=[[period.start,period.end,'확인할 기간','#5965d8'],[period.previousStart,period.previousEnd,'비교할 기간','#a0a9bc']];
  const series=ranges.map(([start,end,label,color])=>{
    const first=D.date(start),last=D.date(end),days=new Map();
    rows.forEach(row=>{const day=D.date(row[dateColumn]);if(day!==null&&day>=first&&day<=last){if(!days.has(day))days.set(day,[]);days.get(day).push(row);}});
    const points=[];
    for(let day=first;day<=last;day+=86400000){
      const records=days.get(day)||[],stat=numeric?D.aggregate(records,-1,finding.index,finding.aggregation||analysisOperationFor(finding.index))[0]:null;
      points.push({day,value:numeric?(stat?.value??null):records.length});
    }
    return {points,label,color};
  });
  const values=series.flatMap(s=>s.points.map(p=>p.value)).filter(v=>v!==null);
  if(!values.length){host.append(document.createTextNode('표시할 숫자 값이 없습니다.'));return;}
  const scale=D.niceScale(values),length=Math.max(...series.map(s=>s.points.length));
  const x=i=>length===1?310:66+i/(length-1)*500,y=v=>200-(v-scale.low)/(scale.high-scale.low)*160;
  const svg=svgElement('svg',{viewBox:'0 0 620 250',role:'img','aria-label':heading.textContent});
  scale.ticks.forEach(v=>{svg.append(svgElement('line',{x1:66,x2:566,y1:y(v),y2:y(v),stroke:'#edf0f6'}));const t=svgElement('text',{x:58,y:y(v)+4,'text-anchor':'end','font-size':10,fill:'#8d99ae'});t.textContent=numeric?metricFormat(v,finding.index):D.displayNumber(v);svg.append(t);});
  series.forEach(({points,label,color})=>{
    let segment=[];const flush=()=>{if(segment.length>1)svg.append(svgElement('polyline',{points:segment.join(' '),fill:'none',stroke:color,'stroke-width':2.5}));segment=[];};
    points.forEach((p,i)=>{if(p.value===null){flush();return;}segment.push(x(i)+','+y(p.value));const dot=svgElement('circle',{cx:x(i),cy:y(p.value),r:4,fill:color,tabindex:0});const lines=[label+' · '+new Date(p.day).toISOString().slice(0,10),numeric?metricExact(p.value,finding.index):p.value+'행'];dot.setAttribute('aria-label',lines.join(', '));attachTooltip(dot,lines);svg.append(dot);});flush();
  });
  [0,length-1].filter((v,i,a)=>a.indexOf(v)===i).forEach(i=>{const t=svgElement('text',{x:x(i),y:230,'text-anchor':'middle','font-size':11,fill:'#8d99ae'});t.textContent=(i+1)+'일째';svg.append(t);});host.append(svg);
  const note=document.createElement('small');note.textContent=numeric?'기간 시작일을 맞춰 비교합니다. 값이 없는 날은 선을 연결하지 않습니다.':'유효한 날짜가 있는 행의 일별 개수입니다. 날짜를 읽을 수 없는 행은 제외됩니다.';host.append(note);
  if(finding.kind==='quality'&&finding.index!==undefined){
    const coverage=document.createElement('div');coverage.className='finding-coverage';
    ranges.forEach(([start,end,label])=>{const records=rows.filter(r=>{const d=D.date(r[dateColumn]);return d!==null&&d>=D.date(start)&&d<=D.date(end);}),valid=records.filter(r=>D.number(r[finding.index])!==null).length;const text=document.createElement('p');text.textContent=label+': 유효 숫자 '+valid+'개 · 누락·숫자 아님 '+(records.length-valid)+'개';coverage.append(text);});host.append(coverage);
  }
}
function renderAnalysis() {
  const ready = !!currentData?.columns.length;
  $('#analysis-empty').hidden = ready; $('#analysis-content').hidden = !ready;
  if (!ready) return;
  const metricContext=JSON.stringify([columnSettingsKey,currentData.sheet.id,currentData.columns]);
  if(analysisMetricContext!==metricContext){
    analysisMetricContext=metricContext;analysisMetrics=[...comparisonMetrics];analysisGroup=dashboardProfile.groupColumn??-1;analysisTargets=[];$('#analysis-aggregation').value='configured';
  }
  const dimensions=columnSettings.map((item,index)=>({...item,index})).filter(item=>item.role==='dimension');
  if(!dimensions.some(item=>item.index===analysisGroup))analysisGroup=dimensions[0]?.index??-1;
  const groupSelect=$('#analysis-group-column');groupSelect.replaceChildren(...(dimensions.length?dimensions.map(item=>new Option(findingLabel(item.index),item.index)):[new Option('비교 기준 없음',-1)]));groupSelect.value=String(analysisGroup);
  const available=analysisGroup<0?[]:[...new Set(currentData.rows.map(row=>D.text(row[analysisGroup])))].sort();
  analysisTargets=analysisTargets.filter(value=>available.includes(value));
  const targetOptions=$('#analysis-target-options');targetOptions.replaceChildren();
  const all=document.createElement('label'),allCheck=document.createElement('input');allCheck.type='checkbox';allCheck.checked=!analysisTargets.length;allCheck.addEventListener('change',()=>{analysisTargets=[];renderAnalysis();});const allText=document.createElement('span');allText.textContent='전체 대상';all.append(allCheck,allText);targetOptions.append(all);
  available.forEach(value=>{const label=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span');check.type='checkbox';check.checked=analysisTargets.includes(value);text.textContent=value||'(빈 값)';check.addEventListener('change',()=>{analysisTargets=check.checked?[...analysisTargets,value]:analysisTargets.filter(item=>item!==value);renderAnalysis();});label.append(check,text);targetOptions.append(label);});
  $('#analysis-target-label').textContent=analysisTargets.length?analysisTargets.length+'개 대상 선택':'전체 대상';

  analysisMetrics=analysisMetrics.filter(metricEligible);
  const options=$('#analysis-metric-options');options.replaceChildren();
  currentData.columns.forEach((_,index)=>{
    if(!metricEligible(index))return;
    const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=analysisMetrics.includes(index);
    check.addEventListener('change',()=>{analysisMetrics=check.checked?[...new Set([...analysisMetrics,index])]:analysisMetrics.filter(value=>value!==index);renderAnalysis();});
    const text=document.createElement('span');text.textContent=metricName(index);label.append(check,text);options.append(label);
  });
  const chips=$('#analysis-metric-chips');chips.replaceChildren();
  analysisMetrics.forEach(index=>{
    const chip=document.createElement('button');chip.type='button';chip.className='metric-chip';chip.textContent=findingLabel(index)+' ×';chip.title=metricName(index);chip.setAttribute('aria-label',metricName(index)+' 분석에서 제거');
    chip.addEventListener('click',()=>{analysisMetrics=analysisMetrics.filter(value=>value!==index);renderAnalysis();});chips.append(chip);
  });
  const group=analysisGroup,key=null,comparisonKeys=analysisTargets;
  const rows=currentData.rows.filter(row=>!analysisTargets.length||analysisTargets.includes(D.text(row[group])));
  const metrics = analysisMetrics.map(index => ({index, name: metricName(index), aggregation: analysisOperationFor(index)}));
  const operation = $('#analysis-aggregation').value;
  const scope=comparisonKeys.length?comparisonKeys.join(', '):key??'전체 대상';
  $('#analysis-scope').textContent = scope;
  const periods=AdSightAnomalies.resolvePeriods({days:currentData.rows.map(row=>D.date(row[dashboardProfile.dateColumn])),months:$('#analysis-window').value||'7d',from:$('#analysis-from').value,to:$('#analysis-to').value,comparison:$('#analysis-compare-mode').value||'previous',previousFrom:$('#analysis-previous-from').value,previousTo:$('#analysis-previous-to').value});
  if(!periods.error){
    $('#analysis-from').value=periods.from;$('#analysis-to').value=periods.to;
    $('#analysis-previous-from').value=periods.previousFrom;$('#analysis-previous-to').value=periods.previousTo;
    analysisCalendar.refresh();comparisonCalendar.refresh();
  }
  const increaseThreshold=Number($('#analysis-increase-threshold').value),decreaseThreshold=Number($('#analysis-decrease-threshold').value);
  const invalidThreshold=[increaseThreshold,decreaseThreshold].some(value=>!Number.isInteger(value)||value<1||value>1000);
  const problem=periods.error||(invalidThreshold?'변화율은 1~1000 사이의 정수로 입력해 주세요.':'');
  const result = problem?{findings:[],checked:0,reason:problem}:AdSightAnomalies.inspect({rows,dateColumn:dashboardProfile.dateColumn,metrics,operation,from:periods.from,to:periods.to,previousFrom:periods.previousFrom,previousTo:periods.previousTo,increaseThreshold,decreaseThreshold});
  $('#analysis-period').textContent = problem||periods.warning||'';
  const summary = $('#analysis-summary');summary.replaceChildren();
  for (const [label,value] of [['변화',result.findings.filter(item=>item.kind==='change').length],['데이터 확인',result.findings.filter(item=>item.kind==='quality').length],['분석 지표',result.checked]]) {
    const card=document.createElement('div'),title=document.createElement('span'),count=document.createElement('strong');title.textContent=label;count.textContent=value+(label==='분석 지표'?'개':'건');card.append(title,count);summary.append(card);
  }
  $('#analysis-message').textContent = !metrics.length ? '분석할 지표를 선택해 주세요.' : result.reason || '';
  const findings=$('#analysis-findings');findings.replaceChildren();
  result.findings.forEach(finding=>{
    const card=document.createElement('article');card.className='finding-card '+finding.kind;
    const overview=document.createElement('div');overview.className='finding-overview';card.append(overview);
    const header=document.createElement('div');header.className='finding-header';
    const badge=document.createElement('span');badge.className='finding-badge';badge.textContent=finding.kind==='change'?(group>=0?findingLabel(group)+' · '+(comparisonKeys.length?comparisonKeys.join(', '):key??'전체 대상'):'전체 데이터'):'데이터 확인';
    header.append(badge);
    const title=document.createElement('h2');title.textContent=finding.kind==='change'&&finding.pct!==null?finding.metric+' '+calculationNames[finding.aggregation||analysisOperationFor(finding.index)]+' '+(finding.pct>0?'증가':'감소')+' · '+Math.abs(finding.pct).toFixed(1)+'%':finding.title;
    overview.append(header,title);
    if(finding.kind==='change'){
      const context=document.createElement('p');context.className='finding-scope-description';
      const selectedCount=comparisonKeys.length||(key!==null?1:0);
      const subject=selectedCount===1?'선택한 대상':selectedCount>1?'선택한 '+selectedCount+'개 대상':'전체 대상';
      context.textContent=subject+'의 '+calculationNames[finding.aggregation||analysisOperationFor(finding.index)]+'을 비교했습니다.';
      if(group>=0&&selectedCount!==1&&finding.pct!==null){
        const matches=findingBreakdown(rows,finding,result.period,dashboardProfile.dateColumn,group).filter(item=>item.valid&&item.pct!==null&&(finding.pct<0?item.pct<=-decreaseThreshold:item.pct>=increaseThreshold));
        if(matches.length)context.textContent+=' '+findingLabel(group)+'별로는 '+matches.slice(0,2).map(item=>item.key||'(빈 값)').join(', ')+(matches.length>2?' 외 '+(matches.length-2)+'개':'')+'에서도 '+(finding.pct<0?'감소':'증가')+'했습니다.';
      }
      overview.append(context);
    }

    if(finding.kind==='quality'){const description=document.createElement('p');description.textContent=finding.detail;overview.append(description);}
    if(finding.before!==undefined){
      const evidence=document.createElement('div');evidence.className='finding-values';
      for(const [label,value] of [['이전 기간',finding.before],['현재 기간',finding.after]]){
        const block=document.createElement('div'),caption=document.createElement('span'),number=document.createElement('strong');caption.textContent=label+' · '+(label==='이전 기간'?result.period.previousStart+' ~ '+result.period.previousEnd:result.period.start+' ~ '+result.period.end);number.textContent=metricFormat(value,finding.index);number.title=metricExact(value,finding.index);block.append(caption,number);evidence.append(block);
      }
      overview.append(evidence);
    }
    if(finding.currentSamples!==undefined){const samples=document.createElement('small');samples.className='finding-samples';samples.textContent=`숫자 표본: 이전 ${finding.previousSamples}개 · 현재 ${finding.currentSamples}개${finding.aggregation?' · '+calculationNames[finding.aggregation]:''}`;overview.append(samples);}
    const payload={provider:'nvidia',finding:{kind:finding.kind,title:finding.title.slice(0,300),detail:finding.detail.slice(0,2000),metric:(finding.metric||'').slice(0,300),metric_description:(columnSettings[finding.index]?.description||'').slice(0,500),before:finding.before??null,after:finding.after??null,change_pct:finding.pct??null,aggregation:finding.aggregation||'',current_samples:finding.currentSamples??null,previous_samples:finding.previousSamples??null},period:result.period||null,scope:scope.slice(0,600),dataset_summary:(datasetInterpretation?.summary||'').slice(0,2000),threshold:finding.pct===null||finding.pct===undefined?null:finding.pct>=0?increaseThreshold:decreaseThreshold,increase_threshold:increaseThreshold,decrease_threshold:decreaseThreshold};
    payload.context=buildFindingContext(rows,finding,result.period,metrics,group,dashboardProfile.dateColumn);
    payload.quality_notices=result.findings.filter(item=>item.kind==='quality').slice(0,5).map(item=>item.detail.slice(0,500));
    const cacheKey=JSON.stringify([activeSource,currentData.sheet.id,payload]);
    const cached=findingExplanations.get(cacheKey);
    const actions=document.createElement('div');actions.className='finding-ai-actions';
    const graph=document.createElement('button');graph.type='button';graph.className='secondary finding-chart-toggle';
    const chart=document.createElement('section');chart.className='finding-chart';
    const explanation=document.createElement('section');explanation.className='finding-ai-explanation';
    const toggleChart=()=>{const open=expandedFindingCharts.has(cacheKey);card.classList.toggle('finding-expanded',open);chart.hidden=!open;explanation.hidden=!open;graph.textContent=open?'접기':'분석 펼치기';graph.setAttribute('aria-expanded',String(open));if(open)renderFindingChart(chart,finding,rows,result.period,dashboardProfile.dateColumn);};
    graph.addEventListener('click',()=>{
      if(expandedFindingCharts.has(cacheKey)){expandedFindingCharts.delete(cacheKey);toggleChart();return;}
      expandedFindingCharts.add(cacheKey);
      if(expandedFindingCharts.size>100)expandedFindingCharts.delete(expandedFindingCharts.values().next().value);
      toggleChart();
      const latest=findingExplanations.get(cacheKey);
      if(aiProvider==='nvidia'&&!aiBusy&&!latest?.result&&!latest?.pending)explainFinding(payload,cacheKey);
    });toggleChart();
    actions.append(graph);card.append(chart,explanation,actions);
    if(cached?.error){const error=document.createElement('p');error.className='finding-ai-error';error.setAttribute('role','status');error.textContent=cached.error;explanation.append(error);}
    if(cached?.result){
      const aiHeading=document.createElement('h3');aiHeading.textContent='AI 해석';explanation.append(aiHeading);
      const description=document.createElement('p');description.textContent=cached.result.interpretation;explanation.append(description);
      for(const [heading,items] of [['참고할 점',cached.result.limitations],['확인해 보세요',cached.result.next_checks]]){
        if(!items?.length)continue;
        const title=document.createElement('h3');title.textContent=heading;const list=document.createElement('ul');items.forEach(item=>{const li=document.createElement('li');li.textContent=item;list.append(li);});explanation.append(title,list);
      }
    }else{
      const title=document.createElement('h3');title.textContent='AI 해석';const text=document.createElement('p');text.textContent=cached?.pending?'변화와 관련 데이터를 해석하고 있습니다.':cached?.error?'접었다가 다시 열면 해석을 재시도합니다.':aiProvider!=='nvidia'?'AI 연결을 사용할 수 없습니다. 왼쪽에서 데이터는 확인할 수 있습니다.':aiBusy?'다른 AI 요청을 처리 중입니다. 완료 후 접었다가 다시 열어 주세요.':'AI 해석을 준비하고 있습니다.';explanation.append(title,text);
    }
    findings.append(card);
  });
  if(!result.findings.length) {const empty=document.createElement('p');empty.className='analysis-clear';empty.textContent=result.checked?'설정한 기준에 해당하는 특이사항이 없습니다.':'점검할 데이터와 비교 기간을 확인해 주세요.';findings.append(empty);}
}
async function explainFinding(payload,key){
  if(aiBusy||aiProvider!=='nvidia')return;
  const data=currentData;
  const prior=findingExplanations.get(key)?.result;
  findingExplanations.set(key,{pending:true,result:prior});
  aiBusy=true;updateAIControls();renderAnalysis();
  try{
    const result=await aiRequest('explain-finding',payload);
    if(currentData===data)findingExplanations.set(key,{result});else findingExplanations.delete(key);
  }catch(error){findingExplanations.set(key,{error:error.message,result:prior});}
  finally{
    aiBusy=false;updateAIControls();
    while(findingExplanations.size>50)findingExplanations.delete(findingExplanations.keys().next().value);
    renderAnalysis();
  }
}

$('#analysis-group-column').addEventListener('change',()=>{analysisGroup=Number($('#analysis-group-column').value);analysisTargets=[];renderAnalysis();});
$('#analysis-aggregation').addEventListener('change',renderAnalysis);
document.addEventListener('click',event=>{const picker=$('#analysis-target-picker');const path=event.composedPath?.()||[];if(!path.includes(picker)&&!picker.contains(event.target))picker.open=false;});
$('#analysis-target-picker').addEventListener('keydown',event=>{if(event.key==='Escape'){$('#analysis-target-picker').open=false;$('#analysis-target-label').focus();}});
document.addEventListener('click',event=>{
  const picker=$('#analysis-metric-picker');
  if(!picker)return;
  // Selecting a checkbox rebuilds the options before this event reaches document.
  const path=typeof event.composedPath==='function'?event.composedPath():[];
  if(!path.includes(picker)&&!picker.contains(event.target))picker.open=false;
});
$('#analysis-metric-picker').addEventListener('keydown',event=>{
  if(event.key==='Escape'){
    $('#analysis-metric-picker').open=false;
    $('#analysis-metric-picker summary')?.focus();
  }
});
$('#analysis-connect').addEventListener('click',()=>navigate('sheets'));
['#analysis-window','#analysis-compare-mode','#analysis-increase-threshold','#analysis-decrease-threshold'].forEach(selector=>$(selector).addEventListener('change',renderAnalysis));
['#analysis-from','#analysis-to'].forEach(selector=>$(selector).addEventListener('change',()=>{$('#analysis-window').value='custom';renderAnalysis();}));
['#analysis-previous-from','#analysis-previous-to'].forEach(selector=>$(selector).addEventListener('change',()=>{$('#analysis-compare-mode').value='custom';renderAnalysis();}));

let dashboardSaveQueue=Promise.resolve();
function dashboardSnapshot(){return {columns:currentData.columns,cards:metricSettings.map(item=>item.index),selected_metric:selectedDetailMetric,comparison_metrics:[...comparisonMetrics]};}
function restoreDashboardLayout(layout){
  if(!layout||!Array.isArray(layout.columns)||!Array.isArray(layout.cards))return;
  const names=currentData.columns,old=layout.columns;
  const exact=JSON.stringify(names)===JSON.stringify(old);
  const reordered=new Set(names).size===names.length&&new Set(old).size===old.length&&names.length===old.length&&names.every(name=>old.includes(name));
  if(!exact&&!reordered)return;
  const map=index=>index<0?-1:exact?index:names.indexOf(old[index]);
  const indices=layout.cards.map(map);
  if(indices.some(index=>index>=0&&!metricEligible(index)))return;
  metricSettings=indices.map(index=>({index,operation:operationFor(index)}));
  const selected=map(layout.selected_metric);
  selectedDetailMetric=selected>=0&&indices.includes(selected)?selected:layout.selected_metric===-1?-1:indices.find(index=>index>=0)??-1;
  if(Array.isArray(layout.comparison_metrics)){const comparison=layout.comparison_metrics.map(map);if(comparison.every(index=>index>=0&&metricEligible(index)))comparisonMetrics=[...new Set(comparison)];}
}
function persistDashboardLayout(){
  const data=currentData;
  if(!data?.document_id||!data.approved_settings||!columnSettingsConfirmed||columnReviewPending)return;
  const payload={source:data.document_id,sheet_id:data.sheet.id,dashboard:dashboardSnapshot()};
  dashboardSaveQueue=dashboardSaveQueue.then(async()=>{
    try{
      const response=await fetch('/api/settings/dashboard',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),...(typeof AbortSignal!=='undefined'?{signal:AbortSignal.timeout(15000)}:{})});
      if(!response.ok)throw new Error();
      if(currentData===data){data.approved_settings.dashboard=payload.dashboard;$('#settings-save-status').textContent='';}
    }catch{if(currentData===data)$('#settings-save-status').textContent='지표 구성을 저장하지 못했습니다. 지표를 다시 선택해 주세요.';}
  });
}
function restoreApprovedSettings(data,apply=true) {
  const saved=data.approved_settings;
  if(!saved)return false;
  const names=data.columns, old=saved.columns;
  const exact=JSON.stringify(names)===JSON.stringify(old);
  const reordered=Array.isArray(old)&&new Set(old).size===old.length&&new Set(names).size===names.length&&names.length===old.length&&names.every(name=>old.includes(name));
  if(!exact&&!reordered){$('#column-settings-status').textContent='원본 컬럼 구성이 변경됐습니다. 설정을 다시 확인해 주세요.';return false;}
  const mapped=names.map((name,index)=>({...saved.settings[exact?index:old.indexOf(name)]}));
  if(!AdSightColumns.valid(mapped,names.length)||AdSightColumns.validate(mapped,data.rows)){
    $('#column-settings-status').textContent='데이터의 값 형식이 달라 기존 설정을 적용할 수 없습니다. 역할을 다시 확인해 주세요.';return false;
  }
  // A date column must remain predominantly dates, not merely contain one old date.
  const badDate=mapped.some((setting,index)=>{
    if(!['date','metric'].includes(setting.role))return false;
    if(setting.role==='metric'&&(setting.unit||'')!==(D.metricType(data.rows,index).unit||''))return true;
    const values=data.rows.map(row=>row[index]).filter(value=>D.text(value).trim());
    return values.length&&values.filter(value=>(setting.role==='date'?D.date(value):D.number(value))!==null).length/values.length<.8;
  });
  if(badDate){$('#column-settings-status').textContent='날짜·숫자 컬럼의 값 형식이나 단위가 바뀌었습니다. 역할을 다시 확인해 주세요.';return false;}
  if(!apply)return true;
  columnSettings=mapped;columnDraft=mapped.map(item=>({...item}));columnSettingsConfirmed=true;
  datasetInterpretation=saved.interpretation;pendingInterpretation=null;columnReviewPending=false;
  dashboardSchema='';configureDashboard();restoreDashboardLayout(saved.dashboard);renderDashboard();setSetupStep(2,false);setSetupStep(3,false);
  $('#step-3-status').textContent='저장한 설정을 불러왔습니다.';
  navigate('dashboard');window.scrollTo?.({top:0,left:0,behavior:'instant'});
  $('#settings-save-status').textContent='';
  return true;
}
let pendingSavedData=null;
function closeSettingsOffer() {
  const dialog=$('#reuse-settings-dialog');
  if(dialog.close)dialog.close();else dialog.open=false;
  pendingSavedData=null;
}
function offerApprovedSettings(data) {
  if(!restoreApprovedSettings(data,false))return false;
  pendingSavedData=data;
  $('#reuse-settings-document').textContent=$('#document-title').textContent+' / '+data.sheet.title;
  const savedAt=data.approved_settings.savedAt;
  $('#reuse-settings-date').textContent=savedAt?'저장일 · '+new Date(savedAt).toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
  const dialog=$('#reuse-settings-dialog');
  if(dialog.showModal)dialog.showModal();else dialog.open=true;
  return true;
}
$('#reuse-settings-apply').addEventListener('click',()=>{
  const data=pendingSavedData;closeSettingsOffer();
  if(data!==currentData)return;
  if(!restoreApprovedSettings(data)){setSetupStep(3,true);revealSetupStep(3);}
});
function startFreshSettings() {
  closeSettingsOffer();setSetupStep(2,true);setSetupStep(3,false);revealSetupStep(2);
}
$('#reuse-settings-fresh').addEventListener('click',startFreshSettings);
$('#reuse-settings-close').addEventListener('click',startFreshSettings);
$('#reuse-settings-dialog').addEventListener('cancel',event=>{event.preventDefault();startFreshSettings();});
async function persistApprovedSettings(data,settings,interpretation) {
  if(!data.document_id)return;
  $('#settings-save-status').textContent='설정을 저장하는 중…';
  try {
    const response=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:activeSource||data.document_id,sheet_id:data.sheet.id,columns:data.columns,settings,interpretation})});
    if(!response.ok)throw new Error();
    if(currentData===data){data.approved_settings={columns:data.columns,settings,interpretation};$('#settings-save-status').textContent='';persistDashboardLayout();}
  }catch{
    if(currentData===data)$('#settings-save-status').textContent='서버에 설정을 저장하지 못했습니다. 현재 화면에만 적용됐습니다. 데이터 연결에서 다시 적용해 주세요.';
  }
}
function prepareColumnSettings() {
  const key = JSON.stringify([activeSource, $('#document-title').textContent, currentData.sheet.id, currentData.columns]);
  if (columnSettingsKey !== key) {
    columnSettingsKey = key; columnSettingsConfirmed = false; datasetInterpretation = null; pendingInterpretation = null; columnReviewPending = false;
    columnSettings = AdSightColumns.suggest(currentData.columns, currentData.rows);
    columnDraft = columnSettings.map(item => ({...item}));
  }
  renderColumnSettings();
  renderInterpretationSummary();
}
// Test phase: interpretations and column settings live only in this page session.
function savePendingReview() {}
function columnNeedsReview(setting) {return !!setting.question||!!setting.reviewRequired||['medium','low'].includes(setting.confidence);}
function unresolvedColumnReviews() {return columnDraft.filter(setting=>columnNeedsReview(setting)&&!setting.reviewAcknowledged).length;}
function updateReviewGate() {
  const remaining=unresolvedColumnReviews();
  $('#column-settings-confirm').disabled=aiBusy||remaining>0;
  $('#column-settings-confirm').textContent=remaining?'확인 필요 '+remaining+'개':'설정 적용 · 대시보드 보기 →';
}
function renderColumnSettings() {
  $('#column-settings-panel').hidden = false;
  const body = $('#column-settings-table').tBodies[0]; body.replaceChildren();
  const roles = [['date','날짜'],['dimension','비교 대상'],['identifier','식별용'],['metric','수치 지표'],['ignore','분석 제외']];
  const help={date:'기간 필터와 시간에 따른 추이에 사용합니다.',dimension:'같은 값끼리 묶어 비교합니다.',identifier:'행이나 캠페인을 구분하는 값입니다. 계산하지 않습니다.',ignore:'그래프와 성과 계산에서 제외합니다.'};
  columnDraft.forEach((setting,index) => {
    const original=currentData.columns[index],row=document.createElement('tr');
    const name=cell('td',''),label=document.createElement('input');
    label.type='text';label.className='column-label-input';label.maxLength=100;
    label.value=setting.label||original;label.placeholder=original;
    label.setAttribute('aria-label',original+' 표시 이름');
    label.addEventListener('input',()=>{setting.label=label.value.trim().slice(0,100)||original;setting.reviewAcknowledged=false;updateReviewGate();savePendingReview();});
    label.addEventListener('blur',()=>{label.value=setting.label||original;});
    const source=document.createElement('code');source.textContent=original;source.title='원본 컬럼명';
    name.append(label,source);
    const type=D.metricType(currentData.rows,index);
    const incompatible=(setting.role==='metric'&&!type.eligible)||(setting.role==='date'&&!currentData.rows.some(row=>D.date(row[index])!==null));
    const needsReview=incompatible||columnNeedsReview(setting);
    if(needsReview)row.className='needs-review';
    const sample=cell('td','');
    const values=[...new Set(currentData.rows.map(row=>D.text(row[index])).filter(Boolean))].slice(0,3);
    if(!values.length)sample.textContent='빈 값';
    values.forEach(value=>{const chip=document.createElement('span');chip.className='review-sample';chip.textContent=value;chip.title=value;sample.append(chip);});
    const interpretation=cell('td',''),description=document.createElement('p');description.textContent=setting.description||'값의 형식으로 역할을 추천했습니다.';interpretation.append(description);
    const reason=document.createElement('small');reason.textContent='판단 근거: '+(setting.rationale||setting.reason||'직접 지정한 역할입니다.');interpretation.append(reason);
    if(setting.question){const question=document.createElement('small');question.className='review-question';question.textContent=setting.question;interpretation.append(question);}
    if(incompatible){const warning=document.createElement('small');warning.className='review-question';warning.textContent='실제 값의 형식과 역할이 맞지 않습니다. 역할을 수정한 뒤 적용해 주세요.';interpretation.append(warning);}
    const controls=cell('td',''),role=document.createElement('select');role.setAttribute('aria-label',original+' 역할');role.append(...roles.map(([value,label])=>new Option(label,value)));role.value=setting.role;
    role.addEventListener('change',()=>{setting.role=role.value;setting.reviewAcknowledged=false;savePendingReview();renderColumnSettings();});controls.append(role);
    if(needsReview){
      const badge=document.createElement('span');badge.className='review-question-badge';badge.textContent=setting.reviewAcknowledged&&!incompatible?'확인 완료':'확인 필요';controls.append(badge);
      const confirmLabel=document.createElement('label');confirmLabel.className='column-review-check';
      const check=document.createElement('input');check.type='checkbox';check.checked=!!setting.reviewAcknowledged;check.disabled=incompatible;
      check.setAttribute('aria-label',original+' 의미와 역할 확인 완료');
      check.addEventListener('change',()=>{setting.reviewAcknowledged=check.checked;savePendingReview();renderColumnSettings();});
      const text=document.createElement('span');text.textContent='의미와 역할을 확인했습니다';confirmLabel.append(check,text);controls.append(confirmLabel);
    }
    if(setting.role!=='metric'){const detail=document.createElement('small');detail.textContent=help[setting.role]||'';controls.append(detail);}
    row.append(name,sample,interpretation,controls);body.append(row);
  });
  $('#column-review-state').textContent=columnReviewPending?'AI 추천 반영 · 승인 대기':columnSettingsConfirmed?'검토 완료':'검토 필요';
  $('#column-review-state').className='review-state'+(columnReviewPending?' pending':'');
  $('#column-review-discard').hidden=!(columnReviewPending&&columnSettingsConfirmed);
  $('#column-settings-status').textContent=columnReviewPending?'AI 추천을 아래 설정에 반영했습니다. 확인을 마치면 이 설정으로 대시보드를 엽니다.':columnSettingsConfirmed?'확인한 설정을 사용 중입니다. 변경한 내용은 검토 완료 버튼을 눌러야 적용됩니다.':'추천된 역할을 확인해 주세요. AI 없이 직접 설정할 수도 있습니다.';
  updateReviewGate();
}
function confirmColumnSettings() {
  if(unresolvedColumnReviews()){ $('#column-settings-status').textContent='확인 필요 항목의 의미와 역할을 검토하고 확인 완료를 체크해 주세요.';return; }
  const error=AdSightColumns.validate(columnDraft,currentData.rows);
  if(error){$('#column-settings-status').textContent=error;return;}
  columnSettings=columnDraft.map(item=>({...item}));columnSettingsConfirmed=true;
  if(pendingInterpretation)datasetInterpretation=pendingInterpretation;
  pendingInterpretation=null;columnReviewPending=false;
  dashboardSchema='';configureDashboard();
  $('#column-settings-status').textContent='확인한 설정을 적용했습니다.';
  setSetupStep(3,false);$('#step-3-status').textContent='설정 완료 · 대시보드에 적용됨';
  navigate('dashboard');
  window.scrollTo?.({top:0,left:0,behavior:'instant'});
  persistApprovedSettings(currentData,columnSettings.map(item=>({...item})),datasetInterpretation);
}
$('#column-settings-confirm').addEventListener('click',confirmColumnSettings);

function getAssistantContext() {
  if (!currentData) return `화면: ${$('#breadcrumb').textContent}\n연결된 스프레드시트가 없습니다.`;
  const choice=$('#group-value').value;
  const target=comparisonKeys.length?comparisonKeys.join(', '):choice?$('#group-value')._values?.[Number(choice)-1]:'전체 대상';
  const period=$('#date-from').value?`${$('#date-from').value} – ${$('#date-to').value}`:'전체 기간';
  return [`화면: ${$('#breadcrumb').textContent}`,`문서: ${$('#document-title').textContent} / ${currentData.sheet.title}`,`대상: ${target}`,`기간: ${period}`,`지표: ${comparisonMetrics.map(metricName).join(', ')||'미선택'}`,`컬럼 설정: ${columnSettingsConfirmed?'확인 완료':'확인 필요'}`].join('\n');
}

function prioritizedMetrics(indices) {
  return indices.slice().sort((a,b) => (columnSettings[b]?.priority||0)-(columnSettings[a]?.priority||0));
}
function renderInterpretationSummary() {
  const preview=pendingInterpretation||datasetInterpretation;
  $('#ai-data-summary').hidden=!preview?.summary;$('#ai-summary-text').textContent=preview?.summary||'';

}
function updateAIControls() {
  updateReviewGate();
  $('#skip-ai').disabled=aiBusy||!currentData;
  $('#ai-interpret').disabled = aiBusy || aiProvider==='none' || !currentData;
  $('#ai-interpret').textContent = aiBusy?'AI가 해석하는 중…':pendingInterpretation||datasetInterpretation?'AI로 다시 해석':'AI로 해석하기';
}
async function aiRequest(path, body) {
  let response;
  try {response = await fetch('/api/ai/'+path, {method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),...(typeof AbortSignal!=='undefined'?{signal:AbortSignal.timeout(210000)}:{})});}
  catch {throw new Error('AI 응답이 지연되거나 연결이 끊겼습니다. 기존 설정은 유지됩니다.');}
  let data;try {data=await response.json();}catch{throw new Error('AI 서버 응답을 읽지 못했습니다. 기존 설정은 유지됩니다.');}
  if (!response.ok) throw new Error(typeof data.detail==='string'?data.detail:'AI 요청에 실패했습니다. 기존 설정은 유지됩니다.');
  return data;
}
async function initializeAIProviders() {
  try {
    const response=await fetch('/api/ai/providers',{cache:'no-store'});
    if(!response.ok)throw new Error();
    const data=await response.json();aiProviders=data.providers||[];
    aiProvider=aiProviders.some(item=>item.id==='nvidia'&&item.configured)?'nvidia':'none';
    aiReady=true;
    if(aiProvider==='none')$('#ai-interpret-status').textContent='AI 연결 설정을 확인해 주세요. 직접 설정은 계속 사용할 수 있습니다.';
  }catch{
    aiProvider='none';$('#ai-interpret-status').textContent='AI 연결을 확인하지 못했습니다. 직접 설정은 계속 사용할 수 있습니다.';
  }
  updateAIControls();if(!$('#analysis-view').hidden)renderAnalysis();
}
async function interpretData() {
  if(!currentData||aiBusy||aiProvider==='none')return;
  const data=currentData,key=columnSettingsKey,provider=aiProvider;
  aiBusy=true;updateAIControls();$('#ai-interpret-status').textContent='AI가 컬럼을 해석하고 있습니다. 완료되면 아래에서 추천 결과를 검토할 수 있습니다.';
  try {
    const columns=data.columns.map((name,index)=>({index,name,samples:D.columnSamples(data.rows,index),unit:D.metricType(data.rows,index).unit,numeric:data.rows.some(row=>D.number(row[index])!==null),dates:data.rows.some(row=>D.date(row[index])!==null)}));
    const result=await aiRequest('interpret',{provider,columns,context:$('#ai-data-context').value.trim()});
    if(currentData!==data||columnSettingsKey!==key){$('#ai-interpret-status').textContent='문서가 변경되어 이전 요청의 결과는 적용하지 않았습니다.';return;}
    const proposed=result.columns.map((item,index)=>({...item,unit:D.metricType(data.rows,index).unit,reason:item.question?`${item.confidence} · ${item.question}`:`${item.confidence} · AI 해석`}));
    if(!AdSightColumns.valid(proposed,data.columns.length))throw new Error('AI가 반환한 컬럼 설정 형식을 확인할 수 없어 적용하지 않았습니다.');
    columnDraft=proposed;pendingInterpretation={summary:result.summary,provider:result.provider,model:result.model};columnReviewPending=true;
    savePendingReview();renderColumnSettings();renderInterpretationSummary();
    $('#step-2-status').textContent='AI 해석 완료 · 아래 컬럼 설정에서 확인하세요.';
    setSetupStep(2,false);setSetupStep(3,true);
    navigate('sheets');revealSetupStep(3);
    const warning=AdSightColumns.validate(proposed,data.rows);
    $('#ai-interpret-status').textContent=warning?'AI 해석을 받았습니다. '+warning+' 아직 대시보드에는 적용하지 않았습니다.':'AI 해석이 준비됐습니다. 아래 내용을 확인하고 검토 완료 버튼을 눌러 주세요.';
  }catch(error){$('#ai-interpret-status').textContent=error.message;}
  finally{aiBusy=false;updateAIControls();}
}
$('#skip-ai').addEventListener('click',()=>{
  if(!currentData||aiBusy)return;
  setSetupStep(2,false);setSetupStep(3,true);
  $('#step-2-status').textContent='직접 설정';
  navigate('sheets');revealSetupStep(3);
});
$('#ai-interpret').addEventListener('click',interpretData);
initializeAIProviders();

$('#column-review-discard').addEventListener('click',()=>{
  pendingInterpretation=null;columnReviewPending=false;columnDraft=columnSettings.map(item=>({...item}));
  try{recentStorage?.removeItem('adsight.column-review.v1:'+columnSettingsKey);}catch{}
  renderColumnSettings();renderInterpretationSummary();updateAIControls();$('#ai-interpret-status').textContent='새 추천을 적용하지 않고 기존 설정을 유지했습니다.';
});
