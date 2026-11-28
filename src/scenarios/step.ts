import type { Board, BoardScenario } from '../board/schema'
import type { AppState } from '../app/state'

export interface PlayingStep {
  scenario: BoardScenario
  index: number
  caption: string
  /** Parts and connections the step is about. Empty means the whole board. */
  highlight: ReadonlySet<string>
  /** Parts the camera frames: the highlighted parts and the ends of highlighted connections. */
  focusParts: string[]
  /**
   * Everything the step lights on the map: the parts it names, the connections it follows, and both ends of each, so
   * the caption never talks about a card that stays dimmed. The camera frames the same parts.
   */
  lit: ReadonlySet<string>
}

/** The step that is playing now, or undefined when no walkthrough plays. */
export function currentStep(state: { board: Board | undefined; scenario: AppState['scenario'] | undefined }): PlayingStep | undefined {
  const { board, scenario: playing } = state
  if (!board || !playing) return undefined
  const scenario = board.scenarios.find((s) => s.id === playing.id)
  const step = scenario?.steps[playing.step]
  if (!scenario || !step) return undefined
  const highlight = new Set(step.highlight)
  const framed = focusParts(board, step.highlight)
  const lit = new Set<string>(highlight)
  for (const id of framed) lit.add(id)
  return {
    scenario,
    index: playing.step,
    caption: step.caption,
    highlight,
    focusParts: framed,
    lit,
  }
}

export function focusParts(board: Board, highlight: readonly string[]): string[] {
  const parts = new Set<string>()
  const components = new Set(board.components.map((c) => c.id))
  for (const id of highlight) {
    if (components.has(id)) parts.add(id)
    const r = board.relationships.find((x) => x.id === id)
    if (r) {
      parts.add(r.from)
      parts.add(r.to)
    }
  }
  return [...parts]
}
