/* picker.js — 選範圍元件：課程／範圍／今天（window.JP_PICKER）
 * ============================================================================
 * 需要先載入 registry.js、packs.js、scope.js、util.js。樣式在 core.css（.pick 開頭那段）。
 * 首頁的卡片與玩法工具列「範圍」小面板共用這一份程式（版面見 docs/設計稿/n5-首頁.html）。
 *
 *   var pk = JP_PICKER.create(host, opts)   在 host 裡畫出三列：1 課程（原生下拉）、2 範圍（「全部」鈕＋分類膠囊，點膠囊展開小單元）、3 今天
 *     opts.scope, opts.pack   一開始的範圍與課程包（課程包要已載入）；省略就先顯示「載入中」，之後用 pk.set()
 *     opts.live      true＝每次改動都立刻記住（JP_SCOPE.save）並同步網址（首頁用）
 *                    false（預設）＝只是草稿，用 pk.value() 取值（小面板「套用」時才生效）
 *     opts.compact   true＝較緊湊的版面（小面板用）
 *     opts.otherLabel  有些小單元沒寫 group、同課程其他有寫時，那些小單元歸到這個分類（預設「其他」）
 *     opts.onChange(scope, pack)   每次改動之後（換課程載入中時 pack 是 null）
 *   pk.value()       → { scope, pack }（課程載入中或載入失敗時 pack 是 null）
 *   pk.set(scope, pack)   換成這個範圍（課程包要已載入）；不會觸發 onChange
 *   pk.note(text)    在卡片下方顯示一行說明（例如網址裡不存在的小單元已略過）；空字串＝隱藏
 *   pk.destroy()
 *
 *   JP_PICKER.groups(pack, otherLabel) → [{ name, units:[…] }]   分類依小單元的 group 出現順序（程式不寫死分類名稱）
 *   JP_PICKER.isAll(scope, pack)        範圍等於課程預設（units 省略，或剛好是全部非 optional 的小單元）
 *   JP_PICKER.label(scope, pack)        精簡的範圍文字：「N5 形容詞・全部」「N5 形容詞・3 個小單元」
 *   JP_PICKER.summary(scope)            「80 個單字、40 個句子」（沒有的不顯示；都沒有回「還沒有選小單元」）
 *
 * 課程清單（data/packs.js）可帶選填的 category：有就用 <optgroup> 依出現順序分層（沒寫的歸 otherLabel），
 * 全部都沒寫就平列。
 * ============================================================================ */
