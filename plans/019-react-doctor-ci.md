# Plan 019: Gate de react-doctor no CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 744da2b..HEAD -- .github/workflows/ci.yml`
> If this file changed since this plan was written, compare the "Current state"
> excerpt against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `744da2b`, 2026-07-09

## Why this matters

O `react-doctor` (linter de hooks/React/Next, já com `doctor.config.json` na raiz e 39
diretivas `react-doctor-disable-next-line` justificadas no `src/`) hoje é um gate
**manual** — `README.md:18` lista `npx react-doctor@latest` como passo de verificação, e
`plans/001-ci-github-actions.md:46` documenta que o time o roda à parte. Sem um step no
CI, regressões que o react-doctor pegaria (novo circular dep, unused export, nova
violação de regras de hooks) chegam ao `main` sempre que um PR esquece de rodá-lo
manualmente. Adicionar o step ao CI torna o "100/100" atual durável.

## Current state

- `.github/workflows/ci.yml` — workflow completo (27 linhas):
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
        NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
        NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder-anon-key
        NEXT_PUBLIC_APP_URL: https://archtime.netlify.app
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 22
            cache: npm
        - run: npm ci
        - run: npx prisma generate
        - run: npx tsc --noEmit
        - run: npm test
        - run: npm run build
  ```
- `doctor.config.json` na raiz — config do react-doctor.
- 39 ocorrências de `react-doctor-disable-next-line` em `src/` com justificativas —
  prova que a equipe usa o react-doctor como linter de hooks/React/Next.
- `README.md:18` — "Verificação" lista `npx react-doctor@latest` (manual).
- `AGENTS.md:9` — menciona "Se encontrar erro em `test`, `typecheck`, `lint` ou
  `build`" — `lint` aqui refere-se ao react-doctor (não há ESLint; ver plano 020).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| react-doctor local | `npx react-doctor@latest --no-telemetry` | exit 0, score 100/100 |
| CI (após edit) | push/PR dispara o workflow | job verde |

## Scope

**In scope** (the only files you should modify):
- `.github/workflows/ci.yml` — adicionar step `react-doctor`

**Out of scope** (do NOT touch):
- `doctor.config.json` — config existente; não alterar regras neste plano.
- `README.md`, `AGENTS.md` — já mencionam react-doctor; sem mudança.
- `src/` — não adicionar/remover diretivas `react-doctor-disable` aqui.

## Git workflow

- Branch: `advisor/019-react-doctor-ci`
- Commit style: `ci: adiciona step de react-doctor no workflow`

## Steps

### Step 1: Confirmar que o baseline está verde localmente

Antes de adicionar ao CI, confirme que o react-doctor passa no estado atual do repo:

**Verify**: `npx react-doctor@latest --no-telemetry` → exit 0, score 100/100 (ou o
score atual documentado). Se houver violações pré-existentes, **não prosseguir** —
reporte (STOP condition); adicionar um gate vermelho ao CI trava a fila.

### Step 2: Adicionar o step ao ci.yml

Em `.github/workflows/ci.yml`, adicione um step `react-doctor` **depois** de
`npm test` e **antes** de `npm run build` (o build é o gate mais caro; roda o
react-doctor antes para falhar rápido se houver regressão de hooks):

```yaml
      - run: npm ci
      - run: npx prisma generate
      - run: npx tsc --noEmit
      - run: npm test
      - run: npx react-doctor@latest --no-telemetry
      - run: npm run build
```

Use `npx react-doctor@latest --no-telemetry` (sem `--fix` — o CI só diagnostica; correções
são do desenvolvedor). O `@latest` segue o padrão do `README.md:18`.

Se houver risco de um falso positivo pontual travar a fila no curto prazo, considere
`continue-on-error: true` na primeira semana (ring-out), depois promover a hard gate.
**Decisão:** adicione como hard gate (sem `continue-on-error`) se o Step 1 confirmou
100/100 — a equipe já mantém o baseline manualmente, então o gate só protege contra
regressões novas.

**Verify**: leia o `ci.yml` e confirme que o step `npx react-doctor@latest --no-telemetry`
está entre `npm test` e `npm run build`.

### Step 3: Confirmar a ordem dos gates

A ordem fica: `tsc --noEmit` → `npm test` → `react-doctor` → `build`. Esta ordem falha
no gate mais barato primeiro (typecheck), depois testes, depois react-doctor (análise
de hooks), e o build (mais caro) por último.

**Verify**: `rg -n "run:" .github/workflows/ci.yml` mostra a sequência acima.

## Test plan

- Sem testes de app — o gate é o próprio workflow. Validação: abra um PR com a mudança
  e confirme que o job `verify` roda o step `react-doctor` e fica verde (assumindo Step 1
  confirmou 100/100).
- Não é necessário simular uma regressão (remover uma diretiva e falhar) neste plano;
  o gate protege contra regressões futuras.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `.github/workflows/ci.yml` contém `- run: npx react-doctor@latest --no-telemetry`
      entre `npm test` e `npm run build`
- [ ] `npx react-doctor@latest --no-telemetry` localmente → exit 0 (confirma que o gate
      não nasce vermelho)
- [ ] Nenhum arquivo fora de `.github/workflows/ci.yml` foi modificado
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npx react-doctor@latest --no-telemetry` localmente retorna **violões pré-existentes**
  (score < 100) — adicionar o gate travaria a fila; reporte as violações antes de
  prosseguir (podem ser trabalho do plano 020 ou de um sweep separado).
- O workflow `ci.yml` tem estrutura diferente da descrita (ex: jobs adicionais, matrix)
  — ajuste preservando a estrutura existente.

## Maintenance notes

- Se o react-doctor lançar uma major com novas regras que geram falsos positivos no
  repo, o step pode ficar vermelho; usar `continue-on-error: true` temporariamente
  enquanto tria, depois remover.
- `@latest` significa que a versão do react-doctor no CI pode variar; se a reprodutibilidade
  for crítica, fixar a versão (ex: `npx react-doctor@<version>`) é mais estável, mas
  perde correções automáticas. O padrão atual do time é `@latest` (README:18) — manter.
- Um reviewer do PR deve confirmar que o step está posicionado para falhar rápido
  (antes do build caro) e que não há `continue-on-error: true` (a menos que o Step 1
  tenha encontrado violações e o mantenedor aceitou ring-out).
