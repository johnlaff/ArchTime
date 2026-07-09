# Plan 023: Testes para boundaries de segurança — DELETE de projetos e `isAllowedEmail`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 744da2b..HEAD -- src/app/api/projects/[id]/route.ts src/app/api/projects/route.test.ts src/lib/auth.ts src/lib/__tests__/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `744da2b`, 2026-07-09

## Why this matters

Dois boundaries de segurança com cobertura zero:
1. `DELETE /api/projects/[id]` tem dois ramos (arquivar quando há allocations vs hard
   delete) com campos de audit-log fáceis de regredir. Não há `route.test.ts` no
   diretório `[id]` — o `projects/route.test.ts` importa só `GET, POST, PUT`.
2. `isAllowedEmail` (`src/lib/auth.ts:5-11`) é o **único** gate entre um JWT válido e
   "este email pode entrar". É uma função pura que parseia `ALLOWED_EMAILS`. Todos os
   testes de rota mockam `getAuthenticatedUser`, então a lógica real de auth nunca roda
   nos testes. Uma regressão (mudar o split, case-sensitivity, guard de empty) poderia
   deixar entrar usuário não-permitido ou bloquear permitido — sem teste pega.

## Current state

### #17 — DELETE /api/projects/[id]

- `src/app/api/projects/[id]/route.ts:8-79` — handler DELETE:
  - `:37-62`: se `allocationCount > 0` → arquiva (`isActive=false`, audit
    `archive_project_with_entries` com `allocationCount` em `oldData`/`newData`, retorna
    200 com `archivedInsteadOfDeleted: true`).
  - `:64-78`: senão → hard delete (audit `delete_project`).
  - `:21-35`: `findFirst({ where: { id, userId } })` — IDOR guard; retorna 404 se não dono.
- `src/app/api/projects/route.test.ts:26` — `import { GET, POST, PUT } from './route'`
  (sem DELETE — o DELETE vive em `[id]`).
- Não existe `src/app/api/projects/[id]/route.test.ts`.
- Padrão de teste de rota: `src/app/api/clock/[id]/route.test.ts` (mocks de
  `@/lib/prisma`, `@/lib/server/auth`, `@/lib/server/security`, `next/cache`; `txMock`
  para transação interativa; helper `req(method, body)` e `params()`).

### #18 — isAllowedEmail

- `src/lib/auth.ts:5-11`:
  ```ts
  export function isAllowedEmail(email: string | undefined | null): boolean {
    if (!email) return false
    const allowed = (process.env.ALLOWED_EMAILS ?? '')
      .split(',')
      .flatMap((e) => { const t = e.trim(); return t ? [t] : [] })
    return allowed.includes(email)
  }
  ```
- Sem test file. Usado em `src/lib/server/auth.ts:21` e `src/proxy.ts:82`.
- Padrão de teste de função pura: `src/lib/__tests__/preferences.test.ts` (usa
  `vi.stubEnv` para env vars). Vitest.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Tests | `npm test` | all pass |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/app/api/projects/[id]/route.test.ts` (create) — testes do DELETE
- `src/lib/__tests__/auth.test.ts` (create) — testes do `isAllowedEmail`

**Out of scope** (do NOT touch):
- `src/app/api/projects/[id]/route.ts` — código de produção; este plano só adiciona testes.
- `src/lib/auth.ts` — sem mudança (o teste documenta o comportamento atual, incluindo
  case-sensitivity; se o mantenedor quiser mudar para case-insensitive, é plano separado).
- `src/app/api/projects/route.test.ts` — não adicionar DELETE lá (vive em `[id]`).
- Outras rotas — já têm testes.

## Git workflow

- Branch: `advisor/023-tests-security-boundary`
- Commit style: `test: cobre DELETE /api/projects/[id] e isAllowedEmail (boundaries de segurança)`

## Steps

### Step 1: Criar `src/app/api/projects/[id]/route.test.ts`

Modele em `src/app/api/clock/[id]/route.test.ts` (mesma estrutura de mocks). O handler
DELETE de projects usa transação interativa, então o `txMock` precisa de `project.update`
  e `auditLog.create` (e `timeAllocation.count` ou `aggregate` se o handler usar).

Leia `src/app/api/projects/[id]/route.ts` para confirmar exatamente quais métodos Prisma
o DELETE chama (atualizado vs o excerto em "Current state"). Os mocks devem espelhar.

Estrutura alvo:

```ts
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: { findFirst: vi.fn() },
    timeAllocation: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/server/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/server/security', () => ({ validateMutationOrigin: vi.fn(() => null) }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { DELETE } from './route'

