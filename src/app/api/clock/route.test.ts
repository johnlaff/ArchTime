import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clockEntry: { findFirst: vi.fn(), create: vi.fn() },
    project: { findFirst: vi.fn() },
    timeAllocation: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/server/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/server/security', () => ({
  validateMutationOrigin: vi.fn(() => null),
}))

vi.mock('@/lib/hour-bank', () => ({
  recalculateHourBankForInterval: vi.fn(),
}))

vi.mock('@/lib/hash', () => ({
  generateEntryHash: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { revalidateTag } from 'next/cache'
import { POST } from './route'

const getAuthenticatedUserMock = getAuthenticatedUser as unknown as Mock
const projectFindFirstMock = prisma.project.findFirst as unknown as Mock
const transactionMock = prisma.$transaction as unknown as Mock
const revalidateTagMock = revalidateTag as unknown as Mock

// txMock simulates the interactive transaction client passed to callbacks
// used by the route (prisma.$transaction(async (tx) => ...)).
const txMock = {
  clockEntry: { findFirst: vi.fn(), create: vi.fn() },
  timeAllocation: { create: vi.fn() },
  auditLog: { create: vi.fn() },
}

function clockRequest(body: Record<string, unknown> = {}) {
  return new NextRequest('https://archtime-live.netlify.app/api/clock', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/clock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuthenticatedUserMock.mockResolvedValue({ id: 'user-1' })
    txMock.clockEntry.findFirst.mockResolvedValue(null)
    txMock.clockEntry.create.mockResolvedValue({ id: 'entry-1', userId: 'user-1' })
    transactionMock.mockImplementation(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof txMock) => unknown)(txMock)
    )
  })

  it('returns 401 when there is no authenticated user', async () => {
    getAuthenticatedUserMock.mockResolvedValue(null)

    const response = await POST(clockRequest({}))

    expect(response.status).toBe(401)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid activity type', async () => {
    const response = await POST(clockRequest({ activityType: 'invalida' }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Atividade inválida' })
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('returns 404 for a nonexistent or inactive project', async () => {
    projectFindFirstMock.mockResolvedValue(null)

    const response = await POST(clockRequest({ projectId: 'project-1' }))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Projeto inválido' })
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('returns 409 with the open entry id when a session is already open', async () => {
    txMock.clockEntry.findFirst.mockResolvedValue({ id: 'open-1' })

    const response = await POST(clockRequest({}))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Já existe uma entrada em aberto',
      entryId: 'open-1',
    })
  })

  it('creates the entry, writes an audit log and revalidates cache tags on success', async () => {
    txMock.clockEntry.create.mockResolvedValue({ id: 'entry-1', userId: 'user-1', clockIn: new Date() })

    const response = await POST(clockRequest({ activityType: 'obra' }))

    expect(response.status).toBe(201)
    expect(txMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'clock_in' }),
      })
    )
    expect(revalidateTagMock).toHaveBeenCalledWith('sidebar-user-1', { expire: 0 })
    expect(revalidateTagMock).toHaveBeenCalledWith('history-user-1', { expire: 0 })
    expect(revalidateTagMock).toHaveBeenCalledTimes(2)
  })

  it('returns 409 when the transaction fails with a unique constraint violation (P2002)', async () => {
    transactionMock.mockRejectedValue({ code: 'P2002' })
    ;(prisma.clockEntry.findFirst as unknown as Mock).mockResolvedValue({ id: 'open-2' })

    const response = await POST(clockRequest({}))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Já existe uma entrada em aberto',
      entryId: 'open-2',
    })
  })
})
