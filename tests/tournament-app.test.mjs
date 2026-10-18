import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { webcrypto } from 'node:crypto';

const token='a'.repeat(64),slug='test-groep';
const active={id:'tour-1',token,name:'Finale',is_archived:false};
function fixture(mode=false,{saved={},online=true,rpc=async()=>({tournaments:[active]}),actor=null,state=null}={}) {
  const {window:dom}=parseHTML(readFileSync(mode?'tournament.html':'index.html','utf8'));
  const window={document:dom.document,Event:dom.Event,addEventListener:dom.addEventListener.bind(dom)};
  const storage=new Map(Object.entries(saved));
  const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
  const navigations=[]; const confirmations=[];
  let confirmResult=true;
  const location={href:mode?`https://example.com/app/tournament.html#${token}`:'https://example.com/app/',hash:mode?`#${token}`:'',replace:url=>navigations.push({kind:'replace',url}),assign:url=>navigations.push({kind:'assign',url})};
  const navigator={onLine:online,clipboard:{writeText:async()=>{}}};
  Object.assign(window,{location,navigator,localStorage,sessionStorage:localStorage,crypto:webcrypto});
  for (const dialog of window.document.querySelectorAll('dialog')) {
    dialog.showModal=()=>{dialog.setAttribute('open',''); dialog.open=true;};
    dialog.close=value=>{dialog.removeAttribute('open'); dialog.open=false; dialog.returnValue=value??''; dialog.dispatchEvent(new window.Event('close'));};
  }
  const context=vm.createContext({window,document:window.document,navigator,location,localStorage,sessionStorage:localStorage,crypto:webcrypto,URL,Map,Set,Date,Intl,console,setTimeout,clearTimeout,Blob,fetch:async()=>{throw Error('unexpected network');}});
  vm.runInContext(readFileSync('tournaments.js','utf8'),context);
  let currentState=state || {group:{slug:`tournament-tour-1`},tournament:{id:'tour-1',name:'Finale',master_player_id:'member-alice',is_archived:false},players:[{id:'member-alice',source_player_id:'alice',name:'Alice',active:true},{id:'member-bob',source_player_id:'bob',name:'Bob',active:true}],games:[],periods:[]};
  const api=window.Big2Tournaments({config:{groupSlug:slug},escapeHtml:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),getState:()=>currentState,getActor:()=>actor,rpc,
    requireOnline:()=>{},requireActor:async()=>actor,askAdminPin:async()=>'',applyState:async s=>{currentState=s;},renderAll:()=>{},showToast:()=>{},confirm:async(...args)=>{confirmations.push(args);return confirmResult;},pendingCount:async()=>0,reload:async()=>{}});
  return {api,window,context,storage,navigations,confirmations,setConfirm:v=>{confirmResult=v;}};
}
const click=async(f,selector)=>{f.window.document.querySelector(selector).click(); await new Promise(r=>setTimeout(r,0));};

