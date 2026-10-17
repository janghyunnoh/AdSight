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
    return ['AdSight 개발 노트', '', ...notes.map(note => `${note.done ? '[완료]' : '[진행 전]'} ${new Date(note.createdAt).toLocaleString('ko-KR')}\n${note.context ? note.context + '\n' : ''}${note.text}\n`)].join('\n');
  }
  if (typeof module !== 'undefined' && module.exports) {module.exports = {KEY, clean, read, write, exportText}; return;}
  const $ = selector => document.querySelector(selector);
  let storage = null; try {storage = root.localStorage;} catch { /* Storage can be unavailable. */ }
  let notes = read(storage);
  let editing = null;
  const toggle = $('#notes-toggle'), panel = $('#notes-panel'), input = $('#notes-input');
  function save() {$('#notes-status').textContent = write(storage, notes) ? '현재 브라우저에 저장됐습니다.' : '브라우저 저장이 불가능해 이 페이지에서만 유지됩니다. 내보내기로 보관해 주세요.';}
  function setOpen(open) {
    panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
    if (open) {render(); input.focus();} else toggle.focus();
  }
  function button(label, action) {const el = document.createElement('button'); el.type = 'button'; el.className = 'text-button'; el.textContent = label; el.addEventListener('click', action); return el;}
  function render() {
    const filter = $('#notes-filter').value;
    const list = $('#notes-list'); list.replaceChildren();
    const visible = notes.filter(note => filter === 'all' || (filter === 'done' ? note.done : !note.done));
    if (!visible.length) {const empty = document.createElement('p'); empty.className = 'notes-empty'; empty.textContent = notes.length ? '해당 상태의 기록이 없습니다.' : '다음에 만들고 싶은 기능을 남겨보세요.'; list.append(empty);}
    visible.forEach(note => {
      const item = document.createElement('article'); item.className = 'note-message' + (note.done ? ' done' : ''); item.setAttribute('role', 'listitem');
      const meta = document.createElement('div'); meta.className = 'note-meta';
      const time = document.createElement('time'); time.dateTime = note.createdAt; time.textContent = new Date(note.createdAt).toLocaleString('ko-KR');
      const state = document.createElement('span'); state.textContent = note.done ? '완료' : '진행 전'; meta.append(state, time);
      const content = document.createElement('p'); content.textContent = note.text;
      const context = document.createElement('small'); context.textContent = note.context;
      const actions = document.createElement('div'); actions.className = 'note-actions';
      actions.append(button(note.done ? '다시 열기' : '완료 표시', () => {note.done = !note.done; save(); render();}), button('수정', () => {editing = note.id; input.value = note.text; input.focus(); $('#notes-status').textContent = '기록을 수정하고 있습니다. 기록하기를 누르면 저장됩니다.';}), button('삭제', () => {
        notes = notes.filter(item => item.id !== note.id);
        if (editing === note.id) {editing = null; input.value = '';}
        save(); render();
      }));
      item.append(meta, content, context, actions); list.append(item);
    });
    const open = notes.filter(note => !note.done).length;
    $('#notes-count').textContent = String(open); $('#notes-count').hidden = open === 0;
    $('#notes-export').disabled = !notes.length;
  }
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  $('#notes-close').addEventListener('click', () => setOpen(false));
  panel.addEventListener('keydown', event => {if (event.key === 'Escape') setOpen(false);});
  $('#notes-filter').addEventListener('change', render);
  $('#notes-form').addEventListener('submit', event => {
    event.preventDefault(); const text = input.value.trim(); if (!text) return;
    const existing = notes.find(note => note.id === editing);
    if (existing) existing.text = text;
    else {
      const page = $('#breadcrumb')?.textContent || '';
      const title = $('#document-info')?.hidden ? '' : $('#document-title')?.textContent || '';
      const id = root.crypto?.randomUUID ? root.crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2);
      notes.push({id, text, done: false, createdAt: new Date().toISOString(), context: [page, title].filter(Boolean).join(' / ')});
    }
    editing = null; input.value = ''; save(); render(); $('#notes-list').scrollTop = $('#notes-list').scrollHeight; input.focus();
  });
  input.addEventListener('keydown', event => {if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {event.preventDefault(); $('#notes-form').requestSubmit();}});
  $('#notes-export').addEventListener('click', () => {
    const blob = new Blob([exportText(notes)], {type: 'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'adsight-notes-' + new Date().toISOString().slice(0,10) + '.txt';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  root.addEventListener('storage', event => {if (event.key === KEY || event.key === null) {notes = read(storage); render();}});
  render();
})(globalThis);
