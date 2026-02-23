'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Moon, Sun, Clock, FolderOpen, History, LogOut } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/dashboard', label: 'Ponto', icon: Clock },
  { href: '/historico', label: 'Histórico', icon: History },
  { href: '/projetos', label: 'Projetos', icon: FolderOpen },
]

export function Navbar() {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const router = useRouter()

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
