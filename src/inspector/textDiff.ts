/** A run of text, and whether it is among the words that differ from the other version. */
export interface Piece {
  text: string
  changed: boolean
}

export interface TextDiff {
  before: Piece[]
  after: Piece[]
}

type Op = { type: 'same' | 'del' | 'ins'; tokens: string[] }

/** Words, spaces, and punctuation, as the reader sees them. An emoji and a run of Chinese or Japanese word come out whole. */
function tokens(text: string): string[] {
  if (text === '') return []
  if (typeof Intl.Segmenter === 'function') return Array.from(new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text), (s) => s.segment)
  return text.match(/\s+|\S+/g) ?? []
}

/** Past this many table cells, the middle of the two texts is marked whole, so a very long text never stalls the panel. */
const TABLE_LIMIT = 1_000_000

const isWord = (token: string) => /\S/.test(token)

/**
 * The middle of two texts, by the longest common run of tokens. When the two share less than a third of their words, they are
 * marked whole, because a few words in common scattered through two different texts make a change harder to read, not easier.
 * Text that is long in both versions is also marked whole, so a very long text never stalls the panel.
 */
function alignMiddle(x: string[], y: string[]): Op[] {
  const whole: Op[] = [...(x.length > 0 ? [{ type: 'del' as const, tokens: x }] : []), ...(y.length > 0 ? [{ type: 'ins' as const, tokens: y }] : [])]
  if (x.length === 0 || y.length === 0 || x.length * y.length > TABLE_LIMIT) return whole
  // table[i][j]: how many tokens the tails x[i..] and y[j..] share.
  const width = y.length + 1
  const table = new Uint32Array((x.length + 1) * width)
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      table[i * width + j] = x[i] === y[j] ? table[(i + 1) * width + j + 1]! + 1 : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!)
    }
  }
  const ops: Op[] = []
  const push = (type: Op['type'], token: string) => {
    const last = ops[ops.length - 1]
    if (last?.type === type) last.tokens.push(token)
    else ops.push({ type, tokens: [token] })
  }
  let i = 0
  let j = 0
  let shared = 0
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      push('same', x[i]!)
      if (isWord(x[i]!)) shared++
      i++
      j++
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) push('del', x[i++]!)
    else push('ins', y[j++]!)
  }
  while (i < x.length) push('del', x[i++]!)
  while (j < y.length) push('ins', y[j++]!)
  return shared * 3 < Math.max(x.filter(isWord).length, y.filter(isWord).length) ? whole : ops
}

/** The words of the two texts that stay, and the words that left and came. */
function align(a: string[], b: string[]): Op[] {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let end = 0
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++
  const ops: Op[] = []
  if (start > 0) ops.push({ type: 'same', tokens: a.slice(0, start) })
  ops.push(...alignMiddle(a.slice(start, a.length - end), b.slice(start, b.length - end)))
  if (end > 0) ops.push({ type: 'same', tokens: a.slice(a.length - end) })
  return ops
}

/** A space between two changed runs is part of the change, so a replaced phrase reads as one. */
function absorbSpaces(ops: Op[]): Op[] {
  const out: Op[] = []
  ops.forEach((op, i) => {
    const between = ops[i - 1] !== undefined && ops[i - 1]!.type !== 'same' && ops[i + 1] !== undefined && ops[i + 1]!.type !== 'same'
    if (op.type === 'same' && between && op.tokens.every((t) => /^\s+$/.test(t))) out.push({ type: 'del', tokens: op.tokens }, { type: 'ins', tokens: op.tokens })
    else out.push(op)
  })
  return out
}

interface Run {
  text: string
  changed: boolean
  /** Where it starts in the whole text. */
  at: number
}

