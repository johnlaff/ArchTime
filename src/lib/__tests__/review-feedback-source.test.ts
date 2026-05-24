import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('review feedback regressions', () => {
  it('does not expose the two-dimensional custom color area as a one-dimensional ARIA slider', () => {
    const source = readSource('src/components/accent-color-picker.tsx')

    expect(source).not.toContain('role="slider"')
    expect(source).toContain('aria-hidden="true"')
  })

  it('shows the actual theme shortcut handled by useKeyboardShortcuts', () => {
    const source = readSource('src/components/shortcuts-widget.tsx')

    expect(source).not.toContain('⌘⇧T')
    expect(source).toContain("{ desc: 'Alternar Tema', key: 'T' }")
  })

  it('does not let custom accent changes overwrite the PWA icon color while an architectural preset is active', () => {
    const source = readSource('src/components/accent-color-provider.tsx')

    expect(source).toMatch(
      /function setCustomColor[\s\S]*if \(!architecturalPreset\) {[\s\S]*syncBrowserAccentColor\(normalized\)/
    )
  })

  it('prevents page text selection while dragging the custom color field', () => {
    const source = readSource('src/components/accent-color-picker.tsx')

    expect(source).toContain('event.preventDefault()')
    expect(source).toContain('select-none')
    expect(source).toContain('touch-none')
  })

  it('uses the computed accent foreground for active sidebar items', () => {
    const source = readSource('src/components/sidebar-nav.tsx')

    expect(source).toContain('text-accent-foreground font-medium')
    expect(source).not.toContain('text-primary font-medium')
  })

  it('keeps near-white custom logo backgrounds visually bounded', () => {
    const source = [
      readSource('src/components/navbar.tsx'),
      readSource('src/components/sidebar.tsx'),
      readSource('src/components/sidebar-footer-controls.tsx'),
    ].join('\n')

    expect(source).toContain("boxShadow: 'inset 0 0 0 1px var(--primary-border, transparent)'")
  })

  it('syncs browser chrome icon links when the active accent changes', () => {
    const source = readSource('src/components/accent-color-provider.tsx')
    const iconRoute = readSource('src/app/api/icon/route.tsx')
    const layout = readSource('src/app/layout.tsx')

    expect(source).toContain('syncBrowserAccentColor')
    expect(source).toContain("querySelectorAll('link[rel=\"icon\"]')")
    expect(source).toContain('icon.remove()')
    expect(source).toContain('document.head.appendChild(icon)')
    expect(source).toContain('window.setTimeout(updateBrowserAccentLinks')
    expect(source).toContain("querySelector('meta[name=\"theme-color\"]')")
    expect(iconRoute).toContain("'Cache-Control': 'no-store, max-age=0'")
    expect(layout).not.toContain('/favicon.ico')
    expect(existsSync(join(process.cwd(), 'src/app/favicon.ico'))).toBe(false)
  })

  it('keeps the circular reveal final frame filled until the browser removes the snapshot', () => {
    const source = readSource('src/hooks/use-theme-toggle.ts')

    expect(source).toContain("fill: 'both'")
    expect(source).toContain('revealAnimation.finished')
  })
})
