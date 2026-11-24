import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { commandById } from '../commands/list'
import { EXAMPLE_OUTLINES } from './exampleOutlines.generated'
import { EXAMPLES } from './examples'
import { unpackOutline } from './outline'

interface OutlineRect {
  x: number
  y: number
  w: number
  h: number
}

interface ExpectedOutline {
  width: number
  height: number
  groups: readonly OutlineRect[]
  cards: readonly OutlineRect[]
  lines: readonly string[]
  parts: number
  connections: number
  walkthroughs: number
}

const root = process.cwd()
const outlineOf = (example: { fileName: string }) => unpackOutline(EXAMPLE_OUTLINES[example.fileName]) as ExpectedOutline | undefined
const boards = import.meta.glob('../examples/*.board.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const byFile = new Map(Object.entries(boards).map(([path, text]) => [path.split('/').pop()!, JSON.parse(text) as { components: unknown[]; relationships: unknown[]; groups?: unknown[]; scenarios?: unknown[] }]))

describe('example outlines', () => {
  it('ships a generator script and a generated outline module that stays in sync with the example boards', () => {
    const script = join(root, 'scripts/generate-outlines.ts')
    const generated = join(root, 'src/app/exampleOutlines.generated.ts')
    expect(existsSync(script), 'scripts/generate-outlines.ts exists').toBe(true)
    expect(existsSync(generated), 'src/app/exampleOutlines.generated.ts exists').toBe(true)

    const fresh = execFileSync(process.execPath, [script, '--stdout'], { cwd: root, encoding: 'utf8' })
    const onDisk = readFileSync(generated, 'utf8')
    expect(onDisk).toBe(fresh)
  })

  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s has a precomputed outline matching its real board', (_id, example) => {
    const board = byFile.get(example.fileName)
    expect(board).toBeDefined()
    const outline = outlineOf(example)
    expect(outline, `${example.id} has an outline`).toBeDefined()
    expect(outline!.width).toBeGreaterThan(0)
    expect(outline!.height).toBeGreaterThan(0)
    expect(outline!.parts).toBe(board!.components.length)
    expect(outline!.connections).toBe(board!.relationships.length)
    expect(outline!.walkthroughs).toBe((board!.scenarios ?? []).length)
    expect(outline!.cards).toHaveLength(board!.components.length)
    expect(outline!.lines).toHaveLength(board!.relationships.length)
    expect(outline!.groups).toHaveLength((board!.groups ?? []).length)
    for (const card of outline!.cards) {
      expect(card.x).toBeGreaterThanOrEqual(0)
      expect(card.y).toBeGreaterThanOrEqual(0)
      expect(card.x + card.w).toBeLessThanOrEqual(outline!.width)
      expect(card.y + card.h).toBeLessThanOrEqual(outline!.height)
    }
    for (const line of outline!.lines) {
      expect(line.startsWith('M')).toBe(true)
    }
  })
})

describe('the empty screen', () => {
  it('draws a live SVG map preview for every example matching its outline', async () => {
    render(<App />)
    const main = within(screen.getByRole('main'))
    for (const example of EXAMPLES) {
      const outline = outlineOf(example)
      expect(outline, `${example.id} has an outline`).toBeDefined()
      const preview = main.getByTestId(`example-preview-${example.id}`)
      // The outlines load on a script of their own, right after the screen first paints.
      await waitFor(() => expect(preview.querySelector('svg'), `${example.id} renders an SVG preview`).not.toBeNull())
      const svg = preview.querySelector('svg')
      expect(svg!.querySelectorAll('[data-outline-card]')).toHaveLength(outline!.cards.length)
      expect(svg!.querySelectorAll('[data-outline-line]')).toHaveLength(outline!.lines.length)
      expect(svg!.querySelectorAll('[data-outline-group]')).toHaveLength(outline!.groups.length)
    }
  })

  it('shows three short steps explaining how it works with your own agent', () => {
    render(<App />)
    const main = within(screen.getByRole('main'))
    const steps = main.getByTestId('start-steps')
    const items = within(steps).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    for (const item of items) {
      expect(item.textContent?.trim().length ?? 0).toBeGreaterThan(10)
    }
  })
})

describe('the start steps and folder support', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const stepTexts = () => {
    render(<App />)
    const steps = within(screen.getByRole('main')).getByTestId('start-steps')
    return within(steps)
      .getAllByRole('listitem')
      .map((item) => item.textContent?.replace(/^\d+/, '').trim() ?? '')
  }

  it('without folder access, never tells the user to pick a folder', () => {
    vi.stubGlobal('showDirectoryPicker', undefined)
    const steps = stepTexts()
    expect(steps).toHaveLength(3)
    for (const step of steps) expect(step).not.toMatch(/folder/i)
    expect(steps[2]).toMatch(/open that file/i)
  })

  it('with folder access, the last step opens the project folder', () => {
    vi.stubGlobal('showDirectoryPicker', async () => ({}))
    const steps = stepTexts()
    expect(steps).toHaveLength(3)
    expect(steps[2]).toMatch(/open the project folder/i)
  })

  it.each([
    ['without', undefined],
    ['with', async () => ({})],
  ])('%s folder access, says where the prompt comes from', (_name, picker) => {
    vi.stubGlobal('showDirectoryPicker', picker)
    const steps = stepTexts()
    expect(steps[0]).toMatch(/copy the prompt/i)
    expect(steps[0]).toContain(commandById('howto').label)
    expect(steps[0]).toContain('Settings')
  })

  it('names each example card by its title and describes it separately', () => {
    render(<App />)
    const main = within(screen.getByRole('main'))
    for (const example of EXAMPLES) {
      const card = main.getByRole('button', { name: example.title })
      expect(card).toHaveAccessibleName(example.title)
      expect(card).toHaveAccessibleDescription(new RegExp(example.description.slice(0, 20)))
      expect(card.querySelector('div')).toBeNull()
    }
  })
})
