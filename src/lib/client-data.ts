import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActiveSession, ProjectOption } from '@/types'

type ProjectRow = {
  id: string
  name: string
  client_name: string | null
  color: string
  hourly_rate: string | number | null
  is_active: boolean
}

/**
 * Reads the user's projects directly from Supabase (BR→BR), scoped by RLS
 * (`projects_select_own`). `activeOnly` filters to `is_active = true` for the
 * dashboard project selector; pass `false` for the projetos management list.
 */
export async function fetchProjects(
  supabase: SupabaseClient,
  options: { activeOnly: boolean },
): Promise<ProjectOption[]> {
  let query = supabase
    .from('projects')
    .select('id, name, client_name, color, hourly_rate, is_active')
  if (options.activeOnly) query = query.eq('is_active', true)

  const { data, error } = await query
    .order('is_active', { ascending: false })
    .order('name')
  if (error) throw new Error(error.message)

  return (data as ProjectRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    clientName: p.client_name,
    color: p.color,
    hourlyRate: p.hourly_rate == null ? null : Number(p.hourly_rate),
    isActive: p.is_active,
  }))
}

type ActiveEntryRow = {
  id: string
  clock_in: string
  activity_type: string | null
  time_allocations: { project_id: string; projects: { name: string; color: string } | null }[]
}

/**
 * Reads the user's open clock entry directly from Supabase (BR→BR). RLS on
 * `clock_entries` (own + not deleted) and the nested `time_allocations`/`projects`
 * embeds (own via clock_entry) scope the result. Returns null when clocked out.
 */
export async function fetchActiveSession(
  supabase: SupabaseClient,
): Promise<ActiveSession | null> {
  const { data, error } = await supabase
    .from('clock_entries')
    .select('id, clock_in, activity_type, time_allocations(project_id, projects(name, color))')
    .is('clock_out', null)
    .is('deleted_at', null)
    .order('clock_in', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)

  const row = (data as unknown as ActiveEntryRow[])[0]
  if (!row) return null

  const allocation = row.time_allocations[0]
  return {
    id: row.id,
    clockIn: new Date(row.clock_in).toISOString(),
    projectId: allocation?.project_id ?? null,
    projectName: allocation?.projects?.name ?? null,
    projectColor: allocation?.projects?.color ?? null,
    activityType: row.activity_type ?? null,
  }
}
