/* Deterministic checks; thresholds are review rules, not statistical significance. */
(function(root) {
  const D = typeof module !== 'undefined' && module.exports ? require('./data-utils.js') : root.AdSightData;
  const DAY=86400000, iso=value=>new Date(value).toISOString().slice(0,10);
  function inspect({rows,dateColumn,metrics,operation='sum',from='',to='',days=7,threshold=5,increaseThreshold=threshold,decreaseThreshold=threshold,minSamples=3,previousFrom='',previousTo=''}) {
    const findings=[],valid=rows.map(row=>({row,day:D.date(row[dateColumn])}));
    const dates=valid.filter(item=>item.day!==null).map(item=>item.day);
    const invalid=valid.length-dates.length;
    if(invalid) findings.push({kind:'quality',title:'날짜를 확인할 행이 있습니다',detail:`${invalid}개 행의 날짜가 비어 있거나 해석되지 않아 기간 비교에서 제외했습니다.`});
    const seen=new Set();let duplicates=0;
    rows.forEach(row=>{const key=JSON.stringify(row);if(seen.has(key))duplicates++;else seen.add(key);});
    if(duplicates) findings.push({kind:'quality',title:'내용이 동일한 행이 있습니다',detail:`${duplicates}개 행이 앞선 행과 모든 값이 같습니다. 정상적인 반복 기록일 수도 있으므로 원본을 확인하세요. 자동으로 제외하지 않았습니다.`});
    if(!dates.length)return {findings,reason:'날짜 기준 컬럼을 선택하고 날짜 형식을 확인해 주세요.',checked:0};
    const end=D.date(to)??dates.reduce((a,b)=>Math.max(a,b));
    const start=D.date(from)??end-(days-1)*DAY;
    if(start>end)return {findings,reason:'시작 날짜가 종료 날짜보다 늦습니다.',checked:0};
    const length=Math.round((end-start)/DAY)+1,previousStart=D.date(previousFrom)??start-length*DAY,previousEnd=D.date(previousTo)??start-DAY;
    if(previousStart>previousEnd)return {findings,reason:'비교 시작일이 종료일보다 늦습니다.',checked:0};
    const previousLength=Math.round((previousEnd-previousStart)/DAY)+1;
    const current=valid.filter(item=>item.day!==null&&item.day>=start&&item.day<=end).map(item=>item.row);
    const previous=valid.filter(item=>item.day!==null&&item.day>=previousStart&&item.day<=previousEnd).map(item=>item.row);
    const period={start:iso(start),end:iso(end),previousStart:iso(previousStart),previousEnd:iso(previousEnd),currentRows:current.length,previousRows:previous.length};
    const distinct=data=>new Set(data.map(row=>D.date(row[dateColumn]))).size;
    const currentDays=distinct(current),previousDays=distinct(previous);
    if(currentDays<length||previousDays<previousLength)findings.push({kind:'quality',title:'비교 기간의 날짜가 모두 채워져 있지 않습니다',detail:`현재 기간은 ${length}일 중 ${currentDays}일, 이전 기간은 ${previousLength}일 중 ${previousDays}일에 기록이 있습니다. 휴무일 또는 누락 여부를 확인하세요. 없는 날짜를 0으로 채우지 않습니다.`});
    let checked=0;
    metrics.forEach(({index,name,aggregation})=>{
      const method=aggregation||operation;
      const a=D.aggregate(current,-1,index,method)[0],b=D.aggregate(previous,-1,index,method)[0];
      const missing=current.filter(row=>D.number(row[index])===null).length;
      if(missing)findings.push({kind:'quality',title:`${name}: 집계에서 제외한 값이 있습니다`,detail:`현재 기간 ${current.length}개 행 중 ${missing}개 값이 비어 있거나 숫자가 아닙니다.`});
      if(!a||!b||a.valid<minSamples||b.valid<minSamples){findings.push({kind:'quality',title:`${name}: 비교할 표본이 부족합니다`,detail:`각 기간에 숫자 값이 ${minSamples}개 이상 필요합니다. 현재 ${a?.valid||0}개, 이전 ${b?.valid||0}개이므로 변화율을 계산하지 않았습니다.`,metric:name,index,aggregation:method,currentSamples:a?.valid||0,previousSamples:b?.valid||0});return;}
      checked++;
      if(b.value===0){if(a.value!==0)findings.push({kind:'change',title:`${name}: 이전 기간 0에서 변화`,detail:'이전 값이 0이므로 증감률을 계산하지 않았습니다.',metric:name,index,aggregation:method,currentSamples:a.valid,previousSamples:b.valid,pct:null,before:b.value,after:a.value});return;}
      const pct=(a.value-b.value)/Math.abs(b.value)*100;
      if(pct>=increaseThreshold||pct<=-decreaseThreshold)findings.push({kind:'change',title:`${name} ${Math.abs(pct).toFixed(1)}% ${pct>0?'증가':'감소'}`,detail:`선택한 두 기간을 비교한 ${method==='sum'?'합계':'평균'} 변화입니다. 원인이나 성과의 좋고 나쁨을 확정하지 않습니다.`,metric:name,index,aggregation:method,currentSamples:a.valid,previousSamples:b.valid,pct,before:b.value,after:a.value});
    });
    return {findings,period,checked,reason:checked===0?'양쪽 기간에 지표별 숫자 값이 각각 3개 이상 있어야 변화율을 점검합니다. 비교 기간이나 지표를 조정해 주세요.':''};
  }
  function shiftMonths(day,months){
    const source=new Date(day),month=source.getUTCFullYear()*12+source.getUTCMonth()+months;
    const year=Math.floor(month/12),part=(month%12+12)%12;
    const last=new Date(Date.UTC(year,part+1,0)).getUTCDate();
    return Date.UTC(year,part,Math.min(source.getUTCDate(),last));
  }
  function resolvePeriods({days,months='7d',from='',to='',comparison='previous',previousFrom='',previousTo=''}){
    const valid=days.filter(Number.isFinite);
    if(!valid.length)return {error:'날짜 컬럼을 설정하고 날짜 데이터를 확인해 주세요.'};
    const end=months==='custom'?D.date(to):valid.reduce((a,b)=>Math.max(a,b));
    const start=months==='custom'?D.date(from):/^(7|14)d$/.test(String(months))?end-(parseInt(months,10)-1)*DAY:shiftMonths(end,-Number(months))+DAY;
    if(start===null||end===null||!Number.isFinite(start)||!Number.isFinite(end))return {error:'분석 시작일과 종료일을 선택해 주세요.'};
    if(start>end)return {error:'분석 시작일은 종료일보다 늦을 수 없습니다.'};
    let pStart,pEnd;
    if(comparison==='custom'){pStart=D.date(previousFrom);pEnd=D.date(previousTo);}
    else if(['month','quarter','year'].includes(comparison)){const offset={month:1,quarter:3,year:12}[comparison];pStart=shiftMonths(start,-offset);pEnd=shiftMonths(end,-offset);}
    else{pEnd=start-DAY;pStart=start-(Math.round((end-start)/DAY)+1)*DAY;}
    if(pStart===null||pEnd===null)return {error:'비교 시작일과 종료일을 선택해 주세요.'};
    if(pStart>pEnd)return {error:'비교 시작일은 종료일보다 늦을 수 없습니다.'};
    const warning=pStart<=end&&pEnd>=start?'두 기간에 겹치는 날짜가 포함되어 있습니다.':Math.round((end-start)/DAY)!==Math.round((pEnd-pStart)/DAY)?'두 기간의 길이가 다릅니다. 합계 비교 시 기간 차이를 고려하세요.':'';
    return {from:iso(start),to:iso(end),previousFrom:iso(pStart),previousTo:iso(pEnd),warning};
  }
  const api={inspect,resolvePeriods};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AdSightAnomalies=api;
})(globalThis);