const getAuthenticatedUserMock = getAuthenticatedUser as unknown as Mock
const projectFindFirstMock = prisma.project.findFirst as unknown as Mock
const timeAllocationCountMock = prisma.timeAllocation.count as unknown as Mock
const transactionMock = prisma.$transaction as unknown as Mock

const txMock = {
  project: { update: vi.fn(), delete: vi.fn() },
  auditLog: { create: vi.fn() },
}

function baseProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'project-1', userId: 'user-1', name: 'Casa Alfa', clientName: null,
    hourlyRate: null, color: '#6366f1', isActive: true,
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function req() {
  return new NextRequest('https://archtime.netlify.app/api/projects/project-1', { method: 'DELETE' })
}
const params = () => Promise.resolve({ id: 'project-1' })

describe('DELETE /api/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuthenticatedUserMock.mockResolvedValue({ id: 'user-1' })
    transactionMock.mockImplementation(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof txMock) => unknown)(txMock)
    )
  })

  it('returns 404 for a project owned by another user without opening a transaction', async () => {
    projectFindFirstMock.mockResolvedValue(null)
    const response = await DELETE(req(), { params: params() })
    expect(response.status).toBe(404)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('archives instead of deleting when the project has time allocations', async () => {
    // Confirme o nome exato do método (count vs aggregate) lendo route.ts
    projectFindFirstMock.mockResolvedValue(baseProject())
    timeAllocationCountMock.mockResolvedValue(3)
    txMock.project.update.mockResolvedValue(baseProject({ isActive: false }))

    const response = await DELETE(req(), { params: params() })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.archivedInsteadOfDeleted).toBe(true)
    expect(txMock.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'project-1' }, data: expect.objectContaining({ isActive: false }) })
    )
    expect(txMock.project.delete).not.toHaveBeenCalled()
    expect(txMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'archive_project_with_entries',
          entityId: 'project-1',
          oldData: expect.objectContaining({ allocationCount: 3 }),
          newData: expect.objectContaining({ allocationCount: 3 }),
        }),
      })
    )
  })

  it('hard-deletes when the project has no time allocations', async () => {
    projectFindFirstMock.mockResolvedValue(baseProject())
    timeAllocationCountMock.mockResolvedValue(0)

    const response = await DELETE(req(), { params: params() })

    expect(response.status).toBe(204)
    expect(txMock.project.delete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'project-1' } }))
    expect(txMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'delete_project' }) })
    )
  })
})
```

**Atenção:** leia `src/app/api/projects/[id]/route.ts` e ajuste:
- O método de contagem (`timeAllocation.count` vs `aggregate`) — confira o nome real.
- O status code do hard-delete (204 vs 200) e se retorna body.
- O nome exato do `action` de audit (`archive_project_with_entries`, `delete_project`).
- Se o handler deleta via `tx.project.delete` ou `prisma.project.delete` fora da tx.
- O `revalidateTag` chamado (se o plano 017 removeu `revalidateTag('projects-...')`,
  não o asserte; asserta só os que permanecem, se houver).

**Verify**: `npm test -- projects/[id]` → all pass.

### Step 2: Criar `src/lib/__tests__/auth.test.ts`

Modele em `src/lib/__tests__/preferences.test.ts` (uso de `vi.stubEnv`). `isAllowedEmail`
é pura, lê `process.env.ALLOWED_EMAILS`.

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isAllowedEmail } from '../auth'

const ORIGINAL = process.env.ALLOWED_EMAILS

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ALLOWED_EMAILS
  else process.env.ALLOWED_EMAILS = ORIGINAL
})

describe('isAllowedEmail', () => {
  it('returns false for null/undefined/empty email', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'john@example.com')
    expect(isAllowedEmail(null)).toBe(false)
    expect(isAllowedEmail(undefined)).toBe(false)
    expect(isAllowedEmail('')).toBe(false)
  })

  it('returns false when ALLOWED_EMAILS is empty or unset', () => {
    vi.stubEnv('ALLOWED_EMAILS', '')
    expect(isAllowedEmail('john@example.com')).toBe(false)
    delete process.env.ALLOWED_EMAILS
    expect(isAllowedEmail('john@example.com')).toBe(false)
  })

  it('allows an email in the list', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'john@example.com')
    expect(isAllowedEmail('john@example.com')).toBe(true)
  })

  it('allows an email in a comma-separated list with whitespace', () => {
    vi.stubEnv('ALLOWED_EMAILS', ' giordanna@example.com , john@example.com ')
    expect(isAllowedEmail('john@example.com')).toBe(true)
    expect(isAllowedEmail('giordanna@example.com')).toBe(true)
  })

  it('ignores empty entries from trailing/double commas', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'john@example.com,,')
    expect(isAllowedEmail('john@example.com')).toBe(true)
    expect(isAllowedEmail('')).toBe(false)
  })

  it('rejects an email not in the list', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'john@example.com')
    expect(isAllowedEmail('intruso@example.com')).toBe(false)
  })

  it('is case-sensitive (documents current behavior)', () => {
    vi.stubEnv('ALLOWED_EMAILS', 'john@example.com')
    expect(isAllowedEmail('John@example.com')).toBe(false)
    expect(isAllowedEmail('JOHN@EXAMPLE.COM')).toBe(false)
  })
})
```

