import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AccentColorProvider,
  useAccentColor,
} from '@/components/accent-color-provider'

function ProviderHarness() {
  const { setAccent, setArchitecturalPreset, setCustomColor } = useAccentColor()

  return (
    <div>
      <button type="button" onClick={() => setArchitecturalPreset('vegetacao')}>
        vegetacao
      </button>
      <button type="button" onClick={() => setAccent('rose')}>
        rose
      </button>
      <button type="button" onClick={() => setCustomColor('#ffffff')}>
        white
      </button>
    </div>
  )
}

function currentIconHref() {
  return document.head.querySelector('link[rel="icon"]')?.getAttribute('href')
}

describe('AccentColorProvider browser accent sync', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    document.cookie = ''
    document.head.innerHTML = ''
    document.documentElement.removeAttribute('data-accent')
    document.documentElement.removeAttribute('data-preset')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    localStorage.clear()
    document.head.innerHTML = ''
    document.documentElement.removeAttribute('data-accent')
    document.documentElement.removeAttribute('data-preset')
  })

  it('clears the architectural preset before syncing a selected accent color', () => {
    act(() => {
      root.render(
        <AccentColorProvider>
          <ProviderHarness />
        </AccentColorProvider>
      )
    })

    act(() => {
      document.querySelector<HTMLButtonElement>('button:nth-of-type(1)')?.click()
    })
    expect(document.documentElement.getAttribute('data-preset')).toBe('vegetacao')
    expect(currentIconHref()).toContain('%232d7a4f')

    act(() => {
      document.querySelector<HTMLButtonElement>('button:nth-of-type(2)')?.click()
    })

    expect(document.documentElement.hasAttribute('data-preset')).toBe(false)
    expect(localStorage.getItem('archtime-preset')).toBeNull()
    expect(currentIconHref()).toContain('%23f43f5e')
    expect(document.head.innerHTML).not.toContain('%232d7a4f')
  })

  it('clears the architectural preset before syncing a custom color', () => {
    act(() => {
      root.render(
        <AccentColorProvider>
          <ProviderHarness />
        </AccentColorProvider>
      )
    })

    act(() => {
      document.querySelector<HTMLButtonElement>('button:nth-of-type(1)')?.click()
    })
    expect(document.documentElement.getAttribute('data-preset')).toBe('vegetacao')

    act(() => {
      document.querySelector<HTMLButtonElement>('button:nth-of-type(3)')?.click()
    })

    expect(document.documentElement.hasAttribute('data-preset')).toBe(false)
    expect(localStorage.getItem('archtime-preset')).toBeNull()
    expect(currentIconHref()).toContain('%23ffffff')
    expect(document.head.innerHTML).not.toContain('%232d7a4f')
  })
})
