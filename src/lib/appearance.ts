import {
  isAccentPreset,
  isThemeMode,
  type AccentPreset,
  type ThemeMode,
} from '@/lib/preferences'

const LOCAL_PREFERENCE_GRACE_MS = 10_000
const LOCAL_PREFERENCE_UPDATED_AT_KEY = 'archtime-preferences-updated-at'
const ACCENT_STORAGE_KEY = 'archtime-accent'
const THEME_STORAGE_KEY = 'theme'

export interface AppearancePatch {
  accentPreset?: AccentPreset
  themeMode?: ThemeMode
}

export function getNextThemeMode(resolvedTheme: string | undefined): Exclude<ThemeMode, 'system'> {
  return resolvedTheme === 'dark' ? 'light' : 'dark'
}

export function shouldApplyRemotePreferences(
  hydrationStartedAt: number,
  lastLocalChangeAt: number | null,
  graceMs = LOCAL_PREFERENCE_GRACE_MS
): boolean {
  return lastLocalChangeAt == null || lastLocalChangeAt < hydrationStartedAt - graceMs
}

export function markLocalPreferenceChange(now = Date.now()): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LOCAL_PREFERENCE_UPDATED_AT_KEY, String(now))
}

export function getLastLocalPreferenceChange(): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(LOCAL_PREFERENCE_UPDATED_AT_KEY)
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

export function getLocalAppearancePatch(): AppearancePatch {
  if (typeof window === 'undefined') return {}

  const patch: AppearancePatch = {}
  const accent = window.localStorage.getItem(ACCENT_STORAGE_KEY)
  const theme = window.localStorage.getItem(THEME_STORAGE_KEY)

  if (isAccentPreset(accent)) patch.accentPreset = accent
  if (isThemeMode(theme)) patch.themeMode = theme

  return patch
}

export async function persistAppearanceSettings(patch: AppearancePatch): Promise<void> {
  const res = await fetch('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Erro ao salvar aparência')
  }
}
