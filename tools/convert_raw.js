#!/usr/bin/env node
/* convert_raw.js — 一次性轉檔：raw_source/ 的舊題庫 → 03_jp/n5/data/*.js（課程包標準格式）
 *
 * 用法（在專案根目錄或任何地方都可以）：
 *   node tools/convert_raw.js
 *
 * - 只讀 raw_source/，不會改動它；每次執行都會整份覆寫 data/grammar-01-20.js、adj.js、n5words.js。
 * - data/packs.js（課程清單）是手寫的，這個腳本不會動它。
 * - 轉檔時發現的資料問題會印成「警告」，不會中斷。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'raw_source');
const OUT = path.join(ROOT, '03_jp', 'n5', 'data');
const J = x => JSON.stringify(x);   // 字串用 JSON 寫法（雙引號），日文照原樣輸出
const warnings = [];
const warn = msg => { warnings.push(msg); console.log('  警告：' + msg); };

// 表面文字：jp 去掉 [讀音]、| 與 *（avoid 用這個比對）
const surface = jp => jp.replace(/\[[^\]]*\]/g, '').replace(/[|*]/g, '');

// ── 讀舊資料 ───────────────────────────────────────────────
function readRequire(file) { return require(path.join(RAW, file)); }

// 從單檔 HTML 取出內嵌的 window.JP_DATA
function readJpDataFromHtml(file) {
  const html = fs.readFileSync(path.join(RAW, file), 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const code = blocks.find(b => b.includes('window.JP_DATA = {'));
  if (!code) throw new Error(file + ' 裡找不到 window.JP_DATA');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox, { filename: file });
  return sandbox.window.JP_DATA;
}

// 從 make_adj.py 取出 CREDIT_OLD／CREDIT_NEW 字串
function readCredit(name) {
  const py = fs.readFileSync(path.join(RAW, 'make_adj.py'), 'utf8');
  const m = py.match(new RegExp('^' + name + "='([^'\\n]*)'", 'm'));
  if (!m) throw new Error('make_adj.py 裡找不到 ' + name);
  return m[1];
}

// ── 輸出 ───────────────────────────────────────────────────
function itemLine(it, keys) {
  return '{ ' + keys.filter(k => it[k] !== undefined).map(k => k + ':' + J(it[k])).join(', ') + ' }';
}
function writePack(file, pack, note) {
  const L = [];
  L.push('/* ' + file + ' — ' + pack.name);
  L.push(' * 由 tools/convert_raw.js 從 raw_source/ 自動產生（' + note + '）');
  L.push(' * 要改內容可以直接改這個檔；但重跑 convert_raw.js 會整份覆寫，改之前先想清楚要改哪一邊。');
  L.push(' * 格式說明見 js/core/registry.js 檔頭。 */');
  L.push('JP_PACKS.add({');
  L.push('  id: ' + J(pack.id) + ',');
  L.push('  name: ' + J(pack.name) + ',');
  if (pack.credit) L.push('  credit: ' + J(pack.credit) + ',');
  L.push('  units: [');
  for (const u of pack.units) {
    const head = ['id:' + J(u.id)];
    if (u.group) head.push('group:' + J(u.group));
    head.push('name:' + J(u.name));
    if (u.optional) head.push('optional:true');
    L.push('    { ' + head.join(', ') + ',');
    for (const kind of ['words', 'sentences']) {
      if (!u[kind]) continue;
      L.push('      ' + kind + ':[');
      for (const it of u[kind]) L.push('        ' + itemLine(it, ['zh', 'jp', 'pos', 'vg', 'no']) + ',');
      L.push('      ],');
    }
    L.push('    },');
  }
  L.push('  ],');
  L.push('  avoid: [');
  for (const a of pack.avoid || []) L.push('    ' + J(a) + ',');
  L.push('  ],');
  L.push('});');
  L.push('');
  fs.writeFileSync(path.join(OUT, file), L.join('\n'), 'utf8');
  const w = pack.units.reduce((n, u) => n + (u.words || []).length, 0);
  const s = pack.units.reduce((n, u) => n + (u.sentences || []).length, 0);
  console.log('  → data/' + file + '：' + pack.units.length + ' 個小單元、' + w + ' 個單字、' + s + ' 個句子、avoid ' + (pack.avoid || []).length + ' 組');
}

