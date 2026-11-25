/* quiz.js — ②認：選擇測驗
 * 重做舊版 raw_source/quiz-single.html 的 5 種題型：
 *   單字：中→日（四選一）／日→讀音・中文（讀音、中文各選一次，都對才算對；題目全是平假名就只選中文）
 *   句子：選意思／填文法（挖掉 * 的文法段）／排順序（點詞排句）
 * 版面照舊版：一進來就是題目；設定全在上方工具列（單字／句子下拉、題型分段按鈕、讀音平假名／羅馬拼音、平假名標音、題數），
 *   改任何設定＝用新設定重新出題（標音開關例外：只切換顯示）。
 *   手機寬度：單字／句子、題型、讀音併成一個下拉（兩套元件都建好，用 core.css 的 .wideonly／.narrowonly 依寬度顯示其一，同 ③打）。
 *   計分列寬度 640，和選項區對齊（同舊版）。
 *   計分列（題數／答對／連續答對／時間）→ 大字題目 → 選項（2×2）→ 答完顯示完整字卡與「下一題」。
 *   時間從第一次作答才開始算（同舊版）。
 * 結束：JP_UI.result（答對、正確率、時間、依小單元、錯題含正確答案、CSV、只練錯題、再來一次）。工具列「結束」可中途看成績。
 * 干擾選項：先從目前範圍挑，不夠再從同課程其他小單元補；依表面文字去重；遵守課程 avoid；中文意思相同的不同題。
 * 鍵盤：1〜4 選選項（日→讀音・中文 先選讀音再選中文），Enter／空白鍵 下一題。 */
