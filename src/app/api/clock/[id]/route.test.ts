import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clockEntry: { findFirst: vi.fn() },
    project: { findFirst: vi.fn() },
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
  safeRecalculateHourBankForIntervals: vi.fn(),
}))

vi.mock('@/lib/hash', () => ({
  generateEntryHash: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/server/auth'
import {
  safeRecalculateHourBankForInterval,
  safeRecalculateHourBankForIntervals,
} from '@/lib/hour-bank'
import { generateEntryHash } from '@/lib/hash'
import { revalidateTag } from 'next/cache'
import { DELETE, PATCH, PUT } from './route'

const getAuthenticatedUserMock = getAuthenticatedUser as unknown as Mock
const clockEntryFindFirstMock = prisma.clockEntry.findFirst as unknown as Mock
const projectFindFirstMock = prisma.project.findFirst as unknown as Mock
const transactionMock = prisma.$transaction as unknown as Mock
const safeRecalculateHourBankForIntervalMock = safeRecalculateHourBankForInterval as unknown as Mock
const safeRecalculateHourBankForIntervalsMock = safeRecalculateHourBankForIntervals as unknown as Mock
const generateEntryHashMock = generateEntryHash as unknown as Mock
const revalidateTagMock = revalidateTag as unknown as Mock

// txMock simulates the interactive transaction client passed to the callbacks
// used by PUT/DELETE/PATCH (prisma.$transaction(async (tx) => ...)).
const txMock = {
  clockEntry: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  timeAllocation: { updateMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
}

interface TestEntry {
  id: string
  userId: string
  clockIn: Date
  clockOut: Date | null
  entryDate: Date
  totalMinutes: number | null
  activityType: string | null
  notes: string | null
  hash: string | null
  source: string
  allocations: Array<{ projectId: string; project: { id: string; name: string; color: string } }>
}

function makeEntry(overrides: Partial<TestEntry> = {}): TestEntry {
  return {
    id: 'entry-1',
    userId: 'user-1',
    clockIn: new Date('2026-04-20T09:00:00.000Z'),
    clockOut: null,
    entryDate: new Date('2026-04-20T00:00:00.000Z'),
    totalMinutes: null,
    activityType: 'obra',
    notes: null,
    hash: null,
    source: 'web',
    allocations: [],
    ...overrides,
  }
}

function req(method: string, body?: Record<string, unknown>) {
  return new NextRequest(`https://archtime-live.netlify.app/api/clock/entry-1`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}

const params = () => Promise.resolve({ id: 'entry-1' })

describe('/api/clock/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuthenticatedUserMock.mockResolvedValue({ id: 'user-1' })
    generateEntryHashMock.mockResolvedValue('hash-value')
    transactionMock.mockImplementation(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof txMock) => unknown)(txMock)
    )
  })

  describe('PUT (clock-out)', () => {
    it('returns 404 for a nonexistent entry', async () => {
      clockEntryFindFirstMock.mockResolvedValue(null)

      const response = await PUT(req('PUT'), { params: params() })

      expect(response.status).toBe(404)
      expect(transactionMock).not.toHaveBeenCalled()
    })

    it('is idempotent when the entry is already closed and does not open a transaction', async () => {
      const entry = makeEntry({
        clockOut: new Date('2026-04-20T12:00:00.000Z'),
        totalMinutes: 180,
        allocations: [{ projectId: 'project-1', project: { id: 'project-1', name: 'Proj', color: '#111111' } }],
      })
      clockEntryFindFirstMock.mockResolvedValue(entry)

      const response = await PUT(req('PUT'), { params: params() })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        id: entry.id,
        clockIn: entry.clockIn.toISOString(),
        clockOut: entry.clockOut!.toISOString(),
        totalMinutes: entry.totalMinutes,
        source: entry.source,
        projectId: 'project-1',
        projectName: 'Proj',
        projectColor: '#111111',
        activityType: entry.activityType,
      })
      expect(transactionMock).not.toHaveBeenCalled()
    })

    it('closes an open entry: hashes it, audits it, recalculates the hour bank and revalidates cache tags', async () => {
      const entry = makeEntry()
      clockEntryFindFirstMock.mockResolvedValue(entry)
      const clockOut = new Date('2026-04-20T12:00:00.000Z')
      txMock.clockEntry.updateMany.mockResolvedValue({ count: 1 })
      txMock.clockEntry.findUnique.mockResolvedValue({ ...entry, clockOut, totalMinutes: 180, hash: 'hash-value' })

      const response = await PUT(req('PUT', { clockOutAt: clockOut.toISOString() }), { params: params() })

      expect(response.status).toBe(200)
      expect(txMock.clockEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'entry-1', clockOut: null, deletedAt: null } })
      )
      expect(generateEntryHashMock).toHaveBeenCalledWith({
        clockIn: entry.clockIn.toISOString(),
        clockOut: clockOut.toISOString(),
        userId: 'user-1',
        entryDate: entry.entryDate.toISOString().slice(0, 10),
      })
      expect(txMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'clock_out' }) })
      )
      expect(safeRecalculateHourBankForIntervalMock).toHaveBeenCalledWith('user-1', entry.clockIn, clockOut)
      expect(revalidateTagMock).toHaveBeenCalledWith('sidebar-user-1', { expire: 0 })
      expect(revalidateTagMock).toHaveBeenCalledWith('history-user-1', { expire: 0 })
      expect(revalidateTagMock).toHaveBeenCalledTimes(2)
    })

    it('is idempotent when a concurrent request closes the entry first (updateMany affects 0 rows) without duplicating the audit log', async () => {
      const entry = makeEntry({
        allocations: [{ projectId: 'project-1', project: { id: 'project-1', name: 'Proj', color: '#111111' } }],
      })
      clockEntryFindFirstMock.mockResolvedValue(entry)
      const clockOut = new Date('2026-04-20T12:00:00.000Z')
      // A sessão ainda estava aberta no getEntry, mas outra requisição a fechou antes do commit.
      txMock.clockEntry.updateMany.mockResolvedValue({ count: 0 })
      txMock.clockEntry.findUnique.mockResolvedValue({
        clockIn: entry.clockIn,
        clockOut,
        totalMinutes: 180,
        source: entry.source,
        activityType: entry.activityType,
      })

      const response = await PUT(req('PUT', { clockOutAt: clockOut.toISOString() }), { params: params() })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        id: 'entry-1',
        clockIn: entry.clockIn.toISOString(),
        clockOut: clockOut.toISOString(),
        totalMinutes: 180,
        source: entry.source,
        projectId: 'project-1',
        projectName: 'Proj',
        projectColor: '#111111',
        activityType: entry.activityType,
      })
      expect(txMock.auditLog.create).not.toHaveBeenCalled()
      expect(txMock.timeAllocation.updateMany).not.toHaveBeenCalled()
      expect(safeRecalculateHourBankForIntervalMock).not.toHaveBeenCalled()
    })

    it('returns 400 when clockOutAt is before clockIn', async () => {
      const entry = makeEntry()
      clockEntryFindFirstMock.mockResolvedValue(entry)

      const response = await PUT(
        req('PUT', { clockOutAt: '2026-04-20T08:00:00.000Z' }),
        { params: params() }
      )

      expect(response.status).toBe(400)
      expect(transactionMock).not.toHaveBeenCalled()
    })
  })

  describe('DELETE', () => {
    it('returns 409 when the session is still open', async () => {
      clockEntryFindFirstMock.mockResolvedValue(makeEntry({ clockOut: null }))

      const response = await DELETE(req('DELETE'), { params: params() })

      expect(response.status).toBe(409)
      expect(transactionMock).not.toHaveBeenCalled()
    })

    it('soft-deletes a closed entry, audits it and returns 204', async () => {
      const entry = makeEntry({ clockOut: new Date('2026-04-20T12:00:00.000Z'), totalMinutes: 180 })
      clockEntryFindFirstMock.mockResolvedValue(entry)
      txMock.clockEntry.update.mockResolvedValue({ ...entry, deletedAt: new Date(), deletedBy: 'user-1' })

      const response = await DELETE(req('DELETE'), { params: params() })

      expect(response.status).toBe(204)
      expect(txMock.clockEntry.update).toHaveBeenCalledWith({
        where: { id: 'entry-1' },
        data: expect.objectContaining({ deletedBy: 'user-1', deletedAt: expect.any(Date) }),
      })
      expect(txMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'delete_entry' }) })
      )
      expect(safeRecalculateHourBankForIntervalMock).toHaveBeenCalledWith('user-1', entry.clockIn, entry.clockOut)
    })
  })

  describe('PATCH (edit)', () => {
    it('returns 400 when no times are provided', async () => {
      const response = await PATCH(req('PATCH', {}), { params: params() })

      expect(response.status).toBe(400)
      expect(clockEntryFindFirstMock).not.toHaveBeenCalled()
    })

    it('edits a closed entry: swaps the project allocation, audits it and recalculates both intervals', async () => {
      const entry = makeEntry({
        clockOut: new Date('2026-04-20T12:00:00.000Z'),
        totalMinutes: 180,
        allocations: [{ projectId: 'old-project', project: { id: 'old-project', name: 'Old', color: '#000000' } }],
      })
      clockEntryFindFirstMock.mockResolvedValue(entry)
      projectFindFirstMock.mockResolvedValue({ id: 'project-1', name: 'Novo Projeto', color: '#ff0000' })
      txMock.clockEntry.update.mockResolvedValue({
        ...entry,
        clockIn: new Date('2026-04-20T09:30:00.000Z'),
        clockOut: new Date('2026-04-20T12:30:00.000Z'),
        totalMinutes: 180,
      })

      const response = await PATCH(
        req('PATCH', { clockInAt: '2026-04-20T09:30', clockOutAt: '2026-04-20T12:30', projectId: 'project-1' }),
        { params: params() }
      )

      expect(response.status).toBe(200)
      expect(txMock.timeAllocation.deleteMany).toHaveBeenCalledWith({ where: { clockEntryId: 'entry-1' } })
      expect(txMock.timeAllocation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ clockEntryId: 'entry-1', projectId: 'project-1' }),
      })
      expect(txMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'edit_entry' }) })
      )
      expect(safeRecalculateHourBankForIntervalsMock).toHaveBeenCalledTimes(1)
      expect(safeRecalculateHourBankForIntervalsMock).toHaveBeenCalledWith('user-1', [
        { clockIn: entry.clockIn, clockOut: entry.clockOut },
        { clockIn: expect.any(Date), clockOut: expect.any(Date) },
      ])
      expect(revalidateTagMock).toHaveBeenCalledTimes(2)
    })
  })
})
