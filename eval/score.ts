// Deterministic scores for one board an agent wrote. No AI call, no network.
import type { Board } from '../src/board/schema.ts'
import type { ParseResult } from '../src/board/validate.ts'

export interface GoldComponent {
  name: string
  aliases: string[]
}

export interface Gold {
  id: string
  kind: 'first-board' | 'revision'
  components: GoldComponent[]
  edges: { from: string; to: string }[]
  /** The fewest `unknown` or `question` items the board must hold. */
  minUnknowns: number
  /** The fewest clarifying questions that the responses must hold. */
  minQuestions?: number
  /** True when the material is a plan, so facts must be `documented-intent` with a reference. */
  needsDocumentedIntent: boolean
  /** Revision tasks: the revision of the starting board. */
  startRevision?: number
  feedbackId?: string
  /** Feedback items too unclear to act on. The agent must ask about them, not adopt them. */
  unclearItems?: string[]
  notes?: string
}

export interface FeedbackFile {
  id: string
  items: { id: string }[]
  withdrawn?: string[]
}

export interface Usage {
  tokensIn?: number
  tokensOut?: number
  toolCalls?: number
  turns?: number
  turnsToValid?: number
}

export type Parse = (text: string) => ParseResult

export interface ScoreInput {
  gold: Gold
  parse: Parse
  /** The final board file. */
  boardText: string
  /** The first board file the agent wrote, if you kept it. Defaults to the final one. */
  firstWriteText?: string
  feedback?: FeedbackFile
  usage?: Usage
}

export interface Scores {
  task: string
  validFirstWrite: boolean
  validFinal: boolean
  errors: string[]
  components: { recall: number; precision: number; missing: string[]; extra: string[] }
  edges: { recall: number; missing: string[] }
  unknowns: { count: number; required: number; ok: boolean }
  questions?: { count: number; required: number; ok: boolean }
  guaranteeWords: { count: number; found: string[] }
  documentedIntentWithoutReference: number
  documentedIntentMissing?: boolean
  feedback?: {
    answered: number
    total: number
    unanswered: string[]
    revisionRaised: boolean
    badChanged: string[]
    unclearAdopted: string[]
  }
  usage?: Usage
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and'])

/** Lowercase, strip accents and punctuation, drop filler words, and make each word singular. */
export function normalizeLabel(label: string): string[] {
  return label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word !== '' && !STOP_WORDS.has(word))
    .map((word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word))
}

/** Two labels match when their words are the same, or every word of the shorter label is in the longer one. */
export function labelsMatch(a: string, b: string): boolean {
  const x = normalizeLabel(a)
  const y = normalizeLabel(b)
  if (x.length === 0 || y.length === 0) return false
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  return short.every((word) => long.includes(word))
}

function matchesGold(label: string, gold: GoldComponent): boolean {
  return [gold.name, ...gold.aliases].some((name) => labelsMatch(label, name))
}

function goldIndex(label: string, gold: Gold): number {
  return gold.components.findIndex((c) => matchesGold(label, c))
}

const GUARANTEE = /\b(always|guarantee[ds]?|secure[sd]?|never fails?|cannot fail|can't fail|impossible|foolproof)\b/gi

/** Text fields of a board file, read from the raw JSON so the scan also works when the file is invalid. */
export function boardTexts(data: unknown): string[] {
  const skipKeys = new Set(['id', 'from', 'to', 'about', 'group', 'feedbackId', 'respondsTo', 'changed', 'highlight', 'format', 'kind', 'path', 'lesson'])
  const out: string[] = []
  const walk = (value: unknown, key?: string) => {
    if (typeof value === 'string') {
      if (key === undefined || !skipKeys.has(key)) out.push(value)
    } else if (Array.isArray(value)) {
      for (const entry of value) walk(entry, key)
    } else if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k)
    }
  }
  walk(data)
  return out
}

