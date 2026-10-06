
// 保護必須在主程式之前建立；即使主程式載入失敗，也不開放未還原的比賽操作。
(()=>{
  const root=document.documentElement;
  let initialized=false;
  let failed=false;
  function showBootError(){
    if(!root.classList.contains('appBooting')) return;
    failed=true;
    root.classList.add('appBootFailed');
  }
  window.addEventListener('error',showBootError);
  window.addEventListener('load',()=>{
    if(!initialized) showBootError();
  },{once:true});
  window.finishAppBoot=()=>{
    if(initialized || failed) return;
    initialized=true;
    requestAnimationFrame(()=>{
      if(failed) return;
      // 保留版面尺寸供字級計算及瀏覽器還原捲動位置；不以 display:none 隱藏主畫面。
      // 首次排版時仍停用動畫，避免結果卡與按鈕從預設狀態滑入。
      void document.body.offsetHeight;
      const app=document.getElementById('appContent');
      app.removeAttribute('inert');
      app.removeAttribute('aria-busy');
      root.classList.remove('appBooting');
      window.removeEventListener('error',showBootError);
      requestAnimationFrame(()=>root.classList.remove('appBootNoMotion'));
    });
  };
})();


// v5.89：比賽正式身分改由 URL #match=<Match ID> 保存。
// URL fragment 會跟著 Safari 分頁本身保留；即使背景頁被系統回收並重新載入，
// 仍能從網址找回同一場比賽，不再依賴 sessionStorage 作為唯一身分來源。
const LEGACY_MATCH_KEY='football_marker_v218';
const LEGACY_SESSION_KEY_PREFIX='football_marker_v218_session_';
const LEGACY_TAB_SESSION_KEY='football_marker_tab_session_v1';
const MATCH_KEY_PREFIX='football_marker_v218_match_';
const MATCH_REGISTRY_KEY='football_marker_match_registry_v1';
const MATCH_REGISTRY_LIMIT=12;

let MATCH_ID='';
let KEY='';
let MATCH_ENTRY_MODE='url'; // url / legacy-tab / clean / missing-url
let MATCH_RECOVERY_REQUIRED=false;
let MISSING_REQUESTED_MATCH_ID='';

function isValidMatchId(value){
  return /^[a-z0-9][a-z0-9_-]{5,79}$/i.test(String(value||''));
}

function createMatchId(){
  const d=new Date();
  const datePart=
    String(d.getFullYear())+
    String(d.getMonth()+1).padStart(2,'0')+
    String(d.getDate()).padStart(2,'0');

  let randomPart='';
  try{
    const bytes=new Uint32Array(2);
    crypto.getRandomValues(bytes);
    randomPart=Array.from(bytes,n=>n.toString(36)).join('').slice(0,10);
  }catch(e){
    randomPart=Math.random().toString(36).slice(2,12);
  }
  return `${datePart}-${randomPart}`;
}

function createUniqueMatchId(){
  for(let i=0;i<6;i++){
    const id=createMatchId();
    if(!localStorage.getItem(MATCH_KEY_PREFIX+id)) return id;
  }
  return `${createMatchId()}-${Date.now().toString(36)}`;
}

function readMatchIdFromUrl(){
  try{
    const params=new URLSearchParams(location.hash.replace(/^#/,''));
    const id=params.get('match')||'';
    return isValidMatchId(id) ? id : '';
  }catch(e){
    return '';
  }
}

function writeMatchIdToUrl(id){
  if(!isValidMatchId(id)) return;
  const next=`${location.pathname}${location.search}#match=${encodeURIComponent(id)}`;
  try{
    history.replaceState(history.state,'',next);
  }catch(e){
    try{ location.hash=`match=${encodeURIComponent(id)}`; }catch(_e){}
  }
}

function activateMatchId(id,{writeUrl=true}={}){
  if(!isValidMatchId(id)) throw new Error('Invalid Match ID');
  MATCH_ID=id;
  KEY=MATCH_KEY_PREFIX+MATCH_ID;
  document.documentElement.dataset.matchId=MATCH_ID;
  if(writeUrl) writeMatchIdToUrl(MATCH_ID);
}

function copyLegacySessionToMatchId(id){
  if(!isValidMatchId(id)) return false;
  const target=MATCH_KEY_PREFIX+id;
  if(localStorage.getItem(target)) return true;

  const source=LEGACY_SESSION_KEY_PREFIX+id;
  const raw=localStorage.getItem(source);
  if(!raw) return false;

  try{
    const parsed=JSON.parse(raw);
    if(parsed && typeof parsed==='object' && !Array.isArray(parsed)){
      localStorage.setItem(target,raw);
      return true;
    }
  }catch(e){}
  return false;
}

function resolveInitialMatchIdentity(){
  const urlId=readMatchIdFromUrl();
  if(urlId){
    let hasMatchState=false;
    try{
      hasMatchState=Boolean(localStorage.getItem(MATCH_KEY_PREFIX+urlId));
    }catch(e){}

    if(!hasMatchState){
      hasMatchState=copyLegacySessionToMatchId(urlId);
    }

    if(hasMatchState){
      MATCH_ENTRY_MODE='url';
      activateMatchId(urlId,{writeUrl:false});
      return;
    }

    // v5.94：
    // URL 明確指定了某場 #match，但這台裝置找不到對應資料。
    // 不把空白 state 寫回這個不存在的 ID；先建立新的安全 Match ID，
    // 只有真的存在其他可復原紀錄時，才顯示「資料復原」選項。
    MATCH_ENTRY_MODE='missing-url';
    MATCH_RECOVERY_REQUIRED=true;
    MISSING_REQUESTED_MATCH_ID=urlId;
    activateMatchId(createUniqueMatchId(),{writeUrl:true});
    return;
  }

  // 從 v5.87 / v5.88 升級時，如果本分頁仍保有舊 sessionStorage 身分，
  // 優先沿用該 ID 並搬到新的 URL Match ID，讓正在進行的比賽不中斷。
  let oldTabId='';
  try{
    oldTabId=sessionStorage.getItem(LEGACY_TAB_SESSION_KEY)||'';
  }catch(e){}

  if(isValidMatchId(oldTabId)){
    const oldSessionRaw=localStorage.getItem(LEGACY_SESSION_KEY_PREFIX+oldTabId);
    const alreadyNew=localStorage.getItem(MATCH_KEY_PREFIX+oldTabId);
    if(oldSessionRaw || alreadyNew){
      copyLegacySessionToMatchId(oldTabId);
      MATCH_ENTRY_MODE='legacy-tab';
      activateMatchId(oldTabId,{writeUrl:true});
      return;
    }
  }

  MATCH_ENTRY_MODE='clean';
  activateMatchId(createUniqueMatchId(),{writeUrl:true});
}

function readMatchRegistry(){
  try{
    const raw=localStorage.getItem(MATCH_REGISTRY_KEY);
    if(!raw) return [];
    const list=JSON.parse(raw);
    return Array.isArray(list) ? list.filter(x=>x && isValidMatchId(x.id)) : [];
  }catch(e){
    return [];
  }
}

function writeMatchRegistry(list){
  try{
    const normalized=(Array.isArray(list)?list:[])
      .filter(x=>x && isValidMatchId(x.id))
      .sort((a,b)=>(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0))
      .slice(0,MATCH_REGISTRY_LIMIT);
    localStorage.setItem(MATCH_REGISTRY_KEY,JSON.stringify(normalized));
  }catch(e){}
}

function inferSavedUpdatedAt(saved){
  const values=[
    Number(saved?._savedAt)||0,
    Number(saved?.endEpoch)||0,
    Number(saved?.startEpoch)||0,
    Number(saved?.halftimeEndEpoch)||0,
    Number(saved?.halftimeStartEpoch)||0
  ];
  if(Array.isArray(saved?.periods)){
    saved.periods.forEach(p=>{
      values.push(Number(p?.endEpoch)||0,Number(p?.startEpoch)||0);
    });
  }
  if(Array.isArray(saved?.markers)){
    saved.markers.forEach(m=>{
      const t=Date.parse(m?.recorded_at||'');
      if(Number.isFinite(t)) values.push(t);
    });
  }
  return Math.max(0, ...values);
}

function isMeaningfulMatchState(saved){
  if(!saved || typeof saved!=='object' || Array.isArray(saved)) return false;
  return Boolean(
    saved.started ||
    saved.finished ||
    saved.awaitingNextPeriod ||
    saved.startEpoch ||
    saved.endEpoch ||
    (Array.isArray(saved.periods) && saved.periods.length) ||
    (Array.isArray(saved.markers) && saved.markers.length) ||
    Number(saved.ourScore) ||
    Number(saved.oppScore)
  );
}

function registryEntryFromState(id,saved,updatedAt=Date.now()){
  if(!isValidMatchId(id) || !isMeaningfulMatchState(saved)) return null;
  const active=!saved.finished && Boolean(
    saved.started ||
    saved.awaitingNextPeriod ||
    saved.startEpoch ||
    (Array.isArray(saved.periods) && saved.periods.length) ||
    (Array.isArray(saved.markers) && saved.markers.length) ||
    Number(saved.ourScore) ||
    Number(saved.oppScore)
  );
  return {
    id,
    updatedAt:Number(updatedAt)||Date.now(),
    ourTeam:String(saved.ourTeam||'我方').slice(0,30),
    oppTeam:String(saved.oppTeam||'對手').slice(0,30),
    competition:String(saved.competition||'').slice(0,40),
    competitionStage:String(saved.competitionStage||'').slice(0,24),
    dayMatchNumber:(Number.isInteger(Number(saved.dayMatchNumber)) && Number(saved.dayMatchNumber)>=1 && Number(saved.dayMatchNumber)<=99) ? Number(saved.dayMatchNumber) : null,
    dayMatchNumberConfirmed:Boolean(saved.finished || saved.dayMatchNumberConfirmed===true),
    venue:String(saved.venue||'').slice(0,30),
    ourScore:Number(saved.ourScore)||0,
    oppScore:Number(saved.oppScore)||0,
    started:Boolean(saved.started),
    finished:Boolean(saved.finished),
    awaitingNextPeriod:Boolean(saved.awaitingNextPeriod),
    active,
    startEpoch:Number(saved.startEpoch)||null
  };
}

function upsertMatchRegistryEntry(entry){
  if(!entry) return;
  const list=readMatchRegistry();
  const index=list.findIndex(x=>x.id===entry.id);
  if(index>=0){
    // 已有較新的即時紀錄時，不讓舊版掃描資料把時間往回覆蓋。
    if((Number(list[index].updatedAt)||0) > (Number(entry.updatedAt)||0)){
      entry.updatedAt=list[index].updatedAt;
    }
    list[index]={...list[index],...entry};
  }else{
    list.push(entry);
  }
  writeMatchRegistry(list);
}

function updateMatchRegistryFromState(){
  const entry=registryEntryFromState(MATCH_ID,state,Number(state?._savedAt)||Date.now());
  if(entry) upsertMatchRegistryEntry(entry);
}

function bootstrapMatchRegistry(){
  // Registry 只是索引，不是比賽本體；每次啟動都從真正的 match state 重建。
  // 這也會修復 v5.89 曾把多筆舊比賽顯示成相同「剛剛更新」時間的問題。
  try{ localStorage.removeItem(MATCH_REGISTRY_KEY); }catch(e){}

  // 掃描 v5.89 Match key，以及 v5.87/v5.88 舊 Session key。
  // 舊資料只「複製」到新 key，不刪除來源，方便必要時回退版本。
  const keys=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k) keys.push(k);
  }

  keys.forEach(k=>{
    let id='';
    let targetKey='';
    if(k.startsWith(MATCH_KEY_PREFIX)){
      id=k.slice(MATCH_KEY_PREFIX.length);
      targetKey=k;
    }else if(k.startsWith(LEGACY_SESSION_KEY_PREFIX)){
      id=k.slice(LEGACY_SESSION_KEY_PREFIX.length);
      targetKey=MATCH_KEY_PREFIX+id;
    }else{
      return;
    }

    if(!isValidMatchId(id)) return;

    try{
      const raw=localStorage.getItem(k);
      if(!raw) return;
      const saved=JSON.parse(raw);
      if(!isMeaningfulMatchState(saved)) return;

      if(k.startsWith(LEGACY_SESSION_KEY_PREFIX) && !localStorage.getItem(targetKey)){
        localStorage.setItem(targetKey,raw);
      }
      upsertMatchRegistryEntry(
        registryEntryFromState(id,saved,inferSavedUpdatedAt(saved))
      );
    }catch(e){}
  });

  // 更舊的單一 football_marker_v218 也保留在復原清單中。
  try{
    const raw=localStorage.getItem(LEGACY_MATCH_KEY);
    if(raw){
      const saved=JSON.parse(raw);
      if(isMeaningfulMatchState(saved)){
        const id='legacy-v586';
        const target=MATCH_KEY_PREFIX+id;
        if(!localStorage.getItem(target)) localStorage.setItem(target,raw);
        upsertMatchRegistryEntry(
          registryEntryFromState(id,saved,inferSavedUpdatedAt(saved))
        );
      }
    }
  }catch(e){}
}

function recoveryDateText(epoch){
  if(!epoch) return '';
  const d=new Date(epoch);
  if(Number.isNaN(d.getTime())) return '';
  return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function getRecoverableMatches(){
  return readMatchRegistry()
    .filter(x=>x.id!==MATCH_ID && x.active && !x.finished)
    .sort((a,b)=>(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0))
    .slice(0,6);
}

let recoverySwitchInProgress=false;


function closeMatchRecoveryIssue(){
  byId('matchRecoveryIssueModal')?.classList.remove('open');
  document.body.style.overflow='';
}

function dismissMissingMatchRecovery(){
  MATCH_RECOVERY_REQUIRED=false;
  MISSING_REQUESTED_MATCH_ID='';
  closeMatchRecoveryIssue();
}

function openRecoveryFromMissingMatch(){
  closeMatchRecoveryIssue();
  openMatchRecovery();
}

function showMissingMatchRecoveryIfNeeded(){
  if(!MATCH_RECOVERY_REQUIRED) return;

  const matches=getRecoverableMatches();
  if(!matches.length){
    // 另一台手機拿到 #match URL 也會落在這裡：
    // 該裝置沒有這場 localStorage，自然不能讀到原手機的內容。
    MATCH_RECOVERY_REQUIRED=false;
    MISSING_REQUESTED_MATCH_ID='';
    showQuickNotice(
      '找不到原本的比賽資料',
      '這台裝置沒有該場資料，已建立新的獨立比賽'
    );
    return;
  }

  const text=byId('matchRecoveryIssueText');
  if(text){
    text.textContent=`網址指定的比賽在這台裝置找不到資料，但偵測到 ${matches.length} 筆其他本機紀錄。`;
  }

  document.body.style.overflow='hidden';
  byId('matchRecoveryIssueModal')?.classList.add('open');
}


function closeMatchRecovery(){
  byId('matchRecoveryModal')?.classList.remove('open');
  document.body.style.overflow='';
}

function continueRecoveredMatch(id){
  if(!isValidMatchId(id)) return;
  const key=MATCH_KEY_PREFIX+id;
  if(!localStorage.getItem(key)){
    copyLegacySessionToMatchId(id);
  }
  if(!localStorage.getItem(key)){
    showQuickNotice('找不到比賽資料','這場比賽的儲存內容目前不存在');
    return;
  }

  // 先保存「目前這場」，但不要把 KEY 切成目標場。
  // v5.89 的 Bug 就是先切 KEY 再 reload，導致 pagehide 把目前 state 寫進目標場。
  try{ saveState(); }catch(e){}
  recoverySwitchInProgress=true;
  closeMatchRecovery();
  writeMatchIdToUrl(id);
  location.reload();
}

function openMatchRecovery(){
  const matches=getRecoverableMatches();
  if(!matches.length){
    showQuickNotice('沒有可復原的資料','目前沒有偵測到其他可用的本機比賽紀錄');
    return;
  }

  byId('matchRecoveryIssueModal')?.classList.remove('open');
  const list=byId('matchRecoveryList');
  if(!list) return;
  list.innerHTML='';

  matches.forEach(m=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='matchRecoveryItem';
    button.addEventListener('click',()=>continueRecoveredMatch(m.id));

    const top=document.createElement('div');
    top.className='matchRecoveryTop';

    const teams=document.createElement('strong');
    teams.textContent=`${m.ourTeam||'我方'} vs ${m.oppTeam||'對手'}`;

    const score=document.createElement('span');
    score.className='matchRecoveryScore';
    score.textContent=`${m.ourScore||0}:${m.oppScore||0}`;

    top.appendChild(teams);
    top.appendChild(score);

    const meta=document.createElement('div');
    meta.className='matchRecoveryMeta';
    const status=m.awaitingNextPeriod?'中場／等待開賽':m.started?'比賽中':'未完成';
    const detail=[recoveryDateText(m.updatedAt),status,m.competition,m.competitionStage,m.dayMatchNumber?formatDayMatchLabel(m.dayMatchNumber):'',m.venue].filter(Boolean);
    meta.textContent=detail.join(' · ');

    const hint=document.createElement('div');
    hint.className='matchRecoveryContinue';
    hint.textContent='繼續這場比賽 ›';

    button.appendChild(top);
    button.appendChild(meta);
    button.appendChild(hint);
    list.appendChild(button);
  });

  document.body.style.overflow='hidden';
  byId('matchRecoveryModal')?.classList.add('open');
}

resolveInitialMatchIdentity();

const LAST_OUR_TEAM_KEY='football_marker_last_our_team';
const LAST_VENUE_KEY='football_marker_last_venue';
const RECENT_VENUES_KEY='football_marker_recent_venues_v1';
let guidedSetupStep=null; // 'our' -> 'opp' -> 'competition' -> 'venue' during pre-match guided input
let nextMatchOpponentOnly=false; // v5.159：沿用上一場資料時，只需重新輸入對手
const LEARNED_NUMBERS_KEY='football_marker_learned_numbers_v1'; // 舊版相容保留，不再直接驅動快捷背號
const LEARNED_ROSTER_POOL_KEY='football_marker_learned_roster_pool_v2'; // v5.160 舊池，僅供一次性遷移
const RECENT_ROSTER_HISTORY_KEY='football_marker_recent_roster_history_v1';
const RECENT_ROSTER_HISTORY_INIT_KEY='football_marker_recent_roster_history_initialized_v1';
const RECENT_ROSTER_MATCH_LIMIT=5;
const RECENT_ROSTER_NUMBER_LIMIT=24;
const LAST_ROSTER_KEY='football_marker_last_roster_v1';
const COMMON_NUMBERS=[7,13,14,16,17,19,21,22,25,30,31,32,36,40,51,56,59,71];
let editingMarkerIndex=null, editingMarkerEvent=null, editingMarkerTeam='OUR', editingMarkerOwnGoal=false;
let pendingGoalTime=null, pendingGoalTeam=null, pendingOwnGoalTeam=null;
let pendingAssistMarkerIndex=null;
let pendingCardTime=null, pendingCardEvent=null;
let pendingNumberEvent=null, pendingNumberTime=null, pendingNumberTeam=null;
let pendingFinishEnd=null, pendingFinishElapsed=null;
let timeExpanded=false;
let regulationEditorExpanded=false;

let state={
  ourTeam:'忠義國小', oppTeam:'', venue:'', competition:'', competitionStage:'',
  dayMatchNumber:null, dayMatchNumberManual:false, dayMatchNumberLocked:false, dayMatchNumberConfirmed:false,
  started:false, finished:false,
  startEpoch:null, endEpoch:null, finalElapsed:0,
  regulationMinutes:null,
  ourScore:0, oppScore:0,
  markers:[],
  currentPeriod:1,
  awaitingNextPeriod:false,
  multiPeriod:false,
  periodStartOurScore:0,
  periodStartOppScore:0,
  periods:[],
  nextPeriodType:null,
  extraTime:false,
  extraTimeMinutes:null,
  penalty:null,
  goalkeeperNumber:'',
  // v5.159：記錄「因設定守門員而自動加入名單」的背號來源。
  // 只有這種自動加入的舊守門員，在更換守門員時才會自動移除；
  // 原本就由使用者選進名單的球員，即使不再守門仍會保留。
  goalkeeperAutoRosterNumber:'',
  rosterNumbers:[],
  jerseyColor:'default',
  halftimeStartEpoch:null,
  halftimeEndEpoch:null,
  halftimeDuration:0,
  longDurationAckStartEpoch:null,
  regulationPulseAckToken:''
};

function byId(id){ return document.getElementById(id); }

function validDayMatchNumber(value){
  const n=Number(value);
  return Number.isInteger(n) && n>=1 && n<=99 ? n : null;
}
function chineseNumberUnder100(value){
  const n=validDayMatchNumber(value);
  if(!n) return '';
  const digit=['零','一','二','三','四','五','六','七','八','九'];
  if(n<10) return digit[n];
  if(n===10) return '十';
  const tens=Math.floor(n/10), ones=n%10;
  if(tens===1) return `十${ones?digit[ones]:''}`;
  return `${digit[tens]}十${ones?digit[ones]:''}`;
}
function formatDayMatchLabel(value){
  const n=validDayMatchNumber(value);
  return n ? `第${chineseNumberUnder100(n)}場` : '';
}
function normalizedDayMatchTeam(value){
  return String(value||'').trim().toLocaleLowerCase('zh-Hant-TW');
}
function savedMatchReferenceEpoch(saved){
  const direct=Number(saved?.startEpoch)||0;
  if(direct>0) return direct;
  const first=Array.isArray(saved?.periods) ? Number(saved.periods?.[0]?.startEpoch)||0 : 0;
  return first>0 ? first : 0;
}
function dayMatchStoredItemsForTeamDay(team,epoch){
  const normalizedTeam=normalizedDayMatchTeam(team);
  const targetEpoch=Number(epoch)||Date.now();
  const items=[];
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(!key || !key.startsWith(MATCH_KEY_PREFIX)) continue;
      const id=key.slice(MATCH_KEY_PREFIX.length);
      if(!isValidMatchId(id)) continue;
      const raw=localStorage.getItem(key);
      if(!raw) continue;
      let saved;
      try{ saved=JSON.parse(raw); }catch(e){ continue; }
      if(!saved || typeof saved!=='object' || Array.isArray(saved)) continue;
      const start=savedMatchReferenceEpoch(saved);
      if(!start || !isSameCalendarDay(start,targetEpoch)) continue;
      if(normalizedDayMatchTeam(saved.ourTeam||'')!==normalizedTeam) continue;
      items.push({id,start,saved});
    }
  }catch(e){}
  return items;
}
function isConfirmedDayMatch(saved){
  if(!saved || typeof saved!=='object') return false;
  // v5.183：真正「比賽結束」後才正式計入本日場次。
  // finished 同時做舊版相容：v5.179 以前已完成的比賽視為已確認。
  return Boolean(saved.finished || saved.dayMatchNumberConfirmed===true);
}
function isReservedDayMatch(saved){
  if(!saved || typeof saved!=='object' || isConfirmedDayMatch(saved)) return false;
  // 開始比賽後先預留號碼，避免同一天另一場正在進行時撞到相同場次。
  // 中場／等待延長賽／PK 階段 started 可能為 false，因此一併視為有效預留。
  return Boolean(
    saved.dayMatchNumberLocked &&
    (saved.started || saved.awaitingNextPeriod || saved.penalty?.active || saved.startEpoch)
  );
}
function formalMatchesForTeamDay(team,epoch){
  // 「正式場次」只包含已完成／已確認的比賽。
  return dayMatchStoredItemsForTeamDay(team,epoch).filter(x=>isConfirmedDayMatch(x.saved));
}
function reservedMatchesForTeamDay(team,epoch){
  // 尚未完賽但已開始的比賽只占用「預留號碼」，不算正式完成場次。
  return dayMatchStoredItemsForTeamDay(team,epoch).filter(x=>isReservedDayMatch(x.saved));
}
function suggestNextDayMatchNumber(team,epoch=Date.now()){
  const formal=formalMatchesForTeamDay(team,epoch);
  const reserved=reservedMatchesForTeamDay(team,epoch);
  const occupied=[...formal,...reserved]
    .map(x=>validDayMatchNumber(x.saved?.dayMatchNumber)||0)
    .filter(Boolean);
  const maxStored=occupied.length ? Math.max(...occupied) : 0;
  // 沒有舊編號的完成場次仍至少依完成場數遞增；進行中的預留則避免號碼碰撞。
  return Math.min(99,Math.max(1,Math.max(formal.length+reserved.length,maxStored)+1));
}
function inferExistingDayMatchNumber(team,epoch,id=MATCH_ID){
  const formal=formalMatchesForTeamDay(team,epoch);
  const reserved=reservedMatchesForTeamDay(team,epoch);
  const items=[...formal,...reserved]
    .filter((item,index,arr)=>arr.findIndex(x=>x.id===item.id)===index)
    .sort((a,b)=>a.start-b.start || a.id.localeCompare(b.id));
  const index=items.findIndex(x=>x.id===id);
  if(index>=0) return Math.min(99,index+1);
  return Math.min(99,Math.max(1,items.length||1));
}
function ensureDayMatchNumber({persist=false}={}){
  let current=validDayMatchNumber(state.dayMatchNumber);
  if(current){
    state.dayMatchNumber=current;
    if(typeof state.dayMatchNumberManual!=='boolean') state.dayMatchNumberManual=false;
    if(typeof state.dayMatchNumberLocked!=='boolean') state.dayMatchNumberLocked=!!(state.started||state.finished||state.startEpoch);
    if(typeof state.dayMatchNumberConfirmed!=='boolean') state.dayMatchNumberConfirmed=!!state.finished;
    if(state.finished) state.dayMatchNumberConfirmed=true;
    return current;
  }
  const team=String(state.ourTeam||localStorage.getItem(LAST_OUR_TEAM_KEY)||'忠義國小').trim()||'忠義國小';
  const reference=Number(state.startEpoch)||Date.now();
  if(state.started || state.finished || state.startEpoch){
    current=inferExistingDayMatchNumber(team,reference,MATCH_ID);
    state.dayMatchNumberLocked=true;
  }else{
    current=suggestNextDayMatchNumber(team,reference);
    state.dayMatchNumberLocked=false;
  }
  state.dayMatchNumber=current;
  state.dayMatchNumberManual=false;
  state.dayMatchNumberConfirmed=!!state.finished;
  if(persist){
    try{ localStorage.setItem(KEY,JSON.stringify(state)); }catch(e){}
  }
  return current;
}
function refreshAutoDayMatchNumber(){
  if(state.started || state.finished || state.dayMatchNumberLocked || state.dayMatchNumberManual) return;
  const team=String(state.ourTeam||localStorage.getItem(LAST_OUR_TEAM_KEY)||'忠義國小').trim()||'忠義國小';
  state.dayMatchNumber=suggestNextDayMatchNumber(team,Date.now());
}
function renderDayMatchMeta(){
  const display=byId('dayMatchDisplay');
  const source=byId('dayMatchSourceBadge');
  const editBtn=byId('dayMatchEditBtn');
  const editor=byId('dayMatchEditor');
  if(!display || !source || !editBtn || !editor) return;
  const n=ensureDayMatchNumber();
  display.textContent=formatDayMatchLabel(n)||'第一場';
  source.textContent=state.dayMatchNumberManual?'手動':'自動';
  source.classList.toggle('manual',!!state.dayMatchNumberManual);
  const editable=!state.started && !state.finished && !state.dayMatchNumberLocked;
  editBtn.hidden=!editable;
  if(!editable) editor.hidden=true;
}
function beginDayMatchEdit(){
  if(state.started || state.finished || state.dayMatchNumberLocked) return;
  const editor=byId('dayMatchEditor');
  const input=byId('dayMatchNumberInput');
  const editBtn=byId('dayMatchEditBtn');
  if(!editor || !input) return;
  input.value=validDayMatchNumber(state.dayMatchNumber)||1;
  editor.hidden=false;
  if(editBtn) editBtn.hidden=true;
  setTimeout(()=>{ input.focus(); try{input.select();}catch(e){} },30);
}
function cancelDayMatchEdit(){
  const editor=byId('dayMatchEditor');
  const editBtn=byId('dayMatchEditBtn');
  if(editor) editor.hidden=true;
  if(editBtn && !state.started && !state.finished && !state.dayMatchNumberLocked) editBtn.hidden=false;
}
function applyDayMatchEdit(){
  if(state.started || state.finished || state.dayMatchNumberLocked) return;
  const input=byId('dayMatchNumberInput');
  const n=validDayMatchNumber(input?.value);
  if(!n){
    showQuickNotice('場次格式不正確','本日場次請輸入 1～99 的整數');
    input?.focus();
    return;
  }
  state.dayMatchNumber=n;
  state.dayMatchNumberManual=true;
  cancelDayMatchEdit();
  saveState();
  render();
}

// v5.120：使用者可見的比賽時間統一採「整秒」基準。
// Epoch 仍維持毫秒格式，讓既有 new Date(epoch) / 時區 / 跨日邏輯完全相容；
// 只是把毫秒尾數固定為 000。系統用途的 Match ID、_savedAt、registry updatedAt
// 仍繼續使用 Date.now() 的毫秒精度，不受此函式影響。
function nowWholeMs(){
  return Math.floor(Date.now()/1000)*1000;
}
function toWholeSecondEpoch(value){
  const n=Number(value);
  if(!Number.isFinite(n) || n<=0) return null;
  return Math.floor(n/1000)*1000;
}
function wholeSecondDuration(startEpoch,endEpoch,fallback=0){
  const start=toWholeSecondEpoch(startEpoch);
  const end=toWholeSecondEpoch(endEpoch);
  if(start && end) return Math.max(0,(end-start)/1000);
  return Math.max(0,Math.floor(Number(fallback)||0));
}

// v5.122：事件相對時間也統一採整秒。
// recorded_at 屬於系統稽核 / 排序 timestamp，保留原始毫秒精度，不由此函式處理。
function wholeSecondMarkerSeconds(value){
  const n=Number(value);
  if(!Number.isFinite(n) || n<0) return 0;
  return Math.floor(n);
}

// v5.121：所有「使用者可見的比賽時間」統一到整秒，包括已完成歷史比賽。
// v5.122：再把事件 markers 的 seconds / time 與 CSV 匯出同步成同一整秒基準。
// 若某個已完成階段同時有 startEpoch / endEpoch，duration 以兩個整秒邊界重新計算；
// 因此報表上的 HH:MM:SS 可以直接人工相減，與「實際比賽時間」一致。
// Match ID、_savedAt、Registry updatedAt 仍保留毫秒精度，不由此函式處理。
function normalizeMatchTimingToWholeSeconds(){
  let changed=false;

  const normalizeField=(obj,key)=>{
    if(!obj || !(key in obj) || obj[key]==null) return null;
    const old=Number(obj[key]);
    const next=toWholeSecondEpoch(old);
    if(next!==null && next!==old){
      obj[key]=next;
      changed=true;
    }
    return next;
  };

  normalizeField(state,'startEpoch');
  normalizeField(state,'endEpoch');
  normalizeField(state,'halftimeStartEpoch');
  normalizeField(state,'halftimeEndEpoch');
  normalizeField(state,'longDurationAckStartEpoch');

  let hasPeriodData=false;
  if(Array.isArray(state.periods)){
    state.periods.forEach(p=>{
      if(!p || typeof p!=='object') return;
      hasPeriodData=true;

      const start=normalizeField(p,'startEpoch');
      const end=normalizeField(p,'endEpoch');

      let nextDuration;
      if(start && end && end>=start){
        nextDuration=(end-start)/1000;
      }else{
        // 舊資料若缺少起訖時間，不猜測；只把既有 duration 安全取整秒。
        nextDuration=Math.max(0,Math.floor(Number(p.duration)||0));
      }

      if(Number(p.duration)!==nextDuration){
        p.duration=nextDuration;
        changed=true;
      }
    });
  }

  if(state.halftimeStartEpoch){
    const nextHalf=state.halftimeEndEpoch
      ? wholeSecondDuration(state.halftimeStartEpoch,state.halftimeEndEpoch,state.halftimeDuration)
      : Math.max(0,Math.floor(Number(state.halftimeDuration)||0));
    if(Number(state.halftimeDuration)!==nextHalf){
      state.halftimeDuration=nextHalf;
      changed=true;
    }
  }else if(!Number.isInteger(Number(state.halftimeDuration))){
    state.halftimeDuration=Math.max(0,Math.floor(Number(state.halftimeDuration)||0));
    changed=true;
  }

  if(state.penalty && typeof state.penalty==='object'){
    normalizeField(state.penalty,'startEpoch');
    normalizeField(state.penalty,'endEpoch');
  }

  // 已完成比賽：若有 periods，就以各階段「整秒起訖」重算實際比賽時間。
  // PK 時間、中場休息、等待延長賽時間都不計入 finalElapsed。
  if(state.finished && hasPeriodData){
    const nextFinal=state.periods.reduce(
      (sum,p)=>sum+Math.max(0,Math.floor(Number(p?.duration)||0)),
      0
    );
    if(Number(state.finalElapsed)!==nextFinal){
      state.finalElapsed=nextFinal;
      changed=true;
    }
  }else{
    const nextFinal=Math.max(0,Math.floor(Number(state.finalElapsed)||0));
    if(Number(state.finalElapsed)!==nextFinal){
      state.finalElapsed=nextFinal;
      changed=true;
    }
  }

  // v5.122：舊版事件若仍有小數秒，將 seconds 與 time 同步成同一個整秒值。
  // 例如 5.7 秒會統一為 seconds=5、time=00:05。
  // recorded_at 保留原始 ISO timestamp（含毫秒），不改寫。
  if(Array.isArray(state.markers)){
    state.markers.forEach(m=>{
      if(!m || typeof m!=='object') return;
      const nextSeconds=wholeSecondMarkerSeconds(m.seconds);
      if(Number(m.seconds)!==nextSeconds || typeof m.seconds!=='number'){
        m.seconds=nextSeconds;
        changed=true;
      }
      const nextTime=fmtMMSS(nextSeconds);
      if(String(m.time||'')!==nextTime){
        m.time=nextTime;
        changed=true;
      }
    });
  }

  return changed;
}

function containsBopomofo(value){
  // 注音符號、聲調符號與注音擴充區：ㄅ～ㄩ、ˊˇˋ˙、ㆠ～ㆺ。
  return /[\u02C7\u02CA-\u02CB\u02D9\u3105-\u312F\u31A0-\u31BF]/u.test(String(value||''));
}

function validateTextField(id, label, required, maxLength){
  const el=byId(id);
  const value=el.value.trim();

  if(required && !value){
    el.classList.add('requiredError');
    alert(`請先輸入${label}`);
    el.focus();
    return null;
  }
  if(value.length>maxLength){
    el.classList.add('requiredError');
    alert(`${label}最多可輸入 ${maxLength} 個字`);
    el.focus();
    return null;
  }
  if(/[<>\r\n]/.test(value)){
    el.classList.add('requiredError');
    alert(`${label}不可包含 <、> 或換行字元`);
    el.focus();
    return null;
  }
  if(containsBopomofo(value)){
    el.classList.add('requiredError');
    // iPhone Safari 在欄位離開期間同時顯示原生視窗與重新聚焦，可能形成重複驗證迴圈。
    // 改用頁面內非阻塞提示；欄位保留錯誤狀態，使用者可直接回到欄位修正。
    showQuickNotice('請修正文字',`${label}不可使用注音符號，請完成選字或改為正式文字`,4200);
    return null;
  }

  el.classList.remove('requiredError');
  return value;
}

function validateIntegerField(id, label, min, max, allowBlank=false){
  const el=byId(id);
  const raw=String(el.value).trim();

  if(raw===''){
    if(allowBlank) return null;
    alert(`請輸入${label}`);
    el.focus();
    return undefined;
  }

  const n=Number(raw);
  if(!Number.isInteger(n) || n<min || n>max){
    alert(`${label}請輸入 ${min}～${max} 的整數`);
    el.focus();
    return undefined;
  }
  return n;
}

function focusMatchRequiredField(id){
  const el=byId(id);
  if(!el) return;

  // 我方／對手的 input 平常隱藏在隊名顯示框內，
  // 必須先切換到 editing 狀態，單純 focus() 不會讓使用者看見輸入框。
  if(id==='ourTeam' || id==='oppTeam'){
    editTeamName(id);
    setTimeout(()=>{
      el.classList.add('requiredError');
      el.classList.add('guidedInput');
      el.focus();
      try{ el.select(); }catch(e){}
    },30);
    return;
  }

  el.classList.add('requiredError');
  el.classList.add('guidedInput');
  setTimeout(()=>{
    el.focus();
    try{ el.select(); }catch(e){}
  },30);
}

function focusFirstMissingPreMatchField(){
  // v4.93：我方名稱可稍後補，不再有會阻擋開賽的必填欄位。
  return false;
}

function validateMatchTextFields(){
  // v4.93：我方 / 對手 / 場地 / 賽事名稱都可稍後補充。
  // 空白不阻擋開賽；只有「有填內容但格式不合法」才需要修正。
  const our=validateTextField('ourTeam','我方隊伍名稱',false,15);
  if(our===null){ focusMatchRequiredField('ourTeam'); return false; }

  const opp=validateTextField('oppTeam','對手隊伍名稱',false,15);
  if(opp===null){ focusMatchRequiredField('oppTeam'); return false; }

  const v=validateTextField('venue','比賽場地',false,30);
  if(v===null){ focusMatchRequiredField('venue'); return false; }

  const competition=validateTextField('competition','比賽賽事',false,40);
  if(competition===null){ byId('competition').focus(); return false; }
  const competitionStage=validateTextField('competitionStage','賽事階段／輪次',false,24);
  if(competitionStage===null){ byId('competitionStage')?.focus(); return false; }

  return true;
}


function isEligibleVenueValue(value){
  const venue=String(value||'').trim();
  const chineseCount=(venue.match(/[\u3400-\u4DBF\u4E00-\u9FFF]/g)||[]).length;
  return Boolean(
    venue.length>=3 &&
    venue.length<=30 &&
    chineseCount>=2 &&
    !/[<>\r\n]/.test(venue)
  );
}

function getRecentVenues(){
  let items=[];
  try{
    const raw=JSON.parse(localStorage.getItem(RECENT_VENUES_KEY)||'[]');
    if(Array.isArray(raw)) items=raw;
  }catch(e){}

  // v4.04：最近場地只來自「已開始比賽」時正式寫入的清單。
  // 不再把 LAST_VENUE_KEY 自動混入，避免賽前打字就出現在最近場地。
  return [...new Set(
    items
      .map(v=>String(v||'').trim())
      .filter(v=>isEligibleVenueValue(v))
  )].slice(0,8);
}

function rememberRecentVenue(value){
  const venue=String(value||'').trim();
  if(!isEligibleVenueValue(venue)) return false;

  const items=getRecentVenues().filter(v=>v!==venue);
  items.unshift(venue);
  localStorage.setItem(RECENT_VENUES_KEY,JSON.stringify(items.slice(0,8)));
  return true;
}

function deleteRecentVenue(value){
  const venue=String(value||'').trim();
  if(!venue) return;

  const items=getRecentVenues().filter(v=>v!==venue);
  localStorage.setItem(RECENT_VENUES_KEY,JSON.stringify(items.slice(0,8)));
  renderVenueMenu();
}

const COMPETITION_STAGE_GROUPS=[
  {key:'league',title:'聯賽常用輪次',items:['第1輪','第2輪','第3輪','第4輪','第5輪','第6輪','第7輪','第8輪','第9輪','第10輪','第11輪','第12輪']},
  {key:'cup',title:'盃賽／淘汰賽',items:['小組賽','32強','16強','8強','4強','冠亞軍','三四名','排名賽']},
  {key:'other',title:'其他常見階段',items:['例行賽','季後賽','冠軍組','排名組','保級組']}
];
function competitionStageMenuMode(){
  const name=String(byId('competition')?.value||state.competition||'').trim();
  if(!name) return 'all';

  // v5.183：優先辨識盃賽，避免像「聯賽盃」同時含「聯賽」時被錯判成聯賽。
  // 常見中文「盃／杯」、淘汰賽、錦標賽與英文 Cup 均視為盃賽型態。
  if(/盃|杯|淘汰賽|錦標賽|\bcup\b/i.test(name)) return 'cup';
  if(/聯賽|\bleague\b/i.test(name)) return 'league';
  return 'all';
}
function competitionStageMenuGroups(){
  const mode=competitionStageMenuMode();
  if(mode==='league') return COMPETITION_STAGE_GROUPS.filter(group=>group.key==='league');
  if(mode==='cup') return COMPETITION_STAGE_GROUPS.filter(group=>group.key==='cup');
  return COMPETITION_STAGE_GROUPS;
}
function renderCompetitionStageMenu(){
  const menu=byId('competitionStageMenu');
  if(!menu) return;
  const current=String(byId('competitionStage')?.value||state.competitionStage||'').trim();
  const competitionName=String(byId('competition')?.value||state.competition||'').trim();
  const mode=competitionStageMenuMode();
  const groups=competitionStageMenuGroups();
  const hint=mode==='league'
    ? `已依「${competitionName}」顯示聯賽常用輪次；也可自行輸入。`
    : mode==='cup'
      ? `已依「${competitionName}」顯示盃賽／淘汰賽階段；也可自行輸入。`
      : '無法由賽事名稱明確判斷賽制，先顯示完整選項；也可自行輸入。';
  let html=`<div class="stageMenuTitle">選擇賽事階段／輪次</div><div class="stageMenuHint">${escapeHtml(hint)}</div>`;
  groups.forEach(group=>{
    html+=`<div class="stageMenuGroupTitle">${escapeHtml(group.title)}</div><div class="stageMenuGrid">`;
    html+=group.items.map(value=>`<button class="stageMenuItem${current===value?' selected':''}" type="button" role="menuitem" data-stage-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`).join('');
    html+='</div>';
  });
  html+='<button class="stageMenuManual" type="button" data-stage-manual="1">自訂輸入…</button>';
  menu.innerHTML=html;
  menu.querySelectorAll('[data-stage-value]').forEach(btn=>btn.addEventListener('click',()=>chooseCompetitionStage(btn.getAttribute('data-stage-value')||'')));
  menu.querySelector('[data-stage-manual="1"]')?.addEventListener('click',()=>{
    closeCompetitionStageMenu();
    const input=byId('competitionStage');
    input?.focus();
    try{input?.setSelectionRange(input.value.length,input.value.length)}catch(e){}
  });
}
function ensureCompetitionStageMenuPortal(){
  const menu=byId('competitionStageMenu');
  if(!menu) return null;
  if(menu.parentElement!==document.body) document.body.appendChild(menu);
  return menu;
}
function positionCompetitionStageMenu(){
  const menu=byId('competitionStageMenu');
  const field=document.querySelector('.stageMetaField');
  if(!menu||!field||!menu.classList.contains('open')) return;
  const rect=field.getBoundingClientRect();
  const vv=window.visualViewport;
  const vw=vv?.width||window.innerWidth||document.documentElement.clientWidth;
  const vh=vv?.height||window.innerHeight||document.documentElement.clientHeight;
  const ox=vv?.offsetLeft||0, oy=vv?.offsetTop||0, gap=10;
  const width=Math.min(330,Math.max(240,vw-gap*2));
  menu.style.width=`${Math.round(width)}px`;
  let left=rect.right-width;
  left=Math.max(ox+gap,Math.min(left,ox+vw-width-gap));
  const topEdge=oy+gap,bottomEdge=oy+vh-gap;
  const below=Math.max(0,bottomEdge-(rect.bottom+6));
  const above=Math.max(0,(rect.top-6)-topEdge);
  const desired=Math.min(menu.scrollHeight||360,420);
  let top,available;
  if(below>=Math.min(desired,190)||below>=above){top=rect.bottom+6;available=below}else{available=above;top=rect.top-6-Math.min(desired,available)}
  const maxH=Math.max(130,Math.min(420,available));
  menu.style.maxHeight=`${Math.round(maxH)}px`;
  top=Math.max(topEdge,Math.min(top,bottomEdge-Math.min(desired,maxH)));
  menu.style.left=`${Math.round(left)}px`;menu.style.top=`${Math.round(top)}px`;
}
function openCompetitionStageMenu(){
  if(state.started||state.finished) return;
  closeVenueMenu();
  const btn=byId('competitionStageDropdownBtn');
  const menu=ensureCompetitionStageMenuPortal();
  if(!btn||!menu) return;
  renderCompetitionStageMenu();
  menu.classList.add('open');btn.classList.add('open');btn.setAttribute('aria-expanded','true');
  requestAnimationFrame(()=>{positionCompetitionStageMenu();requestAnimationFrame(positionCompetitionStageMenu)});
}
function closeCompetitionStageMenu(){
  const menu=byId('competitionStageMenu'),btn=byId('competitionStageDropdownBtn');
  menu?.classList.remove('open');
  if(menu){menu.style.left='';menu.style.top='';menu.style.width='';menu.style.maxHeight=''}
  btn?.classList.remove('open');btn?.setAttribute('aria-expanded','false');
}
function toggleCompetitionStageMenu(event){
  event?.preventDefault();event?.stopPropagation();
  if(byId('competitionStageMenu')?.classList.contains('open')) closeCompetitionStageMenu();
  else openCompetitionStageMenu();
}
function chooseCompetitionStage(value){
  const stage=String(value||'').trim().slice(0,24);
  if(/[<>\r\n]/.test(stage)) return;
  const input=byId('competitionStage');
  if(input) input.value=stage;
  state.competitionStage=stage;
  saveState();closeCompetitionStageMenu();updatePreMetaInputFit(input);render();
}

function renderVenueMenu(){
  const menu=byId('venueMenu');
  if(!menu) return;

  const items=getRecentVenues();
  let html='<div class="venueMenuTitle">最近使用場地</div>';

  if(items.length){
    html+=items.map((v,index)=>`
      <div class="venueMenuRow">
        <button class="venueMenuItem venueMenuSelect" type="button" role="menuitem" data-venue-index="${index}">
          <span class="venueName">${escapeHtml(v)}</span>
          <span class="venueRecentIcon">最近</span>
        </button>
        <button class="venueDeleteBtn" type="button" data-delete-venue-index="${index}" aria-label="刪除 ${escapeHtml(v)}">×</button>
      </div>
    `).join('');
  }else{
    html+='<div class="venueMenuEmpty">尚無最近使用場地<br><span>開始比賽後會自動加入</span></div>';
  }

  html+='<button class="venueMenuItem venueMenuManual" type="button" data-manual="1"><span class="uiLineIcon uiEditIcon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M4.75 19.25h3.4L18.6 8.8a2.35 2.35 0 0 0 0-3.32l-.08-.08a2.35 2.35 0 0 0-3.32 0L4.75 15.85z"/><path d="m13.85 6.75 3.4 3.4"/><path d="M4.75 19.25 8.3 18.4 5.6 15.7z"/></svg></span><span>手動輸入其他場地</span></button>';
  menu.innerHTML=html;

  menu.querySelectorAll('[data-venue-index]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const index=Number(btn.getAttribute('data-venue-index'));
      const venue=items[index]||'';
      chooseRecentVenue(venue);
    });
  });

  menu.querySelectorAll('[data-delete-venue-index]').forEach(btn=>{
    btn.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();

      const index=Number(btn.getAttribute('data-delete-venue-index'));
      const venue=items[index]||'';
      if(!venue) return;

      deleteRecentVenue(venue);
    });
  });

  menu.querySelector('[data-manual="1"]')?.addEventListener('click',()=>{
    closeVenueMenu();
    const input=byId('venue');
    if(!input) return;
    guidedSetupStep=isPreMatchGuidedSetup()?'venue':guidedSetupStep;
    input.classList.add('guidedInput');
    input.focus();
    try{ input.setSelectionRange(input.value.length,input.value.length); }catch(e){}
  });
}

function positionVenueMenu(){
  const menu=byId('venueMenu');
  const field=document.querySelector('.venueMetaField');
  if(!menu || !field || !menu.classList.contains('open')) return;

  const rect=field.getBoundingClientRect();
  const vv=window.visualViewport;
  const viewportWidth=vv?.width || window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight=vv?.height || window.innerHeight || document.documentElement.clientHeight;
  const offsetLeft=vv?.offsetLeft || 0;
  const offsetTop=vv?.offsetTop || 0;
  const sideGap=10;

  // 桌機可維持 292px；窄手機則不超出 visual viewport。
  const menuWidth=Math.min(292,Math.max(220,viewportWidth-sideGap*2));
  menu.style.width=`${Math.round(menuWidth)}px`;

  let left=rect.right-menuWidth;
  left=Math.max(offsetLeft+sideGap,Math.min(left,offsetLeft+viewportWidth-menuWidth-sideGap));

  const visualTop=offsetTop+sideGap;
  const visualBottom=offsetTop+viewportHeight-sideGap;
  const belowSpace=Math.max(0,visualBottom-(rect.bottom+6));
  const aboveSpace=Math.max(0,(rect.top-6)-visualTop);
  const desiredHeight=Math.min(menu.scrollHeight || 220,360);

  let top;
  let availableHeight;
  if(belowSpace>=Math.min(desiredHeight,180) || belowSpace>=aboveSpace){
    top=rect.bottom+6;
    availableHeight=belowSpace;
  }else{
    availableHeight=aboveSpace;
    top=rect.top-6-Math.min(desiredHeight,availableHeight);
  }

  const maxHeight=Math.max(120,Math.min(360,availableHeight));
  menu.style.maxHeight=`${Math.round(maxHeight)}px`;
  top=Math.max(visualTop,Math.min(top,visualBottom-Math.min(desiredHeight,maxHeight)));

  menu.style.left=`${Math.round(left)}px`;
  menu.style.top=`${Math.round(top)}px`;
}

function ensureVenueMenuPortal(){
  const menu=byId('venueMenu');
  if(!menu) return null;

  // matchCard 使用 isolation / backdrop-filter，子元素即使 position:fixed 仍可能被
  // 卡片 stacking context 壓在後方。直接把選單搬到 body，才能真正位於最上層。
  if(menu.parentElement !== document.body){
    document.body.appendChild(menu);
  }
  menu.classList.add('venueMenuPortal');
  return menu;
}

function openVenueMenu(){
  if(state.started || state.finished) return;
  closeCompetitionStageMenu();
  const btn=byId('venueDropdownBtn');
  if(!btn) return;

  const menu=ensureVenueMenuPortal();
  if(!menu) return;

  renderVenueMenu();
  menu.classList.add('open');
  btn.classList.add('open');
  btn.setAttribute('aria-expanded','true');

  // 先讓瀏覽器完成 display:block / scrollHeight 計算，再定位兩次，
  // 對 iOS Safari visualViewport 與字型排版較穩定。
  requestAnimationFrame(()=>{
    positionVenueMenu();
    requestAnimationFrame(positionVenueMenu);
  });
}

function closeVenueMenu(){
  const menu=byId('venueMenu'), btn=byId('venueDropdownBtn');
  menu?.classList.remove('open');
  if(menu){
    menu.style.left='';
    menu.style.top='';
    menu.style.width='';
    menu.style.maxHeight='';
  }
  btn?.classList.remove('open');
  btn?.setAttribute('aria-expanded','false');
}

function toggleVenueMenu(event){
  event?.preventDefault();
  event?.stopPropagation();
  const menu=byId('venueMenu');
  if(menu?.classList.contains('open')) closeVenueMenu();
  else openVenueMenu();
}

function chooseRecentVenue(value){
  const venue=String(value||'').trim();
  if(!isEligibleVenueValue(venue)) return;

  const input=byId('venue');
  if(input) input.value=venue;
  state.venue=venue;

  // 只套用到本場；不在點選時重新寫入最近清單。
  // 真正的「最近使用」排序會在按下開始比賽時更新。
  saveState();
  closeVenueMenu();

  guidedSetupStep=null;
  input?.classList.remove('guidedInput');
  input?.blur();
  updatePreMetaInputFit(input);
  render();
}

function rememberVenueIfEligible(value){
  const venue=String(value||'').trim();

  // 維持既有「上次有效場地」邏輯；
  // 最近使用清單只在完成輸入 / 開始比賽 / 賽後儲存時加入，避免收進半成品。
  if(isEligibleVenueValue(venue)){
    localStorage.setItem(LAST_VENUE_KEY, venue);
    return true;
  }
  return false;
}

function saveState(){
  const ourTeamValue=byId('ourTeam').value.trim();
  const oppTeamValue=byId('oppTeam').value.trim();
  const venueValue=byId('venue').value.trim();
  const competitionValue=byId('competition').value.trim();
  const competitionStageValue=byId('competitionStage')?.value.trim()||'';
  // 組字中的注音或直接輸入的注音符號不寫入本場資料與 LocalStorage。
  if(!containsBopomofo(ourTeamValue)) state.ourTeam=ourTeamValue;
  if(!containsBopomofo(oppTeamValue)) state.oppTeam=oppTeamValue;
  if(!containsBopomofo(venueValue)) state.venue=venueValue;
  if(!containsBopomofo(competitionValue)) state.competition=competitionValue;
  if(!containsBopomofo(competitionStageValue)) state.competitionStage=competitionStageValue;
  refreshAutoDayMatchNumber();
  state._savedAt=Date.now();
  localStorage.setItem(KEY, JSON.stringify(state));
  updateMatchRegistryFromState();
  if(state.ourTeam && !/[<>\r\n]/.test(state.ourTeam)){
    localStorage.setItem(LAST_OUR_TEAM_KEY, state.ourTeam);
  }

  // v4.04：賽前輸入 / blur / saveState 都不寫入場地歷史。
  // 場地歷史只在第一次按下「開始比賽」時正式更新。
  if(typeof renderPreResetUI==='function') renderPreResetUI();
  updateAllPreMetaFits();
}
function loadState(){
  // 還原失敗交由啟動保護顯示錯誤；不可默默以空白賽前資料開放操作。
  const raw=localStorage.getItem(KEY);
  let hadSavedMatchState=false;
  let savedHadVenueField=false;
  if(raw){
    const saved=JSON.parse(raw);
    if(!saved || typeof saved!=='object' || Array.isArray(saved)){
      throw new Error('Invalid saved match state');
    }
    hadSavedMatchState=true;
    savedHadVenueField=Object.prototype.hasOwnProperty.call(saved,'venue');
    state={...state, ...saved};
  }
  if(!Array.isArray(state.periods)) state.periods=[];
  if(!Number.isInteger(state.currentPeriod) || state.currentPeriod<1) state.currentPeriod=1;
  if(typeof state.awaitingNextPeriod!=='boolean') state.awaitingNextPeriod=false;
  if(typeof state.multiPeriod!=='boolean') state.multiPeriod=false;
  if(typeof state.periodStartOurScore!=='number') state.periodStartOurScore=0;
  if(typeof state.periodStartOppScore!=='number') state.periodStartOppScore=0;
  if(typeof state.extraTime!=='boolean') state.extraTime=false;
  if(state.extraTimeMinutes!=null) state.extraTimeMinutes=Number(state.extraTimeMinutes)||null;
  if(!('nextPeriodType' in state)) state.nextPeriodType=null;
  if(!('penalty' in state)) state.penalty=null;
  if(!('goalkeeperNumber' in state)) state.goalkeeperNumber='';
  if(!Array.isArray(state.rosterNumbers)) state.rosterNumbers=[];
  state.rosterNumbers=[...new Set(state.rosterNumbers.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=99))].sort((a,b)=>a-b);
  if(!('goalkeeperAutoRosterNumber' in state)){
    // v5.159 舊資料相容：若名單只有目前守門員一人，可安全判定此人很可能是
    // 舊版「設定守門員時自動加入名單」所產生，保留來源標記以便之後正確替換。
    const legacyGk=Number(state.goalkeeperNumber);
    state.goalkeeperAutoRosterNumber=(
      Number.isInteger(legacyGk) &&
      state.rosterNumbers.length===1 &&
      state.rosterNumbers[0]===legacyGk
    ) ? String(legacyGk) : '';
  }else{
    const autoGk=Number(state.goalkeeperAutoRosterNumber);
    state.goalkeeperAutoRosterNumber=(
      Number.isInteger(autoGk) && autoGk>=1 && autoGk<=99
    ) ? String(autoGk) : '';
  }
  if(!('jerseyColor' in state)) state.jerseyColor='default';
  state.jerseyColor=normalizeJerseyColor(state.jerseyColor);
  if(!('halftimeStartEpoch' in state)) state.halftimeStartEpoch=null;
  if(!('halftimeEndEpoch' in state)) state.halftimeEndEpoch=null;
  if(!('halftimeDuration' in state)) state.halftimeDuration=0;
  if(!('longDurationAckStartEpoch' in state)) state.longDurationAckStartEpoch=null;
  if(!('regulationPulseAckToken' in state)) state.regulationPulseAckToken='';
  if(!('competition' in state)) state.competition='';
  if(!('competitionStage' in state)) state.competitionStage='';
  if(!('dayMatchNumber' in state)) state.dayMatchNumber=null;
  if(!('dayMatchNumberManual' in state)) state.dayMatchNumberManual=false;
  if(!('dayMatchNumberLocked' in state)) state.dayMatchNumberLocked=!!(state.started||state.finished||state.startEpoch);
  // v5.183 舊資料相容：既有已完成比賽視為已正式確認；未完成比賽維持預留狀態。
  if(!('dayMatchNumberConfirmed' in state)) state.dayMatchNumberConfirmed=!!state.finished;
  if(state.finished) state.dayMatchNumberConfirmed=true;
  if(Array.isArray(state.markers)){
    state.markers.forEach(m=>{
      if(!('assist_number' in m)) m.assist_number='';
      if(m.assist_number!==''){
        const a=Number(m.assist_number);
        m.assist_number=(Number.isInteger(a)&&a>=1&&a<=99)?String(a):'';
      }
    });
    // v4.45：清除舊版本可能產生的重複紅牌，以及紅牌退場後仍被記為助攻的無效資料。
    const cleanedDuplicateRed=sanitizeDuplicateRedCards();
    const cleanedInvalidAssist=sanitizeInvalidAssistsAfterRed();
    if(cleanedDuplicateRed || cleanedInvalidAssist){
      try{ localStorage.setItem(KEY,JSON.stringify(state)); }catch(e){}
    }
  }
  if(state.goalkeeperNumber!==''){
    const gk=Number(state.goalkeeperNumber);
    state.goalkeeperNumber=(Number.isInteger(gk) && gk>=1 && gk<=99) ? String(gk) : '';
    // v5.29：守門員也屬於本場球員；舊版既有資料載入時同步補入名單。
    if(state.goalkeeperNumber && !state.rosterNumbers.includes(gk)){
      state.rosterNumbers=[...state.rosterNumbers,gk].sort((a,b)=>a-b);
    }
  }
  if(state.penalty){
    if(!Array.isArray(state.penalty.our)) state.penalty.our=[];
    if(!Array.isArray(state.penalty.opp)) state.penalty.opp=[];
  }

  // v5.122：新舊比賽與事件時間都統一到整秒。
  // 已完成歷史比賽依整秒邊界重算 duration / finalElapsed；舊 marker 的 seconds / time 也同步整秒化。
  // 這裡直接寫回 match state，但不更新 _savedAt / Registry updatedAt；marker recorded_at 亦完整保留。
  const timingNormalized=normalizeMatchTimingToWholeSeconds();
  if(timingNormalized){
    try{ localStorage.setItem(KEY,JSON.stringify(state)); }catch(e){}
  }

  const rememberedOurTeam=localStorage.getItem(LAST_OUR_TEAM_KEY)||'';
  const rememberedVenue=localStorage.getItem(LAST_VENUE_KEY)||'';

  // 只在「尚未開始的新比賽」帶入常用隊名。
  // 比賽一旦已開始或已結束，就尊重本場保存的名稱；即使本場是空白，也維持「我方」暫代狀態。
  if(!state.started && !state.finished && !state.ourTeam){
    if(rememberedOurTeam) state.ourTeam=rememberedOurTeam;
    else state.ourTeam='忠義國小';
  }

  // v5.125：場地空白必須視為「本場明確狀態」，不可在重新整理後用上一場場地回填。
  // 根因：舊邏輯只判斷 !state.venue，因此本場已保存 venue:'' 時，reload 後仍會套用
  // football_marker_last_venue，造成「賽前/比賽中沒填場地，重新整理後卻跑出舊場地」。
  // 新規則：
  // 1) 已有本場儲存資料且含 venue 欄位 → 完全尊重本場值（包含空字串）。
  // 2) 舊版資料根本沒有 venue 欄位、且尚未開始 → 才允許用 last venue 做相容性預填。
  // 3) 已開始/已結束的比賽永遠不補入上一場場地。
  const canUseRememberedVenue =
    !state.started && !state.finished &&
    (!hadSavedMatchState || !savedHadVenueField);
  if(canUseRememberedVenue && !state.venue && rememberedVenue){
    state.venue=rememberedVenue;
  }
  ensureDayMatchNumber({persist:true});
  byId('ourTeam').value=state.ourTeam||'';
  byId('oppTeam').value=state.oppTeam||'';
  byId('venue').value=state.venue||'';
  byId('competition').value=state.competition||'';
  if(byId('competitionStage')) byId('competitionStage').value=state.competitionStage||'';
  syncRegulationInputsFromState();
  buildNumberGrid();
  render();
}

function elapsed(){
  if(state.started && !state.finished && state.startEpoch){
    return Math.max(0,(nowWholeMs()-state.startEpoch)/1000);
  }
  return Math.max(0,Math.floor(Number(state.finalElapsed)||0));
}
function fmtMMSS(sec){
  sec=Math.max(0, Math.floor(Number(sec)||0));
  const m=Math.floor(sec/60), s=sec%60;
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}

// v5.92：主畫面長時間計時使用 H:MM:SS，避免分鐘數無限增長成 1148:15。
function fmtMatchClock(sec){
  sec=Math.max(0,Math.floor(Number(sec)||0));
  if(sec<3600) return fmtMMSS(sec);
  const h=Math.floor(sec/3600);
  const m=Math.floor((sec%3600)/60);
  const s=sec%60;
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function updateLongClockLayout(sec){
  const stage=byId('broadcastStage');
  const timer=byId('timer');
  if(!stage || !timer) return;

  const whole=Math.max(0,Math.floor(Number(sec)||0));
  const longClock=whole>=3600;
  const veryLongClock=whole>=360000; // 100 小時以上

  stage.classList.toggle('longClock',longClock);
  stage.classList.toggle('veryLongClock',veryLongClock);
  timer.classList.toggle('longClock',longClock);
  timer.classList.toggle('veryLongClock',veryLongClock);
}
function fmtClock(epoch){
  if(!epoch) return '--:--:--';
  const d=new Date(epoch);
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');
}
function fmtDateTime(epoch){
  if(!epoch) return '--';
  const d=new Date(epoch);
  return d.getFullYear()+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0')+' '+fmtClock(epoch);
}
function fmtDateOnly(epoch){
  if(!epoch) return '----/--/--';
  const d=new Date(epoch);
  return d.getFullYear()+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0');
}
function matchDateLabel(startEpoch=matchStartEpoch(),endEpoch=matchEndEpoch()){
  const start=startEpoch || Date.now();
  return isCrossDay(start,endEpoch) ? `${fmtDateOnly(start)} → ${fmtDateOnly(endEpoch)}` : fmtDateOnly(start);
}
function isSameCalendarDay(aEpoch,bEpoch){
  if(!aEpoch || !bEpoch) return true;
  const a=new Date(aEpoch), b=new Date(bEpoch);
  return a.getFullYear()===b.getFullYear() &&
    a.getMonth()===b.getMonth() &&
    a.getDate()===b.getDate();
}
function fmtTimelineTime(epoch,baseEpoch){
  if(!epoch) return '--';
  if(!baseEpoch || isSameCalendarDay(epoch,baseEpoch)) return fmtClock(epoch);
  return fmtMonthDayClock(epoch);
}
function fmtMonthDayClock(epoch){
  if(!epoch) return '--';
  const d=new Date(epoch);
  return String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0')+' '+fmtClock(epoch);
}
function isCrossDay(startEpoch,endEpoch){
  if(!startEpoch || !endEpoch) return false;
  const a=new Date(startEpoch), b=new Date(endEpoch);
  return a.getFullYear()!==b.getFullYear() || a.getMonth()!==b.getMonth() || a.getDate()!==b.getDate();
}
function fmtReportBoundary(epoch,startEpoch,endEpoch){
  if(!epoch) return '--:--:--';
  return isCrossDay(startEpoch,endEpoch) ? fmtMonthDayClock(epoch) : fmtClock(epoch);
}
function fmtDurationReadable(sec){
  sec=Math.max(0,Math.floor(Number(sec)||0));
  if(sec<3600) return fmtMMSS(sec);
  const h=Math.floor(sec/3600);
  const m=Math.floor((sec%3600)/60);
  const s=sec%60;
  return `${h}小時 ${m}分 ${s}秒`;
}
function durationReportHTML(sec){
  return escapeHtml(fmtDurationReadable(sec));
}
function emoji(ev){
  return {GOAL:'⚽', SAVE:'🧤', SHOT:'🥅', DEFENSE:'🛡️', YELLOW_CARD:'🟨', RED_CARD:'🟥'}[ev] || '•';
}
function eventLabel(ev){
  return {GOAL:'進球', SAVE:'撲救', SHOT:'射門', DEFENSE:'防守', YELLOW_CARD:'黃牌', RED_CARD:'紅牌'}[ev] || ev;
}
function teamDisplay(code){
  if(code==='OUR') return state.ourTeam || '我方';
  if(code==='OPP') return state.oppTeam || '對手';
  return '';
}
function oppositeTeamCode(code){
  return code==='OUR' ? 'OPP' : code==='OPP' ? 'OUR' : '';
}
function markerPlayerTeamCode(marker){
  if(marker?.event==='GOAL' && marker?.own_goal){
    return marker.own_goal_team || oppositeTeamCode(marker.team);
  }
  return marker?.team || '';
}
function markerPlayerTeamDisplay(marker){
  return teamDisplay(markerPlayerTeamCode(marker)) || '未指定';
}
function markerEventLabel(marker){
  if(marker?.event==='GOAL' && marker?.own_goal) return '烏龍球';
  if(marker?.second_yellow) return '紅牌（兩黃）';
  return eventLabel(marker?.event);
}
function redCardedPlayerNumbers(team, beforeIndex=null){
  const set=new Set();
  (state.markers||[]).forEach((m,i)=>{
    if(beforeIndex!==null && i>=beforeIndex) return;
    if(m?.event!=='RED_CARD' || m?.team!==team || !m?.player_number) return;
    const n=Number(m.player_number);
    if(Number.isInteger(n) && n>=1 && n<=99) set.add(String(n));
  });
  return set;
}
function isRedCardedPlayer(team, number, beforeIndex=null){
  const raw=String(number||'').trim();
  if(!raw) return false;
  return redCardedPlayerNumbers(team,beforeIndex).has(raw);
}
function yellowCardCountForPlayer(team, number, beforeIndex=null){
  const raw=String(number||'').trim();
  if(!raw) return 0;
  let count=0;
  (state.markers||[]).forEach((m,i)=>{
    if(beforeIndex!==null && i>=beforeIndex) return;
    if(m?.event!=='YELLOW_CARD' || m?.team!==team || !m?.player_number) return;
    if(String(m.player_number)===raw) count+=1;
  });
  return count;
}
function isSecondYellowCard(team, number, beforeIndex=null){
  const raw=String(number||'').trim();
  if(!raw) return false;
  return yellowCardCountForPlayer(team,raw,beforeIndex)>=1;
}
function canPlayerParticipateAfterRed(team, number, event, beforeIndex=null){
  if(!number) return true;
  if(!isRedCardedPlayer(team,number,beforeIndex)) return true;
  alert(`#${number} 已領紅牌退場，後續不能再記錄任何球員事件（包含黃牌、紅牌、進球、射門、撲救與防守）。`);
  return false;
}
function hasOtherRedCardForPlayer(team, number, excludeIndex=null){
  const raw=String(number||'').trim();
  if(!raw) return false;
  return (state.markers||[]).some((m,i)=>{
    if(excludeIndex!==null && i===excludeIndex) return false;
    return m?.event==='RED_CARD' && m?.team===team && String(m?.player_number||'')===raw;
  });
}
function sanitizeDuplicateRedCards(){
  if(!Array.isArray(state.markers) || !state.markers.length) return false;
  const seen=new Set();
  let changed=false;
  const cleaned=[];
  state.markers.forEach(m=>{
    if(m?.event==='RED_CARD' && m?.team && m?.player_number){
      const key=`${m.team}:${String(m.player_number)}`;
      if(seen.has(key)){
        changed=true;
        return;
      }
      seen.add(key);
    }
    cleaned.push(m);
  });
  if(changed) state.markers=cleaned;
  return changed;
}
function sanitizeInvalidAssistsAfterRed(){
  if(!Array.isArray(state.markers) || !state.markers.length) return false;
  const sentOff={OUR:new Set(),OPP:new Set()};
  let changed=false;
  state.markers.forEach(m=>{
    const team=m?.team;
    if(m?.event==='GOAL' && team && m?.assist_number){
      const assist=String(m.assist_number);
      if(sentOff[team]?.has(assist)){
        m.assist_number='';
        changed=true;
      }
    }
    if(m?.event==='RED_CARD' && team && m?.player_number){
      sentOff[team]?.add(String(m.player_number));
    }
  });
  return changed;
}
function periodLabel(n){
  if(!state.multiPeriod) return '全場';
  return Number(n)===1 ? '上半場' : Number(n)===2 ? '下半場' : Number(n)===3 ? '延長賽' : `第${n}段`;
}
function totalMatchElapsed(){
  if(state.finished) return Number(state.finalElapsed)||0;
  const completed=(state.periods||[]).reduce((sum,p)=>sum+(Number(p.duration)||0),0);
  return completed + ((state.started && state.startEpoch) ? elapsed() : 0);
}
function halftimeElapsed(){
  if(!state.halftimeStartEpoch) return Number(state.halftimeDuration)||0;
  const end=state.halftimeEndEpoch || nowWholeMs();
  return Math.max(0,(end-state.halftimeStartEpoch)/1000);
}

function renderHalftimeTimeDetail(){
  const block=byId('halftimeDetailBlock');
  if(!block) return;

  const hasHalftime=Boolean(state.halftimeStartEpoch);
  block.hidden=!hasHalftime;
  if(!hasHalftime) return;

  const baseEpoch=matchStartEpoch();
  const start=byId('halftimeStartText');
  const end=byId('halftimeEndText');
  const duration=byId('halftimeDurationTitle');

  if(start) start.textContent=fmtTimelineTime(state.halftimeStartEpoch,baseEpoch);
  if(end) end.textContent=state.halftimeEndEpoch ? fmtTimelineTime(state.halftimeEndEpoch,baseEpoch) : '--';
  if(duration) duration.textContent=`（${fmtMMSS(halftimeElapsed())}）`;
}

function periodRecord(number){
  return (state.periods||[]).find(p=>Number(p.number)===Number(number)) || null;
}
function currentPeriodStartEpoch(number){
  if(Number(state.currentPeriod)===Number(number) && state.started && state.startEpoch){
    return state.startEpoch;
  }
  return null;
}
function phaseElapsedSeconds(record,startEpoch,endEpoch){
  if(record && Number.isFinite(Number(record.duration)) && Number(record.duration)>=0 && record.endEpoch){
    return Math.max(0,Math.floor(Number(record.duration)||0));
  }
  if(!startEpoch) return 0;
  const end=endEpoch || nowWholeMs();
  return Math.max(0,Math.floor((end-startEpoch)/1000));
}

function renderPeriodPhaseTimeDetail(){
  const baseEpoch=matchStartEpoch();
  const p1=periodRecord(1);
  const p2=periodRecord(2);
  const p3=periodRecord(3);

  const firstBlock=byId('firstHalfDetailBlock');
  const firstStart=byId('firstHalfStartText');
  const firstEnd=byId('firstHalfEndText');
  const firstDuration=byId('firstHalfDurationText');
  const showFirst=Boolean(state.finished && state.multiPeriod && (p1?.startEpoch || baseEpoch));
  if(firstBlock) firstBlock.hidden=!showFirst;
  if(showFirst){
    const startEpoch=p1?.startEpoch || baseEpoch;
    if(firstStart) firstStart.textContent=fmtTimelineTime(startEpoch,baseEpoch);
    if(firstEnd) firstEnd.textContent=p1?.endEpoch ? fmtTimelineTime(p1.endEpoch,baseEpoch) : '--';
    if(firstDuration) firstDuration.textContent=`（${fmtMMSS(phaseElapsedSeconds(p1,startEpoch,p1?.endEpoch || null))}）`;
  }

  const secondStartEpoch=p2?.startEpoch || currentPeriodStartEpoch(2);
  const secondEndEpoch=p2?.endEpoch || null;
  const secondBlock=byId('secondHalfDetailBlock');
  if(secondBlock) secondBlock.hidden=!secondStartEpoch;
  if(secondStartEpoch){
    byId('secondHalfStartText').textContent=fmtTimelineTime(secondStartEpoch,baseEpoch);
    byId('secondHalfEndText').textContent=secondEndEpoch ? fmtTimelineTime(secondEndEpoch,baseEpoch) : '--';
    const duration=byId('secondHalfDurationText');
    if(duration) duration.textContent=`（${fmtMMSS(phaseElapsedSeconds(p2,secondStartEpoch,secondEndEpoch))}）`;
  }

  const extraStartEpoch=p3?.startEpoch || currentPeriodStartEpoch(3);
  const extraEndEpoch=p3?.endEpoch || null;
  const extraBlock=byId('extraTimeDetailBlock');
  if(extraBlock) extraBlock.hidden=!extraStartEpoch;
  if(extraStartEpoch){
    byId('extraTimeStartText').textContent=fmtTimelineTime(extraStartEpoch,baseEpoch);
    byId('extraTimeEndText').textContent=extraEndEpoch ? fmtTimelineTime(extraEndEpoch,baseEpoch) : '--';
    const duration=byId('extraTimeDurationText');
    if(duration) duration.textContent=`（${fmtMMSS(phaseElapsedSeconds(p3,extraStartEpoch,extraEndEpoch))}）`;
  }
}

function halftimeSummaryLine(){
  if(!state.halftimeStartEpoch) return '';
  const start=fmtClock(state.halftimeStartEpoch);
  const end=state.halftimeEndEpoch ? fmtClock(state.halftimeEndEpoch) : '--:--:--';
  return `${start} → ${end}｜休息 ${fmtMMSS(halftimeElapsed())}`;
}
function matchStartEpoch(){
  if(state.periods?.length) return state.periods[0].startEpoch || state.startEpoch;
  return state.startEpoch;
}
function matchEndEpoch(){
  if(state.finished && state.periods?.length) return state.periods[state.periods.length-1].endEpoch || state.endEpoch;
  return state.endEpoch;
}
function completedPeriodSummaryHTML(){
  if(!state.multiPeriod || !state.periods?.length) return '';
  const rows=[];
  state.periods.forEach(p=>{
    const our=Math.max(0,(p.endOurScore??0)-(p.startOurScore??0));
    const opp=Math.max(0,(p.endOppScore??0)-(p.startOppScore??0));
    rows.push(`<div class="periodSummaryRow"><div class="pname">${escapeHtml(p.label||periodLabel(p.number))}</div><div class="ptime">${fmtMMSS(p.duration||0)}</div><div class="pscore">${our}:${opp}</div></div>`);
  });
  return rows.join('');
}

function scorerStats(){
  const counts=new Map();
  state.markers.filter(m=>m.event==='GOAL' && !m.own_goal && m.player_number).forEach(m=>{
    const team=m.team==='OUR'?'我方':m.team==='OPP'?'對手':'未指定';
    const key=`${team}#${m.player_number}`;
    counts.set(key,(counts.get(key)||0)+1);
  });
  return [...counts.entries()]
    .map(([name,goals])=>({name,goals}))
    .sort((a,b)=>b.goals-a.goals || a.name.localeCompare(b.name,'zh-Hant'));
}
function scorerMVPInfo(){
  // v5.177：賽後進球焦點依比賽結果切換語意。
  // 勝場＝單場 MVP；平手／敗場＝我方最多進球。
  // 兩種情況都只統計「我方、非烏龍、具有可辨識背號」的正式進球。
  if(!state.finished) return null;

  const counts=new Map();
  state.markers
    .filter(m=>m.event==='GOAL' && m.team==='OUR' && !m.own_goal && m.player_number)
    .forEach(m=>{
      const name=`我方#${m.player_number}`;
      counts.set(name,(counts.get(name)||0)+1);
    });

  const stats=[...counts.entries()]
    .map(([name,goals])=>({name,goals}))
    .sort((a,b)=>b.goals-a.goals || a.name.localeCompare(b.name,'zh-Hant'));
  if(!stats.length) return null;

  let result='DRAW';
  if(state.penalty?.completed){
    const ourPk=penaltyGoals('our'), oppPk=penaltyGoals('opp');
    if(ourPk>oppPk) result='WIN';
    else if(oppPk>ourPk) result='LOSS';
  }else{
    const our=Number(state.ourScore||0), opp=Number(state.oppScore||0);
    if(our>opp) result='WIN';
    else if(opp>our) result='LOSS';
  }

  const topGoals=stats[0].goals || 0;
  const winners=stats.filter(s=>s.goals===topGoals);
  const isTie=winners.length>1;
  const kind=result==='WIN'?'mvp':'topScorer';
  const label=kind==='mvp'?'單場MVP':'我方最多進球';
  return {
    topGoals,
    winners,
    isTie,
    result,
    kind,
    title:`⚽ ${label}｜${isTie?`並列 ${topGoals} 球`:`${topGoals} 球`}`
  };
}
function scorerMVPHTML(){
  const info=scorerMVPInfo();
  if(!info) return '';
  return `<div class="reportMVPHead">${escapeHtml(info.title)}</div><div class="reportMVPNames">${info.winners.map(s=>`<span class="reportMVPName">${escapeHtml(s.name)}</span>`).join('')}</div>`;
}
function scorerStatsHTML(){
  const stats=scorerStats();
  if(!stats.length) return '<div class="reportEmpty">尚無可統計的球員背號進球資料</div>';
  return stats.map(s=>`<div class="scorerRow"><div class="scorerName"><span class="scorerPlayerName">${escapeHtml(s.name)}</span><span class="scorerBalls">${'⚽'.repeat(s.goals)}</span></div></div>`).join('');
}

function tick(){
  const isHalftime=state.awaitingNextPeriod && state.nextPeriodType==='SECOND_HALF';
  const timerSec=isHalftime ? halftimeElapsed() : (state.awaitingNextPeriod ? 0 : elapsed());

  // v5.92：主計時與超時提示仍共用同一幀 timerSec；
  // 超過 1 小時後自動切成 H:MM:SS 並啟用長時間版面。
  byId('timer').textContent=fmtMatchClock(timerSec);
  updateLongClockLayout(timerSec);
  renderRegulationTimeAlert(timerSec);
  renderLongDurationInline(timerSec);

  const halfDuration=byId('halftimeDurationTitle');
  if(halfDuration && state.halftimeStartEpoch && !state.halftimeEndEpoch){
    halfDuration.textContent=`（${fmtMMSS(halftimeElapsed())}）`;
  }

  // v5.127：進行中的下半場 / 延長賽，標題旁的階段合計時間同步更新。
  if(state.started && !state.finished){
    if(Number(state.currentPeriod)===2){
      const el=byId('secondHalfDurationText');
      if(el) el.textContent=`（${fmtMMSS(elapsed())}）`;
    }else if(Number(state.currentPeriod)===3){
      const el=byId('extraTimeDurationText');
      if(el) el.textContent=`（${fmtMMSS(elapsed())}）`;
    }
  }

  requestAnimationFrame(tick);
}

function toggleTimeBox(){
  timeExpanded=!timeExpanded;
  if(!timeExpanded) regulationEditorExpanded=false;
  renderTimeBox();
}
function toggleRegulationEditor(){
  if(!matchStartEpoch()) return;
  regulationEditorExpanded=!regulationEditorExpanded;
  renderTimeBox();
}
function regulationCompactText(){
  if(!state.regulationMinutes) return '未設定';
  if(state.multiPeriod){
    const extra=state.extraTime && state.extraTimeMinutes ? `＋延長 ${state.extraTimeMinutes} 分` : '';
    return `每半場 ${state.regulationMinutes} 分${extra}`;
  }
  return `${state.regulationMinutes} 分鐘`;
}
function syncRegulationPlacement(){
  const regBox=byId('regBox');
  const preHost=byId('preRegulationHost');
  const timeHost=byId('timeRegulationHost');
  const preSection=byId('preRegulationSection');
  const regTitle=byId('regTitle');
  const timeLine=byId('timeStatusLine');
  const timeBadge=byId('timeRegulationBadge');
  const timeDivider=byId('timeStatusDivider');
  const timeState=byId('timeRegulationState');
  const clearBtn=byId('regClearBtn');

  const hasBegun=Boolean(matchStartEpoch());
  const target=hasBegun ? timeHost : preHost;

  if(regBox && target && regBox.parentElement!==target){
    target.appendChild(regBox);
  }

  if(preSection) preSection.hidden=hasBegun;

  if(regTitle){
    regTitle.textContent=hasBegun
      ? '比賽時間（可賽後補填）'
      : '比賽時間';
  }

  if(clearBtn){
    // v5.14：賽前不顯示獨立「清除」或「套用」。
    // 選擇「未設定」立即清除；選擇固定分鐘立即生效。
    clearBtn.hidden=!hasBegun || !state.regulationMinutes;
  }

  if(timeLine && timeBadge){
    if(hasBegun && state.regulationMinutes){
      timeLine.hidden=false;
      timeBadge.textContent=`規定 ${regulationCompactText()}`;
      if(timeDivider) timeDivider.hidden=true;
      if(timeState){
        timeState.hidden=true;
        timeState.textContent='';
        timeState.className='timeRegulationState';
      }
    }else{
      timeLine.hidden=true;
      timeBadge.textContent='';
      if(timeDivider) timeDivider.hidden=true;
      if(timeState){
        timeState.hidden=true;
        timeState.textContent='';
        timeState.className='timeRegulationState';
      }
    }
  }
}

function renderRegulationTimeBox(){
  const hasBegun=Boolean(matchStartEpoch());
  syncRegulationPlacement();
  const compact=byId('regCompact');
  const editor=byId('regEditor');
  const regBox=byId('regBox');
  const editBtn=byId('regCompactEdit');
  const value=byId('regCompactValue');

  if(value) value.textContent=regulationCompactText();

  if(!hasBegun){
    if(compact) compact.hidden=true;
    if(editor) editor.hidden=false;
    if(regBox) regBox.classList.remove('compactMode','editingMode');
    return;
  }

  if(compact) compact.hidden=false;
  if(editor) editor.hidden=!regulationEditorExpanded;
  if(editBtn) editBtn.textContent=regulationEditorExpanded?'收合':'編輯';
  if(regBox){
    regBox.classList.toggle('compactMode',!regulationEditorExpanded);
    regBox.classList.toggle('editingMode',regulationEditorExpanded);
  }
}
function renderTimeBox(){
  const box=byId('timeSummary');
  const matchStart=matchStartEpoch();
  const hasBegun=Boolean(matchStart);

  // v5.08：賽前沒有任何「紀錄」可看，因此完全不顯示時間紀錄。
  // 賽前只顯示獨立的「比賽時間（選填）」設定。
  if(box) box.hidden=!hasBegun;

  syncRegulationPlacement();

  box.classList.toggle('open', timeExpanded);
  byId('timeToggle').textContent=timeExpanded?'收合':'展開';

  // 整場邊界必須取自 periods 的第一段 / 最後一段，而不是目前段落 startEpoch。
  const matchEnd=matchEndEpoch();

  byId('compactStart').textContent=fmtClock(matchStart);
  byId('compactEnd').textContent=fmtClock(matchEnd);

  // 日期只顯示一次；同一天的各列只顯示 HH:MM:SS。
  const dateBox=byId('timeRecordDate');
  const dateValue=byId('timeRecordDateValue');
  if(dateBox) dateBox.hidden=!matchStart;
  if(dateValue && matchStart) dateValue.textContent=fmtDateOnly(matchStart);

  const p1=periodRecord(1);
  const hasMultiTimeline=Boolean(
    state.multiPeriod ||
    state.halftimeStartEpoch ||
    p1?.label==='上半場'
  );

  let detailStartEpoch=matchStart;
  let detailEndEpoch=matchEnd;
  let detailStartLabel='比賽開始';
  let detailEndLabel='比賽結束';

  // 中場、下半場與延長賽進行中時，頂端兩列代表第一階段，
  // 全場結束後則回到整場「比賽開始 / 比賽結束」。
  if(!state.finished && hasMultiTimeline){
    detailStartLabel='上半場開始';
    detailEndLabel='上半場結束';
    detailStartEpoch=p1?.startEpoch || matchStart;
    detailEndEpoch=p1?.endEpoch || null;
  }

  byId('fullStartLabel').textContent='開始';
  byId('fullEndLabel').textContent='結束';
  byId('fullStart').textContent=fmtTimelineTime(detailStartEpoch,matchStart);
  byId('fullEnd').textContent=fmtTimelineTime(detailEndEpoch,matchStart);

  // 收合狀態保留「時間紀錄＋展開」，主畫面不被大量時間資料佔據。
  box.classList.add('compactBoundaryHidden');

  renderHalftimeTimeDetail();
  renderPeriodPhaseTimeDetail();

  // 全場才顯示真正的比賽有效時間（不含中場休息）。
  const actualBox=byId('fullTimeActualBox');
  const actualValue=byId('fullTimeActualValue');
  if(actualBox) actualBox.hidden=!state.finished;
  if(actualValue) actualValue.textContent=state.finished ? fmtMMSS(state.finalElapsed) : '00:00';

  renderDiff(byId('diffText'));
  renderLongDurationInline();
  renderRegulationTimeBox();
}
function regulationPeriodCount(){
  // regulationMinutes 代表正規比賽每一段 / 每半場的規定分鐘數。
  return state.multiPeriod ? 2 : 1;
}
function regulationTotalMinutes(){
  if(!state.regulationMinutes) return state.extraTimeMinutes ? Number(state.extraTimeMinutes) : 0;
  const normal=Number(state.regulationMinutes) * regulationPeriodCount();
  return normal + (state.extraTime ? (Number(state.extraTimeMinutes)||0) : 0);
}
function regulationTargetSeconds(){
  return regulationTotalMinutes() * 60;
}
function regulationDisplayText(){
  if(!state.regulationMinutes) return '';
  if(state.multiPeriod){
    const normal=Number(state.regulationMinutes)*2;
    if(state.extraTime && state.extraTimeMinutes) return `每半場 ${state.regulationMinutes} 分鐘（正規 ${normal}＋延長 ${state.extraTimeMinutes}＝${regulationTotalMinutes()} 分鐘）`;
    return `每半場 ${state.regulationMinutes} 分鐘（全場 ${normal} 分鐘）`;
  }
  return `${state.regulationMinutes} 分鐘`;
}

function renderDiff(el){
  el.className='diff';
  if(!state.regulationMinutes){
    el.textContent='未設定比賽時間';
    return;
  }
  const target=regulationTargetSeconds();
  const actual=state.finished ? state.finalElapsed : totalMatchElapsed();
  const diff=Math.round(actual-target);
  if(!state.finished){
    el.textContent=`規定 ${regulationDisplayText()}｜比賽結束後顯示差異`;
  }else if(diff<0){
    el.textContent=`⚠ 提前 ${fmtMMSS(Math.abs(diff))}`;
    el.classList.add('early');
  }else if(diff>0){
    el.textContent=`超過 ${fmtMMSS(diff)}`;
    el.classList.add('over');
  }else{
    el.textContent='時間一致';
  }
}

function toggleRegCustomInput(){
  const preset=byId('regPreset');
  const customCard=byId('regCustomCard');
  const customInput=byId('regCustomMinutes');
  const isCustom=preset && preset.value==='custom';
  if(customCard) customCard.classList.toggle('open', !!isCustom);
  if(customInput && !isCustom) customInput.value='';
}

/*
  v5.14：
  賽前不再需要「選擇 → 套用」兩步驟。
  15 / 20 / 25 / 45 / 未設定都在選取後立即生效。
  比賽已開始後則仍維持原本編輯器的「套用 / 清除」確認流程，
  避免進行中誤改時間。
*/
function handleRegulationPresetChange(){
  toggleRegCustomInput();

  const preset=byId('regPreset');
  if(!preset) return;

  // 開賽後維持手動套用流程。
  if(matchStartEpoch()) return;

  const value=preset.value;

  if(value==='custom'){
    const customInput=byId('regCustomMinutes');
    if(customInput){
      setTimeout(()=>{ try{ customInput.focus(); }catch(e){} },30);
    }
    return;
  }

  if(value==='none'){
    if(state.regulationMinutes!==null){
      state.regulationMinutes=null;
      saveState();
      render();
    }
    return;
  }

  const n=Number(value);
  if(Number.isInteger(n) && n>=1 && n<=45){
    state.regulationMinutes=n;
    saveState();
    render();
  }
}

function handleRegulationCustomChange(){
  // 開賽後仍由既有「套用」按鈕確認。
  if(matchStartEpoch()) return;

  const preset=byId('regPreset');
  if(!preset || preset.value!=='custom') return;

  const input=byId('regCustomMinutes');
  if(!input) return;

  const raw=String(input.value||'').trim();
  if(!raw) return;

  const n=Number(raw);
  if(!Number.isInteger(n) || n<1 || n>45){
    alert('自訂比賽時間請輸入 1–45 分鐘整數');
    try{ input.focus(); input.select(); }catch(e){}
    return;
  }

  state.regulationMinutes=n;
  saveState();
  render();
}

function syncRegulationInputsFromState(){
  const preset=byId('regPreset');
  const customInput=byId('regCustomMinutes');
  if(!preset || !customInput) return;
  const value=Number(state.regulationMinutes);
  if(!state.regulationMinutes){
    preset.value='none';
    customInput.value='';
  }else if([15,20,25,45].includes(value)){
    preset.value=String(value);
    customInput.value='';
  }else{
    preset.value='custom';
    customInput.value=String(value);
  }
  toggleRegCustomInput();
}

function getRegulationMinutesInput(){
  const preset=byId('regPreset')?.value || 'none';
  if(preset==='none') return 0;
  if(preset==='custom'){
    return validateIntegerField('regCustomMinutes','自訂比賽時間',1,45,true);
  }
  const value=Number(preset);
  if(!Number.isInteger(value) || value<1 || value>45){
    alert('請選擇有效的比賽時間');
    return undefined;
  }
  return value;
}

function normalizeRosterPool(raw){
  if(!Array.isArray(raw)) return [];
  return [...new Set(raw.map(Number).filter(n=>Number.isInteger(n) && n>=1 && n<=99))].sort((a,b)=>a-b);
}

/* =========================================================
   v5.161：快捷背號改為「最近 5 場活躍背號」
   - 原始 18 個只在完全沒有近期比賽紀錄時顯示。
   - 每場真正結束後，才把該場最終球員名單記入近期歷史。
   - 快捷區只根據最近 5 場，不再永久累加。
   - 若 5 場內出現太多不同背號，依出場頻率、近期程度、守門員權重挑選最多 24 個。
   - 最終顯示仍按背號排序，保持掃讀穩定。
   ========================================================= */
function normalizeRecentRosterHistory(raw){
  if(!Array.isArray(raw)) return [];
  const seen=new Set();
  const normalized=[];
  raw.forEach((item,index)=>{
    if(!item || typeof item!=='object') return;
    const roster=normalizeRosterPool(item.roster);
    const gkNum=Number(item.goalkeeper);
    const goalkeeper=(Number.isInteger(gkNum)&&gkNum>=1&&gkNum<=99) ? gkNum : null;
    if(!roster.length && !goalkeeper) return;
    if(goalkeeper && !roster.includes(goalkeeper)) roster.push(goalkeeper);
    roster.sort((a,b)=>a-b);
    const matchId=String(item.matchId||`legacy-${index}`);
    if(seen.has(matchId)) return;
    seen.add(matchId);
    normalized.push({
      matchId,
      roster,
      goalkeeper,
      updatedAt:Number(item.updatedAt)||0
    });
  });
  return normalized
    .sort((a,b)=>(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0))
    .slice(0,RECENT_ROSTER_MATCH_LIMIT);
}

function writeRecentRosterHistory(list){
  const normalized=normalizeRecentRosterHistory(list);
  try{
    localStorage.setItem(RECENT_ROSTER_HISTORY_INIT_KEY,'1');
    if(normalized.length) localStorage.setItem(RECENT_ROSTER_HISTORY_KEY,JSON.stringify(normalized));
    else localStorage.removeItem(RECENT_ROSTER_HISTORY_KEY);
  }catch(e){}
  return normalized;
}

function migrateRecentRosterHistoryIfNeeded(){
  let initialized=false;
  try{ initialized=localStorage.getItem(RECENT_ROSTER_HISTORY_INIT_KEY)==='1'; }catch(e){}
  if(initialized) return;

  let seed=[];
  try{
    const previous=normalizeRosterPool(JSON.parse(localStorage.getItem(LAST_ROSTER_KEY)||'[]'));
    if(previous.length){
      seed=[{matchId:'legacy-last-roster',roster:previous,goalkeeper:null,updatedAt:Date.now()}];
    }else{
      // v5.160 升級相容：沒有上一場名單時，才以舊「球隊常用池」當一次性起始資料。
      const legacyPool=normalizeRosterPool(JSON.parse(localStorage.getItem(LEARNED_ROSTER_POOL_KEY)||'[]'));
      if(legacyPool.length){
        seed=[{matchId:'legacy-learned-pool',roster:legacyPool,goalkeeper:null,updatedAt:Date.now()}];
      }
    }
  }catch(e){}
  writeRecentRosterHistory(seed);
}

function getRecentRosterHistory(){
  migrateRecentRosterHistoryIfNeeded();
  try{
    return normalizeRecentRosterHistory(JSON.parse(localStorage.getItem(RECENT_ROSTER_HISTORY_KEY)||'[]'));
  }catch(e){
    return [];
  }
}

function recordRecentRosterForMatch({matchId=MATCH_ID,roster=currentRosterNumbers(),goalkeeper=state.goalkeeperNumber,updatedAt=Date.now()}={}){
  const normalizedRoster=normalizeRosterPool(roster);
  const gk=Number(goalkeeper);
  const validGk=(Number.isInteger(gk)&&gk>=1&&gk<=99) ? gk : null;
  if(validGk && !normalizedRoster.includes(validGk)) normalizedRoster.push(validGk);
  normalizedRoster.sort((a,b)=>a-b);
  if(!normalizedRoster.length) return false;

  const id=String(matchId||`match-${Number(updatedAt)||Date.now()}`);
  const history=getRecentRosterHistory().filter(item=>item.matchId!==id);
  history.unshift({
    matchId:id,
    roster:normalizedRoster,
    goalkeeper:validGk,
    updatedAt:Number(updatedAt)||Date.now()
  });
  writeRecentRosterHistory(history);
  return true;
}

function recentActiveRosterNumbers(){
  const history=getRecentRosterHistory();
  if(!history.length) return [];

  const stats=new Map();
  history.forEach((entry,index)=>{
    const recencyWeight=Math.max(1,RECENT_ROSTER_MATCH_LIMIT-index);
    entry.roster.forEach(n=>{
      const item=stats.get(n)||{number:n,appearances:0,recentScore:0,keeperCount:0};
      item.appearances+=1;
      item.recentScore+=recencyWeight;
      stats.set(n,item);
    });
    if(entry.goalkeeper){
      const item=stats.get(entry.goalkeeper)||{number:entry.goalkeeper,appearances:0,recentScore:0,keeperCount:0};
      item.keeperCount+=1;
      stats.set(entry.goalkeeper,item);
    }
  });

  const ranked=[...stats.values()].sort((a,b)=>
    (b.appearances-a.appearances) ||
    (b.keeperCount-a.keeperCount) ||
    (b.recentScore-a.recentScore) ||
    (a.number-b.number)
  );
  return ranked.slice(0,RECENT_ROSTER_NUMBER_LIMIT).map(x=>x.number).sort((a,b)=>a-b);
}

function hasLearnedRosterPool(){
  return getRecentRosterHistory().length>0;
}

// 舊函式名稱保留給既有流程；v5.161 起回傳「近期活躍背號」。
function getLearnedRosterPool(){
  return recentActiveRosterNumbers();
}
function getLearnedNumbers(){
  return recentActiveRosterNumbers();
}

// v5.161 不再因單一事件／臨時輸入就永久學習背號。
// 真正的學習只在該場比賽完成時，以「最終本場名單」寫入最近 5 場歷史。
function rememberPlayerNumber(number){
  const n=Number(number);
  return Number.isInteger(n) && n>=1 && n<=99;
}

function allCommonNumbers(){
  const recent=recentActiveRosterNumbers();
  return recent.length ? recent : [...COMMON_NUMBERS];
}

// 保留舊呼叫介面，但不再於名單視窗關閉時更新長期池。
function commitRosterLearningFromCurrent(){
  return false;
}

function resetLearnedRosterPool(){
  if(state.finished) return;
  const history=getRecentRosterHistory();
  if(!history.length){
    setRosterInlineStatus('目前快捷背號已是原始預設 18 個。','info');
    renderRosterModal();
    return;
  }
  if(!confirm('確定清除「最近 5 場活躍背號」並回到程式原始 18 個快捷背號嗎？\n\n本場已選球員與既有比賽紀錄都不會被刪除。')) return;
  try{
    localStorage.removeItem(RECENT_ROSTER_HISTORY_KEY);
    localStorage.setItem(RECENT_ROSTER_HISTORY_INIT_KEY,'1');
    // 舊版學習資料一併清除，避免回退舊版後又把歷史背號帶回。
    localStorage.removeItem(LEARNED_ROSTER_POOL_KEY);
    localStorage.removeItem(LEARNED_NUMBERS_KEY);
  }catch(e){}
  rosterLearningDirty=false;
  setRosterInlineStatus('已回到原始 18 個快捷背號；本場名單維持不變。','success');
  renderRosterModal();
  render();
  byId('rosterModal')?.classList.add('open');
}


const JERSEY_COLOR_OPTIONS={
  default:{fill:'#eb686c',outline:'#b94f53',collar:'#ffffff'},
  blue:{fill:'#3b82f6',outline:'#1d4ed8',collar:'#ffffff'},
  yellow:{fill:'#facc15',outline:'#ca8a04',collar:'#ffffff'},
  white:{fill:'#f8fafc',outline:'#94a3b8',collar:'#64748b'},
  red:{fill:'#dc2626',outline:'#991b1b',collar:'#ffffff'},
  gray:{fill:'#94a3b8',outline:'#64748b',collar:'#f8fafc'},
  green:{fill:'#16a34a',outline:'#166534',collar:'#ffffff'},
  black:{fill:'#111827',outline:'#020617',collar:'#f8fafc'},
  orange:{fill:'#f97316',outline:'#c2410c',collar:'#ffffff'},
  purple:{fill:'#7c3aed',outline:'#5b21b6',collar:'#ffffff'}
};
function normalizeJerseyColor(value){
  const key=String(value||'default');
  return Object.prototype.hasOwnProperty.call(JERSEY_COLOR_OPTIONS,key) ? key : 'default';
}
function applyJerseyColorTheme(){
  const key=normalizeJerseyColor(state.jerseyColor);
  if(state.jerseyColor!==key) state.jerseyColor=key;
  const palette=JERSEY_COLOR_OPTIONS[key];
  const root=document.documentElement;
  root.style.setProperty('--roster-jersey',palette.fill);
  root.style.setProperty('--roster-jersey-outline',palette.outline);
  root.style.setProperty('--roster-jersey-collar',palette.collar);
}
function renderJerseyColorPicker(){
  const key=normalizeJerseyColor(state.jerseyColor);
  document.querySelectorAll('#jerseyColorGrid .jerseyColorBtn').forEach(btn=>{
    const selected=btn.dataset.jerseyColor===key;
    btn.classList.toggle('selected',selected);
    btn.setAttribute('aria-pressed',selected?'true':'false');
  });
}
function setJerseyColor(value){
  if(state.finished) return;
  state.jerseyColor=normalizeJerseyColor(value);
  applyJerseyColorTheme();
  renderJerseyColorPicker();
  saveState();
  render();
  byId('rosterModal')?.classList.add('open');
}

function currentRosterNumbers(){
  if(!Array.isArray(state.rosterNumbers)) state.rosterNumbers=[];
  return [...new Set(state.rosterNumbers.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=99))].sort((a,b)=>a-b);
}

function preferredOurNumbers(){
  const roster=currentRosterNumbers();
  return roster.length ? roster : allCommonNumbers();
}

// v4.87：我方背號 picker 共用資格邏輯。
// 有本場名單時優先只顯示本場球員；無名單才 fallback 常用背號。
// 已紅牌退場者排除；可額外排除指定球員（例如助攻不能等於進球者）。
function eligibleOurPlayerNumbers({excludeNumber='', beforeIndex=null}={}){
  const excluded=String(excludeNumber||'').trim();
  return preferredOurNumbers().filter(n=>{
    const raw=String(n);
    if(excluded && raw===excluded) return false;
    return !isRedCardedPlayer('OUR',raw,beforeIndex);
  });
}

function playerPickerSourceMeta(eligibleCount){
  const roster=currentRosterNumbers();
  return roster.length
    ? {label:'本場名單',badge:`${eligibleCount} 人可選`,fallback:false}
    : {label:'近期背號',badge:`${eligibleCount} 個`,fallback:true};
}

function renderPlayerPickerSource(labelId,badgeId,count){
  const meta=playerPickerSourceMeta(count);
  const label=byId(labelId);
  const badge=byId(badgeId);
  if(label) label.textContent=meta.label;
  if(badge){
    badge.textContent=meta.badge;
    badge.classList.toggle('fallback',meta.fallback);
  }
}

function getPreviousRoster(){
  try{
    const raw=JSON.parse(localStorage.getItem(LAST_ROSTER_KEY)||'[]');
    if(!Array.isArray(raw)) return [];
    return [...new Set(raw.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=99))].sort((a,b)=>a-b);
  }catch(e){
    return [];
  }
}

function rememberCurrentRosterAsPrevious(){
  const roster=currentRosterNumbers();
  if(roster.length) localStorage.setItem(LAST_ROSTER_KEY,JSON.stringify(roster));
}

let lastRosterRenderedCount=null;
let rosterUndoNumber=null;
let rosterUndoTimer=null;
let rosterLearningDirty=false;

function setRosterInlineStatus(message='',tone=''){
  const el=byId('rosterInlineStatus');
  if(!el) return;
  el.textContent=message;
  el.className=`rosterInlineStatus${tone?` ${tone}`:''}`;
}

function pulseRosterCount(){
  const badge=byId('rosterCountBadge');
  if(!badge) return;
  badge.classList.remove('pulse');
  void badge.offsetWidth;
  badge.classList.add('pulse');
  setTimeout(()=>badge.classList.remove('pulse'),220);
}

function renderRosterModal(){
  applyJerseyColorTheme();
  renderJerseyColorPicker();
  const roster=currentRosterNumbers();
  const presetGrid=byId('rosterPresetGrid');
  const grid=byId('rosterGrid');
  const extraWrap=byId('rosterExtraWrap');
  const badge=byId('rosterCountBadge');
  const previousBtn=byId('rosterPreviousBtn');
  const quickSourceHint=byId('rosterQuickSourceHint');

  if(quickSourceHint){
    const historyCount=getRecentRosterHistory().length;
    const learned=historyCount>0;
    quickSourceHint.textContent=learned?`近${historyCount}場`:'原始預設';
    quickSourceHint.title=learned?'快捷背號依最近完成的比賽自動整理':'尚無近期比賽紀錄，使用程式原始 18 個背號';
    quickSourceHint.classList.toggle('learned',learned);
  }

  if(badge){
    badge.textContent=`${roster.length} 人`;
    if(lastRosterRenderedCount!==null && lastRosterRenderedCount!==roster.length){
      pulseRosterCount();
    }
  }
  lastRosterRenderedCount=roster.length;

  const quickNumbers=allCommonNumbers();

  // 快捷背號就是主要名單控制器：點一下加入，再點一次取消。
  if(presetGrid){
    presetGrid.innerHTML='';
    quickNumbers.forEach(n=>{
      const selected=roster.includes(n);
      const btn=document.createElement('button');
      btn.type='button';
      btn.className=`rosterPresetBtn${selected?' selected':''}`;
      btn.textContent=`#${n}`;
      btn.setAttribute('aria-pressed',selected?'true':'false');
      btn.setAttribute('aria-label',`${selected?'取消':'加入'}背號 ${n}`);
      btn.onclick=()=>toggleRosterNumber(n);
      presetGrid.appendChild(btn);
    });
  }

  // Progressive disclosure：
  // 只有目前名單裡「尚未出現在快捷列表」的背號才另外顯示 chip。
  const quickSet=new Set(quickNumbers);
  const extraNumbers=roster.filter(n=>!quickSet.has(n));

  if(grid){
    grid.innerHTML='';
    extraNumbers.forEach(n=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='rosterChip';
      btn.textContent=`#${n}`;
      btn.setAttribute('aria-label',`移除背號 ${n}`);
      btn.title=`點一下移除 #${n}`;
      btn.onclick=()=>removeRosterNumber(n);
      grid.appendChild(btn);
    });
  }
  if(extraWrap) extraWrap.style.display=extraNumbers.length?'block':'none';

  // 「沿用上一場」只在真的有上一場名單、且和目前不同時才顯示。
  if(previousBtn){
    const previous=getPreviousRoster();
    const same=
      previous.length===roster.length &&
      previous.every((n,i)=>n===roster[i]);

    if(previous.length && !same){
      previousBtn.style.display='flex';
      previousBtn.textContent=`↻ 沿用上一場名單 ${previous.length} 人`;
    }else{
      previousBtn.style.display='none';
    }
  }
}

function openRosterModal(){
  if(state.finished){
    alert('本場比賽已結束，球員名單已鎖定。');
    return;
  }
  hideRosterUndo();
  setRosterInlineStatus('');
  lastRosterRenderedCount=null;
  rosterLearningDirty=false;
  renderRosterModal();
  const input=byId('rosterInput');
  if(input) input.value='';
  byId('rosterModal').classList.add('open');
}

function closeRosterModal(){
  hideRosterUndo();
  // v5.161：關閉名單視窗只保存本場資料；近期快捷背號要等比賽真正結束才更新。
  rosterLearningDirty=false;
  saveState();
  render();
  byId('rosterModal').classList.remove('open');
}

function parseRosterNumber(raw){
  const value=String(raw||'').trim();
  if(!/^\d{1,2}$/.test(value)) return null;
  const n=Number(value);
  return (Number.isInteger(n)&&n>=1&&n<=99) ? n : null;
}

function addRosterNumbers(){
  if(state.finished) return;
  const input=byId('rosterInput');
  if(!input) return;

  const number=parseRosterNumber(input.value);
  if(number===null){
    setRosterInlineStatus('請輸入 1～99 的球員背號。','error');
    input.focus();
    return;
  }

  const redOut=redCardedPlayerNumbers('OUR');
  if(redOut.has(String(number))){
    setRosterInlineStatus(`#${number} 已紅牌退場，不能加入本場名單。`,'error');
    input.value='';
    return;
  }

  const roster=currentRosterNumbers();
  if(roster.includes(number)){
    setRosterInlineStatus(`#${number} 已在本場名單中。`,'info');
    input.value='';
    return;
  }

  hideRosterUndo();
  state.rosterNumbers=[...roster,number].sort((a,b)=>a-b);
  rosterLearningDirty=true;
  rememberPlayerNumber(number);
  buildNumberGrid();
  buildKeeperGrid();
  saveState();

  setRosterInlineStatus(`已加入 #${number}`,'success');
  renderRosterModal();
  render();
  byId('rosterModal')?.classList.add('open');

  input.value='';
  setTimeout(()=>{
    const nextInput=byId('rosterInput');
    if(nextInput){
      nextInput.focus({preventScroll:true});
      nextInput.setSelectionRange?.(0,0);
    }
  },0);
}

function showRosterUndo(number){
  clearTimeout(rosterUndoTimer);
  rosterUndoNumber=Number(number);
  const bar=byId('rosterUndoBar');
  const txt=byId('rosterUndoText');
  if(txt) txt.textContent=`已移除 #${rosterUndoNumber}`;
  if(bar) bar.classList.add('show');
  rosterUndoTimer=setTimeout(()=>hideRosterUndo(),3600);
}

function hideRosterUndo(){
  clearTimeout(rosterUndoTimer);
  rosterUndoTimer=null;
  rosterUndoNumber=null;
  byId('rosterUndoBar')?.classList.remove('show');
}

function undoRosterRemoval(){
  const n=Number(rosterUndoNumber);
  if(!Number.isInteger(n) || n<1 || n>99) return;

  const roster=currentRosterNumbers();
  if(!roster.includes(n)){
    state.rosterNumbers=[...roster,n].sort((a,b)=>a-b);
    rosterLearningDirty=true;
    rememberPlayerNumber(n);
    buildNumberGrid();
    buildKeeperGrid();
    saveState();
  }

  hideRosterUndo();
  setRosterInlineStatus(`已復原 #${n}`,'success');
  renderRosterModal();
  render();
  byId('rosterModal')?.classList.add('open');
}

function toggleRosterNumber(number){
  if(state.finished) return;
  const n=Number(number);
  if(!Number.isInteger(n) || n<1 || n>99) return;

  const roster=currentRosterNumbers();
  setRosterInlineStatus('');

  rosterLearningDirty=true;
  if(roster.includes(n)){
    state.rosterNumbers=roster.filter(v=>v!==n);
    showRosterUndo(n);
  }else{
    const redOut=redCardedPlayerNumbers('OUR');
    if(redOut.has(String(n))){
      setRosterInlineStatus(`#${n} 已紅牌退場，不能加入本場名單。`,'error');
      return;
    }
    hideRosterUndo();
    state.rosterNumbers=[...roster,n].sort((a,b)=>a-b);
    rememberPlayerNumber(n);
  }

  buildNumberGrid();
  buildKeeperGrid();
  saveState();
  renderRosterModal();
  render();
  byId('rosterModal')?.classList.add('open');
}

function removeRosterNumber(number){
  if(state.finished) return;
  const n=Number(number);
  state.rosterNumbers=currentRosterNumbers().filter(v=>v!==n);
  rosterLearningDirty=true;

  showRosterUndo(n);
  setRosterInlineStatus('');
  buildNumberGrid();
  buildKeeperGrid();
  saveState();
  renderRosterModal();
  render();
  byId('rosterModal')?.classList.add('open');
}

function clearRoster(){
  if(state.finished) return;

  const roster=currentRosterNumbers();
  if(!roster.length){
    setRosterInlineStatus('目前名單已是空的。','info');
    return;
  }

  if(!confirm(`確定清空目前 ${roster.length} 位球員嗎？`)) return;

  hideRosterUndo();
  state.rosterNumbers=[];
  rosterLearningDirty=true;
  buildNumberGrid();
  buildKeeperGrid();
  saveState();

  setRosterInlineStatus('本場名單已清空。','info');
  renderRosterModal();
  render();
  byId('rosterModal')?.classList.add('open');
}

function applyPreviousRoster(){
  if(state.finished) return;

  const previous=getPreviousRoster();
  if(!previous.length){
    setRosterInlineStatus('目前沒有可沿用的上一場名單。','info');
    return;
  }

  const current=currentRosterNumbers();
  if(current.length && !confirm(`以「上一場 ${previous.length} 人」取代目前 ${current.length} 人名單嗎？`)){
    return;
  }

  hideRosterUndo();
  previous.forEach(rememberPlayerNumber);
  state.rosterNumbers=[...previous];
  rosterLearningDirty=true;

  buildNumberGrid();
  buildKeeperGrid();
  saveState();

  setRosterInlineStatus(`已沿用上一場 ${previous.length} 人名單。`,'success');
  renderRosterModal();
  render();
  byId('rosterModal')?.classList.add('open');
}


let keeperModalMode='NORMAL';
let keeperRedCardNumber='';

function buildKeeperGrid(){
  const grid=byId('keeperGrid');
  if(!grid) return;
  grid.innerHTML='';

  const roster=currentRosterNumbers();

  // v4.87：守門員與進球者 / 助攻者共用相同球員資格規則。
  const available=eligibleOurPlayerNumbers();

  const sourceLabel=byId('keeperSourceLabel');
  const sourceBadge=byId('keeperSourceBadge');
  const empty=byId('keeperEmpty');

  if(sourceLabel){
    sourceLabel.textContent=roster.length ? '本場名單' : '尚未設定本場名單';
  }
  if(sourceBadge){
    sourceBadge.textContent=roster.length ? `${available.length} 人` : '常用背號';
    sourceBadge.classList.toggle('fallback',!roster.length);
  }

  available.forEach(n=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='keeperNumBtn'+(String(state.goalkeeperNumber||'')===String(n)?' active':'');
    btn.textContent=n;
    btn.setAttribute('aria-label',`設定背號 ${n} 為守門員`);
    btn.onclick=()=>setKeeperNumber(n);
    grid.appendChild(btn);
  });

  if(empty){
    empty.hidden=available.length>0;
    empty.textContent=roster.length
      ? '本場名單目前沒有可用球員，可輸入其他背號或稍後再設定。'
      : '目前沒有可用的常用背號，可輸入其他背號或稍後再設定。';
  }
}
function openKeeperModal(options=null){
  if(state.finished){
    alert('本場比賽已結束，守門員背號已鎖定。');
    return;
  }

  const replacement=!!(options && typeof options==='object' && options.mode==='RED_CARD_REPLACEMENT');
  keeperModalMode=replacement?'RED_CARD_REPLACEMENT':'NORMAL';
  keeperRedCardNumber=replacement?String(options.redCardNumber||''):'';

  const modal=byId('keeperModal');
  const title=byId('keeperModalTitle');
  const hint=byId('keeperModalHint');
  const clearBtn=byId('keeperClearBtn');
  const cancelBtn=byId('keeperCancelBtn');

  if(modal) modal.classList.toggle('keeperRedCardMode',replacement);
  if(title) title.textContent=replacement?'🟥 守門員紅牌退場｜更換守門員':'🧤 設定守門員背號';
  if(hint){
    const roster=currentRosterNumbers();
    hint.textContent=replacement
      ? `#${keeperRedCardNumber} 已紅牌退場。${roster.length?'請從本場名單選擇新的守門員':'目前尚未設定本場名單，可先從常用背號選擇'}；若暫時不確定，也可以稍後再設定。`
      : roster.length
        ? '從本場球員中選擇守門員。設定後，按「撲救」會直接套用；比賽中可隨時更換。'
        : '尚未設定本場名單，先顯示常用背號；也可輸入其他背號。比賽中可隨時更換。';
  }
  if(clearBtn) clearBtn.style.display=replacement?'none':'';
  if(cancelBtn) cancelBtn.textContent=replacement?'稍後設定':'取消';

  buildKeeperGrid();
  const input=byId('keeperCustomNumber');
  if(input){
    input.value=replacement?'':(state.goalkeeperNumber||'');
    input.placeholder=replacement?'新守門員背號 1–99':'其他背號 1–99';
  }
  modal?.classList.add('open');
}
function closeKeeperModal(){
  const modal=byId('keeperModal');
  modal?.classList.remove('open','keeperRedCardMode');
  keeperModalMode='NORMAL';
  keeperRedCardNumber='';
  const clearBtn=byId('keeperClearBtn');
  const cancelBtn=byId('keeperCancelBtn');
  const input=byId('keeperCustomNumber');
  if(clearBtn) clearBtn.style.display='';
  if(cancelBtn) cancelBtn.textContent='取消';
  if(input) input.placeholder='其他背號 1–99';
}
function setKeeperNumber(number){
  if(state.finished) return;
  const n=Number(number);
  if(!Number.isInteger(n) || n<1 || n>99){
    alert('守門員背號請輸入 1～99 的整數');
    return;
  }
  if(isRedCardedPlayer('OUR',String(n))){
    alert(`#${n} 已領紅牌退場，不能再設定為守門員。`);
    return;
  }

  const previousKeeper=String(state.goalkeeperNumber||'').trim();
  const autoRosterKeeper=String(state.goalkeeperAutoRosterNumber||'').trim();
  let roster=currentRosterNumbers();

  // v5.159：如果上一位守門員只是因「設定守門員」而自動加入名單，
  // 更換守門員時要把舊背號同步移除，避免名單從 1 人錯誤累積成 2 人、3 人。
  // 若舊守門員原本就是使用者手動選入的正式名單成員，則仍保留在名單中。
  if(previousKeeper && previousKeeper!==String(n) && autoRosterKeeper===previousKeeper){
    const previousNumber=Number(previousKeeper);
    roster=roster.filter(v=>v!==previousNumber);
  }

  state.goalkeeperNumber=String(n);

  // 守門員必須屬於本場球員；若此背號原本不在名單中，才自動加入並記錄來源。
  if(!roster.includes(n)){
    state.rosterNumbers=[...roster,n].sort((a,b)=>a-b);
    state.goalkeeperAutoRosterNumber=String(n);
  }else{
    state.rosterNumbers=[...roster].sort((a,b)=>a-b);
    // 新守門員本來就在名單內，代表不是本次自動加入，不應在下次更換時自動刪除。
    if(previousKeeper!==String(n) || autoRosterKeeper!==String(n)){
      state.goalkeeperAutoRosterNumber='';
    }
  }

  rememberPlayerNumber(n);
  buildNumberGrid();
  buildKeeperGrid();
  saveState();
  render();
  closeKeeperModal();
}
function saveKeeperCustom(){
  if(state.finished) return;
  const el=byId('keeperCustomNumber');
  if(!el) return;
  el.value=String(el.value||'').replace(/\D/g,'').slice(0,2);
  const raw=el.value.trim();
  const n=Number(raw);
  if(!Number.isInteger(n) || n<1 || n>99){
    alert('守門員背號請輸入 1～99 的整數');
    el.focus();
    return;
  }
  setKeeperNumber(n);
}
function clearKeeperNumber(){
  const current=String(state.goalkeeperNumber||'').trim();
  const autoRosterKeeper=String(state.goalkeeperAutoRosterNumber||'').trim();
  if(current && autoRosterKeeper===current){
    const n=Number(current);
    state.rosterNumbers=currentRosterNumbers().filter(v=>v!==n);
  }
  state.goalkeeperNumber='';
  state.goalkeeperAutoRosterNumber='';
  saveState();
  render();
  closeKeeperModal();
}

function buildNumberGrid(){
  const grid=byId('numberGrid');
  if(!grid) return;
  grid.innerHTML='';

  const eligible=pendingNumberTeam==='OUR'
    ? eligibleOurPlayerNumbers()
    : [];

  renderPlayerPickerSource('numberSourceLabel','numberSourceBadge',eligible.length);

  eligible.forEach(n=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='numBtn playerPickerBtn';
    btn.textContent=n;
    btn.setAttribute('aria-label',`選擇背號 ${n}`);
    btn.onclick=()=>finishNumberSelection(String(n));
    grid.appendChild(btn);
  });
}



let quickNoticeTimer=null;
function showQuickNotice(title,text,duration=3200){
  const box=byId('quickNotice');
  if(!box) return;

  clearTimeout(quickNoticeTimer);
  byId('quickNoticeTitle').textContent=String(title||'');
  byId('quickNoticeText').textContent=String(text||'');

  box.classList.remove('show');
  void box.offsetWidth;
  box.classList.add('show');

  quickNoticeTimer=setTimeout(()=>{
    box.classList.remove('show');
  }, Math.max(1200,Number(duration)||3200));
}

function validateTeamNameValue(value, label, required=false){
  const name=String(value||'').trim();

  if(required && !name){
    alert(`請先輸入${label}`);
    return false;
  }

  if(!name) return true;

  if(name.length>15){
    alert(`${label}最多 15 字`);
    return false;
  }

  if(/[<>\r\n]/.test(name)){
    alert(`${label}不可包含 <、> 或換行`);
    return false;
  }

  if(containsBopomofo(name)){
    showQuickNotice('請修正文字',`${label}不可使用注音符號，請完成選字或改為正式文字`,4200);
    return false;
  }

  // 隊伍名稱不可全部為數字；只要包含至少一個非數字字元即可。
  // 例如 U12忠義國小、FC123、2026忠義皆允許；12345、001 則不允許。
  if(/^\d+$/.test(name)){
    alert(`${label}不可全部為數字`);
    return false;
  }

  return true;
}

// v5.33：切換主要比賽狀態時從頁首呈現完整狀態，不再強制滑到功能區或輸出區。
function showMatchStateFromTop(){
  const root=document.documentElement;
  root?.classList?.add('stateTopLock');
  try{ document.activeElement?.blur?.(); }catch(e){}
  const goTop=()=>{
    const scroller=document.scrollingElement || document.documentElement || document.body;
    if(scroller){ scroller.scrollTop=0; scroller.scrollLeft=0; }
    if(document.body){ document.body.scrollTop=0; document.body.scrollLeft=0; }
    if(document.documentElement){ document.documentElement.scrollTop=0; document.documentElement.scrollLeft=0; }
    try{ window.scrollTo({top:0,left:0,behavior:'auto'}); }
    catch(e){ try{ window.scrollTo(0,0); }catch(ignore){} }
  };
  goTop();
  requestAnimationFrame(()=>requestAnimationFrame(goTop));
  // iOS Safari 可能在按鈕／Modal 關閉後再次還原捲動錨點，因此分段校正。
  setTimeout(goTop,90);
  setTimeout(goTop,280);
  setTimeout(goTop,650);
  setTimeout(()=>root?.classList?.remove('stateTopLock'),760);
}

function startMatch(){
  if(state.started && !state.finished) return;
  if(state.finished){
    alert('本場比賽已結束，請先建立新比賽');
    return;
  }

  if(!validateMatchTextFields()) return;

  const ourName=byId('ourTeam').value.trim();
  const oppName=byId('oppTeam').value.trim();
  if(!validateTeamNameValue(ourName,'我方隊伍名稱',false)){
    byId('ourTeam').classList.add('inputError');
    focusMatchRequiredField('ourTeam');
    return;
  }
  if(!validateTeamNameValue(oppName,'對手隊伍名稱',false)){
    byId('oppTeam').classList.add('inputError');
    focusMatchRequiredField('oppTeam');
    return;
  }
  state.ourTeam=ourName;
  state.oppTeam=byId('oppTeam').value.trim();
  state.venue=byId('venue').value.trim();
  state.competitionStage=byId('competitionStage')?.value.trim()||'';

  // 只有真的有輸入名稱才更新「最近我方隊名」。
  // 留白開賽時畫面先顯示「我方」，不會把空白覆蓋掉使用者之前的常用隊名。
  if(ourName){
    localStorage.setItem(LAST_OUR_TEAM_KEY, ourName);
  }

  // 只有第一次按下「開始比賽」才正式寫入最近場地。
  // 開始下半場 / 延長賽不需要再次更新排序。
  if(!state.awaitingNextPeriod){
    rememberVenueIfEligible(state.venue);
    rememberRecentVenue(state.venue);
  }

  // 同一次「開始」操作共用同一個整秒時間，避免剛好跨秒時
  // 出現中場結束與下半場開始相差 1 秒的假空檔。
  const actionEpoch=nowWholeMs();

  if(state.awaitingNextPeriod){
    if(state.nextPeriodType==='SECOND_HALF' && state.halftimeStartEpoch){
      state.halftimeEndEpoch=actionEpoch;
      state.halftimeDuration=wholeSecondDuration(state.halftimeStartEpoch,state.halftimeEndEpoch);
    }
    state.currentPeriod=state.nextPeriodType==='EXTRA_TIME' ? 3 : 2;
    state.awaitingNextPeriod=false;
    state.nextPeriodType=null;
  }else if(!state.periods.length){
    state.currentPeriod=1;
  }

  if(!validDayMatchNumber(state.dayMatchNumber)) ensureDayMatchNumber();
  state.dayMatchNumberLocked=true;
  // v5.183：開始比賽只「預留」本日場次；正式確認要等全場／PK 完成。
  if(!state.finished) state.dayMatchNumberConfirmed=false;
  state.started=true;
  state.startEpoch=actionEpoch;
  state.endEpoch=null;
  state.finalElapsed=0;
  state.periodStartOurScore=state.ourScore;
  state.periodStartOppScore=state.oppScore;
  saveState();
  render();
  showMatchStateFromTop();

  // v4.93：先記時間最重要。若尚未填我方名稱，只做非阻斷提示。
  if(!ourName){
    showQuickNotice('⏱ 已開始計時', '我方球隊名稱可稍後點「我方」補充');
  }
}


const LONG_DURATION_NOTICE_SECONDS=3*60*60;
let longDurationInlineDismissedStartEpoch=null;

function shouldShowLongDurationInline(){
  if(!state.started || state.finished || state.awaitingNextPeriod || !state.startEpoch) return false;
  const sec=Math.floor(Number(elapsed())||0);
  if(sec<LONG_DURATION_NOTICE_SECONDS) return false;
  return Number(longDurationInlineDismissedStartEpoch||0)!==Number(state.startEpoch||0);
}

function renderLongDurationInline(secOverride){
  const host=byId('longDurationInline');
  if(!host) return;
  const show=shouldShowLongDurationInline();
  host.hidden=!show;
  if(!show) return;

  const sec=Number.isFinite(Number(secOverride)) ? Math.floor(Number(secOverride)) : Math.floor(Number(elapsed())||0);
  const value=byId('longDurationInlineValue');
  if(value) value.textContent=fmtMatchClock(sec);
  host.setAttribute('aria-label',`計時時間異常偏長。已持續 ${fmtMatchClock(sec)}，請確認比賽是否仍在進行。`);
}

function dismissLongDurationInline(){
  // 只在目前頁面工作階段暫時隱藏；重新整理後若仍超過門檻會再次提醒。
  longDurationInlineDismissedStartEpoch=state.startEpoch||null;
  renderLongDurationInline();
}

function maybeOfferLongDurationNotice(){
  // v5.129：保留舊呼叫點，但改成非阻斷的 inline render。
  if(document.hidden) return;
  renderLongDurationInline();
}


function finishMatch(){
  if(state.penalty?.active){
    openPenaltyModal();
    return;
  }
  if(!state.started){
    const waitText=state.nextPeriodType==='EXTRA_TIME' ? '請先開始延長賽' : (state.awaitingNextPeriod ? '請先開始下半場' : '比賽尚未開始');
    alert(waitText);
    return;
  }
  if(state.finished) return;

  pendingFinishEnd=nowWholeMs();
  pendingFinishElapsed=wholeSecondDuration(state.startEpoch,pendingFinishEnd,elapsed());

  const tied=state.ourScore===state.oppScore;
  const title=state.currentPeriod===1 ? '本段比賽已結束' : state.currentPeriod===2 ? '下半場已結束' : '延長賽已結束';
  byId('finishDecisionTitle').textContent=title;
  byId('finishDecisionInfo').textContent=`目前比分 ${state.ourScore}:${state.oppScore}｜本段時間 ${fmtMatchClock(pendingFinishElapsed)}${tied && state.currentPeriod>=2 ? '｜目前平手' : ''}`;

  const halfBtn=byId('finishHalfBtn');
  const extraBtn=byId('finishExtraBtn');
  const pkBtn=byId('finishPenaltyBtn');
  const btns=byId('finishDecisionBtns');
  halfBtn.style.display=state.currentPeriod===1 ? '' : 'none';
  extraBtn.style.display=(state.currentPeriod===2 && tied) ? '' : 'none';
  pkBtn.style.display=(state.currentPeriod>=2 && tied) ? '' : 'none';
  btns.classList.toggle('three', state.currentPeriod===2 && tied);
  byId('finishDecisionModal').classList.add('open');
}

function cancelFinishDecision(){
  pendingFinishEnd=null;
  pendingFinishElapsed=null;
  byId('finishDecisionModal').classList.remove('open');
}

function archiveCurrentPeriod(label){
  const rec={
    number:state.currentPeriod,
    label,
    startEpoch:state.startEpoch,
    endEpoch:pendingFinishEnd,
    duration:pendingFinishElapsed,
    startOurScore:state.periodStartOurScore,
    startOppScore:state.periodStartOppScore,
    endOurScore:state.ourScore,
    endOppScore:state.oppScore
  };
  const idx=state.periods.findIndex(p=>Number(p.number)===Number(state.currentPeriod));
  if(idx>=0) state.periods[idx]=rec;
  else state.periods.push(rec);
}

function confirmFinishHalf(){
  if(state.currentPeriod!==1 || pendingFinishEnd===null) return;
  state.multiPeriod=true;
  archiveCurrentPeriod('上半場');
  state.endEpoch=pendingFinishEnd;
  // 上半場時間已完整封存在 periods；等待下半場時，現在這一段的計時歸零。
  state.finalElapsed=0;
  state.started=false;
  state.finished=false;
  state.awaitingNextPeriod=true;
  state.nextPeriodType='SECOND_HALF';
  state.halftimeStartEpoch=pendingFinishEnd || nowWholeMs();
  state.halftimeEndEpoch=null;
  state.halftimeDuration=0;
  pendingFinishEnd=null;
  pendingFinishElapsed=null;
  byId('finishDecisionModal').classList.remove('open');
  saveState();
  render();
  showMatchStateFromTop();
}

function openExtraTimeSetup(){
  if(state.currentPeriod!==2 || pendingFinishEnd===null) return;
  byId('extraTimeMinutes').value=state.extraTimeMinutes || '';
  byId('extraTimeModal').classList.add('open');
}
function closeExtraTimeSetup(){
  byId('extraTimeModal').classList.remove('open');
}
function confirmExtraTime(){
  const minutes=validateIntegerField('extraTimeMinutes','延長賽時間',1,45,false);
  if(minutes===undefined) return;
  if(pendingFinishEnd===null || state.currentPeriod!==2) return;
  state.multiPeriod=true;
  state.extraTime=true;
  state.extraTimeMinutes=minutes;
  archiveCurrentPeriod('下半場');
  state.endEpoch=pendingFinishEnd;
  state.finalElapsed=0;
  state.started=false;
  state.finished=false;
  state.awaitingNextPeriod=true;
  state.nextPeriodType='EXTRA_TIME';
  pendingFinishEnd=null;
  pendingFinishElapsed=null;
  byId('extraTimeModal').classList.remove('open');
  byId('finishDecisionModal').classList.remove('open');
  saveState();
  render();
  showMatchStateFromTop();
}

let pendingPenaltyRosterIndex=null;

function openPenaltyRosterPicker(index){
  const roster=currentRosterNumbers();

  // 沒有設定本場名單時仍使用原本手動輸入方式。
  if(!roster.length){
    const input=byId(`pk_our_${index}`);
    if(input){
      input.focus();
      input.select?.();
    }
    return;
  }

  pendingPenaltyRosterIndex=index;
  renderPenaltyRosterPicker();
  syncVisualViewport();
  byId('penaltyRosterModal').classList.add('open');
}

function closePenaltyRosterPicker(){
  byId('penaltyRosterModal').classList.remove('open');
  pendingPenaltyRosterIndex=null;
}

function renderPenaltyRosterPicker(){
  const grid=byId('penaltyRosterGrid');
  if(!grid) return;

  const roster=currentRosterNumbers();
  const kick=(
    pendingPenaltyRosterIndex!==null
      ? state.penalty?.our?.[pendingPenaltyRosterIndex]
      : null
  );
  const selected=String(kick?.number||'');

  const ourName=state.ourTeam||'我方';
  const hint=byId('penaltyRosterHint');
  if(hint){
    hint.textContent=`${ourName}｜第 ${(pendingPenaltyRosterIndex??0)+1} 輪：點一下本場球員背號即可帶入。`;
  }

  grid.innerHTML='';
  const redOut=redCardedPlayerNumbers('OUR');
  const eligibleRoster=roster.filter(n=>!redOut.has(String(n)));
  if(!eligibleRoster.length && roster.length){
    grid.innerHTML='<div class="rosterEmpty" style="grid-column:1/-1">本場名單球員皆無可用背號（紅牌退場球員不可參與 PK）。</div>';
    return;
  }
  eligibleRoster.forEach(n=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className=`penaltyRosterBtn${selected===String(n)?' selected':''}`;
    btn.textContent=`#${n}`;
    btn.setAttribute('aria-pressed',selected===String(n)?'true':'false');
    btn.onclick=()=>choosePenaltyRosterNumber(n);
    grid.appendChild(btn);
  });
}

function choosePenaltyRosterNumber(number){
  const index=pendingPenaltyRosterIndex;
  const n=Number(number);

  if(
    index===null ||
    !state.penalty?.our?.[index] ||
    !Number.isInteger(n) ||
    n<1 ||
    n>99
  ) return;

  state.penalty.our[index].number=String(n);
  saveState();
  closePenaltyRosterPicker();
  renderPenaltyModal();
}

function clearPenaltyRosterNumber(){
  const index=pendingPenaltyRosterIndex;
  if(index===null || !state.penalty?.our?.[index]) return;

  state.penalty.our[index].number='';
  saveState();
  closePenaltyRosterPicker();
  renderPenaltyModal();
}

function emptyPenaltyKick(){ return {number:'',result:null}; }
function ensurePenaltyState(){
  if(!state.penalty) state.penalty={active:true,completed:false,startEpoch:nowWholeMs(),endEpoch:null,our:[],opp:[],baseOurScore:state.ourScore,baseOppScore:state.oppScore};
  if(!Number.isFinite(Number(state.penalty.baseOurScore))) state.penalty.baseOurScore=state.ourScore;
  if(!Number.isFinite(Number(state.penalty.baseOppScore))) state.penalty.baseOppScore=state.oppScore;
  while(state.penalty.our.length<5) state.penalty.our.push(emptyPenaltyKick());
  while(state.penalty.opp.length<5) state.penalty.opp.push(emptyPenaltyKick());
}
function penaltyGoals(side){
  if(!state.penalty) return 0;
  return (state.penalty[side]||[]).filter(k=>k.result==='GOAL').length;
}
function penaltyResultLabel(result){ return result==='GOAL'?'✓ 進球':result==='MISS'?'× 未進':'○ 待定'; }
function beginPenaltyShootout(){
  if(pendingFinishEnd!==null){
    const label=state.currentPeriod===2?'下半場':state.currentPeriod===3?'延長賽':'全場';
    archiveCurrentPeriod(label);
    state.endEpoch=pendingFinishEnd;
    state.finalElapsed=state.periods.reduce((sum,p)=>sum+(Number(p.duration)||0),0);
  }
  state.started=false;
  state.finished=false;
  state.awaitingNextPeriod=false;
  state.nextPeriodType=null;
  state.penalty={active:true,completed:false,startEpoch:nowWholeMs(),endEpoch:null,our:[],opp:[],baseOurScore:state.ourScore,baseOppScore:state.oppScore};
  ensurePenaltyState();
  pendingFinishEnd=null;
  pendingFinishElapsed=null;
  byId('finishDecisionModal').classList.remove('open');
  saveState();
  render();
  openPenaltyModal();
}
function openPenaltyModal(){
  ensurePenaltyState();
  syncVisualViewport();
  renderPenaltyModal();
  byId('penaltyModal').classList.add('open');
}
function closePenaltyModal(){
  savePenaltyInputs();
  byId('penaltyRosterModal')?.classList.remove('open');
  pendingPenaltyRosterIndex=null;
  byId('penaltyModal').classList.remove('open');
  saveState();
  render();
}
function sanitizePenaltyNumberInput(el){
  if(!el) return;
  el.value=String(el.value||'').replace(/\D/g,'').slice(0,2);
}
function commitPenaltyNumber(side,index,el){
  if(!state.penalty?.[side]?.[index] || !el) return true;
  sanitizePenaltyNumberInput(el);
  const raw=String(el.value||'').trim();
  if(raw===''){
    state.penalty[side][index].number='';
    saveState();
    return true;
  }
  const n=Number(raw);
  if(!Number.isInteger(n) || n<1 || n>99){
    alert('球員背號請輸入 1～99 的整數，或留空');
    el.value='';
    state.penalty[side][index].number='';
    saveState();
    return false;
  }
  el.value=String(n);
  state.penalty[side][index].number=String(n);
  if(side==='our') rememberPlayerNumber(n);
  saveState();
  return true;
}
function savePenaltyInputs(){
  if(!state.penalty) return;
  ['our','opp'].forEach(side=>{
    state.penalty[side].forEach((kick,i)=>{
      // 有本場球員名單時，我方背號由點選器直接寫入 state，
      // 不再從 input DOM 回讀，避免按結果按鈕時被誤清空。
      if(side==='our' && currentRosterNumbers().length) return;

      const el=byId(`pk_${side}_${i}`);
      if(!el) return;
      sanitizePenaltyNumberInput(el);
      const raw=String(el.value||'').trim();
      if(raw===''){ kick.number=''; return; }
      const n=Number(raw);
      if(!Number.isInteger(n)||n<1||n>99){
        kick.number='';
        el.value='';
        return;
      }
      kick.number=String(n);
      el.value=String(n);
      if(side==='our' && kick.number) rememberPlayerNumber(kick.number);
    });
  });
}
function togglePenaltyResult(side,index){
  savePenaltyInputs();
  const kick=state.penalty?.[side]?.[index];
  if(!kick) return;
  kick.result=kick.result===null?'GOAL':kick.result==='GOAL'?'MISS':null;
  saveState();
  renderPenaltyModal();
}
function addPenaltyRound(){
  savePenaltyInputs();
  ensurePenaltyState();
  state.penalty.our.push(emptyPenaltyKick());
  state.penalty.opp.push(emptyPenaltyKick());
  saveState();
  renderPenaltyModal();
  setTimeout(()=>{ const body=byId('penaltyModal').querySelector('.penaltyBody'); if(body) body.scrollTop=body.scrollHeight; },0);
}
function renderPenaltyModal(){
  ensurePenaltyState();
  const ourName=state.ourTeam||'我方', oppName=state.oppTeam||'對手';
  byId('penaltyOurName').textContent=ourName;
  byId('penaltyOppName').textContent=oppName;
  byId('penaltyOurHead').textContent=ourName;
  byId('penaltyOppHead').textContent=oppName;
  byId('penaltyScoreText').textContent=`${penaltyGoals('our')} : ${penaltyGoals('opp')}`;
  const count=Math.max(state.penalty.our.length,state.penalty.opp.length);
  const hasOurRoster=currentRosterNumbers().length>0;
  let html='';
  for(let i=0;i<count;i++){
    const ok=state.penalty.our[i]||emptyPenaltyKick(), op=state.penalty.opp[i]||emptyPenaltyKick();

    const card=(side,kick)=>{
      const resultBtn=`<button type="button" class="penaltyResultBtn ${kick.result==='GOAL'?'goal':kick.result==='MISS'?'miss':'pending'}" onclick="togglePenaltyResult('${side}',${i})">${penaltyResultLabel(kick.result)}</button>`;

      if(side==='our' && hasOurRoster){
        const numberText=kick.number?`#${escapeHtml(kick.number)}`:'#';
        return `<div class="penaltyKickCard"><button id="pk_${side}_${i}" type="button" class="penaltyNumberPickBtn${kick.number?' hasNumber':''} cardEvent yellow" onclick="openPenaltyRosterPicker(${i})" aria-label="${ourName} 第${i+1}點選擇球員背號">${numberText}</button>${resultBtn}</div>`;
      }

      return `<div class="penaltyKickCard"><input id="pk_${side}_${i}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" placeholder="#" value="${escapeHtml(kick.number||'')}" oninput="sanitizePenaltyNumberInput(this)" onblur="commitPenaltyNumber('${side}',${i},this)" aria-label="${side==='our'?ourName:oppName} 第${i+1}點背號">${resultBtn}</div>`;
    };

    html+=`<div class="penaltyRound"><div class="penaltyRoundNo">${i+1}</div>${card('our',ok)}${card('opp',op)}</div>`;
  }
  byId('penaltyRounds').innerHTML=html;
}
function finishPenaltyShootout(){
  savePenaltyInputs();
  ensurePenaltyState();
  const ourTaken=state.penalty.our.filter(k=>k.result).length;
  const oppTaken=state.penalty.opp.filter(k=>k.result).length;
  const our=penaltyGoals('our'), opp=penaltyGoals('opp');
  if(!ourTaken || !oppTaken){ alert('請至少記錄雙方各一次 PK 結果'); return; }
  if(our===opp){
    const allSet=state.penalty.our.every(k=>k.result) && state.penalty.opp.every(k=>k.result);
    alert(allSet ? '目前 PK 仍然平手，請按「＋ 加一輪」繼續記錄。' : '目前 PK 仍然平手，請繼續記錄尚未完成的點球。');
    return;
  }
  state.ourScore=Number(state.penalty.baseOurScore);
  state.oppScore=Number(state.penalty.baseOppScore);
  state.penalty.active=false;
  state.penalty.completed=true;
  state.penalty.endEpoch=nowWholeMs();
  state.finished=true;
  state.started=false;
  // v5.183：PK 完成才把預留場次正式確認。
  state.dayMatchNumberConfirmed=true;
  state.dayMatchNumberLocked=true;
  timeExpanded=false;
  state.endEpoch=state.penalty.endEpoch;
  state.finalElapsed=state.periods.reduce((sum,p)=>sum+(Number(p.duration)||0),0);
  rememberCurrentRosterAsPrevious();
  recordRecentRosterForMatch({matchId:MATCH_ID,roster:currentRosterNumbers(),goalkeeper:state.goalkeeperNumber,updatedAt:state.endEpoch||Date.now()});
  byId('penaltyRosterModal')?.classList.remove('open');
  pendingPenaltyRosterIndex=null;
  byId('penaltyModal').classList.remove('open');
  saveState();
  render();
  showMatchStateFromTop();
}
function penaltySummaryHTML(){
  if(!state.penalty) return '';
  const count=Math.max(state.penalty.our.length,state.penalty.opp.length);
  let rows='';
  for(let i=0;i<count;i++){
    const a=state.penalty.our[i]||emptyPenaltyKick(), b=state.penalty.opp[i]||emptyPenaltyKick();
    if(!a.result && !b.result && !a.number && !b.number) continue;
    const one=(kick)=>{
      const result=kick.result==='GOAL'?'✓':kick.result==='MISS'?'×':'—';
      const cls=kick.result==='GOAL'?'ok':kick.result==='MISS'?'no':'';
      const num=kick.number?`<span class="pkNumber">#${escapeHtml(kick.number)}</span>`:'<span class="pkNumber">—</span>';
      return `<span class="${cls}">${num}${result}</span>`;
    };
    rows+=`<div class="penaltySummaryRow"><div class="penaltySummaryRoundNo">${i+1}</div><div class="penaltySummaryKick">${one(a)}</div><div class="penaltySummaryKick">${one(b)}</div></div>`;
  }
  const head=`<div class="penaltySummaryHead"><div>輪</div><div>${escapeHtml(state.ourTeam||'我方')} 背號</div><div>${escapeHtml(state.oppTeam||'對手')} 背號</div></div>`;
  return `<div class="penaltySummaryTop"><span>${escapeHtml(state.ourTeam||'我方')} vs ${escapeHtml(state.oppTeam||'對手')}</span><span class="penaltySummaryScore">PK ${penaltyGoals('our')} : ${penaltyGoals('opp')}</span></div>${head}${rows}`;
}

function confirmFinishFull(){
  if(pendingFinishEnd===null) return;

  const label=state.multiPeriod ? (state.currentPeriod===1?'上半場':state.currentPeriod===2?'下半場':'延長賽') : '全場';
  archiveCurrentPeriod(label);

  state.endEpoch=pendingFinishEnd;
  state.started=false;
  state.finished=true;
  // v5.183：只有真正完成全場，才將本日場次由「預留」轉為「正式確認」。
  state.dayMatchNumberConfirmed=true;
  state.dayMatchNumberLocked=true;
  rememberCurrentRosterAsPrevious();
  recordRecentRosterForMatch({matchId:MATCH_ID,roster:currentRosterNumbers(),goalkeeper:state.goalkeeperNumber,updatedAt:pendingFinishEnd||Date.now()});
  timeExpanded=false;
  regulationEditorExpanded=false;
  state.awaitingNextPeriod=false;
  state.finalElapsed=state.periods.reduce((sum,p)=>sum+(Number(p.duration)||0),0);

  pendingFinishEnd=null;
  pendingFinishElapsed=null;
  byId('finishDecisionModal').classList.remove('open');
  saveState();
  render();
  showMatchStateFromTop();
}
function newMatch(){
  hideMarkerUndo();
  if((state.started || state.markers.length) && !confirm('建立新比賽會保留目前這場，並建立新的獨立比賽，確定嗎？')) return;

  // v5.89：新比賽不再清除目前 Match ID 的資料。
  // 先完整保存舊場，再建立新的 URL Match ID。
  try{ saveState(); }catch(e){}

  // v5.159：同一天連續賽程通常沿用相同比賽設定。
  // 建立下一場前先快照本場可重用欄位；對手名稱、比分、事件與所有計時狀態仍歸零。
  rememberCurrentRosterAsPrevious();
  // v5.161：保險機制。若本場已完成，建立下一場前再同步一次近期名單歷史；同一 Match ID 會去重，不會重複計算。
  if(state.finished){
    recordRecentRosterForMatch({matchId:MATCH_ID,roster:currentRosterNumbers(),goalkeeper:state.goalkeeperNumber,updatedAt:state.endEpoch||Date.now()});
  }
  const rememberedOurTeam=String(byId('ourTeam')?.value ?? state.ourTeam ?? '').trim();
  const rememberedVenue=String(byId('venue')?.value ?? state.venue ?? '').trim();
  const rememberedCompetition=String(byId('competition')?.value ?? state.competition ?? '').trim();
  const rememberedRoster=currentRosterNumbers();
  const rememberedGoalkeeper=String(state.goalkeeperNumber||'').trim();
  const rememberedGoalkeeperAutoRoster=String(state.goalkeeperAutoRosterNumber||'').trim();
  // v5.159：同日連續比賽沿用上一場球衣顏色。
  // 仍透過既有白名單正規化，避免未知值污染新場資料。
  const rememberedJerseyColor=normalizeJerseyColor(state.jerseyColor);
  const reg=Number(state.regulationMinutes);
  const rememberedRegulationMinutes=(Number.isInteger(reg) && reg>=1 && reg<=45) ? reg : null;
  const nextDayMatchNumber=suggestNextDayMatchNumber(rememberedOurTeam||'忠義國小',Date.now());

  activateMatchId(createUniqueMatchId(),{writeUrl:true});
  MATCH_ENTRY_MODE='url';

  state={
    ourTeam:rememberedOurTeam, oppTeam:'', venue:rememberedVenue, competition:rememberedCompetition, competitionStage:'',
    dayMatchNumber:nextDayMatchNumber, dayMatchNumberManual:false, dayMatchNumberLocked:false, dayMatchNumberConfirmed:false,
    started:false, finished:false, startEpoch:null, endEpoch:null, finalElapsed:0,
    regulationMinutes:rememberedRegulationMinutes, ourScore:0, oppScore:0, markers:[],
    currentPeriod:1, awaitingNextPeriod:false, multiPeriod:false,
    periodStartOurScore:0, periodStartOppScore:0, periods:[],
    nextPeriodType:null, extraTime:false, extraTimeMinutes:null, penalty:null,
    goalkeeperNumber:rememberedGoalkeeper, goalkeeperAutoRosterNumber:rememberedGoalkeeperAutoRoster,
    rosterNumbers:[...rememberedRoster], jerseyColor:rememberedJerseyColor, halftimeStartEpoch:null, halftimeEndEpoch:null, halftimeDuration:0,
    longDurationAckStartEpoch:null,
    regulationPulseAckToken:''
  };

  byId('ourTeam').value=rememberedOurTeam;
  byId('ourTeam').classList.remove('requiredError');
  byId('oppTeam').value='';
  byId('ourTeamBox')?.classList.remove('editing');
  byId('oppTeamBox')?.classList.remove('editing');
  byId('venue').value=rememberedVenue;
  byId('competition').value=rememberedCompetition;
  if(byId('competitionStage')) byId('competitionStage').value='';
  syncRegulationInputsFromState();
  timeExpanded=false;
  regulationEditorExpanded=false;
  saveState();
  render();

  // 下一場只需要重新輸入對手；其餘常用欄位已從上一場帶入。
  // 不再先選取我方隊名，避免使用者誤以為還需要重填已保留資料。
  nextMatchOpponentOnly=true;
  guidedSetupStep=null;
  setTimeout(()=>{
    editTeamName('oppTeam');
    const input=byId('oppTeam');
    if(input){
      try{ input.select(); }catch(e){}
    }
  },80);
}

function saveRegulation(){
  const n=getRegulationMinutesInput();
  if(n===undefined) return;
  if(n===null){
    alert('請先選擇比賽時間，或使用自訂分鐘');
    return;
  }
  if(n===0){
    clearRegulation();
    return;
  }
  state.regulationMinutes=n;
  if(matchStartEpoch()) regulationEditorExpanded=false;
  saveState();
  syncRegulationInputsFromState();
  render();
}
function clearRegulation(){
  state.regulationMinutes=null;
  if(matchStartEpoch()) regulationEditorExpanded=false;
  syncRegulationInputsFromState();
  saveState();
  render();
}

function openGoalModal(){
  if(!state.started){ alert('請先按「開始比賽」'); return; }
  if(state.finished){ alert('本場比賽已結束'); return; }
  pendingGoalTime=elapsed();
  pendingGoalTeam=null;
  pendingOwnGoalTeam=null;
  byId('goalOurName').textContent=state.ourTeam||'我方';
  byId('goalOppName').textContent=state.oppTeam||'對手';
  byId('goalModal').classList.add('open');
}
function openOwnGoalTeamModal(){
  if(pendingGoalTime===null) return;
  byId('goalModal').classList.remove('open');
  byId('ownGoalOurName').textContent=state.ourTeam||'我方';
  byId('ownGoalOppName').textContent=state.oppTeam||'對手';
  byId('ownGoalOurAward').textContent=`${state.oppTeam||'對手'} +1`;
  byId('ownGoalOppAward').textContent=`${state.ourTeam||'我方'} +1`;
  byId('ownGoalTeamModal').classList.add('open');
}
function backFromOwnGoalTeam(){
  byId('ownGoalTeamModal').classList.remove('open');
  byId('goalModal').classList.add('open');
}
function chooseOwnGoalTeam(team){
  if(pendingGoalTime===null || !['OUR','OPP'].includes(team)) return;
  pendingOwnGoalTeam=team;              // 烏龍球員所屬球隊
  pendingGoalTeam=oppositeTeamCode(team); // 實際得分歸屬球隊
  byId('ownGoalTeamModal').classList.remove('open');
  openNumberSelection('GOAL', team, pendingGoalTime);
}
function cancelGoal(){
  pendingGoalTime=null;
  pendingGoalTeam=null;
  pendingOwnGoalTeam=null;
  byId('goalModal').classList.remove('open');
  byId('ownGoalTeamModal').classList.remove('open');
}
function openCardModal(){
  if(!state.started){ alert('請先按「開始比賽」'); return; }
  if(state.finished){ alert('本場比賽已結束'); return; }
  if(state.awaitingNextPeriod || state.penalty?.active){ return; }
  pendingCardTime=elapsed();
  pendingCardEvent=null;
  byId('cardModal').classList.add('open');
}
function setCardTeamTitle(event){
  const titleCard=byId('cardTeamTitleCard');
  const titleText=byId('cardTeamTitleText');

  if(titleCard){
    titleCard.className='numberTitleCard show';
    titleCard.classList.add(event==='YELLOW_CARD'?'yellow':'red');
  }
  if(titleText){
    titleText.textContent=event==='YELLOW_CARD'
      ? '黃牌｜選擇球隊'
      : '紅牌｜選擇球隊';
  }
}

function openDirectCardEvent(event){
  if(!['YELLOW_CARD','RED_CARD'].includes(event)) return;
  if(!state.started){ alert('請先按「開始比賽」'); return; }
  if(state.finished){ alert('本場比賽已結束'); return; }
  if(state.awaitingNextPeriod || state.penalty?.active){ return; }
  pendingCardTime=elapsed();
  pendingCardEvent=event;
  byId('cardOurName').textContent=state.ourTeam||'我方';
  byId('cardOppName').textContent=state.oppTeam||'對手';
  setCardTeamTitle(event);
  byId('cardTeamModal').classList.add('open');
}
function chooseCardType(event){
  if(!['YELLOW_CARD','RED_CARD'].includes(event)) return;
  pendingCardEvent=event;
  byId('cardModal').classList.remove('open');
  byId('cardOurName').textContent=state.ourTeam||'我方';
  byId('cardOppName').textContent=state.oppTeam||'對手';
  setCardTeamTitle(event);
  byId('cardTeamModal').classList.add('open');
}
function chooseCardTeam(team){
  if(!pendingCardEvent || pendingCardTime===null) return;
  const event=pendingCardEvent;
  const sec=pendingCardTime;
  byId('cardTeamModal').classList.remove('open');
  pendingCardEvent=null;
  pendingCardTime=null;
  openNumberSelection(event, team, sec);
}
function cancelCard(){
  pendingCardEvent=null;
  pendingCardTime=null;
  byId('cardModal').classList.remove('open');
  byId('cardTeamModal').classList.remove('open');
}


let undoMarkerState=null;
let undoMarkerTimer=null;

function markerUndoText(marker){
  if(!marker) return '已記錄事件';
  const team=teamDisplay(marker.team)||'';
  const num=marker.player_number ? ` #${marker.player_number}` : '';
  const label=marker.second_yellow ? '紅牌（兩黃）' : eventLabel(marker.event);
  return `✓ 已記錄　${emoji(marker.event)} ${label}${team?` · ${team}${num}`:''}`;
}

function showMarkerUndo(index){
  const marker=state.markers[index];
  const bar=byId('undoSnackbar');
  const txt=byId('undoSnackbarText');
  if(!marker || !bar || !txt) return;

  undoMarkerState={
    index,
    recorded_at:marker.recorded_at||'',
    event:marker.event
  };
  txt.textContent=markerUndoText(marker);

  if(undoMarkerTimer) clearTimeout(undoMarkerTimer);
  bar.classList.add('show');
  undoMarkerTimer=setTimeout(()=>hideMarkerUndo(),3200);
}

function hideMarkerUndo(){
  const bar=byId('undoSnackbar');
  if(bar) bar.classList.remove('show');
  if(undoMarkerTimer){
    clearTimeout(undoMarkerTimer);
    undoMarkerTimer=null;
  }
  setTimeout(()=>{ undoMarkerState=null; },180);
}

function undoLastMarker(){
  if(!undoMarkerState) return;
  const {index,recorded_at,event}=undoMarkerState;
  if((state.penalty?.active || state.penalty?.completed) && event==='GOAL'){
    alert('已進入 PK，正規賽比分已鎖定；進球紀錄不可再復原。');
    hideMarkerUndo();
    return;
  }
  const marker=state.markers[index];

  if(!marker || marker.event!==event || (recorded_at && marker.recorded_at!==recorded_at)){
    hideMarkerUndo();
    return;
  }

  let dOur=0,dOpp=0;
  if(marker.event==='GOAL'){
    if(marker.team==='OUR') dOur=-1;
    if(marker.team==='OPP') dOpp=-1;
  }

  state.markers.splice(index,1);
  if(marker.event==='RED_CARD' && marker.keeper_before_red && !state.goalkeeperNumber){
    state.goalkeeperNumber=String(marker.keeper_before_red);
    closeKeeperModal();
  }
  if(dOur || dOpp){
    state.ourScore=Math.max(0,state.ourScore+dOur);
    state.oppScore=Math.max(0,state.oppScore+dOpp);
    adjustScoreSnapshotsFrom(index,dOur,dOpp);
  }

  pendingAssistMarkerIndex=null;
  byId('assistModal')?.classList.remove('open');
  saveState();
  render();
  if(byId('logModal')?.classList.contains('open')) renderLogModal();
  hideMarkerUndo();
}

function buildAssistGrid(){
  const grid=byId('assistPlayerGrid');
  if(!grid) return;
  grid.innerHTML='';

  const marker=(pendingAssistMarkerIndex!==null) ? state.markers[pendingAssistMarkerIndex] : null;
  const scorer=String(marker?.player_number||'');
  const eligible=eligibleOurPlayerNumbers({
    excludeNumber:scorer,
    beforeIndex:pendingAssistMarkerIndex
  });

  renderPlayerPickerSource('assistSourceLabel','assistSourceBadge',eligible.length);

  eligible.forEach(n=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='playerPickerBtn';
    btn.textContent=n;
    btn.setAttribute('aria-label',`選擇背號 ${n} 為助攻球員`);
    btn.onclick=()=>saveAssistNumber(String(n));
    grid.appendChild(btn);
  });

  const empty=byId('assistEmpty');
  if(empty) empty.hidden=eligible.length>0;
}
function openAssistModal(markerIndex){
  const marker=state.markers[markerIndex];
  if(!marker || marker.event!=='GOAL') return;

  // 對手進球不再要求助攻資訊。
  // 場邊較難即時辨識對手助攻者，直接完成進球紀錄可減少操作負擔。
  if(marker.team!=='OUR'){
    pendingAssistMarkerIndex=null;
    return;
  }

  pendingAssistMarkerIndex=markerIndex;

  const scorer=marker.player_number ? `#${marker.player_number}` : '未填背號';
  byId('assistGoalInfo').textContent=`進球者　${scorer}`;

  const isOur=marker.team==='OUR';
  byId('assistOurArea').style.display=isOur?'block':'none';
  byId('assistOppArea').style.display=isOur?'none':'block';
  byId('assistCustomRow').classList.remove('open');
  byId('assistCustomNumber').value='';
  if(isOur) buildAssistGrid();

  byId('assistModal').classList.add('open');
}
function showAssistCustom(){
  byId('assistCustomRow').classList.add('open');
  setTimeout(()=>byId('assistCustomNumber').focus(),50);
}
function validateAssistNumber(marker, raw){
  const value=String(raw||'').trim();
  if(value==='') return '';
  const n=Number(value);
  if(!Number.isInteger(n) || n<1 || n>99){
    alert('助攻球員背號請輸入 1～99 的整數，或略過助攻');
    return null;
  }
  if(marker?.player_number && String(marker.player_number)===String(n)){
    alert('助攻球員不能與進球球員為同一背號');
    return null;
  }
  if(marker?.team && isRedCardedPlayer(marker.team,String(n),pendingAssistMarkerIndex)){
    alert(`#${n} 已領紅牌退場，不能再列為助攻球員。`);
    return null;
  }
  return String(n);
}
function saveAssistNumber(number){
  if(pendingAssistMarkerIndex===null) return;
  const marker=state.markers[pendingAssistMarkerIndex];
  if(!marker || marker.event!=='GOAL') return;
  const valid=validateAssistNumber(marker,number);
  if(valid===null) return;

  marker.assist_number=valid;
  if(marker.team==='OUR' && valid){
    rememberPlayerNumber(valid);
    buildNumberGrid();
  }
  const completedMarkerIndex=pendingAssistMarkerIndex;
  saveState();
  render();
  pendingAssistMarkerIndex=null;
  byId('assistModal').classList.remove('open');
  showMarkerUndo(completedMarkerIndex);
}
function saveAssistCustom(){
  const el=byId('assistCustomNumber');
  if(!el) return;
  el.value=String(el.value||'').replace(/\D/g,'').slice(0,2);
  saveAssistNumber(el.value);
}
function skipAssist(){
  const completedMarkerIndex=pendingAssistMarkerIndex;
  if(pendingAssistMarkerIndex!==null){
    const marker=state.markers[pendingAssistMarkerIndex];
    if(marker && marker.event==='GOAL' && !('assist_number' in marker)) marker.assist_number='';
  }
  pendingAssistMarkerIndex=null;
  byId('assistModal').classList.remove('open');
  saveState();
  render();
  if(completedMarkerIndex!==null) showMarkerUndo(completedMarkerIndex);
}

function openNumberSelection(event, team, sec){
  pendingNumberEvent=event;
  pendingNumberTeam=team;
  pendingNumberTime=sec;

  byId('customRow').classList.remove('open');
  byId('customNumber').value='';

  const isOur=team==='OUR';
  byId('ourNumberArea').style.display=isOur?'block':'none';
  byId('oppNumberArea').style.display=isOur?'none':'block';
  const sourceRow=byId('numberSourceRow');
  if(sourceRow) sourceRow.style.display=isOur?'flex':'none';

  const label=eventLabel(event);
  const titleCard=byId('numberTitleCard');
  const titleText=byId('numberTitleText');
  if(titleCard){
    titleCard.className='numberTitleCard';
    if(event==='YELLOW_CARD') titleCard.classList.add('show','yellow');
    if(event==='RED_CARD') titleCard.classList.add('show','red');
  }
  const numberModalEl=byId('numberModal');
  if(numberModalEl){
    numberModalEl.classList.remove('cardFlow','yellowFlow','redFlow');
    if(event==='YELLOW_CARD') numberModalEl.classList.add('cardFlow','yellowFlow');
    if(event==='RED_CARD') numberModalEl.classList.add('cardFlow','redFlow');
  }
  if(event==='GOAL'){
    if(pendingOwnGoalTeam){
      if(titleText) titleText.textContent='↩ 選擇烏龍球員背號';
      byId('numberHint').textContent=isOur
        ? (currentRosterNumbers().length?'選填：從本場名單選擇烏龍球員；比分會加給對手。':'選填：可輸入烏龍球員背號；比分會加給對手。')
        : '選填：記錄對手烏龍球員背號；看不清楚可直接略過。';
    }else{
      if(titleText) titleText.textContent=isOur?'選擇進球球員背號':'選擇對手進球背號';
      byId('numberHint').textContent=isOur?(currentRosterNumbers().length?'選填：優先顯示本場球員名單；也可輸入其他背號。':'選填：可直接點常用背號；其他背號輸入一次後會自動加入。'):'選填：記錄對手進球球員背號；若看不清楚可直接略過。';
    }
  }else if(event==='YELLOW_CARD' || event==='RED_CARD'){
    if(titleText) titleText.textContent=`${label}｜選擇球員`;
    byId('numberHint').textContent=isOur
      ? '球員背號為選填，可直接略過。'
      : '對手球員背號為選填，可直接略過。';
  }else if(event==='SHOT'){
    if(titleText) titleText.textContent='🥅 選擇射門球員背號';
    byId('numberHint').textContent='射門球員背號為選填，可直接略過。';
  }else if(event==='DEFENSE'){
    if(titleText) titleText.textContent='🛡️ 選擇防守球員背號';
    byId('numberHint').textContent='防守球員背號為選填，可直接略過。';
  }else{
    if(titleText) titleText.textContent=`選擇${label}球員背號`;
    byId('numberHint').textContent=currentRosterNumbers().length?'球員背號為選填，可直接略過。':'選填：可直接點常用背號；其他背號輸入一次後會自動加入。';
  }

  const cancelBtn=byId('cancelNumberBtn');
  if(cancelBtn) cancelBtn.textContent=`取消這筆${label}`;

  buildNumberGrid();
  byId('numberModal').classList.add('open');
}

function chooseGoalTeam(team){
  pendingOwnGoalTeam=null;
  pendingGoalTeam=team;
  byId('goalModal').classList.remove('open');
  openNumberSelection('GOAL', team, pendingGoalTime);
}

function openPlayerEvent(event){
  if(!state.started){ alert('請先按「開始比賽」'); return; }
  if(state.finished){ alert('本場比賽已結束'); return; }

  // 撲救是高頻事件：若已設定目前守門員，直接完成紀錄，不再重複詢問背號。
  if(event==='SAVE' && state.goalkeeperNumber){
    const gk=Number(state.goalkeeperNumber);
    if(Number.isInteger(gk) && gk>=1 && gk<=99){
      pendingNumberEvent='SAVE';
      pendingNumberTeam='OUR';
      pendingNumberTime=elapsed();
      finishNumberSelection(String(gk));
      return;
    }
  }

  // 未設定守門員時，完整保留原本選背號流程。
  openNumberSelection(event, 'OUR', elapsed());
}

function showCustomNumber(){
  byId('customRow').classList.add('open');
  setTimeout(()=>byId('customNumber').focus(), 50);
}

function saveCustomNumber(){
  const n=validateIntegerField('customNumber','球員背號',1,99,false);
  if(n===undefined) return;

  // 只有我方球員的手動背號才自動學習，避免把對手背號加入自己的常用名單。
  if(pendingNumberTeam==='OUR'){
    rememberPlayerNumber(n);
    buildNumberGrid();
  }

  finishNumberSelection(String(n));
}

function resetPendingNumber(){
  pendingNumberEvent=null;
  pendingNumberTeam=null;
  pendingNumberTime=null;
}

function cancelNumber(){
  if(pendingNumberEvent==='GOAL'){
    pendingGoalTime=null;
    pendingGoalTeam=null;
    pendingOwnGoalTeam=null;
  }
  resetPendingNumber();
  byId('numberModal').classList.remove('open');
}

function finishNumberSelection(playerNumber){
  if(!pendingNumberEvent || pendingNumberTime===null) return;

  if(playerNumber && !canPlayerParticipateAfterRed(pendingNumberTeam||'OUR',playerNumber,pendingNumberEvent)) return;

  if(pendingNumberEvent==='GOAL'){
    finishGoal(playerNumber);
    return;
  }

  const recordedTeam=pendingNumberTeam||'OUR';
  const requestedEvent=pendingNumberEvent;
  const secondYellow=
    requestedEvent==='YELLOW_CARD' &&
    !!playerNumber &&
    isSecondYellowCard(recordedTeam,playerNumber);
  const recordedEvent=secondYellow ? 'RED_CARD' : requestedEvent;
  const keeperBefore=String(state.goalkeeperNumber||'');
  const keeperSentOff=
    recordedEvent==='RED_CARD' &&
    recordedTeam==='OUR' &&
    !!playerNumber &&
    !!keeperBefore &&
    String(playerNumber)===keeperBefore;

  state.markers.push({
    event:recordedEvent,
    team:recordedTeam,
    period:state.currentPeriod||1,
    period_label:state.multiPeriod ? periodLabel(state.currentPeriod||1) : '',
    player_number:playerNumber,
    seconds:pendingNumberTime,
    time:fmtMMSS(pendingNumberTime),
    score_after:`${state.ourScore}:${state.oppScore}`,
    recorded_at:new Date().toISOString(),
    ...(secondYellow?{second_yellow:true}:{}),
    ...(keeperSentOff?{keeper_before_red:keeperBefore}:{})
  });

  if(keeperSentOff){
    state.goalkeeperNumber='';
  }

  resetPendingNumber();
  byId('numberModal').classList.remove('open');
  saveState();
  render();
  const markerIndex=state.markers.length-1;
  showMarkerUndo(markerIndex);

  if(keeperSentOff){
    setTimeout(()=>openKeeperModal({mode:'RED_CARD_REPLACEMENT',redCardNumber:playerNumber}),100);
  }
}

function finishGoal(playerNumber){
  if(pendingGoalTime===null || !pendingGoalTeam) return;
  const isOwnGoal=!!pendingOwnGoalTeam;
  const ownGoalTeam=isOwnGoal ? pendingOwnGoalTeam : '';

  if(pendingGoalTeam==='OUR'){
    if(state.ourScore>=99){
      alert('我方比分已達上限 99，無法再增加');
      return;
    }
    state.ourScore += 1;
  }else{
    if(state.oppScore>=99){
      alert('對手比分已達上限 99，無法再增加');
      return;
    }
    state.oppScore += 1;
  }

  state.markers.push({
    event:'GOAL',
    period:state.currentPeriod||1,
    period_label:state.multiPeriod ? periodLabel(state.currentPeriod||1) : '',
    team:pendingGoalTeam,                 // 比分歸屬球隊
    player_number:playerNumber,           // 烏龍球時為犯下烏龍的球員
    assist_number:'',
    ...(isOwnGoal?{own_goal:true,own_goal_team:ownGoalTeam}:{}),
    seconds:pendingGoalTime,
    time:fmtMMSS(pendingGoalTime),
    score_after:`${state.ourScore}:${state.oppScore}`,
    recorded_at:new Date().toISOString()
  });
  const goalMarkerIndex=state.markers.length-1;

  pendingGoalTime=null;
  pendingGoalTeam=null;
  pendingOwnGoalTeam=null;
  resetPendingNumber();
  byId('numberModal').classList.remove('open');
  saveState();
  render();

  // 烏龍球沒有助攻；一般我方進球才詢問助攻。
  const savedGoal=state.markers[goalMarkerIndex];
  if(savedGoal?.team==='OUR' && !savedGoal?.own_goal){
    setTimeout(()=>openAssistModal(goalMarkerIndex),80);
  }else{
    showMarkerUndo(goalMarkerIndex);
  }
}

function mark(event, team='OUR'){
  if(!state.started){ alert('請先按「開始比賽」'); return; }
  if(state.finished){ alert('本場比賽已結束'); return; }
  const sec=elapsed();
  state.markers.push({
    event, team,
    period:state.currentPeriod||1,
    period_label:state.multiPeriod ? periodLabel(state.currentPeriod||1) : '',
    player_number:'',
    seconds:sec,
    time:fmtMMSS(sec),
    score_after:`${state.ourScore}:${state.oppScore}`,
    recorded_at:new Date().toISOString()
  });
  saveState();
  render();
  showMarkerUndo(state.markers.length-1);
}
function parseScorePair(value){
  const m=String(value||'').match(/^(\d+)\s*:\s*(\d+)$/);
  return m ? [Number(m[1]),Number(m[2])] : null;
}

function adjustScoreSnapshotsFrom(startIndex,dOur,dOpp){
  if(!dOur && !dOpp) return;
  for(let i=startIndex;i<state.markers.length;i++){
    const pair=parseScorePair(state.markers[i].score_after);
    if(!pair) continue;
    state.markers[i].score_after=`${Math.max(0,pair[0]+dOur)}:${Math.max(0,pair[1]+dOpp)}`;
  }
}

function setEditMarkerEvent(event){
  editingMarkerEvent=event;
  ['GOAL','SAVE','SHOT','DEFENSE','YELLOW_CARD','RED_CARD'].forEach(ev=>{
    byId('editEvent'+ev)?.classList.toggle('active',ev===event);
  });
  byId('editNumberSection').style.display='block';
  byId('editGoalTypeSection').style.display=event==='GOAL'?'block':'none';
  if(event!=='GOAL') editingMarkerOwnGoal=false;
  syncEditGoalTypeUI();
}
function syncEditGoalTypeUI(){
  byId('editGoalTypeNormal')?.classList.toggle('active',!editingMarkerOwnGoal);
  byId('editGoalTypeOwn')?.classList.toggle('active',editingMarkerOwnGoal);
  const teamLabel=byId('editTeamSectionLabel');
  if(teamLabel) teamLabel.textContent=(editingMarkerEvent==='GOAL' && editingMarkerOwnGoal)
    ? '烏龍球員所屬球隊'
    : '球隊';
  byId('editAssistSection').style.display=
    (editingMarkerEvent==='GOAL' && !editingMarkerOwnGoal)?'block':'none';
}
function setEditGoalType(isOwnGoal){
  if(editingMarkerEvent!=='GOAL') return;
  editingMarkerOwnGoal=!!isOwnGoal;
  if(editingMarkerOwnGoal) byId('editAssistNumber').value='';
  syncEditGoalTypeUI();
}
function setEditMarkerTeam(team){
  editingMarkerTeam=team;
  ['OUR','OPP'].forEach(code=>{
    byId('editTeam'+code)?.classList.toggle('active',code===team);
  });
}

function openEditMarker(index){
  const marker=state.markers[index];
  if(!marker) return;
  editingMarkerIndex=index;
  editingMarkerEvent=marker.event;
  editingMarkerOwnGoal=Boolean(marker.event==='GOAL' && marker.own_goal);
  editingMarkerTeam=editingMarkerOwnGoal
    ? (marker.own_goal_team || oppositeTeamCode(marker.team) || 'OUR')
    : (marker.team||'OUR');

  byId('editTeamOUR').textContent=state.ourTeam||'我方';
  byId('editTeamOPP').textContent=state.oppTeam||'對手';
  byId('editMarkerNumber').value=marker.player_number||'';
  byId('editAssistNumber').value=marker.assist_number||'';
  byId('editMarkerTime').textContent=fmtMMSS(marker.seconds);

  setEditMarkerEvent(editingMarkerEvent);
  setEditMarkerTeam(editingMarkerTeam);

  syncVisualViewport();
  byId('editMarkerModal').classList.add('open');
  const editBody=byId('editMarkerModal').querySelector('.editMarkerBody');
  if(editBody) editBody.scrollTop=0;
  const numInput=byId('editMarkerNumber');
  if(numInput){
    numInput.onfocus=()=>setTimeout(()=>numInput.scrollIntoView({block:'center',behavior:'smooth'}),120);
  }
}

function closeEditMarker(){
  byId('editMarkerModal').classList.remove('open');
  editingMarkerIndex=null;
  editingMarkerEvent=null;
  editingMarkerTeam='OUR';
  editingMarkerOwnGoal=false;
}

function saveEditMarker(){
  if(editingMarkerIndex===null) return;
  const marker=state.markers[editingMarkerIndex];
  if(!marker || !editingMarkerEvent) return;

  let playerNumber='';
  if(true){
    const raw=String(byId('editMarkerNumber').value||'').trim();
    if(raw){
      const n=Number(raw);
      if(!Number.isInteger(n) || n<1 || n>99){
        alert('球員背號請輸入 1～99 的整數，或留空');
        return;
      }
      playerNumber=String(n);
    }
  }

  if(playerNumber && !canPlayerParticipateAfterRed(editingMarkerTeam,playerNumber,editingMarkerEvent,editingMarkerIndex)) return;

  const editSecondYellow=
    editingMarkerEvent==='YELLOW_CARD' &&
    !!playerNumber &&
    isSecondYellowCard(editingMarkerTeam,playerNumber,editingMarkerIndex);
  if(editSecondYellow){
    editingMarkerEvent='RED_CARD';
  }

  if(
    editingMarkerEvent==='RED_CARD' &&
    playerNumber &&
    hasOtherRedCardForPlayer(editingMarkerTeam,playerNumber,editingMarkerIndex)
  ){
    alert(`#${playerNumber} 已有紅牌退場紀錄，不能再新增第二張紅牌。`);
    return;
  }

  let assistNumber='';
  if(editingMarkerEvent==='GOAL' && !editingMarkerOwnGoal){
    const rawAssist=String(byId('editAssistNumber').value||'').trim();
    if(rawAssist){
      const a=Number(rawAssist);
      if(!Number.isInteger(a) || a<1 || a>99){
        alert('助攻球員背號請輸入 1～99 的整數，或留空');
        return;
      }
      assistNumber=String(a);
      if(playerNumber && assistNumber===playerNumber){
        alert('助攻球員不能與進球球員為同一背號');
        return;
      }
      if(editingMarkerTeam && isRedCardedPlayer(editingMarkerTeam,assistNumber,editingMarkerIndex)){
        alert(`#${assistNumber} 在此進球之前已領紅牌退場，不能列為助攻球員。`);
        return;
      }
    }
  }

  // 依「舊事件 → 新事件」計算對比分的淨影響。
  // 烏龍球的 editingMarkerTeam 是「烏龍球員所屬球隊」，
  // 實際比分要加給相反球隊。
  const editedScoreTeam=(editingMarkerEvent==='GOAL' && editingMarkerOwnGoal)
    ? oppositeTeamCode(editingMarkerTeam)
    : editingMarkerTeam;
  let dOur=0,dOpp=0;
  if(marker.event==='GOAL'){
    if(marker.team==='OUR') dOur-=1;
    if(marker.team==='OPP') dOpp-=1;
  }
  if(editingMarkerEvent==='GOAL'){
    if(editedScoreTeam==='OUR') dOur+=1;
    if(editedScoreTeam==='OPP') dOpp+=1;
  }

  const nextOur=state.ourScore+dOur;
  const nextOpp=state.oppScore+dOpp;
  if((state.penalty?.active || state.penalty?.completed) && (dOur || dOpp)){
    alert('已進入 PK，正規賽比分已鎖定；不可再透過事件編輯改變比分。');
    return;
  }
  if(nextOur<0 || nextOpp<0){
    alert('目前比分與事件紀錄不一致，無法自動調整。請先確認比分。');
    return;
  }
  if(nextOur>99 || nextOpp>99){
    alert('修改後比分會超過 99，請先確認比分。');
    return;
  }

  const keeperBeforeFromOldRed=
    marker.event==='RED_CARD' && marker.team==='OUR' && marker.keeper_before_red
      ? String(marker.keeper_before_red)
      : '';
  const sameKeeperRedPersists=
    !!keeperBeforeFromOldRed &&
    editingMarkerEvent==='RED_CARD' &&
    editingMarkerTeam==='OUR' &&
    String(playerNumber||'')===keeperBeforeFromOldRed;

  // 若原本這筆就是守門員紅牌，但現在改成別的事件／球員，且尚未指定新守門員，先恢復原守門員。
  if(keeperBeforeFromOldRed && !sameKeeperRedPersists && !state.goalkeeperNumber){
    state.goalkeeperNumber=keeperBeforeFromOldRed;
  }

  const keeperBeforeEdit=String(state.goalkeeperNumber||'');
  const keeperSentOffByEdit=
    !sameKeeperRedPersists &&
    editingMarkerEvent==='RED_CARD' &&
    editingMarkerTeam==='OUR' &&
    !!playerNumber &&
    !!keeperBeforeEdit &&
    String(playerNumber)===keeperBeforeEdit;

  marker.event=editingMarkerEvent;
  marker.team=(editingMarkerEvent==='GOAL') ? editedScoreTeam : editingMarkerTeam;
  marker.player_number=playerNumber;
  marker.assist_number=(editingMarkerEvent==='GOAL' && !editingMarkerOwnGoal)?assistNumber:'';
  if(editingMarkerEvent==='GOAL' && editingMarkerOwnGoal){
    marker.own_goal=true;
    marker.own_goal_team=editingMarkerTeam;
  }else{
    delete marker.own_goal;
    delete marker.own_goal_team;
  }
  if(editSecondYellow){
    marker.second_yellow=true;
  }else if(!(marker.second_yellow && editingMarkerEvent==='RED_CARD')){
    delete marker.second_yellow;
  }
  if(keeperSentOffByEdit){
    marker.keeper_before_red=keeperBeforeEdit;
    state.goalkeeperNumber='';
  }else if(sameKeeperRedPersists){
    marker.keeper_before_red=keeperBeforeFromOldRed;
  }else{
    delete marker.keeper_before_red;
  }

  // 時間 seconds / time / recorded_at 完全保留。
  if(editingMarkerTeam==='OUR' && marker.player_number){
    rememberPlayerNumber(marker.player_number);
    buildNumberGrid();
  }
  if(marker.team==='OUR' && marker.assist_number){
    rememberPlayerNumber(marker.assist_number);
    buildNumberGrid();
  }

  state.ourScore=nextOur;
  state.oppScore=nextOpp;
  adjustScoreSnapshotsFrom(editingMarkerIndex,dOur,dOpp);

  // 若把較早事件改成紅牌，清除該球員之後才出現的無效助攻紀錄。
  sanitizeInvalidAssistsAfterRed();

  saveState();
  render();
  renderLogModal();
  closeEditMarker();
  if(keeperSentOffByEdit){
    setTimeout(()=>openKeeperModal({mode:'RED_CARD_REPLACEMENT',redCardNumber:playerNumber}),100);
  }
}

function deleteMarker(i){
  hideMarkerUndo();
  const m=state.markers[i];
  if(!m) return false;
  if((state.penalty?.active || state.penalty?.completed) && m?.event==='GOAL'){
    alert('已進入 PK，正規賽比分已鎖定；進球紀錄不可再刪除。');
    return false;
  }
  const label=markerEventLabel(m);
  const ok=window.confirm(`確定要刪除第${i+1}筆「${label}」紀錄嗎？
刪除後無法復原。`);
  if(!ok) return false;
  state.markers.splice(i,1);
  if(m.event==='RED_CARD' && m.keeper_before_red && !state.goalkeeperNumber){
    state.goalkeeperNumber=String(m.keeper_before_red);
    closeKeeperModal();
  }
  if(m.event==='GOAL'){
    if(m.team==='OUR') state.ourScore=Math.max(0, state.ourScore-1);
    if(m.team==='OPP') state.oppScore=Math.max(0, state.oppScore-1);
  }
  saveState();
  render();
  renderLogModal();
  return true;
}
function toggleLog(){ byId('logWrap').classList.toggle('open'); }

function openScoreModal(){
  const isScoreReviewBreak=
    !!state.awaitingNextPeriod &&
    (state.nextPeriodType==='SECOND_HALF' || state.nextPeriodType==='EXTRA_TIME') &&
    !state.penalty?.active;

  const isFullTime=!!state.finished;
  const isCombinedReview=!!isFullTime || !!isScoreReviewBreak;
  const pkScoreLocked=!!(state.penalty?.active || state.penalty?.completed);

  // PK 進行中不開放；PK 已完成的全場仍可修改隊名，但比分維持鎖定。
  if(state.penalty?.active && !isFullTime){
    return;
  }

  if(!isCombinedReview){
    return;
  }

  const teamFields=byId('resultScoreTeamFields');
  const title=byId('scoreModalTitle');
  const hint=byId('scoreModalHint');
  const lockNote=byId('scoreLockedNote');
  const editOur=byId('editOur');
  const editOpp=byId('editOpp');

  if(teamFields) teamFields.hidden=!isCombinedReview;

  if(isCombinedReview){
    if(title) title.textContent='編輯比分／隊名';
    if(hint){
      hint.textContent=isFullTime
        ? '集中修正全場比分與雙方隊名；既有事件紀錄與事件時間不會被刪除。'
        : '集中修正目前比分與雙方隊名；既有事件紀錄與事件時間不會被刪除。';
    }
    byId('editOurTeamName').value=state.ourTeam||'';
    byId('editOppTeamName').value=state.oppTeam||'';
  }

  editOur.value=state.ourScore;
  editOpp.value=state.oppScore;
  byId('scoreOurName').textContent=state.ourTeam||'我方';
  byId('scoreOppName').textContent=state.oppTeam||'對手';

  const lockScore=isFullTime && pkScoreLocked;
  editOur.disabled=lockScore;
  editOpp.disabled=lockScore;
  if(lockNote) lockNote.hidden=!lockScore;

  byId('scoreModal').classList.add('open');
}
function closeScoreModal(){
  byId('scoreModal').classList.remove('open');
  byId('editOur').disabled=false;
  byId('editOpp').disabled=false;
}
function saveScoreModal(){
  const isFullTime=!!state.finished;
  const isScoreReviewBreak=
    !!state.awaitingNextPeriod &&
    (state.nextPeriodType==='SECOND_HALF' || state.nextPeriodType==='EXTRA_TIME') &&
    !state.penalty?.active;
  const isCombinedReview=!!isFullTime || !!isScoreReviewBreak;
  const pkScoreLocked=!!(state.penalty?.active || state.penalty?.completed);

  if(state.penalty?.active && !isFullTime){
    closeScoreModal();
    return;
  }

  if(isCombinedReview){
    const ourName=String(byId('editOurTeamName').value||'').trim();
    const oppName=String(byId('editOppTeamName').value||'').trim();

    if(!validateTeamNameValue(ourName,'我方隊伍名稱',false)) return;
    if(!validateTeamNameValue(oppName,'對手隊伍名稱',false)) return;

    // saveState() 會從主畫面 input 讀值，因此先同步兩個來源。
    byId('ourTeam').value=ourName;
    byId('oppTeam').value=oppName;
    state.ourTeam=ourName;
    state.oppTeam=oppName;
  }

  if(!pkScoreLocked){
    const our=validateIntegerField('editOur','我方比分',0,99,false);
    if(our===undefined) return;
    const opp=validateIntegerField('editOpp','對手比分',0,99,false);
    if(opp===undefined) return;

    state.ourScore=our;
    state.oppScore=opp;
  }

  closeScoreModal();
  saveState();
  render();
}

let currentLogFilter=null;


let managingMarkerIndex=null;
let managingMarkerShownSeq=null;

function markerManageSummaryText(marker,shownSeq){
  if(!marker) return '';
  const parts=[];
  parts.push(`第${shownSeq||''}筆`);
  if(state.multiPeriod) parts.push(periodLabel(marker.period||1));
  parts.push(fmtMMSS(marker.seconds||0));

  const label=markerEventLabel(marker);
  const player=marker.player_number?`#${marker.player_number}`:'';
  const team=markerPlayerTeamDisplay(marker);

  let eventText=[eventIcon(marker.event),player,label].filter(Boolean).join(' ');
  if(marker.event==='GOAL' && marker.score_after){
    eventText+=` · ${marker.score_after}`;
  }
  parts.push(eventText);
  parts.push(team);
  return parts.filter(Boolean).join(' · ');
}

function openMarkerManage(index,shownSeq){
  const marker=state.markers[index];
  if(!marker) return;

  managingMarkerIndex=index;
  managingMarkerShownSeq=shownSeq;

  const summary=byId('markerManageSummary');
  if(summary) summary.textContent=markerManageSummaryText(marker,shownSeq);

  syncVisualViewport();
  byId('markerManageModal')?.classList.add('open');
}

function closeMarkerManage(){
  byId('markerManageModal')?.classList.remove('open');
  managingMarkerIndex=null;
  managingMarkerShownSeq=null;
}

function editManagedMarker(){
  const index=managingMarkerIndex;
  if(index===null || !state.markers[index]) return;
  closeMarkerManage();
  openEditMarker(index);
}

function deleteManagedMarker(){
  const index=managingMarkerIndex;
  if(index===null || !state.markers[index]) return;
  const deleted=deleteMarker(index);
  if(deleted) closeMarkerManage();
}


function renderLogTo(container, filterEvent=null){
  if(!container) return;
  container.innerHTML='';

  const readOnlyDetail=Boolean(filterEvent);
  let shownSeq=0;

  state.markers.forEach((m,i)=>{
    if(filterEvent && m.event!==filterEvent) return;
    shownSeq++;

    const row=document.createElement('div');
    const eventKey=String(m.event||'event').toLowerCase().replace(/[^a-z0-9_-]/g,'');
    const criticalClass=['GOAL','RED_CARD'].includes(m.event) ? ' logEvent-critical' : '';
    row.className=readOnlyDetail
      ? 'item quickDetailItem'
      : `item logTimelineItem logEvent-${eventKey}${criticalClass}`;

    const team=markerPlayerTeamDisplay(m);
    const safeTeam=team ? escapeHtml(team) : '';
    const num=m.player_number?`<span class="numberTag">#${escapeHtml(String(m.player_number))}</span>`:'';
    const assist=(m.event==='GOAL' && m.assist_number)
      ? `<span class="logAssistTag">助攻 #${escapeHtml(String(m.assist_number))}</span>`
      : '';
    const label=markerEventLabel(m);
    const period=state.multiPeriod?periodLabel(m.period||1):'';
    const score=m.score_after||'';
    const prevMarker=i>0 ? state.markers[i-1] : null;
    const showScore=shouldShowLogScore(m, prevMarker);
    const scoreBlock=showScore && m.event!=='GOAL'
      ? `<div class="scoreSnap">${escapeHtml(score)}</div>`
      : `<div class="scoreSnap scoreSnapEmpty" aria-hidden="true"></div>`;

    // v4.93：進球比分跟事件本身屬於同一組資訊，
    // 放在原本「關鍵事件」標籤的位置；右側只保留維護操作。
    const goalScoreInline=(m.event==='GOAL' && score)
      ? `<span class="goalScoreInline" aria-label="進球後比分 ${escapeHtml(score)}">${escapeHtml(score)}</span>`
      : '';

    // 本場事件統計 drill-down 維持原本唯讀列表，不放編輯 / 刪除。
    if(readOnlyDetail){
      const playerText=m.player_number?'#'+escapeHtml(String(m.player_number)):'—';
      const isOwnGoal=Boolean(m.event==='GOAL' && m.own_goal);
      const ownGoalScoreTeam=isOwnGoal ? (teamDisplay(m.team)||'對方') : '';
      const extraText=isOwnGoal
        ? `<span class="qdExtra qdOwnGoal" title="比分計入${escapeHtml(ownGoalScoreTeam)}">烏龍球</span>`
        : (assist
          ? `<span class="qdExtra">助攻 #${escapeHtml(String(m.assist_number))}</span>`
          : (showScore && m.event!=='GOAL' && score
            ? `<span class="qdExtra qdScore">${escapeHtml(score)}</span>`
            : ''));
      const accessibleParts=[
        `第${shownSeq}筆`,fmtMMSS(m.seconds),period||'全場',team||'未指定球隊',
        m.player_number?`背號 ${m.player_number}`:'未填背號',
        isOwnGoal?'烏龍球':'',
        isOwnGoal?`比分計入${ownGoalScoreTeam}`:'',
        m.event==='GOAL' && !isOwnGoal && m.assist_number?`助攻 ${m.assist_number}`:''
      ].filter(Boolean).join('，');
      row.innerHTML=`
        <span class="qdSeq">第${shownSeq}筆</span>
        <span class="qdTime">${fmtMMSS(m.seconds)}</span>
        <span class="qdPeriod">${escapeHtml(period||'全場')}</span>
        <span class="qdTeam${isOwnGoal?' qdTeamOwnGoal':''}" title="${safeTeam||'未指定球隊'}${isOwnGoal?'（烏龍）':''}">${safeTeam||'未指定球隊'}</span>
        <span class="qdPlayer">${playerText}</span>
        ${extraText}
      `;
      row.setAttribute('aria-label',accessibleParts);
      container.appendChild(row);
      return;
    }

    // v4.95 完整事件紀錄：固定最多兩列。
    // 第一列：時段 / 時間 / 球隊 / 球員背號。
    // 第二列：事件圖示 / 事件名稱 / 比分 / 助攻。
    // 閱讀邏輯：WHEN → WHO → WHAT。
    const teamInline=safeTeam
      ? `<span class="logTeamInline" title="${safeTeam}">${safeTeam}</span>`
      : `<span class="logTeamInline logEventTeamMuted">未指定球隊</span>`;

    const playerInline=m.player_number
      ? `<span class="logPlayerInline">#${escapeHtml(String(m.player_number))}</span>`
      : '';

    const nonGoalScoreInline=(showScore && m.event!=='GOAL' && score)
      ? `<span class="logScoreInline" aria-label="當下比分 ${escapeHtml(score)}">${escapeHtml(score)}</span>`
      : '';

    row.innerHTML=`
      <div class="logSeq" aria-label="第${shownSeq}筆">第${shownSeq}筆</div>

      <div class="logEventCore">
        <div class="logEventMeta">
          ${period?`<span class="periodBadge">${escapeHtml(period)}</span>`:''}
          <span class="time">${fmtMMSS(m.seconds)}</span>
          <span class="logActorInline">
            ${teamInline}
            ${playerInline}
          </span>
        </div>

        <div class="logEventPrimary">
          <span class="logEventIcon" aria-hidden="true">${eventIcon(m.event)}</span>
          <b>${escapeHtml(label)}</b>
          ${goalScoreInline}
          ${nonGoalScoreInline}
          ${assist}
        </div>
      </div>

      <div class="logRowSide">
        <div class="logRowActions">
          <button class="logManageBtn" onclick="openMarkerManage(${i},${shownSeq})" aria-label="管理第${shownSeq}筆事件紀錄"><span aria-hidden="true">•••</span></button>
        </div>
      </div>
    `;
    container.appendChild(row);
  });

  return shownSeq;
}

function renderLog(){
  renderLogTo(byId('log'));
}

function shouldShowLogScore(marker, prevMarker=null){
  if(!marker || !marker.score_after) return false;
  if(marker.event==='GOAL') return true;
  if(!prevMarker || !prevMarker.score_after) return false;
  return marker.score_after!==prevMarker.score_after;
}

function eventIcon(event){
  const icons={
    GOAL:'⚽',
    SHOT:'🥅',
    SAVE:'🧤',
    DEFENSE:'🛡️',
    YELLOW_CARD:'',
    RED_CARD:''
  };
  return icons[event] || '•';
}

function renderLogModal(){
  const list=byId('logModalList');
  const filteredCount=renderLogTo(list,currentLogFilter) || 0;

  byId('logModalCount').textContent=filteredCount;

  const title=byId('logModalTitle');
  if(title){
    title.innerHTML=currentLogFilter
      ? `<span class="logModalFilterEmoji" aria-hidden="true">${eventIcon(currentLogFilter)}</span><span class="logModalTitleText">${eventLabel(currentLogFilter)}細節</span>`
      : `<span class="uiLineIcon uiRecordIcon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M6.5 3.75h8l3 3v13.5h-11z"/><path d="M14.5 3.75v3h3"/><path d="M9 10.25h6M9 13.5h6M9 16.75h4.5"/></svg></span><span class="logModalTitleText">事件紀錄</span>`;
  }

  if(!filteredCount){
    const emptyLabel=currentLogFilter?eventLabel(currentLogFilter):'事件';
    const emptyIcon=currentLogFilter
      ? `<span aria-hidden="true">${eventIcon(currentLogFilter)}</span>`
      : `<span class="uiLineIcon uiRecordIcon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M6.5 3.75h8l3 3v13.5h-11z"/><path d="M14.5 3.75v3h3"/><path d="M9 10.25h6M9 13.5h6M9 16.75h4.5"/></svg></span>`;
    list.innerHTML=`<div class="quickResultEmpty"><div class="quickResultEmptyIcon">${emptyIcon}</div><div>尚無${emptyLabel}紀錄</div></div>`;
  }
}

function openLogModal(){
  if(!state.markers.length) return;
  currentLogFilter=null;
  syncVisualViewport();
  renderLogModal();
  document.body.style.overflow='hidden';
  const modal=byId('logModal');
  modal.classList.add('open');
  const body=modal.querySelector('.logModalBody');
  if(body) body.scrollTop=0;
}

function openQuickResultDetail(event){
  if(!['GOAL','SHOT','SAVE','DEFENSE'].includes(event)) return;

  const hasData=state.markers.some(m=>m.event===event);
  if(!hasData) return;

  const modal=byId('logModal');
  if(!modal) return;

  currentLogFilter=event;
  syncVisualViewport();
  renderLogModal();

  document.body.style.overflow='hidden';
  modal.classList.add('open');

  const body=modal.querySelector('.logModalBody');
  if(body) body.scrollTop=0;
}

function closeLogModal(){
  closeMarkerManage();
  byId('logModal').classList.remove('open');
  document.body.style.overflow='';
  currentLogFilter=null;
}

function updateTeamNameDisplays(){
  const our=(byId('ourTeam')?.value || state.ourTeam || '').trim();
  const opp=(byId('oppTeam')?.value || state.oppTeam || '').trim();

  const ourDisplay=byId('ourTeamDisplay');
  const oppDisplay=byId('oppTeamDisplay');

  function applyTeamNameLayout(el,name,fallback){
    if(!el) return;
    const clean=(name||'').trim();
    el.classList.remove('empty','mediumName','longName','veryLongName','suffixSplit','latinName');

    if(!clean){
      el.textContent=fallback;
      el.classList.add('empty');
      return;
    }

    // v5.134：英文 / 拉丁字母隊名在相同字數下通常比中文字更寬。
    // 額外標記 latinName，讓全場結果頁可使用較精準的縮字規則，
    // 避免 MONSTER / TEAM BEST 等名稱最後一個字母被比分區裁切。
    if(/^[\u0000-\u024F\u2000-\u206F\u20A0-\u20CF]+$/.test(clean)){
      el.classList.add('latinName');
    }

    const footballIdx=clean.indexOf('足球隊');
    const shouldSplitFootballTeam = footballIdx > 0 && clean.length >= 7;

    if(shouldSplitFootballTeam){
      const first=clean.slice(0,footballIdx).trim();
      const second=clean.slice(footballIdx).trim();
      el.innerHTML=`<span class="teamNameLine">${escapeHtml(first)}</span><span class="teamNameLine">${escapeHtml(second)}</span>`;
      el.classList.add('suffixSplit');
      return;
    }

    el.textContent=clean;
    el.classList.toggle('mediumName', clean.length>=4 && clean.length<7);
    el.classList.toggle('longName', clean.length>=7 && clean.length<9);
    el.classList.toggle('veryLongName', clean.length>=9);
  }

  applyTeamNameLayout(ourDisplay, our, '我方');
  applyTeamNameLayout(oppDisplay, opp, '對手');
}

function canReviewTeamNameEdit(){
  const isReviewBreak=Boolean(
    state.awaitingNextPeriod &&
    !state.penalty?.active &&
    (state.nextPeriodType==='SECOND_HALF' || state.nextPeriodType==='EXTRA_TIME')
  );
  return Boolean(state.finished || isReviewBreak);
}

let reviewTeamEditId=null;

function editTeamName(id, reviewRequested=false){
  const box=byId(id+'Box');
  const input=byId(id);
  if(!box || !input) return;

  const isPreMatch=document.body.classList.contains('matchStatePre');
  // 比賽進行中、延長賽與 PK 不開放修改；核對節點必須按鉛筆主動進入。
  if(!isPreMatch && (!reviewRequested || !canReviewTeamNameEdit())){
    return;
  }

  reviewTeamEditId=isPreMatch ? null : id;
  box.classList.toggle('reviewEditing',!isPreMatch);
  box.classList.add('editing');
  setTimeout(()=>{
    input.focus();
    try{ input.setSelectionRange(input.value.length,input.value.length); }catch(e){}
  },0);
}

function finishTeamNameEdit(id){
  const box=byId(id+'Box');
  const input=byId(id);
  if(!box || !input) return;

  const label=id==='ourTeam'?'我方隊伍名稱':'對手隊伍名稱';
  // v4.93：兩邊隊名皆可稍後補充；空白時使用「我方 / 對手」暫代顯示。
  const value=validateTextField(id,label,false,15);

  if(value===null){
    box.classList.add('editing');
    return;
  }

  saveState();
  if(reviewTeamEditId===id) reviewTeamEditId=null;
  box.classList.remove('reviewEditing');
  box.classList.remove('editing');
  updateTeamNameDisplays();
  render();
}

function setStateSectionVisible(id, visible){
  const el=byId(id);
  if(!el) return;
  el.classList.toggle('stateHidden', !visible);
  el.setAttribute('aria-hidden', String(!visible));
}



function renderLiveFocusUI(){
  const strip=byId('liveMetaStrip');
  const keeperText=byId('liveKeeperQuickText');
  const rosterText=byId('liveRosterQuickText');
  if(!strip) return;

  const isPenalty=!!state.penalty?.active;
  const isLive=!!state.started && !state.finished && !state.awaitingNextPeriod && !isPenalty;
  const isHalftime=!!state.awaitingNextPeriod && state.nextPeriodType==='SECOND_HALF' && !state.finished && !isPenalty;
  const isExtraWait=!!state.awaitingNextPeriod && state.nextPeriodType==='EXTRA_TIME' && !state.finished && !isPenalty;
  const isResult=!!state.finished;
  const shouldShow=isLive || isHalftime || isExtraWait || isPenalty || isResult;

  if(shouldShow){
    const comp=String(state.competition||'').trim();
    const stage=String(state.competitionStage||'').trim();
    const dayMatchLabel=formatDayMatchLabel(state.dayMatchNumber);
    const venue=String(state.venue||'').trim();
    const editBtn=isResult
      ? `<button type="button" class="resultMetaEditBtn metaGroupEditBtn" onclick="openResultMetaEdit()" aria-label="修正比賽賽事、賽事階段與比賽場地" title="修正比賽資料"><span class="uiLineIcon uiEditIcon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M4.75 19.25h3.4L18.6 8.8a2.35 2.35 0 0 0 0-3.32l-.08-.08a2.35 2.35 0 0 0-3.32 0L4.75 15.85z"/><path d="m13.85 6.75 3.4 3.4"/><path d="M4.75 19.25 8.3 18.4 5.6 15.7z"/></svg></span></button>`
      : '';

    // v5.177：上半場／下半場／延長賽進行中，空白的賽事與場地不再佔版面。
    // 有填資料時仍正常顯示；中場、等待延長賽、PK、全場維持原本資訊／補填入口。
    const hideEmptyDuringActivePlay=isLive;
    const metaRows=[];

    if(comp || stage || !hideEmptyDuringActivePlay){
      const contextParts=[stage,dayMatchLabel].filter(Boolean);
      const contextText=contextParts.join('｜');
      const mainCompetitionText=comp || contextText || '比賽賽事';
      const showContext=Boolean(comp && contextText);
      metaRows.push(`
        <div class="matchMetaDisplayRow competitionDisplayRow${(comp||stage||dayMatchLabel)?'':' empty'}">
          <span class="matchMetaDisplayIcon" aria-hidden="true">🏆</span>
          <span class="matchMetaDisplayValue${showContext?' withInlineContext':''}"><span class="competitionNameText">${escapeHtml(mainCompetitionText)}</span>${showContext?`<span class="competitionInlineContext">${escapeHtml(contextText)}</span>`:''}</span>
        </div>`);
    }

    if(venue || !hideEmptyDuringActivePlay){
      metaRows.push(`
        <div class="matchMetaDisplayRow venueDisplayRow${venue?'':' empty'}">
          <span class="matchMetaDisplayIcon" aria-hidden="true">🏟️</span>
          <span class="matchMetaDisplayValue">${escapeHtml(venue || '比賽場地')}</span>
        </div>`);
    }

    if(metaRows.length || editBtn){
      strip.innerHTML=metaRows.join('')+editBtn;
      strip.classList.add('show');
    }else{
      strip.innerHTML='';
      strip.classList.remove('show');
    }
  }else{
    strip.innerHTML='';
    strip.classList.remove('show');
  }

  if(keeperText){
    keeperText.textContent=state.goalkeeperNumber ? `守門員 #${state.goalkeeperNumber}` : '守門員 未設定';
  }
  if(rosterText){
    rosterText.textContent=`名單 ${currentRosterNumbers().length}人`;
  }
}


function openResultMetaEdit(){
  if(!state.finished) return;

  const comp=byId('resultCompetitionInput');
  const venue=byId('resultVenueInput');
  const stage=byId('resultCompetitionStageInput');

  // v4.87：全場編輯一律以目前 state 為唯一來源。
  if(comp) comp.value=state.competition||'';
  if(stage) stage.value=state.competitionStage||'';
  if(venue) venue.value=state.venue||'';

  syncVisualViewport();
  byId('resultMetaEditModal').classList.add('open');

  setTimeout(()=>{
    if(comp) comp.focus();
  },80);
}

function closeResultMetaEdit(){
  byId('resultMetaEditModal').classList.remove('open');
}

function saveResultMetaEdit(){
  if(!state.finished) return;

  const comp=String(byId('resultCompetitionInput')?.value||'').trim();
  const stage=String(byId('resultCompetitionStageInput')?.value||'').trim();
  const venue=String(byId('resultVenueInput')?.value||'').trim();
  const invalid=/[<>\r\n]/;

  if(comp.length>40 || invalid.test(comp)){
    alert('比賽賽事請控制在 40 字內，且不可包含 <、> 或換行。');
    byId('resultCompetitionInput')?.focus();
    return;
  }

  if(stage.length>24 || invalid.test(stage)){
    alert('賽事階段／輪次請控制在 24 字內，且不可包含 <、> 或換行。');
    byId('resultCompetitionStageInput')?.focus();
    return;
  }

  if(venue.length>30 || invalid.test(venue)){
    alert('比賽場地請控制在 30 字內，且不可包含 <、> 或換行。');
    byId('resultVenueInput')?.focus();
    return;
  }

  state.competition=comp;
  state.competitionStage=stage;
  state.venue=venue;

  // v4.87：同步回主畫面的原始欄位，再存 state。
  // 否則 saveState() 會從舊的 competition / venue input 讀值，
  // 把剛剛在全場編輯視窗輸入的新內容覆蓋掉。
  if(byId('competition')) byId('competition').value=comp;
  if(byId('competitionStage')) byId('competitionStage').value=stage;
  if(byId('venue')) byId('venue').value=venue;

  // 賽後修正只更新本場資料。
  // 最近場地仍以「實際開始比賽時的場地」為準。
  saveState();

  // 儲存後立即刷新全場頂部資料與摘要相關顯示。
  renderLiveFocusUI();
  closeResultMetaEdit();
  render();
}

function renderWinnerBadge(){
  const ourBox=byId('ourTeamBox');
  const oppBox=byId('oppTeamBox');
  const ourBadge=byId('ourWinnerBadge');
  const oppBadge=byId('oppWinnerBadge');
  if(!ourBox || !oppBox) return;

  ourBox.classList.remove('winner');
  oppBox.classList.remove('winner');
  ourBadge?.classList.remove('show');
  oppBadge?.classList.remove('show');

  if(!state.finished) return;

  let winner='';
  if(state.penalty?.completed){
    const po=penaltyGoals('our'), pp=penaltyGoals('opp');
    if(po>pp) winner='OUR';
    else if(pp>po) winner='OPP';
  }else if(state.ourScore>state.oppScore){
    winner='OUR';
  }else if(state.oppScore>state.ourScore){
    winner='OPP';
  }

  if(winner==='OUR'){
    ourBox.classList.add('winner');
    ourBadge?.classList.add('show');
  }
  if(winner==='OPP'){
    oppBox.classList.add('winner');
    oppBadge?.classList.add('show');
  }
}

function renderQuickResult(){
  const section=byId('quickResultSection');
  if(!section) return;

  const stats=[
    ['GOAL','quickResultGoal','進球'],
    ['SHOT','quickResultShot','射門'],
    ['SAVE','quickResultSave','撲救'],
    ['DEFENSE','quickResultDefense','防守']
  ];

  stats.forEach(([event,id,label])=>{
    const count=state.markers.filter(m=>m.event===event).length;
    const value=byId(id);
    if(value) value.textContent=count;

    const card=section.querySelector(`.quickResultStat[data-event="${event}"]`);
    if(!card) return;

    const hasData=count>0;

    // 每次 render 都完整重設互動狀態，避免先前 disabled / pointer-events 殘留。
    card.classList.toggle('hasData',hasData);
    card.disabled=!hasData;
    card.setAttribute('aria-disabled',hasData?'false':'true');
    card.tabIndex=hasData?0:-1;
    card.style.pointerEvents=hasData?'auto':'none';

    if(hasData){
      card.setAttribute('aria-label',`查看${label}細節，共 ${count} 筆`);
      card.onclick=()=>openQuickResultDetail(event);
    }else{
      card.setAttribute('aria-label',`${label}目前 0 筆`);
      card.onclick=null;
    }
  });
}


function hasMeaningfulPreMatchSetup(){
  if(state.started || state.finished || state.awaitingNextPeriod || state.penalty?.active) return false;

  const rememberedOur=String(localStorage.getItem(LAST_OUR_TEAM_KEY)||'忠義國小').trim();
  const currentOur=String(byId('ourTeam')?.value||state.ourTeam||'').trim();
  const currentOpp=String(byId('oppTeam')?.value||state.oppTeam||'').trim();
  const currentCompetition=String(byId('competition')?.value||state.competition||'').trim();
  const currentStage=String(byId('competitionStage')?.value||state.competitionStage||'').trim();
  const currentVenue=String(byId('venue')?.value||state.venue||'').trim();

  /* v4.45：場地只要目前有值，就視為本場已存在賽前設定。
     舊版若場地剛好等於「上次使用場地」，會誤判為預設值而隱藏重設按鈕，
     造成畫面明明顯示場地（例如新北高中）卻沒有「↻ 重設」的矛盾。 */
  return Boolean(
    currentOpp ||
    currentCompetition ||
    currentStage ||
    currentVenue ||
    String(state.goalkeeperNumber||'') ||
    currentRosterNumbers().length ||
    Number(state.regulationMinutes||0) ||
    (currentOur && currentOur!==rememberedOur)
  );
}


function metaTextLength(value){
  return Array.from(String(value||'').trim()).length;
}

function updatePreMetaInputFit(input){
  if(!input) return;

  input.classList.remove('metaFitMedium','metaFitLong','metaFitXL','metaEditing');

  if(document.activeElement===input){
    input.classList.add('metaEditing');
    return;
  }

  const len=metaTextLength(input.value);
  // v5.130：賽事 / 場地改為滿版後，延後縮字門檻，優先維持正常字級。
  if(len<=12) return;
  if(len<=20){
    input.classList.add('metaFitMedium');
    return;
  }
  if(len<=30){
    input.classList.add('metaFitLong');
    return;
  }
  input.classList.add('metaFitXL');
}

function updateAllPreMetaFits(){
  updatePreMetaInputFit(byId('competition'));
  updatePreMetaInputFit(byId('competitionStage'));
  updatePreMetaInputFit(byId('venue'));
}

function renderPreResetUI(){
  const btn=byId('preResetBtn');
  if(!btn) return;

  const available=
    !state.started &&
    !state.finished &&
    !state.awaitingNextPeriod &&
    !state.penalty?.active &&
    hasMeaningfulPreMatchSetup();

  // 重設屬於低頻率次要操作：
  // 只有賽前已有可清除內容時才顯示並可操作。
  btn.classList.toggle('show',available);
  btn.disabled=!available;
  btn.setAttribute('aria-hidden', String(!available));
  btn.setAttribute('aria-disabled', String(!available));
  btn.tabIndex=available ? 0 : -1;
  btn.title=available ? '清除本場賽前設定' : '';
}

function resetPreMatchSetup(){
  if(state.started || state.finished || state.awaitingNextPeriod || state.penalty?.active) return;

  if(!confirm(
    '重設賽前設定？\n\n' +
    '將清除本場尚未開始的賽事名稱、賽事階段／輪次、場地、對手、名單、守門員、比賽時間與其他賽前設定。'
  )) return;

  hideMarkerUndo();

  const rememberedOur=String(
    localStorage.getItem(LAST_OUR_TEAM_KEY) ||
    byId('ourTeam')?.value ||
    state.ourTeam ||
    '忠義國小'
  ).trim() || '忠義國小';

  state.ourTeam=rememberedOur;
  state.oppTeam='';
  state.competition='';
  state.competitionStage='';
  state.venue='';
  state.goalkeeperNumber='';
  state.goalkeeperAutoRosterNumber='';
  state.rosterNumbers=[];
  state.jerseyColor='default';
  state.regulationMinutes=null;

  state.ourScore=0;
  state.oppScore=0;
  state.markers=[];
  state.currentPeriod=1;
  state.awaitingNextPeriod=false;
  state.multiPeriod=false;
  state.periodStartOurScore=0;
  state.periodStartOppScore=0;
  state.periods=[];
  state.nextPeriodType=null;
  state.extraTime=false;
  state.extraTimeMinutes=null;
  state.penalty=null;
  state.halftimeStartEpoch=null;
  state.halftimeEndEpoch=null;
  state.halftimeDuration=0;

  if(byId('ourTeam')) byId('ourTeam').value=rememberedOur;
  if(byId('oppTeam')) byId('oppTeam').value='';
  if(byId('competition')) byId('competition').value='';
  if(byId('competitionStage')) byId('competitionStage').value='';
  if(byId('venue')) byId('venue').value='';

  byId('ourTeamBox')?.classList.remove('editing');
  byId('oppTeamBox')?.classList.remove('editing');
  byId('ourTeam')?.classList.remove('requiredError','inputError','guidedInput');
  byId('oppTeam')?.classList.remove('inputError','guidedInput');
  byId('competition')?.classList.remove('guidedInput');
  byId('competitionStage')?.classList.remove('guidedInput');
  byId('venue')?.classList.remove('guidedInput');

  guidedSetupStep=null;
  syncRegulationInputsFromState();
  saveState();
  render();
}

function renderMatchStateUI(){
  const isFinished=!!state.finished;
  const isPenalty=!!state.penalty?.active;
  const isBreak=!!state.awaitingNextPeriod;
  const isHalftime=!!state.awaitingNextPeriod && state.nextPeriodType==='SECOND_HALF' && !isFinished && !isPenalty;
  const isExtraWait=!!state.awaitingNextPeriod && state.nextPeriodType==='EXTRA_TIME' && !isFinished && !isPenalty;
  const isLive=!!state.started && !isFinished && !isBreak && !isPenalty;
  const isPre=!state.started && !isBreak && !isFinished && !isPenalty;

  // 事件模組：賽前隱藏；進行中顯示全部；中場／賽後保留紀錄入口。
  setStateSectionVisible('eventHubSection', !isPre);
  setStateSectionVisible('eventSection', isLive);
  setStateSectionVisible('disciplineSection', isLive);

  // 紀錄在比賽進行、中場、PK、全場後都具有回顧價值；賽前沒有紀錄則不顯示。
  setStateSectionVisible('recordSection', !isPre);

  const eventHubEl = byId('eventHubSection');
  if(eventHubEl){
    eventHubEl.classList.toggle('recordOnly', !isPre && !isLive);
  }

  // 極簡結果卡只屬於全場後的 Result Mode。
  setStateSectionVisible('quickResultSection', isFinished);

  document.body.classList.toggle('matchStatePre', isPre);
  document.body.classList.toggle('matchStateLive', isLive);
  document.body.classList.toggle('matchStateHalftime', isHalftime);
  document.body.classList.toggle('matchStateExtraWait', isExtraWait);
  document.body.classList.toggle('matchStatePenalty', isPenalty);
  document.body.classList.toggle('matchStateBreak', isBreak || isPenalty);
  document.body.classList.toggle('resultMode', isFinished);

  if(!isPre){
    ['ourTeam','oppTeam'].forEach(id=>{
      const keepReviewEdit=reviewTeamEditId===id && canReviewTeamNameEdit();
      const box=byId(id+'Box');
      const input=byId(id);
      box?.classList.toggle('reviewEditing',keepReviewEdit);
      if(keepReviewEdit) return;
      box?.classList.remove('editing','reviewEditing');
      input?.classList.remove('guidedInput','inputError','requiredError');
      input?.blur();
    });
    if(!canReviewTeamNameEdit()) reviewTeamEditId=null;
  }
}



function regulationPulseToken(mins){
  return [
    Number(state.startEpoch)||0,
    Number(state.currentPeriod)||1,
    Number(mins)||0
  ].join(':');
}

let overtimePulseTimer=null;

function triggerOvertimeFramePulse(stage,mins){
  if(!stage || !mins) return;

  const token=regulationPulseToken(mins);
  if(state.regulationPulseAckToken===token) return;

  // 先標記已提醒，避免 requestAnimationFrame 的下一幀重複觸發。
  state.regulationPulseAckToken=token;
  try{ saveState(); }catch(e){}

  stage.classList.remove('overtimePulse');
  // 強制 reflow，確保同一個元素在新的一段比賽仍可重新播放動畫。
  void stage.offsetWidth;
  stage.classList.add('overtimePulse');

  if(overtimePulseTimer) clearTimeout(overtimePulseTimer);
  overtimePulseTimer=setTimeout(()=>{
    stage.classList.remove('overtimePulse');
    overtimePulseTimer=null;
  },4000);
}


function renderRegulationTimeAlert(sampledElapsedSec=null){
  const stage=byId('broadcastStage');
  const legacyHint=byId('regulationHint');
  const timeLine=byId('timeStatusLine');
  const timeBadge=byId('timeRegulationBadge');
  const timeDivider=byId('timeStatusDivider');
  const timeState=byId('timeRegulationState');

  if(!stage) return;

  stage.classList.remove('regulationSoon','regulationCritical','regulationReached');

  // v5.95：舊提示列不再佔版面，只保留 DOM 相容性。
  if(legacyHint){
    legacyHint.className='regulationHint';
    legacyHint.textContent='';
  }

  const mins=Number(state.regulationMinutes||0);
  const hasBegun=Boolean(matchStartEpoch());

  const resetTimeStatus=()=>{
    if(!timeLine || !timeBadge) return;

    if(hasBegun && mins){
      timeLine.hidden=false;
      timeBadge.textContent=`規定 ${regulationCompactText()}`;
      if(timeDivider) timeDivider.hidden=true;
      if(timeState){
        timeState.hidden=true;
        timeState.textContent='';
        timeState.className='timeRegulationState';
      }
    }else{
      timeLine.hidden=true;
      timeBadge.textContent='';
      if(timeDivider) timeDivider.hidden=true;
      if(timeState){
        timeState.hidden=true;
        timeState.textContent='';
        timeState.className='timeRegulationState';
      }
    }
  };

  const setTimeStatus=(text,statusClass)=>{
    if(!timeLine || !timeBadge || !timeState) return;
    timeLine.hidden=false;
    timeBadge.textContent=`規定 ${regulationCompactText()}`;
    if(timeDivider) timeDivider.hidden=false;
    timeState.hidden=false;
    timeState.textContent=text;
    timeState.className=`timeRegulationState ${statusClass||''}`.trim();
  };

  resetTimeStatus();

  if(!state.started || state.finished || state.awaitingNextPeriod || !mins) return;

  let sec=0;
  try{
    // 主計時與規定時間狀態共用同一幀的整數秒。
    if(sampledElapsedSec!==null && Number.isFinite(Number(sampledElapsedSec))){
      sec=Math.floor(Number(sampledElapsedSec)||0);
    }else if(typeof elapsed==='function'){
      sec=Math.floor(Number(elapsed())||0);
    }else if(typeof currentPeriodElapsed==='function'){
      sec=Math.floor(Number(currentPeriodElapsed())||0);
    }
  }catch(e){}

  const diff=Math.round(mins*60)-sec;

  // 超過 60 秒前只顯示「規定 X 分鐘」，不額外增加視覺資訊。
  if(diff>60) return;

  if(diff>30){
    stage.classList.add('regulationSoon');
    setTimeStatus(`剩 ${fmtMatchClock(diff)}`,'soon');
  }else if(diff>0){
    stage.classList.add('regulationCritical');
    setTimeStatus(`剩 ${fmtMatchClock(diff)}`,'critical');
  }else if(diff===0){
    stage.classList.add('regulationReached');
    setTimeStatus('時間到','reached');

    // v5.93：剛進入規定時間到／超時時，只 Pulse 一次。
    triggerOvertimeFramePulse(stage,mins);
  }else{
    stage.classList.add('regulationReached');
    setTimeStatus(`超時 +${fmtMatchClock(Math.abs(diff))}`,'overtime');

    // 同一段比賽只會提醒一次，不持續閃爍。
    triggerOvertimeFramePulse(stage,mins);
  }
}



function render(){
  applyJerseyColorTheme();
  updateTeamNameDisplays();
  const ourScoreEl=byId('ourScore');
  const oppScoreEl=byId('oppScore');
  ourScoreEl.textContent=state.ourScore;
  oppScoreEl.textContent=state.oppScore;
  ourScoreEl.closest('.scoreTile')?.classList.toggle('twoDigit',Number(state.ourScore)>=10);
  oppScoreEl.closest('.scoreTile')?.classList.toggle('twoDigit',Number(state.oppScore)>=10);

  const pkMainScore=byId('pkMainScore');
  if(pkMainScore){
    const showPk=!!(state.penalty && (state.penalty.active || state.penalty.completed));
    if(showPk){
      pkMainScore.textContent=`PK ${penaltyGoals('our')} : ${penaltyGoals('opp')}`;
      pkMainScore.classList.add('show');
    }else{
      pkMainScore.textContent='';
      pkMainScore.classList.remove('show');
    }
  }

  byId('count').textContent=state.markers.length;
  renderMatchStateUI();
  renderRegulationTimeAlert();
  renderQuickResult();
  renderWinnerBadge();
  renderLiveFocusUI();
  renderDayMatchMeta();
  renderPreResetUI();

  // v4.04：Auto-fit 是 render 標準流程的一部分。
  // LocalStorage 還原 / Safari 重新整理 / 程式更新欄位後，
  // 都立即重新判斷賽事名稱與場地字級。
  updateAllPreMetaFits();

  const roster=currentRosterNumbers();
  const rosterBtn=byId('rosterQuickBtn');
  const rosterText=byId('rosterQuickText');
  if(rosterBtn && rosterText){
    rosterBtn.classList.toggle('set',roster.length>0);
    rosterBtn.classList.toggle('locked',!!state.finished);
    rosterText.textContent=`${roster.length}人`;
    rosterBtn.setAttribute(
      'aria-label',
      state.finished
        ? `本場球員名單共 ${roster.length} 人，比賽已結束並鎖定`
        : (roster.length?`本場球員名單共 ${roster.length} 人，點擊查看或編輯`:'設定本場球員名單')
    );
  }

  const keeperNumber=String(state.goalkeeperNumber||'');
  const keeperBtn=byId('keeperQuickBtn');
  const keeperText=byId('keeperQuickText');
  if(keeperBtn && keeperText){
    keeperBtn.classList.toggle('set',!!keeperNumber);
    keeperBtn.classList.toggle('locked',!!state.finished);
    keeperText.textContent=keeperNumber ? `#${keeperNumber}` : '未設定';
    keeperBtn.setAttribute(
      'aria-label',
      state.finished
        ? (keeperNumber?`本場守門員背號 ${keeperNumber}，比賽已結束並鎖定`:'本場未設定守門員，比賽已結束並鎖定')
        : (keeperNumber ? `目前守門員背號 ${keeperNumber}，點擊更換` : '設定目前守門員背號')
    );
  }

  let txt='尚未開始', cls='idleStatus', cardCls='idleState';
  if(state.penalty?.active){
    txt=`PK 點球進行中｜PK ${penaltyGoals('our')}:${penaltyGoals('opp')}`;
    cls='liveStatus'; cardCls='liveState';
  }else if(state.awaitingNextPeriod){
    if(state.nextPeriodType==='EXTRA_TIME'){
      txt=`下半場結束｜目前 ${state.ourScore}:${state.oppScore}｜等待延長賽`;
    }else{
      const firstHalf=state.periods.find(p=>Number(p.number)===1);
      const firstHalfDuration=firstHalf ? (Number(firstHalf.duration)||0) : 0;
      txt=`上半場結束｜中場休息 ${fmtMMSS(halftimeElapsed())}｜目前 ${state.ourScore}:${state.oppScore}`;
    }
    cls='idleStatus';
    cardCls='idleState';
  }else if(state.started && !state.finished){
    txt=state.currentPeriod===3 ? '延長賽進行中' : (state.multiPeriod && state.currentPeriod===2 ? '下半場進行中' : '比賽進行中');
    cls='liveStatus';
    cardCls='liveState';
  }
  if(state.finished){
    const pk=state.penalty?.completed ? `｜PK ${penaltyGoals('our')}:${penaltyGoals('opp')}` : '';
    txt=`比賽已結束｜${fmtMMSS(state.finalElapsed)}｜${state.ourScore}:${state.oppScore}${pk}`;
    cls='finished';
    cardCls='finishedState';
  }
  const startBtn=byId('startBtn');
  const finishBtn=byId('finishBtn');

  startBtn.textContent=state.awaitingNextPeriod ? (state.nextPeriodType==='EXTRA_TIME'?'▶ 開始延長賽':'▶ 開始下半場') : '▶ 開始比賽';
  finishBtn.textContent=state.penalty?.active ? '⚽ 記錄 PK' : state.currentPeriod===3 && state.started ? '■ 結束延長賽' : (state.multiPeriod && state.currentPeriod===2 && state.started?'■ 結束下半場':'■ 結束比賽');

  // 按鈕依比賽狀態啟用 / 禁用，避免現場誤觸。
  if(state.finished){
    // 全場結束：兩顆都鎖定；v4.04 由 resultMode CSS 直接隱藏。
    startBtn.disabled=true;
    finishBtn.disabled=true;
  }else if(state.penalty?.active){
    startBtn.disabled=true;
    finishBtn.disabled=false;
  }else if(state.awaitingNextPeriod){
    // 中場 / 延長賽前：只能開始下一段。
    startBtn.disabled=false;
    finishBtn.disabled=true;
  }else if(state.started){
    // 比賽中：只能結束目前比賽 / 半場。
    startBtn.disabled=true;
    finishBtn.disabled=false;
  }else{
    // 賽前：只能開始比賽。
    startBtn.disabled=false;
    finishBtn.disabled=true;
  }

  // Match State UI：賽後輸出只屬於「結果模式」。
  // 賽前 / 比賽中 / 中場 / PK 進行中都不佔用畫面。
  document.body.classList.toggle('finalOutputVisible', !!state.finished);
  if(state.finished) scheduleFinalToolsSafeVisibility();
  ['reportBtn','saveImageBtn','shareCsvBtn'].forEach(id=>{
    const btn=byId(id);
    if(btn) btn.disabled=!state.finished;
  });

  // 比賽事件按鈕只在「比賽進行中」啟用。
  const eventEnabled=state.started && !state.finished && !state.awaitingNextPeriod;
  ['goalBtn','saveBtn','shotBtn','greatPlayBtn','cardBtn','yellowCardBtn','redCardBtn'].forEach(id=>{
    const btn=byId(id);
    if(btn) btn.disabled=!eventEnabled;
  });

  // 沒有任何事件時，「紀錄 0」沒有操作價值，因此禁用。
  const recordBtn=byId('recordBtn');
  if(recordBtn) recordBtn.disabled=state.markers.length===0;

  // 人工修正比分只出現在「停止比賽的核對節點」：
  // 中場、等待延長賽、全場。
  // 比賽進行中由「進球事件」維護比分，避免比分與事件紀錄 / CSV 不同步。
  const scoreEditBtn=byId('scoreEditBtn');
  if(scoreEditBtn){
    const isScoreReviewBreak=
      !!state.awaitingNextPeriod &&
      (state.nextPeriodType==='SECOND_HALF' || state.nextPeriodType==='EXTRA_TIME') &&
      !state.penalty?.active;

    const pkLocksScore=!!(state.penalty?.active || state.penalty?.completed);

    // 中場 / 等待延長賽 / 全場統一使用「比分／隊名」單一入口。
    // PK 已完成時比分鎖定，但全場仍保留入口供修正隊名。
    const canOpenResultEdit=!!state.finished || (!pkLocksScore && isScoreReviewBreak);
    const useCombinedScoreTeamEdit=!!state.finished || isScoreReviewBreak;

    scoreEditBtn.hidden=!canOpenResultEdit;
    scoreEditBtn.disabled=!canOpenResultEdit;
    const scoreEditLabel=scoreEditBtn.querySelector('.uiEditLabel');
    if(scoreEditLabel) scoreEditLabel.textContent=useCombinedScoreTeamEdit ? '比分／隊名' : '修正比分';
    scoreEditBtn.setAttribute('aria-label', useCombinedScoreTeamEdit ? '修改比分與隊伍名稱' : '修正比分');
    scoreEditBtn.setAttribute('aria-hidden', String(!canOpenResultEdit));
    scoreEditBtn.setAttribute('aria-disabled', String(!canOpenResultEdit));
  }

  const stage=byId('broadcastStage');
  const stageLabel=byId('broadcastStageLabel');
  if(stage && stageLabel){
    let stageText='賽前', stageClass='pre';
    if(state.penalty?.active){
      stageText='PK 點球';
      stageClass='penalty';
    }else if(state.awaitingNextPeriod){
      stageText=state.nextPeriodType==='EXTRA_TIME'?'等待延長賽':'中場';
      stageClass='halftime';
    }else if(state.started && !state.finished){
      if(state.currentPeriod===3){
        stageText='延長賽';
        stageClass='live secondHalf';
      }else if(state.multiPeriod && state.currentPeriod===2){
        stageText='下半場';
        stageClass='live secondHalf';
      }else{
        stageText='比賽中';
        stageClass='live';
      }
    }else if(state.finished){
      stageText='全場';
      stageClass='full';
    }
    stageLabel.textContent=stageText;
    stage.className='broadcastStage '+stageClass;
  }
  byId('status').textContent=txt;
  byId('status').className='status '+cls;
  const mc=byId('matchCard');
  mc.className='card matchCard '+cardCls;
  syncRegulationInputsFromState();
  renderTimeBox();
  renderLog();
}

let aboutReturnFocus=null;

function focusAboutDismiss(){
  requestAnimationFrame(()=>{
    try{
      byId('aboutModal')?.querySelector('.aboutDismiss')?.focus({preventScroll:true});
    }catch(e){}
  });
}

function openAboutModal(){
  aboutReturnFocus=document.activeElement instanceof HTMLElement ? document.activeElement : null;
  syncVisualViewport();
  document.body.style.overflow='hidden';
  byId('aboutModal').classList.add('open');
  const body=byId('aboutModal').querySelector('.aboutBody');
  if(body) body.scrollTop=0;
  focusAboutDismiss();
}
function closeAboutModal(){
  byId('aboutModal').classList.remove('open');
  document.body.style.overflow='';
  const target=aboutReturnFocus;
  aboutReturnFocus=null;
  if(target && document.contains(target)){
    requestAnimationFrame(()=>{
      try{ target.focus({preventScroll:true}); }catch(e){}
    });
  }
}

/* About 對話框：Esc 可關閉，Tab 焦點留在視窗內。 */
document.addEventListener('keydown',e=>{
  const back=byId('aboutModal');
  if(!back?.classList.contains('open')) return;
  if(e.key==='Escape'){
    e.preventDefault();
    closeAboutModal();
    return;
  }
  if(e.key!=='Tab') return;
  const focusable=[...back.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(el=>el.offsetParent!==null);
  if(!focusable.length) return;
  const first=focusable[0];
  const last=focusable[focusable.length-1];
  if(e.shiftKey && document.activeElement===first){
    e.preventDefault();
    last.focus({preventScroll:true});
  }else if(!e.shiftKey && document.activeElement===last){
    e.preventDefault();
    first.focus({preventScroll:true});
  }
});

function openQuickGuide(){
  syncVisualViewport();
  byId('aboutModal')?.classList.remove('open');
  byId('quickGuideModal')?.classList.add('open');
  document.body.style.overflow='hidden';
  const body=byId('quickGuideModal')?.querySelector('.quickGuideBody');
  if(body) body.scrollTop=0;
  const scroll=byId('quickGuideModal')?.querySelector('.quickGuideScroll');
  if(scroll) scroll.scrollTop=0;
}

function closeQuickGuide(){
  byId('quickGuideModal')?.classList.remove('open');
  document.body.style.overflow='';
}

function backToAboutFromGuide(){
  byId('quickGuideModal')?.classList.remove('open');
  byId('aboutModal')?.classList.add('open');
  document.body.style.overflow='hidden';
  const body=byId('aboutModal')?.querySelector('.aboutBody');
  if(body) body.scrollTop=0;
}

function startFromQuickGuide(){
  byId('quickGuideModal')?.classList.remove('open');
  byId('aboutModal')?.classList.remove('open');
  document.body.style.overflow='';
}

/* Report */
// v5.77：摘要與圖片共用唯一事件來源；只排序副本，不改寫紀錄或比分。
function reportTimelineEntries(){
  return state.markers.map((m,index)=>({m,index}))
    .sort((a,b)=>(Number(a.m.period)||1)-(Number(b.m.period)||1)
      || (Number(a.m.seconds)||0)-(Number(b.m.seconds)||0) || a.index-b.index)
    .map(({m,index})=>({
      type:'timelineEvent', sourceIndex:index, event:m.event,
      team:markerPlayerTeamCode(m)==='OUR'?'OUR':markerPlayerTeamCode(m)==='OPP'?'OPP':'UNKNOWN',
      period:Number(m.period)||1,
      phase:state.multiPeriod?periodLabel(Number(m.period)||1):'比賽',
      time:fmtMMSS(Number(m.seconds)||0),
      actor:`${markerPlayerTeamCode(m)==='OUR'?'我方':markerPlayerTeamCode(m)==='OPP'?'對手':'未指定'}${m.player_number?` #${m.player_number}`:''}${m.event==='GOAL' && m.own_goal?'（烏龍）':''}`,
      playerNumber:m.player_number?String(m.player_number):'',
      assistNumber:m.assist_number?String(m.assist_number):'',
      ownGoal:!!m.own_goal,
      assist:m.event==='GOAL'
        ? (m.own_goal
            ? `比分計入${teamDisplay(m.team)||'對方'}`
            : (m.assist_number?`助攻 #${m.assist_number}`:''))
        : '',
      typeLabel:markerEventLabel(m),
      score:String(m.score_after||'—')
    }));
}
function reportTimelineCompactParts(e){
  const side=e.team==='OUR'?'我方':e.team==='OPP'?'對手':'未指定';
  let action='';
  if(e.event==='GOAL') action=e.ownGoal?'烏龍球':'進球';
  else action=e.typeLabel==='烏龍球'?'烏龍球':e.typeLabel.replace('（兩黃轉紅）','');
  let main=`${side}${action}`;
  if(e.playerNumber) main += ` #${e.playerNumber}`;
  const assist=(e.event==='GOAL' && !e.ownGoal && e.assistNumber) ? `助攻 #${e.assistNumber}` : '';
  return {icon:emoji(e.event), main, assist};
}
function reportTimelineHTML(){
  const entries=reportTimelineEntries();
  if(!entries.length) return '<div class="reportEmpty">尚未標記事件</div>';
  let phase=null;
  return '<ol class="matchTimeline">'+entries.map(e=>{
    const heading=phase!==e.period?`<li class="matchTimelinePhase">${escapeHtml(e.phase)}</li>`:'';
    phase=e.period;
    const compact=reportTimelineCompactParts(e);
    return heading+`<li class="matchTimelineRow ${e.team==='OUR'?'isOur':e.team==='OPP'?'isOpp':'isUnknown'} ${e.event==='GOAL'?'isGoal':''}">
      <div class="matchTimelineTime">${escapeHtml(e.time)}</div><div class="matchTimelineNode" aria-hidden="true"></div>
      <div class="matchTimelineContent"><div class="matchTimelineCompact"><span class="matchTimelineCompactIcon" aria-hidden="true">${escapeHtml(compact.icon)}</span><span class="matchTimelineCompactMain">${escapeHtml(compact.main)}</span>${compact.assist?`<span class="matchTimelineAssistInline">${escapeHtml(compact.assist)}</span>`:''}</div></div>
      ${e.event==='GOAL'?`<div class="matchTimelineScore" aria-label="進球後比分 ${escapeHtml(e.score)}">${escapeHtml(e.score)}</div>`:''}
    </li>`;
  }).join('')+'</ol>';
}
function reportEventHTML(m, goalIndex=null){
  const team=markerPlayerTeamDisplay(m);
  const num=m.player_number ? ` #${m.player_number}` : '';
  const ordinal=(m.event==='GOAL' && goalIndex!==null) ? `G${goalIndex+1}` : eventLabel(m.event);
  const period=state.multiPeriod ? periodLabel(m.period||1) : '';
  const periodTime=period ? `${period} ${fmtMMSS(m.seconds)}` : fmtMMSS(m.seconds);
  const actor=`${team}${num}${m.own_goal?'（烏龍）':''}`;
  const assist=(!m.own_goal && m.assist_number) ? `助攻 #${m.assist_number}` : '';
  return `<div class="reportEvent${assist?' hasAssist':''}">
    <div class="reportPeriodTime">${escapeHtml(periodTime)}</div>
    <div class="goalOrdinal">${ordinal}</div>
    <div class="reportGoalActor" title="${escapeHtml(actor+(assist?`｜${assist}`:''))}">
      <div class="reportGoalMain">${escapeHtml(actor)}</div>
      ${assist?`<div class="reportAssist">${escapeHtml(assist)}</div>`:''}
    </div>
    <div class="rscore">${m.score_after||''}</div>
  </div>`;
}
function reportTypeHTML(event,typeLabel=''){
  if(event==='GOAL' && typeLabel==='烏龍球'){
    return '<span class="reportOwnGoalType"><span aria-hidden="true">⚽</span><span>烏龍球</span></span>';
  }
  if(event==='YELLOW_CARD'){
    return '<span class="reportCardType"><span class="reportCardShape yellow" aria-hidden="true"></span><span>黃牌</span></span>';
  }
  if(event==='RED_CARD'){
    return '<span class="reportCardType"><span class="reportCardShape red" aria-hidden="true"></span><span>紅牌</span></span>';
  }
  return `${emoji(event)} ${escapeHtml(typeLabel||eventLabel(event))}`;
}
function reportOtherEventHTML(m){
  const team=teamDisplay(m.team) || '未指定';
  const num=m.player_number ? ` #${m.player_number}` : '';
  const period=state.multiPeriod ? periodLabel(m.period||1) : '';
  const periodTime=period ? `${period} ${fmtMMSS(m.seconds)}` : fmtMMSS(m.seconds);
  const actor=`${team}${num}`;
  return `<div class="reportEvent">
    <div class="reportPeriodTime">${escapeHtml(periodTime)}</div>
    <div class="reportLabel" title="${escapeHtml(actor)}">${escapeHtml(actor)}</div>
    <div class="reportType">${reportTypeHTML(m.event)}</div>
    <div class="rscore">${m.score_after||''}</div>
  </div>`;
}

function buildReportDOM(){
  byId('reportImageDownloads').hidden=true;
  byId('reportOurTeam').textContent=state.ourTeam||'我方';
  byId('reportOppTeam').textContent=state.oppTeam||'對手';
  byId('reportScore').textContent=`${state.ourScore} : ${state.oppScore}`;
  const totalElapsed=totalMatchElapsed();
  const reportStartEpoch=matchStartEpoch();
  const reportEndEpoch=matchEndEpoch();
  const crossedDay=isCrossDay(reportStartEpoch,reportEndEpoch);
  const reportDayMatchLabel=formatDayMatchLabel(state.dayMatchNumber);
  byId('reportDate').textContent=`📅 ${matchDateLabel(reportStartEpoch,reportEndEpoch)}${reportDayMatchLabel?`｜${reportDayMatchLabel}`:''}`;
  const reportCompetition=byId('reportCompetition');
  const reportCompetitionValue=String(state.competition||'').trim();
  const reportStageValue=String(state.competitionStage||'').trim();
  if(reportCompetition){
    const reportCompetitionText=[reportCompetitionValue,reportStageValue].filter(Boolean).join('｜');
    reportCompetition.textContent=reportCompetitionText?`🏆 ${reportCompetitionText}`:'';
    reportCompetition.style.display=reportCompetitionText?'':'none';
  }
  const reportVenue=byId('reportVenue');
  const reportVenueText=byId('reportVenueText');
  const reportVenueValue=String(state.venue||'').trim();
  if(reportVenueText) reportVenueText.textContent=reportVenueValue;
  if(reportVenue) reportVenue.style.display=reportVenueValue?'':'none';
  const reportRoster=byId('reportRoster');
  const reportRosterText=byId('reportRosterText');
  const rosterForReport=currentRosterNumbers();
  if(reportRoster && reportRosterText && rosterForReport.length){
    reportRosterText.textContent=rosterForReport.map(n=>'#'+n).join(' ');
    reportRoster.style.display='';
  }else if(reportRoster){
    reportRoster.style.display='none';
  }
  byId('reportStart').textContent=fmtReportBoundary(reportStartEpoch,reportStartEpoch,reportEndEpoch);
  byId('reportEnd').textContent=fmtReportBoundary(reportEndEpoch,reportStartEpoch,reportEndEpoch);
  byId('reportActual').innerHTML=durationReportHTML(totalElapsed);
  const reportHalftime=byId('reportHalftime');
  if(reportHalftime){
    const showHalftime=Boolean(state.halftimeStartEpoch);
    reportHalftime.hidden=!showHalftime;
    if(showHalftime){
      byId('reportHalftimeStart').textContent=fmtReportBoundary(
        state.halftimeStartEpoch,
        reportStartEpoch,
        reportEndEpoch
      );
      byId('reportHalftimeEnd').textContent=state.halftimeEndEpoch
        ? fmtReportBoundary(state.halftimeEndEpoch,reportStartEpoch,reportEndEpoch)
        : '--';
      byId('reportHalftimeDuration').textContent=fmtMMSS(halftimeElapsed());
    }
  }
  byId('reportCrossDayBadge').classList.toggle('show',crossedDay);
  const periodsWrap=byId('reportPeriodsWrap');
  const periodsHtml=completedPeriodSummaryHTML();
  periodsWrap.style.display=state.multiPeriod?'':'none';
  byId('reportPeriods').innerHTML=periodsHtml;
  const penaltyWrap=byId('reportPenaltyWrap');
  penaltyWrap.style.display=state.penalty ? '' : 'none';
  byId('reportPenalty').innerHTML=state.penalty ? penaltySummaryHTML() : '';
  const reportScoreRow=byId('reportScoreRow');
  if(reportScoreRow) reportScoreRow.classList.toggle('finished', !!state.finished);

  const badge=byId('reportStatusBadge');
  badge.className='reportStatusBadge ' + (state.finished ? 'finished' : (state.started ? 'running' : 'idle'));
  badge.textContent=state.finished ? (state.penalty?.completed?`比賽結束｜PK ${penaltyGoals('our')}:${penaltyGoals('opp')}`:'比賽結束') : (state.penalty?.active?`PK ${penaltyGoals('our')}:${penaltyGoals('opp')}`:(state.started ? (state.currentPeriod===3?'延長賽':state.multiPeriod&&state.currentPeriod===2?'下半場':'比賽中') : (state.awaitingNextPeriod?(state.nextPeriodType==='EXTRA_TIME'?'等待延長賽':`中場 ${fmtMMSS(halftimeElapsed())}`):'尚未開始')));
  badge.style.display=state.finished?'none':'inline-flex';
  const reportDiff=byId('reportDiff');
  if(reportDiff){
    if(state.regulationMinutes){
      reportDiff.style.display='';
      renderDiff(reportDiff);
    }else{
      reportDiff.textContent='';
      reportDiff.className='diff reportDiff';
      reportDiff.style.display='none';
    }
  }
  const reportMVPWrap=byId('reportMVPWrap');
  const reportMVPCard=byId('reportMVPCard');
  const reportMVPHtml=scorerMVPHTML();
  if(reportMVPWrap && reportMVPCard){
    const reportMVPInfo=scorerMVPInfo();
    reportMVPCard.innerHTML=reportMVPHtml;
    reportMVPCard.classList.toggle('topScorer', reportMVPInfo?.kind==='topScorer');
    reportMVPWrap.style.display=reportMVPHtml?'':'none';
  }
  byId('reportScorers').innerHTML=scorerStatsHTML();
  byId('reportTimeline').innerHTML=reportTimelineHTML();
}


// v5.169：賽後操作列不再主動改變頁面捲動位置。
// v5.167～v5.168 為了讓 Safari 底部三顆按鈕露出，曾在 visualViewport
// 變動時呼叫 scrollBy()；當使用者手動往回捲時，Safari 網址列也會同步
// 改變 visual viewport，造成程式再把頁面推回下方，看起來像被「卡住」。
// 現在只依靠文件流 + 真實頁尾 spacer，完全把捲動控制權交還給使用者。
let initialViewportSettling=true;
function ensureFinalToolsSafeVisibility(){ /* intentionally no-op in v5.169 */ }
function scheduleFinalToolsSafeVisibility(){ /* intentionally no-op in v5.169 */ }

function syncIOSBrowserUIMode(){
  const ua=String(navigator.userAgent||'');
  const isiOS=/iPad|iPhone|iPod/.test(ua) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  const standalone=Boolean(window.navigator.standalone===true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches));
  document.documentElement.classList.toggle('iosBrowserUI', isiOS && !standalone);
}
syncIOSBrowserUIMode();

function syncVisualViewport(){
  const vv=window.visualViewport;
  if(vv){
    document.documentElement.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    document.documentElement.style.setProperty('--vv-height', `${vv.height}px`);

    // iPhone Safari 的底部工具列高度會隨展開／收合改變。
    // 用 visual viewport 與 layout viewport 的差值動態保留底部距離，
    // 讓賽後三顆輸出按鈕永遠停在可點擊區域。
    const bottomGap=Math.max(0, window.innerHeight-(vv.offsetTop+vv.height));
    document.documentElement.style.setProperty('--browser-bottom-gap', `${bottomGap}px`);

    // 鍵盤開啟時不要讓浮動輸出列停在鍵盤上方干擾輸入。
    const keyboardOpen=vv.height < window.innerHeight*0.72;
    document.body.classList.toggle('keyboardOpen', keyboardOpen);
  }else{
    document.documentElement.style.setProperty('--vv-top', '0px');
    document.documentElement.style.setProperty('--vv-height', `${window.innerHeight}px`);
    document.documentElement.style.setProperty('--browser-bottom-gap', '0px');
    document.body.classList.remove('keyboardOpen');
  }
  // v5.169：visualViewport 僅同步 CSS 可視區資訊，不再觸發任何 scrollBy / scrollTo。
  // 使用者向上或向下滑動時，頁面不會被程式自動拉回結果區。
}
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', syncVisualViewport);
  window.visualViewport.addEventListener('scroll', syncVisualViewport);
}
window.addEventListener('resize', syncVisualViewport);
syncVisualViewport();

function openReport(){
  syncVisualViewport();
  buildReportDOM();
  document.body.style.overflow='hidden';
  const modal=byId('reportModal');
  modal.classList.add('open');
  const body=modal.querySelector('.reportBody');
  if(body) body.scrollTop=0;
}
function closeReport(){
  byId('reportModal').classList.remove('open');
  document.body.style.overflow='';
}

/* PNG report */
// v5.144：儲存圖片排版改為以螢幕摘要為唯一視覺基準。
function reportLines(){
  const start=matchStartEpoch(), end=matchEndEpoch();
  const crossDay=isCrossDay(start,end);
  const clock=epoch=>epoch?(crossDay?fmtMonthDayClock(epoch):fmtClock(epoch)):'--:--:--';
  const status=state.finished?'比賽結束':state.penalty?.active?'PK 點球大戰':state.awaitingNextPeriod?'中場／等待開賽':state.started?(state.currentPeriod===3?'延長賽':state.multiPeriod?periodLabel(state.currentPeriod||1):'比賽中'):'尚未開始';
  const lines=[{type:'title',text:'比賽摘要'},
    {type:'score',left:state.ourTeam||'我方',right:state.oppTeam||'對手',score:`${state.ourScore} : ${state.oppScore}`,status}];
  const roster=currentRosterNumbers();

  // v5.155：摘要圖片只顯示有實際內容的賽事／場地；日期固定保留。
  const metaCards=[];
  const competitionValue=String(state.competition||'').trim();
  const stageValue=String(state.competitionStage||'').trim();
  const venueValue=String(state.venue||'').trim();
  const competitionSummary=[competitionValue,stageValue].filter(Boolean).join('｜');
  if(competitionSummary) metaCards.push({label:'比賽賽事／階段',icon:'🏆',value:competitionSummary,full:true,summaryCard:true});
  const dayMatchLabel=formatDayMatchLabel(state.dayMatchNumber);
  metaCards.push({label:'比賽日期',icon:'📅',value:`${matchDateLabel(start,end)}${dayMatchLabel?`｜${dayMatchLabel}`:''}`,full:true,summaryCard:true});
  if(venueValue) metaCards.push({label:'比賽場地',icon:'📍',value:venueValue,full:true,summaryCard:true});
  if(roster.length){
    metaCards.push({label:'本場球員',icon:'👕',value:roster.map(n=>'#'+n).join(' '),full:true,summaryCard:true});
  }
  lines.push({type:'metaGrid',cells:metaCards});

  lines.push({type:'section',text:'時間紀錄'});
  const timeCells=[
    {label:'實際比賽時間',value:fmtDurationReadable(totalMatchElapsed()),primary:true},
    {label:'開始／結束',value:`${clock(start)} → ${clock(end)}${crossDay?'（跨日）':''}`}
  ];
  if(state.halftimeStartEpoch){
    timeCells.push({label:'中場休息',value:fmtMMSS(halftimeElapsed())},
      {label:'中場起訖',value:`${clock(state.halftimeStartEpoch)} → ${clock(state.halftimeEndEpoch)}`});
  }
  lines.push({type:'timeGrid',cells:timeCells});
  if(state.regulationMinutes){
    const diff=Math.round((state.finished?state.finalElapsed:totalMatchElapsed())-regulationTargetSeconds());
    lines.push({type:'meta',text:`${regulationDisplayText()}${state.finished?`｜${diff<0?'提前':'超過'} ${fmtMMSS(Math.abs(diff))}`:''}`});
  }

  if(state.multiPeriod && state.periods.length){
    lines.push({type:'section',text:'比賽段落'});
    lines.push({type:'periodGrid',items:state.periods.map(p=>({label:p.label||periodLabel(p.number),
      score:`${Math.max(0,(p.endOurScore??0)-(p.startOurScore??0))}:${Math.max(0,(p.endOppScore??0)-(p.startOppScore??0))}`,
      duration:fmtMMSS(p.duration||0)}))});
  }
  const entries=reportTimelineEntries();
  const scorers=new Map();
  for(const e of entries){
    if(e.event!=='GOAL' || !state.markers[e.sourceIndex].player_number) continue;
    const existing=scorers.get(e.actor);
    if(existing) existing.goals++;
    else scorers.set(e.actor,{name:e.actor,goals:1});
  }
  if(scorers.size){
    const scorerItems=[...scorers.values()].sort((a,b)=>b.goals-a.goals || a.name.localeCompare(b.name,'zh-Hant'));
    const mvpInfo=scorerMVPInfo();
    if(mvpInfo){
      lines.push({type:'mvpCard',kind:mvpInfo.kind,title:mvpInfo.title,names:mvpInfo.winners.map(s=>s.name)});
    }
    lines.push({type:'scorerGrid',items:scorerItems});
  }
  lines.push({type:'timelineHeading',text:'比賽事件時間軸'});
  if(!entries.length){
    lines.push({type:'meta',text:'尚未標記事件'});
  }else{
    let phase=null;
    for(const e of entries){
      if(phase!==e.period){
        lines.push({type:'timelinePhase',text:e.phase});
        phase=e.period;
      }
      lines.push(e);
    }
  }
  // PK 比分及輪次獨立保留，不混入正規／延長賽進球。
  if(state.penalty){
    lines.push({type:'section',text:`PK 點球大戰 · ${penaltyGoals('our')} : ${penaltyGoals('opp')}`});
    const pkText=k=>`${k.number?'#'+k.number:'無背號'} ${k.result==='GOAL'?'進球':k.result==='MISS'?'未進':'待定'}`;
    for(let i=0;i<Math.max(state.penalty.our.length,state.penalty.opp.length);i++){
      const a=state.penalty.our[i]||emptyPenaltyKick(), b=state.penalty.opp[i]||emptyPenaltyKick();
      if(!a.result && !b.result && !a.number && !b.number) continue;
      lines.push({type:'meta',text:`第 ${i+1} 輪｜我方 ${pkText(a)}｜對手 ${pkText(b)}`});
    }
  }
  return lines;
}

function drawTeamNameTwoLines(ctx, text, centerX, centerY, maxWidth, maxFont=38, minFont=26){
  const raw=String(text||'').trim() || '對手';
  const family='-apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", sans-serif';
  let fontSize=maxFont;
  const setFont=()=>{ ctx.font=`900 ${fontSize}px ${family}`; };

  ctx.textAlign='center';
  ctx.textBaseline='middle';

  // v5.147：先以「同一行完整顯示」為最高優先。
  // 只有縮到最低可讀字級仍放不下時，才允許拆成兩行。
  setFont();
  while(fontSize>minFont && ctx.measureText(raw).width>maxWidth){
    fontSize-=1;
    setFont();
  }
  if(ctx.measureText(raw).width<=maxWidth){
    ctx.fillText(raw,centerX,centerY);
    return;
  }

  const chars=[...raw];
  const badLineStart=/^[\)\]】》〉」』）]/u;
  const badLineEnd=/[\(\[【《〈「『（]$/u;
  let best=null;

  // 若有完整括號尾碼（例如 ZYES），把「主名稱 / (ZYES)」視為優先候選，
  // 避免單獨一個右括號掉到下一行。
  const suffixMatch=raw.match(/^(.*?)(\([^()]+\)|（[^（）]+）)$/u);
  const candidates=[];
  if(suffixMatch && suffixMatch[1].trim()) candidates.push([suffixMatch[1].trim(),suffixMatch[2]]);
  for(let i=1;i<chars.length;i++){
    const a=chars.slice(0,i).join('').trim();
    const b=chars.slice(i).join('').trim();
    if(!a || !b || badLineStart.test(b) || badLineEnd.test(a)) continue;
    candidates.push([a,b]);
  }

  const scoreCandidate=(a,b)=>{
    setFont();
    const wa=ctx.measureText(a).width, wb=ctx.measureText(b).width;
    // 最大行寬優先，其次偏好兩行視覺較均衡。
    return {a,b,wa,wb,score:Math.max(wa,wb)+Math.abs(wa-wb)*0.08};
  };
  for(const [a,b] of candidates){
    const c=scoreCandidate(a,b);
    if(!best || c.score<best.score) best=c;
  }

  // 兩行模式仍可小幅再縮，盡量保留完整文字，不先截斷。
  while(best && Math.max(best.wa,best.wb)>maxWidth && fontSize>22){
    fontSize-=1;
    const rescored=scoreCandidate(best.a,best.b);
    best={...rescored};
  }

  if(!best){
    ctx.fillText(raw,centerX,centerY);
    return;
  }

  const fit=(s)=>{
    if(ctx.measureText(s).width<=maxWidth) return s;
    let out=s;
    while(out.length>1 && ctx.measureText(out+'…').width>maxWidth) out=out.slice(0,-1);
    return out===s?s:out+'…';
  };
  const line1=fit(best.a), line2=fit(best.b);
  const gap=fontSize*1.02;
  ctx.fillText(line1,centerX,centerY-gap/2);
  ctx.fillText(line2,centerX,centerY+gap/2);
}

// v5.78：先按實際字寬排版，再繪製單張長圖。所有資料均保留。
function reportWrapText(ctx,text,width,font){
  ctx.font=font;
  const rows=[];
  for(const paragraph of String(text??'').split('\n')){
    let row='';
    // 時刻、背號與英文單字盡量保持完整；過長單字才逐字換行。
    const tokens=paragraph.match(/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}|[A-Za-z0-9#:/_.+-]+|\s+|./gu)||[];
    for(const token of tokens){
      if(row && token.trim() && ctx.measureText(row+token).width>width){rows.push(row);row='';}
      if(ctx.measureText(token).width>width){
        for(const char of [...token]){
          if(row && ctx.measureText(row+char).width>width){rows.push(row);row='';}
          row+=char;
        }
      }else row+=token;
    }
    rows.push(row);
  }
  return rows;
}
function reportCanvasLayout(lines,ctx){
  const width=1080, pad=64, content=width-pad*2;
  const font='500 24px -apple-system, BlinkMacSystemFont, sans-serif';
  const mainFont='600 28px -apple-system, BlinkMacSystemFont, sans-serif';
  let y=54;
  const blocks=lines.map(line=>{
    const b={...line,y};
    if(line.type==='title') b.height=62;
    else if(line.type==='score') b.height=154;
    else if(line.type==='metaGrid'){
      b.rows=[];b.height=8;
      for(const current of line.cells){
        if(current?.summaryCard){
          const rows=reportWrapText(ctx,current.value,content-92,mainFont);
          const height=Math.max(58,rows.length*34+20);
          b.rows.push({summaryCard:true,icon:current.icon,label:current.label,rows,height});
          b.height+=height+8;
        }
      }
    }else if(line.type==='timeGrid'){
      b.rows=[];b.height=8;
      for(let i=0;i<line.cells.length;i+=2){
        const pair=line.cells.slice(i,i+2);
        const cells=pair.map(c=>({
          ...c,
          labelRows:reportWrapText(ctx,c.label,(content-30)/2-26,'700 19px -apple-system, sans-serif'),
          valueRows:reportWrapText(ctx,c.value,(content-30)/2-26,c.primary?'800 31px -apple-system, sans-serif':'700 24px -apple-system, sans-serif')
        }));
        const height=Math.max(78,...cells.map(c=>c.labelRows.length*24+c.valueRows.length*(c.primary?36:30)+18));
        b.rows.push({cells,height});b.height+=height+8;
      }
    }else if(line.type==='meta'){
      b.textRows=reportWrapText(ctx,line.text,content-16,font);b.height=b.textRows.length*32+10;
    }else if(line.type==='periodGrid'){
      b.height=Math.ceil(line.items.length/3)*78+4;
    }else if(line.type==='mvpCard'){
      b.titleRows=reportWrapText(ctx,line.title,content-24,'900 30px -apple-system, sans-serif');
      b.nameRows=reportWrapText(ctx,(line.names||[]).join(' ｜ '),content-24,mainFont);
      b.height=b.titleRows.length*34 + b.nameRows.length*32 + 28;
    }else if(line.type==='scorerGrid'){
      b.rows=[];b.height=48;
      for(let i=0;i<line.items.length;i+=2){
        const cells=line.items.slice(i,i+2).map(s=>reportWrapText(ctx,`${s.name}  ${'⚽'.repeat(s.goals)}`,(content-16)/2-20,font));
        const height=Math.max(...cells.map(c=>c.length))*32+14;
        b.rows.push({cells,height});b.height+=height;
      }
    }else if(line.type==='timelineHeading') b.height=76;
    else if(line.type==='timelinePhase') b.height=46;
    else if(line.type==='section') b.height=52;
    else if(line.type==='timelineEvent'){
      const compact=reportTimelineCompactParts(line);
      b.compact=compact;
      const combined=`${compact.main}${compact.assist?`  ${compact.assist}`:''}`;
      b.compactRows=reportWrapText(ctx,combined,content-310,mainFont);
      b.height=Math.max(58,b.compactRows.length*34+20);
    }else{
      b.textRows=reportWrapText(ctx,line.text||'',content-16,font);b.height=b.textRows.length*32+10;
    }
    y+=b.height;return b;
  });
  return {width,pad,content,height:Math.ceil(y+80),blocks};
}

function makeReportCanvas(lines=reportLines(),resolution=1){
  const measure=document.createElement('canvas');measure.width=1;measure.height=1;
  const mctx=measure.getContext('2d');
  if(!mctx) throw new Error('無法建立圖片');
  const layout=reportCanvasLayout(lines,mctx);measure.width=measure.height=1;
  const {width:W,height:H,pad,content,blocks}=layout;
  // 控制單張圖的記憶體用量；超長紀錄等比例縮放，不分頁、不刪除事件。
  const scale=Math.min(1,Math.sqrt(8000000/(W*H)),16000/H)*resolution;
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.floor(W*scale));canvas.height=Math.max(1,Math.floor(H*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx){canvas.width=canvas.height=1;throw new Error('無法繪製圖片');}
  ctx.scale(canvas.width/W,canvas.height/H);
  const font=(size,weight=500)=>`${weight} ${size}px -apple-system, BlinkMacSystemFont, sans-serif`;
  const text=(value,x,y,size=24,color='#b9c9d9',weight=500)=>{
    ctx.font=font(size,weight);ctx.fillStyle=color;ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText(String(value),x,y);
  };
  const emojiText=(value,x,y,size=26)=>{
    ctx.font=`${size}px Apple Color Emoji, -apple-system, sans-serif`;ctx.fillStyle='#eef4fb';ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText(String(value),x,y);
  };
  const centered=(value,x,y,size,color,weight=800)=>{
    ctx.font=font(size,weight);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='alphabetic';
    const metrics=ctx.measureText(String(value));
    const ascent=metrics.actualBoundingBoxAscent??size*.8, descent=metrics.actualBoundingBoxDescent??size*.2;
    ctx.fillText(String(value),x,y+(ascent-descent)/2);
  };
  const teamName=(value,cx,cy)=>{
    ctx.fillStyle='#f3f7fc';
    // v5.147：比分圖片的隊名優先單行顯示；必要時自動縮字，真的過長才拆兩行。
    drawTeamNameTwoLines(ctx,value,cx,cy,300,38,26);
  };
  ctx.fillStyle='#0b1220';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#111b26';roundRect(ctx,32,26,W-64,H-52,16,true,false);
  ctx.fillStyle='#1f6feb';ctx.fillRect(32,26,W-64,8);
  blocks.forEach((b,index)=>{
    const y=b.y;
    if(b.type==='title'){
      emojiText('⚽',pad,y+3,32);text(b.text,pad+44,y,40,'#f7fafc',800);
    }else if(b.type==='score'){
      ctx.fillStyle='#0c1724';roundRect(ctx,pad,y,content,138,18,true,false);
      ctx.strokeStyle=b.status==='比賽結束'?'#ff4f5f':'#30465b';ctx.lineWidth=b.status==='比賽結束'?4:2;roundRect(ctx,pad,y,content,138,18,false,true);
      ctx.fillStyle='#0b1420';roundRect(ctx,W/2-146,y+24,292,94,14,true,false);
      ctx.fillStyle=b.status==='比賽結束'?'#ff4f5f':'#235e7b';roundRect(ctx,W/2-84,y+3,168,28,14,true,false);
      centered(b.status,W/2,y+17,18,'#f7fafc',700);
      teamName(b.left,pad+162,y+72);teamName(b.right,W-pad-162,y+72);
      centered(b.score,W/2,y+76,72,'#ffffff');
    }else if(b.type==='metaGrid'){
      let rowY=y+2;
      b.rows.forEach(row=>{
        if(row.summaryCard){
          ctx.fillStyle='#162535';roundRect(ctx,pad,rowY,content,row.height,10,true,false);
          emojiText(row.icon,pad+18,rowY+14,28);
          row.rows.forEach((value,j)=>text(value,pad+62,rowY+12+j*34,28,'#c8d6e4',700));
          rowY+=row.height+8;
        }
      });
    }else if(b.type==='timeGrid'){
      let rowY=y+2;
      b.rows.forEach(row=>{
        const cellW=(content-12)/2;
        row.cells.forEach((cell,i)=>{
          const x=pad+i*(cellW+12);
          ctx.fillStyle='#162535';roundRect(ctx,x,rowY,cellW,row.height,10,true,false);
          text(cell.label,x+14,rowY+10,19,'#7dd3fc',800);
          cell.valueRows.forEach((value,j)=>text(value,x+14,rowY+36+j*(cell.primary?36:30),cell.primary?31:24,cell.primary?'#38bdf8':'#eef5fc',cell.primary?900:750));
        });
        rowY+=row.height+8;
      });
    }else if(b.type==='periodGrid'){
      b.items.forEach((p,i)=>{
        const x=pad+(i%3)*(content+16)/3, top=y+Math.floor(i/3)*78, w=(content-32)/3;
        ctx.fillStyle='#182837';roundRect(ctx,x,top,w,68,8,true,false);
        text(p.label,x+12,top+8,21,'#7dd3fc',750);text(p.duration,x+12,top+34,22,'#b9c9d9',650);
        ctx.font=font(25,800);ctx.textAlign='right';ctx.textBaseline='top';ctx.fillStyle='#eef5fc';ctx.fillText(p.score,x+w-12,top+34);
      });
    }else if(b.type==='mvpCard'){
      const topScorer=b.kind==='topScorer';
      ctx.fillStyle=topScorer?'#193d52':'#29412e';roundRect(ctx,pad,y,content,b.height-6,12,true,false);
      ctx.strokeStyle=topScorer?'rgba(56,189,248,.46)':'rgba(250,204,21,.46)';ctx.lineWidth=2;roundRect(ctx,pad,y,content,b.height-6,12,false,true);
      b.titleRows.forEach((value,j)=>text(value,pad+16,y+12+j*34,28,topScorer?'#7dd3fc':'#ffd84d',900));
      b.nameRows.forEach((value,j)=>text(value,pad+16,y+14+b.titleRows.length*34+j*32,26,'#f7fbff',800));
    }else if(b.type==='scorerGrid'){
      text('球員進球統計',pad+8,y+4,29,'#7dd3fc',800);let rowY=y+42;
      b.rows.forEach(row=>{
        const cellW=(content-12)/2;
        row.cells.forEach((cell,i)=>{
          const x=pad+i*(cellW+12);
          ctx.fillStyle='#182837';roundRect(ctx,x,rowY,cellW,row.height-6,8,true,false);
          cell.forEach((value,j)=>text(value,x+12,rowY+7+j*32,24,'#eaf3fc',700));
        });rowY+=row.height;
      });
    }else if(b.type==='timelineHeading'){
      text(b.text,pad+8,y+8,30,'#7dd3fc',800);
      ctx.fillStyle='#59c8f1';ctx.beginPath();ctx.arc(pad+16,y+57,6,0,Math.PI*2);ctx.fill();text('我方',pad+30,y+44,23,'#59c8f1',700);
      ctx.fillStyle='#ffad83';ctx.beginPath();ctx.arc(pad+120,y+57,6,0,Math.PI*2);ctx.fill();text('對手',pad+134,y+44,23,'#ffad83',700);
    }else if(b.type==='timelinePhase'){
      text(b.text,pad+8,y+10,25,'#b3c3d3',800);
      ctx.strokeStyle='#293c4e';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad,y+42);ctx.lineTo(W-pad,y+42);ctx.stroke();
    }else if(b.type==='timelineEvent'){
      const nodeX=pad+172, actorX=pad+200, isGoal=b.event==='GOAL';
      if(isGoal){ctx.fillStyle='#172b3c';roundRect(ctx,pad,y,content,b.height-4,8,true,false);}
      const next=blocks[index+1];
      if(next?.type==='timelineEvent'){
        ctx.strokeStyle='#30465b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(nodeX,y+24);ctx.lineTo(nodeX,y+b.height+24);ctx.stroke();
      }
      ctx.fillStyle=b.team==='OUR'?'#59c8f1':b.team==='OPP'?'#ffad83':'#aeb9c5';ctx.beginPath();ctx.arc(nodeX,y+24,7,0,Math.PI*2);ctx.fill();
      text(b.time,pad+8,y+10,24,'#b3c3d3',600);
      if(b.event==='YELLOW_CARD'||b.event==='RED_CARD'){
        ctx.fillStyle=b.event==='YELLOW_CARD'?'#ffd21f':'#ef3535';roundRect(ctx,actorX,y+12,17,27,2,true,false);
      }else{
        emojiText(emoji(b.event),actorX,y+8,28);
      }
      b.compactRows.forEach((value,j)=>text(value,actorX+38,y+8+j*34,28,'#edf5fc',isGoal?800:700));
      // 與螢幕摘要一致：只有進球事件顯示比分，使用單純暖黃色文字，不加膠囊外框。
      if(isGoal){
        const score=String(b.score||'');
        ctx.font=font(28,900);
        ctx.fillStyle='#ffd84d';
        ctx.textAlign='right';
        ctx.textBaseline='top';
        ctx.fillText(score,W-pad,y+10);
      }
    }else if(b.type==='section'){
      text(b.text,pad+8,y+12,28,'#7dd3fc',800);
    }else{
      (b.textRows||[]).forEach((value,j)=>text(value,pad+8,y+4+j*32));
    }
  });
  centered('足球場邊記錄器',W/2,H-42,20,'#8298ae',500);
  return canvas;
}

function roundRect(ctx,x,y,w,h,r,fill,stroke){
  if(w<2*r) r=w/2; if(h<2*r) r=h/2;
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  if(fill) ctx.fill(); if(stroke) ctx.stroke();
}

function stamp(){
  // 以本場開始時間作為固定識別；同一天多場比賽不會因隊伍與比分相同而撞名。
  const d=new Date(matchStartEpoch() || Date.now());
  const date=d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  const time=String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0')+String(d.getSeconds()).padStart(2,'0');
  return `${date}_${time}`;
}
function safeName(){
  return `${state.ourTeam||'OurTeam'}_VS_${state.oppTeam||'Opponent'}`.replace(/[\\/:*?"<>|]/g,'_');
}
function reportFilename(ext){
  return `${stamp()}_${safeName()}_${state.ourScore}-${state.oppScore}_summary.${ext}`;
}
function blobToObjectUrl(blob){ return URL.createObjectURL(blob); }

function dataURLToBlob(dataUrl){
  const parts=dataUrl.split(',');
  const mime=(parts[0].match(/data:([^;]+)/)||[])[1] || 'image/png';
  const binary=atob(parts[1]);
  const len=binary.length;
  const bytes=new Uint8Array(len);
  for(let i=0;i<len;i++) bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:mime});
}

// 預先讓瀏覽器完成字型量測；匯出時仍保持同步，以免 iOS Safari 遺失分享手勢權限。
if(document.fonts && document.fonts.ready){ document.fonts.ready.catch(()=>{}); }

function reportImagePages(){
  return [reportLines()];
}
function buildReportImageFile(){
  // 同步完成 Canvas → File，避免 iOS Safari 因等待 toBlob()
  // 而失去使用者點擊所提供的 share user activation。
  const lines=reportLines();
  let lastError;
  for(const resolution of [1,.75,.5]){
    let canvas;
    try{
      canvas=makeReportCanvas(lines,resolution);
      const data=canvas.toDataURL('image/png');
      if(!/^data:image\/png;base64,/.test(data)) throw new Error('圖片記憶體不足');
      const blob=dataURLToBlob(data);
      if(!blob.size) throw new Error('圖片內容為空');
      const image={file:new File([blob],reportFilename('png'),{type:'image/png'}),blob};
      return {...image,images:[image]};
    }catch(error){lastError=error;}
    finally{if(canvas) canvas.width=canvas.height=1;}
  }
  throw lastError || new Error('無法建立完整摘要圖片');
}

let reportImageUrls=[];
function showReportImageDownloads(images){
  reportImageUrls.forEach(url=>URL.revokeObjectURL(url));reportImageUrls=[];
  openReport();
  const box=byId('reportImageDownloads');
  box.replaceChildren();box.hidden=false;
  const title=document.createElement('p');title.textContent='完整比賽摘要已產生。';box.appendChild(title);
  images.forEach(({file,blob})=>{
    const url=URL.createObjectURL(blob);reportImageUrls.push(url);
    const a=document.createElement('a');a.href=url;a.download=file.name;
    a.textContent='下載完整摘要圖片';a.style.cssText='display:block;padding:14px;margin:8px 0;color:#bce6ff;background:#15334c;border-radius:10px';
    box.appendChild(a);
  });
  box.scrollIntoView({block:'nearest'});
}

function shareSummaryShortDate(epoch){
  const d=new Date(epoch || Date.now());
  return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}
function shareSummaryWeekday(epoch){
  const d=new Date(epoch || Date.now());
  return ['日','一','二','三','四','五','六'][d.getDay()];
}
function shareSummaryShortTime(epoch){
  const d=new Date(epoch || Date.now());
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function shareSummaryText(){
  const start=matchStartEpoch() || Date.now();
  const our=String(state.ourTeam||'我方').trim() || '我方';
  const opp=String(state.oppTeam||'').trim() || '對手';
  const dayMatchLabel=formatDayMatchLabel(state.dayMatchNumber);
  // v5.179：LINE／訊息 App 以「賽果＋日期／本日場次」辨識一天多場比賽。
  // 星期採日期自動計算；本日場次為系統預填並在開賽後鎖定。
  return [
    `⚽ ${our} ${state.ourScore}：${state.oppScore} ${opp}`,
    `${shareSummaryShortDate(start)} (${shareSummaryWeekday(start)})${dayMatchLabel?`｜${dayMatchLabel}`:''}`
  ].join('\n');
}

async function shareImageFile(mode='share'){
  let result;
  try{
    result=buildReportImageFile();
  }catch(e){
    console.error(e);
    alert('圖片產生失敗，請再試一次。');
    return;
  }

  const {images}=result;
  const files=images.map(image=>image.file);

  if(navigator.share && navigator.canShare && navigator.canShare({files})){
    try{
      // 必須在按鈕點擊後直接呼叫 navigator.share()
      const shareData={
        title:'比賽摘要',
        files
      };
      // v5.153：分享到 LINE 等訊息 App 維持一欄一行；賽果採標題式間距，日期含星期。
      // 僅保留圖示＋內容；未填的賽事／場地不輸出。
      // 儲存圖片模式仍不附帶文字，避免「儲存影像」流程出現多餘訊息。
      if(mode!=='save') shareData.text=shareSummaryText();
      await navigator.share(shareData);
      return;
    }catch(e){
      if(e && e.name==='AbortError') return;
      console.warn('Share failed, fallback to download:', e);
    }
  }

  // 非 iOS / 不支援 Web Share files：改用一般下載。
  showReportImageDownloads(images);
}

function shareReportImage(){
  return shareImageFile('share');
}
function saveReportImage(){
  // iPhone Safari 沒有網頁直接寫入 Photos 的權限；
  // 正確做法是叫出系統分享面板，再選「儲存影像」。
  return shareImageFile('save');
}

function escapeHtml(s){
  return String(s??'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function reportHTMLText(){
  const goals=state.markers.filter(m=>m.event==='GOAL');
  const others=state.markers.filter(m=>m.event!=='GOAL');
  const goalHtml=goals.length ? goals.map((m,i)=>{
    const team=markerPlayerTeamDisplay(m);
    const num=m.player_number?` #${m.player_number}`:'';
    const assist=(!m.own_goal && m.assist_number)?`　助攻 #${escapeHtml(m.assist_number)}`:'';
    const goalLabel=m.own_goal?'烏龍球':'進球';
    return `<li><span>${fmtMMSS(m.seconds)}</span> 第${i+1}球　⚽ ${goalLabel} · ${escapeHtml(team+num)}${m.own_goal?'（烏龍）':''}${assist} <b>${escapeHtml(m.score_after||'')}</b></li>`;
  }).join('') : '<li>尚未標記進球事件</li>';
  const otherHtml=others.length ? others.map(m=>{
    const team=teamDisplay(m.team);
    return `<li><span>${fmtMMSS(m.seconds)}</span> ${emoji(m.event)} ${escapeHtml(m.second_yellow?'紅牌（兩黃）':eventLabel(m.event))}${team ? ' · '+escapeHtml(team) : ''}${m.player_number ? ' #'+escapeHtml(m.player_number) : ''} <b>${escapeHtml(m.score_after||'')}</b></li>`;
  }).join('') : '<li>尚未標記其他精彩事件</li>';
  let diff='';
  if(state.regulationMinutes && state.finished){
    const d=Math.round(state.finalElapsed-regulationTargetSeconds());
    diff=`<p><b>比賽時間：</b>${escapeHtml(regulationDisplayText())}　<b>${d<0?'提前':'超過'}：</b>${fmtMMSS(Math.abs(d))}</p>`;
  }
  const mvpInfo=scorerMVPInfo();
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>足球比賽摘要</title><style>
body{font-family:-apple-system,BlinkMacSystemFont,"PingFang TC",sans-serif;background:#0f1720;color:#f8fafc;margin:0;padding:24px}
.wrap{max-width:720px;margin:auto}.card{background:#16202b;border:1px solid #334155;border-radius:18px;padding:22px;margin-bottom:16px}
h1{font-size:24px}.score{font-size:44px;font-weight:900;text-align:center}.teams{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;text-align:center;font-weight:800}
.meta{color:#aeb9c5;text-align:center;margin-top:10px}h2{font-size:16px;color:#38bdf8}ul{list-style:none;padding:0;margin:0}li{padding:10px 0;border-bottom:1px solid #334155}li span{display:inline-block;width:90px;color:#facc15}.note{font-size:12px;color:#64748b;text-align:center}


/* =========================================================
   v5.26 Header proportion refinement
   - Header pitch height reduced about 10–12%.
   - Side penalty / goal-area markings inset about 8–10px.
   - Center circle size intentionally unchanged.
   - No change to header typography or CTA hierarchy.
   ========================================================= */
.titleBlock{
  min-height:52px!important;
  padding:6px 10px!important;
}

.titleBlock::after{
  background-image:
    radial-gradient(circle at 50% 50%,rgba(238,248,241,.30) 0 2.4px,transparent 2.8px),
    radial-gradient(circle at 50% 50%,transparent 0 25px,rgba(238,248,241,.18) 25px 27px,transparent 27.5px),
    linear-gradient(90deg,transparent 0 calc(50% - 1px),rgba(238,248,241,.20) calc(50% - 1px) calc(50% + 1px),transparent calc(50% + 1px) 100%),
    url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAxMDAwIDEyMCcgcHJlc2VydmVBc3BlY3RSYXRpbz0nbm9uZSc+CiAgPGcgZmlsbD0nbm9uZScgc3Ryb2tlPScjZWVmOGYxJyBzdHJva2UtbGluZWNhcD0nc3F1YXJlJyBzdHJva2UtbGluZWpvaW49J21pdGVyJz4KICAgIDxwYXRoIGQ9J00xMiAxOCBIMTIwIFYxMDIgSDEyJyBzdHJva2Utb3BhY2l0eT0nLjE3JyBzdHJva2Utd2lkdGg9JzInIHZlY3Rvci1lZmZlY3Q9J25vbi1zY2FsaW5nLXN0cm9rZScvPgogICAgPHBhdGggZD0nTTEyIDQwIEg2MCBWODAgSDEyJyBzdHJva2Utb3BhY2l0eT0nLjIyJyBzdHJva2Utd2lkdGg9JzInIHZlY3Rvci1lZmZlY3Q9J25vbi1zY2FsaW5nLXN0cm9rZScvPgogICAgPHBhdGggZD0nTTk4OCAxOCBIODgwIFYxMDIgSDk4OCcgc3Ryb2tlLW9wYWNpdHk9Jy4xNycgc3Ryb2tlLXdpZHRoPScyJyB2ZWN0b3ItZWZmZWN0PSdub24tc2NhbGluZy1zdHJva2UnLz4KICAgIDxwYXRoIGQ9J005ODggNDAgSDk0MCBWODAgSDk4OCcgc3Ryb2tlLW9wYWNpdHk9Jy4yMicgc3Ryb2tlLXdpZHRoPScyJyB2ZWN0b3ItZWZmZWN0PSdub24tc2NhbGluZy1zdHJva2UnLz4KICA8L2c+Cjwvc3ZnPg==")!important;
  background-position:center,center,center,center!important;
  background-size:100% 100%,100% 100%,100% 100%,100% 100%!important;
  background-repeat:no-repeat!important;
}

@media(max-width:390px){
  .titleBlock{
    min-height:50px!important;
    padding:6px 8px!important;
  }
  .titleBlock::after{
    background-image:
      radial-gradient(circle at 50% 50%,rgba(238,248,241,.30) 0 2.2px,transparent 2.6px),
      radial-gradient(circle at 50% 50%,transparent 0 23px,rgba(238,248,241,.18) 23px 25px,transparent 25.5px),
      linear-gradient(90deg,transparent 0 calc(50% - .9px),rgba(238,248,241,.20) calc(50% - .9px) calc(50% + .9px),transparent calc(50% + .9px) 100%),
      url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAxMDAwIDEyMCcgcHJlc2VydmVBc3BlY3RSYXRpbz0nbm9uZSc+CiAgPGcgZmlsbD0nbm9uZScgc3Ryb2tlPScjZWVmOGYxJyBzdHJva2UtbGluZWNhcD0nc3F1YXJlJyBzdHJva2UtbGluZWpvaW49J21pdGVyJz4KICAgIDxwYXRoIGQ9J00xMiAxOCBIMTIwIFYxMDIgSDEyJyBzdHJva2Utb3BhY2l0eT0nLjE3JyBzdHJva2Utd2lkdGg9JzInIHZlY3Rvci1lZmZlY3Q9J25vbi1zY2FsaW5nLXN0cm9rZScvPgogICAgPHBhdGggZD0nTTEyIDQwIEg2MCBWODAgSDEyJyBzdHJva2Utb3BhY2l0eT0nLjIyJyBzdHJva2Utd2lkdGg9JzInIHZlY3Rvci1lZmZlY3Q9J25vbi1zY2FsaW5nLXN0cm9rZScvPgogICAgPHBhdGggZD0nTTk4OCAxOCBIODgwIFYxMDIgSDk4OCcgc3Ryb2tlLW9wYWNpdHk9Jy4xNycgc3Ryb2tlLXdpZHRoPScyJyB2ZWN0b3ItZWZmZWN0PSdub24tc2NhbGluZy1zdHJva2UnLz4KICAgIDxwYXRoIGQ9J005ODggNDAgSDk0MCBWODAgSDk4OCcgc3Ryb2tlLW9wYWNpdHk9Jy4yMicgc3Ryb2tlLXdpZHRoPScyJyB2ZWN0b3ItZWZmZWN0PSdub24tc2NhbGluZy1zdHJva2UnLz4KICA8L2c+Cjwvc3ZnPg==")!important;
  }
}

</style>
<style id="v5132FullTimeSafariActionVisibility">
/* =========================================================
   v5.133：摘要基本資料改為單欄逐列呈現
   - 比賽日期、比賽賽事、比賽場地各自獨立一列，長文字不再與其他欄位並排擠壓。
   - 分享／儲存圖片的摘要資料同步採用單欄三列。

   v5.132：全場底部輸出列 Safari 可視性精修
   問題：v5.130 將賽事 / 場地改為上下滿版後，全場頁垂直內容增加；
         在 iPhone Safari 展開底部工具列時，摘要 / CSV / 新比賽可能落在工具列後方。
   原則：
   1. 不改三顆按鈕的資訊架構與顏色。
   2. 只在較矮的手機可視區做 compact density，優先回收非核心留白。
   3. 保留更大的真實頁尾安全區，使用者往下滑可把整列按鈕完整拉出工具列。
   ========================================================= */

/* 全場頁的尾端安全距離重新拉高，避免後續舊規則把 safe tail 縮到 104~112px。 */
body.resultMode.finalOutputVisible{
  --result-bottom-safe-tail:max(188px, calc(var(--browser-bottom-gap,0px) + 96px))!important;
}
body.resultMode.finalOutputVisible .fullTimeBottomSpacer{
  display:block!important;
  height:calc(var(--result-bottom-safe-tail) + env(safe-area-inset-bottom))!important;
  min-height:calc(var(--result-bottom-safe-tail) + env(safe-area-inset-bottom))!important;
}
body.resultMode.finalOutputVisible .wrap{
  scroll-padding-bottom:calc(var(--result-bottom-safe-tail) + env(safe-area-inset-bottom))!important;
}
body.resultMode.finalOutputVisible .finalToolsCard{
  scroll-margin-bottom:calc(var(--result-bottom-safe-tail) + env(safe-area-inset-bottom))!important;
}

/* iPhone 主流尺寸：先回收全場賽事 / 場地、比分卡與工具列的非必要高度。 */
@media(max-width:430px) and (max-height:950px){
  body.resultMode .liveMetaStrip.show{
    gap:4px!important;
    margin:0 1px 5px!important;
  }
  body.resultMode .liveMetaStrip .matchMetaDisplayRow{
    min-height:36px!important;
    padding:5px 10px!important;
    border-radius:10px!important;
  }
  body.resultMode .liveMetaStrip .matchMetaDisplayIcon{
    font-size:15.5px!important;
  }
  body.resultMode .liveMetaStrip .matchMetaDisplayValue{
    font-size:14.5px!important;
    line-height:1.16!important;
  }
  body.resultMode .liveMetaStrip .metaGroupEditBtn{
    width:30px!important;
    min-width:30px!important;
    height:30px!important;
    min-height:30px!important;
    right:7px!important;
  }

  body.resultMode .broadcastStage.full{
    min-height:48px!important;
    padding:6px 10px!important;
  }
  body.resultMode .broadcastStage.full .stageLabel{
    font-size:16.5px!important;
  }
  body.resultMode .broadcastStage.full .stageTimer{
    font-size:25px!important;
  }
  body.resultMode .scoreRow{
    padding-top:6px!important;
    padding-bottom:6px!important;
  }
  body.resultMode .timeSummary:not(.open){
    margin-top:3px!important;
    margin-bottom:3px!important;
  }
  body.resultMode .timeSummary:not(.open) .timeHead{
    min-height:40px!important;
    padding-top:4px!important;
    padding-bottom:4px!important;
  }

  body.resultMode.finalOutputVisible .resultEventsGroup{
    margin-bottom:5px!important;
  }

  /* 三顆全場工具仍維持大於 44px 的觸控高度，只縮掉 4px 非必要高度。 */
  body.resultMode.finalOutputVisible .finalToolsCard{
    margin-top:4px!important;
    padding:5px!important;
  }
  body.resultMode.finalOutputVisible .finalToolBtn{
    height:48px!important;
    min-height:48px!important;
  }

  body.resultMode.finalOutputVisible{
    --result-bottom-safe-tail:max(204px, calc(var(--browser-bottom-gap,0px) + 104px))!important;
  }
}

/* 較窄 iPhone 再多留一級安全尾端，不再縮小按鈕。 */
@media(max-width:390px){
  body.resultMode.finalOutputVisible{
    --result-bottom-safe-tail:max(216px, calc(var(--browser-bottom-gap,0px) + 110px))!important;
  }
}

@media(max-width:375px){
  body.resultMode.finalOutputVisible{
    --result-bottom-safe-tail:max(228px, calc(var(--browser-bottom-gap,0px) + 116px))!important;
  }
}
</style>


<style id="v5142ReportSafariChromeTintFix">
/* =========================================================
   v5.143：摘要時間軸單列緊湊格式
   根因：v5.141 將摘要 Modal 幾乎貼到 visual viewport 最底部，
   藍色「分享／儲存圖片」成為 Safari 底部瀏覽器列附近最主要的背景色，
   透明 / 半透明瀏覽器工具列因此被染成大面積亮藍。

   修正：
   1. 仍讓摘要比舊版更靠下，但保留一小段深色安全緩衝帶。
   2. Modal 高度扣除同等底部緩衝，避免內容伸到瀏覽器 chrome 下方。
   3. 分享按鈕本身不改藍色；進球比分暖黃強調也完整保留。
   ========================================================= */
@media(max-width:430px){
  #reportModal{
    align-items:flex-end!important;
    padding:6px 5px 12px!important;
    background:rgba(0,0,0,.76)!important;
  }
  #reportModal .reportModal{
    width:min(calc(100vw - 10px),560px)!important;
    height:calc(var(--vv-height,100dvh) - 18px)!important;
    max-height:calc(var(--vv-height,100dvh) - 18px)!important;
  }
  #reportModal .reportActions.oneReportAction{
    flex-basis:48px!important;
    min-height:48px!important;
    padding:2px 8px 2px!important;
    background:#0f1720!important;
  }
  #reportModal .reportActions.oneReportAction #reportShareBtn{
    min-height:44px!important;
    height:44px!important;
    margin:0!important;
  }
}
</style>


<style id="v5174BestScorerBadgePatch">
/* =========================================================
   v5.177：摘要／分享圖片的最佳進球員圖示
   - 球員進球統計中，最高進球數的球員（可並列）加上「🏅 最佳進球員」圖示。
   - 只強調榜首，不改變原本進球統計排序與資料來源。
   ========================================================= */
#reportModal .scorerRow.bestScorer{
  background:linear-gradient(180deg,rgba(72,54,16,.34),rgba(32,45,63,.96))!important;
  box-shadow:inset 0 0 0 1px rgba(250,204,21,.18)!important;
}
#reportModal .scorerName{
  display:flex!important;
  flex-direction:column!important;
  align-items:flex-start!important;
  gap:4px!important;
}
#reportModal .scorerBestBadge{
  display:inline-flex!important;
  align-items:center!important;
  gap:5px!important;
  padding:2px 8px!important;
  border-radius:999px!important;
  background:rgba(250,204,21,.13)!important;
  border:1px solid rgba(250,204,21,.26)!important;
  color:#fcd34d!important;
  font-size:11px!important;
  font-weight:950!important;
  line-height:1.1!important;
  letter-spacing:.02em!important;
}
#reportModal .scorerPlayerName{
  display:block!important;
  color:#eaf3fc!important;
  font-weight:800!important;
}
#reportModal .scorerBalls{
  display:block!important;
  margin-top:1px!important;
}
@media(max-width:390px){
  #reportModal .scorerBestBadge{font-size:10.5px!important;padding:2px 7px!important;}
}
</style>


<style id="v5181MetaBadgeSpacingFix">
/* v5.183：修正比賽中「賽事階段／輪次」與「本日場次」徽章過近、擠壓問題 */
.liveMetaStrip .matchMetaDisplayValue.withMetaBadges{
  display:flex!important;
  flex-wrap:wrap!important;
  align-items:center!important;
  gap:8px 8px!important;
}
.liveMetaStrip .matchMetaDisplayValue.withMetaBadges .competitionNameText{
  flex:0 1 auto!important;
  min-width:0!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
  white-space:nowrap!important;
  margin-right:2px!important;
}
.liveMetaStrip .competitionMetaBadges{
  display:inline-flex!important;
  flex-wrap:wrap!important;
  align-items:center!important;
  gap:8px!important;
  min-width:0!important;
  max-width:100%!important;
}
.liveMetaStrip .competitionStageBadge,
.liveMetaStrip .dayMatchBadge{
  flex:0 0 auto!important;
  max-width:none!important;
  min-height:24px!important;
  padding:4px 9px!important;
  white-space:nowrap!important;
}
@media(max-width:390px){
  .liveMetaStrip .matchMetaDisplayValue.withMetaBadges{gap:7px 7px!important;}
  .liveMetaStrip .competitionMetaBadges{gap:7px!important;}
  .liveMetaStrip .competitionStageBadge,
  .liveMetaStrip .dayMatchBadge{padding:4px 8px!important;min-height:23px!important;}
}
</style>

</head><body><div class="wrap">
<div class="card"><h1>⚽ 足球比賽摘要</h1><div class="teams"><div>${escapeHtml(state.ourTeam||'我方')}</div><div class="score">${state.ourScore} : ${state.oppScore}</div><div>${escapeHtml(state.oppTeam||'對手')}</div></div><div class="meta"><div>📅 ${escapeHtml(matchDateLabel(matchStartEpoch(),matchEndEpoch()))}${formatDayMatchLabel(state.dayMatchNumber)?`｜${escapeHtml(formatDayMatchLabel(state.dayMatchNumber))}`:''}</div>${(state.competition||state.competitionStage)?`<div>🏆 ${escapeHtml([state.competition,state.competitionStage].filter(Boolean).join('｜'))}</div>`:''}${state.venue?`<div>📍 ${escapeHtml(state.venue)}</div>`:''}</div></div>
${state.penalty?`<div class="card"><h2>PK 點球大戰</h2><p class="score">${penaltyGoals('our')} : ${penaltyGoals('opp')}</p><ul>${Array.from({length:Math.max(state.penalty.our.length,state.penalty.opp.length)},(_,i)=>{const a=state.penalty.our[i]||emptyPenaltyKick(),b=state.penalty.opp[i]||emptyPenaltyKick();if(!a.result&&!b.result&&!a.number&&!b.number)return '';const fmt=k=>`${k.number?'#'+escapeHtml(k.number):'無背號'} ${k.result==='GOAL'?'✓ 進球':k.result==='MISS'?'× 未進':'○ 待定'}`;return `<li>第${i+1}輪｜${escapeHtml(state.ourTeam||'我方')} ${fmt(a)}｜${escapeHtml(state.oppTeam||'對手')} ${fmt(b)}</li>`}).join('')}</ul></div>`:''}
<div class="card"><h2>時間紀錄</h2><p><b>開始：</b>${escapeHtml(fmtReportBoundary(matchStartEpoch(),matchStartEpoch(),matchEndEpoch()))}</p><p><b>結束：</b>${escapeHtml(fmtReportBoundary(matchEndEpoch(),matchStartEpoch(),matchEndEpoch()))}${isCrossDay(matchStartEpoch(),matchEndEpoch())?'　<b>跨日</b>':''}</p><p><b>實際比賽時間：</b>${escapeHtml(fmtDurationReadable(totalMatchElapsed()))}</p>${state.halftimeStartEpoch?`<p><b>中場開始：</b>${escapeHtml(fmtClock(state.halftimeStartEpoch))}<br><b>中場結束：</b>${escapeHtml(state.halftimeEndEpoch?fmtClock(state.halftimeEndEpoch):'--:--:--')}<br><b>中場休息：</b>${escapeHtml(fmtMMSS(halftimeElapsed()))}</p>`:''}${diff}</div>
${mvpInfo?`<div class="card"><h2>${escapeHtml(mvpInfo.title)}</h2><p>${mvpInfo.winners.map(s=>escapeHtml(s.name)).join(' ｜ ')}</p></div>`:''}
<div class="card"><h2>球員進球統計</h2><ul>${scorerStats().length ? scorerStats().map(s=>`<li>${escapeHtml(s.name)} <b>${'⚽'.repeat(s.goals)}</b></li>`).join('') : '<li>尚無可統計的球員背號進球資料</li>'}</ul></div>
<div class="card"><h2>進球紀錄</h2><ul>${goalHtml}</ul></div>
<div class="card"><h2>其他精彩標記事件</h2><ul>${otherHtml}</ul></div>

</div>
<style id="v5158FullTimeSafariActionsPatch">
/* =========================================================
   v5.160：全場底部三顆操作按鈕避開 iPhone Safari 工具列
   問題：一般文件流雖有尾端 spacer，但 Safari 展開底部工具列時，
         三顆按鈕仍可能停在工具列後方，看起來像被裁切。
   修正：iOS 瀏覽器模式下，賽後操作列固定停在瀏覽器工具列上方；
         同時保留真實頁尾空間，避免固定列遮住最後一段內容。
   ========================================================= */
@media (max-width:430px){
  html.iosBrowserUI body.resultMode.finalOutputVisible:not(.keyboardOpen) .finalToolsCard{
    position:fixed!important;
    left:max(10px, env(safe-area-inset-left,0px))!important;
    right:max(10px, env(safe-area-inset-right,0px))!important;
    bottom:calc(max(76px, var(--browser-bottom-gap,0px)) + env(safe-area-inset-bottom,0px))!important;
    width:auto!important;
    margin:0!important;
    z-index:88!important;
    padding:6px!important;
    border-radius:18px!important;
    box-shadow:
      0 16px 34px rgba(0,0,0,.34),
      inset 0 1px 0 rgba(255,255,255,.06)!important;
  }

  /* 固定操作列不佔文件流，因此在頁尾補足真實可捲動空間。 */
  html.iosBrowserUI body.resultMode.finalOutputVisible .fullTimeBottomSpacer{
    display:block!important;
    height:calc(max(220px, calc(var(--browser-bottom-gap,0px) + 132px)) + env(safe-area-inset-bottom,0px))!important;
    min-height:calc(max(220px, calc(var(--browser-bottom-gap,0px) + 132px)) + env(safe-area-inset-bottom,0px))!important;
  }
  html.iosBrowserUI body.resultMode.finalOutputVisible .wrap{
    padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))!important;
    scroll-padding-bottom:calc(max(220px, calc(var(--browser-bottom-gap,0px) + 132px)) + env(safe-area-inset-bottom,0px))!important;
  }

  /* 鍵盤開啟時延續既有行為：不讓固定列擋住輸入。 */
  html.iosBrowserUI body.keyboardOpen .finalToolsCard{
    display:none!important;
  }
}
</style>

</body></html>`;
}
function downloadReportHTML(){
  downloadBlob(reportHTMLText(), 'text/html;charset=utf-8', reportFilename('html'));
}

/* Export data */
function csvEscape(v){
  const s=String(v??'');
  return /[",\n]/.test(s) ? '"' + s.replaceAll('"','""') + '"' : s;
}
function diffSecondsExport(){
  if(!state.regulationMinutes || !state.finished) return '';
  return Math.round(state.finalElapsed-regulationTargetSeconds());
}
function csvText(){
  saveState();
  const rows=[['our_team','opponent_team','venue','competition','competition_stage','day_match_number','roster_numbers','start_datetime','end_datetime','duration_seconds','regulation_minutes','diff_seconds','final_our_score','final_opponent_score','period','period_label','time','seconds','event','team','player_number','assist_number','score_after','recorded_at']];
  if(state.markers.length===0){
    rows.push([
      state.ourTeam, state.oppTeam, state.venue, state.competition, state.competitionStage, state.dayMatchNumber||'', currentRosterNumbers().join('|'),
      matchStartEpoch()?fmtDateTime(matchStartEpoch()):'',
      matchEndEpoch()?fmtDateTime(matchEndEpoch()):'',
      Math.floor(state.finished?state.finalElapsed:totalMatchElapsed()),
      state.regulationMinutes||'',
      diffSecondsExport(),
      state.ourScore, state.oppScore,
      '', '', '', '', '', '', '', '', '', ''
    ]);
  }else{
    state.markers.forEach(m=>{
      const markerSeconds=wholeSecondMarkerSeconds(m.seconds);
      rows.push([
        state.ourTeam, state.oppTeam, state.venue, state.competition, state.competitionStage, state.dayMatchNumber||'', currentRosterNumbers().join('|'),
        state.startEpoch?fmtDateTime(matchStartEpoch()):'',
        state.endEpoch?fmtDateTime(matchEndEpoch()):'',
        Math.floor(state.finished?state.finalElapsed:0),
        state.regulationMinutes||'',
        diffSecondsExport(),
        state.ourScore, state.oppScore,
        m.period||1,
        state.multiPeriod?periodLabel(m.period||1):'全場',
        fmtMMSS(markerSeconds),
        markerSeconds,
        m.event,
        m.team||'',
        m.player_number||'',
        m.assist_number||'',
        m.score_after||'',
        m.recorded_at
      ]);
    });
  }
  if(state.penalty){
    const count=Math.max(state.penalty.our.length,state.penalty.opp.length);
    for(let i=0;i<count;i++){
      ['our','opp'].forEach(side=>{
        const k=state.penalty[side]?.[i];
        if(!k || (!k.result && !k.number)) return;
        rows.push([
          state.ourTeam,state.oppTeam,state.venue,state.competition,state.competitionStage,state.dayMatchNumber||'',currentRosterNumbers().join('|'),
          matchStartEpoch()?fmtDateTime(matchStartEpoch()):'',
          matchEndEpoch()?fmtDateTime(matchEndEpoch()):'',
          Math.floor(state.finished?state.finalElapsed:totalMatchElapsed()),
          state.regulationMinutes||'',diffSecondsExport(),state.ourScore,state.oppScore,
          'PK','PK 點球',`第${i+1}點`,'',k.result==='GOAL'?'PENALTY_GOAL':k.result==='MISS'?'PENALTY_MISS':'PENALTY_PENDING',
          side==='our'?'OUR':'OPP',k.number||'','',`PK ${penaltyGoals('our')}:${penaltyGoals('opp')}`,state.penalty.endEpoch||state.penalty.startEpoch||''
        ]);
      });
    }
  }
  return '\ufeff'+rows.map(r=>r.map(csvEscape).join(',')).join('\n');
}
function csvFilename(){
  return `${stamp()}_${safeName()}_${state.ourScore}-${state.oppScore}_markers.csv`;
}
function downloadBlob(content, type, name){
  const blob = content instanceof Blob ? content : new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
function downloadCSV(){ downloadBlob(csvText(), 'text/csv;charset=utf-8', csvFilename()); }
function downloadJSON(){
  saveState();
  downloadBlob(JSON.stringify(state, null, 2), 'application/json', `${stamp()}_${safeName()}_backup.json`);
}
async function shareCSV(){
  const file=new File([csvText()], csvFilename(), {type:'text/csv'});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{
      await navigator.share({
        title:'足球精彩標記 CSV',
        text:`${state.ourTeam||'我方'} ${state.ourScore}:${state.oppScore} ${state.oppTeam||'對手'}${state.competition?`｜${state.competition}`:''}${state.competitionStage?`｜${state.competitionStage}`:''}${formatDayMatchLabel(state.dayMatchNumber)?`｜${formatDayMatchLabel(state.dayMatchNumber)}`:''}｜${state.venue||'未填比賽場地'}`,
        files:[file]
      });
      return;
    }catch(e){
      if(e.name==='AbortError') return;
    }
  }
  alert('這個瀏覽器目前無法直接分享檔案，將改為下載 CSV。');
  downloadCSV();
}


['ourTeam','oppTeam'].forEach(id=>{
  byId(id).addEventListener('click',e=>e.stopPropagation());
});

function isImeComposing(e){
  return Boolean(e?.isComposing || e?.keyCode===229 || e?.target?.dataset?.composing==='true');
}

const matchTextInputIds=['ourTeam','oppTeam','venue','competition','competitionStage'];
matchTextInputIds.forEach(id=>{
  const el=byId(id);
  if(!el) return;
  el.addEventListener('compositionstart',()=>{
    el.dataset.composing='true';
  });
  el.addEventListener('compositionend',()=>{
    el.dataset.composing='false';
    // 等注音候選字正式寫回 input 後再儲存，避免 render 中斷組字。
    requestAnimationFrame(()=>{
      if(containsBopomofo(el.value)) return;
      saveState();
      render();
      if(id==='competition' && byId('competitionStageMenu')?.classList.contains('open')){
        renderCompetitionStageMenu();
        requestAnimationFrame(positionCompetitionStageMenu);
      }
    });
  });
});

['ourTeam','oppTeam','venue','competition','competitionStage'].forEach(id=>{
  byId(id).addEventListener('input', e=>{
    // 注音／倉頡等中文輸入法組字期間不重繪畫面。
    if(isImeComposing(e)) return;
    if(containsBopomofo(e.target.value)){
      e.target.classList.add('requiredError');
      return;
    }
    e.target.classList.remove('requiredError');
    if(id==='ourTeam' && byId('ourTeam').value.trim()){
      byId('ourTeam').classList.remove('requiredError');
    }
    saveState();
    render();
    if(id==='competition' && byId('competitionStageMenu')?.classList.contains('open')){
      renderCompetitionStageMenu();
      requestAnimationFrame(positionCompetitionStageMenu);
    }
  });
});

// 賽前輸入流程引導：我方 → 對手 → 賽事名稱 → 場地。
// iOS 中文鍵盤的「✓ / 完成」有時只觸發 blur、不送 Enter，
// 因此 keydown + blur 都支援；對手、賽事名稱、場地皆為選填。
function isPreMatchGuidedSetup(){
  return !state.started && !state.finished;
}

function focusCompetitionField(){
  const el=byId('competition');
  if(!el) return;
  guidedSetupStep='competition';
  setTimeout(()=>{
    el.classList.add('guidedInput');
    el.focus();
    try{ el.setSelectionRange(el.value.length,el.value.length); }catch(e){}
  },40);
}

function focusCompetitionStageField(){
  const el=byId('competitionStage');
  if(!el) return;
  guidedSetupStep='competitionStage';
  setTimeout(()=>{
    el.classList.add('guidedInput');
    el.focus();
    try{ el.setSelectionRange(el.value.length,el.value.length); }catch(e){}
  },40);
}

function focusVenueField(){
  const el=byId('venue');
  if(!el) return;
  guidedSetupStep='venue';
  setTimeout(()=>{
    el.classList.add('guidedInput');
    el.focus();
    try{ el.setSelectionRange(el.value.length,el.value.length); }catch(e){}
  },40);
}

function advanceGuidedSetup(from){
  if(!isPreMatchGuidedSetup()) return false;
  if(guidedSetupStep!==from) return false;

  if(from==='our'){
    // v4.93：我方名稱為選填；空白也可繼續設定其他賽前資料。
    const value=validateTextField('ourTeam','我方隊伍名稱',false,15);
    if(value===null){
      guidedSetupStep='our';
      focusMatchRequiredField('ourTeam');
      return false;
    }

    saveState();
    byId('ourTeamBox').classList.remove('editing');
    updateTeamNameDisplays();

    guidedSetupStep='opp';
    setTimeout(()=>editTeamName('oppTeam'),40);
    return true;
  }

  if(from==='opp'){
    // 對手為選填；空白也可直接進入下一欄。
    const value=validateTextField('oppTeam','對手隊伍名稱',false,15);
    if(value===null) return false;

    saveState();
    byId('oppTeamBox').classList.remove('editing');
    updateTeamNameDisplays();

    // v5.178：新比賽會沿用賽事名稱與場地，但「賽事階段／輪次」刻意清空。
    // 因此輸入新對手後，只再提醒確認本場階段／輪次，不要求重填其他沿用資料。
    if(nextMatchOpponentOnly){
      byId('oppTeam')?.classList.remove('guidedInput');
      focusCompetitionStageField();
      return true;
    }

    focusCompetitionField();
    return true;
  }

  if(from==='competition'){
    const value=validateTextField('competition','比賽賽事',false,40);
    if(value===null) return false;

    state.competition=value;
    saveState();
    byId('competition').classList.remove('guidedInput');

    focusCompetitionStageField();
    return true;
  }

  if(from==='competitionStage'){
    const value=validateTextField('competitionStage','賽事階段／輪次',false,24);
    if(value===null) return false;

    state.competitionStage=value;
    saveState();
    byId('competitionStage').classList.remove('guidedInput');

    if(nextMatchOpponentOnly){
      nextMatchOpponentOnly=false;
      guidedSetupStep=null;
      byId('competitionStage')?.blur();
      return true;
    }

    focusVenueField();
    return true;
  }

  if(from==='venue'){
    const value=validateTextField('venue','比賽場地',false,30);
    if(value===null) return false;

    saveState();

    // 只完成本場輸入，不加入最近場地。
    guidedSetupStep=null;
    byId('venue').classList.remove('guidedInput');
    byId('venue').blur();
    return true;
  }

  return false;
}


function clearInactivePreMatchFieldFocus(activeId){
  if(!document.body.classList.contains('matchStatePre')) return;

  ['ourTeam','oppTeam'].forEach(id=>{
    if(id===activeId) return;
    byId(id)?.classList.remove('guidedInput');
    byId(id+'Box')?.classList.remove('editing');
  });

  ['competition','competitionStage','venue'].forEach(id=>{
    if(id===activeId) return;
    byId(id)?.classList.remove('guidedInput');
  });

  // 讓剛離開編輯狀態的隊名立即回到正常文字顯示。
  updateTeamNameDisplays();
}

// 我方：只要在賽前進入編輯，就視為導引起點。
// 因此即使我方原本已有記憶值，重新編輯後按 ✓ 仍會自動跳到對手。
byId('ourTeam').addEventListener('focus', ()=>{
  clearInactivePreMatchFieldFocus('ourTeam');
  byId('ourTeamBox').classList.add('editing');
  byId('ourTeam').classList.add('guidedInput');
  if(isPreMatchGuidedSetup()) guidedSetupStep='our';
});

byId('oppTeam').addEventListener('focus', ()=>{
  clearInactivePreMatchFieldFocus('oppTeam');
  byId('oppTeamBox').classList.add('editing');
  byId('oppTeam').classList.add('guidedInput');
  if(isPreMatchGuidedSetup()) guidedSetupStep='opp';
});

byId('competition').addEventListener('focus', ()=>{
  clearInactivePreMatchFieldFocus('competition');
  if(isPreMatchGuidedSetup()) guidedSetupStep='competition';
  byId('competition').classList.add('guidedInput');
});

byId('competitionStage').addEventListener('focus', ()=>{
  clearInactivePreMatchFieldFocus('competitionStage');
  if(isPreMatchGuidedSetup()) guidedSetupStep='competitionStage';
  byId('competitionStage').classList.add('guidedInput');
});

byId('venue').addEventListener('focus', ()=>{
  // 使用者若主動直接點場地，就尊重使用者操作，不再被拉回其他欄位。
  clearInactivePreMatchFieldFocus('venue');
  if(isPreMatchGuidedSetup()) guidedSetupStep='venue';
  byId('venue').classList.add('guidedInput');
});

byId('ourTeam').addEventListener('keydown', e=>{
  if(isImeComposing(e)) return;
  if(e.key==='Enter'){
    e.preventDefault();
    if(isPreMatchGuidedSetup()){
      guidedSetupStep='our';
      advanceGuidedSetup('our');
    }else{
      finishTeamNameEdit('ourTeam');
    }
  }
});

byId('oppTeam').addEventListener('keydown', e=>{
  if(isImeComposing(e)) return;
  if(e.key==='Enter'){
    e.preventDefault();
    if(isPreMatchGuidedSetup()){
      guidedSetupStep='opp';
      advanceGuidedSetup('opp');
    }else{
      finishTeamNameEdit('oppTeam');
    }
  }
});

byId('competition').addEventListener('keydown', e=>{
  if(isImeComposing(e)) return;
  if(e.key==='Enter'){
    e.preventDefault();
    if(isPreMatchGuidedSetup()){
      guidedSetupStep='competition';
      advanceGuidedSetup('competition');
    }else{
      const value=validateTextField('competition','比賽賽事',false,40);
      if(value!==null){
        state.competition=value;
        saveState();
        e.target.blur();
      }
    }
  }
});

byId('competitionStage').addEventListener('keydown', e=>{
  if(isImeComposing(e)) return;
  if(e.key==='Enter'){
    e.preventDefault();
    if(isPreMatchGuidedSetup()){
      guidedSetupStep='competitionStage';
      advanceGuidedSetup('competitionStage');
    }else{
      const value=validateTextField('competitionStage','賽事階段／輪次',false,24);
      if(value===null) return;
      state.competitionStage=value;
      saveState();
      e.target.blur();
    }
  }
});

byId('venue').addEventListener('keydown', e=>{
  if(isImeComposing(e)) return;
  if(e.key==='Enter'){
    e.preventDefault();
    if(isPreMatchGuidedSetup()){
      guidedSetupStep='venue';
      advanceGuidedSetup('venue');
    }else{
      const value=validateTextField('venue','比賽場地',false,30);
      if(value===null) return;
      saveState();
      // Enter 只完成輸入；開始比賽後才正式加入最近場地。
      e.target.blur();
    }
  }
});

// blur 延遲檢查：
// 若使用者是主動點到另一個欄位，新的 focus 會先更新 guidedSetupStep，
// 舊欄位就不會再把焦點硬拉回原本流程。
byId('ourTeam').addEventListener('blur', ()=>{
  byId('ourTeam').classList.remove('guidedInput');

  if(isPreMatchGuidedSetup() && guidedSetupStep==='our'){
    setTimeout(()=>{
      if(guidedSetupStep==='our') advanceGuidedSetup('our');
    },80);
    return;
  }

  const value=validateTextField('ourTeam','我方隊伍名稱',false,15);
  if(value===null){
    byId('ourTeamBox').classList.add('editing');
    return;
  }
  if(reviewTeamEditId==='ourTeam') reviewTeamEditId=null;
  byId('ourTeamBox').classList.remove('reviewEditing');
  saveState();
  byId('ourTeamBox').classList.remove('editing');
  updateTeamNameDisplays();
  if(state.started || state.finished) render();
});

byId('oppTeam').addEventListener('blur', ()=>{
  byId('oppTeam').classList.remove('guidedInput');

  if(isPreMatchGuidedSetup() && guidedSetupStep==='opp'){
    setTimeout(()=>{
      if(guidedSetupStep==='opp') advanceGuidedSetup('opp');
    },80);
    return;
  }

  const value=validateTextField('oppTeam','對手隊伍名稱',false,15);
  if(value===null){
    byId('oppTeamBox').classList.add('editing');
    return;
  }
  if(reviewTeamEditId==='oppTeam') reviewTeamEditId=null;
  byId('oppTeamBox').classList.remove('reviewEditing');
  saveState();
  byId('oppTeamBox').classList.remove('editing');
  updateTeamNameDisplays();
  if(state.started || state.finished) render();
});

byId('competition').addEventListener('blur', ()=>{
  byId('competition').classList.remove('guidedInput');

  if(isPreMatchGuidedSetup() && guidedSetupStep==='competition'){
    setTimeout(()=>{
      if(guidedSetupStep==='competition') advanceGuidedSetup('competition');
    },80);
    return;
  }

  const value=validateTextField('competition','比賽賽事',false,40);
  if(value!==null){
    state.competition=value;
    saveState();
  }
});


byId('competitionStage').addEventListener('blur', ()=>{
  byId('competitionStage').classList.remove('guidedInput');

  if(isPreMatchGuidedSetup() && guidedSetupStep==='competitionStage'){
    setTimeout(()=>{
      if(guidedSetupStep==='competitionStage') advanceGuidedSetup('competitionStage');
    },80);
    return;
  }

  const value=validateTextField('competitionStage','賽事階段／輪次',false,24);
  if(value!==null){
    state.competitionStage=value;
    saveState();
  }
});

document.addEventListener('click',e=>{
  const inField=e.target.closest?.('.venueMetaField');
  const inMenu=e.target.closest?.('#venueMenu');
  if(!inField && !inMenu) closeVenueMenu();
  const inStageField=e.target.closest?.('.stageMetaField');
  const inStageMenu=e.target.closest?.('#competitionStageMenu');
  if(!inStageField && !inStageMenu) closeCompetitionStageMenu();
});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){ closeVenueMenu(); closeCompetitionStageMenu(); }
});

window.addEventListener('resize',()=>{
  if(byId('venueMenu')?.classList.contains('open')) positionVenueMenu();
  if(byId('competitionStageMenu')?.classList.contains('open')) positionCompetitionStageMenu();
},{passive:true});
window.addEventListener('scroll',()=>{
  if(byId('venueMenu')?.classList.contains('open')) positionVenueMenu();
  if(byId('competitionStageMenu')?.classList.contains('open')) positionCompetitionStageMenu();
},{passive:true});
window.visualViewport?.addEventListener('resize',()=>{
  if(byId('venueMenu')?.classList.contains('open')) positionVenueMenu();
  if(byId('competitionStageMenu')?.classList.contains('open')) positionCompetitionStageMenu();
},{passive:true});
window.visualViewport?.addEventListener('scroll',()=>{
  if(byId('venueMenu')?.classList.contains('open')) positionVenueMenu();
},{passive:true});


['competition','venue'].forEach(id=>{
  const input=byId(id);
  if(!input) return;

  input.addEventListener('focus',()=>{
    updatePreMetaInputFit(input);
    requestAnimationFrame(()=>{
      try{
        input.setSelectionRange(input.value.length,input.value.length);
      }catch(e){}
    });
  });

  input.addEventListener('input',()=>{
    updatePreMetaInputFit(input);
  });

  input.addEventListener('blur',()=>{
    if(id==='venue') validateTextField('venue','比賽場地',false,30);
    requestAnimationFrame(()=>updatePreMetaInputFit(input));
  });
});

byId('venue').addEventListener('blur', ()=>{
  byId('venue').classList.remove('guidedInput');

  if(isPreMatchGuidedSetup() && guidedSetupStep==='venue'){
    setTimeout(()=>{
      if(guidedSetupStep==='venue') advanceGuidedSetup('venue');
    },80);
    return;
  }

  const raw=byId('venue').value.trim();
  if(raw){
    const value=validateTextField('venue','比賽場地',false,30);
    if(value===null) return;
  }

  // blur 只驗證並保存本場欄位，不更新最近場地。
  saveState();
  closeVenueMenu();
});

// 球員名單背號輸入維持既有邏輯。
byId('rosterInput')?.addEventListener('input', e=>{
  const cleaned=String(e.target.value||'').replace(/\D/g,'').slice(0,2);
  if(e.target.value!==cleaned) e.target.value=cleaned;
});
byId('rosterInput')?.addEventListener('keydown', e=>{
  if(e.key==='Enter'){
    e.preventDefault();
    addRosterNumbers();
  }
});

byId('keeperCustomNumber')?.addEventListener('input',e=>{
  e.target.value=String(e.target.value||'').replace(/\D/g,'').slice(0,2);
});
byId('keeperCustomNumber')?.addEventListener('keydown',e=>{
  if(e.key==='Enter'){
    e.preventDefault();
    saveKeeperCustom();
  }
});
byId('assistCustomNumber')?.addEventListener('input',e=>{
  e.target.value=String(e.target.value||'').replace(/\D/g,'').slice(0,2);
});
byId('assistCustomNumber')?.addEventListener('keydown',e=>{
  if(e.key==='Enter'){
    e.preventDefault();
    saveAssistCustom();
  }
});



// =========================================================
// v5.169：iPhone Safari 重新整理後固定從頁首開始
// ---------------------------------------------------------
// Safari 可能在 reload 後自動還原上一個 scroll position；而網址列／工具列的
// visual viewport 還會在載入後數百毫秒內再次改變。這裡改成：
// 1) 一般開啟與重新整理使用 manual scroll restoration。
// 2) back/forward 保留瀏覽器原生回復位置。
// 3) 以多段校正方式把首次載入穩定在頁首；期間關閉賽後安全補捲動。
// =========================================================
try{
  if('scrollRestoration' in history) history.scrollRestoration='manual';
}catch(e){}

function initialNavigationShouldStartAtTop(){
  try{
    const nav=performance.getEntriesByType?.('navigation')?.[0];
    if(nav) return nav.type!=='back_forward';
  }catch(e){}
  return true;
}

function hardResetPageScrollTop(){
  const scroller=document.scrollingElement || document.documentElement || document.body;
  if(scroller){ scroller.scrollTop=0; scroller.scrollLeft=0; }
  if(document.documentElement){ document.documentElement.scrollTop=0; document.documentElement.scrollLeft=0; }
  if(document.body){ document.body.scrollTop=0; document.body.scrollLeft=0; }
  try{ window.scrollTo({top:0,left:0,behavior:'auto'}); }
  catch(e){ try{ window.scrollTo(0,0); }catch(ignore){} }
}

const initialStartAtTop=initialNavigationShouldStartAtTop();
function settleInitialViewportAtTop(){
  if(!initialStartAtTop){
    initialViewportSettling=false;
    return;
  }
  const root=document.documentElement;
  root?.classList?.add('stateTopLock');

  // 只在頁面建立初期校正一次，不再用 0.2～1.2 秒的多段 scrollTo
  // 持續搶走使用者的手動捲動控制權。
  hardResetPageScrollTop();
  requestAnimationFrame(()=>{
    hardResetPageScrollTop();
    requestAnimationFrame(()=>{
      initialViewportSettling=false;
      root?.classList?.remove('stateTopLock');
    });
  });
}

window.addEventListener('pageshow',e=>{
  // bfcache 回上一頁時維持原位置；一般開啟 / reload 只在初始 frame 回頁首。
  if(!e.persisted && initialStartAtTop) settleInitialViewportAtTop();
},{capture:true});

document.addEventListener('DOMContentLoaded',()=>{
  syncIOSBrowserUIMode();
  const closeBtn=byId('reportCloseBtn');
  const shareBtn=byId('reportShareBtn');

  const bindTap=(el,handler)=>{
    if(!el) return;
    let touched=false;
    el.addEventListener('touchend',e=>{
      touched=true;
      e.preventDefault();
      e.stopPropagation();
      handler();
      setTimeout(()=>{touched=false;},350);
    },{passive:false});
    el.addEventListener('click',e=>{
      if(touched) return;
      e.preventDefault();
      e.stopPropagation();
      handler();
    });
  };

  bindTap(closeBtn, closeReport);
  bindTap(shareBtn, shareReportImage);
  syncVisualViewport();
});


document.querySelectorAll('.finalTools button').forEach(btn=>{
  btn.addEventListener('touchstart',()=>{ btn.style.transform='scale(.985)'; },{passive:true});
  btn.addEventListener('touchend',()=>{ btn.style.transform=''; },{passive:true});
  btn.addEventListener('touchcancel',()=>{ btn.style.transform=''; },{passive:true});
});

bootstrapMatchRegistry();
loadState();
updateMatchRegistryFromState();
// v5.169：狀態 render 完成後再校正一次，防止 Safari 在 DOM 高度建立完成後
// 才套用 reload 前的 scroll position。
if(initialStartAtTop) settleInitialViewportAtTop();

function persistBeforeBackgroundSuspend(){
  if(recoverySwitchInProgress) return;
  if(!byId('ourTeam')) return;
  try{ saveState(); }catch(e){}
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    persistBeforeBackgroundSuspend();
  }else{
    maybeOfferLongDurationNotice();
  }
});
window.addEventListener('pagehide',persistBeforeBackgroundSuspend,{capture:true});


tick();
syncVisualViewport();
window.finishAppBoot();
maybeOfferLongDurationNotice();
setTimeout(showMissingMatchRecoveryIfNeeded,160);

// v5.91：規定時間 / 超時提示已由 tick() 與主計時器同幀更新，不再使用獨立 1 秒 interval。



