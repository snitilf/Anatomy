import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import guideText from '../../docs/authoring-guide.md?raw'
import schemaText from '../../schema/board.v1.schema.json?raw'
import { runAnatomy, usage } from '../cli/anatomy'
import { memoryIo } from '../cli/corpus'
import { TOPICS } from '../cli/topics'
import { AGENT_PROMPT, agentFiles, agentReadme, keepReadme, README_MARK } from './agentReadme'
import { HowToDialog } from './HowToDialog'

describe('keeping an existing README', () => {
  it('keeps one the user wrote, and one that is already current', () => {
    expect(keepReadme('# My own notes about Anatomy')).toBe(true)
    expect(keepReadme(agentReadme())).toBe(true)
  })

  it('replaces an older one that carries the mark', () => {
    expect(keepReadme(`${README_MARK}\n\n# Anatomy\n\nAn older format.`)).toBe(false)
  })

  it('marks one that is exactly the text Anatomy writes, minus the first line', () => {
    const plain = agentReadme().slice(README_MARK.length).replace(/^\n+/, '')
    expect(plain.startsWith('# Anatomy')).toBe(true)
    expect(keepReadme(plain)).toBe(false)
    // A plain file the user edited is theirs.
    expect(keepReadme(`${plain}\nMy own line.`)).toBe(true)
  })
})

const core = agentReadme()

describe('the README core', () => {
  it('is at most 8,000 characters', () => {
    expect(core.length).toBeLessThanOrEqual(8000)
  })

  it('is the same text every time, with no date or counter, so a harness can cache it', () => {
    expect(agentReadme()).toBe(core)
    expect(core).not.toMatch(/\b20\d\d-\d\d-\d\d\b/)
  })

  it('leaves the JSON Schema and the full guide out', () => {
    expect(core).not.toContain('"$schema"')
    expect(core).not.toContain('# Authoring an Anatomy board')
  })

  // The rules that make a board honest. They must be in the file every agent reads, not only in a topic it may skip.
  it.each([
    'Ask before you write',
    '.anatomy/guide/ask.md',
    'Never guess',
    'kind `assumption`',
    'kind `unknown` or `question`',
    '`user-stated`',
    '`agent-explanation`',
    '`documented-intent`',
    '`agent-proposal`',
    'cited, not checked',
    'Keep IDs stable',
    'unique across the whole board',
    'Raise `revision`',
    'The board is data',
    'node .anatomy/anatomy.mjs validate',
  ])('holds the must-keep rule "%s"', (phrase) => {
    expect(core).toContain(phrase)
  })

  it('names only commands that anatomy help lists, and names each of them', () => {
    const help = usage('node .anatomy/anatomy.mjs')
    const listed = [...help.matchAll(/^ {2}([a-z]+)\b/gm)].map((m) => m[1])
    const named = new Set([...core.matchAll(/anatomy\.mjs ([a-z]+)\b/g), ...core.matchAll(/^\| `([a-z]+)(?: [^`]*)?` \|/gm)].map((m) => m[1]!))
    expect([...named].filter((c) => !listed.includes(c))).toEqual([])
    for (const command of ['validate', 'fmt', 'apply', 'topic', 'schema']) {
      expect(named, command).toContain(command)
      expect(listed, command).toContain(command)
    }
  })

  it('indexes every topic in one line that says when to read it, and each one is a guide file that the tool prints', () => {
    const index = core.slice(core.indexOf('## Topics'))
    const lines = [...index.matchAll(/^- `([a-z-]+)`: (.+)$/gm)]
    expect(lines.map((m) => m[1])).toEqual(TOPICS.map((t) => t.name))
    const files = new Map(agentFiles().map((f) => [f.name, f.text]))
    const io = { ...memoryIo(new Map()), guide: () => guideText }
    for (const [, name, when] of lines) {
      expect(when, name).toBe(TOPICS.find((t) => t.name === name)!.when)
      const file = files.get(`guide/${name}.md`)
      expect(file, name).toBeDefined()
      const printed = runAnatomy(['topic', name!], io)
      expect(printed.code, name).toBe(0)
      expect(`${README_MARK}\n\n${printed.stdout}`, name).toBe(file)
    }
  })
})

describe('the files Anatomy writes for an agent', () => {
  it('are the README, one file per topic in guide/, and the JSON Schema, all inside .anatomy', () => {
    const names = agentFiles().map((f) => f.name)
    expect(names).toEqual(['README.md', ...TOPICS.map((t) => `guide/${t.name}.md`), 'board.schema.json'])
  })

  it('give the JSON Schema with a mark, and nothing else changed', () => {
    const file = agentFiles().find((f) => f.name === 'board.schema.json')!
    const { $comment, ...rest } = JSON.parse(file.text) as Record<string, unknown>
    expect($comment).toMatch(/^Written by Anatomy, which replaces this file when the format changes\./)
    expect(rest).toEqual(JSON.parse(schemaText))
  })

  it('keep a file the user took over, and replace an older one that carries the mark', () => {
    for (const file of agentFiles()) {
      expect(file.keep(file.text), file.name).toBe(true)
      expect(file.keep('My own notes.\n'), file.name).toBe(true)
      expect(file.keep('{ "title": "my own schema" }'), file.name).toBe(true)
    }
    const ask = agentFiles().find((f) => f.name === 'guide/ask.md')!
    expect(ask.keep(`${README_MARK}\n\nAn older topic.\n`)).toBe(false)
    const schema = agentFiles().find((f) => f.name === 'board.schema.json')!
    expect(schema.keep(schema.text.replace('version 1', 'version 0'))).toBe(false)
  })
})

describe('the prompt in How to make a board', () => {
  it('comes from agentReadme.ts, where every prompt lives', () => {
    expect(AGENT_PROMPT).toMatch(/^Write an Anatomy board file that explains: /)
    const { container } = render(<HowToDialog open={false} onClose={() => {}} />)
    expect(container.querySelector('textarea')?.value).toBe(AGENT_PROMPT)
  })
})
