/* packs.js — 課程清單（手寫維護，convert_raw.js 不會動這個檔）
 * 每一筆：id 要和課程檔裡 JP_PACKS.add({ id }) 相同；file 是 data/ 底下的檔名。
 * category 選填：首頁「課程」下拉用它分層（依出現順序）；全部都沒寫就平列。
 * 第一筆是沒有任何記錄時的預設課程。新增課程：在 data/ 放課程檔，再在這裡加一行。 */
JP_PACKS.list = [
  { id:'grammar', name:'文法句 第 1〜20 課', file:'grammar-01-20.js', category:'文法' },
  { id:'adj',     name:'N5 形容詞',          file:'adj.js',           category:'單字' },
  { id:'n5words', name:'N5 單字 747',        file:'n5words.js',       category:'單字' },
];
