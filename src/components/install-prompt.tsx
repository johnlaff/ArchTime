'use client'

import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!deferredPrompt || dismissed) return null

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setDeferredPrompt(null)
    else setDismissed(true)
  }

  return (
    <Card className="border-indigo-500/50">
      <CardContent className="py-3 flex items-center justify-between gap-3">
        <p className="text-sm">Instalar ArchTime na tela inicial?</p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>Agora não</Button>
          <Button size="sm" onClick={handleInstall} className="gap-1">
            <Download className="h-3 w-3" /> Instalar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
