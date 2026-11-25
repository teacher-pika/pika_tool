/* browse.js — ①看：瀏覽題庫
 * 列出目前範圍的全部單字與句子，依小單元分段。版面照舊版 raw_source/quiz-single.html「查看全部題庫」：
 * 一列一題（左日文、右中文＋讀音），小單元名稱是灰色小標。
 * 工具列：看什麼（都看／只看日文／只看中文，被遮的一邊點一列翻開）、單字／句子、平假名標音、羅馬拼音、字級。
 *
 * 這個檔是「玩法怎麼用骨架」的範本（另見 js/core/UI-說明.md）：
 *   1. 設定從 ctx.store 讀、改了就存
 *   2. 工具列用 ctx.tool.seg／chip／select 放，回呼裡改設定、重畫
 *   3. 題目畫在 el（骨架的 .stage 裡，可捲）；樣式用 core.css 既有的 class，玩法自己的少量樣式放 JP_UI.css */
(function () {
  'use strict';
  var UI = JP_UI, T = JP_TEXT, esc = JP_UTIL.esc;

  // 玩法自己的樣式：只放 core.css 沒有的（清單的列），數值照舊版 quiz 的 .list／.row
  UI.css('browse', [
    '.bw{--bj:24px}',
    '.bw.sz-l{--bj:32px}.bw.sz-xl{--bj:44px}',
    '.bw h3{font-size:14px;color:var(--muted);margin:18px 0 4px;font-weight:500}',
    '.bw h3:first-child{margin-top:4px}',
    '.bw h3 small{font-size:12px;margin-left:6px}',
    '.bw .row{display:grid;grid-template-columns:1fr 1fr;gap:4px 14px;align-items:baseline;border-top:1px solid var(--line);padding:8px 0}',
    '.bw .row.s{grid-template-columns:1fr}',
    '.bw .j{font-family:var(--jp);font-size:var(--bj);font-weight:700;line-height:1.9;overflow-wrap:anywhere}',
    '.bw .m{font-size:calc(var(--bj)*.66)}',
    '.bw .r{color:var(--muted);font-size:max(13px,calc(var(--bj)*.54));display:block}',
    '.bw .pos{color:var(--muted);font-size:12px;margin-left:6px;white-space:nowrap}',
    '.bw.norom .rm{display:none}',
    /* 只看日文／只看中文：被遮的一邊顯示成色塊，點一列翻開 */
    '.bw.hide-zh .row,.bw.hide-jp .row{cursor:pointer}',
    '.bw.hide-zh .row:not(.rv) .m,.bw.hide-jp .row:not(.rv) .j{color:transparent;background:var(--soft);border-radius:8px;user-select:none}',
    '.bw.hide-zh .row:not(.rv) .m *,.bw.hide-jp .row:not(.rv) .j *{color:transparent!important;border-color:transparent!important}',
    '.bw.hide-jp .row:not(.rv) .r{visibility:hidden}',
  ].join('\n'));

  var SHOW = [['both', '都看'], ['jp', '只看日文'], ['zh', '只看中文']];
  var KIND = [['all', '單字＋句子'], ['words', '只有單字'], ['sentences', '只有句子']];
  var SIZE = [['m', '字：中'], ['l', '字：大'], ['xl', '字：特大']];

  JP_APP.register({
    id: 'browse', step: 1, stepName: '看', short: '瀏覽', title: '瀏覽題庫', desc: '先看過單字、句子',
    needs: 'any',
    mount: function (el, ctx) {
      var st = ctx.store;
      var hasW = ctx.count.words > 0, hasS = ctx.count.sentences > 0;
      var opt = {
        show: st.get('show', 'both'), kind: st.get('kind', 'all'),
        furi: st.get('furi', true), rom: st.get('rom', false), size: st.get('size', 'm'),
      };
      if (!(hasW && hasS)) opt.kind = 'all';
      function save(k, v) { opt[k] = v; st.set(k, v); paint(); }

      // ── 工具列（骨架已經放好「← 選單」和「範圍」，這裡接在後面）──
      ctx.tool.seg(SHOW, opt.show, function (v) {
        Array.prototype.forEach.call(el.querySelectorAll('.row.rv'), function (r) { r.classList.remove('rv'); });
        save('show', v);
      }, '看什麼');
      if (hasW && hasS) ctx.tool.select(KIND, opt.kind, function (v) { save('kind', v); }, '單字或句子');   // 次要的設定用下拉，手機上工具列才不會太高
      ctx.tool.chip(['平假名標音', '標音'], opt.furi, function (on) { save('furi', on); });   // 手機寬度顯示短字
      ctx.tool.chip('羅馬拼音', opt.rom, function (on) { save('rom', on); });
      ctx.tool.select(SIZE, opt.size, function (v) { save('size', v); }, '字級');

      // ── 題目區：一次畫好（747 字也只是一段字串）；之後的切換只改 class，不重畫 ──
      var byUnit = {};
      ['words', 'sentences'].forEach(function (k) {
        ctx.items[k].forEach(function (it) { (byUnit[it.unit] = byUnit[it.unit] || { words: [], sentences: [] })[k].push(it); });
      });
      var multiGroup = ctx.units.some(function (u) { return (u.group || '') !== (ctx.units[0].group || ''); });
      var h = '';
      ctx.units.forEach(function (u) {
        var g = byUnit[u.id]; if (!g) return;
        var head = (multiGroup && u.group ? esc(u.group) + '・' : '') + esc(u.name);
        if (g.words.length) {
          h += '<div class="kw"><h3>' + head + '<small>' + g.words.length + ' 個單字</small></h3>' + g.words.map(function (w) {
            return '<div class="row"><div class="j" lang="ja">' + T.html(w.jp) + '</div><div class="m">' + esc(w.zh) +
              (w.pos ? '<span class="pos">' + esc(w.pos) + '</span>' : '') +
              '<span class="r"><span lang="ja">' + esc(T.reading(w.jp)) + '</span><span class="rm">　' + esc(T.romajiWord(w.jp)) + '</span></span></div></div>';
          }).join('') + '</div>';
        }
        if (g.sentences.length) {
          h += '<div class="ks"><h3>' + head + '<small>' + g.sentences.length + ' 個句子</small></h3>' + g.sentences.map(function (s) {
            return '<div class="row s"><div class="j" lang="ja">' + T.html(s.jp) + '</div><div class="m">' + esc(s.zh) +
              '<span class="r rm">' + esc(T.romajiLine(s.jp)) + '</span></div></div>';
          }).join('') + '</div>';
        }
      });
      el.innerHTML = '<div class="inner"><p class="count"></p><div class="bw">' + h + '</div></div>';
      var box = el.querySelector('.bw'), count = el.querySelector('.count');

      function paint() {
        box.className = 'bw sz-' + opt.size + (opt.furi ? '' : ' nofuri') + (opt.rom ? '' : ' norom') +
          (opt.show === 'jp' ? ' hide-zh' : opt.show === 'zh' ? ' hide-jp' : '');
        Array.prototype.forEach.call(box.querySelectorAll('.kw'), function (x) { x.hidden = opt.kind === 'sentences'; });
        Array.prototype.forEach.call(box.querySelectorAll('.ks'), function (x) { x.hidden = opt.kind === 'words'; });
        var w = opt.kind === 'sentences' ? 0 : ctx.count.words, s = opt.kind === 'words' ? 0 : ctx.count.sentences;
        count.textContent = '共 ' + [w ? w + ' 個單字' : '', s ? s + ' 個句子' : ''].filter(Boolean).join('、') +
          (opt.show === 'both' ? '' : '　（點一列可以翻開被遮住的部分）');
      }
      paint();

      // 只看日文／只看中文時，點一列翻開
      el.addEventListener('click', function (e) {
        var r = e.target.closest('.row');
        if (r && opt.show !== 'both') r.classList.toggle('rv');
      });
    },
  });
})();
