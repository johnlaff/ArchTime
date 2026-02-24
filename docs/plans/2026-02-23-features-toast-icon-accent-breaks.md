# Features Implementation Plan: Toast, Icon, Accent Color, Breaks

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 4 user-requested features: toast repositioning + close button, dynamic PWA icon with accent color, 12-color accent theme selector in navbar, and pause/break support for clock entries.

**Architecture:** Each feature is self-contained. Accent color coordinates CSS vars (`globals.css`), a client context provider (`AccentColorProvider`), navbar popover, and a dynamic icon API route. Breaks require schema migration, two new API routes, an extended `ActiveSession` type, `useClock` additions, and UI changes in the dashboard.

**Tech Stack:** Next.js 16.1.6 App Router · Prisma 7 + Supabase · Tailwind CSS 4 · shadcn/ui · Sonner · `next/og` (ImageResponse) · Lucide React · Vitest

**Cross-cutting requirement:** All interactions must be instantaneous (optimistic updates, no waiting for network before updating UI). Animations 150–300ms, `cubic-bezier(0.16, 1, 0.3, 1)`. Existing test suite (`npm test`) must pass after every commit.

---

### Task 1: Toast — bottom-center + close button

**Files:**
- Modify: `src/components/providers.tsx:12`

**Step 1: Update Toaster props**

In `providers.tsx` line 12, change:
```tsx
<Toaster richColors position="top-center" />
```
To:
```tsx
<Toaster richColors position="bottom-center" closeButton />
```

**Step 2: Run tests**
```bash
npm test
```
Expected: all tests pass.

**Step 3: Commit**
```bash
git add src/components/providers.tsx
git commit -m "fix: move toast to bottom-center and add close button"
```

---

### Task 2: Accent color CSS variables (12 colors)

**Files:**
- Modify: `src/app/globals.css` (append after line 117, end of `.dark {}` block)

**Step 1: Append 12 accent blocks to `globals.css`**

Add this entire block after the `.dark {}` closing brace (after line 117):

```css
/* ─── Accent colors ─── */

[data-accent="indigo"] {
  --primary: oklch(0.55 0.22 277);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.55 0.22 277);
}
.dark [data-accent="indigo"],
[data-accent="indigo"].dark {
  --primary: oklch(0.68 0.20 277);
  --primary-foreground: oklch(0.15 0 0);
  --ring: oklch(0.68 0.20 277);
}

[data-accent="violet"] {
  --primary: oklch(0.55 0.22 300);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.55 0.22 300);
}
.dark [data-accent="violet"],
[data-accent="violet"].dark {
  --primary: oklch(0.68 0.20 300);
  --primary-foreground: oklch(0.15 0 0);
  --ring: oklch(0.68 0.20 300);
}

[data-accent="lavender"] {
  --primary: oklch(0.55 0.18 285);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.55 0.18 285);
}
.dark [data-accent="lavender"],
[data-accent="lavender"].dark {
  --primary: oklch(0.70 0.16 285);
  --primary-foreground: oklch(0.15 0 0);
  --ring: oklch(0.70 0.16 285);
}

[data-accent="fuchsia"] {
  --primary: oklch(0.55 0.24 330);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.55 0.24 330);
}
.dark [data-accent="fuchsia"],
[data-accent="fuchsia"].dark {
  --primary: oklch(0.68 0.22 330);
  --primary-foreground: oklch(0.15 0 0);
  --ring: oklch(0.68 0.22 330);
}

[data-accent="rose"] {
  --primary: oklch(0.58 0.22 350);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.58 0.22 350);
}
.dark [data-accent="rose"],
[data-accent="rose"].dark {
  --primary: oklch(0.72 0.19 350);
  --primary-foreground: oklch(0.15 0 0);
  --ring: oklch(0.72 0.19 350);
}

[data-accent="ruby"] {
  --primary: oklch(0.55 0.24 15);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.55 0.24 15);
}
.dark [data-accent="ruby"],
[data-accent="ruby"].dark {
  --primary: oklch(0.68 0.22 15);
  --primary-foreground: oklch(0.15 0 0);
  --ring: oklch(0.68 0.22 15);
}

[data-accent="coral"] {
  --primary: oklch(0.60 0.20 25);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.60 0.20 25);
}
.dark [data-accent="coral"],
[data-accent="coral"].dark {
  --primary: oklch(0.72 0.18 25);
  --primary-foreground: oklch(0.15 0 0);
  --ring: oklch(0.72 0.18 25);
}

[data-accent="amber"] {
  --primary: oklch(0.68 0.18 70);
  --primary-foreground: oklch(0.15 0 0);
  --ring: oklch(0.68 0.18 70);
}
.dark [data-accent="amber"],
[data-accent="amber"].dark {
  --primary: oklch(0.78 0.16 70);
  --primary-foreground: oklch(0.15 0 0);
  --ring: oklch(0.78 0.16 70);
}

[data-accent="emerald"] {
  --primary: oklch(0.60 0.18 155);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.60 0.18 155);
}
.dark [data-accent="emerald"],
[data-accent="emerald"].dark {
  --primary: oklch(0.72 0.16 155);
  --primary-foreground: oklch(0.15 0 0);
  --ring: oklch(0.72 0.16 155);
}

[data-accent="teal"] {
  --primary: oklch(0.60 0.15 183);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.60 0.15 183);
}
.dark [data-accent="teal"],
[data-accent="teal"].dark {
  --primary: oklch(0.72 0.14 183);
  --primary-foreground: oklch(0.15 0 0);
  --ring: oklch(0.72 0.14 183);
}

[data-accent="cyan"] {
  --primary: oklch(0.60 0.15 200);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.60 0.15 200);
}
.dark [data-accent="cyan"],
[data-accent="cyan"].dark {
  --primary: oklch(0.72 0.14 200);
  --primary-foreground: oklch(0.15 0 0);
  --ring: oklch(0.72 0.14 200);
}

[data-accent="blue"] {
  --primary: oklch(0.55 0.20 255);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.55 0.20 255);
}
.dark [data-accent="blue"],
[data-accent="blue"].dark {
  --primary: oklch(0.68 0.18 255);
  --primary-foreground: oklch(0.15 0 0);
  --ring: oklch(0.68 0.18 255);
}
```

