# Cross-Device Appearance Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the architectural preset, density, and custom accent color (hex) sync across a user's devices — like accent preset and theme already do — by consolidating appearance persistence into a single source of truth.

**Architecture:** Pure (de)serialization + conflict logic stay in `src/lib/user-settings.ts` / `src/lib/appearance.ts`; the `AccentColorProvider` orchestrates (state + DOM + localStorage + calling the persist helper) and becomes the single place that persists accent/custom/preset/density (local **and** server). Callers stop persisting in parallel. Theme is untouched (next-themes). Hydration applies remote values with the existing global 10s "recent local change" grace window. Last-write-wins; no realtime/CRDT/SSR-of-prefs.

**Tech Stack:** Next.js 16, React 19, Prisma 7 + Supabase Postgres, `@supabase/ssr`, Vitest + happy-dom + Testing Library / `react-dom/client`.

---

## Pre-flight facts (verified — do not re-derive)

- Branch: `feat/appearance-sync` (off `main`; spec at `docs/superpowers/specs/2026-05-31-appearance-sync-design.md`). Git root is `pontoarq/`.
- `/api/settings` `PATCH` already calls `parseSettingsPatch(body)` → `updateUserSettings(user.id, patch)` and `GET` returns `{ settings, options }`. So serialization changes propagate to both the client persist path (`persistAppearanceSettings` → PATCH) and hydration (GET) automatically — no route changes needed.
- `persistAppearanceSettings(patch)` (`src/lib/appearance.ts`) PATCHes `/api/settings` and throws on `!res.ok`. Callers use fire-and-forget with `.catch(toast.error)`.
- Validators in `src/lib/preferences.ts`: `isArchitecturalPreset`, `isDensityPreset`, `isAccentPreset`; types `ArchitecturalPreset`, `DensityPreset`, `AccentPreset`; constants `ARCHITECTURAL_PRESETS`, `DENSITY_PRESETS`.
- `normalizeHexColor(value)` (`src/lib/custom-color.ts`) → normalized `#rrggbb` or `null`. Pure; safe on server and client.
- `AccentColorProvider` localStorage keys: `archtime-accent`, `archtime-preset` (PRESET_KEY), `archtime-density` (DENSITY_KEY), `archtime-accent-custom` (CUSTOM_COLOR_KEY). The anti-flash inline script in `layout.tsx` already reads these — **do not change it**.
- Migration is additive (nullable / defaulted columns) → backward-compatible; the single Supabase DB is shared (no staging), so applying ahead of code is safe.

## File Structure

**Modified:**
- `prisma/schema.prisma` — 3 columns on `UserSettings`.
- `src/lib/user-settings.ts` — `SerializedUserSettings`/`SettingsPatch`/`serialize`/`parseSettingsPatch`/`updateUserSettings` gain the 3 fields (accentPreset widened to include `'custom'` in Increment 2).
- `src/lib/appearance.ts` — `AppearancePatch` gains the 3 fields.
- `src/components/accent-color-provider.tsx` — setters persist; new `syncAppearanceFromRemote`.
- `src/components/providers.tsx` — `PreferencesHydrator` applies the new fields.
- `src/app/configuracoes/configuracoes-client.tsx` — `setAccentPreset` wrapper stops persisting accent (provider does it).
- `src/components/navbar.tsx` — `handleAccentChange` stops persisting accent.

**Tests:**
- `src/lib/__tests__/user-settings.test.ts` — parse cases for new fields (the server contract = round-trip guard).
- `src/lib/__tests__/accent-color-provider.test.tsx` — persistence + hydration cases (incl. accent regression).

**Sequencing:** Increment 1 (Tasks 1–7: preset + density + accent-persistence consolidation + the accent/theme regression gate). Increment 2 (Tasks 8–12: custom color).

---

# Increment 1 — Preset + Density (+ accent consolidation + regression gate)

## Task 1: Schema migration

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Add the columns to the `UserSettings` model**

In `prisma/schema.prisma`, inside `model UserSettings`, immediately after the `weekStartDay ... @map("week_start_day")` line, add:

```prisma
  architecturalPreset   String?  @map("architectural_preset")
  density               String   @default("cozy")
  customAccentColor     String?  @map("custom_accent_color")
```

