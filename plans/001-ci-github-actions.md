# Plan 001: Adicionar CI no GitHub Actions rodando typecheck, testes e build em todo PR

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e52a5ad..HEAD -- .github/ package.json netlify.toml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `e52a5ad`, 2026-07-03

## Why this matters

O repositório tem 173+ testes Vitest, TypeScript strict e um build de produção — mas **nada disso roda automaticamente**: não existe diretório `.github/`. O fluxo do projeto é 100% baseado em PRs (ver `git log`: todo trabalho entra via PR squash-merged), e o único gate automático hoje é o build da Netlify, que não roda testes nem typecheck. Pior: os deploy previews da Netlify compartilham o banco de produção (decisão registrada em `docs/adr/0003-activitytype-migration.md`), então um PR quebrado chega a um preview "vivo" apontando para dados reais sem nenhuma verificação. Este plano é o baseline de verificação que os demais planos assumem.

## Current state

- `.github/` — **não existe** (confirme com `ls /home/john/dev/ArchTime/.github` → "No such file or directory").
- `package.json:5-14` — scripts disponíveis:

```json
"scripts": {
  "dev": "next dev --webpack",
  "build": "next build --webpack",
  "start": "next start",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:e2e:report": "playwright show-report"
}
```

- Não há script `lint`. O gate de qualidade usado pelo time é `npx react-doctor@latest` (hoje 100/100 — há memória de projeto de manter esse score).
- `netlify.toml:1-7` — o build de produção roda `npx prisma generate && npm run build` com `NODE_VERSION = "20"`. O CI deve usar **Node 20** para espelhar produção (o plano 011 fará o bump coordenado para 22 nos dois lugares).
- **`npx prisma generate` é pré-requisito de `tsc` e do build**: os tipos de `@prisma/client` são gerados, não commitados. Não precisa de banco — só do `prisma/schema.prisma`.
- O build lê `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` em módulos client (`src/lib/supabase/client.ts` usa non-null assertion). O build local funciona com `.env.local`; no CI, forneça placeholders públicos dummy (são chaves públicas por definição — nenhum segredo real vai para o workflow).
- Testes unitários (`npm test`) não tocam banco nem rede: rotas de API são testadas com `vi.mock('@/lib/prisma')` (ver `src/app/api/sync/route.test.ts:4-34`). E2E (Playwright) exige `SUPABASE_TEST_SESSION` manual — **fica fora do CI** neste plano.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Prisma client | `npx prisma generate` | exit 0, "Generated Prisma Client" |
| Typecheck | `npx tsc --noEmit` | exit 0, sem erros |
| Tests | `npm test` | exit 0, todos passam |
| Build | `npm run build` | exit 0, "Compiled successfully" |
| YAML válido | `npx --yes js-yaml .github/workflows/ci.yml` | imprime o JSON do YAML, exit 0 |

## Scope

**In scope** (the only files you should modify):
- `.github/workflows/ci.yml` (criar)

**Out of scope** (do NOT touch, even though they look related):
- `netlify.toml` — o bump de Node é do plano 011; aqui o CI espelha o Node 20 atual.
- `package.json` — não adicione script `lint` nem dependências.
- Playwright/e2e — exigem sessão Supabase real; não tente rodá-los no CI.

## Git workflow

- Branch: `advisor/001-ci-github-actions`
- Commit style: conventional commits em pt-BR, ex. do repo: `chore: add AGENTS.md as canonical agent instructions...` → use `ci: roda typecheck, testes e build em todo PR`
- Não faça push nem abra PR sem instrução explícita do operador (regra de `AGENTS.md`).

## Steps

### Step 1: Criar o workflow

Crie `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    env:
      # Placeholders: valores públicos dummy só para o next build resolver os
      # módulos client. Nenhum segredo real é necessário — os testes mockam o Prisma.
      NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
      NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder-anon-key
      NEXT_PUBLIC_APP_URL: https://archtime.netlify.app
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20   # espelha NODE_VERSION do netlify.toml (plano 011 sobe para 22)
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npx tsc --noEmit
      - run: npm test
      - run: npm run build
```

**Verify**: `npx --yes js-yaml .github/workflows/ci.yml` → imprime a estrutura, exit 0.

### Step 2: Validar o pipeline localmente (mesma sequência do workflow)

Rode, na raiz do repo, exatamente: `npm ci && npx prisma generate && npx tsc --noEmit && npm test && npm run build`

**Verify**: exit 0 em todos; `npm test` termina com todos os testes passando (`Test Files N passed`).

### Step 3 (opcional, se o operador aprovar): validar no GitHub

Somente com autorização do operador: push da branch e confira o check "CI / verify" verde no PR.

**Verify**: check verde na aba Checks do PR.

## Test plan

Nenhum teste novo — o plano existe para executar os testes existentes automaticamente. A verificação é o Step 2 (pipeline local passa de ponta a ponta).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `.github/workflows/ci.yml` existe e `npx --yes js-yaml .github/workflows/ci.yml` sai 0
- [ ] `npm ci && npx prisma generate && npx tsc --noEmit && npm test && npm run build` sai 0
- [ ] `git status` não mostra arquivos modificados fora do in-scope
- [ ] Linha do plano 001 atualizada em `plans/README.md`

## STOP conditions

Stop and report back (do not improvise) if:

- `npm run build` falhar por variável de ambiente ausente mesmo com os placeholders do Step 1 — reporte QUAL variável; não adicione segredos reais ao workflow.
- `npm test` falhar em um teste pré-existente (não introduzido por você) — o baseline está quebrado; isso precisa ser conhecido antes do CI entrar.
- Você se ver tentado a adicionar passos de deploy, e2e ou lint — fora do escopo.

## Maintenance notes

- O plano 011 muda `node-version` aqui e `NODE_VERSION` no `netlify.toml` juntos — mantenha os dois sempre iguais.
- Se um dia os e2e ganharem uma conta de teste dedicada (hoje usam sessão real, ver `e2e/auth.setup.ts`), adicionar um job separado de e2e é o próximo passo natural.
- Reviewer: confira que nenhum valor real de chave Supabase foi colado no YAML (placeholders apenas).