**Step 2: Manual smoke test**

Run `npm run dev`. In browser console:
```js
document.documentElement.setAttribute('data-accent', 'teal')
```
All primary-colored elements (buttons, etc.) should turn teal immediately.

**Step 3: Run tests**
```bash
npm test
```

**Step 4: Commit**
```bash
git add src/app/globals.css
git commit -m "feat: add 12 accent color CSS variable blocks to globals.css"
```

---

### Task 3: AccentColorProvider + anti-flash script

**Files:**
- Create: `src/components/accent-color-provider.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Create `src/components/accent-color-provider.tsx`**

```tsx
'use client'

import { createContext, useContext, useState, useEffect } from 'react'

export const ACCENTS = {
  indigo:   '#6366f1',
  violet:   '#a855f7',
  lavender: '#8b5cf6',
  fuchsia:  '#d946ef',
  rose:     '#f43f5e',
  ruby:     '#e11d48',
  coral:    '#f97316',
  amber:    '#f59e0b',
  emerald:  '#10b981',
  teal:     '#14b8a6',
  cyan:     '#06b6d4',
  blue:     '#3b82f6',
} as const

export type AccentKey = keyof typeof ACCENTS

interface AccentColorContextValue {
  accent: AccentKey
  setAccent: (a: AccentKey) => void
}

const AccentColorContext = createContext<AccentColorContextValue>({
  accent: 'indigo',
  setAccent: () => {},
})

export function AccentColorProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentKey>('indigo')

  useEffect(() => {
    const saved = localStorage.getItem('archtime-accent') as AccentKey | null
    if (saved && saved in ACCENTS) {
      setAccentState(saved)
    }
  }, [])

  function setAccent(newAccent: AccentKey) {
    setAccentState(newAccent)
    document.documentElement.setAttribute('data-accent', newAccent)
    localStorage.setItem('archtime-accent', newAccent)
    document.cookie = `archtime-accent-color=${ACCENTS[newAccent]};path=/;max-age=31536000;SameSite=Lax`
  }

  return (
    <AccentColorContext.Provider value={{ accent, setAccent }}>
      {children}
    </AccentColorContext.Provider>
  )
}

export function useAccentColor() {
  return useContext(AccentColorContext)
}
```

**Step 2: Update `src/app/layout.tsx`**

The full updated file (Server Component — no `'use client'`):

```tsx
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
```

Note: `AccentColorProvider` wraps `Providers` so that `Navbar` (rendered inside `Providers`) can access the `useAccentColor` context. The anti-flash `<script>` is the first child of `<body>` so it runs synchronously before React hydration.

**Step 3: Run tests**
```bash
npm test
```
Expected: all tests pass.

**Step 4: Commit**
```bash
git add src/components/accent-color-provider.tsx src/app/layout.tsx
git commit -m "feat: add AccentColorProvider with anti-flash inline script"
```

---

### Task 4: Navbar palette icon + popover

**Files:**
- Modify: `src/components/navbar.tsx`

**Step 1: Replace `src/components/navbar.tsx` with the full updated file**

```tsx
'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Moon, Sun, Clock, FolderOpen, History, LogOut, Palette } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { createClient } from '@/lib/supabase/client'
import { useAccentColor, ACCENTS, type AccentKey } from '@/components/accent-color-provider'

const ACCENT_LABELS: Record<AccentKey, string> = {
  indigo:   'Índigo',
  violet:   'Violeta',
  lavender: 'Lavanda',
  fuchsia:  'Fúcsia',
  rose:     'Rosa',
  ruby:     'Rubi',
  coral:    'Coral',
  amber:    'Âmbar',
  emerald:  'Esmeralda',
  teal:     'Verde-água',
  cyan:     'Ciano',
  blue:     'Azul',
}

const ACCENT_ORDER: AccentKey[] = [
  'indigo', 'violet', 'lavender', 'fuchsia',
  'rose',   'ruby',   'coral',    'amber',
  'emerald','teal',   'cyan',     'blue',
]

const navItems = [
  { href: '/dashboard', label: 'Ponto',     icon: Clock },
  { href: '/historico', label: 'Histórico', icon: History },
  { href: '/projetos',  label: 'Projetos',  icon: FolderOpen },
]

