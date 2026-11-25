/* battle-link.js — ④比：打字對戰（連到另一頁 battle.html，該頁由別人製作）
 * 這裡只產生連結：battle.html?pack=…&units=…（帶目前範圍）。 */
JP_APP.register({
  id: 'battle', step: 4, stepName: '比', short: '對戰', title: '打字對戰', desc: '和同學比賽（另開對戰頁）',
  needs: 'any',
  href: function (scope) { return 'battle.html' + JP_SCOPE.query(scope); },
});
