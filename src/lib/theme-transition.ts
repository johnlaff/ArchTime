import type { ThemeMode } from '@/lib/preferences'

export const THEME_SWITCH_SUPPRESSION_MS = 180
export const THEME_REVEAL_DURATION_MS = 320

// O círculo parte do raio 0: a curva tem de acelerar de imediato e desacelerar no
// fim (decelerate / ease-out). Um ease-in-out faria o reveal "hesitar" no começo —
// nada cresce nos primeiros quadros — e passaria a sensação de lentidão/travamento.
// cubic-bezier(0.05, 0.7, 0.1, 1) é o "emphasized decelerate" (Material 3): abre
// rápido e assenta suave.
export const THEME_REVEAL_EASING = 'cubic-bezier(0.05, 0.7, 0.1, 1)'

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

export interface ThemeViewTransition {
  ready: Promise<void>
  finished: Promise<void>
}

export interface ThemeViewTransitionDocument {
  startViewTransition?: (callback: () => void) => ThemeViewTransition
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

export function setThemeRevealGeometry(
  root: HTMLElement,
  origin: RevealOrigin,
  radius: number
): void {
  root.style.setProperty('--theme-reveal-x', `${origin.x}px`)
  root.style.setProperty('--theme-reveal-y', `${origin.y}px`)
  root.style.setProperty('--theme-reveal-radius', `${radius}px`)
}

export function clearThemeRevealGeometry(root: HTMLElement): void {
  root.style.removeProperty('--theme-reveal-x')
  root.style.removeProperty('--theme-reveal-y')
  root.style.removeProperty('--theme-reveal-radius')
}

export function startThemeViewTransition(
  doc: ThemeViewTransitionDocument,
  apply: () => void
): ThemeViewTransition | null {
  let applied = false
  const applyOnce = () => {
    if (applied) return
    applied = true
    apply()
  }

  if (typeof doc.startViewTransition !== 'function') {
    applyOnce()
    return null
  }

  try {
    return doc.startViewTransition(applyOnce)
  } catch {
    applyOnce()
    return null
  }
}
