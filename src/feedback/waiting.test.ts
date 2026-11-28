import { describe, expect, it } from 'vitest'
import { waitingForAgent } from './waiting'

const sent = (baseRevision: number) => ({ feedbackId: 'feedback-aaaaaa', baseRevision, at: '2026-11-28T10:00:00.000Z', items: [{ id: 'note-aaaaaa', fingerprint: 'f' }] })

describe('waitingForAgent', () => {
  it('waits while the revision is the one that was sent and the items have no answer', () => {
    expect(waitingForAgent({ sent: sent(2), revision: 2, unanswered: 1, unsent: 0 })).toBe(true)
    expect(waitingForAgent({ sent: sent(3), revision: 2, unanswered: 1, unsent: 0 })).toBe(true)
  })

  it('stops when the agent wrote a higher revision, when nothing is left to answer, or when nothing was sent', () => {
    expect(waitingForAgent({ sent: sent(2), revision: 3, unanswered: 1, unsent: 0 })).toBe(false)
    expect(waitingForAgent({ sent: sent(2), revision: 2, unanswered: 0, unsent: 0 })).toBe(false)
    expect(waitingForAgent({ sent: undefined, revision: 2, unanswered: 0, unsent: 0 })).toBe(false)
  })

  it('gives way to new items to send', () => {
    expect(waitingForAgent({ sent: sent(2), revision: 2, unanswered: 1, unsent: 2 })).toBe(false)
  })
})
