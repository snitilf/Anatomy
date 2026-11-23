import { boardAdvice, explanationAdvice, feedbackAdvice, readFeedback } from '../board/advice.ts'
import type { BoardProblem } from '../board/validate.ts'
import { applyPatch, type OpProblem } from './apply.ts'
import { previousName } from './ids.ts'
import { clip, count, line, MAX_WARNINGS, plain, type CliIo, type CliResult } from './output.ts'

export interface ApplyOptions {
  /** The patch file, `-` for stdin, or undefined for `patch.json` next to the board. */
  patch: string | undefined
  board: string | undefined
  base: number | undefined
  cascade: boolean
  dryRun: boolean
  json: boolean
}

/** Diff lines past this many are counted, not listed. */
const MAX_DIFF = 50

function opLine(problem: OpProblem): string {
  const where = problem.op === undefined ? '(patch)' : `ops[${problem.op}]`
  const path = problem.path === '' ? '' : ` ${problem.path}`
  const stop = /[.?!]$/.test(problem.message) ? '' : '.'
  return clip(`${where} ${problem.code}${path}: ${problem.message}${problem.hint === undefined ? '' : `${stop} ${problem.hint}`}`)
}

function plainOp(problem: OpProblem) {
  const { op, path, code } = problem
  const message = clip(problem.message)
  return { ...(op === undefined ? {} : { op }), path, code, message, ...(problem.hint === undefined ? {} : { hint: clip(problem.hint) }) }
}

export function runApply(options: ApplyOptions, io: CliIo): CliResult {
  const file = options.board ?? io.defaultBoard
  const shown = io.display(file)
  const exit = (code: 0 | 1 | 2, stderr: string): CliResult => ({ code, stdout: '', stderr })

  const board = io.read(file)
  if (!board.ok) return exit(2, `Cannot read ${shown}: ${board.reason}.\n`)
  const patchFile = options.patch === '-' ? undefined : (options.patch ?? io.sibling(file, 'patch.json'))
  const patch = patchFile === undefined ? io.stdin() : io.read(patchFile)
  if (!patch.ok) return exit(2, `Cannot read ${patchFile === undefined ? 'the patch from stdin' : io.display(patchFile)}: ${patch.reason}.\n`)

  const feedbackPath = io.sibling(file, 'feedback.json')
  const feedbackFile = feedbackPath === file ? undefined : io.read(feedbackPath)
  const feedback = feedbackFile === undefined || (!feedbackFile.ok && feedbackFile.missing) ? undefined : feedbackFile.ok ? (readFeedback(feedbackFile.text) ?? 'unreadable') : 'unreadable'

  const result = applyPatch({ boardText: board.text, patchText: patch.text, feedback, base: options.base, cascade: options.cascade })

  if (!result.ok) {
    const errors: BoardProblem[] = result.errors
    const total = result.opErrors.length + result.omittedOpErrors + errors.length + result.omittedErrors
    if (options.json) {
      const report = { file: shown, applied: false, dryRun: options.dryRun, opErrors: result.opErrors.map(plainOp), omittedOpErrors: result.omittedOpErrors, errors: errors.map(plain), omittedErrors: result.omittedErrors }
      return { code: 1, stdout: `${JSON.stringify(report)}\n`, stderr: '' }
    }
    const parts = [
      ...(result.opErrors.length + result.omittedOpErrors > 0 ? [count(result.opErrors.length + result.omittedOpErrors, 'patch error')] : []),
      ...(errors.length + result.omittedErrors > 0 ? [count(errors.length + result.omittedErrors, 'board error')] : []),
    ]
    const lines = [
      `${shown}: not changed, ${parts.length > 0 ? parts.join(', ') : count(total, 'error')}`,
      ...result.opErrors.map(opLine),
      ...(result.omittedOpErrors > 0 ? [`${result.omittedOpErrors} more patch errors are not shown.`] : []),
      ...errors.map(line),
      ...(result.omittedErrors > 0 ? [`${result.omittedErrors} more board errors are not shown.`] : []),
    ]
    return { code: 1, stdout: `${lines.join('\n')}\n`, stderr: '' }
  }

  if (!options.dryRun) {
    const prev = io.sibling(file, previousName(file))
    try {
      // The board as it was is kept first, so a failure after this point still leaves something to go back to.
      io.write(prev, board.text, { create: true })
    } catch (error) {
      return exit(2, `Cannot write ${io.display(prev)}: ${error instanceof Error ? error.message : String(error)}. ${shown} is unchanged.\n`)
    }
    // A board that changed while the patch was applied would lose the change.
    const again = io.read(file)
    if (!again.ok || again.text !== board.text) return exit(2, `${shown} changed while the patch was applied. Nothing was written. Run the command again.\n`)
    try {
      io.write(file, result.text)
    } catch (error) {
      return exit(2, `Cannot write ${shown}: ${error instanceof Error ? error.message : String(error)}. It is unchanged.\n`)
    }
  }

  const feedbackWarnings = feedbackAdvice(result.board, feedback)
  const all = [...feedbackWarnings, ...result.warnings, ...boardAdvice(result.board), ...explanationAdvice(result.board)]
  const warnings = all.slice(0, MAX_WARNINGS)
  const omittedWarnings = Math.max(0, all.length - warnings.length)
  const shownDiff = result.diff.slice(0, MAX_DIFF)
  const omittedDiff = result.diff.length - shownDiff.length
  const shownIds = result.assigned.slice(0, MAX_DIFF)
  const omittedIds = result.assigned.length - shownIds.length

  if (options.json) {
    const report = {
      file: shown,
      applied: !options.dryRun,
      dryRun: options.dryRun,
      revision: { from: result.from, to: result.to },
      diff: shownDiff,
      omittedDiff,
      assigned: shownIds,
      omittedAssigned: omittedIds,
      warnings: warnings.map(plain),
      omittedWarnings,
    }
    return { code: 0, stdout: `${JSON.stringify(report)}\n`, stderr: '' }
  }
  const head = options.dryRun ? `${shown}: dry run, nothing written, would raise revision ${result.from} to ${result.to}` : `${shown}: applied, revision ${result.from} to ${result.to}`
  const lines = [
    `${head}${all.length > 0 ? `, ${count(all.length, 'warning')}` : ''}`,
    ...shownDiff.map(clip),
    ...(omittedDiff > 0 ? [`${omittedDiff} more changes are not shown.`] : []),
    ...shownIds.map((a) => `ops[${a.op}] ID: ${a.id}`),
    ...(omittedIds > 0 ? [`${omittedIds} more IDs are not shown.`] : []),
    ...warnings.map(line),
    ...(omittedWarnings > 0 ? [`${omittedWarnings} more warnings are not shown.`] : []),
  ]
  return { code: 0, stdout: `${lines.join('\n')}\n`, stderr: '' }
}
