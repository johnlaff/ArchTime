# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server on localhost:3000
npm run build        # Production build (runs prisma generate first)
npm test             # Run Vitest unit tests
npm run test:watch   # Watch mode

npx prisma db push   # Apply schema changes to Supabase (uses DIRECT_URL)
npx prisma generate  # Regenerate Prisma client after schema changes
npx prisma studio    # Open Prisma Studio (database browser)
```

## Architecture

**Stack:** Next.js 15 App Router · TypeScript strict · Prisma 7 + Supabase PostgreSQL · Tailwind CSS 4 + shadcn/ui · @serwist/next PWA · idb (offline) · date-fns-tz

**Data access rule:** Simple reads (active session, project list) → Supabase client with RLS. Aggregations and JOINs → API Route with Prisma. This line moves as features grow.

**All writes go through API Routes** — never write to the DB from client components directly. Every write records to `AuditLog`. Clock-out computes a SHA-256 hash of the entry.

**Offline flow:** `useClock` detects `navigator.onLine`. If offline, entries go to IndexedDB via `src/lib/offline-queue.ts`. `SyncProvider` (a "use client" wrapper in `src/components/providers.tsx`) flushes the queue on reconnect via `POST /api/sync`. Queue is sorted chronologically before flush.

**Layout pattern:** `src/app/layout.tsx` is a Server Component. All client-side providers (`ThemeProvider`, `SyncProvider`) live in `src/components/providers.tsx` which is `"use client"`.

**Dates:** All timestamps stored as UTC `TIMESTAMPTZ`. Display always via `formatBRT()` from `src/lib/dates.ts` which converts to `America/Sao_Paulo`. Never use `new Date('YYYY-MM-DD')` without a time component.

**Auth:** Multi-user allowlist. Middleware checks Supabase session on every request. OAuth callback (`/auth/callback`) calls `exchangeCodeForSession()` before checking email via `isAllowedEmail()` from `src/lib/auth.ts`, which reads `ALLOWED_EMAILS` (comma-separated). Every API route re-verifies auth and email.

**Middleware exclusions:** `/_next/*`, `/icons/*`, `/manifest.json`, `/sw.js` are excluded from auth — PWA assets must never be gated.

## Prisma 7 notes

- Connection URLs are **not** in `prisma/schema.prisma` — they're in `prisma.config.ts` (for CLI) and `src/lib/prisma.ts` via `PrismaPg` adapter (for runtime).
- `prisma.config.ts` loads `.env.local` via dotenv and sets `datasource.url` to `DIRECT_URL` for migrations/db push.
- Runtime client uses `@prisma/adapter-pg` with `DATABASE_URL` (pgbouncer pooler, port 6543).

## Environment

See `.env.local.example` for all required variables. `DATABASE_URL` uses the pgbouncer pooler (port 6543). `DIRECT_URL` uses the direct connection (port 5432) — required for `prisma db push`.

## Phase 2 scope (not yet built)

`/historico` · `/banco-de-horas` · `/relatorios` (PDF + Excel) · `/configuracoes`