- [ ] **Step 2: Push the schema to the database and regenerate the client**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema." (3 columns added; existing rows get `density='cozy'`, others NULL).
Run: `npx prisma generate`
Expected: "Generated Prisma Client". (Now `settings.architecturalPreset`, `.density`, `.customAccentColor` are typed.)

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(settings): add architectural_preset, density, custom_accent_color columns"
```

## Task 2: Serialize + parse + update preset & density

**Files:** Modify `src/lib/user-settings.ts`; Test `src/lib/__tests__/user-settings.test.ts`

- [ ] **Step 1: Write failing parse tests**

Append inside the `describe('parseSettingsPatch', …)` block in `src/lib/__tests__/user-settings.test.ts`:

```ts
  it('accepts a valid architectural preset and null to clear it', () => {
    expect(parseSettingsPatch({ architecturalPreset: 'concreto' })).toMatchObject({ architecturalPreset: 'concreto' })
    expect(parseSettingsPatch({ architecturalPreset: null })).toMatchObject({ architecturalPreset: null })
  })

  it('rejects an invalid architectural preset', () => {
    expect(parseSettingsPatch({ architecturalPreset: 'brutalismo' })).toBe('Preset arquitetônico inválido')
  })

  it('accepts a valid density and rejects an invalid one', () => {
    expect(parseSettingsPatch({ density: 'compact' })).toMatchObject({ density: 'compact' })
    expect(parseSettingsPatch({ density: 'gigante' })).toBe('Densidade inválida')
  })

  it('preserves accent and theme through parse (regression: both still round-trip)', () => {
    expect(parseSettingsPatch({ accentPreset: 'rose' })).toMatchObject({ accentPreset: 'rose' })
    expect(parseSettingsPatch({ themeMode: 'dark' })).toMatchObject({ themeMode: 'dark' })
  })
```

- [ ] **Step 2: Run the tests — expect FAIL**

Run: `npm test -- user-settings`
Expected: FAIL (the new fields aren't parsed yet; `architecturalPreset`/`density` are dropped, so `toMatchObject` fails / no rejection).

- [ ] **Step 3: Extend the imports**

In `src/lib/user-settings.ts`, add to the existing `@/lib/preferences` import: `isArchitecturalPreset`, `isDensityPreset`, and the types `ArchitecturalPreset`, `DensityPreset`. (They sit alongside the existing `isAccentPreset`, `type AccentPreset`, etc.)

- [ ] **Step 4: Add fields to the interfaces**

In `SerializedUserSettings` add:
```ts
  architecturalPreset: ArchitecturalPreset | null
  density: DensityPreset
```
In `SettingsPatch` add:
```ts
  architecturalPreset?: ArchitecturalPreset | null
  density?: DensityPreset
```

- [ ] **Step 5: Map them in `serialize`**

Inside `serialize`, after the `weekStartDay` line, add:
```ts
  const architecturalPreset = isArchitecturalPreset(settings.architecturalPreset)
    ? settings.architecturalPreset
    : null
  const density = isDensityPreset(settings.density) ? settings.density : 'cozy'
```
And add `architecturalPreset,` and `density,` to the returned object.

- [ ] **Step 6: Parse them in `parseSettingsPatch`**

Before the final `return patch`, add:
```ts
  if ('architecturalPreset' in value) {
    if (value.architecturalPreset !== null && !isArchitecturalPreset(value.architecturalPreset)) {
      return 'Preset arquitetônico inválido'
    }
    patch.architecturalPreset = value.architecturalPreset as ArchitecturalPreset | null
  }

  if ('density' in value) {
    if (!isDensityPreset(value.density)) return 'Densidade inválida'
    patch.density = value.density
  }
```

- [ ] **Step 7: Persist them in `updateUserSettings`**

Inside the `prisma.userSettings.update({ data: { … } })` object, add (note `architecturalPreset` uses `!== undefined` because `null` is a valid value to clear it):
```ts
      ...(patch.architecturalPreset !== undefined ? { architecturalPreset: patch.architecturalPreset } : {}),
      ...(patch.density ? { density: patch.density } : {}),
