'use client'

import { useEffect, useState, useCallback, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Trash2, Pencil, Search, CalendarRange, SlidersHorizontal, X } from 'lucide-react'
import { format, addMonths, subMonths, startOfMonth, endOfMonth } from 'date-fns'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ActivitySelector, ActivityTag } from '@/components/activity-selector'
import { ACTIVITY_TYPES, type ActivityType } from '@/lib/activity-types'
import { HistoryAuthError, parseHistoryBundleResponse } from '@/lib/history-client'
import type { HistoryBundle } from '@/lib/history'
import type { HistoryData, HistoryEntry, HistoryFilters, ProjectOption } from '@/types'

interface EditForm {
  clockInAt: string
  clockOutAt: string
  projectId: string // "" = sem projeto
  activityType: ActivityType | null
  notes: string
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

function hasAnyFilter(f: HistoryFilters): boolean {
  return Boolean(f.q || f.projectId || f.activityType || f.dateStart || f.dateEnd)
}

/** Project / activity / date-range controls — inline on desktop, inside a Sheet on mobile. */
function FilterControls({
  filters,
  setFilters,
  projects,
  monthBounds,
}: {
  filters: HistoryFilters
  setFilters: React.Dispatch<React.SetStateAction<HistoryFilters>>
  projects: ProjectOption[]
  monthBounds: { min: string; max: string }
}) {
  const activeProjectName = filters.projectId
    ? projects.find((p) => p.id === filters.projectId)?.name ?? 'Projeto'
    : null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={filters.projectId ? 'secondary' : 'outline'} size="sm" className="gap-1.5">
            {activeProjectName ? <span className="max-w-[120px] truncate">{activeProjectName}</span> : 'Projeto'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[300px] overflow-y-auto">
          <DropdownMenuLabel>Filtrar por projeto</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={filters.projectId ?? 'all'}
            onValueChange={(v) => setFilters((f) => ({ ...f, projectId: v === 'all' ? undefined : v }))}
          >
            <DropdownMenuRadioItem value="all">Todos os projetos</DropdownMenuRadioItem>
            {projects.map((p) => (
              <DropdownMenuRadioItem key={p.id} value={p.id}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.name}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={filters.activityType ? 'secondary' : 'outline'} size="sm" className="gap-1.5">
            {filters.activityType ? ACTIVITY_TYPES[filters.activityType as ActivityType].label : 'Atividade'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Filtrar por atividade</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={filters.activityType ?? 'all'}
            onValueChange={(v) => setFilters((f) => ({ ...f, activityType: v === 'all' ? undefined : v }))}
          >
            <DropdownMenuRadioItem value="all">Todas as atividades</DropdownMenuRadioItem>
            {(Object.entries(ACTIVITY_TYPES) as [ActivityType, { label: string }][]).map(([key, meta]) => (
              <DropdownMenuRadioItem key={key} value={key}>{meta.label}</DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant={filters.dateStart || filters.dateEnd ? 'secondary' : 'outline'} size="sm" className="gap-1.5">
            <CalendarRange className="h-4 w-4" />
            <span className="hidden sm:inline">Datas</span>
            <span className="sm:hidden">Intervalo de datas</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto space-y-2 p-3">
          <p className="text-xs font-medium text-muted-foreground">Intervalo de datas</p>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="Data inicial"
              min={monthBounds.min}
              max={monthBounds.max}
              value={filters.dateStart ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, dateStart: e.target.value || undefined }))}
              className="w-[150px]"
            />
            <span className="text-muted-foreground text-sm">até</span>
            <Input
              type="date"
              aria-label="Data final"
              min={monthBounds.min}
              max={monthBounds.max}
              value={filters.dateEnd ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, dateEnd: e.target.value || undefined }))}
              className="w-[150px]"
            />
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
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
  const [monthLoading, setMonthLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editTarget, setEditTarget] = useState<HistoryEntry | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ clockInAt: '', clockOutAt: '', projectId: '', activityType: null, notes: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [projects, setProjects] = useState<ProjectOption[]>(initialBundle?.projects ?? [])

  const [searchInput, setSearchInput] = useState('')
  const [filters, setFilters] = useState<HistoryFilters>({})
  const filtersRef = useRef(filters)
  filtersRef.current = filters

  const didMount = useRef(false)
  const filtersMounted = useRef(false)
  const monthChangedByUser = useRef(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const load = useCallback(async (
    date: Date,
    page = 1,
    append = false,
    opts: { silent?: boolean; fresh?: boolean } = {}
  ) => {
    const silent = monthChangedByUser.current || opts.silent
    monthChangedByUser.current = false
    if (append) setLoadingMore(true)
    else if (silent) setMonthLoading(true)
    else setLoading(true)
    try {
      const month = toYYYYMM(date)
      const params = new URLSearchParams({ month, page: String(page), pageSize: '50' })
      const f = filtersRef.current
      if (f.q) params.set('q', f.q)
      if (f.projectId) params.set('projectId', f.projectId)
      if (f.activityType) params.set('activityType', f.activityType)
      if (f.dateStart) params.set('dateStart', f.dateStart)
      if (f.dateEnd) params.set('dateEnd', f.dateEnd)

      const res = await fetch(`/api/history?${params.toString()}`, opts.fresh ? { cache: 'no-store' } : undefined)
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
      else if (silent) setMonthLoading(false)
      else setLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      load(currentMonth, 1, false, { silent: !!initialBundle, fresh: true })
      return
    }
    load(currentMonth)
  }, [currentMonth, initialBundle, load])

  // Debounce free-text search into the filter set (no reload on equal value).
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => {
        const next = searchInput.trim() || undefined
        return f.q === next ? f : { ...f, q: next }
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Reload page 1 whenever a filter changes (skip the first render — the mount
  // effect already loads). Server filters the whole month before paginating.
  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true
      return
    }
    load(currentMonth, 1, false, { silent: true, fresh: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  useEffect(() => {
    const onSettingsChanged = () => load(currentMonth, 1, false, { silent: true, fresh: true })
    window.addEventListener('archtime:settings-changed', onSettingsChanged)
    return () => window.removeEventListener('archtime:settings-changed', onSettingsChanged)
  }, [currentMonth, load])

  function prevMonth() {
    startTransition(() => {
      monthChangedByUser.current = true
      // Date-range filters are month-specific; drop them when the month changes.
      setFilters((f) => (f.dateStart || f.dateEnd ? { ...f, dateStart: undefined, dateEnd: undefined } : f))
      setCurrentMonth((m) => subMonths(m, 1))
    })
  }

  function nextMonth() {
    startTransition(() => {
      monthChangedByUser.current = true
      setFilters((f) => (f.dateStart || f.dateEnd ? { ...f, dateStart: undefined, dateEnd: undefined } : f))
      setCurrentMonth((m) => addMonths(m, 1))
    })
  }

  function clearFilters() {
    setSearchInput('')
    setFilters({})
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
      await load(currentMonth, 1, false, { silent: true, fresh: true })
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
      activityType: (entry.activityType as ActivityType | null) ?? null,
      notes: entry.notes ?? '',
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
          activityType: editForm.activityType,
          notes: editForm.notes,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        toast.error(d.error ?? 'Erro ao salvar')
        return
      }
      await res.json()
      await load(currentMonth, 1, false, { silent: true, fresh: true })
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
  const showCumulative = hourBank?.showCumulativeBalance && hourBank.cumulativeBalance != null
  const filtersActive = hasAnyFilter(filters)
  const monthBounds = {
    min: format(startOfMonth(currentMonth), 'yyyy-MM-dd'),
    max: format(endOfMonth(currentMonth), 'yyyy-MM-dd'),
  }

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

      {/* Filter toolbar */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            {/* `dark:bg-card` NÃO é redundante: sobrescreve o `dark:bg-input/30`
                translúcido do <Input> base — sem ele a busca volta a ficar transparente
                no escuro. Opaca como os cards de ponto/atividade nos dois temas. */}
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar projeto ou nota…"
              className="pl-8 bg-card dark:bg-card"
              aria-label="Buscar no histórico"
            />
          </div>

          {/* Inline on desktop; consolidated into a Sheet on mobile. */}
          <div className="hidden items-center gap-2 sm:flex">
            <FilterControls filters={filters} setFilters={setFilters} projects={projects} monthBounds={monthBounds} />
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant={filtersActive ? 'secondary' : 'outline'} size="sm" className="gap-1.5 sm:hidden">
                <SlidersHorizontal className="h-4 w-4" />
                Filtros
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[80vh]">
              <SheetHeader>
                <SheetTitle>Filtros</SheetTitle>
              </SheetHeader>
              <div className="flex flex-wrap gap-2 px-4 pb-8">
                <FilterControls filters={filters} setFilters={setFilters} projects={projects} monthBounds={monthBounds} />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {filtersActive && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={clearFilters}>
              <X className="h-3 w-3" /> Limpar filtros
            </Button>
            <span className="ml-auto tabular-nums">
              {data?.sessionCount ?? 0} {data?.sessionCount === 1 ? 'resultado' : 'resultados'}
            </span>
          </div>
        )}
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
            {hourBank.weeks.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-8">Semana</TableHead>
                    <TableHead className="h-8 text-right">Realizado</TableHead>
                    <TableHead className="h-8 text-right">Previsto</TableHead>
                    <TableHead className="h-8 text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hourBank.weeks.map((week, index) => (
                    <TableRow key={`${week.startDate}-${week.endDate}`}>
                      <TableCell className="py-1.5 text-muted-foreground">Semana {index + 1}</TableCell>
                      <TableCell className="py-1.5 text-right tabular-nums">{formatMinutes(week.actualMinutes)}</TableCell>
                      <TableCell className="py-1.5 text-right tabular-nums text-muted-foreground">{formatMinutes(week.expectedMinutes)}</TableCell>
                      <TableCell className="py-1.5 text-right tabular-nums">{formatMinutes(week.balanceMinutes)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <div className={`transition-opacity${isPending || monthLoading ? ' opacity-60 pointer-events-none' : ''}`}>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 animate-shimmer rounded-xl" />
            ))}
          </div>
        ) : dayKeys.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              {filtersActive ? 'Nenhum registro corresponde aos filtros.' : 'Nenhum registro neste mês.'}
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
                  <Card key={entry.id} className="py-2 px-3 hover:bg-muted/40 cursor-default">
                    <div className="flex items-center justify-between text-sm gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {entry.projectColor && (
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: entry.projectColor }}
                          />
                        )}
                        <div className="min-w-0">
                          {(entry.projectName || entry.activityType || entry.source === 'edited' || entry.isPartial) && (
                            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                              {entry.projectName && (
                                <p className="text-xs text-muted-foreground leading-none">{entry.projectName}</p>
                              )}
                              <ActivityTag activityType={entry.activityType} />
                              {entry.source === 'edited' && (
                                <span className="text-xs text-muted-foreground/60 leading-none">(editado)</span>
                              )}
                              {entry.isPartial && (
                                <span className="text-xs text-muted-foreground/60 leading-none">(parcial)</span>
                              )}
                            </div>
                          )}
                          <span className="tabular-nums">
                            {formatBRT(entry.clockIn)} — {formatBRT(entry.clockOut)}
                          </span>
                          {entry.notes && (
                            <p className="text-xs text-muted-foreground/80 leading-snug mt-0.5 truncate">{entry.notes}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {entry.totalMinutes != null && (
                          <span className="text-muted-foreground tabular-nums">{formatMinutes(entry.totalMinutes)}</span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(entry)}
                          aria-label="Editar registro"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(entry.entryId)}
                          aria-label="Apagar registro"
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
              <span>{filtersActive ? 'Total filtrado' : 'Total do mês'}</span>
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
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar registro</DialogTitle>
            <DialogDescription>
              Os horários devem estar no fuso de Brasília (BRT). A alteração ficará registrada no histórico de auditoria.
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
                value={editForm.projectId || 'none'}
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
            <div className="space-y-1.5">
              <Label>Atividade</Label>
              <ActivitySelector
                value={editForm.activityType}
                onChange={(v) => setEditForm((f) => ({ ...f, activityType: v }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-notes">Nota</Label>
              <textarea
                id="edit-notes"
                rows={2}
                maxLength={1000}
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Ex.: revisão da fachada com o cliente"
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
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
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Apagando...' : 'Apagar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
