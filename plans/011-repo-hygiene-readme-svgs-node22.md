# Plan 011: Higiene do repo — README real, remover SVGs de boilerplate e Node 22 no build

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e52a5ad..HEAD -- README.md public/ netlify.toml package.json .github/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-ci-github-actions.md (o bump de Node atualiza também o ci.yml criado lá)
- **Category**: docs
- **Planned at**: commit `e52a5ad`, 2026-07-03

## Why this matters

Três sobras do scaffold `create-next-app` com custo concreto: (1) o `README.md` é o boilerplate intocado — manda deployar na **Vercel** quando o app roda em **Netlify + Supabase**, e não menciona `.env.local.example`, Prisma nem os comandos de verificação: quem segue o README termina com um app quebrado (doc ativamente errada é pior que ausente); (2) cinco SVGs default órfãos em `public/` entram no precache do service worker (o `public/sw.js` gerado lista `next.svg`, `vercel.svg`, `window.svg` com revision — bytes inúteis em todo install do PWA); (3) o build da Netlify roda **Node 20, cuja manutenção LTS terminou em abril/2026** — produção builda num runtime sem patches de segurança, sendo que Next 16/React 19 suportam Node 22.

## Current state

- `README.md` (38 linhas) — 100% create-next-app: "bootstrapped with create-next-app", seção "Deploy on Vercel". Nenhuma menção a ArchTime além do nada.
- Fontes de verdade para o novo conteúdo (leia antes de escrever): `AGENTS.md` (stack, comandos, arquitetura), `CONTEXT.md` (o que o produto é), `.env.local.example` (variáveis com comentários), `docs/adr/` (decisões).
- SVGs órfãos: `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`. Confirmação de que nada referencia: `grep -rn "next.svg\|vercel.svg\|globe.svg\|window.svg\|file.svg" src/ e2e/ --include="*.ts*"` → vazio. O precache é gerado pelo build (`@serwist/next`, `swDest: public/sw.js`) — remover os arquivos e rebuildar limpa as entradas.
- `netlify.toml:5-6`:

```toml
[build.environment]
  NODE_VERSION = "20"
```

- `package.json:36` — `"@types/node": "^20"`.
- `.github/workflows/ci.yml` — criado pelo plano 001 com `node-version: 20` e um comentário apontando para este plano.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Instalar types | `npm i -D @types/node@^22` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Suíte | `npm test` | exit 0 |
| Build (regenera sw.js) | `npm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `README.md` (reescrever)
- `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg` (deletar)
- `public/sw.js` (regenerado pelo build — commite o resultado)
- `netlify.toml` (NODE_VERSION)
- `package.json` + `package-lock.json` (@types/node)
- `.github/workflows/ci.yml` (node-version — só se o plano 001 já tiver sido executado)

**Out of scope** (do NOT touch, even though they look related):
- `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `docs/` — continuam canônicos; o README aponta para eles, não os substitui.
- Qualquer código em `src/`.

## Git workflow

- Branch: `advisor/011-repo-hygiene`
- Commit: `chore: README real, remove SVGs de boilerplate e Node 22 no build`
- Não faça push nem abra PR sem instrução explícita do operador.

## Steps

### Step 1: Reescrever o README.md

Estrutura obrigatória (conteúdo extraído de AGENTS.md/CONTEXT.md/.env.local.example — não invente fatos):

```markdown
# ArchTime
<uma frase: PWA mobile-first em pt-BR de controle de horas para arquitetos e freelancers, offline-first, timezone America/Sao_Paulo>

## Stack
<lista curta: Next.js App Router, React, TypeScript strict, Prisma 7 + Supabase Postgres, Tailwind 4 + shadcn/ui, Serwist (PWA), Vitest, Playwright. Deploy: Netlify>

## Rodando localmente
1. `cp .env.local.example .env.local` e preencha (Supabase URL/keys, DATABASE_URL/DIRECT_URL, ALLOWED_EMAILS, ENTRY_HASH_SECRET)
2. `npm ci`
3. `npx prisma generate`
4. `npm run dev`

## Verificação
`npm test` · `npx tsc --noEmit` · `npm run build` · `npx react-doctor@latest`

## Documentação canônica
- `AGENTS.md` — instruções para agentes/contribuidores (arquitetura, regras de datas/timezone, Prisma/Supabase)
- `CONTEXT.md` — glossário de domínio
- `docs/adr/` — decisões arquiteturais

## Deploy
Netlify (produção acompanha `main`; previews compartilham o banco — cuidado com dados reais, ver docs/adr/0003)
```

**Verify**: `grep -ci vercel README.md` → 0; `grep -c "env.local.example" README.md` ≥ 1.

### Step 2: Remover os SVGs órfãos

Antes: `grep -rn "next.svg\|vercel.svg\|globe.svg\|window.svg\|file.svg" src/ e2e/ --include="*.ts*"` → **deve ser vazio** (STOP se não for). Então `git rm public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg`.

**Verify**: `ls public/*.svg` → nenhum dos cinco.

### Step 3: Node 22

1. `netlify.toml`: `NODE_VERSION = "22"`.
2. `npm i -D @types/node@^22`.
3. Se `.github/workflows/ci.yml` existir: `node-version: 22` (e remova o comentário "plano 011").

**Verify**: `npx tsc --noEmit` → exit 0 com os novos types.

### Step 4: Rebuild e suíte completa

`npm run build && npm test`

**Verify**: build exit 0; `grep -c "next.svg" public/sw.js` → 0 (precache limpo); suíte verde.

## Test plan

Sem testes novos — mudanças de docs/config. Gate: Step 4 + (para o Node 22 em produção) validação do deploy preview da Netlify pelo operador antes do merge, conforme fluxo do repo.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -ci vercel README.md` = 0 e README menciona `.env.local.example`, Netlify e os comandos de verificação
- [ ] Os 5 SVGs não existem e `grep -c "next.svg\|vercel.svg\|window.svg" public/sw.js` = 0
- [ ] `netlify.toml` com NODE_VERSION = "22" e `@types/node` ^22 no package.json
- [ ] `npm run build`, `npm test` e `npx tsc --noEmit` saem 0
- [ ] Linha do plano 011 atualizada em `plans/README.md`

## STOP conditions

Stop and report back (do not improvise) if:

- O grep do Step 2 encontrar QUALQUER referência aos SVGs — não delete o referenciado.
- `tsc` quebrar com `@types/node@22` em código existente — reporte os erros em vez de suprimi-los.
- O build falhar com Node local ≠ 22 de forma que impeça validar — reporte a versão local (`node -v`).

## Maintenance notes

- O par `netlify.toml` NODE_VERSION ↔ `ci.yml` node-version deve andar sempre junto (próximo bump: quando Node 22 sair de manutenção).
- README curto de propósito: a documentação profunda vive em AGENTS.md/CONTEXT.md/docs — não deixar o README crescer e divergir.
- Operador: valide o deploy preview (build Node 22) antes do merge; PWA em janela anônima.
