import type { ThemeMode } from '@/lib/preferences'

// A duração e a curva do reveal vivem no CSS (@keyframes theme-reveal em globals.css),
// onde a animação roda; aqui fica só a janela em que as transições de cor concorrentes
// seguem suprimidas após a troca.
export const THEME_SWITCH_SUPPRESSION_MS = 180

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
