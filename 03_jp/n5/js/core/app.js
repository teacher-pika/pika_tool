/* app.js — 玩法登記、首頁步驟按鈕、玩法畫面骨架（window.JP_APP）
 * ============================================================================
 * 需要先載入 registry.js、packs.js、scope.js、jp.js、util.js、ui.js、picker.js。
 * 版面與工具列小函式的用法整理在 js/core/UI-說明.md；範本是 js/activities/browse.js。
 *
 * ── 加一個新玩法 ──
 *   1. 新增 js/activities/xxx.js，裡面呼叫 JP_APP.register({...})
 *   2. 在 index.html 的「玩法」那段加一行 <script src="js/activities/xxx.js"></script>
 *   不用改核心。步驟按鈕依 step 排序（同一步可以有好幾個玩法，依載入順序）。
 *
 *   JP_APP.register({
 *     id:'quiz',               // 必填，網址 &go=quiz 用這個
 *     step:2, stepName:'認',    // 第幾步、一個字的名稱（按鈕上的「② 認」）
 *     short:'測驗',             // 選填，首頁按鈕上的大字（省略就用 title）
 *     title:'選擇測驗', desc:'猜單字、猜句子的意思',   // title：網頁標題、提示訊息用；desc：首頁按鈕上的小字
 *     needs:'any',             // 'any'（單字或句子有一種就行）｜'words'｜'sentences'
 *     usable:function(items){ … },    // 選填：needs 之外的細部判斷，items＝{words,sentences}（同 ctx.items）；回 false 按鈕就變淡
 *     mount:function(el, ctx){ … },   // 把題目畫進 el（el 在骨架的 .stage 裡，每次進入都是新的 <div>）
 *     unmount:function(el){ … },      // 選填：離開時收拾（用 ctx.on／ctx.every 註冊的會自動清掉）
 *   });
 *   附加玩法（不屬於 ①〜④ 主流程，例如掉落方塊）：extra:true   首頁顯示成步驟下面那一行連結（文字用 title）
 *   另外兩種：
 *     href:function(scope){ return 'battle.html' + JP_SCOPE.query(scope); }   // 一般連結（不 mount）
 *     soon:true                                                                // 製作中的佔位（按鈕變淡）
 *
 * ── 玩法畫面骨架（進入玩法後，一個螢幕高、整頁不捲動）──
 *   .bar   工具列：左邊固定是「← 選單」與「範圍」chip（骨架提供），後面接玩法自己的東西（ctx.bar／ctx.tool）
 *   .hud   計分列（選用，ctx.hud 建立後才出現）
 *   .stage 題目區（撐滿、裡面可捲）；mount 拿到的 el 就在這裡面
 *   .credit 課程來源（骨架自動放）
 *   .foot  底部區（選用：鍵盤等，放進 ctx.foot；空的就不佔位）
 *   「範圍」chip 點開是選範圍小面板（picker.js），按「套用」後這個玩法用新範圍重新 mount。
 *
 * ── mount 拿到的 ctx ──
 *   ctx.scope      目前範圍 { pack, units }
 *   ctx.pack       課程包（含 avoid、credit）
 *   ctx.units      選到的小單元物件陣列（依課程順序）
 *   ctx.items      { words, sentences }：目前範圍的題目（JP_SCOPE.getItems，帶 unit／unitName／unitGroup）
 *   ctx.all        { words, sentences }：整個課程的題目（範圍太小時補干擾選項用）
 *   ctx.count      { units, words, sentences }
 *   ctx.avoid(a,b) 兩個表面文字在課程 avoid 同一組 → true
 *   ctx.store      這個玩法自己的設定儲存（JP_UTIL.storeFor(id)）
 *   ─ 版面（新）─
 *   ctx.bar        工具列上屬於玩法的那一段（元素）；可以直接 append
 *   ctx.tool.seg(items, cur, fn, label) / .chip(text, on, fn) / .select(items, cur, fn, label) / .button(text, fn, title) / .space()
 *                  建立舊版樣式的工具列元件並放進 ctx.bar，回傳元素（參數見 ui.js 的 JP_UI.tool）
 *   ctx.hud([[key, 標籤, 初值], …], opts) → { set(key, 值), label(key, 標籤), el }   顯示計分列
 *                  opts.width：最大寬度 px（預設 760；測驗用 640，和選項區對齊）
 *   ctx.stage      .stage 元素。加 class 'mid' ＝內容上下左右置中（打字那種一次一題）；預設由上往下排、可捲
 *   ctx.foot       底部區元素（鍵盤放這裡，外面包一層 <div class="kbwrap">）
 *   ctx.restart()  用目前範圍重新進入這個玩法（等於重新 mount）
 *   ─ 流程 ─
 *   ctx.home()     回首頁（選單）
 *   ctx.scopePanel()  打開「範圍」小面板
 *   ctx.on(target, type, fn, opt)  加事件監聽；離開玩法時自動移除（鍵盤快捷鍵請用這個掛在 document）
 *   ctx.every(fn, ms) / ctx.later(fn, ms)  setInterval / setTimeout；離開時自動清掉
 *   ctx.frame(fn)  每個畫面更新呼叫 fn(now)（requestAnimationFrame 迴圈）；回傳停止用的函式，離開玩法時自動停
 *   ctx.top()      題目區捲回最上面
 *   離開玩法時骨架會自動清空工具列、計分列、底部區。
 *
 * ── 頁面（index.html 呼叫）──
 *   JP_APP.start({ home:元素, play:元素, state:fn→{scope,pack}, apply:fn(scope,pack), onHome:fn })
 *       apply：玩法裡的「範圍」小面板按套用時呼叫，頁面要更新自己的範圍（記住、網址、首頁畫面）
 *   JP_APP.paintSteps(el, scope)   畫步驟按鈕；附加玩法（extra）畫成 el 後面自動加上的 <p class="more"> 一行連結
 *   JP_APP.route()                 課程載入後呼叫一次：網址有 &go=玩法id 就直接進入
 *   JP_APP.open(id)                進入玩法（不重新載入頁面；網址加 &go=id，瀏覽器上一頁回首頁）
 *   JP_APP.list() / get(id) / usable(def, scope) / current()
 * ============================================================================ */
