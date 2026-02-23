'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Trash2, Pencil } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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

interface EditForm {
  clockInTime: string   // "HH:MM" BRT
  clockOutTime: string  // "HH:MM" BRT
  projectId: string     // "" = sem projeto
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
  const [editTarget, setEditTarget] = useState<HistoryEntry | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ clockInTime: '', clockOutTime: '', projectId: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])

  const load = useCallback(async (date: Date) => {
    setLoading(true)
    try {
      const [histRes, projRes] = await Promise.all([
        fetch(`/api/clock/history?month=${toYYYYMM(date)}`),
        fetch('/api/projects'),
      ])
      if (!histRes.ok) throw new Error()
      setData(await histRes.json())
      if (projRes.ok) setProjects(await projRes.json())
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

  function openEdit(entry: HistoryEntry) {
    setEditForm({
      clockInTime: formatBRT(entry.clockIn),
      clockOutTime: formatBRT(entry.clockOut),
      projectId: projects.find(p => p.name === entry.projectName)?.id ?? '',
    })
    setEditTarget(entry)
  }

  async function handleEdit() {
    if (!editTarget) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/clock/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clockInTime: editForm.clockInTime,
          clockOutTime: editForm.clockOutTime,
          projectId: editForm.projectId || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? 'Erro ao salvar')
        return
      }
      const updated = await res.json()
      const proj = projects.find(p => p.id === editForm.projectId)
      setData((d) => {
        if (!d) return null
        return {
          ...d,
          entries: d.entries.map((e) =>
            e.id === editTarget.id
              ? {
                  ...e,
                  clockIn: updated.clockIn,
                  clockOut: updated.clockOut,
                  totalMinutes: updated.totalMinutes,
                  source: updated.source,
                  projectName: proj?.name ?? null,
                  projectColor: e.projectColor,
                }
              : e
          ),
        }
      })
      toast.success('Registro atualizado')
      setEditTarget(null)
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setEditSaving(false)
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
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {entry.projectName && (
                            <p className="text-xs text-muted-foreground leading-none">
                              {entry.projectName}
                            </p>
                          )}
                          {entry.source === 'edited' && (
                            <span className="text-xs text-muted-foreground/60 leading-none">
                              (editado)
                            </span>
                          )}
                        </div>
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
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(entry)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
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

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar registro</DialogTitle>
            <DialogDescription>
              Os horários devem estar no fuso de Brasília (BRT).
              A alteração ficará registrada no histórico de auditoria.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="edit-in">Entrada</Label>
                <Input
                  id="edit-in"
                  type="time"
                  value={editForm.clockInTime}
                  onChange={(e) => setEditForm((f) => ({ ...f, clockInTime: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-out">Saída</Label>
                <Input
                  id="edit-out"
                  type="time"
                  value={editForm.clockOutTime}
                  onChange={(e) => setEditForm((f) => ({ ...f, clockOutTime: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Projeto</Label>
              <Select
                value={editForm.projectId}
                onValueChange={(v) => setEditForm((f) => ({ ...f, projectId: v === 'none' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem projeto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem projeto</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={editSaving}>
              {editSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
