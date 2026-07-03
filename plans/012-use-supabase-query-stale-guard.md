# Plan 012: Guard de resposta obsoleta no useSupabaseQuery (última requisição vence)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e52a5ad..HEAD -- src/hooks/use-supabase-query.ts src/hooks/__tests__/`
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

`useSupabaseQuery` é o leitor SWR caseiro que serve `dashboard:active-session`, `dashboard:projects-active` e outras chaves entre páginas. O callback `.then` de cada fetch grava incondicionalmente no cache de módulo (`store.set(key, { data: result })`). Cenário de corrida: uma revalidação de background (listener de `focus`/`online`) está em voo; o usuário bate ponto e o app chama `refetch()` (que limpa o `inflight` e dispara um fetch novo); o fetch novo resolve primeiro com o dado pós-mutação; o fetch ANTIGO resolve depois e sobrescreve o cache com o estado pré-mutação. Um remount posterior semeia o estado otimista a partir desse cache podre. Raro, mas o dado envolvido é o estado da sessão de ponto — o coração do app. Correção clássica: contador de geração por chave; só a última requisição grava.

## Current state

- `src/hooks/use-supabase-query.ts` (95 linhas). Pontos relevantes:
  - Cache de módulo (linha 13): `const store = new Map<string, Entry<unknown>>()`.
  - `load()` (linhas 46–71): reusa `entry.inflight` se existir, senão chama o fetcher; no `.then`, grava `store.set(key, { data: result })` e `setData(result)` **sem verificar se ainda é a requisição mais recente**; no `.catch` idem para erro.
  - `refetch()` (linhas 88–92): `store.set(key, { ...entry, inflight: undefined })` e `load()` — cria a corrida com um fetch anterior ainda pendente.
  - Revalidação em `focus`/`online` (linhas 76–80).
- Testes existentes: `src/hooks/__tests__/use-supabase-query.test.ts` — use como padrão estrutural (renderHook do @testing-library/react etc.).
- Restrição de design: o hook é deliberadamente minimalista ("no extra dependency", comentário nas linhas 26–32). A correção deve manter essa pegada — um `Map<string, number>` de gerações, nada de AbortController/cancelamento (fora do escopo).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Testes do hook | `npm test -- use-supabase-query` | exit 0 |
| Suíte completa | `npm test` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/hooks/use-supabase-query.ts`
- `src/hooks/__tests__/use-supabase-query.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- Trocar o hook por SWR/TanStack Query — decisão de dependência já tomada em contrário (comentário no próprio arquivo).
- Cancelamento de requisições (AbortController) — a fetch antiga pode completar; só não pode GRAVAR.
- Os call sites (`dashboard-client.tsx` etc.) — o contrato do hook não muda.

## Git workflow

- Branch: `advisor/012-use-supabase-query-stale-guard`
- Commit: `fix(swr): resposta obsoleta não sobrescreve dado mais novo no cache`
- Não faça push nem abra PR sem instrução explícita do operador.

## Steps

### Step 1: Contador de geração por chave

Em `src/hooks/use-supabase-query.ts`:

1. Ao lado do `store` (linha 13), adicione: `const generations = new Map<string, number>()` e limpe-o também em `clearClientQueryCache()`.
2. Em `load()`, antes de disparar/reusar a promise: `const gen = (generations.get(key) ?? 0) + 1; generations.set(key, gen)`.
3. No `.then`: só execute `store.set(key, { data: result })` **e** os `set*` locais `if (generations.get(key) === gen)`. Caso contrário, não faça nada (uma requisição mais nova já gravou ou vai gravar).
4. No `.catch`: mesmo guard para gravar o erro.

Comentário curto no estilo do arquivo explicando a restrição (resposta fora de ordem não pode sobrescrever — cite o cenário focus-revalidate × refetch pós-mutação).

Nota: quando `load()` REUSA um `inflight` existente (dedupe), o incremento de geração faz o `.then` recém-anexado ser o "dono" da gravação — o `.then` da chamada original (geração anterior) deixa de gravar, mas o resultado é o mesmo objeto da mesma promise, então a gravação única é equivalente. Não "otimize" isso.

**Verify**: `npx tsc --noEmit` → exit 0; `npm test -- use-supabase-query` → testes existentes continuam verdes.

### Step 2: Teste de regressão da corrida

Em `src/hooks/__tests__/use-supabase-query.test.ts`, novo caso "resposta antiga não sobrescreve a mais nova":

1. Crie dois deferreds manuais (`let resolveA!: (v: string) => void; const a = new Promise<string>(r => { resolveA = r })`, idem B).
2. Fetcher mock que devolve `a` na 1ª chamada e `b` na 2ª.
3. `renderHook` com uma chave única; aguarde o 1º load ficar em voo; chame `result.current.refetch()` (2ª chamada, promise B).
4. Resolva **B primeiro** (`resolveB('novo')`, flush com `await waitFor`), depois **A** (`resolveA('velho')`, flush).
5. Afirme `result.current.data === 'novo'` e que um remount da mesma chave também vê `'novo'` (cache de módulo não foi sobrescrito).

**Verify**: `npm test -- use-supabase-query` → novo caso passa; sem o Step 1 ele DEVE falhar (valide revertendo o guard localmente se quiser confirmar o vermelho).

### Step 3: Suíte completa

`npm test && npx tsc --noEmit`

**Verify**: exit 0 nos dois.

## Test plan

Ver Step 2 (caso de corrida com deferreds fora de ordem) + os testes existentes do hook intactos. Verificação: suíte inteira verde.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n generations src/hooks/use-supabase-query.ts` → presente em load, catch e clearClientQueryCache
- [ ] Novo teste de corrida existe e passa; suíte `npm test` sai 0
- [ ] `npx tsc --noEmit` sai 0
- [ ] `git status` limpo fora do in-scope
- [ ] Linha do plano 012 atualizada em `plans/README.md`

## STOP conditions

Stop and report back (do not improvise) if:

- Os testes existentes do hook quebrarem com o guard — há dependência de gravação dupla que este plano não previu; reporte qual teste.
- O comportamento do dedupe (`entry.inflight`) divergir do descrito no arquivo (drift).

## Maintenance notes

- Se um dia o hook ganhar cancelamento (AbortController), o contador de geração continua necessário (cancelamento não cobre respostas já em trânsito).
- Reviewer: o ponto sutil é o guard TAMBÉM no `.catch` — um erro velho não pode apagar um dado novo.
