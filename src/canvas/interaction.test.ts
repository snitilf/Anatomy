import { describe, expect, it } from 'vitest'
import { IDLE, KEY_SETTLE_MS, heldId, isBusy, next, pendingMoves, phaseOf, reusesLines, type Event, type Interaction } from './interaction'

const run = (events: readonly Event[], from: Interaction = IDLE): Interaction => events.reduce(next, from)
const pick = (id = 'a', kind: 'drag' | 'resize' = 'drag'): Event => ({ type: 'pickUp', id, kind })
const key = (id: string): Event => ({ type: 'keyMove', id })

describe('the interaction machine', () => {
  it('starts idle', () => {
    expect(phaseOf(IDLE)).toBe('idle')
    expect(isBusy(IDLE)).toBe(false)
  })

  it('holds a card from pickUp to release, for a drag and a resize', () => {
    for (const kind of ['drag', 'resize'] as const) {
      const held = run([pick('a', kind)])
      expect(phaseOf(held)).toBe('holding')
      expect(heldId(held)).toBe('a')
      const moved = next(held, { type: 'move' })
      expect(phaseOf(moved)).toBe('holding')
      const dropped = next(moved, { type: 'release' })
      expect(phaseOf(dropped)).toBe('settling')
      expect(dropped.work).toEqual({ mode: 'settling', wait: 0, moves: [] })
      expect(heldId(dropped)).toBeUndefined()
    }
  })

  it('goes back to idle on release when the card never moved', () => {
    expect(run([pick(), { type: 'release' }])).toEqual(IDLE)
  })

  it('settles a key move after the key wait, then solves, then is idle', () => {
    const waiting = run([key('a')])
    expect(waiting.work).toEqual({ mode: 'settling', wait: KEY_SETTLE_MS, moves: ['a'] })
    const solving = next(waiting, { type: 'settleDue' })
    expect(phaseOf(solving)).toBe('solving')
    expect(pendingMoves(solving)).toEqual([])
    expect(run([{ type: 'solved' }], solving)).toEqual(IDLE)
  })

  it('coalesces key moves into one pending save, each one restarting the wait', () => {
    const one = run([key('a')])
    const two = next(one, key('a'))
    const three = next(two, key('b'))
    expect(two).not.toBe(one)
    expect(pendingMoves(three)).toEqual(['a', 'b'])
    expect(three.work).toMatchObject({ wait: KEY_SETTLE_MS })
    const solving = next(three, { type: 'settleDue' })
    expect(next(solving, { type: 'settleDue' })).toBe(solving)
  })

  it('ignores a settle timer and a finished solve that do not match the phase', () => {
    expect(next(IDLE, { type: 'settleDue' })).toBe(IDLE)
    expect(next(IDLE, { type: 'solved' })).toBe(IDLE)
    const waiting = run([key('a')])
    expect(next(waiting, { type: 'solved' })).toBe(waiting)
  })

  it('does not settle or finish a solve while a card is in hand', () => {
    const waiting = run([key('a'), pick('b')])
    expect(next(waiting, { type: 'settleDue' })).toBe(waiting)
    const solving = run([key('a'), { type: 'settleDue' }, pick('b')])
    expect(phaseOf(solving)).toBe('holding')
    expect(next(solving, { type: 'solved' })).toBe(solving)
  })

  it('cancels a solve in slices when a new drag starts, and solves again after the release', () => {
    const solving = run([key('a'), { type: 'settleDue' }])
    const held = next(solving, pick('b'))
    expect(held.work.mode).toBe('settling')
    const dropped = run([{ type: 'move' }, { type: 'release' }], held)
    expect(dropped.work).toEqual({ mode: 'settling', wait: 0, moves: [] })
    const again = run([{ type: 'settleDue' }, { type: 'solved' }], dropped)
    expect(again).toEqual(IDLE)
  })

  it('restarts the wait of a pending key move when a drag of another card ends', () => {
    const after = run([key('a'), pick('b'), { type: 'move' }, { type: 'release' }])
    expect(after.work).toEqual({ mode: 'settling', wait: 0, moves: ['a'] })
  })

  it('forgets the key move of a card that is dragged, but not one that is resized', () => {
    expect(pendingMoves(run([key('a'), pick('a'), { type: 'move' }, { type: 'release' }]))).toEqual([])
    expect(pendingMoves(run([key('a'), pick('a', 'resize'), { type: 'move' }, { type: 'release' }]))).toEqual(['a'])
  })

  it('a key move during a solve cancels it and waits again', () => {
    const solving = run([key('a'), { type: 'settleDue' }])
    expect(next(solving, key('b')).work).toEqual({ mode: 'settling', wait: KEY_SETTLE_MS, moves: ['b'] })
  })

  describe('Escape', () => {
    it('puts the work back as it was at pickup, and ignores the pointer until release', () => {
      const cancelled = run([pick(), { type: 'move' }, { type: 'escape' }])
      expect(phaseOf(cancelled)).toBe('idle')
      expect(heldId(cancelled)).toBeUndefined()
      expect(next(cancelled, { type: 'move' })).toBe(cancelled)
      expect(run([{ type: 'release' }], cancelled)).toEqual(IDLE)
    })

    it('keeps a pending key move from before the pickup', () => {
      const cancelled = run([key('a'), pick('b'), { type: 'move' }, { type: 'escape' }])
      expect(cancelled.work).toEqual({ mode: 'settling', wait: KEY_SETTLE_MS, moves: ['a'] })
      const released = next(cancelled, { type: 'release' })
      expect(pendingMoves(released)).toEqual(['a'])
    })

    it('does not forget the key move of a cancelled drag at release', () => {
      const released = run([key('a'), pick('a'), { type: 'move' }, { type: 'escape' }, { type: 'release' }])
      expect(pendingMoves(released)).toEqual(['a'])
    })

    it('during slicing puts the solve back in the queue, not lost', () => {
      const solving = run([key('a'), { type: 'settleDue' }])
      const cancelled = run([pick('b'), { type: 'move' }, { type: 'escape' }], solving)
      expect(cancelled.work).toEqual({ mode: 'settling', wait: 0, moves: [] })
      expect(phaseOf(cancelled)).toBe('settling')
    })

    it('does nothing without a card in hand, or twice', () => {
      expect(next(IDLE, { type: 'escape' })).toBe(IDLE)
      const cancelled = run([pick(), { type: 'escape' }])
      expect(next(cancelled, { type: 'escape' })).toBe(cancelled)
    })
  })

  describe('a font load', () => {
    it('leaves an idle state alone, for the caller to build at once', () => {
      expect(next(IDLE, { type: 'fontsLoaded' })).toBe(IDLE)
      expect(isBusy(IDLE)).toBe(false)
    })

    it('during a drag only marks, and the next full build refreshes once', () => {
      const marked = run([pick(), { type: 'fontsLoaded' }])
      expect(marked.stale).toBe(true)
      expect(reusesLines(marked)).toBe(false)
      expect(phaseOf(marked)).toBe('holding')
      const dropped = run([{ type: 'release' }], marked)
      expect(dropped.stale).toBe(true)
      expect(dropped.work).toEqual({ mode: 'idle' })
      const refreshed = next(dropped, { type: 'rebuilt' })
      expect(refreshed).toEqual(IDLE)
      expect(reusesLines(refreshed)).toBe(true)
    })

    it('during the key move wait is kept and refreshed by the build after the settle', () => {
      const marked = run([key('a'), { type: 'fontsLoaded' }])
      expect(marked.work).toEqual({ mode: 'settling', wait: KEY_SETTLE_MS, moves: ['a'] })
      expect(marked.stale).toBe(true)
      const solving = next(marked, { type: 'settleDue' })
      expect(reusesLines(solving)).toBe(false)
      expect(next(solving, { type: 'solved' })).toEqual(IDLE)
    })

    it('during slicing marks the state so the solve starts again without reuse', () => {
      const solving = run([key('a'), { type: 'settleDue' }])
      const marked = next(solving, { type: 'fontsLoaded' })
      expect(marked).not.toBe(solving)
      expect(marked.work).toEqual({ mode: 'solving' })
      expect(marked.stale).toBe(true)
    })

    it('after Escape the idle state is owed a refresh, and a cancelled card stays ignored', () => {
      const cancelled = run([pick(), { type: 'move' }, { type: 'fontsLoaded' }, { type: 'escape' }])
      expect(isBusy(cancelled)).toBe(false)
      expect(cancelled.stale).toBe(true)
      const refreshed = next(cancelled, { type: 'rebuilt' })
      expect(refreshed.stale).toBe(false)
      expect(next(refreshed, { type: 'move' })).toBe(refreshed)
    })
  })

  describe('a change from outside the map', () => {
    it('leaves an idle map alone when the cards already show it', () => {
      expect(next(IDLE, { type: 'external', change: 'same' })).toBe(IDLE)
    })

    it('builds after the next paint once a key move is saved', () => {
      const saved = next(run([key('a')]), { type: 'external', change: 'same' })
      expect(saved.work).toEqual({ mode: 'settling', wait: 0, moves: ['a'] })
    })

    it('restarts a solve in slices', () => {
      const solving = run([key('a'), { type: 'settleDue' }])
      expect(next(solving, { type: 'external', change: 'same' }).work).toEqual({ mode: 'settling', wait: 0, moves: [] })
    })

    it('moved cards, such as a push or an undo, hide their lines and build after the next paint', () => {
      expect(next(IDLE, { type: 'external', change: 'moved' }).work).toEqual({ mode: 'settling', wait: 0, moves: [] })
    })

    it('does not release a card in hand', () => {
      const held = run([pick(), { type: 'external', change: 'moved' }])
      expect(phaseOf(held)).toBe('holding')
      expect(next(held, { type: 'release' }).work).toEqual({ mode: 'settling', wait: 0, moves: [] })
    })

    it('a full build resets the work and the owed refresh but keeps the card in hand', () => {
      const rebuilt = run([key('a'), pick('b'), { type: 'fontsLoaded' }, { type: 'rebuilt' }])
      expect(rebuilt.work).toEqual({ mode: 'idle' })
      expect(rebuilt.stale).toBe(false)
      expect(heldId(rebuilt)).toBe('b')
    })
  })

  it('release without a card in hand does nothing', () => {
    expect(next(IDLE, { type: 'release' })).toBe(IDLE)
  })
})
