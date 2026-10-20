(function (root) {
  const DAY = 86400000;
  const iso = day => new Date(day).toISOString().slice(0, 10);
  const label = day => iso(day).replaceAll('-', '.');
  function bounds(days) {
    const valid = days.filter(day => Number.isFinite(day));
    if (!valid.length) return null;
    return {min: valid.reduce((a,b) => Math.min(a,b)), max: valid.reduce((a,b) => Math.max(a,b))};
  }
  function recent(days, count) {
    const range = bounds(days);
    return range ? {from: iso(Math.max(range.min, range.max - (count - 1) * DAY)), to: iso(range.max)} : {from: '', to: ''};
  }
  function monthOf(day) {const date = new Date(day); return date.getUTCFullYear() * 12 + date.getUTCMonth();}
  function monthStart(month) {return Date.UTC(Math.floor(month / 12), month % 12, 1);}
  function cells(month) {
    const first = monthStart(month), offset = new Date(first).getUTCDay();
    return Array.from({length: 42}, (_, i) => first + (i - offset) * DAY);
  }
  const api = {bounds, recent, cells, iso};
  if (typeof module !== 'undefined' && module.exports) {module.exports = api; return;}
  api.create = function ({getDays, getRange, onApply, prefix="", presetActions=null, getSelectableDays=null}) {
    const $ = selector => document.querySelector(prefix&&selector.startsWith('#')?'#'+prefix+selector.slice(1):selector);
    const picker = $('#date-range-picker');
    let range = null, from = null, to = null, month = null, waitingEnd = false;
    function clampMonth(value) {return Math.max(monthOf(range.min), Math.min(monthOf(range.max), value));}
    function close() {picker.open = false; $('#date-range-label').focus();}
    function apply(value) {onApply(value); close();}
    function render() {
      if (!range) return;
      $('#calendar-prev').disabled = month <= monthOf(range.min);
      $('#calendar-next').disabled = month >= monthOf(range.max);
      const year = $('#calendar-year'); year.replaceChildren();
      for (let n = new Date(range.min).getUTCFullYear(); n <= new Date(range.max).getUTCFullYear(); n++) year.append(new Option(n + '년', n));
      year.value = String(Math.floor(month / 12));
      const months = $('#calendar-month'); months.replaceChildren();
      for (let n = 0; n < 12; n++) {
        const option = new Option((n + 1) + '월', n), candidate = Math.floor(month / 12) * 12 + n;
        option.disabled = candidate < monthOf(range.min) || candidate > monthOf(range.max); months.append(option);
      }
      months.value = String(month % 12);
      const container = $('#range-calendars'); container.replaceChildren();
      for (let page = 0; page < 2; page++) {
        const current = month + page, section = document.createElement('section');
        const heading = document.createElement('h4'); heading.textContent = `${Math.floor(current / 12)}년 ${current % 12 + 1}월`; section.append(heading);
        const grid = document.createElement('div'); grid.className = 'calendar-days';
        ['일','월','화','수','목','금','토'].forEach(text => {const span = document.createElement('span'); span.textContent = text; span.className = 'calendar-weekday'; grid.append(span);});
        cells(current).forEach(day => {
          if (monthOf(day) !== current) {const blank = document.createElement('span'); blank.setAttribute('aria-hidden', 'true'); grid.append(blank); return;}
          const button = document.createElement('button'); button.type = 'button'; button.textContent = String(new Date(day).getUTCDate());
          button.disabled = day < range.min || day > range.max;
          button.setAttribute('aria-label', label(day)); button.setAttribute('aria-pressed', String(day === from || day === to));
          if (from !== null && to !== null && day >= from && day <= to) button.classList.add('in-range');
          if (day === from || day === to) button.classList.add('range-end');
          button.addEventListener('click', () => {
            if (!waitingEnd) {from = day; to = null; waitingEnd = true;}
            else {to = Math.max(from, day); from = Math.min(from, day); waitingEnd = false;}
            render();
            // Preserve keyboard focus after rebuilding the calendar.
            [...$('#range-calendars').querySelectorAll('button')].find(item => item.getAttribute('aria-label') === label(day))?.focus();
          }); grid.append(button);
        });
        section.append(grid); container.append(section);
      }
      $('#date-range-draft').textContent = waitingEnd ? `${label(from)} 시작 · 종료 날짜를 선택하세요.` : from !== null && to !== null ? `${label(from)} – ${label(to)}` : '시작 날짜와 종료 날짜를 차례로 선택하세요.';
      $('#date-range-apply').disabled = from === null || to === null;
    }
    function refresh() {
      const dataRange = bounds(getDays());
      range = dataRange ? bounds(getSelectableDays?getSelectableDays():getDays()) : null;
      const selected = getRange();
      $('#date-range-label').textContent = !selected.from && !selected.to ? '전체 기간 ▾' : `${selected.from.replaceAll('-', '.')} – ${selected.to.replaceAll('-', '.')} ▾`;
      $('#date-filters').hidden = !range;
      if (!range) {picker.open = false; return;}
      $('#date-range-available').textContent = `데이터: ${label(dataRange.min)} – ${label(dataRange.max)} · 마지막 데이터 날짜 기준`;
    }
    picker.addEventListener('toggle', () => {
      if (!picker.open) return;
      refresh(); if (!range) return;
      const selected = getRange();
      from = selected.from ? Date.parse(selected.from + 'T00:00:00Z') : range.min;
      to = selected.to ? Date.parse(selected.to + 'T00:00:00Z') : range.max;
      waitingEnd = false; month = clampMonth(monthOf(from)); render();
      const popover = $('#date-range-popover'); popover.style.left = '0px';
      const rect = popover.getBoundingClientRect();
      if (rect.right > root.innerWidth - 16) popover.style.left = (root.innerWidth - 16 - rect.right) + 'px';
    });
    $('#calendar-prev').addEventListener('click', () => {month = clampMonth(month - 1); render();});
    $('#calendar-next').addEventListener('click', () => {month = clampMonth(month + 1); render();});
    $('#calendar-year').addEventListener('change', () => {month = clampMonth(Number($('#calendar-year').value) * 12 + month % 12); render();});
    $('#calendar-month').addEventListener('change', () => {month = clampMonth(Math.floor(month / 12) * 12 + Number($('#calendar-month').value)); render();});
    if(presetActions){presetActions.forEach(item=>$(item.id).addEventListener('click',()=>{const value=item.value();if(value)apply(value);}));}
    else {
      $('#date-preset-all').addEventListener('click', () => apply({from: '', to: ''}));
      $('#date-preset-week').addEventListener('click', () => apply(recent(getDays(), 7)));
      $('#date-preset-month').addEventListener('click', () => apply(recent(getDays(), 30)));
    }
    $('#date-range-apply').addEventListener('click', () => {if (from !== null && to !== null) apply({from: iso(from), to: iso(to)});});
    $('#date-range-cancel').addEventListener('click', close);
    picker.addEventListener('keydown', event => {if (event.key === 'Escape') {event.preventDefault(); close();}});
    document.addEventListener('click', event => {
      // Calendar rendering replaces the clicked button before this event bubbles here.
      // composedPath retains its original ancestry even after the button is detached.
      const inside=event.composedPath?.().includes(picker)||picker.contains(event.target);
      if (!inside) picker.open = false;
    });
    return {refresh};
  };
  root.AdSightDates = api;
})(globalThis);