```

- [ ] **Step 8: Run tests + typecheck**

Run: `npm test -- user-settings` → PASS.
Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/user-settings.ts src/lib/__tests__/user-settings.test.ts
git commit -m "feat(settings): serialize/parse/persist architecturalPreset + density"
```

## Task 3: Extend the appearance persist patch

**Files:** Modify `src/lib/appearance.ts`

- [ ] **Step 1: Widen `AppearancePatch`**

In `src/lib/appearance.ts`, add the imports `type ArchitecturalPreset`, `type DensityPreset` to the `@/lib/preferences` import, and extend the interface:
```ts
export interface AppearancePatch {
  accentPreset?: AccentPreset
  themeMode?: ThemeMode
  architecturalPreset?: ArchitecturalPreset | null
  density?: DensityPreset
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → 0 errors. (No behavior change yet; `persistAppearanceSettings` already forwards the whole patch as JSON.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/appearance.ts
git commit -m "feat(settings): allow architecturalPreset + density in AppearancePatch"
```

## Task 4: Provider persists preset/density + accent consolidation + `syncAppearanceFromRemote`

**Files:** Modify `src/components/accent-color-provider.tsx`; Test `src/lib/__tests__/accent-color-provider.test.tsx`

This is the consolidation. `setAccent` starts persisting `{ accentPreset, architecturalPreset: null }` (so a synced preset is cleared on the other device); `setArchitecturalPreset` and `setDensity` persist their fields. A new `syncAppearanceFromRemote` applies remote preset/density without marking a local change. The accent-persistence move is the **regression-gated** part.

- [ ] **Step 1: Write failing persistence + hydration tests**

In `src/lib/__tests__/accent-color-provider.test.tsx`:

(a) Add a 4th button to `ProviderHarness` (after the `white` button):
```tsx
      <button type="button" onClick={() => setDensity('compact')}>
        density
      </button>
```
and add `setDensity` to its `useAccentColor()` destructure:
```tsx
  const { setAccent, setArchitecturalPreset, setCustomColor, setDensity, syncAppearanceFromRemote } = useAccentColor()
```
Also expose hydration via a 5th button:
```tsx
      <button type="button" onClick={() => syncAppearanceFromRemote({ architecturalPreset: 'terracota', density: 'spacious' })}>
        hydrate
      </button>
```

(b) In `beforeEach`, stub `fetch` (the setters now persist; without a stub the fire-and-forget PATCH would reject):
```tsx
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
```
and in `afterEach` add `vi.unstubAllGlobals()`.

