# Plan 020: Adicionar linter (Biome) e remover diretivas `eslint-disable` mortas

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 744da2b..HEAD -- package.json .github/workflows/ci.yml src/components/accent-color-provider.tsx src/lib/__tests__/anti-flash-parity.test.ts e2e/verify-fixes.spec.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (independente do plano 019; este adiciona lint de estilo/import-order, 019 é react-doctor)
- **Category**: dx
- **Planned at**: commit `744da2b`, 2026-07-09

## Why this matters

Não há config de lint/format (ESLint, Biome, Prettier) nem `.editorconfig`. O repo
usa `react-doctor` para hooks/React/Next (39 diretivas `react-doctor-disable` vivas),
mas regras de estilo, import-order e `exhaustive-deps` em arquivos não-React não são
enforced em lugar nenhum. Há também 5 diretivas `eslint-disable-next-line` mortas
(nenhum ESLint instalado) — em `src/components/accent-color-provider.tsx:277-278` um
`eslint-disable` (morto) aparece colado com um `react-doctor-disable` (vivo), provando
que o autor pretendia suprimir a mesma regra mas só o react-doctor o faz. `AGENTS.md:9`
referencia um `lint` que não existe como comando.

Biome (1 binário, linter + formatter, rápido, flat config) cobre o gap de
estilo/import-order mais leve que ESLint flat + plugins. Este plano adiciona Biome,
wire no CI, e remove os 5 `eslint-disable` mortos no mesmo sweep.

## Current state

- `package.json:5-14` — scripts: `dev, build, start, test, test:watch, test:e2e,
  test:e2e:ui, test:e2e:report`. Sem `lint`, sem `format`.
- Nenhum arquivo de config: `eslint*`, `.eslintrc*`, `.prettierrc*`, `prettier*`,
  `.editorconfig`, `biome*` (confirmado por glob).
- `src/components/accent-color-provider.tsx:277-278`:
  ```ts
  // eslint-disable-next-line react-hooks/exhaustive-deps   ← morto
  // react-doctor-disable-next-line react-doctor/exhaustive-deps  ← vivo
  ```
- `src/lib/__tests__/anti-flash-parity.test.ts:77` — `// eslint-disable-next-line no-new-func` (morto)
- `e2e/verify-fixes.spec.ts:42,49,92` — três `// eslint-disable-next-line no-console` (mortos)
- `AGENTS.md:9` — "Se encontrar erro em `test`, `typecheck`, `lint` ou `build`..."
- Stack atual: Next 16, React 19, TS 5, Tailwind 4, Vitest 4. Biome 2.x é compatível.
- Convenção de versões: o projeto usa versões recentes (Next 16, React 19, Prisma 7);
  instalar `@biomejs/biome` na versão latest do `npm` é consistente.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm install --save-dev @biomejs/biome` | exit 0 |
| Lint (check) | `npx biome check src/ e2e/` | exit 0 (após triar) |
| Format check | `npx biome format --check src/ e2e/` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `package.json` — adicionar devDep `@biomejs/biome` e scripts `lint`/`format`
- `biome.json` (create) — config flat do Biome
- `.github/workflows/ci.yml` — adicionar step `lint`
- `src/components/accent-color-provider.tsx` — remover `eslint-disable` morto (`:277`)
- `src/lib/__tests__/anti-flash-parity.test.ts` — remover `eslint-disable` morto (`:77`)
- `e2e/verify-fixes.spec.ts` — remover 3 `eslint-disable` mortos (`:42,49,92`)

**Out of scope** (do NOT touch):
- `doctor.config.json` — react-doctor (plano 019).
- Qualquer código de aplicação além da remoção das 5 diretivas mortas. Não use este
  plano para reformatar o repo inteiro (Biome `--write` em tudo) — isso gera um diff
  gigante que ofusca a revisão. Aplique Biome apenas como **check** (read-only) e triar
  violações; se o `format --check` falhar por diferenças de estilo, decida com o
  mantenedor se formata tudo (PR separado) ou se configura exceções.
- `AGENTS.md` — a referência a `lint` (`:9`) torna-se correta após este plano (passa a
  existir o script). Sem mudança necessária, mas pode alinhar a wording depois.

## Git workflow

- Branch: `advisor/020-lint-biome`
- Commit style: `chore: adiciona Biome (lint/format) e remove diretivas eslint-disable mortas`

## Steps

### Step 1: Instalar Biome e criar config

```bash
npm install --save-dev @biomejs/biome
```

Crie `biome.json` na raiz (config flat, mínima, focada em import-order + estilo sem
reformatar o repo inteiro):

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "ignoreUnknown": true,
    "includes": ["src/**", "e2e/**"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": { "noUnusedImports": "error" },
      "suspicious": { "noConsole": "off" }
    }
  },
  "organizeImports": { "enabled": true }
}
```

