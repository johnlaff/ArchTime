import withSerwist from '@serwist/next'
import type { NextConfig } from 'next'

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'", // anti-flash inline em layout.tsx
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' https://fonts.gstatic.com data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://fonts.googleapis.com https://fonts.gstatic.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const nextConfig: NextConfig = {
  // Standalone só é ligado no build do container (Azure, o hosting de produção) via
  // BUILD_STANDALONE=true. Sem essa var, o output permanece o padrão do Next.
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  cacheComponents: true,
  experimental: {
    staleTimes: { dynamic: 30, static: 180 },
  },
  async redirects() {
    // Domínio canônico é a raiz `archtime.app`; `www` redireciona para ela.
    // `has: host` casa pelo header Host — o App Service encaminha o Host real.
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.archtime.app' }],
        destination: 'https://archtime.app/:path*',
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
        ],
      },
    ]
  },
}

export default withSerwist({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
})(nextConfig)
