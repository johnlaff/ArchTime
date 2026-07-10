'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

/**
 * Boundary de erro de nível raiz: renderiza quando o próprio root layout falha, então
 * substitui `<html>`/`<body>` e NÃO herda o CSS global do app — daí os estilos inline.
 * Reporta o erro ao Sentry e oferece um retry (`reset`).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
          background: '#0a0a0a',
          color: '#fafafa',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px' }}>
            Algo deu errado
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#a1a1aa', margin: '0 0 20px', lineHeight: 1.5 }}>
            Um erro inesperado aconteceu. Já registramos e vamos investigar. Você pode tentar de novo.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              appearance: 'none',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: '#fafafa',
              color: '#0a0a0a',
            }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  )
}
