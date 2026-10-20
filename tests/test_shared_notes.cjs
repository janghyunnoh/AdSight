const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
class Element {
  constructor() { this.children=[]; this.handlers={}; this.value=''; this.hidden=false; this.textContent=''; }
  addEventListener(name, fn) { this.handlers[name]=fn; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children=items; }
  setAttribute() {} focus() {}
}
const elements = new Map();
const get = key => {if (!elements.has(key)) elements.set(key, new Element()); return elements.get(key);};
get('#notes-filter').value='all';
get('#notes-panel').hidden=true;
const legacy={id:'old-1', text:'기존 요청', context:'', createdAt:'2026-10-18T01:00:00Z', done:false};
const storage=new Map([['adsight.development-notes.v1', JSON.stringify([legacy])]]);
let server=[], fail=false, interval;
const calls=[];
const context={
  document:{querySelector:get,createElement:()=>new Element(),hidden:false},
  localStorage:{getItem:key=>storage.get(key),removeItem:key=>storage.delete(key)},
  addEventListener(){},setInterval:fn=>{interval=fn;},setTimeout,AbortSignal,
  fetch:async (url, options)=>{
    calls.push({url,...options});
    if (fail) throw new Error('offline');
    if(url.endsWith('/import')) server=[{...legacy,version:1}];
    if(options.method==='PATCH') server=server.map(note=>({...note,...JSON.parse(options.body),version:note.version+1}));
    return {ok:true,json:async()=>({notes:structuredClone(server)})};
  }
};
vm.runInNewContext(fs.readFileSync('app/static/notes.js','utf8'), context);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  await flush();
  assert.equal(storage.has('adsight.development-notes.v1'),false);
  assert.equal(get('#notes-list').children.length,1);
  assert.equal(get('#notes-form button[type="submit"]').disabled,false);
  let article=get('#notes-list').children[0];
  article.children[0].checked=true;article.children[0].handlers.change();
  await flush();
  assert.equal(server[0].done,true);
  assert.equal(get('#notes-list').children[0].children[1].children[0].textContent,'해결됨');
  // A remote update appears while the panel is open.
  get('#notes-panel').hidden=false;
  server[0].text='다른 사용자의 수정'; interval(); await flush();
  assert.equal(get('#notes-list').children[0].children[2].textContent,'다른 사용자의 수정');
  // Failed saves keep the draft and the server state.
  fail=true; get('#notes-input').value='저장할 초안';
  get('#notes-form').handlers.submit({preventDefault(){}}); await flush();
  assert.equal(get('#notes-input').value,'저장할 초안');
  assert.equal(server.length,1);
  assert.ok(calls.some(call=>call.url.endsWith('/import')));
  console.log('PASS: legacy migration, shared completion, polling, enabled controls and draft retention on failure');
})().catch(error=>{console.error(error);process.exitCode=1;});
