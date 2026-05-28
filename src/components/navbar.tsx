'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Moon, Sun, Clock, FolderOpen, History, LogOut, Palette, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { AccentColorPicker } from '@/components/accent-color-picker'
import { createClient } from '@/lib/supabase/client'
import { useAccentColor } from '@/components/accent-color-provider'
import { persistAppearanceSettings } from '@/lib/appearance'
import type { AccentPreset } from '@/lib/preferences'
import { useThemeToggle } from '@/hooks/use-theme-toggle'

const navItems = [
  { href: '/dashboard', label: 'Ponto',     icon: Clock },
  { href: '/historico', label: 'Histórico', icon: History },
  { href: '/projetos',  label: 'Projetos',  icon: FolderOpen },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
]

export function Navbar() {
  const pathname = usePathname()
  const { accent, setAccent, customColor, setCustomColor } = useAccentColor()
  const router = useRouter()
  const toggleTheme = useThemeToggle()

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

  return (
    <nav className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-screen-md mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Link href="/dashboard" className="flex items-center gap-2 mr-2" aria-label="ArchTime">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-[6px] flex-shrink-0"
              style={{
                background: 'var(--primary)',
                color: 'var(--primary-foreground)',
                boxShadow: 'inset 0 0 0 1px var(--primary-border, transparent)',
              }}
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
            <PopoverContent className="w-[260px] p-3 animate-fade-in" align="end">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Cor de destaque</p>
              <AccentColorPicker
                accent={accent}
                customColor={customColor}
                onPresetChange={handleAccentChange}
                onCustomColorChange={setCustomColor}
              />
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Alternar tema"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-[transform,opacity] dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-[transform,opacity] dark:rotate-0 dark:scale-100" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </nav>
  )
}