export function Navbar() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const { accent, setAccent } = useAccentColor()

  useEffect(() => {
    navItems.forEach(({ href }) => router.prefetch(href))
  }, [router])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-screen-md mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <Button
                variant={pathname === href ? 'secondary' : 'ghost'}
                size="sm"
                className="gap-2"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Button>
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Cor de destaque">
                <Palette className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3 animate-fade-in" align="end">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Cor de destaque</p>
              <div className="grid grid-cols-4 gap-2">
                {ACCENT_ORDER.map((key) => (
                  <button
                    key={key}
                    onClick={() => setAccent(key)}
                    title={ACCENT_LABELS[key]}
                    className="w-7 h-7 rounded-full transition-all duration-150 hover:scale-110"
                    style={{
                      backgroundColor: ACCENTS[key],
                      transform: accent === key ? 'scale(1.1)' : undefined,
                      outline: accent === key ? `2px solid ${ACCENTS[key]}` : 'none',
                      outlineOffset: '2px',
                    }}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Alternar tema"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </nav>
  )
}
```

Note: If `Popover` is not yet installed in the project, run:
```bash
npx shadcn add popover
```

**Step 2: Verify in browser**

Run `npm run dev`. Click the palette icon (🎨) in the navbar — a popover should appear with 12 colored circles in a 4×3 grid. Clicking any circle should instantly change the primary color of all buttons and interactive elements.

**Step 3: Run tests**
```bash
npm test
```

**Step 4: Commit**
```bash
git add src/components/navbar.tsx
git commit -m "feat: add accent color palette popover to navbar"
```

---

### Task 5: Dynamic PWA icon + manifest + middleware

**Files:**
- Create: `src/app/api/icon/route.ts`
- Modify: `public/manifest.json`
- Modify: `src/middleware.ts:43`
- (layout.tsx already updated in Task 3 to use `/api/icon?size=N`)

**Step 1: Create `src/app/api/icon/route.ts`**

The icon draws clock hands at 10:10 position forming the letter "A": two lines from a center pivot (one pointing upper-left at 305°, one upper-right at 60°), connected by a horizontal crossbar. White symbol on accent-colored background.

Coordinate math (viewBox 0 0 100 100, pivot at 50,58):
- Hour hand at 305°: tip = (50 + 36×sin305°, 58 − 36×cos305°) ≈ (20, 37)
- Minute hand at 60°:  tip = (50 + 44×sin60°,  58 − 44×cos60°)  ≈ (88, 36)
- Crossbar at t=0.44 along each hand: (37, 49) → (67, 49)

```ts
import { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'
import { cookies } from 'next/headers'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const bg = cookieStore.get('archtime-accent-color')?.value ?? '#6366f1'

  const { searchParams } = new URL(req.url)
  const size = Math.min(Math.max(Number(searchParams.get('size') ?? '192'), 64), 512)

  const sw = 8.5 // stroke width in the 0–100 viewBox

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width={size * 0.62}
          height={size * 0.62}
          viewBox="0 0 100 100"
        >
          {/* Hour hand — 10 o'clock position (305° clockwise from 12) */}
          <line
            x1="50" y1="58" x2="20" y2="37"
            stroke="white" strokeWidth={sw} strokeLinecap="round"
          />
          {/* Minute hand — 2 o'clock position (60° clockwise from 12) */}
          <line
            x1="50" y1="58" x2="88" y2="36"
            stroke="white" strokeWidth={sw} strokeLinecap="round"
          />
          {/* Crossbar — horizontal bar of the "A" at ~44% along the hands */}
          <line
            x1="37" y1="49" x2="67" y2="49"
            stroke="white" strokeWidth={sw} strokeLinecap="round"
          />
          {/* Center pivot dot */}
          <circle cx="50" cy="58" r="5" fill="white" />
        </svg>
      </div>
    ),
    { width: size, height: size }
  )
}
```

**Step 2: Update `public/manifest.json`**

Replace the static icon entries with the dynamic route:

```json
{
  "name": "ArchTime",
  "short_name": "ArchTime",
  "description": "Time tracking para freelancers e profissionais independentes",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#6366f1",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/api/icon?size=192",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/api/icon?size=192",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/api/icon?size=512",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/api/icon?size=512",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

**Step 3: Update middleware to exclude `/api/icon`**

In `src/middleware.ts` line 43, the current matcher is:
```ts
'/((?!login|auth/callback|_next/static|_next/image|icons|manifest\\.json|sw\\.js|favicon\\.ico).*)',
```

Change to:
```ts
'/((?!login|auth/callback|_next/static|_next/image|icons|api/icon|manifest\\.json|sw\\.js|favicon\\.ico).*)',
```

This prevents the auth middleware from blocking the icon route (PWA assets must be publicly accessible).

**Step 4: Test the route**

With dev server running:
```bash
curl -o /tmp/icon.png "http://localhost:3000/api/icon?size=192"
file /tmp/icon.png
```
Expected: `PNG image data, 192 x 192` (or similar PNG identification).

Also test with a cookie — in browser console:
```js
document.cookie = 'archtime-accent-color=#14b8a6;path=/'
```
Then visit `http://localhost:3000/api/icon?size=192` — should show a teal background icon.

**Step 5: Run tests**
```bash
npm test
```

**Step 6: Commit**
```bash
git add src/app/api/icon/route.ts public/manifest.json src/middleware.ts
git commit -m "feat: add dynamic PWA icon API route with accent color support"
```

---

### Task 6: Prisma Break model

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add `breaks Break[]` relation inside `ClockEntry` model**

Inside the `ClockEntry` model block (after the existing `allocations TimeAllocation[]` line), add:
```prisma
breaks      Break[]
```

**Step 2: Add `Break` model at the end of the file**

After the `AuditLog` model, append:
```prisma
model Break {
  id           String     @id @default(uuid())
  clockEntryId String     @map("clock_entry_id")
  startTime    DateTime   @map("start_time") @db.Timestamptz
  endTime      DateTime?  @map("end_time") @db.Timestamptz
  clockEntry   ClockEntry @relation(fields: [clockEntryId], references: [id], onDelete: Cascade)

  @@map("breaks")
}
```

**Step 3: Push schema to database**
```bash
npx prisma db push
```
Expected: `Your database is now in sync with your Prisma schema.`

**Step 4: Regenerate Prisma client**
```bash
npx prisma generate
```

**Step 5: Run tests**
```bash
npm test
```

**Step 6: Commit**
```bash
git add prisma/schema.prisma
git commit -m "feat: add Break model to Prisma schema with ClockEntry relation"
```

---

### Task 7: Break API endpoints

**Files:**
- Create: `src/app/api/clock/[id]/break/route.ts`
- Create: `src/app/api/clock/[id]/break/[breakId]/route.ts`

**Step 1: Create `src/app/api/clock/[id]/break/route.ts` — POST start break**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { isAllowedEmail } from '@/lib/auth'

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user || !isAllowedEmail(user.email)) return null
  return user
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const entry = await prisma.clockEntry.findFirst({
    where: { id, userId: user.id, clockOut: null },
    include: { breaks: { where: { endTime: null } } },
  })

  if (!entry) {
    return NextResponse.json(
      { error: 'Entrada não encontrada ou já fechada' },
      { status: 404 }
    )
  }

  if (entry.breaks.length > 0) {
    return NextResponse.json({ error: 'Já existe uma pausa ativa' }, { status: 409 })
  }

  const now = new Date()

  const breakEntry = await prisma.$transaction(async (tx) => {
    const b = await tx.break.create({
      data: { clockEntryId: id, startTime: now },
    })
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'break_start',
        entityId: id,
        newData: { breakId: b.id, startTime: now.toISOString() },
        userAgent: req.headers.get('user-agent'),
      },
    })
    return b
  })

  return NextResponse.json(
    { id: breakEntry.id, startTime: breakEntry.startTime.toISOString() },
    { status: 201 }
  )
}
```

**Step 2: Create `src/app/api/clock/[id]/break/[breakId]/route.ts` — PUT end break**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { isAllowedEmail } from '@/lib/auth'

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user || !isAllowedEmail(user.email)) return null
  return user
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; breakId: string }> }
) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, breakId } = await params

  const entry = await prisma.clockEntry.findFirst({
    where: { id, userId: user.id, clockOut: null },
  })
  if (!entry) {
    return NextResponse.json(
      { error: 'Entrada não encontrada ou já fechada' },
      { status: 404 }
    )
  }

  const breakEntry = await prisma.break.findFirst({
    where: { id: breakId, clockEntryId: id, endTime: null },
  })
  if (!breakEntry) {
    return NextResponse.json(
      { error: 'Pausa não encontrada ou já encerrada' },
      { status: 404 }
    )
  }

  const now = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.break.update({
      where: { id: breakId },
      data: { endTime: now },
    })
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'break_end',
        entityId: id,
        newData: { breakId, endTime: now.toISOString() },
        userAgent: req.headers.get('user-agent'),
      },
    })
  })

  return NextResponse.json({ id: breakId, endTime: now.toISOString() })
}
```

