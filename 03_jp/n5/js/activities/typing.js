/* typing.js — ③打：打字練習
 * 版面照舊版 raw_source/typing-adj-single.html：一進來就是題目，設定全在上方工具列，一個畫面不捲動。
 *   工具列  單字／句子（範圍內兩種都有才列）、練習方式（＋「全部練完」的順序）、平假名標音、按鍵提示、鍵盤、結束
 *           手機寬度：單字／句子、鍵盤改成下拉，練習方式與順序併成一個下拉（兩套元件都建好，用 core.css 的 .wideonly／.narrowonly 依寬度顯示其中一套），
 *           標音、提示的 chip 用短字
 *   計分列  時間（60 秒挑戰是剩餘）、分數、倍率、正確率、進度
 *   題目區  （有上次沒練完的「全部練完」時，最上面一行「接著練」）→ 進度條（只有全部練完：題數可能上百）→ 小單元 → 大字題目 → 中文 → 已打的字 →（系統鍵盤的輸入框）
 *   底部    鍵盤（JP_TYPEBOX／JP_KB）：跳過這題、重新開始在鍵盤上（同舊版），下方一行用法說明
 * 打字的判定、鍵盤、題目顯示、計分倍率都是共用元件（js/core/typer.js、keyboard.js、typebox.js），這裡只管流程。
 *
 * 練習方式（改了＝重新開始；標音、提示、鍵盤可以隨時切換，倍率規則見 docs/決策紀錄.md）：
 *   全部練完   目前範圍每題各一次，照小單元順序或隨機；可以按「結束」看成績，下次「接著練剩下的」
 *   隨機 20 題 範圍不足 20 就全部。句子：小單元數 ≥ 20 時每個小單元抽 1 句（舊版「每課抽 1 句」），否則全部洗牌取 20
 *   60 秒挑戰  從範圍亂數出題，第一次按鍵開始倒數，時間到結束
 * 第一次進來（沒有記住的設定）：有句子就打句子、隨機 20 題。計時都從第一次按鍵開始。
 * 跳過：鍵盤上的「跳過這題」或 Esc。跳過的題不算分、這一輪不再出現，成績與 CSV 標「跳過」。 */
