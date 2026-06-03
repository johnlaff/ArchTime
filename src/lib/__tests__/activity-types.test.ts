import { describe, it, expect } from 'vitest'
import {
  ACTIVITY_TYPE_KEYS,
  activityLabel,
  isActivityType,
  parseActivityType,
} from '@/lib/activity-types'

describe('parseActivityType', () => {
  it('treats null/undefined/empty as null (activity is optional)', () => {
    expect(parseActivityType(null)).toBeNull()
    expect(parseActivityType(undefined)).toBeNull()
    expect(parseActivityType('')).toBeNull()
  })

  it('returns the key for a valid activity', () => {
    expect(parseActivityType('modelagem')).toBe('modelagem')
    expect(parseActivityType('visita-cliente')).toBe('visita-cliente')
  })

  it('returns undefined for an invalid value (caller responds 400)', () => {
    expect(parseActivityType('xpto')).toBeUndefined()
    expect(parseActivityType(123)).toBeUndefined()
    expect(parseActivityType({})).toBeUndefined()
  })
})

describe('isActivityType / activityLabel', () => {
  it('isActivityType narrows valid keys', () => {
    expect(isActivityType('obra')).toBe(true)
    expect(isActivityType('nope')).toBe(false)
    expect(isActivityType(null)).toBe(false)
  })

  it('activityLabel resolves labels, null otherwise', () => {
    expect(activityLabel('modelagem')).toBe('Modelagem 3D')
    expect(activityLabel(null)).toBeNull()
    expect(activityLabel('xpto')).toBeNull()
  })

  it('exposes all 7 fixed activity types', () => {
    expect(ACTIVITY_TYPE_KEYS).toHaveLength(7)
  })
})
