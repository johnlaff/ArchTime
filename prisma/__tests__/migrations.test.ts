import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('migration 0002_lock_down_direct_deletes', () => {
  it('drops direct delete policies without recreating delete access', () => {
    const sql = readFileSync(
      path.join(
        process.cwd(),
        'prisma',
        'migrations',
        '0002_lock_down_direct_deletes',
        'migration.sql'
      ),
      'utf8'
    )

    expect(sql).toContain('DROP POLICY IF EXISTS "projects_delete_own"')
    expect(sql).toContain('DROP POLICY IF EXISTS "clock_entries_delete_own"')
    expect(sql).toContain('DROP POLICY IF EXISTS "time_allocations_delete_own"')
    expect(sql).toContain('DROP POLICY IF EXISTS "hour_bank_delete_own"')
    expect(sql).not.toMatch(/CREATE POLICY\s+"[^"]+_delete_own"/i)
    expect(sql).not.toMatch(/\bFOR DELETE\b/i)
  })
})

describe('migration 0005_rls_policy_initplan', () => {
  it('keeps direct client-side hard deletes blocked while optimizing RLS policies', () => {
    const sql = readFileSync(
      path.join(
        process.cwd(),
        'prisma',
        'migrations',
        '0005_rls_policy_initplan',
        'migration.sql'
      ),
      'utf8'
    )

    expect(sql).toContain('DROP POLICY IF EXISTS "projects_delete_own"')
    expect(sql).toContain('DROP POLICY IF EXISTS "clock_entries_delete_own"')
    expect(sql).toContain('DROP POLICY IF EXISTS "time_allocations_delete_own"')
    expect(sql).toContain('DROP POLICY IF EXISTS "hour_bank_delete_own"')
    expect(sql).toContain('FOR SELECT TO authenticated')
    expect(sql).toContain('(select auth.uid())::text')
    expect(sql).not.toMatch(/CREATE POLICY\s+"[^"]+_delete_own"/i)
    expect(sql).not.toMatch(/\bFOR DELETE\b/i)
  })
})
