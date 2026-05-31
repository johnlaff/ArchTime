import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AccentColorProvider,
  useAccentColor,
} from '@/components/accent-color-provider'

function ProviderHarness() {
  const { setAccent, setArchitecturalPreset, setCustomColor, setDensity, syncAppearanceFromRemote } = useAccentColor()

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
      <button type="button" onClick={() => setDensity('compact')}>
        density
      </button>
      <button type="button" onClick={() => syncAppearanceFromRemote({ architecturalPreset: 'terracota', density: 'spacious' })}>
        hydrate
      </button>
      <button type="button" onClick={() => syncAppearanceFromRemote({ accentPreset: 'custom', customAccentColor: '#123456' })}>
        hydrate-custom
      </button>
      <button type="button" onClick={() => syncAppearanceFromRemote({ accentPreset: 'blue' })}>
        hydrate-accent
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
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
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
    vi.unstubAllGlobals()
    localStorage.clear()
    document.head.innerHTML = ''
    document.documentElement.removeAttribute('data-accent')
    document.documentElement.removeAttribute('data-preset')
  })

  function lastPatch() {
    const fetchMock = globalThis.fetch as unknown as { mock: { calls: [string, { body: string }][] } }
    const call = fetchMock.mock.calls.at(-1)
    return call ? JSON.parse(call[1].body) : null
  }

  it('persists the architectural preset to the server when set', () => {
    act(() => {
      root.render(<AccentColorProvider><ProviderHarness /></AccentColorProvider>)
    })
    act(() => { document.querySelector<HTMLButtonElement>('button:nth-of-type(1)')?.click() })
    expect(lastPatch()).toEqual({ architecturalPreset: 'vegetacao' })
  })

  it('persists density to the server when set', () => {
    act(() => {
      root.render(<AccentColorProvider><ProviderHarness /></AccentColorProvider>)
    })
    act(() => { document.querySelector<HTMLButtonElement>('button:nth-of-type(4)')?.click() })
    expect(lastPatch()).toEqual({ density: 'compact' })
  })

  it('persists accent AND clears the preset server-side when an accent is chosen (regression: accent still syncs)', () => {
    act(() => {
      root.render(<AccentColorProvider><ProviderHarness /></AccentColorProvider>)
    })
    act(() => { document.querySelector<HTMLButtonElement>('button:nth-of-type(2)')?.click() })
    expect(lastPatch()).toEqual({ accentPreset: 'rose', architecturalPreset: null })
  })

  it('applies remote preset + density on hydration without persisting them back', () => {
    act(() => {
      root.render(<AccentColorProvider><ProviderHarness /></AccentColorProvider>)
    })
    const before = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length
    act(() => { document.querySelector<HTMLButtonElement>('button:nth-of-type(5)')?.click() })
    expect(document.documentElement.getAttribute('data-preset')).toBe('terracota')
    expect(document.documentElement.getAttribute('data-density')).toBe('spacious')
    expect(localStorage.getItem('archtime-preset')).toBe('terracota')
    expect(localStorage.getItem('archtime-density')).toBe('spacious')
    const after = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length
    expect(after).toBe(before)
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

  it('persists the custom color (and accent=custom, preset cleared) when a custom color is set', () => {
    act(() => {
      root.render(<AccentColorProvider><ProviderHarness /></AccentColorProvider>)
    })
    act(() => { document.querySelector<HTMLButtonElement>('button:nth-of-type(3)')?.click() }) // setCustomColor('#ffffff')
    expect(lastPatch()).toEqual({ accentPreset: 'custom', customAccentColor: '#ffffff', architecturalPreset: null })
  })

  it('applies a remote custom color on hydration', () => {
    act(() => {
      root.render(<AccentColorProvider><ProviderHarness /></AccentColorProvider>)
    })
    act(() => { document.querySelector<HTMLButtonElement>('button:nth-of-type(6)')?.click() }) // hydrate-custom
    expect(document.documentElement.getAttribute('data-accent')).toBe('custom')
    expect(localStorage.getItem('archtime-accent')).toBe('custom')
    expect(localStorage.getItem('archtime-accent-custom')).toBe('#123456')
    expect(currentIconHref()).toContain('%23123456')
  })

  it('applies a remote preset accent on hydration (icon + state)', () => {
    act(() => {
      root.render(<AccentColorProvider><ProviderHarness /></AccentColorProvider>)
    })
    act(() => { document.querySelector<HTMLButtonElement>('button:nth-of-type(7)')?.click() })
    expect(document.documentElement.getAttribute('data-accent')).toBe('blue')
    expect(currentIconHref()).toContain('%233b82f6')
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
