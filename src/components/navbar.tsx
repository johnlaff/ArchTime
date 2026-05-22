'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Moon, Sun, Clock, FolderOpen, History, LogOut, Palette, Settings } from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { createClient } from '@/lib/supabase/client'
import { useAccentColor, ACCENTS } from '@/components/accent-color-provider'
import {
  getNextThemeMode,
  markLocalPreferenceChange,
  persistAppearanceSettings,
} from '@/lib/appearance'
import { ACCENT_PRESETS, type AccentPreset } from '@/lib/preferences'

const ACCENT_ORDER = Object.keys(ACCENT_PRESETS) as AccentPreset[]

const navItems = [
  { href: '/dashboard', label: 'Ponto',     icon: Clock },
  { href: '/historico', label: 'Histórico', icon: History },
  { href: '/projetos',  label: 'Projetos',  icon: FolderOpen },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
]

export function Navbar() {
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const router = useRouter()
  const { accent, setAccent } = useAccentColor()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  function persistAppearance(patch: Parameters<typeof persistAppearanceSettings>[0]) {
    persistAppearanceSettings(patch).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar aparência')
    })
  }

  function handleAccentChange(nextAccent: AccentPreset) {
    setAccent(nextAccent)
    persistAppearance({ accentPreset: nextAccent })
  }

  function handleThemeToggle() {
    const nextTheme = getNextThemeMode(resolvedTheme)
    markLocalPreferenceChange()
    setTheme(nextTheme)
    persistAppearance({ themeMode: nextTheme })
  }

  function prefetchRoute(href: string) {
    router.prefetch(href)
  }

  return (
    <nav className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-screen-md mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Link href="/dashboard" className="flex items-center gap-2 mr-2" aria-label="ArchTime">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-[6px] flex-shrink-0"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              <svg width="17" height="17" viewBox="0 0 100 100" fill="none" aria-hidden="true">
                <circle cx="50" cy="11" r="9" fill="currentColor" />
                <line x1="50" y1="11" x2="13" y2="87" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
                <line x1="50" y1="11" x2="87" y2="87" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
                <line x1="27" y1="60" x2="73" y2="60" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
              </svg>
            </span>
            <span className="hidden sm:block font-semibold text-sm tracking-tight">ArchTime</span>
          </Link>
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              prefetch={false}
              onMouseEnter={() => prefetchRoute(href)}
              onFocus={() => prefetchRoute(href)}
            >
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
              <div className="grid grid-cols-2 gap-2">
                {ACCENT_ORDER.map((key) => (
                  <button
                    key={key}
                    onClick={() => handleAccentChange(key)}
                    title={ACCENT_PRESETS[key].label}
                    className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      accent === key ? 'border-primary bg-accent' : 'hover:bg-accent'
                    }`}
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full"
                      style={{ backgroundColor: ACCENTS[key] }}
                    />
                    {ACCENT_PRESETS[key].label}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleThemeToggle}
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
