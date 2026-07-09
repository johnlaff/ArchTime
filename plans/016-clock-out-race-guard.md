# Plan 016: Guarda condicional no UPDATE de clock-out (race de duas abas / online-vs-sync)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 744da2b..HEAD -- src/app/api/clock/[id]/route.ts src/app/api/sync/route.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (independente do plano 015, que toca o cliente; este toca o server)
- **Category**: bug
- **Planned at**: commit `744da2b`, 2026-07-09

## Why this matters

O `clock_out` (PUT em `/api/clock/[id]` e o branch `clock_out` do `/api/sync`) faz o
check `if (entry.clockOut) return idempotente` **fora** da transação, e o `UPDATE`
dentro da transação usa `where: { id }` **sem** guarda `clockOut: null`. Duas
requisições concorrentes (duas abas, ou online PUT correndo contra sync offline) ambas
passam no check, ambas entram na transação; a segunda sobrescreve
`clockOut`/`totalMinutes`/`hash` e cria uma **segunda** entrada em `AuditLog` para a
mesma ação — trilha de auditoria duplicada e timestamp levemente impreciso.

O `clock_in` é protegido por um partial unique index (`clock_entries_one_open_per_user_idx`)
que garante uma única sessão aberta por usuário; o `clock_out` não tem proteção análoga.
O impacto real é audit-log duplicado + imprecisão de timestamp, **não** corrupção de
totais (ambos computam do mesmo `clockIn`); por isso é P2, não P1.

## Current state

### `src/app/api/clock/[id]/route.ts` — PUT (clock-out)

- `:73-90` — `getEntry(id, user.id)` fora da transação; se `entry.clockOut` já setado,
  retorna o já-fechado (atalho idempotente). **Esta checagem é fora da transação.**
- `:118-147` — transação interativa:
  ```ts
  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // react-doctor-disable-next-line react-doctor/async-parallel -- ...
    const updatedEntry = await tx.clockEntry.update({
      where: { id },                    // ← SEM clockOut: null / deletedAt: null
      data: { clockOut, totalMinutes, hash },
    })
    await tx.timeAllocation.updateMany({ where: { clockEntryId: id }, data: { minutes: totalMinutes } })
    await tx.auditLog.create({ data: { ... action: 'clock_out' ... } })
    return updatedEntry
  })
  ```

### `src/app/api/sync/route.ts` — branch clock_out

- `:157-170` — `findFirst` fora da transação; `if (clockEntry.clockOut) return
  idempotente`. **Fora da transação.**
- `:183-224` — `prisma.$transaction([...])` batch:
  ```ts
  prisma.clockEntry.update({
    where: { id: entry.entryId },       // ← SEM clockOut: null
    data: { clockOut, totalMinutes, hash, source: 'offline_sync' },
  }),
  prisma.timeAllocation.updateMany({ where: { clockEntryId: entry.entryId }, data: { minutes: totalMinutes } }),
  prisma.auditLog.create({ data: { ... action: 'offline_sync' ... } }),
  ```

### Padrão a espelhar (clock_in já correto)

