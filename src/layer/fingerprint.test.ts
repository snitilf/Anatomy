import { describe, expect, it } from 'vitest'
import { fingerprintBoard, fingerprintComponent, fingerprintRelationship, fingerprintTarget } from './fingerprint'
import { anatomyBoard, clone } from './testBoards'

describe('fingerprints', () => {
  it('are stable for the same input', () => {
    const b = anatomyBoard()
    const c = b.components[0]!
    expect(fingerprintComponent(c)).toBe(fingerprintComponent(clone(c)))
    expect(fingerprintComponent(c)).toMatch(/^[0-9a-f]{14}$/)
    expect(fingerprintBoard(b)).toBe(fingerprintBoard(clone(b)))
  })

  it('ignore key order and position', () => {
    const c = anatomyBoard().components[0]!
    const reordered = Object.fromEntries(Object.entries(c).reverse()) as typeof c
    expect(fingerprintComponent(reordered)).toBe(fingerprintComponent(c))
    expect(fingerprintComponent({ ...c, position: { x: 5, y: 9 } })).toBe(fingerprintComponent(c))
  })

  it('change when the meaning changes', () => {
    const b = anatomyBoard()
    const c = b.components[0]!
    expect(fingerprintComponent({ ...c, summary: c.summary + ' More.' })).not.toBe(fingerprintComponent(c))
    expect(fingerprintComponent({ ...c, inputs: ['x'] })).not.toBe(fingerprintComponent(c))
    const r = b.relationships[0]!
    expect(fingerprintRelationship({ ...r, label: 'other' })).not.toBe(fingerprintRelationship(r))
    expect(fingerprintBoard({ ...b, goal: 'A different goal.' })).not.toBe(fingerprintBoard(b))
    expect(fingerprintBoard({ ...b, revision: b.revision + 1 })).toBe(fingerprintBoard(b))
  })

  it('treats a missing optional field like an undefined one', () => {
    const c = anatomyBoard().components[0]!
    const { explanation: _e, ...without } = c
    expect(fingerprintComponent({ ...without, explanation: undefined })).toBe(fingerprintComponent(without))
  })

  it('fingerprintTarget returns undefined for a missing target', () => {
    const b = anatomyBoard()
    expect(fingerprintTarget(b, { type: 'board' })).toBe(fingerprintBoard(b))
    expect(fingerprintTarget(b, { type: 'component', id: b.components[0]!.id })).toBe(fingerprintComponent(b.components[0]!))
    expect(fingerprintTarget(b, { type: 'relationship', id: b.relationships[0]!.id })).toBe(
      fingerprintRelationship(b.relationships[0]!),
    )
    expect(fingerprintTarget(b, { type: 'component', id: 'nope' })).toBeUndefined()
    expect(fingerprintTarget(b, { type: 'relationship', id: 'nope' })).toBeUndefined()
  })
})