(function () {
  'use strict';
  var U = JP_UTIL, UI = JP_UI, T = JP_TEXT, esc = U.esc;

  // 玩法自己的樣式：數值照舊版 quiz-single.html 的 .glabel／.opts／.opt／.line／.pool／.tile／.card；其餘用 core.css
  UI.css('quiz', [
    '.qz-q{text-align:center;padding-bottom:16px}',
    '.qz-q .go{width:100%}',
    '.qz-glabel{font-size:13px;color:var(--muted);text-align:left;margin:4px 0 -6px}',
    '.qz-opts{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.qz-opts.one{grid-template-columns:1fr}',
    '.qz-opt{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 10px;min-height:58px;font-size:18px;line-height:1.3;overflow-wrap:anywhere}',
    '.qz-opt.jp{font-family:var(--jp);font-size:24px;line-height:1.7}',
    '.qz-opt.rom{font-size:19px;letter-spacing:.02em}',
    '.qz-opt:disabled{cursor:default;opacity:.55}',
    '.qz-opt.right{background:var(--okbg);border-color:var(--ok);color:var(--ok);opacity:1;font-weight:700}',
    '.qz-opt.wrong{background:var(--badbg);border-color:var(--bad);color:var(--bad);opacity:1}',
    '.qz-line{min-height:64px;border:2px dashed var(--line);border-radius:12px;padding:8px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;align-items:center}',
    '.qz-line.right{border-style:solid;border-color:var(--ok);background:var(--okbg)}',
    '.qz-line.wrong{border-style:solid;border-color:var(--bad);background:var(--badbg)}',
    '.qz-pool{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;min-height:52px}',
    '.qz-tile{font-family:var(--jp);font-size:22px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 12px;line-height:1.6}',
    '.qz-tile:disabled{cursor:default}',
    '.qz-card{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--ok);border-radius:12px;padding:12px 14px;text-align:left}',
    '.qz-card.miss{border-left-color:var(--bad)}',
    '.qz-card .v{font-weight:700;color:var(--ok);font-size:15px}',
    '.qz-card.miss .v{color:var(--bad)}',
    '.qz-card .j{font-family:var(--jp);font-size:26px;line-height:1.9;font-weight:700}',
    '.qz-card .r{color:var(--muted);font-size:15px}',
    '.qz-card .z{font-size:17px}',
    '.qz-next{margin-top:12px}',
    '.review .qz-mine{color:var(--bad);font-size:14px}',
  ].join('\n'));

  var TYPES = {
    w_zh: { kind: 'words', name: '中→日', long: '單字 中→日' },
    w_jp: { kind: 'words', name: '日→讀音・中文', long: '單字 日→讀音・中文' },
    s_mean: { kind: 'sentences', name: '選意思', long: '句子 選意思' },
    s_fill: { kind: 'sentences', name: '填文法', long: '句子 填文法' },
    s_order: { kind: 'sentences', name: '排順序', long: '句子 排順序' },
  };
  var TYPE_IDS = Object.keys(TYPES);
  var KINDS = [['words', '單字測驗'], ['sentences', '句子測驗']];

  // ── 題目的小工具 ──
  var surf = function (x) { return T.surface(x.jp); };
  var kanaOf = function (x) { return T.reading(x.jp); };
  var words = function (x) { return T.parse(x.jp).filter(function (s) { return !s.punct; }); };
  var pureNumber = function (x) { return words(x).every(T.hasDigit); };     // 純數字的句子（第 19 課）
  function fillable(x) {
    var out = [];
    T.parse(x.jp).forEach(function (s, i) { if (s.g && !s.punct && !T.hasDigit(s)) out.push(i); });
    return out;
  }
  var romOf = function (x, type) { return TYPES[type].kind === 'sentences' ? T.romajiLine(x.jp) : T.romajiWord(x.jp); };
  var zhKey = function (z) { return String(z).replace(/[\s。．.！!？?，,、]/g, ''); };

  function eligible(type, items) {
    if (type === 'w_zh' || type === 'w_jp') return items.words;
    var s = items.sentences;
    if (type === 's_mean') return s.filter(function (x) { return !pureNumber(x); });
    if (type === 's_fill') return s.filter(function (x) { return fillable(x).length > 0; });
    return s.filter(function (x) { return !pureNumber(x) && words(x).length >= 3; });
  }

  JP_APP.register({
    id: 'quiz', step: 2, stepName: '認', short: '測驗', title: '選擇測驗', desc: '猜單字、猜句子的意思',
    needs: 'any',
    // 範圍裡只有純數字的句子（例如只勾第 19 課）時，五種題型都出不了題：首頁按鈕變淡
    usable: function (items) { return TYPE_IDS.some(function (t) { return eligible(t, items).length > 0; }); },
    mount: function (el, ctx) {
      var st = ctx.store, avoid = ctx.avoid;

      // ════════ 設定（上次記住的；第一次用預設）════════
      var okTypes = TYPE_IDS.filter(function (t) { return eligible(t, ctx.items).length > 0; });
      var kinds = KINDS.filter(function (k) { return okTypes.some(function (t) { return TYPES[t].kind === k[0]; }); });
      if (!kinds.length) { el.innerHTML = '<p class="msg">目前範圍沒有可以出的題目，請換個範圍。</p>'; return; }
      var typesOf = function (kind) { return okTypes.filter(function (t) { return TYPES[t].kind === kind; }); };
      var set = {
        kind: st.get('kind', kinds[0][0]),
        read: st.get('read', 'kana'),      // 讀音選項：kana＝平假名（預設）、rom＝羅馬拼音
        furi: st.get('furi', true),
        n: st.get('n', '10'),
      };
      if (!kinds.some(function (k) { return k[0] === set.kind; })) set.kind = kinds[0][0];
      // 題型：每種（單字／句子）各記一個，切回來時還是上次選的（同舊版）
      set.type = st.get('type_' + set.kind, st.get('type', ''));
      if (typesOf(set.kind).indexOf(set.type) < 0) set.type = typesOf(set.kind)[0];
      var N = eligible(set.type, ctx.items).length;
      function nChoices() {
        var a = [];
        if (N > 10) a.push(['10', '10 題']);
        if (N > 20) a.push(['20', '20 題']);
        a.push(['all', N > 10 ? '全部' : '全部 ' + N + ' 題']);   // 題數已顯示在計分列，選項短一點，手機工具列才不會太寬
        return a;
      }
      if (!nChoices().some(function (c) { return c[0] === set.n; })) set.n = N > 10 ? '10' : 'all';
      function saveAll() { st.set('kind', set.kind); st.set('type', set.type); st.set('type_' + set.kind, set.type); st.set('read', set.read); st.set('n', set.n); }
      saveAll();
      // 改設定＝用新設定重新開始
      function change(k, v) {
        set[k] = v;
        if (k === 'kind') set.type = st.get('type_' + v, typesOf(v)[0]);   // 換單字／句子：用那一邊上次的題型
        saveAll(); ctx.restart();
      }

      // ════════ 工具列（順序照舊版：主項目下拉、題型、讀音、標音；新版多的題數用下拉）════════
      if (kinds.length > 1) ctx.tool.select(kinds, set.kind, function (v) { change('kind', v); }, '單字或句子').classList.add('wideonly');
      ctx.tool.seg(typesOf(set.kind).map(function (t) { return [t, TYPES[t].name]; }), set.type, function (v) { change('type', v); }, '題型').classList.add('wideonly');
      if (set.type === 'w_jp') ctx.tool.seg([['kana', '讀音選平假名'], ['rom', '讀音選羅馬拼音']], set.read, function (v) { change('read', v); }, '讀音選項').classList.add('wideonly');
      // 手機寬度：上面三個併成一個下拉（值：題型，日→讀音・中文 再加 :kana／:rom）
      var narrowTypes = kinds.map(function (k) {
        var its = [];
        typesOf(k[0]).forEach(function (t) {
          if (t === 'w_jp') its.push(['w_jp:kana', '日→平假名・中文'], ['w_jp:rom', '日→羅馬拼音・中文']);
          else its.push([t, TYPES[t].name]);
        });
        return { group: k[1], items: its };
      });
      if (narrowTypes.length === 1) narrowTypes = narrowTypes[0].items;
      ctx.tool.select(narrowTypes, set.type === 'w_jp' ? 'w_jp:' + set.read : set.type, function (v) {
        var p = v.split(':');
        set.kind = TYPES[p[0]].kind; set.type = p[0]; if (p[1]) set.read = p[1];
        saveAll(); ctx.restart();
      }, '題型').classList.add('narrowonly');
      ctx.tool.chip(['平假名標音', '標音'], set.furi, function (on) { set.furi = on; st.set('furi', on); if (run && run.cur) furiClass(); });
      ctx.tool.select(nChoices(), set.n, function (v) { change('n', v); }, '題數');
      ctx.tool.button('結束', function () {
        if (run && run.log.length) finish(); else UI.toast('還沒有作答的題目');
      }, '中途結束，看目前的成績');

      var hudBox = ctx.hud([['prog', '題數', ''], ['right', '答對', 0], ['streak', '連續答對', 0], ['time', '時間', '0:00']], { width: 640 });   // 和選項區（.inner）同寬
      el.innerHTML = '<div class="inner qz-q" aria-live="polite"></div>';
      var box = el.firstChild;

      // 同一個表面文字在整個課程裡的所有讀音、中文（「七」しち／なな 這類）
      var sameSurf = {};
      ctx.all.words.forEach(function (w) { var k = surf(w); (sameSurf[k] = sameSurf[k] || []).push(w); });

      // 填文法的候選：文法段（依表面文字去重），目前範圍優先
      function gramPool(items) {
        var seen = {}, out = [];
        items.forEach(function (s) {
          T.parse(s.jp).forEach(function (g) {
            if (g.g && !g.punct && !T.hasDigit(g) && !seen[g.text]) { seen[g.text] = 1; out.push(g); }
          });
        });
        return out;
      }
      var gramScope = gramPool(ctx.items.sentences), gramAll = gramPool(ctx.all.sentences);

      var run = null;   // 進行中的一輪

      // ════════ 出題 ════════
      function opt(html, ok, cls, label) { return { html: html, ok: ok, cls: cls, label: label }; }

      function build(it, type) {
        var q = { it: it, type: type, groups: [], start: Date.now(), answers: [] };
        var S = surf(it);
        var noClash = function (x, chosen, meaningToo) {
          var sx = surf(x);
          if (sx === S || avoid(sx, S)) return false;
          if (meaningToo && U.sameMeaning(x.zh, it.zh)) return false;
          return !chosen.some(function (c) { return avoid(surf(c), sx) || (meaningToo && U.sameMeaning(c.zh, x.zh)); });
        };
        if (type === 'w_zh') {
          q.prompt = '<div class="prompt zh">' + esc(it.zh) + '</div>';
          var ds = U.pick({ pools: [ctx.items.words, ctx.all.words], n: 3, key: surf, taken: [S], ok: function (x, c) { return noClash(x, c, true); } });
          q.groups.push({ label: '', opts: U.shuffle([it].concat(ds)).map(function (x) { return opt(T.html(x.jp), x === it, 'jp', surf(x)); }) });
        } else if (type === 'w_jp') {
          q.hideFuri = true;    // 作答前不顯示標音（同舊版）
          q.prompt = '<div class="prompt jp" lang="ja">' + T.html(it.jp) + '</div>';
          var homo = sameSurf[S] || [it];
          if (!T.isAllHira(it.jp)) {
            var rd = function (x) { return set.read === 'rom' ? T.romaji(kanaOf(x)) : kanaOf(x); };
            var len = kanaOf(it).length;
            var dr = U.pick({
              pools: [ctx.items.words, ctx.all.words], n: 3, key: rd, taken: homo.map(rd),
              ok: function (x, c) { return noClash(x, c, false); },
              order: function (a) { return a.sort(function (x, y) { return Math.abs(kanaOf(x).length - len) - Math.abs(kanaOf(y).length - len); }).slice(0, 12); },
            });
            var cls = set.read === 'rom' ? 'rom' : 'jp';
            q.groups.push({ label: '讀音', opts: U.shuffle([it].concat(dr)).map(function (x) { return opt(esc(rd(x)), x === it, cls, rd(x)); }) });
          }
          var dz = U.pick({
            pools: [ctx.items.words, ctx.all.words], n: 3, key: function (x) { return zhKey(x.zh); }, taken: [zhKey(it.zh)],
            ok: function (x, c) { return noClash(x, c, true) && !homo.some(function (h) { return U.sameMeaning(h.zh, x.zh); }); },
          });
          q.groups.push({ label: '中文意思', opts: U.shuffle([it].concat(dz)).map(function (x) { return opt(esc(x.zh), x === it, '', x.zh); }) });
        } else if (type === 's_mean') {
          q.prompt = '<div class="prompt jp" lang="ja">' + T.html(it.jp) + '</div>';
          var dm = U.pick({
            pools: [ctx.items.sentences, ctx.all.sentences], n: 3, key: function (x) { return zhKey(x.zh); }, taken: [zhKey(it.zh)],
            ok: function (x) { return surf(x) !== S; },
          });
          q.one = true;
          q.groups.push({ label: '', opts: U.shuffle([it].concat(dm)).map(function (x) { return opt(esc(x.zh), x === it, '', x.zh); }) });
        } else if (type === 's_fill') {
          var idx = fillable(it), bi = idx[Math.random() * idx.length | 0], ans = T.parse(it.jp)[bi];
          q.prompt = '<div class="prompt jp" lang="ja">' + T.html(it.jp, { blank: bi }) + '</div><div class="sub">' + esc(it.zh) + '</div>';
          var dg = U.pick({
            pools: [gramScope, gramAll], n: 3, key: function (g) { return g.text; }, taken: [ans.text],
            ok: function (g, c) { return !avoid(g.text, ans.text) && !c.some(function (x) { return avoid(x.text, g.text); }); },
          });
          q.groups.push({ label: '空格裡要放哪一個？', opts: U.shuffle([ans].concat(dg)).map(function (g) { return opt(T.html([g]), g === ans, 'jp', g.text); }) });
        } else {
          q.prompt = '<div class="prompt zh">' + esc(it.zh) + '</div><div class="sub">點下面的詞，排成正確的日文句子</div>';
          var tiles = words(it).map(function (t, i) { return { t: t, id: i }; });
          var answer = tiles.map(function (x) { return x.t.text; }).join('');
          var pool = tiles;
          for (var k = 0; k < 8; k++) { pool = U.shuffle(tiles); if (pool.map(function (x) { return x.t.text; }).join('') !== answer) break; }
          q.order = { pool: pool, line: [], answer: answer };
        }
        return q;
      }

      // ════════ 作答 ════════
      function startRun(items, label) {
        run = { queue: items, qi: 0, right: 0, streak: 0, log: [], cur: null, t0: 0, label: label || '' };
        show();
      }
      function tick() { if (run && !run.t0) run.t0 = Date.now(); }   // 時間從第一次作答開始算（同舊版）
      function elapsed() { return run && run.t0 ? (Date.now() - run.t0) / 1000 : 0; }
      function hud() {
        if (!run) return;
        hudBox.set('prog', Math.min(run.qi + 1, run.queue.length) + '/' + run.queue.length);
        hudBox.set('right', run.right);
        hudBox.set('streak', run.streak);
        hudBox.set('time', U.fmtClock(elapsed()));
      }
      function furiClass() {
        var q = run && run.cur;
        box.classList.toggle('nofuri', !!q && !q.done && (!set.furi || !!q.hideFuri));   // 答完一律顯示讀音
      }
      function show() {
        var q = run.cur = build(run.queue[run.qi], set.type);
        var h = '<div class="tag">' + esc(TYPES[q.type].long) + '　' + esc(q.it.unitName || '') + '</div>' + q.prompt;
        q.groups.forEach(function (g, gi) {
          if (g.label) h += '<div class="qz-glabel">' + esc(g.label) + '</div>';
          h += '<div class="qz-opts' + (q.one ? ' one' : '') + '" data-g="' + gi + '">' + g.opts.map(function (o, oi) {
            return '<button type="button" class="qz-opt ' + o.cls + '" data-o="' + oi + '"' + (o.cls === 'jp' ? ' lang="ja"' : '') + '>' + o.html + '</button>';
          }).join('') + '</div>';
        });
        if (q.order) h += '<div class="qz-line" lang="ja"></div><div class="qz-pool" lang="ja"></div><button type="button" class="go alt" data-act="check" disabled>對答案</button>';
        h += '<div class="qz-fb"></div>';
        box.innerHTML = h;
        furiClass();
        if (q.order) drawOrder();
        hud();
        ctx.top();
      }
      function drawOrder() {
        var o = run.cur.order;
        var tile = function (x, w) { return '<button type="button" class="qz-tile" data-w="' + w + '" data-id="' + x.id + '">' + T.html([x.t]) + '</button>'; };
        box.querySelector('.qz-line').innerHTML = o.line.map(function (x) { return tile(x, 'line'); }).join('');
        box.querySelector('.qz-pool').innerHTML = o.pool.map(function (x) { return tile(x, 'pool'); }).join('');
        box.querySelector('[data-act="check"]').disabled = o.pool.length > 0;
      }
      function pickOpt(gi, oi) {
        var q = run.cur, g = q.groups[gi];
        if (!g || g.picked !== undefined || q.done) return;
        tick();
        g.picked = oi;
        var opts = box.querySelector('.qz-opts[data-g="' + gi + '"]');
        Array.prototype.forEach.call(opts.children, function (b, i) { b.disabled = true; if (g.opts[i].ok) b.classList.add('right'); });
        if (!g.opts[oi].ok) opts.children[oi].classList.add('wrong');
        q.answers.push(g.opts[oi].label);
        if (q.groups.every(function (x) { return x.picked !== undefined; })) finishQ(q.groups.every(function (x) { return x.opts[x.picked].ok; }));
      }
      function checkOrder() {
        var q = run.cur; if (q.done) return;
        tick();
        var mine = q.order.line.map(function (x) { return x.t.text; }).join('');
        var ok = mine === q.order.answer;
        box.querySelector('.qz-line').classList.add(ok ? 'right' : 'wrong');
        Array.prototype.forEach.call(box.querySelectorAll('.qz-tile'), function (x) { x.disabled = true; });
        box.querySelector('[data-act="check"]').hidden = true;
        q.answers.push(mine);
        finishQ(ok);
      }
      function finishQ(ok) {
        var q = run.cur; q.done = true;
        if (ok) { run.right++; run.streak++; } else run.streak = 0;
        var correct = q.order ? q.order.answer : q.groups.map(function (g) { return g.opts.filter(function (o) { return o.ok; })[0].label; }).join(' / ');
        run.log.push({ it: q.it, ok: ok, mine: q.answers.join(' / '), correct: correct, sec: (Date.now() - q.start) / 1000, unit: q.it.unit, unitName: q.it.unitName });
        furiClass();
        var last = run.qi + 1 >= run.queue.length;
        box.querySelector('.qz-fb').innerHTML = '<div class="qz-card' + (ok ? '' : ' miss') + '"><div class="v">' + (ok ? '答對了' : '答錯了，正確答案：') + '</div>' +
          '<div class="j" lang="ja">' + T.html(q.it.jp) + '</div><div class="r">' + esc(romOf(q.it, q.type)) + '</div><div class="z">' + esc(q.it.zh) + '</div></div>' +
          '<button type="button" class="go qz-next" data-act="next">' + (last ? '看成績' : '下一題') + '</button>';
        hud();
        var nb = box.querySelector('[data-act="next"]');
        nb.focus({ preventScroll: true });
        nb.scrollIntoView({ block: 'nearest' });
      }
      function next() {
        run.qi++;
        if (run.qi >= run.queue.length) finish(); else show();
      }

      // ════════ 成績 ════════
      function finish() {
        var r = run, n = r.log.length, sec = elapsed();
        hud();
        var miss = r.log.filter(function (x) { return !x.ok; });
        var rows = [['題號', '題型', '小單元', '題目', '讀音', '中文', '你的答案', '正確答案', '對錯', '秒數']];
        r.log.forEach(function (x, i) { rows.push([i + 1, TYPES[set.type].long, x.unitName, surf(x.it), kanaOf(x.it), x.it.zh, x.mine, x.correct, x.ok ? '對' : '錯', x.sec.toFixed(1)]); });
        run = null;
        UI.result(box, {
          title: TYPES[set.type].long + (r.label ? '（' + r.label + '）' : '') + '　完成！',
          stats: [['答對', r.right + ' / ' + n], ['正確率', (n ? Math.round(r.right / n * 100) : 0) + '%'], ['時間', U.fmtDur(sec)]],
          log: r.log, unitOrder: ctx.units.map(function (u) { return u.id; }),
          misses: miss.map(function (x) {
            return '<div class="j" lang="ja">' + T.html(x.it.jp) + '</div><div class="z">' + esc(romOf(x.it, set.type)) + '　' + esc(x.it.zh) + '</div>' +
              '<div class="qz-mine">你的答案：' + esc(x.mine || '（沒作答）') + '　→ 正確：' + esc(x.correct) + '</div>';
          }),
          csv: rows, csvName: 'quiz',
          actions: [
            { id: 'wrong', label: '只練錯題（' + miss.length + ' 題）', hidden: !miss.length },
            { id: 'again', label: '再來一次', primary: true },
          ],
          onAction: function (a) {
            if (a === 'again') begin();
            else if (a === 'wrong') startRun(U.shuffle(miss.map(function (x) { return x.it; })), '錯題');
          },
        });
        box.classList.remove('nofuri');
        ctx.top();
      }

      function begin() {
        var pool = U.shuffle(eligible(set.type, ctx.items));
        startRun(set.n === 'all' ? pool : pool.slice(0, +set.n));
      }

      // ════════ 事件 ════════
      box.addEventListener('click', function (e) {
        if (!run || !run.cur) return;
        var a = e.target.closest('[data-act]');
        if (a) {
          if (a.dataset.act === 'next') next();
          else if (a.dataset.act === 'check') checkOrder();
          return;
        }
        var b = e.target.closest('.qz-opt');
        if (b && !b.disabled) { pickOpt(+b.parentElement.dataset.g, +b.dataset.o); return; }
        var tl = e.target.closest('.qz-tile');
        if (tl && !tl.disabled && !run.cur.done) {
          tick();
          var o = run.cur.order, from = tl.dataset.w === 'pool' ? o.pool : o.line, to = tl.dataset.w === 'pool' ? o.line : o.pool;
          var i = from.findIndex(function (x) { return x.id === +tl.dataset.id; });
          to.push(from.splice(i, 1)[0]); drawOrder();
        }
      });
      ctx.on(document, 'keydown', function (e) {
        if (!run || !run.cur || e.altKey || e.ctrlKey || e.metaKey) return;
        var tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        var q = run.cur;
        if (q.done) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); } return; }
        var n = +e.key;
        if (n >= 1 && n <= 4) {
          var gi = q.groups.findIndex(function (x) { return x.picked === undefined; });
          if (gi >= 0 && q.groups[gi].opts[n - 1]) { e.preventDefault(); pickOpt(gi, n - 1); }
        }
      });
      ctx.every(hud, 250);

      begin();   // 一進來就是題目
    },
  });
})();
