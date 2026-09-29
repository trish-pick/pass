-- Consultant documents (engineering, energy, bushfire, geotech...) compared
-- against a drawing set, and per-firm profiles describing how to read them.

create table public.consultant_profiles (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organisations (id) on delete cascade,
  firm            text not null,
  discipline      text not null check (discipline in ('structural', 'energy', 'bushfire', 'geotech', 'other')),
  match           text[] not null default '{}',
  fields          jsonb not null default '[]'::jsonb,
  window_pattern  text,
  status_pattern  text,
  -- Link to the consultant in POP (Phase 4). Never remove.
  external_source text,
  external_id     text,
  created_at      timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, firm, discipline)
);

create table public.consultant_documents (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organisations (id) on delete cascade,
  project_id            uuid not null,
  drawing_set_id        uuid,
  consultant_profile_id uuid,
  discipline            text not null check (discipline in ('structural', 'energy', 'bushfire', 'geotech', 'other')),
  file_path             text not null,
  file_name             text not null,
  -- What the reader found: fields, windows, statuses, attached plans.
  extracted             jsonb not null default '{}'::jsonb,
  status                text not null default 'uploaded' check (status in ('uploaded', 'processing', 'ready', 'failed')),
  uploaded_by           uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade,
  foreign key (drawing_set_id, org_id) references public.drawing_sets (id, org_id) on delete set null (drawing_set_id),
  foreign key (consultant_profile_id, org_id) references public.consultant_profiles (id, org_id) on delete set null (consultant_profile_id)
);
create index consultant_documents_set_idx on public.consultant_documents (drawing_set_id);

alter table public.consultant_profiles  enable row level security;
alter table public.consultant_documents enable row level security;

-- Profiles are practice configuration: owners and reviewers edit.
create policy "members read" on public.consultant_profiles
  for select to authenticated using (public.is_org_member(org_id));
create policy "owners and reviewers insert" on public.consultant_profiles
  for insert to authenticated with check (public.has_org_role(org_id, array['owner', 'reviewer']));
create policy "owners and reviewers update" on public.consultant_profiles
  for update to authenticated
  using (public.has_org_role(org_id, array['owner', 'reviewer']))
  with check (public.has_org_role(org_id, array['owner', 'reviewer']));
create policy "owners and reviewers delete" on public.consultant_profiles
  for delete to authenticated using (public.has_org_role(org_id, array['owner', 'reviewer']));

-- Documents are project work: any member uploads.
create policy "members read" on public.consultant_documents
  for select to authenticated using (public.is_org_member(org_id));
create policy "members insert" on public.consultant_documents
  for insert to authenticated with check (public.is_org_member(org_id));
create policy "members update" on public.consultant_documents
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));
create policy "owners and reviewers delete" on public.consultant_documents
  for delete to authenticated using (public.has_org_role(org_id, array['owner', 'reviewer']));
