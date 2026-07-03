import type { ProjectOption } from '@/types'

export function serializeProject(project: {
  id: string
  name: string
  clientName: string | null
  color: string
  hourlyRate: unknown
  isActive: boolean
}): ProjectOption {
  return {
    id: project.id,
    name: project.name,
    clientName: project.clientName,
    color: project.color,
    hourlyRate: project.hourlyRate == null ? null : Number(project.hourlyRate),
    isActive: project.isActive,
  }
}
