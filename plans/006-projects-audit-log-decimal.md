# Plan 006: Auditar criação/edição de projetos e devolver hourlyRate como número na API

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e52a5ad..HEAD -- src/app/api/projects/ src/lib/history.ts src/types/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `e52a5ad`, 2026-07-03

## Why this matters

`AGENTS.md` estabelece: "Escritas relevantes devem preservar auditoria em `AuditLog`". Toda mutação de ClockEntry cumpre isso — mas `POST` e `PUT /api/projects` não gravam nenhuma linha de auditoria. Mudar o `hourlyRate` (insumo de faturamento) ou o nome de um projeto hoje não deixa rastro, ao contrário do DELETE do mesmo recurso, que audita. Segundo problema no mesmo arquivo: `GET/POST/PUT` devolvem o objeto Prisma cru, e `Decimal` serializa como **string** (`"150"`), enquanto o DELETE (`projects/[id]/route.ts`) converte para número — contrato inconsistente que hoje só não quebra porque o único consumidor re-coage com `Number()` (`src/app/projetos/projetos-client.tsx:39`). Um consumidor novo que confie no tipo declarado faria `"150" * horas` silenciosamente errado.

## Current state

- `src/app/api/projects/route.ts` (116 linhas):
  - `GET` (12–22): `prisma.project.findMany(...)` → `NextResponse.json(projects)` cru (Decimal→string).
  - `POST` (24–65): valida `name`/`hourlyRate` (`normalizeHourlyRate`)/`color` (`normalizeHexColor`), `prisma.project.create` **sem transação e sem AuditLog**, `revalidateTag('projects-${user.id}')`, retorna `project` cru.
  - `PUT` (67–115): ownership via `findFirst({ id, userId })` (404 se não), `prisma.project.update` **sem AuditLog**, retorna `updated` cru.
- Padrão de auditoria a copiar — `src/app/api/clock/route.ts:72-87` (`tx.auditLog.create` dentro de `prisma.$transaction(async tx => ...)` com `action`, `entityId`, `newData`, `userAgent: req.headers.get('user-agent')`).
- Serializador já existente com a conversão certa — `src/lib/history.ts:8-24`:

```ts
function serializeProject(project: {...}): ProjectOption {
  return {
    ...
    hourlyRate: project.hourlyRate == null ? null : Number(project.hourlyRate),
    isActive: project.isActive,
  }
}
```

  Há outro `serializeProject` local em `src/app/api/projects/[id]/route.ts` (~linha 23) com a mesma conversão. Este plano **extrai um helper compartilhado** e usa nos três lugares.
- Consumidor atual tolera a mudança string→number: `src/app/projetos/projetos-client.tsx:33-39` (`normalizeProject` faz `Number(project.hourlyRate)`).
- Não existe `src/app/api/projects/route.test.ts` nem `[id]/route.test.ts` hoje; padrão de teste: `src/app/api/settings/route.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Testes novos | `npm test -- src/app/api/projects` | exit 0 |
| Suíte completa | `npm test` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/app/api/projects/route.ts`
- `src/app/api/projects/[id]/route.ts` (trocar o serializeProject local pelo compartilhado — nada mais)
- `src/lib/server/serialize-project.ts` (criar)
- `src/lib/history.ts` (trocar o serializeProject local pelo compartilhado — nada mais)
- `src/app/api/projects/route.test.ts` (criar)

**Out of scope** (do NOT touch, even though they look related):
- `src/app/projetos/projetos-client.tsx` — o `normalizeProject` defensivo continua (protege contra caches antigos).
- `prisma/schema.prisma` — o tipo Decimal no banco está correto.
- O fluxo de DELETE em `[id]/route.ts` — já audita; só o serializer muda.

## Git workflow

- Branch: `advisor/006-projects-audit-log-decimal`
- Commit: `fix(projects): audita create/update e devolve hourlyRate como número`
- Não faça push nem abra PR sem instrução explícita do operador.

## Steps

### Step 1: Extrair o serializador compartilhado

Crie `src/lib/server/serialize-project.ts` exportando a mesma função de `src/lib/history.ts:8-24` (assinatura e corpo idênticos, tipo de retorno `ProjectOption` de `@/types`). Atualize `src/lib/history.ts` e `src/app/api/projects/[id]/route.ts` para importar dele, apagando as cópias locais.

**Verify**: `npx tsc --noEmit` → exit 0; `npm test` → verde (testes de history existentes continuam passando).

### Step 2: Serializar número nas respostas de GET/POST/PUT

Em `src/app/api/projects/route.ts`: `GET` retorna `projects.map(serializeProject)`; `POST` e `PUT` retornam `serializeProject(project)` / `serializeProject(updated)`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Adicionar AuditLog em POST e PUT

- `POST`: envolva o `create` em `prisma.$transaction(async (tx) => ...)` criando o projeto e em seguida `tx.auditLog.create` com `action: 'create_project'`, `entityId: project.id`, `newData: serializeProject(project)`, `userAgent: req.headers.get('user-agent')`.
- `PUT`: o projeto antigo já está carregado (`project`, linha 86). Envolva o `update` em transação com `tx.auditLog.create`: `action: 'update_project'`, `entityId: id`, `oldData: serializeProject(project)`, `newData: serializeProject(updated)`, `userAgent`.

Siga o formato exato de `src/app/api/clock/route.ts:47-90` (transação com callback).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Testes

Crie `src/app/api/projects/route.test.ts` no padrão de `src/app/api/settings/route.test.ts` (mocks de `@/lib/prisma` incl. `project.findMany/findFirst/create/update`, `auditLog.create`, `$transaction` com callback; `@/lib/server/auth`; `@/lib/server/security`; `next/cache`). Casos:
1. GET devolve `hourlyRate` como **número** quando o mock retorna um Decimal-like (`{ hourlyRate: { toString: () => '150' } }` — `Number()` resolve para 150) e `null` quando null.
2. POST feliz: AuditLog chamado com `action: 'create_project'` e `newData.hourlyRate` numérico; resposta 201 com número.
3. PUT feliz: AuditLog com `action: 'update_project'`, `oldData` e `newData` presentes.
4. PUT 404 para projeto de outro usuário (findFirst → null).

**Verify**: `npm test -- src/app/api/projects` → 4 casos passando.

## Test plan

Ver Step 4. Verificação final: `npm test` (suíte inteira) e `npx tsc --noEmit` → exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c auditLog src/app/api/projects/route.ts` ≥ 2 (POST e PUT)
- [ ] `grep -n "function serializeProject" src/lib/history.ts src/app/api/projects/[id]/route.ts` → vazio (cópias removidas)
- [ ] `npm test` e `npx tsc --noEmit` saem 0
- [ ] `git status` limpo fora do in-scope
- [ ] Linha do plano 006 atualizada em `plans/README.md`

## STOP conditions

Stop and report back (do not improvise) if:

- Os dois `serializeProject` locais tiverem divergido entre si (drift) — decida NADA; reporte a diferença.
- Algum teste existente de history quebrar com a extração do helper — a assinatura mudou em algum lugar; reporte.

## Maintenance notes

- O spike de faturamento (plano 013) vai consumir `hourlyRate` — o contrato numérico daqui é pré-requisito lógico dele.
- Se `PATCH /api/projects/[id]` for criado no futuro, precisa nascer com AuditLog (o padrão agora existe em 3 lugares).
- Reviewer: confira que `oldData` do PUT usa o projeto ANTES do update (variável `project`, não `updated`).