**Step 3: Run tests**
```bash
npm test
```

**Step 4: Commit**
```bash
git add src/app/api/clock/[id]/break/route.ts src/app/api/clock/[id]/break/[breakId]/route.ts
git commit -m "feat: add break API endpoints — POST start, PUT end"
```

---

### Task 8: Types + data layer

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/app/api/clock/active/route.ts`
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/api/clock/[id]/route.ts` (PUT clock-out — add break deduction and paused guard)
- Modify: `src/lib/__tests__/dates.test.ts` (add break deduction test)

**Step 1: Update `src/types/index.ts`**

Replace the file with:
```ts
export interface ActiveSession {
  id: string
  clockIn: string // ISO UTC string
  projectId: string | null
  projectName: string | null
  projectColor: string | null
  isPaused: boolean
  activeBreakId: string | null
  totalBreakMinutes: number
}

export interface DailySummary {
  totalMinutes: number
  sessionCount: number
  entries: RecentEntry[]
}

export interface RecentEntry {
  id: string
  clockIn: string
  clockOut: string | null
  totalMinutes: number | null
  projectName: string | null
  projectColor: string | null
}

export interface ProjectOption {
  id: string
  name: string
  clientName: string | null
  color: string
  hourlyRate: number | null
  isActive: boolean
}

export interface PendingEntry {
  id: string
  type: 'clock_in' | 'clock_out' | 'clock_break_start' | 'clock_break_end'
  timestamp: string // ISO string — original client timestamp
  projectId?: string
  entryId?: string   // for clock_out / break events: references the clock entry id
  breakId?: string   // for clock_break_end: references the break id
  createdAt: string
}
```

