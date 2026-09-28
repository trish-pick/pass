-- PASS foundations: organisations, members and the full Phase 0-2 data model.
--
-- Every table carries org_id and is protected by Row Level Security.
-- Child tables reference their parent by (id, org_id), so a row can never be
-- linked to a parent that belongs to another organisation.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Organisations and members
-- ---------------------------------------------------------------------------

create table public.organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at  timestamptz not null default now()
);

create table public.members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('owner', 'reviewer', 'drafter')),
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
create index members_user_id_idx on public.members (user_id);

-- Invitations link an email address to an organisation. They are claimed by
-- public.claim_invites() the first time that address signs in.
create table public.org_invites (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations (id) on delete cascade,
  email        text not null check (email = lower(email)),
  role         text not null check (role in ('owner', 'reviewer', 'drafter')),
  invited_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users (id) on delete set null
);
create unique index org_invites_open_idx on public.org_invites (org_id, email) where accepted_at is null;

-- ---------------------------------------------------------------------------
-- Membership helpers used by the RLS policies.
-- security definer so they can read members without recursing through RLS.
-- ---------------------------------------------------------------------------

create function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.org_id = target_org and m.user_id = auth.uid()
  );
$$;

create function public.has_org_role(target_org uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.org_id = target_org and m.user_id = auth.uid() and m.role = any (roles)
  );
$$;

-- Links any open invitations for the signed-in user's email to their account.
-- Called by the app after every sign-in.
create function public.claim_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  claimed integer := 0;
  invite record;
begin
  if uid is null then
    return 0;
  end if;

  select lower(u.email) into user_email
  from auth.users u
  where u.id = uid and u.email_confirmed_at is not null;

  if user_email is null then
    return 0;
  end if;

  for invite in
    select i.id, i.org_id, i.role
    from public.org_invites i
    where i.email = user_email and i.accepted_at is null
    for update
  loop
    insert into public.members (org_id, user_id, role)
    values (invite.org_id, uid, invite.role)
    on conflict (org_id, user_id) do nothing;

    update public.org_invites
    set accepted_at = now(), accepted_by = uid
    where id = invite.id;

    claimed := claimed + 1;
  end loop;

  return claimed;
end;
$$;

revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.has_org_role(uuid, text[]) from public, anon;
revoke all on function public.claim_invites() from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;
grant execute on function public.claim_invites() to authenticated;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Practice configuration
-- ---------------------------------------------------------------------------

create table public.stages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations (id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, name)
);

create table public.practice_profiles (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null unique references public.organisations (id) on delete cascade,
  sheet_number_pattern  text,
  title_block_fields    jsonb not null default '[]'::jsonb,
  conventions           jsonb not null default '{}'::jsonb,
  updated_at            timestamptz not null default now()
);
create trigger practice_profiles_updated_at
  before update on public.practice_profiles
  for each row execute function public.set_updated_at();

create table public.standard_notes (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organisations (id) on delete cascade,
  stage_id  uuid,
  code      text not null,
  text      text not null,
  required  boolean not null default false,
  foreign key (stage_id, org_id) references public.stages (id, org_id) on delete cascade,
  unique (org_id, code)
);

create table public.dictionary_terms (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references public.organisations (id) on delete cascade,
  term    text not null,
  unique (org_id, term)
);

create table public.checklists (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations (id) on delete cascade,
  stage_id    uuid not null,
  name        text not null,
  version     integer not null default 1,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  foreign key (stage_id, org_id) references public.stages (id, org_id) on delete cascade,
  unique (id, org_id)
);

create table public.checklist_items (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organisations (id) on delete cascade,
  checklist_id  uuid not null,
  label         text not null,
  check_type    text not null,
  params        jsonb not null default '{}'::jsonb,
  severity      text not null check (severity in ('critical', 'major', 'minor')),
  applies_to    text[],
  sort_order    integer not null default 0,
  foreign key (checklist_id, org_id) references public.checklists (id, org_id) on delete cascade,
  unique (id, org_id)
);
create index checklist_items_checklist_idx on public.checklist_items (checklist_id, sort_order);

-- ---------------------------------------------------------------------------
-- Projects, drawing sets and sheets
-- ---------------------------------------------------------------------------

create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organisations (id) on delete cascade,
  name             text not null,
  project_number   text,
  address          text,
  -- Hook for the POP connection (Phase 4). Never remove these columns.
  external_source  text,
  external_id      text,
  created_at       timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, external_source, external_id)
);

create table public.drawing_sets (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations (id) on delete cascade,
  project_id   uuid not null,
  stage_id     uuid not null,
  revision     text not null,
  file_path    text not null,
  status       text not null default 'uploaded'
                 check (status in ('uploaded', 'processing', 'ready', 'failed')),
  uploaded_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade,
  foreign key (stage_id, org_id) references public.stages (id, org_id) on delete restrict,
  unique (id, org_id)
);
create index drawing_sets_project_idx on public.drawing_sets (project_id);

create table public.sheets (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organisations (id) on delete cascade,
  drawing_set_id  uuid not null,
  page_index      integer not null,
  sheet_number    text,
  sheet_title     text,
  sheet_type      text,
  title_block     jsonb not null default '{}'::jsonb,
  text_blocks     jsonb not null default '[]'::jsonb,
  image_path      text,
  foreign key (drawing_set_id, org_id) references public.drawing_sets (id, org_id) on delete cascade,
  unique (id, org_id),
  unique (drawing_set_id, page_index)
);

-- ---------------------------------------------------------------------------
-- Audits and findings
-- ---------------------------------------------------------------------------

