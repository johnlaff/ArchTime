'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Moon, Sun, Palette, Settings, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { createClient } from '@/lib/supabase/client'
import { useAccentColor } from '@/components/accent-color-provider'
import { AccentColorPicker } from '@/components/accent-color-picker'
import type { AccentPreset } from '@/lib/preferences'
import { useThemeToggle } from '@/hooks/use-theme-toggle'

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

  function handleAccentChange(next: AccentPreset) {
    setAccent(next) // provider persists accent server-side
  }

  return (
    <div className="mt-auto border-t border-border pt-3 flex flex-col gap-2">
      {/* User info */}
      <div className="flex items-center gap-2 px-1">
        <Avatar className="h-7 w-7 flex-shrink-0">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={name ?? email} referrerPolicy="no-referrer" />}
          <AvatarFallback
            className="text-[11px] font-semibold"
            style={{
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              boxShadow: 'inset 0 0 0 1px var(--primary-border, transparent)',
            }}
          >
            {initials}
          </AvatarFallback>
        </Avatar>
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
          <PopoverContent className="w-[260px] p-3 animate-fade-in" align="start" side="top">
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
