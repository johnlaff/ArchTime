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
  recalculateHourBankForInterval: vi.fn(),
}))

vi.mock('@/lib/hash', () => ({
  generateEntryHash: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { POST } from './route'

const getAuthenticatedUserMock = getAuthenticatedUser as unknown as Mock
const clockEntryFindUniqueMock = prisma.clockEntry.findUnique as unknown as Mock
const clockEntryFindFirstMock = prisma.clockEntry.findFirst as unknown as Mock
const transactionMock = prisma.$transaction as unknown as Mock

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
})
