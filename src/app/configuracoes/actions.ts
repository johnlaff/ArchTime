'use server'

import { revalidateTag } from 'next/cache'
import { getAuthenticatedUser } from '@/lib/server/auth'
import {
  parseSettingsPatch,
  updateUserSettings,
  type SerializedUserSettings,
} from '@/lib/user-settings'

export type SaveSettingsResult =
  | { settings: SerializedUserSettings }
  | { error: string }

/**
 * Persists user settings from the Configurações "Salvar" action.
 *
 * Runs as a Server Action (not a route handler) on purpose: revalidating from a
 * Server Action clears the ENTIRE client Router Cache, so the dashboard, histórico
 * and sidebar reflect week-start / work-schedule changes on the next navigation.
 * A client-side router.refresh() only clears the current route, which left other
 * modules stale until a manual reload.
 */
// react-doctor-disable-next-line react-doctor/server-auth-actions -- getAuthenticatedUser() valida o JWT (getClaims + isAllowedEmail) e retorna cedo se não autenticado, antes de qualquer escrita; ver src/lib/server/auth.ts
export async function saveSettings(input: SerializedUserSettings): Promise<SaveSettingsResult> {
  const user = await getAuthenticatedUser()
  if (!user) return { error: 'Não autenticado' }

  const parsed = parseSettingsPatch(input as unknown as Record<string, unknown>)
  if (typeof parsed === 'string') return { error: parsed }

  const settings = await updateUserSettings(user.id, parsed)

  revalidateTag(`history-${user.id}`, { expire: 0 })
  revalidateTag(`sidebar-${user.id}`, { expire: 0 })

  return { settings }
}
