/* ui.js — 共用畫面元件（window.JP_UI）
 * ============================================================================
 * 需要先載入 util.js；樣式在 js/core/core.css（舊版 typing 那一套）。用法整理見 js/core/UI-說明.md。
 *
 *   JP_UI.css(id, text)            插入一段 <style>（同一個 id 只插一次）。玩法自己的樣式用這個放在玩法檔裡。
 *   JP_UI.toast(text)              畫面下方短暫提示
 *
 * ── 工具列元件（回傳元素；輸出舊版的 HTML 結構與 class）──
 *   玩法裡請用 ctx.tool.xxx(…)：參數相同，會自動放進工具列（ctx.bar）。這裡的版本只建立元素，不放進任何地方。
 *   JP_UI.tool.seg(items, cur, fn, label)   分段按鈕 <div class="seg"><button aria-pressed>…
 *       items = [[值, 文字], …]，第三格 true＝停用；fn(值, 按鈕)；label＝給螢幕報讀的名稱（選填）
 *       el.value 目前的值；el.set(值) 改選取（不呼叫 fn）
 *   JP_UI.tool.chip(text, on, fn)          開關 <button class="chip" aria-pressed>；fn(新的 on)；el.on；el.set(bool)
 *   JP_UI.tool.select(items, cur, fn, label)  原生下拉 <select class="sel">；fn(值)
 *       items = [[值, 文字], …]；要分層就放 { group:'標題', items:[[值, 文字], …] }
 *   JP_UI.tool.button(text, fn, title)     一般按鈕（chip 樣式，不會亮起）
 *   JP_UI.tool.space()                     把後面的東西推到工具列右邊 <span class="sp">
 *   chip、button 的 text 可以給 [完整文字, 手機用短字]：寬度 ≤ 560px 時顯示短字（報讀一律用完整文字）
 *   手機與電腦用不同元件時：元素加 class 'wideonly'／'narrowonly'（core.css），兩套都建好、依寬度顯示其一
 *
 * ── 計分列 ──
 *   var h = JP_UI.hud(host, [[key, 標籤, 初值], …], opts)   在 host 裡畫舊版的 .hud；h.set(key, 值)、h.label(key, 標籤)、h.el
 *     opts.width  選填，最大寬度（px，預設 760＝core.css）。測驗用 640，和選項區對齊（同舊版 quiz）
 *     玩法裡請用 ctx.hud(…)（畫在骨架的計分列位置）
 *
 *   JP_UI.copyText(text) → Promise<boolean>   複製到剪貼簿（file:// 也盡量成功；失敗回 false）
 *   JP_UI.download(name, text)     下載文字檔（CSV 加 BOM，Excel 才不會亂碼）；不能下載時回 false
 *
 *   JP_UI.result(el, opts)         結束畫面（舊版 typing／quiz 的樣子：置中一張窄卡）。把 el 的內容換掉；
 *                                  el 通常就是 mount 拿到的 el（骨架的 .stage 裡），畫完會自動捲回最上面。
 *     opts.title      '選擇測驗　完成！'
 *     opts.sub        選填，標題下的一行灰字（例：範圍、模式）
 *     opts.big        選填，大字，例如 '8 / 10'
 *     opts.stats      [[標籤, 值], …]  例：[['正確率','80%'],['時間','1 分 5 秒']]
 *     opts.log        [{ unit, unitName, ok }]   有兩個以上小單元時，自動做「依小單元」統計
 *     opts.unitOrder  選填，小單元 id 陣列（統計依這個順序；通常傳 ctx.units 的 id）
 *     opts.unitTitle  選填，統計標題（預設「依小單元」）；ok 代表什麼由玩法決定，請寫在標題裡
 *     opts.missTitle  錯題清單標題（預設「答錯的題目，再看一次」）
 *     opts.misses     [HTML, …]  錯題清單每一列（可用 <div class="j">日文</div><div class="z">中文</div>）；
 *                     空陣列就顯示 opts.allOk（預設「全部答對！」）；不傳（undefined）就整段不顯示
 *     opts.csv        [[欄位…], [值…], …]（選填，第一列是標題）；opts.csvName 檔名開頭；opts.csvNote 說明文字
 *     opts.actions    [{ id, label, primary?, hidden? }]；opts.onAction(id)
 *                     放在最下面（同舊版）：primary 是藍底大按鈕，其他是藍框
 * ============================================================================ */
