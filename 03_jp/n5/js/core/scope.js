/* scope.js — 今天的範圍：選了哪個課程、哪些小單元（window.JP_SCOPE）
 * ============================================================================
 * 需要先載入 registry.js 與 data/packs.js。
 *
 * 範圍狀態（scope）：
 *   { pack:'adj', units:['g24','A1'] }
 *   units 省略（undefined）＝「該課程全部非 optional 的小單元」。
 *
 * 來源優先序：網址 ?pack=adj&units=g24,A1 ＞ localStorage 上次的選擇 ＞ 課程清單第一個。
 *   網址或記錄裡不存在的課程／小單元 id 會被忽略，不會壞掉。
 *
 * 用法：
 *   JP_SCOPE.resolve() → Promise<{ scope, pack, source, notes }>
 *       依優先序決定範圍並載入課程包。source 是 'url'｜'storage'｜'default'；
 *       notes 是被忽略的東西的中文說明（可顯示給使用者，也可不理）。
 *   JP_SCOPE.clean(scope)            → 去掉不存在的小單元後的新 scope（課程要已載入）
 *   JP_SCOPE.unitIds(scope)          → 實際選到的小單元 id 陣列（展開「省略＝預設」，依課程裡的順序）
 *   JP_SCOPE.defaultUnits(pack)      → 該課程預設勾選的小單元 id（非 optional）
 *   JP_SCOPE.getItems(scope)         → { words:[…], sentences:[…] }
 *       每個題目是原題目的複本，另外加上 unit（小單元 id）、unitName、unitGroup，
 *       之後玩法可以顯示「第 3 課 〜」這類標籤、成績可以依 unit 分單元統計。
 *   JP_SCOPE.count(scope)            → { units, words, sentences }（數量）
 *   JP_SCOPE.available(scope, needs) → needs 是 ['words']、['sentences'] 或兩者；目前範圍都有才回 true。
 *       之後各玩法向核心登記時標明自己的 needs，用這個判斷能不能玩。
 *   JP_SCOPE.query(scope)            → '?pack=adj&units=g24,A1'（units 一律明確寫出；連到 battle.html 等其他頁用）
 *   JP_SCOPE.link(scope)             → 分享連結（目前網址 + ?pack=…&units=…，units 一律明確寫出）
 *   JP_SCOPE.save(scope)             → 記在 localStorage（上次的選擇，以及每個課程各自的選擇）
 *   JP_SCOPE.remembered(packId)      → 這個課程上次選的 units（沒記錄就 undefined）
 *   JP_SCOPE.syncUrl(scope)          → 把網址列換成目前範圍（不重新載入；不支援就略過）
 *   JP_SCOPE.store.get(key, 預設)／.set(key, 值)
 *       localStorage 存取（自動加前綴 pk_jp_、JSON 編碼、try/catch）。玩法的設定也請用這個。
 * ============================================================================ */