function countDocumentedWithoutReference(data: unknown): number {
  let count = 0
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk)
    else if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>
      if (record['kind'] === 'documented-intent' && 'references' in record === false) count += 1
      else if (record['kind'] === 'documented-intent' && Array.isArray(record['references']) && record['references'].length === 0) count += 1
      Object.values(record).forEach(walk)
    }
  }
  walk(data)
  return count
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return undefined
  }
}

const ratio = (hit: number, total: number) => (total === 0 ? 1 : hit / total)

function scoreFeedback(board: Board, gold: Gold, feedback: FeedbackFile) {
  const required = feedback.items.map((i) => i.id).filter((id) => !(feedback.withdrawn ?? []).includes(id))
  const responses = board.responses
  const byId = new Map((responses?.items ?? []).map((r) => [r.feedbackId, r]))
  const unanswered = required.filter((id) => !byId.has(id))
  const known = new Set([...board.components.map((c) => c.id), ...board.relationships.map((r) => r.id)])
  const badChanged = (responses?.items ?? []).flatMap((r) => r.changed.filter((id) => !known.has(id)).map((id) => `${r.feedbackId}: ${id}`))
  for (const r of responses?.items ?? []) {
    if (r.status === 'adopted' && r.changed.length === 0) badChanged.push(`${r.feedbackId}: adopted with an empty changed list`)
  }
  const unclearAdopted = (gold.unclearItems ?? []).filter((id) => {
    const r = byId.get(id)
    return r !== undefined && (r.status === 'adopted' || r.changed.length > 0)
  })
  return {
    answered: required.length - unanswered.length,
    total: required.length,
    unanswered,
    revisionRaised: board.revision > (gold.startRevision ?? 0) && responses?.respondsTo === feedback.id,
    badChanged,
    unclearAdopted,
  }
}

export function scoreBoard(input: ScoreInput): Scores {
  const { gold, parse } = input
  const final = parse(input.boardText)
  const first = input.firstWriteText === undefined ? final : parse(input.firstWriteText)
  const data = safeJson(input.boardText)

  const base: Pick<Scores, 'task' | 'validFirstWrite' | 'validFinal' | 'errors'> = {
    task: gold.id,
    validFirstWrite: first.ok,
    validFinal: final.ok,
    errors: final.ok ? [] : final.errors.map((e) => `${e.path || '(file)'}: ${e.message}`),
  }

  const texts = boardTexts(data)
  const found = texts.flatMap((t) => t.match(GUARANTEE) ?? [])
  const guaranteeWords = { count: found.length, found: [...new Set(found.map((w) => w.toLowerCase()))] }
  const documentedIntentWithoutReference = countDocumentedWithoutReference(data)
  const withUsage = input.usage ? { usage: input.usage } : {}

  if (!final.ok) {
    return {
      ...base,
      components: { recall: 0, precision: 0, missing: gold.components.map((c) => c.name), extra: [] },
      edges: { recall: 0, missing: gold.edges.map((e) => `${e.from} -> ${e.to}`) },
      unknowns: { count: 0, required: gold.minUnknowns, ok: gold.minUnknowns === 0 },
      guaranteeWords,
      documentedIntentWithoutReference,
      ...withUsage,
    }
  }

  const board = final.board
  const covered = new Set<number>()
  const extra: string[] = []
  let matchedBoardComponents = 0
  const goldOfComponent = new Map<string, number>()
  for (const c of board.components) {
    const index = goldIndex(c.label, gold)
    if (index >= 0) {
      covered.add(index)
      matchedBoardComponents += 1
      goldOfComponent.set(c.id, index)
    } else {
      extra.push(c.label)
    }
  }

  const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)
  const boardEdges = new Set<string>()
  for (const r of board.relationships) {
    const a = goldOfComponent.get(r.from)
    const b = goldOfComponent.get(r.to)
    if (a !== undefined && b !== undefined) boardEdges.add(edgeKey(a, b))
  }
  const missingEdges: string[] = []
  let edgeHits = 0
  for (const e of gold.edges) {
    const a = goldIndex(e.from, gold)
    const b = goldIndex(e.to, gold)
    if (a >= 0 && b >= 0 && boardEdges.has(edgeKey(a, b))) edgeHits += 1
    else missingEdges.push(`${e.from} -> ${e.to}`)
  }

  const unknownCount = board.items.filter((i) => i.kind === 'unknown' || i.kind === 'question').length
  const questionCount = (board.responses?.items ?? []).filter((r) => r.text.includes('?')).length

  const sources = [...board.components.map((c) => c.source.kind), ...board.relationships.map((r) => r.source.kind)]
  const result: Scores = {
    ...base,
    components: {
      recall: ratio(covered.size, gold.components.length),
      precision: ratio(matchedBoardComponents, board.components.length),
      missing: gold.components.filter((_, i) => !covered.has(i)).map((c) => c.name),
      extra,
    },
    edges: { recall: ratio(edgeHits, gold.edges.length), missing: missingEdges },
    unknowns: { count: unknownCount, required: gold.minUnknowns, ok: unknownCount >= gold.minUnknowns },
    guaranteeWords,
    documentedIntentWithoutReference,
    ...withUsage,
  }
  if (gold.minQuestions !== undefined) {
    result.questions = { count: questionCount, required: gold.minQuestions, ok: questionCount >= gold.minQuestions }
  }
  if (gold.needsDocumentedIntent) result.documentedIntentMissing = !sources.includes('documented-intent')
  if (input.feedback) result.feedback = scoreFeedback(board, gold, input.feedback)
  return result
}

