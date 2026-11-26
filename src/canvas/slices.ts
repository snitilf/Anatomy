import type { Board } from '../board/schema'
import type { Link, Reconnect } from '../layer/model'
import type { Rect } from '../layout/geometry'
import { geometrySteps, type Geometry } from './buildGraph'
import { primeBundles } from './bundleRoutes'
import { bundleGroups } from './bundles'

/** What the build after a drop or a resize starts from. */
export interface Build {
  board: Board
  /** Where the cards are now. */
  rects: Record<string, Rect>
  /** The map the lines are kept from, when the lines that nothing touched stay. */
  previous: Geometry | undefined
  links: readonly Link[] | undefined
  reconnects: readonly Reconnect[] | undefined
  proposals: readonly { id: string }[] | undefined
  /** The far view shows, so its lines are solved in the same steps and kept for the commit that ends the build. */
  bundles: boolean
}

/**
 * Everything the build after a drop or a resize works out, in steps: the lines of the map, and, when the far view
 * shows, the lines of the far view, which depend on the cards alone. Each step is a small piece of the work, so the
 * caller can spend a slice of a frame on them. The result is the map `computeGeometry` gives.
 */
export function* buildSteps(build: Build): Generator<void, Geometry, void> {
  const { board, rects, links, reconnects, proposals } = build
  if (build.bundles) yield* primeBundles(board, rects, bundleGroups(board, links ?? [], reconnects ?? [], proposals ?? []))
  return yield* geometrySteps(board, rects, links ?? [], build.previous, reconnects ?? [])
}
