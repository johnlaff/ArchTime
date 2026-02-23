'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { format, addMonths, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatBRT, formatMinutes } from '@/lib/dates'

interface HistoryEntry {
  id: string
  clockIn: string
  clockOut: string
  totalMinutes: number | null
  projectName: string | null
  projectColor: string | null
  entryDate: string
  source: string
}

interface HistoryData {
  entries: HistoryEntry[]
  totalMinutes: number
  sessionCount: number
}

function toYYYYMM(date: Date): string {
  return format(date, 'yyyy-MM')
}

export function HistoricoClient() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date())
  const [data, setData] = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async (date: Date) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/clock/history?month=${toYYYYMM(date)}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      toast.error('Erro ao carregar histórico')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(currentMonth)
  }, [currentMonth, load])

  function prevMonth() {
    setCurrentMonth((m) => subMonths(m, 1))
  }

  function nextMonth() {
    setCurrentMonth((m) => addMonths(m, 1))
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/clock/${deleteTarget}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Registro apagado')
      setData((d) => {
        if (!d) return null
        const entries = d.entries.filter((e) => e.id !== deleteTarget)
        return {
          entries,
          totalMinutes: entries.reduce((s, e) => s + (e.totalMinutes ?? 0), 0),
          sessionCount: entries.length,
        }
      })
    } catch {
      toast.error('Erro ao apagar registro')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  // Group entries by date (YYYY-MM-DD), sorted day descending
  const grouped = (data?.entries ?? []).reduce<Record<string, HistoryEntry[]>>(
    (acc, e) => {
      const key = e.entryDate.slice(0, 10)
      if (!acc[key]) acc[key] = []
      acc[key].push(e)
      return acc
    },
    {}
  )
  const dayKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const monthLabel = format(currentMonth, 'MMMM yyyy', { locale: ptBR })
  const isCurrentMonth = toYYYYMM(currentMonth) === toYYYYMM(new Date())

  return (
    <div className="space-y-4 animate-fade-in-up">
      <h1 className="text-2xl font-bold">Histórico</h1>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="font-medium capitalize">{monthLabel}</span>
        <Button variant="ghost" size="icon" onClick={nextMonth} disabled={isCurrentMonth}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : dayKeys.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Nenhum registro neste mês.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {dayKeys.map((day) => (
            <div key={day} className="space-y-1 animate-fade-in-up">
              <p className="text-xs text-muted-foreground px-1 capitalize">
                {format(new Date(day + 'T12:00:00'), 'd MMM, EEEE', { locale: ptBR })}
              </p>
              {grouped[day].map((entry) => (
                <Card
                  key={entry.id}
                  className="py-2 px-3 hover:bg-muted/40 cursor-default"
                >
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {entry.projectColor && (
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: entry.projectColor }}
                        />
                      )}
                      <div>
                        {entry.projectName && (
                          <p className="text-xs text-muted-foreground leading-none mb-0.5">
                            {entry.projectName}
                          </p>
                        )}
                        <span className="tabular-nums">
                          {formatBRT(entry.clockIn)} — {formatBRT(entry.clockOut)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {entry.totalMinutes != null && (
                        <span className="text-muted-foreground tabular-nums">
                          {formatMinutes(entry.totalMinutes)}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(entry.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ))}

          {/* Month totals */}
          <div className="border-t pt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>Total do mês</span>
            <span className="tabular-nums font-medium">
              {formatMinutes(data?.totalMinutes ?? 0)}&nbsp;·&nbsp;
              {data?.sessionCount ?? 0}{' '}
              {data?.sessionCount === 1 ? 'sessão' : 'sessões'}
            </span>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar registro?</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Apagando...' : 'Apagar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