**Step 2: Update `src/app/api/clock/active/route.ts`**

Replace with:
```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { isAllowedEmail } from '@/lib/auth'
import { calcDurationMinutes } from '@/lib/dates'
import type { ActiveSession } from '@/types'

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user || !isAllowedEmail(user.email)) return null
  return user
}

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entry = await prisma.clockEntry.findFirst({
    where: { userId: user.id, clockOut: null },
    include: {
      allocations: {
        include: { project: { select: { name: true, color: true } } },
        take: 1,
      },
      breaks: true,
    },
    orderBy: { clockIn: 'desc' },
  })

  if (!entry) return NextResponse.json(null)

  const allocation = entry.allocations[0]
  const activeBreak = entry.breaks.find(b => b.endTime === null) ?? null
  const totalBreakMinutes = entry.breaks
    .filter(b => b.endTime !== null)
    .reduce((acc, b) => acc + calcDurationMinutes(b.startTime, b.endTime!), 0)

  const session: ActiveSession = {
    id: entry.id,
    clockIn: entry.clockIn.toISOString(),
    projectId: allocation?.projectId ?? null,
    projectName: allocation?.project.name ?? null,
    projectColor: allocation?.project.color ?? null,
    isPaused: activeBreak !== null,
    activeBreakId: activeBreak?.id ?? null,
    totalBreakMinutes,
  }

  return NextResponse.json(session)
}
```

**Step 3: Update `src/app/dashboard/page.tsx`**

Replace with:
```ts
import { redirect } from 'next/navigation'
import { cacheLife, cacheTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { calcDurationMinutes } from '@/lib/dates'
import { DashboardClient } from './dashboard-client'
import type { ActiveSession, ProjectOption } from '@/types'

async function getCachedProjects(userId: string) {
  'use cache'
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 })
  cacheTag(`projects-${userId}`)
  return prisma.project.findMany({
    where: { userId, isActive: true },
    orderBy: { name: 'asc' },
  })
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [activeEntry, projects] = await Promise.all([
    prisma.clockEntry.findFirst({
      where: { userId: user.id, clockOut: null },
      include: {
        allocations: {
          include: { project: { select: { name: true, color: true } } },
          take: 1,
        },
        breaks: true,
      },
    }),
    getCachedProjects(user.id),
  ])

  const activeBreak = activeEntry?.breaks.find(b => b.endTime === null) ?? null
  const totalBreakMinutes = activeEntry?.breaks
    .filter(b => b.endTime !== null)
    .reduce((acc, b) => acc + calcDurationMinutes(b.startTime, b.endTime!), 0) ?? 0

  const session: ActiveSession | null = activeEntry
    ? {
        id: activeEntry.id,
        clockIn: activeEntry.clockIn.toISOString(),
        projectId: activeEntry.allocations[0]?.projectId ?? null,
        projectName: activeEntry.allocations[0]?.project.name ?? null,
        projectColor: activeEntry.allocations[0]?.project.color ?? null,
        isPaused: activeBreak !== null,
        activeBreakId: activeBreak?.id ?? null,
        totalBreakMinutes,
      }
    : null

  const projectOptions: ProjectOption[] = projects.map(p => ({
    id: p.id,
    name: p.name,
    clientName: p.clientName,
    color: p.color,
    hourlyRate: p.hourlyRate ? Number(p.hourlyRate) : null,
    isActive: p.isActive,
  }))

  return (
    <DashboardClient
      initialSession={session}
      projects={projectOptions}
    />
  )
}
```

**Step 4: Update `src/app/api/clock/[id]/route.ts` — PUT clock-out**

Find the `PUT` handler. Replace the `findFirst` call and the `totalMinutes` calculation:

Current `findFirst`:
```ts
const entry = await prisma.clockEntry.findFirst({
  where: { id, userId: user.id, clockOut: null },
})
```

Replace with:
```ts
const entry = await prisma.clockEntry.findFirst({
  where: { id, userId: user.id, clockOut: null },
  include: { breaks: true },
})
```

Then, after `if (!entry)` check, add a paused guard **before** the `totalMinutes` calculation:
```ts
const activeBreak = entry.breaks.find(b => b.endTime === null)
if (activeBreak) {
  return NextResponse.json(
    { error: 'Encerre a pausa antes de registrar a saída' },
    { status: 409 }
  )
}
```

Then replace the `totalMinutes` line:
```ts
// Old:
const totalMinutes = calcDurationMinutes(entry.clockIn, now)

// New:
const breakMinutes = entry.breaks
  .filter(b => b.endTime !== null)
  .reduce((acc, b) => acc + calcDurationMinutes(b.startTime, b.endTime!), 0)
const totalMinutes = Math.max(0, calcDurationMinutes(entry.clockIn, now) - breakMinutes)
```

**Step 5: Add break deduction test to `src/lib/__tests__/dates.test.ts`**

