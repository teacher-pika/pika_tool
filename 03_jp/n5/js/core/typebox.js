/* typebox.js — 一題打字：顯示題目＋已打的字，接上判定與鍵盤（window.JP_TYPEBOX）
 * ============================================================================
 * 需要先載入 jp.js、util.js、ui.js、typer.js、keyboard.js。
 * 打字練習這種「畫面上一次一題」的玩法用這個；掉落方塊等自己畫題目的玩法改用 JP_TYPE.judge ＋ JP_KB（見 typer.js 檔頭）。
 *
 *   var tb = JP_TYPEBOX.create(opts)
 *     opts.show     題目要畫在哪個元素（段落：已打＝綠底線、目前＝灰底線、文法重點藍字；標音依共用設定）。字級由呼叫端給（例：core.css 的 .big）
 *     opts.typed    已打的字要畫在哪（選填）：一個假名一格，打到一半的羅馬字藍色顯示
 *     opts.kb       鍵盤要畫在哪；opts.sys 系統鍵盤輸入框要放哪（選填，建議題目正下方，手機才不會被系統鍵盤蓋住）
 *     opts.shake    打錯時要晃的元素（預設 opts.show）
 *     opts.actions  鍵盤上的功能鍵 [{ id, label }]；按了呼叫 opts.onAction(id)
 *     opts.on       ctx.on（建議傳：離開玩法時自動移除 document 上的監聽）
 *     opts.onStart()                 這一輪第一次按鍵（tb.wait() 之後）——計時從這裡開始
 *     opts.onKey(e)                  每一鍵：e = { ok, res, expect, got }（res 是 judge 的回傳；'skip' 不算對錯，不會呼叫）
 *     opts.onDone(r)                 打完一題：r 見下面 tb.record()
 *     opts.onPrefs(key, value)       共用設定（鍵盤、標音、提示）改了之後
 *   tb.load(jp)     出一題（jp 是題庫的 jp 字串）。上一題結尾的「ん」只打一個 n 的話，這題自動吞掉多打的 n。
 *                   題目元素會加上 data-kana（要打的平假名）與 data-q（第幾次出題），除錯、自動測試用
 *   tb.wait()       下一次按鍵才開始計時（一輪開始前呼叫；這一題的用時也從第一次按鍵算）
 *   tb.lock(bool)   true＝暫時不收輸入（打完一題的換題空檔）；tb.load 會自動解除
 *   tb.record()     目前這題的紀錄 { kana, sec, miss, wrong:['し→sa', …], furi, hint, mult, kb, typed(已確定的假名數), keys(按了幾鍵), done }
 *                   furi／hint＝這題中途開過就算 true；mult＝JP_TYPE.mult(furi, hint)
 *   tb.judge        目前這題的 JP_TYPE.judge；tb.kbd 鍵盤（JP_KB）
 *   tb.focus()      系統鍵盤時把焦點放到輸入框
 *   tb.destroy()    移除鍵盤與監聽
 * ============================================================================ */
