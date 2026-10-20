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



(async()=>{
  const run=code=>vm.runInContext(code,context);
  assert.equal(elements.get('#step-1-body').hidden,false);
  assert.equal(elements.get('#step-2-body').hidden,true);
  assert.equal(elements.get('#step-3-body').hidden,true);
  run(`currentData={columns:['When','Cost'],rows:[['2026-10-01','$100'],['2026-10-02','$200']],row_numbers:[2,3],sheet:{id:'ai-test',title:'AI Test'}};activeSource='ai';configureDashboard();aiProvider='nvidia';aiReady=true;`);
  run('setSetupStep(1,false)');
  assert.equal(elements.get('#step-1-body').hidden,true);
  assert.equal(elements.get('#step-1-toggle').getAttribute('aria-expanded'),'false');
  run('setSetupStep(1,true)');
  assert.equal(elements.get('#step-1-body').hidden,false);
  assert.equal(elements.get('#step-1-toggle').getAttribute('aria-expanded'),'true');
  const result={summary:'날짜별 비용 데이터로 추정됩니다.',provider:'nvidia',model:'test-model',columns:[
    {index:0,label:'날짜',description:'기록 날짜',role:'date',meaning:'generic',aggregation:'mean',priority:2,confidence:'high',question:''},
    {index:1,label:'광고 집행액',description:'광고비 총액으로 추정',role:'metric',meaning:'spend',aggregation:'sum',priority:5,confidence:'high',question:''}
  ]};
  let requests=[];
  context.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>result};};
  await run('interpretData()');
  assert.equal(run('columnSettingsConfirmed'),false);
  assert.equal(run('columnReviewPending'),true);
  assert.equal(run('columnDraft[1].label'),'광고 집행액');
  assert.notEqual(run('columnSettings[1].label'),'광고 집행액');
  run("navigate('dashboard')");
  assert.equal(elements.get('#dashboard-view').hidden,true);
  const nameInput=elements.get('#column-settings-table').tBodies[0].children[1].children[0].children[0];
  nameInput.value='캠페인 비용';nameInput.dispatch('input');
  assert.equal(run('columnDraft[1].label'),'캠페인 비용');
  assert.notEqual(run('columnSettings[1].label'),'캠페인 비용');
  assert.equal(run('currentData.columns[1]'),'Cost');
  nameInput.value='광고 집행액';nameInput.dispatch('input');
  run("columnDraft[1].confidence='medium';columnDraft[1].question='총액인지 단가인지 확인해 주세요.';renderColumnSettings()");
  assert.equal(elements.get('#column-settings-confirm').disabled,true);
  run('confirmColumnSettings()');
  assert.equal(run('columnSettingsConfirmed'),false);
  assert.ok(elements.get('#column-settings-status').textContent.includes('확인 완료'));
  let reviewCheck=elements.get('#column-settings-table').tBodies[0].children[1].children[3].querySelectorAll('input')[0];
  reviewCheck.checked=true;reviewCheck.dispatch('change');
  assert.equal(elements.get('#column-settings-confirm').disabled,false);
  const reviewedName=elements.get('#column-settings-table').tBodies[0].children[1].children[0].children[0];
  reviewedName.value='광고 집행액';reviewedName.dispatch('input');
  assert.equal(elements.get('#column-settings-confirm').disabled,true);
  run('renderColumnSettings()');
  reviewCheck=elements.get('#column-settings-table').tBodies[0].children[1].children[3].querySelectorAll('input')[0];
  reviewCheck.checked=true;reviewCheck.dispatch('change');
  run('confirmColumnSettings()');
  assert.equal(run('columnSettingsConfirmed'),true);
  assert.equal(run('columnReviewPending'),false);
  assert.equal(run('columnSettings[1].label'),'광고 집행액');
  assert.equal(run('operationFor(1)'),'sum');
  assert.ok(elements.get('#ai-summary-text').textContent.includes('날짜별 비용'));
  assert.ok(run('metricName(1)').includes('광고 집행액'));
  assert.equal(requests[0].body.provider,'nvidia');assert.equal(requests[0].body.columns[1].samples.length,2);
  assert.ok(!JSON.stringify(requests).includes('API_KEY'));
  const previous=run('JSON.stringify(columnSettings)');
  const revised=JSON.parse(JSON.stringify(result));revised.columns[1].label='새 비용 해석';
  context.fetch=async()=>({ok:true,json:async()=>revised});
  await run('interpretData()');
  assert.equal(run('JSON.stringify(columnSettings)'),previous);
  assert.equal(run('columnDraft[1].label'),'새 비용 해석');
  elements.get('#column-review-discard').dispatch('click');
  assert.equal(run('columnReviewPending'),false);
  assert.equal(run('JSON.stringify(columnSettings)'),previous);
  context.fetch=async()=>({ok:false,json:async()=>({detail:'요청 한도에 도달했습니다.'})});
  await run('interpretData()');
  assert.equal(run('JSON.stringify(columnSettings)'),previous);
  assert.ok(elements.get('#ai-interpret-status').textContent.includes('요청 한도'));
  assert.equal(elements.has('#ai-provider'),false);
  assert.equal(run('aiProvider'),'nvidia');
  let release;context.fetch=()=>new Promise(resolve=>{release=resolve;});
  const pending=run('interpretData()');
  run('currentData={...currentData}');release({ok:true,json:async()=>result});await pending;
  assert.equal(run('JSON.stringify(columnSettings)'),previous);
  assert.ok(elements.get('#ai-interpret-status').textContent.includes('문서가 변경'));
  run("columnSettingsKey='';configureDashboard()");
  assert.equal(run('columnReviewPending'),false);
  assert.equal(run('datasetInterpretation'),null);
  assert.equal(run('columnSettingsConfirmed'),false);
  assert.equal(elements.get('#ai-data-summary').hidden,true);
  run(`currentData={columns:['Cost','When'],rows:[['$100','2026-10-01'],['$200','2026-10-02'],['$300','2026-10-03']],row_numbers:[2,3,4],sheet:{id:'reuse'},approved_settings:{columns:['When','Cost'],settings:[{label:'날짜',role:'date',aggregation:'mean'},{label:'확정 비용',role:'metric',aggregation:'sum',unit:'USD'}],interpretation:{summary:'저장한 요약',provider:'nvidia',model:'test'}}};columnSettingsKey='';configureDashboard();`);
  assert.equal(run('offerApprovedSettings(currentData)'),true);
  assert.equal(run('columnSettingsConfirmed'),false);
  assert.equal(elements.get('#reuse-settings-dialog').open,true);
  elements.get('#reuse-settings-fresh').dispatch('click');
  assert.equal(run('columnSettingsConfirmed'),false);
  assert.equal(elements.get('#step-2-body').hidden,false);
  assert.equal(run('offerApprovedSettings(currentData)'),true);
  elements.get('#reuse-settings-apply').dispatch('click');
  assert.equal(run('columnSettingsConfirmed'),true);
  assert.equal(elements.get('#reuse-settings-dialog').open,false);
  assert.equal(run('columnSettings[0].label'),'확정 비용');
  assert.equal(run('columnSettings[1].role'),'date');
  assert.equal(run('currentData.rows.length'),3);
  assert.equal(elements.get('#dashboard-view').hidden,false);
  run("restoreDashboardLayout({columns:['When','Cost'],cards:[-1,1],selected_metric:1,comparison_metrics:[1]})");
  assert.equal(run('JSON.stringify(metricSettings.map(item=>item.index))'),'[-1,0]');
  assert.equal(run('selectedDetailMetric'),0);
  assert.equal(run('JSON.stringify(comparisonMetrics)'),'[0]');
  run('restoreDashboardLayout({columns:currentData.columns,cards:[],selected_metric:-1})');
  assert.equal(run('metricSettings.length'),0);
  assert.equal(run('selectedDetailMetric'),-1);
  run("currentData={...currentData,columns:['Renamed','When']};columnSettingsKey='';configureDashboard()");
  assert.equal(run('restoreApprovedSettings(currentData)'),false);
  assert.equal(run('columnSettingsConfirmed'),false);
  run("currentData={...currentData,columns:['Cost','When'],rows:[['not numeric','2026-10-01'],['$100','2026-10-02'],['invalid','2026-10-03']]};columnSettingsKey='';configureDashboard()");
  assert.equal(run('restoreApprovedSettings(currentData)'),false);
  run("currentData={...currentData,rows:[['₩100','2026-10-01']]};columnSettingsKey='';configureDashboard()");
  assert.equal(run('restoreApprovedSettings(currentData)'),false);
  run(`currentData={columns:['Date','Company','Cost'],rows:Array.from({length:14},(_,i)=>['2026-10-'+String(i+1).padStart(2,'0'),'A',i<7?'$100':'$200']),row_numbers:Array.from({length:14},(_,i)=>i+2),sheet:{id:'explain-test',title:'Explain'}};columnSettingsKey='';configureDashboard();columnDraft[0].role='date';columnDraft[2].role='metric';confirmColumnSettings();aiProvider='nvidia';$('#analysis-window').value='custom';$('#analysis-from').value='2026-10-08';$('#analysis-to').value='2026-10-14';navigate('analysis');`);
  const explainCalls=[];
  context.fetch=async(url,options)=>{explainCalls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({interpretation:'비용이 증가했으며 원인은 추가 확인이 필요합니다.',limitations:['총액인지 단가인지 확인이 필요합니다.'],next_checks:['대상별 변화를 확인하세요.']})};};
  let changeCard=elements.get('#analysis-findings').children.find(item=>item.className?.includes('change'));
  assert.ok(changeCard);
  assert.equal(changeCard.children.find(item=>item.className==='finding-ai-actions').querySelectorAll('button').length,1);
  changeCard.children.find(item=>item.className==='finding-ai-actions').querySelectorAll('button')[0].dispatch('click');
  const chart=changeCard.children.find(item=>item.className==='finding-chart');
  assert.equal(chart.hidden,false);
  assert.equal(chart.querySelectorAll('svg').length,1);
  assert.equal(chart.querySelectorAll('circle').length,14);
  const targetButton=chart.querySelectorAll('button').find(item=>item.className==='finding-target-button');
  assert.ok(targetButton);targetButton.dispatch('click');
  const targetTrend=chart.children.find(item=>item.className==='finding-selected-trend');
  assert.equal(targetTrend.hidden,false);
  assert.equal(targetTrend.querySelectorAll('circle').length,14);
  assert.equal(chart.children.find(item=>item.className==='finding-breakdown').hidden,true);
  targetTrend.querySelectorAll('button')[0].dispatch('click');
  assert.equal(targetTrend.hidden,true);
  assert.equal(chart.children.find(item=>item.className==='finding-breakdown').hidden,false);

  assert.equal(explainCalls.length,1);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(explainCalls.length,1);
  assert.equal(explainCalls[0].url,'/api/ai/explain-finding');
  assert.equal(explainCalls[0].body.finding.current_samples,7);
  assert.equal(explainCalls[0].body.context.daily.current.length,7);
  assert.equal(explainCalls[0].body.context.daily.current[0].value,200);
  assert.equal(explainCalls[0].body.context.daily.previous[0].value,100);
  assert.equal(explainCalls[0].body.context.group_count,1);
  assert.equal('rows' in explainCalls[0].body,false);
  changeCard=elements.get('#analysis-findings').children.find(item=>item.className?.includes('change'));
  assert.ok(changeCard.children.some(item=>item.className==='finding-ai-explanation'));
  assert.equal(changeCard.children.find(item=>item.className==='finding-chart').hidden,false);
  changeCard.children.find(item=>item.className==='finding-ai-actions').querySelectorAll('button')[0].dispatch('click');
  assert.equal(changeCard.children.find(item=>item.className==='finding-chart').hidden,true);
  assert.equal(changeCard.children.find(item=>item.className==='finding-ai-explanation').hidden,true);
  changeCard.children.find(item=>item.className==='finding-ai-actions').querySelectorAll('button')[0].dispatch('click');
  assert.equal(explainCalls.length,1);
  assert.equal(changeCard.children.find(item=>item.className==='finding-ai-explanation').hidden,false);
  run('renderAnalysis()');assert.equal(explainCalls.length,1);
  assert.ok(elements.get('#analysis-findings').children.find(item=>item.className?.includes('change')).children.some(item=>item.className==='finding-ai-explanation'));
  const analysisSnapshot=run('JSON.stringify([analysisGroup,analysisTargets,analysisMetrics,analysisOperationFor(2)])');
  run("$('#aggregation').value='sum';comparisonMetrics=[];renderAnalysis();");
  assert.equal(run('JSON.stringify([analysisGroup,analysisTargets,analysisMetrics,analysisOperationFor(2)])'),analysisSnapshot);
  run("analysisTargets=['A'];$('#analysis-aggregation').value='mean';renderAnalysis();");
  assert.equal(run('analysisOperationFor(2)'),'mean');
  assert.equal(run("$('#aggregation').value"),'sum');
  console.log('PASS: anomaly metric selection, targets and aggregation remain independent from dashboard');
  run(`globalThis.contextRows=Array.from({length:62},(_,i)=>{const date=new Date(Date.UTC(2026,6,1+i)).toISOString().slice(0,10);return [date,i%2?'B':'A',i===45?10000:i+1];});globalThis.extraEvidence=buildFindingContext(contextRows,{index:2,aggregation:'sum'},{start:'2026-08-01',end:'2026-08-31',previousStart:'2026-07-01',previousEnd:'2026-07-31'},[{index:2,name:'Cost',aggregation:'sum'}],1,0);`);
  assert.equal(run('extraEvidence.daily.current_days'),31);
  assert.ok(run('extraEvidence.daily.current.length')<=30);
  assert.equal(run('extraEvidence.daily.current.some(point=>point.value===10000)'),true);
  assert.equal(run('extraEvidence.group_count'),2);
  assert.equal(run('extraEvidence.groups.length'),2);
  assert.equal(run('extraEvidence.related_metrics.length'),0);
  run(`globalThis.breakdownRows=[...Array.from({length:6},(_,i)=>['2026-10-'+String(i+1).padStart(2,'0'),'A',i<3?100:50]),['2026-10-04','New',10]];globalThis.breakdown=findingBreakdown(breakdownRows,{index:2,aggregation:'mean',pct:-50},{start:'2026-10-04',end:'2026-10-06',previousStart:'2026-10-01',previousEnd:'2026-10-03'},0,1);`);
  assert.equal(run('breakdown[0].key'),'A');
  assert.equal(run('breakdown[0].before'),100);
  assert.equal(run('breakdown[0].after'),50);
  assert.equal(run('breakdown[0].pct'),-50);
  assert.equal(run('breakdown[1].before'),null);
  assert.equal(run('breakdown[1].pct'),null);
  assert.equal(run('breakdown[1].valid'),false);
  console.log('PASS: dimension breakdown compares period means, ranks decreases and preserves missing data');

  console.log('PASS: per-finding AI request, aggregate-only evidence and retained session explanation');
  console.log('PASS: approved settings restore across column reorder and added rows, reject schema, numeric format and currency changes');
  console.log('PASS: LLM review before application, session-only drafts, reset and discard, priority/aggregation, sample-only payload, quota error preservation, NVIDIA-only UI and stale-response protection');
})().catch(error=>{console.error(error);process.exitCode=1;});
