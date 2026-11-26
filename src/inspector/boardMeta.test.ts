import { describe, expect, it } from 'vitest'
import { boardMeta } from './boardMeta'

describe('the board meta line', () => {
  it('formats plural parts, groups, connections, and revision', () => {
    expect(boardMeta(10, 3, 13, 1)).toBe('10 parts in 3 groups · 13 connections · revision 1')
  })

  it('uses singular nouns when a count is 1', () => {
    expect(boardMeta(1, 1, 1, 1)).toBe('1 part in 1 group · 1 connection · revision 1')
  })

  it('omits groups when there are none', () => {
    expect(boardMeta(4, 0, 2, 3)).toBe('4 parts · 2 connections · revision 3')
    expect(boardMeta(1, 0, 1, 2)).toBe('1 part · 1 connection · revision 2')
  })

  it('omits connections when there are none', () => {
    expect(boardMeta(5, 2, 0, 1)).toBe('5 parts in 2 groups · revision 1')
    expect(boardMeta(2, 0, 0, 4)).toBe('2 parts · revision 4')
  })
})