create table public.audits (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organisations (id) on delete cascade,
  drawing_set_id  uuid not null,
  checklist_id    uuid not null,
  status          text not null default 'queued'
                    check (status in ('queued', 'running', 'complete', 'failed')),
  started_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  completed_at    timestamptz,
  summary         jsonb not null default '{}'::jsonb,
  foreign key (drawing_set_id, org_id) references public.drawing_sets (id, org_id) on delete cascade,
  foreign key (checklist_id, org_id) references public.checklists (id, org_id) on delete restrict,
  unique (id, org_id)
);
create index audits_drawing_set_idx on public.audits (drawing_set_id);
create index audits_org_created_idx on public.audits (org_id, created_at desc);

create table public.findings (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organisations (id) on delete cascade,
  audit_id           uuid not null,
  sheet_id           uuid,
  checklist_item_id  uuid,
  check_type         text not null,
  severity           text not null check (severity in ('critical', 'major', 'minor')),
  source             text not null check (source in ('rule', 'ai')),
  message            text not null,
  bbox               jsonb,
  status             text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  reviewer_note      text,
  resolved_by        uuid references auth.users (id) on delete set null,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  foreign key (audit_id, org_id) references public.audits (id, org_id) on delete cascade,
  -- sheet_id / checklist_item_id are nullable: MATCH SIMPLE skips the check when they are null.
  foreign key (sheet_id, org_id) references public.sheets (id, org_id) on delete set null (sheet_id),
  foreign key (checklist_item_id, org_id) references public.checklist_items (id, org_id) on delete set null (checklist_item_id)
);
create index findings_audit_idx on public.findings (audit_id);
create index findings_sheet_idx on public.findings (sheet_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Read: any member of the organisation.
-- Practice configuration (stages, profile, notes, dictionary, checklists):
--   owners and reviewers write.
-- Projects, drawing sets, audits, findings: any member writes; only owners and
--   reviewers delete.
-- Members and invitations: owners manage.
-- Sheets are written by background jobs (service role, which bypasses RLS).
-- ---------------------------------------------------------------------------

alter table public.organisations    enable row level security;
alter table public.members          enable row level security;
alter table public.org_invites      enable row level security;
alter table public.stages           enable row level security;
alter table public.practice_profiles enable row level security;
alter table public.standard_notes   enable row level security;
alter table public.dictionary_terms enable row level security;
alter table public.checklists       enable row level security;
alter table public.checklist_items  enable row level security;
alter table public.projects         enable row level security;
alter table public.drawing_sets     enable row level security;
alter table public.sheets           enable row level security;
alter table public.audits           enable row level security;
alter table public.findings         enable row level security;

-- Organisations: members read, owners rename. Creating organisations happens
-- through onboarding (Phase 4) or the SQL editor, not directly from the app.
create policy "members read their organisation" on public.organisations
  for select to authenticated using (public.is_org_member(id));
create policy "owners update their organisation" on public.organisations
  for update to authenticated
  using (public.has_org_role(id, array['owner']))
  with check (public.has_org_role(id, array['owner']));

-- Members
create policy "members read fellow members" on public.members
  for select to authenticated using (public.is_org_member(org_id));
create policy "owners add members" on public.members
  for insert to authenticated with check (public.has_org_role(org_id, array['owner']));
create policy "owners update members" on public.members
  for update to authenticated
  using (public.has_org_role(org_id, array['owner']))
  with check (public.has_org_role(org_id, array['owner']));
create policy "owners remove members" on public.members
  for delete to authenticated using (public.has_org_role(org_id, array['owner']));

-- Invitations
create policy "owners read invites" on public.org_invites
  for select to authenticated using (public.has_org_role(org_id, array['owner']));
create policy "owners create invites" on public.org_invites
  for insert to authenticated with check (public.has_org_role(org_id, array['owner']));
create policy "owners delete invites" on public.org_invites
  for delete to authenticated using (public.has_org_role(org_id, array['owner']));

-- Practice configuration tables share one pattern.
do $$
declare
  t text;
begin
  foreach t in array array[
    'stages', 'practice_profiles', 'standard_notes', 'dictionary_terms',
    'checklists', 'checklist_items'
  ]
  loop
    execute format(
      'create policy "members read" on public.%I for select to authenticated
         using (public.is_org_member(org_id))', t);
    execute format(
      'create policy "owners and reviewers insert" on public.%I for insert to authenticated
         with check (public.has_org_role(org_id, array[''owner'', ''reviewer'']))', t);
    execute format(
      'create policy "owners and reviewers update" on public.%I for update to authenticated
         using (public.has_org_role(org_id, array[''owner'', ''reviewer'']))
         with check (public.has_org_role(org_id, array[''owner'', ''reviewer'']))', t);
    execute format(
      'create policy "owners and reviewers delete" on public.%I for delete to authenticated
         using (public.has_org_role(org_id, array[''owner'', ''reviewer'']))', t);
  end loop;

  foreach t in array array['projects', 'drawing_sets', 'audits', 'findings']
  loop
    execute format(
      'create policy "members read" on public.%I for select to authenticated
         using (public.is_org_member(org_id))', t);
    execute format(
      'create policy "members insert" on public.%I for insert to authenticated
         with check (public.is_org_member(org_id))', t);
    execute format(
      'create policy "members update" on public.%I for update to authenticated
         using (public.is_org_member(org_id))
         with check (public.is_org_member(org_id))', t);
    execute format(
      'create policy "owners and reviewers delete" on public.%I for delete to authenticated
         using (public.has_org_role(org_id, array[''owner'', ''reviewer'']))', t);
  end loop;
end;
$$;

-- Sheets: read-only for members; written by the process-set job.
create policy "members read" on public.sheets
  for select to authenticated using (public.is_org_member(org_id));
