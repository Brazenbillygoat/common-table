# Common Table project context

Last reviewed against the repository: 2026-09-06

## Product

Common Table is a mobile-first personal cookbook, recipe discovery system, and
deterministic meal planner for Hyrum and a small family group. Published recipes
are public. Accounts are administrator-created; recipes and meal plans remain
owner-controlled. The application is an installable, online-first PWA with optional public
recipe downloads for offline browsing, search and cooking.

It is not a social network, AI product, pantry tracker, or native application.

## Hosting and next work

Production is deployed from GitHub `main` to Vercel Hobby, with PostgreSQL on
Neon Free. Hyrum confirmed public browsing in an incognito window on
2026-09-06. Everyday hosted use does not depend on the PC or Docker. This
confirmation does not establish hosted sign-in or phone/offline acceptance.

The existing durable local data was transferred to Neon and checked against
the source. The local Docker database remains available for development;
sessions and verification tokens were not transferred.

Keep the app at $0 ongoing cost. Restrictions or downtime are preferable to
paid upgrades. Use the provider-issued address; upgrades and paid services
require separate owner authorization. No application-level usage meter or
spending cutoff is implemented.

The offline implementation is a local candidate pending independent review and
Hyrum's visual and real-iPhone acceptance, delivery and deployment. The hosted
main baseline remains the reviewed production-auth change until separately
authorized delivery. The approved contract remains in `docs/ACTIVE_PLAN.md`.

## Current implementation

The repository currently provides:

- Next.js 16.2 App Router, React 19, TypeScript, SCSS, and CSS Modules.
- PostgreSQL 18 on Neon in production and through Docker Compose locally,
  Drizzle ORM, committed SQL migrations, and idempotent reference-data seeding.
- Better Auth email/password sessions with public sign-up disabled and the
  admin plugin available for managed accounts. Auth initialization and the
  production environment checker share URL resolution: explicit `BETTER_AUTH_URL`
  takes precedence, otherwise `VERCEL_PROJECT_PRODUCTION_URL` supplies the stable
  HTTPS production address. Configuration still fails when both are missing;
  Preview sign-in needs an explicit Preview URL and separate credentials.
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
  removable filter pills, relevance/newest sorting, and 20 valid results
  per page. Typing applies after a 500 ms pause; pill removal, clearing, and
  sorting apply immediately through client navigation to fresh server results.
  Enter/Search is an optional immediate flush. Controls stay mounted, preserving
  input focus/caret and newer drafts while responses arrive. Back and explicit
  navigation cancel queued typing and restore the URL's controls; composition
  input waits for the completed character before searching.
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
meal planning, administrator reference-data UI, or final icons.

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

## Offline reading

The static `/offline` page forces empty request headers/cookies in the shared
layout and contains no recipe or viewer data. After explicit initial consent,
the worker downloads that shell and its build-listed, size/hash-checked assets.
Only public document navigations may fall back to it. Its local History API
navigation reuses Browse results, search controls, ranking/validation and cooking
presentation without fetching server-component payloads. Online public routes
remain fresh server reads. Offline navigation from an already-open online page
uses a document request so the worker can supply the shell.

The anonymous offline-publications API uses read-only repeatable-read PostgreSQL
transactions, validated publication snapshots, sorted collection manifests and
canonical SHA-256 fingerprints. Opening/reconnecting checks metadata only.
Consent downloads just added/changed recipe snapshots; the complete manifest
also defines removals. A changed revision returns a conflict. Client validation
reconstructs the entire expected collection before a single IndexedDB transaction
compares the prior storage token and commits. Quota/validation/network failures
preserve the prior complete copy; removal tombstones invalidate stale writers.
No database migration, auth rule or authoring mutation changed.

App caches are versioned; a prepared worker follows the normal waiting lifecycle
until old pages close. There is no forced activation or automatic reload. An open
cooking view keeps its loaded publication and local display state across recipe
sync/removal. The UI checks both app-file readiness and valid saved recipes,
shows last-sync time, supports retry/confirmed removal, and explains eviction.
Limits: 1,000 publications, 20 MiB recipe JSON, 256 KiB requests, 25 MiB app files.

## Security and product constraints

- Better Auth owns password handling. Public data exposes display names, not
  email addresses.
- Recipe and meal-plan access is owner-checked on the server. Canonical data and
  account management require an administrator.
- Local secrets remain in ignored environment files. Vercel Production has
  the pooled Neon `DATABASE_URL` and a separate `BETTER_AUTH_SECRET`.
  `BETTER_AUTH_URL` is omitted in favor of the stable Vercel production hostname.
  Preview credentials and object storage are not configured.
- The offline worker caches only a build-time anonymous shell and its exact
  static assets. Authentication, private pages, mutations and arbitrary Next.js
  responses are never cached.
- Docker Desktop must be running for local database operations.
- Generated app icons are placeholders.

## Verification and acceptance

Search and automatic search were accepted by Hyrum on 2026-09-06. Their checks
covered matching and publication isolation, URL state, debounce and immediate
actions, overlapping requests, focus preservation, and browser navigation.
The search baseline passed 388 unit/component/API tests, nine relevant
PostgreSQL integration tests, formatting, lint, TypeScript, and the production
build. The automatic-search follow-up passed its 53 focused tests and relevant
static/build checks. Exact candidate evidence and independent review remain in
the external Control outcome:
`C:\Users\hyrum\.ai-engineering\control-runtime\operations\common-table\recipe-search\OUTCOME.md`.

Production auth URL resolution was checked with eight helper tests, isolated
runtime/configuration scenarios, static checks, and a production build. The
reviewed commit `ca494594b02cfbede2481b4399ee1e9e7be260ff` was pushed and
deployed by Hyrum. Public incognito browsing is confirmed. Real phone,
offline, reconnection, and deployed-code-update acceptance remain part of
future work; historical checks are not evidence for those behaviors.

Use change-scoped verification for each new task. Keep detailed task evidence
and completed outcomes in the external Control runtime rather than accumulating
implementation logs here. PostgreSQL fixtures must touch only their own data.

## Documentation roles

- `AGENTS.md`: concise operating and engineering rules.
- `docs/PROJECT_CONTEXT.md`: durable current product and architecture facts.
- `docs/ACTIVE_PLAN.md`: only the approved work currently in progress.
- `README.md`: public setup and onboarding.
