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
