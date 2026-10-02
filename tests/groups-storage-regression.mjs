// Offline checks of the actual storage and MCP modules. No real database is used.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=process.argv[2] || path.resolve(import.meta.dirname,'..');
process.env.SUPABASE_URL='http://offline.invalid';
process.env.SUPABASE_SERVICE_KEY='offline';
globalThis.fetch=()=>{throw Error('Network forbidden in this test');};
const {db}=await import(pathToFileURL(path.join(root,'lib/supabase.js')));
const G='11111111-1111-4111-8111-111111111111';
const CHILD='22222222-2222-4222-8222-222222222222';
const FOREIGN='33333333-3333-4333-8333-333333333333';
const M='44444444-4444-4444-8444-444444444444';
const OTHER='55555555-5555-4555-8555-555555555555';
const owner='owner@example.com';
let tables, writes;
function seed(){writes=[];tables={meeting_groups:[{id:G,name:'Muse',owner_email:owner,parent_id:null},{id:CHILD,name:'Planning',owner_email:owner,parent_id:G},{id:FOREIGN,name:'Private',owner_email:'other@example.com',parent_id:null}],meetings:[{id:M,owner_email:owner},{id:OTHER,owner_email:'other@example.com'}],meeting_group_members:[{group_id:CHILD,meeting_id:M,owner_email:owner}]};}
db.from=(table)=>{
 const filters=[];let op='read',payload,single=false;
 const matches=row=>filters.every(f=>f(row));
 const q={select(){return q;},order(){return q;},range(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,vs){filters.push(r=>vs.includes(r[k]));return q;},insert(v){op='insert';payload=v;return q;},upsert(v){op='upsert';payload=v;return q;},update(v){op='update';payload=v;return q;},delete(){op='delete';return q;},single(){single=true;return q;},maybeSingle(){single=true;return q;},then(resolve,reject){
  let result=tables[table].filter(matches);
  if(op!=='read')writes.push({table,op,payload});
  if(op==='insert'){result=[{id:crypto.randomUUID(),...payload}];tables[table].push(...result);}
  if(op==='upsert'){for(const row of payload)if(!tables[table].some(r=>r.group_id===row.group_id&&r.meeting_id===row.meeting_id))tables[table].push({...row});result=payload;}
  if(op==='update')for(const row of result)Object.assign(row,payload);
  if(op==='delete')tables[table]=tables[table].filter(r=>!matches(r));
  return Promise.resolve({data:single?(result[0]??null):result,error:null}).then(resolve,reject);
 }};return q;
};
const api=await import(pathToFileURL(path.join(root,'lib/groups.js')));
const {handleMcpRequest}=await import(pathToFileURL(path.join(root,'lib/mcp-server.js')));
let failures=0;
async function test(name,fn){seed();try{await fn();console.log('PASS '+name);}catch(e){failures++;console.error('FAIL '+name+': '+e.message);}}
await test('owner sees only own groups',async()=>assert.deepEqual((await api.listGroups(owner)).map(g=>g.id),[G,CHILD]));
await test('foreign parent rejected before write',async()=>{await assert.rejects(()=>api.createGroup(owner,{name:'X',parentId:FOREIGN}));assert.equal(writes.length,0);});
await test('move into descendant rejected before write',async()=>{await assert.rejects(()=>api.moveGroup(owner,G,CHILD));assert.equal(writes.length,0);});
await test('foreign group cannot be renamed',async()=>{await assert.rejects(()=>api.renameGroup(owner,FOREIGN,'Changed'));assert.equal(writes.length,0);});
await test('batch rejects foreign meetings and is idempotent',async()=>{const r=await api.assignMeetings(owner,G,[M,OTHER,M]);assert.deepEqual(r.added,[M]);assert.deepEqual(r.rejected,[OTHER]);await api.assignMeetings(owner,G,[M]);assert.equal(tables.meeting_group_members.filter(r=>r.group_id===G).length,1);});
await test('over-limit batch is rejected without partial writes',async()=>{const ids=Array.from({length:201},()=>crypto.randomUUID());await assert.rejects(()=>api.assignMeetings(owner,G,ids));assert.equal(writes.length,0);});
await test('invalid meeting ID rejected before write',async()=>{await assert.rejects(()=>api.assignMeetings(owner,G,['not-an-id']));assert.equal(writes.length,0);});
await test('remove reports only existing membership, not a foreign or unfiled meeting',async()=>{const r=await api.removeMeetings(owner,G,[M,OTHER]);assert.deepEqual(r.removed,[]);assert.equal(tables.meetings.length,2);});
await test('removing a real membership preserves meeting',async()=>{const r=await api.removeMeetings(owner,CHILD,[M]);assert.deepEqual(r.removed,[M]);assert.equal(tables.meetings.length,2);assert.equal(tables.meeting_group_members.length,0);});
await test('parent list includes descendants, exact list does not',async()=>{assert.deepEqual(await api.meetingIdsInGroup(owner,G),[M]);assert.deepEqual(await api.meetingIdsInGroup(owner,G,{includeDescendants:false}),[]);});
await test('deleting group lifts children and preserves meetings',async()=>{await api.deleteGroup(owner,G);assert.equal(tables.meeting_groups.find(g=>g.id===CHILD).parent_id,null);assert.equal(tables.meetings.length,2);assert.equal(writes.some(w=>w.table==='meetings'),false);});
await test('MCP advertises all group operations',async()=>{const r=await handleMcpRequest({jsonrpc:'2.0',id:1,method:'tools/list'},owner);const names=r.body.result.tools.map(t=>t.name);for(const n of ['list_groups','create_group','rename_group','move_group','delete_group','assign_meetings_to_group','remove_meetings_from_group','list_group_meetings'])assert.ok(names.includes(n),n);});
await test('MCP creates subgroup using authenticated owner',async()=>{const r=await handleMcpRequest({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'create_group',arguments:{name:'New',parent_id:G,owner_email:'other@example.com'}}},owner);assert.ok(!r.body.result.isError);assert.equal(tables.meeting_groups.at(-1).owner_email,owner);assert.equal(tables.meeting_groups.at(-1).parent_id,G);});
console.log(`${13-failures}/13 storage and MCP checks passed`);
process.exitCode=failures?1:0;
