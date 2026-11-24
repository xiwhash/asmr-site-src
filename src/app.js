(function(){
"use strict";
var D = window.__DATA__ || {works:[], subs:{}};
var works = D.works, subs = D.subs;
var au = document.getElementById('au');
var view = document.getElementById('view'), ttl = document.getElementById('ttl');
var mini = document.getElementById('mini');
var full = document.getElementById('full');
var cur = { w:null, i:0, subs:[], rows:[] };
var query = '';

/* ==================== 起播加速：音频预取到 Blob，点开几乎瞬发 ==================== */
var __pf = { cache:{}, pending:{}, order:[], max:2, cap:24 * 1024 * 1024 };
function __pfBlocked(){
  try{
    var c = navigator.connection || navigator.mozConnection || {};
    if(c.saveData) return true;                                   /* 省流量模式：不预取 */
    if(/^(slow-2g|2g)$/.test(String(c.effectiveType || ''))) return true;
  }catch(e){}
  return false;
}
function __pfUrl(u){ return (u && __pf.cache[u]) || null; }
function __pfKick(u){
  if(!u || __pf.cache[u] || __pf.pending[u]) return;
  if(__pfBlocked()) return;
  __pf.pending[u] = 1;
  var ac = null;
  try{ if(window.AbortController) ac = new AbortController(); }catch(e){ ac = null; }
  var to = setTimeout(function(){ try{ ac && ac.abort(); }catch(e){} }, 40000);
  fetch(u, { cache:'force-cache', signal: ac ? ac.signal : undefined })
    .then(function(r){
      if(!r || !r.ok) throw new Error('http ' + (r && r.status));
      var cl = parseInt(r.headers.get('content-length') || '0', 10);
      if(cl > __pf.cap){                     /* 超大单轨不塞内存，交给浏览器串流 */
        try{ if(r.body && r.body.cancel) r.body.cancel(); }catch(e){}
        throw new Error('too big ' + cl);
      }
      return r.blob().then(function(b){
        if(cl && Math.abs(b.size - cl) > 2048) throw new Error('size mismatch');   /* 半截包直接丢 */
        return b;
      });
    })
    .then(function(b){
      if(!b || b.size < 1024) throw new Error('empty');
      var o = URL.createObjectURL(b);
      __pf.cache[u] = o;
      __pf.order.push(u);
      while(__pf.order.length > __pf.max){
        var k = __pf.order.shift();
        if(au && au.src === __pf.cache[k]){ __pf.order.push(k); break; }   /* 正在播的不撤 */
        try{ URL.revokeObjectURL(__pf.cache[k]); }catch(e){}
        delete __pf.cache[k];
      }
    })
    .catch(function(){})
    .then(function(){ clearTimeout(to); delete __pf.pending[u]; });
}
function __pfPrime(w, idx, cnt){
  if(!w || !w.tracks || !w.tracks.length) return;
  var base = w.tracks[(idx === undefined || idx === null || idx < 0) ? 0 : idx];
  if(!base) return;
  var pk = base.p || '', n = 0, want = cnt || 1;
  for(var i=0;i<w.tracks.length;i++){
    var t = w.tracks[i];
    if((t.p||'') !== pk) continue;
    __pfKick(t.f);
    if(++n >= want) break;
  }
}
var __swBlock = 0;
var __lyricLock = 0;

function fmt(t){ if(!isFinite(t)||t<0)t=0; var m=Math.floor(t/60), s=Math.floor(t%60);
  return m+':'+(s<10?'0':'')+s; }
function esc(s){ return String(s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]}); }


/* ==================== history 路由（手机返回键回到上一级） ==================== */
var __histRoute = {
  current: 'home',
  rj: null,
  init(){
    /* 初始状态：首页 */
    try{ history.replaceState({ __p: 'home' }, '', location.pathname + location.search); }catch(e){}
    window.addEventListener('popstate', function(e){
      full.classList.remove('on');       /* 任何返回都先关全屏播放器 */
      var st = e.state || { __p: 'home' };
      if (st.__p === 'player'){
        /* 返回：关掉全屏播放器，回到作品页 */
        full.classList.remove('on');
        if (cur.w) renderWork(cur.w.rj, true);
        __histRoute.current = 'work';
      } else if (st.__p === 'lists'){
        renderLists(true);
        __histRoute.current = 'lists';
        __histRoute.rj = null;
      } else if (st.__p === 'list' && st.lid){
        renderListWorks(st.lid, true);
        __histRoute.current = 'list';
        __histRoute.rj = st.lid;
      } else if (st.__p === 'work' && st.rj){
        renderWork(st.rj, true);
        __histRoute.current = 'work';
        __histRoute.rj = st.rj;
      } else {
        /* 返回首页 */
        full.classList.remove('on');
        renderHome(true);
        __histRoute.current = 'home';
        __histRoute.rj = null;
      }
    });
  },
  push(page, rj){
    try{
      if (page === 'player') history.pushState({ __p: 'player' }, '', location.pathname + location.search);
      else if (page === 'work') history.pushState({ __p: 'work', rj: rj }, '', location.pathname + location.search);
      else if (page === 'lists') history.pushState({ __p: 'lists' }, '', location.pathname + location.search);
      else if (page === 'list') history.pushState({ __p: 'list', lid: rj }, '', location.pathname + location.search);
      __histRoute.current = page;
      __histRoute.rj = rj || null;
    }catch(e){}
  }
};

window.__hist = __histRoute;
var __curView = { type:'home', lid:null, rj:null };
var __fromListId = null;

var __toastEl = null, __toastTimer = null;
function showToast(msg){
  try{
    if(!__toastEl){
      __toastEl = document.createElement('div');
      __toastEl.id = 'toast';
      document.body.appendChild(__toastEl);
    }
    __toastEl.textContent = String(msg || '');
    __toastEl.classList.add('on');
    if(__toastTimer) clearTimeout(__toastTimer);
    __toastTimer = setTimeout(function(){ if(__toastEl) __toastEl.classList.remove('on'); }, 2200);
  }catch(e){}
}

/* ---------- 首页 ---------- */
function renderHome(skipHist){
  __fromListId = null;
  __curView = { type:'home', lid:null, rj:null };
  ttl.textContent = '我的音声库';
  if (!skipHist && window.__hist) window.__hist.push('home');
  var list = works.filter(function(w){
    if(!query) return true;
    var q = query.toLowerCase();
    return (w.title||'').toLowerCase().indexOf(q)>-1 ||
           (w.circle||'').toLowerCase().indexOf(q)>-1 ||
           (w.vas||[]).join(' ').toLowerCase().indexOf(q)>-1 ||
           (w.tags||[]).join(' ').toLowerCase().indexOf(q)>-1 ||
           (w.rj||'').toLowerCase().indexOf(q)>-1;
  });
  if(!list.length){ view.innerHTML = '<div class="empty">没有匹配的作品</div>'; return; }
  var h = '<div class="grid">';
  for(var i=0;i<list.length;i++){
    var w = list[i];
    h += '<div class="card" data-rj="'+esc(w.rj)+'">'
      + (w.cover ? '<img class="thumb" loading="lazy" src="'+esc(w.cover)+'" alt="">' : '<div class="thumb"></div>')
      + '<div class="meta"><div class="t">'+esc(w.title)+'</div>'
      + '<div class="s"><span class="rj">'+esc(w.rj)+'</span>'
      + (w.circle?'<span>'+esc(w.circle)+'</span>':'')
      + (w.rate?'<span style="color:#f5a623">★ '+w.rate+'</span>':'')
      + '<span>'+w.n+' 音轨</span></div></div></div>';
  }
  h += '</div>';
  view.innerHTML = h;
}

/* ---------- 作品页 ---------- */
function renderWorkFlat(rj, skipHist){
  var w = works.find(function(x){return x.rj===rj;});
  if(!w) return;
  ttl.textContent = rj;
  if (!skipHist && window.__hist) window.__hist.push('work', rj);
  var h = '<div class="work">';
  h += '<div class="back" id="backHome">← 返回</div>';
  h += '<div class="head">'
    + (w.cover?'<img src="'+esc(w.cover)+'" alt="">':'')
    + '<div class="info"><h2>'+esc(w.title)+'</h2>'
    + (w.circle?'<div class="circle">'+esc(w.circle)+'</div>':'')
    + (w.rate?'<div class="rate">★ '+w.rate+(w.rateN?' ('+w.rateN+')':'')+'</div>':'')
    + (w.vas&&w.vas.length?'<div class="circle">CV: '+w.vas.map(esc).join(' / ')+'</div>':'')
    + (w.tags&&w.tags.length?'<div class="tags">'+w.tags.slice(0,8).map(function(t){return '<span>'+esc(t)+'</span>'}).join('')+'</div>':'')
    + '</div></div>';
  h += '<div class="tracks">';
  for(var i=0;i<w.tracks.length;i++){
    var t = w.tracks[i];
    h += '<div class="track" data-rj="'+esc(w.rj)+'" data-i="'+i+'">'
      + '<div class="idx">'+(i+1)+'</div>'
      + '<div class="name">'+esc(t.n)+'</div>'
      + (t.d?'<div class="dur">'+fmt(t.d)+'</div>':'')
      + '</div>';
  }
  h += '</div></div>';
  view.innerHTML = h;
}


