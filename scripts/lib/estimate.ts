// Rough token estimates. They need no tokenizer and no network.
// The rule: about 4 characters per token for prose, about 3 for JSON.
// Real counts come from an agent's own usage report (see eval/README.md).

export type TextKind = 'prose' | 'json'

export const CHARS_PER_TOKEN: Record<TextKind, number> = { prose: 4, json: 3 }

export function estimateTokens(text: string, kind: TextKind): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN[kind])
}

/**
 * The README Anatomy writes is prose with the JSON Schema inside it.
 * The schema part counts as JSON and the rest counts as prose.
 */
export function estimateReadmeTokens(readme: string, schemaText: string): number {
  const schema = schemaText.trim()
  if (!readme.includes(schema)) return estimateTokens(readme, 'prose')
  const prose = readme.length - schema.length
  return Math.ceil(prose / CHARS_PER_TOKEN.prose + schema.length / CHARS_PER_TOKEN.json)
}

/** Splits the authoring guide at its numbered `##` headings. The text before the first one is the preface. */
export function guideSections(guide: string): { title: string; text: string }[] {
  const sections: { title: string; text: string }[] = []
  let title = 'Preface'
  let lines: string[] = []
  const flush = () => {
    const text = lines.join('\n')
    if (text.trim() !== '') sections.push({ title, text })
  }
  for (const line of guide.split('\n')) {
    if (line.startsWith('## ')) {
      flush()
      title = line.slice(3).trim()
      lines = [line]
    } else {
      lines.push(line)
    }
  }
  flush()
  return sections
}