Notas:
- `noConsole: off` porque o e2e e o `hour-bank.ts:294` usam `console.error` legitimamente.
- `lineWidth: 100` é um chute razoável; ajuste se o repo já tem uma largura dominante
  (confira com `rg -n '.{101,}' src/ | wc -l` — se a maioria das linhas excede 100, suba
  para 120).
- O `formatter.enabled` pode gerar diffs grandes se o repo não segue o estilo do
  Biome. **Decisão:** começar com `format --check` no CI (não `format --write` em tudo);
  se houver muitas violações de formato, adicione `format: fix` script para os
  desenvolvedores rodarem localmente, mas não reformatar o repo neste plano.

**Verify**: `npx biome check src/ e2e/` roda sem crash (pode haver violações — ver Step 2).

### Step 2: Triage de violações

Rode `npx biome check src/ e2e/ 2>&1` e conte as violações. Classifique:
- **Errores que valem corrigir agora** (ex: `noUnusedImports`, `noExplicitAny` em
  código novo): corrija neste step.
- **Falsos positivos ou estilo intencional**: adicione `// biome-ignore lint/...:
  <justificativa>` (mesmo padrão do `react-doctor-disable` — justificativa obrigatória).
- **Violations de formato em massa** (muitas linhas): NÃO corrija neste plano —
  desabilite o formatter no CI como `--check` warn-only ou ajuste a config para aceitar
  o estilo atual (ex: `indentWidth`, `lineWidth`, `quoteStyle`). O objetivo do plano é
  ter um gate, não reformatar tudo.

Se houver > ~30 violações de regra (não de formato), reporte (STOP condition) — pode
ser melhor um sweep de correção separado antes de ligar o gate.

**Verify**: `npx biome check src/ e2e/` → exit 0 (após correções e ignores justificados),
ou `--max-diagnostics` controla o output.

### Step 3: Remover as 5 diretivas `eslint-disable` mortas

- `src/components/accent-color-provider.tsx:277` — remova a linha
  `// eslint-disable-next-line react-hooks/exhaustive-deps`. Mantenha a linha `:278`
  `// react-doctor-disable-next-line react-doctor/exhaustive-deps` (viva).
- `src/lib/__tests__/anti-flash-parity.test.ts:77` — remova
  `// eslint-disable-next-line no-new-func`. O `new Func` permanece; se o Biome reclamar
  de `no-new-func`, adicione `// biome-ignore lint/suspicious/noNewFunc: <razão>`.
- `e2e/verify-fixes.spec.ts:42,49,92` — remova os 3
  `// eslint-disable-next-line no-console`. O `console.*` permanece; `noConsole: off`
  na config já cobre.

**Verify**: `rg -n "eslint-disable" src/ e2e/` → zero matches. `npx tsc --noEmit` → exit 0.

### Step 4: Adicionar scripts ao package.json

Em `package.json:5-14`, adicione:

