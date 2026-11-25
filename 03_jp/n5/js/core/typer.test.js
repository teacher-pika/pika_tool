/* typer.test.js — typer.js（共用打字判定、計分）的測試（node 執行：node 03_jp/n5/js/core/typer.test.js）
 * 1) 固定例子：假名鍵盤＋「゛゜小」、系統鍵盤、打錯不改狀態、倍率與分數、預設設定
 * 2) 三個課程包的全部題目：用四種方式打完 —
 *      羅馬拼音照「建議打法」(JP_TEXT.romaHint)／羅馬拼音照 j.hint('rom') 一鍵一鍵／
 *      假名鍵盤照 j.hint('k12')（原字＋゛゜小）／系統鍵盤（整串）
 * 3) 連續打題：習慣「ん」打 nn 的人（多打的 n 漏到下一題）與只打 n 的人，整個課程一題接一題都不會被算錯
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
load('js/core/util.js');
load('js/core/typer.js');
load('js/core/registry.js');
load('data/packs.js');
var J = ctx.JP_TEXT, TY = ctx.JP_TYPE, P = ctx.JP_PACKS;
P.list.forEach(function (p) { load('data/' + p.file); });

var fail = 0;
function eq(got, want, label) {
  if (JSON.stringify(got) !== JSON.stringify(want)) { fail++; console.log('✗ ' + label + '\n    得到 ' + JSON.stringify(got) + '\n    應為 ' + JSON.stringify(want)); }
}

// ── 固定例子 ──
var j = TY.judge('がっこう');
eq([j.input('か'), j.pend, j.pos], ['ok', 'か', 0], '假名：か 先進 pend');
eq([j.input('き'), j.pos], ['miss', 0], '假名：pend 時打別的字＝打錯');
eq([j.mod(), j.pend, j.pos], ['ok', '', 1], '假名：゛゜小 → が');
eq([j.input('つ'), j.mod(), j.pos], ['ok', 'ok', 2], '假名：つ → っ');
eq([j.input('こ'), j.input('う')], ['ok', 'done'], '假名：こう 打完');
j = TY.judge('ぱん');
eq([j.input('は'), j.mod(), j.pend, j.mod(), j.pos], ['ok', 'ok', 'ば', 'ok', 1], '假名：は→ば→ぱ');
j = TY.judge('コーヒー');
eq([j.input('コ'), j.input('ー'), j.input('ひ'), j.input('ー')], ['ok', 'ok', 'ok', 'done'], '假名：片假名輸入、長音');
j = TY.judge('ねこ');
eq([j.roman('n'), j.roman('x'), j.pos, j.buf], ['ok', 'miss', 0, 'n'], '羅馬：打錯不改狀態');
eq(j.hint('rom'), { roman: 'e' }, '提示：羅馬拼音下一鍵');
j.clearPartial(); eq(j.hint('k12'), { kana: 'ね' }, '提示：假名鍵盤給要打的字（鍵盤再找含這個字的鍵）');
j = TY.judge('がくせい');
eq(j.hint('k50'), { kana: 'か' }, '提示：濁音先給原字');
j.input('か'); eq(j.hint('k50'), { mod: true }, '提示：pend 時給゛゜小');
eq(j.hint('sys'), null, '提示：系統鍵盤沒有提示');
j = TY.judge('わたし');
eq([j.sys('わた'), j.pos], ['ok', 2], '系統：前兩個字');
eq([j.sys('わだ'), j.pos], ['ok', 1], '系統：改錯的字，回到對的長度');
eq([j.sys('ワタシ'), j.done], ['done', true], '系統：片假名也算');
j = TY.judge('かき'); j.roman('k'); j.clearPartial(); eq([j.buf, j.pos], ['', 0], '換鍵盤清掉打到一半的');
eq([TY.mult(false, false), TY.mult(true, false), TY.mult(false, true), TY.mult(true, true)], [1.5, 1, 1, 0.7], '倍率');
eq([TY.points(5, 0, 1.5), TY.points(5, 2, 1), TY.points(3, 1, 0.7)], [75, 60, 25], '分數');
eq([TY.prefs.get('kb'), TY.prefs.get('furi'), TY.prefs.get('hint')], ['rom', false, false], '預設：羅馬拼音、標音關、提示關');

// ── 全部題目 ──
function typeRomHint(kana) {
  var jj = TY.judge(kana), keys = J.romaHint(kana), r;
  for (var i = 0; i < keys.length; i++) { r = jj.roman(keys[i]); if (r === 'miss') return 'miss@' + i; }
  return jj.done ? 'done' : 'unfinished';
}
function followHint(kana, kb) {
  var jj = TY.judge(kana), n = 0, r;
  while (!jj.done && n++ < 400) {
    var h = jj.hint(kb);
    if (!h) return 'nohint@' + jj.pos;
    r = h.roman ? jj.roman(h.roman) : h.mod ? jj.mod() : jj.input(h.kana);
    if (r === 'miss' || r === 'none') return r + '@' + jj.pos;
  }
  return jj.done ? 'done' : 'loop';
}
var probs = [], total = 0, seq = [];
P.list.forEach(function (info) {
  var pack = P.get(info.id), list = [];
  pack.units.forEach(function (u) {
    ['words', 'sentences'].forEach(function (k) {
      (u[k] || []).forEach(function (it) {
        total++;
        var where = info.id + '/' + u.id + ' ' + it.jp;
        var kana = J.target(it.jp).kana;
        var a = typeRomHint(kana); if (a !== 'done') probs.push(where + '：建議打法 ' + a);
        var b = followHint(kana, 'rom'); if (b !== 'done') probs.push(where + '：照提示（羅馬拼音）' + b);
        var c = followHint(kana, 'k12'); if (c !== 'done') probs.push(where + '：照提示（假名鍵盤）' + c);
        var d = TY.judge(kana).sys(kana); if (d !== 'done') probs.push(where + '：系統鍵盤 ' + d);
        list.push({ where: where, kana: kana });
      });
    });
  });
  seq.push({ id: info.id, list: list });
});

// ── 連續打題（ん 的 n 漏到下一題）──
var carried = 0;
seq.forEach(function (s) {
  ['n', 'nn'].forEach(function (habit) {
    var endN = false, misses = 0;
    s.list.forEach(function (x) {
      var jj = TY.judge(x.kana, { swallowN: endN });
      var keys = J.romaHint(x.kana);
      if (endN && habit === 'nn') { keys = 'n' + keys; carried++; }   // 上一題結尾ん打了 nn：第二個 n 漏到這一題
      for (var i = 0; i < keys.length; i++) if (jj.roman(keys[i]) === 'miss') { misses++; probs.push(s.id + ' 連續打題（' + habit + '）' + x.where + '：第 ' + i + ' 鍵打錯'); break; }
      if (!jj.done) probs.push(s.id + ' 連續打題（' + habit + '）' + x.where + '：沒打完');
      endN = jj.endN;
    });
  });
});

console.log('固定例子：' + (fail ? fail + ' 個失敗' : '全部通過'));
console.log('題目：' + total + ' 題 × 4 種打法；連續打題時多打的 n 出現 ' + carried + ' 次；問題 ' + probs.length + ' 個');
probs.slice(0, 40).forEach(function (p) { console.log('  - ' + p); });
process.exit(fail || probs.length ? 1 : 0);
