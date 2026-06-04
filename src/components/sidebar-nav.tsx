'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { Clock, History, FolderOpen, Settings } from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',     label: 'Ponto',         icon: Clock      },
  { href: '/historico',     label: 'Histórico',     icon: History    },
  { href: '/projetos',      label: 'Projetos',      icon: FolderOpen },
  { href: '/configuracoes', label: 'Configurações', icon: Settings   },
]

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={href}
            className={[
              'relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors select-none',
              isActive
                ? 'text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            ].join(' ')}
          >
            {isActive && (
              <motion.span
                layoutId="nav-indicator"
                className="absolute inset-0 rounded-lg bg-accent pointer-events-none"
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
            )}
            <Icon className="relative h-4 w-4 flex-shrink-0" />
            <span className="relative flex-1">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
