'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Moon, Sun, Palette, Settings, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { createClient } from '@/lib/supabase/client'
import { useAccentColor, ACCENTS } from '@/components/accent-color-provider'
import { ACCENT_PRESETS, type AccentPreset } from '@/lib/preferences'
import { persistAppearanceSettings } from '@/lib/appearance'
import { useThemeToggle } from '@/hooks/use-theme-toggle'

const ACCENT_ORDER = Object.keys(ACCENT_PRESETS) as AccentPreset[]

export interface SidebarFooterProps {
  email: string
  initials: string
  name?: string
  avatarUrl?: string
}

export function SidebarFooterControls({ email, initials, name, avatarUrl }: SidebarFooterProps) {
  const { accent, setAccent, customColor, setCustomColor } = useAccentColor()
  const router = useRouter()
  const toggleTheme = useThemeToggle()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  function persistAppearance(patch: Parameters<typeof persistAppearanceSettings>[0]) {
    persistAppearanceSettings(patch).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar aparência')
    })
  }

  function handleAccentChange(next: AccentPreset) {
    setAccent(next)
    persistAppearance({ accentPreset: next })
  }

  return (
    <div className="mt-auto border-t border-border pt-3 flex flex-col gap-2">
      {/* User info */}
      <div className="flex items-center gap-2 px-1">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name ?? email}
            referrerPolicy="no-referrer"
            className="h-7 w-7 rounded-full flex-shrink-0 object-cover"
          />
        ) : (
          <div
            className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
            aria-hidden="true"
          >
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          {name && (
            <p className="text-xs font-medium text-foreground truncate leading-tight">{name}</p>
          )}
          <p className={`text-xs text-muted-foreground truncate ${name ? 'leading-tight' : ''}`}>
            {email}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 px-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Cor de destaque">
              <Palette className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3 animate-fade-in" align="start" side="top">
            <p className="text-xs text-muted-foreground mb-2 font-medium">Cor de destaque</p>
            <div className="grid grid-cols-2 gap-1.5">
              {ACCENT_ORDER.map((key) => (
                <button
                  key={key}
                  onClick={() => handleAccentChange(key)}
                  title={ACCENT_PRESETS[key].label}
                  className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs transition-colors ${
                    accent === key ? 'border-primary bg-accent' : 'hover:bg-accent'
                  }`}
                >
                  <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: ACCENTS[key] }} />
                  {ACCENT_PRESETS[key].label}
                </button>
              ))}
            </div>
            <div className="border-t border-border pt-2 mt-1">
              <p className="text-xs text-muted-foreground mb-1.5">Cor personalizada</p>
              <input
                type="color"
                value={customColor ?? '#6366f1'}
                onChange={(e) => setCustomColor(e.target.value)}
                className="h-7 w-full cursor-pointer rounded border border-border"
                title="Cor personalizada"
              />
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={toggleTheme}
          aria-label="Alternar tema"
        >
          <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-[transform,opacity] dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-[transform,opacity] dark:rotate-0 dark:scale-100" />
        </Button>

        <Button variant="ghost" size="icon" className="h-7 w-7" asChild aria-label="Configurações">
          <Link href="/configuracoes"><Settings className="h-3.5 w-3.5" /></Link>
        </Button>

        <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={handleLogout} aria-label="Sair">
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
