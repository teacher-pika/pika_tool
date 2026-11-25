/* bank.js — 打字對戰的題庫轉接層與「題目範圍」區塊（battle.html 專用）
 * ============================================================================
 * 對戰程式原本吃內嵌的 window.JP_DATA；這裡改成從課程包（JP_PACKS／JP_SCOPE）取題，
 * 再轉成舊程式要的 {tag, zh, jp}，讓對戰本身的程式幾乎不用動。
 *
 * 範圍放在房間設定裡：room.cfg.pack（課程 id）、room.cfg.units（小單元 id 陣列，一律明確寫出）。
 *   ・房主出題（競速的 items、槍戰的 pool）時用自己載入的課程包。題目內容本來就隨 start 訊息
 *     發給大家，所以客人比賽時不需要題庫。
 *   ・客人收到 lobby 訊息時，照 cfg.pack 載入同一個課程包，只用在「熱身房」與大廳顯示範圍。
 *
 * 需要 battle.html 主程式裡的 $、esc、shuffle、kanaLen、CFG、Host、Client、Net（執行時才用到）。
 * ============================================================================ */

// ───── Bank：從範圍取題 ─────
const Bank={
  local:null,              // 這台自己的範圍 {pack, units:[…]}（開房時用這個；房主改範圍時一起更新）
  failed:{},               // 載入失敗的課程 id → 錯誤訊息（避免一直重試）
  pending:{},              // 正在載入的課程 id
  cache:{key:'',data:null},
  scopeOf(cfg){return {pack:cfg.pack,units:Array.isArray(cfg.units)?cfg.units:[]}},
  key(cfg){return cfg&&cfg.pack?cfg.pack+':'+(cfg.units||[]).join(','):''},
  loaded(cfg){return !!(cfg&&cfg.pack&&JP_PACKS.get(cfg.pack))},
  name(cfg){if(!cfg||!cfg.pack)return '';const p=JP_PACKS.get(cfg.pack)||JP_PACKS.info(cfg.pack);return p?p.name:cfg.pack},
  // 範圍內的題目（每題帶 unit、unitName、unitGroup）
  data(cfg){
    if(!this.loaded(cfg))return {words:[],sentences:[]};
    const k=this.key(cfg);if(this.cache.key!==k)this.cache={key:k,data:JP_SCOPE.getItems(this.scopeOf(cfg))};
    return this.cache.data;
  },
  count(cfg){return this.loaded(cfg)?JP_SCOPE.count(this.scopeOf(cfg)):null},
  ok(cfg){const c=this.count(cfg);return !!c&&(c.words+c.sentences)>0},
  // 題庫種類：g 句子、w 單字。範圍裡沒有的種類不列出
  srcList(cfg){const c=this.count(cfg);if(!c)return [];return [c.sentences?'g':null,c.words?'w':null].filter(Boolean)},
  fixSrc(cfg){const L=this.srcList(cfg);if(L.length&&!L.includes(cfg.src))cfg.src=L[0]},
  srcSelect(cfg){const L=this.srcList(cfg),T={g:'句子',w:'單字'},el=$('cfgSrc');
    const h=L.map(k=>'<option value="'+k+'">'+T[k]+'</option>').join('');
    if(el.innerHTML!==h)el.innerHTML=h;
    el.hidden=!L.length;if(L.length)el.value=cfg.src},
  conv(it,tag){return {tag:tag||it.unitName,zh:it.zh,jp:it.jp}},
  // 競速：所有人同一份題目。
  //   單字：從範圍內的單字洗牌取 n 個。
  //   句子：有句子的小單元數 ≥ 題數時，隨機挑 n 個小單元、每個抽 1 句，依課程順序排（同原版「每課抽 1 句」）；
  //         小單元不夠時，從範圍內全部句子洗牌取 n 句（同原形容詞版）。
  race(cfg,n){
    const D=this.data(cfg);
    if(cfg.src==='w')return shuffle(D.words).slice(0,n).map(w=>this.conv(w));
    const units=[],by={};
    D.sentences.forEach(s=>{if(!by[s.unit]){by[s.unit]=[];units.push(s.unit)}by[s.unit].push(s)});
    if(units.length>=n)return shuffle(units).slice(0,n).sort((a,b)=>units.indexOf(a)-units.indexOf(b))
      .map(u=>this.conv(by[u][Math.random()*by[u].length|0]));
    return shuffle(D.sentences).slice(0,n).map(s=>this.conv(s));
  },
  // 槍戰：題目池。句子只取 CFG.gunPoolMaxKana 個假名以內的；範圍內一句都不符合時（例如只選了第 6 課）才用全部句子，免得沒題目可打
  pool(cfg){
    const D=this.data(cfg);
    if(cfg.src==='w')return D.words.map(w=>this.conv(w));
    const all=D.sentences.map(s=>this.conv(s)),short=all.filter(it=>kanaLen(it.jp)<=CFG.gunPoolMaxKana);
    return short.length?short:all;
  },
  // 熱身房：照目前的題庫種類（沒有就用另一種）隨機 30 題
  warm(cfg){
    const D=this.data(cfg);let L=cfg.src==='w'?D.words:D.sentences;if(!L.length)L=cfg.src==='w'?D.sentences:D.words;
    return shuffle(L).slice(0,30).map(it=>this.conv(it,'熱身，不算成績　'+it.unitName));
  },
  // 確保 cfg 的課程已載入。已載入回 true；否則開始載入（載完呼叫 done）並回 false
  ensure(cfg,done){
    if(!cfg||!cfg.pack||this.loaded(cfg))return true;
    const id=cfg.pack;if(this.failed[id]||this.pending[id])return false;
    this.pending[id]=true;
    JP_PACKS.load(id).then(()=>{delete this.pending[id];done()},err=>{delete this.pending[id];this.failed[id]=err.message;done()});
    return false;
  },
  // 大廳要顯示的問題（沒有問題回空字串）
  problem(cfg){
    if(!cfg||!cfg.pack)return '';
    if(this.failed[cfg.pack]&&!this.loaded(cfg))return this.failed[cfg.pack]+(Net.isHost?'':'。比賽題目由房主出，仍然可以參加，只是不能熱身。');
    if(!this.loaded(cfg))return '正在載入題目範圍…';
    if(!this.ok(cfg))return Net.isHost?'目前的範圍沒有任何題目，請至少勾選一個小單元才能開始。':'房主選的範圍目前沒有題目，等房主重新選擇。';
    return '';
  },
  summary(cfg){const c=this.count(cfg);if(!c)return this.name(cfg);
    return this.name(cfg)+'・'+c.units+' 個小單元（'+[c.words?'單字 '+c.words+' 個':'',c.sentences?'句子 '+c.sentences+' 句':''].filter(Boolean).join('、')+(c.words+c.sentences?'':'沒有題目')+'）'},
  // 回練習頁的連結（units 已是明確的清單，課程還沒載入也能組）
  practiceLink(cfg){return cfg&&cfg.pack?'index.html?pack='+encodeURIComponent(cfg.pack)+'&units='+(cfg.units||[]).map(encodeURIComponent).join(','):'index.html'},
  credit(cfg){const p=cfg&&JP_PACKS.get(cfg.pack);return p&&p.credit||''},
  // 首頁：顯示這台目前的範圍
  homeDraw(){const s=this.local;
    $('homeScope').textContent=s?this.summary(s):'沒有可用的課程。';
    $('credit1').innerHTML=s?this.credit(s):'';
    $('lnkHome').href=s?this.practiceLink(s):'index.html'},
  // 進頁面：照 JP_SCOPE 的優先序（網址 ＞ 上次的選擇 ＞ 第一個課程）決定範圍
  init(){
    ['btnHostPlay','btnHostBoard','btnSolo'].forEach(id=>$(id).disabled=true);
    JP_SCOPE.resolve().then(r=>{
      this.local={pack:r.scope.pack,units:JP_SCOPE.unitIds(r.scope)};
      ['btnHostPlay','btnHostBoard','btnSolo'].forEach(id=>$(id).disabled=false);
      this.homeDraw();if(r.notes.length&&Client.phase==='home')say(r.notes.join('；'));
    },err=>{$('homeScope').textContent='課程載入失敗：'+err.message+'。仍然可以加入別人的房間。'});
  },
};

