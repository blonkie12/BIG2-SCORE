// Disposable local preview backed by real in-memory Postgres; never connects to Supabase.
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
await db.exec(await readFile(new URL('./fixture.sql',import.meta.url),'utf8'));
const file=(await readdir('supabase/migrations')).find(f=>f.endsWith('_tournaments.sql'));
await db.exec((await readFile(`supabase/migrations/${file}`,'utf8')).replace(/^\uFEFF/,''));
const requests=[];
async function normalState() {
 const group=(await db.query("select * from public.big2_groups where slug='test-groep'")).rows[0];
 const players=(await db.query('select * from public.big2_players where group_id=$1',[group.id])).rows;
 const periods=(await db.query('select * from public.big2_periods where group_id=$1',[group.id])).rows.map(p=>({...p,year:2026,is_archived:false,ranking_criterion:'average_penalty'}));
 return {group,players,periods,games:[],logs:[]};
}
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.webmanifest':'application/manifest+json'};
createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:8765');
 const send=(status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);};
 try {
  if (url.pathname==='/config.js') return send(200,`window.BIG2_CONFIG={demoMode:false,supabaseUrl:location.origin,supabasePublishableKey:'local-test-only',groupSlug:'test-groep'};`,'text/javascript');
  if (url.pathname==='/__test/requests') return send(200,JSON.stringify(requests));
  if (url.pathname.startsWith('/rest/v1/rpc/') && req.method==='POST') {
    const name=url.pathname.split('/').at(-1); let raw=''; for await (const chunk of req) raw+=chunk;
    const args=JSON.parse(raw); requests.push({name,at:new Date().toISOString()});
    if (['big2_bootstrap','big2_log_access'].includes(name)) return send(200,JSON.stringify(await normalState()));
    if (!/^big2_tournament_[a-z_]+$/.test(name)) throw Error('Unknown local RPC');
    const keys=Object.keys(args); if(!keys.every(k=>/^p_[a-z_]+$/.test(k))) throw Error('Invalid parameter');
    const query=`select public.${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')}) as data`;
    const values=keys.map(k=>typeof args[k]==='object' && args[k]!==null ? JSON.stringify(args[k]) : args[k]);
    const result=await db.query(query,values);
    return send(200,JSON.stringify(result.rows[0].data));
  }
  const path=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if (!/^[a-z0-9.-]+\.(html|js|css|svg|webp|webmanifest)$/.test(path)) return send(404,'Not found','text/plain');
  const ext=path.slice(path.lastIndexOf('.'));
  send(200,await readFile(path),types[ext]);
 } catch(error) {send(400,JSON.stringify({message:error.message}));}
}).listen(8765,'127.0.0.1',()=>console.log('Local test preview: http://127.0.0.1:8765 (admin PIN: test-pin)'));