Append to the existing file:
```ts
describe('break minute deduction', () => {
  it('deducts completed break minutes from total duration', () => {
    const clockIn    = new Date('2026-01-01T09:00:00Z')
    const breakStart = new Date('2026-01-01T10:00:00Z')
    const breakEnd   = new Date('2026-01-01T10:15:00Z')
    const clockOut   = new Date('2026-01-01T12:00:00Z')

    const total = calcDurationMinutes(clockIn, clockOut)           // 180
    const breakDur = calcDurationMinutes(breakStart, breakEnd)     // 15
    expect(Math.max(0, total - breakDur)).toBe(165)
  })

  it('ignores active (unfinished) breaks in calculation', () => {
    const clockIn  = new Date('2026-01-01T09:00:00Z')
    const clockOut = new Date('2026-01-01T11:00:00Z')
    const breaks = [{ startTime: new Date('2026-01-01T10:00:00Z'), endTime: null as Date | null }]

    const completed = breaks.filter(b => b.endTime !== null)
    const breakMinutes = completed.reduce(
      (acc, b) => acc + calcDurationMinutes(b.startTime, b.endTime!), 0
    )
    expect(breakMinutes).toBe(0)
    expect(calcDurationMinutes(clockIn, clockOut) - breakMinutes).toBe(120)
  })
})
```

**Step 6: Run tests**
```bash
npm test
```
Expected: 11 tests pass (9 original + 2 new).

**Step 7: Commit**
```bash
git add src/types/index.ts src/app/api/clock/active/route.ts src/app/dashboard/page.tsx src/app/api/clock/[id]/route.ts src/lib/__tests__/dates.test.ts
git commit -m "feat: extend types and data layer for break support"
```

---

### Task 9: useClock + Dashboard UI

**Files:**
- Modify: `src/hooks/use-clock.ts`
- Modify: `src/components/current-session.tsx`
- Modify: `src/components/clock-button.tsx`
- Modify: `src/app/dashboard/dashboard-client.tsx`

**Step 1: Update `src/hooks/use-clock.ts`**

Replace the file with:
```ts
'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { addPendingEntry } from '@/lib/offline-queue'
import type { ActiveSession } from '@/types'

interface UseClockReturn {
  session: ActiveSession | null
  setSession: (s: ActiveSession | null) => void
  clockIn: (projectId: string | null) => Promise<void>
  clockOut: () => Promise<void>
  pauseBreak: () => Promise<void>
  resumeBreak: () => Promise<void>
  loading: boolean
}

export function useClock(initialSession: ActiveSession | null): UseClockReturn {
  const [session, setSession] = useState<ActiveSession | null>(initialSession)
  const [loading, setLoading] = useState(false)

  const clockIn = useCallback(async (projectId: string | null) => {
    setLoading(true)
    try {
      if (navigator.onLine) {
        const res = await fetch('/api/clock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        })
        if (!res.ok) {
          const data = await res.json()
          toast.error(data.error ?? 'Erro ao registrar entrada')
          return
        }
        const entry = await res.json()
        setSession({
          id: entry.id,
          clockIn: entry.clockIn,
          projectId: projectId ?? null,
          projectName: null,
          projectColor: null,
          isPaused: false,
          activeBreakId: null,
          totalBreakMinutes: 0,
        })
        toast.success('Entrada registrada!')
      } else {
        const id = crypto.randomUUID()
        const timestamp = new Date().toISOString()
        await addPendingEntry({
          id,
          entryId: id,
          type: 'clock_in',
          timestamp,
          projectId: projectId ?? undefined,
          createdAt: timestamp,
        })
        setSession({
          id,
          clockIn: timestamp,
          projectId,
          projectName: null,
          projectColor: null,
          isPaused: false,
          activeBreakId: null,
          totalBreakMinutes: 0,
        })
        toast.warning('Entrada salva offline. Será sincronizada ao reconectar.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const clockOut = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      if (navigator.onLine) {
        const res = await fetch(`/api/clock/${session.id}`, { method: 'PUT' })
        if (!res.ok) {
          const data = await res.json()
          toast.error(data.error ?? 'Erro ao registrar saída')
          return
        }
        toast.success('Saída registrada!')
      } else {
        const timestamp = new Date().toISOString()
        await addPendingEntry({
          id: crypto.randomUUID(),
          entryId: session.id,
          type: 'clock_out',
          timestamp,
          createdAt: timestamp,
        })
        toast.warning('Saída salva offline. Será sincronizada ao reconectar.')
      }
      setSession(null)
    } finally {
      setLoading(false)
    }
  }, [session])

  const pauseBreak = useCallback(async () => {
    if (!session || session.isPaused) return
    setLoading(true)
    try {
      if (navigator.onLine) {
        const res = await fetch(`/api/clock/${session.id}/break`, { method: 'POST' })
        if (!res.ok) {
          toast.error('Erro ao iniciar pausa')
          return
        }
        const data = await res.json()
        setSession({ ...session, isPaused: true, activeBreakId: data.id })
      } else {
        const breakId = crypto.randomUUID()
        const timestamp = new Date().toISOString()
        await addPendingEntry({
          id: crypto.randomUUID(),
          type: 'clock_break_start',
          timestamp,
          entryId: session.id,
          breakId,
          createdAt: timestamp,
        })
        setSession({ ...session, isPaused: true, activeBreakId: breakId })
        toast.warning('Pausa salva offline. Será sincronizada ao reconectar.')
      }
    } finally {
      setLoading(false)
    }
  }, [session])

  const resumeBreak = useCallback(async () => {
    if (!session || !session.isPaused || !session.activeBreakId) return
    setLoading(true)
    try {
      if (navigator.onLine) {
        const res = await fetch(
          `/api/clock/${session.id}/break/${session.activeBreakId}`,
          { method: 'PUT' }
        )
        if (!res.ok) {
          toast.error('Erro ao retomar')
          return
        }
        setSession({ ...session, isPaused: false, activeBreakId: null })
      } else {
        const timestamp = new Date().toISOString()
        await addPendingEntry({
          id: crypto.randomUUID(),
          type: 'clock_break_end',
          timestamp,
          entryId: session.id,
          breakId: session.activeBreakId,
          createdAt: timestamp,
        })
        setSession({ ...session, isPaused: false, activeBreakId: null })
        toast.warning('Retomada salva offline. Será sincronizada ao reconectar.')
      }
    } finally {
      setLoading(false)
    }
  }, [session])

  return { session, setSession, clockIn, clockOut, pauseBreak, resumeBreak, loading }
}
```

