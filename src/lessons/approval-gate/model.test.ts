import { describe, expect, it } from 'vitest'
import {
  MAX_VERSION,
  caption,
  canEdit,
  hasStaleApproval,
  initialState,
  readout,
  step,
  type LessonEvent,
  type LessonState,
} from './model'

const run = (events: LessonEvent[], from: LessonState = initialState) => events.reduce(step, from)

describe('approval gate model', () => {
  it('starts at version 1 with no decision and nothing sent', () => {
    expect(initialState).toMatchObject({ version: 1, decision: 'none', approvedVersion: null, sent: [], lastOutcome: 'reset' })
  })

  it('sends an approved version', () => {
    const state = run(['approve', 'trySend'])
    expect(state.lastOutcome).toBe('sent')
    expect(state.sent).toEqual([1])
  })

  it('blocks a send with no approval', () => {
    const state = run(['trySend'])
    expect(state.lastOutcome).toBe('blocked-no-approval')
    expect(state.sent).toEqual([])
  })

  it('blocks a rejected version, and approval cannot revive it', () => {
    let state = run(['reject', 'trySend'])
    expect(state.lastOutcome).toBe('blocked-rejected')
    state = run(['approve'], state)
    expect(state.lastOutcome).toBe('blocked-rejected')
    expect(state.decision).toBe('rejected')
    state = run(['trySend'], state)
    expect(state.lastOutcome).toBe('blocked-rejected')
    expect(state.sent).toEqual([])
  })

  it('withdraws an approval when the same version is rejected', () => {
    const state = run(['approve', 'reject', 'trySend'])
    expect(state.approvedVersion).toBeNull()
    expect(state.lastOutcome).toBe('blocked-rejected')
  })

  it('treats an approval as stale after an edit, until the new version is approved', () => {
    let state = run(['approve', 'edit'])
    expect(state.version).toBe(2)
    expect(state.decision).toBe('none')
    expect(state.approvedVersion).toBe(1)
    expect(hasStaleApproval(state)).toBe(true)
    state = run(['trySend'], state)
    expect(state.lastOutcome).toBe('blocked-stale-approval')
    expect(state.sent).toEqual([])
    state = run(['approve', 'trySend'], state)
    expect(state.lastOutcome).toBe('sent')
    expect(state.sent).toEqual([2])
  })

  it('blocks a second send of the same version as a duplicate', () => {
    const state = run(['approve', 'trySend', 'trySend'])
    expect(state.lastOutcome).toBe('blocked-duplicate')
    expect(state.sent).toEqual([1])
  })

  it('keeps decisions and the sent record through a restart', () => {
    let state = run(['approve', 'trySend', 'restart'])
    expect(state.lastOutcome).toBe('restarted')
    expect(state.sent).toEqual([1])
    expect(state.decision).toBe('approved')
    state = run(['trySend'], state)
    expect(state.lastOutcome).toBe('blocked-duplicate')
    expect(state.sent).toEqual([1])
  })

  it('keeps a rejection through a restart', () => {
    const state = run(['reject', 'restart', 'trySend'])
    expect(state.lastOutcome).toBe('blocked-rejected')
  })

  it('needs a new approval after an edit that follows a send, then sends once', () => {
    let state = run(['approve', 'trySend', 'edit'])
    expect(state.version).toBe(2)
    expect(state.decision).toBe('none')
    state = run(['trySend'], state)
    expect(state.lastOutcome).toBe('blocked-stale-approval')
    state = run(['approve', 'trySend'], state)
    expect(state.lastOutcome).toBe('sent')
    expect(state.sent).toEqual([1, 2])
    state = run(['trySend'], state)
    expect(state.lastOutcome).toBe('blocked-duplicate')
    expect(state.sent).toEqual([1, 2])
  })

  it('starts a fresh lesson on reset', () => {
    const state = run(['approve', 'trySend', 'edit', 'reset'])
    expect(state).toEqual(initialState)
  })

  it('stops editing at the last slot', () => {
    let state = initialState
    for (let i = 0; i < MAX_VERSION + 3; i++) state = step(state, 'edit')
    expect(state.version).toBe(MAX_VERSION)
    expect(canEdit(state)).toBe(false)
  })

  it('never lists a version twice and keeps the list sorted', () => {
    const state = run(['approve', 'trySend', 'edit', 'approve', 'trySend', 'trySend', 'restart'])
    expect(state.sent).toEqual([1, 2])
  })

  it('does not change its input', () => {
    const before = run(['approve'])
    const copy = structuredClone(before)
    step(before, 'trySend')
    expect(before).toEqual(copy)
  })
})

describe('readout and caption', () => {
  it('reads the state in the card corner', () => {
    expect(readout(initialState)).toBe('v1 undecided · sent none')
    expect(readout(run(['approve', 'trySend']))).toBe('v1 approved · sent v1')
    expect(readout(run(['approve', 'edit']))).toBe('v2 undecided · old key v1 · sent none')
    expect(readout(run(['reject']))).toBe('v1 rejected · sent none')
  })

  it('does not say a rejected version can never be sent once it has been sent', () => {
    const text = caption(run(['approve', 'trySend', 'reject']))
    expect(text).not.toMatch(/can never be sent/)
    expect(text).toMatch(/after it went out/)
    expect(text).toMatch(/version 1/)
    // A version that was not sent keeps the plain sentence.
    expect(caption(run(['reject']))).toMatch(/can never be sent/)
  })

  it('has a caption for every outcome that names the true version', () => {
    const cases: Array<[LessonEvent[], RegExp]> = [
      [[], /fresh lesson/],
      [['approve'], /Approved version 1/],
      [['reject'], /Rejected version 1/],
      [['edit'], /Edited to version 2/],
      [['approve', 'edit'], /key still fits version 1/],
      [['approve', 'trySend'], /Sent version 1/],
      [['trySend'], /Nobody approved version 1/],
      [['reject', 'trySend'], /Version 1 was rejected/],
      [['approve', 'edit', 'trySend'], /approval was for version 1/],
      [['approve', 'trySend', 'trySend'], /already went out/],
      [['approve', 'trySend', 'restart'], /record of sent versions were kept/],
      [['restart'], /nothing had been sent/],
    ]
    for (const [events, pattern] of cases) expect(caption(run(events))).toMatch(pattern)
  })

  it('uses no em dash', () => {
    const all = [readout(initialState), caption(initialState), caption(run(['approve', 'trySend', 'trySend']))]
    for (const text of all) expect(text).not.toContain('\u2014')
  })
})
