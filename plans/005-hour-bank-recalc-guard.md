# Plan 005: Impedir que falha no recálculo do hour_bank derrube uma mutação de ponto já commitada

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e52a5ad..HEAD -- src/lib/hour-bank.ts src/app/api/clock/ src/app/api/sync/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/004-clock-routes-offline-queue-tests.md (os testes de regressão entram nos arquivos criados lá)
- **Category**: bug
- **Planned at**: commit `e52a5ad`, 2026-07-03

## Why this matters

Em todas as rotas de mutação de ponto, `recalculateHourBankForInterval` roda **depois** que a transação principal commitou, sem try/catch. A função lê settings e faz um upsert por mês afetado (`src/lib/hour-bank.ts:256-277`) — pontos reais de falha transitória (conexão, pool). Se ela lançar, a rota devolve 500 **para uma mutação que já persistiu**: o cliente (`src/hooks/use-clock.ts:100-107`) mostra "Erro ao registrar saída" e **restaura a sessão como aberta na UI** (`setSession(snapshot)`), enquanto o banco já a fechou. O `hour_bank` é, por definição do próprio `AGENTS.md`, "cache derivado" — sua atualização não pode ter o mesmo status de falha da escrita primária.

## Current state

- Os 4 call sites, todos após o commit da transação e sem guard:
  - `src/app/api/clock/[id]/route.ts:149` (PUT clock-out): `await recalculateHourBankForInterval(user.id, entry.clockIn, clockOut)`
  - `src/app/api/clock/[id]/route.ts:201` (DELETE)
  - `src/app/api/clock/[id]/route.ts:363-366` (PATCH, 2 chamadas em `Promise.all` — intervalo antigo e novo)
  - `src/app/api/sync/route.ts:225` (clock_out offline)
- `src/lib/hour-bank.ts:256-277` — assinatura atual:

```ts
export async function recalculateHourBankForInterval(
  userId: string,
  clockIn: Date,
  clockOut: Date | null
): Promise<void> {
```

- Cliente que converte o 500 em estado inconsistente — `src/hooks/use-clock.ts:100-107`:

```ts
const res = await fetch(`/api/clock/${snapshot.id}`, { method: 'PUT' })
if (!res.ok) {
  const data = await res.json().catch(() => ({}))
  toast.error(data.error ?? 'Erro ao registrar saída')
  setSession(snapshot)   // ← reabre a sessão na UI; o banco já fechou
  return
}
```

- Convenção de comentários do repo: comentários explicam restrições que o código não mostra (ver `src/lib/heatmap.ts` para o tom). Vocabulário de `CONTEXT.md`: o hour_bank deriva de Sessões; "Insight nunca é fonte de verdade".
- Testes das rotas: criados pelo plano 004 (`src/app/api/clock/[id]/route.test.ts`, `src/app/api/sync/route.test.ts` já existente) com `vi.mock('@/lib/hour-bank')`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Testes das rotas | `npm test -- src/app/api/clock src/app/api/sync` | exit 0 |
| Suíte completa | `npm test` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/lib/hour-bank.ts` (adicionar wrapper seguro)
- `src/app/api/clock/[id]/route.ts` (trocar 4 chamadas)
- `src/app/api/sync/route.ts` (trocar 1 chamada)
- `src/app/api/clock/[id]/route.test.ts` e `src/app/api/sync/route.test.ts` (casos de regressão)

**Out of scope** (do NOT touch, even though they look related):
- `src/hooks/use-clock.ts` — o rollback otimista do cliente está CORRETO para falhas reais da mutação; some o 500 espúrio e o comportamento dele fica certo.
- A lógica interna de `buildHourBankMonth`/`buildPeriodBalance` — nada muda no cálculo.
- Retry/fila para recálculo falho — deliberadamente adiado (ver Maintenance notes).

## Git workflow

- Branch: `advisor/005-hour-bank-recalc-guard`
- Commit: `fix(hour-bank): recálculo falho não derruba mutação de ponto já commitada`
- Não faça push nem abra PR sem instrução explícita do operador.

## Steps

### Step 1: Criar o wrapper seguro em src/lib/hour-bank.ts

Logo após `recalculateHourBankForInterval`, adicione:

```ts
/**
 * Versão fail-safe do recálculo: o hour_bank é cache derivado (AGENTS.md) e
 * roda DEPOIS do commit da mutação primária — uma falha transitória aqui não
 * pode virar 500 para uma escrita que já persistiu (o cliente reverteria a UI
 * para um estado que o banco já superou). O erro é logado e engolido; o
 * próximo recálculo dos mesmos meses se autocorrige.
 */
