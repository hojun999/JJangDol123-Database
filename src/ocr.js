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
  const img=new Image();img.src=URL.createObjectURL(file);try{await img.decode();const c=document.createElement('canvas'),scale=Math.min(1,1600/img.width);c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c;}finally{URL.revokeObjectURL(img.src);}
}
function blueColumns(data,w,h){
  const step=4,gw=Math.ceil(w/step),gh=Math.ceil(h/step),blue=new Uint8Array(gw*gh);
  for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){const i=(y*step*w+x*step)*4,r=data[i],g=data[i+1],b=data[i+2];blue[y*gw+x]=b>75&&b>r*1.8&&b>g*1.4?1:0;}
  let largest=[];
  for(let i=0;i<blue.length;i++){if(!blue[i])continue;const queue=[i];blue[i]=0;for(let q=0;q<queue.length;q++){const p=queue[q],x=p%gw,y=Math.floor(p/gw);for(const next of [x>0?p-1:-1,x<gw-1?p+1:-1,y>0?p-gw:-1,y<gh-1?p+gw:-1])if(next>=0&&blue[next]){blue[next]=0;queue.push(next);}}if(queue.length>largest.length)largest=queue;}
  const cols=new Map();for(const p of largest){const x=p%gw*step,y=Math.floor(p/gw)*step,col=cols.get(x)||{x,top:h,bottom:0};col.top=Math.min(col.top,y);col.bottom=Math.max(col.bottom,y);cols.set(x,col);}
  return [...cols.values()].sort((a,b)=>a.x-b.x);
}
// 파란 점수판의 위·아래 경계를 찾고 기울어진 화면을 펼칩니다.
export function flattenScreen(source){
  const ctx=source.getContext('2d'),{data}=ctx.getImageData(0,0,source.width,source.height),w=source.width,h=source.height;
  // shortcut: 가장 큰 파란 화면만 선택합니다. 여러 화면 기록이 필요하면 화면 선택을 추가합니다.
  const cols=blueColumns(data,w,h);
  if(cols.length<10)return source;
  const min=cols[0].x,max=cols.at(-1).x,inner=cols.filter(c=>c.x>min+(max-min)*.12&&c.x<max-(max-min)*.12);
  function line(key){const n=inner.length,sx=inner.reduce((s,c)=>s+c.x,0),sy=inner.reduce((s,c)=>s+c[key],0),sxx=inner.reduce((s,c)=>s+c.x*c.x,0),sxy=inner.reduce((s,c)=>s+c.x*c[key],0);const a=(n*sxy-sx*sy)/(n*sxx-sx*sx);return x=>a*x+(sy-a*sx)/n;}
  if(inner.length<5)return source;const top=line('top'),bottom=line('bottom');
  const out=document.createElement('canvas');out.width=1200;out.height=Math.round(1200*(bottom((min+max)/2)-top((min+max)/2))/(max-min));out.height=Math.min(1000,Math.max(400,out.height));
  const o=out.getContext('2d'),pixels=o.createImageData(out.width,out.height);
  for(let y=0;y<out.height;y++)for(let x=0;x<out.width;x++){const sx=Math.round(min+(max-min)*x/(out.width-1)),sy=Math.round(top(sx)+(bottom(sx)-top(sx))*y/(out.height-1)),i=(Math.max(0,Math.min(h-1,sy))*w+Math.max(0,Math.min(w-1,sx)))*4,j=(y*out.width+x)*4;pixels.data[j]=data[i];pixels.data[j+1]=data[i+1];pixels.data[j+2]=data[i+2];pixels.data[j+3]=255;}o.putImageData(pixels,0,0);return out;
}
export function cropText(screen,box,mode='gray'){
  const crop=document.createElement('canvas'),scale=3;
  crop.width=Math.max(1,Math.round(box.w*scale));crop.height=Math.max(1,Math.round(box.h*scale));
  const ctx=crop.getContext('2d');ctx.drawImage(screen,box.x,box.y,box.w,box.h,0,0,crop.width,crop.height);
  const pixels=ctx.getImageData(0,0,crop.width,crop.height);let sum=0,count=0;
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
    // E·G·H처럼 폭이 넓은 글자도 인식 후보로 남깁니다.
    if(y1-y0>canvas.height*.02&&y1-y0>(x1-x0)*.8)boxes.push({x:x0/3,y:y0/3,w:(x1-x0+1)/3,h:(y1-y0+1)/3});
  }return boxes;
}
function hasLaneCell(screen,box){
  const {data}=screen.getContext('2d').getImageData(0,0,screen.width,screen.height);
  for(let column=Math.ceil(box.x+box.w+3);column<screen.width*.12;column++){let count=0;for(let y=Math.ceil(box.y);y<box.y+box.h;y++)for(let x=column-2;x<=column+2;x++){const i=(y*screen.width+x)*4,r=data[i],g=data[i+1],b=data[i+2],around=(data[i-24+1]+data[i+24+1])/2;if(((g>170&&b>r*.95)||(g>80&&g>r*1.2&&g>b*.45))&&g>around+30){count++;break;}}if(count>box.h*.6)return true;}return false;
}
export function findScoreBox(boxes,row){
  const height=row.glyphHeight,center=row.centerY-row.box.y;
  const glyphs=boxes.filter(b=>b.x>0&&b.h>=height*.7&&b.h<=height*1.6&&b.w>=b.h*.08).sort((a,b)=>a.x-b.x),groups=[];
  for(const glyph of glyphs){let group=groups.find(g=>Math.abs(g[0].y+g[0].h/2-glyph.y-glyph.h/2)<Math.min(g[0].h,glyph.h)*.35);if(!group){group=[];groups.push(group);}group.push(glyph);}
  const nearby=groups.filter(g=>Math.abs(g[0].y+g[0].h/2-center)<height*.8);
  if(nearby.length!==1||nearby[0].length>3)return null;
  const group=nearby[0],x=Math.min(...group.map(b=>b.x)),y=Math.min(...group.map(b=>b.y)),right=Math.max(...group.map(b=>b.x+b.w)),bottom=Math.max(...group.map(b=>b.y+b.h)),pad=4;
  return {x:row.box.x+Math.max(0,x-pad),y:row.box.y+Math.max(0,y-pad),w:Math.min(row.box.w,right+pad)-Math.max(0,x-pad),h:Math.min(row.box.h,bottom+pad)-Math.max(0,y-pad),digits:group.length};
}
function screenWords(data,box,crop){return words(data).map(item=>({text:item.text,confidence:item.confidence,bbox:{x0:box.x+item.bbox.x0*box.w/crop.width,x1:box.x+item.bbox.x1*box.w/crop.width,y0:box.y+item.bbox.y0*box.h/crop.height,y1:box.y+item.bbox.y1*box.h/crop.height}}));}
export function findScoreLayout(tokens,width,height,region=null){
  const headers=tokens.filter(t=>t.text.trim().toUpperCase()==='HDP'&&t.bbox.x0>width*.5);
  const header=headers.length===1?headers[0]:null;
  if(!region&&!header)return {rows:[],reason:'HDP 열을 찾지 못했습니다. HDP 점수 열을 드래그로 지정하세요.'};
  const labels=tokens.filter(t=>/^[A-Z]$/.test(t.text.trim())&&t.bbox.x1<width*.15&&t.bbox.y0>(header?.bbox.y1||0)&&(region?((t.bbox.y0+t.bbox.y1)/2>=region.y*height&&(t.bbox.y0+t.bbox.y1)/2<=(region.y+region.h)*height):true)).sort((a,b)=>a.bbox.y0-b.bbox.y0);
  if(!labels.length||new Set(labels.map(t=>t.text.trim())).size!==labels.length)return {rows:[],reason:'레인 글자를 확인하지 못했습니다. 점수를 직접 입력하세요.'};
  const steps=labels.slice(1).map((t,i)=>((t.bbox.y0+t.bbox.y1-labels[i].bbox.y0-labels[i].bbox.y1)/2)/(t.text.trim().charCodeAt(0)-labels[i].text.trim().charCodeAt(0))).filter(n=>n>0).sort((a,b)=>a-b);
  const spacing=steps[Math.floor(steps.length/2)]||Math.max(...labels.map(t=>(t.bbox.y1-t.bbox.y0)*2));
  let left=region?region.x*width:Math.max(width*.5,header.bbox.x0-(header.bbox.x1-header.bbox.x0)*.3),right=region?(region.x+region.w)*width:width;
  if(header&&!region){const next=tokens.filter(t=>t.bbox.x0>header.bbox.x1&&Math.abs(t.bbox.y0-header.bbox.y0)<(header.bbox.y1-header.bbox.y0)).sort((a,b)=>a.bbox.x0-b.bbox.x0)[0];if(next)right=(header.bbox.x1+next.bbox.x0)/2;}
  return {rows:labels.map(t=>{const cy=(t.bbox.y0+t.bbox.y1)/2,y=Math.max(header?.bbox.y1||0,cy-spacing*.4),bottom=Math.min(height,cy+spacing*.4);return {label:t.text.trim(),confidence:t.confidence,centerY:cy,glyphHeight:t.bbox.y1-t.bbox.y0,box:{x:left,y,w:right-left,h:bottom-y}};})};
}
export function scoreCandidate(data,digits){
  const text=data.text.trim();return /^(0|[1-9]\d{0,2})$/.test(text)&&Number(text)<=300&&(digits===undefined||text.length===digits)?{score:Number(text),confidence:data.confidence,text}:null;
}
export function chooseScore(candidates){
  const found=candidates.filter(Boolean);
  return new Set(found.map(c=>c.score)).size===1?found.sort((a,b)=>b.confidence-a.confidence)[0]:null;
}
export async function recognizeTotals(screen,progress,region=null){
  let worker;const diagnostics={layout:[],scores:[]};
  try{
    worker=await createWorker('eng',1,{workerPath:new URL('ocr/worker.min.js',document.baseURI).href,corePath:new URL('ocr/',document.baseURI).href,langPath:new URL('ocr/',document.baseURI).href,cachePath:'bowling-best-int-v1',logger:m=>{if(m.status==='recognizing text')progress?.(Math.round(m.progress*100));}});
    // shortcut: 파란 표·노란 레인 글자 기준입니다. 다른 점수판은 실제 표본으로 확장합니다.
    const labelMask=cropText(screen,{x:0,y:0,w:screen.width*.1,h:screen.height},'yellow'),labelBoxes=inkBoxes(labelMask);
    await worker.setParameters({tessedit_char_whitelist:laneLabels,tessedit_pageseg_mode:PSM.SINGLE_WORD});
    for(const box of labelBoxes.filter(box=>box.x+box.w<screen.width*.08&&hasLaneCell(screen,box)&&!labelBoxes.some(other=>other.x>box.x+box.w&&other.x-box.x-box.w<box.w*1.5&&other.w>box.w*.5&&Math.abs(other.y+other.h/2-box.y-box.h/2)<box.h*.2))){const padded={x:Math.max(0,box.x-5),y:Math.max(0,box.y-5),w:box.w+10,h:box.h+10},candidates=[];for(const [mode,psm] of [['gray',PSM.SINGLE_WORD],['yellow',PSM.SINGLE_CHAR]]){await worker.setParameters({tessedit_pageseg_mode:psm});let crop=cropText(screen,padded,mode);if(mode==='yellow'){const stretched=document.createElement('canvas');stretched.width=Math.round(crop.width*1.6);stretched.height=crop.height;stretched.getContext('2d').drawImage(crop,0,0,stretched.width,stretched.height);crop=stretched;}const {data}=await worker.recognize(crop,{}, {text:true,blocks:true});diagnostics.scores.push({glyph:true,box,mode,text:data.text,confidence:data.confidence});if(/^[A-Z]$/.test(data.text.trim()))candidates.push(data);}const data=candidates.at(-1);if(data)diagnostics.layout.push({text:data.text.trim(),confidence:data.confidence,bbox:{x0:box.x,y0:box.y,x1:box.x+box.w,y1:box.y+box.h}});}
    const box={x:screen.width*.78,y:0,w:screen.width*.22,h:screen.height*.35},mask=cropText(screen,box,'cyan'),glyphs=inkBoxes(mask).filter(g=>g.h>screen.height*.03).sort((a,b)=>a.x-b.x),groups=[];
    for(const glyph of glyphs){const last=groups.at(-1)?.at(-1);if(!last||glyph.x-last.x-last.w>Math.max(glyph.h,last.h)*.5||Math.abs(glyph.y-last.y)>Math.max(glyph.h,last.h)*.3)groups.push([]);groups.at(-1).push(glyph);}
    await worker.setParameters({tessedit_char_whitelist:'HDP',tessedit_pageseg_mode:PSM.SINGLE_WORD});
    for(const group of groups){const left=Math.min(...group.map(g=>g.x)),top=Math.min(...group.map(g=>g.y)),right=Math.max(...group.map(g=>g.x+g.w)),bottom=Math.max(...group.map(g=>g.y+g.h)),part={x:box.x+left-3,y:top-3,w:right-left+6,h:bottom-top+6},crop=cropText(screen,part);const {data}=await worker.recognize(crop,{}, {text:true,blocks:true});diagnostics.layout.push(...screenWords(data,part,crop));}
    const layout=findScoreLayout(diagnostics.layout,screen.width,screen.height,region);
    const rows=[];
    for(const row of layout.rows){
      const candidates=[],box=findScoreBox(inkBoxes(cropText(screen,row.box,'white')),row);
      if(box)for(const mode of ['gray','white','white-wide']){
        if(mode==='white-wide'&&candidates.length)break;
        await worker.setParameters({tessedit_char_whitelist:'0123456789',tessedit_pageseg_mode:PSM.SINGLE_WORD});
        const crop=cropText(screen,box,mode==='gray'?'gray':'white'),padded=document.createElement('canvas');
        padded.width=Math.round(crop.width*(mode==='white-wide'?1.3:1))+60;padded.height=crop.height+60;
        const ctx=padded.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,padded.width,padded.height);ctx.drawImage(crop,30,30,padded.width-60,crop.height);
        const {data}=await worker.recognize(padded,{}, {text:true,blocks:true});
        diagnostics.scores.push({label:row.label,mode,box,text:data.text,confidence:data.confidence});
        const candidate=scoreCandidate(data,box.digits);if(candidate)candidates.push(candidate);
      }
      const candidate=chooseScore(candidates);
      rows.push({label:row.label,score:candidate?.score??'',confidence:candidate?.confidence??0,needsReview:!candidate||candidates.length<2||candidate.confidence<70||row.confidence<70});
    }
    return {rows,reason:layout.reason||'',diagnostics};
  }finally{await worker?.terminate();}
}
