'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatBRT, getLocalDateBRT } from '@/lib/dates'
import type { ActiveSession } from '@/types'

interface OrphanSessionBannerProps {
  session: ActiveSession
  onResolved: () => void
}

export function OrphanSessionBanner({ session, onResolved }: OrphanSessionBannerProps) {
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [clockOutAt, setClockOutAt] = useState(() => formatBRT(new Date(), "yyyy-MM-dd'T'HH:mm"))

  // Só exibe se a sessão é de um dia anterior no fuso oficial do produto.
  const sessionDate = getLocalDateBRT(new Date(session.clockIn))
  const today = getLocalDateBRT()
  if (sessionDate === today) return null

  const minutesOpen = Math.floor((Date.now() - new Date(session.clockIn).getTime()) / 60000)
  const overLimit = minutesOpen > 24 * 60

  async function handleResolve() {
    setSaving(true)
    try {
      const res = await fetch(`/api/clock/${session.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clockOutAt }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Erro ao registrar saída')
      }
      toast.success('Saída registrada retroativamente')
      setOpen(false)
      onResolved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar saída')
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
          <p className="text-xs text-muted-foreground">
            Informe a data e hora reais da saída em Brasília.
            {overLimit && ' O limite padrão é 24h; escolha um horário dentro desse intervalo.'}
          </p>
          <Button size="sm" onClick={() => setOpen(true)}>
            Resolver sessão
          </Button>
        </div>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar saída</DialogTitle>
            <DialogDescription>
              A saída precisa ser posterior à entrada e não pode estar no futuro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="orphan-clock-out">Saída em Brasília</Label>
            <Input
              id="orphan-clock-out"
              type="datetime-local"
              value={clockOutAt}
              min={formatBRT(session.clockIn, "yyyy-MM-dd'T'HH:mm")}
              max={formatBRT(new Date(), "yyyy-MM-dd'T'HH:mm")}
              onChange={(e) => setClockOutAt(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleResolve} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar saída'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
