# PASS: Build Brief

Product name: PASS (Pre-issue Audit & Sheet Scan)
Tagline options: "Nothing leaves the office until it PASSes." / "Every sheet checked before it issues."
Positioning line: PASS, the pre-issue audit and sheet scan for building design practices.
Owner: Trish Pickersgill, Forme Studio Tasmania
Purpose of this file: the single source of truth for Claude Code. Read it at the start of every session.

---

## 1. What we are building

PASS is a web app that audits architectural drawing sets (PDF) before they issue, against a practice's own requirements and a checklist of required elements per project stage. It produces a correction list and a marked-up PDF, so the drafter can fix items in Revit and re-issue a clean set.

First user: Forme Studio Tasmania (used on live projects straight away).
Later: sold to other design practices as a standalone product, and connected to POP (Project Operation Platform) as an add-on.

Every decision should support both of those futures without a rebuild.

## 2. Guiding principles

1. **Useful in week one.** Ship the smallest version that saves real review time, then layer on.
2. **Multi-practice from day one.** Every table is scoped to an organisation, even while Forme Studio is the only one.
3. **Checks are plugins.** Every check is a self-contained module with the same interface. Adding a new check never means touching the core.
4. **Deterministic first, AI second.** Anything that can be checked from the PDF text layer is checked with code. AI vision is used only for visual judgements, and its findings are labelled "please verify".
5. **Nothing is configured in code.** Stages, checklists, numbering conventions, standard notes and dictionaries live in the database and are editable in the app.
6. **The reviewer stays in charge.** The tool assists a human reviewer. It never presents an audit as sign-off.

## 2a. Compliance boundary (non-negotiable)

PASS checks drawings against each practice's own requirements. It does not assess compliance with the NCC, Australian Standards, planning schemes or any other regulation.

Show this disclaimer wording (editable in one central config file, not scattered through components):

> PASS checks your drawings against your own practice requirements. It does not assess compliance with the NCC or Australian Standards.

Where it must appear:
- On every audit results screen
- On the cover page of every correction list and marked-up PDF export
- In the terms of use and on the marketing site
- During onboarding, where the practice acknowledges it before their first audit

