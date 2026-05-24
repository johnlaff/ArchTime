'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ACCENTS } from '@/components/accent-color-provider'
import { ACCENT_PRESETS, type AccentPreset } from '@/lib/preferences'
import { cn } from '@/lib/utils'
import {
  getColorInputValue,
  getReadableCustomForeground,
  hexToHsl,
  hslToHex,
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
  const colorAreaRef = useRef<HTMLDivElement>(null)
  const currentColor = getColorInputValue(customColor)
  const currentHsl = hexToHsl(currentColor)
  const [draftHex, setDraftHex] = useState(currentColor)
  const normalizedDraft = normalizeHexColor(draftHex)
  const hueColor = hslToHex({ h: currentHsl.h, s: 100, l: 50 })

  useEffect(() => {
    setDraftHex(currentColor)
  }, [currentColor])

  function commitCustomColor(value: string) {
    const normalized = normalizeHexColor(value)
    setDraftHex(value)
    if (!normalized) return
    setDraftHex(normalized)
    onCustomColorChange(normalized)
  }

  function commitHsl(next: Partial<typeof currentHsl>) {
    commitCustomColor(hslToHex({ ...currentHsl, ...next }))
  }

  function updateAreaFromPointer(clientX: number, clientY: number) {
    const rect = colorAreaRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    commitHsl({
      s: Math.round(x * 100),
      l: Math.round((1 - y) * 100),
    })
  }

  function handleAreaPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    window.getSelection()?.removeAllRanges()
    event.currentTarget.setPointerCapture(event.pointerId)
    updateAreaFromPointer(event.clientX, event.clientY)
  }

  function handleAreaPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.preventDefault()
    window.getSelection()?.removeAllRanges()
    updateAreaFromPointer(event.clientX, event.clientY)
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

        <div
          ref={colorAreaRef}
          aria-hidden="true"
          onPointerDown={handleAreaPointerDown}
          onPointerMove={handleAreaPointerMove}
          onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
          onPointerCancel={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
          onDragStart={(event) => event.preventDefault()}
          className="relative mb-2 h-24 cursor-crosshair select-none touch-none overflow-hidden rounded-md border border-border shadow-inner"
          style={{
            background: `
              linear-gradient(to top, black, transparent),
              linear-gradient(to right, white, ${hueColor})
            `,
          }}
        >
          <span
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0_/_0.45)]"
            style={{
              left: `${currentHsl.s}%`,
              top: `${100 - currentHsl.l}%`,
            }}
          />
        </div>

        <div className="mb-2 flex items-center gap-2">
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
          <input
            type="range"
            min={0}
            max={359}
            value={currentHsl.h}
            aria-label="Matiz"
            onChange={(event) => commitHsl({ h: Number(event.target.value) })}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full border border-border bg-[linear-gradient(to_right,red,yellow,lime,cyan,blue,magenta,red)]"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">
              #
            </span>
            <Input
              value={draftHex.replace(/^#/, '')}
              onChange={(event) => commitCustomColor(event.target.value)}
              onBlur={() => setDraftHex(currentColor)}
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
