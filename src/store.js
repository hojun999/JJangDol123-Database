import {createClient} from '@supabase/supabase-js';
import {initialState,validateState,uid} from './core.js';
const cfg=window.BOWLING_CONFIG||{};
export const connected=Boolean(cfg.supabaseUrl&&cfg.supabaseKey);
export const client=connected?createClient(cfg.supabaseUrl,cfg.supabaseKey):null;
export let state=initialState(), revision=0, writable=false, user=null;
const localKey='bowling-note-preview-v1';
export async function load() {
  if(!connected){const raw=localStorage.getItem(localKey);state=raw?validateState(JSON.parse(raw)):initialState();writable=true;return;}
  const {data,error}=await client.from('bowling_state').select('data,revision').eq('id',1).single();if(error)throw Error('공동 기록을 불러오지 못했습니다. Supabase 설정과 SQL 실행 여부를 확인하세요.');
  state=data.data?validateState(data.data):initialState();revision=data.revision;
  await checkAdmin();
}
export async function checkAdmin(){if(!connected)return;const {data:{session}}=await client.auth.getSession();user=session?.user||null;writable=false;if(user){const {data,error}=await client.from('bowling_admins').select('user_id').eq('user_id',user.id);if(error)throw error;writable=Boolean(data?.length);}}
export async function save(next){if(!writable)throw Error('관리자만 기록을 변경할 수 있습니다.');validateState(next);if(!connected){localStorage.setItem(localKey,JSON.stringify(next));state=next;return;}
  const {data,error}=await client.rpc('save_bowling_state',{expected_revision:revision,next_data:next});
  if(error){if(error.message.includes('revision_conflict'))throw Error('다른 창에서 기록이 변경됐습니다. 이 창을 새로고침한 뒤 다시 입력하세요.');throw Error('저장하지 못했습니다: '+error.message);}
  revision=data;state=next;
}
export async function login(email,password){const {error}=await client.auth.signInWithPassword({email,password});if(error)throw Error('이메일 또는 비밀번호를 확인하세요.');await checkAdmin();if(!writable){await client.auth.signOut();throw Error('관리자로 등록되지 않은 계정입니다.');}}
export async function logout(){await client.auth.signOut();user=null;writable=false;}
export async function uploadPhoto(dataUrl){if(!connected)return {url:dataUrl,path:null};const blob=await (await fetch(dataUrl)).blob(),path=`${uid()}.jpg`;const {error}=await client.storage.from('bowling-photos').upload(path,blob,{contentType:'image/jpeg',upsert:false});if(error)throw Error('사진을 업로드하지 못했습니다: '+error.message);return {url:client.storage.from('bowling-photos').getPublicUrl(path).data.publicUrl,path};}
export async function removePhoto(path){if(connected&&path){const {error}=await client.storage.from('bowling-photos').remove([path]);if(error)throw error;}}
