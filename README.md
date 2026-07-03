# ArchTime

PWA mobile-first em pt-BR de controle de horas para arquitetos e freelancers, offline-first, timezone `America/Sao_Paulo`.

## Stack

Next.js App Router, React, TypeScript strict, Prisma 7 + Supabase Postgres, Tailwind 4 + shadcn/ui, Serwist (PWA), Vitest, Playwright. Deploy: Netlify.

## Rodando localmente

1. `cp .env.local.example .env.local` e preencha (Supabase URL/keys, DATABASE_URL/DIRECT_URL, ALLOWED_EMAILS, ENTRY_HASH_SECRET)
2. `npm ci`
3. `npx prisma generate`
4. `npm run dev`

## Verificação

`npm test` · `npx tsc --noEmit` · `npm run build` · `npx react-doctor@latest`

## Documentação canônica

- `AGENTS.md` — instruções para agentes/contribuidores
- `CONTEXT.md` — glossário de domínio
- `docs/adr/` — decisões arquiteturais

## Deploy

Netlify (produção acompanha `main`; previews compartilham o banco — cuidado com dados reais, ver docs/adr/0003)
