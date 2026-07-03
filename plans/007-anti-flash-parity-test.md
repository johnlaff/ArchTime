# Plan 007: Teste de paridade entre o script anti-flash inline e custom-color.ts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e52a5ad..HEAD -- src/app/layout.tsx src/lib/custom-color.ts src/lib/__tests__/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `e52a5ad`, 2026-07-03

## Why this matters

O script anti-flash de `src/app/layout.tsx` (linhas 62–130) reimplementa em JS-string, à mão, a mesma matemática de cor de `src/lib/custom-color.ts` — `norm/rgb/mix/lum/contrast/fg/outline` e os mesmos thresholds mágicos (0.78, 0.18, 0.12, 0.88, 0.06, 0.94, 0.72, 0.82, 1.5). É uma exigência real (o script precisa rodar síncrono antes da hidratação; `next/script` executa tarde demais — o comentário no arquivo documenta isso), mas hoje **nada força as duas cópias a concordarem**: um ajuste futuro no theming feito só em um lado produz um flash/divergência de cor entre o shell SSR e o React hidratado — exatamente o bug que o script existe para evitar. Este plano NÃO muda produção: adiciona um teste executável que roda o IIFE de verdade e compara os tokens resultantes com `getCustomAccentTokens`, fazendo a divergência falhar em `npm test` (e no CI do plano 001) em vez de ir para produção.

## Current state

- `src/app/layout.tsx:62-130` — `<script dangerouslySetInnerHTML={{ __html: \`(function(){...})()\` }}>`. O IIFE:
  - lê `localStorage.getItem('archtime-accent')` e seta `data-accent`;
  - se `custom`: lê `archtime-accent-custom`, calcula e seta 9 propriedades CSS no `documentElement.style`: `--custom-accent-hex`, `--custom-accent-foreground`, `--custom-accent-border`, `--custom-accent-soft-light`, `--custom-accent-soft-foreground-light`, `--custom-accent-muted-light`, `--custom-accent-soft-dark`, `--custom-accent-soft-foreground-dark`, `--custom-accent-muted-dark`;
  - também aplica `data-preset`, `data-density` e `data-blueprint` (fora do escopo da paridade de cor).
- `src/lib/custom-color.ts:108-135` — `getCustomAccentTokens(hex)` devolve o objeto tipado com os mesmos 9 valores (nomes: `primary`, `primaryForeground`, `primaryBorder`, `accentLight`, `accentForegroundLight`, `mutedLight`, `accentDark`, `accentForegroundDark`, `mutedDark`).
- Correspondência propriedade CSS ↔ token:

| CSS custom property | Token de getCustomAccentTokens |
|---|---|
| `--custom-accent-hex` | `primary` |
| `--custom-accent-foreground` | `primaryForeground` |
| `--custom-accent-border` | `primaryBorder` |
| `--custom-accent-soft-light` | `accentLight` |
| `--custom-accent-soft-foreground-light` | `accentForegroundLight` |
| `--custom-accent-muted-light` | `mutedLight` |
| `--custom-accent-soft-dark` | `accentDark` |
| `--custom-accent-soft-foreground-dark` | `accentForegroundDark` |
| `--custom-accent-muted-dark` | `mutedDark` |

