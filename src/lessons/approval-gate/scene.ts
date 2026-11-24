/**
 * Maps the behavior model onto the press. Pure, so it can be tested without a browser.
 * The timeline of the parts is in motion.ts.
 */
import { BLOCKER_FACES, REACH_GATE, REACH_LEDGER, REACH_LOCK, TRAVEL_END } from './geometry'
import type { LessonState, Outcome } from './model'

/** How far the card travels from home when a send is tried, and what stops it. */
export type Stop = 'lockout' | 'gate' | 'ledger' | 'end'

export function stopOf(outcome: Outcome): Stop | null {
  switch (outcome) {
    case 'sent':
      return 'end'
    case 'blocked-rejected':
      return 'lockout'
    case 'blocked-no-approval':
    case 'blocked-stale-approval':
      return 'gate'
    case 'blocked-duplicate':
      return 'ledger'
    default:
      return null
  }
}

export function reachOf(stop: Stop): number {
  switch (stop) {
    case 'lockout':
      return REACH_LOCK
    case 'gate':
      return REACH_GATE
    case 'ledger':
      return REACH_LEDGER
    case 'end':
      return TRAVEL_END
  }
}

/**
 * Which of four stacking layers the tab belongs in: how many blocker faces its tip is strictly beyond.
 * A tab that touches a blocker is not beyond it, so it is drawn in front of what it touches.
 */
export function tabLayerOf(tip: number): 0 | 1 | 2 | 3 {
  let layer = 0
  for (const face of BLOCKER_FACES) if (tip > face + 0.05) layer++
  return layer as 0 | 1 | 2 | 3
}

export type LitPart =
  | { kind: 'tab' }
  | { kind: 'finger'; version: number }
  | { kind: 'pin'; version: number }
  | { kind: 'shutter' }
  | { kind: 'lamp' }

/** The one part that carries the accent: the part that explains the latest outcome. */
export function litOf(state: LessonState): LitPart {
  switch (state.lastOutcome) {
    case 'approved':
      return { kind: 'finger', version: state.version }
    case 'rejected':
    case 'blocked-rejected':
      return { kind: 'shutter' }
    case 'blocked-no-approval':
      return { kind: 'finger', version: state.version }
    case 'blocked-stale-approval':
      return { kind: 'finger', version: state.version }
    case 'sent':
    case 'blocked-duplicate':
      return { kind: 'pin', version: state.version }
    case 'restarted':
      return { kind: 'lamp' }
    case 'edited':
    case 'reset':
      return { kind: 'tab' }
  }
}
