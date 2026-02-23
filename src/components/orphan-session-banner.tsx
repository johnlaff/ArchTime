'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatBRT } from '@/lib/dates'
import type { ActiveSession } from '@/types'

interface OrphanSessionBannerProps {
  session: ActiveSession
  onResolved: () => void
}

export function OrphanSessionBanner({ session, onResolved }: OrphanSessionBannerProps) {
  const [saving, setSaving] = useState(false)

  // Só exibe se a sessão é de um dia anterior
  const sessionDate = new Date(session.clockIn).toDateString()
  const today = new Date().toDateString()
  if (sessionDate === today) return null

  async function handleResolve() {
    setSaving(true)
    try {
      const res = await fetch(`/api/clock/${session.id}`, { method: 'PUT' })
      if (!res.ok) throw new Error()
      toast.success('Saída registrada retroativamente')
      onResolved()
    } catch {
      toast.error('Erro ao registrar saída')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
      <CardContent className="py-3 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">
            Entrada em aberto desde {formatBRT(session.clockIn, "dd/MM 'às' HH:mm")}
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="time"
              defaultValue={formatBRT(session.clockIn, 'HH:mm')}
              className="w-28 h-8 text-sm"
              readOnly
            />
            <Button size="sm" onClick={handleResolve} disabled={saving}>
              {saving ? 'Salvando...' : 'Registrar saída'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
