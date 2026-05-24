import { describe, expect, it, vi } from 'vitest'
import {
  beginThemeSwitch,
  endThemeSwitch,
  getThemeRevealOrigin,
  getThemeRevealRadius,
  startThemeViewTransition,
  setResolvedThemeClass,
} from '../theme-transition'

describe('theme transition helpers', () => {
  it('sets the resolved theme class synchronously on the root element', () => {
    const root = document.createElement('html')

    setResolvedThemeClass(root, 'dark')
    expect(root.classList.contains('dark')).toBe(true)

    setResolvedThemeClass(root, 'light')
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('marks theme switches so CSS can suppress element transitions', () => {
    const root = document.createElement('html')

    beginThemeSwitch(root)
    expect(root.classList.contains('theme-switching')).toBe(true)

    endThemeSwitch(root)
    expect(root.classList.contains('theme-switching')).toBe(false)
  })

  it('computes circular reveal geometry from click or viewport center', () => {
    expect(getThemeRevealOrigin(undefined, { width: 100, height: 80 })).toEqual({ x: 50, y: 40 })
    expect(getThemeRevealOrigin({ clientX: 10, clientY: 20 }, { width: 100, height: 80 })).toEqual({ x: 10, y: 20 })
    expect(Math.round(getThemeRevealRadius({ x: 10, y: 20 }, { width: 100, height: 80 }))).toBe(108)
  })

  it('falls back to a direct apply when View Transitions are unavailable', () => {
    const apply = vi.fn()

    expect(startThemeViewTransition({}, apply)).toBeNull()
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('falls back and applies once when starting a View Transition throws synchronously', () => {
    const apply = vi.fn()
    const doc = {
      startViewTransition: vi.fn(() => {
        throw new Error('transition failed')
      }),
    }

    expect(startThemeViewTransition(doc, apply)).toBeNull()
    expect(apply).toHaveBeenCalledTimes(1)
  })
})
