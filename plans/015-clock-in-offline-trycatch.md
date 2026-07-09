# Plan 015: Tratar falha do IndexedDB no clock-in offline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 744da2b..HEAD -- src/hooks/use-clock.ts src/lib/offline-queue.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `744da2b`, 2026-07-09

## Why this matters

O branch offline do `clockIn` no hook `use-clock.ts` chama `addPendingEntry` (que abre
IndexedDB) **sem try/catch**. Em contextos onde o IndexedDB falha (modo anônimo com
restrições, storage desabilitado, contextos sem `indexedDB`), a rejeição se propaga como
unhandled promise rejection: nenhum toast, `setSession` não rooda, a entrada não é
enfileirada. O usuário clica "Bater entrada" e nada acontece — perde o clock-in sem
saber. O `clockOut` offline no mesmo hook (`src/hooks/use-clock.ts:100-126`) já lida com
o mesmo erro graciosamente (try/catch restaura a sessão + toast), o que torna o
`clockIn` uma assimetria clara, não decisão deliberada.

## Current state

- `src/hooks/use-clock.ts:25-47` — branch offline do `clockIn`. Estrutura atual:
  ```ts
  if (!navigator.onLine) {
    const id = crypto.randomUUID()
    const timestamp = new Date().toISOString()
    await addPendingEntry({           // ← pode throw (IndexedDB indisponível)
      id, entryId: id, type: 'clock_in',
      timestamp, projectId: projectId ?? undefined,
      activityType: activityType ?? undefined, createdAt: timestamp,
    })
    setSession({ id, clockIn: timestamp, projectId, projectName: null,
      projectColor: null, activityType: activityType ?? null })
    toast.warning('Entrada salva offline. Será sincronizada ao reconectar.')
    return
  }
  ```
- `src/lib/offline-queue.ts:15-26` — `getDB()` chama `openDB(...)` que throwa quando o
  IndexedDB está indisponível. `addPendingEntry` (`:28-31`) não tem try/catch —
  propaga o erro.
- `src/hooks/use-clock.ts:100-126` — branch offline do `clockOut`, **com** try/catch:
  ```ts
  try {
    if (navigator.onLine) { /* ... */ }
    else {
      const timestamp = new Date().toISOString()
      await addPendingEntry({ id: crypto.randomUUID(), entryId: snapshot.id,
        type: 'clock_out', timestamp, createdAt: timestamp })
      toast.warning('Saída salva offline. Será sincronizada ao reconectar.')
    }
  } catch {
    toast.error('Erro ao registrar saída')
    setSession(snapshot)
  } finally { setLoading(false) }
  ```
  Este é o padrão a espelhar no `clockIn`.
