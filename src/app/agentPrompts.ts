// The prompts that the screens show and copy. They live apart from `agentReadme.ts`, which carries the guide and the
// schema, so the first script does not weigh the text of the files that Anatomy writes into a repository.

/** The prompt that asks an agent for a first board in a repository. The user finishes the sentence. */
export const FIRST_BOARD_PROMPT = 'Read .anatomy/README.md, then write .anatomy/board.json that explains: '

/** The prompt that hands the user's feedback to the agent, when Anatomy wrote it into the repository. */
export const SEND_PROMPT = 'Read .anatomy/feedback.json and answer every item in the next revision of .anatomy/board.json. The format is in .anatomy/README.md.'

/** The prompt for a board opened as a file, whose feedback went to the browser's downloads. */
export function downloadedPrompt(title: string): string {
  return `Read feedback.json from my Downloads folder. Write the next revision of the Anatomy board "${title}": raise revision, set responses.respondsTo to the feedback id, and answer every item by its id as adopted, declined, or answered.`
}

/**
 * The prompt in How to make a board, for an agent that gets the guide and the schema as attached files, outside a
 * repository that Anatomy opened.
 */
export const AGENT_PROMPT = `Write an Anatomy board file that explains: [describe the plan, feature, or project here]

Follow the attached guide (authoring-guide.md) and JSON Schema (board.v1.schema.json).
Read only this material: [list the files or notes you allow].

Rules:
- Use 6 to 12 parts. Group them as Frontend, Backend, Infrastructure, or similar, one level only.
- Give every part and connection an honest source: user-stated for what I told you, agent-explanation for what you understood, agent-proposal for what you suggest, documented-intent only with a cited document.
- Never claim that you checked code or saw it running. Cited paths are shown as "cited, not checked".
- Before you write, ask me a few plain questions, with your recommended answer for each. Record what stays unknown as "unknown" or "question" items.
- Add 1 to 4 walkthroughs. Highlights name parts and connections only.
- Every ID is unique across the whole board, and every reference must point at something that exists.
- Write the board to .anatomy/board.json in this repository. If you cannot write files, return only the JSON.
- When you revise it later, raise revision and keep the IDs of everything that stays.`
