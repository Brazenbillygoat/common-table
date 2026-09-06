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
are still in development.

## Find a recipe

Enter search words and comma-separated ingredient terms on Browse, then press
Search to apply the controls. Remove a filter pill and press Search to apply
that change. Applied searches live in the URL for refresh, sharing, pagination,
and browser Back. Existing `/search` links redirect to Browse.

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
- PostgreSQL in Docker
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
