'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Pipette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ACCENTS } from '@/components/accent-color-provider'
import { ACCENT_PRESETS, type AccentPreset } from '@/lib/preferences'
import { cn } from '@/lib/utils'
import { getColorInputValue, normalizeHexColor } from '@/lib/custom-color'

const ACCENT_ORDER = Object.keys(ACCENT_PRESETS) as AccentPreset[]

interface AccentColorPickerProps {
  accent: AccentPreset | 'custom'
  customColor: string | null
  onPresetChange: (accent: AccentPreset) => void
  onCustomColorChange: (hex: string) => void
  className?: string
}

export function AccentColorPicker({
  accent,
  customColor,
  onPresetChange,
  onCustomColorChange,
  className,
}: AccentColorPickerProps) {
  const nativeInputRef = useRef<HTMLInputElement>(null)
  const nativeColor = getColorInputValue(customColor)
  const [draftHex, setDraftHex] = useState(nativeColor)
  const normalizedDraft = normalizeHexColor(draftHex)

  useEffect(() => {
    setDraftHex(nativeColor)
  }, [nativeColor])

  function commitCustomColor(value: string) {
    const normalized = normalizeHexColor(value)
    setDraftHex(value)
    if (!normalized) return
    setDraftHex(normalized)
    onCustomColorChange(normalized)
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid grid-cols-7 gap-1.5">
        {ACCENT_ORDER.map((key) => {
          const active = accent === key
          return (
            <button
              key={key}
              type="button"
              aria-label={ACCENT_PRESETS[key].label}
              aria-pressed={active}
              title={ACCENT_PRESETS[key].label}
              onClick={() => onPresetChange(key)}
              className={cn(
                'relative h-7 w-7 rounded-md border border-border shadow-xs outline-none transition-[border-color,box-shadow,transform]',
                'hover:scale-[1.04] focus-visible:ring-[3px] focus-visible:ring-ring/50',
                active && 'border-primary ring-2 ring-primary/25'
              )}
              style={{ backgroundColor: ACCENTS[key] }}
            >
              {active && (
                <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white drop-shadow-[0_1px_1px_rgb(0_0_0_/_0.65)]" />
              )}
            </button>
          )
        })}
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-foreground">Personalizada</p>
          <span className="font-mono text-[11px] uppercase text-muted-foreground">
            {nativeColor}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={nativeInputRef}
            type="color"
            value={nativeColor}
            onChange={(event) => commitCustomColor(event.target.value)}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className={cn(
              'relative overflow-hidden border-border shadow-xs',
              accent === 'custom' && 'ring-2 ring-primary/25'
            )}
            style={{ backgroundColor: nativeColor }}
            onClick={() => nativeInputRef.current?.click()}
            aria-label="Selecionar cor personalizada"
            title="Selecionar cor personalizada"
          >
            <span className="absolute inset-0 bg-black/0 dark:bg-white/0" />
            <Pipette className="relative h-3.5 w-3.5 text-white drop-shadow-[0_1px_1px_rgb(0_0_0_/_0.65)]" />
          </Button>

          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">
              #
            </span>
            <Input
              value={draftHex.replace(/^#/, '')}
              onChange={(event) => commitCustomColor(event.target.value)}
              onBlur={() => setDraftHex(nativeColor)}
              aria-invalid={draftHex.length > 0 && !normalizedDraft}
              spellCheck={false}
              maxLength={7}
              className="h-8 pl-5 font-mono text-xs uppercase"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