(function (root) {
  'use strict';
  var S = root.JP_SCOPE, P = root.JP_PACKS, U = root.JP_UTIL, esc = U.esc, doc = root.document;
  var seq = 0;

  function groups(pack, other) {
    other = other || '其他';
    var order = [], map = {};
    pack.units.forEach(function (u) {
      var g = u.group || other;
      if (!map[g]) { map[g] = { name: g, units: [] }; order.push(map[g]); }
      map[g].units.push(u);
    });
    return order;
  }
  function isAll(scope, pack) {
    if (!Array.isArray(scope.units)) return true;
    var a = S.unitIds(scope), d = S.defaultUnits(pack);
    return a.length === d.length && a.every(function (id, i) { return id === d[i]; });
  }
  function summary(scope) {
    var c = S.count(scope), a = [];
    if (c.words) a.push(c.words + ' 個單字');
    if (c.sentences) a.push(c.sentences + ' 個句子');
    return a.length ? a.join('、') : '還沒有選小單元';
  }
  function label(scope, pack) {
    return pack.name + '・' + (isAll(scope, pack) ? '全部' : S.count(scope).units + ' 個小單元');
  }
  function unitSize(u) { return (u.words || []).length + (u.sentences || []).length; }
  function unitTitle(u) {
    var a = [];
    if (u.words && u.words.length) a.push(u.words.length + ' 個單字');
    if (u.sentences && u.sentences.length) a.push(u.sentences.length + ' 個句子');
    return a.join('、') + (u.optional ? '（選修，「全部」不含）' : '');
  }

  // 課程下拉：有 category 就分層
  function packOptions(cur, other) {
    var list = P.list || [];
    var opt = function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === cur ? ' selected' : '') + '>' + esc(p.name) + '</option>'; };
    if (!list.some(function (p) { return p.category; })) return list.map(opt).join('');
    var order = [], map = {};
    list.forEach(function (p) {
      var c = p.category || other;
      if (!map[c]) { map[c] = []; order.push(c); }
      map[c].push(p);
    });
    return order.map(function (c) { return '<optgroup label="' + esc(c) + '">' + map[c].map(opt).join('') + '</optgroup>'; }).join('');
  }

  function create(host, o) {
    o = o || {};
    var other = o.otherLabel || '其他';
    var id = 'pk' + (++seq);
    var st = { pack: null, scope: null, on: {}, open: -1, loading: '', err: '' };
    var loadSeq = 0;

    host.innerHTML =
      '<div class="pick' + (o.compact ? ' compact' : '') + '">' +
      '<div class="prow"><label class="plb" for="' + id + '_p"><span class="n">1</span>課程</label>' +
      '<div class="pval"><select class="psel" id="' + id + '_p">' + packOptions('', other) + '</select><p class="phint perr" hidden></p></div></div>' +
      '<div class="prow"><div class="plb" id="' + id + '_r"><span class="n">2</span>範圍</div><div class="pval parea"></div></div>' +
      '<div class="prow"><div class="plb"><span class="n">3</span>今天</div><div class="pval psum" aria-live="polite"></div></div>' +
      '</div><p class="phint pnote" hidden></p>';
    var box = host.querySelector('.pick'), sel = box.querySelector('.psel'), area = box.querySelector('.parea'),
      sum = box.querySelector('.psum'), perr = box.querySelector('.perr'), pnote = host.querySelector('.pnote');

    function scopeNow() {
      if (!st.pack) return st.scope;
      var sc = { pack: st.pack.id, units: st.pack.units.filter(function (u) { return st.on[u.id]; }).map(function (u) { return u.id; }) };
      return isAll(sc, st.pack) ? { pack: st.pack.id, units: undefined } : sc;   // 剛好等於預設就不寫 units（網址短）
    }

    function unitBtn(u) {
      return '<button type="button" class="ubtn" data-u="' + esc(u.id) + '" data-k="u:' + esc(u.id) + '" aria-pressed="' + !!st.on[u.id] + '" title="' + esc(unitTitle(u)) + '">' +
        '<span class="nm">' + esc(u.name) + '</span>' + (u.optional ? '<em class="uopt">選修</em>' : '') + '<small>' + unitSize(u) + '</small></button>';
    }
    function panel(g, gi, flat) {
      var n = g.units.filter(function (u) { return st.on[u.id]; }).length;
      return '<div class="upanel' + (flat ? ' flat' : '') + '"' + (flat ? '' : ' id="' + id + '_g' + gi + '" role="region" aria-label="' + esc(g.name) + '"') + '>' +
        '<div class="ph"><b>' + (flat ? '小單元 <small>' + n + '/' + g.units.length + '</small>' : esc(g.name)) + '</b>' +
        '<button type="button" class="chip" data-gall="1" data-k="ga1">全選</button>' +
        '<button type="button" class="chip" data-gall="0" data-k="ga0">全不選</button>' +
        (flat ? '' : '<button type="button" class="chip" data-close data-k="gx">收起</button>') +
        '</div><div class="ulist">' + g.units.map(unitBtn).join('') + '</div></div>';
    }

    function paintArea() {
      if (!st.pack) { area.innerHTML = '<p class="phint">' + (st.err ? '' : '載入中…') + '</p>'; return; }
      var gs = groups(st.pack, other), h = '';
      {   // 沒有「全部／自己選」兩層：直接選，「全部」是全選鈕
        if (gs.length > 1) {
          // 「全部」＝一鍵全選（回到課程預設，不含選修）；已經是全部時亮起
          h += '<div class="caps" role="group" aria-labelledby="' + id + '_r">' +
            '<button type="button" class="cap capall" data-all data-k="all" aria-pressed="' + isAll(scopeNow(), st.pack) + '" title="一次選回全部小單元（不含選修）">全部</button>' +
            gs.map(function (g, i) {
            var n = g.units.filter(function (u) { return st.on[u.id]; }).length;
            var cls = n === g.units.length ? ' all' : n ? ' part' : '';
            return '<button type="button" class="cap' + cls + (st.open === i ? ' open' : '') + '" data-cap="' + i + '" data-k="c:' + i + '" aria-expanded="' + (st.open === i) + '" aria-controls="' + id + '_g' + i + '">' +
              esc(g.name) + '<small>' + n + '/' + g.units.length + '</small><span class="car" aria-hidden="true">▾</span></button>';
          }).join('') + '</div>';
          if (st.open >= 0 && gs[st.open]) h += panel(gs[st.open], st.open, false);
          else h += '<p class="phint">點分類就會展開裡面的小單元。</p>';
        } else {
          h += panel(gs[0], 0, true);
        }
      }
      area.innerHTML = h;
    }
    function paintSum() {
      if (!st.pack) { sum.innerHTML = st.err ? '' : '<span>載入中…</span>'; return; }
      var sc = scopeNow(), c = S.count(sc);
      sum.innerHTML = '<b>' + esc(summary(sc)) + '</b><span>' + esc(st.pack.name) + '・' + (isAll(sc, st.pack) ? '全部' : c.units + ' 個小單元') + '</span>';
    }
    // 重畫後把焦點放回原本那顆按鈕（鍵盤操作不會跳掉）
    function paint() {
      var a = doc.activeElement, k = a && box.contains(a) && a.getAttribute('data-k');
      paintArea(); paintSum();
      if (k) { var b = box.querySelector('[data-k="' + k + '"]'); if (b) b.focus(); }
    }

    function changed() {
      paint();
      var sc = scopeNow();
      if (st.pack && o.live) { S.save(sc); S.syncUrl(sc); }
      if (o.onChange) o.onChange(sc, st.pack);
    }

    function set(scope, pack) {
      loadSeq++;
      st.pack = pack; st.err = ''; perr.hidden = true;
      st.scope = S.clean(scope);
      st.on = {}; S.unitIds(st.scope).forEach(function (u) { st.on[u] = true; });
      st.open = -1;
      sel.innerHTML = packOptions(pack.id, other); sel.value = pack.id;
      paint();
    }

    function switchPack(pid) {
      var my = ++loadSeq;
      st.pack = null; st.scope = { pack: pid }; st.err = ''; perr.hidden = true;
      paint();
      P.load(pid).then(function (pack) {
        if (my !== loadSeq) return;
        set({ pack: pid, units: S.remembered(pid) }, pack);
        changed();
      }, function (e) {
        if (my !== loadSeq) return;
        st.err = e.message || String(e); perr.textContent = st.err; perr.hidden = false;
        paint();
        if (o.onChange) o.onChange(st.scope, null);
      });
    }

    function onClick(e) {
      var b = e.target.closest('button'); if (!b || !box.contains(b) || !st.pack) return;
      var gs = groups(st.pack, other);
      if (b.hasAttribute('data-all')) {
        st.on = {}; S.unitIds({ pack: st.pack.id }).forEach(function (u) { st.on[u] = true; });
      } else if (b.dataset.cap != null) {
        st.open = st.open === +b.dataset.cap ? -1 : +b.dataset.cap;
        paint(); return;   // 只是展開／收起，範圍沒變
      } else if (b.hasAttribute('data-close')) {
        var was = st.open; st.open = -1; paint();
        var c = box.querySelector('[data-cap="' + was + '"]'); if (c) c.focus();
        return;
      } else if (b.dataset.gall != null) {
        var g = gs.length > 1 ? gs[st.open] : gs[0];
        if (!g) return;
        g.units.forEach(function (u) { st.on[u.id] = b.dataset.gall === '1'; });
      } else if (b.dataset.u) {
        st.on[b.dataset.u] = !st.on[b.dataset.u];
      } else return;
      changed();
    }
    function onKey(e) {
      if (e.key === 'Escape' && st.open >= 0 && box.contains(e.target)) {
        var was = st.open; st.open = -1; paint();
        var c = box.querySelector('[data-cap="' + was + '"]'); if (c) c.focus();
        e.stopPropagation();
      }
    }
    function onSel() { switchPack(sel.value); }
    box.addEventListener('click', onClick);
    box.addEventListener('keydown', onKey);
    sel.addEventListener('change', onSel);

    if (o.scope && o.pack) set(o.scope, o.pack); else paint();

    return {
      value: function () { return { scope: scopeNow(), pack: st.pack }; },
      set: set,
      note: function (t) { pnote.textContent = t || ''; pnote.hidden = !t; },
      focus: function () { sel.focus(); },
      destroy: function () {
        loadSeq++;
        box.removeEventListener('click', onClick); box.removeEventListener('keydown', onKey); sel.removeEventListener('change', onSel);
        host.innerHTML = '';
      },
    };
  }

  root.JP_PICKER = { create: create, groups: groups, isAll: isAll, label: label, summary: summary };
})(window);
