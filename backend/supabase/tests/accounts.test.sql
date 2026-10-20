-- pgTAP checks for the accounts migration. Run with `supabase test db` on the local stack.
begin;
select plan(13);

-- Two users; the trigger creates their profiles.
insert into auth.users (id, instance_id, aud, role, email)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test');

select is((select count(*)::int from public.profiles), 2, 'the auth.users trigger created a profile per user');
select is((select plan from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'free', 'a new profile is free');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS is enabled on profiles');

-- A signed-in user.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select is((select count(*)::int from public.profiles), 1, 'a user sees exactly one profile row');
select is((select id::text from public.profiles), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'the row is their own');
select throws_ok($$update public.profiles set plan = 'pro' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, '42501', null, 'a user cannot change their plan');
select throws_ok($$insert into public.profiles (id, plan) values (gen_random_uuid(), 'pro')$$, '42501', null, 'a user cannot insert a profile');
select throws_ok($$delete from public.profiles$$, '42501', null, 'a user cannot delete a profile');
select throws_ok($$select 1 from public.feedback_reports$$, '42501', null, 'a user cannot read feedback_reports');
select throws_ok($$select public.handle_new_user()$$, '42501', null, 'a user cannot execute the profile trigger function');
select throws_ok($$select public.guard_feedback_intake()$$, '42501', null, 'a user cannot execute the feedback intake trigger function');

-- No sign-in at all.
set local role anon;
select throws_ok($$select 1 from public.profiles$$, '42501', null, 'anon cannot read profiles');
select throws_ok($$select 1 from public.feedback_reports$$, '42501', null, 'anon cannot read feedback_reports');

select * from finish();
rollback;
