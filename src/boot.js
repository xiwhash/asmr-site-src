(function(){
  window.__bootOK = false;
  function show(msg){
    var f = document.getElementById('bootFail'); if (!f) return;
    var v = document.getElementById('view');
    if (v && v.children.length) return;                 /* 已经渲染出内容就不打扰 */
    if (window.__bootOK) return;
    f.style.display = 'block';
    var m = document.getElementById('bootMsg');
    if (m) m.textContent = String(msg || '').slice(0, 300);
  }
  window.__bootShow = show;
  window.addEventListener('error', function(e){
    try{ show((e.message || '脚本错误') + '  ' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || '')); }catch(x){}
  }, true);
  window.addEventListener('DOMContentLoaded', function(){
    var r = document.getElementById('bootReload');
    if (r) r.onclick = function(){ location.reload(); };
    var c = document.getElementById('bootClear');
    if (c) c.onclick = function(){
      try{ localStorage.removeItem('asmr_lists_v1'); }catch(e){}
      try{ if (window.caches) caches.keys().then(function(k){ k.forEach(function(x){ caches.delete(x); }); }); }catch(e){}
      location.href = location.pathname + '?r=' + Date.now();
    };
    /* 4 秒还没内容 = 卡住了，也给个提示 */
    setTimeout(function(){
      var v = document.getElementById('view');
      if (v && !v.children.length && !window.__bootOK) show('数据加载超时（可能是网络或缓存问题）');
    }, 4000);
  });
})();
