/**
 * The life of the map while cards are moved, as one pure state machine.
 *
 *   idle ---- pickUp ----------------------------> holding (a card is in hand: drag or resize)
 *   idle ---- keyMove ---------------------------> settling (wait 250 ms, moves are coalesced)
 *   holding - move ------------------------------> holding, and the work below becomes settling (wait 0)
 *   holding - release ---------------------------> the work below: idle or settling
 *   holding - escape ----------------------------> the work as it was at pickUp; the card stays cancelled until release
 *   settling - settleDue (timer) ----------------> solving (the unsaved key moves are saved by the caller first)
 *   solving - solved (last slice) ---------------> idle
 *   solving - pickUp / keyMove / external -------> settling (the slices are cancelled and start again)
 *   any busy state - fontsLoaded ----------------> same state, with a font refresh owed (`stale`)
 *   any - external { same | moved } -------------> settling (wait 0) unless idle
 *   any - rebuilt (a full build ran) ------------> idle, refresh no longer owed
 *
 * Holding is an overlay: the work underneath (idle, settling, solving) is paused while a card is held.
 * A font refresh owed is data on the state, not a phase. It is paid by the next full build.
 */

/** Arrow keys repeat quickly. The full build and the save wait until they stop. */
export const KEY_SETTLE_MS = 250

export type Work =
  | { readonly mode: 'idle' }
  /** The lines of moved cards are hidden. The full build starts after `wait` ms (0: after the next paint). */
  | { readonly mode: 'settling'; readonly wait: number; readonly moves: readonly string[] }
  /** The full build runs in slices, one per frame. */
  | { readonly mode: 'solving' }

/** A card in hand. After Escape it stays `cancelled` until the pointer is released, and moves are ignored. */
export interface Held {
  readonly id: string
  readonly kind: 'drag' | 'resize'
  readonly cancelled: boolean
  /** The work as it was at pickup. Escape puts it back. */
  readonly resume: Work
}

export interface Interaction {
  readonly work: Work
  readonly held: Held | undefined
  /** Fonts loaded while busy: the next full build is a refresh that reuses no lines. */
  readonly stale: boolean
}

export type Event =
  | { readonly type: 'pickUp'; readonly id: string; readonly kind: Held['kind'] }
  | { readonly type: 'move' }
  | { readonly type: 'release' }
  | { readonly type: 'keyMove'; readonly id: string }
  | { readonly type: 'settleDue' }
  | { readonly type: 'solved' }
  | { readonly type: 'fontsLoaded' }
  | { readonly type: 'escape' }
  /** Positions or sizes changed from outside the map: `same` the cards already show them, `moved` they differ. */
  | { readonly type: 'external'; readonly change: 'same' | 'moved' }
  | { readonly type: 'rebuilt' }

export const IDLE: Interaction = { work: { mode: 'idle' }, held: undefined, stale: false }

/** A card is in hand and not cancelled: the work underneath waits. */
export const isHolding = (s: Interaction): boolean => s.held !== undefined && !s.held.cancelled

export const phaseOf = (s: Interaction): 'idle' | 'holding' | 'settling' | 'solving' => (isHolding(s) ? 'holding' : s.work.mode)

/** Something is in motion or unsaved. */
export const isBusy = (s: Interaction): boolean => isHolding(s) || s.work.mode !== 'idle'

/** The card the map draws as held. */
export const heldId = (s: Interaction): string | undefined => (s.held && !s.held.cancelled ? s.held.id : undefined)

/** Keyboard moves that wait to be saved. */
export const pendingMoves = (s: Interaction): readonly string[] => (s.work.mode === 'settling' ? s.work.moves : [])

/** The full build reuses the lines that nothing touched, unless a font refresh is owed. */
export const reusesLines = (s: Interaction): boolean => !s.stale

const settlingNow = (work: Work): Work => ({ mode: 'settling', wait: 0, moves: work.mode === 'settling' ? work.moves : [] })

export function next(s: Interaction, event: Event): Interaction {
  switch (event.type) {
    case 'pickUp': {
      const work = s.work.mode === 'solving' ? settlingNow(s.work) : s.work
      return { ...s, work, held: { id: event.id, kind: event.kind, cancelled: false, resume: work } }
    }
    case 'move':
      return s.held?.cancelled ? s : { ...s, work: settlingNow(s.work) }
    case 'keyMove': {
      const moves = pendingMoves(s)
      return { ...s, work: { mode: 'settling', wait: KEY_SETTLE_MS, moves: moves.includes(event.id) ? moves : [...moves, event.id] } }
    }
    case 'release': {
      const { held } = s
      if (!held) return s
      const { work } = s
      const forgotten = !held.cancelled && held.kind === 'drag' && work.mode === 'settling' && work.moves.includes(held.id)
      return { ...s, work: forgotten ? { ...work, moves: work.moves.filter((id) => id !== held.id) } : work, held: undefined }
    }
    case 'settleDue':
      return s.work.mode === 'settling' && !isHolding(s) ? { ...s, work: { mode: 'solving' } } : s
    case 'solved':
      return s.work.mode === 'solving' && !isHolding(s) ? { ...s, work: { mode: 'idle' }, stale: false } : s
    case 'fontsLoaded':
      return isBusy(s) ? { ...s, stale: true } : s
    case 'escape':
      return s.held && !s.held.cancelled ? { ...s, work: s.held.resume, held: { ...s.held, cancelled: true } } : s
    case 'external':
      return event.change === 'same' && s.work.mode === 'idle' ? s : { ...s, work: settlingNow(s.work) }
    case 'rebuilt':
      return { work: { mode: 'idle' }, held: s.held, stale: false }
  }
}