Language rules for the interface, exports and marketing copy:
- Never use "compliant", "compliance", "certified", "approved" or "standards" to describe an audit result.
- Use "requirements", "checklist" and "practice benchmark" instead. ("Standard notes" is fine, as it is the practice's own notes library.)
- A completed audit shows "No outstanding items found", never "Passed" as a verdict on the drawings.

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | One language across front and back end |
| UI | Tailwind CSS + shadcn/ui | Fast, clean, easy to rebrand per product |
| Database, auth, storage | Supabase (Postgres, Auth, Storage, Row Level Security) | Matches POP, makes the later connection simple |
| Background jobs | Trigger.dev | Audits of large sets run for minutes, beyond web request limits |
| PDF reading and rendering | MuPDF (`mupdf` npm, WASM) | Text extraction with coordinates, plus page rendering to images |
| PDF markup output | `pdf-lib` | Writes clouds, comments and a summary page onto the original PDF |
| Spelling | `nspell` with an en-AU dictionary plus custom practice dictionary | Australian spelling, construction terms |
| AI | Claude API, current Sonnet model, set via env var `ANTHROPIC_MODEL` | Vision checks and plain-English finding descriptions |
| Hosting | Vercel | Simple deploys, preview branches |
| Payments (Phase 4) | Stripe | Subscriptions per practice |

## 4. Core concepts

- **Organisation**: a practice. Owns everything below it.
- **Stage**: configurable per organisation. Forme Studio defaults: Concept, Planning, Building Documentation, Construction.
- **Practice profile**: the benchmark. Sheet numbering pattern, title block fields and their expected positions, standard notes library, drawing conventions.
- **Checklist**: a list of required items for a stage. Each item is linked to a check type with its settings.
- **Drawing set**: an uploaded PDF, versioned (Rev A, Rev B...). Belongs to a project and a stage.
- **Sheet**: one page of a set, with its extracted text (with coordinates), title block values and a rendered image.
- **Audit**: one run of the checklist against one drawing set version.
- **Finding**: one issue. Has a sheet, a location (bounding box, or sheet-level), severity, source (rule or AI), and status (open, resolved, dismissed).

## 5. Data model (Supabase)

All tables include `org_id` and are protected by Row Level Security.

```
organisations        id, name, slug, created_at
members              id, org_id, user_id, role (owner | reviewer | drafter)
stages               id, org_id, name, sort_order
practice_profiles    id, org_id, sheet_number_pattern, title_block_fields (jsonb),
                     conventions (jsonb), updated_at
standard_notes       id, org_id, stage_id (nullable), code, text, required (bool)
dictionary_terms     id, org_id, term
checklists           id, org_id, stage_id, name, version, is_active
checklist_items      id, checklist_id, label, check_type, params (jsonb),
                     severity (critical | major | minor), applies_to (sheet type filter),
                     sort_order
projects             id, org_id, name, project_number, address,
                     external_source (nullable, e.g. 'pop'), external_id (nullable)
drawing_sets         id, org_id, project_id, stage_id, revision, file_path,
                     status (uploaded | processing | ready | failed), uploaded_by
sheets               id, drawing_set_id, page_index, sheet_number, sheet_title,
                     sheet_type, title_block (jsonb), text_blocks (jsonb), image_path
audits               id, org_id, drawing_set_id, checklist_id,
                     status (queued | running | complete | failed),
                     started_at, completed_at, summary (jsonb)
findings             id, audit_id, sheet_id (nullable), checklist_item_id (nullable),
                     check_type, severity, source (rule | ai), message,
                     bbox (jsonb, nullable), status (open | resolved | dismissed),
                     reviewer_note, resolved_by, resolved_at
```

`projects.external_source` and `external_id` are the hook for the POP connection. Do not build the connection until Phase 4, but never remove these columns.

## 6. The check engine

Each check lives in `/lib/checks/<check-type>.ts` and exports:

```ts
export const check: Check = {
  type: 'sheet_index_match',
  label: 'Sheet index matches sheets in set',
  source: 'rule',            // 'rule' or 'ai'
  run: async (ctx: CheckContext, params: unknown): Promise<FindingInput[]> => { ... }
}
```

`CheckContext` provides the parsed set (sheets, text blocks with coordinates, title block values, rendered images), the practice profile, and the organisation's dictionary. Checks never touch the database directly. The engine runs them, collects findings and saves them.

A registry file (`/lib/checks/index.ts`) lists all checks. The app's checklist editor reads from this registry, so a new check becomes available in the UI as soon as it is registered.

### Check library by phase

**Phase 1: rule checks (text layer)**
- `sheet_number_format`: every sheet number matches the practice pattern
- `sheet_number_sequence`: no gaps or duplicates
- `sheet_index_match`: drawing register matches the actual sheets (numbers and titles)
- `title_block_complete`: required title block fields present on every sheet
- `title_block_consistent`: project number, address, stage and date consistent across sheets and with the project record
- `revision_consistent`: revision in title block matches the revision table and the set revision
- `callout_references`: every section, elevation and detail reference points to a sheet that exists
- `standard_note_present`: required standard notes appear (fuzzy match, tolerant of line breaks)
- `required_text_present`: generic "this text must appear on sheet type X" item
- `spelling`: en-AU plus practice dictionary, ignores codes, numbers and sheet references

**Phase 2: AI vision checks**
- `visual_element_present`: generic check driven by params, e.g. north point, scale bar, legend, BAL notation, site boundary dimensions
- `ai_review_note`: open prompt per checklist item for anything not covered above

AI checks send one rendered sheet image at a time with the checklist item and return structured JSON. Every AI finding is saved with `source: 'ai'` and shown with a "please verify" label.

## 7. Processing pipeline

1. User uploads PDF to Supabase Storage, `drawing_sets` row created as `uploaded`.
2. Trigger.dev job `process-set`: MuPDF extracts text blocks with coordinates per page, renders each page to PNG, identifies the title block region using the practice profile, reads sheet number, title and revision. Status becomes `ready`.
3. User picks a checklist (defaulted from the stage) and starts an audit.
4. Trigger.dev job `run-audit`: runs every checklist item through the engine, saves findings, writes a summary. Progress is visible in the UI.
5. User reviews findings, dismisses false positives with a note, and exports.

## 8. Outputs

- **Correction list**: grouped by sheet, ordered by severity, each item with sheet number, description and location. Exportable as PDF and CSV. Designed to be handed straight to the drafter.
- **Marked-up PDF**: the original set with a cloud and comment at each finding location, sheet-level findings noted in the corner, and a summary cover page listing all items.
- **Re-audit**: uploading the next revision runs the same checklist and shows what was resolved, what remains and anything new.

## 9. Screens

1. Sign in
2. Projects list
3. Project page: drawing sets by stage and revision, audit history
4. Upload set
5. Audit results: sheet thumbnails on the left, sheet viewer with findings overlaid in the centre, findings list on the right with filters (severity, status, source)
6. Checklists: list per stage, item editor with check type picker and settings
7. Practice profile: numbering pattern, title block fields, standard notes, dictionary
8. Settings: organisation, members, (Phase 4) billing

**Upload-first layout.** The home page after sign-in is the New audit (upload) page, not the dashboard. Order on the page: drop the PDF, pick or create the project, confirm revision (pre-filled from the title block where possible), choose the stage (which loads its checklist automatically), then the main button. Below the form, a slim "Recent audits" strip shows the last few audits with outstanding item counts. The dashboard is the secondary navigation for projects, audit history, checklists and the practice profile, with "New audit" always one click away. A new practice with no checklists is guided to set up its first stage before it can run an audit.

**The main button reads "Run PASS".** Never label a button "PASS" alone, since it can read as approve or skip. While running, show progress as "PASSing through sheet 12 of 34".

Keep the interface calm and uncluttered. Branding is driven by a theme file so the product can be rebranded without touching components.

## 10. Build phases

### Phase 0: Foundations
- Next.js project, Tailwind, shadcn/ui, Supabase project, Vercel deploy
- Auth, organisations, members, Row Level Security on every table
- Seed Forme Studio as the first organisation with its four stages
- **Done when:** Trish can sign in to a deployed app and see an empty projects list.

### Phase 1: Usable MVP (target: in daily use)
- Projects, upload, processing pipeline
- Practice profile and checklist editor
- All Phase 1 rule checks
- Audit results screen with findings list and sheet viewer
- Correction list export (PDF and CSV)
- **Done when:** a real Forme Studio set is audited and the correction list is handed to the drafter.

### Phase 2: Markup and AI
- Marked-up PDF export
- AI vision checks
- Re-audit comparison between revisions
- **Done when:** the drafter can work from the marked-up PDF alone.

### Phase 3: Benchmark from past sets
- Upload several approved past sets per stage
- The app proposes a practice profile (numbering pattern, title block fields, recurring standard notes) and a draft checklist
- Reviewer approves or edits before anything becomes active
- **Done when:** a new practice can reach a working checklist from their own past sets in under an hour.

### Phase 4: Commercial and POP
- Organisation onboarding flow for new practices
- Stripe subscriptions
- POP connection: link projects by `external_id`, pull project details, push audit summaries back
- Data handling page: storage location, retention, deletion on request
- **Done when:** a second practice is onboarded without Trish's help.

## 11. Testing

- Keep a folder `/test-sets` with real drawing sets (not committed if they contain client data) and one **seeded error set**: a copy of a clean set with known deliberate mistakes (wrong sheet number, missing note, broken callout, misspelling, missing north point). Every check must catch its seeded error.
- Unit tests for every rule check.
- An audit run on the seeded error set is the acceptance test for each phase.

## 12. Working rules for Claude Code

- Work one phase at a time. Use plan mode before each feature and confirm the plan.
- Commit after each working step with a clear message.
- Never hardcode Forme Studio specifics. If it is practice-specific, it belongs in the database.
- Never call the Claude API from the browser. All AI calls run in background jobs.
- Keep secrets in environment variables only.
- Always refer to the practice management platform as "POP" (Project Operation Platform).
- Australian English throughout the interface.

---

## Implementation notes (kept current by Claude Code)

- **Next.js 16.** Read `AGENTS.md` below. `middleware.ts` is now `proxy.ts`; `cookies()` is async.
- **Central wording:** `lib/copy.ts` holds the disclaimer and all product wording. **Theme:** `app/theme.css` holds the brand colours.
- **Database:** migrations in `supabase/migrations/`, seed data in `supabase/seed.sql`. No practice-specific data in app code.
- **Checks:** `lib/checks/types.ts` (interface), `lib/checks/index.ts` (registry), `lib/checks/engine.ts` (runner). Checklist `applies_to` accepts exclusions such as `["!cover"]`. Added beyond the brief's list: `forbidden_text` (draft text like "TO BE UPDATED") and `cover_sheet_consistent`. Checks with `mode: "reviewer"` (`manual_review`, and `visual_element_present` / `ai_review_note` until Phase 2 builds them) are not run: they are printed as a tick list on the correction list, for the sheet types present. The Forme Studio Building Documentation checklist is built from Trish's "Final Check Building Drawings" procedure.
- **PDF reading:** `lib/pdf/extract.ts` (MuPDF, server only), `lib/pdf/title-block.ts` (values found relative to their printed labels), `lib/pdf/register.ts` (drawing register table), `lib/pdf/parse-set.ts`.
- **Exports:** `lib/export/correction-list.ts` (rows and CSV), `lib/export/correction-list-pdf.ts` (pdf-lib).
- **Practice seed data:** `supabase/seed-data/forme-studio.json` holds the profile, standard notes, dictionary and checklists per stage. Until the database exists, `npm run audit -- <set.pdf> --stage ... --revision ...` runs a full audit from it.
- **Tests:** `npm test` (Vitest). `lib/testing/seeded-set.test.ts` is the acceptance test. Regenerate the seeded sets with `npm run seeded-set`.
- **Scripts** run with `tsx`. The package is `"type": "module"`, since MuPDF uses top-level await.

@AGENTS.md
