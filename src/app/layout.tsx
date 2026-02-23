import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { Navbar } from '@/components/navbar'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PontoArq',
  description: 'Registro de ponto para arquiteta PJ',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#6366f1',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={geist.className}>
        <Providers>
          <Navbar />
          <main className="max-w-screen-md mx-auto px-4 py-6">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
