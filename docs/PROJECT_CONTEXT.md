# Common Table project context

Last reviewed against the repository: 2026-09-06

## Product

Common Table is a mobile-first personal cookbook, recipe discovery system, and
deterministic meal planner for Hyrum and a small family group. Published recipes
are public. Accounts are administrator-created; recipes and meal plans remain
owner-controlled. The application is an installable, online-first PWA without
offline synchronization.

It is not a social network, AI product, pantry tracker, or native application.

## Future direction

Planned direction agreed on 2026-09-06. This is not implemented functionality
or an active implementation plan.

- Keep Common Table a free personal hobby app. Target Hyrum's account and phone
  for the first mobile release, with possible family use later. Install the
  existing PWA on the home screen without a native build or App Store release.
- Prioritize basic recipe search before the first mobile release, including
  searching the recipe data available offline.
- Host the application and PostgreSQL remotely so everyday phone use never
  requires Hyrum's PC or Docker to be running. Target $0 ongoing cost with a
  provider-issued free web address. Vercel Hobby and Neon Free are proposed
  providers; confirm their free-tier limits before setup. Docker is optional
  for local development; a separate free hosted development database is another
  option.
- Store the app files and a complete copy of the synchronized recipe data on
  the phone. Offline use supports browsing, searching, and cooking from the
  latest successful sync, with a visible last-sync time. Recipe writes are
  disabled offline; there are no queued offline edits to merge later. This is
  deliberate local storage and synchronization, not just previously visited
  page caching.
- Refresh the local recipe copy when connectivity returns while the app is
  open, or on the next online opening. Preserve the previous complete copy if
  a sync fails. Closed-app background synchronization is not required.
- Continue developing on the PC and deploying the same application. The
  installed phone app receives deployed code updates when online. Verify
  offline reopening, reconnection, and app updates on Hyrum's phone before
  considering the mobile release ready.

## Current implementation

The repository currently provides:

- Next.js 16.2 App Router, React 19, TypeScript, SCSS, and CSS Modules.
- PostgreSQL 18 through Docker Compose, Drizzle ORM, committed SQL migrations,
  and idempotent reference-data seeding.
- Better Auth email/password sessions with public sign-up disabled and the
  admin plugin available for managed accounts.
- A responsive server-rendered shell, public search foundation, sign-in and
  sign-out, private recipe and meal-plan boundaries, and light/dark theming.
- Owner-scoped draft creation and a My Recipes workspace listing drafts and
  published recipes, unpublished changes, editor links, and public links.
- Existing drafts open in an owner-only Details editor for title, description,
  and optional single or ranged yield. Explicit saves reuse creation validation
  and atomically check the shared save counter without changing ingredient
  quantities or recipe identity. Creation still continues to Ingredients.
- Details preserves unsaved input after failed saves and blocks conflicting
  saves until an explicit reload of the latest draft. Unsaved edits warn before
  editor/shared navigation, Sign out, and browser reload or close where supported.
  Saved description and yield also appear in the owner preview.
- Structured ingredient and instruction editors with validation, ordered
  content, optimistic concurrency, transactional mutations, and failure-state
  preservation. Ingredient authoring supports named sections, labeled
  choose-one groups, independent optional lines, and whole-group movement.
- Instruction blocks can apply always, to one choose-one option, or to one
  optional ingredient. Referenced ingredient structures cannot be deleted or
  ungrouped until their linked instructions are reassigned or removed.
- An owner-only saved recipe preview resolves ingredient choices and conditional
  instructions from validated URL parameters without persisting cooking state.
  Undecided, inactive, and active branches remain explicit, and active steps
  receive one contiguous numbering sequence. A local "Hide unused ingredients
  and steps" toggle hides inactive content while retaining all choice controls
  and undecided branches; switching it off restores all content.
- Choices, Ingredients, and Instructions have independently collapsible heading
  buttons in both preview and public cooking pages. Sections begin expanded;
  hiding a section preserves its controls, selected choices, URL, and local
  hide-unused state.
- Publish and Publish updates operate on saved content from Preview. Readiness
  requires a valid title, an ingredient, and an instruction; description and
  yield are optional. Unpublish requires confirmation and preserves authoring
  content and the stable public URL.
- A single latest typed, validated JSONB publication snapshot includes display
  values and resolved ingredient/unit names. Owner edits remain private until
  explicitly published. Public reads require both published status and a valid
  snapshot and never fall back to editable rows.
- Browse at `/` combines public text search, include/exclude ingredient terms,
  removable draft filter pills, relevance/newest sorting, and 20 valid results
  per page. Search explicitly applies controls through a fresh GET request.
  URL parameters preserve applied state; `/search` redirects supported values
  to Browse, including invalid values that need visible correction. Conditional
  results explain optional omissions and available alternatives; recipe links
  carry no preselected cooking choices. Empty searches browse newest.
  `/r/[slug]` serves published content and
  metadata with fresh server reads. Metadata and body share one request read.
  Native History API choice changes preserve the loaded recipe during cooking;
  refresh or a new visit retrieves the latest publication. Existing loaded
  pages remain usable after updates or unpublishing.
