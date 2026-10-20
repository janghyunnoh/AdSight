(function (root) {
  const KEY = 'adsight.development-notes.v1';
  function clean(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).filter(note => {
      if (!note || typeof note.id !== 'string' || seen.has(note.id) || typeof note.text !== 'string' || !note.text.trim() || !Number.isFinite(Date.parse(note.createdAt))) return false;
      seen.add(note.id); return true;
    }).map(note => ({id: note.id, text: note.text.slice(0, 4000), createdAt: note.createdAt, done: note.done === true, context: typeof note.context === 'string' ? note.context.slice(0, 500) : ''}));
  }
  function read(storage) { try {return clean(JSON.parse(storage.getItem(KEY) || '[]'));} catch {return [];} }
  function write(storage, notes) { try {storage.setItem(KEY, JSON.stringify(clean(notes))); return true;} catch {return false;} }
  function exportText(notes) {
    return ['AdSight 피드백', '', ...notes.map(note => `${note.done ? '[완료]' : '[진행 전]'} ${new Date(note.createdAt).toLocaleString('ko-KR')}\n${note.context ? note.context + '\n' : ''}${note.text}\n`)].join('\n');
  }
  if (typeof module !== 'undefined' && module.exports) {module.exports = {KEY, clean, read, write, exportText}; return;}
  const $ = selector => document.querySelector(selector);
  let storage = null; try {storage = root.localStorage;} catch { /* Storage can be unavailable. */ }
  let notes = [], editing = null, busy = false, ready = false, syncing = false;
  const panel = $('#notes-panel'), input = $('#notes-input');
  const status = message => {$('#notes-status').textContent = message;};
  async function api(path = '', method = 'GET', body) {
    const response = await fetch('/api/notes' + path, {
      method, cache: 'no-store', headers: body ? {'Content-Type': 'application/json'} : {},
      ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '기록을 저장하지 못했습니다. 입력 내용을 확인해 주세요.');
    return data.notes;
  }
  async function sync() {
    if (busy || syncing) return;
    syncing = true;
    try {
      // Import only after server acknowledgement. The old copy remains on failure.
      const legacy = read(storage);
      for (let offset = 0; offset < legacy.length; offset += 100) {
        await api('/import', 'POST', {notes: legacy.slice(offset, offset + 100)});
      }
      if (legacy.length) {try {storage.removeItem(KEY);} catch { /* Import is idempotent. */ }}
      notes = await api(); ready = true;
      status(''); render();
    } catch (error) {
      status('서버에 연결하지 못했습니다. 기존 기록과 입력 내용은 유지됩니다. 새로고침해 주세요.');
    } finally {syncing = false; render();}
  }
  async function mutate(action, success) {
    if (busy || !ready || syncing) return;
    busy = true; render();
    try {
      notes = await action();
      if (success) success();
      status('');
    } catch (error) {
      status(error.message || '저장하지 못했습니다. 다시 시도해 주세요.');
      try {
        notes = await api();
        if (editing) editing.version = notes.find(note => note.id === editing.id)?.version;
      } catch { /* Keep current list and draft when offline. */ }
    } finally {busy = false; render();}
  }
  function button(label, action) {const el = document.createElement('button'); el.type = 'button'; el.className = 'text-button'; el.textContent = label; el.disabled = busy || !ready || syncing; el.addEventListener('click', action); return el;}
  function render() {
    const filter = $('#notes-filter').value;
    const list = $('#notes-list'); list.replaceChildren();
    const visible = notes.filter(note => filter === 'all' || (filter === 'done' ? note.done : !note.done)).sort((a,b)=>Number(a.done)-Number(b.done)||Date.parse(b.createdAt)-Date.parse(a.createdAt));
    if (!visible.length) {const empty = document.createElement('p'); empty.className = 'notes-empty'; empty.textContent = !ready ? '공유 기록을 불러오는 중입니다.' : notes.length ? '해당 상태의 기록이 없습니다.' : '다음에 만들고 싶은 기능을 남겨보세요.'; list.append(empty);}
    visible.forEach(note => {
      const item = document.createElement('article'); item.className = 'feedback-item' + (note.done ? ' done' : ''); item.setAttribute('role', 'listitem');
      const meta = document.createElement('div'); meta.className = 'note-meta';
      const time = document.createElement('time'); time.dateTime = note.createdAt; time.textContent = new Date(note.createdAt).toLocaleString('ko-KR');
      const state = document.createElement('span'); state.textContent = note.done ? '해결됨' : '미해결'; meta.append(state, time);
      const content = document.createElement('p'); content.textContent = note.text;
      const context = document.createElement('small'); context.textContent = ''; context.hidden=true;
      const actions = document.createElement('div'); actions.className = 'note-actions';
      const check=document.createElement('input');check.type='checkbox';check.checked=note.done;
      check.className='feedback-check';check.disabled=busy||!ready||syncing;
      check.setAttribute('aria-label','해결됨: '+note.text.slice(0,80));
      check.addEventListener('change',()=>mutate(()=>api('/'+note.id,'PATCH',{done:check.checked,version:note.version})));
      actions.append(button('수정', () => {editing = {id: note.id, version: note.version}; input.value = note.text; input.focus(); render(); status('기록을 수정하고 있습니다. 수정 저장을 누르면 반영됩니다.');}), button('삭제', () => mutate(() => api('/' + note.id + '?version=' + note.version, 'DELETE'), () => {
        if (editing?.id === note.id) {editing = null; input.value = '';}
      })));
      item.append(check, meta, content, context, actions); list.append(item);
    });
    const open = notes.filter(note => !note.done).length;
    $('#feedback-summary').textContent=`전체 ${notes.length}개 · 미해결 ${open}개 · 해결됨 ${notes.length-open}개`;
    $('#notes-cancel-edit').hidden=!editing;
    $('#notes-count').textContent = String(open); $('#notes-count').hidden = open === 0;
    $('#notes-form button[type="submit"]').disabled = busy || !ready || syncing;
    $('#notes-form button[type="submit"]').textContent=editing?'수정 저장':'등록';
  }
  $('#notes-cancel-edit').addEventListener('click',()=>{editing=null;input.value='';status('');render();});
  $('#notes-filter').addEventListener('change', render);
  $('#notes-form').addEventListener('submit', event => {
    event.preventDefault(); const text = input.value.trim(); if (!text) return;
    const draft = text;
    let action;
    if (editing) {
      if (!editing.version) {status('수정 중인 기록이 삭제됐습니다. 내용을 복사한 뒤 새 기록으로 남겨 주세요.'); return;}
      action = () => api('/' + editing.id, 'PATCH', {text, version: editing.version});
    } else {
      const page = $('#breadcrumb')?.textContent || '';
      const title = $('#document-info')?.hidden ? '' : $('#document-title')?.textContent || '';
      const id = root.crypto?.randomUUID ? root.crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2);
      const note = {id, text, done: false, createdAt: new Date().toISOString(), context: [page, title].filter(Boolean).join(' / ')};
      action = () => api('', 'POST', note);
    }
    mutate(action, () => {
      editing = null;
      if (input.value.trim() === draft) input.value = '';
      input.focus();
    });
  });
  input.addEventListener('keydown', event => {if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {event.preventDefault(); $('#notes-form').requestSubmit();}});
  root.AdSightFeedback = {refresh: sync};
  root.addEventListener('focus', sync);
  setInterval(() => {if (!document.hidden && !$('#feedback-view').hidden) sync();}, 10000);
  render(); sync();
})(globalThis);
