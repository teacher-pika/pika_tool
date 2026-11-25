/* typer.js — 打字的判定、共用設定、計分（window.JP_TYPE）
 * ============================================================================
 * 不碰 DOM（node 也能載入測試）。需要先載入 jp.js；設定儲存要 util.js（沒有就只存在記憶體）。
 * 所有打字玩法（③打字練習、之後的掉落方塊…）共用這一份，規則見 docs/決策紀錄.md「打字（所有遊戲共用）」。
 *
 * 分三層，玩法可以只拿需要的：
 *   JP_TYPE.judge  判定（這個檔）：一題的狀態，吃羅馬字／假名／系統輸入法的字串
 *   JP_KB          螢幕鍵盤＋實體鍵盤＋系統鍵盤輸入框（keyboard.js，DOM）
 *   JP_TYPEBOX     顯示題目＋已打的字，把判定和鍵盤接起來（typebox.js，DOM）
 *   掉落方塊這種自己畫題目的玩法：用 JP_TYPE.judge ＋ JP_KB 就好，不用 JP_TYPEBOX。
 *
 * ── 判定 ──
 *   var j = JP_TYPE.judge(kana, opts)    kana：要打的平假名（JP_TEXT.target(jp).kana 或 JP_TEXT.reading(jp)）
 *       opts.swallowN = true   上一題結尾的「ん」只打一個 n（上一題 j.endN）→ 這題吞掉一個多打的 n
 *   j.roman(字母) → 'ok'｜'miss'｜'skip'｜'done'   羅馬拼音一鍵（'skip'＝多打的 n 被吞掉，不算對也不算錯）
 *   j.input(假名) → 'ok'｜'miss'｜'done'           假名鍵盤一鍵（片假名會轉平假名）。
 *                                                 濁音、半濁音、小字：先打原字（か），這時 j.pend='か'，再 j.mod() 變成が
 *   j.mod()       → 'ok'｜'done'｜'none'           「゛゜小」鍵：把 pend 換成下一個（か→が、つ→っ→づ、は→ば→ぱ）
 *   j.sys(字串)   → 'ok'｜'done'                   系統鍵盤：整個輸入框的內容，從頭比對（不會 miss，也不記打錯）
 *   j.back()                                     退一格（先退 pend／打到一半的羅馬字，再退假名）
 *   j.pos 已確定的假名數；j.buf 打到一半的羅馬字；j.pend 假名鍵盤等著按「゛゜小」的字；j.done；j.endN
 *   j.expect()    目前該打的假名（記錄「打錯的字」用）
 *   j.hint(kb)    下一個建議的鍵：{ roman:'k' }｜{ kana:'か' }｜{ mod:true }｜null（kb＝'rom'｜'k12'｜'k50'｜'sys'）
 *   打錯（'miss'）時判定的狀態完全不變，所以掉落方塊可以「同一個鍵拿去每個方塊試，第一個不是 miss 的就鎖定」。
 *
 * ── 共用設定（所有打字玩法同一份；存在 localStorage pk_jp_type_*）──
 *   JP_TYPE.prefs.get('kb'|'furi'|'hint')    預設 'rom'、false、false（決策紀錄：標音、提示預設都關）
 *   JP_TYPE.prefs.set(key, 值)               會存起來，並在 document 發出 'jp-typeprefs' 事件（detail：{ key, value }）
 *       同一頁上有好幾個元件時靠這個事件同步；元件用 ctx.on(document, 'jp-typeprefs', fn) 聽，離開玩法會自動移除。
 *   JP_TYPE.KB_TYPES   [['rom','羅馬拼音'], ['k12','十二鍵'], ['k50','五十音'], ['sys','系統鍵盤']]
 *
 * ── 計分（決策紀錄的倍率；數值集中在 JP_TYPE.SCORE，要調整改這裡）──
 *   JP_TYPE.mult(furi, hint)                都不開 1.5、開一個 1、都開 0.7（一題中途開過就算有開：由呼叫端記）
 *   JP_TYPE.points(kana數, 連續無錯題數, 倍率)  一題的分數＝(每個假名 10 分＋連續無錯題數×5)×倍率，四捨五入
 *                                            連續無錯題數：含這一題；這題有打錯就傳 0
 *   JP_TYPE.SCORE.miss                      打錯一鍵扣幾分（2；扣到 0 為止由呼叫端處理）
 *   JP_TYPE.base(假名) / JP_TYPE.CYC        「゛゜小」的循環表（か→が、つ→っ→づ…）
 * ============================================================================ */
