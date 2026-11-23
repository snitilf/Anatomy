import { describe, expect, it } from 'vitest'
import guide from '../../docs/authoring-guide.md?raw'
import { agentFiles, README_MARK } from '../app/agentReadme'
import { runAnatomy } from './anatomy'
import { memoryIo } from './corpus'
import { EXCLUDED_SECTIONS, splitGuide, TOPICS } from './topics'

// The topics an agent opens on demand come from docs/authoring-guide.md and nowhere else.
const io = () => ({ ...memoryIo(new Map()), guide: () => guide })

/** The `##` sections of the guide, with the number taken off the title. */
const sections = guide
  .split(/^(?=## )/m)
  .filter((part) => part.startsWith('## '))
  .map((text) => ({ title: text.slice(3, text.indexOf('\n')).replace(/^\d+\.\s+/, ''), text }))

describe('the topics', () => {
  it('put every section of the guide in exactly one topic, except the prompts for people', () => {
    const used = TOPICS.flatMap((t) => t.sections)
    expect(new Set(used).size).toBe(used.length)
    expect([...used, ...EXCLUDED_SECTIONS].sort()).toEqual(sections.map((s) => s.title).sort())
    expect(EXCLUDED_SECTIONS).toEqual(['Prompt to paste into your agent'])
  })

  it('are the sections of the guide, word for word, in the order the topic names them', () => {
    const split = splitGuide(guide)
    expect(split.map((t) => t.name)).toEqual(TOPICS.map((t) => t.name))
    for (const topic of TOPICS) {
      const expected = topic.sections
        .map((title) => sections.find((s) => s.title === title)!.text.replace(/^## \d+\.\s+/, '## ').trimEnd())
        .join('\n\n')
      expect(split.find((t) => t.name === topic.name)!.text, topic.name).toBe(`${expected}\n`)
    }
  })

  it('regenerate to the same files the app writes and the same text the tool prints', () => {
    const files = new Map(agentFiles().map((f) => [f.name, f.text]))
    for (const topic of splitGuide(guide)) {
      expect(files.get(`guide/${topic.name}.md`), topic.name).toBe(`${README_MARK}\n\n${topic.text}`)
      expect(runAnatomy(['topic', topic.name], io())).toEqual({ code: 0, stdout: topic.text, stderr: '' })
    }
  })

  it('leave the prompts for people out of every file an agent reads', () => {
    for (const file of agentFiles()) {
      expect(file.text, file.name).not.toContain('Prompt to paste into your agent')
      expect(file.text, file.name).not.toContain('<WHAT TO EXPLAIN>')
    }
  })

  it('stop the split when a section a topic names is missing', () => {
    expect(() => splitGuide(guide.replace('## 4. Honesty rules', '## 4. Honest rules'))).toThrow(/Honesty rules/)
  })

  it('stop the split when the guide has a section no topic names', () => {
    expect(() => splitGuide(`${guide}\n## 13. Something new\n\nText.\n`)).toThrow(/Something new/)
  })

  it('have plain names and say when to read them', () => {
    for (const topic of TOPICS) {
      expect(topic.name).toMatch(/^[a-z]+(?:-[a-z]+)*$/)
      expect(topic.when.length, topic.name).toBeGreaterThan(10)
      expect(topic.when.length, topic.name).toBeLessThanOrEqual(110)
    }
    expect(TOPICS.map((t) => t.name)).toContain('ask')
  })
})

describe('anatomy topic', () => {
  it('lists every topic with when to read it, when no name is given', () => {
    const result = runAnatomy(['topic'], io())
    expect(result.code).toBe(0)
    for (const topic of TOPICS) expect(result.stdout).toContain(`${topic.name}`)
    for (const topic of TOPICS) expect(result.stdout).toContain(topic.when)
  })

  it('suggests the nearest topic for a wrong name, and exits 2', () => {
    const result = runAnatomy(['topic', 'aks'], io())
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('Unknown topic "aks". Did you mean "ask"?')
  })

  it('takes at most one name and no options', () => {
    expect(runAnatomy(['topic', 'ask', 'honesty'], io()).code).toBe(2)
    expect(runAnatomy(['topic', 'ask', '--strict'], io()).code).toBe(2)
  })
})
