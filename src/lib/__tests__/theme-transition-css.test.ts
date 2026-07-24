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

  it('clips the new snapshot from the first frame and animates the reveal via WAAPI on ready', () => {
    const globalsCss = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    const themeTransition = readFileSync(join(process.cwd(), 'src/lib/theme-transition.ts'), 'utf8')

    // O clip inicial é ESTÁTICO no CSS: vale desde o frame em que o pseudo-elemento
    // nasce, então o novo tema nunca pisca em tela cheia no gap até o ready (mobile).
    expect(globalsCss).toMatch(
      /html\.theme-switching::view-transition-new\(root\)\s*{[^}]*clip-path:\s*circle\(\s*0px at var\(--theme-reveal-x/
    )
    // O crescimento do círculo é WAAPI agendado em transition.ready — snapshots
    // prontos antes de animar (sem jank de captura) e comportamento idêntico ao
    // do desktop, que sempre resolveu o ready em menos de um frame.
    expect(globalsCss).not.toContain('@keyframes theme-reveal')
    expect(themeTransition).toContain("pseudoElement: '::view-transition-new(root)'")
  })
})