- Ambiente de teste: Vitest + happy-dom (tem `document`, `localStorage`). Testes de lib ficam em `src/lib/__tests__/` (ex.: `browser-accent.test.ts`).
- Nuance de arredondamento: o IIFE usa `Math.round` no `mix` e `hexToRgb`/`rgbToHex` do TS idem — os resultados devem ser **idênticos byte a byte**; se não forem, é exatamente a divergência que o teste existe para pegar.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Teste novo | `npm test -- anti-flash-parity` | exit 0 |
| Suíte completa | `npm test` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/lib/__tests__/anti-flash-parity.test.ts` (criar)

**Out of scope** (do NOT touch, even though they look related):
- `src/app/layout.tsx` — NÃO refatore o script inline (a alternativa codegen foi avaliada e adiada; ver Maintenance notes).
- `src/lib/custom-color.ts` — fonte de verdade, não muda.

## Git workflow

- Branch: `advisor/007-anti-flash-parity-test`
- Commit: `test(theme): paridade executável entre script anti-flash e custom-color.ts`
- Não faça push nem abra PR sem instrução explícita do operador.

## Steps

### Step 1: Escrever o teste de paridade

Crie `src/lib/__tests__/anti-flash-parity.test.ts`:

1. **Extrair o IIFE do source**: leia `src/app/layout.tsx` com `readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8')` (mesmo padrão de `src/lib/__tests__/review-feedback-source.test.ts:5-7`) e capture o script com uma regex sobre o template literal: `/__html: `([\s\S]*?)`,?\s*\}\}/` → grupo 1. Falhe com mensagem clara se não casar (drift do layout).
2. **Executar por cor**: para cada hex de uma matriz de ~10 cores cobrindo os ramos dos thresholds — sugestão: `['#6366f1', '#f43f5e', '#2d7a4f', '#ffffff', '#fefefe', '#000000', '#0a0a0a', '#ffff00', '#3b82f6', '#abc']` (inclua o shorthand `#abc` para exercitar o norm) — faça em cada iteração:
   - `localStorage.clear()`; `localStorage.setItem('archtime-accent', 'custom')`; `localStorage.setItem('archtime-accent-custom', hex)`;
   - limpe as propriedades: `document.documentElement.removeAttribute('style')`;
   - execute o script: `new Function(script)()` (o IIFE se auto-invoca; `new Function` evita eval direto e roda no escopo global do happy-dom);
   - leia cada uma das 9 propriedades com `document.documentElement.style.getPropertyValue('--custom-accent-...')`.
3. **Comparar**: `const tokens = getCustomAccentTokens(hex)` (import real de `@/lib/custom-color`) e `expect` de igualdade **exata** para cada par da tabela do "Current state". Use `test.each` ou um loop com `expect(...).toBe(...)` incluindo o nome da propriedade e o hex na mensagem para diagnóstico.
4. **data-accent**: afirme também `document.documentElement.getAttribute('data-accent') === 'custom'`.

**Verify**: `npm test -- anti-flash-parity` → 10 casos (ou 1 caso com 10 iterações) passando.

### Step 2: Suíte completa

`npm test && npx tsc --noEmit`

**Verify**: exit 0 nos dois.

## Test plan

O plano É o teste. Cobertura: 10 cores × 9 propriedades + atributo, incluindo os ramos `lum > 0.78` (cores claras), `lum < 0.18` (escuras), contraste < 1.5 com branco e com `#111827` (outline), e normalização de shorthand de 3 dígitos.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `src/lib/__tests__/anti-flash-parity.test.ts` existe e `npm test` sai 0
- [ ] O teste falha se qualquer threshold do IIFE for alterado sozinho (auto-verificável: mude `0.78` para `0.79` no layout.tsx localmente, rode o teste — deve FALHAR — e desfaça)
- [ ] `git status` limpo fora do in-scope
- [ ] Linha do plano 007 atualizada em `plans/README.md`

## STOP conditions

Stop and report back (do not improvise) if:

- O teste revelar que as duas implementações JÁ divergem para alguma cor da matriz — isso é um bug real de produção; reporte a cor e os dois valores, NÃO "conserte" ajustando a matriz.
- `new Function(script)()` falhar no happy-dom por API ausente (ex.: algo além de localStorage/documentElement) — reporte a API; não polyfille silenciosamente.

## Maintenance notes

- **Alternativa adiada**: gerar o IIFE por codegen a partir de `custom-color.ts` no build eliminaria a duplicação na origem, mas toca o wiring do build/layout (o script precisa continuar string síncrona) — só vale se a matemática começar a mudar com frequência. O teste dá 90% do valor por 10% do custo.
- Quem alterar QUALQUER threshold/fórmula de cor: mude nos DOIS arquivos; o teste aponta qual propriedade divergiu.
