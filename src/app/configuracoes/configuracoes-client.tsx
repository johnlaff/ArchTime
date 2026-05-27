'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAccentColor } from '@/components/accent-color-provider'
import { AccentColorPicker } from '@/components/accent-color-picker'
import {
  getLocalAppearancePatch,
  markLocalPreferenceChange,
  persistAppearanceSettings,
} from '@/lib/appearance'
import {
  WEEKDAY_KEYS,
  WEEK_START_DAYS,
  WORK_SCHEDULE_TEMPLATES,
  ARCHITECTURAL_PRESETS,
  DENSITY_PRESETS,
  type AccentPreset,
  type ArchitecturalPreset,
  type DensityPreset,
  type CumulativeBalanceScope,
  type ThemeMode,
  type WeekStartDay,
  type WorkMinutesByWeekday,
  type WorkScheduleTemplate,
} from '@/lib/preferences'
import { calculateExpectedMinutes, formatMinutes, getLocalDateBRT, getMonthRangeBRT } from '@/lib/dates'
import type { SerializedUserSettings, SettingsOptions } from '@/lib/user-settings'

const WEEKDAY_LABELS: Record<string, string> = {
  '0': 'Domingo',
  '1': 'Segunda',
  '2': 'Terça',
  '3': 'Quarta',
  '4': 'Quinta',
  '5': 'Sexta',
  '6': 'Sábado',
}

function hoursFromMinutes(minutes: number): string {
  return (minutes / 60).toString()
}

function minutesFromHours(value: string): number {
  const hours = Number(value)
  if (!Number.isFinite(hours)) return 0
  return Math.max(0, Math.min(24 * 60, Math.round(hours * 60)))
}

