import { toast } from 'sonner'
import { persistAppearanceSettings, type AppearancePatch } from '@/lib/appearance'

const PENDING_APPEARANCE_KEY = 'archtime-pending-appearance'
const APPEARANCE_DEBOUNCE_MS = 400
const RETRY_DELAYS_MS = [1_000, 5_000, 15_000, 60_000]

let pendingPatch: AppearancePatch | null = null
let inFlightPatch: AppearancePatch | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushPromise: Promise<void> | null = null
let retryAttempt = 0
let hasShownFailureToast = false
let onlineListenerRegistered = false

function canUseBrowserStorage(): boolean {
  return typeof window !== 'undefined'
}

function mergePatches(
  base: AppearancePatch | null,
  override: AppearancePatch | null
): AppearancePatch | null {
  if (!base && !override) return null
  return { ...base, ...override }
}

function isAppearancePatch(value: unknown): value is AppearancePatch {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0
}

function readStoredPendingPatch(): AppearancePatch | null {
  if (!canUseBrowserStorage()) return null

  try {
    const stored = window.localStorage.getItem(PENDING_APPEARANCE_KEY)
    if (!stored) return null

    const patch: unknown = JSON.parse(stored)
    if (isAppearancePatch(patch)) return patch

    window.localStorage.removeItem(PENDING_APPEARANCE_KEY)
  } catch {}

  return null
}

function loadPendingPatchFromStorage(): void {
  if (pendingPatch || inFlightPatch) return
  pendingPatch = readStoredPendingPatch()
}

function writeStoredPendingPatch(): void {
  if (!canUseBrowserStorage()) return

  const durablePatch = mergePatches(inFlightPatch, pendingPatch)
  try {
    if (durablePatch) {
      window.localStorage.setItem(PENDING_APPEARANCE_KEY, JSON.stringify(durablePatch))
    } else {
      window.localStorage.removeItem(PENDING_APPEARANCE_KEY)
    }
  } catch {}
}

function clearFlushTimer(): void {
  if (flushTimer === null) return
  clearTimeout(flushTimer)
  flushTimer = null
}

function scheduleFlush(delay: number): void {
  if (!canUseBrowserStorage()) return

  clearFlushTimer()
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushPendingAppearancePatch()
  }, delay)
}

function scheduleNextPendingFlush(): void {
  if (!pendingPatch || flushTimer !== null) return
  scheduleFlush(0)
}

export function enqueueAppearancePatch(patch: AppearancePatch): void {
  loadPendingPatchFromStorage()
  pendingPatch = mergePatches(pendingPatch, patch)
  writeStoredPendingPatch()
  scheduleFlush(APPEARANCE_DEBOUNCE_MS)
}

export function flushPendingAppearancePatch(): Promise<void> {
  if (!canUseBrowserStorage()) return Promise.resolve()
  if (flushPromise) return flushPromise

  loadPendingPatchFromStorage()
  if (!pendingPatch) return Promise.resolve()

  const patchToFlush = pendingPatch
  pendingPatch = null
  inFlightPatch = patchToFlush

  flushPromise = persistAppearanceSettings(patchToFlush)
    .then(() => {
      inFlightPatch = null
      retryAttempt = 0
      hasShownFailureToast = false
      writeStoredPendingPatch()
      scheduleNextPendingFlush()
    })
    .catch((error: unknown) => {
      pendingPatch = mergePatches(inFlightPatch, pendingPatch)
      inFlightPatch = null
      writeStoredPendingPatch()

      if (!hasShownFailureToast) {
        toast.error(error instanceof Error ? error.message : 'Erro ao salvar aparência')
        hasShownFailureToast = true
      }

      const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)]
      retryAttempt += 1
      scheduleFlush(delay)
    })
    .finally(() => {
      flushPromise = null
    })

  return flushPromise
}

export function hasPendingAppearancePatch(): boolean {
  if (pendingPatch || inFlightPatch) return true
  return readStoredPendingPatch() !== null
}

export function restorePendingAppearanceSync(): void {
  if (!canUseBrowserStorage()) return

  loadPendingPatchFromStorage()
  if (pendingPatch) scheduleFlush(0)

  if (onlineListenerRegistered) return
  window.addEventListener('online', handleOnline)
  onlineListenerRegistered = true
}

function handleOnline(): void {
  if (hasPendingAppearancePatch()) scheduleFlush(0)
}

export function __resetSettingsSyncForTests(): void {
  clearFlushTimer()
  pendingPatch = null
  inFlightPatch = null
  flushPromise = null
  retryAttempt = 0
  hasShownFailureToast = false

  if (canUseBrowserStorage()) {
    window.localStorage.removeItem(PENDING_APPEARANCE_KEY)
    if (onlineListenerRegistered) window.removeEventListener('online', handleOnline)
  }
  onlineListenerRegistered = false
}