- `src/app/api/clock/route.ts:47-90` e `src/app/api/sync/route.ts:76-122` — o `clock_in`
  faz check-then-create **dentro** da transação interativa e é protegido pelo unique
  index parcial. Handler de P2002 em `clock/route.ts:103-111` e `sync/route.ts:128-148`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Tests | `npm test` | all pass |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/app/api/clock/[id]/route.ts` — PUT: trocar `update` por `updateMany` com guarda `clockOut: null`
- `src/app/api/sync/route.ts` — branch clock_out: trocar o batch `$transaction([...])` por transação interativa com `updateMany` condicional
- `src/app/api/clock/[id]/route.test.ts` — adicionar caso de concorrência (idempotência sob UPDATE que afeta 0 linhas)
- `src/app/api/sync/route.test.ts` — adicionar caso análogo

**Out of scope** (do NOT touch):
- `src/hooks/use-clock.ts` — a guarda client-side contra double-click (`setSession(null)`
  + `loading`) mitiga mas não elimina a race cross-tab; não é o foco deste plano.
- O handler de `clock_in` (já protegido por unique index).
- O endpoint DELETE/PATCH de `/api/clock/[id]` (esses operam em sessões já fechadas e
  têm guarda `if (!entry.clockOut) return 409`).

## Git workflow

- Branch: `advisor/016-clock-out-race-guard`
- Commit style: `fix(clock): clock-out usa guarda condicional no UPDATE para evitar audit-log duplicado`

## Steps

### Step 1: PUT — trocar `update` por `updateMany` condicional

Em `src/app/api/clock/[id]/route.ts`, no PUT, dentro da transação interativa
(`:118-147`), troque o `tx.clockEntry.update` por `tx.clockEntry.updateMany` com guarda
`clockOut: null`:

```ts
const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
  const result = await tx.clockEntry.updateMany({
    where: { id, clockOut: null, deletedAt: null },
    data: { clockOut, totalMinutes, hash },
  })

  if (result.count === 0) {
    // Outra requisição fechou a sessão entre o getEntry e o commit.
    // Busca o registro já fechado para retornar como idempotente.
    const alreadyClosed = await tx.clockEntry.findUnique({
      where: { id },
      select: { id: true, clockIn: true, clockOut: true, totalMinutes: true, source: true, activityType: true },
    })
    throw Object.assign(new Error('already-closed'), { alreadyClosed })
  }

  // Busca o registro atualizado (updateMany não retorna o registro)
  const updatedEntry = await tx.clockEntry.findUnique({
    where: { id },
    select: { id: true, clockIn: true, clockOut: true, totalMinutes: true, source: true, activityType: true },
  })

  await tx.timeAllocation.updateMany({ where: { clockEntryId: id }, data: { minutes: totalMinutes } })

  await tx.auditLog.create({
    data: {
      userId: user.id,
      action: 'clock_out',
      entityId: id,
      oldData,
      newData: { ...oldData, clockOut: clockOut.toISOString(), totalMinutes, hash },
      userAgent: req.headers.get('user-agent'),
    },
  })

  return updatedEntry
})
```

E no `catch` externo (após o `prisma.$transaction`), capture o erro `already-closed`
para retornar a resposta idempotente (200 com os dados da sessão já fechada), espelhando
o formato do atalho idempotente de `:78-90`:

```ts
} catch (error) {
  const maybeError = error as { message?: string; alreadyClosed?: { id: string; clockIn: Date; clockOut: Date; totalMinutes: number | null; source: string; activityType: string | null } }
  if (maybeError.message === 'already-closed' && maybeError.alreadyClosed) {
    const closed = maybeError.alreadyClosed
    return NextResponse.json({
      id: closed.id,
      clockIn: closed.clockIn.toISOString(),
      clockOut: closed.clockOut!.toISOString(),
      totalMinutes: closed.totalMinutes,
      source: closed.source,
      // projectId/projectName/projectColor não estão no select acima; recupere do
      // `entry` (o getEntry inicial) se necessário para paridade com o atalho :78-90.
      projectId: entry.allocations[0]?.projectId ?? null,
      projectName: entry.allocations[0]?.project.name ?? null,
      projectColor: entry.allocations[0]?.project.color ?? null,
      activityType: closed.activityType,
    })
  }
  throw error
}
```

Notas:
- O `select` no `findUnique` pós-`updateMany` deve trazer os campos que o `NextResponse.json(updated)` em `:153` espera (`id`, `clockIn`, `clockOut`, `totalMinutes`, `source`, `activityType`). Confira o tipo de `updated` que o `return` em `:153` serializa — se ele espera mais campos, adicione ao `select`.
- `entry.allocations` já está disponível do `getEntry` inicial (`:73`), então
  `projectId`/`projectName`/`projectColor` no caminho idempotente podem reusar `entry`.

**Verify**: `npx tsc --noEmit` → exit 0. Pode haver erro de tipo no `return
NextResponse.json(updated)` em `:153` se `updated` mudou de tipo (de `ClockEntry` para
o `select` parcial) — ajuste o `select` para incluir todos os campos que `:153` referencia.

### Step 2: sync — branch clock_out com transação interativa + updateMany condicional

Em `src/app/api/sync/route.ts`, o branch `clock_out` (`:154-227`) usa um batch
`prisma.$transaction([...])`. Troque por uma transação interativa para poder checar o
`count` do `updateMany` e decidir idempotência:

```ts
await prisma.$transaction(async (tx) => {
  const result = await tx.clockEntry.updateMany({
    where: { id: entry.entryId, clockOut: null, deletedAt: null },
    data: { clockOut, totalMinutes, hash, source: 'offline_sync' },
  })

  if (result.count === 0) {
    // Já foi fechada por outra requisição (online PUT ou outro sync). Idempotente.
    return
  }

  await tx.timeAllocation.updateMany({
    where: { clockEntryId: entry.entryId },
    data: { minutes: totalMinutes },
  })

  await tx.auditLog.create({
    data: {
      userId: user.id,
      action: 'offline_sync',
      entityId: entry.entryId,
      oldData: { /* ...igual ao atual... */ },
      newData: { /* ...igual ao atual... */ },
      userAgent: req.headers.get('user-agent'),
    },
  })
})
```

Mantenha o `oldData`/`newData` exatamente como estão hoje (`:202-219`), apenas movidos
para dentro da transação interativa. O `return NextResponse.json({ ok: true, idempotent:
true })` fora da transação (`:169`) já cobre o caso onde `clockEntry.clockOut` estava
setado **antes** da transação (checagem `:168`); o `count === 0` cobre o caso onde foi
setado **durante** a corrida.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Teste de concorrência no PUT

Em `src/app/api/clock/[id]/route.test.ts`, adicione um caso no `describe('PUT
(clock-out)')`:

- Mock `clockEntryFindFirstMock` para retornar uma entrada aberta (`clockOut: null`).
- Mock `tx.clockEntry.updateMany` (adicione ao `txMock`) para retornar `{ count: 0 }`
  (simula que outra requisição fechou a sessão entre o `getEntry` e o commit).
- Mock `tx.clockEntry.findUnique` para retornar a entrada já fechada.
- Verifique: status 200 (idempotente, não 409/500), `auditLog.create` **não** chamado
  (não duplica o log), `timeAllocation.updateMany` **não** chamado.

Adicione `updateMany: vi.fn()` e `findUnique: vi.fn()` ao `txMock.clockEntry` em `:49-53`.

**Verify**: `npm test -- clock/[id]` → all pass, incluindo o novo caso.

### Step 4: Teste análogo no sync

Em `src/app/api/sync/route.test.ts`, adicione um caso: entrada `clock_out` offline onde
o `updateMany` retorna `count: 0` (sessão já fechada por PUT online concorrente).
Verifique resposta `{ ok: true }` e `auditLog.create` não chamado.

**Verify**: `npm test -- sync` → all pass.

### Step 5: Suite completa + build

**Verify**: `npm test && npm run build` → ambos exit 0.

## Test plan

- `src/app/api/clock/[id]/route.test.ts`: novo caso "PUT é idempotente quando
  `updateMany` afeta 0 linhas (outra requisição fechou a sessão) — não cria audit-log
  duplicado". Modelar nos testes existentes do PUT (que já usam `txMock`).
- `src/app/api/sync/route.test.ts`: caso análogo para o branch `clock_out`.
- Verificação-chave em ambos: `expect(txMock.auditLog.create).not.toHaveBeenCalled()`
  quando `count === 0`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0; novos testes de concorrência existem e passam
- [ ] `npm run build` exits 0
- [ ] `rg -n "where: \{ id \}," src/app/api/clock/[id]/route.ts` NÃO retorna o `update`
      do PUT (agora é `updateMany` com `clockOut: null`)
- [ ] `rg -n "updateMany" src/app/api/sync/route.ts` retorna match no branch clock_out
- [ ] Nenhum arquivo fora da lista de escopo foi modificado
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- O código nos locais citados em "Current state" não corresponde aos excertos
  (codebase derivou).
- O tipo de retorno de `updated` em `clock/[id]/route.ts:153` não pode ser satisfeito
  pelo `select` parcial do `findUnique` pós-`updateMany` — reporte os campos esperados
  antes de ampliar o `select` (pode indicar que o `serializeOldData` ou a response shape
  precisam de campos que o `updateMany` não retorna).
- A troca do batch `$transaction([...])` no sync para transação interativa quebra algum
  teste existente além dos esperados — reporte o teste antes de adaptar.
- A condição `count === 0` dispara em cenários que **não** sejam "já fechado" (ex:
  entrada deletada entre o check e o update) — reporte para decidir o status de retorno.

## Maintenance notes

- Esta guarda torna o `clock_out` idempotente sob concorrência da mesma forma que o
  `clock_in` é protegido pelo unique index. A diferença: `clock_in` usa o DB para
  rejeitar a 2ª; `clock_out` usa o `count` do `updateMany` para tratar a 2ª como
  idempotente (porque "fechar uma sessão já fechada" não é erro — é no-op).
- Se futuramente houver um endpoint de "reabrir sessão" (reverter clock-out), a guarda
  `clockOut: null` no `updateMany` continua correta (reabrir seria um `updateMany` com
  `where: { id, clockOut: { not: null } }`).
- Um reviewer do PR deve confirmar: (a) `auditLog.create` **não** é chamado quando
  `count === 0`; (b) o caminho idempotente retorna os mesmos campos do atalho `:78-90`.
