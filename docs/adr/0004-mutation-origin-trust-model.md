# ADR 0004 — Modelo de confiança do `validateMutationOrigin` (CSRF)

**Data:** 2026-07-09 · **Status:** Aceito

## Contexto

`validateMutationOrigin` (`src/lib/server/security.ts`) é o guard de CSRF das rotas
state-changing (POST/PUT/PATCH/DELETE de clock, projects, sync, settings). Ele decide se uma
mutação vem de uma origem confiável comparando o `Origin`/`Referer` do request contra um conjunto
permitido: `NEXT_PUBLIC_APP_URL`, previews reconhecidos do Netlify
(`deploy-preview-NN--appHost.netlify.app`) e, historicamente, `req.nextUrl.origin`
**incondicionalmente**.

`req.nextUrl.origin` é derivado do header `Host` da request. No Netlify, o edge controla o `Host`
(roteamento por Host), então um `Host` forjado não roteia para o deployment do ArchTime — o risco
era mitigado por infra, não por código. Mas confiar em `req.nextUrl.origin` sem condição é
defesa-em-profundidade frágil e acoplada à plataforma: um proxy reverso mal configurado, um
self-host, ou um path interno do Next que herde `Host` não-saneado permitiria a um atacante enviar
`Host: evil.com` + `Origin: https://evil.com` e passar no check de CSRF.

## Decisão

Condicionar a confiança em `req.nextUrl.origin`: ele só entra no conjunto permitido quando

- casa com `NEXT_PUBLIC_APP_URL`; **ou**
- é um origin local (`localhost`/`127.0.0.1`/`::1`) **e** `NODE_ENV !== 'production'` (dev).

Em produção, se `req.nextUrl.origin` diverge de `NEXT_PUBLIC_APP_URL`, ele **não** é confiado
sozinho — o request precisa apresentar `Origin`/`Referer` que case com `NEXT_PUBLIC_APP_URL` ou com
um preview reconhecido (`isSameNetlifySitePreview`).

A premissa que o código passa a assumir explicitamente: **em produção, a infra sanea o `Host`** (o
Netlify o faz no edge). Mudar de plataforma exige revalidar essa premissa.

## Consequências

- **+** Defesa-em-profundidade portável: um `Host` spoofado deixa de ser suficiente para passar no
  check de CSRF, independentemente da plataforma.
- **+** Tráfego legítimo não muda: em produção estável o `Host` casa com `NEXT_PUBLIC_APP_URL`;
  previews validam pelo `Origin` do request via `isSameNetlifySitePreview`.
- **−** Perde-se o fallback automático de `req.nextUrl.origin`: um request em produção sem
  `Origin`/`Referer` cujo `Host` difere de `NEXT_PUBLIC_APP_URL` agora é rejeitado (antes passava).
  Previews sem `NEXT_PUBLIC_APP_URL` setado dependem de `isSameNetlifySitePreview` para validar o
  `Origin` — que já cobre o padrão `deploy-preview-NN--appHost`.
- `NEXT_PUBLIC_APP_URL` precisa estar setado por ambiente (produção e previews). Se previews usam
  URLs dinâmicas, garantir que `isSameNetlifySitePreview` cobre todos os padrões, ou setar
  `NEXT_PUBLIC_APP_URL` dinamicamente.

Alternativa rejeitada: manter `req.nextUrl.origin` incondicional confiando que o Netlify sempre
sanea o `Host`. Mais simples, mas acopla a segurança de CSRF à plataforma sem aviso — se o app
migrar (Vercel, self-host, container), o CSRF enfraquece silenciosamente.

## Atualização (2026-07-09) — migração Netlify → Azure App Service

Este ADR previa: *"Mudar de plataforma exige revalidar essa premissa."* A produção migrou da
Netlify para **Azure App Service** (container Linux B1, Brazil South), servida em
`https://archtime.app`. A premissa de que **a infra saneia o `Host`** foi **revalidada
empiricamente**: o front-end do App Service roteia por hostname e **rejeita `Host`
não-configurado**. Verificação — request com SNI válido (`archtime.azurewebsites.net`) mas
`Host: evil.example.com` retorna **HTTP 404** (não chega ao app); com o `Host` correto, **200**.
Ou seja, o app só recebe requests cujo `Host` ∈ hostnames configurados
(`archtime.app`, `archtime.azurewebsites.net`) — mesma garantia que o edge da Netlify dava. A
decisão original permanece válida sem alteração.

Nota sobre previews: `isSameNetlifySitePreview` reconhece o padrão de deploy preview da Netlify,
que **não existe mais** neste deploy. O matcher fica dormente por ora; quando previews efêmeros
forem implementados no Azure, o reconhecimento de origem de preview será revisitado (novo padrão de
URL). Até lá, `NEXT_PUBLIC_APP_URL` por ambiente é o mecanismo primário de confiança de origem.

Relacionado: um bug de plataforma correlato foi corrigido no cutover — no standalone atrás do proxy
do App Service, `new URL(request.url).origin` em route handlers resolve para o binding interno do
container (`http://0.0.0.0:8080`); redirects server-side agora usam `NEXT_PUBLIC_APP_URL` via
`resolveAppOrigin` (ver `src/lib/app-origin.ts`).
