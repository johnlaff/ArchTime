import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { Navbar } from '@/components/navbar'
import { AccentColorProvider } from '@/components/accent-color-provider'

const geist = Geist({ subsets: ['latin'] })

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://archtime.netlify.app'

export const metadata: Metadata = {
  title: 'ArchTime',
  description: 'Time tracking para freelancers e profissionais independentes',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ArchTime',
  },
  icons: {
    apple: '/api/icon?size=192',
  },
  openGraph: {
    title: 'ArchTime',
    description: 'Time tracking para freelancers e profissionais independentes',
    url: appUrl,
    siteName: 'ArchTime',
    images: [
      {
        url: `${appUrl}/api/icon?size=512`,
        width: 512,
        height: 512,
        alt: 'ArchTime',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'ArchTime',
    description: 'Time tracking para freelancers e profissionais independentes',
    images: [`${appUrl}/api/icon?size=512`],
  },
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
        {/* Anti-flash: sets data-accent before React hydration, same pattern as next-themes */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var a=localStorage.getItem('archtime-accent')||'indigo';document.documentElement.setAttribute('data-accent',a)})()`,
          }}
        />
        <AccentColorProvider>
          <Providers>
            <Navbar />
            <main className="max-w-screen-md mx-auto px-4 py-6">
              {children}
            </main>
          </Providers>
        </AccentColorProvider>
      </body>
    </html>
  )
}
