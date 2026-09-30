export const uid = () => crypto.randomUUID();
export function initialState() {
  return { version: 1, members: [], centers: [{ id: 'hanareum', name: '한아름볼링장', location: '건대입구역', shoeFee: 2000, rates: [
    {id:'gold',name:'평일 골드타임',note:'월~금 13시 이전 · 적용 여부 확인',general:3000,student:3000,member:3000},
    {id:'happy',name:'평일 해피타임',note:'평일 18시 이전',general:3500,student:3500,member:3500},
    {id:'evening',name:'평일 저녁',note:'평일 18시 이후',general:4800,student:4200,member:4200},
    {id:'weekend-am',name:'주말·휴일 오전',note:'14시 이전',general:3900,student:3900,member:3900},
    {id:'weekend-pm',name:'주말·휴일 오후',note:'14시 이후',general:5300,student:4700,member:4500},
    {id:'rock',name:'락볼링',note:'금~일·휴일 19시 이후 · 회원 요금 미확인',general:5800,student:4900,member:null}
  ]}], sessions: [] };
}
export const types = { general: '일반', student: '학생', member: '회원' };
export function stats(state, memberId, sessions=state.sessions) {
  const scores=sessions.flatMap(s=>s.games.flatMap(g=>g.rows.filter(r=>r.memberId===memberId).map(r=>r.score)));
  return { count:scores.length, total:scores.reduce((a,b)=>a+b,0), average:scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null, best:scores.length?Math.max(...scores):null };
}
export function gameCount(session, memberId) { return session.games.reduce((n,g)=>n+g.rows.filter(r=>r.memberId===memberId).length,0); }
export function settlement(session, memberId) {
  const entry=session.attendees.find(a=>a.memberId===memberId);
  if(!entry) return {games:0,gameFee:0,shoeFee:0,total:0};
  const lines=entry.charges||[];
  const gameFee=lines.reduce((n,l)=>n+l.unitPrice*l.games,0);
  const shoeFee=entry.shoeExempt?0:entry.shoeFee;
  return {games:lines.reduce((n,l)=>n+l.games,0),gameFee,shoeFee,total:gameFee+shoeFee};
}
export function ensureAttendee(session, memberId, type='student') {
  let a=session.attendees.find(a=>a.memberId===memberId);
  if(!a) { a={memberId,type,shoeExempt:false,shoeFee:session.centerSnapshot.shoeFee,charges:[]}; session.attendees.push(a); }
  return a;
}
export function validateState(s) {
  if(!s||s.version!==1||!Array.isArray(s.members)||!Array.isArray(s.centers)||!Array.isArray(s.sessions))throw Error('지원하지 않는 백업 형식입니다.');
  const ids=new Set(); const unique=(id)=>{if(typeof id!=='string'||!id||ids.has(id))throw Error('중복되거나 잘못된 식별자입니다.');ids.add(id);};
  const money=(n)=>{if(!Number.isSafeInteger(n)||n<0)throw Error('금액은 0 이상의 정수여야 합니다.');};
  for(const m of s.members){unique(m.id);if(typeof m.name!=='string'||!m.name.trim()||m.name.length>80||!types[m.type])throw Error('참가자 정보를 확인하세요.');}
  const members=new Set(s.members.map(m=>m.id));
  const center=(c)=>{if(typeof c.name!=='string'||!c.name.trim()||!Array.isArray(c.rates))throw Error('볼링장 정보를 확인하세요.');money(c.shoeFee);const rid=new Set();for(const r of c.rates){if(!r.id||rid.has(r.id)||!r.name)throw Error('요금제 정보를 확인하세요.');rid.add(r.id);for(const t of Object.keys(types))if(r[t]!==null)money(r[t]);}};
  for(const c of s.centers){unique(c.id);center(c);}
  for(const v of s.sessions){unique(v.id);if(!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||!Array.isArray(v.games)||!Array.isArray(v.attendees))throw Error('방문 기록 형식이 잘못되었습니다.');center(v.centerSnapshot);const ag=new Set();for(const a of v.attendees){if(!members.has(a.memberId)||ag.has(a.memberId)||!types[a.type]||typeof a.shoeExempt!=='boolean')throw Error('정산 참가자를 확인하세요.');ag.add(a.memberId);money(a.shoeFee);if(!Array.isArray(a.charges))throw Error('정산 내역을 확인하세요.');for(const l of a.charges){money(l.unitPrice);if(!Number.isInteger(l.games)||l.games<0||l.games>1000)throw Error('게임 수를 확인하세요.');}}
    for(const g of v.games){unique(g.id);if(!Array.isArray(g.rows)||g.rows.length<1||g.rows.length>4)throw Error('게임은 1~4명까지 기록할 수 있습니다.');const rowMembers=new Set(),lanes=new Set();for(const r of g.rows){if(!members.has(r.memberId)||!ag.has(r.memberId)||rowMembers.has(r.memberId)||!['A','B','C','D'].includes(r.label)||lanes.has(r.label)||!Number.isInteger(r.score)||r.score<0||r.score>300)throw Error('이름·행·점수(0~300)를 확인하세요.');rowMembers.add(r.memberId);lanes.add(r.label);}if(g.photo&&!/^(data:image\/(jpeg|png|webp);base64,|https:\/\/)/.test(g.photo))throw Error('사진 주소 형식이 잘못되었습니다.');}
  }
  return s;
}
