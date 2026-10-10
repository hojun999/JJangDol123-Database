import test from 'node:test';
import assert from 'node:assert/strict';
import {blueScreens,cropText,findScoreLayout,findScoreBox,digitLoops,scoreCandidate,combineDigitCandidates,chooseScore,panelRegion,mergeScreenResults} from '../src/ocr.js';
import {initialState,validateState,nextLaneLabel,stats,gameCount,settlement} from '../src/core.js';
const token=(text,x,y)=>({text,confidence:90,bbox:{x0:x,y0:y,x1:x+20,y1:y+30}});
test('two separate blue monitors remain separate; partial slivers and blue noise are ignored',()=>{
  const w=360,h=180,data=new Uint8ClampedArray(w*h*4);
  const blue=(x,y,width,height)=>{for(let dy=y;dy<y+height;dy++)for(let dx=x;dx<x+width;dx++){const i=(dy*w+dx)*4;data[i]=10;data[i+1]=40;data[i+2]=240;}};
  blue(8,40,140,90);blue(188,24,156,90);blue(352,20,8,140);blue(160,140,12,12);
  const panels=blueScreens(data,w,h);assert.equal(panels.length,2);assert.equal(panels[0][0].x,8);assert.equal(panels[1][0].x,188);
  assert.deepEqual(blueScreens(new Uint8ClampedArray(w*h*4),w,h),[]);
});
test('each HDP header locates its own A-C or D-E rows, including a missing middle letter',()=>{
  const left=findScoreLayout([token('HDP',850,20),token('A',20,130),token('C',20,330)],1000,600);
  const right=findScoreLayout([token('HDP',860,20),token('D',20,180),token('E',20,280)],1000,600);
  assert.deepEqual(left.rows.map(r=>r.label),['A','C']);assert.deepEqual(right.rows.map(r=>r.label),['D','E']);
  assert(left.rows[0].box.y+left.rows[0].box.h<left.rows[1].box.y);
  assert.deepEqual(findScoreLayout([token('A',20,100)],1000,600).rows,[]);
});
test('2 vs 2 and 3 vs 2 are sorted by actual letters, without shifting a blank or accepting duplicates',()=>{
  const result=labels=>({rows:labels.map(label=>({label,score:100})),reason:'',diagnostics:{}});
  assert.deepEqual(mergeScreenResults([result(['C','D']),result(['A','B'])]).rows.map(r=>r.label),[...'ABCD']);
  const left=result(['A','B','C']);left.rows[1].score='';
  const merged=mergeScreenResults([result(['D','E']),left]);assert.deepEqual(merged.rows.map(r=>r.label),[...'ABCDE']);assert.equal(merged.rows[1].score,'');assert.equal(merged.rows[3].score,100);
  const duplicate=mergeScreenResults([left,result(['C','D'])]);assert.equal(duplicate.rows.find(r=>r.label==='C').score,'');assert.match(duplicate.reason,/중복/);
  const failure=mergeScreenResults([left,{rows:[],reason:'HDP 누락',diagnostics:{}}]);assert.equal(failure.rows.length,3);assert.match(failure.reason,/2번째 모니터/);
});
test('manual HDP selection maps to one monitor and its own height',()=>{
  const screens=[{width:1200,height:700},{width:1200,height:650}],region={x:.94,y:.2,w:.05,h:.4};
  assert.equal(panelRegion(region,screens,0),null);
  const mapped=panelRegion(region,screens,1);assert(Math.abs(mapped.x-.88)<1e-12);assert(Math.abs(mapped.w-.1)<1e-12);assert(Math.abs(mapped.y-140/650)<1e-12);assert(Math.abs(mapped.h-280/650)<1e-12);
  assert.equal(panelRegion(null,screens,1),null);
});
test('score crop excludes handicap boxes, borders, clipped neighboring cells and footer',()=>{
  const row={box:{x:800,y:400,w:180,h:120},centerY:455,glyphHeight:50},digits=[{x:100,y:35,w:24,h:50},{x:130,y:35,w:24,h:50}],clutter=[{x:10,y:0,w:160,h:20},{x:170,y:0,w:1,h:120},{x:0,y:35,w:8,h:50},{x:10,y:105,w:18,h:15}];
  assert.deepEqual(findScoreBox([...digits,...clutter],row),{x:896,y:431,w:62,h:58,digits:2});assert.equal(findScoreBox(clutter,row),null);
  assert.equal(findScoreBox([...digits,{x:10,y:55,w:24,h:50}],row),null);
});
test('zero is valid, dropped or added digits and conflicting OCR candidates are rejected',()=>{
  assert.equal(scoreCandidate({text:'0',confidence:90},1).score,0);
  for(const text of ['','65 107','301','-1','1.5','05'])assert.equal(scoreCandidate({text,confidence:90}),null);
  assert.equal(scoreCandidate({text:'7',confidence:99},2),null);assert.equal(scoreCandidate({text:'174',confidence:99},2),null);assert.equal(scoreCandidate({text:'77',confidence:60},2).score,77);
  assert.equal(chooseScore([{score:65,confidence:34},{score:69,confidence:93}]),null);assert.equal(chooseScore([{score:77,confidence:60},{score:77,confidence:93}]).score,77);
  assert.equal(scoreCandidate({text:'89',confidence:99},2,[1,1]),null);assert.equal(scoreCandidate({text:'69',confidence:50},2,[1,1]).score,69);
  assert.equal(scoreCandidate({text:'63',confidence:57},2,[1,1]),null);
  assert.equal(scoreCandidate({text:'88',confidence:90},2,[2,2]).score,88);
});
test('closed digit loops reject a false 8 without replacing it with another number',()=>{
  const width=90,height=63,data=new Uint8ClampedArray(width*height*4).fill(255);
  for(const [left,double] of [[6,true],[48,false]])for(let y=3;y<60;y++)for(let x=left;x<left+30;x++){
    const outside=x<left+5||x>=left+25||y<8||y>=55||(y>=28&&y<34);
    const lowerOnly=!double&&y<28&&x>=left+5;
    if(outside&&!lowerOnly){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;}
  }
  const canvas={width,height,getContext:()=>({getImageData:()=>({data})})};assert.deepEqual(digitLoops(canvas),[2,1]);
});
test('only unambiguous OCR-supported digits are combined after excluding incompatible loops',()=>{
  const readings=[{text:'89',confidence:60},{text:'63',confidence:59}];
  assert.equal(combineDigitCandidates(readings,2,[1,1]).score,69);
  assert.equal(combineDigitCandidates([...readings,{text:'99',confidence:80}],2,[1,1]),null);
  assert.equal(combineDigitCandidates([{text:'89',confidence:60}],2,[1,1]),null);
  assert.equal(combineDigitCandidates([{text:'17',confidence:90}],3,[0,0,0]),null);
});
test('bright digits on a dark board use the border background for grayscale polarity',()=>{
  const previous=globalThis.document;let output;
  globalThis.document={createElement:()=>({getContext:()=>({drawImage(){},getImageData(x,y,w,h){const data=new Uint8ClampedArray(w*h*4).fill(255);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,v=x===0||y===0||x===w-1||y===h-1?30:220;data[i]=data[i+1]=data[i+2]=v;}return {data};},putImageData(pixels){output=pixels.data;}})})};
  try{cropText({}, {x:0,y:0,w:10,h:10});assert.equal(output[0],225);assert.equal(output[(15*30+15)*4],35);}finally{globalThis.document=previous;}
});
test('five-player game survives version 1 backup with statistics and fees; duplicates are rejected',()=>{
  const s=initialState(),labels=[...'ABCDE'];s.members=labels.map(label=>({id:label,name:label,type:'student'}));
  s.sessions=[{id:'v',date:'2026-10-10',centerSnapshot:structuredClone(s.centers[0]),attendees:labels.map(memberId=>({memberId,type:'student',shoeExempt:true,shoeFee:0,charges:[{unitPrice:3500,games:1}]})),games:[{id:'g',rows:labels.map((label,i)=>({label,memberId:label,score:[88,117,69,85,97][i]}))}]}];
  const restored=validateState(JSON.parse(JSON.stringify(s)));assert.deepEqual(restored,s);assert.equal(stats(restored,'E').average,97);assert.equal(gameCount(restored.sessions[0],'E'),1);assert.equal(settlement(restored.sessions[0],'E').total,3500);
  assert.equal(nextLaneLabel([{label:'A'},{label:'C'},{label:'D'},{label:'E'}]),'B');
  const invalid=structuredClone(s);invalid.sessions[0].games[0].rows[4].label='D';assert.throws(()=>validateState(invalid));
});
