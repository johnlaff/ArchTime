import type { ThemeMode } from '@/lib/preferences'

export const THEME_SWITCH_SUPPRESSION_MS = 180
export const THEME_REVEAL_DURATION_MS = 420

interface ViewportSize {
  width: number
  height: number
}

interface RevealOrigin {
  x: number
  y: number
}

interface PointerLike {
  clientX: number
  clientY: number
}

export function beginThemeSwitch(root: HTMLElement): void {
  root.classList.add('theme-switching')
}

export function endThemeSwitch(root: HTMLElement): void {
  root.classList.remove('theme-switching')
}

export function setResolvedThemeClass(root: HTMLElement, next: Exclude<ThemeMode, 'system'>): void {
  root.classList.toggle('dark', next === 'dark')
}

export function getThemeRevealOrigin(
  event: PointerLike | undefined,
  viewport: ViewportSize
): RevealOrigin {
  return {
    x: event?.clientX ?? viewport.width / 2,
    y: event?.clientY ?? viewport.height / 2,
  }
}

export function getThemeRevealRadius(origin: RevealOrigin, viewport: ViewportSize): number {
  return Math.hypot(
    Math.max(origin.x, viewport.width - origin.x),
    Math.max(origin.y, viewport.height - origin.y)
  )
}
