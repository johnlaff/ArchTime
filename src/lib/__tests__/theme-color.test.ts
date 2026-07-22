import { afterEach, describe, expect, it } from 'vitest'
import {
  readResolvedBackgroundColor,
  syncThemeColorMeta,
  THEME_COLOR_DARK,
} from '../theme-color'

afterEach(() => {
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove())
  document.body.removeAttribute('style')
})

describe('theme-color', () => {
  it('converte o fundo renderizado (rgb) para hex', () => {
    document.body.style.backgroundColor = 'rgb(20, 30, 40)'
    expect(readResolvedBackgroundColor()).toBe('#141e28')
  })

  it('cai para o fundo escuro quando não há cor computada', () => {
    expect(readResolvedBackgroundColor()).toBe(THEME_COLOR_DARK)
  })

  it('cria um único <meta name="theme-color"> e o mantém alinhado ao fundo', () => {
    document.body.style.backgroundColor = 'rgb(10, 10, 10)'
    syncThemeColorMeta()

    const metas = document.head.querySelectorAll('meta[name="theme-color"]')
    expect(metas).toHaveLength(1)
    expect((metas[0] as HTMLMetaElement).content).toBe('#0a0a0a')

    document.body.style.backgroundColor = 'rgb(255, 255, 255)'
    syncThemeColorMeta()

    expect(document.head.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1)
    expect(
      (document.head.querySelector('meta[name="theme-color"]') as HTMLMetaElement).content
    ).toBe('#ffffff')
  })
})
