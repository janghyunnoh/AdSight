const assert=require('node:assert/strict');const C=require('../app/static/column-settings.js');const A=require('../app/static/anomalies.js');
const rows=Array.from({length:14},(_,i)=>['2026-10-'+String(i+1).padStart(2,'0'),'A',i+1,'$'+(i<7?100:200),i<7?20:10]);
const settings=C.suggest(['anything','anything else','not-an-id','unknown-cost','unknown-count'],rows);
assert.equal(settings[0].role,'date');assert.equal(settings[1].role,'dimension');assert.equal(settings[2].role,'identifier');assert.equal(settings[3].role,'metric');
assert.ok(settings.every(item=>!('meaning' in item)));
assert.deepEqual(C.suggest(['Date','Company','Campaign_ID','Spend','Conversions'],rows),settings); // Names do not influence suggestions.
assert.equal(C.valid(settings,5),true);assert.equal(C.valid(settings,4),false);
assert.equal(C.validate(settings,rows),'');
assert.ok(C.validate(settings.map((item,i)=>({...item,role:i===1?'date':item.role})),rows).includes('한 컬럼'));
assert.ok(C.validate([{role:'metric'}],[['USD 10'],['KRW 20']]).length>0);
const metrics=[{index:3,name:'X',aggregation:'sum'},{index:4,name:'Y',aggregation:'mean'}];
let found=A.inspect({rows,dateColumn:0,metrics,operation:'mean'});
assert.equal(found.findings.find(item=>item.metric==='X').after,1400);
assert.equal(found.findings.find(item=>item.metric==='Y').after,10);
assert.ok(!found.findings.some(item=>item.kind==='balance'));
found=A.inspect({rows,dateColumn:0,metrics:metrics.map((item,i)=>({...item,meaning:i?'conversions':'spend'}))});
assert.ok(!found.findings.some(item=>item.kind==='balance')); // Legacy categories must not trigger business conclusions.
assert.equal(C.suggest(['empty'],[])[0].role,'ignore');
console.log('PASS: value-only suggestions, column renaming invariance, no fixed business taxonomy, mixed units, validation and per-column aggregation');