- `src/lib/offline-queue.ts:64-70` — `syncPendingEntries` já tem `try { entries = await
  getPendingEntries() } catch { return ... }` justamente para SSR/incógnito. Confirma
  que a equipe trata IndexedDB indisponível como caso legítimo.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Tests | `npm test` | all pass |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/hooks/use-clock.ts` — envolver o branch offline do `clockIn` em try/catch
- `src/hooks/__tests__/use-clock.test.ts` — adicionar caso de "clock-in offline com IndexedDB falhando"

**Out of scope** (do NOT touch):
- `src/lib/offline-queue.ts` — não adicionar try/catch em `addPendingEntry`; a função
  deve propagar o erro para o caller decidir (o `syncPendingEntries` já trata no ponto
  certo). Adicionar try/catch lá mascararia o problema e mudaria o contrato.
- O branch online do `clockIn` (já tem try/catch em `:61-89`).
- O branch do `clockOut` (já está correto).

## Git workflow

- Branch: `advisor/015-clock-in-offline-trycatch`
- Commit style: `fix(clock): clock-in offline trata falha do IndexedDB com toast de erro`

## Steps

### Step 1: Envolver o branch offline do clockIn em try/catch

Em `src/hooks/use-clock.ts`, substitua o bloco offline do `clockIn` (linhas ~25-47) por
uma versão com try/catch que espelha o padrão do `clockOut` (`:100-126`). O objetivo:
se `addPendingEntry` falhar, **não** chamar `setSession` (a entrada não foi persistida),
mostrar toast de erro, e sair cedo.

Forma alvo (preserve a verificação `if (!navigator.onLine)` no topo do `clockIn`):

```ts
if (!navigator.onLine) {
  const id = crypto.randomUUID()
  const timestamp = new Date().toISOString()
  try {
    await addPendingEntry({
      id,
      entryId: id,
      type: 'clock_in',
      timestamp,
      projectId: projectId ?? undefined,
      activityType: activityType ?? undefined,
      createdAt: timestamp,
    })
    setSession({
      id,
      clockIn: timestamp,
      projectId,
      projectName: null,
      projectColor: null,
      activityType: activityType ?? null,
    })
    toast.warning('Entrada salva offline. Será sincronizada ao reconectar.')
  } catch {
    toast.error('Não foi possível salvar a entrada offline')
  }
  return
}
```

Pontos-chave:
- `setSession` e `toast.warning` ficam **dentro** do `try`, depois de `addPendingEntry`
  — só rodam se a persistência teve sucesso.
- O `catch` mostra toast de erro e **não** restaura sessão (não havia sessão antes do
  clock-in; não há o que restaurar — ao contrário do `clockOut` que tem `snapshot`).
- O `return` no final continua fora do try/catch (executa em ambos os caminhos), para
  não cair no branch online.
- Não use `finally`/`setLoading` aqui — o branch offline não liga `loading` (o loading
  é do branch online). Confirme lendo o estado atual: o `setLoading(true)` está em `:58`,
  **depois** do bloco offline.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Adicionar teste do caso "IndexedDB falha no clock-in offline"

Em `src/hooks/__tests__/use-clock.test.ts`, adicione um caso que mocka `addPendingEntry`
para rejeitar, chama `clockIn` com `navigator.onLine = false`, e verifica: (a) nenhum
`setSession` com a entrada otimista (a sessão permanece `null`), (b) toast de erro é
mostrado, (c) nenhuma rejeição não tratada.

Use o padrão dos testes existentes no arquivo para mockar `navigator.onLine`,
`addPendingEntry` e `toast`. Se o arquivo já mocka `addPendingEntry`, faça o mock
rejeitar uma vez para este caso (`mockRejectedValueOnce(new Error('IndexedDB unavailable'))`).

**Verify**: `npm test -- use-clock` → all pass, incluindo o novo caso.

### Step 3: Suite completa + build

**Verify**: `npm test && npm run build` → ambos exit 0.

## Test plan

- Novo teste em `src/hooks/__tests__/use-clock.test.ts`: "clock-in offline com
  IndexedDB falhando mostra toast de erro e não inicia a sessão". Modelar a estrutura
  nos testes existentes de `clockOut` offline (que já cobrem o caminho de erro).
- Caso de edge a documentar no teste: se `addPendingEntry` falha, o usuário pode tentar
  de novo; não há estado corrompido (não houve `setSession`).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0; novo teste para clock-in offline com falha existe e passa
- [ ] `npm run build` exits 0
- [ ] `rg -n "addPendingEntry" src/hooks/use-clock.ts` mostra a chamada **dentro** de um
      bloco `try` no branch offline do `clockIn`
- [ ] `src/lib/offline-queue.ts` não foi modificado (`git diff --name-only` não o lista)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- O código em `src/hooks/use-clock.ts:25-47` não corresponde ao excerto em "Current
  state" (a codebase derivou).
- O arquivo de teste `src/hooks/__tests__/use-clock.test.ts` não existe ou não mocka
  `addPendingEntry` de forma que permita fazê-lo rejeitar — reporte a estrutura real
  antes de improvisar o mock.
- A correção parece exigir tocar `src/lib/offline-queue.ts` (fora de escopo) — reporte.

## Maintenance notes

- Futuramente, se o app ganhar um fluxo "tentar novamente" para entradas offline
  falhadas, o `catch` aqui é o ponto natural para enfileirar a retry com backoff.
- Um reviewer do PR deve confirmar que `setSession` e `toast.warning` ficam **depois**
  de `await addPendingEntry` dentro do `try` — se ficarem antes, o bug volta (sessão
  otimista sem persistência).
