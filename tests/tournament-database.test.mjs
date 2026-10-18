import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db=new PGlite();
let group,alice,bob,otherPlayer,first,second,master,guest,clientId,gameId;
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
const rpc=async(name,args) => (await one(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as data`,args)).data;
const create=(name='Testtoernooi',pin='test-pin',source=alice,names=['Gast'])=>rpc('big2_tournament_create',['test-groep',pin,source,name,[bob],names]);
const save=(token,actor,entries,id=null,client=crypto.randomUUID())=>rpc('big2_tournament_save_game',[token,actor,id,client,entries[0].player_id,entries[0].player_id,entries,'Test', '2026-10-18T12:34:56Z']);
const manage=(actor,action,extra={})=>rpc('big2_tournament_manage',[first.token,actor,action,extra.name??null,extra.sources??[],extra.names??[],extra.id??null]);

before(async()=>{
  // Existing functions are fixture versions: production keeps its current PIN hash and ordinary RPCs.
  await db.exec(readFileSync('tests/fixture.sql','utf8'));
  group=(await one("select id from public.big2_groups where slug='test-groep'")).id;
  alice=(await one("select id from public.big2_players where name='Alice'")).id;
  bob=(await one("select id from public.big2_players where name='Bob'")).id;
  otherPlayer=(await one("select id from public.big2_players where name like 'Privé%'")).id;
  for (const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8').replace(/^\uFEFF/,''));
  }
});
after(async()=>{ await db.close(); });

test('create requires the existing admin PIN, a real group player and a 2–20 character name',async()=>{
  await assert.rejects(create('Toernooi','wrong'),/beheerderscode/);
  await assert.rejects(create('Te lang'.repeat(4)),/2 tot 20/);
  await assert.rejects(create('Toernooi','test-pin',otherPlayer),/eigen spelersnaam/);
  assert.equal((await one('select count(*)::int as n from public.big2_tournaments')).n,0);
});
test('creator is included as game master; new names stay in the tournament',async()=>{
  first=await create();
  master=first.state.players.find(p=>p.source_player_id===alice).id;
  guest=first.state.players.find(p=>p.name==='Gast').id;
  assert.equal(first.state.tournament.master_player_id,master);
  assert.equal(first.state.players.length,3);
  assert.equal(first.token.length,64);
  assert.equal((await one('select count(*)::int as n from public.big2_players')).n,3);
  await assert.rejects(create('Tweede actief'),/al een actief/);
});
test('a guest bootstrap returns only this tournament; invalid tokens fail',async()=>{
  const state=await rpc('big2_tournament_bootstrap',[first.token]);
  assert.equal(state.periods.length,1);
  assert.equal(state.games.length,0);
  assert.equal(state.logs.length,0);
  assert.equal(state.group.id,state.tournament.id);
  assert(!JSON.stringify(state).includes('Gewone uitslag'));
  assert(!JSON.stringify(state).includes('Privé naam'));
  assert(!JSON.stringify(state).includes('viewer_token'));
  await assert.rejects(rpc('big2_tournament_bootstrap',['x'.repeat(64)]),/niet gevonden/);
});
test('anon cannot read tables or call internal helpers, but can use the token RPC',async()=>{
  await db.exec('set role anon');
  try {
    await assert.rejects(db.query('select * from public.big2_tournaments'),/permission denied/);
    await assert.rejects(db.query('select * from public.big2_tournament_games'),/permission denied/);
    await assert.rejects(db.query('select * from public.big2_tournament_players'),/permission denied/);
    await assert.rejects(db.query('select big2_private.tournament_state($1)',[first.state.tournament.id]),/permission denied/);
    const state=await rpc('big2_tournament_bootstrap',[first.token]);
    assert.equal(state.tournament.name,'Testtoernooi');
  } finally { await db.exec('reset role'); }
});
test('only the selected game master manages players, names and closure',async()=>{
  for(const action of ['rename','add','remove','close']) await assert.rejects(manage(guest,action,{name:'Naam',id:master,names:['Indringer']}),/Alleen de game master/);
  await assert.rejects(rpc('big2_tournament_roster_options',[first.token,guest]),/Alleen de game master/);
  await assert.rejects(manage(master,'add',{sources:[otherPlayer]}),/niet beschikbaar/);
  await assert.rejects(manage(master,'remove',{id:master}),/game master blijft/);
  await manage(master,'rename',{name:'Finale'});
  await manage(master,'add',{names:['Nieuwe gast']});
  assert.equal((await one('select count(*)::int as n from public.big2_players')).n,3);
});
test('scores recalculate penalties, retain device time, and retry idempotently',async()=>{
  const entries=[{player_id:master,cards:0,penalty:999},{player_id:guest,cards:13,penalty:1}];
  clientId=crypto.randomUUID();
  const state=await save(first.token,guest,entries,null,clientId);
  gameId=state.games[0].id;
  assert.equal(state.games[0].entries[1].penalty,39);
  assert.equal(state.games[0].entries[0].penalty,0);
  assert.equal(new Date(state.games[0].played_at).toISOString(),'2026-10-18T12:34:56.000Z');
  assert.equal((await save(first.token,guest,entries,null,clientId)).games.length,1);
  await assert.rejects(save(first.token,guest,[entries[0],entries[0]]),/één keer/);
  await assert.rejects(save(first.token,guest,[entries[0],{player_id:guest,cards:0}]),/Controleer/);
  await assert.rejects(save(first.token,otherPlayer,entries),/Kies eerst je naam/);
  await assert.rejects(save(first.token,guest,[entries[0],{player_id:otherPlayer,cards:2}]),/Controleer/);
});
test('game edits and deletion require the game master',async()=>{
  const entries=[{player_id:master,cards:0},{player_id:guest,cards:10}];
  await assert.rejects(save(first.token,guest,entries,gameId),/Alleen de game master/);
  await assert.rejects(rpc('big2_tournament_delete_game',[first.token,guest,gameId]),/Alleen de game master/);
  const state=await save(first.token,master,entries,gameId);
  assert.equal(state.games[0].entries[1].penalty,20);
  assert(state.games[0].updated_at);
});
test('removal preserves results and re-adding the same name reactivates the same participant',async()=>{
  let state=await manage(master,'remove',{id:guest});
  assert.equal(state.games.length,1);
  assert.equal(state.players.find(p=>p.id===guest).active,false);
  await assert.rejects(save(first.token,master,[{player_id:master,cards:0},{player_id:guest,cards:2}]),/Controleer/);
  state=await manage(master,'add',{names:['Gast']});
  assert.equal(state.players.find(p=>p.name==='Gast').id,guest);
  assert.equal(state.players.find(p=>p.id===guest).active,true);
});
test('closing freezes the tournament, retains idempotent retries, and allows a new independent tournament',async()=>{
  const archived=await manage(master,'close');
  assert.equal(archived.tournament.is_archived,true);
  assert(archived.tournament.archived_at);
  const entries=[{player_id:master,cards:0},{player_id:guest,cards:2}];
  await assert.rejects(save(first.token,master,entries),/afgesloten/);
  await assert.rejects(save(first.token,master,entries,gameId),/afgesloten/);
  await assert.rejects(rpc('big2_tournament_delete_game',[first.token,master,gameId]),/afgesloten/);
  await assert.rejects(manage(master,'add',{names:['Te laat']}),/afgesloten/);
  assert.equal((await save(first.token,guest,entries,null,clientId)).games.length,1);
  second=await create('Tweede toernooi','test-pin',alice,['Tweede gast']);
  assert.notEqual(second.token,first.token);
  assert.equal(second.state.games.length,0);
  assert(!second.state.players.some(p=>p.name==='Gast'));
  await assert.rejects(save(second.token,second.state.tournament.master_player_id,[{player_id:master,cards:0},{player_id:guest,cards:2}]),/Controleer/);
  const overview=await rpc('big2_tournament_overview',['test-groep']);
  assert.equal(overview.tournaments.length,2);
  assert.equal(overview.tournaments.filter(t=>t.is_archived).length,1);
});
test('ordinary games, periods, players and group ranking stay untouched',async()=>{
  assert.equal((await one('select count(*)::int as n from public.big2_games')).n,2);
  assert.equal((await one('select count(*)::int as n from public.big2_periods')).n,2);
  assert.equal((await one('select count(*)::int as n from public.big2_players')).n,3);
  assert.equal((await one('select ranking_criterion from public.big2_groups where id=$1',[group])).ranking_criterion,'average_penalty');
});
