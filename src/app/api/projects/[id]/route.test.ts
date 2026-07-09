import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: { findFirst: vi.fn() },
    timeAllocation: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/server/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/server/security', () => ({ validateMutationOrigin: vi.fn(() => null) }))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { DELETE } from './route'

const getAuthenticatedUserMock = getAuthenticatedUser as unknown as Mock
const projectFindFirstMock = prisma.project.findFirst as unknown as Mock
const timeAllocationCountMock = prisma.timeAllocation.count as unknown as Mock
const transactionMock = prisma.$transaction as unknown as Mock

// txMock simula o cliente da transação interativa (prisma.$transaction(async (tx) => ...)).
const txMock = {
  project: { update: vi.fn(), delete: vi.fn() },
  auditLog: { create: vi.fn() },
}

function baseProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'project-1',
    userId: 'user-1',
    name: 'Casa Alfa',
    clientName: null,
    hourlyRate: null,
    color: '#6366f1',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function req() {
  return new NextRequest('https://archtime-live.netlify.app/api/projects/project-1', {
    method: 'DELETE',
  })
}
const params = () => Promise.resolve({ id: 'project-1' })

describe('DELETE /api/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuthenticatedUserMock.mockResolvedValue({ id: 'user-1' })
    transactionMock.mockImplementation(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof txMock) => unknown)(txMock)
    )
  })

  it('returns 404 for a project owned by another user without opening a transaction', async () => {
    projectFindFirstMock.mockResolvedValue(null)

    const response = await DELETE(req(), { params: params() })

    expect(response.status).toBe(404)
    expect(transactionMock).not.toHaveBeenCalled()
    expect(timeAllocationCountMock).not.toHaveBeenCalled()
  })

  it('archives instead of deleting when the project has time allocations', async () => {
    projectFindFirstMock.mockResolvedValue(baseProject())
    timeAllocationCountMock.mockResolvedValue(3)
    txMock.project.update.mockResolvedValue(baseProject({ isActive: false }))

    const response = await DELETE(req(), { params: params() })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.archivedInsteadOfDeleted).toBe(true)
    expect(txMock.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'project-1' }, data: expect.objectContaining({ isActive: false }) })
    )
    expect(txMock.project.delete).not.toHaveBeenCalled()
    expect(txMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'archive_project_with_entries',
          entityId: 'project-1',
          oldData: expect.objectContaining({ allocationCount: 3 }),
          newData: expect.objectContaining({ allocationCount: 3 }),
        }),
      })
    )
  })

  it('hard-deletes when the project has no time allocations', async () => {
    projectFindFirstMock.mockResolvedValue(baseProject())
    timeAllocationCountMock.mockResolvedValue(0)

    const response = await DELETE(req(), { params: params() })

    expect(response.status).toBe(204)
    expect(txMock.project.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'project-1' } })
    )
    expect(txMock.project.update).not.toHaveBeenCalled()
    expect(txMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'delete_project' }) })
    )
  })
})
