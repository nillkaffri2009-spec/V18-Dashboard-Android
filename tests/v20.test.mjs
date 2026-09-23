import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseCSV,normalizeRows,SheetCache,SHEETS,coverage} from '../worker/sheets.js';
import worker,{V18State} from '../worker/worker.js';
import * as model from '../worker/public/model.js';

const row=(code='21010',month='Iyul',tab='A531',day='11N')=>[1,month,code,tab,'Test Employee','C',160,100,60,160,8,1,9,169,day];
const csv=rows=>rows.map(r=>r.map(c=>'"'+String(c??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
test('CSV preserves mixed IDs, quoted names, decimals, merged labels and latest duplicate',()=>{
 const first=row();first[4]='Test, "A"\nEmployee';first[14]='7,5D';
 const inherited=row('','', '0015','TO');
 const later=[...first];later[14]='8D';
 const records=normalizeRows(parseCSV(csv([first,inherited,later,row('21111')])),'21010');
 assert.equal(records.length,2);assert.equal(records[0].tab,'A531');assert.equal(records[0].day[0],'8D');assert.equal(records[1].m,'Iyul');assert.equal(records[1].tab,'0015');
 assert.equal(normalizeRows([row('21010','Сентябрь')],'21010')[0].m,'Sentabr');
 assert.throws(()=>parseCSV('"broken'));
});
test('shared cache combines concurrent clients, rechecks after 2 seconds and keeps failed departments',async()=>{
 let calls=0,fail=false;const cache=new SheetCache();
 const fetcher=async url=>{calls++;const gid=Number(new URL(url).searchParams.get('gid')),s=SHEETS.find(s=>s.gid===gid);if(fail&&s.code==='21111')return new Response('',{status:503});return new Response(csv([row(s.code)]));};
 const [a,b]=await Promise.all([cache.get(fetcher,10000),cache.get(fetcher,10000)]);
 assert.equal(calls,6);assert.equal(a,b);assert.equal(a.records.length,6);await cache.get(fetcher,11999);assert.equal(calls,6);
 fail=true;const c=await cache.get(fetcher,12000);assert.equal(calls,12);assert.equal(c.records.length,6);assert(c.partial);assert(c.loaded.find(x=>x.code==='21111').stale);
});
test('empty source never pretends to return zero employees',async()=>{
 const cache=new SheetCache();await assert.rejects(()=>cache.get(async()=>new Response(''),1));assert.equal(cache.value,null);
});
test('complete month is selected before a partial month; unknown day is not absence',()=>{
 model.setLiveRecords([...SHEETS.map(s=>normalizeRows([row(s.code)],s.code)[0]),...normalizeRows([row('21120','Avgust')],'21120')]);
 assert.deepEqual(model.availableMonths(),[6,7]);assert.equal(model.recommendedMonth(),6);
 assert.equal(coverage(model.getLiveRecords()).latestMonth,7);
 const stats=model.stats(model.filteredEmployees({...model.DEFAULT_VIEW,month:6,day:2}));assert.equal(stats.total,6);assert.equal(stats.absent,0);assert.equal(stats.rest,0);assert.equal(stats.rate,null);
});
test('PC and phone can repeatedly reclaim; monitor stays read only; stale owner rejected',async()=>{
 const memory=new Map();const instance=new V18State({storage:{get:async k=>structuredClone(memory.get(k)),put:async(k,v)=>memory.set(k,structuredClone(v))}},{});
 const send=async(role,cid,body)=>{const res=await instance.fetch(new Request('https://internal.v18/state',{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Dashboard-Role':role,'X-Dashboard-Device':cid},body:body?JSON.stringify(body):undefined}));return {status:res.status,...await res.json()};};
 let pc=await send('computer','pc',{action:'claim',onlyIfUnowned:true});assert(pc.active);
 assert.equal((await send('computer','pc2',{action:'claim',onlyIfUnowned:true})).status,409);
 pc=await send('computer','pc',{action:'update',epoch:pc.epoch,view:{...model.DEFAULT_VIEW,month:6,day:1,department:'21113'}});
 let phone=await send('phone','phone',{action:'claim'});assert(phone.active);assert.equal(phone.view.department,'21113');
 phone=await send('phone','phone',{action:'update',epoch:phone.epoch,view:{...phone.view,department:'21120',page:2}});
 assert.equal((await send('monitor','tv')).view.department,'21120');
 assert.equal((await send('computer','pc',{action:'update',epoch:pc.epoch,view:pc.view})).status,409);
 pc=await send('computer','pc',{action:'claim'});assert(pc.active);assert.equal(pc.view.department,'21113');
 phone=await send('phone','phone',{action:'claim'});assert(phone.active);assert.equal(phone.view.page,2);
 assert.equal((await send('monitor','tv',{action:'claim'})).status,403);
 assert.equal((await send('monitor','tv',{action:'update',epoch:phone.epoch,view:phone.view})).status,403);
 await send('phone','phone',{action:'release',epoch:phone.epoch});assert.equal((await send('monitor','tv')).source,'computer');
 phone=await send('phone','phone',{action:'claim'});memory.get('dashboard_state_v19').phoneUntil=0;
 assert.equal((await send('monitor','tv')).source,'computer');assert.equal((await send('computer','pc')).active,true);
});
test('role routes use shared app, control selector never contains monitor and polling is 2 seconds',async()=>{
 const html=await fs.readFile(new URL('../worker/public/index.html',import.meta.url),'utf8');
 const selector=html.match(/<select id="deviceRole">(.*?)<\/select>/s)[1];assert(!selector.includes('monitor'));assert(selector.includes('computer'));assert(selector.includes('phone'));
 const app=await fs.readFile(new URL('../worker/public/app.js',import.meta.url),'utf8');assert(app.includes('setInterval(syncData,2000)'));assert(!app.includes("data.source==='computer'&&!active"));
 let path;const env={ASSETS:{fetch:async req=>{path=new URL(req.url).pathname;return new Response(html);}}};
 for(const role of ['admin','phone','monitor']){assert.equal((await worker.fetch(new Request('https://test/'+role),env)).status,200);assert.equal(path,'/index.html');}
 const health=await (await worker.fetch(new Request('https://test/api/health'),env)).json();assert.equal(health.version,'20.3-cloud');
});
