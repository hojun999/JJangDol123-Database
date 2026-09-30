-- Authentication > Users > Add user > Create new user로 관리자 계정을 생성합니다.
-- 해당 계정의 User UID를 복사한 후 아래 UUID를 교체하여 SQL Editor에서 실행합니다.
-- 가입 폼은 사이트에 없습니다. 가능하면 Authentication 설정에서 신규 가입도 비활성화하세요.
insert into public.bowling_admins(user_id)
values ('00000000-0000-0000-0000-000000000000')
on conflict(user_id) do nothing;