test('the current app discovers and automatically opens an active tournament without a shared link',async()=>{
  const f=fixture();
  assert.equal(await f.api.checkAutoEntry(),true);
  assert.equal(f.navigations.length,1);
  assert.equal(f.navigations[0].url,`https://example.com/app/tournament.html#${token}`);
  assert.equal(f.storage.get(`big2-main-app:${slug}`),'1');
});
test('leaving keeps only this phone in the main app; the next new tournament opens automatically',async()=>{
  const f=fixture(false,{saved:{[`big2-tournament-dismissed:${slug}`]:'tour-1'}});
  assert.equal(await f.api.checkAutoEntry(),false);
  assert.equal(f.navigations.length,0);
  const next=fixture(false,{saved:Object.fromEntries(f.storage),rpc:async()=>({tournaments:[{...active,id:'tour-2',token:'b'.repeat(64)}]})});
  assert.equal(await next.api.checkAutoEntry(),true);
  assert(next.navigations[0].url.endsWith('b'.repeat(64)));
});
test('the guest route never calls the main overview and cannot select or leave for the main app',async()=>{
  const f=fixture(true,{rpc:async()=>{throw Error('must not call main RPC');}});
  f.api.install(); f.api.render();
  assert.equal(await f.api.checkAutoEntry(),false);
  assert.equal(f.api.selectorOptions(),'');
  assert.equal(f.window.document.querySelector('[data-leave-tournament]'),null);
  assert.equal(f.window.document.querySelector('#tab-logbook').hidden,true);
  assert.equal(f.window.document.querySelector('.period-picker').hidden,true);
  assert.equal(f.window.document.querySelector('[data-add-tournament-player]'),null);
  assert.equal(f.window.document.querySelector('link[rel=manifest]'),null);
});
test('an existing player keeps their own selected identity through the source-player mapping',()=>{
  const f=fixture(true,{saved:{[`big2-current-actor:${slug}`]:'alice'}});
  const state={group:{slug:'tournament-tour-1'},players:[{id:'member-alice',source_player_id:'alice',active:true}]};
  assert.equal(f.api.initialActor(state,''),'member-alice');
  assert.equal(f.api.initialActor(state,'member-bob'),'member-bob');
});
test('a new guest with no main-app identity must choose a name, even when guests have null source IDs',()=>{
  const f=fixture(true);
  assert.equal(f.api.initialActor({group:{slug:'tournament-tour-1'},players:[{id:'guest',source_player_id:null,active:true}]},''),'');
});
test('only game master sees roster and closure controls; all views keep the 20 character limit',()=>{
  const f=fixture(true,{actor:{id:'member-alice',name:'Alice'}});
  f.api.install(); f.api.render();
  assert(f.window.document.querySelector('[data-add-tournament-player]'));
  assert(f.window.document.querySelector('[data-close-tournament]'));
  assert(f.window.document.querySelector('[data-remove-tournament-player="member-bob"]'));
  assert.equal(f.window.document.querySelector('#tournament-name').getAttribute('maxlength'),'20');
  assert.equal(f.window.document.querySelector('#tournament-rename-form input').getAttribute('maxlength'),'20');
});
test('leaving via Beheer requires the confirmation and records a phone preference, not a roster removal',async()=>{
  const f=fixture(true,{saved:{[`big2-main-app:${slug}`]:'1'}});
  f.api.install(); f.api.render();
  f.setConfirm(false); await click(f,'[data-leave-tournament]');
  assert.equal(f.navigations.length,0);
  f.setConfirm(true); await click(f,'[data-leave-tournament]');
  assert.equal(f.confirmations.length,2);
  assert(f.confirmations[0][1].includes('Weet je zeker dat je toernooi wilt verlaten?'));
  assert.equal(f.storage.get(`big2-tournament-dismissed:${slug}`),'tour-1');
  assert.equal(f.navigations[0].url,'https://example.com/app/');
});
test('archives appear in the ordinary app selector without being added to ordinary periods',async()=>{
  const f=fixture(false,{rpc:async()=>({tournaments:[{...active,is_archived:true}]})});
  assert.equal(await f.api.checkAutoEntry(),false);
  assert.match(f.api.selectorOptions(),/Finale · archief/);
  assert.equal(f.api.select('tournament:tour-1'),true);
  assert(f.navigations[0].url.includes('tournament.html#'));
});

function appFixture(mode) {
  const f=fixture(mode);
  const source=readFileSync('app.js','utf8').replaceAll('\r\n','\n').replace('  init();\n})();',`  window.appTest={normalizeState,qualificationForPlayer,getStats,scopeGames,scopeIsWritable,setupMode,
    setState:s=>{state=normalizeState(s);},getBackend:()=>backend,tour};\n})();`);
  vm.runInContext(source,f.context);
  return {...f,app:f.window.appTest};
}
test('tournament ranking qualifies after one game; ordinary periods still require ten',()=>{
  const players=[{id:'a',name:'Alice',active:true},{id:'b',name:'Bob',active:true},{id:'c',name:'No games',active:true}];
  const game={id:'g',period_id:'p',winner:'a',entries:[{player_id:'a',cards:0,penalty:0},{player_id:'b',cards:4,penalty:4}]};
  const state={group:{slug:'test'},players,periods:[{id:'p',year:2026,name:'Finale',is_archived:false}],games:[game],tournament:{id:'p'}};
  const f=appFixture(true); f.app.setState(state);
  const rows=f.app.getStats();
  assert.equal(rows[0].qualified,true); assert.equal(rows[1].qualified,true); assert.equal(rows[2].qualified,false);
  assert.equal(f.app.scopeGames().length,1); assert.equal(f.app.scopeIsWritable(),true);
  const regular=appFixture(false); regular.app.setState({...state,tournament:null});
  assert.equal(regular.app.qualificationForPlayer('a',1,'games').qualified,false);
  assert.equal(regular.app.qualificationForPlayer('a',10,'games').qualified,true);
});
test('offline state and pending queues have different keys for main app and every tournament',()=>{
  assert.equal(fixture(false).api.storageKey,slug);
  assert.equal(fixture(true).api.storageKey,`tournament:${token}`);
  const source=readFileSync('app.js','utf8');
  assert(!/offlineStore\.(?:putState|getState|countPendingGames|getPendingGames)\(config\.groupSlug/.test(source));
  assert(source.includes('group_slug: tour.storageKey'));
});