/* ---------- 作品页（文件夹版） ---------- */
function __fmtLen(s){ if(!s) return ''; var h=s/3600; return h>=1 ? (h.toFixed(1)+'h') : (Math.round(s/60)+'min'); }
function __nodeAt(ft, p){
  if(!p || !ft) return null;
  var node = null, list = ft, parts = String(p).split('/').map(Number);
  for(var i=0;i<parts.length;i++){ node = list[parts[i]]; if(!node) return null; list = node.c||[]; }
  return node;
}
function __autoPath(w){
  var ft = w.ft;
  if(!ft || !ft.length) return null;
  var NONE = /se\s*(?:なし|無し|無)|no\s*se|効果音なし|効果音無し|射精音なし|射精音無し|サンプル|過去作|紹介|特典|イラスト|台本|画像|フリートーク|次回予告/i;
  var ARI  = /se\s*(?:あり|有り|有|on)|本編|本文|本篇/i;

  function direct(p){
    var c = 0;
    for(var i=0;i<w.tracks.length;i++){ if((w.tracks[i].p||'') === p) c++; }
    return c;
  }
  function score(n){
    var s = n.s || 0;
    if(ARI.test(n.t)) s = s * 1.4;
    if(/mp3|mp３|音声|音データ|voice|wav/i.test(n.t)) s = s * 1.05;
    return s;
  }
  function descend(node){
    var guard = 0;
    while(node && node.c && node.c.length && direct(node.p) === 0 && guard++ < 8){
      var pick = null;
      for(var i=0;i<node.c.length;i++){
        var ch = node.c[i];
        if((ch.n||0) <= 0 || NONE.test(ch.t)) continue;
        if(!pick || score(ch) > score(pick)) pick = ch;
      }
      if(!pick) break;
      node = pick;
    }
    return node;
  }

  var best = null;
  (function walk(list){
    for(var i=0;i<list.length;i++){
      var n = list[i];
      if((n.n||0) > 0 && !NONE.test(n.t)){
        if(!best || score(n) > score(best)) best = n;
      }
      if(n.c && n.c.length) walk(n.c);
    }
  })(ft);

  if(!best) return null;
  if((best.s||0) < (w.rs||0) || !(best.s||0)) return null;   /* 根目录才是主体 */
  var node = descend(best);
  return node ? node.p : best.p;
}
function renderWork(rj, skipHist, path){
  var w = works.find(function(x){return x.rj===rj;});
  if(!w) return;
  __curView = { type:'work', lid:__fromListId, rj:rj };
  ttl.textContent = rj;
  if (!skipHist && window.__hist) window.__hist.push('work', rj);

  var backBtn = (__fromListId && __lById(__fromListId))
    ? '<div class="back" id="backToList" data-lid="'+esc(__fromListId)+'">← 返回「'+esc(__lById(__fromListId).name)+'」</div>'
    : '<div class="back" id="backHome">← 返回</div>';
  var h = '<div class="work">';
  h += backBtn;
  h += '<div class="head">'
    + (w.cover?'<img src="'+esc(w.cover)+'" alt="">':'')
    + '<div class="info"><h2>'+esc(w.title)+'</h2>'
    + (w.circle?'<div class="circle">'+esc(w.circle)+'</div>':'')
    + (w.rate?'<div class="rate">★ '+w.rate+(w.rateN?' ('+w.rateN+')':'')+'</div>':'')
    + (w.vas&&w.vas.length?'<div class="circle">CV: '+w.vas.map(esc).join(' / ')+'</div>':'')
    + (w.tags&&w.tags.length?'<div class="tags">'+w.tags.slice(0,8).map(function(t){return '<span>'+esc(t)+'</span>'}).join('')+'</div>':'')
    + '</div></div>'
    + '<div class="wbtns">'
    + '<span class="wbtn" id="addToList" data-rj="'+esc(w.rj)+'">＋ 加入列表</span>'
    + '<span class="wbtn" id="moveToList" data-rj="'+esc(w.rj)+'">⇄ 移动到其他列表</span>'
    + '<span class="wlists" id="workLists">'+__workListsHtml(w.rj)+'</span>'
    + '</div>';

  var ft = w.ft;
  if(!ft || !ft.length){
    h += '<div class="tracks">';
    for(var i=0;i<w.tracks.length;i++){
      var t = w.tracks[i];
      h += '<div class="track" data-rj="'+esc(w.rj)+'" data-i="'+i+'">'
        + '<div class="idx">'+(i+1)+'</div>'
        + '<div class="name">'+esc(t.n)+'</div>'
        + (t.d?'<div class="dur">'+fmt(t.d)+'</div>':'')
        + '</div>';
    }
    h += '</div></div>';
    view.innerHTML = h;
    return;
  }

  var key = (path === undefined || path === null) ? __autoPath(w) : path;
  if(key === null || key === undefined) key = '';
  var node = __nodeAt(ft, key);
  if(key && !node){ key = ''; node = null; }

  var chain = [];
  if(key){
    var acc = '', list = ft;
    String(key).split('/').forEach(function(seg){
      acc = acc ? acc + '/' + seg : seg;
      var n = list[Number(seg)];
      if(n) chain.push({ t:n.t, p:acc });
      list = (n && n.c) || [];
    });
  }
  if(chain.length){
    h += '<div class="crumbs"><span class="crumb" data-rj="'+esc(w.rj)+'" data-p="">全部</span>';
    chain.forEach(function(c, i){
      h += '<span class="sep">/</span><span class="crumb'+(i===chain.length-1?' on':'')+'" data-rj="'+esc(w.rj)+'" data-p="'+c.p+'">'+esc(c.t)+'</span>';
    });
    h += '</div>';
  }

  var kids = (node ? (node.c||[]) : ft);
  h += '<div class="tracks">';
  for(var k=0;k<kids.length;k++){
    var f = kids[k];
    h += '<div class="fdir" data-rj="'+esc(w.rj)+'" data-p="'+f.p+'">'
      + '<div class="ficon"></div>'
      + '<div class="fmeta"><div class="fname">'+esc(f.t)+'</div>'
      + '<div class="fsub">'+f.n+' 项目'+(f.s?' · '+__fmtLen(f.s):'')+'</div></div></div>';
  }
  var __n = 0;
  for(var j=0;j<w.tracks.length;j++){
    var tr = w.tracks[j];
    if((tr.p||'') !== key) continue;
    __n++;
    h += '<div class="track" data-rj="'+esc(w.rj)+'" data-i="'+j+'">'
      + '<div class="idx">'+__n+'</div>'
      + '<div class="name">'+esc(tr.n)+'</div>'
      + '</div>';
  }
  h += '</div></div>';
  view.innerHTML = h;
  try{
    __pfPrime(w, (function(){
      for(var __q=0;__q<w.tracks.length;__q++){ if((w.tracks[__q].p||'')===key) return __q; }
      return 0;
    })());
  }catch(e){}
}

/* 目录 / 面包屑点击 */
view.addEventListener('click', function(ev){
  var el = ev.target;
  while(el && el !== view){
    if(el.classList && el.classList.contains('fdir')){ renderWork(el.dataset.rj, false, el.dataset.p); return; }
    if(el.classList && el.classList.contains('crumb')){ renderWork(el.dataset.rj, true, el.dataset.p || ''); return; }
    el = el.parentNode;
  }
});

/* 播放列表跟随当前目录 */
function __listOf(w, i){
  var t = w.tracks[i]; if(!t) return [];
  var pk = t.p || '', out = [];
  for(var k=0;k<w.tracks.length;k++){ if((w.tracks[k].p||'') === pk) out.push(k); }
  return out;
}
function __listIndexes(w){ var o=[]; for(var i=0;i<w.tracks.length;i++) o.push(i); return o; }
function stepIdx(delta){
  if(!cur.w) return 0;
  var list = (cur.list && cur.list.length) ? cur.list : __listIndexes(cur.w);
  var pos = list.indexOf(cur.i);
  if(pos < 0) pos = 0;
  var np = pos + delta;
  if(np < 0) np = 0;
  if(np > list.length-1) np = list.length-1;
  return list[np];
}

