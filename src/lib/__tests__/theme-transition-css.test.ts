import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('theme transition CSS', () => {
  it('disables route view transitions while the theme circular reveal is active', () => {
    const nextConfig = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')
    expect(nextConfig).not.toContain('viewTransition: true')

    const globalsCss = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    expect(globalsCss).not.toMatch(/\bmain\s*\{[^}]*view-transition-name:\s*main-content/s)
  })

  it('hides the new theme snapshot until the circular reveal animation starts', () => {
    const globalsCss = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

    expect(globalsCss).toMatch(
      /html\.theme-switching::view-transition-new\(root\)\s*{[^}]*clip-path:\s*circle\(0px at var\(--theme-reveal-x/s
    )
  })
})
