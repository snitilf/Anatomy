export interface OutlineRect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/**
 * A small precomputed geometry snapshot of an example board, so the start screen
 * can draw a real miniature map without bundling the example board JSON files.
 */
export interface BoardOutline {
  readonly width: number
  readonly height: number
  readonly groups: readonly OutlineRect[]
  readonly cards: readonly OutlineRect[]
  readonly lines: readonly string[]
  readonly parts: number
  readonly connections: number
  readonly walkthroughs: number
}
