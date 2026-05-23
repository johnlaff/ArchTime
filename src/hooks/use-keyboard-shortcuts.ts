'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface KeyboardShortcutsOptions {
  onThemeToggle: () => void
}

function isInteractiveElement(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    el.hasAttribute('contenteditable')
  )
}

export function useKeyboardShortcuts({ onThemeToggle }: KeyboardShortcutsOptions) {
  const router = useRouter()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isInteractiveElement()) return

      switch (e.key.toLowerCase()) {
        case 'p':
          router.push('/dashboard')
          break
        case 'h':
          router.push('/historico')
          break
        case 'j':
          router.push('/projetos')
          break
        case 'c':
          router.push('/configuracoes')
          break
        case 't':
          onThemeToggle()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [router, onThemeToggle])
}