(function (root) {
  'use strict';
  var S = root.JP_SCOPE, U = root.JP_UTIL, UI = root.JP_UI, PK = root.JP_PICKER, esc = U.esc, doc = root.document;
  var NUM = '⓪①②③④⑤⑥⑦⑧⑨⑩';

  var defs = [], byId = {};
  function register(def) {
    if (!def || !def.id) throw new Error('JP_APP.register：玩法缺少 id');
    if (byId[def.id]) throw new Error('JP_APP.register：玩法 id「' + def.id + '」重複');
    if (!def.mount && !def.href && !def.soon) throw new Error('JP_APP.register：玩法「' + def.id + '」要有 mount、href 或 soon 其中之一');
    def.needs = def.needs || 'any';
    def.step = +def.step || 99;
    def._i = defs.length;
    defs.push(def); byId[def.id] = def;
    return def;
  }
  function list() { return defs.slice().sort(function (a, b) { return a.step - b.step || a._i - b._i; }); }
  function get(id) { return byId[id] || null; }
  function usable(def, scope) {
    var c = S.count(scope);
    var ok = def.needs === 'words' ? c.words > 0 : def.needs === 'sentences' ? c.sentences > 0 : c.words + c.sentences > 0;
    if (ok && typeof def.usable === 'function') { try { ok = !!def.usable(S.getItems(scope)); } catch (e) { ok = true; } }
    return ok;
  }

  function goFromUrl() {
    var m = /[?&]go=([^&#]*)/.exec(root.location.search || '');
    if (!m) { m = /[#&]go=([^&]*)/.exec(root.location.hash || ''); }
    try { return m ? decodeURIComponent(m[1]) : ''; } catch (e) { return ''; }
  }
  var bootGo = goFromUrl();   // 啟動時就記下來（首頁會改寫網址）

  var cfg = null, cur = null, allCache = {}, sk = null;   // sk：骨架裡的元素

  function teardown() {
    closeScope(false);
    if (!cur) return;
    try { if (cur.def.unmount) cur.def.unmount(cur.host); } catch (e) { if (root.console) console.error(e); }
    cur.offs.forEach(function (f) { try { f(); } catch (e) { /* 略過 */ } });
    sk.tools.innerHTML = ''; sk.hud.innerHTML = ''; sk.hud.hidden = true;
    sk.stage.innerHTML = ''; sk.stage.className = 'stage'; sk.stage.scrollTop = 0;
    sk.foot.innerHTML = '';
    cur = null;
  }

  function makeCtx(def, st, host) {
    var offs = [];
    var pack = st.pack;
    if (!allCache[pack.id]) allCache[pack.id] = S.getItems({ pack: pack.id, units: pack.units.map(function (u) { return u.id; }) });
    var want = {};
    S.unitIds(st.scope).forEach(function (id) { want[id] = true; });
    var add = function (make) { return function () { var e = make.apply(null, arguments); sk.tools.appendChild(e); return e; }; };
    var ctx = {
      scope: st.scope, pack: pack,
      units: pack.units.filter(function (u) { return want[u.id]; }),
      items: S.getItems(st.scope), all: allCache[pack.id], count: S.count(st.scope),
      avoid: U.avoidOf(pack), store: U.storeFor(def.id),
      bar: sk.tools, stage: sk.stage, foot: sk.foot,
      tool: {
        seg: add(UI.tool.seg), chip: add(UI.tool.chip), select: add(UI.tool.select),
        button: add(UI.tool.button), space: add(UI.tool.space),
      },
      hud: function (fields, opts) { sk.hud.hidden = false; return UI.hud(sk.hud, fields, opts); },
      restart: function () { root.setTimeout(function () { if (cur && cur.def === def) open(def.id, 'none'); }, 0); },
      home: function () { home(); },
      scopePanel: function () { openScope(); },
      on: function (t, type, fn, opt) { t.addEventListener(type, fn, opt); offs.push(function () { t.removeEventListener(type, fn, opt); }); },
      every: function (fn, ms) { var id = setInterval(fn, ms); offs.push(function () { clearInterval(id); }); return id; },
      later: function (fn, ms) { var id = setTimeout(fn, ms); offs.push(function () { clearTimeout(id); }); return id; },
      top: function () { sk.stage.scrollTop = 0; root.scrollTo(0, 0); },
      frame: function (fn) {
        var id = 0, live = true;
        function tick(now) { if (!live) return; id = root.requestAnimationFrame(tick); fn(now); }
        id = root.requestAnimationFrame(tick);
        var stop = function () { live = false; root.cancelAnimationFrame(id); };
        offs.push(stop);
        return stop;
      },
    };
    return { ctx: ctx, offs: offs };
  }

  function homeUrl(st) { return S.query(st.scope); }

  // how：'push'（預設，加一筆瀏覽紀錄）｜'none'（不動網址；上一頁、route、套用新範圍用）
  function open(id, how) {
    var def = byId[id], st = cfg.state();
    if (!def || !def.mount || !st.pack) return false;
    if (!usable(def, st.scope)) { UI.toast('目前範圍沒有「' + def.title + '」需要的題目，請換個範圍'); return false; }
    teardown();
    if (how !== 'none') {
      try { root.history.pushState({ jpGo: id }, '', homeUrl(st) + '&go=' + encodeURIComponent(id)); } catch (e) { /* file:// 不允許時就不記 */ }
    }
    // 「範圍：」手機寬度不顯示（core.css），只留課程名，太長就省略號；完整文字在 title
    sk.scope.innerHTML = '<span class="k">範圍：</span>' + esc(PK.label(st.scope, st.pack));
    sk.scope.setAttribute('aria-label', '範圍：' + PK.label(st.scope, st.pack) + '（換範圍）');
    sk.scope.title = '目前範圍：' + PK.label(st.scope, st.pack) + '（' + PK.summary(st.scope) + '）。點一下可以換範圍';
    sk.credit.innerHTML = st.pack.credit || '';   // credit 是課程檔裡的 HTML（含連結），由老師維護
    sk.credit.hidden = !st.pack.credit;
    // 每次進入都給一個全新的容器：玩法掛在容器上的事件，離開時跟著容器一起丟掉
    var host = doc.createElement('div');
    host.className = 'act act-' + def.id;
    sk.stage.appendChild(host);
    var made = makeCtx(def, st, host);
    cur = { def: def, host: host, offs: made.offs };
    cfg.home.hidden = true; cfg.play.hidden = false; doc.body.classList.add('playing');
    doc.title = def.title + '｜N5 日文練習';
    root.scrollTo(0, 0);
    try { def.mount(host, made.ctx); }
    catch (e) {
      if (root.console) console.error(e);
      host.innerHTML = '<p class="msg bad">這個玩法出錯了：' + esc(e.message || e) + '</p>';
    }
    return true;
  }

  function showHome() {
    teardown();
    cfg.play.hidden = true; cfg.home.hidden = false; doc.body.classList.remove('playing');
    doc.title = homeTitle;
    if (cfg.onHome) cfg.onHome();
    root.scrollTo(0, 0);
  }
  function home() {
    var st = null;
    try { st = root.history.state; } catch (e) { /* 略過 */ }
    if (st && st.jpGo) { root.history.back(); return; }   // popstate 會接手
    try { root.history.replaceState(null, '', homeUrl(cfg.state())); } catch (e) { /* 略過 */ }
    showHome();
  }

  function onPop() {
    var go = goFromUrl();
    if (go && byId[go] && byId[go].mount) {
      if (!cur || cur.def.id !== go) { if (!open(go, 'none')) showHome(); }
    } else if (cur) {
      showHome();
    }
  }

  function route() {
    var go = bootGo; bootGo = '';
    if (!go) return;
    var def = byId[go], st = cfg.state();
    if (def && def.soon) { UI.toast('「' + def.title + '」還在製作中，下一期才會開放'); return; }
    if (!def || !def.mount) { UI.toast('連結裡的「' + go + '」不是可以直接進入的玩法'); return; }
    if (!usable(def, st.scope)) { UI.toast('目前範圍沒有「' + def.title + '」需要的題目'); return; }
    // 先放一筆「首頁」，再放玩法，這樣按上一頁會回到首頁
    try {
      root.history.replaceState(null, '', homeUrl(st));
      root.history.pushState({ jpGo: go }, '', homeUrl(st) + '&go=' + encodeURIComponent(go));
    } catch (e) { /* 略過 */ }
    open(go, 'none');
  }

  // ── 範圍小面板（玩法工具列的「範圍」chip）──
  var pop = null;
  function openScope() {
    if (!cur || pop) return;
    var def = cur.def, st = cfg.state();
    var back = doc.createElement('div'); back.className = 'popback';
    var box = doc.createElement('div'); box.className = 'popbox';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', '換範圍');
    box.innerHTML = '<div class="pbody"></div><div class="pfoot"><p class="why" hidden></p><span class="sp"></span>' +
      '<button type="button" class="chip" data-x>取消</button><button type="button" class="go" data-ok>套用</button></div>';
    var why = box.querySelector('.why'), ok = box.querySelector('[data-ok]');
    function check(scope, pack) {
      var msg = !pack ? '' : !usable(def, scope) ? '這個範圍沒有「' + def.title + '」可以用的題目' : '';
      ok.disabled = !pack || !!msg;
      why.textContent = msg; why.hidden = !msg;
    }
    var pk = PK.create(box.querySelector('.pbody'), { compact: true, scope: st.scope, pack: st.pack, onChange: check });
    check(st.scope, st.pack);
    function onKey(e) {
      e.stopPropagation();   // 不讓玩法的鍵盤快捷鍵（例如打字的 Esc、字母）收到
      if (e.key === 'Escape') { e.preventDefault(); closeScope(true); return; }
      if (e.key === 'Tab') {   // 焦點留在面板裡
        var f = box.querySelectorAll('button:not([disabled]),select');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    box.addEventListener('keydown', onKey);
    box.addEventListener('keypress', function (e) { e.stopPropagation(); });
    box.addEventListener('keyup', function (e) { e.stopPropagation(); });
    box.querySelector('[data-x]').addEventListener('click', function () { closeScope(true); });
    back.addEventListener('click', function () { closeScope(true); });
    ok.addEventListener('click', function () {
      var v = pk.value();
      if (!v.pack || !usable(def, v.scope)) return;
      closeScope(false);
      if (cfg.apply) cfg.apply(v.scope, v.pack);
      try { root.history.replaceState({ jpGo: def.id }, '', homeUrl(cfg.state()) + '&go=' + encodeURIComponent(def.id)); } catch (e) { /* 略過 */ }
      open(def.id, 'none');
      UI.toast('已換成：' + PK.label(cfg.state().scope, cfg.state().pack));
    });
    cfg.play.appendChild(back); cfg.play.appendChild(box);
    // 大螢幕：貼在工具列下面（工具列換行變高時也對得上）；手機是底部抽屜（core.css）
    if (!(root.matchMedia && root.matchMedia('(max-width:560px)').matches)) {
      var bb = cfg.play.querySelector('.bar').getBoundingClientRect().bottom;
      box.style.top = Math.round(bb + 6) + 'px';
      box.style.maxHeight = 'calc(100% - ' + Math.round(bb + 22) + 'px)';
    }
    sk.scope.setAttribute('aria-expanded', 'true');
    pop = { back: back, box: box, pk: pk };
    pk.focus();
  }
  function closeScope(refocus) {
    if (!pop) return;
    pop.pk.destroy(); pop.back.remove(); pop.box.remove(); pop = null;
    sk.scope.setAttribute('aria-expanded', 'false');
    if (refocus) sk.scope.focus();
  }

  // ── 首頁：步驟按鈕 ──
  function stepButton(d, scope) {
    var ok = usable(d, scope), note, off = d.soon || !ok;
    if (d.soon) note = '製作中，下一期開放';
    else if (!ok) note = '範圍內沒有可用的題目';
    else note = d.desc || '';
    var inner = '<i>' + esc((NUM[d.step] || d.step) + ' ' + (d.stepName || '')) + '</i><b>' + esc(d.short || d.title) + '</b><span>' + esc(note) + '</span>';
    if (d.href && !off) return '<a class="step" href="' + esc(d.href(scope)) + '" data-act="' + esc(d.id) + '">' + inner + '</a>';
    return '<button type="button" class="step' + (off ? ' off' : '') + '" data-act="' + esc(d.id) + '" data-ok="' + !off + '"' +
      (off ? ' aria-disabled="true"' : '') + '>' + inner + '</button>';
  }
  function extraLink(d, scope) {
    var ok = !d.soon && usable(d, scope);
    var href = d.href ? d.href(scope) : homeUrl({ scope: scope }) + '&go=' + encodeURIComponent(d.id);
    if (!ok) return '<span class="off" title="' + (d.soon ? '製作中' : '範圍內沒有可用的題目') + '">' + esc(d.title) + '</span>';
    return '<a href="' + esc(href) + '" data-act="' + esc(d.id) + '"' + (d.desc ? ' title="' + esc(d.desc) + '"' : '') + '>' + esc(d.title) + '</a>';
  }
  function onStep(e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var d = byId[b.dataset.act]; if (!d) return;
    if (b.tagName === 'A') {
      if (d.href || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;   // 一般連結、另開分頁就交給瀏覽器
      e.preventDefault(); open(d.id); return;
    }
    if (d.soon) UI.toast('「' + d.title + '」還在製作中，下一期才會開放');
    else if (b.dataset.ok !== 'true') UI.toast('目前範圍沒有「' + d.title + '」需要的題目，請換個範圍');
    else open(d.id);
  }
  function paintSteps(el, scope) {
    var all = list(), extras = all.filter(function (d) { return d.extra; });
    var html = all.filter(function (d) { return !d.extra; }).map(function (d) { return stepButton(d, scope); }).join('');
    if (el._jpHtml !== html || !el.firstChild) { el._jpHtml = html; el.innerHTML = html; }   // 內容沒變就不重畫（首頁卡片的動畫才不會每次重來）
    if (!el._jpBound) { el._jpBound = true; el.addEventListener('click', onStep); }
    var x = el._jpExtra;
    if (!x && extras.length) {
      x = el._jpExtra = doc.createElement('p');
      x.className = 'more';
      el.parentNode.insertBefore(x, el.nextSibling);
      x.addEventListener('click', onStep);
    }
    if (x) {
      x.hidden = !extras.length;
      x.innerHTML = '練完想放鬆：' + extras.map(function (d) { return extraLink(d, scope); }).join('、');
    }
  }

  var homeTitle = doc.title;
  function start(o) {
    cfg = o; homeTitle = doc.title;
    o.play.classList.add('jpplay');
    o.play.innerHTML =
      '<div class="bar"><span class="nav">' +
      '<button type="button" class="chip back" data-nav="home" title="回選單（換玩法、換範圍）"><span aria-hidden="true">←</span><span class="t"> 選單</span></button>' +
      '<button type="button" class="chip scopechip" data-nav="scope" aria-haspopup="dialog" aria-expanded="false"></button>' +
      '</span><span class="tools"></span></div>' +
      '<div class="hudbox" hidden></div>' +
      '<main class="stage"></main>' +
      '<div class="credit" hidden></div>' +
      '<div class="foot"></div>';
    sk = {
      tools: o.play.querySelector('.tools'), hud: o.play.querySelector('.hudbox'), stage: o.play.querySelector('.stage'),
      credit: o.play.querySelector('.credit'), foot: o.play.querySelector('.foot'), scope: o.play.querySelector('.scopechip'),
    };
    o.play.querySelector('.nav').addEventListener('click', function (e) {
      var b = e.target.closest('[data-nav]'); if (!b) return;
      if (b.dataset.nav === 'scope') { if (pop) closeScope(true); else openScope(); }
      else home();
    });
    root.addEventListener('popstate', onPop);
    try { root.history.scrollRestoration = 'manual'; } catch (e) { /* 舊瀏覽器 */ }
  }

  root.JP_APP = {
    register: register, list: list, get: get, usable: usable,
    start: start, paintSteps: paintSteps, route: route, open: open, home: home,
    current: function () { return cur ? cur.def : null; },
  };
})(window);
