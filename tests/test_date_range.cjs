const assert = require('node:assert/strict');
const R = require('../app/static/date-range.js');
const day = text => Date.parse(text + 'T00:00:00Z');
assert.equal(R.bounds([null, undefined, NaN]),null);
assert.deepEqual(R.recent([],7),{from:'',to:''});
assert.deepEqual(R.recent([day('2020-02-01'),day('2020-03-01')],7),{from:'2020-02-24',to:'2020-03-01'});
assert.deepEqual(R.recent([day('2021-01-01'),day('2021-01-02')],30),{from:'2021-01-01',to:'2021-01-02'});
assert.deepEqual(R.recent([day('2021-12-31'),day('2022-01-03')],7),{from:'2021-12-31',to:'2022-01-03'});
assert.deepEqual(R.recent([day('2021-01-01')],7),{from:'2021-01-01',to:'2021-01-01'});
const cells = R.cells(2020 * 12 + 1);
assert.equal(cells.length,42);
assert.ok(cells.includes(day('2020-02-29')));
assert.equal(new Date(cells[0]).getUTCDay(),0);
assert.equal(cells[41]-cells[0],41*86400000);
console.log('PASS: empty/short/single-day ranges, historical dates, leap day, year boundary and UTC calendar grid');
// Regression: the clicked date is detached by render() before document click fires.
const vm=require('node:vm'),fs=require('node:fs');
class El{
 constructor(){this.children=[];this.events={};this.attrs={};this.style={};this.classList={add(){}};this.value='';}
 addEventListener(n,f){this.events[n]=f;}
 append(...items){this.children.push(...items);}
 replaceChildren(){this.children=[];}
 setAttribute(n,v){this.attrs[n]=v;}
 getAttribute(n){return this.attrs[n];}
 querySelectorAll(){return this.children.flatMap(c=>[c,...c.querySelectorAll()]);}
 focus(){} contains(){return false;}
 getBoundingClientRect(){return {right:500};}
}
const els=new Map(),handlers={};const get=s=>{if(!els.has(s))els.set(s,new El());return els.get(s);};
function Opt(label,value){const el=new El();el.value=value;return el;}
const browser={innerWidth:1200,Option:Opt,document:{querySelector:get,createElement:()=>new El(),addEventListener:(n,f)=>handlers[n]=f}};
vm.createContext(browser);vm.runInContext(fs.readFileSync('app/static/date-range.js','utf8'),browser);
let applied=null;
browser.AdSightDates.create({getDays:()=>[day('2021-01-01'),day('2021-01-31')],getRange:()=>({from:'',to:''}),onApply:value=>applied=value});
const picker=get('#date-range-picker');picker.open=true;picker.events.toggle();
function dateClick(label){
 const button=get('#range-calendars').querySelectorAll().find(el=>el.attrs['aria-label']===label);
 assert.ok(button);button.events.click();
 handlers.click({target:button,composedPath:()=>[button,picker]});
 assert.equal(picker.open,true);
}
dateClick('2021.01.05');assert.equal(get('#date-range-apply').disabled,true);assert.equal(applied,null);
dateClick('2021.01.12');assert.equal(get('#date-range-apply').disabled,false);assert.equal(applied,null);
get('#date-range-apply').events.click();assert.equal(picker.open,false);
assert.equal(applied.from,'2021-01-05');assert.equal(applied.to,'2021-01-12');
picker.open=true;handlers.click({target:new El(),composedPath:()=>[]});assert.equal(picker.open,false);
console.log('PASS: detached date clicks keep picker open until apply; outside clicks close it');
// A prefixed picker has independent controls and state while sharing the same implementation.
let secondaryApplied=null;
browser.AdSightDates.create({prefix:'secondary-',getDays:()=>[day('2021-01-01'),day('2021-01-31')],getRange:()=>({from:'2021-01-02',to:'2021-01-10'}),onApply:value=>secondaryApplied=value,presetActions:[{id:'#date-preset-test',value:()=>({from:'2021-01-05',to:'2021-01-15',mode:'custom'})}]});
const secondary=get('#secondary-date-range-picker');secondary.open=true;secondary.events.toggle();
const secondaryButton=get('#secondary-range-calendars').querySelectorAll().find(el=>el.attrs['aria-label']==='2021.01.07');
secondaryButton.events.click();handlers.click({target:secondaryButton,composedPath:()=>[secondaryButton,secondary]});
assert.equal(secondary.open,true);assert.equal(picker.open,false);assert.equal(secondaryApplied,null);
get('#secondary-date-preset-test').events.click();
assert.equal(secondaryApplied.from,'2021-01-05');assert.equal(secondaryApplied.mode,'custom');assert.equal(secondary.open,false);
assert.equal(applied.from,'2021-01-05');assert.equal(applied.to,'2021-01-12');
console.log('PASS: independent prefixed calendars, detached clicks and configurable quick selections');
