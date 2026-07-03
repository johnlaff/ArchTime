import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyEntryHash } from '@/lib/hash'
import { getAuthenticatedUser } from '@/lib/server/auth'

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entries = await prisma.clockEntry.findMany({
    where: { userId: user.id, deletedAt: null, clockOut: { not: null } },
    select: { id: true, clockIn: true, clockOut: true, entryDate: true, hash: true },
  })

  let unhashed = 0
  const mismatches: { id: string; entryDate: string }[] = []

  for (const entry of entries) {
    const entryDate = entry.entryDate.toISOString().slice(0, 10)
    if (entry.hash === null) {
      unhashed += 1
      continue
    }
    const valid = await verifyEntryHash(
      {
        clockIn: entry.clockIn.toISOString(),
        clockOut: entry.clockOut!.toISOString(),
        userId: user.id,
        entryDate,
      },
      entry.hash
    )
    if (!valid) {
      mismatches.push({ id: entry.id, entryDate })
    }
  }

  return NextResponse.json(
    { checked: entries.length, unhashed, mismatches },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
