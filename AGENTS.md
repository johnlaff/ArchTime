# AGENTS.md

Instruções para agentes trabalhando neste repositório com OpenCode ou outras CLIs de IA.

## Comunicação

- Responda sempre em português brasileiro.
- Seja direto, técnico e pragmático.
- Se encontrar erro em `test`, `typecheck`, `lint` ou `build`, corrija antes de declarar a tarefa concluída, mesmo que o erro pareça pré-existente.
- Não poste comentários em PRs nem faça push sem autorização explícita do usuário.

## Projeto

ArchTime é uma PWA mobile-first em português para controle de horas de arquitetos e freelancers.

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

Use a raiz do repositório para os comandos.

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

Observações:

- `npm run build` usa webpack por compatibilidade com Serwist/Next.
- `prisma db push` depende de `DIRECT_URL` e deve ser usado com cuidado.
- Nunca assuma que `.env.local` existe em clones novos; consulte `.env.local.example`.

## Arquitetura

- Todas as escritas devem passar por API Routes. Não escreva direto no banco a partir de Client Components.
- Escritas relevantes devem preservar auditoria em `AuditLog`.
- Clock-out calcula hash SHA-256 da entrada.
- Leituras simples podem usar Supabase client com RLS.
- Agregações, joins e lógica sensível devem usar API Route com Prisma.
- `src/app/layout.tsx` é Server Component.
- Providers client-side ficam em `src/components/providers.tsx`.
- Fluxo offline fica em `src/lib/offline-queue.ts` e sincroniza via `POST /api/sync`.
- Fila offline deve ser ordenada cronologicamente antes do flush.
- Assets PWA como `/_next/*`, `/icons/*`, `/manifest.json` e `/sw.js` não devem ser bloqueados por auth.

## Datas e Timezone

- Timestamps persistidos devem ser UTC.
- Exibição deve passar por helpers que convertam para `America/Sao_Paulo`.
- Não use `new Date('YYYY-MM-DD')` sem componente de horário.
- Preserve a semântica de BRT em relatórios, histórico e banco de horas.

## Prisma e Supabase

- URLs de conexão não ficam em `prisma/schema.prisma`.
- `prisma.config.ts` carrega `.env.local` e usa `DIRECT_URL` para CLI/migrations.
- Runtime usa `@prisma/adapter-pg` com `DATABASE_URL`.
- Antes de alterar migrations, RLS ou policies, leia o histórico completo em `prisma/migrations`.
- Feedback automático de review sobre RLS/policies deve ser tratado como hipótese, não verdade.

## Produção e Dados Reais

O ambiente de produção pode conter usuários reais e dados ativos.

Regras duras:

- Nunca apagar ou alterar `clock_entries` em produção sem confirmar explicitamente o `user_id` afetado.
- Nunca fazer limpeza manual com filtro amplo.
- Não assuma que uma sessão aberta é resíduo de teste.
- Em caso de dúvida, pare e pergunte ao usuário antes de executar qualquer escrita destrutiva.
- `hour_bank` é cache derivado; evite cirurgias manuais sem necessidade clara.

## Infraestrutura e Performance

- Deploy em **Azure App Service** (container Linux B1, região Brazil South); produção em `https://archtime.app`. Imagem em `ghcr.io/johnlaff/archtime`, publicada pelo workflow `build-image` (push na `main`) e puxada pelo App Service via webhook de continuous deployment.
- Banco em Supabase PostgreSQL (`sa-east-1`/São Paulo — mesma região do App Service, latência app↔banco baixa).
- Há latência relevante entre funções serverless e banco; evite colocar reads simples no caminho crítico de navegação quando client-direct com RLS for suficiente.
- Cold starts podem afetar navegação. Prefira cache, lazy loading, code splitting e leituras client-direct quando seguro.
- Performance de navegação não pode degradar.
- Para bibliotecas pesadas, prefira lazy-load/code-split em vez de reimplementar tudo custom por reflexo.

## Design System

- Use OKLCH nos tokens de cor.
- Presets e accents são aplicados via atributos `data-accent` e `data-preset`.
- Emerald para clock-in, Rose para clock-out e Amber para warning são cores semânticas e não devem mudar com accent.
- Para superfícies neutras que não devem herdar accent, prefira tokens neutros como `--secondary` e `--card` conforme o contexto.
- Evite usar `--muted`, `--input` ou `--accent` para controles que precisam permanecer neutros sob custom accent.
- Ao modificar UI, mantenha consistência com o design system documentado em `docs/` e com `CONTEXT.md`.

## Bibliotecas e UI

- Preferir bibliotecas mantidas, idiomáticas e padrão de mercado quando forem adequadas.
- Para componentes, priorize shadcn/Radix e padrões já adotados no projeto.
- Para gráficos, preferir Recharts/shadcn chart quando couber.
- Para command palette, preferir `cmdk`.
- Soluções custom devem ter justificativa concreta de engenharia, não apenas bundle menor.

## Testes e E2E

- Testes unitários usam Vitest.
- E2E usa Playwright.
- Para páginas autenticadas, o projeto possui setup próprio em `e2e/` para gerar sessão de teste sem login manual quando variáveis necessárias existem.
- Screenshots autenticados podem ser gerados via specs Playwright existentes.
- PWA/service worker pode servir bundle antigo; ao orientar teste manual de preview, recomende janela anônima.

## PRs, Reviews e Deploy Preview

- Antes de comentar em PR, verifique comentários e reviews existentes para não duplicar achados.
- Reviews automáticos como Copilot podem gerar falsos positivos; confirme contra contexto e histórico completo antes de tratar como bug.
- Todo PR roda o job `verify` (GitHub Actions: tsc, testes, lint, react-doctor, build) — é o gate obrigatório da branch protection. Monitore-o até concluir e confirme verde antes de dizer que está pronto.
- Produção (`https://archtime.app`) acompanha `main` via CD (workflow `build-image` → `ghcr.io` → webhook do App Service). Para revisar a UI de um PR antes do merge, use preview local com container (`docker run` da imagem buildada); não confunda o preview local com a produção ao orientar validação.

## Regras de Git

- Não fazer commit, push, amend ou PR sem pedido explícito.
- Antes de commit, revisar `git status`, `git diff` e `git log --oneline -10`.
- Não reverter mudanças do usuário sem autorização.
- Nunca commitar segredos, `.env.local`, tokens, dumps ou screenshots sensíveis.

## Arquivos de Contexto

Leia quando relevante:

- `CONTEXT.md` para vocabulário de domínio.
- `docs/adr/` para decisões arquiteturais.
- `docs/superpowers/` para specs/planos históricos.
- `README.md` para visão geral.
- `.env.local.example` para variáveis esperadas.
