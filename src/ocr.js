import {createWorker,PSM} from 'tesseract.js';
export function eraseSolidBoxes(canvas){
  const ctx=canvas.getContext('2d'),im=ctx.getImageData(0,0,canvas.width,canvas.height),w=canvas.width,h=canvas.height,seen=new Uint8Array(w*h);
  for(let index=0;index<w*h;index++){if(seen[index]||im.data[index*4]>100)continue;const queue=[index],points=[];seen[index]=1;let minX=w,maxX=0,minY=h,maxY=0;
    for(let q=0;q<queue.length;q++){const p=queue[q],x=p%w,y=Math.floor(p/w);points.push(p);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);for(const next of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(next>=0&&!seen[next]&&im.data[next*4]<100){seen[next]=1;queue.push(next);}}
    const width=maxX-minX+1,height=maxY-minY+1;if(width>w*.3&&points.length/(width*height)>.65)for(const p of points)im.data[p*4]=im.data[p*4+1]=im.data[p*4+2]=255;
  }ctx.putImageData(im,0,0);return canvas;
}
// 각진 점수판 글꼴의 3/9, 5/9, 2/8 혼동을 닫힌 고리 구조로 보완합니다.
// 글자가 분리되지 않거나 구조가 불명확하면 원래 OCR 후보를 유지합니다.
export function repairDigitalDigits(canvas,text,bbox){
  const w=canvas.width,h=canvas.height,im=canvas.getContext('2d').getImageData(0,0,w,h).data;
  const y0=Math.max(0,bbox.y0-3),y1=Math.min(h,bbox.y1+3),active=[];
  for(let x=0;x<w;x++){let count=0;for(let y=y0;y<y1;y++)if(im[(y*w+x)*4]<100)count++;active[x]=count>=3;}
  const groups=[];let start=null;for(let x=0;x<=w;x++){if(active[x]&&start===null)start=x;if(!active[x]&&start!==null){if(x-start>5)groups.push([start,x]);start=null;}}
  if(groups.length!==text.length)return text;
  return groups.map(([left,right],index)=>{
    let top=y1,bottom=y0;for(let y=y0;y<y1;y++)for(let x=left;x<right;x++)if(im[(y*w+x)*4]<100){top=Math.min(top,y);bottom=Math.max(bottom,y);}
    const gw=right-left,gh=bottom-top+1;if(gh<10)return text[index];const seen=new Uint8Array(gw*gh),holes=[];
    for(let p=0;p<gw*gh;p++){const px=p%gw,py=Math.floor(p/gw);if(seen[p]||im[((top+py)*w+left+px)*4]<100)continue;let edge=false,sumY=0;const queue=[p];seen[p]=1;
      for(let q=0;q<queue.length;q++){const n=queue[q],x=n%gw,y=Math.floor(n/gw);sumY+=y;if(x===0||x===gw-1||y===0||y===gh-1)edge=true;for(const next of [x>0?n-1:-1,x<gw-1?n+1:-1,y>0?n-gw:-1,y<gh-1?n+gw:-1])if(next>=0&&!seen[next]){const nx=next%gw,ny=Math.floor(next/gw);if(im[((top+ny)*w+left+nx)*4]>100){seen[next]=1;queue.push(next);}}}
      if(!edge&&queue.length>gw*gh*.018)holes.push({area:queue.length,centerY:sumY/queue.length/gh});
    }
    const digit=text[index];if(holes.length===2&&['2','3','5','6','8','9'].includes(digit))return '8';
    if(holes.length===1){const cy=holes[0].centerY;if(cy<.42&&['3','5','6','9'].includes(digit))return '9';if(cy>.58&&['5','6','9'].includes(digit))return '6';}
    if(holes.length===0&&digit==='9')return '5';return digit;
  }).join('');
}
export async function readImage(file){
  if(file.size>20*1024*1024)throw Error('사진은 한 장당 20MB 이하로 올려주세요.');
  const img=new Image();img.src=URL.createObjectURL(file);try{await img.decode();const c=document.createElement('canvas'),scale=Math.min(1,1600/img.width);c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c;}finally{URL.revokeObjectURL(img.src);}
}
// 파란 점수판의 위·아래 경계를 찾고 기울어진 화면을 펼칩니다.
export function flattenScreen(source){
  const ctx=source.getContext('2d'),{data}=ctx.getImageData(0,0,source.width,source.height),w=source.width,h=source.height;
  const cols=[];for(let x=0;x<w;x+=4){let top=h,bottom=0,count=0;for(let y=0;y<h;y+=3){const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2];if(b>75&&b>r*1.6&&b>g*1.18){top=Math.min(top,y);bottom=y;count++;}}if(count>h*.07)cols.push({x,top,bottom});}
  if(cols.length<10)return source;
  const min=cols[0].x,max=cols.at(-1).x,inner=cols.filter(c=>c.x>min+(max-min)*.12&&c.x<max-(max-min)*.12);
  function line(key){const n=inner.length,sx=inner.reduce((s,c)=>s+c.x,0),sy=inner.reduce((s,c)=>s+c[key],0),sxx=inner.reduce((s,c)=>s+c.x*c.x,0),sxy=inner.reduce((s,c)=>s+c.x*c[key],0);const a=(n*sxy-sx*sy)/(n*sxx-sx*sx);return x=>a*x+(sy-a*sx)/n;}
  if(inner.length<5)return source;const top=line('top'),bottom=line('bottom');
  const out=document.createElement('canvas');out.width=1200;out.height=Math.round(1200*(bottom((min+max)/2)-top((min+max)/2))/(max-min));out.height=Math.min(1000,Math.max(400,out.height));
  const o=out.getContext('2d'),pixels=o.createImageData(out.width,out.height);
  for(let y=0;y<out.height;y++)for(let x=0;x<out.width;x++){const sx=Math.round(min+(max-min)*x/(out.width-1)),sy=Math.round(top(sx)+(bottom(sx)-top(sx))*y/(out.height-1)),i=(Math.max(0,Math.min(h-1,sy))*w+Math.max(0,Math.min(w-1,sx)))*4,j=(y*out.width+x)*4;pixels.data[j]=data[i];pixels.data[j+1]=data[i+1];pixels.data[j+2]=data[i+2];pixels.data[j+3]=255;}o.putImageData(pixels,0,0);return out;
}
export async function recognizeTotals(screen,progress,region=null){
  // 우측 흰색 최종 점수를 인식하고 하단 팀 합계와 노란 투구 표시는 제외합니다.
  const box=region||{x:.84,y:.22,w:.15,h:.57};
  const crop=document.createElement('canvas');crop.width=480;crop.height=Math.round(screen.height*box.h/(screen.width*box.w)*480);
  const ctx=crop.getContext('2d');ctx.drawImage(screen,screen.width*box.x,screen.height*box.y,screen.width*box.w,screen.height*box.h,0,0,crop.width,crop.height);
  const pixels=ctx.getImageData(0,0,crop.width,crop.height);for(let i=0;i<pixels.data.length;i+=4){const r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2];const white=r>165&&g>165&&b>100;const v=white?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;}ctx.putImageData(pixels,0,0);eraseSolidBoxes(crop);
  let worker;try{worker=await createWorker('eng',1,{workerPath:new URL('ocr/worker.min.js', document.baseURI).href,corePath:new URL('ocr/',document.baseURI).href,langPath:new URL('ocr/',document.baseURI).href,logger:m=>{if(m.status==='recognizing text')progress?.(Math.round(m.progress*100));}});await worker.setParameters({tessedit_char_whitelist:'0123456789',tessedit_pageseg_mode:PSM.SINGLE_BLOCK});const {data}=await worker.recognize(crop,{}, {text:true,blocks:true});const lines=(data.blocks||[]).flatMap(b=>b.paragraphs||[]).flatMap(p=>p.lines||[]).sort((a,b)=>a.bbox.y0-b.bbox.y0);const found=lines.map(l=>{const text=repairDigitalDigits(crop,l.text.trim(),l.bbox);return {score:Number(text),confidence:l.confidence,text};}).filter(l=>/^\d{1,3}$/.test(l.text)&&l.score>=0&&l.score<=300);
    return {rows:found.slice(0,4).map((r,i)=>({label:'ABCD'[i],score:r.score,confidence:r.confidence})),preview:crop.toDataURL(),text:data.text};
  }finally{await worker?.terminate();}
}