/** The text of one side, as runs. `points` lists where the other side has words this side lacks, for the cut around them. */
function side(ops: Op[], own: 'del' | 'ins'): { runs: Run[]; points: number[] } {
  const runs: Run[] = []
  const points: number[] = []
  let at = 0
  for (const op of ops) {
    if (op.type !== 'same' && op.type !== own) {
      points.push(at)
      continue
    }
    const text = op.tokens.join('')
    const changed = op.type !== 'same'
    const last = runs[runs.length - 1]
    if (last && last.changed === changed) last.text += text
    else runs.push({ text, changed, at })
    at += text.length
  }
  return { runs: trimMarks(runs), points }
}

/** A space at the edge of a marked run is not a changed word, so it stays out of the mark. A run of only spaces stays marked. */
function trimMarks(runs: Run[]): Run[] {
  const out: Run[] = []
  const add = (text: string, changed: boolean) => {
    if (text === '') return
    const last = out[out.length - 1]
    if (last && last.changed === changed) last.text += text
    else out.push({ text, changed, at: 0 })
  }
  for (const run of runs) {
    const word = /\S/.test(run.text)
    if (!run.changed || !word) {
      add(run.text, run.changed)
      continue
    }
    const lead = /^\s*/.exec(run.text)![0]
    const tail = /\s*$/.exec(run.text)![0]
    add(lead, false)
    add(run.text.slice(lead.length, run.text.length - tail.length), true)
    add(tail, false)
  }
  let at = 0
  for (const run of out) {
    run.at = at
    at += run.text.length
  }
  return out
}

/** Moves a cut to the nearest space outside the window, and never between the halves of a surrogate pair. */
function snap(text: string, index: number, direction: 1 | -1): number {
  let i = index
  while (i > 0 && i < text.length && !/\s/.test(text[direction === 1 ? i - 1 : i]!)) i += direction
  if (i > 0 && i < text.length && /[\uDC00-\uDFFF]/.test(text[i]!) && /[\uD800-\uDBFF]/.test(text[i - 1]!)) i += direction
  return Math.min(text.length, Math.max(0, i))
}

/** Keeps `context` characters around every change, and puts an ellipsis where the rest of the text was. */
function cut(runs: Run[], points: number[], context: number): Piece[] {
  const whole = runs.map((r) => r.text).join('')
  const spans = [...runs.filter((r) => r.changed).map((r) => [r.at, r.at + r.text.length] as const), ...points.map((p) => [p, p] as const)].sort((a, b) => a[0] - b[0])
  if (spans.length === 0 || whole.length <= context * 2 + 24) return runs.map(({ text, changed }) => ({ text, changed }))
  const keep: [number, number][] = []
  for (const [from, to] of spans) {
    const a = from - context <= 0 ? 0 : snap(whole, from - context, 1)
    const b = to + context >= whole.length ? whole.length : snap(whole, to + context, -1)
    const last = keep[keep.length - 1]
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else keep.push([a, b])
  }
  const pieces: Piece[] = []
  for (const run of runs) {
    const end = run.at + run.text.length
    if (run.changed) {
      pieces.push({ text: run.text, changed: true })
      continue
    }
    let text = ''
    let from = run.at
    for (const [a, b] of keep) {
      const lo = Math.max(a, run.at)
      const hi = Math.min(b, end)
      if (lo >= hi) continue
      if (lo > from || (text === '' && lo > run.at)) text += '…'
      text += whole.slice(lo, hi)
      from = hi
    }
    if (from < end) text += '…'
    if (text === '') text = '…'
    pieces.push({ text, changed: false })
  }
  return pieces
}

/**
 * The words that differ between two versions of a text, marked on each side. It compares words, so a changed word is marked
 * whole, and a text with no spaces is compared by the words a reader would see in it. With `context`, long text that did not
 * change is cut down to about that many characters around each change.
 */
export function diffText(before: string, after: string, options: { context?: number } = {}): TextDiff {
  const ops = absorbSpaces(align(tokens(before), tokens(after)))
  const a = side(ops, 'del')
  const b = side(ops, 'ins')
  const context = options.context
  const finish = (s: ReturnType<typeof side>) => (context === undefined ? s.runs.map(({ text, changed }) => ({ text, changed })) : cut(s.runs, s.points, context))
  return { before: finish(a), after: finish(b) }
}
