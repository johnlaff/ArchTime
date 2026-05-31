import { describe, expect, it, vi } from 'vitest'
import { fetchActiveSession, fetchProjects } from '@/lib/client-data'

/** Builds a chainable stub whose terminal `await` resolves to `result`. */
function stubClient(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'order', 'limit']) {
    builder[m] = vi.fn(() => builder)
  }
  // The query is awaited directly (PostgREST builders are thenable).
  ;(builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(result).then(resolve)
  const from = vi.fn(() => builder)
  return { from } as never
}

describe('fetchProjects', () => {
  it('maps snake_case rows to ProjectOption and coerces hourly_rate', async () => {
    const client = stubClient({
      data: [
        { id: 'p1', name: 'A', client_name: 'Cliente', color: '#111111', hourly_rate: '150.00', is_active: true },
        { id: 'p2', name: 'B', client_name: null, color: '#222222', hourly_rate: null, is_active: false },
      ],
      error: null,
    })
    const result = await fetchProjects(client, { activeOnly: false })
    expect(result).toEqual([
      { id: 'p1', name: 'A', clientName: 'Cliente', color: '#111111', hourlyRate: 150, isActive: true },
      { id: 'p2', name: 'B', clientName: null, color: '#222222', hourlyRate: null, isActive: false },
    ])
  })

  it('throws when Supabase returns an error', async () => {
    const client = stubClient({ data: null, error: { message: 'rls denied' } })
    await expect(fetchProjects(client, { activeOnly: true })).rejects.toThrow('rls denied')
  })
})

describe('fetchActiveSession', () => {
  it('maps a nested clock_entry + allocation + project to ActiveSession', async () => {
    const client = stubClient({
      data: [
        {
          id: 'e1',
          clock_in: '2026-05-29T12:00:00+00:00',
          time_allocations: [{ project_id: 'p1', projects: { name: 'A', color: '#111111' } }],
        },
      ],
      error: null,
    })
    const result = await fetchActiveSession(client)
    expect(result).toEqual({
      id: 'e1',
      clockIn: '2026-05-29T12:00:00.000Z',
      projectId: 'p1',
      projectName: 'A',
      projectColor: '#111111',
    })
  })

  it('returns null when there is no open entry', async () => {
    const client = stubClient({ data: [], error: null })
    expect(await fetchActiveSession(client)).toBeNull()
  })

  it('handles an open entry with no project allocation', async () => {
    const client = stubClient({
      data: [{ id: 'e2', clock_in: '2026-05-29T12:00:00+00:00', time_allocations: [] }],
      error: null,
    })
    const result = await fetchActiveSession(client)
    expect(result).toMatchObject({ id: 'e2', projectId: null, projectName: null, projectColor: null })
  })
})
