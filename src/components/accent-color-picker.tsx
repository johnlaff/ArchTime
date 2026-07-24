'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { HexColorPicker } from 'react-colorful'
import { Input } from '@/components/ui/input'
import { ACCENTS } from '@/components/accent-color-provider'
import { ACCENT_PRESETS, type AccentPreset } from '@/lib/preferences'
import { cn } from '@/lib/utils'
import {
  getColorInputValue,
  getReadableCustomForeground,
  normalizeHexColor,
} from '@/lib/custom-color'

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
  const currentColor = getColorInputValue(customColor)
  // Rastreia o ultimo currentColor confirmado para detectar mudanca externa durante render
  const [draftHex, setDraftHex] = useState(currentColor)
  // react-doctor-disable-next-line react-doctor/rerender-state-only-in-handlers -- committedColor é lido no render (comparação abaixo) como "prev value" do padrão de ajuste de estado durante o render; precisa ser state (não ref) para o React reagir a uma mudança externa de currentColor.
  const [committedColor, setCommittedColor] = useState(currentColor)

  // Resetar draft durante render quando currentColor mudar externamente,
  // sem useEffect (evita no-derived-state-effect / no-reset-all-state-on-prop-change)
  if (committedColor !== currentColor) {
    setCommittedColor(currentColor)
    setDraftHex(currentColor)
  }

  const normalizedDraft = normalizeHexColor(draftHex)
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
            {currentColor}
          </span>
        </div>

        <div className="accent-picker mb-2" role="group" aria-label="Seletor de cor personalizada">
          <HexColorPicker color={currentColor} onChange={commitCustomColor} />
        </div>

        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md border border-border shadow-xs',
              accent === 'custom' && 'ring-2 ring-primary/25'
            )}
            style={{
              backgroundColor: currentColor,
              color: getReadableCustomForeground(currentColor),
            }}
            aria-hidden="true"
          >
            A
          </div>
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">
              #
            </span>
            <Input
              value={draftHex.replace(/^#/, '')}
              onChange={(event) => commitCustomColor(event.target.value)}
              onBlur={() => setDraftHex(currentColor)}
              aria-label="Código hexadecimal da cor"
              aria-invalid={draftHex.length > 0 && !normalizedDraft}
              spellCheck={false}
              maxLength={6}
              className="h-8 pl-5 font-mono text-xs uppercase"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
