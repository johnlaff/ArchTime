import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { AA, contrast, worstContrast } from './oklch-wcag'

/**
 * Prova de acessibilidade dos tokens suaves do accent personalizado.
 *
 * Sob `[data-accent="custom"]`, --accent/--muted (e seus foregrounds) são derivados
 * do hex escolhido DIRETO no CSS via relative color, com L fixo por papel e croma
 * proporcional ao da cor com teto igual ao dos presets. Este teste reproduz EXATAMENTE
 * essas fórmulas (mesmas constantes de globals.css) e varre o círculo de matizes ×
 * chromas de origem, exigindo WCAG AA em cada par texto/superfície — o critério de
 * parada verificável para QUALQUER cor que o seletor produza (amarelos e cianos
 * claros e saturados inclusos).
 *
 * Fonte da verdade das constantes: o bloco `[data-accent="custom"]` dentro de
 * `@supports (color: oklch(from red l c h))` em src/app/globals.css. O bloco
 * "sincronia com globals.css" casa os valores, travando drift entre teste e folha.
 */

// ── Constantes dos tokens custom (espelham globals.css) ───────────────────────
const CUSTOM = {
  light: {
    accent: { L: 0.95, mult: 0.28, cap: 0.045 },
    accentFg: { L: 0.25, mult: 0.35, cap: 0.06 },
    muted: { L: 0.97, mult: 0.12, cap: 0.012 },
  },
  dark: {
    accent: { L: 0.26, mult: 0.35, cap: 0.055 },
    accentFg: { L: 0.96, mult: 0.12, cap: 0.02 },
    muted: { L: 0.23, mult: 0.15, cap: 0.025 },
  },
} as const

// Foregrounds neutros herdados do tema (inalterados sob accent custom).
const MUTED_FG = { light: 0.556, dark: 0.708 }
const FOREGROUND = { light: 0.145, dark: 0.985 }

type Formula = { L: number; mult: number; cap: number }
const derivedC = (f: Formula, srcC: number) => Math.min(srcC * f.mult, f.cap)

describe('tokens suaves do accent custom — garantia WCAG AA', () => {
  it('accent-foreground sobre --accent (light) ≥ 4.5', () => {
    const { min, at } = worstContrast((h, srcC) =>
      contrast(
        CUSTOM.light.accentFg.L, derivedC(CUSTOM.light.accentFg, srcC), h,
        CUSTOM.light.accent.L, derivedC(CUSTOM.light.accent, srcC), h
      )
    )
    expect(min, `pior caso em h=${at.h} srcC=${at.srcC}`).toBeGreaterThanOrEqual(AA)
  })

  it('accent-foreground sobre --accent (dark) ≥ 4.5', () => {
    const { min, at } = worstContrast((h, srcC) =>
      contrast(
        CUSTOM.dark.accentFg.L, derivedC(CUSTOM.dark.accentFg, srcC), h,
        CUSTOM.dark.accent.L, derivedC(CUSTOM.dark.accent, srcC), h
      )
    )
    expect(min, `pior caso em h=${at.h} srcC=${at.srcC}`).toBeGreaterThanOrEqual(AA)
  })

  it('muted-foreground neutro sobre --muted (light) não regride do baseline neutro', () => {
    // Este par não é AA nem no tema neutro (cinza 0.556 sobre cinza 0.97 ≈ 4.17);
    // quem garante AA nesse papel é o muted-foreground escurecido (L 0.5) do modo
    // bg-tint, que vence por especificidade no caso padrão. Aqui o invariante é
    // não regredir da vizinhança do baseline — a classe de bug prevenida é o muted
    // virar cor viva (contraste ~2) para accents claros e saturados.
    const { min, at } = worstContrast((h, srcC) =>
      contrast(
        MUTED_FG.light, 0, 0,
        CUSTOM.light.muted.L, derivedC(CUSTOM.light.muted, srcC), h
      )
    )
    expect(min, `pior caso em h=${at.h} srcC=${at.srcC}`).toBeGreaterThanOrEqual(4.0)
  })

  it('muted-foreground neutro sobre --muted (dark) ≥ 4.5', () => {
    const { min, at } = worstContrast((h, srcC) =>
      contrast(
        MUTED_FG.dark, 0, 0,
        CUSTOM.dark.muted.L, derivedC(CUSTOM.dark.muted, srcC), h
      )
    )
    expect(min, `pior caso em h=${at.h} srcC=${at.srcC}`).toBeGreaterThanOrEqual(AA)
  })

  it('foreground principal sobre --muted (ambos os temas) ≥ 4.5', () => {
    const light = worstContrast((h, srcC) =>
      contrast(FOREGROUND.light, 0, 0, CUSTOM.light.muted.L, derivedC(CUSTOM.light.muted, srcC), h)
    )
    const dark = worstContrast((h, srcC) =>
      contrast(FOREGROUND.dark, 0, 0, CUSTOM.dark.muted.L, derivedC(CUSTOM.dark.muted, srcC), h)
    )
    expect(light.min).toBeGreaterThanOrEqual(AA)
    expect(dark.min).toBeGreaterThanOrEqual(AA)
  })
})

describe('sincronia com globals.css — o CSS shipado usa as constantes provadas', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')
  const rel = (f: Formula) =>
    `oklch(from var(--custom-accent-hex) ${f.L} clamp(0, calc(c * ${f.mult}), ${f.cap}) h)`

  it('tokens do light batem com o teste', () => {
    expect(css).toContain(`--accent:            ${rel(CUSTOM.light.accent)}`)
    expect(css).toContain(`--accent-foreground: ${rel(CUSTOM.light.accentFg)}`)
    expect(css).toContain(`--muted:             ${rel(CUSTOM.light.muted)}`)
  })

  it('tokens do dark batem com o teste', () => {
    expect(css).toContain(`--accent:            ${rel(CUSTOM.dark.accent)}`)
    expect(css).toContain(`--accent-foreground: ${rel(CUSTOM.dark.accentFg)}`)
    expect(css).toContain(`--muted:             ${rel(CUSTOM.dark.muted)}`)
  })

  it('o JS não injeta mais tokens suaves — só hex, foreground e borda', () => {
    const provider = readFileSync(
      resolve(process.cwd(), 'src/components/accent-color-provider.tsx'),
      'utf8'
    )
    const layout = readFileSync(resolve(process.cwd(), 'src/app/layout.tsx'), 'utf8')
    for (const source of [provider, layout]) {
      expect(source).not.toContain('--custom-accent-soft-light')
      expect(source).not.toContain('--custom-accent-muted-light')
      expect(source).not.toContain('--custom-accent-soft-dark')
      expect(source).not.toContain('--custom-accent-muted-dark')
    }
  })
})