(function (root) {
  'use strict';
  var P = root.JP_PACKS;
  if (!P) throw new Error('scope.js 需要先載入 registry.js');

  var PREFIX = 'pk_jp_';

  // ── localStorage（無痕模式、被封鎖、node 測試時都可能不能用）──
  var store = {
    prefix: PREFIX,
    get: function (key, def) {
      try {
        var v = root.localStorage.getItem(PREFIX + key);
        return v === null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set: function (key, val) {
      try {
        if (val === undefined) root.localStorage.removeItem(PREFIX + key);
        else root.localStorage.setItem(PREFIX + key, JSON.stringify(val));
        return true;
      } catch (e) { return false; }
    },
  };

  function splitIds(s) {
    return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  }

  // 網址 → 原始 scope（還沒驗證）；網址沒有 pack 就回 null
  function parseUrl(search) {
    if (search === undefined) { try { search = root.location.search; } catch (e) { search = ''; } }
    var q = {};
    String(search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      var k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? '' : kv.slice(i + 1);
      try { q[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { /* 壞掉的編碼就略過 */ }
    });
    if (!q.pack) return null;
    var units = splitIds(q.units);
    return { pack: q.pack, units: units.length ? units : undefined };
  }

  function packOf(scope) {
    var pack = scope && P.get(scope.pack);
    if (!pack) throw new Error('課程「' + (scope && scope.pack) + '」還沒載入，請先 JP_PACKS.load()');
    return pack;
  }

  function defaultUnits(pack) {
    return pack.units.filter(function (u) { return !u.optional; }).map(function (u) { return u.id; });
  }

  // 去掉不存在的小單元；全部都不存在就當作省略（＝預設）。回傳 { scope, dropped:[…] }
  function cleanWithInfo(scope) {
    var pack = packOf(scope);
    if (!Array.isArray(scope.units)) return { scope: { pack: pack.id, units: undefined }, dropped: [] };
    var has = {}, dropped = [], keep = {};
    pack.units.forEach(function (u) { has[u.id] = true; });
    scope.units.forEach(function (id) { if (has[id]) keep[id] = true; else dropped.push(id); });
    // 依課程裡的順序排、去重複
    var units = pack.units.filter(function (u) { return keep[u.id]; }).map(function (u) { return u.id; });
    if (!units.length && scope.units.length) units = undefined;
    return { scope: { pack: pack.id, units: units }, dropped: dropped };
  }

  function unitIds(scope) {
    var pack = packOf(scope);
    if (!Array.isArray(scope.units)) return defaultUnits(pack);
    var want = {};
    scope.units.forEach(function (id) { want[id] = true; });
    return pack.units.filter(function (u) { return want[u.id]; }).map(function (u) { return u.id; });
  }

  function selectedUnits(scope) {
    var pack = packOf(scope), ids = unitIds(scope), want = {};
    ids.forEach(function (id) { want[id] = true; });
    return pack.units.filter(function (u) { return want[u.id]; });
  }

  function tag(item, u) {
    var o = {};
    for (var k in item) if (Object.prototype.hasOwnProperty.call(item, k)) o[k] = item[k];
    o.unit = u.id;
    o.unitName = u.name;
    o.unitGroup = u.group || '';
    return o;
  }

  function getItems(scope) {
    var out = { words: [], sentences: [] };
    selectedUnits(scope).forEach(function (u) {
      (u.words || []).forEach(function (w) { out.words.push(tag(w, u)); });
      (u.sentences || []).forEach(function (s) { out.sentences.push(tag(s, u)); });
    });
    return out;
  }

  function count(scope) {
    var c = { units: 0, words: 0, sentences: 0 };
    selectedUnits(scope).forEach(function (u) {
      c.units++;
      c.words += (u.words || []).length;
      c.sentences += (u.sentences || []).length;
    });
    return c;
  }

  function available(scope, needs) {
    var c = count(scope);
    return (needs || []).every(function (k) { return c[k] > 0; });
  }

  function query(scope) {
    return '?pack=' + encodeURIComponent(scope.pack) + '&units=' + unitIds(scope).map(encodeURIComponent).join(',');
  }

  function link(scope, href) {
    if (href === undefined) { try { href = root.location.href; } catch (e) { href = ''; } }
    return String(href).replace(/[?#].*$/, '') + query(scope);
  }

  function save(scope) {
    var s = { pack: scope.pack, units: Array.isArray(scope.units) ? scope.units.slice() : undefined };
    store.set('scope', s);
    store.set('units_' + scope.pack, s.units === undefined ? null : s.units);
  }

  function remembered(packId) {
    var u = store.get('units_' + packId, null);
    return Array.isArray(u) && u.length ? u : undefined;
  }

  function syncUrl(scope) {
    try { root.history.replaceState(null, '', query(scope) + (root.location.hash || '')); } catch (e) { /* file:// 某些瀏覽器不允許，略過 */ }
  }

  // 依優先序決定範圍並載入課程
  function resolve() {
    var notes = [], firstErr = null;
    var list = P.list || [];
    var cands = [];
    var fromUrl = parseUrl();
    if (fromUrl) cands.push({ src: 'url', scope: fromUrl, label: '網址' });
    var saved = store.get('scope', null);
    if (saved && typeof saved.pack === 'string')
      cands.push({ src: 'storage', scope: { pack: saved.pack, units: Array.isArray(saved.units) && saved.units.length ? saved.units : undefined }, label: '上次的記錄' });
    if (list[0]) cands.push({ src: 'default', scope: { pack: list[0].id, units: undefined }, label: '預設' });

    function next(i) {
      if (i >= cands.length) {
        return Promise.reject(firstErr || new Error('課程清單是空的，請檢查 data/packs.js'));
      }
      var c = cands[i];
      if (!P.info(c.scope.pack)) {
        notes.push(c.label + '裡的課程「' + c.scope.pack + '」不存在，已略過');
        return next(i + 1);
      }
      return P.load(c.scope.pack).then(function (pack) {
        var r = cleanWithInfo(c.scope);
        if (r.dropped.length) notes.push(c.label + '裡有不存在的小單元，已略過：' + r.dropped.join('、'));
        return { scope: r.scope, pack: pack, source: c.src, notes: notes };
      }, function (err) {
        firstErr = firstErr || err;
        notes.push(err.message);
        return next(i + 1);
      });
    }
    return next(0);
  }

  root.JP_SCOPE = {
    store: store,
    parseUrl: parseUrl,
    resolve: resolve,
    clean: function (scope) { return cleanWithInfo(scope).scope; },
    unitIds: unitIds,
    defaultUnits: defaultUnits,
    getItems: getItems,
    count: count,
    available: available,
    query: query,
    link: link,
    save: save,
    remembered: remembered,
    syncUrl: syncUrl,
  };
})(typeof window !== 'undefined' ? window : globalThis);
