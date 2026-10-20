const fs = require('node:fs'); const vm = require('node:vm'); const assert = require('node:assert/strict');
class Element {
  set id(value){this._id=value;elements.set('#'+value,this);}
  get id(){return this._id;}
  constructor(tag='div') {this.tag=tag; this.children=[]; this.events={}; this.dataset={}; this.style={}; this.classList={toggle(){},add(){},remove(){}}; this._value=''; this.hidden=false; this.offsetWidth=220;this.offsetHeight=100;}
  append(...items){for(const item of items) if(item?.tag==='fragment') this.children.push(...item.children); else this.children.push(item);}
  prepend(...items){this.children.unshift(...items);}
  replaceChildren(...items){this.children=[];this._value='';this.append(...items);}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text || this.children.map(child=>child.textContent||'').join('');}
  get options(){return this.children;}
  set value(value){this._value=String(value);}
  get value(){if(this.tag==='select')return this.children.find(x=>x.value===this._value)?.value??this.children[0]?.value??'';return this._value;}
  get selectedOptions(){return this.options.filter(x=>x.value===this.value);}
  addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
  dispatch(name){for(const fn of this.events[name]||[])fn({clientX:50,clientY:100,key:'',preventDefault(){}});}
  setAttribute(name,value){this[name]=value;}
  removeAttribute(name){delete this[name];}
  getAttribute(name){return this[name];}
  querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...(child.querySelectorAll?.(tag)||[])]);}
  getBoundingClientRect(){return {left:10,bottom:20,width:100};}
  scrollIntoView(){} scrollBy(){} contains(){return false;} focus(){} reportValidity(){} setCustomValidity(){}
}
const elements = new Map(); const html=fs.readFileSync('app/static/index.html','utf8');
for(const match of html.matchAll(/<([a-z]+)[^>]*\bid="([\w-]+)"[^>]*>/g)) {
 const el=new Element(match[1]); if(match[1]==='table'){el.tHead=new Element('thead');el.tBodies=[new Element('tbody')];} elements.set('#'+match[2],el);
}
const calculations=elements.get('#aggregation'); for(const [value,label] of [['configured','컬럼 설정대로'],['mean','평균'],['sum','합계']]){const option=new Element('option');option.value=value;option.textContent=label;calculations.append(option);}
for(const [id,values] of [['analysis-window',[['7d','최근 1주'],['14d','최근 2주'],['1','최근 1개월'],['3','최근 3개월'],['6','최근 6개월'],['12','최근 1년'],['custom','직접 선택']]],['analysis-compare-mode',[['previous','직전 기간'],['month','1개월 전 같은 기간'],['quarter','3개월 전 같은 기간'],['year','1년 전 같은 기간'],['custom','직접 선택']]]])for(const [value,text] of values){const option=new Element('option');option.value=value;option.textContent=text;elements.get('#'+id).append(option);}
elements.get('#analysis-increase-threshold').value='30';elements.get('#analysis-decrease-threshold').value='30';
const navigation=['sheets','dashboard','analysis','feedback'].map(view=>{const el=new Element('button');el.dataset.view=view;return el;});
const document={addEventListener(){},querySelector:selector=>{if(selector==='#metric-picker summary')return elements.get('#metric-picker');if(selector==='.detail-section')return new Element();if(!elements.has(selector))throw new Error('Missing selector '+selector);return elements.get(selector);},querySelectorAll:()=>navigation,createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),createDocumentFragment:()=>new Element('fragment'),createTextNode:value=>({textContent:value})};
function Option(label,value){const el=new Element('option');el.textContent=label;el.value=value;return el;}
const browserSettings=new Map();
const context=vm.createContext({document,Option,window:{localStorage:{removeItem:key=>browserSettings.delete(key),getItem:key=>browserSettings.get(key)||null,setItem:(key,value)=>browserSettings.set(key,value)},innerWidth:1200,innerHeight:800,addEventListener(){}},setTimeout,console});
for(const file of ['data-utils.js','recent-documents.js','date-range.js','anomalies.js','column-settings.js','app.js'])vm.runInContext(fs.readFileSync('app/static/'+file,'utf8'),context);


