-- Seed data: Forme Studio Tasmania as the first organisation, with its four
-- default stages and an empty practice profile. Safe to run more than once.
--
-- Practice-specific data belongs here (or in the app), never in application code.

insert into public.organisations (name, slug)
values ('Forme Studio Tasmania', 'forme-studio')
on conflict (slug) do nothing;

insert into public.stages (org_id, name, sort_order)
select o.id, s.name, s.sort_order
from public.organisations o
cross join (values
  ('Concept', 1),
  ('Planning', 2),
  ('Building Documentation', 3),
  ('Construction', 4)
) as s (name, sort_order)
where o.slug = 'forme-studio'
on conflict (org_id, name) do nothing;

insert into public.practice_profiles (org_id)
select o.id from public.organisations o
where o.slug = 'forme-studio'
on conflict (org_id) do nothing;

-- To make yourself the owner, run this once in the Supabase SQL editor with
-- your own email (lower case), then sign in:
--
--   insert into public.org_invites (org_id, email, role)
--   select id, 'you@yourpractice.com.au', 'owner'
--   from public.organisations where slug = 'forme-studio';
