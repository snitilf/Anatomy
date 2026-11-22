import guideText from '../../docs/authoring-guide.md?raw'
import schemaText from '../../schema/board.v1.schema.json?raw'

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

const FEEDBACK_EXAMPLE = `{
  "format": "anatomy-feedback",
  "schemaVersion": 1,
  "id": "feedback-k2m9x0q4z7ab",
  "boardId": "checkout",
  "baseRevision": 3,
  "createdAt": "2026-11-14T10:02:00.000Z",
  "items": [
    {
      "id": "note-a1b2c3d4e5f6",
      "type": "question",
      "text": "What happens when the payment call times out?",
      "about": { "type": "component", "id": "payment", "label": "Payment" },
      "snapshot": { "type": "component", "label": "Payment", "summary": "Charges the card." }
    },
    {
      "id": "edit-0p9o8i7u6y5t",
      "type": "reconnect",
      "connection": { "id": "api-to-payment", "label": "charges", "kind": "calls" },
      "was": { "from": { "type": "component", "id": "api", "label": "API" }, "to": { "type": "component", "id": "payment", "label": "Payment" } },
      "now": { "from": { "type": "component", "id": "api", "label": "API" }, "to": { "type": "component", "id": "queue", "label": "Queue" } }
    }
  ],
  "withdrawn": []
}`

const PATCH_EXAMPLE = `[
  { "op": "replace", "path": "/components/payment/summary", "value": "Charges the card and retries twice.", "for": "note-a1b2c3d4e5f6" },
  { "op": "respond", "for": "note-a1b2c3d4e5f6", "status": "answered", "text": "It retries twice." }
]`

const RESPONSES_EXAMPLE = `"responses": {
  "respondsTo": "feedback-k2m9x0q4z7ab",
  "items": [
    { "feedbackId": "note-a1b2c3d4e5f6", "status": "answered", "text": "It retries three times, then shows an error.", "changed": [] },
    { "feedbackId": "edit-0p9o8i7u6y5t", "status": "adopted", "text": "The API now hands charges to the queue.", "changed": ["api-to-payment"] }
  ]
}`

/**
 * `.anatomy/README.md`: what the files in `.anatomy/` are, how feedback goes back and forth, the authoring guide, and the
 * JSON Schema, so an agent in the repository has everything at hand.
 */
