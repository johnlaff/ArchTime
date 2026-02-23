import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, ExpirationPlugin, Serwist } from 'serwist'

declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[]
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  // Do NOT cache API calls — only the app shell
  runtimeCaching: [
    {
      matcher: /^https:\/\/fonts\.googleapis\.com\/.*/i,
      handler: new CacheFirst({
        cacheName: 'google-fonts',
        plugins: [
          new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 }),
        ],
      }),
    },
  ],
})

serwist.addEventListeners()
