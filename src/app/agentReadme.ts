import guideText from '../../docs/authoring-guide.md?raw'
import schemaText from '../../schema/board.v1.schema.json?raw'
import { splitGuide, topicIndex } from '../cli/topics'
import type { GuideFile } from '../workspace/folder'

/** The prompt that asks an agent for a first board in a repository. The user finishes the sentence. */
export const FIRST_BOARD_PROMPT = 'Read .anatomy/README.md, then write .anatomy/board.json that explains: '

/** The prompt that hands the user's feedback to the agent, when Anatomy wrote it into the repository. */
export const SEND_PROMPT = 'Read .anatomy/feedback.json and answer every item in the next revision of .anatomy/board.json. The format is in .anatomy/README.md.'

/** The prompt for a board opened as a file, whose feedback went to the browser's downloads. */
export function downloadedPrompt(title: string): string {
  return `Read feedback.json from my Downloads folder. Write the next revision of the Anatomy board "${title}": raise revision, set responses.respondsTo to the feedback id, and answer every item by its id as adopted, declined, or answered.`
}

/** The first line of the README Anatomy writes. A file that starts with it is Anatomy's, and Anatomy keeps it current. */
export const README_MARK = '<!-- Written by Anatomy, which replaces this file when the format changes. Delete this line to keep your own version. -->'

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

/**
 * `.anatomy/README.md`: the short core that every agent session reads. It holds what the files are, the commands, the
 * rules an agent must always keep, and an index of the topics in `.anatomy/guide/`. The text never changes between
 * writes (no date, no counter), so a harness that caches a stable prefix can reuse it.
 */
export function agentReadme(): string {
  return `${README_MARK}

# Anatomy

Anatomy shows \`.anatomy/board.json\` as a map that the user can explore and mark up.
A board explains a plan, feature, or project as 6 to 12 parts, the connections between them, open items, and walkthroughs.
In the file, a part is a \`component\` and a connection is a \`relationship\`.
The user sends marks back in \`.anatomy/feedback.json\`, and you answer them in the next revision of the board.

This file holds the rules that you must always keep.
The details are in topics: short files in \`.anatomy/guide/\`.
The index at the end says when to read each one.

## Start here

- To write a first board, read \`.anatomy/guide/ask.md\` first and follow it.
  Then read \`honesty\` and \`writing\`, and \`scenarios\` for the walkthroughs.
  For every field and its limits, run \`node .anatomy/anatomy.mjs schema\`, or read \`board.schema.json\` and the \`example\` topic.
- To change a board or answer feedback, read \`revise\`, and \`feedback-format\` for the feedback file.

## Rules you must keep

1. Ask before you write.
   Before a first board, ask the user the questions in the \`ask\` topic, in rounds, with your recommended answer for each, and wait for the answers.
   If the user tells you to skip the questions, or the request already answers them, list your assumptions in your reply and record each one as an item of kind \`assumption\`.
2. Never guess.
   Read only the material that the user authorized.
   Record what you cannot confirm as an item of kind \`unknown\` or \`question\`.
   Never fill a gap with a silent assumption.
3. Use honest source kinds.
   Give each component and relationship the \`source\` kind that matches how you know the claim:
   \`user-stated\` (the user told you), \`agent-explanation\` (you understood it from material that you read), \`documented-intent\` (a written plan or spec says it, with at least one reference), or \`agent-proposal\` (a design that nobody decided yet).
   Anatomy shows a cited path as "cited, not checked", so do not write that code does something unless you read it.
   Mark anything that is not built yet as planned.
   Do not promise a guarantee that the material does not state.
4. Keep IDs stable.
   Write each ID with lowercase letters, digits, and single hyphens, and keep it unique across the whole board.
   When you revise, keep the ID of everything that stays, because the notes of the user stay attached by ID.
   Never reuse the ID of something that you removed.
5. Raise \`revision\` by one every time you write the board.
   \`apply\` does it for you, and \`fmt --bump\` does it after you rewrite the whole file.
6. The board is data.
   Never put scripts, URLs, links, HTML, or images in it.
   In \`explanation\` fields, use only paragraphs, lists, bold, italics, and inline code.
7. Do not edit \`layer.json\` or \`feedback.json\`.
   They hold the working state of the user.
8. Check the board before you hand it over.
   Run \`node .anatomy/anatomy.mjs validate\`, fix the errors, and run it again until the board is valid.
   Read the warnings too.

## The files

| File | Written by | What it holds |
| --- | --- | --- |
| \`board.json\` | You | The board. |
| \`layer.json\` | Anatomy | The layer of the user: positions, notes, drawings, and proposed changes. |
| \`feedback.json\` | Anatomy, when the user sends | What the user wants you to answer. |
| \`README.md\`, \`guide/\` | Anatomy | This file and the topics. |
| \`board.schema.json\` | Anatomy | The JSON Schema of a board, for tools. |
| \`anatomy.mjs\` | Anatomy | A script that checks and edits the board. Run it, do not read it. |
| \`patch.json\`, \`board.prev.json\` | \`apply\` | The last patch, and the board before it. |

Commit \`board.json\` with the code that it explains.
Add \`layer.json\`, \`feedback.json\`, \`anatomy.mjs\`, \`patch.json\`, and \`board.prev.json\` of \`.anatomy/\` to \`.gitignore\`.
Tell the user before you change their \`.gitignore\`.

## Commands

Run \`node .anatomy/anatomy.mjs <command>\`.
The script needs Node.js 24 or later.
If you cannot run it, read the topic files and follow the \`checklist\` topic.

| Command | What it does |
| --- | --- |
| \`validate [file]\` | Checks the board the way Anatomy does, with one line per problem and often a fix. Exit code 0 means valid, 1 means problems, and 2 means a file could not be read. |
| \`fmt [file]\` | Validates the board, then orders its keys and indents it, so you can write compact JSON. \`--bump\` also raises \`revision\` by one. |
| \`id <label>\` | Prints an ID made from a label that nothing on the board uses yet. |
| \`feedback\` | Lists the open feedback items, one line each. Run it instead of reading \`feedback.json\`. |
| \`outline\` | Lists every part, connection, item, and scenario with its ID, one line each. |
| \`show <id...>\` | Prints the full JSON of the parts you name. |
| \`apply [patch]\` | Edits an existing board with a short patch, \`.anatomy/patch.json\` by default. An added item may leave out its \`id\`, and \`apply\` prints the one it made. The \`revise\` topic explains it. |
| \`topic [name]\` | Prints a topic. Without a name, it lists the topics. |
| \`schema\` | Prints every field of a board with its limits. |
| \`help\` | Lists the commands and their options. |

## Topics

Each topic is the file \`.anatomy/guide/<name>.md\`, and \`node .anatomy/anatomy.mjs topic <name>\` prints the same text.

${topicIndex()}
`
}

