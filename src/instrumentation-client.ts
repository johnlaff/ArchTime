// Inicialização do Sentry no browser. O Next 16 carrega este arquivo automaticamente
// no bundle client (convenção `instrumentation-client`). Só ativo em produção.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
})

// Instrumenta as navegações do App Router para tracing de client-side.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