export async function safeRecalculateHourBankForInterval(
  userId: string,
  clockIn: Date,
  clockOut: Date | null
): Promise<void> {
  try {
    await recalculateHourBankForInterval(userId, clockIn, clockOut)
  } catch (error) {
    console.error('[hour-bank] recálculo falhou (mutação primária já commitada)', {
      userId,
      clockIn: clockIn.toISOString(),
      clockOut: clockOut?.toISOString() ?? null,
      error,
    })
  }
}
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Trocar os call sites

- `src/app/api/clock/[id]/route.ts`: linhas 149, 201 e o `Promise.all` das linhas 363-366 passam a chamar `safeRecalculateHourBankForInterval` (ajuste o import na linha 23).
- `src/app/api/sync/route.ts:225`: idem (import na linha 5).

Não deixe nenhum call site direto: `grep -rn "await recalculateHourBankForInterval" src/app/` deve retornar vazio (a função original continua exportada para os wrappers e testes de unidade do próprio hour-bank, se existirem).

**Verify**: `grep -rn "recalculateHourBankForInterval" src/app/ | grep -v safe` → vazio.

### Step 3: Casos de regressão nos testes de rota

Nos arquivos de teste (o mock vira `vi.mock('@/lib/hour-bank', () => ({ safeRecalculateHourBankForInterval: vi.fn() }))` — atualize os mocks existentes que citavam o nome antigo):

1. `src/app/api/clock/[id]/route.test.ts` — novo caso: "clock-out retorna 200 mesmo se o recálculo do hour_bank falhar" — `safeRecalculateHourBankForIntervalMock.mockRejectedValue(new Error('pool'))`... **atenção**: o wrapper NUNCA rejeita (engole dentro dele). Então o teste correto no nível da rota é: mocke o wrapper resolvendo normalmente e adicione um teste UNITÁRIO do wrapper em `src/lib/__tests__/hour-bank-safe.test.ts`:
   - mocke `@/lib/prisma` e `@/lib/user-settings` para `getOrCreateUserSettings` rejeitar;
   - chame `safeRecalculateHourBankForInterval(...)` real;
   - afirme que **resolve sem lançar** e que `console.error` foi chamado (spy com `vi.spyOn(console, 'error')`).
2. `src/app/api/sync/route.test.ts` — só renomear o mock para o novo símbolo.

**Verify**: `npm test -- hour-bank-safe src/app/api/clock src/app/api/sync` → todos passam.

### Step 4: Suíte completa

`npm test && npx tsc --noEmit`

**Verify**: exit 0 nos dois.

## Test plan

- `src/lib/__tests__/hour-bank-safe.test.ts` (novo): wrapper resolve quando o recálculo interno rejeita; loga via console.error; propaga NADA.
- Ajuste dos mocks nos testes de rota do plano 004 e no sync existente para o novo nome.
- Verificação: `npm test` → suíte verde.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "recalculateHourBankForInterval" src/app/ | grep -v safe` retorna vazio
- [ ] `src/lib/__tests__/hour-bank-safe.test.ts` existe e passa
- [ ] `npm test` e `npx tsc --noEmit` saem 0
- [ ] `git status` limpo fora do in-scope
- [ ] Linha do plano 005 atualizada em `plans/README.md`

## STOP conditions

Stop and report back (do not improvise) if:

- Os arquivos de teste do plano 004 não existirem (dependência não executada) — reporte; você pode criar SOMENTE o teste do wrapper e trocar os call sites, sinalizando a pendência.
- Encontrar um caminho onde o chamador USA o resultado/falha do recálculo para decidir algo (hoje nenhum usa — retorno é `void`) — o contrato mudaria; reporte.

## Maintenance notes

- **Adiado de propósito**: retry automático/fila para recálculos falhos. O custo é baixo porque o próximo clock-out nos mesmos meses recalcula tudo (o cálculo é idempotente e total, não incremental). Se o app ganhar multiusuário real, revisitar.
- O `console.error` aparece nos function logs da Netlify — se o projeto adotar um error reporter (Sentry etc.), este é o primeiro call site a integrar.
- Reviewer: o ponto sutil é que o wrapper engole a falha ANTES da resposta HTTP — confirme que nenhum call site depende de 5xx para sinalizar hour_bank desatualizado (nenhum depende hoje).
