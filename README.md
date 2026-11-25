# PikaTool 工具網

課堂用的小工具、資訊教材、日文練習、研習活動的入口網站。純靜態網頁，放在 GitHub Pages，也可以在本機直接點開。

網址：`https://<帳號>.github.io/pika_tool/`

原本放在 CodePen 的工具會分批搬進來；還沒搬的，選單仍直接連到 CodePen。

## 資料夾結構

```
index.html        首頁（工具選單）
01_basic/         基本工具（尚未搬入）
02_it/            資訊與程式（尚未搬入）
03_jp/            日文
  n5/             N5 日文練習
    index.html    主頁：選課程與範圍 → ①看 ②認 ③打 ④比，另有掉落方塊（玩法一進去就是題目，設定在工具列）
    battle.html   打字對戰（2〜4 人連線）
    data/         課程包（題庫）與課程清單 packs.js
    js/core/      共用程式（課程包、範圍、打字、鍵盤、畫面元件、玩法登記）
    js/activities/ 各練習活動（一個玩法一個檔；怎麼寫見 js/core/UI-說明.md）
    js/battle/    對戰的題庫轉接
04_event/         研習活動（尚未搬入）
tools/            維護用的 Node 腳本（例如課程包檢查）
```

## 在本機開

直接用瀏覽器打開 `index.html` 即可（file:// 可用）。需要上網才載得到字型與動畫函式庫（Anime.js）；沒網路時一樣能用，只是沒有動畫。

## 在選單加一個工具

打開 `index.html`，在檔案上方的 `TOOLS` 加一行：

```js
{ cat:'jp', title:'名稱', url:'03_jp/xxx/index.html', demo:'typing', desc:'一兩句說明', tags:['標籤'] },
```

- `cat`：`basic`、`it`、`jp`、`event`。
- `url`：站內工具用相對路徑，而且要寫到 `index.html`（file:// 下才開得到），在同一分頁開啟；`https://` 開頭的外部連結會開新分頁。先留 `''` 會顯示「尚未設定網址」。
- `demo`：卡片動畫，可選的名稱寫在 `TOOLS` 上方的註解；按網頁最下面「看全部動畫模板」可預覽。
- 要放進「最新推薦」：把名稱加進 `FEATURED`，必須和 `title` 一字不差。
- 常見錯誤：行尾少逗號、用了中文引號。

## 加一個日文課程包

1. 把課程檔放到 `03_jp/n5/data/`（例如 `verbs.js`）。
2. 在 `03_jp/n5/data/packs.js` 加一行：`{ id:'verbs', name:'顯示名稱', file:'verbs.js', category:'單字' },`（`id` 要和課程檔裡的 `id` 相同；`category` 選填，首頁的課程下拉依它分層）。
3. 執行 `node tools/check_packs.js` 檢查格式，有錯誤會列出來。

課程檔格式寫在 `03_jp/n5/js/core/registry.js` 的檔頭註解。

## 發佈

推到 GitHub 的 `pika_tool` repo，在 Settings → Pages 選 main 分支根目錄。根目錄的 `.nojekyll` 讓 GitHub Pages 原樣提供檔案，不要刪。
