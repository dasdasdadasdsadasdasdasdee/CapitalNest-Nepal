-- Fix signup trigger and invitation code generation for auth.users inserts.
-- Prevents database errors during registration caused by blank/duplicate invitation codes or restrictive inserts.

create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  v_code text;
begin
  loop
    v_code := upper('CN' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    exit when not exists (
      select 1 from public.profiles where lower(invitation_code) = lower(v_code)
    );
  end loop;

  return v_code;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_referral_code text;
  v_user_invitation_code text;
begin
  v_referral_code := nullif(trim(new.raw_user_meta_data->>'invitation_code'), '');
  v_user_invitation_code := public.generate_referral_code();

  insert into public.profiles (
    id,
    email,
    phone,
    country_code,
    invitation_code,
    referred_by,
    full_name,
    address
  )
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'country_code',
    v_user_invitation_code,
    null,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'address'
  )
  on conflict (id) do update set
    email = excluded.email,
    phone = excluded.phone,
    country_code = excluded.country_code,
    invitation_code = coalesce(excluded.invitation_code, public.profiles.invitation_code, public.generate_referral_code()),
    full_name = excluded.full_name,
    address = excluded.address,
    updated_at = now();

  perform public.process_referral(new.id, v_referral_code);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();
