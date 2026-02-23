'use client'

import { ThemeProvider } from 'next-themes'
import { SyncProvider } from './sync-provider'
import { Toaster } from '@/components/ui/sonner'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SyncProvider>
        {children}
        <Toaster richColors position="top-center" />
      </SyncProvider>
    </ThemeProvider>
  )
}
