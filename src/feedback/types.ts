/**
 * The feedback file, version 1 (`anatomy-feedback`). The app writes it when the user sends their marks to the agent.
 * Each item says what the user meant in terms of the board, never in pixels: a circle becomes the parts it encloses,
 * an arrow the parts it points at. The agent answers each item by its `id` in the `responses` of the next revision.
 */

/** A part on the map: one of the board's components, or a part the user proposed. */
export type PartRef = { type: 'component' | 'new-part'; id: string; label: string }

/** One of the board's connections, with the components at its ends. */
export interface ConnectionRef {
  type: 'relationship'
  id: string
  label: string
  from: string
  to: string
}

/** A connection an arrow points at, and where along the line it points: 0 at its start, 1 at its end. */
export interface ConnectionPoint extends ConnectionRef {
  at: number
}

/** Something the board no longer has. Only its ID is known. */
export interface MissingRef {
  type: 'missing'
  id: string
}

export type Ref = PartRef | ConnectionRef
/** Where an arrow end lies. `point` is empty space. */
export type Pointed = PartRef | ConnectionPoint | MissingRef | { type: 'point' }

/** What the target of a note said in the revision the user marked, so the agent can tell what the note was about. */
export type Snapshot =
  | { type: 'board'; title: string; goal: string }
  | { type: 'component'; label: string; summary: string }
  | { type: 'relationship'; label: string; kind: string; from: string; to: string }

export type FeedbackItem =
  | {
      id: string
      type: 'note' | 'question'
      text: string
      about: { type: 'board' } | Ref | MissingRef
      /** The target as the user saw it. Missing when the target left the board. */
      snapshot?: Snapshot
      /** Set when the board changed under the note since it was written. */
      status?: 'possibly-outdated' | 'needs-relinking'
    }
  | { id: string; type: 'link'; from: PartRef | MissingRef; to: PartRef | MissingRef; label: string }
  | {
      id: string
      type: 'reconnect'
      connection: { id: string; label: string; kind: string }
      was: { from: PartRef | MissingRef; to: PartRef | MissingRef }
      now: { from: PartRef | MissingRef; to: PartRef | MissingRef }
    }
  | {
      id: string
      type: 'new-part'
      label: string
      summary: string
      /** The user's links to and from the new part. Each is also an item of its own. */
      links: { id: string; direction: 'to' | 'from'; part: PartRef | MissingRef; label: string }[]
      /** Parts the new part sits on or next to. */
      near: PartRef[]
    }
  | { id: string; type: 'drawing'; note?: string; encloses: Ref[]; touches: Ref[] }
  | { id: string; type: 'shape'; shape: 'rect' | 'ellipse'; note?: string; encloses: Ref[]; touches: Ref[] }
  | { id: string; type: 'arrow'; note?: string; from: Pointed; to: Pointed }
  | { id: string; type: 'text' | 'sticky'; text: string; note?: string; on: Ref[] }

export interface Feedback {
  format: 'anatomy-feedback'
  schemaVersion: 1
  id: string
  boardId: string
  /** The board revision the user marked. */
  baseRevision: number
  createdAt: string
  /** What is new or changed since the last send, and every item sent before that has no answer yet. */
  items: FeedbackItem[]
  /** Items sent before that the user has since deleted. */
  withdrawn: string[]
}

/** Why an item stayed out of the feedback. */
export type SkipReason = 'no-meaning'
