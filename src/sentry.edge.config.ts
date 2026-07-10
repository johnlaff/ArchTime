// Inicialização do Sentry no edge runtime. Hoje dormente — o `proxy.ts` roda no
// runtime Node no Next 16 e nenhuma rota exporta `runtime = 'edge'` —, mantido como
// scaffold para o caso de superfícies edge no futuro. Ver `src/instrumentation.ts`.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
})
