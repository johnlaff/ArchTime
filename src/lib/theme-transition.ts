import type { ThemeMode } from '@/lib/preferences'

// Janela em que as transições de cor concorrentes seguem suprimidas após a troca.
export const THEME_SWITCH_SUPPRESSION_MS = 180

export const THEME_REVEAL_DURATION_MS = 320
// Emphasized decelerate (Material 3): o círculo parte do raio 0, acelera de imediato
// e assenta no fim. Um ease-in-out hesitaria nos primeiros quadros e pareceria lento.
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

/**
 * Cresce o círculo do reveal no snapshot do novo tema. Deve ser chamada em
 * transition.ready (snapshots capturados): o pseudo-elemento nasce recortado em
 * raio 0 pelo clip-path estático de globals.css, então o intervalo até o ready
 * não mostra o novo tema — e a animação começa sem frames perdidos de captura.
 */
export function animateThemeReveal(
  root: HTMLElement,
  origin: RevealOrigin,
  radius: number
): Animation | null {
  const center = `${origin.x}px ${origin.y}px`
  try {
    return root.animate(
      { clipPath: [`circle(0px at ${center})`, `circle(${radius}px at ${center})`] },
      {
        duration: THEME_REVEAL_DURATION_MS,
        easing: THEME_REVEAL_EASING,
        // fill 'forwards' mantém o raio final até o browser remover o snapshot;
        // sem ele o clip estático de raio 0 voltaria a esconder o novo tema.
        fill: 'forwards',
        pseudoElement: '::view-transition-new(root)',
      }
    )
  } catch {
    // Engine com View Transitions mas sem WAAPI em pseudo-elemento: sem animações
    // rodando nos snapshots, a transição resolve em seguida e os pseudo-elementos
    // somem — a troca acontece sem o círculo, sem esconder o novo tema.
    return null
  }
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
