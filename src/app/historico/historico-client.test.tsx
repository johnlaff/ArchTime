import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HistoricoClient } from './historico-client'
import type { HistoryBundle } from '@/lib/history'

// Next's useRouter returns a stable reference across renders; mirror that so
// `load` (a useCallback keyed on router) stays stable and effects don't re-run
// every render (an unstable mock causes a refetch loop that doesn't exist in-app).
vi.mock('next/navigation', () => {
  const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }
  return { useRouter: () => router }
})

function makeBundle(weekCount: number): HistoryBundle {
  return {
    history: { entries: [], totalMinutes: 0, sessionCount: 0, page: 1, pageSize: 50, hasMore: false },
    projects: [],
    hourBank: {
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      expectedMinutes: 0,
      actualMinutes: 0,
      balanceMinutes: 0,
      month: '2026-05',
      cumulativeBalance: null,
      showCumulativeBalance: false,
      cumulativeBalanceScope: 'since_start',
      cumulativeStartDate: '2026-01-01',
      weeks: Array.from({ length: weekCount }, (_, i) => ({
        startDate: `2026-05-${String(i * 7 + 1).padStart(2, '0')}`,
        endDate: `2026-05-${String(i * 7 + 7).padStart(2, '0')}`,
        expectedMinutes: 0,
        actualMinutes: 0,
        balanceMinutes: 0,
      })),
    },
    settings: {} as HistoryBundle['settings'],
  }
}

afterEach(() => cleanup())

describe('HistoricoClient mount revalidation (week-start / settings freshness)', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Fresh server data has 5 weeks; the (stale) initialBundle has 4.
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => makeBundle(5),
    }))
    vi.stubGlobal('fetch', fetchMock)
  })

  it('revalidates /api/history on mount even with an initialBundle, with no-store, and updates the view', async () => {
    render(<HistoricoClient initialMonth="2026-05" initialBundle={makeBundle(4)} />)

    // Must fetch fresh on mount (the bug: it trusted the cached/prefetched initialBundle).
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/history')
    expect(url).toContain('month=2026-05')
    // Must bypass the browser cache so a just-changed weekStartDay is reflected.
    expect(init).toMatchObject({ cache: 'no-store' })

    // The fresh bundle (5 weeks) must replace the stale initialBundle (4 weeks).
    expect(await screen.findByText('Semana 5')).toBeTruthy()
  })

  it('refetches /api/history when settings change while mounted (closes the cold-save race)', async () => {
    render(<HistoricoClient initialMonth="2026-05" initialBundle={makeBundle(4)} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    // The user changed weekStartDay; the save just committed and broadcast the event
    // while histórico is already mounted (they navigated here during the in-flight save).
    act(() => {
      window.dispatchEvent(new Event('archtime:settings-changed'))
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, init] = fetchMock.mock.calls[1]
    expect(init).toMatchObject({ cache: 'no-store' })
  })
})
