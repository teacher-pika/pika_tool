#!/usr/bin/env node
/* check_packs.js — 課程包格式檢查
 *
 * 用法：
 *   node tools/check_packs.js            檢查 data/packs.js 列出的全部課程
 *   node tools/check_packs.js adj        只檢查某個課程
 *
 * 會用和網頁一樣的 js/core/registry.js 載入 data/packs.js 與各課程檔，檢查：
 *   - 課程清單：id 唯一、file 存在、課程檔裡登記的 id 和清單一致；category 選填，有寫就要是非空字串
 *   - 課程：id／name 必填；小單元 id 唯一、id／name 必填、至少有 words 或 sentences
 *   - 題目：zh／jp 必填；jp 的 [ ] 成對、| 沒有多餘、含漢字或數字的段落有 [讀音]、讀音只用假名
 *   - avoid：每組至少 2 個字，每個字（表面文字）都要在這個課程裡找得到
 * 印出每個課程的小單元數、單字數、句子數、avoid 組數。有錯誤時結束代碼為 1（警告不算錯誤）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const N5 = path.resolve(__dirname, '..', '03_jp', 'n5');
const DATA = path.join(N5, 'data');

// 準備一個像瀏覽器的環境，讓 registry.js 用同步方式載入課程檔
const ctx = vm.createContext({ console });
ctx.globalThis = ctx;
function run(file) { vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file }); }
run(path.join(N5, 'js', 'core', 'registry.js'));
const P = ctx.JP_PACKS;
P.base = DATA + path.sep;
P.loader = (url, done, fail) => { try { run(url); done(); } catch (e) { fail(e); } };
run(path.join(DATA, 'packs.js'));

const KANJI = /[㐀-鿿豈-﫿々〆ヵヶ0-9０-９]/;
const KANA_READING = /^[ぁ-ゟ゠-ヿー]+$/;   // 讀音只能是平假名／片假名／長音
const surface = P.surface;

let errors = 0, warns = 0;
const err = (where, msg) => { errors++; console.log('  錯誤 ' + where + '：' + msg); };
const wrn = (where, msg) => { warns++; console.log('  警告 ' + where + '：' + msg); };

function checkJp(jp, where) {
  if (typeof jp !== 'string' || !jp) return err(where, 'jp 是空的');
  if (/^\||\|$|\|\|/.test(jp)) err(where, '| 多餘或少掉（開頭、結尾或連續 ||）：' + jp);
  for (const seg of jp.split('|')) {
    const s = seg.replace(/\*$/, '');
    if (s.includes('*')) err(where, '* 只能放在段尾：' + seg);
    // 括號成對、不巢狀
    let depth = 0;
    for (const ch of s) {
      if (ch === '[') { if (++depth > 1) { err(where, '[ ] 巢狀：' + seg); break; } }
      else if (ch === ']') { if (--depth < 0) { err(where, '多了 ]：' + seg); break; } }
    }
    if (depth > 0) { err(where, '少了 ]：' + seg); continue; }
    // 讀音內容
    for (const m of s.matchAll(/\[([^\]]*)\]/g)) {
      if (!m[1]) err(where, '讀音是空的：' + seg);
      else if (!KANA_READING.test(m[1])) wrn(where, '讀音裡有假名以外的字「' + m[1] + '」：' + seg);
    }
    // 括號外面的漢字／數字沒有讀音
    // 把「xx[讀音]」整個拿掉，剩下的就是沒標讀音的部分（例如讀音後面又接漢字，也會被抓到）
    const outside = s.replace(/[^\[\]]*\[[^\]]*\]/g, '');
    if (KANJI.test(outside)) err(where, '含漢字或數字的段落沒有 [讀音]：「' + seg + '」（' + jp + '）');
  }
}

function checkItem(it, where) {
  if (!it || typeof it !== 'object') return err(where, '題目不是物件');
  if (typeof it.zh !== 'string' || !it.zh.trim()) err(where, '缺少 zh');
  checkJp(it.jp, where + ' ' + (it.jp || ''));
}

async function checkPack(info) {
  const label = '[' + info.id + ']';
  console.log('\n' + label + ' ' + info.name + '（data/' + info.file + '）');
  if (!fs.existsSync(path.join(DATA, info.file))) { err(label, '找不到檔案 data/' + info.file); return; }
  let pack;
  try { pack = await P.load(info.id); } catch (e) { err(label, e.message); return; }
  if (!pack.name) err(label, '課程缺少 name');

  const unitIds = new Set();
  const surfaces = new Set();
  let nw = 0, ns = 0;
  pack.units.forEach((u, i) => {
    const where = label + ' 小單元 #' + (i + 1) + (u.id ? ' ' + u.id : '');
    if (!u.id) err(where, '缺少 id');
    else if (unitIds.has(u.id)) err(where, '小單元 id 重複');
    else unitIds.add(u.id);
    if (u.id && !/^[A-Za-z0-9_-]+$/.test(u.id)) wrn(where, 'id 建議只用英數字、- 與 _（會放進網址）');
    if (!u.name) err(where, '缺少 name');
    const hasW = Array.isArray(u.words) && u.words.length, hasS = Array.isArray(u.sentences) && u.sentences.length;
    if (!hasW && !hasS) err(where, '至少要有 words 或 sentences');
    for (const k of ['words', 'sentences']) {
      if (u[k] !== undefined && !Array.isArray(u[k])) err(where, k + ' 必須是陣列');
    }
    (u.words || []).forEach((w, j) => { checkItem(w, where + ' 單字 #' + (j + 1)); surfaces.add(surface(w.jp || '')); });
    (u.sentences || []).forEach((s, j) => checkItem(s, where + ' 句子 #' + (j + 1)));
    nw += (u.words || []).length; ns += (u.sentences || []).length;
  });

  // avoid：字要在這個課程裡（單字的表面文字，或句子裡某一段的表面文字）
  const segs = new Set();
  pack.units.forEach(u => (u.sentences || []).forEach(s => (s.jp || '').split('|').forEach(seg => segs.add(surface(seg)))));
  (pack.avoid || []).forEach((g, i) => {
    const where = label + ' avoid #' + (i + 1);
    if (!Array.isArray(g) || g.length < 2) return err(where, '每組至少要有 2 個字');
    for (const x of g) if (!surfaces.has(x) && !segs.has(x)) err(where, '「' + x + '」不在這個課程裡');
  });

  const opt = pack.units.filter(u => u.optional).length;
  console.log('  小單元 ' + pack.units.length + (opt ? '（其中 optional ' + opt + '）' : '') +
    '、單字 ' + nw + '、句子 ' + ns + '、avoid ' + (pack.avoid || []).length + ' 組');
}

(async () => {
  const only = process.argv[2];
  const ids = new Set();
  for (const info of P.list) {
    if (!info.id || !info.name || !info.file) err('[packs.js]', '每一筆都要有 id、name、file：' + JSON.stringify(info));
    if (ids.has(info.id)) err('[packs.js]', '課程 id 重複：' + info.id);
    if (info.category !== undefined && (typeof info.category !== 'string' || !info.category.trim())) err('[packs.js]', 'category 有寫就要是非空字串：' + JSON.stringify(info));
    ids.add(info.id);
  }
  const list = only ? P.list.filter(i => i.id === only) : P.list;
  if (only && !list.length) err('[packs.js]', '沒有「' + only + '」這個課程');
  for (const info of list) await checkPack(info);
  console.log('\n結果：錯誤 ' + errors + '、警告 ' + warns);
  process.exit(errors ? 1 : 0);
})();
