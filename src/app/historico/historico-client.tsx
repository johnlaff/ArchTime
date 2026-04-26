'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
import { formatBRT, formatMinutes, getLocalDateBRT } from '@/lib/dates'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { HistoryAuthError, parseHistoryBundleResponse } from '@/lib/history-client'
import type { HistoryBundle } from '@/lib/history'
import type { HistoryData, HistoryEntry, ProjectOption } from '@/types'

interface EditForm {
  clockInAt: string
  clockOutAt: string
  projectId: string     // "" = sem projeto
}

interface HourBankData {
  expectedMinutes: number
  actualMinutes: number
  balanceMinutes: number
  cumulativeBalance: number | null
  showCumulativeBalance: boolean
  weeks: Array<{
    startDate: string
    endDate: string
    expectedMinutes: number
    actualMinutes: number
    balanceMinutes: number
  }>
}

function toYYYYMM(date: Date): string {
  return format(date, 'yyyy-MM')
}

function monthToDate(month: string): Date {
  return new Date(`${month}-15T12:00:00`)
}

export function HistoricoClient({
  initialMonth = getLocalDateBRT().slice(0, 7),
  initialBundle,
}: {
  initialMonth?: string
  initialBundle?: HistoryBundle
}) {
  const [currentMonth, setCurrentMonth] = useState(() => monthToDate(initialMonth))
  const [data, setData] = useState<HistoryData | null>(initialBundle?.history ?? null)
  const [hourBank, setHourBank] = useState<HourBankData | null>(initialBundle?.hourBank ?? null)
  const [loading, setLoading] = useState(!initialBundle)
  const [loadingMore, setLoadingMore] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editTarget, setEditTarget] = useState<HistoryEntry | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ clockInAt: '', clockOutAt: '', projectId: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [projects, setProjects] = useState<ProjectOption[]>(initialBundle?.projects ?? [])
  const didMount = useRef(false)
  const router = useRouter()

  const load = useCallback(async (date: Date, page = 1, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const month = toYYYYMM(date)
      const res = await fetch(`/api/history?month=${month}&page=${page}&pageSize=50`)
      const bundle = await parseHistoryBundleResponse(res)
      const history = bundle.history
      setData((current) => append && current
        ? { ...history, entries: [...current.entries, ...history.entries] }
        : history
      )
      setProjects(bundle.projects)
      setHourBank(bundle.hourBank)
    } catch (error) {
      if (error instanceof HistoryAuthError) {
        router.replace('/login')
        return
      }
      toast.error('Erro ao carregar histórico')
    } finally {
      if (append) setLoadingMore(false)
      else setLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      if (!initialBundle) load(currentMonth)
      return
    }
    load(currentMonth)
  }, [currentMonth, initialBundle, load])

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
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Erro ao apagar registro')
      }
      toast.success('Registro removido do histórico')
      await load(currentMonth)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao apagar registro')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  function openEdit(entry: HistoryEntry) {
    setEditForm({
      clockInAt: formatBRT(entry.clockIn, "yyyy-MM-dd'T'HH:mm"),
      clockOutAt: formatBRT(entry.clockOut, "yyyy-MM-dd'T'HH:mm"),
      projectId: entry.projectId ?? '',
    })
    setEditTarget(entry)
  }

  async function handleEdit() {
    if (!editTarget) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/clock/${editTarget.entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clockInAt: editForm.clockInAt,
          clockOutAt: editForm.clockOutAt,
          projectId: editForm.projectId || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? 'Erro ao salvar')
        return
      }
      await res.json()
      await load(currentMonth)
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
      const key = e.segmentDate
      if (!acc[key]) acc[key] = []
      acc[key].push(e)
      return acc
    },
    {}
  )
  const dayKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const monthLabel = format(currentMonth, 'MMMM yyyy', { locale: ptBR })
  const isCurrentMonth = toYYYYMM(currentMonth) === getLocalDateBRT().slice(0, 7)
  const showCumulative =
    hourBank?.showCumulativeBalance && hourBank.cumulativeBalance != null

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

      {hourBank && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className={`${showCumulative ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'} grid gap-3 text-center text-sm`}>
              <div>
                <p className="text-xs text-muted-foreground">Previsto</p>
                <p className="font-medium tabular-nums">{formatMinutes(hourBank.expectedMinutes)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Realizado</p>
                <p className="font-medium tabular-nums">{formatMinutes(hourBank.actualMinutes)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Saldo</p>
                <p className="font-medium tabular-nums">{formatMinutes(hourBank.balanceMinutes)}</p>
              </div>
              {showCumulative && (
                <div>
                  <p className="text-xs text-muted-foreground">Acumulado</p>
                  <p className="font-medium tabular-nums">{formatMinutes(hourBank.cumulativeBalance!)}</p>
                </div>
              )}
            </div>
            <div className="space-y-1">
              {hourBank.weeks.map((week, index) => (
                <div
                  key={`${week.startDate}-${week.endDate}`}
                  className="flex items-center justify-between text-xs text-muted-foreground"
                >
                  <span>Semana {index + 1}</span>
                  <span className="tabular-nums">
                    {formatMinutes(week.actualMinutes)} / {formatMinutes(week.expectedMinutes)}
                    {' · '}
                    {formatMinutes(week.balanceMinutes)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
                        {(entry.projectName || entry.source === 'edited' || entry.isPartial) && (
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
                            {entry.isPartial && (
                              <span className="text-xs text-muted-foreground/60 leading-none">
                                (parcial)
                              </span>
                            )}
                          </div>
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
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(entry)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(entry.entryId)}
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

          {data?.hasMore && (
            <Button
              variant="outline"
              className="w-full"
              disabled={loadingMore}
              onClick={() => load(currentMonth, (data.page ?? 1) + 1, true)}
            >
              {loadingMore ? 'Carregando...' : 'Carregar mais'}
            </Button>
          )}
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
                  type="datetime-local"
                  value={editForm.clockInAt}
                  onChange={(e) => setEditForm((f) => ({ ...f, clockInAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-out">Saída</Label>
                <Input
                  id="edit-out"
                  type="datetime-local"
                  value={editForm.clockOutAt}
                  onChange={(e) => setEditForm((f) => ({ ...f, clockOutAt: e.target.value }))}
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
