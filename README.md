# Common Table

Common Table is a mobile-first personal cookbook, structured recipe discovery
system, and deterministic weekly meal planner.

Published recipes are public. Administrator-created accounts may add and manage
their own recipes. Meal plans remain private to their owner.

Repository: [github.com/Brazenbillygoat/common-table](https://github.com/Brazenbillygoat/common-table)

The current application supports authenticated recipe drafts, including
creating drafts and adding, editing, reordering, and deleting ingredient lines.
Recipe discovery and meal planning are still in development.

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
