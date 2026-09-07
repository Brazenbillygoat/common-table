# Common Table

Common Table is a mobile-first personal cookbook, structured recipe discovery
system, and deterministic weekly meal planner.

Published recipes are public. Administrator-created accounts may add and manage
their own recipes. Meal plans remain private to their owner.

Repository: [github.com/Brazenbillygoat/common-table](https://github.com/Brazenbillygoat/common-table)

The application supports owner-controlled recipe authoring, ingredient
alternatives, conditional instructions, and publishing. Browse searches public
recipes by title, description, and ingredient names, with include/exclude
filters, relevance/newest sorting, and 20 results per page. Each public recipe
supports cooking choices and hiding unused content. Photos and meal planning
are not yet implemented.

The app is hosted on Vercel Hobby with PostgreSQL on Neon Free. Published
recipes can be viewed without signing in or running the local development
environment. The PWA supports optional device downloads for offline public browsing, searching,
and cooking. Authoring requires an internet connection.

## Optional offline recipes

Choose **Sync now** in Offline recipes to save every published recipe and the
anonymous app files on that device. The first offer estimates recipe data and
app files separately. Later offers describe added or changed recipes and
removals. **Later** keeps your saved collection; online pages still read current
publications. The manual **Sync** control checks again without downloading until
you approve the offer. No sign-in is needed.

**Available offline** means the complete saved collection and required app files
are ready. Offline pages show the last successful sync time and use the same
search, filters, sorting, pagination, cooking choices and URL state as online
pages. Recipes do not have to be individually opened before going offline.

Interrupted, inconsistent, invalid or oversized downloads and failed storage
writes preserve the previous complete recipe collection. Limits are 1,000
recipes, 20 MiB of recipe JSON and 256 KiB per sync request. Retry after reconnecting
or freeing space. A confirmed **Remove offline downloads** clears only this
app's downloaded recipes and offline files, preserving cloud data and sign-in.
Safari may evict website storage. Downloads are not a permanent backup; loss of
the entire installation requires reconnecting and downloading again.

Prepared app updates wait until all Common Table pages close. Existing cooking
pages retain their loaded recipe, choices and display state, even after a recipe
is updated or unpublished. Close and reopen to use a prepared app version.

### Offline verification

Use local PostgreSQL with the existing migrations applied. Remote databases are
rejected by the offline e2e runner. Tests create and remove only their fixture
records. Install the locked dependencies and Playwright browsers, then run:

```powershell
npm.cmd ci
npx.cmd playwright install chromium webkit
npm.cmd run test:offline:e2e
```

Set `DATABASE_URL` in that process to the local test database. The runner builds
two production versions, uses ports 3110–3112 on loopback, and exercises real
service workers, IndexedDB, offline navigation and waiting-worker activation
in headless Chromium and WebKit. On Windows, WebKit offline tests cut the app
TCP transport and supply the matching connectivity signal because its protocol
offline switch also disables cached service-worker navigation. Actual workers,
storage and network failures are still exercised. Browser-restart tests use
short, isolated temporary profiles to avoid native Windows cache path limits,
and remove only those fixture-created profiles after closing them. Test output
stays under ignored
`.next-offline-e2e` and `test-results`. Optional
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` / `PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH`
select the matching official test binaries when using a task-local installation.
Run the offline-publications integration test with `RUN_DATABASE_TESTS=1`
and `--no-file-parallelism` when combining it with publication tests that
intentionally create invalid public snapshots.

The production build generates `public/offline-sw.js` and
`public/offline-assets.json` from the anonymous shell and its exact static
assets. Use `npm.cmd run build` to include this step. These generated files
are ignored in Git; authenticated HTML and arbitrary server responses never
enter the offline cache.

Real iPhone Safari and home-screen acceptance remain owner checks, including
the actual iOS version, reopening offline, reconnection and an application update.

## Find a recipe

Enter search words and comma-separated ingredient terms on Browse. Results
update after a 500 ms pause in typing. Removing a pill, clearing a field or all
filters, and changing sort update results immediately. Enter or Search can
apply pending typing immediately; neither is required. Search updates preserve
your input focus and cursor position. Applied searches live in the URL for
refresh, sharing, pagination, and browser Back. Existing `/search` links redirect
to Browse.

Matching is case-insensitive and partial: butter matches salted butter and
peanut butter. Every included term must match an ingredient remaining after
exclusions; included ingredients may be mutually exclusive alternatives.
Excluded required ingredients reject a recipe unless an allowed alternative
remains in their choice group. Optional excluded ingredients can be omitted.
Conditional results explain the necessary omissions or available alternatives.
These are text filters, not dietary or allergen assurances. Recipe links open
normally; review and make cooking choices on the recipe page.

Search matches any entered word. Relevance ranks distinct word coverage first,
then title, ingredient, and description matches; publication date and recipe
identity break ties. Empty searches browse newest. Only valid published
snapshots are searched, so unpublished edits remain private. Search requires
an online database connection; no offline recipe storage is included.

## Publish a recipe

Save your changes in the editors, then open Preview. Publishing requires a
title, at least one ingredient, and at least one instruction. Description and
yield are optional. After publishing, edits stay private until you choose
Publish updates. My Recipes shows publication status and unpublished changes.

An open public recipe keeps its loaded content while you cook and change
choices. Refresh or open it again to get the latest publication. Unpublish
removes it from Browse and prevents new visits, while already-open pages stay
usable. Saved authoring content remains available, and publishing again uses
the same public URL.

## Stack

- Next.js App Router, React, and TypeScript
- SCSS and CSS Modules
- PostgreSQL on Neon in production and Docker locally
- Drizzle ORM and reviewed SQL migrations
- Better Auth with administrator-created email/password accounts
- Zod and React Hook Form
- Vitest and Testing Library

## Local setup

Prerequisites:

- Node.js 22.12 or later
- npm
- Docker Desktop with WSL 2 on Windows

Copy `.env.example` to `.env` and replace the development placeholders. Then:

```powershell
docker compose up -d
npm.cmd install
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
```

The local application uses `http://localhost:3000`.

The publication migration preserves drafts and does not publish recipes. If an
older database contains records already marked published without snapshots,
the migration stops for explicit reconciliation before upgrade.

## Production hosting

Production uses Vercel Hobby and Neon Free. Keep these free plans unless the
owner explicitly approves an upgrade. Provider limits can restrict or pause
service; there is no application-level usage meter or spending cutoff.

Set `DATABASE_URL` to the hosted database's pooled connection string and
`BETTER_AUTH_SECRET` to a new random secret of at least 32 characters. Scope
these credentials to Production; Preview needs separate credentials and setup.
The `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` variables are only
used by local Docker.

Local development uses its own Docker database. Keep production credentials
out of Git and use the direct Neon connection for separately authorized
database administration or migrations.

Omit `BETTER_AUTH_URL` on Vercel to use `https://` plus the assigned
`VERCEL_PROJECT_PRODUCTION_URL`. Keep access to Vercel's system environment
variables enabled. An explicit `BETTER_AUTH_URL` takes precedence, so local
development can continue using `http://localhost:3000`. The fallback uses the
stable production address; it does not enable sign-in on Preview addresses.
Vercel documents the hostname in its
[system environment variables reference](https://vercel.com/docs/environment-variables/system-environment-variables#vercel_project_production_url).

With production values supplied to the process, run
`npm.cmd run env:check:production` before deploying. This checks configuration
without connecting to the database; it is not automatically run by the build.

## Create an account

Public registration is disabled. Create accounts from PowerShell after the
database migration:

```powershell
$credential = Get-Credential -UserName "you@example.com"
$env:NEW_USER_EMAIL = $credential.UserName
$env:NEW_USER_PASSWORD = $credential.GetNetworkCredential().Password
$env:NEW_USER_NAME = "Display name"
$env:NEW_USER_ROLE = "admin"
npm.cmd run user:create
Remove-Item Env:NEW_USER_EMAIL
Remove-Item Env:NEW_USER_PASSWORD
Remove-Item Env:NEW_USER_NAME
Remove-Item Env:NEW_USER_ROLE
```

Use `user` instead of `admin` for a normal recipe author.

## Verification

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
git diff --check
```

Architecture and current implementation state are documented in
`docs/PROJECT_CONTEXT.md`.

PostgreSQL integration tests are opt-in. With the local database running and
migrated, set `RUN_DATABASE_TESTS=1` for `npm.cmd test -- .integration.test.ts`,
then restore its previous value. Fixtures create and remove only their own data.