// 把「用 no 表示的組」轉成表面文字的組；只保留 inPack 裡有的字，剩不到 2 個就丟掉
function avoidFromNos(groups, byNo, label) {
  const out = [];
  for (const g of groups) {
    const ws = g.map(no => byNo.get(no)).filter(Boolean);
    const surf = [...new Set(ws.map(w => surface(w.jp)))];
    if (ws.length >= 2 && surf.length < 2)
      warn(label + '：no ' + g.join(',') + ' 的表面文字都是「' + surf[0] + '」，轉成 avoid 後沒有作用（同字不同讀音／意思）');
    if (surf.length >= 2) out.push(surf);
  }
  return out;
}

// 表面文字重複檢查：avoid 用表面文字比對，同一個表面文字對應到多個字時，avoid 會一起套用到它們
function checkSurfaceDup(allWords, avoid, label) {
  const map = new Map();
  for (const w of allWords) {
    const s = surface(w.jp);
    if (!map.has(s)) map.set(s, []);
    map.get(s).push(w);
  }
  const inAvoid = new Set(avoid.flat());
  for (const [s, ws] of map) {
    if (ws.length < 2) continue;
    const desc = ws.map(w => (w.no ? 'no ' + w.no + ' ' : '') + w.jp + '「' + w.zh + '」').join('／');
    if (inAvoid.has(s)) warn(label + '：表面文字「' + s + '」有 ' + ws.length + ' 個字（' + desc + '），avoid 裡出現它時會同時套用到這些字（有歧義）');
    else warn(label + '：表面文字「' + s + '」重複 ' + ws.length + ' 次（' + desc + '）；不在 avoid 裡，只是提醒');
  }
}

fs.mkdirSync(OUT, { recursive: true });

// ═══ 1. 文法句 第 1〜20 課 ═══════════════════════════════════
console.log('\n[grammar] 讀 quiz-single.html');
{
  const D = readJpDataFromHtml('quiz-single.html');
  // 順便比對另外兩個單檔版的 lessons 是否一致
  for (const f of ['battle-single.html', 'fall-single.html']) {
    try {
      const o = readJpDataFromHtml(f);
      if (J(o.lessons) !== J(D.lessons)) warn(f + ' 的 lessons 和 quiz-single.html 不一致，以 quiz-single.html 為準');
      if (J(o.confusable) !== J(D.confusable)) warn(f + ' 的 confusable 和 quiz-single.html 不一致，以 quiz-single.html 為準');
    } catch (e) { warn('讀 ' + f + ' 失敗：' + e.message); }
  }
  console.log('  略過舊的 words（' + D.words.length + ' 個無來源單字，依規格不搬）');
  const units = D.lessons.map(l => ({
    id: 'L' + String(l.no).padStart(2, '0'),
    group: l.no <= 10 ? '第 1〜10 課' : '第 11〜20 課',
    name: '第 ' + l.no + ' 課　' + l.title,
    sentences: l.sentences.map(s => ({ zh: s.zh, jp: s.jp })),
  }));
  // confusable → avoid：只留在句子裡真的出現過的字（不然 check_packs 會報錯，也沒有作用）
  function grammarAvoid(conf, units) {
    const segs = new Set();
    units.forEach(u => u.sentences.forEach(s => s.jp.split('|').forEach(seg => segs.add(surface(seg)))));
    const out = [];
    for (const g of conf) {
      const keep = g.filter(x => segs.has(x));
      const miss = g.filter(x => !segs.has(x));
      if (miss.length) warn('grammar：confusable ' + J(g) + ' 裡的「' + miss.join('」「') + '」沒有出現在任何句子裡' + (keep.length >= 2 ? '，已移除' : '，整組不搬'));
      if (keep.length >= 2) out.push(keep);
    }
    return out;
  }
  writePack('grammar-01-20.js', {
    id: 'grammar', name: '文法句 第 1〜20 課', credit: readCredit('CREDIT_OLD'),
    units, avoid: grammarAvoid(D.confusable || [], units),
  }, 'quiz-single.html 內嵌的 window.JP_DATA.lessons 與 confusable');
}