**Step 2: Update `src/components/current-session.tsx`**

Replace with:
```tsx
'use client'

import { Clock, PauseCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useTimer } from '@/hooks/use-timer'
import type { ActiveSession } from '@/types'

interface CurrentSessionProps {
  session: ActiveSession | null
}

export function CurrentSession({ session }: CurrentSessionProps) {
  const elapsed = useTimer(session?.clockIn ?? null)

  if (!session) return null

  if (session.isPaused) {
    return (
      <Card className="border-amber-500/50 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 animate-scale-in">
        <CardContent className="py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PauseCircle className="h-4 w-4 text-amber-500 animate-pulse" />
            <div>
              <p className="text-xs text-muted-foreground">Em pausa</p>
              {session.projectName && (
                <p className="text-sm font-medium flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ backgroundColor: session.projectColor ?? '#6366f1' }}
                  />
                  {session.projectName}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="font-mono text-2xl font-bold tabular-nums tracking-tight opacity-40">
              {elapsed}
            </span>
            {session.totalBreakMinutes > 0 && (
              <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700">
                ⏸ {session.totalBreakMinutes}min em pausa
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-emerald-500/50 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 animate-scale-in">
      <CardContent className="py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Clock className="h-4 w-4 text-emerald-500" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Em andamento</p>
            {session.projectName && (
              <p className="text-sm font-medium flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: session.projectColor ?? '#6366f1' }}
                />
                {session.projectName}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-mono text-2xl font-bold tabular-nums tracking-tight">
            {elapsed}
          </span>
          {session.totalBreakMinutes > 0 && (
            <Badge variant="outline" className="text-xs">
              {session.totalBreakMinutes}min pausado
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 3: Update `src/components/clock-button.tsx`**

Add `disabled` prop:
```tsx
'use client'

import { LogIn, LogOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ClockButtonProps {
  isClockedIn: boolean
  onClick: () => void
  loading: boolean
  disabled?: boolean
}

export function ClockButton({ isClockedIn, onClick, loading, disabled }: ClockButtonProps) {
  return (
    <Button
      size="lg"
      onClick={onClick}
      disabled={loading || !!disabled}
      className={[
        'w-full h-20 text-xl font-bold gap-3',
        'transition-all duration-200 active:scale-95',
        'will-change-transform rounded-2xl',
        isClockedIn
          ? 'bg-rose-500 hover:bg-rose-600 dark:bg-rose-600 dark:hover:bg-rose-700 animate-glow-red'
          : 'bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 animate-glow-green',
        'text-white',
      ].join(' ')}
    >
      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : isClockedIn ? (
        <>
          <LogOut className="h-6 w-6" /> SAÍDA
        </>
      ) : (
        <>
          <LogIn className="h-6 w-6" /> ENTRADA
        </>
      )}
    </Button>
  )
}
```

**Step 4: Update `src/app/dashboard/dashboard-client.tsx`**

Replace with:
```tsx
'use client'

import { useState, useEffect } from 'react'
import { Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ClockButton } from '@/components/clock-button'
import { CurrentSession } from '@/components/current-session'
import { DailySummaryCard } from '@/components/daily-summary'
import { ProjectSelector } from '@/components/project-selector'
import { OfflineIndicator } from '@/components/offline-indicator'
import { OrphanSessionBanner } from '@/components/orphan-session-banner'
import { InstallPrompt } from '@/components/install-prompt'
import { useClock } from '@/hooks/use-clock'
import type { ActiveSession, DailySummary, ProjectOption } from '@/types'

interface DashboardClientProps {
  initialSession: ActiveSession | null
  projects: ProjectOption[]
}

