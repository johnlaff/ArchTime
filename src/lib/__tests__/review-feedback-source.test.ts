import { existsSync, readFileSync } from 'node:fs'
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
    expect(source).toContain("{ desc: 'Alternar tema', key: 'T' }")
  })

  it('does not let custom accent changes overwrite the PWA icon color while an architectural preset is active', () => {
    const source = readSource('src/components/accent-color-provider.tsx')
    const browserAccentSource = readSource('src/lib/browser-accent.ts')

    expect(source).toContain('getEffectiveBrowserAccentColor')
    expect(source).toContain('setArchitecturalPresetState(null)')
    expect(browserAccentSource).toContain('if (architecturalPreset) return ARCHITECTURAL_PRESETS[architecturalPreset].color')
  })

  it('prevents page text selection while dragging the custom color field', () => {
    const source = readSource('src/components/accent-color-picker.tsx')

    expect(source).toContain('event.preventDefault()')
    expect(source).toContain('select-none')
    expect(source).toContain('touch-none')
  })

  it('uses the computed accent foreground for active sidebar items', () => {
    const source = readSource('src/components/sidebar-nav.tsx')

    expect(source).toContain('text-accent-foreground font-medium')
    expect(source).not.toContain('text-primary font-medium')
  })

  it('keeps near-white custom logo backgrounds visually bounded', () => {
    const source = [
      readSource('src/components/navbar.tsx'),
      readSource('src/components/sidebar.tsx'),
      readSource('src/components/sidebar-footer-controls.tsx'),
    ].join('\n')

    expect(source).toContain("boxShadow: 'inset 0 0 0 1px var(--primary-border, transparent)'")
  })

  it('syncs browser chrome icon links when the active accent changes', () => {
    const source = readSource('src/lib/browser-accent.ts')
    const iconRoute = readSource('src/app/api/icon/route.tsx')
    const layout = readSource('src/app/layout.tsx')

    expect(source).toContain('syncBrowserAccentColor')
    expect(source).toContain("querySelectorAll('link[rel=\"icon\"]')")
    expect(source).toContain('icon.remove()')
    expect(source).toContain('document.head.appendChild(icon)')
    expect(source).toContain('clearBrowserAccentTimers')
    expect(source).toContain('activeBrowserAccentColor === color')
    expect(source).toContain("querySelector('meta[name=\"theme-color\"]')")
    // Sem `color` explícito a resposta depende do cookie de accent → não pode ser
    // cacheada; com `color` na URL ela é determinística e pode.
    expect(iconRoute).toContain("requestedColor ? 'public, max-age=86400' : 'no-store, max-age=0'")
    expect(layout).not.toContain('/favicon.ico')
    expect(existsSync(join(process.cwd(), 'src/app/favicon.ico'))).toBe(false)
  })

  it('keeps the circular reveal final frame filled until the browser removes the snapshot', () => {
    const source = readSource('src/hooks/use-theme-toggle.ts')

    expect(source).toContain("fill: 'both'")
    expect(source).toContain('anim.finished')
  })

  it('uses plain router.push and avoids mount-time route prefetch storms', () => {
    const source = readSource('src/hooks/use-keyboard-shortcuts.ts')

    // startTransition keeps the old page visible and suppresses the route's
    // loading.tsx Suspense fallback, which made slow navigations look frozen.
    expect(source).not.toContain('startTransition')
    expect(source).toContain('router.push(href)')
    expect(source).toContain('pathname === href')
    expect(source).not.toContain('router.prefetch(')
  })

  it('keeps default <Link> prefetch enabled on nav links (the page-swap freeze was the removeChild <head> conflict, fixed in layout.tsx — not prefetch)', () => {
    const providers = readSource('src/components/providers.tsx')
    const sidebarNav = readSource('src/components/sidebar-nav.tsx')
    const navbar = readSource('src/components/navbar.tsx')

    // Re-enabling default prefetch makes nav content ready on hover/viewport.
    // Do NOT re-add prefetch={false} (that was the #86182 misdiagnosis).
    expect(sidebarNav).not.toContain('prefetch={false}')
    expect(navbar).not.toContain('prefetch={false}')
    // But still no mount-time "prefetch every route" storm.
    expect(providers).not.toContain('useRoutePrefetch')
    expect(existsSync(join(process.cwd(), 'src/hooks/use-route-prefetch.ts'))).toBe(false)
  })

  it('keeps <head> icon/theme-color out of React metadata so browser-accent owns them (removeChild freeze regression)', () => {
    // browser-accent.ts manages <link rel="icon">, apple-touch-icon and the
    // theme-color <meta> imperatively at runtime (to track the accent color).
    // If layout.tsx ALSO declares them via `metadata.icons` / `viewport.themeColor`,
    // React 19 owns those same <head> nodes; when browser-accent removes them React's
    // <head> reconciliation on the next client navigation throws "Cannot read
    // properties of null (reading 'removeChild')" and the page swap freezes
    // (URL changes, UI does not). Keep a single owner — do not re-add these here.
    const layout = readSource('src/app/layout.tsx')

    expect(layout).not.toMatch(/^\s*icons\s*:/m)
    expect(layout).not.toMatch(/themeColor\s*:/)
    // O manifest também é do browser-accent (href carrega ?color= do accent).
    expect(layout).not.toMatch(/^\s*manifest\s*:/m)
  })

  it('plays animations regardless of the OS reduced-motion setting (deliberate product decision)', () => {
    const providers = readSource('src/components/providers.tsx')
    expect(providers).toContain('reducedMotion="never"')

    const css = readSource('src/app/globals.css')
    expect(css).not.toContain('@media (prefers-reduced-motion')
  })

  it('keeps the dashboard page a static shell (no server-side prisma/auth/use cache)', () => {
    const dashboard = readSource('src/app/dashboard/page.tsx')
    expect(dashboard).not.toContain("from '@/lib/prisma'")
    expect(dashboard).not.toContain('getCachedAuthenticatedUser')
    expect(dashboard).not.toContain("'use cache'")
  })

  it('keeps the projetos page a static shell (no server-side prisma/auth/use cache)', () => {
    const projetos = readSource('src/app/projetos/page.tsx')
    expect(projetos).not.toContain("from '@/lib/prisma'")
    expect(projetos).not.toContain('getCachedAuthenticatedUser')
    expect(projetos).not.toContain("'use cache'")
  })
})
