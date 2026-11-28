import { describe, expect, it } from 'vitest'
import { diffText, type Piece } from './textDiff'

const join = (pieces: Piece[]) => pieces.map((p) => p.text).join('')
const marked = (pieces: Piece[]) => pieces.filter((p) => p.changed).map((p) => p.text)
/** A surrogate pair cut in half leaves a lone surrogate. */
const wellFormed = (text: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text)

describe('diffText', () => {
  it('has nothing to mark in two empty texts or two identical ones', () => {
    expect(diffText('', '')).toEqual({ before: [], after: [] })
    expect(diffText('Same words.', 'Same words.')).toEqual({ before: [{ text: 'Same words.', changed: false }], after: [{ text: 'Same words.', changed: false }] })
  })

  it('marks everything of a text that was added or removed whole', () => {
    expect(diffText('', 'New text.')).toEqual({ before: [], after: [{ text: 'New text.', changed: true }] })
    expect(diffText('Old text.', '')).toEqual({ before: [{ text: 'Old text.', changed: true }], after: [] })
  })

  it('marks everything of a text that was replaced whole', () => {
    expect(diffText('Alpha beta', 'Gamma delta')).toEqual({ before: [{ text: 'Alpha beta', changed: true }], after: [{ text: 'Gamma delta', changed: true }] })
  })

  it('marks only the words that differ, and never part of a word', () => {
    const d = diffText('Checks the refund limit.', 'Checks the new refund limit.')
    expect(marked(d.before)).toEqual([])
    expect(marked(d.after)).toEqual(['new'])
    const e = diffText('Checks the refund limit before payout.', 'Checks the spending cap before payout.')
    expect(marked(e.before)).toEqual(['refund limit'])
    expect(marked(e.after)).toEqual(['spending cap'])
    // "limits" is a different word from "limit", so the whole word is marked.
    const f = diffText('The limit applies.', 'The limits apply.')
    expect(marked(f.before)).toEqual(['limit applies'])
    expect(marked(f.after)).toEqual(['limits apply'])
  })

  it('marks two different texts whole when only a few scattered words are the same', () => {
    const before = 'Understand how a short link is created in a web form, and what happens when the short code does not exist.'
    const after = 'Turn a long link into a short one, and count the visits.'
    const d = diffText(before, after)
    // The full stop they share stays unmarked.
    expect(marked(d.before)).toEqual([before.slice(0, -1)])
    expect(marked(d.after)).toEqual([after.slice(0, -1)])
    // The same words, with one phrase changed, stay marked as that one phrase.
    const e = diffText('Understand how a short link is created, and what is stored where.', 'Understand how a short link is created, and what is cached where.')
    expect(marked(e.before)).toEqual(['stored'])
    expect(marked(e.after)).toEqual(['cached'])
  })

  it('keeps every character of both texts', () => {
    for (const [a, b] of [['a b c', 'a x c'], ['', 'x'], ['x', ''], ['one two', 'one two three'], ['  lead', 'lead']] as const) {
      const d = diffText(a, b)
      expect(join(d.before)).toBe(a)
      expect(join(d.after)).toBe(b)
    }
  })

  it('works on text with no spaces, such as Chinese and Japanese', () => {
    const d = diffText('退款上限', '退款额度上限')
    expect(join(d.before)).toBe('退款上限')
    expect(join(d.after)).toBe('退款额度上限')
    expect(marked(d.before)).toEqual([])
    expect(marked(d.after)).toEqual(['额度'])
    const j = diffText('返金の上限を確認する', '返金の上限を確認しない')
    expect(join(j.after)).toBe('返金の上限を確認しない')
    expect(marked(j.after).join('')).toContain('しない')
  })

  it('never splits an emoji, including one made of several parts', () => {
    const d = diffText('Ready 👩‍💻 now ✅', 'Ready 👩‍🔬 now ❌')
    for (const piece of [...d.before, ...d.after]) expect(wellFormed(piece.text)).toBe(true)
    expect(marked(d.before)).toEqual(['👩‍💻', '✅'])
    expect(marked(d.after)).toEqual(['👩‍🔬', '❌'])
  })

  it('cuts long text that did not change down to the words around the change', () => {
    const lead = Array.from({ length: 80 }, (_, i) => `lead${i}`).join(' ')
    const tail = Array.from({ length: 80 }, (_, i) => `tail${i}`).join(' ')
    const d = diffText(`${lead} old ${tail}`, `${lead} new ${tail}`, { context: 40 })
    const text = join(d.after)
    expect(text.length).toBeLessThan(120)
    expect(text.startsWith('…')).toBe(true)
    expect(text.endsWith('…')).toBe(true)
    expect(text).toContain('lead79 new tail0')
    expect(marked(d.after)).toEqual(['new'])
    // Short text is shown whole.
    expect(join(diffText('a b c d', 'a b x d', { context: 40 }).after)).toBe('a b x d')
  })
})
