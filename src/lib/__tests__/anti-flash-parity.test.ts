import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { getCustomAccentTokens } from '@/lib/custom-color'

// The anti-flash script in src/app/layout.tsx reimplements the color math from
// custom-color.ts as a raw JS string so it can run synchronously before React
// hydrates (see the comment above the <script> tag in layout.tsx). Nothing
// forces the two copies to stay in sync — this test executes the real IIFE
// extracted from the layout source and asserts its output matches
// getCustomAccentTokens() exactly, for every threshold branch, so a
// one-sided edit fails npm test/CI instead of shipping a hydration flash.

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function extractAntiFlashScript(): string {
  const layoutSource = readSource('src/app/layout.tsx')
  const match = layoutSource.match(/__html:\s*`([\s\S]*?)`,?\s*\}\}/)
  if (!match) {
    throw new Error(
      'Could not extract the anti-flash IIFE from src/app/layout.tsx — the ' +
        '__html template literal shape changed (drift). Update the extraction ' +
        'regex in anti-flash-parity.test.ts to match.'
    )
  }
  return match[1]
}

// CSS custom property <-> CustomAccentTokens field. The soft surface tokens
// (--accent/--muted) are derived in CSS via relative color and never touch JS,
// so parity only covers the contrast-decision trio below.
const PROPERTY_TO_TOKEN = [
  ['--custom-accent-hex', 'primary'],
  ['--custom-accent-foreground', 'primaryForeground'],
  ['--custom-accent-border', 'primaryBorder'],
] as const

// Covers the decision branches in both implementations: the foreground flip
// (dark vs light text over the accent), the outline thresholds for near-white
// and near-black accents, pure saturated hues, and the 3-digit shorthand hex
// normalization path.
const COLORS = [
  '#6366f1',
  '#f43f5e',
  '#2d7a4f',
  '#ffffff',
  '#fefefe',
  '#000000',
  '#0a0a0a',
  '#ffff00',
  '#3b82f6',
  '#abc',
  '#24ffee',
]

describe('anti-flash script parity with custom-color.ts', () => {
  const script = extractAntiFlashScript()

  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('style')
    document.documentElement.removeAttribute('data-accent')
  })

  it.each(COLORS)('produces identical tokens to getCustomAccentTokens for %s', (hex) => {
    localStorage.setItem('archtime-accent', 'custom')
    localStorage.setItem('archtime-accent-custom', hex)

    new Function(script)()

    expect(document.documentElement.getAttribute('data-accent')).toBe('custom')

    const expected = getCustomAccentTokens(hex)

    for (const [property, tokenKey] of PROPERTY_TO_TOKEN) {
      const actual = document.documentElement.style.getPropertyValue(property)
      expect(actual, `${property} (hex=${hex}) diverged from custom-color.ts's ${tokenKey}`).toBe(
        expected[tokenKey]
      )
    }
  })
})
