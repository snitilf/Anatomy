/**
 * Pure behavior model for the approval-gate lesson.
 * It teaches four rules about an app that sends a message only after a person approves it.
 * Geometry, readout, caption and announcements all read from this one state.
 * It is a teaching model, not live execution.
 */

export type Decision = 'none' | 'approved' | 'rejected'

export type Outcome =
  | 'sent'
  | 'blocked-no-approval'
  | 'blocked-rejected'
  | 'blocked-stale-approval'
  | 'blocked-duplicate'
  | 'approved'
  | 'rejected'
  | 'edited'
  | 'restarted'
  | 'reset'

export type LessonEvent = 'approve' | 'reject' | 'edit' | 'trySend' | 'restart' | 'reset'

export interface LessonState {
  /** The version of the proposed message as it stands now. Starts at 1. */
  readonly version: number
  /** The decision recorded for the current version only. */
  readonly decision: Decision
  /** The one version an approval was last given for, or null. It can be older than `version`. */
  readonly approvedVersion: number | null
  /** Versions that went out, ascending, no duplicates. Durable: a restart keeps it. */
  readonly sent: readonly number[]
  readonly lastOutcome: Outcome
}

/** The press has eight slots, so a lesson holds at most eight versions. */
export const MAX_VERSION = 8

export const initialState: LessonState = {
  version: 1,
  decision: 'none',
  approvedVersion: null,
  sent: [],
  lastOutcome: 'reset',
}

export function canEdit(state: LessonState): boolean {
  return state.version < MAX_VERSION
}

/** An approval that was given for an older version and was never renewed. */
export function hasStaleApproval(state: LessonState): boolean {
  return state.approvedVersion !== null && state.approvedVersion !== state.version
}

export function isSent(state: LessonState, version: number = state.version): boolean {
  return state.sent.includes(version)
}

function approve(state: LessonState): LessonState {
  // A rejected version can never be sent, so the key will not turn for it.
  if (state.decision === 'rejected') return { ...state, lastOutcome: 'blocked-rejected' }
  return { ...state, decision: 'approved', approvedVersion: state.version, lastOutcome: 'approved' }
}

function reject(state: LessonState): LessonState {
  // A rejection withdraws an approval given for this same version.
  const approvedVersion = state.approvedVersion === state.version ? null : state.approvedVersion
  return { ...state, decision: 'rejected', approvedVersion, lastOutcome: 'rejected' }
}

function edit(state: LessonState): LessonState {
  if (!canEdit(state)) return state
  // A new version starts undecided. The old approval stays on record but names the old version.
  return { ...state, version: state.version + 1, decision: 'none', lastOutcome: 'edited' }
}

function trySend(state: LessonState): LessonState {
  // The checks run in the order the press meets them: lockout, key gate, ledger.
  if (state.decision === 'rejected') return { ...state, lastOutcome: 'blocked-rejected' }
  if (state.decision !== 'approved' || state.approvedVersion !== state.version) {
    return { ...state, lastOutcome: hasStaleApproval(state) ? 'blocked-stale-approval' : 'blocked-no-approval' }
  }
  if (state.sent.includes(state.version)) return { ...state, lastOutcome: 'blocked-duplicate' }
  return { ...state, sent: [...state.sent, state.version].sort((a, b) => a - b), lastOutcome: 'sent' }
}

/** Restart keeps decisions and the sent record. They live in durable storage. */
function restart(state: LessonState): LessonState {
  return { ...state, lastOutcome: 'restarted' }
}

export function step(state: LessonState, event: LessonEvent): LessonState {
  switch (event) {
    case 'approve':
      return approve(state)
    case 'reject':
      return reject(state)
    case 'edit':
      return edit(state)
    case 'trySend':
      return trySend(state)
    case 'restart':
      return restart(state)
    case 'reset':
      return initialState
  }
}

const DECISION_WORD: Record<Decision, string> = {
  none: 'undecided',
  approved: 'approved',
  rejected: 'rejected',
}

/** The live readout in the card corner. */
export function readout(state: LessonState): string {
  const sent = state.sent.length === 0 ? 'none' : state.sent.map((v) => `v${v}`).join(' ')
  const stale = hasStaleApproval(state) && state.decision === 'none' ? ` · old key v${state.approvedVersion}` : ''
  return `v${state.version} ${DECISION_WORD[state.decision]}${stale} · sent ${sent}`
}

/** One true sentence about what just happened and why, derived only from the state. */
export function caption(state: LessonState): string {
  const v = state.version
  switch (state.lastOutcome) {
    case 'reset':
      return `A fresh lesson. Version ${v} of the message has no decision and nothing has been sent.`
    case 'approved':
      return `Approved version ${v}. The key is cut for version ${v}, so only a card stamped ${v} can pass the gate.`
    case 'rejected':
      return isSent(state)
        ? `Rejected version ${v} after it went out. The lockout bar is down, and the saved record already stops a second send.`
        : `Rejected version ${v}. The lockout bar is down, and this version can never be sent.`
    case 'edited':
      return hasStaleApproval(state)
        ? `Edited to version ${v}. The old key still fits version ${state.approvedVersion}, not version ${v}, so it no longer counts.`
        : `Edited to version ${v}. A new version starts with no decision.`
    case 'sent':
      return `Sent version ${v}. The ledger pin for version ${v} is down, so the record of this send is kept.`
    case 'blocked-no-approval':
      return `Blocked. Nobody approved version ${v}, so the gate stayed shut.`
    case 'blocked-rejected':
      return isSent(state)
        ? `Blocked. Version ${v} was rejected, and it already went out.`
        : `Blocked. Version ${v} was rejected, and a rejected version never goes out.`
    case 'blocked-stale-approval':
      return `Blocked. The approval was for version ${state.approvedVersion}. Version ${v} needs its own approval.`
    case 'blocked-duplicate':
      return `Blocked. Version ${v} already went out, and the saved record stops a second send.`
    case 'restarted':
      return state.sent.length > 0
        ? `The app restarted. Decisions and the record of sent versions were kept.`
        : `The app restarted. Decisions were kept, and nothing had been sent yet.`
  }
}