O caso "case-sensitive" **documenta** o comportamento atual (não o muda). Se o
mantenedor quiser case-insensitive, é um plano separado — o teste travará a decisão
atual e forçará uma atualização explícita.

**Verify**: `npm test -- auth` → all pass.

### Step 3: Suite completa + build

**Verify**: `npm test && npm run build` → ambos exit 0.

## Test plan

- `src/app/api/projects/[id]/route.test.ts`: 3 casos (404 IDOR, archive com allocations,
  hard-delete sem allocations). Modelar em `src/app/api/clock/[id]/route.test.ts`.
- `src/lib/__tests__/auth.test.ts`: ~7 casos (null/undefined/empty, env vazio/unset,
  email na lista, lista com whitespace, trailing/double commas, email rejeitado,
  case-sensitivity documentada).
- Verificação-chave no DELETE: `expect(txMock.auditLog.create).toHaveBeenCalledWith(...)`
  verifica o `action` e o `allocationCount` em `oldData`/`newData` — travando o
  contrato que a UI usa (`archivedInsteadOfDeleted: true`).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0; novos testes em `projects/[id]/route.test.ts` e `auth.test.ts` passam
- [ ] `npm run build` exits 0
- [ ] `src/app/api/projects/[id]/route.test.ts` existe e cobre os 3 casos do DELETE
- [ ] `src/lib/__tests__/auth.test.ts` existe e cobre `isAllowedEmail`
- [ ] `src/app/api/projects/[id]/route.ts` e `src/lib/auth.ts` não foram modificados
- [ ] Nenhum arquivo fora da lista de escopo foi modificado
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- O handler DELETE de `src/app/api/projects/[id]/route.ts` não corresponde ao excerto
  (nomes de `action`, métodos Prisma, status codes, ou `archivedInsteadOfDeleted` flag
  divergem) — ajuste os testes ao código real; não altere o código.
- O handler usa um método Prisma não coberto pelos mocks (ex: `aggregate` em vez de
  `count`) — adicione o mock apropriado ao `vi.mock('@/lib/prisma', ...)`.
- `isAllowedEmail` tem dependência além de `process.env.ALLOWED_EMAILS` (não é pura
  como assumido) — reporte; pode precisar de mock adicional.

## Maintenance notes

- O teste case-sensitivity de `isAllowedEmail` **trava** a decisão atual. Se o mantenedor
  decidir torná-la case-insensitive (recomendado para robustez de authz), atualize o
  teste junto com a mudança — o teste falhará intencionalmente, sinalizando a mudança
  deliberada.
- Se o DELETE ganhar um 3º ramo (ex: bypass admin via `ADMIN_EMAIL`), adicione o caso ao
  `route.test.ts` — o mock de `getAuthenticatedUser` já retorna `{ id: 'user-1' }`; para
  testar admin, mockar com `{ id, email }` e stubar `ADMIN_EMAIL`.
- Um reviewer do PR deve confirmar que os testes assertam o `action` de audit e o
  `archivedInsteadOfDeleted` — estes são o contrato que a UI consome.
