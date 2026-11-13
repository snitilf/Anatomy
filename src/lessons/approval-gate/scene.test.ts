import { describe, expect, it } from 'vitest'
import { REACH_GATE, REACH_LEDGER, REACH_LOCK, TRAVEL_END } from './geometry'
import { initialState, step, type LessonEvent } from './model'
import { layerOf, litOf, reachOf, stopOf, targetsOf } from './scene'

const run = (events: LessonEvent[]) => events.reduce(step, initialState)

describe('scene', () => {
  it('stops the card at the blocker that caused each outcome, in the order the press meets them', () => {
    expect(REACH_LOCK).toBeGreaterThan(0)
    expect(REACH_LOCK).toBeLessThan(REACH_GATE)
    expect(REACH_GATE).toBeLessThan(REACH_LEDGER)
    expect(REACH_LEDGER).toBeLessThan(TRAVEL_END)
    expect(stopOf('blocked-rejected')).toBe('lockout')
    expect(stopOf('blocked-no-approval')).toBe('gate')
    expect(stopOf('blocked-stale-approval')).toBe('gate')
    expect(stopOf('blocked-duplicate')).toBe('ledger')
    expect(stopOf('sent')).toBe('end')
    expect(stopOf('approved')).toBeNull()
    expect(reachOf('end')).toBe(TRAVEL_END)
  })

  it('lifts the finger of the approved version only, even after an edit', () => {
    const approved = targetsOf(run(['approve']), [])
    expect(approved.fingers).toEqual([1, 0, 0, 0, 0, 0, 0, 0])
    const stale = targetsOf(run(['approve', 'edit']), [])
    expect(stale.fingers).toEqual([1, 0, 0, 0, 0, 0, 0, 0])
  })

  it('drops the lockout for a rejected version and the pin for a delivered one', () => {
    expect(targetsOf(run(['reject']), []).lockout).toBe(1)
    expect(targetsOf(run(['approve', 'trySend']), [1]).pins).toEqual([1, 0, 0, 0, 0, 0, 0, 0])
  })

  it('picks one lit part for every outcome', () => {
    expect(litOf(run(['approve', 'trySend', 'trySend']))).toEqual({ kind: 'pin', version: 1 })
    expect(litOf(run(['reject']))).toEqual({ kind: 'shutter' })
    expect(litOf(run(['restart']))).toEqual({ kind: 'lamp' })
    expect(litOf(initialState)).toEqual({ kind: 'tab' })
  })

  it('layers the card behind each arch it has passed', () => {
    expect(layerOf(0)).toBe(0)
    expect(layerOf(TRAVEL_END)).toBe(3)
    expect(layerOf(REACH_GATE)).toBe(1)
  })
})
