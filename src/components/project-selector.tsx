'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ProjectOption } from '@/types'

interface ProjectSelectorProps {
  projects: ProjectOption[]
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
}

export function ProjectSelector({ projects, value, onChange, disabled }: ProjectSelectorProps) {
  const active = projects.filter(p => p.isActive)

  return (
    <Select
      value={value ?? 'none'}
      onValueChange={(v) => onChange(v === 'none' ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Selecionar projeto (opcional)" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Sem projeto</SelectItem>
        {active.map(project => (
          <SelectItem key={project.id} value={project.id}>
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              {project.name}
              {project.clientName && (
                <span className="text-muted-foreground text-xs">— {project.clientName}</span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
