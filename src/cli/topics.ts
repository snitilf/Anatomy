// The topics of the authoring guide that an agent opens on demand. `docs/authoring-guide.md` is the one source: each
// topic is one or more of its `##` sections, taken word for word, with the section number dropped. The app writes each
// topic as `.anatomy/guide/<name>.md`, and `anatomy topic <name>` prints the same text.

export interface TopicSpec {
  name: string
  /** One line in the README index that says when to read the topic. */
  when: string
  /** The titles of the guide sections, without their numbers, in the order the topic gives them. */
  sections: readonly string[]
}

export interface Topic {
  name: string
  when: string
  text: string
}

export const TOPICS: readonly TopicSpec[] = [
  { name: 'ask', when: 'Before a first board. Read it first and follow it.', sections: ['Ask before you write', 'Before writing'] },
  { name: 'honesty', when: 'Before a first board: source kinds, planned parts, and claims.', sections: ['Honesty rules'] },
  { name: 'writing', when: 'Before a first board: parts, connections, groups, IDs, and text.', sections: ['What a board is for', 'Writing rules'] },
  { name: 'scenarios', when: 'When you write walkthroughs.', sections: ['Scenarios'] },
  { name: 'revise', when: 'When a board exists and you change it or answer feedback.', sections: ['Updating a board and answering feedback', 'Revise with a patch'] },
  { name: 'feedback-format', when: 'When you answer feedback: every item type and the responses block.', sections: ['The feedback file'] },
  { name: 'checklist', when: 'Before you hand over a board, and always when you cannot run the script.', sections: ['Checklist before you hand over the file'] },
  { name: 'example', when: 'When you want to see a whole valid board.', sections: ['Minimal valid example'] },
]

/** Guide sections that are for people, not for an agent. */
export const EXCLUDED_SECTIONS: readonly string[] = ['Prompt to paste into your agent']

/** The `##` sections of the guide by title, number dropped, each with its own heading, numbered as in the guide or not. The preface is left out. */
function sections(guide: string, numbered = false): Map<string, string> {
  const found = new Map<string, string>()
  for (const part of guide.replace(/\r\n/g, '\n').split(/^(?=## )/m)) {
    if (!part.startsWith('## ')) continue
    const heading = part.slice(0, part.indexOf('\n') === -1 ? part.length : part.indexOf('\n'))
    const title = heading.slice(3).replace(/^\d+\.\s+/, '').trim()
    found.set(title, (numbered ? part : part.replace(/^## \d+\.\s+/, '## ')).trimEnd())
  }
  return found
}

/**
 * Splits the guide into its topics. Throws when a section a topic names is missing, or when the guide has a section
 * that no topic names, so a renamed or new heading never drops text silently.
 */
export function splitGuide(guide: string): Topic[] {
  const all = sections(guide)
  for (const topic of TOPICS) {
    const missing = topic.sections.find((title) => !all.has(title))
    if (missing !== undefined) throw new Error(`The guide has no section "${missing}" for the topic "${topic.name}".`)
  }
  const used = new Set([...TOPICS.flatMap((t) => t.sections), ...EXCLUDED_SECTIONS])
  const stray = [...all.keys()].filter((title) => !used.has(title))
  if (stray.length > 0) throw new Error(`No topic takes the guide section "${stray.join('", "')}".`)
  return TOPICS.map((topic) => ({ name: topic.name, when: topic.when, text: `${topic.sections.map((title) => all.get(title)!).join('\n\n')}\n` }))
}

/**
 * The guide without the parts no topic uses: the preface and the sections for people. `splitGuide` gives the same
 * topics for it, so the bundled tool carries only this.
 */
export function agentGuide(guide: string): string {
  const keep = new Set(TOPICS.flatMap((t) => t.sections))
  return `${[...sections(guide, true)].filter(([title]) => keep.has(title)).map(([, text]) => text).join('\n\n')}\n`
}

/** The topic index, one line per topic, as the README and `anatomy topic` give it. */
export function topicIndex(): string {
  return TOPICS.map((t) => `- \`${t.name}\`: ${t.when}`).join('\n')
}