(function (root) {
  'use strict';
  var U = root.JP_UTIL, esc = U.esc, doc = root.document;

  function css(id, text) {
    if (doc.getElementById('css_' + id)) return;
    var s = doc.createElement('style'); s.id = 'css_' + id; s.textContent = text;
    doc.head.appendChild(s);
  }

  var toastEl = null, toastT = 0;
  function toast(text) {
    if (!toastEl) {
      toastEl = doc.getElementById('toast');
      if (!toastEl) { toastEl = doc.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); doc.body.appendChild(toastEl); }
    }
    toastEl.textContent = text; toastEl.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.hidden = true; }, 2200);
  }

  // ── 工具列元件（元素版）──
  function el(tag, cls, html) { var e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  // 按鈕文字：[完整, 短字] → 依寬度顯示其一（core.css 的 .wideonly／.narrowonly）
  function setText(b, text) {
    if (!Array.isArray(text)) { b.textContent = text; return; }
    b.innerHTML = '<span class="wideonly">' + esc(text[0]) + '</span><span class="narrowonly" aria-hidden="true">' + esc(text[1]) + '</span>';
  }
  var tool = {
    seg: function (items, cur, fn, label) {
      var box = el('div', 'seg'); box.setAttribute('role', 'group'); if (label) box.setAttribute('aria-label', label);
      box.innerHTML = items.map(function (it) {
        return '<button type="button" data-v="' + esc(it[0]) + '" aria-pressed="' + (String(it[0]) === String(cur)) + '"' + (it[2] ? ' disabled' : '') + '>' + esc(it[1]) + '</button>';
      }).join('');
      box.value = cur;
      box.set = function (v) {
        box.value = v;
        Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.dataset.v === String(v)); });
      };
      box.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-v]'); if (!b || b.disabled) return;
        var v = b.dataset.v;
        for (var i = 0; i < items.length; i++) if (String(items[i][0]) === v) { v = items[i][0]; break; }   // 還原成原本的型別
        if (v === box.value) return;
        box.set(v); if (fn) fn(v, b);
      });
      return box;
    },
    chip: function (text, on, fn) {
      var b = el('button', 'chip'); b.type = 'button'; setText(b, text);
      b.on = !!on; b.setAttribute('aria-pressed', b.on);
      b.set = function (v) { b.on = !!v; b.setAttribute('aria-pressed', b.on); };
      b.addEventListener('click', function () { b.set(!b.on); if (fn) fn(b.on, b); });
      return b;
    },
    select: function (items, cur, fn, label) {
      var s = el('select', 'sel'); if (label) s.setAttribute('aria-label', label);
      var opt = function (it) { return '<option value="' + esc(it[0]) + '"' + (it[2] ? ' disabled' : '') + '>' + esc(it[1]) + '</option>'; };
      s.innerHTML = items.map(function (it) {
        return it && it.group ? '<optgroup label="' + esc(it.group) + '">' + it.items.map(opt).join('') + '</optgroup>' : opt(it);
      }).join('');
      s.value = cur;
      s.set = function (v) { s.value = v; };
      s.addEventListener('change', function () { if (fn) fn(s.value, s); });
      return s;
    },
    button: function (text, fn, title) {
      var b = el('button', 'chip'); b.type = 'button'; setText(b, text); if (title) b.title = title;
      if (fn) b.addEventListener('click', function (e) { fn(e, b); });
      return b;
    },
    space: function () { return el('span', 'sp'); },
  };

  function hud(host, fields, opts) {
    var box = el('div', 'hud'), map = {};
    if (opts && opts.width) box.style.maxWidth = opts.width + 'px';
    box.innerHTML = fields.map(function (f) {
      return '<div><small>' + esc(f[1]) + '</small><b data-k="' + esc(f[0]) + '">' + esc(f[2] == null ? '' : f[2]) + '</b></div>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('b[data-k]'), function (b) { map[b.dataset.k] = b; });
    if (host) { host.innerHTML = ''; host.appendChild(box); }
    return {
      el: box,
      set: function (k, v) { if (map[k] && map[k].textContent !== String(v)) map[k].textContent = v; },
      label: function (k, t) { if (map[k]) map[k].previousSibling.textContent = t; },
    };
  }

  function copyText(text) {
    function legacy() {
      var t = doc.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      doc.body.appendChild(t); t.select(); var ok = false; try { ok = doc.execCommand('copy'); } catch (e) { /* 不支援 */ }
      doc.body.removeChild(t); return ok;
    }
    try {
      if (root.navigator.clipboard && root.navigator.clipboard.writeText)
        return root.navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacy(); });
    } catch (e) { /* 改用舊方法 */ }
    return Promise.resolve(legacy());
  }

  function download(name, text) {
    try {
      var url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
      var a = doc.createElement('a'); a.href = url; a.download = name; doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      return true;
    } catch (e) { return false; }
  }

  function stamp() {
    var d = new Date(), p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }

  function unitTable(log, units, title) {
    var order = [], map = {};
    log.forEach(function (r) {
      if (!map[r.unit]) { map[r.unit] = { name: r.unitName || r.unit, n: 0, ok: 0 }; order.push(r.unit); }
      map[r.unit].n++; if (r.ok) map[r.unit].ok++;
    });
    if (order.length < 2) return '';
    if (units) order.sort(function (a, b) { return units.indexOf(a) - units.indexOf(b); });
    return '<h3>' + esc(title || '依小單元') + '</h3><div class="utab">' + order.map(function (id) {
      var u = map[id], pct = Math.round(u.ok / u.n * 100);
      return '<div class="urow"><span class="un">' + esc(u.name) + '</span><span class="ub"><i style="width:' + pct + '%"></i></span>' +
        '<span class="uv">' + u.ok + '／' + u.n + '</span></div>';
    }).join('') + '</div>';
  }

  // 結束畫面：版面照舊版 typing／quiz（標題 → 數字 → 統計 → 錯題 → CSV → 按鈕）
  function result(host, o) {
    var csvText = o.csv ? U.csv(o.csv) : '';
    var acts = (o.actions || []).filter(function (a) { return !a.hidden; });
    // 舊版：次要按鈕（藍框）在前、主要按鈕（藍底）在最後
    acts = acts.filter(function (a) { return !a.primary; }).concat(acts.filter(function (a) { return a.primary; }));
    var h = '<div class="result" role="region" aria-label="' + esc(o.title || '完成！') + '">' +
      '<h2>' + esc(o.title || '完成！') + '</h2>' +
      (o.sub ? '<p class="rsub">' + esc(o.sub) + '</p>' : '') +
      (o.big ? '<div class="rbig">' + esc(o.big) + '</div>' : '') +
      (o.stats && o.stats.length ? '<dl>' + o.stats.map(function (s) { return '<dt>' + esc(s[0]) + '</dt><dd>' + esc(s[1]) + '</dd>'; }).join('') + '</dl>' : '') +
      unitTable(o.log || [], o.unitOrder, o.unitTitle) +
      (o.misses ? '<h3>' + esc(o.missTitle || '答錯的題目，再看一次') + '</h3>' +
        (o.misses.length ? '<ul class="review">' + o.misses.map(function (m) { return '<li>' + m + '</li>'; }).join('') + '</ul>' : '<p class="allok">' + esc(o.allOk || '全部答對！') + '</p>') : '') +
      (csvText ? '<p class="csvh">' + esc(o.csvNote || '成績 CSV。可下載成檔案，或複製後貼到試算表。') + '</p>' +
        '<textarea class="csv" readonly aria-label="成績 CSV"></textarea>' +
        '<button type="button" class="go alt" data-csv="dl">下載 CSV 檔</button><button type="button" class="go alt" data-csv="copy">複製 CSV</button>' : '') +
      acts.map(function (a) {
        return '<button type="button" class="go' + (a.primary ? '' : ' alt') + '" data-act="' + esc(a.id) + '">' + esc(a.label) + '</button>';
      }).join('') +
      '</div>';
    host.innerHTML = h;
    var ta = host.querySelector('.csv'); if (ta) ta.value = csvText;
    var sc = host.closest ? host.closest('.stage') : null; if (sc) sc.scrollTop = 0;
    host.querySelector('.result').addEventListener('click', function (e) {   // 掛在 .result 上：host 換成別的畫面後就不會再觸發
      var a = e.target.closest('[data-act]');
      if (a && o.onAction) { o.onAction(a.dataset.act); return; }
      var c = e.target.closest('[data-csv]'); if (!c) return;
      if (c.dataset.csv === 'copy') copyText(csvText).then(function (ok) { c.textContent = ok ? '已複製' : '請手動全選複製'; if (!ok) { ta.focus(); ta.select(); } });
      else if (!download((o.csvName || 'result') + '_' + stamp() + '.csv', csvText)) c.textContent = '這裡無法下載，請用複製';
    });
  }

  root.JP_UI = { css: css, toast: toast, tool: tool, hud: hud, copyText: copyText, download: download, result: result };
})(window);
