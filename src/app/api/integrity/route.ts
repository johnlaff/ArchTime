import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyEntryHashDetailed } from '@/lib/hash'
import { getAuthenticatedUser } from '@/lib/server/auth'

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entries = await prisma.clockEntry.findMany({
    where: { userId: user.id, deletedAt: null, clockOut: { not: null } },
    select: { id: true, clockIn: true, clockOut: true, entryDate: true, hash: true },
  })

  let unhashed = 0
  const malformed: { id: string; entryDate: string }[] = []
  const mismatches: { id: string; entryDate: string }[] = []
  const unverifiable: { id: string; entryDate: string; keyId: string }[] = []

  for (const entry of entries) {
    const entryDate = entry.entryDate.toISOString().slice(0, 10)
    if (entry.hash === null) {
      unhashed += 1
      continue
    }
    const verification = await verifyEntryHashDetailed(
      {
        clockIn: entry.clockIn.toISOString(),
        clockOut: entry.clockOut!.toISOString(),
        userId: user.id,
        entryDate,
      },
      entry.hash
    )
    if (verification.status === 'malformed') {
      malformed.push({ id: entry.id, entryDate })
    } else if (verification.status === 'unknown-key') {
      unverifiable.push({ id: entry.id, entryDate, keyId: verification.keyId })
    } else if (verification.status === 'mismatch') {
      mismatches.push({ id: entry.id, entryDate })
    }
  }

  return NextResponse.json(
    { checked: entries.length, unhashed, malformed, mismatches, unverifiable },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
