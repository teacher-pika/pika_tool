/* registry.js — 課程包登記與載入（window.JP_PACKS）
 * ============================================================================
 * 載入順序（一般 <script>，不用 module，file:// 直接點開也能用）：
 *   <script src="js/core/registry.js"></script>   ← 先建立 JP_PACKS
 *   <script src="data/packs.js"></script>          ← 填入 JP_PACKS.list（課程清單）
 *   <script src="js/core/scope.js"></script>       ← 範圍（選了哪些小單元）
 * 課程檔（data/adj.js 等）不用寫在頁面上，由 JP_PACKS.load(id) 需要時才動態插入 <script>。
 *
 * 用法：
 *   JP_PACKS.list                 課程清單 [{ id, name, file, category? }]（data/packs.js 填入）
 *                                 category 選填（例如「單字」「文法」）：選範圍的課程下拉用它分層（js/core/picker.js）
 *   JP_PACKS.info(id)             清單裡的那一筆（沒有就 null）
 *   JP_PACKS.add(pack)            課程檔呼叫，登記一個課程包
 *   JP_PACKS.get(id)              已載入的課程包（還沒載就 null）
 *   JP_PACKS.load(id) → Promise   載入課程包；已載過直接回傳。找不到／載入失敗會 reject(Error)，
 *                                 err.message 是可以直接顯示給使用者看的中文。
 *   JP_PACKS.surface(jp)          表面文字：去掉 [讀音]、| 與 *（avoid 用這個比對）
 *   JP_PACKS.base                 課程檔所在資料夾；預設依 registry.js 的位置推算成 ../../data/
 *   JP_PACKS.loader(url, done, fail)  實際載入檔案的函式；預設插入 <script>。測試時可以換掉。
 *
 * 課程包格式（data/*.js）：
 *   JP_PACKS.add({
 *     id:'adj', name:'N5 形容詞',           // 必填
 *     credit:'…HTML…',                      // 選填，頁面底部的來源標示
 *     units:[                                // 小單元
 *       { id:'g24', group:'い形容詞', name:'大小・形狀・輕重',   // id、name 必填；group 選填（分區標題）
 *         optional:true,                     // 選填，預設不勾
 *         words:[ { zh:'大的', jp:'大[おお]|きい' } ],            // words、sentences 至少要有一個
 *         sentences:[ { zh:'今天很熱。', jp:'今日[きょう]|は|暑[あつ]|い*|です*|。' } ] },
 *     ],
 *     avoid:[ ['それ','あれ'] ],             // 選填，不要出現在同一題選擇題的字（表面文字）
 *   });
 *   題目的 zh、jp 必填；pos（詞性）、vg（動詞分組）、no（原表編號）選填。jp 寫法見 docs/資料-題庫格式.md。
 * ============================================================================ */
(function (root) {
  'use strict';

  // 依 registry.js 自己的位置推算 data/ 資料夾（js/core/registry.js → ../../data/）
  function defaultBase() {
    try {
      var cs = root.document && root.document.currentScript;
      if (cs && cs.src) return new URL('../../data/', cs.src).href;
    } catch (e) { /* 舊瀏覽器沒有 URL，就用相對路徑 */ }
    return 'data/';
  }

  var packs = {};      // id → 已登記的課程包
  var loading = {};    // id → 進行中的 Promise

  var JP_PACKS = root.JP_PACKS || {};
  JP_PACKS.list = JP_PACKS.list || [];
  JP_PACKS.base = JP_PACKS.base || defaultBase();

  JP_PACKS.info = function (id) {
    for (var i = 0; i < JP_PACKS.list.length; i++) if (JP_PACKS.list[i].id === id) return JP_PACKS.list[i];
    return null;
  };

  JP_PACKS.add = function (pack) {
    if (!pack || typeof pack.id !== 'string' || !pack.id) throw new Error('JP_PACKS.add：課程包缺少 id');
    if (!Array.isArray(pack.units)) throw new Error('JP_PACKS.add：課程「' + pack.id + '」缺少 units');
    pack.avoid = pack.avoid || [];
    packs[pack.id] = pack;
    return pack;
  };

  JP_PACKS.get = function (id) { return packs[id] || null; };

  // 預設的檔案載入方式：動態插入 <script>（file:// 也能用；fetch 在 file:// 不行）
  JP_PACKS.loader = function (url, done, fail) {
    var s = root.document.createElement('script');
    s.src = url;
    s.charset = 'utf-8';
    s.onload = done;
    s.onerror = function () { fail(new Error('讀不到檔案')); };
    root.document.head.appendChild(s);
  };

  JP_PACKS.load = function (id) {
    if (packs[id]) return Promise.resolve(packs[id]);
    if (loading[id]) return loading[id];
    var info = JP_PACKS.info(id);
    if (!info) return Promise.reject(new Error('課程清單（data/packs.js）裡沒有「' + id + '」這個課程'));
    var url = JP_PACKS.base + info.file;
    loading[id] = new Promise(function (resolve, reject) {
      JP_PACKS.loader(url, function () {
        if (packs[id]) resolve(packs[id]);
        else reject(new Error('課程檔 ' + info.file + ' 載入了，但裡面沒有登記 id 為「' + id + '」的課程（檢查 JP_PACKS.add 的 id）'));
      }, function (err) {
        reject(new Error('無法載入課程「' + info.name + '」：找不到或讀不到 data/' + info.file +
          (err && err.message && err.message !== '讀不到檔案' ? '（' + err.message + '）' : '')));
      });
    });
    // 失敗就清掉，下次可以重試
    loading[id].catch(function () { delete loading[id]; });
    return loading[id];
  };

  JP_PACKS.surface = function (jp) {
    return String(jp).replace(/\[[^\]]*\]/g, '').replace(/[|*]/g, '');
  };

  root.JP_PACKS = JP_PACKS;
})(typeof window !== 'undefined' ? window : globalThis);
