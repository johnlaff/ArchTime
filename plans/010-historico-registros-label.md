# Plan 010: Corrigir o rodapé do Histórico — segmentos não são "sessões"

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e52a5ad..HEAD -- src/app/historico/historico-client.tsx src/lib/history.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e52a5ad`, 2026-07-03

## Why this matters

O glossário do projeto (`CONTEXT.md`) é explícito: *"Segmento — a fatia de uma Sessão que cai em um único dia local (BRT). O Histórico lista segmentos (uma sessão que cruza a meia-noite vira 2 segmentos), não sessões cruas."* O campo `sessionCount` de `HistoryData` conta segmentos visíveis (`src/lib/history.ts:100` — `visible.length`), mas o rodapé do Histórico o exibe como **"X sessão/sessões"**: uma sessão noturna que cruza a meia-noite aparece como "2 sessões", inflando o número que o usuário lê como "quantas vezes bati ponto". O mesmo arquivo já usa o rótulo neutro correto em outro lugar ("resultado/resultados", linha 481). Correção: alinhar o rótulo do rodapé à semântica real (segmentos → "registros"), sem tocar em API ou cálculo.

## Current state

- `src/lib/history.ts:96-104` — `sessionCount: visible.length`, onde `visible` são **segmentos** (gerados por `entries.flatMap(splitIntervalByLocalDay...)` na linha 59) filtrados. Não mude — o número está certo para o que a lista mostra; o rótulo é que mente.
- `src/app/historico/historico-client.tsx:619-626` — o alvo:

```tsx
<div className="border-t pt-3 flex items-center justify-between text-sm text-muted-foreground">
  <span>{filtersActive ? 'Total filtrado' : 'Total do mês'}</span>
  <span className="tabular-nums font-medium">
    {formatMinutes(data?.totalMinutes ?? 0)}&nbsp;·&nbsp;
    {data?.sessionCount ?? 0}{' '}
    {data?.sessionCount === 1 ? 'sessão' : 'sessões'}
  </span>
</div>
```

- Idioma já usado no mesmo arquivo (`:481`): `{data?.sessionCount ?? 0} {data?.sessionCount === 1 ? 'resultado' : 'resultados'}` — não mude essa linha.
- Vocabulário de `CONTEXT.md` a honrar: "Sessão" = clock-in→clock-out; "Segmento" = fatia diária. "Registro" é o termo neutro para a linha listada.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Suíte | `npm test` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/app/historico/historico-client.tsx` (somente as linhas 623–624)

**Out of scope** (do NOT touch, even though they look related):
- `src/lib/history.ts` / `src/types/` — NÃO renomeie o campo `sessionCount` (tocaria API, testes e client em cascata; ver Maintenance notes).
- A linha 481 ("resultados") — já correta.
- Qualquer cálculo de `totalMinutes`/paginação.

## Git workflow

- Branch: `advisor/010-historico-registros-label`
- Commit: `fix(historico): rodapé conta registros (segmentos), não "sessões"`
- Não faça push nem abra PR sem instrução explícita do operador.

## Steps

### Step 1: Trocar o rótulo

Nas linhas 623–624 de `src/app/historico/historico-client.tsx`, troque `'sessão' : 'sessões'` por `'registro' : 'registros'`.

**Verify**: `grep -n "registro" src/app/historico/historico-client.tsx` → a linha alterada aparece; `grep -n "'sessão'" src/app/historico/historico-client.tsx` → vazio.

### Step 2: Validar

`npm test && npx tsc --noEmit`

**Verify**: exit 0 nos dois (nenhum teste referencia o texto antigo — confirme com `grep -rn "sessões" src/ e2e/ --include="*.test.ts*" --include="*.spec.ts"`; se algum referenciar, atualize-o também e liste no relatório).

## Test plan

Mudança de string sem lógica — a suíte existente cobre a regressão de compilação. Se `grep` do Step 2 achar spec e2e asserindo o texto antigo, atualize a asserção junto.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "'registro'" src/app/historico/historico-client.tsx` = 1 (mais o plural na linha seguinte)
- [ ] `npm test` e `npx tsc --noEmit` saem 0
- [ ] `git diff --name-only` mostra apenas o arquivo in-scope (e specs ajustados, se houver)
- [ ] Linha do plano 010 atualizada em `plans/README.md`

## STOP conditions

Stop and report back (do not improvise) if:

- As linhas 623–624 não contiverem o trecho citado (drift).
- Você se ver tentado a "fazer direito" renomeando `sessionCount` em toda a pilha — fora do escopo; reporte como sugestão.

## Maintenance notes

- **Adiado de propósito**: renomear `HistoryData.sessionCount` → `segmentCount` (toca `src/types`, a rota `/api/history`, testes e o client) e/ou exibir a contagem REAL de sessões (`new Set(visible.map(s => s.entryId)).size`) ao lado. Se o produto um dia quiser "X sessões" de verdade, é esse o caminho — o rótulo atual ("registros") continua correto nesse cenário.
- Reviewer: uma linha de diff; confira só que o plural ficou certo.
