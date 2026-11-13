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
}

/** The step that is playing now, or undefined when no walkthrough plays. */
export function currentStep(state: { board: Board | undefined; scenario: AppState['scenario'] | undefined }): PlayingStep | undefined {
  const { board, scenario: playing } = state
  if (!board || !playing) return undefined
  const scenario = board.scenarios.find((s) => s.id === playing.id)
  const step = scenario?.steps[playing.step]
  if (!scenario || !step) return undefined
  return {
    scenario,
    index: playing.step,
    caption: step.caption,
    highlight: new Set(step.highlight),
    focusParts: focusParts(board, step.highlight),
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
