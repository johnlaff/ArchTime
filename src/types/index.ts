export interface ActiveSession {
  id: string
  clockIn: string // ISO UTC string
  projectId: string | null
  projectName: string | null
  projectColor: string | null
}

export interface DailySummary {
  totalMinutes: number
  sessionCount: number
  entries: RecentEntry[]
}

export interface RecentEntry {
  id: string
  clockIn: string
  clockOut: string | null
  totalMinutes: number | null
  projectName: string | null
  projectColor: string | null
}

export interface ProjectOption {
  id: string
  name: string
  clientName: string | null
  color: string
  hourlyRate: number | null
  isActive: boolean
}

export interface PendingEntry {
  id: string
  type: 'clock_in' | 'clock_out'
  timestamp: string // ISO string — original client timestamp
  projectId?: string
  entryId?: string // for clock_out: references the offline clock_in id
  createdAt: string
}
