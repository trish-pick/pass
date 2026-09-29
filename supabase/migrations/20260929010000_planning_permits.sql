-- Planning permits are read like consultant documents (discipline 'planning').
alter table public.consultant_profiles drop constraint consultant_profiles_discipline_check;
alter table public.consultant_profiles add constraint consultant_profiles_discipline_check
  check (discipline in ('structural', 'energy', 'bushfire', 'geotech', 'planning', 'other'));
alter table public.consultant_profiles add column conditions boolean not null default false;

alter table public.consultant_documents drop constraint consultant_documents_discipline_check;
alter table public.consultant_documents add constraint consultant_documents_discipline_check
  check (discipline in ('structural', 'energy', 'bushfire', 'geotech', 'planning', 'other'));
