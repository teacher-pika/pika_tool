/* util.js — 共用小工具（window.JP_UTIL）
 * ============================================================================
 * 不碰 DOM。需要先載入 scope.js（store 沿用 JP_SCOPE.store）。
 *
 *   JP_UTIL.esc(s)                 HTML 跳脫
 *   JP_UTIL.shuffle(arr)           洗牌（回傳新陣列，不改原陣列）
 *   JP_UTIL.sample(arr, n)         隨機取 n 個（不重複）
 *   JP_UTIL.fmtClock(秒)           '1:05'
 *   JP_UTIL.fmtDur(秒)             '1 分 5 秒'
 *   JP_UTIL.store                  = JP_SCOPE.store（get(key, 預設)／set(key, 值)，前綴 pk_jp_）
 *   JP_UTIL.storeFor(name)         加上自己前綴的 store：storeFor('quiz').get('type') 實際存在 pk_jp_quiz_type
 *                                  （玩法拿到的 ctx.store 就是 storeFor(玩法 id)）
 *   JP_UTIL.csv(rows)              二維陣列 → CSV 字串（逗號、引號、換行會正確處理）
 *
 * 選擇題干擾選項（之後其他玩法要「從題庫挑幾個不一樣的」也可以用）：
 *   JP_UTIL.meaningKeys(zh)        中文意思拆成比對用的關鍵詞：去括號、依「、／，」拆開、去掉結尾的「的」
 *   JP_UTIL.sameMeaning(a, b)      兩個中文意思有任一關鍵詞相同就算同義（例：「高、貴」與「貴的」）
 *   JP_UTIL.avoidOf(pack)          → fn(表面文字A, 表面文字B)：兩者在課程 avoid 的同一組就回 true
 *   JP_UTIL.pick(opts) → 挑出的陣列（可能少於 n 個，題庫太小時）
 *       opts.pools    [陣列, 陣列…]  依序從前面的池子挑，不夠再往後補（例：[目前範圍, 整個課程]）
 *       opts.n        要幾個
 *       opts.key(x)   去重用的鍵（例：表面文字）；和 opts.taken 裡的鍵或已挑的重複就跳過
 *       opts.taken    一開始就算「已用掉」的鍵（例：正解的鍵）
 *       opts.ok(x, chosen)  回 false 就不要（例：和正解或已挑的同義、在 avoid 同一組）；chosen 含已挑的
 *       opts.order(arr)     選填：洗牌後再排序（例：讀音長度接近的優先）
 * ============================================================================ */
(function (root) {
  'use strict';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.random() * (i + 1) | 0, t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function sample(a, n) { return shuffle(a).slice(0, n); }

  function fmtClock(sec) { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + ('0' + sec % 60).slice(-2); }
  function fmtDur(sec) { sec = Math.max(0, Math.round(sec)); var m = Math.floor(sec / 60); return (m ? m + ' 分 ' : '') + sec % 60 + ' 秒'; }

  var store = (root.JP_SCOPE && root.JP_SCOPE.store) || { get: function (k, d) { return d; }, set: function () { return false; } };
  function storeFor(name) {
    return {
      get: function (k, d) { return store.get(name + '_' + k, d); },
      set: function (k, v) { return store.set(name + '_' + k, v); },
    };
  }

  function csv(rows) {
    return rows.map(function (r) {
      return r.map(function (v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',');
    }).join('\r\n');
  }

  function meaningKeys(zh) {
    var s = String(zh).replace(/（[^）]*）|\([^)]*\)/g, '').replace(/[～〜~…。！？!?]/g, '');
    var keys = s.split(/[、，,／\/；;]/).map(function (x) { return x.trim().replace(/的$/, ''); }).filter(Boolean);
    return keys.length ? keys : [String(zh).trim()];
  }
  function sameMeaning(a, b) {
    var ka = meaningKeys(a), kb = meaningKeys(b);
    return ka.some(function (x) { return kb.indexOf(x) >= 0; });
  }

  function avoidOf(pack) {
    var groups = {};   // 表面文字 → [組別編號]
    (pack && pack.avoid || []).forEach(function (g, gi) {
      g.forEach(function (w) { (groups[w] = groups[w] || []).push(gi); });
    });
    return function (a, b) {
      var ga = groups[a], gb = groups[b];
      if (!ga || !gb) return false;
      return ga.some(function (x) { return gb.indexOf(x) >= 0; });
    };
  }

  function pick(o) {
    var used = {}, chosen = [];
    (o.taken || []).forEach(function (k) { used[k] = true; });
    var pools = o.pools || [];
    for (var p = 0; p < pools.length && chosen.length < o.n; p++) {
      var arr = shuffle(pools[p] || []);
      if (o.order) arr = o.order(arr);
      for (var i = 0; i < arr.length && chosen.length < o.n; i++) {
        var x = arr[i], k = o.key ? o.key(x) : x;
        if (used[k]) continue;
        if (o.ok && !o.ok(x, chosen)) continue;
        used[k] = true; chosen.push(x);
      }
    }
    return chosen;
  }

  root.JP_UTIL = {
    esc: esc, shuffle: shuffle, sample: sample, fmtClock: fmtClock, fmtDur: fmtDur,
    store: store, storeFor: storeFor, csv: csv,
    meaningKeys: meaningKeys, sameMeaning: sameMeaning, avoidOf: avoidOf, pick: pick,
  };
})(typeof window !== 'undefined' ? window : globalThis);