/* 调试/直达：p14.html#work=RJ01634555 直接进作品 */
try{
  var __m = (location.hash||'').match(/^#work=(RJ\d+)/);
  if(__m) setTimeout(function(){ try{ renderWork(__m[1], true); }catch(e){} }, 0);
}catch(e){}

/* ---------- 播放 ---------- */
function playTrack(rj, i){
  var w = works.find(function(x){return x.rj===rj;});
  if(!w) return;
  var t = w.tracks[i];
  var __lst = __listOf(w, i);
  cur = { w:w, i:i, subs: subs[rj+'/'+String(i).padStart(3,'0')] || [], rows:[] };
  cur.list = __lst;
  au.src = __pfUrl(t.f) || t.f;
  try{ au.preload = 'auto'; }catch(e){}
  try{ updateMediaSession(); }catch(e){}
  var pr = au.play(); if(pr && pr.catch) pr.catch(function(){});
  // 迷你条
  mini.classList.add('on');
  document.getElementById('miniCover').src = w.cover || '';
  document.getElementById('miniT').textContent = t.n;
  document.getElementById('miniS').textContent = w.circle || w.rj;
  // 高亮
  Array.prototype.forEach.call(document.querySelectorAll('.track'), function(el){
    el.classList.toggle('playing', el.dataset.rj===rj && +el.dataset.i===i);
  });
  buildLyric();
  try{
    if (FloatSub && FloatSub.on) FloatSub.set(textOfNow());
    if (PiP && PiP.currentPiPStatus) PiP.flush();
  }catch(e){}
  if(full.classList.contains('on')){
    try{
      document.getElementById('fArt').src = w.cover || '';
      document.getElementById('fTitle').textContent = t.n;
      document.getElementById('fAlbum').textContent = w.title;
    }catch(e){}
    curLine = -1;
    syncLyric(true);
  }
  /* 预热下一轨，切歌瞬发 */
  try{ var __nx = w.tracks[stepIdx(1)]; if(__nx && __nx.f !== t.f) __pfKick(__nx.f); }catch(e){}
}

function buildLyric(){
  var box = document.getElementById('fLyric');
  box.innerHTML = '';
  cur.rows = [];
  curLine = -1;
  box.scrollTop = 0;
  try{
    document.getElementById('fSeek').value = 0;
    document.getElementById('fCur').textContent = '0:00';
    document.getElementById('fDur').textContent = '0:00';
  }catch(e){}
  if(!cur.subs || !cur.subs.length){
    box.innerHTML = '<div class="empty" style="padding:30px 10px">暂无字幕</div>';
    return;
  }
  var frag = document.createDocumentFragment();
  for(var i=0;i<cur.subs.length;i++){
    var ln = cur.subs[i];
    var row = document.createElement('div');
    row.className = 'lrow';
    row.dataset.t = ln.t;
    row.dataset.i = i;
    var ts = document.createElement('span'); ts.className='lts'; ts.textContent = fmt(ln.t);
    var tx = document.createElement('span'); tx.className='ltx'; tx.textContent = ln.s;
    row.appendChild(ts); row.appendChild(tx);
    frag.appendChild(row);
    cur.rows.push(row);
  }
  box.appendChild(frag);
}

var curLine = -1;
function centerLine(el, smooth){
  var box = document.getElementById('fLyric');
  if(!el || !box) return;
  var er = el.getBoundingClientRect(), br = box.getBoundingClientRect();
  var delta = (er.top - br.top) - (box.clientHeight - er.height) / 2;
  var maxTop = Math.max(0, box.scrollHeight - box.clientHeight);
  var top = Math.max(0, Math.min(box.scrollTop + delta, maxTop));
  if(Math.abs(top - box.scrollTop) < 0.5) return;
  if(smooth && box.scrollTo) box.scrollTo({ top: top, behavior: 'smooth' });
  else box.scrollTop = top;
}
function syncLyric(force){
  if(!full.classList.contains('on')) return;
  var box = document.getElementById('fLyric');
  var t = au.currentTime, idx = -1;
  for(var i=0;i<cur.subs.length;i++){ if(cur.subs[i].t<=t) idx=i; else break; }
  if(!force && idx === curLine) return;
  if(curLine>=0 && cur.rows[curLine] && curLine !== idx) cur.rows[curLine].classList.remove('cur');
  curLine = idx;
  if(idx>=0 && cur.rows[idx]){
    cur.rows[idx].classList.add('cur');
    var el = cur.rows[idx];
    if(force || Date.now() > __lyricLock) centerLine(el, !force);
  }
  // 迷你条也更新当前句
  if(idx>=0 && cur.subs[idx]){
    document.getElementById('miniS').textContent = cur.subs[idx].s;
  }
}

/* ---------- 全屏 ---------- */
function openFull(){
  if(!cur.w) return;
  full.classList.add('on');
  if (window.__hist && window.__hist.current !== 'player') window.__hist.push('player');
  document.getElementById('fArt').src = cur.w.cover || '';
  document.getElementById('fTitle').textContent = cur.w.tracks[cur.i].n;
  document.getElementById('fAlbum').textContent = cur.w.title;
  curLine = -1;
  syncLyric(true);
  updatePlayIcon();
}

function updatePlayIcon(){
  var p = au.paused;
  document.getElementById('fPlayIcon').innerHTML = p
    ? '<path d="M8 5v14l11-7z"/>'
    : '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>';
  document.getElementById('miniIcon').innerHTML = p
    ? '<path d="M8 5v14l11-7z"/>'
    : '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>';
  try{ syncPipBarIcon(); }catch(e){}
  try{ updateMediaSession(); }catch(e){}
}
/* ---------- MediaSession：安卓系统画中画/通知栏的播放控件走这里 ---------- */
function updateMediaSession(){
  try{
    if (!('mediaSession' in navigator)) return;
    try{
      if (window.MediaMetadata && cur.w && cur.w.tracks[cur.i]){
        navigator.mediaSession.metadata = new MediaMetadata({
          title: cur.w.tracks[cur.i].n || '',
          artist: cur.w.title || '',
          album: cur.w.circle || cur.w.rj || ''
        });
      }
    }catch(e){}
    navigator.mediaSession.setActionHandler('play', function(){ var q = au.play(); if (q && q.catch) q.catch(function(){}); });
    navigator.mediaSession.setActionHandler('pause', function(){ au.pause(); });
    navigator.mediaSession.setActionHandler('previoustrack', function(){ if (cur.w) playTrack(cur.w.rj, stepIdx(-1)); });
    navigator.mediaSession.setActionHandler('nexttrack', function(){ if (cur.w) playTrack(cur.w.rj, stepIdx(1)); });
    try{ navigator.mediaSession.playbackState = au.paused ? 'paused' : 'playing'; }catch(e){}
  }catch(e){}
}

/* ---------- 事件 ---------- */
view.addEventListener('click', function(ev){
  var el = ev.target;
  while(el && el !== view){
    if(el.id === 'backHome'){ renderHome(); return; }
    if(el.id === 'backLists'){ renderLists(true); return; }
    if(el.id === 'backToList'){ renderListWorks(el.dataset.lid, true); return; }
    if(el.id === 'resetLists'){
      try{ localStorage.removeItem(LK); }catch(e){}
      __lLoad();
      renderLists(true);
      showToast('已恢复服务器列表');
      return;
    }
    if(el.id === 'addToList'){ openAddSheet(el.dataset.rj || el.getAttribute('data-rj')); return; }
    if(el.id === 'moveToList'){ openMoveSheet(el.dataset.rj || el.getAttribute('data-rj'), null); return; }
    if(el.classList && el.classList.contains('mv')){
      ev.stopPropagation();
      openMoveSheet(el.dataset.mv || el.getAttribute('data-mv'), el.dataset.lid || el.getAttribute('data-lid'));
      return;
    }
    if(el.classList && el.classList.contains('rmv')){
      ev.stopPropagation();
      var rmLid = el.dataset.lid, rmRj = el.dataset.rmv;
      var rmList = __lById(rmLid);
      __lToggle(rmLid, rmRj);
      renderListWorks(rmLid, true);
      if(rmList) showToast('已从「' + rmList.name + '」移除');
      return;
    }
    if(el.classList && el.classList.contains('lcard')){
      if(el.id === 'lNewCard'){ openNewListModal(); return; }
      renderListWorks(el.dataset.lid); return;
    }
    if(el.classList && el.classList.contains('card')){
      __fromListId = (__curView && __curView.type === 'list') ? __curView.lid : null;
      renderWork(el.dataset.rj);
      return;
    }
    if(el.classList && el.classList.contains('track')){ playTrack(el.dataset.rj, +el.dataset.i); openFull(); return; }
    el = el.parentNode;
  }
});

document.getElementById('q').addEventListener('input', function(e){
  query = e.target.value.trim();
  renderHome();
});

document.getElementById('miniPlay').addEventListener('click', function(){
  if(au.paused){ var p=au.play(); if(p&&p.catch)p.catch(function(){}); } else au.pause();
});
mini.addEventListener('click', function(e){
  if(Date.now() - __swBlock < 450) return;             /* 刚滑动过 */
  if(e.target.closest('#miniPlay')) return;
  openFull();
});
document.getElementById('fClose').addEventListener('click', function(){ full.classList.remove('on'); });
document.getElementById('fPlay').addEventListener('click', function(){
  if(au.paused){ var p=au.play(); if(p&&p.catch)p.catch(function(){}); } else au.pause();
});
document.getElementById('fPrev').addEventListener('click', function(){
  if(!cur.w) return;
  var i = stepIdx(-1);
  playTrack(cur.w.rj, i);
});
document.getElementById('fNext').addEventListener('click', function(){
  if(!cur.w) return;
  var i = stepIdx(1);
  playTrack(cur.w.rj, i);
});
document.getElementById('fBack5').addEventListener('click', function(){ au.currentTime = Math.max(0, au.currentTime-5); });
document.getElementById('fFwd10').addEventListener('click', function(){ au.currentTime = Math.min(au.duration||0, au.currentTime+10); });

var seek = document.getElementById('fSeek');
seek.addEventListener('input', function(){
  if(isFinite(au.duration) && au.duration>0) au.currentTime = (seek.value/1000)*au.duration;
});

document.getElementById('fLyric').addEventListener('click', function(ev){
  if(Date.now() - (__swBlock || 0) < 450) return;      /* 刚滑动过，别当成点击 */
  var el = ev.target;
  while(el && el!==this){
    if(el.dataset && el.dataset.t!==undefined){
      au.currentTime = parseFloat(el.dataset.t)||0;
      __lyricLock = Date.now() + 900;
      curLine = -1;
      syncLyric(true);
      centerLine(el, false);
      var p=au.play(); if(p&&p.catch)p.catch(function(){});
      return;
    }
    el = el.parentNode;
  }
});

au.addEventListener('play', function(){
  updatePlayIcon();
  try { syncPipBarIcon(); } catch (e) {}
});
au.addEventListener('pause', function(){
  updatePlayIcon();
  try { syncPipBarIcon(); } catch (e) {}
});
au.addEventListener('pause', updatePlayIcon);

/* 音频状态变化时，让系统画中画的 video 跟着同步
   （安卓 PiP 的播放/暂停图标才不会卡在“暂停”上） */
au.addEventListener('pause', function(){
  try{
    if (PiP && PiP.currentPiPStatus && !PiP.docWin && PiP.video && !PiP.video.paused){
      PiP.suppress(600);
      PiP.video.pause();
    }
  }catch(e){}
});
au.addEventListener('play', function(){
  try{
    if (PiP && PiP.currentPiPStatus && !PiP.docWin && PiP.video && PiP.video.paused){
      PiP.suppress(600);
      var _q = PiP.video.play(); if (_q && _q.catch) _q.catch(function(){});
    }
  }catch(e){}
});
au.addEventListener('timeupdate', function(){
  var d = au.duration;
  if(isFinite(d) && d>0){ seek.value = (au.currentTime/d)*1000; }
  document.getElementById('fCur').textContent = fmt(au.currentTime);
  document.getElementById('fDur').textContent = fmt(d);
  syncLyric();
  try{
    if (FloatSub.on){
      var ft = textOfNow();
      if (FloatSub.textEl && FloatSub.textEl.textContent !== ft) FloatSub.set(ft);
    }
    if (PiP.currentPiPStatus && PiP.docTextEl){
      var pt = PiP.currentLyricText();
      if (PiP.docTextEl.textContent !== pt) PiP.paint(pt);
    }
  }catch(e){}
});
au.addEventListener('ended', function(){
  if(cur.w){ var __nx = stepIdx(1); if(__nx !== cur.i) playTrack(cur.w.rj, __nx); }
});
/* 缓冲提示：网速慢时给个明示 */
var __bufEl = null, __bufT = null;
function bufShow(){
  if(__bufT) return;
  __bufT = setTimeout(function(){
    if(!__bufEl){
      __bufEl = document.createElement('div');
      __bufEl.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:92px;z-index:100001;' +
        'background:rgba(16,20,26,.85);color:#fff;padding:8px 16px;border-radius:999px;font-size:13px;' +
        'pointer-events:none;box-shadow:0 6px 20px rgba(0,0,0,.3);transition:opacity .2s';
      __bufEl.textContent = '缓冲中…';
      document.body.appendChild(__bufEl);
    }
    __bufEl.style.display = 'block';
  }, 600);
}
function bufHide(){
  if(__bufT){ clearTimeout(__bufT); __bufT = null; }
  if(__bufEl) __bufEl.style.display = 'none';
}
au.addEventListener('loadstart', bufShow);
au.addEventListener('waiting', bufShow);
au.addEventListener('playing', bufHide);
au.addEventListener('canplay', bufHide);
au.addEventListener('seeked', bufHide);
au.addEventListener('pause', bufHide);

var __rawRetry = {};
function __swapHost(u){
  u = String(u || '');
  if(u.indexOf('https://xiwhash.github.io/') === 0){
    var rest = String(u).replace('https://xiwhash.github.io/', '');
    var i = rest.indexOf('/');
    if(i > 0) return 'https://cdn.jsdelivr.net/gh/xiwhash/' + rest.slice(0, i) + '@main/' + rest.slice(i + 1);
  }
  var m = u.match(/^https:\/\/cdn\.jsdelivr\.net\/gh\/xiwhash\/([^@]+)@main\/(.*)$/);
  if(m) return 'https://xiwhash.github.io/' + m[1] + '/' + m[2];
  return null;
}
au.addEventListener('error', function(){
  try{
    var t = cur.w && cur.w.tracks[cur.i];
    if(t && !__rawRetry[t.f] && String(au.src || '').indexOf('blob:') === 0){
      __rawRetry[t.f] = 1;                                  /* 本地缓存可能坏包：改直连再来一次 */
      try{ if(__pf.cache[t.f]){ URL.revokeObjectURL(__pf.cache[t.f]); delete __pf.cache[t.f]; } }catch(e){}
      au.src = t.f;
      var pr = au.play(); if(pr && pr.catch) pr.catch(function(){});
      document.getElementById('miniS').textContent = '本地缓存异常，已改用直连';
      return;
    }
    var curSrc = String(au.src || '');
    if(t && !__rawRetry['swap:' + curSrc]){
      var alt = __swapHost(curSrc);
      if(alt){
        __rawRetry['swap:' + curSrc] = 1;                  /* 这个源挂了，换另一个源再来一次 */
        au.src = alt;
        var q = au.play(); if(q && q.catch) q.catch(function(){});
        document.getElementById('miniS').textContent = '换源重试中…';
        return;
      }
    }
    document.getElementById('miniS').textContent = '加载失败：' + (au.currentSrc||'').split('/').pop();
  }catch(e){}
});

/* ==================== 画中画字幕（带控制栏） ====================
   Document PiP: 字幕 + 底部控制栏（上一首 / 播放暂停 / 下一首）
   Video PiP: canvas -> captureStream -> video -> requestPictureInPicture     */
var BAR_H = 38;

function makeBar(doc){
  var bar = doc.createElement('div');
  bar.style.cssText = 'height:38px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;padding:4px 0 6px;background:#ffffff';
  var pill = doc.createElement('div');
  pill.style.cssText = 'display:flex;align-items:center;gap:16px;height:28px;padding:0 12px;border:1px solid #e5e7eb;border-radius:999px;background:#f7f8fa';
  bar.appendChild(pill);

  function icon(path, label, fn){
    var b = doc.createElement('button');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="pointer-events:none;display:block"><path d="' + path + '"/></svg>';
    b.style.cssText = 'width:30px;height:24px;border:none;border-radius:6px;background:transparent;color:#374151;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;margin:0;line-height:0;transition:background .15s,color .15s;-webkit-tap-highlight-color:transparent';
    b.addEventListener('mouseenter', function(){ b.style.background = '#e6eaf0'; b.style.color = '#111827'; });
    b.addEventListener('mouseleave', function(){ b.style.background = 'transparent'; b.style.color = '#374151'; });
    b.addEventListener('click', function(ev){
      ev.stopPropagation();
      ev.preventDefault();
      try { fn(); } catch (e) { console.warn('[pip] btn err: ' + e.message); }
      setTimeout(function(){ try { syncPipBarIcon(); drawPipNow(); } catch (e) {} }, 120);
    });
    pill.appendChild(b);
    return b;
  }

  icon('M6 6h2v12H6zm3.5 6 8.5 6V6z', '上一首', function(){
    if (!cur.w) return;
    playTrack(cur.w.rj, stepIdx(-1));
  });
  var pb = icon('M8 5v14l11-7z', '播放/暂停', function(){
    try {
      if (au.paused) {
        var p = au.play();
        if (p && p.catch) p.catch(function(){});
      } else {
        au.pause();
      }
      if (PiP.video){
        PiP.suppress(600);
        if (au.paused) { if (!PiP.video.paused) PiP.video.pause(); }
        else { var vp = PiP.video.play(); if (vp && vp.catch) vp.catch(function(){}); }
      }
    } catch (e) { console.warn('[pip] toggle err: ' + e.message); }
  });
  icon('M16 6h2v12h-2zM6 18l8.5-6L6 6z', '下一首', function(){
    if (!cur.w) return;
    playTrack(cur.w.rj, stepIdx(1));
  });

  PiP.playBtn = pb;
  syncPipBarIcon();
  return bar;
}

function syncPipBarIcon(){
  if (!PiP.playBtn) return;
  var want = au.paused ? 'M8 5v14l11-7z' : 'M6 5h4v14H6zm8 0h4v14h-4z';
  if (PiP.playBtn.dataset.d !== want){
    PiP.playBtn.dataset.d = want;
    var p = PiP.playBtn.querySelector('path');
    if (p) p.setAttribute('d', want);
  }
  PiP.playBtn.title = au.paused ? '播放' : '暂停';
  PiP.playBtn.setAttribute('aria-label', au.paused ? '播放' : '暂停');
}

function syncSubButtons(){
  try{
    var fb = document.getElementById('fFloat');
    if (fb) fb.classList.toggle('active', !!FloatSub.on);
    var pb = document.getElementById('fPip');
    if (pb) pb.classList.toggle('active', !!PiP.currentPiPStatus);
  }catch(e){}
}

/* 恢复音频播放：带重试，失败给出可见提示（照 asmr-player） */
function recoverAudio(attempt) {
  try {
    if (!au.src) return;
    var p;
    try { p = au.play(); } catch (e) { p = null; }

    if (!p || !p.then) {
      console.log('[pip] play() 未返回 Promise');
      return;
    }

    p.then(function () {
      console.log('[pip] recoverAudio ok (attempt ' + attempt + ')');
      syncPipBarIcon();
    }).catch(function (e) {
      console.warn('[pip] play failed: ' + (e && e.name) + ' ' + (e && e.message));
      if (attempt < 3) {
        setTimeout(function () { recoverAudio(attempt + 1); }, 300 * (attempt + 1));
        return;
      }
      /* 三次都失败：提示用户 */
      try {
        var d = document.createElement('div');
        d.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:120px;' +
          'z-index:99999;background:#c62828;color:#fff;padding:10px 16px;border-radius:10px;' +
          'font-size:13px;max-width:88vw;text-align:center;box-shadow:0 3px 14px rgba(0,0,0,.3)';
        d.textContent = '播放失败（' + (e && e.name ? e.name : 'unknown') + '），请点页面上的播放按钮';
        document.body.appendChild(d);
        setTimeout(function () { d.remove(); }, 6000);
      } catch (x) {}
      syncPipBarIcon();
    });
  } catch (e) {
    console.warn('[pip] recoverAudio err: ' + e.message);
  }
}

function drawPipNow(){
  try{
    PiP.paint(PiP.currentLyricText());
    PiP.requestFrame();
    syncPipBarIcon();
  }catch(e){}
}

/* PiP 对象声明 */
var PiP = {
  canvas:null, video:null, ctx:null,
  pipWindow:null, currentPiPStatus:false,
  started:false, currentText:'',
  _suppress:false, _suppressTimer:null, _hb:null,

  get supported(){
    try{
      if ('pictureInPictureEnabled' in document && document.pictureInPictureEnabled) return true;
      if (this.video && 'webkitSupportsPresentationMode' in this.video &&
          this.video.webkitSupportsPresentationMode('picture-in-picture')) return true;
      if (window.documentPictureInPicture) return true;
    }catch(e){}
    return false;
  },

  suppress(ms){
    this._suppress = true;
    if (this._suppressTimer) clearTimeout(this._suppressTimer);
    this._suppressTimer = setTimeout(function(){ PiP._suppress = false; }, ms || 600);
  },

  startHeartbeat(){
    this.stopHeartbeat();
    /* 30fps 流自动推帧；这里只负责重绘字幕内容 */
    this._hb = setInterval(function(){
      try{
        var txt = PiP.currentLyricText();
        if (txt !== PiP.currentText) PiP.paint(txt);
        PiP.requestFrame();   /* 兼容：有 requestFrame 就调 */
        syncPipBarIcon();
      }catch(e){}
    }, 300);
  },
  stopHeartbeat(){ if (this._hb){ clearInterval(this._hb); this._hb = null; } },

  requestFrame(){
    try{
      if (!this.video || !this.video.srcObject) return;
      var t = this.video.srcObject.getVideoTracks()[0];
      if (t && t.requestFrame) t.requestFrame();
    }catch(e){}
  },

  init(){
    this.canvas = document.getElementById('pipCanvas');
    this.video = document.getElementById('pipVideo');
    if (!this.canvas || !this.video) return;
    this.ctx = this.canvas.getContext('2d');

    /* --- video 状态 → 驱动 audio（照 asmr-player） --- */
    this.video.addEventListener('pause', function(){
      if (PiP._suppress) return;
      try{ if (!au.paused) au.pause(); }catch(e){}
      try{ syncPipBarIcon(); }catch(e){}
    }, true);

    this.video.addEventListener('play', function(){
      if (PiP._suppress) return;
      /* 0fps/30fps 流：不推帧 play() 可能挂起 */
      try{ PiP.requestFrame(); }catch(e){}
      setTimeout(function(){ try{ PiP.requestFrame(); }catch(e){} }, 80);
      if (au.paused) { recoverAudio(0); }
      try{ syncPipBarIcon(); }catch(e){}
    }, true);

    this.video.addEventListener('playing', function(){
      if (PiP._suppress) return;
      try{ PiP.requestFrame(); }catch(e){}
      if (au.paused) { recoverAudio(0); }
      try{ syncPipBarIcon(); }catch(e){}
    }, true);

    /* 长暂停后 canvas 流可能被判结束 → 重建，否则再点播放毫无反应 */
    this.video.addEventListener('ended', function(){
      if (PiP._suppress) return;
      try{ PiP.rebuildStream(); }catch(e){}
    }, true);

    /* 对账（手机系统画中画专用）：安卓 PiP 的播放/暂停有时根本不派发事件，
       页面此时是隐藏状态，每 500ms 直接比对 video 与 audio 的真实状态并纠正。
       这是"暂停后再点播放没反应"的关键修复。 */
    setInterval(function(){
      try{
        if (!PiP.currentPiPStatus || PiP.docWin || PiP._suppress) return;
        if (!document.hidden) return;
        if (!PiP.video) return;
        var _tr = PiP.video.srcObject && PiP.video.srcObject.getVideoTracks ? PiP.video.srcObject.getVideoTracks()[0] : null;
        if (PiP.video.ended || !_tr || _tr.readyState === 'ended'){
          var _now = Date.now();
          if (!PiP._lastRebuild || _now - PiP._lastRebuild > 2000){ PiP._lastRebuild = _now; PiP.rebuildStream(); }
          return;
        }
        var vPlaying = !PiP.video.paused;
        var aPlaying = !au.paused;
        if (vPlaying === aPlaying) return;
        log('reconcile video=' + (vPlaying ? 'playing' : 'paused') + ' audio=' + (aPlaying ? 'playing' : 'paused'));
        if (vPlaying){ PiP.requestFrame(); recoverAudio(0); }
        else { try{ au.pause(); }catch(e){} }
        try{ syncPipBarIcon(); }catch(e){}
      }catch(e){}
    }, 500);

    this.video.addEventListener('enterpictureinpicture', function(ev){
      PiP.currentPiPStatus = true;
      PiP.pipWindow = ev.pictureInPictureWindow;
      if (PiP.pipWindow){
        PiP.pipWindow.addEventListener('resize', function(){ PiP.onWindowResize(); });
      }
      PiP.onWindowResize();
      PiP.startHeartbeat();
      PiP.flush();
      syncSubButtons();
      log('enter pip');
    });

    this.video.addEventListener('leavepictureinpicture', function(){
      PiP.currentPiPStatus = false;
      PiP.stopHeartbeat();
      PiP.pipWindow = null;
      PiP.resetSize();
      syncSubButtons();
      log('leave pip');
    });

    // 初始化画布
    this.resetSize();
    this.paint('');
    /* 30fps：0fps 静态流 Chrome 不给 PiP 控件（播放/暂停按钮），必须用真实帧率 */
    var s = this.canvas.captureStream(30);
    this.video.srcObject = s;
    try{ var q = this.video.play(); if (q && q.catch) q.catch(function(){}); }catch(e){}
    this.started = true;
  },

  resetSize(){
    if (!this.canvas) return;
    var w = 2 * (window.innerWidth || 480);
    this.canvas.width = Math.round(w);
    this.canvas.height = Math.round(w / 20 * 3);
  },

  /* 长暂停后 canvas 流可能被判结束，重建一次 */
  rebuildStream(){
    try{
      log('rebuildStream');
      this.video.srcObject = null;
      var w = 2 * (window.innerWidth || 480);
      this.canvas.width = Math.round(w);
      this.canvas.height = Math.round(w / 20 * 3);
      this.video.srcObject = this.canvas.captureStream(30);
      this.paint(this.currentLyricText());
      this.requestFrame();
      if (this.currentPiPStatus && !au.paused) {
        this.suppress(400);
        var p = this.video.play();
        if (p && p.catch) p.catch(function(){});
      }
    }catch(e){ log('rebuildStream err ' + e.message); }
  },

  onWindowResize(){
    if (!this.pipWindow || !this.canvas) return;
    var w = this.pipWindow.width, h = this.pipWindow.height;
    if (!w || !h) return;
    if (Math.abs(this.canvas.width - 2*w) < 8 && Math.abs(this.canvas.height - 2*h) < 8) return;
    this.canvas.width = Math.round(2 * w);
    this.canvas.height = Math.round(2 * h);
    this.paint(this.currentText);
    this.requestFrame();
  },

  paint(text){
    this.currentText = text || '';
    if (this.docTextEl){
      try{ this.docTextEl.textContent = this.currentText; }catch(e){}
    }
    if (!this.ctx || !this.canvas) return;
    var W = this.canvas.width, H = this.canvas.height;
    var s = Math.max(18, Math.round(W / 22));
    var ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    var t = String(text || '').trim();
    if (!t) return;
    ctx.font = '700 ' + s + 'px "-apple-system", "BlinkMacSystemFont", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    var maxW = W * 0.9;
    var lines = [];
    if (ctx.measureText(t).width <= maxW){
      lines.push(t);
    } else {
      var line = '';
      for (var i = 0; i < t.length; i++){
        var next = line + t[i];
        if (ctx.measureText(next).width > maxW && line){
          lines.push(line);
          line = t[i];
          if (lines.length === 1){
            var rest = t.slice(i);
            while (rest.length > 1 && ctx.measureText(rest).width > maxW){
              rest = rest.slice(0, -1);
            }
            lines.push(rest);
            line = '';
            break;
          }
        } else {
          line = next;
        }
      }
      if (line) lines.push(line);
    }
    var lh = s * 1.35;
    var startY = H / 2 - ((lines.length - 1) * lh) / 2;
    for (var k = 0; k < lines.length; k++){
      ctx.fillText(lines[k], W / 2, startY + k * lh);
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  },

  flush(){ this.paint(this.currentLyricText()); this.requestFrame(); },

  currentLyricText(){
    var t = au.currentTime, idx = -1;
    for (var i=0;i<cur.subs.length;i++){ if (cur.subs[i].t <= t) idx = i; else break; }
    if (idx >= 0 && cur.subs[idx]) return cur.subs[idx].s;
    return cur.w ? cur.w.tracks[cur.i].n : '';
  },

  async show(){
    if (this.currentPiPStatus) return;
    if (FloatSub.on) FloatSub.hide();
    try{
      if (!this.started) this.init();
      this.resetSize();
      this.paint(this.currentLyricText());
    }catch(e){ log('pip init failed: ' + e.message); }

    /* ① Document PiP：白色背景画中画字幕窗口，底部带控制栏 */
    if (window.documentPictureInPicture && window.documentPictureInPicture.requestWindow){
      try{
        var win = await documentPictureInPicture.requestWindow({ width: 520, height: 132 });
        var doc = win.document;
        doc.documentElement.style.cssText = 'margin:0;padding:0;height:100%;background:#ffffff;color-scheme:light';
        doc.body.style.cssText = 'margin:0;padding:0;background:#ffffff;overflow:hidden;display:flex;flex-direction:column;height:100vh;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;user-select:none;-webkit-user-select:none';
        doc.body.innerHTML = '';

        var wrap = doc.createElement('div');
        wrap.style.cssText = 'flex:1 1 auto;min-height:0;padding:8px 16px 2px;background:#ffffff;display:flex;align-items:center;justify-content:center;overflow:hidden';
        var tx = doc.createElement('div');
        tx.id = 'pipDocText';
        tx.style.cssText = 'width:100%;font-size:clamp(16px,3.6vw,21px);line-height:1.4;font-weight:700;letter-spacing:.02em;color:#111827;text-align:center;word-break:break-word;white-space:pre-wrap';
        tx.textContent = this.currentLyricText();
        wrap.appendChild(tx);
        doc.body.appendChild(wrap);

        try{
          var _bar = makeBar(doc);
          doc.body.appendChild(_bar);
        }catch(be){ log('makeBar FAILED: ' + be.message); }

        this.currentPiPStatus = true;
        this.docWin = win;
        this.docTextEl = tx;
        this.startHeartbeat();
        syncPipBarIcon();
        syncSubButtons();
        var self = this;
        win.addEventListener('pagehide', function(){
          self.currentPiPStatus = false;
          self.stopHeartbeat();
          self.docWin = null;
          self.docTextEl = null;
          self.playBtn = null;
          syncSubButtons();
        });
        log('document pip ok (controls inside)');
        return;
      }catch(e){ log('document pip failed: ' + e.message); }
    }

    /* ② 没有 Document PiP（安卓 Chrome / Safari / 旧版）：走原生 Video PiP */
    if (isMobileBrowser()){
      try{
        await this.showVideoPiP();
        return;
      }catch(ve){ log('video pip failed: ' + (ve && ve.message)); }
    }

    /* ③ 桌面 Chromium 在 HTTP 下没有 Document PiP：优先使用透明网页字幕 */
    if (!isMobileBrowser() && location.protocol === 'http:' && window.__pipHttpsReady !== false){
      log('switch to https for document pip');
      location.href = pipHttpsUrl();
      return;
    }

    /* ④ Firefox / Safari 桌面的原生 PiP */
    try{
      await this.showVideoPiP();
      return;
    }catch(ve2){ log('video pip failed: ' + (ve2 && ve2.message)); }

    log('document pip unavailable -> transparent float');
    try{ FloatSub.show(); }catch(e){ log('float show failed: ' + e.message); }
  },

  fitDocPip(){},

  /* 原生 Video PiP */
  async showVideoPiP(){
    if (typeof this.video.requestPictureInPicture !== 'function' &&
        !('webkitSetPresentationMode' in this.video)){
      throw new Error('picture-in-picture unsupported');
    }
    this.suppress(900);
    try{ var q = this.video.play(); if (q && q.catch) q.catch(function(){}); }catch(e){}
    this.requestFrame();
    this.startHeartbeat();
    if (typeof this.video.requestPictureInPicture === 'function'){
      await this.video.requestPictureInPicture();
    } else {
      this.video.webkitSetPresentationMode('picture-in-picture');
      this.currentPiPStatus = true;
      syncSubButtons();
    }
  },

  hide(){
    try{
      if (this.docWin && !this.docWin.closed) this.docWin.close();
      if (document.pictureInPictureElement) document.exitPictureInPicture();
      else if (this.video && 'webkitSetPresentationMode' in this.video) this.video.webkitSetPresentationMode('inline');
    }catch(e){}
    this.docWin = null;
    this.docTextEl = null;
    this.playBtn = null;
    this.currentPiPStatus = false;
    this.stopHeartbeat();
    try{ FloatSub.hide(); }catch(e){}
    syncSubButtons();
  }
};


/* ---------- 系统画中画入口（Document PiP 需要 HTTPS） ---------- */
function isMobileBrowser(){
  var ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua) ||
         (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
function isDesktopChromium(){
  var ua = navigator.userAgent || '';
  return !isMobileBrowser() && /Chrome\/|Chromium\/|Edg\//.test(ua);
}
function pipHttpsUrl(){
  var port = window.__pipHttpsPort || 8443;
  var q = [];
  if (cur.w){
    q.push('rj=' + encodeURIComponent(cur.w.rj));
    q.push('i=' + cur.i);
    q.push('t=' + (isFinite(au.currentTime) ? au.currentTime : 0).toFixed(2));
    q.push('p=' + (au.paused ? 0 : 1));
  }
  q.push('pip=1');
  return 'https://' + location.hostname + ':' + port + location.pathname + '?' + q.join('&');
}
function showPipGate(mode){
  var g = document.getElementById('pipGate');
  if (!g) return;
  var title = document.getElementById('pipGateTitle');
  var desc = document.getElementById('pipGateDesc');
  var go = document.getElementById('pipGateGo');
  var fl = document.getElementById('pipGateFloat');
  var cl = document.getElementById('pipGateClose');
  if (mode === 'https'){
    title.textContent = '系统画中画需要 HTTPS';
    desc.textContent = 'Chrome/Edge 只在 HTTPS 安全地址下允许显示带控制栏的系统画中画窗口，也可以直接使用透明桌面歌词。';
    go.textContent = '用 HTTPS 打开';
    go.onclick = function(){ g.classList.remove('on'); location.href = pipHttpsUrl(); };
    if (fl) fl.style.display = 'block';
  } else {
    title.textContent = '打开系统画中画';
    desc.textContent = '画中画窗口内包含暂停、上一首、下一首控制栏，可拖动到屏幕任意位置。';
    go.textContent = '打开系统画中画';
    go.onclick = function(){
      g.classList.remove('on');
      try{ if (au.paused){ var q = au.play(); if (q && q.catch) q.catch(function(){}); } }catch(e){}
      PiP.show();
    };
    if (fl) fl.style.display = 'block';
  }
  if (fl) fl.onclick = function(){ g.classList.remove('on'); FloatSub.show(); };
  if (cl) cl.onclick = function(){ g.classList.remove('on'); };
  g.classList.add('on');
  g.setAttribute('aria-hidden', 'false');
}

function log(m){
  try{ console.log('[pip] ' + m); }catch(e){}
  try{ window.__pipLog = (window.__pipLog || []).concat([m]).slice(-3); }catch(e){}
}

/* ---------- 透明桌面字幕（纯字幕，无按键，可拖动） ---------- */
var FloatSub = {
  on: false,
  el: null, textEl: null,
  init(){
    this.el = document.getElementById('floatSub');
    this.textEl = document.getElementById('floatText');
    if (!this.el) return;
    this.makeDraggable();
  },
  makeDraggable(){
    var el = this.el;
    if (!el || el.dataset.dragReady) return;
    el.dataset.dragReady = '1';
    var sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    function down(e){
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var r = el.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      dragging = true;
      el.classList.add('dragging');
      el.style.transform = 'none';
      el.style.left = ox + 'px';
      el.style.top = oy + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      try{ el.setPointerCapture(e.pointerId); }catch(x){}
      e.preventDefault();
    }
    function move(e){
      if (!dragging) return;
      var w = el.offsetWidth, h = el.offsetHeight;
      var nx = Math.min(Math.max(0, ox + e.clientX - sx), Math.max(0, window.innerWidth - w));
      var ny = Math.min(Math.max(0, oy + e.clientY - sy), Math.max(0, window.innerHeight - h));
      el.style.left = nx + 'px';
      el.style.top = ny + 'px';
    }
    function up(e){
      if (!dragging) return;
      dragging = false;
      el.classList.remove('dragging');
      try{ el.releasePointerCapture(e.pointerId); }catch(x){}
    }
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    window.addEventListener('resize', function(){
      if (!el.style.left || el.style.transform !== 'none') return;
      var r = el.getBoundingClientRect();
      var nx = Math.min(Math.max(0, r.left), Math.max(0, window.innerWidth - el.offsetWidth));
      var ny = Math.min(Math.max(0, r.top), Math.max(0, window.innerHeight - el.offsetHeight));
      el.style.left = nx + 'px'; el.style.top = ny + 'px';
    });
  },
  show(){
    if (!this.el) this.init();
    if (!this.el) return;
    this.on = true;
    this.el.classList.add('on');
    this.set(textOfNow());
    syncSubButtons();
  },
  hide(){
    this.on = false;
    if (this.el) this.el.classList.remove('on');
    syncSubButtons();
  },
  set(t){ if (this.textEl) this.textEl.textContent = t || ''; }
};

function textOfNow(){
  var t = au.currentTime, idx = -1;
  for (var i = 0; i < cur.subs.length; i++){ if (cur.subs[i].t <= t) idx = i; else break; }
  if (idx >= 0 && cur.subs[idx]) return cur.subs[idx].s;
  return cur.w ? cur.w.tracks[cur.i].n : '';
}

window.PiP = PiP;                          /* 暴露到全局，便于调试与外部调用 */
window.FloatSub = FloatSub;                /* 调试用：页内悬浮窗 */

document.getElementById('fPip').addEventListener('click', function(){
  if (PiP.currentPiPStatus){ PiP.hide(); return; }
  PiP.show();
});
var __floatBtn = document.getElementById('fFloat');
if (__floatBtn) __floatBtn.addEventListener('click', function(){
  /* 透明桌面字幕：不依赖 HTTPS 或浏览器画中画权限。 */
  if (PiP.currentPiPStatus) PiP.hide();
  if (FloatSub.on) FloatSub.hide();
  else FloatSub.show();
});

/* 播放时同步 PiP 字幕 */
var _pipLast = '';
setInterval(function(){
  if (!PiP.started && !PiP.docWin) return;
  var txt = PiP.currentLyricText();
  if (txt !== _pipLast){ _pipLast = txt; if (PiP.currentPiPStatus) PiP.flush(); else PiP.paint(txt); }
}, 400);

/* ==================== 左右滑动快进/快退（照 asmr.one 的手势） ==================== */
(function(){
  var hudEl = null, sw = null;
  function hud(){
    if(hudEl) return hudEl;
    hudEl = document.createElement('div');
    hudEl.style.cssText = 'position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);z-index:100002;' +
      'background:rgba(16,20,26,.88);color:#fff;padding:11px 20px;border-radius:14px;font-size:16px;' +
      'font-weight:700;letter-spacing:.4px;display:none;pointer-events:none;font-variant-numeric:tabular-nums;' +
      'box-shadow:0 10px 34px rgba(0,0,0,.42);white-space:nowrap';
    document.body.appendChild(hudEl);
    return hudEl;
  }
  function hideHud(){ if(hudEl) hudEl.style.display = 'none'; }
  function showHud(t){ var el = hud(); el.textContent = t; el.style.display = 'block'; }

  function attach(el){
    if(!el) return;
    el.addEventListener('pointerdown', function(e){
      if(e.pointerType === 'mouse' && e.button !== 0) return;
      var t = e.target;
      if(t && t.closest && t.closest('button,input,select,textarea,#fSeek')) return;
      if(!cur.w || !isFinite(au.duration) || au.duration <= 0) return;
      sw = { id:e.pointerId, x0:e.clientX, y0:e.clientY, dx:0, dy:0,
             base:au.currentTime, dur:au.duration, mode:null, target:null };
    }, { passive:true });

    el.addEventListener('pointermove', function(e){
      if(!sw || e.pointerId !== sw.id) return;
      sw.dx = e.clientX - sw.x0;
      sw.dy = e.clientY - sw.y0;
      if(!sw.mode){
        if(Math.abs(sw.dx) > 12 && Math.abs(sw.dx) > Math.abs(sw.dy) * 1.3) sw.mode = 'seek';
        else if(Math.abs(sw.dy) > 12 && Math.abs(sw.dy) > Math.abs(sw.dx) * 1.3){ sw = null; return; }  /* 竖划=滚字幕 */
        else return;
      }
      if(sw.mode !== 'seek') return;
      try{ e.preventDefault(); }catch(x){}
      var per = Math.max(0.25, Math.min(2.0, sw.dur / 700));   /* 划满一屏≈曲长的 1/1.75 */
      var nt = sw.base + sw.dx * per;
      if(nt < 0) nt = 0;
      if(nt > sw.dur - 0.05) nt = sw.dur - 0.05;
      sw.target = nt;
      showHud((sw.dx >= 0 ? '▶▶ ' : '◀◀ ') + fmt(nt) + '  /  ' + fmt(sw.dur));
    }, { passive:false });

    function end(e){
      if(!sw || (e && e.pointerId !== undefined && e.pointerId !== sw.id)) return;
      var s = sw; sw = null;
      hideHud();
      if(s.mode === 'seek' && s.target !== null && Math.abs(s.dx) > 12){
        __swBlock = Date.now();
        __lyricLock = Date.now() + 900;
        try{ au.currentTime = s.target; }catch(e2){}
        curLine = -1;
        syncLyric(true);
      }
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', function(e){ if(sw && e.pointerType === 'mouse') end(e); });
  }
  attach(full);
  attach(mini);
})();

/* 键盘 */

/* ==================== 列表（playlists） ==================== */
var LK = 'asmr_lists_v1';
var LISTS = [];
function __lUniq(arr){
  var out = [], seen = {};
  (arr || []).forEach(function(x){
    var s = String(x || '').trim();
    if(s && !seen[s]){ seen[s] = 1; out.push(s); }
  });
  return out;
}
function __lClone(x){
  return {
    id: x.id,
    name: x.name,
    by: x.by || '谢hhhh',
    works: __lUniq(x.works),
    imported: Array.isArray(x.imported) ? __lUniq(x.imported) : null,
    added: Array.isArray(x.added) ? __lUniq(x.added) : null,
    removed: __lUniq(x.removed)
  };
}
/* 新的服务器列表要标记其初始成员。否则以后服务器把作品挪到另一组时，
   浏览器会把旧组里的记录误当成“本地新增”而一直保留。 */
function __lFromServer(x){
  var l = __lClone(x);
  l.imported = l.works.slice();
  l.added = [];
  l.removed = [];
  return l;
}
function __lSave(){ try{ localStorage.setItem(LK, JSON.stringify(LISTS)); }catch(e){} }
function __lLoad(){
  var base = (window.__LISTS__||[]).map(__lClone);
  var loc = null;
  try{ loc = JSON.parse(localStorage.getItem(LK)||'null'); }catch(e){}
  if(!loc || !loc.length){ LISTS = base.map(__lFromServer); __lSave(); return; }
  var out = [], seenId = {};
  loc.forEach(function(item){
    if(!item || !item.id || seenId[item.id]) return;
    seenId[item.id] = 1;
    out.push(__lClone(item));
  });
  var __nm = function(s){ return String(s || '').trim().toLowerCase(); };
  /* 收集旧缓存中被移出其他列表的作品，升级时防止本地已移入目标列表的作品被误删 */
  var removedAnywhere = {};
  out.forEach(function(l){
    (l.removed || []).forEach(function(rj){ removedAnywhere[rj] = 1; });
  });
  base.forEach(function(b){
    var mine = out.filter(function(l){ return l.id === b.id; })[0];
    if(!mine){                                   /* 名字相同 = 同一个列表（用户自己建过的） */
      var bn = __nm(b.name);
      mine = out.filter(function(l){ return __nm(l.name) === bn; })[0] || null;
    }
    if(!mine){ out.push(__lFromServer(b)); return; }
    var hasImp = Array.isArray(mine.imported);
    var hasAdded = Array.isArray(mine.added);
    var oldServer = hasImp ? mine.imported.slice() : mine.works.slice();
    mine.removed = __lUniq(mine.removed);
    var localAdded = hasAdded ? mine.added.slice() : [];
    /* 兼容旧缓存（缺少 added 字段）：把明确不在旧服务器列表里、或从其它列表移过来的作品保留为本机新增 */
    mine.works.forEach(function(rj){
      if(localAdded.indexOf(rj) >= 0) return;
      if(hasImp && oldServer.indexOf(rj) < 0){ localAdded.push(rj); return; }
      if(!hasImp && b.works.indexOf(rj) < 0 && removedAnywhere[rj]){ localAdded.push(rj); }
    });
    /* 仅当已知上一次服务器名单（hasImp）且服务器本次新把某作品移入当前列表时，才清除旧的 removed 屏蔽记录 */
    if(hasImp){
      b.works.forEach(function(rj){
        if(oldServer.indexOf(rj) < 0){
          var rk = mine.removed.indexOf(rj);
          if(rk >= 0) mine.removed.splice(rk, 1);
        }
      });
    }
    /* 本机新增优先于 removed，避免同一作品在两个数组冲突 */
    localAdded = localAdded.filter(function(rj){ return mine.removed.indexOf(rj) < 0; });
    mine.imported = b.works.slice();
    /* 已被服务器收录的不再滞留在 added，未收录的继续保留在 added 防止刷新丢失 */
    mine.added = localAdded.filter(function(rj){ return b.works.indexOf(rj) < 0; });
    var serverKeep = b.works.filter(function(rj){ return mine.removed.indexOf(rj) < 0; });
    var merged = [];
    localAdded.forEach(function(rj){ if(merged.indexOf(rj) < 0) merged.push(rj); });
    serverKeep.forEach(function(rj){ if(merged.indexOf(rj) < 0) merged.push(rj); });
    mine.works = merged;
  });
  out.forEach(function(l){
    if(!Array.isArray(l.imported)) l.imported = [];
    if(!Array.isArray(l.added)) l.added = [];
    if(!Array.isArray(l.removed)) l.removed = [];
  });
  LISTS = out;
  __lSave();
}
function __lById(id){ return LISTS.filter(function(l){ return l.id === id; })[0] || null; }
function __lNew(name){
  var id = 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  LISTS.push({ id:id, name:name, by:'谢hhhh', works:[], imported:[], added:[], removed:[] });
  __lSave();
  return id;
}
function __lFind(rj){
  var key = String(rj || '').trim();
  if(!key) return null;
  return works.filter(function(x){ return x.rj === key; })[0] || null;
}
function __lCover(l){
  for(var i=0;i<l.works.length;i++){ var w = __lFind(l.works[i]); if(w && w.cover) return w.cover; }
  for(var j=0;j<works.length;j++){ if(works[j].cover) return works[j].cover; }
  return '';
}
function __lCount(l){ var n=0; for(var i=0;i<l.works.length;i++){ if(__lFind(l.works[i])) n++; } return n; }
function __lListsOf(rj){ return LISTS.filter(function(l){ return l.works.indexOf(rj) >= 0; }); }
function __workListsHtml(rj){
  var ls = __lListsOf(rj);
  if(!ls.length) return '';
  return ls.map(function(l){ return '<span class="wlist-tag">'+esc(l.name)+'</span>'; }).join('');
}
function __syncWorkListsUi(rj){
  var el = document.getElementById('workLists');
  if(el && __curView && __curView.type === 'work' && __curView.rj === rj){
    el.innerHTML = __workListsHtml(rj);
  }
}

function renderLists(skipHist){
  __fromListId = null;
  __curView = { type:'lists', lid:null, rj:null };
  ttl.textContent = '我的列表';
  if(!skipHist && window.__hist) window.__hist.push('lists');
  var h = '<div class="back" id="backHome">← 首页</div>'
        + '<div class="back" id="resetLists" style="color:var(--sub)">⟳ 恢复服务器列表</div>'
        + '<div class="lgrid">';
  for(var i=0;i<LISTS.length;i++){
    var l = LISTS[i], cv = __lCover(l);
    h += '<div class="lcard" data-lid="'+esc(l.id)+'">'
      + (cv?'<img class="lt" loading="lazy" src="'+esc(cv)+'" alt="">':'<div class="lt"></div>')
      + '<div class="lm"><div class="ln">'+esc(l.name)+'</div>'
      + '<div class="lb">By '+esc(l.by)+'</div>'
      + '<div class="lc">'+__lCount(l)+' works</div></div></div>';
  }
  h += '<div class="lcard lnew" id="lNewCard"><div class="plus">＋</div><div>新建列表</div></div>';
  h += '</div>';
  view.innerHTML = h;
}
function renderListWorks(lid, skipHist){
  var l = __lById(lid);
  if(!l){ renderLists(skipHist); return; }
  __fromListId = lid;
  __curView = { type:'list', lid:lid, rj:null };
  ttl.textContent = l.name;
  if(!skipHist && window.__hist) window.__hist.push('list', lid);
  var list = l.works.map(__lFind).filter(Boolean);
  var h = '<div class="work"><div class="back" id="backLists">← 列表</div>'
    + '<h2 style="font-size:17px;margin:2px 0 4px">'+esc(l.name)+'</h2>'
    + '<div style="font-size:12.5px;color:var(--sub);margin-bottom:10px">By '+esc(l.by)+' · '+list.length+' works</div>'
    + '<div class="grid" style="padding:0">';
  for(var i=0;i<list.length;i++){
    var w = list[i];
    h += '<div class="card" data-rj="'+esc(w.rj)+'">'
      + (w.cover?'<img class="thumb" loading="lazy" src="'+esc(w.cover)+'" alt="">':'<div class="thumb"></div>')
      + '<div class="meta"><div class="t">'+esc(w.title)+'</div>'
      + '<div class="s"><span class="rj">'+esc(w.rj)+'</span><span>'+w.n+' 音轨</span></div></div>'
      + '<div class="card-acts">'
      + '<button type="button" class="mv" title="移动到其他列表" aria-label="移动到其他列表" data-mv="'+esc(w.rj)+'" data-lid="'+esc(l.id)+'">'
      + '<svg viewBox="0 0 24 24"><path d="M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/></svg></button>'
      + '<button type="button" class="rmv" title="从此列表移除" aria-label="从此列表移除" data-rmv="'+esc(w.rj)+'" data-lid="'+esc(l.id)+'">−</button>'
      + '</div></div>';
  }
  if(!list.length) h += '<div class="empty" style="grid-column:1/-1">这个列表还是空的</div>';
  h += '</div></div>';
  view.innerHTML = h;
}
var __sheetRj = null;
var __sheetFromLid = null;
var __sheetMode = 'toggle';

function __lAdd(lid, rj){
  rj = String(rj || '').trim();
  if(!rj) return false;
  var l = __lById(lid); if(!l) return false;
  var i = l.works.indexOf(rj);
  if(i < 0) l.works.unshift(rj);
  l.added = l.added || [];
  if(l.added.indexOf(rj) < 0) l.added.unshift(rj);
  if(l.removed){
    var k = l.removed.indexOf(rj);
    if(k >= 0) l.removed.splice(k, 1);
  }
  return true;
}
function __lRemove(lid, rj){
  rj = String(rj || '').trim();
  if(!rj) return false;
  var l = __lById(lid); if(!l) return false;
  var i = l.works.indexOf(rj);
  if(i >= 0) l.works.splice(i, 1);
  if(l.added){
    var a = l.added.indexOf(rj);
    if(a >= 0) l.added.splice(a, 1);
  }
  l.removed = l.removed || [];
  if(l.removed.indexOf(rj) < 0) l.removed.push(rj);
  return true;
}
function __lToggle(lid, rj){
  rj = String(rj || '').trim();
  var l = __lById(lid); if(!l || !rj) return false;
  var added = false;
  if(l.works.indexOf(rj) >= 0){
    __lRemove(lid, rj);
    added = false;
  } else {
    __lAdd(lid, rj);
    added = true;
  }
  __lSave();
  return added;
}
function __lMove(fromLid, toLid, rj){
  rj = String(rj || '').trim();
  var dst = __lById(toLid);
  if(!dst || !rj) return false;
  if(fromLid){
    if(fromLid === toLid) return false;
    __lRemove(fromLid, rj);
  } else {
    var others = LISTS.filter(function(l){ return l.id !== toLid && l.works.indexOf(rj) >= 0; });
    if(!others.length && dst.works.indexOf(rj) >= 0) return false;
    others.forEach(function(l){ __lRemove(l.id, rj); });
  }
  __lAdd(toLid, rj);
  __lSave();
  return true;
}

function __afterListChange(rj){
  if(__curView && __curView.type === 'list' && __curView.lid){
    renderListWorks(__curView.lid, true);
  } else if(__curView && __curView.type === 'lists'){
    renderLists(true);
  } else if(__curView && __curView.type === 'work' && __curView.rj === rj){
    __syncWorkListsUi(rj);
  }
}

function __hideSheetForm(){
  var f = document.getElementById('asNewForm');
  var n = document.getElementById('asNew');
  var inp = document.getElementById('asNewInput');
  if(f) f.classList.add('hide');
  if(n) n.classList.remove('hide');
  if(inp) inp.value = '';
}

function __renderSheet(){
  var rj = __sheetRj;
  var box = document.getElementById('asList');
  var title = document.getElementById('asTitle');
  if(!box || !rj) return;
  if(title) title.textContent = (__sheetMode === 'move') ? ('移动到其他列表 · ' + rj) : ('加入列表 · ' + rj);
  box.innerHTML = '';
  LISTS.forEach(function(l){
    var on = l.works.indexOf(rj) >= 0;
    var row = document.createElement('div');
    row.className = 'as-row';
    if(__sheetMode === 'move'){
      var isSrc = __sheetFromLid ? (l.id === __sheetFromLid) : on;
      row.innerHTML = '<span class="as-tick">'+(isSrc?'●':'→')+'</span>'
        + '<span class="as-n">'+esc(l.name)+'</span>'
        + (isSrc ? '<span class="as-cur">当前</span>' : '')
        + '<span class="as-c">'+__lCount(l)+'</span>';
      row.onclick = function(){
        var ok = __lMove(__sheetFromLid, l.id, rj);
        if(!ok){
          showToast('已在「' + l.name + '」中');
          return;
        }
        closeAddSheet();
        if(__curView && __curView.type === 'work' && __fromListId && __fromListId !== l.id){
          __fromListId = l.id;
          renderWork(rj, true);
        } else {
          __afterListChange(rj);
        }
        showToast('已移动到「' + l.name + '」');
      };
    } else {
      row.innerHTML = '<span class="as-tick">'+(on?'✓':'')+'</span>'
        + '<span class="as-n">'+esc(l.name)+'</span>'
        + '<span class="as-c">'+__lCount(l)+'</span>'
        + (!on ? '<button type="button" class="as-mv">移到这里</button>' : '');
      row.onclick = function(ev){
        if(ev.target && ev.target.classList && ev.target.classList.contains('as-mv')){
          ev.stopPropagation();
          __lMove(null, l.id, rj);
          closeAddSheet();
          if(__curView && __curView.type === 'work' && __fromListId && __fromListId !== l.id){
            __fromListId = l.id;
            renderWork(rj, true);
          } else {
            __afterListChange(rj);
          }
          showToast('已移动到「' + l.name + '」');
          return;
        }
        var added = __lToggle(l.id, rj);
        __renderSheet();
        __afterListChange(rj);
        showToast(added ? ('已加入「' + l.name + '」') : ('已从「' + l.name + '」移除'));
      };
    }
    box.appendChild(row);
  });
  __hideSheetForm();
  var sh = document.getElementById('addSheet');
  sh.classList.add('on');
  sh.setAttribute('aria-hidden','false');
}

function openAddSheet(rj){
  rj = String(rj || '').trim();
  if(!rj) return;
  __sheetRj = rj;
  __sheetFromLid = null;
  __sheetMode = 'toggle';
  __renderSheet();
}
function openMoveSheet(rj, fromLid){
  rj = String(rj || '').trim();
  if(!rj) return;
  var src = fromLid ? __lById(fromLid) : null;
  __sheetRj = rj;
  __sheetFromLid = (src && src.works.indexOf(rj) >= 0) ? fromLid : null;
  __sheetMode = 'move';
  __renderSheet();
}
function closeAddSheet(){
  __sheetRj = null;
  __sheetFromLid = null;
  __sheetMode = 'toggle';
  __hideSheetForm();
  var sh = document.getElementById('addSheet');
  if(sh){ sh.classList.remove('on'); sh.setAttribute('aria-hidden','true'); }
}

function openNewListModal(){
  var m = document.getElementById('newListModal');
  var inp = document.getElementById('nlInput');
  if(!m || !inp) return;
  inp.value = '';
  m.classList.add('on');
  m.setAttribute('aria-hidden','false');
  setTimeout(function(){ try{ inp.focus(); }catch(e){} }, 30);
}
function closeNewListModal(){
  var m = document.getElementById('newListModal');
  if(m){ m.classList.remove('on'); m.setAttribute('aria-hidden','true'); }
}
function __lAsk(){
  var sh = document.getElementById('addSheet');
  if(sh && sh.classList.contains('on')){
    var f = document.getElementById('asNewForm');
    var n = document.getElementById('asNew');
    var inp = document.getElementById('asNewInput');
    if(f && n && inp){
      n.classList.add('hide');
      f.classList.remove('hide');
      inp.value = '';
      setTimeout(function(){ try{ inp.focus(); }catch(e){} }, 30);
      return;
    }
  }
  openNewListModal();
}

__lLoad();
try{
  window.__nav = { home:renderHome, work:renderWork, play:playTrack, full:openFull,
                   lists:renderLists, list:renderListWorks, move:__lMove, L:function(){ return LISTS; } };
}catch(e){}
(function(){
  var b = document.getElementById('btnLists');
  if(b) b.onclick = function(){ renderLists(); };
  var x = document.getElementById('asClose');
  if(x) x.onclick = closeAddSheet;
  var nw = document.getElementById('asNew');
  if(nw) nw.onclick = __lAsk;
  var sh = document.getElementById('addSheet');
  if(sh) sh.addEventListener('click', function(e){ if(e.target === sh) closeAddSheet(); });

  var af = document.getElementById('asNewForm');
  var ac = document.getElementById('asNewCancel');
  if(ac) ac.onclick = __hideSheetForm;
  if(af) af.addEventListener('submit', function(e){
    e.preventDefault();
    var inp = document.getElementById('asNewInput');
    var name = String(inp ? inp.value : '').trim();
    if(!name) return;
    var id = __lNew(name);
    var rj = __sheetRj, fromLid = __sheetFromLid, mode = __sheetMode;
    if(rj){
      if(mode === 'move'){
        __lMove(fromLid, id, rj);
        closeAddSheet();
        if(__curView && __curView.type === 'work' && __fromListId){
          __fromListId = id;
          renderWork(rj, true);
        } else {
          __afterListChange(rj);
        }
        showToast('已移动到「' + name + '」');
      } else {
        __lAdd(id, rj);
        __lSave();
        __renderSheet();
        __afterListChange(rj);
        showToast('已创建并加入「' + name + '」');
      }
    } else {
      closeAddSheet();
      renderLists(true);
      showToast('已创建列表「' + name + '」');
    }
  });

  var nlm = document.getElementById('newListModal');
  var nlf = document.getElementById('nlForm');
  var nlc = document.getElementById('nlCancel');
  if(nlc) nlc.onclick = closeNewListModal;
  if(nlm) nlm.addEventListener('click', function(e){ if(e.target === nlm) closeNewListModal(); });
  if(nlf) nlf.addEventListener('submit', function(e){
    e.preventDefault();
    var inp = document.getElementById('nlInput');
    var name = String(inp ? inp.value : '').trim();
    if(!name) return;
    __lNew(name);
    closeNewListModal();
    renderLists(true);
    showToast('已创建列表「' + name + '」');
  });
})();

document.addEventListener('keydown', function(e){
  var tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
  var typing = tag === 'INPUT' || tag === 'TEXTAREA';
  if(e.code==='Space' && !typing && full.classList.contains('on')){ e.preventDefault();
    if(au.paused){var p=au.play();if(p&&p.catch)p.catch(function(){})}else au.pause(); }
  if(e.code==='Escape'){
    var nlm = document.getElementById('newListModal');
    if(nlm && nlm.classList.contains('on')){ closeNewListModal(); return; }
    var sh = document.getElementById('addSheet');
    if(sh && sh.classList.contains('on')){ closeAddSheet(); return; }
    full.classList.remove('on');
  }
});

window.addEventListener('error', function(e){
  try { var d=document.createElement('div'); d.style.cssText='position:fixed;left:4px;bottom:70px;z-index:9999;background:#c00;color:#fff;font-size:10px;padding:3px 6px;border-radius:4px;max-width:90vw'; d.textContent='JS: '+e.message; document.body.appendChild(d); setTimeout(function(){d.remove()},8000); } catch(x){}
});

/* 启动 */
if (window.__hist) __hist.init();
window.__pipHttpsPort = 8443;
window.__pipHttpsReady = true;
try{
  fetch('/__pip_config', {cache:'no-store'}).then(function(r){ return r.json(); }).then(function(c){
    if (c && c.httpsPort) window.__pipHttpsPort = c.httpsPort;
    window.__pipHttpsReady = !!(c && c.httpsReady);
    /* 桌面 Chromium：自动切到 HTTPS，之后画中画按钮一步打开系统窗口。
       手机/iPad 不跳转（手机浏览器没有 Document PiP，且证书提示麻烦）。 */
    if (window.__pipHttpsReady && location.protocol === 'http:' && isDesktopChromium() &&
        location.hostname !== 'localhost' && location.hostname !== '127.0.0.1' &&
        !/[?&]nossl=1/.test(location.search)){
      var port = c.httpsPort || 8443;
      location.replace('https://' + location.hostname + ':' + port + location.pathname + location.search + location.hash);
    }
  }).catch(function(){ window.__pipHttpsReady = false; });
}catch(e){ window.__pipHttpsReady = false; }
renderHome(true);

/* ---------- 从 HTTP 切到 HTTPS 后恢复播放，并提示点开系统画中画 ---------- */
(function(){
  try{
    var q = new URLSearchParams(location.search || '');
    if (q.get('pip') !== '1') return;
    var rj = q.get('rj');
    if (!rj) return;
    var i = parseInt(q.get('i') || '0', 10) || 0;
    var t = parseFloat(q.get('t') || '0') || 0;
    var shouldPlay = q.get('p') !== '0';
    var w = works.find(function(x){ return x.rj === rj; });
    if (!w) return;
    renderWork(rj, true);
    playTrack(rj, Math.max(0, Math.min(i, w.tracks.length - 1)));
    openFull();
    function seek(){ try{ au.currentTime = t; }catch(e){} }
    if (au.readyState >= 1) seek(); else au.addEventListener('loadedmetadata', seek, {once:true});
    if (!shouldPlay){ try{ au.pause(); }catch(e){} }
    try{ history.replaceState(history.state, '', location.pathname); }catch(e){}
    setTimeout(function(){ showPipGate('open'); }, 400);
  }catch(e){}
})();


/* 预热 PiP：等 DOM 就绪后初始化 canvas/stream，避免首次点按时 metadata 未就绪 */
setTimeout(function(){
  try { PiP.init(); log('prewarmed, canvas=' + PiP.canvas.width + 'x' + PiP.canvas.height); }
  catch(e){ log('prewarm failed: ' + e.message); }
  try { FloatSub.init(); log('floatsub ready'); } catch(e){ log('floatsub failed: ' + e.message); }
}, 1200);

/* 浮窗字幕持续更新 */
setInterval(function(){
  if (!FloatSub.on) return;
  var t = textOfNow();
  if (FloatSub.textEl && FloatSub.textEl.textContent !== t) FloatSub.set(t);
}, 300);
})();
