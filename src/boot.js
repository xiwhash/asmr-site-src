(function(){
  window.__bootOK = false;
  function show(msg){
    var f = document.getElementById('bootFail'); if (!f) return;
    if (window.__bootOK) return;
    var ld = document.getElementById('bootLoading');
    if (ld) ld.style.display = 'none';
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
      try{ localStorage.removeItem('asmr_lists_v1'); localStorage.removeItem('asmr_lists_v2'); }catch(e){}
      try{ if (window.caches) caches.keys().then(function(k){ k.forEach(function(x){ caches.delete(x); }); }); }catch(e){}
      location.href = location.pathname + '?r=' + Date.now();
    };
    /* 6 秒还没渲染成功 = 卡住了，给出重试/清缓存提示 */
    setTimeout(function(){
      if (!window.__bootOK) show('数据加载超时（可能是网络较慢或缓存异常，请点击重新加载）');
    }, 6000);
  });
})();