(function (root) {
  'use strict';
  var J = root.JP_TEXT;
  if (!J) throw new Error('typer.js 需要先載入 jp.js');

  // ── 「゛゜小」循環（沿用舊版 typing／fall）──
  var CYC = {};
  ['かが', 'きぎ', 'くぐ', 'けげ', 'こご', 'さざ', 'しじ', 'すず', 'せぜ', 'そぞ', 'ただ', 'ちぢ', 'つっづ', 'てで', 'とど',
    'はばぱ', 'ひびぴ', 'ふぶぷ', 'へべぺ', 'ほぼぽ', 'あぁ', 'いぃ', 'うぅゔ', 'えぇ', 'おぉ', 'やゃ', 'ゆゅ', 'よょ', 'わゎ']
    .forEach(function (g) { g.split('').forEach(function (c) { CYC[c] = g; }); });
  function base(c) { return CYC[c] ? CYC[c][0] : c; }

  function judge(kana, opts) {
    var T = J.toHira(kana || '');
    var m = J.matcher(T, opts);
    var j = { kana: T, pend: '' };
    function sync() { j.pos = m.pos; j.buf = m.buf; j.done = m.done; j.endN = m.endN; }
    sync();
    j.expect = function () { return T.charAt(m.pos); };
    j.roman = function (l) {
      if (m.done) return 'miss';
      if (j.pend) return 'miss';            // 假名鍵盤打到一半（切換鍵盤時已清掉，這裡只是保險）
      var r = m.key(String(l).toLowerCase());
      sync(); return r;
    };
    j.input = function (ch) {
      if (m.done) return 'miss';
      ch = J.toHira(ch);
      if (j.pend) return 'miss';            // 上一個字還沒按「゛゜小」變成對的字
      if (m.buf) return 'miss';
      var want = T.charAt(m.pos);
      if (base(ch) !== base(want)) return 'miss';
      if (ch === want) { var r = m.adv(1); sync(); return r; }
      j.pend = ch; sync(); return 'ok';
    };
    j.mod = function () {
      if (m.done || !j.pend) return 'none';
      var c = CYC[j.pend]; if (!c) return 'none';
      j.pend = c.charAt((c.indexOf(j.pend) + 1) % c.length);
      if (j.pend === T.charAt(m.pos)) { j.pend = ''; var r = m.adv(1); sync(); return r; }
      sync(); return 'ok';
    };
    j.sys = function (value) {
      var v = J.toHira(String(value || '')).split('').filter(function (c) { return /[ぁ-ゖー]/.test(c); });
      var i = 0;
      while (i < v.length && i < T.length && v[i] === T[i]) i++;
      if (i !== m.pos) { m = J.matcher(T); if (i) m.adv(i); }
      j.pend = ''; sync();
      return m.done ? 'done' : 'ok';
    };
    j.back = function () {
      if (j.pend) j.pend = '';
      else m.back();
      sync();
    };
    j.clearPartial = function () {   // 換鍵盤時：丟掉打到一半的羅馬字與 pend
      j.pend = ''; while (m.buf) m.back(); sync();
    };
    j.hint = function (kb) {
      if (m.done || kb === 'sys') return null;
      if (kb === 'rom' || !kb) { var n = m.next(); return n ? { roman: n } : null; }
      if (j.pend) return { mod: true };
      var want = T.charAt(m.pos);
      return want ? { kana: base(want) } : null;
    };
    return j;
  }

  // ── 共用設定 ──
  var KB_TYPES = [['rom', '羅馬拼音'], ['k12', '十二鍵'], ['k50', '五十音'], ['sys', '系統鍵盤']];
  var DEF = { kb: 'rom', furi: false, hint: false };
  var mem = {};
  var st = root.JP_UTIL ? root.JP_UTIL.storeFor('type') : { get: function (k, d) { return k in mem ? mem[k] : d; }, set: function (k, v) { mem[k] = v; return true; } };
  function valid(k, v) {
    if (k === 'kb') return KB_TYPES.some(function (t) { return t[0] === v; });
    if (k === 'furi' || k === 'hint') return typeof v === 'boolean';
    return false;
  }
  var prefs = {
    get: function (k) { var v = st.get(k, DEF[k]); return valid(k, v) ? v : DEF[k]; },
    set: function (k, v) {
      if (!valid(k, v)) return false;
      st.set(k, v);
      var d = root.document;
      if (d && typeof root.CustomEvent === 'function') d.dispatchEvent(new root.CustomEvent('jp-typeprefs', { detail: { key: k, value: v } }));
      return true;
    },
  };

  // ── 計分 ──
  var SCORE = { perKana: 10, combo: 5, miss: 2, mult: [1.5, 1, 0.7] };
  function mult(furi, hint) { return SCORE.mult[(furi ? 1 : 0) + (hint ? 1 : 0)]; }
  function points(len, combo, m) { return Math.round((len * SCORE.perKana + (combo || 0) * SCORE.combo) * m); }

  root.JP_TYPE = { judge: judge, prefs: prefs, KB_TYPES: KB_TYPES, SCORE: SCORE, mult: mult, points: points, base: base, CYC: CYC };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.JP_TYPE;
})(typeof window !== 'undefined' ? window : globalThis);