(c) Add tests inside the `describe`:
```tsx
  function lastPatch() {
    const fetchMock = globalThis.fetch as unknown as { mock: { calls: [string, { body: string }][] } }
    const call = fetchMock.mock.calls.at(-1)
    return call ? JSON.parse(call[1].body) : null
  }

  it('persists the architectural preset to the server when set', () => {
    act(() => {
      root.render(<AccentColorProvider><ProviderHarness /></AccentColorProvider>)
    })
    act(() => { document.querySelector<HTMLButtonElement>('button:nth-of-type(1)')?.click() }) // setArchitecturalPreset('vegetacao')
    expect(lastPatch()).toEqual({ architecturalPreset: 'vegetacao' })
  })

  it('persists density to the server when set', () => {
    act(() => {
      root.render(<AccentColorProvider><ProviderHarness /></AccentColorProvider>)
    })
    act(() => { document.querySelector<HTMLButtonElement>('button:nth-of-type(4)')?.click() }) // setDensity('compact')
    expect(lastPatch()).toEqual({ density: 'compact' })
  })

  it('persists accent AND clears the preset server-side when an accent is chosen (regression: accent still syncs)', () => {
    act(() => {
      root.render(<AccentColorProvider><ProviderHarness /></AccentColorProvider>)
    })
    act(() => { document.querySelector<HTMLButtonElement>('button:nth-of-type(2)')?.click() }) // setAccent('rose')
    expect(lastPatch()).toEqual({ accentPreset: 'rose', architecturalPreset: null })
  })

  it('applies remote preset + density on hydration without persisting them back', () => {
    act(() => {
      root.render(<AccentColorProvider><ProviderHarness /></AccentColorProvider>)
    })
    const before = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length
    act(() => { document.querySelector<HTMLButtonElement>('button:nth-of-type(5)')?.click() }) // syncAppearanceFromRemote(...)
    expect(document.documentElement.getAttribute('data-preset')).toBe('terracota')
    expect(document.documentElement.getAttribute('data-density')).toBe('spacious')
    expect(localStorage.getItem('archtime-preset')).toBe('terracota')
    expect(localStorage.getItem('archtime-density')).toBe('spacious')
    const after = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length
    expect(after).toBe(before) // hydration must NOT persist
  })
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- accent-color-provider`
Expected: FAIL (`syncAppearanceFromRemote` undefined; setters don't persist).

- [ ] **Step 3: Add the persist helper + imports**

In `src/components/accent-color-provider.tsx`, add imports:
```tsx
import { toast } from 'sonner'
import { markLocalPreferenceChange, persistAppearanceSettings, type AppearancePatch } from '@/lib/appearance'
import type { DensityPreset, ArchitecturalPreset, AccentPreset } from '@/lib/preferences'
```
(Adjust the existing `@/lib/appearance` and `@/lib/preferences` imports rather than duplicating — `markLocalPreferenceChange` is already imported from appearance; add `persistAppearanceSettings` and `type AppearancePatch` there. `DensityPreset`/`ArchitecturalPreset`/`AccentPreset` are already imported from preferences.)

Add a fire-and-forget helper inside `AccentColorProvider` (before the setters):
```tsx
  function persist(patch: AppearancePatch) {
    persistAppearanceSettings(patch).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar aparência')
    })
  }
```

- [ ] **Step 4: Persist in the setters**

In `setAccent`, after the existing `syncBrowserAccentColor(...)` call, add:
```tsx
    persist({ accentPreset: newAccent, architecturalPreset: null })
```
In `setArchitecturalPreset`, after its `syncBrowserAccentColor(...)` calls (both branches done), add at the end of the function:
```tsx
    persist({ architecturalPreset: preset })
```
In `setDensity`, after `localStorage.setItem(DENSITY_KEY, newDensity)`, add:
```tsx
    persist({ density: newDensity })
```

- [ ] **Step 5: Add `syncAppearanceFromRemote` + expose it on the context**

Add the method (mirrors `syncAccentFromRemote` — applies without `markLocalPreferenceChange`):
```tsx
  // Applies server-synced appearance (hydration path) without marking a local change.
  function syncAppearanceFromRemote(patch: { architecturalPreset?: ArchitecturalPreset | null; density?: DensityPreset }) {
    if (patch.architecturalPreset !== undefined) {
      setArchitecturalPresetState(patch.architecturalPreset)
      if (patch.architecturalPreset) {
        document.documentElement.setAttribute('data-preset', patch.architecturalPreset)
        localStorage.setItem(PRESET_KEY, patch.architecturalPreset)
      } else {
        document.documentElement.removeAttribute('data-preset')
        localStorage.removeItem(PRESET_KEY)
      }
      syncBrowserAccentColor(
        getEffectiveBrowserAccentColor({ accent, customColor, architecturalPreset: patch.architecturalPreset })
      )
    }
    if (patch.density) {
      setDensityState(patch.density)
      document.documentElement.setAttribute('data-density', patch.density)
      localStorage.setItem(DENSITY_KEY, patch.density)
    }
  }
```
Add `syncAppearanceFromRemote` to the `AccentColorContextValue` interface:
```tsx
  syncAppearanceFromRemote: (patch: { architecturalPreset?: ArchitecturalPreset | null; density?: DensityPreset }) => void
```
to the default context value:
```tsx
  syncAppearanceFromRemote: () => {},
```
and to the Provider `value={{ … }}`: add `syncAppearanceFromRemote`.

- [ ] **Step 6: Run tests — expect PASS**

Run: `npm test -- accent-color-provider` → PASS (incl. the 2 pre-existing preset-clearing tests, which now also trigger a stubbed persist).
Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/accent-color-provider.tsx src/lib/__tests__/accent-color-provider.test.tsx
git commit -m "feat(settings): provider persists preset/density + accent; add syncAppearanceFromRemote"
```

## Task 5: Callers stop persisting accent in parallel

**Files:** Modify `src/app/configuracoes/configuracoes-client.tsx`, `src/components/navbar.tsx`

The provider now persists accent, so the callers must not also PATCH it (double-persist + split). Theme persistence stays.

- [ ] **Step 1: `configuracoes-client.tsx` — `setAccentPreset` wrapper**

Replace:
```tsx
  function setAccentPreset(accentPreset: AccentPreset) {
    setSettings((current) => ({ ...current, accentPreset }))
    setAccent(accentPreset)
    persistAppearanceSettings({ accentPreset }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar aparência')
    })
  }
