'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

interface KeyboardShortcutsOptions {
  onThemeToggle: () => void
  disabled?: boolean
}

function isInteractiveElement(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  if (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    el.hasAttribute('contenteditable')
  ) return true
  if (el.closest('[role="dialog"], [data-radix-popper-content-wrapper], [data-state="open"]')) return true
  return false
}

const ROUTES = {
  p: '/dashboard',
  h: '/historico',
  j: '/projetos',
  c: '/configuracoes',
} as const

export function useKeyboardShortcuts({
  onThemeToggle,
  disabled = false,
}: KeyboardShortcutsOptions) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (disabled) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isInteractiveElement()) return

      const key = e.key.toLowerCase()
      if (key === 't') {
        onThemeToggle()
        return
      }

      const href = ROUTES[key as keyof typeof ROUTES]
      if (!href || pathname === href) return
      router.push(href)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [router, pathname, onThemeToggle, disabled])
}
