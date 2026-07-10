// Inicialização do Sentry no runtime Node do servidor. Importado por
// `src/instrumentation.ts` no boot (register), antes de atender requisições.
// Só ativo em produção — em dev/build o DSN pode faltar e o init vira no-op.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  environment: process.env.NODE_ENV,
  // Amostragem leve de tracing: o foco é captura de erro, não APM.
  tracesSampleRate: 0.1,
  // Não enviar PII (IP, headers, corpo de request) — dados da usuária não saem daqui.
  sendDefaultPii: false,
})
