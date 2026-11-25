/* jp.js — 日文字串處理（window.JP_TEXT）
 * ============================================================================
 * 不依賴其他檔案、不碰 DOM（node 也能 require 來測試）。jp 字串寫法見 docs/資料-題庫格式.md：
 *   '私[わたし]|は*|学生[がくせい]|です*|。'   「|」分段、「漢字[讀音]」、段尾「*」＝文法重點
 *
 * ── 解析 ──
 *   JP_TEXT.parse(jp) → 段落陣列（同一字串會快取，請不要改回傳的物件）
 *       每段 { text   表面文字（'学生'）
 *              read   寫在 [] 裡的讀音；沒寫就是 null
 *              kana   這段要打／要唸的平假名（片假名會轉成平假名；標點是 ''）
 *              ruby   標音（[] 的讀音；片假名段自動給平假名；其他 null）
 *              g      true＝文法重點（段尾有 *）
 *              punct  true＝標點（不用打、不標音）
 *              bad    '' 或錯誤說明（例如漢字沒寫讀音）——資料檢查用 }
 *   JP_TEXT.surface(jp)        整句表面文字（含標點）'私は学生です。'
 *   JP_TEXT.reading(jp)        整句讀音（平假名，不含標點）'わたしはがくせいです'
 *   JP_TEXT.isAllHira(jp)      表面文字是否全是平假名（含ー）。「日→讀音」題遇到這種不考讀音
 *   JP_TEXT.hasDigit(seg)      這段含阿拉伯數字（填文法、選意思用來排除數字題）
 *   JP_TEXT.toHira(s) / toKata(s)   片假名↔平假名
 *   上面需要 jp 的函式，也都可以直接傳 parse() 的結果（段落陣列）。
 *
 * ── 顯示 ──
 *   JP_TEXT.html(jp, opts) → HTML 字串：每段 <span class="jseg [g]">，有標音的用 <ruby>…<rt>…</rt></ruby>。
 *       opts.blank = 段落 index   這段換成空格 <span class="blank">（填文法題）
 *       opts.noRuby = true        完全不輸出 <rt>
 *     標音開關由外層 CSS 控制（core.css）：外層加 class "nofuri" 隱藏標音（不佔位），
 *     加 "furihold" 隱藏但保留高度（題目畫面用，答完再顯示不會跳動）。
 *     片假名段也會標平假名（決策紀錄：開平假名標音時，片假名上方也標平假名）。
 *   JP_TEXT.romaji(kana)       假名 → 顯示用羅馬拼音（赫本式；ん 在母音前寫 n'；長音 ー 寫 -；を 寫 o）
 *   JP_TEXT.romajiLine(jp)     句子顯示用拼音：一段一個空格（漢字後的送假名黏在一起）；單獨成段的助詞「は」寫 wa、「へ」寫 e
 *   JP_TEXT.romajiWord(jp)     單字顯示用拼音：整個詞連在一起，'お|茶[ちゃ]' → 'ocha'
 *
 * ── 打字（下一期打字引擎用這些）──
 *   JP_TEXT.target(jp) → { segs, kana, segOf, segStart, segEnd, kata }
 *       kana      要打的平假名整串（標點不算，助詞は就是「は」）
 *       segOf[i]  第 i 個假名屬於哪一段（segs 的 index）
 *       segStart[k] / segEnd[k]  第 k 段在 kana 裡的範圍 [start, end)（標點段 start===end）
 *       kata[i]   第 i 個假名原本是不是片假名（顯示已打的字時轉回片假名用）
 *   JP_TEXT.romaCands(kana, n) → 在第 n 個假名可以接受的拼法 [{ r:'shi', len:1, nflag? }]
 *       len＝這個拼法吃掉幾個假名（拗音 2）；nflag＝「ん 只打一個 n」（之後多打的 n 要吞掉）
 *       規則同舊版 typing：shi/si、chi/ti、tsu/tu、ji/zi…；っ 重複下一個子音或 xtu/ltu；
 *       ん 可打 n（後面不是母音／y／n 時）、nn、n'、xn；長音 ー 打 -；助詞は打 ha、を打 wo。
 *   JP_TEXT.romaHint(kana)     建議的打法（每處取第一個拼法），例如按鍵提示要用
 *   JP_TEXT.matcher(kana, opts) → 逐鍵判定器（羅馬拼音；鍵盤、顯示另見 js/core/typer.js）
 *       m.key(ch) → 'ok'（接受）｜'miss'（打錯，沒有輸入，狀態完全不變）｜'skip'（多打的 n 被吞掉）｜'done'（剛好打完）
 *       m.pos     已確定的假名數；m.buf 打到一半的羅馬字；m.done 是否打完
 *       m.endN    打完時最後一個「ん」只打了一個 n（下一題請用 opts.swallowN）
 *       opts.swallowN = true  一開始就準備吞掉一個多打的 n：習慣打 nn 的人，上一題結尾「ほん」打 honn，
 *                 多出來的 n 不會在下一題被算錯；下一題本來就是 n 開頭（なつ）也照樣能打 natsu／nnatsu。
 *       m.next()  下一個建議按的鍵（打完回 ''）
 *       m.back()  退一格（先退 buf，再退假名）
 *       m.adv(len) 直接確定 len 個假名（假名鍵盤、系統鍵盤用）
 * ============================================================================ */
