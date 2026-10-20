const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const elements=new Map();
function get(id){if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',handlers:{},attributes:{},focus(){this.focused=true;},setAttribute(key,value){this.attributes[key]=value;},addEventListener(event,fn){this.handlers[event]=fn;}});return elements.get(id);}
get('#assistant-panel').hidden=true;let screen='대시보드';let requests=0;
const context={document:{querySelector:get},getAssistantContext:()=>`화면: ${screen}\n문서: 테스트\n지표: 비용`,fetch:()=>{requests++;throw new Error('No AI request should be made');}};
vm.runInNewContext(fs.readFileSync('app/static/assistant.js','utf8'),context);
get('#assistant-toggle').handlers.click();
assert.equal(get('#assistant-panel').hidden,false);assert.equal(get('#assistant-toggle').attributes['aria-expanded'],'true');
assert.ok(get('#assistant-context').textContent.includes('대시보드'));assert.equal(get('#assistant-close').focused,true);
screen='특이사항';context.AdSightAssistant.refresh();assert.ok(get('#assistant-context').textContent.includes('특이사항'));
get('#assistant-panel').handlers.keydown({key:'Escape',preventDefault(){}});
assert.equal(get('#assistant-panel').hidden,true);assert.equal(get('#assistant-toggle').focused,true);
get('#assistant-toggle').handlers.click();get('#assistant-close').handlers.click();assert.equal(get('#assistant-panel').hidden,true);
assert.equal(requests,0);
const html=fs.readFileSync('app/static/index.html','utf8');
assert.ok(html.includes('data-view="feedback"'));assert.ok(!html.includes('data-view="agent"'));
assert.ok(!html.includes('id="notes-toggle"'));assert.ok(html.includes('id="assistant-input"'));
assert.ok(/<textarea id="assistant-input"[^>]*disabled/.test(html));
console.log('PASS: assistant open/close/Escape/focus, context refresh, no LLM request and feedback navigation markup');
