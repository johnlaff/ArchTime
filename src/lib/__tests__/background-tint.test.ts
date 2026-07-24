import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { AA, contrast, worstContrast } from './oklch-wcag'

/**
 * Prova de acessibilidade do tint de fundo dinâmico (cor de destaque → fundo).
 *
 * O tint é aplicado em CSS via relative color: `oklch(from var(--primary) L C h)`,
 * com L fixo no valor do tema neutro e croma PROPORCIONAL ao da cor de destaque
 * (calc(c * fator)) com teto — uma cor vívida tinge mais, uma pastel tinge menos e
 * um cinza não tinge, então o fundo acompanha as variantes escolhidas no seletor.
 * Este teste reproduz EXATAMENTE essa fórmula (mesmas constantes de globals.css) e
 * varre todo o círculo de matizes × chromas de origem, exigindo contraste WCAG AA
 * em cada par texto/superfície. É o critério de parada verificável: se qualquer
 * combinação cair abaixo de 4.5:1, o teste falha.
 *
 * Fonte da verdade das constantes: os blocos `[data-bg-tint="on"]...` em
 * src/app/globals.css. O bloco "sincronia com globals.css" (no fim deste arquivo) lê
 * o CSS e casa os valores da fórmula, travando o drift entre teste e folha de estilo.
 */

// ── Constantes do tint (espelham globals.css) ─────────────────────────────────
const TINT = {
  light: {
    bg: { L: 0.98, mult: 0.15, cap: 0.03 },
    mutedFg: { L: 0.5, mult: 0.15, cap: 0.02 },
  },
  dark: {
    bg: { L: 0.145, mult: 0.18, cap: 0.03 },
    card: { L: 0.205, mult: 0.15, cap: 0.025 },
  },
} as const

type Formula = { L: number; mult: number; cap: number }
const derivedC = (f: Formula, srcC: number) => Math.min(srcC * f.mult, f.cap)

// Foregrounds herdados do tema (não mudam no modo tingido).
const FOREGROUND = { light: 0.145, dark: 0.985 } // --foreground / --card-foreground (cinza neutro)
const MUTED_FG_DARK = 0.708 // --muted-foreground no dark (inalterado)
const CARD_LIGHT = 1 // --card no light permanece branco

describe('tint de fundo dinâmico — garantia WCAG AA', () => {
  it('texto principal sobre o fundo tingido (light) ≥ 4.5', () => {
    const { min } = worstContrast((h, srcC) =>
      contrast(FOREGROUND.light, 0, 0, TINT.light.bg.L, derivedC(TINT.light.bg, srcC), h)
    )
    expect(min).toBeGreaterThanOrEqual(AA)
  })

  it('texto-muted sobre o fundo tingido (light) ≥ 4.5', () => {
    const { min, at } = worstContrast((h, srcC) =>
      contrast(
        TINT.light.mutedFg.L, derivedC(TINT.light.mutedFg, srcC), h,
        TINT.light.bg.L, derivedC(TINT.light.bg, srcC), h
      )
    )
    expect(min, `pior caso em h=${at.h} srcC=${at.srcC}`).toBeGreaterThanOrEqual(AA)
  })

  it('texto-muted sobre card branco (light) ≥ 4.5', () => {
    const { min } = worstContrast((h, srcC) =>
      contrast(TINT.light.mutedFg.L, derivedC(TINT.light.mutedFg, srcC), h, CARD_LIGHT, 0, 0)
    )
    expect(min).toBeGreaterThanOrEqual(AA)
  })

  it('texto-muted sobre superfície --muted (light, L≈0.97) ≥ 4.5', () => {
    const { min } = worstContrast((h, srcC) =>
      contrast(
        TINT.light.mutedFg.L, derivedC(TINT.light.mutedFg, srcC), h,
        0.97, Math.min(srcC, 0.015), h
      )
    )
    expect(min).toBeGreaterThanOrEqual(AA)
  })

  it('texto principal sobre o fundo tingido (dark) ≥ 4.5', () => {
    const { min } = worstContrast((h, srcC) =>
      contrast(FOREGROUND.dark, 0, 0, TINT.dark.bg.L, derivedC(TINT.dark.bg, srcC), h)
    )
    expect(min).toBeGreaterThanOrEqual(AA)
  })

  it('texto-muted sobre o fundo tingido (dark) ≥ 4.5', () => {
    const { min } = worstContrast((h, srcC) =>
      contrast(MUTED_FG_DARK, 0, 0, TINT.dark.bg.L, derivedC(TINT.dark.bg, srcC), h)
    )
    expect(min).toBeGreaterThanOrEqual(AA)
  })

  it('texto-muted sobre o card tingido (dark) ≥ 4.5', () => {
    const { min } = worstContrast((h, srcC) =>
      contrast(MUTED_FG_DARK, 0, 0, TINT.dark.card.L, derivedC(TINT.dark.card, srcC), h)
    )
    expect(min).toBeGreaterThanOrEqual(AA)
  })
})

describe('sincronia com globals.css — o CSS shipado usa as constantes provadas', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')
  const rel = (f: Formula) =>
    `oklch(from var(--primary) ${f.L} clamp(0, calc(c * ${f.mult}), ${f.cap}) h)`

  it('fundo e muted-foreground do light batem com o teste', () => {
    expect(css).toContain(rel(TINT.light.bg))
    expect(css).toContain(rel(TINT.light.mutedFg))
  })

  it('fundo e card do dark batem com o teste', () => {
    expect(css).toContain(rel(TINT.dark.bg))
    expect(css).toContain(rel(TINT.dark.card))
  })

  it('o muted-foreground do dark é restaurado ao valor neutro que passa AA', () => {
    expect(css).toContain(`--muted-foreground: oklch(${MUTED_FG_DARK} 0 0)`)
  })
})
