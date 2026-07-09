# ArchTime

PWA mobile-first em pt-BR de controle de horas para arquitetos e freelancers, offline-first, timezone `America/Sao_Paulo`.

## Stack

Next.js App Router, React, TypeScript strict, Prisma 7 + Supabase Postgres, Tailwind 4 + shadcn/ui, Serwist (PWA), Vitest, Playwright. Deploy: Azure App Service (container, Brazil South).

## Rodando localmente

1. `cp .env.local.example .env.local` e preencha (Supabase URL/keys, DATABASE_URL/DIRECT_URL, ALLOWED_EMAILS, NEXT_PUBLIC_APP_URL, ENTRY_HASH_SECRET)
2. `npm ci`
3. Monte o schema do DB: `npx prisma migrate deploy` (para um Supabase novo, ver `docs/supabase-security-checklist.md` para o baseline das migrations 0000–0001)
4. `npx prisma generate`
5. `npm run dev`

## Verificação

`npm test` · `npx tsc --noEmit` · `npm run build` · `npx react-doctor@latest`

## Documentação canônica

- `AGENTS.md` — instruções para agentes/contribuidores
- `CONTEXT.md` — glossário de domínio
- `docs/adr/` — decisões arquiteturais

## Deploy

Produção em **Azure App Service** (container Linux B1, região Brazil South), servida em **https://archtime.app**. A imagem é publicada no GitHub Container Registry (`ghcr.io/johnlaff/archtime`) pelo workflow `build-image` a cada push na `main`, e o App Service faz o pull automático via webhook de continuous deployment. O banco (Supabase, `sa-east-1`) é compartilhado entre ambientes — cuidado com dados reais ao validar mudanças (ver `docs/adr/0004` para o modelo de confiança de origem e `docs/adr/0003` para o histórico).
