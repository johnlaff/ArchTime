import { describe, expect, it } from 'vitest'
import {
  beginThemeSwitch,
  endThemeSwitch,
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
})
