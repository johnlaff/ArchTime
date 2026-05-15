import withSerwist from '@serwist/next'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    viewTransition: true,
  },
}

export default withSerwist({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
})(nextConfig)
