-- A Deck account's tier. The server owns it: clients read their own row and nothing else.
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
-- Supabase grants new public tables to anon and authenticated by default; take that back first.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;
-- No insert, update or delete policy exists, and those privileges are not granted: plan changes are a Studio action.
create policy "profiles read own row" on public.profiles
for select to authenticated using ((select auth.uid()) = id);

-- One profile per auth user, created inside the sign-up transaction.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
