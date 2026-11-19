import { describe, expect, it } from 'vitest'
import { editDistance, freeId, nearest, slugify } from './suggest'

describe('editDistance', () => {
  it('counts inserts, deletes, and replaces', () => {
    expect(editDistance('payment', 'payment')).toBe(0)
    expect(editDistance('paymnt', 'payment')).toBe(1)
    expect(editDistance('', 'abc')).toBe(3)
    expect(editDistance('kitten', 'sitting')).toBe(3)
  })
})

describe('nearest', () => {
  it('finds a likely typo', () => {
    expect(nearest('paymnt', ['payment', 'cart', 'api'])).toBe('payment')
    expect(nearest('API', ['api', 'cart'])).toBe('api')
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