```
with:
```tsx
  function setAccentPreset(accentPreset: AccentPreset) {
    setSettings((current) => ({ ...current, accentPreset }))
    setAccent(accentPreset) // provider persists accent (+ clears preset) server-side
  }
```
Then remove the now-unused `persistAppearanceSettings` import if `setThemeMode` no longer needs it — **note:** `setThemeMode` still calls `persistAppearanceSettings({ themeMode })`, so keep the import. Only remove the accent persist call.

- [ ] **Step 2: `navbar.tsx` — `handleAccentChange`**

Replace:
```tsx
  function handleAccentChange(nextAccent: AccentPreset) {
    setAccent(nextAccent)
    persistAppearance({ accentPreset: nextAccent })
  }
```
with:
```tsx
  function handleAccentChange(nextAccent: AccentPreset) {
    setAccent(nextAccent) // provider persists accent server-side
  }
```
If `persistAppearance`/`persistAppearanceSettings` and the `persistAppearanceSettings` import become unused in `navbar.tsx`, remove them (and the `toast` import if it becomes unused). Verify with the typecheck/build in the next step.

- [ ] **Step 3: Typecheck + tests**

Run: `npx tsc --noEmit` → 0 errors (fix any unused-import errors by removing the dead imports).
Run: `npm test` → all pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/configuracoes/configuracoes-client.tsx src/components/navbar.tsx
git commit -m "refactor(settings): stop double-persisting accent; provider is the single source"
```

## Task 6: Hydrate preset + density from the server

**Files:** Modify `src/components/providers.tsx`

- [ ] **Step 1: Apply the new fields in `PreferencesHydrator`**

In `src/components/providers.tsx`, add `syncAppearanceFromRemote` to the `useAccentColor()` destructure:
```tsx
  const { syncAccentFromRemote, syncAppearanceFromRemote } = useAccentColor()
```
Inside the `fetch('/api/settings')` `.then((body) => { … })`, after `setTheme(body.settings.themeMode)`, add:
```tsx
        syncAppearanceFromRemote({
          architecturalPreset: body.settings.architecturalPreset ?? null,
          density: body.settings.density,
        })
```
(Gated by the existing `shouldApplyRemotePreferences` check above it, so a recent local change still wins.)

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` → 0 errors.
Run: `npm run build` → succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/providers.tsx
git commit -m "feat(settings): hydrate architecturalPreset + density from the server"
```

## Task 7: Increment 1 verification

- [ ] **Step 1: Full suite + build**

Run: `npm test` → all pass (incl. new parse + provider tests).
Run: `npm run build` → succeeds.

- [ ] **Step 2: Manual note for preview (after push)**

After the branch is pushed and the Deploy Preview builds, verify on the preview in two contexts (two anonymous windows / two profiles, same account): set the architectural preset + density in one; reload the other → they reflect the new values (a one-time flash on a brand-new context is expected and accepted). Confirm accent + theme still sync (no regression). Confirm choosing a plain accent in one context clears the preset in the other after reload.

---

# Increment 2 — Custom accent color

Custom color means `accent === 'custom'` + a hex. We widen the persisted `accentPreset` to accept the literal `'custom'` (mirroring localStorage `archtime-accent='custom'`) and store the hex in `customAccentColor`.

## Task 8: Serialize + parse + update custom color

