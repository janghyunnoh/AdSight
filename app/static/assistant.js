(function(root) {
  const panel=document.querySelector('#assistant-panel');
  const toggle=document.querySelector('#assistant-toggle');
  function refresh(){document.querySelector('#assistant-context').textContent=getAssistantContext();}
  function open(value){
    panel.hidden=!value;toggle.setAttribute('aria-expanded',String(value));
    if(value){refresh();document.querySelector('#assistant-close').focus();}else toggle.focus();
  }
  toggle.addEventListener('click',()=>open(panel.hidden));
  document.querySelector('#assistant-close').addEventListener('click',()=>open(false));
  document.querySelector('#assistant-refresh').addEventListener('click',refresh);
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();open(false);}});
  root.AdSightAssistant={refresh};
})(globalThis);
