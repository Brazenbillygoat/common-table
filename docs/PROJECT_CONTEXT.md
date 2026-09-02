# Common Table project context

Last reviewed against the repository: 2026-09-02

## Product

Common Table is a mobile-first personal cookbook, recipe discovery system, and
deterministic meal planner for Hyrum and a small family group. Published recipes
are public. Accounts are administrator-created; recipes and meal plans remain
owner-controlled. The application is an installable, online-first PWA without
offline synchronization.

It is not a social network, AI product, pantry tracker, or native application.

## Current implementation

The repository currently provides:

- Next.js 16.2 App Router, React 19, TypeScript, SCSS, and CSS Modules.
- PostgreSQL 18 through Docker Compose, Drizzle ORM, committed SQL migrations,
  and idempotent reference-data seeding.
- Better Auth email/password sessions with public sign-up disabled and the
  admin plugin available for managed accounts.
- A responsive server-rendered shell, public search foundation, sign-in and
  sign-out, private recipe and meal-plan boundaries, and light/dark theming.
- Owner-scoped draft creation and a My recipes workspace.
- Structured ingredient and instruction editors with validation, ordered
  content, optimistic concurrency, transactional mutations, and failure-state
  preservation. Ingredient authoring supports named sections, labeled
  choose-one groups, independent optional lines, and whole-group movement.
- Instruction blocks can apply always, to one choose-one option, or to one
  optional ingredient. Referenced ingredient structures cannot be deleted or
  ungrouped until their linked instructions are reassigned or removed.
- An owner-only draft preview resolves ingredient choices and conditional
  instructions from validated URL parameters without persisting cooking state.
  Undecided, inactive, and active branches remain explicit, and active steps
  receive one contiguous numbering sequence.
- Canonical and recipe-owned custom ingredients and units, including numeric,
  ranged, free-form, and omitted quantities.
- Vitest, Testing Library, ESLint, Prettier, TypeScript, build, and opt-in
  PostgreSQL integration checks.

Not implemented: public recipe list and detail pages, publishing, delete and
complete edit flows, photo storage, production search and dietary derivation,
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

PostgreSQL full-text search, `pg_trgm`, and `unaccent` are the planned MVP search
foundation. Search state belongs in URL parameters and ranking must remain
deterministic.

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

The most recent full automated application verification was 2026-09-02:
formatting, lint, TypeScript, 175 tests across 33 files with PostgreSQL
integration enabled, the Next.js production build, migration application twice,
idempotent seed, schema-drift generation, and `git diff --check` passed. Owner
browser and visual acceptance remains separate.

## Documentation roles

- `AGENTS.md`: concise operating and engineering rules.
- `docs/PROJECT_CONTEXT.md`: durable current product and architecture facts.
- `docs/ACTIVE_PLAN.md`: only the approved work currently in progress.
- `README.md`: public setup and onboarding.