// Unconfirmed settings gate analysis; confirming controls all downstream roles.
vm.runInContext(`currentData={columns:['a','b','c','d'],rows:[['2026-10-01','A','$100','10%'],['2026-10-02','B','$200','20%']],row_numbers:[2,3],sheet:{id:'mapping',title:'Mapping'}};activeSource='mapping';configureDashboard();$('#analysis-window').value='custom';$('#analysis-from').value='2026-10-08';$('#analysis-to').value='2026-10-14';navigate('analysis');`,context);
assert.equal(valueOf('columnSettingsConfirmed'),false);
assert.equal(elements.get('#sheets-view').hidden,false);
assert.equal(elements.get('#analysis-view').hidden,true);
vm.runInContext(`columnDraft[2].meaning='spend';columnDraft[2].aggregation='sum';confirmColumnSettings();`,context);
assert.equal(valueOf('columnSettingsConfirmed'),true);
assert.equal(elements.get('#dashboard-view').hidden,false);
assert.equal(valueOf('operationFor(2)'),'sum');
assert.equal(valueOf('operationFor(3)'),'mean');
vm.runInContext(`columnSettingsKey='';configureDashboard();`,context);
assert.equal(valueOf('columnSettingsConfirmed'),false);
assert.equal(valueOf('datasetInterpretation'),null);
vm.runInContext(`currentData.columns[2]='renamed';configureDashboard();`,context);
assert.equal(valueOf('columnSettingsConfirmed'),false);
console.log('PASS: settings reset on reload and renamed columns require confirmation');
function valueOf(code){return vm.runInContext(code,context);}
console.log('PASS: setup confirmation gate and independent configured aggregation in dashboard');
// Simulate explicit user choices for each fixture, independent of production recommendations.
vm.runInContext(`const originalConfigureDashboard=configureDashboard;configureDashboard=function(){
  originalConfigureDashboard();
  if(!columnSettingsConfirmed){
    columnDraft.forEach((setting,index)=>{
      const name=currentData.columns[index];
      if(name==='Campaign_ID')setting.role='identifier';
      else if(['Cost','Metric0','Metric1','Metric2','Metric3','Metric4','Metric5','Metric6','Metric7'].includes(name))setting.role='metric';
      if(name==='광고비')setting.meaning='spend';
      if(name==='전환수')setting.meaning='conversions';
    });
    confirmColumnSettings();
  }
};`,context);
vm.runInContext(`currentData={columns:['Date','Company','광고비','클릭수','전환수','매출'],rows:[['2026-10-01','A',100,10,1,300],['2026-10-01','B',200,20,2,500],['2026-10-02','A',400,30,3,700]],row_numbers:[2,3,4],sheet:{id:'s1',title:'Test'}};activeSource='test';configureDashboard();`,context);
const value=code=>vm.runInContext(code,context);
const el=id=>elements.get('#'+id);
assert.equal(value('selectedDetailMetric'),2);
assert.equal(el('selected-metric-detail').hidden,false);
assert.ok(el('selected-detail-title').textContent.includes('광고비'));
assert.equal(elements.has('#summary-table'),false);
assert.equal(elements.has('#selected-detail-table'),false);
assert.equal(el('comparison-chart-grid').children.length,1);
assert.equal(el('selected-metric-chips').children.length,4);
assert.equal(el('date-comparison-panel').hidden,false);
el('target-comparison-tab').dispatch('click');
assert.equal(el('date-comparison-panel').hidden,true);
assert.equal(el('target-comparison-panel').hidden,false);
el('date-comparison-tab').dispatch('click');
// Removing a metric removes exactly that graph and both table columns.
el('selected-metric-chips').children[0].dispatch('click');
assert.equal(el('comparison-chart-grid').children.length,1);
assert.equal(value('comparisonMetrics.includes(2)'),false);
// Add a fourth numeric metric through the picker, independent of summary cards.
const revenue=el('metric-options').children[3].children[0];revenue.checked=true;revenue.dispatch('change');
assert.equal(value('comparisonMetrics.includes(5)'),true);
assert.equal(el('comparison-chart-grid').children.length,1);
// Every selected metric appears once, and shares aggregation with cards/tables.
el('aggregation').value='sum';el('aggregation').dispatch('change');
assert.equal(value('metricSettings.every(setting=>setting.operation==="sum")'),true);
assert.ok(el('combined-metric-legend').textContent.includes('합계'));
// Hover includes all selected metrics, not a hidden primary metric.
const svg=el('comparison-chart-grid').children[0];
svg.children.find(item=>item.tag==='circle'&&item.tabindex==='0').dispatch('pointerenter');
assert.ok(el('data-tooltip').textContent.includes('매출'));
assert.ok(!el('data-tooltip').textContent.includes('광고비'));
// Filter by target: the graph and daily table use identical selected rows.
el('select-all-targets').dispatch('click');
assert.equal(value('comparisonKeys.length'),2);
el('picker-clear').dispatch('click');
el('group-value').value='1';el('group-value').dispatch('change');
assert.equal(el('combined-metric-legend').children.length,3);
value('showAllTargets()');
// Card detail selection must not change comparison metrics.
const beforeCard=value('JSON.stringify(comparisonMetrics)');
el('metric-overview').children[0].children[2].dispatch('click');
assert.equal(el('selected-metric-detail').hidden,false);
assert.equal(value('JSON.stringify(comparisonMetrics)'),beforeCard);
assert.equal(value('selectedDetailMetric'),2);
assert.equal(el('selected-trend-legend').children.length,1);
assert.ok(el('selected-detail-title').textContent.includes('광고비'));
el('close-metric-detail').dispatch('click');
assert.equal(el('selected-metric-detail').hidden,true);
// Summary card removal no longer silently removes a comparison metric.
el('metric-overview').children[0].children[0].dispatch('click');
assert.equal(value('comparisonMetrics.length'),3);
// All metrics can be cleared: no phantom primary graph remains.
while(el('selected-metric-chips').children.length)el('selected-metric-chips').children[0].dispatch('click');
assert.equal(el('comparison-chart-grid').children.length,0);
assert.equal(el('comparison-chart-empty').hidden,false);
// Same-schema reload preserves explicit empty selection.
value('configureDashboard()');assert.equal(value('comparisonMetrics.length'),0);
// No date columns: target comparisons remain usable, date tab explains limitation.
value(`currentData={columns:['Company','Cost'],rows:[['A',100],['B',200]],row_numbers:[2,3],sheet:{id:'s2',title:'No dates'}};configureDashboard();`);
assert.equal(el('comparison-chart-grid').children.length,0);
assert.ok(el('comparison-chart-empty').textContent.includes('날짜 컬럼'));
console.log('PASS: metric selection/clearing, exact chart count, table alignment, tabs, shared aggregation, hover, target filtering, independent cards and no-date data');

