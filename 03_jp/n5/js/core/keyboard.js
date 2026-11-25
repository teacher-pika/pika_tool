/* keyboard.js — 打字用的鍵盤（window.JP_KB）
 * ============================================================================
 * 需要先載入 util.js、ui.js、typer.js。樣式在這個檔裡（JP_UI.css）。
 * 四種鍵盤（行為沿用舊版 raw_source/typing-adj-single.html、fall-single.html）：
 *   rom  羅馬拼音（預設）：QWERTY 螢幕鍵盤；電腦也可以直接用實體鍵盤（a〜z、- 是長音、' 、Backspace）
 *   k12  十二鍵：仿手機，點一下是あ段，按住往 左・上・右・下 滑是い・う・え・お段；濁音、半濁音、小字先打原字再按「゛゜小」
 *   k50  五十音：一鍵一字，「゛゜小」同上
 *   sys  系統鍵盤：一個輸入框，用裝置自己的日文輸入法（不記錄打錯的字）
 *
 * ── 鍵盤 ──
 *   var kb = JP_KB.create(host, opts)   在 host 裡畫鍵盤（host 原本的內容會被換掉）
 *     opts.type        'rom'｜'k12'｜'k50'｜'sys'（省略＝JP_TYPE.prefs.get('kb')）
 *     opts.sysHost     系統鍵盤輸入框要放哪（省略＝host）。手機上建議放在題目正下方，才不會被系統鍵盤蓋住
 *     opts.actions     [{ id:'skip', label:'跳過這題', short:'跳過' }, …]（最多 2 個）額外的功能鍵：羅馬拼音、系統鍵盤放在最下面一排寬鍵、
 *                      十二鍵放左邊一欄、五十音放「跳」那格（只放第 1 個）。short（選填）是窄格子（十二鍵、五十音）用的短字
 *     opts.onRoman(字母) opts.onKana(假名) opts.onMod() opts.onDel() opts.onSys(輸入框內容) opts.onAction(id)
 *     opts.physical    true（預設）：羅馬拼音模式時接收實體鍵盤（掛在 document，輸入框、文字框裡打字不會被搶）
 *     opts.on          ctx.on（建議傳）：document 上的監聽改用它掛，離開玩法時自動移除
 *     鍵盤下方有一行用法說明（同舊版；手機寬度只在系統鍵盤顯示、很矮的螢幕〔高度 ≤ 640〕收起來。說明文字在 JP_KB.NOTE[種類]，設定畫面可以自己顯示）
 *   kb.setType(t)      換鍵盤（會重畫；不會改共用設定，要記住請另外 JP_TYPE.prefs.set('kb', t)）
 *   kb.type            目前鍵盤
 *   kb.hint(h)         框出建議的鍵：h 是 JP_TYPE.judge 的 j.hint(kb.type)（{roman}｜{kana}｜{mod}｜null）
 *   kb.sysReset()      清空系統鍵盤輸入框（一題打完換下一題時呼叫；會暫時移開焦點，讓輸入法重新開始）
 *   kb.focus()         系統鍵盤時把焦點放到輸入框
 *   kb.enable(bool)    false＝暫時不收任何輸入（例如一題剛打完的換題空檔、時間到）
 *   kb.destroy()       移除監聽、清空 host
 *
 * 鍵盤種類、平假名標音、按鍵提示的開關由各玩法放在工具列（ctx.tool），改的是 JP_TYPE.prefs（所有打字玩法共用）。
 * ============================================================================ */
