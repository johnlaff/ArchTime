export interface ActiveSession {
  id: string
  clockIn: string // ISO UTC string
  projectId: string | null
  projectName: string | null
  projectColor: string | null
  activityType: string | null
}

export interface DailySummary {
  totalMinutes: number
  sessionCount: number
  entries: RecentEntry[]
  today: BalanceSummary
  week: BalanceSummary
  month: BalanceSummary & {
    cumulativeBalance: number | null
    showCumulativeBalance: boolean
  }
}

export interface RecentEntry {
  id: string
  clockIn: string
  clockOut: string | null
  totalMinutes: number | null
  projectName: string | null
  projectColor: string | null
  activityType: string | null
  notes: string | null
}

export interface BalanceSummary {
  expectedMinutes: number
  actualMinutes: number
  balanceMinutes: number
}

export interface ProjectOption {
  id: string
  name: string
  clientName: string | null
  color: string
  hourlyRate: number | null
  isActive: boolean
}

export interface HistoryEntry {
  id: string
  entryId: string
  clockIn: string
  clockOut: string
  totalMinutes: number | null
  segmentDate: string
  segmentMinutes: number
  totalEntryMinutes: number | null
  isPartial: boolean
  projectName: string | null
  projectColor: string | null
  projectId: string | null
  activityType: string | null
  notes: string | null
  entryDate: string
  source: string
}

export interface HistoryData {
  entries: HistoryEntry[]
  totalMinutes: number
  sessionCount: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface PendingEntry {
  id: string
  type: 'clock_in' | 'clock_out'
  timestamp: string // ISO string — original client timestamp
  projectId?: string
  activityType?: string // clock_in only — survives the offline path
  entryId?: string // for clock_out: references the offline clock_in id
  createdAt: string
}

export interface FailedPendingEntry extends PendingEntry {
  failedAt: string
  status: number
  error: string
}

// ─── Insights / Activity panel ───

export interface HeatmapDay {
  date: string // YYYY-MM-DD (local BRT)
  totalMinutes: number
  sessionCount: number
  topProject: string | null
  goalMinutes: number // meta prevista do dia (0 em feriado, fim de semana ou sem jornada)
  level: 0 | 1 | 2 | 3 // 0 sem registro · 1 abaixo · 2 dentro · 3 acima da jornada
}

export interface WeekBar {
  date: string // YYYY-MM-DD of this weekday
  dayLabel: string // 'seg' … 'dom'
  weekday: number // 0=dom … 6=sáb
  totalMinutes: number
  goalMinutes: number
}

export interface TrendInsight {
  thisWeekMinutes: number
  lastWeekMinutes: number
  deltaMinutes: number
  deltaPercent: number | null
}

export interface DistributionItem {
  id: string
  name: string
  color: string
  monthMinutes: number
}

export interface ActivityOverview {
  heatmap: HeatmapDay[]
  week: WeekBar[]
  trend: TrendInsight
  distribution: DistributionItem[]
}

// ─── History filters (server-side, complete-month results) ───

export interface HistoryFilters {
  q?: string
  projectId?: string
  activityType?: string
  dateStart?: string // YYYY-MM-DD
  dateEnd?: string // YYYY-MM-DD
}