// Mixed units cannot share a raw axis; zero baselines remain in the raw table.
for(const [label,key] of [['변화율 비교','change'],['실제 값 비교','actual']])el('comparison-chart-mode').append(new Option(label,key));
value(`currentData={columns:['Date','Company','Cost','Clicks'],rows:[['2026-10-01','A','$10',0],['2026-10-02','A','$20',4]],row_numbers:[2,3],sheet:{id:'mixed-chart',title:'Mixed'}};configureDashboard();`);
el('comparison-chart-mode').value='actual';el('comparison-chart-mode').dispatch('change');
assert.equal(el('comparison-chart-mode').value,'change');
assert.ok(el('comparison-chart-note').textContent.includes('시작값이 0'));
assert.equal(el('comparison-chart-grid').children.length,1);
assert.equal(el('combined-target-chart').children.length,1);
value('showMetricDetail(2)');
// A dataset without dates still offers per-target detail without a phantom trend.
value(`currentData={columns:['Company','Cost'],rows:[['A',10],['B',20]],row_numbers:[2,3],sheet:{id:'target-detail',title:'Targets'}};configureDashboard();showMetricDetail(1);`);
assert.equal(el('selected-trend-panel').hidden,true);
console.log('PASS: one combined chart, independent card detail, mixed-unit guard, zero baseline, hover values and no-date detail');