export function agentReadme(): string {
  return `${README_MARK}

# Anatomy

Anatomy shows \`.anatomy/board.json\` as a map that the user can explore and mark up.
The user sends their marks to you in \`.anatomy/feedback.json\`, and you answer them in the next revision of the board.

## The files

| File | Written by | What it holds |
| --- | --- | --- |
| \`board.json\` | You | The board: parts, connections, open items, walkthroughs, and your answers to feedback. |
| \`layer.json\` | Anatomy | The user's own layer: positions, notes, drawings, and proposed changes. Do not edit it. |
| \`feedback.json\` | Anatomy, when the user sends | What the user wants you to answer. Do not edit it. |
| \`README.md\` | Anatomy | This file. |
| \`anatomy.mjs\` | Anatomy | A script that checks and edits \`board.json\`. Run it, do not read it. |

Commit \`board.json\` with the code it explains.
Add \`.anatomy/layer.json\`, \`.anatomy/feedback.json\`, \`.anatomy/anatomy.mjs\`, \`.anatomy/patch.json\`, and \`.anatomy/board.prev.json\` to \`.gitignore\`: the first two are the user's working state, and Anatomy writes the script again.

## Check the board

Before you hand over \`board.json\`, run \`node .anatomy/anatomy.mjs validate\`.
It runs the same checks as Anatomy and prints one line per problem, with its path and often a fix.
Exit code 0 means valid, 1 means problems, and 2 means a file could not be read.
Fix the errors and run it again, because some checks wait for the earlier ones.
Warnings do not stop the board from opening, but read them.
\`node .anatomy/anatomy.mjs fmt\` also orders the keys and indents the file, so you can write compact JSON.
The script needs Node.js 24 or later, and running it is optional.
Without it, use the checklist in section 8.

## Revise with a patch

Once a board exists, write the edits to \`.anatomy/patch.json\` and run \`node .anatomy/anatomy.mjs apply\` instead of writing the board again.
A patch is a JSON array of \`test\`, \`add\`, \`remove\`, \`replace\`, and \`respond\` operations.
Paths name list items by ID: \`/components/payment/summary\`, \`/relationships\` to add one, \`/relationships/api-to-queue\` to remove one.
Lists without IDs (\`inputs\`, \`steps\`) are replaced whole, and \`add\` takes an optional \`before\` ID.
\`for\` ties an edit to a feedback item, and \`respond\` answers it: the script writes \`responses\` and \`changed\`.
It raises \`revision\`, validates, and writes only a valid board, keeping the old one as \`board.prev.json\`.

\`\`\`json
${PATCH_EXAMPLE}
\`\`\`

\`--base N\` (the revision you read) stops a stale patch, \`--dry-run\` writes nothing, and \`--cascade\` drops what refers to a removed part.
For a first board or a big restructure, write the file and run \`validate\`.

## Answering feedback

1. Read \`feedback.json\`. Each item has an \`id\` and a \`type\`.
2. Decide what to do with each item.
3. Run \`apply\` with the edits and one \`respond\` per item, or write the revision yourself: raise \`revision\` and add a \`responses\` block that answers every item.
4. Run \`node .anatomy/anatomy.mjs validate\`. It also checks that every item has an answer.

Anatomy notices the new revision on its own.
It shows each answer next to the user's mark, and removes a mark from the map once you adopted it and the IDs you list in \`changed\` are on the board.

### The feedback file

\`\`\`json
${FEEDBACK_EXAMPLE}
\`\`\`

Every mark is described by what it means on the board, never in pixels.
A part is \`{ "type": "component" }\` for one of yours, or \`{ "type": "new-part" }\` for one the user proposed.
\`missing\` means the user pointed at something that is no longer on the board.

| \`type\` | What the user did | Fields |
| --- | --- | --- |
| \`note\`, \`question\` | Wrote a note or asked a question about the board, a part, or a connection. | \`text\`, \`about\`, \`snapshot\` (the target as the user saw it), and \`status\` when the target changed or left after they wrote it. |
| \`link\` | Drew a connection you do not have. | \`from\`, \`to\`, \`label\`. |
| \`reconnect\` | Moved one or both ends of one of your connections. | \`connection\`, \`was\` and \`now\` ends. |
| \`new-part\` | Proposed a part. | \`label\`, \`summary\`, its \`links\`, and the parts it sits \`near\`. |
| \`drawing\`, \`shape\` | Drew around or across parts and connections. | \`note\`, what it \`encloses\`, what it \`touches\`. |
| \`arrow\` | Drew an arrow. | \`note\`, \`from\`, \`to\`. On a connection, \`at\` says where along it, from 0 at its start to 1 at its end. |
| \`text\`, \`sticky\` | Wrote text on the map. | \`text\`, \`note\`, the parts it is \`on\`. |

\`withdrawn\` lists items the user deleted after an earlier send. Do not answer them.

### The responses block

\`\`\`json
${RESPONSES_EXAMPLE}
\`\`\`

| Field | Meaning |
| --- | --- |
| \`respondsTo\` | The \`id\` of the feedback file. |
| \`feedbackId\` | The \`id\` of one item in it. |
| \`status\` | \`adopted\`: the change is on the board now. \`declined\`: you did not make it, and \`text\` says why. \`answered\`: a question or note, answered in \`text\`. |
| \`text\` | The answer, at most 600 characters. |
| \`changed\` | The IDs of the components and relationships you added or changed for this item. |

### Rules

- Keep every ID stable. A user's notes stay attached by ID.
- To adopt a \`reconnect\`, change \`from\` or \`to\` of the same relationship and keep its ID. List that ID in \`changed\`.
- To adopt a \`link\` or a \`new-part\`, add the relationship or component, and list the new IDs in \`changed\`.
- Raise \`revision\` every time you write the board.
- Answer every item. An item comes again when the user changed it, or when no answer to it arrived.
- Do not edit \`layer.json\` or \`feedback.json\`.

${guideText.trimEnd()}

## The JSON Schema

Write the board to \`.anatomy/board.json\`. It must validate against this schema.

\`\`\`json
${schemaText.trimEnd()}
\`\`\`
`
}

/** The README without its first line, as the Copy prompt button wrote it before the line existed. */
function unmarked(): string {
  return agentReadme().slice(README_MARK.length).replace(/^\n+/, '')
}

/**
 * True when an existing README must stay as it is: the user wrote it, or it is already current.
 * A README that is exactly Anatomy's text without the first line was written by Anatomy, so it gets the line and is kept current from then on.
 */
export function keepReadme(existing: string): boolean {
  if (existing === agentReadme()) return true
  return !existing.startsWith(README_MARK) && existing !== unmarked()
}
