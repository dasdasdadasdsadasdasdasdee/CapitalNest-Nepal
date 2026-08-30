-- Generate new referral codes in the fixed CN + 11 character format.
create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  v_code text;
begin
  loop
    v_code := 'CN' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 11));
    exit when not exists (
      select 1
      from public.profiles
      where lower(invitation_code) = lower(v_code)
    );
  end loop;

  return v_code;
end;
$$;