// Comparison starts with four metrics but later saves independently of the four cards.
value(`currentData={columns:['Date','Company',...Array.from({length:8},(_,i)=>'Metric'+i)],rows:[['2026-10-01','A',1,2,3,4,5,6,7,8],['2026-10-02','B',2,3,4,5,6,7,8,9]],row_numbers:[2,3],sheet:{id:'saved-comparison',title:'Saved'}};configureDashboard();`);
assert.equal(value('comparisonMetrics.length'),4);
value('comparisonMetrics=[2,3,4,5,6,7];globalThis.savedDashboard=dashboardSnapshot();comparisonMetrics=[];restoreDashboardLayout(savedDashboard)');
assert.equal(value('comparisonMetrics.length'),6);
assert.equal(value('metricSettings.length'),4);
assert.equal(value('JSON.stringify(comparisonMetrics)'),'[2,3,4,5,6,7]');
value('restoreDashboardLayout({...savedDashboard,comparison_metrics:[]})');
assert.equal(value('comparisonMetrics.length'),0);
assert.equal(value('metricSettings.length'),4);
console.log('PASS: four default comparison metrics, independent six-metric restoration and explicit empty selection');

// Target comparison uses aligned columns, numeric sorting, tie ranks and a signed zero axis.
value(`comparisonMetrics=[2,3];targetComparisonSort={metric:2,direction:-1};renderCombinedTargets([['2026-10-01','A',10,1],['2026-10-01','B',10,2],['2026-10-01','C',-5,null],['2026-10-01','D',null,0]],1)`);
let matrix=el('combined-target-chart').children[0];
assert.equal(matrix.children.length,5);
assert.equal(matrix.children[1].children[0].textContent,'A');
assert.equal(matrix.children[1].children[1].children[0].children[1].textContent,'1위');
assert.equal(matrix.children[2].children[1].children[0].children[1].textContent,'1위');
assert.equal(matrix.children[3].children[1].children[0].children[1].textContent,'3위');
assert.equal(matrix.children[3].children[1].children[1].children[1].style.left,'0%');
assert.ok(parseFloat(matrix.children[3].children[1].children[1].children[1].style.width)>0);
assert.equal(matrix.children[4].children[1].children[0].children[1].textContent,'값 없음');
matrix.children[0].children[1].children[0].dispatch('click');
matrix=el('combined-target-chart').children[0];
assert.equal(matrix.children[1].children[0].textContent,'C');
assert.equal(matrix.children[4].children[0].textContent,'D');
matrix.children[0].children[2].children[0].dispatch('click');
matrix=el('combined-target-chart').children[0];
assert.equal(matrix.children[1].children[0].textContent,'B');
assert.equal(matrix.children[4].children[0].textContent,'C');
console.log('PASS: aligned target matrix, reversible metric sorting, tied ranks, negative bars and missing values');

