// Prints the evaluation prompts and scores a board file an agent wrote. It never calls an AI.
// Run with: npm run eval -- --help
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { formatScores, scoreBoard, type FeedbackFile, type Gold, type Parse, type Usage } from './score.ts'
import { withAppModules } from '../scripts/lib/vite.ts'

const tasksUrl = new URL('tasks/', import.meta.url)
const taskIds = readdirSync(tasksUrl).filter((name) => existsSync(new URL(`${name}/gold.json`, tasksUrl))).sort()
const readTask = (id: string, file: string) => readFileSync(new URL(`${id}/${file}`, tasksUrl), 'utf8')

const HELP = `Usage:
  npm run eval                       List the tasks and print every prompt.
  npm run eval -- <task>             Print the prompt of one task.
  npm run eval -- <task> --board <file> [--first <file>] [--feedback <file>] [--usage <file>]
                                     Score a board file. Add --first to score the first file the agent wrote.
                                     Revision tasks use their own feedback.json unless you pass --feedback.
Tasks: ${taskIds.join(', ')}`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    board: { type: 'string' },
    first: { type: 'string' },
    feedback: { type: 'string' },
    usage: { type: 'string' },
    help: { type: 'boolean' },
  },
})

function printPrompt(id: string): void {
  console.log(`=== ${id} ===\n${readTask(id, 'task.md').trim()}\n`)
}

if (values.help) {
  console.log(HELP)
} else if (positionals.length === 0) {
  console.log(`${HELP}\n`)
  for (const id of taskIds) printPrompt(id)
} else {
  const id = positionals[0] ?? ''
  if (!taskIds.includes(id)) {
    console.error(`Unknown task "${id}". Tasks: ${taskIds.join(', ')}`)
    process.exit(2)
  }
  if (values.board === undefined) {
    printPrompt(id)
  } else {
    const gold = JSON.parse(readTask(id, 'gold.json')) as Gold
    const feedbackText = values.feedback !== undefined ? readFileSync(values.feedback, 'utf8') : gold.kind === 'revision' ? readTask(id, 'feedback.json') : undefined
    const parse = await withAppModules(['/src/board/validate.ts'], ([module]) => (module as { parseBoard: Parse }).parseBoard)
    const scores = scoreBoard({
      gold,
      parse,
      boardText: readFileSync(values.board, 'utf8'),
      ...(values.first !== undefined ? { firstWriteText: readFileSync(values.first, 'utf8') } : {}),
      ...(feedbackText !== undefined ? { feedback: JSON.parse(feedbackText) as FeedbackFile } : {}),
      ...(values.usage !== undefined ? { usage: JSON.parse(readFileSync(values.usage, 'utf8')) as Usage } : {}),
    })
    console.log(formatScores(scores))
  }
}
