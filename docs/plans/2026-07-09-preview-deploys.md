# Preview deploys — estratégia (2026-07-09)

**Contexto:** produção migrou para Azure App Service (container, Brazil South, `archtime.app`).
A Netlify dava preview por PR de graça; no stack containerizado isso não é nativo. Este doc
registra a decisão e o design do preview hospedado (consultoria: GPT-5.6 Terra), pra executar
quando fizer sentido.

## Decisão atual: preview **local** primeiro (YAGNI para 2 usuários)

Com 2 usuários reais e PRs revisados por 1–2 pessoas, o ROI de infra efêmera por PR não se paga
ainda. O gate de correção já é o CI `verify` (tsc/test/lint/react-doctor/build); para revisar a
**UI** de um PR, o preview local com container é fiel e custa zero:

```bash
npm run preview   # builda a imagem do branch atual e sobe em http://localhost:8080
```

O script (`scripts/preview-local.sh`) encapsula o detalhe não-óbvio de que os `NEXT_PUBLIC_*` são
inlinados em build time (build-args) enquanto os segredos de runtime entram via `--env-file`.

## Design do preview **hospedado** (pronto pra executar quando o time crescer)

Recomendação do Terra + síntese. Só ligar quando a colaboração justificar o custo de manutenção.

- **Hospedagem: Azure Container Apps** (não F1/ACI). Dá HTTPS nativo em `*.azurecontainerapps.io`
  (sem DNS nem cert por PR), **scale-to-zero** (idle = R$0, dentro do free grant mensal da
  subscription) e host estável por app — que satisfaz o requisito de que **cada preview tenha seu
  `NEXT_PUBLIC_APP_URL` exato** (senão quebra callback OAuth + CSRF, ver `docs/adr/0004` e
  `src/lib/app-origin.ts`).
- **Banco: projeto Supabase Free dedicado a preview**, com **dados sintéticos** — nunca produção.
  PRs de schema não aplicam migrations nesse banco automaticamente; migration é validada isolada no
  CI. Isolamento total por PR exigiria Supabase Branching (pago) → fora do orçamento.
- **OAuth de N previews:** um único wildcard `https://*.azurecontainerapps.io/**` na allow-list do
  **projeto de preview** (não no de produção) cobre todas as URLs efêmeras.
- **Ciclo de vida (GitHub Actions):**
  - `pull_request` (opened/synchronize) → build da imagem (tag por PR) → `az containerapp create/update`
    com `NEXT_PUBLIC_APP_URL` = a URL do app → comenta a URL no PR.
  - `pull_request` (closed) → `az containerapp delete` (teardown).
  - Segredos de runtime do preview (DATABASE_URL do projeto de preview etc.) como secrets do repo.

**Trade-off honesto:** ganha-se URL compartilhável por PR; paga-se com um projeto Supabase extra +
um Container Apps environment + manutenção do seed sintético. Reavaliar quando houver >2 colaboradores.