**Files:** Modify `src/lib/user-settings.ts`; Test `src/lib/__tests__/user-settings.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `describe('parseSettingsPatch', …)`:
```ts
  it('accepts accentPreset "custom" and a valid custom color', () => {
    expect(parseSettingsPatch({ accentPreset: 'custom' })).toMatchObject({ accentPreset: 'custom' })
    expect(parseSettingsPatch({ customAccentColor: '#AB12CD' })).toMatchObject({ customAccentColor: '#ab12cd' })
    expect(parseSettingsPatch({ customAccentColor: null })).toMatchObject({ customAccentColor: null })
  })

  it('rejects an invalid custom color', () => {
    expect(parseSettingsPatch({ customAccentColor: 'not-a-color' })).toBe('Cor personalizada inválida')
  })
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- user-settings`
Expected: FAIL (`'custom'` rejected as `'Preset visual inválido'`; `customAccentColor` dropped).

- [ ] **Step 3: Import `normalizeHexColor`**

In `src/lib/user-settings.ts`, add `import { normalizeHexColor } from '@/lib/custom-color'`.

- [ ] **Step 4: Widen the accent types + add `customAccentColor`**

In `SerializedUserSettings` change `accentPreset: AccentPreset` to `accentPreset: AccentPreset | 'custom'` and add `customAccentColor: string | null`.
In `SettingsPatch` change `accentPreset?: AccentPreset` to `accentPreset?: AccentPreset | 'custom'` and add `customAccentColor?: string | null`.

- [ ] **Step 5: `serialize`**

Replace the `accentPreset` line with:
```ts
  const accentPreset = settings.accentPreset === 'custom'
    ? 'custom' as const
    : (isAccentPreset(settings.accentPreset) ? settings.accentPreset : 'indigo')
  const customAccentColor = normalizeHexColor(settings.customAccentColor)
```
and add `customAccentColor,` to the returned object.

- [ ] **Step 6: `parseSettingsPatch`**

Replace the existing `accentPreset` block with one that also accepts `'custom'`:
```ts
  if ('accentPreset' in value) {
    if (value.accentPreset !== 'custom' && !isAccentPreset(value.accentPreset)) {
      return 'Preset visual inválido'
    }
    patch.accentPreset = value.accentPreset as AccentPreset | 'custom'
  }
```
And add a `customAccentColor` block before `return patch`:
```ts
  if ('customAccentColor' in value) {
    if (value.customAccentColor === null) {
      patch.customAccentColor = null
    } else {
      const normalized = normalizeHexColor(value.customAccentColor as string)
      if (!normalized) return 'Cor personalizada inválida'
      patch.customAccentColor = normalized
    }
  }
```

- [ ] **Step 7: `updateUserSettings`**

Add to the `data` object:
```ts
      ...(patch.customAccentColor !== undefined ? { customAccentColor: patch.customAccentColor } : {}),
```
(`accentPreset` is already persisted by the existing `...(patch.accentPreset ? { accentPreset: patch.accentPreset } : {})` line, which now also stores `'custom'`.)

- [ ] **Step 8: Run tests + typecheck**

Run: `npm test -- user-settings` → PASS.
Run: `npx tsc --noEmit` → 0 errors. (If widening `accentPreset` to `AccentPreset | 'custom'` surfaces type errors at consumers — e.g. `syncAccentFromRemote(body.settings.accentPreset)` in `providers.tsx` — they are fixed in Task 10/11; if the typecheck must pass here, temporarily narrow at that call site with `body.settings.accentPreset as AccentPreset`, then finalize in Task 11.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/user-settings.ts src/lib/__tests__/user-settings.test.ts
git commit -m "feat(settings): serialize/parse/persist custom accent color"
```

## Task 9: Custom color in the appearance patch

**Files:** Modify `src/lib/appearance.ts`

- [ ] **Step 1: Widen `AppearancePatch`**

Change `accentPreset?: AccentPreset` to `accentPreset?: AccentPreset | 'custom'` and add `customAccentColor?: string | null` to `AppearancePatch`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/appearance.ts
git commit -m "feat(settings): allow custom accent color in AppearancePatch"
```

## Task 10: Provider persists + hydrates custom color

**Files:** Modify `src/components/accent-color-provider.tsx`; Test `src/lib/__tests__/accent-color-provider.test.tsx`

- [ ] **Step 1: Write failing tests**

In `src/lib/__tests__/accent-color-provider.test.tsx`, add a hydration button to `ProviderHarness`:
```tsx
      <button type="button" onClick={() => syncAppearanceFromRemote({ accentPreset: 'custom', customAccentColor: '#123456' })}>
        hydrate-custom
      </button>