// ───── ScopeUI：大廳的「題目範圍」區塊。房主可以改，其他人唯讀 ─────
const ScopeUI={
  drawn:'',                // 目前清單畫的是哪個課程（房主）或哪個範圍（客人）
  busy:false,
  bind(){
    $('scPack').innerHTML=JP_PACKS.list.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');
    $('scPack').addEventListener('change',()=>this.pickPack($('scPack').value));
    $('scList').addEventListener('change',e=>{
      const t=e.target;if(!Net.isHost||t.type!=='checkbox')return;
      if(t.dataset.g!==undefined)$('scList').querySelectorAll('input[data-u][data-gi="'+t.dataset.g+'"]').forEach(x=>x.checked=t.checked);
      this.apply(Client.cfg.pack,[...$('scList').querySelectorAll('input[data-u]:checked')].map(x=>x.dataset.u));
    });
    $('scBtns').addEventListener('click',e=>{const b=e.target.closest('[data-sc]');if(!b||!Net.isHost)return;
      const pack=JP_PACKS.get(Client.cfg.pack);if(!pack)return;
      this.apply(pack.id,b.dataset.sc==='all'?pack.units.map(u=>u.id):b.dataset.sc==='def'?JP_SCOPE.defaultUnits(pack):[])});
  },
  // 房主改範圍：記下來（下次進頁面沿用）、更新網址，再交給 Host 同步給大家
  apply(packId,units){
    if(!Net.isHost||!Host.room)return;
    const s={pack:packId,units:JP_SCOPE.unitIds({pack:packId,units})};
    Bank.local={pack:s.pack,units:s.units.slice()};
    JP_SCOPE.save(s);JP_SCOPE.syncUrl(s);Bank.homeDraw();
    Host.setScope(s);
  },
  pickPack(id){
    if(!Net.isHost||!Host.room)return;
    this.busy=true;$('lbMsg').textContent='正在載入課程…';this.render();
    JP_PACKS.load(id).then(pack=>{this.busy=false;if(!Host.room)return;
      const rem=JP_SCOPE.remembered(id),s=JP_SCOPE.clean({pack:id,units:rem});
      this.apply(id,JP_SCOPE.unitIds(s));
    },err=>{this.busy=false;$('lbMsg').textContent=err.message;$('scPack').value=Client.cfg.pack;this.render()});
  },
  render(){
    const cfg=Client.cfg||{},host=Net.isHost,pack=JP_PACKS.get(cfg.pack);
    $('scRo').hidden=host;$('scPackRow').hidden=!host;$('scBtns').hidden=!host;
    $('scPack').value=cfg.pack||'';$('scPack').disabled=this.busy;
    $('scSum').textContent=(host?'已選 ':'')+Bank.summary(cfg);
    $('lnkLobby').href=Bank.practiceLink(cfg);$('credit2').innerHTML=Bank.credit(cfg);
    $('scMore').hidden=!pack;if(!pack)return;
    const sel=new Set(Bank.scopeOf(cfg).units);
    $('scSummary').textContent=host?'選小單元（'+sel.size+' / '+pack.units.length+'）':'看小單元清單';
    const want=(host?'h:':'r:')+(host?pack.id:Bank.key(cfg));
    if(this.drawn!==want){this.drawn=want;
      const groups=[];pack.units.forEach(u=>{const g=u.group||'';let G=groups.find(x=>x.name===g);if(!G)groups.push(G={name:g,units:[]});G.units.push(u)});
      const n=u=>[(u.words||[]).length?'單字 '+u.words.length:'',(u.sentences||[]).length?'句子 '+u.sentences.length:''].filter(Boolean).join('・');
      $('scList').innerHTML=groups.map((G,gi)=>{
        const us=host?G.units:G.units.filter(u=>sel.has(u.id));if(!us.length)return '';
        return '<fieldset class="scg">'+(G.name?'<legend>'+(host?'<label><input type="checkbox" data-g="'+gi+'"> '+esc(G.name)+'</label>':esc(G.name))+'</legend>':'')+
          us.map(u=>host?'<label class="scu"><input type="checkbox" data-u="'+esc(u.id)+'" data-gi="'+gi+'"><span>'+esc(u.name)+'</span><small>'+n(u)+'</small></label>'
                        :'<div class="scu"><span>'+esc(u.name)+'</span><small>'+n(u)+'</small></div>').join('')+'</fieldset>'}).join('')||'<p>沒有選任何小單元。</p>';
    }
    if(host){
      $('scList').querySelectorAll('input[data-u]').forEach(x=>{x.checked=sel.has(x.dataset.u);x.disabled=this.busy});
      $('scList').querySelectorAll('input[data-g]').forEach(g=>{const xs=[...$('scList').querySelectorAll('input[data-u][data-gi="'+g.dataset.g+'"]')],k=xs.filter(x=>x.checked).length;
        g.checked=k===xs.length;g.indeterminate=k>0&&k<xs.length;g.disabled=this.busy});
    }
  },
};
ScopeUI.bind();
