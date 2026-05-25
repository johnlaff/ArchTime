'use client'

import { useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface KeyboardShortcutsOptions {
  onThemeToggle: () => void
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

export function useKeyboardShortcuts({ onThemeToggle }: KeyboardShortcutsOptions) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  useEffect(() => {
    router.prefetch('/dashboard')
    router.prefetch('/historico')
    router.prefetch('/projetos')
    router.prefetch('/configuracoes')
  }, [router])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isInteractiveElement()) return

      switch (e.key.toLowerCase()) {
        case 'p':
          startTransition(() => router.push('/dashboard'))
          break
        case 'h':
          startTransition(() => router.push('/historico'))
          break
        case 'j':
          startTransition(() => router.push('/projetos'))
          break
        case 'c':
          startTransition(() => router.push('/configuracoes'))
          break
        case 't':
          onThemeToggle()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [router, startTransition, onThemeToggle])
}
