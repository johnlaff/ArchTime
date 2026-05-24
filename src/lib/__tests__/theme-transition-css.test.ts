import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('theme transition CSS', () => {
  it('disables route view transitions while the theme circular reveal is active', () => {
    const globalsCss = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

    expect(globalsCss).toMatch(
      /html\.theme-switching\s+main\s*{[^}]*view-transition-name:\s*none;/s
    )
  })

  it('hides the new theme snapshot until the circular reveal animation starts', () => {
    const globalsCss = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

    expect(globalsCss).toMatch(
      /html\.theme-switching::view-transition-new\(root\)\s*{[^}]*clip-path:\s*circle\(0px at var\(--theme-reveal-x/s
    )
  })
})
