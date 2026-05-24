import { readFileSync } from 'node:fs'
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
      /function setCustomColor[\s\S]*if \(!architecturalPreset\) {[\s\S]*archtime-accent-color/
    )
  })
})
