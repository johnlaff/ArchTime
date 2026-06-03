import { activityLabel } from '@/lib/activity-types'
import type { HistoryEntry, HistoryFilters } from '@/types'

type FilterableSegment = Pick<
  HistoryEntry,
  'projectId' | 'activityType' | 'segmentDate' | 'projectName' | 'notes'
>

/**
 * Whether a history segment matches the active filters. Applied server-side over the
 * month's FULL segment list before pagination, so matches on not-yet-loaded pages are
 * never silently dropped. Text search spans project name, activity label and notes.
 */
export function matchesFilters(segment: FilterableSegment, filters: HistoryFilters): boolean {
  if (filters.projectId && segment.projectId !== filters.projectId) return false
  if (filters.activityType && segment.activityType !== filters.activityType) return false
  if (filters.dateStart && segment.segmentDate < filters.dateStart) return false
  if (filters.dateEnd && segment.segmentDate > filters.dateEnd) return false
  if (filters.q) {
    const haystack = [
      segment.projectName ?? '',
      activityLabel(segment.activityType) ?? '',
      segment.notes ?? '',
    ]
      .join(' ')
      .toLowerCase()
    if (!haystack.includes(filters.q.toLowerCase())) return false
  }
  return true
}

export function hasActiveFilters(filters: HistoryFilters): boolean {
  return Boolean(
    filters.q || filters.projectId || filters.activityType || filters.dateStart || filters.dateEnd
  )
}
