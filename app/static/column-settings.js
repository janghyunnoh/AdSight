/* Value-based role suggestions; business descriptions are free text. */
(function(root){
  const D=typeof module!=='undefined'&&module.exports?require('./data-utils.js'):root.AdSightData;
  const roles=['date','dimension','identifier','metric','ignore'];
  function suggest(columns,rows){
    return columns.map((name,index)=>{
      const values=rows.map(row=>row[index]).filter(value=>value!==null&&value!==undefined&&String(value).trim()!=='');
      const dates=values.filter(value=>D.date(value)!==null).length;
      const numbers=values.map(D.number).filter(value=>value!==null);
      const type=D.metricType(rows,index);
      const distinct=new Set(values.map(D.text)).size;
      let role='ignore',reason='값이 없어 역할을 추천하지 않았습니다.';
      if(values.length){
        if(dates/values.length>=.8){role='date';reason='값의 80% 이상이 날짜 형식입니다.';}
        else if(type.conflict){role='ignore';reason='서로 다른 단위가 섞여 있습니다. 원본 단위를 먼저 확인하세요.';}
        else if(numbers.length/values.length>=.8){
          if(!type.unit&&values.length>=10&&distinct===values.length&&numbers.every(Number.isInteger)){role='identifier';reason='모든 값이 서로 다른 정수입니다. 실제 측정값일 수도 있으므로 확인하세요.';}
          else{role='metric';reason='값의 80% 이상을 숫자로 읽을 수 있습니다. 업무상 의미는 직접 지정해 주세요.';}
        }else{role='dimension';reason='문자 또는 범주 값입니다. 비교 대상으로 사용할지 확인하세요.';}
      }
      return {role,aggregation:'mean',unit:type.unit,reason};
    });
  }
  function valid(settings,length){return Array.isArray(settings)&&settings.length===length&&settings.every(item=>item&&roles.includes(item.role)&&['sum','mean'].includes(item.aggregation));}
  function validate(settings,rows){
    if(settings.filter(item=>item.role==='date').length>1)return '날짜 기준은 한 컬럼만 선택해 주세요.';
    for(let index=0;index<settings.length;index++){
      const item=settings[index];
      if(item.role==='date'&&!rows.some(row=>D.date(row[index])!==null))return `${index+1}번째 컬럼에서 날짜를 읽을 수 없습니다.`;
      if(item.role==='metric'&&!D.metricType(rows,index).eligible)return `${index+1}번째 컬럼의 숫자 형식 또는 혼합 단위를 확인해 주세요.`;
    }
    return '';
  }
  const api={suggest,valid,validate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AdSightColumns=api;
})(globalThis);
