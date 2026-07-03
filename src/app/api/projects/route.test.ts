import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
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

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { GET, POST, PUT } from './route'

const getAuthenticatedUserMock = getAuthenticatedUser as unknown as Mock
const projectFindManyMock = prisma.project.findMany as unknown as Mock
const projectFindFirstMock = prisma.project.findFirst as unknown as Mock
const transactionMock = prisma.$transaction as unknown as Mock

// txMock simulates the interactive transaction client passed to callbacks
// used by the route (prisma.$transaction(async (tx) => ...)).
const txMock = {
  project: { create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
}

// Prisma Decimal serializes via toString; Number() coerces it to a number.
function decimalLike(value: string) {
  return { toString: () => value }
}

function baseProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'project-1',
    userId: 'user-1',
    name: 'Casa Alfa',
    clientName: null,
    hourlyRate: decimalLike('150'),
    color: '#6366f1',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

function projectsRequest(method: 'POST' | 'PUT', body: Record<string, unknown>) {
  return new NextRequest('https://archtime-live.netlify.app/api/projects', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuthenticatedUserMock.mockResolvedValue({ id: 'user-1' })
    transactionMock.mockImplementation(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof txMock) => unknown)(txMock)
    )
  })

  it('GET serializes hourlyRate as a number (Decimal-like) and keeps null as null', async () => {
    projectFindManyMock.mockResolvedValue([
      baseProject(),
      baseProject({ id: 'project-2', name: 'Casa Beta', hourlyRate: null }),
    ])

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toHaveLength(2)
    expect(body[0].hourlyRate).toBe(150)
    expect(typeof body[0].hourlyRate).toBe('number')
    expect(body[1].hourlyRate).toBeNull()
  })

  it('POST creates the project with an audit log and returns hourlyRate as a number', async () => {
    txMock.project.create.mockResolvedValue(baseProject())

    const response = await POST(
      projectsRequest('POST', { name: 'Casa Alfa', hourlyRate: 150 })
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.hourlyRate).toBe(150)
    expect(typeof body.hourlyRate).toBe('number')
    expect(txMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'create_project',
          entityId: 'project-1',
          newData: expect.objectContaining({ hourlyRate: 150 }),
        }),
      })
    )
  })

  it('PUT updates the project with an audit log containing oldData and newData', async () => {
    projectFindFirstMock.mockResolvedValue(baseProject())
    txMock.project.update.mockResolvedValue(
      baseProject({ name: 'Casa Alfa 2', hourlyRate: decimalLike('200') })
    )

    const response = await PUT(
      projectsRequest('PUT', { id: 'project-1', name: 'Casa Alfa 2', hourlyRate: 200 })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.hourlyRate).toBe(200)
    expect(txMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'update_project',
          entityId: 'project-1',
          oldData: expect.objectContaining({ name: 'Casa Alfa', hourlyRate: 150 }),
          newData: expect.objectContaining({ name: 'Casa Alfa 2', hourlyRate: 200 }),
        }),
      })
    )
  })

  it('PUT returns 404 for a project owned by another user without opening a transaction', async () => {
    projectFindFirstMock.mockResolvedValue(null)

    const response = await PUT(
      projectsRequest('PUT', { id: 'project-x', name: 'Invasor' })
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Não encontrado' })
    expect(transactionMock).not.toHaveBeenCalled()
  })
})
