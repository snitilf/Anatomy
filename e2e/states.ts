import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'

interface Board {
  id: string
  revision: number
  components: { id: string; label: string; summary: string; explanation: unknown; group?: string; inputs?: unknown; outputs?: unknown; source: object }[]
}

/*
 * The fingerprints below are the ones src/layer/fingerprint.ts makes. The end-to-end build cannot import the app's source,
 * so the few lines are repeated here. If they drift, the "not sent" and "sent" checks in status.spec.ts fail.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonical(v))).join(',')}]`
  const record = value as Record<string, unknown>
  const parts: string[] = []
  for (const key of Object.keys(record).sort()) {
    if (record[key] !== undefined) parts.push(`${JSON.stringify(key)}:${canonical(record[key])}`)
  }
  return `{${parts.join(',')}}`
}

function cyrb53(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

const fingerprintValue = (value: unknown) => cyrb53(canonical(value))

function fingerprintPart(board: Board, id: string): string {
  const c = board.components.find((x) => x.id === id)!
  return fingerprintValue({ label: c.label, summary: c.summary, explanation: c.explanation, group: c.group, inputs: c.inputs ?? [], outputs: c.outputs ?? [], source: { references: [], ...c.source } })
}

export const SHORTENER = 'e2e/fixtures/url-shortener.board.json'
const KEY = 'anatomy:test-folder'
const AT = '2026-11-14T00:00:00.000Z'

type Status = 'answered' | 'adopted' | 'declined'

/** One note per state, each on its own part, so the map badge of a part is the state of its note. */
export const NOTE_STATES = [
  { part: 'web-form', state: 'unsent', text: 'Note that has not been sent' },
  { part: 'visitor-browser', state: 'sent', text: 'Note that was sent' },
  { part: 'create-endpoint', state: 'answered', text: 'Question the agent answered' },
  { part: 'link-store', state: 'adopted', text: 'Note the agent adopted' },
  { part: 'edge-dns', state: 'declined', text: 'Note the agent declined' },
  { part: 'code-generator', state: 'outdated', text: 'Note on a part that changed' },
] as const

export const RELINK_TEXT = 'Note whose part was removed'

/** A board and a layer with an item in every state of the round trip. */
export async function everyState(file = SHORTENER) {
  const text = await readFile(file, 'utf8')
  const board = JSON.parse(text) as Board
  const id = (n: number) => `note-state${String(n).padStart(2, '0')}`
  const notes: Record<string, unknown>[] = NOTE_STATES.map((s, i) => {
    const target = { type: 'component' as const, id: s.part as string }
    return {
      id: id(i),
      kind: i === 2 ? 'question' : 'note',
      text: s.text,
      target,
      targetFingerprint: s.state === 'outdated' ? 'stale' : fingerprintPart(board, s.part),
      createdAt: AT,
      updatedAt: AT,
    }
  })
  notes.push({ id: id(9), kind: 'note', text: RELINK_TEXT, target: { type: 'component', id: 'removed-part' }, targetFingerprint: 'old', createdAt: AT, updatedAt: AT })
  const links = [{ id: 'link-state01', from: 'web-form', to: 'removed-part', label: 'Broken link', createdAt: AT }]
  const response = (status: Status) => ({ respondsTo: 'feedback-state01', status, text: `The agent ${status} it.`, changed: [] as string[] })
  const answers = [
    { id: id(2), response: response('answered') },
    { id: id(3), response: response('adopted') },
    { id: id(4), response: response('declined') },
  ]
  const sent = { feedbackId: 'feedback-state01', baseRevision: board.revision, at: AT, items: [1, 2, 3, 4].map((i) => ({ id: id(i), fingerprint: fingerprintValue(notes[i]) })) }
  const layer = { format: 'anatomy-layer', schemaVersion: 2, boardId: board.id, positions: {}, sizes: {}, notes, links, marks: [], proposals: [], reconnects: [], archive: [], answers, sent }
  return { board, text, layer }
}

/** Puts the board and its layer in the stand-in repository folder, before the page loads. */
export async function seedFolder(page: Page, text: string, layer: unknown) {
  await page.addInitScript(
    ([key, boardText, layerText]) => {
      if (localStorage.getItem(key) === null)
        localStorage.setItem(key, JSON.stringify({ name: 'states', files: { 'board.json': { text: boardText, lastModified: 1 }, 'layer.json': { text: layerText, lastModified: 1 } }, remembered: false }))
    },
    [KEY, text, JSON.stringify(layer)] as const,
  )
}
