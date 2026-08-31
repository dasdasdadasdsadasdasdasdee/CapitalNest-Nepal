-- Register the existing Auth account in the separate administrator allow-list.
insert into public.profiles (id, email, is_admin)
select id, email, true
from auth.users
where lower(email) = lower('capitalnestnepal@gmail.com')
on conflict (id) do update
set email = excluded.email,
    is_admin = true;

insert into public.admin_users (user_id, email, is_active)
select id, email, true
from auth.users
where lower(email) = lower('capitalnestnepal@gmail.com')
on conflict (user_id) do update
set email = excluded.email,
    is_active = true;
