import {createWorker,PSM} from 'tesseract.js';
import {laneLabels} from './core.js';
export function eraseSolidBoxes(canvas){
  const ctx=canvas.getContext('2d'),im=ctx.getImageData(0,0,canvas.width,canvas.height),w=canvas.width,h=canvas.height,seen=new Uint8Array(w*h);
  for(let index=0;index<w*h;index++){if(seen[index]||im.data[index*4]>100)continue;const queue=[index],points=[];seen[index]=1;let minX=w,maxX=0,minY=h,maxY=0;
    for(let q=0;q<queue.length;q++){const p=queue[q],x=p%w,y=Math.floor(p/w);points.push(p);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);for(const next of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(next>=0&&!seen[next]&&im.data[next*4]<100){seen[next]=1;queue.push(next);}}
    const width=maxX-minX+1,height=maxY-minY+1;if(width>w*.3&&points.length/(width*height)>.65)for(const p of points)im.data[p*4]=im.data[p*4+1]=im.data[p*4+2]=255;
  }ctx.putImageData(im,0,0);return canvas;
}
export async function readImage(file){
  if(file.size>20*1024*1024)throw Error('사진은 한 장당 20MB 이하로 올려주세요.');
  const img=new Image();img.src=URL.createObjectURL(file);try{
    await img.decode();const c=document.createElement('canvas');
    const draw=limit=>{const scale=Math.min(1,limit/img.width);c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);};
    draw(1600);
    if(blueScreens(c.getContext('2d').getImageData(0,0,c.width,c.height).data,c.width,c.height).length>1)draw(3200);
    return c;
  }finally{URL.revokeObjectURL(img.src);}
}
export function blueScreens(data,w,h){
  const step=4,gw=Math.ceil(w/step),gh=Math.ceil(h/step),blue=new Uint8Array(gw*gh),groups=[];
  for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){const i=(y*step*w+x*step)*4,r=data[i],g=data[i+1],b=data[i+2];blue[y*gw+x]=b>75&&b>r*1.8&&b>g*1.4?1:0;}
  for(let i=0;i<blue.length;i++){if(!blue[i])continue;const queue=[i];blue[i]=0;for(let q=0;q<queue.length;q++){const p=queue[q],x=p%gw,y=Math.floor(p/gw);for(const next of [x>0?p-1:-1,x<gw-1?p+1:-1,y>0?p-gw:-1,y<gh-1?p+gw:-1])if(next>=0&&blue[next]){blue[next]=0;queue.push(next);}}groups.push(queue);}
  const largest=groups.reduce((n,g)=>Math.max(n,g.length),0);
  return groups.filter(g=>g.length>=largest*.25&&g.length>20).map(group=>{
    const cols=new Map();for(const p of group){const x=p%gw*step,y=Math.floor(p/gw)*step,col=cols.get(x)||{x,top:h,bottom:0};col.top=Math.min(col.top,y);col.bottom=Math.max(col.bottom,y);cols.set(x,col);}
    return [...cols.values()].sort((a,b)=>a.x-b.x);
  }).filter(cols=>cols.length>=10&&cols.at(-1).x-cols[0].x>=(Math.max(...cols.map(c=>c.bottom))-Math.min(...cols.map(c=>c.top)))*.75).sort((a,b)=>a[0].x-b[0].x);
}
// shortcut: 파란 점수판 기준입니다. 다른 색상은 실제 표본으로 확장합니다.
export function flattenScreens(source){
  const {data}=source.getContext('2d').getImageData(0,0,source.width,source.height),w=source.width,h=source.height,panels=blueScreens(data,w,h);
  if(!panels.length)return [source];
  return panels.map(cols=>{
    const min=cols[0].x,max=cols.at(-1).x,inner=cols.filter(c=>c.x>min+(max-min)*.12&&c.x<max-(max-min)*.12);
    function line(key){const n=inner.length,sx=inner.reduce((s,c)=>s+c.x,0),sy=inner.reduce((s,c)=>s+c[key],0),sxx=inner.reduce((s,c)=>s+c.x*c.x,0),sxy=inner.reduce((s,c)=>s+c.x*c[key],0);const a=(n*sxy-sx*sy)/(n*sxx-sx*sx);return x=>a*x+(sy-a*sx)/n;}
    const top=line('top'),bottom=line('bottom'),out=document.createElement('canvas');out.width=1200;out.height=Math.min(1000,Math.max(400,Math.round(1200*(bottom((min+max)/2)-top((min+max)/2))/(max-min))));
    const ctx=out.getContext('2d'),pixels=ctx.createImageData(out.width,out.height);
    for(let y=0;y<out.height;y++)for(let x=0;x<out.width;x++){const sx=Math.round(min+(max-min)*x/(out.width-1)),sy=Math.round(top(sx)+(bottom(sx)-top(sx))*y/(out.height-1)),i=(Math.max(0,Math.min(h-1,sy))*w+Math.max(0,Math.min(w-1,sx)))*4,j=(y*out.width+x)*4;pixels.data[j]=data[i];pixels.data[j+1]=data[i+1];pixels.data[j+2]=data[i+2];pixels.data[j+3]=255;}ctx.putImageData(pixels,0,0);return out;
  });
}
export function joinScreens(screens){
  const canvas=document.createElement('canvas');canvas.width=screens.reduce((n,s)=>n+s.width,0);canvas.height=Math.max(...screens.map(s=>s.height));const ctx=canvas.getContext('2d');ctx.fillStyle='#111';ctx.fillRect(0,0,canvas.width,canvas.height);let x=0;for(const screen of screens){ctx.drawImage(screen,x,0);x+=screen.width;}return canvas;
}
export function cropText(screen,box,mode='gray'){
  const crop=document.createElement('canvas'),scale=3;crop.width=Math.max(1,Math.round(box.w*scale));crop.height=Math.max(1,Math.round(box.h*scale));
  const ctx=crop.getContext('2d');ctx.drawImage(screen,box.x,box.y,box.w,box.h,0,0,crop.width,crop.height);const pixels=ctx.getImageData(0,0,crop.width,crop.height);let sum=0,count=0;
  for(let y=0;y<crop.height;y++)for(let x=0;x<crop.width;x++)if(x===0||y===0||x===crop.width-1||y===crop.height-1){const i=(y*crop.width+x)*4;sum+=pixels.data[i]*.299+pixels.data[i+1]*.587+pixels.data[i+2]*.114;count++;}
  const invert=sum/count<128;
  for(let i=0;i<pixels.data.length;i+=4){const r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2],gray=r*.299+g*.587+b*.114;const v=mode==='yellow'?(r>50&&g>50&&r>b*.6&&g>b*.6&&g>r*.55?0:255):mode==='cyan'?(g>80&&g>r*1.4&&g>b*.7?0:255):mode==='white'?(r>100&&g>100&&b>100?0:255):(invert?255-gray:gray);pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;}
  ctx.putImageData(pixels,0,0);return mode==='white'?eraseSolidBoxes(crop):crop;
}
function words(data){return (data.blocks||[]).flatMap(b=>b.paragraphs||[]).flatMap(p=>p.lines||[]).flatMap(l=>l.words||[]);}
export function inkBoxes(canvas){
  const {width:w,height:h}=canvas,pixels=canvas.getContext('2d').getImageData(0,0,w,h).data,seen=new Uint8Array(w*h),boxes=[];
  for(let i=0;i<w*h;i++){if(seen[i]||pixels[i*4]>100)continue;const queue=[i];seen[i]=1;let x0=w,x1=0,y0=h,y1=0;
    for(let q=0;q<queue.length;q++){const p=queue[q],x=p%w,y=Math.floor(p/w);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);for(const next of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(next>=0&&!seen[next]&&pixels[next*4]<100){seen[next]=1;queue.push(next);}}
    if(y1-y0>canvas.height*.02&&y1-y0>(x1-x0)*.8)boxes.push({x:x0/3,y:y0/3,w:(x1-x0+1)/3,h:(y1-y0+1)/3});
  }return boxes;
}
function hasLaneCell(screen,box){
  const {data}=screen.getContext('2d').getImageData(0,0,screen.width,screen.height);
  for(let column=Math.ceil(box.x+box.w+3);column<screen.width*.15;column++){let count=0;for(let y=Math.ceil(box.y);y<box.y+box.h;y++)for(let x=column-2;x<=column+2;x++){const i=(y*screen.width+x)*4,r=data[i],g=data[i+1],b=data[i+2],around=(data[i-24+1]+data[i+24+1])/2;if(((g>170&&b>r*.95)||(g>80&&g>r*1.2&&g>b*.45))&&g>around+30){count++;break;}}if(count>box.h*.6)return true;}return false;
}
export function findScoreBox(boxes,row){
  const height=row.glyphHeight,center=row.centerY-row.box.y,glyphs=boxes.filter(b=>b.x>0&&b.h>=height*.7&&b.h<=height*1.6&&b.w>=b.h*.08).sort((a,b)=>a.x-b.x),groups=[];
  for(const glyph of glyphs){let group=groups.find(g=>Math.abs(g[0].y+g[0].h/2-glyph.y-glyph.h/2)<Math.min(g[0].h,glyph.h)*.35);if(!group){group=[];groups.push(group);}group.push(glyph);}
  const nearby=groups.filter(g=>Math.abs(g[0].y+g[0].h/2-center)<height*.8);if(nearby.length!==1||nearby[0].length>3)return null;
  const group=nearby[0],x=Math.min(...group.map(b=>b.x)),y=Math.min(...group.map(b=>b.y)),right=Math.max(...group.map(b=>b.x+b.w)),bottom=Math.max(...group.map(b=>b.y+b.h)),pad=4;
  return {x:row.box.x+Math.max(0,x-pad),y:row.box.y+Math.max(0,y-pad),w:Math.min(row.box.w,right+pad)-Math.max(0,x-pad),h:Math.min(row.box.h,bottom+pad)-Math.max(0,y-pad),digits:group.length};
}
function screenWords(data,box,crop){return words(data).map(item=>({text:item.text,confidence:item.confidence,bbox:{x0:box.x+item.bbox.x0*box.w/crop.width,x1:box.x+item.bbox.x1*box.w/crop.width,y0:box.y+item.bbox.y0*box.h/crop.height,y1:box.y+item.bbox.y1*box.h/crop.height}}));}
export function findScoreLayout(tokens,width,height,region=null){
  const headers=tokens.filter(t=>t.text.trim().toUpperCase()==='HDP'&&t.bbox.x0>width*.5),header=headers.length===1?headers[0]:null;
  if(!region&&!header)return {rows:[],reason:'HDP 열을 찾지 못했습니다. 해당 모니터의 HDP 열을 드래그로 지정하세요.'};
  const labels=tokens.filter(t=>/^[A-Z]$/.test(t.text.trim())&&t.bbox.x1<width*.15&&t.bbox.y0>(header?.bbox.y1||0)&&(region?((t.bbox.y0+t.bbox.y1)/2>=region.y*height&&(t.bbox.y0+t.bbox.y1)/2<=(region.y+region.h)*height):true)).sort((a,b)=>a.bbox.y0-b.bbox.y0);
  if(!labels.length||new Set(labels.map(t=>t.text.trim())).size!==labels.length)return {rows:[],reason:'레인 글자를 확인하지 못했습니다. 점수를 직접 입력하세요.'};
  const steps=labels.slice(1).map((t,i)=>((t.bbox.y0+t.bbox.y1-labels[i].bbox.y0-labels[i].bbox.y1)/2)/(t.text.trim().charCodeAt(0)-labels[i].text.trim().charCodeAt(0))).filter(n=>n>0).sort((a,b)=>a-b),spacing=steps[Math.floor(steps.length/2)]||Math.max(...labels.map(t=>(t.bbox.y1-t.bbox.y0)*2));
  let left=region?region.x*width:Math.max(width*.5,header.bbox.x0-(header.bbox.x1-header.bbox.x0)*.3),right=region?(region.x+region.w)*width:width;
  if(header&&!region){const next=tokens.filter(t=>t.bbox.x0>header.bbox.x1&&Math.abs(t.bbox.y0-header.bbox.y0)<(header.bbox.y1-header.bbox.y0)).sort((a,b)=>a.bbox.x0-b.bbox.x0)[0];if(next)right=(header.bbox.x1+next.bbox.x0)/2;}
  return {rows:labels.map(t=>{const cy=(t.bbox.y0+t.bbox.y1)/2,y=Math.max(header?.bbox.y1||0,cy-spacing*.4),bottom=Math.min(height,cy+spacing*.4);return {label:t.text.trim(),confidence:t.confidence,centerY:cy,glyphHeight:t.bbox.y1-t.bbox.y0,box:{x:left,y,w:right-left,h:bottom-y}};})};
}
export function digitLoops(canvas){
  const w=canvas.width,pixels=canvas.getContext('2d').getImageData(0,0,w,canvas.height).data;
  return inkBoxes(canvas).filter(b=>b.h*3>canvas.height*.5).sort((a,b)=>a.x-b.x).map(box=>{
    const left=Math.round(box.x*3),top=Math.round(box.y*3),gw=Math.round(box.w*3),gh=Math.round(box.h*3),seen=new Uint8Array(gw*gh);let loops=0;
    for(let p=0;p<seen.length;p++){
      if(seen[p]||pixels[((top+Math.floor(p/gw))*w+left+p%gw)*4]<100)continue;
      const queue=[p];seen[p]=1;let edge=false;
      for(let q=0;q<queue.length;q++){const n=queue[q],x=n%gw,y=Math.floor(n/gw);if(x===0||y===0||x===gw-1||y===gh-1)edge=true;for(const next of [x>0?n-1:-1,x<gw-1?n+1:-1,y>0?n-gw:-1,y<gh-1?n+gw:-1])if(next>=0&&!seen[next]&&pixels[((top+Math.floor(next/gw))*w+left+next%gw)*4]>100){seen[next]=1;queue.push(next);}}
      if(!edge&&queue.length>gw*gh*.018)loops++;
    }return loops;
  });
}
export function scoreCandidate(data,digits,loops){const text=data.text.trim();return /^(0|[1-9]\d{0,2})$/.test(text)&&Number(text)<=300&&(digits===undefined||text.length===digits)&&(!loops||([...text].every((digit,i)=>digit==='8'?loops[i]===2:!('12357'.includes(digit)&&loops[i]>0))))?{score:Number(text),confidence:data.confidence,text}:null;}
export function combineDigitCandidates(readings,digits,loops){
  if(loops?.length!==digits)return null;
  const words=readings.map(data=>scoreCandidate(data,digits)).filter(Boolean),parts=[];
  for(let i=0;i<digits;i++){
    const valid=words.filter(word=>scoreCandidate({text:word.text[i],confidence:word.confidence},1,[loops[i]])),values=new Set(valid.map(word=>word.text[i]));
    if(values.size!==1)return null;
    parts.push({text:[...values][0],confidence:Math.max(...valid.map(word=>word.confidence))});
  }
  return scoreCandidate({text:parts.map(p=>p.text).join(''),confidence:Math.min(...parts.map(p=>p.confidence))},digits,loops);
}
export function chooseScore(candidates){const found=candidates.filter(Boolean);return new Set(found.map(c=>c.score)).size===1?found.sort((a,b)=>b.confidence-a.confidence)[0]:null;}
async function recognizeScreen(screen,worker,region){
  const diagnostics={layout:[],scores:[]},labelMask=cropText(screen,{x:0,y:0,w:screen.width*.12,h:screen.height},'yellow'),labelBoxes=inkBoxes(labelMask);
  await worker.setParameters({tessedit_char_whitelist:laneLabels,tessedit_pageseg_mode:PSM.SINGLE_WORD});
  for(const box of labelBoxes.filter(box=>box.x+box.w<screen.width*.1&&hasLaneCell(screen,box)&&!labelBoxes.some(other=>other.x>box.x+box.w&&other.x-box.x-box.w<box.w*1.5&&other.w>box.w*.5&&Math.abs(other.y+other.h/2-box.y-box.h/2)<box.h*.2))){const padded={x:Math.max(0,box.x-5),y:Math.max(0,box.y-5),w:box.w+10,h:box.h+10},candidates=[];for(const [mode,psm] of [['gray',PSM.SINGLE_WORD],['yellow',PSM.SINGLE_CHAR]]){await worker.setParameters({tessedit_pageseg_mode:psm});let crop=cropText(screen,padded,mode);if(mode==='yellow'){const stretched=document.createElement('canvas');stretched.width=Math.round(crop.width*1.6);stretched.height=crop.height;stretched.getContext('2d').drawImage(crop,0,0,stretched.width,stretched.height);crop=stretched;}const {data}=await worker.recognize(crop,{}, {text:true,blocks:true});diagnostics.scores.push({glyph:true,box,mode,text:data.text,confidence:data.confidence});if(/^[A-Z]$/.test(data.text.trim())&&data.confidence>0)candidates.push(data);}const data=candidates.at(-1);if(data)diagnostics.layout.push({text:data.text.trim(),confidence:data.confidence,bbox:{x0:box.x,y0:box.y,x1:box.x+box.w,y1:box.y+box.h}});}
  const box={x:screen.width*.78,y:0,w:screen.width*.22,h:screen.height*.35},mask=cropText(screen,box,'cyan'),glyphs=inkBoxes(mask).filter(g=>g.h>screen.height*.03).sort((a,b)=>a.x-b.x),groups=[];
  for(const glyph of glyphs){const last=groups.at(-1)?.at(-1);if(!last||glyph.x-last.x-last.w>Math.max(glyph.h,last.h)*.5||Math.abs(glyph.y-last.y)>Math.max(glyph.h,last.h)*.3)groups.push([]);groups.at(-1).push(glyph);}
  await worker.setParameters({tessedit_char_whitelist:'HDP',tessedit_pageseg_mode:PSM.SINGLE_WORD});
  for(const group of groups){const left=Math.min(...group.map(g=>g.x)),top=Math.min(...group.map(g=>g.y)),right=Math.max(...group.map(g=>g.x+g.w)),bottom=Math.max(...group.map(g=>g.y+g.h)),part={x:box.x+left-3,y:top-3,w:right-left+6,h:bottom-top+6},crop=cropText(screen,part);const {data}=await worker.recognize(crop,{}, {text:true,blocks:true});diagnostics.layout.push(...screenWords(data,part,crop));}
  const layout=findScoreLayout(diagnostics.layout,screen.width,screen.height,region),rows=[];
  for(const row of layout.rows){
    const candidates=[],readings=[],box=findScoreBox(inkBoxes(cropText(screen,row.box,'white')),row),mask=box?cropText(screen,box,'white'):null,loops=mask?digitLoops(mask):null;
    if(box)for(const mode of ['gray','white','white-wide','white-line']){
      if(mode.startsWith('white-')&&candidates.length)break;
      await worker.setParameters({tessedit_char_whitelist:'0123456789',tessedit_pageseg_mode:mode==='white-line'?PSM.SINGLE_LINE:PSM.SINGLE_WORD});
      const crop=cropText(screen,box,mode==='gray'?'gray':'white'),padded=document.createElement('canvas');padded.width=Math.round(crop.width*(mode==='white-wide'?1.3:1))+60;padded.height=crop.height+60;
      const ctx=padded.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,padded.width,padded.height);ctx.drawImage(crop,30,30,padded.width-60,crop.height);
      const {data}=await worker.recognize(padded,{}, {text:true,blocks:true});readings.push(data);diagnostics.scores.push({label:row.label,mode,box,loops,text:data.text,confidence:data.confidence});
      // 흰색 마스크에서 고리가 끊길 수 있어 약한 후보에만 형태 검사를 적용합니다.
      const candidate=scoreCandidate(data,box.digits,data.confidence<70?loops:null);if(candidate)candidates.push(candidate);
    }
    if(box&&!candidates.length){const candidate=combineDigitCandidates(readings,box.digits,loops);if(candidate){candidates.push(candidate);diagnostics.scores.push({label:row.label,mode:'digit-consensus',text:candidate.text,confidence:candidate.confidence});}}
    const candidate=chooseScore(candidates);rows.push({label:row.label,score:candidate?.score??'',confidence:candidate?.confidence??0,needsReview:!candidate||candidates.length<2||candidate.confidence<70||row.confidence<70});
  }
  return {rows,reason:layout.reason||'',diagnostics};
}
export function panelRegion(region,screens,index){
  if(!region)return null;
  const width=screens.reduce((n,s)=>n+s.width,0),height=Math.max(...screens.map(s=>s.height)),screen=screens[index],offset=screens.slice(0,index).reduce((n,s)=>n+s.width,0),left=Math.max(offset,region.x*width),right=Math.min(offset+screen.width,(region.x+region.w)*width),top=Math.max(0,region.y*height),bottom=Math.min(screen.height,(region.y+region.h)*height);
  return right>left&&bottom>top?{x:(left-offset)/screen.width,y:top/screen.height,w:(right-left)/screen.width,h:(bottom-top)/screen.height}:null;
}
export function mergeScreenResults(results){
  const rows=new Map(),reasons=results.flatMap((r,i)=>r.reason?[`${i+1}번째 모니터: ${r.reason}`]:[]);
  for(const result of results)for(const row of result.rows){if(rows.has(row.label)){rows.set(row.label,{label:row.label,score:'',confidence:0,needsReview:true});reasons.push(`${row.label} 글자가 여러 모니터에 중복되었습니다. 사진과 비교해 직접 입력하세요.`);}else rows.set(row.label,row);}
  return {rows:[...rows.values()].sort((a,b)=>a.label.localeCompare(b.label)),reason:reasons.join(' '),diagnostics:{screens:results.map(r=>r.diagnostics)}};
}
export async function recognizeTotals(screens,progress,region=null){
  let worker;
  try{
    worker=await createWorker('eng',1,{workerPath:new URL('ocr/worker.min.js',document.baseURI).href,corePath:new URL('ocr/',document.baseURI).href,langPath:new URL('ocr/',document.baseURI).href,cachePath:'bowling-best-int-v1',logger:m=>{if(m.status==='recognizing text')progress?.(Math.round(m.progress*100));}});
    const results=[];for(let i=0;i<screens.length;i++){const selected=panelRegion(region,screens,i);results.push(!region||selected?await recognizeScreen(screens[i],worker,selected):{rows:[],reason:'',diagnostics:{layout:[],scores:[]}});}
    return mergeScreenResults(results);
  }finally{await worker?.terminate();}
}
