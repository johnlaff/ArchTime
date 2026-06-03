import { describe, it, expect } from 'vitest'
import { hasActiveFilters, matchesFilters } from '@/lib/history-filters'
import type { HistoryEntry } from '@/types'

function segment(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'e1:2026-05-10',
    entryId: 'e1',
    clockIn: '2026-05-10T12:00:00Z',
    clockOut: '2026-05-10T15:00:00Z',
    totalMinutes: 180,
    segmentDate: '2026-05-10',
    segmentMinutes: 180,
    totalEntryMinutes: 180,
    isPartial: false,
    projectName: 'Residência Silva',
    projectColor: '#6366f1',
    projectId: 'p1',
    activityType: 'modelagem',
    notes: 'revisão da fachada',
    entryDate: '2026-05-10',
    source: 'web',
    ...overrides,
  }
}

describe('matchesFilters', () => {
  it('matches everything when no filters are set', () => {
    expect(matchesFilters(segment(), {})).toBe(true)
  })

  it('filters by project', () => {
    expect(matchesFilters(segment(), { projectId: 'p1' })).toBe(true)
    expect(matchesFilters(segment(), { projectId: 'p2' })).toBe(false)
  })

  it('filters by activity (including null activity)', () => {
    expect(matchesFilters(segment(), { activityType: 'modelagem' })).toBe(true)
    expect(matchesFilters(segment(), { activityType: 'obra' })).toBe(false)
    expect(matchesFilters(segment({ activityType: null }), { activityType: 'modelagem' })).toBe(false)
  })

  it('filters by inclusive date range', () => {
    expect(matchesFilters(segment(), { dateStart: '2026-05-01', dateEnd: '2026-05-31' })).toBe(true)
    expect(matchesFilters(segment(), { dateStart: '2026-05-11' })).toBe(false)
    expect(matchesFilters(segment(), { dateEnd: '2026-05-09' })).toBe(false)
    expect(matchesFilters(segment(), { dateStart: '2026-05-10', dateEnd: '2026-05-10' })).toBe(true)
  })

  it('text search spans project, activity label and notes, case-insensitively', () => {
    expect(matchesFilters(segment(), { q: 'silva' })).toBe(true) // project name
    expect(matchesFilters(segment(), { q: 'Modelagem' })).toBe(true) // activity label
    expect(matchesFilters(segment(), { q: 'FACHADA' })).toBe(true) // notes
    expect(matchesFilters(segment(), { q: 'inexistente' })).toBe(false)
  })

  it('combines filters with AND', () => {
    expect(matchesFilters(segment(), { projectId: 'p1', activityType: 'obra' })).toBe(false)
    expect(matchesFilters(segment(), { projectId: 'p1', q: 'silva' })).toBe(true)
  })

  it('handles null project/notes/activity safely in text search', () => {
    const bare = segment({ projectName: null, notes: null, activityType: null })
    expect(matchesFilters(bare, { q: 'anything' })).toBe(false)
    expect(matchesFilters(bare, {})).toBe(true)
  })
})

describe('hasActiveFilters', () => {
  it('is false for an empty filter set', () => {
    expect(hasActiveFilters({})).toBe(false)
  })

  it('is true when any field is set', () => {
    expect(hasActiveFilters({ q: 'x' })).toBe(true)
    expect(hasActiveFilters({ projectId: 'p' })).toBe(true)
    expect(hasActiveFilters({ activityType: 'obra' })).toBe(true)
    expect(hasActiveFilters({ dateStart: '2026-01-01' })).toBe(true)
    expect(hasActiveFilters({ dateEnd: '2026-01-01' })).toBe(true)
  })
})