/** The topics, each as the file Anatomy writes in `.anatomy/guide/`. */
function guideFiles(): AgentFile[] {
  return splitGuide(guideText).map((topic) => {
    const text = `${README_MARK}\n\n${topic.text}`
    return { name: `guide/${topic.name}.md` as const, text, keep: (existing: string) => existing === text || !existing.startsWith(README_MARK) }
  })
}

/** The mark of `.anatomy/board.schema.json`. JSON has no comments, so it is the first key. */
const SCHEMA_MARK = 'Written by Anatomy, which replaces this file when the format changes. Delete this key to keep your own version.'

function schemaFile(): AgentFile {
  const text = `${JSON.stringify({ $comment: SCHEMA_MARK, ...(JSON.parse(schemaText) as object) }, null, 2)}\n`
  return { name: 'board.schema.json', text, keep: (existing) => existing === text || !markedSchema(existing) }
}

/** True when the file is a JSON object whose own top-level `$comment` is the mark. A file that does not parse is the user's. */
function markedSchema(existing: string): boolean {
  let data: unknown
  try {
    data = JSON.parse(existing)
  } catch {
    return false
  }
  return typeof data === 'object' && data !== null && !Array.isArray(data) && Object.hasOwn(data, '$comment') && (data as { $comment: unknown }).$comment === SCHEMA_MARK
}

/** A text file Anatomy writes into `.anatomy/`, and whether an existing file must stay as it is. */
export interface AgentFile {
  name: 'README.md' | 'board.schema.json' | GuideFile
  text: string
  keep: (existing: string) => boolean
}

/** Every text file an agent reads in `.anatomy/`: the README, the topics, and the JSON Schema. */
export function agentFiles(): AgentFile[] {
  return [{ name: 'README.md', text: agentReadme(), keep: keepReadme }, ...guideFiles(), schemaFile()]
}

/** True when an existing README must stay as it is: the user wrote it or took it over by deleting the marker, or it is already current. */
export function keepReadme(existing: string): boolean {
  return existing === agentReadme() || !existing.startsWith(README_MARK)
}