(function (root) {
  'use strict';
  var U = root.JP_UTIL, UI = root.JP_UI, TY = root.JP_TYPE, esc = U.esc, doc = root.document;

  // 尺寸、圓角、顏色照舊版 raw_source/typing-adj-single.html 的 .kbwrap／.kb／.key（顏色用 core.css 的 --key、--key2）
  // 放在 core.css 的 .kbwrap 裡時，外框的底色由 .kbwrap 提供（.kbwrap .kbw 去掉自己的底色與圓角）
  UI.css('kb', [
    '.kbw{background:var(--key2);border-radius:14px;padding:7px 6px;touch-action:manipulation}',
    '.kbw.sysmode{background:none;padding:0}',
    '.kb{display:grid;gap:6px;margin:0 auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}',
    '.kb.k12{grid-template-columns:repeat(5,1fr);max-width:520px}',
    '.kb.k50{grid-template-columns:repeat(10,1fr);max-width:720px;gap:4px}',
    '.kb .key{background:var(--key);border:0;border-radius:8px;height:54px;font-family:var(--jp);font-size:25px;font-weight:500;color:var(--ink);',
    '  display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;padding:0;min-width:0;',
    '  box-shadow:0 1px 0 rgba(0,0,0,.28);-webkit-tap-highlight-color:transparent}',
    '.kb .key small{font-size:10.5px;color:var(--muted);letter-spacing:.12em;margin-top:5px;font-weight:500}',
    '.kb .key.fn{background:transparent;border:1px solid var(--muted);box-shadow:none;font-family:var(--ui);font-size:15px}',
    '.kb .key.tall{grid-row:span 2;height:auto}',
    '.kb .key.blank{visibility:hidden}',
    '.kb .key.down{filter:brightness(.86)}',
    '.kb .key.hint{box-shadow:0 0 0 3px var(--blue);position:relative;z-index:1}',
    '.kb.k50 .key{height:44px;font-size:21px;border-radius:6px}',
    '.kb.k50 .key.fn{font-size:12px}',
    '.kb.rom{display:flex;flex-direction:column;gap:6px;max-width:560px}',
    '.kb.rom .row{display:flex;gap:4px;justify-content:center}',
    '.kb.rom .key{flex:1 1 0;height:46px;font-family:var(--ui);font-size:20px;border-radius:6px}',
    '.kb.rom .row.r2{padding:0 5%}',
    '.kb.rom .key.w{flex:1.5 1 0;font-size:16px}',
    '.kb.rom .row.r4 .key{height:38px;font-size:14px}',
    '.kbpop{position:fixed;z-index:40;display:none;grid-template-columns:repeat(3,1fr);pointer-events:none}',
    '.kbpop span{display:flex;align-items:center;justify-content:center;font-family:var(--jp);font-size:25px;background:var(--card);border:1px solid var(--line);color:var(--ink)}',
    '.kbpop span.e{visibility:hidden}',
    '.kbpop span.on{background:var(--blue);color:var(--onblue);border-color:var(--blue)}',
    '.kbsys{max-width:520px;width:100%;margin:0 auto;padding:6px 10px}',
    '.kbsys input{width:100%;font-family:var(--jp);font-size:24px;padding:10px 12px;border-radius:10px;border:1px solid var(--muted);background:var(--card);color:var(--ink)}',
    '.kbnote{text-align:center;color:var(--muted);font-size:12px;margin:6px 0 0;line-height:1.45}',
    /* 手機寬度：用法說明只在系統鍵盤顯示（省下兩行高，長句子加標音也不用捲動）；很矮的螢幕（橫放的手機）：鍵縮小、說明收起來 */
    '@media (max-width:560px){.kbw:not(.sysmode) .kbnote{display:none}}',
    '@media (max-height:640px){.kb .key{height:44px}.kb.rom .key{height:40px}.kb.k50 .key{height:36px}.kb.rom .row.r4 .key{height:34px}.kbnote{display:none}}',
  ].join('\n'));

  var F12 = [['あ', 'あいうえお'], ['か', 'かきくけこ'], ['さ', 'さしすせそ'], ['た', 'たちつてと'], ['な', 'なにぬねの'],
    ['は', 'はひふへほ'], ['ま', 'まみむめも'], ['や', 'や　ゆ　よ'], ['ら', 'らりるれろ'], ['わ', 'わをんー　']];
  var K50 = ['わらやまはなたさかあ', 'をり⌫みひにちしきい', 'んるゆむふぬつすくう', 'ーれ跳めへねてせけえ', '゛ろよもほのとそこお'];
  var NOTE = {
    rom: '用羅馬拼音打，例：わたし = watashi、っ = 重複下一個子音、ん = n 或 nn、長音 ー 按左下角。電腦可以直接用實體鍵盤。',
    k12: '點一下打出あ段，按住往左・上・右・下滑打出い・う・え・お段。濁音、半濁音、小字先打原字再按「゛゜小」。',
    k50: '濁音、半濁音、小字（っ・ゃ）先打原字再按「゛゜小」。片假名會自動轉換。',
    sys: '請切到日文輸入法，在上面的框裡打。標點和空白不用打，打對會自動進下一題。這個模式不記錄打錯的字。',
  };

  function binder(on) {
    var offs = [];
    return {
      on: function (t, type, fn, opt) {
        if (on) on(t, type, fn, opt); else t.addEventListener(type, fn, opt);
        offs.push(function () { t.removeEventListener(type, fn, opt); });
      },
      off: function () { offs.forEach(function (f) { f(); }); offs = []; },
    };
  }

  function create(host, o) {
    o = o || {};
    var kb = { type: o.type || TY.prefs.get('kb') }, live = true, enabled = true, act = null;
    var bind = binder(o.on);
    var acts = (o.actions || []).slice(0, 2);
    var sysHost = o.sysHost || host;
    host.innerHTML = '<div class="kbw"><div class="kb"></div><p class="kbnote"></p></div><div class="kbpop" aria-hidden="true"></div>';
    var wrap = host.querySelector('.kbw'), box = host.querySelector('.kb'), note = host.querySelector('.kbnote'), pop = host.querySelector('.kbpop');
    var sysBox = doc.createElement('div');
    sysBox.className = 'kbsys'; sysBox.hidden = true;
    sysBox.innerHTML = '<input type="text" lang="ja" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next" placeholder="用日文輸入法在這裡打" aria-label="日文輸入">';
    sysHost.appendChild(sysBox);
    var sysin = sysBox.querySelector('input');

    function call(fn) { if (!live || !enabled || !fn) return; fn.apply(null, Array.prototype.slice.call(arguments, 1)); }
    // narrow＝窄的格子（十二鍵左欄、五十音一格）：有 a.short 就用短的字（例：「跳過這題」→「跳過」）
    function actKey(a, cls, narrow) { return a ? '<button type="button" class="key fn' + (cls || '') + '" data-a="act" data-id="' + esc(a.id) + '"' + (narrow && a.short ? ' aria-label="' + esc(a.label) + '"' : '') + '>' + esc(narrow && a.short || a.label) + '</button>' : '<span class="key fn blank' + (cls || '') + '"></span>'; }
    function fk(i) { var c = F12[i]; return '<button type="button" class="key" data-f="' + c[1] + '">' + c[0] + '<small>' + c[1].slice(1).replace(/　/g, '') + '</small></button>'; }

    function build() {
      var t = kb.type, h = '';
      box.className = 'kb ' + (t === 'sys' ? 'rom' : t);
      box.hidden = t === 'sys' && !acts.length; sysBox.hidden = t !== 'sys';
      wrap.classList.toggle('sysmode', t === 'sys');
      if (t === 'rom') {
        var row = function (s) { return s.split('').map(function (c) { return '<button type="button" class="key" data-r="' + c + '">' + c + '</button>'; }).join(''); };
        h = '<div class="row">' + row('qwertyuiop') + '</div><div class="row r2">' + row('asdfghjkl') + '</div>' +
          '<div class="row"><button type="button" class="key fn w" data-r="-" aria-label="長音">ー</button>' + row('zxcvbnm') +
          '<button type="button" class="key fn w" data-a="del" aria-label="刪除">⌫</button></div>' +
          (acts.length ? '<div class="row r4">' + acts.map(function (a) { return actKey(a); }).join('') + '</div>' : '');
      } else if (t === 'k12') {
        h = actKey(acts[0], ' tall', true) + fk(0) + fk(1) + fk(2) + '<button type="button" class="key fn tall" data-a="del" aria-label="刪除">⌫</button>' +
          fk(3) + fk(4) + fk(5) +
          actKey(acts[1], ' tall', true) + fk(6) + fk(7) + fk(8) + '<button type="button" class="key fn tall" data-c="ー" aria-label="長音">ー</button>' +
          '<button type="button" class="key" data-a="mod" aria-label="濁音、半濁音、小字">゛゜<small>小</small></button>' + fk(9) +
          '<button type="button" class="key fn" data-a="del" aria-label="刪除">⌫</button>';
      } else if (t === 'k50') {
        h = K50.map(function (r) {
          return r.split('').map(function (c) {
            if (c === '⌫') return '<button type="button" class="key fn" data-a="del" aria-label="刪除">⌫</button>';
            if (c === '跳') return acts[0] ? actKey(acts[0], '', true) : '<span class="key blank"></span>';
            if (c === '゛') return '<button type="button" class="key fn" data-a="mod" aria-label="濁音、半濁音、小字">゛゜小</button>';
            return '<button type="button" class="key" data-c="' + c + '">' + c + '</button>';
          }).join('');
        }).join('');
      } else if (acts.length) {   // 系統鍵盤：輸入框另外放；功能鍵排成一排寬鍵（同羅馬拼音最下排）
        h = '<div class="row r4">' + acts.map(function (a) { return actKey(a); }).join('') + '</div>';
      }
      box.innerHTML = h;
      note.textContent = NOTE[t] || '';
      pop.style.display = 'none'; act = null;
    }

    // ── 螢幕鍵盤（pointer：滑動手勢要用 pointer 才拿得到方向）──
    function popShow() {
      var r = act.el.getBoundingClientRect(), w = Math.max(r.width, 48), hh = r.height, f = act.f, order = [null, 2, null, 1, 0, 3, null, 4, null];
      pop.innerHTML = order.map(function (i) { return i === null || !f[i].trim() ? '<span class="e"></span>' : '<span' + (i === act.dir ? ' class="on"' : '') + '>' + f[i] + '</span>'; }).join('');
      pop.style.cssText = 'display:grid;width:' + w * 3 + 'px;left:' + Math.min(Math.max(r.left + r.width / 2 - w * 1.5, 2), root.innerWidth - w * 3 - 2) + 'px;top:' + (r.top - hh) + 'px';
      Array.prototype.forEach.call(pop.children, function (s) { s.style.height = hh + 'px'; });
    }
    box.addEventListener('pointerdown', function (e) {
      var k = e.target.closest('.key'); if (!k || k.classList.contains('blank')) return;
      e.preventDefault();
      if (k.dataset.f) {
        act = { el: k, f: k.dataset.f.split(''), x: e.clientX, y: e.clientY, dir: 0, id: e.pointerId };
        try { k.setPointerCapture(e.pointerId); } catch (_) { /* 略過 */ }
        k.classList.add('down'); popShow(); return;
      }
      k.classList.add('down'); setTimeout(function () { k.classList.remove('down'); }, 110);
      if (k.dataset.r) call(o.onRoman, k.dataset.r);
      else if (k.dataset.c) call(o.onKana, k.dataset.c);
      else if (k.dataset.a === 'del') call(o.onDel);
      else if (k.dataset.a === 'mod') call(o.onMod);
      else if (k.dataset.a === 'act') { if (live && o.onAction) o.onAction(k.dataset.id); }   // 功能鍵在暫停時也可以按
    });
    box.addEventListener('pointermove', function (e) {
      if (!act || e.pointerId !== act.id) return;
      var dx = e.clientX - act.x, dy = e.clientY - act.y, d = 0;
      if (Math.sqrt(dx * dx + dy * dy) > 16) d = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 3) : (dy < 0 ? 2 : 4);
      if (d !== act.dir) { act.dir = d; popShow(); }
    });
    function flickEnd(e, cancel) {
      if (!act || e.pointerId !== act.id) return;
      var ch = act.f[act.dir]; act.el.classList.remove('down'); pop.style.display = 'none'; act = null;
      if (!cancel && ch && ch.trim()) call(o.onKana, ch);
    }
    box.addEventListener('pointerup', function (e) { flickEnd(e, false); });
    box.addEventListener('pointercancel', function (e) { flickEnd(e, true); });
    box.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // ── 系統鍵盤 ──
    sysin.addEventListener('input', function () { call(o.onSys, sysin.value); });

    // ── 實體鍵盤 ──
    if (o.physical !== false) {
      bind.on(doc, 'keydown', function (e) {
        if (!live || kb.type !== 'rom' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
        var tag = (e.target && e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return;
        if (!host.isConnected) return;
        if (e.key === 'Backspace') { e.preventDefault(); call(o.onDel); return; }
        if (/^[a-zA-Z'\-]$/.test(e.key)) { e.preventDefault(); call(o.onRoman, e.key.toLowerCase()); }
      });
    }

    kb.setType = function (t) {
      if (!TY.KB_TYPES.some(function (x) { return x[0] === t; })) return;
      kb.type = t; build();
    };
    kb.hint = function (h) {
      Array.prototype.forEach.call(box.querySelectorAll('.key.hint'), function (k) { k.classList.remove('hint'); });
      if (!h || kb.type === 'sys') return;
      var el = null;
      if (h.roman && kb.type === 'rom') el = box.querySelector('.key[data-r="' + h.roman + '"]');
      else if (h.mod) el = box.querySelector('.key[data-a="mod"]');
      else if (h.kana) {
        var keys = box.querySelectorAll('.key[data-f],.key[data-c]');
        for (var i = 0; i < keys.length; i++) if ((keys[i].dataset.f || keys[i].dataset.c).indexOf(h.kana) >= 0) { el = keys[i]; break; }
      }
      if (el) el.classList.add('hint');
    };
    kb.sysReset = function () {
      if (kb.type !== 'sys') { sysin.value = ''; return; }
      var had = doc.activeElement === sysin;
      sysin.value = '';
      if (had) { sysin.blur(); setTimeout(function () { if (live && kb.type === 'sys') sysin.focus({ preventScroll: true }); }, 60); }
    };
    kb.focus = function () { if (kb.type === 'sys') { try { sysin.focus({ preventScroll: true }); } catch (_) { sysin.focus(); } } };
    kb.enable = function (b) { enabled = !!b; };
    kb.destroy = function () { live = false; bind.off(); host.innerHTML = ''; if (sysBox.parentNode) sysBox.parentNode.removeChild(sysBox); };
    kb.input = sysin;
    build();
    return kb;
  }

  root.JP_KB = { create: create, NOTE: NOTE };
})(window);
