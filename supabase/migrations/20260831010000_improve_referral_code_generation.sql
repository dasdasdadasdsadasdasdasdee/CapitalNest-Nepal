-- Improve referral code generation with a guaranteed unique code and no duplicate-key collisions.
drop function if exists public.generate_referral_code();

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
