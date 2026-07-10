'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Clock, FolderOpen, History, LogOut, Menu, Moon, Search, Settings, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { OPEN_PALETTE_EVENT } from '@/components/command-palette'
import { AccentColorPicker } from '@/components/accent-color-picker'
import { createClient } from '@/lib/supabase/client'
import { useAccentColor } from '@/components/accent-color-provider'
import { useThemeToggle } from '@/hooks/use-theme-toggle'
import { clearClientQueryCache } from '@/hooks/use-supabase-query'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Ponto', icon: Clock },
  { href: '/historico', label: 'Histórico', icon: History },
  { href: '/projetos', label: 'Projetos', icon: FolderOpen },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
]

const rowClass =
  'flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'

function LogoMark() {
  return (
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
  )
}

export function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const { accent, setAccent, customColor, setCustomColor } = useAccentColor()
  const toggleTheme = useThemeToggle()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    clearClientQueryCache()
    router.push('/login')
  }

  return (
    <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-screen-md mx-auto px-4 h-14 flex items-center">
        <Sheet>
          <SheetTrigger asChild>
            {/* A logo é o gatilho do menu — toque abre as opções (padrão hambúrguer). */}
            <Button variant="ghost" className="gap-2 px-2 -ml-2 h-11" aria-label="Abrir menu">
              <Menu className="h-5 w-5" aria-hidden="true" />
              <LogoMark />
              <span className="font-semibold text-sm tracking-tight">ArchTime</span>
            </Button>
          </SheetTrigger>

          <SheetContent
            side="left"
            className="w-[290px] p-0 flex flex-col gap-0 will-change-transform data-[state=open]:!duration-200 data-[state=closed]:!duration-150 data-[state=open]:[--tw-ease:var(--ease-out-expo)] data-[state=closed]:[--tw-ease:var(--ease-in)]"
          >
            <SheetHeader className="px-4 py-4 border-b text-left">
              <SheetTitle className="flex items-center gap-2">
                <LogoMark />
                <span className="font-semibold tracking-tight">ArchTime</span>
              </SheetTitle>
              <SheetDescription className="sr-only">
                Navegação e preferências do aplicativo
              </SheetDescription>
            </SheetHeader>

            <nav className="flex flex-col gap-1 p-3" aria-label="Navegação principal">
              {navItems.map(({ href, label, icon: Icon }) => {
                const active = pathname === href
                return (
                  <SheetClose asChild key={href}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        rowClass,
                        active
                          ? 'bg-secondary text-secondary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      )}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      {label}
                    </Link>
                  </SheetClose>
                )
              })}
            </nav>

            <Separator />

            <div className="flex flex-col gap-1 p-3">
              <SheetClose asChild>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT))}
                  className={cn(rowClass, 'text-muted-foreground hover:bg-accent hover:text-foreground')}
                >
                  <Search className="h-5 w-5" aria-hidden="true" />
                  Comando rápido
                </button>
              </SheetClose>
              {/* Tema não fecha o menu — deixa a pessoa comparar claro/escuro na hora. */}
              <button
                type="button"
                onClick={toggleTheme}
                className={cn(rowClass, 'text-muted-foreground hover:bg-accent hover:text-foreground')}
              >
                <Sun className="h-5 w-5 dark:hidden" aria-hidden="true" />
                <Moon className="hidden h-5 w-5 dark:block" aria-hidden="true" />
                Tema
              </button>
            </div>

            <Separator />

            <div className="p-3">
              <p className="px-3 pb-2 text-xs font-medium text-muted-foreground">Cor de destaque</p>
              <div className="px-3">
                <AccentColorPicker
                  accent={accent}
                  customColor={customColor}
                  onPresetChange={setAccent}
                  onCustomColorChange={setCustomColor}
                />
              </div>
            </div>

            <div className="mt-auto border-t p-3">
              <SheetClose asChild>
                <button
                  type="button"
                  onClick={handleLogout}
                  className={cn(
                    rowClass,
                    'w-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                  )}
                >
                  <LogOut className="h-5 w-5" aria-hidden="true" />
                  Sair
                </button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
