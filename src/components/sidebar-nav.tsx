'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { Clock, History, FolderOpen, Settings, BarChart2, CreditCard } from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  kbd: string
  disabled?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',     label: 'Ponto',         icon: Clock,       kbd: 'P' },
  { href: '/historico',     label: 'Histórico',     icon: History,     kbd: 'H' },
  { href: '/projetos',      label: 'Projetos',      icon: FolderOpen,  kbd: 'J' },
  { href: '/configuracoes', label: 'Configurações', icon: Settings,    kbd: 'S' },
  { href: '/relatorios',    label: 'Relatórios',    icon: BarChart2,   kbd: 'R', disabled: true },
  { href: '/faturamento',   label: 'Faturamento',   icon: CreditCard,  kbd: 'F', disabled: true },
]

export function SidebarNav() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon, kbd, disabled }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={disabled ? '#' : href}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : undefined}
            onMouseEnter={() => !disabled && router.prefetch(href)}
            onClick={(e) => { if (disabled) e.preventDefault() }}
            className={[
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors select-none',
              disabled
                ? 'pointer-events-none opacity-40 text-muted-foreground cursor-not-allowed'
                : isActive
                ? 'bg-accent text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            ].join(' ')}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1">{label}</span>
            <kbd className="font-mono text-[10px] text-muted-foreground/50 border border-border/50 rounded px-1 py-px">
              {kbd}
            </kbd>
          </Link>
        )
      })}
    </nav>
  )
}