(function (root) {
  'use strict';

  var PUNCT = /^[、。，,．.？?！!・･「」『』（）()〜～…：:；;\s　"“”'‘’\-－]+$/;

  function toHira(s) { return String(s).replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); }); }
  function toKata(s) { return String(s).replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); }); }

  var cache = {};
  function parse(jp) {
    if (Array.isArray(jp)) return jp;
    jp = String(jp);
    if (cache[jp]) return cache[jp];
    var segs = jp.split('|').map(function (t) {
      var g = /\*$/.test(t); if (g) t = t.slice(0, -1);
      var m = t.match(/^(.*?)\[(.*)\]$/);
      var text = m ? m[1] : t, read = m ? m[2] : null;
      var punct = !m && PUNCT.test(text);
      var kana = punct ? '' : toHira(m ? read : text);
      var ruby = null;
      if (m && read !== text) ruby = toHira(read);
      else if (!m && /[ァ-ヶ]/.test(text)) ruby = toHira(text);
      var bad = '';
      if (!text) bad = '空白的段落';
      else if (!punct && !/^[ぁ-ゖー]+$/.test(kana)) bad = m ? '讀音裡有不是假名的字' : '沒有寫讀音（含漢字、數字或其他符號）';
      return { text: text, read: read, kana: kana, ruby: ruby, g: g, punct: punct, bad: bad };
    });
    cache[jp] = segs;
    return segs;
  }

  function surface(jp) { return parse(jp).map(function (s) { return s.text; }).join(''); }
  function reading(jp) { return parse(jp).map(function (s) { return s.kana; }).join(''); }
  function isAllHira(jp) { return /^[ぁ-ゖー]+$/.test(surface(jp)); }
  function hasDigit(seg) { return /[0-9０-９]/.test(seg.text); }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function html(jp, opts) {
    opts = opts || {};
    return parse(jp).map(function (s, i) {
      if (i === opts.blank) return '<span class="blank">&nbsp;</span>';
      var inner = s.ruby && !opts.noRuby ? '<ruby>' + esc(s.text) + '<rt>' + esc(s.ruby) + '</rt></ruby>' : esc(s.text);
      return '<span class="jseg' + (s.g ? ' g' : '') + '">' + inner + '</span>';
    }).join('');
  }

  // ── 顯示用羅馬拼音（沿用舊版 quiz 的規則，另外補外來語的組合）──
  var RD = {};
  (function () {
    var V = 'aiueo';
    'あいうえお'.split('').forEach(function (c, i) { RD[c] = V[i]; });
    var rows = { k: 'かきくけこ', s: 'さしすせそ', t: 'たちつてと', n: 'なにぬねの', h: 'はひふへほ', m: 'まみむめも', r: 'らりるれろ',
      g: 'がぎぐげご', z: 'ざじずぜぞ', d: 'だぢづでど', b: 'ばびぶべぼ', p: 'ぱぴぷぺぽ' };
    Object.keys(rows).forEach(function (k) { rows[k].split('').forEach(function (c, i) { RD[c] = k + V[i]; }); });
    var o = { し: 'shi', ち: 'chi', つ: 'tsu', ふ: 'fu', じ: 'ji', ぢ: 'ji', づ: 'zu', や: 'ya', ゆ: 'yu', よ: 'yo', わ: 'wa', を: 'o', ー: '-', ゔ: 'vu',
      ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゃ: 'ya', ゅ: 'yu', ょ: 'yo', ゎ: 'wa',
      てぃ: 'ti', でぃ: 'di', とぅ: 'tu', どぅ: 'du', ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo', うぃ: 'wi', うぇ: 'we', うぉ: 'wo',
      しぇ: 'she', じぇ: 'je', ちぇ: 'che', つぁ: 'tsa', つぃ: 'tsi', つぇ: 'tse', つぉ: 'tso', いぇ: 'ye', ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo' };
    Object.keys(o).forEach(function (k) { RD[k] = o[k]; });
    var Y = { き: 'ky', ぎ: 'gy', に: 'ny', ひ: 'hy', び: 'by', ぴ: 'py', み: 'my', り: 'ry', し: 'sh', じ: 'j', ち: 'ch', ぢ: 'j' };
    Object.keys(Y).forEach(function (k) { [['ゃ', 'a'], ['ゅ', 'u'], ['ょ', 'o']].forEach(function (p) { RD[k + p[0]] = Y[k] + p[1]; }); });
  })();

  function romaji(kana) {
    var k = toHira(kana), out = '', dbl = false;
    for (var i = 0; i < k.length; i++) {
      var r, two = k.substr(i, 2);
      if (two.length === 2 && RD[two]) { r = RD[two]; i++; }
      else if (k[i] === 'っ') { if (i === k.length - 1) { out += "'"; continue; } dbl = true; continue; }
      else if (k[i] === 'ん') { var nx = RD[k.substr(i + 1, 2)] || RD[k[i + 1]] || ''; r = 'aiueoy'.indexOf(nx[0] || 'x') >= 0 ? "n'" : 'n'; }
      else r = RD[k[i]] || k[i];
      if (dbl) { r = (r[0] === 'c' ? 't' : r[0]) + r; dbl = false; }
      out += r;
    }
    return out;
  }

  // 句子用：段與段之間空一格，但漢字後面接的送假名（平假名、又不是助詞／です類）黏在一起：暑[あつ]|い → atsui
  var PARTICLE = /^(は|が|を|に|へ|で|と|も|の|や|か|ね|よ|な|から|まで|より|だけ|しか|ごろ|ぐらい|くらい|など)$/;
  function romajiLine(jp) {
    var out = '', prev = null;
    parse(jp).forEach(function (s) {
      if (s.punct) return;
      var r = s.text === 'は' ? 'wa' : s.text === 'へ' ? 'e' : romaji(s.kana);
      var glue = prev && prev.read !== null && /^[ぁ-ゖ]+$/.test(s.text) && !PARTICLE.test(s.text) && !/^(で|じゃ)/.test(s.text);
      out += (out && !glue ? ' ' : '') + r;
      prev = s;
    });
    return out;
  }
  // 單字用：整個詞連在一起（お|茶[ちゃ] → ocha）
  function romajiWord(jp) { return romaji(reading(jp)); }

  // ── 打字：每個假名可接受的拼法（沿用舊版 typing，第一個是提示用的拼法）──
  var RM = {};
  (function () {
    var V = 'aiueo';
    'あいうえお'.split('').forEach(function (c, i) { RM[c] = [V[i]]; });
    var rows = { k: 'かきくけこ', s: 'さしすせそ', t: 'たちつてと', n: 'なにぬねの', h: 'はひふへほ', m: 'まみむめも', r: 'らりるれろ',
      g: 'がぎぐげご', z: 'ざじずぜぞ', d: 'だぢづでど', b: 'ばびぶべぼ', p: 'ぱぴぷぺぽ' };
    Object.keys(rows).forEach(function (k) { rows[k].split('').forEach(function (c, i) { RM[c] = [k + V[i]]; }); });
    RM['し'].unshift('shi'); RM['ち'].unshift('chi'); RM['つ'].unshift('tsu'); RM['ふ'].unshift('fu'); RM['じ'].unshift('ji');
    RM['や'] = ['ya']; RM['ゆ'] = ['yu']; RM['よ'] = ['yo']; RM['わ'] = ['wa']; RM['を'] = ['wo']; RM['ー'] = ['-']; RM['ゔ'] = ['vu'];
    'ぁぃぅぇぉ'.split('').forEach(function (c, i) { RM[c] = ['x' + V[i], 'l' + V[i]]; });
    RM['ゃ'] = ['xya', 'lya']; RM['ゅ'] = ['xyu', 'lyu']; RM['ょ'] = ['xyo', 'lyo']; RM['っ'] = ['xtu', 'ltu', 'xtsu']; RM['ゎ'] = ['xwa', 'lwa'];
    var Y = { き: ['ky'], ぎ: ['gy'], に: ['ny'], ひ: ['hy'], び: ['by'], ぴ: ['py'], み: ['my'], り: ['ry'],
      し: ['sh', 'sy'], じ: ['j', 'jy', 'zy'], ち: ['ch', 'ty', 'cy'], ぢ: ['dy'] };
    Object.keys(Y).forEach(function (k) { [['ゃ', 'a'], ['ゅ', 'u'], ['ょ', 'o']].forEach(function (p) { RM[k + p[0]] = Y[k].map(function (x) { return x + p[1]; }); }); });
    // 外來語組合（新增；拆開打 て＋ぃ 也一樣可以）
    var ext = { てぃ: ['thi'], でぃ: ['dhi'], とぅ: ['twu'], どぅ: ['dwu'], ふぁ: ['fa'], ふぃ: ['fi'], ふぇ: ['fe'], ふぉ: ['fo'],
      うぃ: ['wi'], うぇ: ['we'], しぇ: ['she', 'sye'], じぇ: ['je', 'zye'], ちぇ: ['che', 'tye'], つぁ: ['tsa'], いぇ: ['ye'],
      ゔぁ: ['va'], ゔぃ: ['vi'], ゔぇ: ['ve'], ゔぉ: ['vo'] };
    Object.keys(ext).forEach(function (k) { RM[k] = ext[k]; });
  })();

  function romaCands(T, n) {
    var out = [], c = T[n];
    if (c === undefined) return out;
    var two = T.substr(n, 2);
    if (two.length === 2 && RM[two]) RM[two].forEach(function (r) { out.push({ r: r, len: 2 }); });
    if (c === 'ん') {
      var nx = n + 1 < T.length ? romaCands(T, n + 1) : [];
      if (!nx.some(function (x) { return 'aiueoyn'.indexOf(x.r[0]) >= 0; })) out.push({ r: 'n', len: 1, nflag: true });
      out.push({ r: 'nn', len: 1 }, { r: "n'", len: 1 }, { r: 'xn', len: 1 });
    } else if (c === 'っ') {
      var seen = {};
      romaCands(T, n + 1).forEach(function (x) { var f = x.r[0]; if ('aiueon-'.indexOf(f) < 0 && !seen[f]) { seen[f] = 1; out.push({ r: f, len: 1 }); } });
      RM['っ'].forEach(function (r) { out.push({ r: r, len: 1 }); });
    } else (RM[c] || []).forEach(function (r) { out.push({ r: r, len: 1 }); });
    return out;
  }

  function romaHint(kana) {
    var T = toHira(kana), out = '', n = 0;
    while (n < T.length) {
      var cs = romaCands(T, n);
      if (!cs.length) return null;          // 有打不出來的字
      out += cs[0].r; n += cs[0].len;
    }
    return out;
  }

  // opts.swallowN = true：一開始就準備吞掉一個多打的 n（上一題結尾的「ん」只打一個 n 就完成時，下一題用這個）
  function matcher(kana, opts) {
    var T = toHira(kana);
    var m = { kana: T, pos: 0, buf: '', done: !T.length, swallowN: !!(opts && opts.swallowN), endN: false, hist: [], tent: null };
    function snap() { return { pos: m.pos, buf: m.buf, done: m.done, endN: m.endN, swallowN: m.swallowN, hist: m.hist.slice() }; }
    function restore(s) { m.pos = s.pos; m.buf = s.buf; m.done = s.done; m.endN = s.endN; m.swallowN = s.swallowN; m.hist = s.hist.slice(); }
    // 照拼法表收一個鍵；打錯回 'miss' 且完全不改狀態
    function feed(l) {
      var b = m.buf + l;
      var cs = romaCands(T, m.pos).filter(function (x) { return x.r.indexOf(b) === 0; });
      if (!cs.length) return 'miss';
      m.buf = b; m.swallowN = false;
      var ex = null;
      for (var i = 0; i < cs.length; i++) if (cs[i].r === b) { ex = cs[i]; break; }
      // 完全符合就確定（同舊版；表裡沒有「一個拼法是另一個的開頭」的情況，ん 的 n 靠 swallowN 處理）
      if (ex) {
        m.hist.push(ex.len); m.pos += ex.len; m.buf = ''; m.swallowN = !!ex.nflag;
        if (m.pos >= T.length) { m.done = true; m.endN = !!ex.nflag; return 'done'; }
      }
      return 'ok';
    }
    m.key = function (l) {
      if (m.done) return 'miss';
      if (m.swallowN && !m.buf && (l === 'n' || l === "'")) {
        // 「ん」只打一個 n 之後又多打的 n（或 '）：
        //   這裡本來就不能打 n → 直接吞掉（回 'skip'）
        //   這裡可以打 n（下一題是な行開頭等）→ 先照常收下；如果下一個鍵因此打不下去，再改當作多打的 n（見下面 tent）
        var s = snap(); m.swallowN = false;
        var r0 = l === 'n' ? feed(l) : 'miss';
        if (r0 === 'miss') return 'skip';
        m.tent = s; return r0;
      }
      var r = feed(l);
      if (r === 'miss' && m.tent) {
        var cur = snap();
        restore(m.tent); m.swallowN = false;
        r = feed(l);
        if (r === 'miss') { restore(cur); return 'miss'; }
      }
      if (r !== 'miss') m.tent = null;
      return r;
    };
    m.next = function () {
      if (m.done) return '';
      var cs = romaCands(T, m.pos).filter(function (x) { return x.r.indexOf(m.buf) === 0; });
      return cs.length ? cs[0].r.charAt(m.buf.length) : '';
    };
    m.back = function () {
      if (m.buf) m.buf = m.buf.slice(0, -1);
      else if (m.hist.length) { m.pos -= m.hist.pop(); m.done = false; m.endN = false; }
      m.swallowN = false; m.tent = null;
    };
    // 不經過羅馬拼音，直接確定 len 個假名（假名鍵盤、系統鍵盤用）
    m.adv = function (len) {
      if (m.done || len <= 0) return m.done ? 'done' : 'ok';
      m.hist.push(len); m.pos = Math.min(T.length, m.pos + len); m.buf = ''; m.swallowN = false; m.tent = null;
      if (m.pos >= T.length) { m.done = true; m.endN = false; return 'done'; }
      return 'ok';
    };
    return m;
  }

  function target(jp) {
    var segs = parse(jp), kana = '', segOf = [], segStart = [], segEnd = [], kata = [];
    segs.forEach(function (s, k) {
      segStart[k] = kana.length;
      var src = s.punct ? '' : (s.read !== null ? s.read : s.text);
      for (var i = 0; i < s.kana.length; i++) { segOf.push(k); kata.push(/[ァ-ヶー]/.test(src[i] || '')); }
      kana += s.kana;
      segEnd[k] = kana.length;
    });
    return { segs: segs, kana: kana, segOf: segOf, segStart: segStart, segEnd: segEnd, kata: kata };
  }

  var JP_TEXT = {
    parse: parse, surface: surface, reading: reading, isAllHira: isAllHira, hasDigit: hasDigit,
    toHira: toHira, toKata: toKata, html: html, esc: esc,
    romaji: romaji, romajiLine: romajiLine, romajiWord: romajiWord,
    target: target, romaCands: romaCands, romaHint: romaHint, matcher: matcher,
  };
  root.JP_TEXT = JP_TEXT;
  if (typeof module !== 'undefined' && module.exports) module.exports = JP_TEXT;
})(typeof window !== 'undefined' ? window : globalThis);
