import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,stats,gameCount,settlement,ensureAttendee,validateState} from '../src/core.js';
function fixture(){const s=initialState();s.members=[{id:'a',name:'참가자 1',type:'student'},{id:'b',name:'참가자 2',type:'general'}];s.sessions=[{id:'v',date:'2026-09-30',centerId:'hanareum',centerSnapshot:structuredClone(s.centers[0]),attendees:[{memberId:'a',type:'student',shoeExempt:true,shoeFee:2000,charges:[{rateId:'happy',rateName:'평일 해피타임',unitPrice:3500,games:2},{rateId:'evening',rateName:'평일 저녁',unitPrice:4200,games:1}]},{memberId:'b',type:'general',shoeExempt:false,shoeFee:2000,charges:[{unitPrice:4800,games:1}]}],games:[{id:'g1',photo:null,rows:[{label:'A',memberId:'a',score:0},{label:'B',memberId:'b',score:85}]},{id:'g2',photo:null,rows:[{label:'A',memberId:'a',score:100}]},{id:'g3',photo:null,rows:[{label:'A',memberId:'a',score:200}]}]}];return s;}
test('average weights games, includes zero and excludes other players',()=>{const s=fixture();assert.deepEqual(stats(s,'a'),{count:3,total:300,average:100,best:200});s.sessions.push({...structuredClone(s.sessions[0]),id:'v2',games:[{id:'g4',rows:[{label:'A',memberId:'a',score:300}]}]});assert.equal(stats(s,'a').average,150);assert.equal(stats(s,'missing').average,null);});
test('mixed prices and per-visit shoe exemption',()=>{const s=fixture();assert.deepEqual(settlement(s.sessions[0],'a'),{games:3,gameFee:11200,shoeFee:0,total:11200});assert.equal(settlement(s.sessions[0],'b').total,6800);});
test('historic price snapshot survives center price changes',()=>{const s=fixture();s.centers[0].shoeFee=9000;s.centers[0].rates[0].student=10000;assert.equal(s.sessions[0].centerSnapshot.shoeFee,2000);assert.equal(settlement(s.sessions[0],'a').total,11200);});
test('valid backups accepted; invalid score, duplicates, script URL and negative price rejected',()=>{validateState(fixture());for(const edit of [s=>s.sessions[0].games[0].rows[0].score=301,s=>s.sessions[0].games[0].rows[1].memberId='a',s=>s.sessions[0].games[0].photo='javascript:alert(1)',s=>s.sessions[0].attendees[0].charges[0].unitPrice=-1]){const s=fixture();edit(s);assert.throws(()=>validateState(s));}});
test('version 1 A-D records and fees survive an A-H game and JSON backup round trip',()=>{
  const s=fixture(),visit=s.sessions[0],labels=[...'ABCDEFGH'];
  for(const label of labels.slice(2)){const id=label.toLowerCase();s.members.push({id,name:'참가자 '+label,type:'student'});ensureAttendee(visit,id);}
  visit.games[0].rows.push({label:'C',memberId:'c',score:120},{label:'D',memberId:'d',score:130});
  const oldGames=structuredClone(visit.games),oldFees=settlement(visit,'a');
  assert.equal(validateState(s),s);
  const before=JSON.stringify(s);
  visit.games.push({id:'g8',photo:null,rows:labels.map((label,i)=>({label,memberId:label.toLowerCase(),score:i===7?300:i*30}))});
  assert.equal(validateState(s),s);
  const saved=JSON.stringify(s),restored=validateState(JSON.parse(saved));
  assert.equal(restored.version,1);
  assert.equal(JSON.stringify(restored),saved);
  assert.deepEqual(restored.sessions[0].games.slice(0,oldGames.length),oldGames);
  assert.deepEqual(settlement(restored.sessions[0],'a'),oldFees);
  assert.deepEqual(stats(restored,'a'),{count:4,total:300,average:75,best:200});
  assert.deepEqual(stats(restored,'h'),{count:1,total:300,average:300,best:300});
  assert.equal(gameCount(restored.sessions[0],'h'),1);
  const legacy=JSON.parse(before);assert.deepEqual(validateState(legacy),JSON.parse(before));
  for(const edit of [rows=>rows[7].label='G',rows=>rows[7].memberId='g',rows=>rows[7].score=301,rows=>rows[7].label='AB']){const invalid=JSON.parse(saved);edit(invalid.sessions[0].games.at(-1).rows);assert.throws(()=>validateState(invalid));}
});
