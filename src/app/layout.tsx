import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Fraunces } from 'next/font/google'
import './globals.css'
import { Suspense } from 'react'
import { Providers } from '@/components/providers'
import { Navbar } from '@/components/navbar'
import { AccentColorProvider } from '@/components/accent-color-provider'
import { AppSidebar } from '@/components/sidebar'
import { ColRight } from '@/components/col-right'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['opsz'],
})

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://archtime.netlify.app'

export const metadata: Metadata = {
  title: 'ArchTime',
  description: 'Time tracking para freelancers e profissionais independentes',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'ArchTime' },
  icons: {
    icon: [{ url: '/api/icon?size=32', sizes: '32x32', type: 'image/png' }],
    apple: '/api/icon?size=192',
  },
  openGraph: {
    title: 'ArchTime',
    description: 'Time tracking para freelancers e profissionais independentes',
    url: appUrl,
    siteName: 'ArchTime',
    images: [{ url: `${appUrl}/api/icon?size=512`, width: 512, height: 512, alt: 'ArchTime' }],
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'ArchTime',
    description: 'Time tracking para freelancers e profissionais independentes',
    images: [`${appUrl}/api/icon?size=512`],
  },
}

export const viewport: Viewport = { themeColor: '#6366f1' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${geist.variable} ${geistMono.variable} ${fraunces.variable} font-sans antialiased`}>
        {/*
          Anti-flash: applies data-accent, data-preset, data-density before React hydration.
          Reads localStorage and sets HTML attributes synchronously (same pattern as next-themes).
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              var a=localStorage.getItem('archtime-accent')||'indigo';
              document.documentElement.setAttribute('data-accent',a);
              if(a==='custom'){
                var c=localStorage.getItem('archtime-accent-custom');
                if(c) document.documentElement.style.setProperty('--custom-accent-hex',c);
              }
              var p=localStorage.getItem('archtime-preset');
              if(p) document.documentElement.setAttribute('data-preset',p);
              var d=localStorage.getItem('archtime-density')||'cozy';
              document.documentElement.setAttribute('data-density',d);
              if(localStorage.getItem('archtime-blueprint')==='true')
                document.documentElement.setAttribute('data-blueprint','true');
            })()`,
          }}
        />
        <AccentColorProvider>
          <Providers>
            <div className="block lg:hidden">
              <Navbar />
            </div>
            <div className="lg:flex lg:min-h-screen">
              <Suspense fallback={null}>
                <AppSidebar />
              </Suspense>
              <main className="flex-1 min-w-0">
                {children}
              </main>
              <Suspense fallback={null}>
                <ColRight />
              </Suspense>
            </div>
          </Providers>
        </AccentColorProvider>
      </body>
    </html>
  )
}
