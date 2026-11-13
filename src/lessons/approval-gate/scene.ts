/**
 * Maps the behavior model onto the press. Pure, so it can be tested without a browser.
 * Positions are targets. The live component eases the parts toward them.
 */
import { REACH_GATE, REACH_LEDGER, REACH_LOCK, SLOTS, TRAVEL_END, ARCH_PLANES, TAB_TIP } from './geometry'
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

/** Which of four stacking layers the card belongs in, from how many arches its tab has passed. */
export function layerOf(travel: number): 0 | 1 | 2 | 3 {
  const tip = TAB_TIP + travel
  let layer = 0
  for (const plane of ARCH_PLANES) if (tip >= plane) layer++
  return layer as 0 | 1 | 2 | 3
}

export interface Targets {
  /** 1 when the lockout shutter is down. */
  lockout: number
  /** 1 for the finger a key holds up, 0 for the rest. Index 0 is version 1. */
  fingers: number[]
  /** 1 for each ledger pin that has dropped. */
  pins: number[]
}

/**
 * The press shows the shutter and the fingers at once. The pins follow what has been delivered,
 * which can trail the model while a card is still on its way.
 */
export function targetsOf(state: LessonState, delivered: readonly number[]): Targets {
  return {
    lockout: state.decision === 'rejected' ? 1 : 0,
    fingers: Array.from({ length: SLOTS }, (_, i) => (state.approvedVersion === i + 1 ? 1 : 0)),
    pins: Array.from({ length: SLOTS }, (_, i) => (delivered.includes(i + 1) ? 1 : 0)),
  }
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