- Canonical and recipe-owned custom ingredients and units, including numeric,
  ranged, free-form, and omitted quantities.
- Vitest, Testing Library, ESLint, Prettier, TypeScript, build, and opt-in
  PostgreSQL integration checks.

Not implemented: recipe deletion, photo storage, dietary derivation,
meal-plan generation, administrator reference-data UI, production hosting, or
final icons.

## Architecture

```text
Browser
  -> Next.js Server Component or Route Handler
  -> server validation, authorization, and domain service
  -> Drizzle ORM
  -> PostgreSQL
```

Server Components may call server services directly for reads. Thin Route
Handlers provide durable HTTP mutation boundaries. Client Components are used
only for browser interaction. Database constraints and server authorization are
authoritative.

The relational model includes Better Auth accounts and sessions;
administrator-managed ingredients, units, and taxonomy values; owner-scoped
recipes with ordered photos, ingredient sections, ingredients, steps, and
taxonomy associations; recipe-owned ingredient choice groups; optional
single-ingredient step conditions; and private meal plans, slots, entries, and
generation runs. Composite relationships prevent cross-recipe and
cross-section alternative references. Canonical values and recipe-owned custom
values are intentionally distinct. Computed values must be reproducible from
durable inputs.

Publication and unpublication lock the owned draft/published recipe before
reading saved content and checking its version. All authoring mutations acquire
that same parent lock before changing child rows. Snapshot replacement, status,
and the shared version counter commit together; a failure preserves the prior
publication. Publication's source version equals the resulting shared version,
so subsequent authoring saves identify unpublished changes. Archived recipes
remain unavailable for editing or publication. Unpublish removes the latest
snapshot; historical public revisions are not accessible.

Migration `0002_icy_ogun.sql` adds publication storage without publishing or
rewriting authoring data. It fails before schema changes if the previous schema
contains published rows requiring reconciliation.

Search reads the small published collection in one fresh server query, requires
published status and valid supported snapshots matching recipe identity, and
uses shared pure TypeScript matching/URL utilities. It never searches editable
rows or current reference labels. Matching is case-insensitive partial text;
any search word may match. Relevance orders distinct matched words, then title,
ingredient, and description counts, then publication date descending and recipe
identity ascending. Filtering/ranking precede pagination. Every included term
matches a surviving ingredient independently, even across mutually exclusive
alternatives. Exclusions reject mandatory standalone occurrences and groups with
no allowed option; optional occurrences may be omitted. No substitution solver,
dietary assurances, database-specific search extension, schema change, or offline
recipe storage is part of this search implementation.

## Security and product constraints

- Better Auth owns password handling. Public data exposes display names, not
  email addresses.
- Recipe and meal-plan access is owner-checked on the server. Canonical data and
  account management require an administrator.
- Local secrets remain in ignored environment files. Production secrets,
  object storage, hosting, and deployment are not configured.
- A service worker is intentionally absent until offline invalidation and
  stale-data behavior are designed.
- Docker Desktop must be running for local database operations.
- Generated app icons are placeholders.

## Verification baseline

The publication candidate passed 351 unit/component/API tests in 45 files and
16 PostgreSQL integration tests in six files, including private-edit isolation,
publication replacement, stale/concurrent requests, authorization, archived
recipes, adaptive content, unpublish/republish and deterministic pagination.
The new SQL migration was inspected and applied successfully twice. Test data
is isolated to fixture-owned accounts and recipes. Formatting, lint, TypeScript,
and the production build passed; Browse and public recipes render dynamically.
Owner browser/runtime and visual acceptance is still pending.

The collapsible-heading follow-up passed 13 focused shared cooking/preview
tests, TypeScript, and changed-file lint/format checks. Earlier publication
checks remain evidence for unchanged behavior.

The Details candidate was verified on 2026-09-04: formatting, lint, TypeScript,
230 unit/component/API tests across 39 files, the targeted PostgreSQL Details
integration test, the Next.js production build, and `git diff --check` passed.
The affected component suite was rerun after correcting a test's effect-cleanup
wait. No schema or migration changes were needed. Owner browser and visual
acceptance remains separate.

The Preview visibility follow-up passed 14 focused Preview/resolver tests,
TypeScript, Sass compilation, and changed-file lint/format checks. Prior
verification remains applicable to unchanged application behavior.

## Documentation roles

The recipe-search candidate was checked on 2026-09-06: formatting, lint,
TypeScript, all 388 unit/component/API tests in 50 files, the production build,
and `git diff --check` passed. The first required PostgreSQL run could not
connect because Docker Desktop/PostgreSQL was stopped; no fixture was created.
The latest database and independent Kilo review results are recorded against
the exact candidate in the external Control task outcome at
`C:\Users\hyrum\.ai-engineering\control-runtime\operations\common-table\recipe-search\OUTCOME.md`.
Owner browser/runtime and visual acceptance remains outstanding; the active
plan is retained until accepted completion.

- `AGENTS.md`: concise operating and engineering rules.
- `docs/PROJECT_CONTEXT.md`: durable current product and architecture facts.
- `docs/ACTIVE_PLAN.md`: only the approved work currently in progress.
- `README.md`: public setup and onboarding.