```
and add tests:
```tsx
  it('persists the custom color (and accent=custom, preset cleared) when a custom color is set', () => {
    act(() => {
      root.render(<AccentColorProvider><ProviderHarness /></AccentColorProvider>)
    })
    act(() => { document.querySelector<HTMLButtonElement>('button:nth-of-type(3)')?.click() }) // setCustomColor('#ffffff')
    expect(lastPatch()).toEqual({ accentPreset: 'custom', customAccentColor: '#ffffff', architecturalPreset: null })
  })

  it('applies a remote custom color on hydration', () => {
    act(() => {
      root.render(<AccentColorProvider><ProviderHarness /></AccentColorProvider>)
    })
    act(() => { document.querySelector<HTMLButtonElement>('button:nth-of-type(6)')?.click() }) // hydrate-custom
    expect(document.documentElement.getAttribute('data-accent')).toBe('custom')
    expect(localStorage.getItem('archtime-accent')).toBe('custom')
    expect(localStorage.getItem('archtime-accent-custom')).toBe('#123456')
  })
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- accent-color-provider` → FAIL.

- [ ] **Step 3: Persist in `setCustomColor`**

In `setCustomColor`, after the existing `syncBrowserAccentColor(...)` call, add:
```tsx
    persist({ accentPreset: 'custom', customAccentColor: normalized, architecturalPreset: null })
```

- [ ] **Step 4: Replace `syncAppearanceFromRemote` entirely with the custom-aware version**

Replace the whole `syncAppearanceFromRemote` function (from Task 4) with this complete version. It adds a custom-color branch and computes the browser accent **once at the end** from the resulting state (so accent/custom/preset precedence is correct regardless of which fields the patch carries):
```tsx
  // Applies server-synced appearance (hydration path) without marking a local change.
  function syncAppearanceFromRemote(patch: {
    accentPreset?: AccentPreset | 'custom'
    customAccentColor?: string | null
    architecturalPreset?: ArchitecturalPreset | null
    density?: DensityPreset
  }) {
    let nextAccent: AccentPreset | 'custom' = accent
    let nextCustomColor = customColor
    let nextPreset = architecturalPreset

    if (patch.accentPreset === 'custom' && patch.customAccentColor) {
      const normalized = normalizeHexColor(patch.customAccentColor)
      if (normalized) {
        nextAccent = 'custom'
        nextCustomColor = normalized
        setAccentState('custom')
        setCustomColorState(normalized)
        document.documentElement.setAttribute('data-accent', 'custom')
        applyCustomAccentProperties(normalized)
        localStorage.setItem('archtime-accent', 'custom')
        localStorage.setItem(CUSTOM_COLOR_KEY, normalized)
      }
    }

    if (patch.architecturalPreset !== undefined) {
      nextPreset = patch.architecturalPreset
      setArchitecturalPresetState(patch.architecturalPreset)
      if (patch.architecturalPreset) {
        document.documentElement.setAttribute('data-preset', patch.architecturalPreset)
        localStorage.setItem(PRESET_KEY, patch.architecturalPreset)
      } else {
        document.documentElement.removeAttribute('data-preset')
        localStorage.removeItem(PRESET_KEY)
      }
    }

    if (patch.density) {
      setDensityState(patch.density)
      document.documentElement.setAttribute('data-density', patch.density)
      localStorage.setItem(DENSITY_KEY, patch.density)
    }

    syncBrowserAccentColor(
      getEffectiveBrowserAccentColor({ accent: nextAccent, customColor: nextCustomColor, architecturalPreset: nextPreset })
    )
  }
```
Add `normalizeHexColor` to the existing `@/lib/custom-color` import. Update the `syncAppearanceFromRemote` type in `AccentColorContextValue` to this widened parameter shape; the default context stub stays `() => {}`.

- [ ] **Step 5: Run tests — expect PASS**

Run: `npm test -- accent-color-provider` → PASS.
Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/accent-color-provider.tsx src/lib/__tests__/accent-color-provider.test.tsx
git commit -m "feat(settings): provider persists + hydrates custom accent color"
```

