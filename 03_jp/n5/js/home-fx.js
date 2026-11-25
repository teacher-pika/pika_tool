/* home-fx.js — 日文頁（03_jp/n5/index.html）首頁的卡片與動畫（window.HOME_FX）
 * ============================================================================
 * 外觀比照入口網（根目錄 index.html）：大標題逐字落下、背景飄浮假名、步驟做成「示意動畫＋說明＋開始 →」的卡片。
 * 動畫用 Anime.js 3.2.1（和入口網同一版）。Anime.js 載不到、或系統設定「減少動態效果」時，
 * 卡片照樣畫出來（示意圖靜止），功能不受影響。樣式在 index.html 的 <style>。
 *
 *   HOME_FX.steps(el)            步驟按鈕（JP_APP.paintSteps）畫完後呼叫：補上示意圖與「開始 →」，啟動卡片動畫
 *   HOME_FX.changed(scope, pack) 範圍改變後呼叫：「今天」的數字滾動到新數字；換課程時膠囊依序彈出
 *   HOME_FX.pop(el)              讓一顆按鈕彈一下（例：複製成功）
 *   HOME_FX.intro()              標題逐字落下、背景符號（啟動時呼叫一次）
 * 加新玩法：在 DEMO / ANIM 加一個和玩法 id 同名的示意；沒加就用玩法名稱前兩個字跳動。
 * 示意動畫（quiz、typing、battle）是從入口網複製來的，改的時候兩邊一起看。
 * ============================================================================ */