(function () {
  'use strict';
  var U = JP_UTIL, UI = JP_UI, T = JP_TEXT, TY = JP_TYPE, esc = U.esc;

  // 玩法自己的樣式（class 都加 ty- 前綴）；題目、計分、鍵盤區用 core.css 既有的 .tag .big .zh .hud .kbwrap
  UI.css('typing', [
    '.ty{display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;text-align:center}',
    '.ty-q{display:flex;flex-direction:column;align-items:center;gap:10px;max-width:100%;width:100%}',
    '.ty-typed{font-size:clamp(24px,6vw,36px)}',   // 舊版 .typed
    '.ty-sys{width:100%}.ty-sys:has(>.kbsys[hidden]){display:none}',   // 不是系統鍵盤時不佔位置
    '.ty-res{margin:0;color:var(--muted);font-size:14px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px 8px}',
    '.ty-res .chip{padding:3px 10px}',
    '.ty-bar{width:min(240px,60%);height:4px;border-radius:99px;background:var(--line);overflow:hidden}',
    '.ty-bar i{display:block;height:100%;width:0;background:var(--ok);transition:width .2s}',
    '.jpplay>.stage.mid>.act-typing{margin-block:auto}',   // 題目太高時從上面開始排、往下捲（置中會把上面切掉）
    '@media (max-width:560px){.ty,.ty-q{gap:5px}.ty-typed{font-size:20px}}',   // 手機：已打的字小一點，16 個假名排得進一行
    /* 成績畫面的錯題列（JP_UI.result 的 .review 裡） */
    '.review .r{color:var(--muted);font-size:14px}',
    '.review .mine{font-size:14px;color:var(--bad);overflow-wrap:anywhere}',
    '.review .u{font-size:13px;color:var(--muted)}',
    '.review .sk{display:inline-block;font-size:13px;font-weight:700;border-radius:99px;padding:0 8px;background:var(--soft);color:var(--muted);margin-left:6px}',
  ].join('\n'));

  var MODES = { all: '全部練完', r20: '隨機 20 題', t60: '60 秒挑戰' };
  var KIND = { words: '單字', sentences: '句子' };
  var ORDER = { unit: '照小單元順序', rand: '隨機順序' };
  var LOCK_MS = 420;   // 打完一題後停一下（顯示綠色）再換題（同舊版）
  var ACTIONS = [{ id: 'skip', label: '跳過這題', short: '跳過' }, { id: 'restart', label: '重新開始', short: '重來' }];

  JP_APP.register({
    id: 'typing', step: 3, stepName: '打', short: '打字', title: '打字練習', desc: '打出單字、句子的讀音',
    needs: 'any',
    mount: function (el, ctx) {
      var st = ctx.store;
      var hasW = ctx.count.words > 0, hasS = ctx.count.sentences > 0;
      var set = { kind: st.get('kind', hasS ? 'sentences' : 'words'), mode: st.get('mode', 'r20'), order: st.get('order', 'unit') };
      if (set.kind === 'words' && !hasW) set.kind = 'sentences';
      if (set.kind === 'sentences' && !hasS) set.kind = 'words';
      if (!MODES[set.mode]) set.mode = 'r20';
      if (set.order !== 'rand') set.order = 'unit';
      function save() { ['kind', 'mode', 'order'].forEach(function (k) { st.set(k, set[k]); }); }

      var run = null, tb = null;
      var unitIds = ctx.units.map(function (u) { return u.id; });
      function scopeKey(kind) { return ctx.pack.id + ':' + unitIds.join(',') + ':' + kind; }
      function itemsOf(kind) { return ctx.items[kind]; }
      function blur(x) { if (x && x.blur) x.blur(); }   // 按完不留焦點：接著打實體鍵盤時，空白鍵才不會再按到它

      // ── 接著練（全部練完中途結束時記下剩下的題目：目前範圍裡的第幾題）──
      function getResume(kind) {
        var r = st.get('resume', null);
        return r && r.key === scopeKey(kind) && Array.isArray(r.ids) && r.ids.length ? r : null;
      }
      function setResume(kind, list) {
        var all = itemsOf(kind), ids = [];
        list.forEach(function (it) { var i = all.indexOf(it); if (i >= 0) ids.push(i); });
        st.set('resume', ids.length ? { key: scopeKey(kind), ids: ids, order: set.order } : null);
      }

      // ════════ 工具列（骨架的「← 選單」「範圍」後面）════════
      function modeVal() { return set.mode === 'all' ? 'all:' + set.order : set.mode; }
      function changeMode(v) {
        var p = String(v).split(':');
        set.mode = p[0]; if (p[1]) set.order = p[1];
        save(); paintTools(); begin();
      }
      var tKind = null, tKindN = null;
      if (hasW && hasS) {
        var KINDS = [['words', '單字'], ['sentences', '句子']];
        var onKind = function (v, b) { blur(b); set.kind = v; save(); paintTools(); begin(); };
        tKind = ctx.tool.seg(KINDS, set.kind, onKind, '單字或句子');
        tKindN = ctx.tool.select(KINDS, set.kind, onKind, '單字或句子');   // 手機寬度：下拉比分段按鈕窄，工具列才排得進兩行
        tKind.classList.add('wideonly'); tKindN.classList.add('narrowonly');
      }
      var tMode = ctx.tool.seg(Object.keys(MODES).map(function (m) { return [m, MODES[m]]; }), set.mode, function (v, b) { blur(b); changeMode(v); }, '練習方式');
      var tOrder = ctx.tool.select(Object.keys(ORDER).map(function (o) { return [o, ORDER[o]]; }), set.order, function (v, s) {
        blur(s); set.order = v; save(); paintTools(); begin();
      }, '全部練完的順序');
      var tModeN = ctx.tool.select([['all:unit', '全部・照順序'], ['all:rand', '全部・隨機'], ['r20', MODES.r20], ['t60', MODES.t60]],
        modeVal(), function (v, s) { blur(s); changeMode(v); }, '練習方式');
      tMode.classList.add('wideonly'); tOrder.classList.add('wideonly'); tModeN.classList.add('narrowonly');
      var tFuri = ctx.tool.chip(['平假名標音', '標音'], TY.prefs.get('furi'), function (on, b) { blur(b); TY.prefs.set('furi', on); });
      var tHint = ctx.tool.chip(['按鍵提示', '提示'], TY.prefs.get('hint'), function (on, b) { blur(b); TY.prefs.set('hint', on); });
      var tKb = ctx.tool.seg(TY.KB_TYPES, TY.prefs.get('kb'), function (v, b) { blur(b); TY.prefs.set('kb', v); }, '鍵盤');
      var tKbN = ctx.tool.select(TY.KB_TYPES, TY.prefs.get('kb'), function (v, s) { blur(s); TY.prefs.set('kb', v); }, '鍵盤');
      tKb.classList.add('wideonly'); tKbN.classList.add('narrowonly');
      ctx.tool.space();
      var tEnd = ctx.tool.button('結束', function (e, b) {
        blur(b);
        if (run && !run.over && (run.t0 || run.log.length)) finish('quit');
      }, '結束這一輪，看成績');
      function paintTools() {
        if (tKind) { tKind.set(set.kind); tKindN.set(set.kind); }
        tMode.set(set.mode); tOrder.set(set.order); tOrder.hidden = set.mode !== 'all'; tModeN.set(modeVal());
        tFuri.set(TY.prefs.get('furi')); tHint.set(TY.prefs.get('hint'));
        tKb.set(TY.prefs.get('kb')); tKbN.set(TY.prefs.get('kb'));
      }
      ctx.on(document, 'jp-typeprefs', function () { paintTools(); hud(); });

      // ════════ 計分列 ════════
      var H = ctx.hud([['time', '時間', '0:00'], ['score', '分數', 0], ['mult', '倍率', ''], ['acc', '正確率', '100%'], ['prog', '進度', '']]);

      // ════════ 出題 ════════
      function sentUnits() {
        var map = {}, order = [];
        ctx.items.sentences.forEach(function (s) { if (!map[s.unit]) { map[s.unit] = []; order.push(s.unit); } map[s.unit].push(s); });
        return order.map(function (u) { return map[u]; });
      }
      function buildQueue(kind, mode, order) {
        var all = itemsOf(kind);
        if (mode === 'all') return order === 'rand' ? U.shuffle(all) : all.slice();
        if (mode === 't60') return U.shuffle(all);
        if (all.length <= 20) return U.shuffle(all);
        if (kind === 'sentences') {
          var groups = sentUnits();
          if (groups.length >= 20) {
            var keep = U.sample(groups.map(function (g, i) { return i; }), 20).sort(function (a, b) { return a - b; });
            return keep.map(function (i) { var g = groups[i]; return g[Math.random() * g.length | 0]; });
          }
        }
        return U.sample(all, 20);
      }

      // ════════ 作答 ════════
      function stopRun() {
        if (tb) { tb.destroy(); tb = null; }
        run = null;
      }
      function startRun(o) {
        stopRun();
        run = {
          opts: o, kind: o.kind, mode: o.mode, order: o.order, label: o.label || '', queue: o.queue.slice(), qi: 0, total: o.mode === 't60' ? 0 : o.queue.length,
          log: [], skipped: [], score: 0, combo: 0, hits: 0, misses: 0, kanaDone: 0, t0: 0, elapsed: 0, over: false, locked: false, it: null,
        };
        ctx.stage.classList.add('mid');
        el.innerHTML = '<div class="ty">' +
          '<p class="ty-res" hidden></p>' +
          (run.mode === 'all' ? '<div class="ty-bar" aria-hidden="true"><i></i></div>' : '') +
          '<div class="ty-q"><div class="tag"></div><div class="big"></div><div class="zh"></div><div class="ty-typed"></div><div class="ty-sys"></div></div>' +
          '</div>';
        ctx.foot.innerHTML = '<div class="kbwrap"><div class="ty-kb"></div></div>';
        H.label('time', run.mode === 't60' ? '剩餘' : '時間');
        paintResume();
        tb = JP_TYPEBOX.create({
          show: el.querySelector('.big'), typed: el.querySelector('.ty-typed'), kb: ctx.foot.querySelector('.ty-kb'), sys: el.querySelector('.ty-sys'),
          shake: el.querySelector('.ty-q'), on: ctx.on, actions: ACTIONS,
          onStart: function () { if (!run.t0) run.t0 = Date.now(); paintResume(); },
          onKey: function (e) {
            if (e.ok) run.hits++;
            else { run.misses++; run.combo = 0; run.score = Math.max(0, run.score - TY.SCORE.miss); }
            hud();
          },
          onDone: done,
          onAction: function (id) { if (id === 'skip') skip(); else if (id === 'restart') restart(); },
          onPrefs: function () { hud(); },
        });
        tb.wait();
        show();
        ctx.top();
        tb.focus();
      }
      // 「接著練」：有上次沒練完的「全部練完」、而且這一輪還沒開始打時，題目上方一行
      function paintResume() {
        var p = el.querySelector('.ty-res'); if (!p || !run) return;
        var res = !run.label && !run.t0 ? getResume(run.kind) : null;
        p.hidden = !res;
        if (res) p.innerHTML = '上次「全部練完」還有 ' + res.ids.length + ' 題沒練 <button type="button" class="chip" data-act="resume" title="接著練剩下的 ' + res.ids.length + ' 題">接著練</button>';
      }
      function show() {
        var it = run.it = run.queue[run.qi];
        el.querySelector('.tag').textContent = (it.unitGroup ? it.unitGroup + '　' : '') + (it.unitName || '');
        el.querySelector('.zh').textContent = it.zh;
        tb.load(it.jp);
        run.locked = false;
        hud();
      }
      function hud() {
        tEnd.disabled = !(run && !run.over && (run.t0 || run.log.length));
        if (!run || !tb) return;
        if (run.t0 && !run.over) run.elapsed = (Date.now() - run.t0) / 1000;
        var sec = run.mode === 't60' ? Math.max(0, 60 - run.elapsed) : run.elapsed;
        H.set('time', U.fmtClock(run.mode === 't60' ? Math.ceil(sec) : sec));
        H.set('score', run.score);
        var r = tb.record();
        H.set('mult', '×' + (r ? r.mult : TY.mult(TY.prefs.get('furi'), TY.prefs.get('hint'))));
        H.set('acc', (run.hits + run.misses ? Math.round(run.hits / (run.hits + run.misses) * 100) : 100) + '%');
        if (run.mode === 't60') H.set('prog', run.log.filter(function (x) { return x.status === '完成'; }).length + ' 題');
        else {
          H.set('prog', Math.min(run.qi + 1, run.total) + '/' + run.total);
          var bar = el.querySelector('.ty-bar i'); if (bar) bar.style.width = (run.qi / run.total * 100) + '%';
        }
      }
      function logItem(status, rec, pts) {
        var it = run.it;
        run.log.push({
          it: it, unit: it.unit, unitName: it.unitName, status: status, ok: status === '完成' && rec.miss === 0,
          sec: rec.sec, miss: rec.miss, wrong: rec.wrong, furi: rec.furi, hint: rec.hint, mult: rec.mult, kb: rec.kb, pts: pts,
        });
      }
      function done(rec) {
        if (!run || run.over) return;
        run.combo = rec.miss === 0 ? run.combo + 1 : 0;
        var pts = TY.points(rec.kana.length, run.combo, rec.mult);
        run.score += pts; run.kanaDone += rec.kana.length;
        logItem('完成', rec, pts);
        run.locked = true; tb.lock(true);
        hud();
        ctx.later(function () { if (run && !run.over) advance(); }, LOCK_MS);
      }
      function skip() {
        if (!run || run.over || run.locked) return;
        if (!run.t0) { run.t0 = Date.now(); paintResume(); }
        run.combo = 0;
        logItem('跳過', tb.record(), 0);
        run.skipped.push(run.it);
        advance();
      }
      function restart() {   // 鍵盤上的「重新開始」：同樣的設定重來（接續、複習就是同一批題目重來）
        if (!run) return;
        if (run.label) startRun(run.opts); else begin();
      }
      function advance() {
        run.qi++;
        if (run.mode === 't60') {
          if (run.qi >= run.queue.length) {   // 出完一輪就再洗一次（跳過的題不再出現）
            var pool = itemsOf(run.kind).filter(function (x) { return run.skipped.indexOf(x) < 0; });
            if (!pool.length) { finish('empty'); return; }
            var last = run.it;
            run.queue = U.shuffle(pool);
            if (run.queue.length > 1 && run.queue[0] === last) run.queue.push(run.queue.shift());
            run.qi = 0;
          }
        } else if (run.qi >= run.queue.length) { finish('all'); return; }
        show();
      }
      ctx.every(function () {
        if (!run || run.over) return;
        hud();
        if (run.mode === 't60' && run.t0 && run.elapsed >= 60) finish('time');
      }, 100);

      // ════════ 成績（舊版的結束畫面：JP_UI.result）════════
      function finish(why) {
        var r = run; if (!r || r.over) return;
        r.over = true;
        if (r.t0) r.elapsed = Math.min(r.mode === 't60' ? 60 : Infinity, (Date.now() - r.t0) / 1000);
        hud();
        var rec = tb.record();
        var unfinished = why === 'quit' || why === 'time';
        if (unfinished && rec && !rec.done && rec.keys) logItem('未完成', rec, 0);   // 有按過鍵的才記
        // 全部練完：中途結束就記下還沒打完的題，下次可以接著練；打完了就清掉
        var rest = [];
        if (r.mode === 'all') {
          rest = r.queue.slice(r.qi + (rec && rec.done ? 1 : 0));
          if (!r.label || r.label === '接續') setResume(r.kind, rest);
        }
        tb.destroy(); tb = null;
        ctx.foot.innerHTML = '';   // 結束畫面不顯示鍵盤（同舊版）
        ctx.stage.classList.remove('mid');

        var doneN = r.log.filter(function (x) { return x.status === '完成'; }).length;
        var skipN = r.log.filter(function (x) { return x.status === '跳過'; }).length;
        var best = null, prev = 0;
        if (r.mode !== 'all' && !r.label) {
          var bk = 'best_' + ctx.pack.id + '_' + r.kind + '_' + r.mode;
          prev = +st.get(bk, 0) || 0; best = Math.max(prev, r.score); st.set(bk, best);
        }
        var stats = [['完成題數', r.mode === 't60' ? doneN + ' 題' : doneN + '／' + r.total + ' 題']];
        if (skipN) stats.push(['跳過', skipN + ' 題（不算分）']);
        if (r.mode === 'all' && rest.length) stats.push(['還沒練', rest.length + ' 題（下次可以接著練）']);
        stats.push(['時間', U.fmtDur(r.elapsed)]);
        stats.push(['正確率', (r.hits + r.misses ? Math.round(r.hits / (r.hits + r.misses) * 100) : 100) + '%']);
        stats.push(['速度', (r.elapsed > 0 ? Math.round(r.kanaDone / r.elapsed * 60) : 0) + ' 字／分']);
        if (best !== null) stats.push(['最高分紀錄', best + (r.score > prev && r.score > 0 ? '（刷新紀錄！）' : '')]);

        var kanaOf = function (x) { return T.reading(x.it.jp); };
        var rows = [['題號', '小單元', '題目', '讀音', '中文', '狀態', '秒數', '打錯次數', '打錯的字(正確→按下)', '平假名標音', '按鍵提示', '倍率', '得分', '鍵盤']];
        var KBN = {}; TY.KB_TYPES.forEach(function (k) { KBN[k[0]] = k[1]; });
        r.log.forEach(function (x, i) {
          rows.push([i + 1, x.unitName, T.surface(x.it.jp), kanaOf(x), x.it.zh, x.status, x.sec.toFixed(1), x.miss, x.wrong.join(' '),
            x.furi ? '開' : '關', x.hint ? '開' : '關', x.mult, x.pts, KBN[x.kb] || x.kb]);
        });
        var bad = r.log.filter(function (x) { return x.status !== '完成' || x.miss > 0; });
        var seen = [];
        var retry = r.log.filter(function (x) { return (x.status === '跳過' || x.miss >= 2) && seen.indexOf(x.it) < 0 && seen.push(x.it); });
        var retryLabel = '只練跳過、打錯 2 次以上的題';
        if (!retry.length) {
          retry = r.log.filter(function (x) { return x.miss > 0 && seen.indexOf(x.it) < 0 && seen.push(x.it); });
          retryLabel = '只練打錯的題';
        }
        var title = why === 'time' ? '時間到！' : why === 'quit' ? '中途結束' : '全部打完了！';
        var sub = KIND[r.kind] + '・' + MODES[r.mode] + (r.mode === 'all' && !r.label ? '（' + ORDER[r.order] + '）' : '') + (r.label ? '（' + r.label + '）' : '') +
          (best !== null && r.score > prev && r.score > 0 ? '　刷新紀錄' : '');
        run = null;
        hud();
        UI.result(el, {
          title: title, sub: sub,
          big: r.score + ' 分',
          stats: stats,
          log: r.log, unitOrder: unitIds, unitTitle: '依小單元（一次就打對的題／練過的題）',
          missTitle: '打錯或跳過的題目（' + bad.length + '）', allOk: '全部一次打對，沒有跳過！',
          misses: bad.map(function (x) {
            return '<div class="u">' + esc(x.unitName) + '</div><div class="j" lang="ja">' + T.html(x.it.jp) + '</div><div class="r">' + esc(kanaOf(x)) + '</div>' +
              '<div class="z">' + esc(x.it.zh) + (x.status !== '完成' ? '<span class="sk">' + esc(x.status) + '</span>' : '') + '</div>' +
              (x.miss ? '<div class="mine">打錯 ' + x.miss + ' 次：' + esc(x.wrong.join('　')) + '</div>' : '');
          }),
          csv: rows, csvName: 'typing', csvNote: '成績 CSV（每題用時、打錯的字）。可下載成檔案，或複製後貼到 Excel、Google 試算表。',
          actions: [
            { id: 'rest', label: '接著練剩下的 ' + rest.length + ' 題', hidden: !rest.length },
            { id: 'retry', label: retryLabel + '（' + retry.length + ' 題）', hidden: !retry.length },
            { id: 'again', label: '再玩一次', primary: true },
          ],
          onAction: function (a) {
            if (a === 'again') { if (r.label) startRun(r.opts); else begin(); }
            else if (a === 'rest') startRun({ kind: r.kind, mode: 'all', order: r.order, queue: rest, label: '接續' });
            else if (a === 'retry') startRun({ kind: r.kind, mode: 'all', order: 'rand', queue: U.shuffle(retry.map(function (x) { return x.it; })), label: '複習' });
          },
        });
        ctx.top();
      }

      // 用工具列目前的設定重新開始
      function begin() {
        var q = buildQueue(set.kind, set.mode, set.order);
        startRun({ kind: set.kind, mode: set.mode, order: set.order, queue: q });
      }
      function resume() {
        var res = getResume(set.kind); if (!res) return;
        var all = itemsOf(set.kind);
        var q = res.ids.map(function (i) { return all[i]; }).filter(Boolean);
        if (!q.length) return;
        startRun({ kind: set.kind, mode: 'all', order: res.order || 'unit', queue: q, label: '接續' });
      }

      el.addEventListener('click', function (e) {
        var a = e.target.closest('[data-act="resume"]');
        if (a) { blur(a); resume(); }
      });
      ctx.on(document, 'keydown', function (e) {   // Esc＝跳過這題
        if (!run || run.over || e.isComposing || e.key !== 'Escape') return;
        e.preventDefault(); skip();
      });

      paintTools();
      begin();
    },
    // 不需要 unmount：鍵盤、計時器、document 上的監聽都是用 ctx.on／ctx.every／ctx.later 掛的，離開時自動清掉
  });
})();