export function DashboardClient({
  initialSession,
  projects,
}: DashboardClientProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialSession?.projectId ?? null
  )
  const [summary, setSummary] = useState<DailySummary | null>(null)

  const { session, setSession, clockIn, clockOut, pauseBreak, resumeBreak, loading } =
    useClock(initialSession)

  useEffect(() => {
    fetch('/api/clock/summary')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSummary(data) })
      .catch(() => {})
  }, [])

  async function refreshSummary() {
    try {
      const res = await fetch('/api/clock/summary')
      if (res.ok) setSummary(await res.json())
    } catch { }
  }

  async function handleClockIn() {
    await clockIn(selectedProjectId)
  }

  async function handleClockOut() {
    await clockOut()
    await refreshSummary()
  }

  const isOrphan =
    session && new Date(session.clockIn).toDateString() !== new Date().toDateString()

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ponto</h1>
        <OfflineIndicator />
      </div>

      {isOrphan && session && (
        <OrphanSessionBanner
          session={session}
          onResolved={() => {
            setSession(null)
            refreshSummary()
          }}
        />
      )}

      {session && !isOrphan && <CurrentSession session={session} />}

      {session && !isOrphan && (
        <Button
          variant="outline"
          size="sm"
          className={[
            'w-full gap-2 transition-all duration-150 animate-fade-in',
            session.isPaused ? 'text-primary border-primary/50' : '',
          ].join(' ')}
          onClick={session.isPaused ? resumeBreak : pauseBreak}
          disabled={loading}
        >
          {session.isPaused ? (
            <><Play className="h-4 w-4" /> Retomar</>
          ) : (
            <><Pause className="h-4 w-4" /> Pausar</>
          )}
        </Button>
      )}

      {!session && (
        <ProjectSelector
          projects={projects}
          value={selectedProjectId}
          onChange={setSelectedProjectId}
          disabled={loading}
        />
      )}

      <InstallPrompt />

      <ClockButton
        isClockedIn={!!session}
        onClick={session ? handleClockOut : handleClockIn}
        loading={loading}
        disabled={session?.isPaused}
      />

      {summary === null ? (
        <div className="space-y-3">
          <div className="h-24 rounded-xl bg-muted/50 animate-pulse" />
        </div>
      ) : (
        <DailySummaryCard summary={summary} />
      )}
    </div>
  )
}
```

**Step 5: Run tests**
```bash
npm test
```

**Step 6: Commit**
```bash
git add src/hooks/use-clock.ts src/components/current-session.tsx src/components/clock-button.tsx src/app/dashboard/dashboard-client.tsx
git commit -m "feat: add pause/resume UI and extend useClock with break actions"
```

---

### Task 10: Offline queue + sync route for breaks

**Files:**
- Modify: `src/app/api/sync/route.ts`

Note: `src/lib/offline-queue.ts` needs no changes — it already uses `PendingEntry` from `src/types/index.ts`, which was updated in Task 8 to include `clock_break_start | clock_break_end` and the `breakId` field.

**Step 1: Update `src/app/api/sync/route.ts`**

Add two new handlers after the existing `clock_out` block. The file currently ends with `return NextResponse.json({ ok: true })`. Add before that line:

```ts
  if (entry.type === 'clock_break_start' && entry.entryId && entry.breakId) {
    const clockEntry = await prisma.clockEntry.findFirst({
      where: { id: entry.entryId, userId: user.id },
    })
    if (!clockEntry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }
    await prisma.break.create({
      data: {
        id: entry.breakId,
        clockEntryId: entry.entryId,
        startTime: new Date(entry.timestamp),
      },
    })
  }

  if (entry.type === 'clock_break_end' && entry.entryId && entry.breakId) {
    const breakEntry = await prisma.break.findFirst({
      where: { id: entry.breakId, clockEntryId: entry.entryId },
    })
    if (!breakEntry) {
      return NextResponse.json({ error: 'Break not found' }, { status: 404 })
    }
    await prisma.break.update({
      where: { id: entry.breakId },
      data: { endTime: new Date(entry.timestamp) },
    })
  }
```

**Step 2: Run tests**
```bash
npm test
```
Expected: all 11 tests pass.

**Step 3: Commit**
```bash
git add src/app/api/sync/route.ts
git commit -m "feat: handle clock_break_start and clock_break_end in offline sync"
```

---

## Summary

| Task | Files | Key change |
|---|---|---|
| 1 | `providers.tsx` | Toast → `bottom-center` + `closeButton` |
| 2 | `globals.css` | 12 `[data-accent]` CSS var blocks |
| 3 | `accent-color-provider.tsx`, `layout.tsx` | Context + anti-flash script |
| 4 | `navbar.tsx` | Palette icon + 4×3 swatch popover |
| 5 | `api/icon/route.ts`, `manifest.json`, `middleware.ts` | Dynamic PNG icon with clock-A symbol |
| 6 | `schema.prisma` | `Break` model + `breaks` relation on `ClockEntry` |
| 7 | `api/clock/[id]/break/route.ts`, `…/[breakId]/route.ts` | POST start + PUT end break |
| 8 | `types/index.ts`, `active/route.ts`, `page.tsx`, `[id]/route.ts`, tests | Extended types + break-aware data layer |
| 9 | `use-clock.ts`, `current-session.tsx`, `clock-button.tsx`, `dashboard-client.tsx` | Full break UI + useClock extensions |
| 10 | `api/sync/route.ts` | Offline sync for break events |
