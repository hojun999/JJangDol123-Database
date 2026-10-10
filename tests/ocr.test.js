import test from 'node:test';
import assert from 'node:assert/strict';
import {cropText,inkBoxes,findScoreLayout,findScoreBox,scoreCandidate,chooseScore} from '../src/ocr.js';
import {nextLaneLabel,initialState,validateState} from '../src/core.js';
const token=(text,x,y,confidence=90)=>({text,confidence,bbox:{x0:x,y0:y,x1:x+20,y1:y+30}});
test('wide E-H lane glyphs remain OCR candidates',()=>{
  const glyphs=[['11111','10000','10000','11111','10000','10000','11111'],['11111','10000','10000','11111','10000','10000','10000'],['11111','10000','10000','10111','10001','10001','11111'],['10001','10001','10001','11111','10001','10001','10001']];
  const width=30,height=140,data=new Uint8ClampedArray(width*height*4).fill(255);
  glyphs.forEach((glyph,index)=>glyph.forEach((line,y)=>[...line].forEach((ink,x)=>{if(ink==='1')for(let dy=0;dy<3;dy++)for(let dx=0;dx<4;dx++){const offset=((index*30+5+y*3+dy)*width+5+x*4+dx)*4;data[offset]=data[offset+1]=data[offset+2]=0;}})));
  for(let y=130;y<138;y++)for(let x=0;x<width;x++)data[(y*width+x)*4]=0;
  const canvas={width,height,getContext:()=>({getImageData:()=>({data})})};
  assert.equal(inkBoxes(canvas).length,4);
});
test('A-H HDP rows retain their own cells, including gaps and a selected lower region',()=>{
  const labels=[...'ABCDEFGH'],tokens=[token('HDP',850,20),...labels.map((label,i)=>token(label,20,100+i*75)),token('251',900,740)];
  const result=findScoreLayout(tokens,1000,800);
  assert.deepEqual(result.rows.map(r=>r.label),labels);
  result.rows.forEach((row,i)=>{assert(row.box.y>=0&&row.box.y+row.box.h<=800);if(i)assert(result.rows[i-1].box.y+result.rows[i-1].box.h<row.box.y);});
  assert.deepEqual(findScoreLayout(tokens.filter(t=>t.text!=='F'),1000,800).rows.map(r=>r.label),[...'ABCDEGH']);
  assert.deepEqual(findScoreLayout(tokens,1000,800,{x:.8,y:.5,w:.18,h:.4}).rows.map(r=>r.label),[...'EFGH']);
  assert.equal(nextLaneLabel(labels.slice(0,4).map(label=>({label}))),'E');
  assert.equal(nextLaneLabel(labels.filter(label=>label!=='G').map(label=>({label}))),'G');
});
test('HDP coordinates preserve lane labels and missing rows; no header gives no guessed totals',()=>{
  const tokens=[token('HDP',850,70),token('A',20,200),token('C',20,400),token('E',20,600),token('251',900,750)];
  const result=findScoreLayout(tokens,1000,800);
  assert.deepEqual(result.rows.map(r=>r.label),['A','C','E']);
  assert(result.rows[0].box.y+result.rows[0].box.h<result.rows[1].box.y);
  assert.deepEqual(findScoreLayout(tokens.filter(t=>t.text!=='HDP'),1000,800).rows,[]);
  assert.deepEqual(findScoreLayout([...tokens,token('C',25,500)],1000,800).rows,[]);
  assert.deepEqual(findScoreLayout(tokens,1000,800,{x:.8,y:.35,w:.18,h:.4}).rows.map(r=>r.label),['C']);
});
test('zero is valid; merged scores, out-of-range scores and close conflicting candidates remain unconfirmed',()=>{
  assert.equal(scoreCandidate({text:'0\n',confidence:90}).score,0);
  for(const text of ['','65 107','301','-1','1.5','05'])assert.equal(scoreCandidate({text,confidence:90}),null);
  assert.equal(scoreCandidate({text:'7',confidence:99},2),null);
  assert.equal(scoreCandidate({text:'174',confidence:99},2),null);
  assert.equal(scoreCandidate({text:'77',confidence:60},2).score,77);
  assert.equal(chooseScore([{score:69,confidence:88},{score:89,confidence:80}]),null);
  assert.equal(chooseScore([{score:65,confidence:34},{score:69,confidence:63}]),null);
  assert.equal(chooseScore([{score:77,confidence:40},{score:7,confidence:18}]),null);
  assert.equal(chooseScore([{score:77,confidence:40},{score:77,confidence:18}]).score,77);
  assert.equal(chooseScore([]),null);
});
test('score crop keeps both repeated digits and excludes handicap boxes, borders and the next row',()=>{
  const row={box:{x:800,y:400,w:180,h:120},centerY:455,glyphHeight:50};
  const digits=[{x:100,y:35,w:24,h:50},{x:130,y:35,w:24,h:50}];
  const clutter=[{x:10,y:0,w:160,h:20},{x:170,y:0,w:1,h:120},{x:10,y:105,w:18,h:15}];
  const box=findScoreBox([...digits,...clutter],row);
  assert.deepEqual(box,{x:896,y:431,w:62,h:58,digits:2});
  assert.equal(findScoreBox(clutter,row),null);
  assert.equal(findScoreBox([...digits,{x:10,y:55,w:24,h:50}],row),null);
  assert.equal(findScoreBox([...digits,{x:0,y:35,w:8,h:50}],row).digits,2);
  assert.equal(findScoreBox([...digits,{x:55,y:35,w:24,h:50},{x:10,y:35,w:24,h:50}],row),null);
});
test('bright digits on a dark board use the border background for grayscale polarity',()=>{
  const previous=globalThis.document;let output;
  globalThis.document={createElement:()=>({getContext:()=>({drawImage(){},getImageData(x,y,w,h){const data=new Uint8ClampedArray(w*h*4).fill(255);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,v=x===0||y===0||x===w-1||y===h-1?30:220;data[i]=data[i+1]=data[i+2]=v;}return {data};},putImageData(pixels){output=pixels.data;}})})};
  try{cropText({}, {x:0,y:0,w:10,h:10});assert.equal(output[0],225);assert.equal(output[(15*30+15)*4],35);}finally{globalThis.document=previous;}
});
test('adding a removed lane reuses its letter; backup validation accepts E and rejects duplicate lanes',()=>{
  assert.equal(nextLaneLabel([{label:'A'},{label:'C'},{label:'D'}]),'B');
  const s=initialState();s.members=[{id:'m',name:'참가자',type:'student'}];
  s.sessions=[{id:'v',date:'2026-10-08',centerSnapshot:s.centers[0],attendees:[{memberId:'m',type:'student',shoeExempt:true,shoeFee:0,charges:[]}],games:[{id:'g',rows:[{label:'E',memberId:'m',score:0}]}]}];
  assert.equal(validateState(s),s);
  s.sessions[0].games[0].rows[0].label='AB';assert.throws(()=>validateState(s));
  s.sessions[0].games[0].rows[0].label='E';
  s.members.push({id:'n',name:'참가자 2',type:'general'});
  s.sessions[0].attendees.push({memberId:'n',type:'general',shoeExempt:true,shoeFee:0,charges:[]});
  s.sessions[0].games[0].rows.push({label:'E',memberId:'n',score:100});assert.throws(()=>validateState(s));
});
