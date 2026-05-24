import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('accent color picker integration', () => {
  it('uses the modern custom color picker in the top navbar palette popover', () => {
    const navbar = readFileSync(join(process.cwd(), 'src/components/navbar.tsx'), 'utf8')

    expect(navbar).toContain("import { AccentColorPicker } from '@/components/accent-color-picker'")
    expect(navbar).toContain('<AccentColorPicker')
    expect(navbar).not.toContain('grid grid-cols-2 gap-2')
  })
})
