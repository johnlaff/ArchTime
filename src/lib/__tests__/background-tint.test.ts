import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { AA, contrast, worstContrast } from './oklch-wcag'

/**
 * Prova de acessibilidade do tint de fundo dinâmico (cor de destaque → fundo).
 *
 * O tint é aplicado em CSS via relative color: `oklch(from var(--primary) L C h)`,
 * com L fixo no valor do tema neutro e chroma clampado. Este teste reproduz EXATAMENTE
 * essa fórmula (mesmas constantes de globals.css) e varre todo o círculo de matizes,
 * exigindo contraste WCAG AA em cada par texto/superfície. É o critério de parada
 * verificável: se qualquer matiz cair abaixo de 4.5:1, o teste falha.
 *
 * Fonte da verdade das constantes: os blocos `[data-bg-tint="on"]...` em
 * src/app/globals.css. O bloco "sincronia com globals.css" (no fim deste arquivo) lê
 * o CSS e casa os valores da fórmula, travando o drift entre teste e folha de estilo.
 */

// ── Constantes do tint (espelham globals.css) ─────────────────────────────────
const TINT = {
  light: {
    bg: { L: 0.98, Cmax: 0.012 },
    mutedFg: { L: 0.5, Cmax: 0.02 },
  },
  dark: {
    bg: { L: 0.145, Cmax: 0.01 },
    card: { L: 0.205, Cmax: 0.008 },
  },
} as const

// Foregrounds herdados do tema (não mudam no modo tingido).
const FOREGROUND = { light: 0.145, dark: 0.985 } // --foreground / --card-foreground (cinza neutro)
const MUTED_FG_DARK = 0.708 // --muted-foreground no dark (inalterado)
const CARD_LIGHT = 1 // --card no light permanece branco

describe('tint de fundo dinâmico — garantia WCAG AA', () => {
  it('texto principal sobre o fundo tingido (light) ≥ 4.5', () => {
    const { min } = worstContrast((h, srcC) =>
      contrast(FOREGROUND.light, 0, 0, TINT.light.bg.L, Math.min(srcC, TINT.light.bg.Cmax), h)
    )
    expect(min).toBeGreaterThanOrEqual(AA)
  })

  it('texto-muted sobre o fundo tingido (light) ≥ 4.5', () => {
    const { min, at } = worstContrast((h, srcC) =>
      contrast(
        TINT.light.mutedFg.L, Math.min(srcC, TINT.light.mutedFg.Cmax), h,
        TINT.light.bg.L, Math.min(srcC, TINT.light.bg.Cmax), h
      )
    )
    expect(min, `pior caso em h=${at.h} srcC=${at.srcC}`).toBeGreaterThanOrEqual(AA)
  })

  it('texto-muted sobre card branco (light) ≥ 4.5', () => {
    const { min } = worstContrast((h, srcC) =>
      contrast(TINT.light.mutedFg.L, Math.min(srcC, TINT.light.mutedFg.Cmax), h, CARD_LIGHT, 0, 0)
    )
    expect(min).toBeGreaterThanOrEqual(AA)
  })

  it('texto-muted sobre superfície --muted (light, L≈0.97) ≥ 4.5', () => {
    const { min } = worstContrast((h, srcC) =>
      contrast(
        TINT.light.mutedFg.L, Math.min(srcC, TINT.light.mutedFg.Cmax), h,
        0.97, Math.min(srcC, 0.015), h
      )
    )
    expect(min).toBeGreaterThanOrEqual(AA)
  })

  it('texto principal sobre o fundo tingido (dark) ≥ 4.5', () => {
    const { min } = worstContrast((h, srcC) =>
      contrast(FOREGROUND.dark, 0, 0, TINT.dark.bg.L, Math.min(srcC, TINT.dark.bg.Cmax), h)
    )
    expect(min).toBeGreaterThanOrEqual(AA)
  })

  it('texto-muted sobre o fundo tingido (dark) ≥ 4.5', () => {
    const { min } = worstContrast((h, srcC) =>
      contrast(MUTED_FG_DARK, 0, 0, TINT.dark.bg.L, Math.min(srcC, TINT.dark.bg.Cmax), h)
    )
    expect(min).toBeGreaterThanOrEqual(AA)
  })

  it('texto-muted sobre o card tingido (dark) ≥ 4.5', () => {
    const { min } = worstContrast((h, srcC) =>
      contrast(MUTED_FG_DARK, 0, 0, TINT.dark.card.L, Math.min(srcC, TINT.dark.card.Cmax), h)
    )
    expect(min).toBeGreaterThanOrEqual(AA)
  })
})

describe('sincronia com globals.css — o CSS shipado usa as constantes provadas', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')
  const rel = (L: number, Cmax: number) =>
    `oklch(from var(--primary) ${L} clamp(0, c, ${Cmax}) h)`

  it('fundo e muted-foreground do light batem com o teste', () => {
    expect(css).toContain(rel(TINT.light.bg.L, TINT.light.bg.Cmax))
    expect(css).toContain(rel(TINT.light.mutedFg.L, TINT.light.mutedFg.Cmax))
  })

  it('fundo e card do dark batem com o teste', () => {
    expect(css).toContain(rel(TINT.dark.bg.L, TINT.dark.bg.Cmax))
    expect(css).toContain(rel(TINT.dark.card.L, TINT.dark.card.Cmax))
  })

  it('o muted-foreground do dark é restaurado ao valor neutro que passa AA', () => {
    expect(css).toContain(`--muted-foreground: oklch(${MUTED_FG_DARK} 0 0)`)
  })
})