(function (root) {
  'use strict';
  var doc = root.document, anime = root.anime;
  var still = !anime || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(sel)); };
  var cssVar = function (n) { return getComputedStyle(doc.documentElement).getPropertyValue(n).trim(); };
  // 動畫結束後清掉行內樣式，不然會蓋掉 CSS 的 :hover／:active
  function clean(els) { return function () { els.forEach(function (e) { e.style.transform = ''; e.style.opacity = ''; }); }; }

  // ── 卡片上的示意（key＝玩法 id）──
  var DEMO = {
    browse: '<div class="bw" lang="ja"><div>ねこ<u></u></div><div>がっこう<u></u></div><div>たべる<u></u></div></div>',
    quiz: '<div class="q-ask">學校</div><div class="q-box" lang="ja"><b>先生</b><b>学校</b><b>電車</b><b>時計</b></div>',
    typing: '<div class="t-word" lang="ja"><span>に</span><span>ほ</span><span>ん</span><span>ご</span></div><div class="t-keys"><b>n</b><b>i</b><b>h</b><b>o</b><b>g</b></div>',
    battle: '<div class="gn">' + ['a', 'b'].map(function (k) { return '<div class="gp ' + k + '"><span class="fl"><svg viewBox="0 0 40 44"><circle cx="18" cy="10" r="8"/><rect x="8" y="19" width="20" height="22" rx="7"/><rect x="26" y="24" width="13" height="4.5" rx="2"/></svg></span><i>♥♥♥</i></div>'; }).join('') +
      '<b class="gb"></b><span class="gq" lang="ja">みず ✓</span></div>'
  };
  var ANIM = {
    browse: function (c) {
      var r = c.querySelectorAll('.bw div');
      return [anime.timeline({ loop: true }).add({ targets: r, translateX: [-30, 0], opacity: [0, 1], delay: anime.stagger(160), duration: 340, easing: 'easeOutCubic' }, 300)
        .add({ targets: c.querySelectorAll('.bw u'), scaleX: [0, 1], delay: anime.stagger(160), duration: 380, easing: 'easeOutQuad' }, 500)
        .add({ targets: r, opacity: 0, duration: 260, delay: 1300, easing: 'linear' })];
    },
    quiz: function (c) {
      var o = c.querySelectorAll('.q-box b'), ok = cssVar('--ok'), line = cssVar('--line'), ink = cssVar('--ink');
      return [anime.timeline({ loop: true, easing: 'easeOutQuad' })
        .add({ targets: o, translateY: [8, 0], opacity: [0, 1], delay: anime.stagger(80), duration: 300 }, 300)
        .add({ targets: o[1], scale: [1, .92, 1.06, 1], borderColor: [line, ok], color: [ink, ok], duration: 520 }, '+=500')
        .add({ targets: o, opacity: 0, duration: 260, delay: 1100 }).add({ targets: o[1], borderColor: line, color: ink, duration: 1 })];
    },
    typing: function (c) {
      var ch = $$('.t-word span', c), keys = c.querySelectorAll('.t-keys b'), seq = [0, 1, 2, 3, 0, 4, 3], done = [0, 1, 1, 2, 3, 3, 4];
      var tl = anime.timeline({ loop: true, easing: 'easeOutQuad' });
      seq.forEach(function (k, i) {
        tl.add({ targets: keys[k], scale: [1, .78, 1], duration: 240, complete: function () { ch.forEach(function (x, j) { x.classList.toggle('on', j < done[i]); }); } }, i === 0 ? 400 : '+=110');
      });
      tl.add({ targets: ch, scale: [1, 1.18, 1], delay: anime.stagger(50), duration: 300 }, '+=100')
        .add({ duration: 900, complete: function () { ch.forEach(function (x) { x.classList.remove('on'); }); } });
      return [tl];
    },
    // 槍戰：藍色開槍命中紅色（扣一滴血），紅色還擊、藍色在半路打完題目把子彈解除
    battle: function (c) {
      var g = c.querySelector('.gn'), A = g.querySelector('.gp.a'), B = g.querySelector('.gp.b'), b = g.querySelector('.gb'), q = g.querySelector('.gq');
      var hB = B.querySelector('i'), blue = cssVar('--blue'), red = cssVar('--bad');
      var w = g.clientWidth || 200, x0 = w * 0.17, x1 = w * 0.79, mid = w * 0.42;
      b.style.left = '0'; b.style.opacity = 0;
      return [anime.timeline({ loop: true, easing: 'linear' })
        .add({ targets: b, opacity: 0, translateX: x0, duration: 1, complete: function () { b.style.background = blue; } })
        .add({ targets: A.querySelector('svg'), rotate: [0, -12, 0], duration: 260, easing: 'easeOutQuad' }, 500)
        .add({ targets: b, translateX: [x0, x1], opacity: [1, 1], duration: 850 }, '-=200')
        .add({ targets: b, opacity: 0, duration: 60 })
        .add({ targets: B, translateX: [0, 5, -5, 3, 0], opacity: [1, .35, 1, .35, 1], duration: 420, easing: 'easeOutQuad', begin: function () { hB.textContent = '♥♥'; } }, '-=40')
        .add({ targets: B.querySelector('svg'), rotate: [0, -12, 0], duration: 260, easing: 'easeOutQuad', complete: function () { b.style.background = red; } }, '+=350')
        .add({ targets: b, translateX: [x1, mid], opacity: [1, 1], duration: 620 }, '-=200')
        .add({ targets: q, opacity: [0, 1], translateY: [6, 0], duration: 220, easing: 'easeOutBack' })
        .add({ targets: b, scale: [1, 2], opacity: [1, 0], duration: 260, easing: 'easeOutQuad' }, '-=120')
        .add({ targets: q, opacity: 0, duration: 260, delay: 700, complete: function () { hB.textContent = '♥♥♥'; b.style.transform = ''; } })
        .add({ duration: 500 })];
    },
    auto: function (c) {
      return [anime({ targets: c.querySelectorAll('.au span'), translateY: [0, -9, 0], delay: anime.stagger(140), duration: 900, easing: 'easeInOutSine', loop: true, endDelay: 500 })];
    }
  };

  function pop(els, gap) {
    if (still) return;
    els = (els && els.nodeType ? [els] : els || []).filter(Boolean);
    if (!els.length) return;
    anime.remove(els);
    anime({ targets: els, scale: [0.86, 1], duration: 520, delay: anime.stagger(gap || 0), easing: 'easeOutElastic(1, .55)', complete: clean(els) });
  }
  function rise(els, gap, dist) {
    els = els.filter(Boolean);
    if (still || !els.length) return;
    anime.remove(els);
    anime({ targets: els, translateY: [dist || 10, 0], opacity: [0, 1], duration: 400, delay: anime.stagger(gap || 30), easing: 'easeOutCubic', complete: clean(els) });
  }

  // 滑鼠移動時卡片微微傾斜（和入口網的卡片一樣）
  function tilt(c) {
    c.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      anime.remove(c); anime({ targets: c, rotateY: x * 6, rotateX: -y * 6, translateY: -3, duration: 240, easing: 'easeOutQuad' });
    });
    c.addEventListener('pointerleave', function () { anime.remove(c); anime({ targets: c, rotateX: 0, rotateY: 0, translateY: 0, scale: 1, duration: 400, easing: 'easeOutElastic(1,.7)' }); });
    c.addEventListener('pointerdown', function () { anime({ targets: c, scale: .97, duration: 120, easing: 'easeOutQuad' }); });
    c.addEventListener('pointerup', function () { anime({ targets: c, scale: 1, duration: 240, easing: 'easeOutBack' }); });
  }

  // ── 步驟卡片 ──
  var running = [], entered = false;
  function steps(el) {
    var all = $$('.step', el);
    if (!all.some(function (s) { return !s.querySelector('.demo'); })) return;   // 沒有重畫（範圍變了但按鈕一樣）：動畫繼續跑，不重來
    running.forEach(function (a) { try { a.pause(); } catch (e) {} }); running = [];
    all.forEach(function (s) {
      var id = s.getAttribute('data-act'), off = s.classList.contains('off'), key = DEMO[id] ? id : 'auto';
      var name = (s.querySelector('b') || s).textContent;
      var d = doc.createElement('div'); d.className = 'demo'; d.setAttribute('aria-hidden', 'true');
      d.innerHTML = DEMO[id] || '<div class="au">' + name.slice(0, 2).split('').map(function (c) { return '<span>' + c + '</span>'; }).join('') + '</div>';
      s.insertBefore(d, s.firstChild);
      var c = doc.createElement('div'); c.className = 'cta';
      c.innerHTML = off ? '目前不能用' : (s.tagName === 'A' ? '開啟對戰頁' : '開始') + '<em aria-hidden="true">→</em>';
      s.appendChild(c);
      if (still || off) return;
      try { running = running.concat(ANIM[key](d)); } catch (e) {}
      tilt(s);
    });
    if (entered) return;
    entered = true;
    var more = el.nextElementSibling;
    rise([doc.querySelector('#picker .pick'), doc.getElementById('hSteps')].concat(all, [more && more.classList.contains('more') ? more : null, doc.getElementById('credit')]), 60, 22);
  }

  // ── 標題與背景 ──
  function intro() {
    var t = doc.getElementById('title'), bg = doc.getElementById('bg');
    if (still) return;
    if (t) anime({ targets: t.querySelectorAll('span'), translateY: [-24, 0], opacity: [0, 1], rotate: [-8, 0], delay: anime.stagger(45), duration: 480, easing: 'easeOutBack' });
    if (!bg) return;
    var g = 'あいうえおかきくけこアイウエオ'.split('');
    for (var i = 0; i < 12; i++) {
      var s = doc.createElement('span'); s.textContent = g[Math.random() * g.length | 0];
      s.style.left = (Math.random() * 96) + '%'; s.style.fontSize = (20 + Math.random() * 44) + 'px'; bg.appendChild(s);
      anime({
        targets: s, translateY: [0, -(root.innerHeight + 160)], rotate: [anime.random(-20, 20), anime.random(-20, 20)],
        opacity: [{ value: .12, duration: 1500, easing: 'linear' }, { value: .12, duration: 9000 }, { value: 0, duration: 2000, easing: 'linear' }],
        duration: anime.random(14000, 24000), delay: i * 800, easing: 'linear', loop: true
      });
    }
  }

  // ── 「今天」的數字滾動 ──
  var shown = null, lastPack = null, roll = null;
  function sumText(w, s, fin) {
    var a = [];
    if (fin.words) a.push(Math.round(w) + ' 個單字');
    if (fin.sentences) a.push(Math.round(s) + ' 個句子');
    return a.join('、');
  }
  function changed(scope, pack) {
    if (still || !pack) return;
    var c = root.JP_SCOPE.count(scope), fin = { words: c.words, sentences: c.sentences };
    var b = doc.querySelector('#picker .psum b');
    var newPack = lastPack !== pack.id;
    lastPack = pack.id;
    if (newPack && shown) pop($$('#picker .cap'), 45);          // 換課程：膠囊依序彈出
    if (roll) { roll.pause(); roll = null; }
    if (b && shown && (fin.words || fin.sentences) && (shown.words !== fin.words || shown.sentences !== fin.sentences)) {
      var o = { w: shown.words, s: shown.sentences };
      roll = anime({
        targets: o, w: fin.words, s: fin.sentences, duration: 450, easing: 'easeOutCubic',
        update: function () { if (b.isConnected) b.textContent = sumText(o.w, o.s, fin); },
        complete: function () { if (b.isConnected) b.textContent = sumText(fin.words, fin.sentences, fin); }
      });
    }
    shown = fin;
  }

  // ── 選範圍卡片裡的點擊（picker 已經先重畫完，這裡只對新畫出來的元素加動畫）──
  var host = doc.getElementById('picker');
  if (host && !still) host.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button');   // 這顆可能已被重畫換掉，只讀它的 data-*
    if (!b) return;
    var d = b.dataset;
    if (d.cap != null) {                                       // 展開分類：面板滑下、小單元依序出現
      var p = host.querySelector('.upanel');
      if (p) { rise([p], 0, -8); rise($$('.ubtn', p), 18, 8); }
    } else if (d.u) {                                          // 勾小單元：那顆和所屬膠囊彈一下
      pop($$('.ubtn', host).filter(function (x) { return x.dataset.u === d.u; }).concat([host.querySelector('.cap.open')]));
    } else if (d.gall != null) {
      pop($$('.upanel .ubtn', host), 14);
      pop(host.querySelector('.cap.open'));
    } else if (b.hasAttribute('data-all')) {                   // 全部：整排膠囊像波浪一樣依序彈
      pop($$('.cap', host), 45);
      pop($$('.upanel .ubtn', host), 14);
    }
  });

  root.HOME_FX = { steps: steps, changed: changed, pop: pop, intro: intro };
})(window);
