-- Fix RLS policy to allow profile insertion during user signup
drop policy if exists "Users can insert their own profile" on public.profiles;

create policy "System can insert profiles"
  on public.profiles for insert
  with check (true);
