import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clockEntry: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/server/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

// NOTE: @/lib/hash is intentionally NOT mocked — the route must verify against
// the real HMAC so the test exercises the actual tamper-evidence logic.
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { generateEntryHash } from '@/lib/hash'
import { GET } from './route'

const findManyMock = prisma.clockEntry.findMany as unknown as Mock
const getAuthenticatedUserMock = getAuthenticatedUser as unknown as Mock

const clockIn = new Date('2026-02-22T09:00:00.000Z')
const clockOut = new Date('2026-02-22T17:00:00.000Z')
const entryDate = new Date('2026-02-22T00:00:00.000Z')

async function validHash() {
  return generateEntryHash({
    clockIn: clockIn.toISOString(),
    clockOut: clockOut.toISOString(),
    userId: 'user-1',
    entryDate: entryDate.toISOString().slice(0, 10),
  })
}

function baseEntry(overrides: Record<string, unknown> = {}) {
  return { id: 'entry-1', clockIn, clockOut, entryDate, hash: null, ...overrides }
}

describe('GET /api/integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuthenticatedUserMock.mockResolvedValue({ id: 'user-1' })
  })

  it('returns 401 when the user is not authenticated', async () => {
    getAuthenticatedUserMock.mockResolvedValue(null)

    const response = await GET()

    expect(response.status).toBe(401)
    expect(findManyMock).not.toHaveBeenCalled()
  })

  it('reports no mismatches for an entry with a valid hash', async () => {
    findManyMock.mockResolvedValue([baseEntry({ hash: await validHash() })])

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ checked: 1, unhashed: 0, malformed: [], mismatches: [], unverifiable: [] })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('flags a tampered hash as a mismatch with its id and entryDate', async () => {
    findManyMock.mockResolvedValue([
      baseEntry({ hash: 'hmac-v1:0000000000000000000000000000000000000000000000000000000000000000' }),
    ])

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.checked).toBe(1)
    expect(body.unhashed).toBe(0)
    expect(body.malformed).toEqual([])
    expect(body.mismatches).toEqual([{ id: 'entry-1', entryDate: '2026-02-22' }])
    expect(body.unverifiable).toEqual([])
  })

  it('counts an entry with a null hash as unhashed, not a mismatch', async () => {
    findManyMock.mockResolvedValue([baseEntry({ hash: null })])

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ checked: 1, unhashed: 1, malformed: [], mismatches: [], unverifiable: [] })
  })

  it('reports an unavailable key separately from a tampered hash', async () => {
    findManyMock.mockResolvedValue([
      baseEntry({ hash: `hmac-v1:k2027-01:${'0'.repeat(64)}` }),
    ])

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      checked: 1,
      unhashed: 0,
      malformed: [],
      mismatches: [],
      unverifiable: [{ id: 'entry-1', entryDate: '2026-02-22', keyId: 'k2027-01' }],
    })
  })

  it('reports a malformed hash separately from a tampered hash', async () => {
    findManyMock.mockResolvedValue([baseEntry({ hash: 'hmac-v1:k2026-07:incompleto' })])

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      checked: 1,
      unhashed: 0,
      malformed: [{ id: 'entry-1', entryDate: '2026-02-22' }],
      mismatches: [],
      unverifiable: [],
    })
  })
})
