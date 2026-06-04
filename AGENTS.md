# AGENTS.md

Instrucoes para agentes trabalhando neste repositorio com OpenCode ou outras CLIs de IA.

## Comunicacao

- Responda sempre em portugues brasileiro.
- Seja direto, tecnico e pragmatico.
- Se encontrar erro em `test`, `typecheck`, `lint` ou `build`, corrija antes de declarar a tarefa concluida, mesmo que o erro pareca pre-existente.
- Nao poste comentarios em PRs nem faca push sem autorizacao explicita do usuario.

## Projeto

ArchTime e uma PWA mobile-first em portugues para controle de horas de arquitetos e freelancers.

Objetivos do produto:

- controle de ponto online/offline;
- banco de horas;
- projetos com cores;
- fluxo adaptado ao Brasil e timezone `America/Sao_Paulo`.

Stack principal:

- Next.js App Router;
- React;
- TypeScript strict;
- Prisma 7;
- Supabase PostgreSQL;
- Tailwind CSS 4;
- shadcn/ui, Radix e lucide-react;
- Serwist PWA;
- IndexedDB via `idb`;
- Vitest;
- Playwright.

## Comandos

Use a raiz do repositorio para os comandos.

```bash
npm run dev
npm run build
npm test
npm run test:watch
npm run test:e2e
npx prisma generate
npx prisma db push
npx prisma studio
```

Observacoes:

- `npm run build` usa webpack por compatibilidade com Serwist/Next.
- `prisma db push` depende de `DIRECT_URL` e deve ser usado com cuidado.
- Nunca assuma que `.env.local` existe em clones novos; consulte `.env.local.example`.

## Arquitetura

- Todas as escritas devem passar por API Routes. Nao escreva direto no banco a partir de Client Components.
- Escritas relevantes devem preservar auditoria em `AuditLog`.
- Clock-out calcula hash SHA-256 da entrada.
- Leituras simples podem usar Supabase client com RLS.
- Agregacoes, joins e logica sensivel devem usar API Route com Prisma.
- `src/app/layout.tsx` e Server Component.
- Providers client-side ficam em `src/components/providers.tsx`.
- Fluxo offline fica em `src/lib/offline-queue.ts` e sincroniza via `POST /api/sync`.
- Fila offline deve ser ordenada cronologicamente antes do flush.
- Assets PWA como `/_next/*`, `/icons/*`, `/manifest.json` e `/sw.js` nao devem ser bloqueados por auth.

## Datas E Timezone

- Timestamps persistidos devem ser UTC.
- Exibicao deve passar por helpers que convertam para `America/Sao_Paulo`.
- Nao use `new Date('YYYY-MM-DD')` sem componente de horario.
- Preserve a semantica de BRT em relatorios, historico e banco de horas.

## Prisma E Supabase

- URLs de conexao nao ficam em `prisma/schema.prisma`.
- `prisma.config.ts` carrega `.env.local` e usa `DIRECT_URL` para CLI/migrations.
- Runtime usa `@prisma/adapter-pg` com `DATABASE_URL`.
- Antes de alterar migrations, RLS ou policies, leia o historico completo em `prisma/migrations`.
- Feedback automatico de review sobre RLS/policies deve ser tratado como hipotese, nao verdade.

## Producao E Dados Reais

O ambiente de producao pode conter usuarios reais e dados ativos.

Regras duras:

- Nunca apagar ou alterar `clock_entries` em producao sem confirmar explicitamente o `user_id` afetado.
- Nunca fazer limpeza manual com filtro amplo.
- Nao assuma que uma sessao aberta e resíduo de teste.
- Em caso de duvida, pare e pergunte ao usuario antes de executar qualquer escrita destrutiva.
- `hour_bank` e cache derivado; evite cirurgias manuais sem necessidade clara.

## Infraestrutura E Performance

- Deploy em Netlify.
- Banco em Supabase PostgreSQL.
- Ha latencia relevante entre funcoes serverless e banco; evite colocar reads simples no caminho critico de navegacao quando client-direct com RLS for suficiente.
- Cold starts podem afetar navegacao. Prefira cache, lazy loading, code splitting e leituras client-direct quando seguro.
- Performance de navegacao nao pode degradar.
- Para bibliotecas pesadas, prefira lazy-load/code-split em vez de reimplementar tudo custom por reflexo.

## Design System

- Use OKLCH nos tokens de cor.
- Presets e accents sao aplicados via atributos `data-accent` e `data-preset`.
- Emerald para clock-in, Rose para clock-out e Amber para warning sao cores semanticas e nao devem mudar com accent.
- Para superficies neutras que nao devem herdar accent, prefira tokens neutros como `--secondary` e `--card` conforme o contexto.
- Evite usar `--muted`, `--input` ou `--accent` para controles que precisam permanecer neutros sob custom accent.
- Ao modificar UI, mantenha consistencia com o design system documentado em `docs/` e com `CONTEXT.md`.

## Bibliotecas E UI

- Preferir bibliotecas mantidas, idiomaticas e padrao de mercado quando forem adequadas.
- Para componentes, priorize shadcn/Radix e padroes ja adotados no projeto.
- Para graficos, preferir Recharts/shadcn chart quando couber.
- Para command palette, preferir `cmdk`.
- Solucoes custom devem ter justificativa concreta de engenharia, nao apenas bundle menor.

## Testes E E2E

- Testes unitarios usam Vitest.
- E2E usa Playwright.
- Para paginas autenticadas, o projeto possui setup proprio em `e2e/` para gerar sessao de teste sem login manual quando variaveis necessarias existem.
- Screenshots autenticados podem ser gerados via specs Playwright existentes.
- PWA/service worker pode servir bundle antigo; ao orientar teste manual de preview, recomende janela anonima.

## PRs, Reviews E Deploy Preview

- Antes de comentar em PR, verifique comentarios e reviews existentes para nao duplicar achados.
- Reviews automaticos como Copilot podem gerar falsos positivos; confirme contra contexto e historico completo antes de tratar como bug.
- Se atualizar um PR, monitore o deploy preview da Netlify ate concluir e confirme ausencia de erro antes de dizer que esta pronto.
- Producao acompanha `main`; PR preview usa URL de deploy preview. Nao confunda os dois ao orientar validacao.

## Regras De Git

- Nao fazer commit, push, amend ou PR sem pedido explicito.
- Antes de commit, revisar `git status`, `git diff` e `git log --oneline -10`.
- Nao reverter mudancas do usuario sem autorizacao.
- Nunca commitar segredos, `.env.local`, tokens, dumps ou screenshots sensiveis.

## Arquivos De Contexto

Leia quando relevante:

- `CONTEXT.md` para vocabulario de dominio.
- `docs/adr/` para decisoes arquiteturais.
- `docs/superpowers/` para specs/planos historicos.
- `README.md` para visao geral.
- `.env.local.example` para variaveis esperadas.