export function ConfiguracoesClient({
  initialSettings,
  options,
}: {
  initialSettings: SerializedUserSettings
  options: SettingsOptions
}) {
  const [settings, setSettings] = useState(initialSettings)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const { setTheme } = useTheme()
  const { accent, setAccent, customColor, setCustomColor, architecturalPreset: activePreset, setArchitecturalPreset, density, setDensity } = useAccentColor()

  useEffect(() => {
    const localAppearance = getLocalAppearancePatch()
    if (!localAppearance.accentPreset && !localAppearance.themeMode) return
    setSettings((current) => ({ ...current, ...localAppearance }))
  }, [])

  const [blueprint, setBlueprint] = useState<boolean>(false)

  useEffect(() => {
    const saved = localStorage.getItem('archtime-blueprint')
    const enabled = saved === 'true'
    setBlueprint(enabled)
    if (enabled) document.documentElement.setAttribute('data-blueprint', 'true')
  }, [])

  function toggleBlueprint(enabled: boolean) {
    setBlueprint(enabled)
    if (enabled) {
      document.documentElement.setAttribute('data-blueprint', 'true')
      localStorage.setItem('archtime-blueprint', 'true')
    } else {
      document.documentElement.removeAttribute('data-blueprint')
      localStorage.removeItem('archtime-blueprint')
    }
  }

  const expectedThisMonth = useMemo(() => {
    const month = getLocalDateBRT().slice(0, 7)
    const range = getMonthRangeBRT(month)
    return calculateExpectedMinutes({
      startDate: range.startDate,
      endDate: range.endDate,
      workMinutesByWeekday: settings.workMinutesByWeekday,
    })
  }, [settings.workMinutesByWeekday])

  function setTemplate(template: WorkScheduleTemplate) {
    const minutes = WORK_SCHEDULE_TEMPLATES[template].minutes
    setSettings((current) => ({
      ...current,
      workScheduleTemplate: template,
      workMinutesByWeekday: minutes,
    }))
  }

  function setDayMinutes(day: keyof WorkMinutesByWeekday, value: string) {
    setSettings((current) => ({
      ...current,
      workScheduleTemplate: 'custom',
      workMinutesByWeekday: {
        ...current.workMinutesByWeekday,
        [day]: minutesFromHours(value),
      },
    }))
  }

  function setAccentPreset(accentPreset: AccentPreset) {
    setSettings((current) => ({ ...current, accentPreset }))
    setAccent(accentPreset)
    persistAppearanceSettings({ accentPreset }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar aparência')
    })
  }

  function setThemeMode(themeMode: ThemeMode) {
    setSettings((current) => ({ ...current, themeMode }))
    markLocalPreferenceChange()
    setTheme(themeMode)
    persistAppearanceSettings({ themeMode }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar aparência')
    })
  }

  async function handleSave() {
    const snapshot = settings
    setSaving(true)
    toast.success('Configurações salvas')
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Erro ao salvar configurações')
      }
      // Bust the client Router Cache so other modules (dashboard, histórico,
      // sidebar) reflect the new settings without a manual reload.
      router.refresh()
    } catch (error) {
      setSettings(snapshot)
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar configurações')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Configurações</h1>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Jornada prevista</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Template</Label>
            <Select
              value={settings.workScheduleTemplate}
              onValueChange={(value) => setTemplate(value as WorkScheduleTemplate)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(options.workScheduleTemplates).map(([key, template]) => (
                  <SelectItem key={key} value={key}>{template.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {WEEKDAY_KEYS.map((day) => (
              <div key={day} className="space-y-1">
                <Label htmlFor={`day-${day}`}>{WEEKDAY_LABELS[day]}</Label>
                <Input
                  id={`day-${day}`}
                  type="number"
                  step="0.25"
                  min="0"
                  max="24"
                  value={hoursFromMinutes(settings.workMinutesByWeekday[day])}
                  onChange={(event) => setDayMinutes(day, event.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="rounded-md bg-accent px-3 py-2 text-sm">
            Previsto neste mês: <strong>{formatMinutes(expectedThisMonth)}</strong>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Semana</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <Label id="week-start-label">Início da semana</Label>
            <div role="radiogroup" aria-labelledby="week-start-label" className="flex gap-2 mt-1">
              {(Object.entries(WEEK_START_DAYS) as [WeekStartDay, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={settings.weekStartDay === key}
                  onClick={() => setSettings((current) => ({ ...current, weekStartDay: key }))}
                  className={[
                    'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                    settings.weekStartDay === key
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:bg-accent',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Banco de horas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.showCumulativeBalance}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  showCumulativeBalance: event.target.checked,
                }))
              }
              className="h-4 w-4 accent-primary"
            />
            Mostrar saldo acumulado
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Dimensão do acumulado</Label>
              <Select
                value={settings.cumulativeBalanceScope}
                disabled={!settings.showCumulativeBalance}
                onValueChange={(value) =>
                  setSettings((current) => ({
                    ...current,
                    cumulativeBalanceScope: value as CumulativeBalanceScope,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(options.cumulativeBalanceScopes).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="start-date">Início do acumulado</Label>
              <Input
                id="start-date"
                type="date"
                disabled={!settings.showCumulativeBalance}
                value={settings.cumulativeStartDate}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    cumulativeStartDate: event.target.value,
                  }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aparência</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Preset arquitetônico */}
          <div className="space-y-2">
            <Label>Preset</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setArchitecturalPreset(null)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors text-left ${
                  activePreset === null ? 'border-primary bg-accent' : 'hover:bg-accent'
                }`}
              >
                <span className="h-4 w-4 rounded-full border flex-shrink-0" />
                Nenhum
              </button>
              {Object.entries(ARCHITECTURAL_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setArchitecturalPreset(key as ArchitecturalPreset)}
                  className={`flex flex-col rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                    activePreset === key ? 'border-primary bg-accent' : 'hover:bg-accent'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded-sm flex-shrink-0" style={{ backgroundColor: preset.color }} />
                    <span className="font-medium">{preset.label}</span>
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5 pl-6">{preset.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Densidade */}
          <div className="space-y-2">
            <Label>Densidade</Label>
            <div className="flex gap-1 p-1 bg-muted rounded-md">
              {(Object.entries(DENSITY_PRESETS) as [DensityPreset, { label: string }][]).map(([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDensity(key)}
                  className={`flex-1 py-1.5 px-2 rounded text-xs transition-colors ${
                    density === key
                      ? 'bg-background text-foreground shadow-sm font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Blueprint */}
          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={blueprint}
              onChange={(e) => toggleBlueprint(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Grid de prancha (fundo técnico)
          </label>

          <div className="space-y-2">
            <Label>Cor de destaque</Label>
            <AccentColorPicker
              accent={accent}
              customColor={customColor}
              onPresetChange={setAccentPreset}
              onCustomColorChange={setCustomColor}
              className="max-w-[360px]"
            />
          </div>

          <div className="space-y-1">
            <Label>Tema</Label>
            <Select value={settings.themeMode} onValueChange={(value) => setThemeMode(value as ThemeMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="system">Sistema</SelectItem>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="dark">Escuro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
