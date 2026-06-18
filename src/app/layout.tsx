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
  // Favicon / apple-touch-icon / theme-color are owned at runtime by
  // browser-accent.ts so they track the user's accent color. They are deliberately
  // NOT declared here (metadata) nor in `viewport`: if React renders & owns these
  // <head> nodes and browser-accent removes/replaces them, React's <head>
  // reconciliation on every client navigation throws "Cannot read properties of
  // null (reading 'removeChild')" and the page swap freezes (URL changes, UI does
  // not). Keeping a single owner (browser-accent) eliminates that conflict.
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

// themeColor is set at runtime by browser-accent.ts (see metadata note above).
export const viewport: Viewport = {}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${geist.variable} ${geistMono.variable} ${fraunces.variable} font-sans antialiased`}>
        {/*
          Anti-flash: applies data-accent, data-preset, data-density before React hydration.
          Reads localStorage and sets HTML attributes synchronously (same pattern as next-themes).
        */}
        {/* react-doctor-disable-next-line react-doctor/nextjs-no-native-script, react-doctor/no-danger -- script anti-flash precisa rodar de forma síncrona ANTES da hidratação (next/script com qualquer strategy executa tarde demais e causaria flash de tema); conteúdo 100% controlado pelo app (IIFE lê localStorage e define atributos no documentElement), sem entrada de usuário interpolada → sem risco de XSS */}
        <script dangerouslySetInnerHTML={{
            __html: `(function(){
              function norm(v){
                var m=String(v||'').trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
                if(!m) return null;
                var h=m[1].toLowerCase();
                if(h.length===3) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
                return '#'+h;
              }
              function rgb(hex){
                var h=norm(hex)||'#6366f1';
                return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
              }
              function hex(rgb){
                return '#'+rgb.map(function(v){return Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')}).join('');
              }
              function mix(a,b,w){
                var x=rgb(a),y=rgb(b),m=Math.max(0,Math.min(1,w));
                return hex([x[0]*(1-m)+y[0]*m,x[1]*(1-m)+y[1]*m,x[2]*(1-m)+y[2]*m]);
              }
              function lum(hex){
                var h=norm(hex)||'#6366f1';
                function c(i){
                  var v=parseInt(h.slice(i,i+2),16)/255;
                  return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);
                }
                return c(1)*0.2126+c(3)*0.7152+c(5)*0.0722;
              }
              function contrast(a,b){
                var x=lum(a),y=lum(b),hi=Math.max(x,y),lo=Math.min(x,y);
                return (hi+0.05)/(lo+0.05);
              }
              function fg(hex){
                return contrast('#111827',hex)>=contrast('#ffffff',hex)?'#111827':'#ffffff';
              }
              function outline(hex){
                if(contrast(hex,'#ffffff')<1.5) return '#9ca3af';
                if(contrast(hex,'#111827')<1.5) return '#4b5563';
                return 'transparent';
              }
              var a=localStorage.getItem('archtime-accent')||'indigo';
              document.documentElement.setAttribute('data-accent',a);
              if(a==='custom'){
                var c=norm(localStorage.getItem('archtime-accent-custom'));
                if(!c) c='#6366f1';
                var l=lum(c);
                var light=l>0.78?mix(c,'#111827',0.12):mix(c,'#ffffff',0.88);
                var mutedLight=l>0.78?mix(c,'#111827',0.06):mix(c,'#ffffff',0.94);
                var dark=l<0.18?mix(c,'#ffffff',0.18):mix(c,'#000000',0.72);
                var mutedDark=l<0.18?mix(c,'#ffffff',0.11):mix(c,'#000000',0.82);
                document.documentElement.style.setProperty('--custom-accent-hex',c);
                document.documentElement.style.setProperty('--custom-accent-foreground',fg(c));
                document.documentElement.style.setProperty('--custom-accent-border',outline(c));
                document.documentElement.style.setProperty('--custom-accent-soft-light',light);
                document.documentElement.style.setProperty('--custom-accent-soft-foreground-light',fg(light));
                document.documentElement.style.setProperty('--custom-accent-muted-light',mutedLight);
                document.documentElement.style.setProperty('--custom-accent-soft-dark',dark);
                document.documentElement.style.setProperty('--custom-accent-soft-foreground-dark',fg(dark));
                document.documentElement.style.setProperty('--custom-accent-muted-dark',mutedDark);
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
