/* fall.js — 附加玩法「玩一下」：掉落方塊打字
 * 重做舊版 raw_source/fall-single.html（功能、手感、畫面都以舊版為準）。不屬於 ①〜④ 主流程（extra:true）。
 *
 * 畫面（照舊版）：骨架的工具列（← 選單、範圍）下面是
 *   計分列（血量・分數・等級・連擊・倍率＋「暫停」）→ 掉落區（灰底、底部紅線）→ 鍵盤（骨架的 .foot）
 *   開始設定、暫停、成績都是蓋在上面的面板（.fl-panel，舊版的 .panel／.box）：
 *     開始：題庫、血量、起始難度、難度變化、鍵盤（下拉）＋平假名標音、按鍵提示、顯示中文（chip）→「開始」
 *           設定都記住（ctx.store；鍵盤、標音、提示是打字共用設定），下次進來直接按「開始」就好
 *     暫停：同一個面板，按鈕換成「繼續／結束並看成績／放棄這局，回設定」
 *     成績：JP_UI.result 畫在面板裡
 *
 * 判定、鍵盤、倍率、計分都用共用元件（js/core/typer.js、keyboard.js），這裡只管方塊與遊戲流程：
 *   每個方塊一個 JP_TYPE.judge；畫面只有一個 JP_KB 鍵盤。按一個鍵：有鎖定的方塊就只給它；
 *   沒有鎖定時從最下面的方塊開始試，第一個不是 'miss' 的就鎖定（打錯不會改判定狀態，所以可以這樣試）。
 *   點方塊可以直接指定；⌫ 退到底（或十二鍵、五十音的「換一個」）就放掉，換打別的。
 *   血量 0＝不死的練習模式，只能按「暫停 → 結束並看成績」結束。
 *   每消掉 CFG.perLevel 個升一級（選「慢慢變難」時），掉得更快、出得更密；等級越高分數也越高。
 *   漏掉的方塊停在底部顯示讀音再淡出，過幾個方塊之後會再出現一次。
 *   切到別的分頁、按 Esc 或「暫停」會暫停（暫停中再按 Esc 繼續）。
 * 句子：超過 CFG.sentMaxKana 個假名的句子預設不出（太長打不完，同舊版）；設定裡可以勾「長句也出」。
 *   範圍裡的句子全都太長時，就不篩掉（不然沒題目可出）。
 * 動畫用 ctx.frame（requestAnimationFrame），離開玩法時自動停；每一格最多前進 0.1 秒，背景分頁回來不會一次掉一堆。
 * class 一律 fl- 開頭（避免和其他玩法撞名）；鍵盤外觀由 keyboard.js 負責，這裡不改。 */
