import { describe, expect, it } from 'vitest'
import { editDistance, freeId, nearest, resetSuggestStats, slugify, suggestStats } from './suggest'

describe('editDistance', () => {
  it('counts inserts, deletes, and replaces', () => {
    expect(editDistance('payment', 'payment')).toBe(0)
    expect(editDistance('paymnt', 'payment')).toBe(1)
    expect(editDistance('', 'abc')).toBe(3)
    expect(editDistance('kitten', 'sitting')).toBe(3)
  })

  it('stops early past a limit', () => {
    expect(editDistance('kitten', 'sitting', 3)).toBe(3)
    expect(editDistance('kitten', 'sitting', 2)).toBe(3)
    expect(editDistance('a'.repeat(64), 'b'.repeat(64), 5)).toBe(6)
    expect(editDistance('abc', 'abcdefgh', 2)).toBe(3)
  })
})

describe('nearest', () => {
  it('finds a likely typo', () => {
    expect(nearest('paymnt', ['payment', 'cart', 'api'])).toBe('payment')
    expect(nearest('Payment', ['payment', 'cart'])).toBe('payment')
  })

  it('gives nothing for values under 4 characters, where one edit is rarely a typo', () => {
    expect(nearest('api', ['app'])).toBeUndefined()
    expect(nearest('cart', ['card'])).toBe('card')
  })

  it('skips huge values and candidates, and stops early on a candidate that is too far off', () => {
    resetSuggestStats()
    expect(nearest('a'.repeat(201), ['a'.repeat(200)])).toBeUndefined()
    expect(suggestStats.editDistanceCalls).toBe(0)
    expect(nearest('note-1', ['n'.repeat(2_000_000), 'note-2x'])).toBe('note-2x')
    // The huge candidate is skipped, so only the other one is compared.
    expect(suggestStats.editDistanceCalls).toBe(1)
  })

  it('compares at most the allowed number of rows, and nothing past the caps', () => {
    const many = Array.from({ length: 500 }, (_, i) => `${String(i).padStart(4, '0')}-${'x'.repeat(59)}`)
    // The tool asks for at most 25 hints, each against at most 500 candidates. A value of 64 characters allows 21 edits.
    // The row early-exit stops a hopeless comparison at limit + 1 rows, where a full table would be 64 rows.
    resetSuggestStats()
    expect(editDistance('y'.repeat(59), 'x'.repeat(59), 20)).toBe(21)
    expect(suggestStats.rows).toBeLessThanOrEqual(21)
    resetSuggestStats()
    for (let i = 0; i < 25; i++) nearest(`${'y'.repeat(59)}-${i}`, many)
    expect(suggestStats.editDistanceCalls).toBe(25 * 500)
    expect(suggestStats.rows).toBeLessThanOrEqual(25 * 500 * 22)
    // Over the caps nothing is compared at all.
    resetSuggestStats()
    expect(nearest('note-1', Array.from({ length: 501 }, (_, i) => `note-${i + 2}`))).toBeUndefined()
    expect(nearest('note-1', new Set(Array.from({ length: 501 }, (_, i) => `note-${i + 2}`)))).toBeUndefined()
    expect(nearest('x'.repeat(201), ['x'.repeat(200)])).toBeUndefined()
    expect(suggestStats.editDistanceCalls).toBe(0)
    expect(suggestStats.rows).toBe(0)
  })

  it('gives nothing when no candidate is close', () => {
    expect(nearest('warehouse', ['payment', 'cart'])).toBeUndefined()
    expect(nearest('x', [])).toBeUndefined()
  })

  it('gives nothing on a tie, because a guess could mislead', () => {
    expect(nearest('cab', ['cat', 'car'])).toBeUndefined()
  })

  it('never suggests the value itself', () => {
    expect(nearest('cart', ['cart'])).toBeUndefined()
  })
})

describe('freeId', () => {
  it('appends the first free number', () => {
    expect(freeId('api', new Set(['api']))).toBe('api-2')
    expect(freeId('api', new Set(['api', 'api-2']))).toBe('api-3')
    expect(freeId('api-2', new Set(['api', 'api-2']))).toBe('api-3')
    expect(freeId('a'.repeat(64), new Set(), 64)).toBe(`${'a'.repeat(62)}-2`)
  })
})

describe('slugify', () => {
  it('makes a valid ID from any text', () => {
    expect(slugify('Payment Step')).toBe('payment-step')
    expect(slugify('  Crème_brûlée -- 2 ')).toBe('creme-brulee-2')
    expect(slugify('!!!')).toBe('')
  })
})