```json
    "lint": "biome check src/ e2e/",
    "lint:fix": "biome check --write src/ e2e/",
    "format": "biome format --write src/ e2e/",
    "format:check": "biome format --check src/ e2e/"
```

Mantenha os scripts existentes; adicione após `test:e2e:report`.

**Verify**: `npm run lint` → exit 0. `npm run format:check` → exit 0 (ou falha com diff
de formato — se falhar, decida com o mantenedor: ou `npm run format` reescreve tudo num
commit separado, ou desabilita o format check no CI e mantém só o lint).

### Step 5: Adicionar step de lint ao CI

Em `.github/workflows/ci.yml`, adicione `- run: npm run lint` **depois** de `npm test`
e antes de `react-doctor`/`build`:

```yaml
      - run: npm ci
      - run: npx prisma generate
      - run: npx tsc --noEmit
      - run: npm test
      - run: npm run lint
      - run: npx react-doctor@latest --no-telemetry
      - run: npm run build
```

(Se o plano 019 ainda não tiver mesclado, adicione só o `npm run lint` antes do `build`.)

**Verify**: leia o `ci.yml` e confirme a ordem.

### Step 6: Suite completa + build

**Verify**: `npx tsc --noEmit && npm test && npm run lint && npm run build` → todos exit 0.

## Test plan

- Sem testes de app. O gate é: `npm run lint` verde e `rg "eslint-disable" src/ e2e/` zero.
- Se o `format:check` falhar em massa, NÃO bloqueie o plano — desabilite o format check
  no CI (deixe só o lint) e abra um plano separado para reformatar o repo.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run lint` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm test` exits 0
- [ ] `rg -n "eslint-disable" src/ e2e/` → zero matches
- [ ] `biome.json` existe na raiz
- [ ] `package.json` tem scripts `lint` e `lint:fix`
- [ ] `.github/workflows/ci.yml` tem step `npm run lint`
- [ ] `@biomejs/biome` em `devDependencies` do `package.json`
- [ ] Nenhum arquivo fora da lista de escopo foi modificado (exceto correções de
      violações de lint em `src/`/`e2e/` se o Step 2 exigiu)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npx biome check src/ e2e/` retorna **mais de ~30 violações de regra** (não de formato)
  — pode haver tech debt de estilo que vale um sweep separado antes de ligar o gate;
  reporte o número e amostra antes de prosseguir.
- O formatter do Biome quer reformatar um número massivo de linhas (diferença de
  `indentWidth`/`lineWidth`/`quoteStyle`) — NÃO reformatar o repo neste plano; ajuste a
  config para aceitar o estilo dominante ou desabilite o format check no CI. Reporte a
  decisão.
- A remoção de um `eslint-disable` morto expõe um problema real (ex: `new Func` em
  `anti-flash-parity.test.ts` que o Biome sinaliza) — adicione `biome-ignore` justificado
  NÃO reescreva o uso de `new Func`.

## Maintenance notes

- A decisão de não reformatar o repo inteiro aqui é deliberada: um diff de formato
  gigante ofusca revisão e dificulta blame. Se o time quiser adotar o formato do Biome
  integralmente, faça num PR isolado com `npm run format` + commit "chore: format repo
  with Biome" (sem mudança lógica), e depois o `format:check` vira hard gate.
- Biome 2.x evolui rápido; `@latest` no install traz a versão mais recente. Fixar a
  versão (ex: `@biomejs/biome@2.x`) dá reprodutibilidade se a estabilidade for crítica.
- `noConsole: off` pode ser revisitado se quiser proibir `console.*` em `src/` (permitindo
  só em `e2e/`); hoje o `hour-bank.ts:294` usa `console.error` legitimamente para o
  recálculo fail-safe.
- Um reviewer do PR deve confirmar: (a) os 5 `eslint-disable` removidos eram mortos
  (não havia ESLint); (b) a config do Biome não reescreveu o repo inteiro.