(function () {
  'use strict';
  var U = JP_UTIL, UI = JP_UI, T = JP_TEXT, TY = JP_TYPE, esc = U.esc, doc = document;

  // ───── 可調整的數值（沿用舊版 CFG）─────
  var CFG = {
    perLevel: 8,                                                            // 每消掉幾個升一級
    fallBase: function (lv) { return Math.max(4, 13 - (lv - 1) * 0.9); },   // 短詞從頂掉到底的秒數
    fallPerKana: 0.55,                                                      // 每多一個假名多給幾秒
    spawnGap: function (lv) { return Math.max(1.2, 3.8 - (lv - 1) * 0.28); }, // 幾秒出一個新方塊
    maxOnScreen: function (lv) { return Math.min(6, 2 + Math.floor(lv / 2)); },
    sentMaxKana: 16,        // 句子超過這麼多假名預設不出
    longKana: 9,            // 超過這麼多假名的方塊字縮小、可以換行
    levelBonus: 0.1,        // 等級加成：分數 ×(1＋(等級−1)×0.1)
    requeueAfter: 3,        // 漏掉的方塊再過幾個會再出現
    swallowMs: 700,         // 「ん」只打一個 n 消掉方塊後，這段時間內多打的 n 不算錯
  };
  var SRC = { w: '單字', s: '句子', ws: '單字＋句子' };
  var HP = [['3', '3'], ['5', '5'], ['10', '10'], ['0', '不死（練習）']];
  var LV = [['1', '慢（等級 1）'], ['4', '普通（等級 4）'], ['7', '快（等級 7）'], ['10', '很快（等級 10）']];
  var UP = [['1', '慢慢變難'], ['0', '固定不變']];
  var DESC = '方塊從上面掉下來，在它碰到紅線前打出讀音就能消掉。直接打字會自動鎖定對得上的方塊，最下面的優先；也可以點方塊指定，⌫ 退到底就換一個。';

  // 樣式：數值照舊版 fall-single.html（.hud、.field、.blk、.panel、.box、.set）
  UI.css('fall', [
    /* 題目區整塊給掉落區：不留邊、不捲動 */
    '.stage.fl-stage{padding:0;overflow:hidden;position:relative}',
    '.jpplay>.stage.fl-stage>.act{height:100%;min-height:0}',
    '.fl-wrap{--field:#e9ebe5;height:100%;display:flex;flex-direction:column}',
    '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .fl-wrap{--field:#0e1216}}',
    ':root[data-theme="dark"] .fl-wrap{--field:#0e1216}',
    /* 計分列（舊版：五格平均分、右邊「暫停」、下面一條線） */
    '.hud.fl-hud{max-width:none;padding:6px 16px;gap:10px;align-items:center;border-bottom:1px solid var(--line)}',
    '.fl-hud>div{flex:1}',
    '.fl-hud b{font-size:18px;white-space:nowrap}',
    '.fl-hud b[data-k="hp"]{color:var(--bad);letter-spacing:.05em}',
    '.fl-pause{flex:none;border:1px solid var(--muted);background:var(--card);color:var(--ink);border-radius:9px;padding:8px 12px;font-size:14px}',
    /* 掉落區 */
    '.fl-field{flex:1;min-height:0;position:relative;overflow:hidden;background:var(--field);touch-action:none;user-select:none;-webkit-user-select:none}',
    '.fl-field::after{content:"";position:absolute;left:0;right:0;bottom:0;height:5px;background:var(--bad);opacity:.55}',
    '.fl-field.hurt{animation:flhurt .3s}',
    '.fl-field.oops{animation:floops .25s}',
    '@keyframes flhurt{50%{background:color-mix(in srgb,var(--bad) 28%,var(--field))}}',
    '@keyframes floops{50%{box-shadow:inset 0 0 0 3px var(--bad)}}',
    '.fl-blk{position:absolute;left:0;top:0;background:var(--card);border:2px solid var(--line);border-radius:12px;padding:4px 12px 6px;',
    '  text-align:center;max-width:92%;box-shadow:0 2px 0 rgba(0,0,0,.12);will-change:transform;cursor:pointer}',
    '.fl-blk.lock{border-color:var(--blue);box-shadow:0 0 0 3px color-mix(in srgb,var(--blue) 30%,transparent);z-index:2}',
    '.fl-blk .w{font-family:var(--jp);font-weight:700;font-size:26px;line-height:1.75;white-space:nowrap}',
    '.fl-blk.long .w{font-size:20px;white-space:normal}',
    '.fl-blk .z{font-size:13px;color:var(--muted);margin-top:-2px;font-family:var(--ui)}',
    '.fl-field.nozh .fl-blk .z{display:none}',
    '.fl-blk .p{font-family:var(--jp);font-size:15px;min-height:1.3em;color:var(--ok);font-weight:700}',
    '.fl-blk .p i{font-style:normal;color:var(--blue);font-family:var(--ui)}',
    '.fl-blk.pop{transition:opacity .22s,scale .22s;opacity:0;scale:1.25;border-color:var(--ok)}',
    '.fl-blk.drop{transition:opacity .9s;opacity:0;border-color:var(--bad);color:var(--bad)}',
    '.fl-blk.drop .p{color:var(--bad)}',
    '.fl-field.nofuri .fl-blk.drop rt,.fl-blk.drop rt{display:ruby-text;color:var(--bad)}',   /* 漏掉時標出讀音（舊版） */
    '.fl-blk.shake{animation:flshake .22s}',
    '@keyframes flshake{25%{margin-left:-6px}75%{margin-left:6px}}',
    '.fl-float{position:absolute;font-weight:700;color:var(--ok);font-size:16px;pointer-events:none;animation:flup .7s forwards;z-index:3}',
    '@keyframes flup{to{transform:translateY(-34px);opacity:0}}',
    '.fl-lvl{position:absolute;left:0;right:0;top:38%;text-align:center;font-size:26px;font-weight:700;color:var(--blue);pointer-events:none;animation:fllv 1.1s forwards;z-index:3}',
    '@keyframes fllv{0%{opacity:0;transform:scale(.8)}25%{opacity:1;transform:scale(1)}100%{opacity:0}}',
    '@media (prefers-reduced-motion: reduce){.fl-field.hurt,.fl-field.oops,.fl-float,.fl-lvl,.fl-blk.shake{animation-duration:.01s}}',
    /* 面板：開始設定／暫停／成績（舊版 .panel／.box；蓋在工具列以下的整個畫面） */
    '.fl-panel{position:fixed;left:0;right:0;bottom:0;top:0;z-index:20;background:color-mix(in srgb,var(--paper) 94%,transparent);overflow:auto;padding:16px}',
    '.fl-box{max-width:480px;margin:0 auto;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px;display:flex;flex-direction:column;gap:12px}',
    '.fl-box h1{font-size:22px;margin:0}',
    '.fl-box p{margin:0;color:var(--muted);font-size:14px;line-height:1.55}',
    '.fl-set{display:grid;grid-template-columns:auto 1fr;gap:10px 12px;align-items:center}',
    '.fl-set label{font-size:15px}',
    '.fl-set select{width:100%;padding:8px;border-radius:9px;border:1px solid var(--muted);background:var(--paper);color:var(--ink);font-size:15px}',
    '.fl-chips{display:flex;flex-wrap:wrap;gap:8px}',
    '.fl-box .chip{background:var(--paper);padding:8px 11px;font-size:14px}',
    '.fl-box .go{width:100%;padding:13px 20px}',
    '.fl-panel .result{margin:0 auto}',
    '.fl-panel .review .r{color:var(--muted);font-size:14px}',
    '.fl-panel .review .mine{font-size:14px;color:var(--bad);overflow-wrap:anywhere}.fl-panel .review .u{font-size:13px;color:var(--muted)}',
    '.fl-panel .review .sk{display:inline-block;font-size:13px;font-weight:700;border-radius:99px;padding:0 8px;background:var(--soft);color:var(--muted);margin-left:6px}',
  ].join('\n'));

  JP_APP.register({
    id: 'fall', extra: true, stepName: '玩', title: '掉落方塊打字', desc: '方塊掉到紅線前打出讀音消掉（小遊戲，非必要）',
    needs: 'any',
    mount: function (el, ctx) {
      var st = ctx.store;
      var W = ctx.items.words, S = ctx.items.sentences;
      var hasW = W.length > 0, hasS = S.length > 0;
      var lenOf = function (it) { return T.reading(it.jp).length; };
      var shortS = S.filter(function (s) { return lenOf(s) <= CFG.sentMaxKana; });
      var longN = S.length - shortS.length;

      var set = {
        src: st.get('src', hasW ? 'w' : 's'), hp: String(st.get('hp', '5')), lv: String(st.get('lv', '1')), up: String(st.get('up', '1')),
        zh: st.get('zh', true) !== false, long: st.get('long', false) === true,
      };
      if (!SRC[set.src] || (set.src !== 's' && !hasW) || (set.src !== 'w' && !hasS)) set.src = hasW ? 'w' : 's';
      if (!HP.some(function (x) { return x[0] === set.hp; })) set.hp = '5';
      if (!LV.some(function (x) { return x[0] === set.lv; })) set.lv = '1';
      if (set.up !== '0') set.up = '1';
      function save() { ['src', 'hp', 'lv', 'up', 'zh', 'long'].forEach(function (k) { st.set(k, set[k]); }); }

      function sentPool() { return set.long || !shortS.length ? S : shortS; }
      function pool(src) { return src === 'w' ? W : src === 's' ? sentPool() : W.concat(sentPool()); }
      function bestKey() { return 'best_' + ctx.pack.id + '_' + set.src + (set.src !== 'w' && set.long ? 'L' : '') + '_' + set.hp + '_' + set.lv + '_' + set.up; }

      var g = null, kb = null, mode = 'set';   // mode：'set' 開始設定｜'play'｜'pause'｜'over'

      // ════════ 骨架：計分列、掉落區、鍵盤、面板 ════════
      ctx.stage.classList.add('fl-stage');
      var hud = ctx.hud([['hp', '血量', ''], ['score', '分數', 0], ['lv', '等級', set.lv], ['combo', '連擊', 0], ['mult', '倍率', '']]);
      hud.el.classList.add('fl-hud');
      var pauseBtn = doc.createElement('button');
      pauseBtn.type = 'button'; pauseBtn.className = 'fl-pause'; pauseBtn.textContent = '暫停'; pauseBtn.title = '快捷鍵 Esc';
      hud.el.appendChild(pauseBtn);
      pauseBtn.addEventListener('click', function () { pauseBtn.blur(); pause(); });

      el.innerHTML = '<div class="fl-wrap"><div class="fl-field" lang="ja"></div></div>' +
        '<div class="fl-panel" role="dialog" aria-modal="true"><div class="fl-box"></div></div>';
      var field = el.querySelector('.fl-field'), panel = el.querySelector('.fl-panel'), box = panel.querySelector('.fl-box');
      ctx.foot.innerHTML = '<div class="kbwrap"><div class="fl-kb"></div></div>';
      var kbHost = ctx.foot.querySelector('.fl-kb');
      var barEl = ctx.bar.closest ? ctx.bar.closest('.bar') : null;

      // 面板蓋住工具列以下的整個畫面（工具列的「← 選單」「範圍」照樣能按）
      function placePanel() {
        var top = barEl ? Math.round(barEl.getBoundingClientRect().bottom) : 0;
        panel.style.top = Math.max(0, top) + 'px';
      }
      function showPanel(html, cls) {
        box.className = cls || 'fl-box';   // 成績用 'fl-res'：卡片是 JP_UI.result 自己的樣子
        box.innerHTML = html;
        panel.hidden = false; placePanel(); panel.scrollTop = 0;
      }

      // ════════ 開始設定／暫停面板（舊版同一個面板）════════
      function opts(list, cur) {
        return list.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(cur) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('');
      }
      function chip(name, label, on) { return '<button type="button" class="chip" data-ftog="' + name + '" aria-pressed="' + !!on + '">' + label + '</button>'; }
      function setHtml(paused) {
        var srcs = [];
        if (hasW) srcs.push(['w', '單字（' + W.length + '）']);
        if (hasS) srcs.push(['s', '句子（' + sentPool().length + '）']);
        if (hasW && hasS) srcs.push(['ws', '單字＋句子']);
        var h = '<h1>' + (paused ? '暫停中' : '掉落方塊打字') + '</h1>' +
          '<p>' + (paused ? '可以調整鍵盤和顯示方式。題庫、血量、難度要重新開始才會套用。' : esc(DESC)) + '</p>' +
          '<div class="fl-set">' +
          (srcs.length > 1 ? '<label for="flSrc">題庫</label><select id="flSrc" data-fset="src">' + opts(srcs, set.src) + '</select>' : '') +
          '<label for="flHp">血量</label><select id="flHp" data-fset="hp">' + opts(HP, set.hp) + '</select>' +
          '<label for="flLv">起始難度</label><select id="flLv" data-fset="lv">' + opts(LV, set.lv) + '</select>' +
          '<label for="flUp">難度變化</label><select id="flUp" data-fset="up">' + opts(UP, set.up) + '</select>' +
          '<label for="flKb">鍵盤</label><select id="flKb" data-fset="kb">' + opts(TY.KB_TYPES, TY.prefs.get('kb')) + '</select>' +
          '</div>' +
          '<div class="fl-chips">' + chip('furi', '平假名標音', TY.prefs.get('furi')) + chip('hint', '按鍵提示', TY.prefs.get('hint')) +
          chip('zh', '顯示中文', set.zh) +
          (hasS && set.src !== 'w' && longN && shortS.length ? chip('long', '長句也出', set.long) : '') + '</div>';
        if (hasS && set.src !== 'w' && longN) {
          h += '<p>' + (shortS.length ? '有 ' + longN + ' 句超過 ' + CFG.sentMaxKana + ' 個假名，太長不容易打完，預設不出；勾「長句也出」就會出（長句掉得比較慢）。'
            : '範圍裡的句子都超過 ' + CFG.sentMaxKana + ' 個假名，比較難在掉到底前打完，可以選慢一點的難度。') + '</p>';
        }
        var best = +st.get(bestKey(), 0) || 0;
        h += '<p>標音和按鍵提示都不開分數 ×1.5，開一個 ×1，都開 ×0.7（目前 <b data-fmult></b>）。等級越高分數也越高。' +
          (best ? '這個設定的最高分：' + best + '。' : '') + '</p>';
        h += paused
          ? '<button type="button" class="go" data-fa="resume">繼續</button>' +
            '<button type="button" class="go alt" data-fa="end">結束並看成績</button>' +
            '<button type="button" class="go alt" data-fa="setup">放棄這局，回設定</button>'
          : '<button type="button" class="go" data-fa="start">開始</button>';
        return h;
      }
      function paintSet() {
        if (mode !== 'set' && mode !== 'pause') return;
        var f = doc.activeElement && box.contains(doc.activeElement) ? doc.activeElement.id || doc.activeElement.dataset.ftog || doc.activeElement.dataset.fa : '';
        box.innerHTML = setHtml(mode === 'pause');
        paintMult();
        if (f) {   // 重畫後焦點留在原本的元件上（鍵盤操作才不會跳掉）
          var back = doc.getElementById(f) || box.querySelector('[data-ftog="' + f + '"],[data-fa="' + f + '"]');
          if (back) back.focus();
        }
      }
      function paintMult() {
        var m = '×' + TY.mult(TY.prefs.get('furi'), TY.prefs.get('hint'));
        hud.set('mult', m);
        var b = box.querySelector('[data-fmult]'); if (b) b.textContent = m;
      }
      function showSetup() {
        endGame();
        mode = 'set';
        showPanel(setHtml(false)); paintMult(); paintHudIdle();
        var go = box.querySelector('[data-fa="start"]'); if (go) go.focus({ preventScroll: true });   // Enter 就能開始
      }
      function paintHudIdle() {   // 開始前：計分列顯示這次的設定
        var hp = +set.hp;
        hud.label('hp', hp ? '血量' : '練習');
        hud.set('hp', hpText(hp, hp)); hud.set('score', 0); hud.set('lv', set.lv); hud.set('combo', 0);
      }
      function hpText(hp, max) { return !max ? '∞' : hp > 5 ? '♥×' + hp : (new Array(Math.max(0, hp) + 1).join('♥') || '0'); }

      // ════════ 鍵盤 ════════
      function makeKb() {
        if (kb) kb.destroy();
        var t = TY.prefs.get('kb');
        kb = JP_KB.create(kbHost, {
          type: t, on: ctx.on,
          actions: t === 'k12' || t === 'k50' ? [{ id: 'unlock', label: '換一個' }] : [],
          onRoman: onRoman,
          onKana: function (c) { feed(function (j) { return j.input(c); }, c); },
          onMod: onMod, onDel: onDel, onSys: onSys,
          onAction: function (id) { if (id === 'unlock' && g && mode === 'play') { unlock(); } },
        });
        kb.enable(mode === 'play');
        if (g) g.blocks.forEach(measure);
      }

      // ════════ 遊戲 ════════
      function endGame() {
        if (!g) return;
        g = null;
        if (kb) { kb.enable(false); kb.hint(null); kb.sysReset(); }
      }
      function startGame() {
        endGame();
        save();
        var p = pool(set.src);
        if (!p.length) { showSetup(); return; }
        field.innerHTML = '';
        g = {
          src: set.src, hpMax: +set.hp, lv0: +set.lv, up: set.up === '1', pool: p, best: bestKey(),
          blocks: [], locked: null, queue: [], log: [], lastIt: null,
          hp: +set.hp, score: 0, level: +set.lv, cleared: 0, dropped: 0, combo: 0, maxCombo: 0, hits: 0, misses: 0,
          playT: 0, spawnT: 0.4, last: performance.now(), swallowAt: 0, pendN: false, seq: 0,
        };
        mode = 'play';
        panel.hidden = true; box.innerHTML = '';
        hud.label('hp', g.hpMax ? '血量' : '練習');
        applyView(); paintHud();
        kb.enable(true); showHint(); kb.focus();
      }
      ctx.on(window, 'resize', function () { if (!panel.hidden) placePanel(); if (g) g.blocks.forEach(measure); });

      function applyView() {
        field.classList.toggle('nofuri', !TY.prefs.get('furi'));
        field.classList.toggle('nozh', !set.zh);
        if (g) g.blocks.forEach(measure);
      }
      function paintHud() {
        if (!g) return;
        hud.set('hp', hpText(g.hp, g.hpMax));
        hud.set('score', g.score);
        hud.set('lv', g.level);
        hud.set('combo', g.combo);
        paintMult();
      }

      // ── 方塊 ──
      function nextItem() {
        if (!g.queue.length) {
          g.queue = U.shuffle(g.pool);
          if (g.queue.length > 1 && g.queue[0] === g.lastIt) g.queue.push(g.queue.shift());
        }
        return g.lastIt = g.queue.shift();
      }
      function spawn() {
        var it = nextItem(); if (!it) return;
        var tg = T.target(it.jp);
        var b = {
          id: ++g.seq, it: it, tg: tg, kana: tg.kana, j: TY.judge(tg.kana), x: 4, w: 0, h: 0, y: 0, prog: 0,
          secs: CFG.fallBase(g.level) + tg.kana.length * CFG.fallPerKana, born: g.playT, lv: g.level,
          miss: 0, wrong: [], furi: TY.prefs.get('furi'), hint: TY.prefs.get('hint'),
        };
        var d = doc.createElement('div');
        d.className = 'fl-blk' + (tg.kana.length > CFG.longKana ? ' long' : '');
        d.dataset.kana = tg.kana; d.dataset.id = b.id;
        d.innerHTML = '<div class="w">' + T.html(it.jp) + '</div><div class="z">' + esc(it.zh) + '</div><div class="p"></div>';
        field.appendChild(d);
        b.el = d;
        measure(b);
        var fw = field.clientWidth;
        for (var i = 0; i < 8; i++) {   // 盡量不要和上方剛出來的方塊疊在一起
          b.x = 4 + Math.random() * Math.max(0, fw - b.w - 8);
          if (!g.blocks.some(function (o) { return o.y < 70 && b.x < o.x + o.w + 6 && o.x < b.x + b.w + 6; })) break;
        }
        g.blocks.push(b);
        place(b);
        if (g.blocks.length === 1) showHint();
      }
      function measure(b) { b.w = b.el.offsetWidth; b.h = b.el.offsetHeight; }
      function place(b) {
        var fw = field.clientWidth, fh = field.clientHeight;
        if (b.x + b.w > fw - 4) b.x = Math.max(4, fw - b.w - 4);
        b.y = -b.h + b.prog * (fh - 5);
        b.el.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px)';
      }
      function paintBlock(b) {
        var j = b.j, h = '';
        for (var i = 0; i < j.pos; i++) h += b.tg.kata[i] ? T.toKata(b.kana[i]) : b.kana[i];
        h = esc(h);
        if (j.pend) h += '<i>' + esc(b.tg.kata[j.pos] ? T.toKata(j.pend) : j.pend) + '</i>';
        if (j.buf) h += '<i>' + esc(j.buf) + '</i>';
        b.el.querySelector('.p').innerHTML = h;
        b.el.classList.toggle('lock', !!g && b === g.locked);
      }
      function order() { return g.blocks.slice().sort(function (a, b) { return b.prog - a.prog; }); }   // 最下面的在前
      function showHint() {
        if (!kb) return;
        if (!g || !TY.prefs.get('hint') || mode !== 'play') { kb.hint(null); return; }
        var b = g.locked || order()[0];
        kb.hint(b ? b.j.hint(kb.type) : null);
      }
      function lock(b) {
        if (g.locked === b) return;
        if (g.locked) unlock(true);
        g.locked = b; paintBlock(b);
      }
      function unlock(quiet) {
        var b = g.locked; if (!b) return;
        g.locked = null;
        b.j = TY.judge(b.kana);   // 放掉就重來（打過的這個方塊從頭打）
        paintBlock(b);
        if (kb && kb.type === 'sys' && !quiet) kb.sysReset();
        if (!quiet) showHint();
      }
      function floatText(b, txt) {
        var f = doc.createElement('div'); f.className = 'fl-float'; f.textContent = txt;
        f.style.left = (b.x + b.w / 2 - 14) + 'px'; f.style.top = Math.max(0, b.y) + 'px';
        field.appendChild(f); ctx.later(function () { f.remove(); }, 720);
      }
      function logBlock(b, result, pts) {
        g.log.push({
          it: b.it, unit: b.it.unit, unitName: b.it.unitName, result: result, ok: result === '消掉' && b.miss === 0,
          sec: g.playT - b.born, miss: b.miss, wrong: b.wrong.slice(), lv: b.lv, pts: pts,
          furi: b.furi, hint: b.hint, mult: TY.mult(b.furi, b.hint), kb: kb ? kb.type : TY.prefs.get('kb'),
        });
      }
      function remove(b) {
        g.blocks = g.blocks.filter(function (x) { return x !== b; });
        if (g.locked === b) g.locked = null;
      }
      function clearBlock(b) {
        remove(b);
        g.combo++; g.maxCombo = Math.max(g.maxCombo, g.combo); g.cleared++;
        var m = TY.mult(b.furi, b.hint);
        var pts = Math.round(TY.points(b.kana.length, b.miss ? 0 : g.combo, m) * (1 + (b.lv - 1) * CFG.levelBonus));
        g.score += pts;
        logBlock(b, '消掉', pts);
        floatText(b, '+' + pts);
        paintBlock(b);
        b.el.classList.remove('lock'); b.el.classList.add('pop');
        ctx.later(function () { b.el.remove(); }, 240);
        if (b.j.endN) g.swallowAt = performance.now();
        if (kb && kb.type === 'sys') kb.sysReset();
        if (g.up) {
          var nl = g.lv0 + Math.floor(g.cleared / CFG.perLevel);
          if (nl > g.level) {
            g.level = nl;
            var t = doc.createElement('div'); t.className = 'fl-lvl'; t.textContent = '等級 ' + g.level;
            field.appendChild(t); ctx.later(function () { t.remove(); }, 1150);
          }
        }
        if (!g.blocks.length) g.spawnT = Math.min(g.spawnT, 0.25);
        paintHud(); showHint();
      }
      function dropBlock(b) {
        remove(b);
        g.dropped++; g.combo = 0;
        logBlock(b, '漏掉', 0);
        g.queue.splice(Math.min(CFG.requeueAfter, g.queue.length), 0, b.it);   // 漏掉的過一下再出現一次
        b.el.classList.remove('lock'); b.el.classList.add('drop');               // 停在底部顯示讀音再淡出
        b.el.querySelector('.p').textContent = b.tg.kana.split('').map(function (c, i) { return b.tg.kata[i] ? T.toKata(c) : c; }).join('');
        ctx.later(function () { b.el.remove(); }, 950);
        field.classList.remove('hurt'); void field.offsetWidth; field.classList.add('hurt');
        if (kb && kb.type === 'sys' && !g.locked) kb.sysReset();
        if (g.hpMax) { g.hp--; if (g.hp <= 0) { paintHud(); finish('dead'); return; } }
        paintHud(); showHint();
      }

      // ── 輸入 ──
      function shake(b) {
        var e = b ? b.el : field, c = b ? 'shake' : 'oops';
        e.classList.remove(c); void e.offsetWidth; e.classList.add(c);
      }
      function missKey(b, expect, got) {
        g.misses++; g.combo = 0; g.score = Math.max(0, g.score - TY.SCORE.miss);
        if (b) {
          b.miss++;
          var exp = b.tg.kata[b.j.pos] ? T.toKata(expect) : expect;
          b.wrong.push(exp + '→' + (b.j.pend ? b.j.pend + '（要先按゛゜小）' : got));
        }
        shake(b); paintHud();
      }
      function hit(b, r) {
        g.hits++;
        lock(b); paintBlock(b);
        if (r === 'done') clearBlock(b); else showHint();
      }
      // fn(judge) → judge 的回傳；有鎖定就只試鎖定的，沒有就從最下面開始試
      function feed(fn, got) {
        if (!g || mode !== 'play' || !g.blocks.length) return;
        g.swallowAt = 0; g.pendN = false;
        var b = g.locked;
        if (b) {
          var exp = b.j.expect(), was = b.j.buf;
          var r = fn(b.j);
          if (r === 'skip') { paintBlock(b); return; }
          if (r === 'miss') { missKey(b, exp, was + got); return; }
          hit(b, r); return;
        }
        var list = order();
        for (var i = 0; i < list.length; i++) {
          var r2 = fn(list[i].j);
          if (r2 !== 'miss' && r2 !== 'skip') { hit(list[i], r2); return; }
        }
        missKey(null, '', got);
      }
      function onRoman(l) {
        if (!g || mode !== 'play') return;
        // 「ん」只打一個 n 就消掉方塊後，緊接著多打的 n（習慣打 nn 的人）：先記著，看下一個鍵再決定
        if ((l === 'n' || l === "'") && !g.locked && g.swallowAt && performance.now() - g.swallowAt < CFG.swallowMs) {
          g.swallowAt = 0; g.pendN = l === 'n'; return;
        }
        if (g.pendN && !g.locked && g.blocks.length) {
          g.pendN = false;
          var list = order(), i, r;
          // 先當作多打的 n：這個鍵自己對得上的方塊
          for (i = 0; i < list.length; i++) { r = list[i].j.roman(l); if (r !== 'miss' && r !== 'skip') { hit(list[i], r); return; } }
          // 再當作真的 n：n＋這個鍵對得上的方塊（例如上一個是「ほん」打 hon，接著打 natsu）
          for (i = 0; i < list.length; i++) {
            var j = list[i].j;
            if (j.roman('n') === 'miss') continue;
            r = j.roman(l);
            if (r === 'miss') { j.back(); continue; }
            g.hits++; hit(list[i], r); return;
          }
          missKey(null, '', 'n' + l); return;
        }
        feed(function (j) { return j.roman(l); }, l);
      }
      function onMod() {
        if (!g || mode !== 'play' || !g.locked) return;
        var b = g.locked, r = b.j.mod();
        if (r === 'none') return;
        hit(b, r);
      }
      function onDel() {
        if (!g || mode !== 'play' || !g.locked) return;
        var j = g.locked.j;
        if (!j.pos && !j.buf && !j.pend) { unlock(); return; }
        j.back();
        if (!j.pos && !j.buf && !j.pend) unlock(); else { paintBlock(g.locked); showHint(); }
      }
      // 系統鍵盤：輸入框的內容整個拿去比對，找讀音開頭對得上的方塊（完全一樣的優先）
      function onSys(v) {
        if (!g || mode !== 'play') return;
        var hv = T.toHira(String(v || '')).split('').filter(function (c) { return /[ぁ-ゖー]/.test(c); }).join('');
        var b = g.locked;
        if (!hv) { if (b) unlock(true); g.blocks.forEach(paintBlock); return; }
        if (!b || b.kana.indexOf(hv) !== 0) {
          var list = order();
          b = list.filter(function (x) { return x.kana === hv; })[0] || list.filter(function (x) { return x.kana.indexOf(hv) === 0; })[0];
          if (!b) { if (g.locked) unlock(true); return; }
          lock(b);
        }
        var before = b.j.pos, r = b.j.sys(hv);
        if (b.j.pos > before) g.hits += b.j.pos - before;
        paintBlock(b);
        if (r === 'done') clearBlock(b);
      }
      field.addEventListener('pointerdown', function (e) {   // 點方塊直接指定要打哪一個
        var d = e.target.closest('.fl-blk'); if (!d || !g || mode !== 'play') return;
        var b = g.blocks.filter(function (x) { return x.el === d; })[0];
        if (!b || b === g.locked) return;
        e.preventDefault();
        lock(b); showHint();
        if (kb && kb.type === 'sys') { kb.sysReset(); kb.focus(); }
      });

      // ── 迴圈 ──
      ctx.frame(function (now) {
        if (!g) return;
        if (mode !== 'play') { g.last = now; return; }
        var dt = Math.min(0.1, Math.max(0, (now - g.last) / 1000)); g.last = now;   // 一格最多 0.1 秒：背景分頁回來不會一次掉一堆
        g.playT += dt;
        var list = g.blocks.slice();
        for (var i = 0; i < list.length; i++) {
          var b = list[i];
          b.prog += dt / b.secs; place(b);
          if (b.prog >= 1) { dropBlock(b); if (!g || mode !== 'play') return; }
        }
        g.spawnT -= dt;
        if (g.spawnT <= 0 && g.blocks.length < CFG.maxOnScreen(g.level)) { spawn(); g.spawnT = CFG.spawnGap(g.level); }
      });
      function pause() {
        if (!g || mode !== 'play') return;
        mode = 'pause'; kb.enable(false); kb.hint(null);
        showPanel(setHtml(true)); paintMult();
        var r = box.querySelector('[data-fa="resume"]'); if (r) r.focus({ preventScroll: true });
      }
      function resume() {
        if (!g || mode !== 'pause') return;
        mode = 'play'; g.last = performance.now();
        panel.hidden = true; box.innerHTML = '';
        kb.enable(true); showHint(); kb.focus();
      }

      // ════════ 成績 ════════
      function finish(why) {
        var r = g; if (!r || mode === 'over') return;
        r.blocks.forEach(function (b) { logBlock(b, '未打完', 0); });
        endGame();
        mode = 'over';
        var prev = +st.get(r.best, 0) || 0, best = Math.max(prev, r.score);
        st.set(r.best, best);
        var acc = (r.hits + r.misses ? Math.round(r.hits / (r.hits + r.misses) * 100) : 100) + '%';
        var stats = [
          ['分數', String(r.score)],
          ['到達等級', String(r.level)],
          ['消掉／漏掉', r.cleared + ' ／ ' + r.dropped],
          ['最高連擊', String(r.maxCombo)],
          ['正確率', acc],
          ['時間', U.fmtDur(r.playT)],
          ['血量', r.hpMax ? r.hpMax + ' 格' : '不死（練習）'],
          ['最高分紀錄', best + (r.score > prev && r.score > 0 ? '（刷新紀錄！）' : '')],
        ];
        var kanaOf = function (x) { return T.reading(x.it.jp); };
        var KBN = {}; TY.KB_TYPES.forEach(function (k) { KBN[k[0]] = k[1]; });
        var rows = [['序', '小單元', '題目', '讀音', '中文', '結果', '停留秒數', '打錯次數', '打錯的字(正確→按下)', '等級', '平假名標音', '按鍵提示', '倍率', '得分', '鍵盤']];
        r.log.forEach(function (x, i) {
          rows.push([i + 1, x.unitName, T.surface(x.it.jp), kanaOf(x), x.it.zh, x.result, x.sec.toFixed(1), x.miss, x.wrong.join(' '), x.lv,
            x.furi ? '開' : '關', x.hint ? '開' : '關', x.mult, x.pts, KBN[x.kb] || x.kb]);
        });
        var seen = [];
        var bad = r.log.filter(function (x) { return x.result !== '消掉' && seen.indexOf(x.it) < 0 && seen.push(x.it); });
        showPanel('', 'fl-res');
        UI.result(box, {
          title: why === 'dead' ? '遊戲結束' : r.hpMax ? '中途結束' : '練習結束',
          sub: '題庫：' + SRC[r.src] + '　' + (r.up ? '慢慢變難' : '固定難度'),
          stats: stats,
          log: r.log, unitOrder: ctx.units.map(function (u) { return u.id; }), unitTitle: '依小單元（一次就打對消掉的／出現過的方塊）',
          missTitle: '漏掉或沒打完的，再看一次（' + bad.length + '）', allOk: r.log.length ? '全部消掉了！' : '還沒有出現方塊',
          misses: bad.map(function (x) {
            var n = r.log.filter(function (y) { return y.it === x.it && y.result === '漏掉'; }).length;
            return '<div class="u">' + esc(x.unitName) + '</div><div class="j" lang="ja">' + T.html(x.it.jp) + '</div><div class="r">' + esc(kanaOf(x)) + '</div>' +
              '<div class="z">' + esc(x.it.zh) + (n ? '<span class="sk">漏掉 ' + n + ' 次</span>' : '<span class="sk">未打完</span>') + '</div>';
          }),
          csv: rows, csvName: 'fall',
          actions: [
            { id: 'again', label: '再玩一次', primary: true },
            { id: 'setup', label: '換設定' },
            { id: 'home', label: '回選單' },
          ],
          onAction: function (a) {
            if (a === 'again') startGame();
            else if (a === 'home') ctx.home();
            else showSetup();
          },
        });
        panel.scrollTop = 0;
        var again = box.querySelector('[data-act="again"]'); if (again) again.focus({ preventScroll: true });
      }

      // ════════ 事件 ════════
      // 鍵盤、標音、提示是打字共用設定（JP_TYPE.prefs）：別處改了也同步
      ctx.on(doc, 'jp-typeprefs', function (e) {
        var k = e.detail && e.detail.key;
        if (k === 'kb') {
          if (g && g.locked) g.locked.j.clearPartial();
          makeKb();
          if (g && g.locked) paintBlock(g.locked);
        }
        if (g && k === 'furi' && TY.prefs.get('furi')) g.blocks.forEach(function (b) { b.furi = true; });   // 方塊在畫面上時開過就算有開
        if (g && k === 'hint' && TY.prefs.get('hint')) g.blocks.forEach(function (b) { b.hint = true; });
        applyView(); paintMult(); showHint();
        if (k !== 'kb') paintSet();
      });
      ctx.on(doc, 'visibilitychange', function () { if (doc.hidden) pause(); });
      ctx.on(doc, 'keydown', function (e) {
        if (e.key !== 'Escape' || e.isComposing) return;
        if (mode === 'play') { e.preventDefault(); pause(); }
        else if (mode === 'pause') { e.preventDefault(); resume(); }
      });
      box.addEventListener('change', function (e) {
        var s = e.target.closest('[data-fset]'); if (!s) return;
        var k = s.dataset.fset;
        if (k === 'kb') { TY.prefs.set('kb', s.value); return; }   // 會發 jp-typeprefs，上面重建鍵盤
        set[k] = s.value; save();
        if (k === 'src') paintSet();   // 「長句也出」要不要顯示跟著題庫變
        else if (mode === 'set') paintSet();
      });
      box.addEventListener('click', function (e) {
        var t = e.target.closest('[data-ftog]');
        if (t) {
          var k = t.dataset.ftog;
          if (k === 'furi' || k === 'hint') { TY.prefs.set(k, !TY.prefs.get(k)); return; }   // jp-typeprefs 會重畫
          set[k] = !set[k]; save();
          applyView(); paintSet();
          return;
        }
        var a = e.target.closest('[data-fa]'); if (!a) return;
        var act = a.dataset.fa;
        if (act === 'start') startGame();
        else if (act === 'resume') resume();
        else if (act === 'end') { if (g) finish('quit'); }
        else if (act === 'setup') showSetup();
      });

      makeKb();
      applyView();
      showSetup();
    },
    // 不需要 unmount：鍵盤、動畫迴圈、計時器、document 上的監聽都是用 ctx.on／ctx.frame／ctx.later 掛的，離開時自動清掉
  });
})();
