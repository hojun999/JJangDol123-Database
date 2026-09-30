-- Supabase SQL Editor에서 한 번 실행합니다. 다시 실행해도 기록을 지우지 않습니다.
create table if not exists public.bowling_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.bowling_admins enable row level security;
revoke all on public.bowling_admins from anon, authenticated;
grant select on public.bowling_admins to authenticated;
drop policy if exists admin_self_read on public.bowling_admins;
create policy admin_self_read on public.bowling_admins for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.bowling_state (
  id integer primary key check (id = 1),
  data jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.bowling_state(id) values(1) on conflict(id) do nothing;
alter table public.bowling_state enable row level security;
revoke all on public.bowling_state from anon, authenticated;
grant select on public.bowling_state to anon, authenticated;
drop policy if exists public_read on public.bowling_state;
create policy public_read on public.bowling_state for select to anon, authenticated using (true);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_bowling_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select auth.uid() is not null and exists(select 1 from public.bowling_admins where user_id = (select auth.uid())); $$;
revoke all on function private.is_bowling_admin() from public;
grant execute on function private.is_bowling_admin() to authenticated;

create or replace function private.save_bowling_state(expected_revision bigint, next_data jsonb)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare new_revision bigint;
begin
  if not private.is_bowling_admin() then raise exception 'admin_required'; end if;
  if next_data is null or next_data->>'version' is distinct from '1'
     or jsonb_typeof(next_data->'members') is distinct from 'array'
     or jsonb_typeof(next_data->'centers') is distinct from 'array'
     or jsonb_typeof(next_data->'sessions') is distinct from 'array' then
    raise exception 'invalid_data';
  end if;
  update public.bowling_state set data=next_data,revision=revision+1,updated_at=now()
    where id=1 and revision=expected_revision returning revision into new_revision;
  if new_revision is null then raise exception 'revision_conflict'; end if;
  return new_revision;
end;
$$;
revoke all on function private.save_bowling_state(bigint,jsonb) from public;
grant execute on function private.save_bowling_state(bigint,jsonb) to authenticated;

-- Data API에는 권한을 상승시키지 않는 래퍼만 노출합니다.
create or replace function public.save_bowling_state(expected_revision bigint, next_data jsonb)
returns bigint language sql security invoker set search_path = ''
as $$ select private.save_bowling_state(expected_revision, next_data); $$;
revoke all on function public.save_bowling_state(bigint,jsonb) from public;
grant execute on function public.save_bowling_state(bigint,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('bowling-photos','bowling-photos',true,20971520,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=20971520,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists bowling_photo_insert on storage.objects;
create policy bowling_photo_insert on storage.objects for insert to authenticated
with check (bucket_id='bowling-photos' and private.is_bowling_admin());
drop policy if exists bowling_photo_delete on storage.objects;
create policy bowling_photo_delete on storage.objects for delete to authenticated
using (bucket_id='bowling-photos' and private.is_bowling_admin());
drop policy if exists bowling_photo_read on storage.objects;
create policy bowling_photo_read on storage.objects for select to anon,authenticated
using (bucket_id='bowling-photos');
