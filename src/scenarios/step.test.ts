import { describe, expect, it } from 'vitest'
import { claudeCodeBoard, clone, urlShortenerBoard } from '../layer/testBoards'
import { currentStep } from './step'

describe('the step that is playing', () => {
  it('lights the parts the step names, the connections it follows, and both ends of each', () => {
    const board = claudeCodeBoard()
    // Step 2 of "Fix a failing test" names the loop and the model, and follows two lines out of the loop.
    const step = currentStep({ board, scenario: { id: 'fix-a-failing-test', step: 1 } })!
    // The parts the caption names.
    expect(step.lit.has('agent-loop')).toBe(true)
    expect(step.lit.has('model')).toBe(true)
    // The lines it follows keep their own ids, so they stay lit too.
    expect(step.lit.has('loop-to-context')).toBe(true)
    expect(step.lit.has('loop-calls-model')).toBe(true)
    // The end of a followed line that the caption does not name is lit just the same.
    expect(step.lit.has('context-window')).toBe(true)
  })

  it('lights only what the step is about', () => {
    const board = urlShortenerBoard()
    // Step 2 of "Create a short link": the endpoint, the line to the generator, and the generator.
    const step = currentStep({ board, scenario: { id: 's-create-link', step: 1 } })!
    expect([...step.lit].sort()).toEqual(['create-endpoint', 'r-create-to-generator', 'code-generator'].sort())
  })

  it('lights nothing on a whole-board step', () => {
    const board = clone(urlShortenerBoard())
    board.scenarios[0]!.steps[0]!.highlight = []
    const step = currentStep({ board, scenario: { id: 's-create-link', step: 0 } })!
    expect(step.lit.size).toBe(0)
  })

  it('is nothing when no walkthrough plays, or the step is past the end', () => {
    const board = urlShortenerBoard()
    expect(currentStep({ board, scenario: undefined })).toBeUndefined()
    expect(currentStep({ board: undefined, scenario: { id: 's-create-link', step: 0 } })).toBeUndefined()
    expect(currentStep({ board, scenario: { id: 'no-such-walk', step: 0 } })).toBeUndefined()
    expect(currentStep({ board, scenario: { id: 's-create-link', step: 99 } })).toBeUndefined()
  })
})
