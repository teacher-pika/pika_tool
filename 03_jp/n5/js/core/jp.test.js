/* jp.test.js — jp.js 的小測試（node 執行：node 03_jp/n5/js/core/jp.test.js）
 * 1) 幾個固定例子  2) 三個課程包的全部題目：解析、讀音、顯示拼音、打字拼法都要能處理
 * 不需要瀏覽器；網頁不會載入這個檔。 */
'use strict';
var path = require('path');
var fs = require('fs');
var vm = require('vm');

var dir = path.join(__dirname, '..', '..');
var ctx = { console: console };
ctx.globalThis = ctx;
vm.createContext(ctx);
function load(f) { vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }); }
load('js/core/jp.js');
load('js/core/registry.js');
load('data/packs.js');
var J = ctx.JP_TEXT, P = ctx.JP_PACKS;
P.list.forEach(function (p) { load('data/' + p.file); });

var fail = 0;
function eq(got, want, label) {
  if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log('✗ ' + label + '\n    得到 ' + JSON.stringify(got) + '\n    應為 ' + JSON.stringify(want)); }
}
function typeAll(kana, keys) {
  var m = J.matcher(kana), r = '';
  for (var i = 0; i < keys.length; i++) { r = m.key(keys[i]); if (r === 'miss') return 'miss@' + i; }
  return m.done ? 'done' : 'unfinished';
}

// ── 固定例子 ──
var s = J.parse('私[わたし]|は*|学生[がくせい]|です*|。');
eq(s.map(function (x) { return [x.text, x.kana, x.g, x.punct]; }), [['私', 'わたし', false, false], ['は', 'は', true, false], ['学生', 'がくせい', false, false], ['です', 'です', true, false], ['。', '', false, true]], 'parse');
eq(J.surface('私[わたし]|は*|学生[がくせい]|です*|。'), '私は学生です。', 'surface');
eq(J.reading('私[わたし]|は*|学生[がくせい]|です*|。'), 'わたしはがくせいです', 'reading');
eq(J.parse('アメリカ')[0].ruby, 'あめりか', '片假名自動標平假名');
eq(J.parse('これ')[0].ruby, null, '平假名不標音');
eq(J.romaji('がっこう'), 'gakkou', 'romaji 促音');
eq(J.romaji('きょう'), 'kyou', 'romaji 拗音');
eq(J.romaji('こんや'), "kon'ya", "romaji ん+や");
eq(J.romaji('しんぶん'), 'shinbun', 'romaji ん');
eq(J.romaji('コーヒー'), 'ko-hi-', 'romaji 長音');
eq(J.romaji('まっちゃ'), 'matcha', 'romaji っち');
eq(J.romaji('パーティー'), 'pa-ti-', 'romaji てぃ');
eq(J.romajiLine('私[わたし]|は*|学生[がくせい]|です*|。'), 'watashi wa gakusei desu', 'romajiLine 助詞は');
eq(J.romajiLine('今日[きょう]|は|暑[あつ]|い*|です*|。'), 'kyou wa atsui desu', 'romajiLine 送假名黏在一起');
eq(J.romajiWord('お|茶[ちゃ]'), 'ocha', 'romajiWord');
eq(J.romaHint('わたしはがくせいです'), 'watashihagakuseidesu', '打字：助詞は打 ha');
eq(J.romaHint('がっこう'), 'gakkou', '打字提示 促音');
eq(J.romaHint('こんや'), 'konnya', '打字提示 ん+や 要 nn');
eq(J.romaHint('しんぶん'), 'shinbun', '打字提示 ん');
eq(typeAll('しんぶん', 'sinnbun'), 'done', '打字 si、nn');
eq(typeAll('しんぶん', 'shinnbun'), 'done', '打字 n 之後多打 n 被吞掉');
eq(typeAll('ちょっと', 'tyotto'), 'done', '打字 tyo');
eq(typeAll('ちょっと', 'choxtuto'), 'done', '打字 xtu');
eq(typeAll('まっちゃ', 'maccha'), 'done', '打字 ccha');
eq(typeAll('まっちゃ', 'matcha'), 'done', '打字 tcha');
eq(typeAll('こんや', 'konya'), 'miss@3', '打字 ん+や 只打一個 n 不行');
eq(typeAll('こーひー', 'ko-hi-'), 'done', '打字 長音');
eq(typeAll('ぱーてぃー', 'pa-thi-'), 'done', '打字 thi');
eq(typeAll('ぱーてぃー', 'pa-texi-'), 'done', '打字 te+xi');
var t = J.target('お|茶[ちゃ]|を|ください|。');
eq([t.kana, t.segOf, t.segStart, t.segEnd], ['おちゃをください', [0, 1, 1, 2, 3, 3, 3, 3], [0, 1, 3, 4, 8], [1, 3, 4, 8, 8]], 'target');
eq(J.target('コーヒー').kata, [true, true, true, true], 'target kata');
var m = J.matcher('かき'); m.key('k'); m.key('a'); m.back(); eq([m.pos, m.buf], [0, ''], 'matcher back');
function typeN(kana, keys, opt) {
  var mm = J.matcher(kana, opt), out = [];
  keys.split('').forEach(function (c) { out.push(mm.key(c)); });
  return out.join(',') + (mm.done ? '|done' : '|' + mm.pos);
}
// 打錯不改狀態
m = J.matcher('かき'); m.key('k'); eq([m.key('x'), m.pos, m.buf], ['miss', 0, 'k'], 'miss 不改狀態');
// 結尾的「ん」只打一個 n：endN；下一題 opts.swallowN 吞掉多打的 n
m = J.matcher('ほん'); 'hon'.split('').forEach(function (c) { m.key(c); }); eq([m.done, m.endN], [true, true], '結尾 ん 打 n 就完成，endN');
eq(typeN('ほん', 'honn'), 'ok,ok,done,miss|done', '結尾 ん：第一個 n 就打完，第二個 n 會漏到下一題（所以下一題要 swallowN）');
m = J.matcher('ほんや'); 'honnya'.split('').forEach(function (c) { m.key(c); }); eq([m.done, m.endN], [true, false], 'ん+や 打 nn，endN=false');
eq(typeN('くるま', 'nkuruma', { swallowN: true }), 'skip,ok,ok,ok,ok,ok,done|done', '下一題第一個 n 被吞掉（くるま）');
eq(typeN('くるま', 'nkuruma'), 'miss,ok,ok,ok,ok,ok,done|done', '沒有 swallowN 時 n 是打錯');
eq(typeN('なつ', 'natsu', { swallowN: true }), 'ok,ok,ok,ok,done|done', 'swallowN：な開頭照常打 natsu');
eq(typeN('なつ', 'nnatsu', { swallowN: true }), 'ok,ok,ok,ok,ok,done|done', 'swallowN：多打的 n 之後 natsu');
eq(typeN('にほん', 'nnihon', { swallowN: true }), 'ok,ok,ok,ok,ok,done|done', 'swallowN：にほん nnihon');
eq(typeN('んで', 'nde', { swallowN: true }), 'ok,ok,done|done', 'swallowN：ん開頭（n 直接打出ん）');
eq(typeN('あめ', "'ame", { swallowN: true }), 'skip,ok,ok,done|done', "swallowN：多打的 ' 也吞掉");
eq(typeN('なつ', 'nx', { swallowN: true }), 'ok,miss|0', 'swallowN：n 之後打錯仍是 miss，狀態留在 n');
eq(typeN('しんぶん', 'shinnbun'), 'ok,ok,ok,ok,skip,ok,ok,done|done', '題內：n 之後多打的 n 被吞掉');
eq(J.html('猫[ねこ]|が*'), '<span class="jseg"><ruby>猫<rt>ねこ</rt></ruby></span><span class="jseg g">が</span>', 'html');

