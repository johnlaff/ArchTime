<div align="center">

# ⏱️ ArchTime

**Controle de horas _mobile-first_ e _offline-first_ para arquitetos e freelancers.**
Fuso `America/Sao_Paulo`, banco de horas, projetos com cores e integridade criptográfica dos registros.

[![CI](https://github.com/johnlaff/ArchTime/actions/workflows/ci.yml/badge.svg)](https://github.com/johnlaff/ArchTime/actions/workflows/ci.yml)
[![build-image](https://github.com/johnlaff/ArchTime/actions/workflows/build-image.yml/badge.svg)](https://github.com/johnlaff/ArchTime/actions/workflows/build-image.yml)

![Next.js](https://img.shields.io/badge/Next.js_16-000?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232a?style=flat-square&logo=react&logoColor=61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript_strict-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma_7-2d3748?style=flat-square&logo=prisma&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ecf8e?style=flat-square&logo=supabase&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_4-0b1120?style=flat-square&logo=tailwindcss&logoColor=38bdf8)
![Azure](https://img.shields.io/badge/Azure_App_Service-0078d4?style=flat-square&logo=microsoftazure&logoColor=white)

**Produção · [archtime.app](https://archtime.app)**

</div>

---

O ArchTime registra o ponto de quem trabalha por projeto: começa e encerra sessões, distribui o
tempo entre projetos, e devolve **quanto você já fez** e **quanto ainda falta** contra a jornada
esperada. É um PWA instalável, pensado para o celular em primeiro lugar e para funcionar **mesmo
sem rede** — o registro entra numa fila local e sincroniza sozinho quando a conexão volta.

> [!NOTE]
> Todo o produto é em português e ancorado no fuso `America/Sao_Paulo`: a virada do dia, a jornada
> semanal e o banco de horas são calculados no horário de Brasília, não em UTC.

## Recursos

| | Recurso | O que faz |
|---|---|---|
| ⏲️ | **Ponto online/offline** | Inicia e encerra sessões; offline, o registro vai para uma **fila em IndexedDB** e sincroniza ao reconectar. |
| 🏦 | **Banco de horas** | Saldo acumulado (feito × esperado) por dia, semana e mês, com escopos configuráveis (ano corrente, janelas móveis, desde o início). |
| 🎨 | **Projetos com cores** | Cada sessão é alocada a um projeto; cores dão leitura visual imediata no histórico e nos gráficos. |
| 📊 | **Insights** | Heatmap anual e barras semanais **relativos à jornada** — enxerga padrões de esforço, não só totais brutos. |
| 🗂️ | **Histórico auditável** | Edição de registros com trilha de auditoria; filtros por projeto e atividade sem deslocar a UI. |
| 🔐 | **Integridade dos registros** | Cada sessão fechada carrega um **HMAC-SHA256** com `keyId`; `/api/integrity` distingue formato inválido, adulteração e uma chave histórica indisponível. |
| 📲 | **PWA instalável** | Service worker (Serwist), ícone/manifest e experiência de app nativo no celular. |

## Arquitetura

<div align="center">

![Arquitetura do ArchTime](docs/assets/architecture.svg)

</div>

| Camada | Stack |
|---|---|
| **Cliente** | PWA · React 19 · Serwist (service worker) · IndexedDB (`idb`) · Tailwind 4 + shadcn/ui + Radix |
| **Servidor** | Next.js 16 App Router · `output: standalone` + PPR · API Routes · Prisma 7 (query compiler **WASM**) |
| **Dados** | Supabase PostgreSQL (`sa-east-1`) · Supabase Auth (Google OAuth) |
| **Infra** | Azure App Service (container Linux, Brazil South) · `ghcr.io` · GitHub Actions |

Princípio central: **toda escrita passa por uma API Route** — nenhum Client Component escreve
direto no banco. O modelo de confiança de origem (CSRF via header `Host`/`Origin`) está detalhado
em [`docs/adr/0004`](docs/adr/).

## Rodando localmente

```bash
cp .env.local.example .env.local   # preencha Supabase, DATABASE_URL/DIRECT_URL, ALLOWED_EMAILS, ENTRY_HASH_SECRET
npm ci
npx prisma migrate deploy          # monta o schema (Supabase novo: veja docs/supabase-security-checklist.md)
npx prisma generate
npm run dev                        # http://localhost:3000
```

> [!TIP]
> `ENTRY_HASH_SECRET` é o fallback legado do HMAC de integridade — gere com `openssl rand -hex 32` (32 bytes /
> 64 hex). Em produção, configure o keyring descrito em [ADR 0005](docs/adr/0005-keyed-entry-hash-rotation.md)
> para permitir rotação sem re-hash. Toda a configuração é validada no **boot** (`src/instrumentation.ts`):
> ausente, parcial ou mal formatada **falha o start** do container, em vez de quebrar no primeiro clock-out.

## Verificação

```bash
npm test            # Vitest (unit)
npx tsc --noEmit    # tipos
npm run lint        # Biome
npm run build       # build de produção
npx react-doctor@latest --no-telemetry   # regras de hooks/estado/efeitos (zerado é o padrão)
```

Para revisar a **UI** de um branch em fidelidade de produção, sem depender de preview hospedado:

```bash
npm run preview     # builda a imagem do container e sobe em http://localhost:8080
```

## Estrutura do projeto

```
src/
├─ app/                 # rotas (App Router)
│  ├─ api/              # API Routes — única porta de escrita no banco
│  ├─ dashboard/        # ponto do dia, sessão ativa, banco de horas
│  ├─ historico/        # registros + edição auditada + insights
│  ├─ projetos/         # CRUD de projetos com cores
│  └─ configuracoes/    # preferências, jornada, escopo do saldo
├─ lib/                 # domínio: dates (BRT), hash (HMAC), hour-bank, prisma…
├─ components/          # UI (shadcn/ui + Radix)
├─ hooks/               # estado de cliente (ponto, sync offline)
└─ instrumentation.ts   # validação de config no boot (fail-fast)
```

## Deploy

Produção em **Azure App Service** (container Linux B1, Brazil South), servida em
**[archtime.app](https://archtime.app)** (TLS gerenciado; `www` → apex). A imagem é publicada no
**GitHub Container Registry** (`ghcr.io/johnlaff/archtime`) pelo workflow `build-image` a cada push
na `main`, e o App Service faz o pull automático via **webhook** de continuous deployment.

> [!IMPORTANT]
> O banco (Supabase) é **compartilhado entre ambientes** — cuidado com dados reais ao validar
> mudanças. Veja [`docs/adr/0004`](docs/adr/) (confiança de origem) e [`docs/adr/0003`](docs/adr/).

## Documentação canônica

- [`AGENTS.md`](AGENTS.md) — instruções para agentes e contribuidores
- [`CONTEXT.md`](CONTEXT.md) — glossário de domínio
- [`docs/adr/`](docs/adr/) — registros de decisão de arquitetura