const percent = (n: number) => `${Math.round(n * 100)}%`

export function formatScores(s: Scores): string {
  const lines = [
    `Task: ${s.task}`,
    `Valid on first write: ${s.validFirstWrite ? 'yes' : 'no'}   Valid now: ${s.validFinal ? 'yes' : 'no'}`,
    ...s.errors.slice(0, 10).map((e) => `  error  ${e}`),
    `Component recall: ${percent(s.components.recall)}   precision: ${percent(s.components.precision)}`,
    ...(s.components.missing.length ? [`  missing  ${s.components.missing.join(', ')}`] : []),
    ...(s.components.extra.length ? [`  extra    ${s.components.extra.join(', ')}`] : []),
    `Edge recall: ${percent(s.edges.recall)}`,
    ...s.edges.missing.map((e) => `  missing  ${e}`),
    `Unknown or question items: ${s.unknowns.count} (need ${s.unknowns.required}) ${s.unknowns.ok ? 'ok' : 'LOW'}`,
    ...(s.questions ? [`Clarifying questions in responses: ${s.questions.count} (need ${s.questions.required}) ${s.questions.ok ? 'ok' : 'LOW'}`] : []),
    `Guarantee words: ${s.guaranteeWords.count}${s.guaranteeWords.found.length ? ` (${s.guaranteeWords.found.join(', ')})` : ''}`,
    `documented-intent without a reference: ${s.documentedIntentWithoutReference}`,
    ...(s.documentedIntentMissing ? ['No documented-intent source, but the material is a plan'] : []),
  ]
  if (s.feedback) {
    const f = s.feedback
    lines.push(`Feedback answered: ${f.answered} of ${f.total}   revision raised and respondsTo right: ${f.revisionRaised ? 'yes' : 'no'}`)
    for (const id of f.unanswered) lines.push(`  unanswered  ${id}`)
    for (const entry of f.badChanged) lines.push(`  bad changed  ${entry}`)
    for (const id of f.unclearAdopted) lines.push(`  unclear item acted on  ${id}`)
  }
  if (s.usage) lines.push(`Usage: ${JSON.stringify(s.usage)}`)
  return lines.join('\n')
}