// ═══ 3（先讀）. N5 單字 747 ══════════════════════════════════
console.log('\n[n5words] 讀 dataN5word.js');
const N5 = readRequire('dataN5word.js');
const n5ByNo = new Map();
for (const g of N5.groups) for (const w of g.words) {
  if (n5ByNo.has(w.no)) warn('dataN5word.js：no ' + w.no + ' 重複出現');
  n5ByNo.set(w.no, Object.assign({ cat: g.cat, gname: g.name }, w));
}
for (const g of N5.homophones.concat(N5.sameMeaning))
  for (const no of g) if (!n5ByNo.has(no)) warn('dataN5word.js：homophones／sameMeaning 裡的 no ' + no + ' 找不到對應的字');
{
  const units = N5.groups.map(g => {
    const u = { id: g.id, group: g.cat, name: g.name };
    if (g.optional) u.optional = true;
    u.words = g.words.map(w => ({ zh: w.zh, jp: w.jp, pos: w.pos, vg: w.vg, no: w.no }));
    return u;
  });
  const avoid = avoidFromNos(N5.homophones.concat(N5.sameMeaning), n5ByNo, 'n5words');
  checkSurfaceDup([...n5ByNo.values()], avoid, 'n5words');
  writePack('n5words.js', {
    id: 'n5words', name: 'N5 單字 747',
    credit: '單字出自 <a href="https://jp.ikuchannel.com/" target="_blank" rel="noopener">Iku老師の日本語</a>《JLPT N5 単語 一覧表》（jp.ikuchannel.com）',
    units, avoid,
  }, 'dataN5word.js；homophones 與 sameMeaning 合併成 avoid');
}

// ═══ 2. N5 形容詞 ════════════════════════════════════════════
console.log('\n[adj] 讀 adj_words.js、adj_sentences.js');
{
  const W = readRequire('adj_words.js');
  const S = readRequire('adj_sentences.js');
  const groupName = new Map(N5.groups.map(g => [g.id, g.name]));
  // 組名去掉括號註記：「顏色（含名詞）」→「顏色」（本課程沒收名詞），「感覺・評價（い形容詞）」→「感覺・評價」（分區標題已寫）
  const cleanName = n => n.replace(/（[^）]*）$/, '');
  const units = [];
  const seenGroup = new Map();   // 主題組 → 出現在哪一類（i／na），用來偵測同組混兩類
  for (const [kind, label] of [['i', 'い形容詞'], ['na', 'な形容詞']]) {
    const order = [];
    const byGroup = new Map();
    for (const w of W[kind]) {
      if (!groupName.has(w.group)) warn('adj_words.js：' + w.jp + ' 的 group ' + w.group + ' 在 dataN5word.js 找不到');
      if (!byGroup.has(w.group)) { byGroup.set(w.group, []); order.push(w.group); }
      byGroup.get(w.group).push(w);
      const n5 = n5ByNo.get(w.no);
      if (!n5) warn('adj_words.js：no ' + w.no + '（' + w.jp + '）在 dataN5word.js 找不到');
      else if (n5.jp !== w.jp || n5.zh !== w.zh) warn('adj_words.js：no ' + w.no + ' 和 dataN5word.js 不一致（' + w.jp + '「' + w.zh + '」 vs ' + n5.jp + '「' + n5.zh + '」）');
    }
    for (const gid of order) {
      const mixed = seenGroup.has(gid);
      if (mixed) warn('adj：主題組 ' + gid + ' 同時有い形容詞與な形容詞，拆成兩個小單元');
      seenGroup.set(gid, kind);
      units.push({
        id: mixed ? gid + kind : gid,
        group: label,
        name: cleanName(groupName.get(gid) || gid),
        words: byGroup.get(gid).map(w => ({ zh: w.zh, jp: w.jp, pos: w.pos, no: w.no })),
      });
    }
  }
  for (const l of S) units.push({
    id: l.no, group: '例句', name: l.title,
    sentences: l.sentences.map(s => ({ zh: s.zh, jp: s.jp })),
  });
  const adjByNo = new Map(W.i.concat(W.na).map(w => [w.no, w]));
  const avoid = avoidFromNos(N5.homophones.concat(N5.sameMeaning), adjByNo, 'adj');
  checkSurfaceDup([...adjByNo.values()], avoid, 'adj');
  writePack('adj.js', {
    id: 'adj', name: 'N5 形容詞', credit: readCredit('CREDIT_NEW'),
    units, avoid,
  }, 'adj_words.js 依主題組分小單元、adj_sentences.js 每課一個小單元；avoid 取自 dataN5word.js 的同音／同義清單');
}

console.log('\n完成。警告 ' + warnings.length + ' 則。');
