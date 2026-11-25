# 玩法畫面怎麼寫（加新玩法、改玩法的人看）

目標：**一進玩法就是題目**，樣子照舊版 `raw_source/typing-adj-single.html`、`quiz-single.html`、`fall-single.html`。範本是 `js/activities/browse.js`（①看），照它的寫法寫。怎麼登記玩法（`JP_APP.register`）見 `app.js` 檔頭與 `docs/系統-遊戲功能.md`。

## 版面（骨架由 app.js 產生，整頁一個螢幕高、不捲動）

```
.bar    [← 選單][範圍：N5 形容詞・全部] ← 骨架提供 ｜ 後面是玩法自己的 seg／chip／select（ctx.tool）
.hud    計分列（選用，ctx.hud）
.stage  題目區，撐滿、裡面可捲；mount(el, ctx) 的 el 在這裡面
.credit 課程來源（骨架自動放）
.foot   底部區（選用，ctx.foot；鍵盤放這裡）
```

「範圍」chip 點開是選範圍小面板，按「套用」後玩法會用新範圍**重新 mount**，不用自己處理。

## 工具列、計分列

```js
mount: function (el, ctx) {
  var st = ctx.store;                                   // 設定：讀 st.get(key, 預設)、改了就 st.set(key, 值)
  var opt = { show: st.get('show', 'both'), furi: st.get('furi', true) };
  function save(k, v) { opt[k] = v; st.set(k, v); paint(); }

  ctx.tool.seg([['both', '都看'], ['jp', '只看日文']], opt.show, function (v) { save('show', v); }, '看什麼');
  ctx.tool.chip(['平假名標音', '標音'], opt.furi, function (on) { save('furi', on); });   // [完整, 手機短字]
  ctx.tool.select([['m', '字：中'], ['l', '字：大']], opt.size, function (v) { save('size', v); }, '字級');
  ctx.tool.button('跳過這題', function () { … });       // 一般按鈕（chip 樣式）
  ctx.tool.space();                                     // 後面的東西靠右

  var hud = ctx.hud([['time', '時間', '0:00'], ['score', '分數', 0], ['prog', '進度', '1/20']]);   // 第二個參數 { width: 640 } 可改最大寬度
  hud.set('score', 120);
  …
}
```

- `seg`／`chip`／`select` 回傳元素：`seg.set(v)`、`chip.set(bool)`、`select.set(v)` 改顯示但不觸發回呼。
- 選項多時：主要的用 `seg`，次要的收進 `select`（手機上工具列才不會太高）。工具列在手機上會自動換行。
- **手機寬度（≤ 560px）工具列目標 2 行**（最多 3 行）。做法：
  - 分段按鈕在手機換成下拉：兩套都建好，電腦版的元素加 class `wideonly`、手機版的加 `narrowonly`（core.css 依寬度顯示其一）。例：③打 的練習方式、鍵盤；②認 把單字／句子、題型、讀音併成一個下拉。
  - `chip`／`button` 的文字可以給 `[完整, 短字]`，手機顯示短字（例：`['平假名標音', '標音']`）。
  - 骨架的「範圍」chip 在手機只顯示課程名（太長就省略號，完整文字在 `title`）。
- 計分列預設最大寬 760（同舊版 typing）；題目區用 `.inner`（640）的玩法傳 `ctx.hud(fields, { width: 640 })`，計分列才會和題目對齊（同舊版 quiz）。
- 其他 ctx（scope、items、all、count、avoid、on、every、later、frame、top）見 `app.js` 檔頭。

## 題目區、底部

- 一次一題、置中（打字）：`ctx.stage.classList.add('mid')`，再把 `.tag`、`.big`、`.zh` 放進 el。
- 由上往下（測驗、清單）：el 裡包一層 `<div class="inner">`（寬 640、置中）。
- 鍵盤：`ctx.foot.innerHTML = '<div class="kbwrap"><div class="k"></div></div>'`，再 `JP_KB.create(…)`／`JP_TYPEBOX` 畫進去。
- 結束畫面：`JP_UI.result(el, {...})`（舊版那張窄卡；參數見 `ui.js` 檔頭）。按鈕放最下面，`primary` 的是藍底。
- 想回首頁：`ctx.home()`；想讓使用者換範圍：`ctx.scopePanel()`。

## core.css 可以用的 class

| 用途 | class |
|---|---|
| 工具列 | `.bar` `.seg` `.chip`（`aria-pressed`）`.sel` `.sp`；`.wideonly`／`.narrowonly`（依寬度顯示其一） |
| 計分 | `.hud`（用 `ctx.hud` 產生） |
| 題目 | `.stage` `.stage.mid` `.inner` `.tag` `.big`（打字大字）`.prompt.jp`／`.prompt.zh`（測驗題目，黑色大字）`.zh`／`.sub`（灰色中文）`.count` `.msg` |
| 日文 | `JP_TEXT.html()` 的輸出；外層 `.nofuri` 關標音、`.furihold` 留位置；`.g` 文法藍字、`.blank` 空格 |
| 底部 | `.kbwrap`（鍵盤底色）`.credit` |
| 按鈕 | `.go`（藍底）`.go.alt`（藍框）——只用在結束畫面、對答案這類；工具列一律 `.chip`／`.seg` |
| 結束 | `.result`（標題置中）、`.review`（`.j` 日文、`.z` 中文）、`.csv` |
| 顏色 | `--paper --card --ink --muted --line --blue --ok --bad --okbg --badbg --key --key2 --jp --ui`（深色模式自動） |

玩法專屬的元件（選項按鈕 `.opt`、排順序的 `.tile`、掉落方塊…）照**舊版檔案裡的 CSS 數值**寫在玩法檔的 `JP_UI.css('玩法id', …)`，class 名稱加玩法前綴避免撞名（例：`.qz-opt`）。

## 禁止事項

- **不准做設定頁**：進玩法先出一整頁「選這個選那個再按開始」的不行。設定全部放工具列，改了就直接重新出題。
- **不准自創大卡片版面**：不要大圓角卡片、大按鈕格子、說明段落。舊版沒有的視覺元素就不要加。
- **樣式用 core.css 既有的**：顏色、字級、圓角、間距不要另外發明；真的缺，先問監督者，不要自己在玩法檔裡重做一套 `.bar`／`.chip`。
- 不要自己畫「← 回去」「換範圍」按鈕、不要碰 `.bar` 左邊兩顆（骨架的）。
- 不要捲整個頁面（`window.scrollTo`）；要捲回上面用 `ctx.top()`。
