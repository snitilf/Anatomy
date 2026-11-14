import guideText from '../../docs/authoring-guide.md?raw'
import schemaText from '../../schema/board.v1.schema.json?raw'

/** The prompt that asks an agent for a first board in a repository. The user finishes the sentence. */
export const FIRST_BOARD_PROMPT = 'Read .anatomy/README.md, then write .anatomy/board.json that explains: '

/** `.anatomy/README.md`: the authoring guide and the JSON Schema, so an agent in the repository has the format at hand. */
export function agentReadme(): string {
  return `${guideText.trimEnd()}

## The JSON Schema

Write the board to \`.anatomy/board.json\`. It must validate against this schema.

\`\`\`json
${schemaText.trimEnd()}
\`\`\`
`
}
