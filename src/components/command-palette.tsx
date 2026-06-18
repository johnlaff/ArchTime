'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Clock,
  FolderOpen,
  History,
  Palette,
  Play,
  Search,
  Settings,
  Square,
  SunMoon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { useThemeToggle } from '@/hooks/use-theme-toggle'
import { useAccentColor } from '@/components/accent-color-provider'
import { fireClockToggle, setPendingClockToggle } from '@/lib/clock-bus'
import { createClient } from '@/lib/supabase/client'
import { fetchActiveSession } from '@/lib/client-data'
import { ARCHITECTURAL_PRESETS, type ArchitecturalPreset } from '@/lib/preferences'

export const OPEN_PALETTE_EVENT = 'archtime:open-palette'

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
}

/**
 * The modifier label for the palette shortcut, OS-adapted: `⌘` on macOS/iOS,
 * `Ctrl` elsewhere (Windows has no Command key). Starts as `Ctrl` so server and
 * first client render agree, then corrects after mount to avoid a hydration mismatch.
 */
export function useModKey(): string {
  const [mod, setMod] = useState('Ctrl')
  useEffect(() => {
    // react-doctor-disable-next-line react-doctor/no-initialize-state -- valor depende de navigator (indisponível no SSR); iniciar com 'Ctrl' garante que servidor e 1º render do cliente concordem (sem hydration mismatch); a atualização ocorre após o mount, padrão recomendado para APIs de browser.
    if (isMacPlatform()) setMod('⌘')
  }, [])
  return mod
}

/**
 * Search-style button that opens the palette. The keyboard shortcut hint lives only
 * in the dedicated "Atalhos de Teclado" card (ShortcutsWidget), not here.
 */
export function CommandTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT))}
      aria-label="Abrir comando rápido"
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground',
        className
      )}
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">Buscar…</span>
    </button>
  )
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const toggleTheme = useThemeToggle()
  const { setArchitecturalPreset } = useAccentColor()

  const isAuthRoute = pathname === '/login' || pathname.startsWith('/auth/')

  useEffect(() => {
    if (isAuthRoute) return
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((value) => !value)
      }
    }
    function onOpen() {
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen)
    }
  }, [isAuthRoute])

  // Refresh the clock state each time the palette opens so the action reads
  // "Bater ponto" vs "Registrar saída" correctly (cheap single RLS-scoped read).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetchActiveSession(createClient())
      .then((session) => {
        if (!cancelled) setHasSession(Boolean(session))
      })
      .catch(() => {
        if (!cancelled) setHasSession(null)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const run = useCallback((action: () => void) => {
    setOpen(false)
    action()
  }, [])

  const navigate = useCallback(
    (href: string) =>
      run(() => {
        if (pathname !== href) router.push(href)
      }),
    [pathname, router, run]
  )

  const toggleClock = () =>
    run(() => {
      if (pathname === '/dashboard') {
        fireClockToggle()
      } else {
        setPendingClockToggle()
        router.push('/dashboard')
      }
    })

  if (isAuthRoute) return null

  const clockLabel = hasSession ? 'Registrar saída' : 'Bater ponto'
  const ClockActionIcon = hasSession ? Square : Play

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Comando rápido"
      description="Bater ponto, navegar e mudar a aparência."
    >
      <CommandInput placeholder="Bater ponto, ir para projeto, mudar tema…" aria-label="Comando rápido" />
      <CommandList>
        <CommandEmpty>Nenhum comando encontrado.</CommandEmpty>

        <CommandGroup heading="Ações">
          <CommandItem keywords={['clock', 'ponto', 'entrada', 'saida', 'bater', 'registrar']} onSelect={toggleClock}>
            <ClockActionIcon />
            <span>{clockLabel}</span>
            <CommandShortcut>B</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navegar">
          <CommandItem keywords={['ponto', 'dashboard', 'inicio']} onSelect={() => navigate('/dashboard')}>
            <Clock />
            <span>Ponto</span>
            <CommandShortcut>P</CommandShortcut>
          </CommandItem>
          <CommandItem keywords={['historico', 'registros', 'sessoes']} onSelect={() => navigate('/historico')}>
            <History />
            <span>Histórico</span>
            <CommandShortcut>H</CommandShortcut>
          </CommandItem>
          <CommandItem keywords={['projetos', 'clientes']} onSelect={() => navigate('/projetos')}>
            <FolderOpen />
            <span>Projetos</span>
            <CommandShortcut>J</CommandShortcut>
          </CommandItem>
          <CommandItem keywords={['configuracoes', 'ajustes', 'preferencias']} onSelect={() => navigate('/configuracoes')}>
            <Settings />
            <span>Configurações</span>
            <CommandShortcut>C</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Aparência">
          <CommandItem keywords={['tema', 'claro', 'escuro', 'dark', 'light']} onSelect={() => run(() => toggleTheme())}>
            <SunMoon />
            <span>Alternar tema claro/escuro</span>
            <CommandShortcut>T</CommandShortcut>
          </CommandItem>
          {(Object.entries(ARCHITECTURAL_PRESETS) as [ArchitecturalPreset, { label: string }][]).map(
            ([key, preset]) => (
              <CommandItem
                key={key}
                keywords={['preset', 'estilo', preset.label]}
                onSelect={() => run(() => setArchitecturalPreset(key))}
              >
                <Palette />
                <span>Estilo: {preset.label}</span>
              </CommandItem>
            )
          )}
          <CommandItem keywords={['padrao', 'limpar', 'reset', 'estilo']} onSelect={() => run(() => setArchitecturalPreset(null))}>
            <Palette />
            <span>Estilo padrão</span>
          </CommandItem>
          <CommandItem keywords={['personalizar', 'aparencia', 'cores', 'densidade']} onSelect={() => navigate('/configuracoes')}>
            <Settings />
            <span>Personalizar aparência…</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