value(`currentData={columns:['Date','Company','광고비','전환수'],rows:Array.from({length:14},(_,i)=>['2026-10-'+String(i+1).padStart(2,'0'),'A',i<7?100:200,i<7?20:10]),row_numbers:Array.from({length:14},(_,i)=>i+2),sheet:{id:'analysis',title:'Analysis'}};configureDashboard();$('#analysis-window').value='custom';$('#analysis-from').value='2026-10-08';$('#analysis-to').value='2026-10-14';navigate('analysis');`);
assert.equal(el('analysis-view').hidden,false);assert.equal(el('feedback-view').hidden,true);
assert.equal(el('analysis-summary').children.length,3);
assert.match(el('analysis-findings').textContent,/광고비 (평균|합계) 증가/);
assert.ok(el('analysis-findings').textContent.includes('100.0%'));
assert.equal(el('analysis-from').value,'2026-10-08');
assert.equal(el('analysis-previous-from').value,'2026-10-01');
console.log('PASS: analysis navigation, evidence, period and rule-based findings');
value("navigate('feedback')");assert.equal(el('feedback-view').hidden,false);assert.equal(el('dashboard-view').hidden,true);assert.equal(el('analysis-view').hidden,true);
assert.equal(el('breadcrumb').textContent,'피드백');
value("navigate('dashboard')");assert.equal(el('feedback-view').hidden,true);
console.log('PASS: feedback page navigation and active screen separation');
// Calendar range selection stays staged until Apply; quick choices use data end.
value(`currentData={columns:['Date','Company','Cost'],rows:Array.from({length:45},(_,i)=>[new Date(Date.UTC(2021,0,i+1)).toISOString().slice(0,10),'A',i+1]),row_numbers:Array.from({length:45},(_,i)=>i+2),sheet:{id:'dates',title:'Historical'}};configureDashboard();`);
el('date-preset-week').dispatch('click');
assert.equal(el('date-from').value,'2021-02-08');assert.equal(el('date-to').value,'2021-02-14');
assert.equal(value('selectedRows().length'),7);
el('date-preset-month').dispatch('click');assert.equal(value('selectedRows().length'),30);
el('date-preset-all').dispatch('click');assert.equal(value('selectedRows().length'),45);
el('date-range-picker').open=true;el('date-range-picker').dispatch('toggle');
const day=label=>el('range-calendars').querySelectorAll('button').find(item=>item.getAttribute('aria-label')===label);
day('2021.01.20').dispatch('click');
assert.equal(el('date-range-apply').disabled,true);
assert.equal(el('date-from').value,''); // Draft has not affected the dashboard.
day('2021.01.10').dispatch('click');el('date-range-apply').dispatch('click');
assert.equal(el('date-from').value,'2021-01-10');assert.equal(el('date-to').value,'2021-01-20');
assert.equal(value('selectedRows().length'),11);
el('date-range-picker').open=true;el('date-range-picker').dispatch('toggle');
day('2021.01.05').dispatch('click');el('date-range-cancel').dispatch('click');
assert.equal(el('date-from').value,'2021-01-10');
el('dashboard-reset').dispatch('click');assert.equal(el('date-range-label').textContent,'전체 기간 ▾');
console.log('PASS: historical presets, full range, draft/apply/cancel, reversed selection, inclusive range and reset');

value(`currentData={columns:['Date','Campaign_ID','Acquisition_Cost','Conversion_Rate','Clicks'],rows:[['2026-10-01',100,'$1,200','3.5%',10],['2026-10-02',101,'USD 800','4.5%',20]],row_numbers:[2,3],sheet:{id:'formatted',title:'Formatted'}};configureDashboard();`);
assert.equal(value('metricEligible(1)'),false);
assert.equal(value('metricEligible(2)'),true);
assert.equal(value('metricEligible(3)'),true);
assert.equal(value('metricFormat(.04,3)'),'4%');
assert.ok(value('metricFormat(1200,2)').includes('USD'));
assert.equal(value('currentData.rows[0][2]'),'$1,200');
assert.equal(el('metric-options').children.filter(item=>item.tag==='label').length,3);
console.log('PASS: formatted cost/rate available in dashboard, ID excluded, units shown and source cells preserved');

(async () => {
  elements.set('#dashboard-empty h2', new Element('h2'));
  elements.set('#dashboard-empty p', new Element('p'));
  context.fetch = async () => ({ok: true, json: async () => ({autoload: true})});
  value(`currentData=null;busy=false;load=async options=>{globalThis.loadedOptions=options;currentData={loaded:true};};`);
  await value('initializeDefaultDocument()');
  assert.equal(context.loadedOptions,undefined);
  assert.equal(el('sheets-view').hidden,false);
  assert.equal(el('dashboard-view').hidden,true);
  context.loadedOptions=null;
  await value('initializeDefaultDocument()');
  assert.equal(context.loadedOptions,null); // Does not replace an already connected document.
  context.fetch=async()=>({ok:true,json:async()=>({autoload:false})});
  value('currentData=null');await value('initializeDefaultDocument()');
  assert.equal(context.loadedOptions,null);
  console.log('PASS: startup shows data connection without loading a default document');
})().catch(error=>{console.error(error);process.exitCode=1;});