(function (root) {
  'use strict';
  var J = root.JP_TEXT, U = root.JP_UTIL, UI = root.JP_UI, TY = root.JP_TYPE, KB = root.JP_KB, esc = U.esc, doc = root.document;

  // 樣子照舊版 raw_source/typing-adj-single.html 的 .sent／.tok／.typed／.shake
  UI.css('typebox', [
    '.tbq{font-family:var(--jp);font-weight:700;line-height:1.9;text-wrap:balance;overflow-wrap:anywhere;word-break:keep-all}',
    '.tbq.nofuri{line-height:1.45}',
    '.tbq .jseg{border-bottom:4px solid transparent;margin:0 .04em;transition:border-color .15s}',
    '.tbq .jseg.cur{border-bottom-color:var(--muted)}',
    '.tbq .jseg.done{border-bottom-color:var(--ok)}',
    '.tbq.pass .jseg,.tbq.pass .jseg.g{color:var(--ok)}',
    '.tbtyped{font-family:var(--jp);display:flex;flex-wrap:wrap;justify-content:center;gap:3px;min-height:1.5em}',
    '.tbtyped span{min-width:.95em;border-bottom:2px solid var(--line);line-height:1.3;text-align:center}',
    '.tbtyped .ok{color:var(--ok);border-bottom-color:var(--ok)}',
    '.tbtyped .pend{color:var(--muted);border-bottom-color:var(--muted)}',
    '.tbtyped .next{border-bottom-color:var(--ink)}',
    '.tbtyped .buf{color:var(--blue);border-bottom-color:var(--blue);font-family:var(--ui);padding:0 2px}',
    '.tbshake{animation:tbshake .22s}',
    '.tbshake .tbtyped .next,.tbshake .tbtyped .buf{border-bottom-color:var(--bad)}',
    '@keyframes tbshake{25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}',
    '@media (prefers-reduced-motion: reduce){.tbshake{animation:none}}',
  ].join('\n'));

  function create(o) {
    var live = true, locked = false, waiting = false, prevEndN = false, loads = 0;
    var tg = null, jdg = null, cur = null, segEls = [];
    var showEl = o.show, typedEl = o.typed || null, shakeEl = o.shake || o.show;
    var offs = [];
    function on(t, type, fn) {
      if (o.on) o.on(t, type, fn); else t.addEventListener(type, fn);
      offs.push(function () { t.removeEventListener(type, fn); });
    }
    showEl.classList.add('tbq'); showEl.setAttribute('lang', 'ja');
    if (typedEl) { typedEl.classList.add('tbtyped'); typedEl.setAttribute('lang', 'ja'); typedEl.setAttribute('aria-live', 'off'); }

    var kbd = KB.create(o.kb, {
      type: TY.prefs.get('kb'), sysHost: o.sys, actions: o.actions, on: o.on,
      onRoman: function (l) { feed(function (j) { return j.roman(l); }, l); },
      onKana: function (c) { feed(function (j) { return j.input(c); }, c); },
      onMod: function () { feed(function (j) { var r = j.mod(); return r === 'none' ? 'skip' : r; }, '゛'); },
      onDel: function () { if (!jdg || locked || jdg.done) return; jdg.back(); paint(); },
      onSys: function (v) {
        if (!jdg || locked || jdg.done) return;
        started();
        var before = jdg.pos, r = jdg.sys(v);
        if (cur) cur.keys++;
        if (jdg.pos > before && o.onKey) for (var i = before; i < jdg.pos; i++) o.onKey({ ok: true, res: 'ok', expect: jdg.kana[i], got: jdg.kana[i] });
        paint();
        if (r === 'done') complete();
      },
      onAction: function (id) { if (o.onAction) o.onAction(id); },
    });

    function started() {
      if (!waiting) return;
      waiting = false;
      if (cur) cur.t0 = Date.now();
      if (o.onStart) o.onStart();
    }
    function shown(i) { return tg && tg.kata[i] ? J.toKata(jdg.kana[i]) : jdg.kana[i]; }
    function feed(fn, got) {
      if (!live || !jdg || locked || jdg.done) return;
      started();
      var expect = jdg.expect(), was = jdg.buf;
      var r = fn(jdg);
      if (r === 'skip') { paint(); return; }
      cur.keys++;
      if (r === 'miss') {
        cur.miss++;
        var exp = tg && tg.kata[jdg.pos] ? J.toKata(expect) : expect;
        cur.wrong.push(exp + '→' + (jdg.pend ? jdg.pend + '（要先按゛゜小）' : was + got));
        shake();
        if (o.onKey) o.onKey({ ok: false, res: r, expect: expect, got: was + got });
        paint();
        return;
      }
      if (o.onKey) o.onKey({ ok: true, res: r, expect: expect, got: got });
      paint();
      if (r === 'done') complete();
    }
    function shake() {
      shakeEl.classList.remove('tbshake'); void shakeEl.offsetWidth; shakeEl.classList.add('tbshake');
    }
    function complete() {
      prevEndN = !!jdg.endN;
      showEl.classList.add('pass');
      kbd.hint(null);
      kbd.sysReset();
      if (o.onDone) o.onDone(record());
    }
    function record() {
      if (!cur) return null;
      return {
        kana: jdg.kana, sec: (Date.now() - cur.t0) / 1000, miss: cur.miss, wrong: cur.wrong.slice(),
        furi: cur.furi, hint: cur.hint, mult: TY.mult(cur.furi, cur.hint), kb: cur.kb, typed: jdg.pos, keys: cur.keys, done: jdg.done,
      };
    }

    function applyPrefs() {
      var furi = TY.prefs.get('furi'), hint = TY.prefs.get('hint');
      showEl.classList.toggle('nofuri', !furi);
      if (cur) { if (furi) cur.furi = true; if (hint) cur.hint = true; }   // 一題中途開過就算有開
    }
    function paint() {
      if (!jdg) return;
      var pos = jdg.pos, curSet = false;
      segEls.forEach(function (el, k) {
        var a = tg.segStart[k], b = tg.segEnd[k];
        var done = b > a && pos >= b;
        var c = !done && !curSet && b > a;
        if (c) curSet = true;
        el.classList.toggle('done', done);
        el.classList.toggle('cur', c && !jdg.done);
      });
      if (typedEl) {
        var h = '';
        for (var i = 0; i < jdg.kana.length; i++) {
          if (i < pos) h += '<span class="ok">' + esc(shown(i)) + '</span>';
          else if (i === pos && jdg.pend) h += '<span class="pend">' + esc(tg.kata[i] ? J.toKata(jdg.pend) : jdg.pend) + '</span>';
          else if (i === pos && jdg.buf) h += '<span class="buf">' + esc(jdg.buf) + '</span>';
          else h += '<span' + (i === pos ? ' class="next"' : '') + '>&nbsp;</span>';
        }
        typedEl.innerHTML = h;
      }
      kbd.hint(TY.prefs.get('hint') && !locked ? jdg.hint(kbd.type) : null);
    }

    on(doc, 'jp-typeprefs', function (e) {
      var k = e.detail && e.detail.key;
      if (k === 'kb') {
        if (jdg) jdg.clearPartial();
        kbd.setType(TY.prefs.get('kb'));
        if (cur) cur.kb = kbd.type;
        if (kbd.type === 'sys') kbd.focus();
      }
      applyPrefs(); paint();
      if (o.onPrefs) o.onPrefs(k, e.detail.value);
    });

    var tb = {
      kbd: kbd,
      load: function (jp) {
        tg = J.target(jp);
        jdg = TY.judge(tg.kana, { swallowN: prevEndN });
        prevEndN = false;
        cur = { t0: Date.now(), miss: 0, keys: 0, wrong: [], furi: false, hint: false, kb: kbd.type };
        tb.judge = jdg;
        showEl.innerHTML = J.html(jp);
        showEl.dataset.kana = tg.kana;          // 要打的平假名（除錯、測試用）
        showEl.dataset.q = ++loads;             // 第幾次出題
        showEl.classList.remove('pass');
        shakeEl.classList.remove('tbshake');
        segEls = Array.prototype.slice.call(showEl.querySelectorAll('.jseg'));
        locked = false; kbd.enable(true);
        kbd.sysReset();
        applyPrefs(); paint();
      },
      wait: function () { waiting = true; },
      lock: function (b) { locked = !!b; kbd.enable(!locked); paint(); },
      record: record,
      focus: function () { kbd.focus(); },
      destroy: function () { live = false; offs.forEach(function (f) { f(); }); offs = []; kbd.destroy(); },
    };
    return tb;
  }

  root.JP_TYPEBOX = { create: create };
})(window);
