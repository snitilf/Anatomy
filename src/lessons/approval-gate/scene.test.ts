import { describe, expect, it } from 'vitest'
import { BLOCKER_FACES, FINGER_FACE, PIN_FACE, TAB_TIP, TAG_X, TRAVEL_END, REACH_GATE, REACH_LEDGER, REACH_LOCK } from './geometry'
import { initialState, step, type LessonEvent } from './model'
import { litOf, reachOf, stopOf, tabLayerOf } from './scene'

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

  it('picks one lit part for every outcome', () => {
    expect(litOf(run(['approve', 'trySend', 'trySend']))).toEqual({ kind: 'pin', version: 1 })
    expect(litOf(run(['reject']))).toEqual({ kind: 'shutter' })
    expect(litOf(run(['restart']))).toEqual({ kind: 'lamp' })
    expect(litOf(initialState)).toEqual({ kind: 'tab' })
  })

  it('names the face of each blocker, from the lockout tag to the ledger pin', () => {
    expect(BLOCKER_FACES).toEqual([TAG_X, FINGER_FACE, PIN_FACE])
  })

  it('counts the blocker faces the tab tip is strictly beyond, with a small tolerance', () => {
    expect(tabLayerOf(TAB_TIP)).toBe(0)
    expect(tabLayerOf(TAG_X + 0.04)).toBe(0)
    expect(tabLayerOf(TAG_X + 0.06)).toBe(1)
    expect(tabLayerOf(FINGER_FACE + 0.06)).toBe(2)
    expect(tabLayerOf(PIN_FACE + 0.06)).toBe(3)
    expect(tabLayerOf(TAB_TIP + TRAVEL_END)).toBe(3)
  })

  it('keeps the tab in front of the blocker it touches at each stop', () => {
    expect(tabLayerOf(TAB_TIP + reachOf('lockout'))).toBe(0)
    expect(tabLayerOf(TAB_TIP + reachOf('gate'))).toBe(1)
    expect(tabLayerOf(TAB_TIP + reachOf('ledger'))).toBe(2)
  })

  it('stops the tab at the face of the hazard tag, not inside it', () => {
    expect(TAB_TIP + REACH_LOCK).toBeCloseTo(TAG_X, 6)
  })
})