// ── 全部題目 ──
var probs = [], total = 0;
P.list.forEach(function (info) {
  var pack = P.get(info.id);
  pack.units.forEach(function (u) {
    ['words', 'sentences'].forEach(function (k) {
      (u[k] || []).forEach(function (it) {
        total++;
        var where = info.id + '/' + u.id + ' ' + it.jp;
        var segs = J.parse(it.jp);
        segs.forEach(function (sg) { if (sg.bad) probs.push(where + '：段落「' + sg.text + '」' + sg.bad); });
        if (/\|\||^\||\|$/.test(it.jp)) probs.push(where + '：多餘的 |');
        if (J.surface(it.jp) !== P.surface(it.jp)) probs.push(where + '：表面文字和 JP_PACKS.surface 不同');
        var kana = J.reading(it.jp);
        if (!kana) probs.push(where + '：沒有可以打的字');
        var hint = J.romaHint(kana);
        if (hint === null) probs.push(where + '：有假名沒有羅馬拼音');
        else if (typeAll(kana, hint) !== 'done') probs.push(where + '：照提示打不完 ' + hint);
        var rl = J.romajiLine(it.jp);
        if (/[^a-z' \-]/.test(rl)) probs.push(where + '：顯示拼音有怪字 ' + rl);
        if (k === 'words' && segs.some(function (x) { return x.g; })) probs.push(where + '：單字有 * 標記');
      });
    });
  });
});

console.log('固定例子：' + (fail ? fail + ' 個失敗' : '全部通過'));
console.log('題目：' + total + ' 題，問題 ' + probs.length + ' 個');
probs.forEach(function (p) { console.log('  - ' + p); });
process.exit(fail || probs.length ? 1 : 0);
