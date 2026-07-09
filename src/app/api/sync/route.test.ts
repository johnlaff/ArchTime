import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clockEntry: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    project: { findFirst: vi.fn() },
    timeAllocation: {
      updateMany: vi.fn(),
    },
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
  safeRecalculateHourBankForInterval: vi.fn(),
}))

vi.mock('@/lib/hash', () => ({
  generateEntryHash: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { generateEntryHash } from '@/lib/hash'
import { revalidateTag } from 'next/cache'
import { POST } from './route'

const getAuthenticatedUserMock = getAuthenticatedUser as unknown as Mock
const clockEntryFindUniqueMock = prisma.clockEntry.findUnique as unknown as Mock
const clockEntryFindFirstMock = prisma.clockEntry.findFirst as unknown as Mock
const transactionMock = prisma.$transaction as unknown as Mock
const generateEntryHashMock = generateEntryHash as unknown as Mock
const revalidateTagMock = revalidateTag as unknown as Mock

// txMock simula o cliente da transação interativa (prisma.$transaction(async (tx) => ...)).
const txMock = {
  clockEntry: { updateMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  timeAllocation: { updateMany: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
}

function syncRequest(body: Record<string, unknown>) {
  return new NextRequest('https://archtime-live.netlify.app/api/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuthenticatedUserMock.mockResolvedValue({ id: 'user-1' })
    transactionMock.mockImplementation(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof txMock) => unknown)(txMock)
    )
  })

  it('treats an existing offline entry id for the same user as idempotent', async () => {
    clockEntryFindUniqueMock.mockResolvedValue({ id: 'entry-1', userId: 'user-1' })

    const response = await POST(syncRequest({
      type: 'clock_in',
      entryId: 'entry-1',
      timestamp: '2026-04-20T12:00:00.000Z',
    }))

    await expect(response.json()).resolves.toEqual({ ok: true, idempotent: true })
    expect(transactionMock).not.toHaveBeenCalled()
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })

  it('resolves a clock-in id race as idempotent instead of session-open failure', async () => {
    clockEntryFindUniqueMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'entry-1', userId: 'user-1' })
    clockEntryFindFirstMock.mockResolvedValue(null)
    transactionMock.mockRejectedValue({ code: 'P2002' })

    const response = await POST(syncRequest({
      type: 'clock_in',
      entryId: 'entry-1',
      timestamp: '2026-04-20T12:00:00.000Z',
    }))

    await expect(response.json()).resolves.toEqual({ ok: true, idempotent: true })
  })

  it('invalidates the dashboard cache tags after a successful clock_out sync', async () => {
    clockEntryFindFirstMock.mockResolvedValue({
      id: 'entry-1',
      userId: 'user-1',
      clockIn: new Date('2026-04-20T09:00:00.000Z'),
      clockOut: null,
      entryDate: new Date('2026-04-20T00:00:00.000Z'),
      totalMinutes: null,
      source: 'offline_sync',
      allocations: [],
    })
    generateEntryHashMock.mockResolvedValue('hash-value')
    txMock.clockEntry.updateMany.mockResolvedValue({ count: 1 })

    const response = await POST(syncRequest({
      type: 'clock_out',
      entryId: 'entry-1',
      timestamp: '2026-04-20T12:00:00.000Z',
    }))

    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(txMock.clockEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'entry-1', clockOut: null, deletedAt: null } })
    )
    expect(txMock.auditLog.create).toHaveBeenCalledTimes(1)
    expect(revalidateTagMock).toHaveBeenCalledWith('sidebar-user-1', { expire: 0 })
    expect(revalidateTagMock).toHaveBeenCalledWith('history-user-1', { expire: 0 })
    expect(revalidateTagMock).toHaveBeenCalledTimes(2)
  })

  it('treats a clock_out that lost the close race (updateMany count 0) as idempotent without a duplicate audit log', async () => {
    clockEntryFindFirstMock.mockResolvedValue({
      id: 'entry-1',
      userId: 'user-1',
      clockIn: new Date('2026-04-20T09:00:00.000Z'),
      clockOut: null,
      entryDate: new Date('2026-04-20T00:00:00.000Z'),
      totalMinutes: null,
      source: 'offline_sync',
      allocations: [],
    })
    generateEntryHashMock.mockResolvedValue('hash-value')
    txMock.clockEntry.updateMany.mockResolvedValue({ count: 0 })

    const response = await POST(syncRequest({
      type: 'clock_out',
      entryId: 'entry-1',
      timestamp: '2026-04-20T12:00:00.000Z',
    }))

    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(txMock.auditLog.create).not.toHaveBeenCalled()
    expect(txMock.timeAllocation.updateMany).not.toHaveBeenCalled()
  })

  it('does not invalidate the dashboard cache tags for an idempotent clock_out sync', async () => {
    clockEntryFindFirstMock.mockResolvedValue({
      id: 'entry-1',
      userId: 'user-1',
      clockIn: new Date('2026-04-20T09:00:00.000Z'),
      clockOut: new Date('2026-04-20T12:00:00.000Z'),
      entryDate: new Date('2026-04-20T00:00:00.000Z'),
      totalMinutes: 180,
      source: 'offline_sync',
      allocations: [],
    })

    const response = await POST(syncRequest({
      type: 'clock_out',
      entryId: 'entry-1',
      timestamp: '2026-04-20T12:30:00.000Z',
    }))

    await expect(response.json()).resolves.toEqual({ ok: true, idempotent: true })
    expect(transactionMock).not.toHaveBeenCalled()
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })
})
