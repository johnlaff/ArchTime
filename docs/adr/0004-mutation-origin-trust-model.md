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