## Task 11: Hydrate custom color (custom-aware accent branch)

**Files:** Modify `src/components/providers.tsx`

- [ ] **Step 1: Branch the accent application for `'custom'`**

In `PreferencesHydrator`, replace:
```tsx
            if (!hasLocalCustomAccentPreference()) syncAccentFromRemote(body.settings.accentPreset)
            setTheme(body.settings.themeMode)
            syncAppearanceFromRemote({
              architecturalPreset: body.settings.architecturalPreset ?? null,
              density: body.settings.density,
            })
```
with:
```tsx
            if (!hasLocalCustomAccentPreference()) {
              if (body.settings.accentPreset === 'custom' && body.settings.customAccentColor) {
                syncAppearanceFromRemote({
                  accentPreset: 'custom',
                  customAccentColor: body.settings.customAccentColor,
                })
              } else {
                syncAccentFromRemote(body.settings.accentPreset)
              }
            }
            setTheme(body.settings.themeMode)
            syncAppearanceFromRemote({
              architecturalPreset: body.settings.architecturalPreset ?? null,
              density: body.settings.density,
            })
```
Remove any temporary `as AccentPreset` cast added in Task 8 Step 8.

- [ ] **Step 2: Typecheck + build + full suite**

Run: `npx tsc --noEmit` → 0 errors.
Run: `npm test` → all pass.
Run: `npm run build` → succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/providers.tsx
git commit -m "feat(settings): hydrate custom accent color from the server"
```

## Task 12: Final verification + PR

- [ ] **Step 1: Full local verification**

Run: `npm test` → all pass.
Run: `npm run build` → succeeds.

- [ ] **Step 2: Push + preview**

```bash
git push -u origin feat/appearance-sync
```
Monitor the Netlify Deploy Preview to a clean build (no errors).

- [ ] **Step 3: Two-context preview verification**

In two anonymous windows (same account): set architectural preset, density, and a custom accent color in one; reload the other → all three reflect the new values (one-time flash on a brand-new context accepted). Confirm accent preset + theme still sync. Confirm picking a plain accent in one clears the preset in the other after reload. No console errors.

- [ ] **Step 4: Open the PR**

```bash
gh pr create --base main --head feat/appearance-sync \
  --title "feat: sync appearance prefs (preset, density, custom color) across devices" \
  --body "$(cat <<'EOF'
Persists architectural preset, density, and custom accent color to user_settings so they sync across devices (accent preset + theme already did). Consolidates appearance persistence into the AccentColorProvider (single source); callers stop double-persisting; theme untouched (next-themes). Last-write-wins with the existing 10s local-change grace; server-driven hydration. New-device first-load flash accepted (no SSR of prefs).

Verified: parse round-trip tests, provider persist/hydrate tests (incl. accent regression), tsc, build, two-context preview.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Present to the user (PT-BR)** — what shipped, the two-context verification result, and the accepted new-device flash.

---

## Self-review notes (carried into execution)

- **Spec coverage:** schema (T1), serialize/parse/persist preset+density (T2) + custom (T8), AppearancePatch (T3/T9), provider persistence consolidation incl. `setAccent`→`preset=null` (T4) + custom (T10), callers stop double-persisting (T5), hydration preset/density (T6) + custom (T11), regression gate = accent persist test in T4 + accent contract in T2/T8 + theme contract preserved (theme code untouched), new-device flash accepted (T7/T12 notes), increments split (1: T1–7, 2: T8–12).
- **Regression gate:** if the accent persist/hydrate tests (T4) can't be made green, STOP and fall back to additive (persist only the 3 new fields; leave accent persistence in the callers) — do not ship a regressed accent/theme sync.
- **Type consistency:** `accentPreset: AccentPreset | 'custom'`, `architecturalPreset: ArchitecturalPreset | null`, `density: DensityPreset`, `customAccentColor: string | null` used consistently across `SerializedUserSettings`/`SettingsPatch`/`AppearancePatch`/`syncAppearanceFromRemote`. `persist()` helper + `syncAppearanceFromRemote()` are the provider's two new members.
- **Theme:** never moved into the provider; `configuracoes` keeps `setThemeMode`→`persistAppearanceSettings({ themeMode })`.
