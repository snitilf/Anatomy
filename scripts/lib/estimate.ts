// Rough token estimates. They need no tokenizer and no network.
// The rule: about 4 characters per token for prose, about 3 for JSON.
// Real counts come from an agent's own usage report (see eval/README.md).

export type TextKind = 'prose' | 'json'

export const CHARS_PER_TOKEN: Record<TextKind, number> = { prose: 4, json: 3 }

export function estimateTokens(text: string, kind: TextKind): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN[kind])
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
