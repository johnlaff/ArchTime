import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('theme transition CSS', () => {
  it('disables route view transitions while the theme circular reveal is active', () => {
    const nextConfig = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')
    expect(nextConfig).not.toContain('viewTransition: true')

    const globalsCss = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    expect(globalsCss).not.toMatch(/\bmain\s*\{[^}]*view-transition-name:\s*main-content/)
  })

  it('reveals the new theme via a CSS keyframe starting at radius 0 (no scheduled WAAPI)', () => {
    const globalsCss = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

    // A animação é CSS: começa no frame em que o snapshot nasce, sem o gap do WAAPI
    // agendado que fazia o novo tema piscar em tela cheia no mobile.
    expect(globalsCss).toMatch(
      /@keyframes theme-reveal\s*{[\s\S]*from\s*{[^}]*clip-path:\s*circle\(\s*0px at var\(--theme-reveal-x/
    )
    expect(globalsCss).toMatch(
      /html\.theme-switching::view-transition-new\(root\)\s*{[^}]*animation:\s*theme-reveal/
    )
  })
})
