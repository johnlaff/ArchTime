import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import {
  getOrCreateUserSettings,
  parseSettingsPatch,
  settingsOptions,
  updateUserSettings,
} from '@/lib/user-settings'
import { getAuthenticatedUser } from '@/lib/server/auth'
import { validateMutationOrigin } from '@/lib/server/security'
import { safeJsonObject } from '@/lib/server/validation'

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await getOrCreateUserSettings(user.id)
  return NextResponse.json({ settings, options: settingsOptions })
}

export async function PATCH(req: NextRequest) {
  const originError = validateMutationOrigin(req)
  if (originError) return originError

  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = safeJsonObject(await req.json())
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const patch = parseSettingsPatch(body)
  if (typeof patch === 'string') {
    return NextResponse.json({ error: patch }, { status: 400 })
  }

  const settings = await updateUserSettings(user.id, patch)

  // Settings (week start, work schedule, cumulative scope) feed the cached
  // hour-bank / history / sidebar data — bust those so other modules recompute.
  revalidateTag(`history-${user.id}`, { expire: 0 })
  revalidateTag(`sidebar-${user.id}`, { expire: 0 })

  return NextResponse.json({ settings, options: settingsOptions })
}
