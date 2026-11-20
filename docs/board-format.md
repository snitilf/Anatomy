# Board format, version 1

A board is a JSON file that explains a plan, feature, or project.
It describes parts, connections, open questions, and scenarios.
An agent or a person writes the file, and Anatomy opens it.
The file is data only.
Anatomy never runs, fetches, or evaluates anything in it.
Anatomy shows file paths as text.

The machine-readable definition is [`schema/board.v1.schema.json`](../schema/board.v1.schema.json).
Two complete examples are in [`src/examples/`](../src/examples/).

## Top level

| Field | Required | Meaning |
| --- | --- | --- |
| `format` | yes | Always `"anatomy-board"`. |
| `schemaVersion` | yes | Always `1`. |
| `id` | yes | A stable ID for the board. Keep it the same across revisions. |
| `revision` | yes | A whole number, 1 or higher. Increase it when the content changes. |
| `title` | yes | A short title. |
| `goal` | yes | What the reader must understand after reading the board. |
| `scope` | yes | `includes` and `excludes`: lists of short statements about what the board covers. |
| `groups` | no | Named areas on the map, such as Frontend or Backend. One level only. |
| `components` | yes | The parts of the system. At least 1, at most 60. |
| `relationships` | no | Connections between two components. |
| `items` | no | Assumptions, unknowns, and open questions. |
| `scenarios` | no | Step-by-step walkthroughs of a journey. |
| `responses` | no | Answers to the user's feedback. See [Responses](#responses). |

## IDs

An ID uses lowercase letters, digits, and single hyphens, for example `rule-check`.
Every ID must be unique across the whole board, and not only within its list.
Keep IDs stable across revisions.
Then the notes and the card positions of the user stay attached to the same part.

## Groups

A group has an `id` and a short `label`.
It can also have a `description`.
A component joins a group when its `group` field holds the ID of that group.

## Components

A component has an `id`, a short `label`, a `summary` of one or two sentences, and a `source`.
It can also have these fields:

- `explanation`
- `group`
- `inputs` and `outputs`, which are lists
- `position`, a starting position (`x`, `y`)
- `lesson`

A `lesson` is the ID of a built-in interactive lesson, for example `approval-gate`.
If Anatomy does not have that lesson, it opens the board and shows a warning.

## Relationships

A relationship connects two components.
The fields `from` and `to` must be component IDs.
Its `kind` is one of these values:

| Kind | Use it when |
| --- | --- |
| `calls` | One part asks another part to do something and waits for an answer. |
| `sends-data-to` | One part passes data to another part. |
| `stores-in` | One part saves data in another part. |
| `reads-from` | One part reads saved data from another part. |
| `depends-on` | One part needs another part to exist or to work. |
| `triggers` | One part starts something in another part. |
| `unknown` | The connection exists, but its meaning is not clear. |

The `label` says in a few words what passes along the connection, for example "approved action version".
A relationship can also have an `explanation`.

## Sources

Every component and relationship has a `source`.
The `kind` of a source says where the claim comes from:

| Kind | Meaning |
| --- | --- |
| `agent-explanation` | An agent describes something as it understands it. |
| `agent-proposal` | An agent suggests a design that nobody decided yet. |
| `documented-intent` | A written plan or spec says this. Needs at least one reference. |
| `user-stated` | The user told the agent this. |

A reference has a `label` and an optional `path` and `note`.
Anatomy shows a path as cited, and does not show it as verified.
Version 1 has no source kind for facts derived from code or observed at runtime.

## Items

An item has a `kind` and a `text`.
The `kind` is `assumption`, `unknown`, or `question`.
If the item has an `about` field, the item belongs to that component or relationship.
If the item has no `about` field, it belongs to the whole board.

## Scenarios

A scenario has an `id`, a `title`, and a list of `steps`.
It can also have a `summary`.
Each step has a `caption` and a `highlight` list of component and relationship IDs.
A scenario is a teaching sequence.
Playing it does not run anything.

## Responses

When the user sends feedback from Anatomy, the agent writes the next revision.
The agent answers each feedback item in `responses`.
Boards without `responses` stay valid.

```json
"responses": {
  "respondsTo": "feedback-k2m9x0q4z7ab",
  "items": [
    { "feedbackId": "note-a1b2c3d4e5f6", "status": "answered", "text": "The retry runs at most three times.", "changed": [] },
    { "feedbackId": "edit-0p9o8i7u6y5t", "status": "adopted", "text": "Moved the call to the queue.", "changed": ["api-to-queue"] }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `respondsTo` | The `id` of the feedback file this revision answers. |
| `feedbackId` | The `id` of one item in that feedback file. |
| `status` | `adopted` (the change is now on the board), `declined` (the agent did not make the change, and `text` says why), or `answered` (a question or note, answered in `text`). |
| `text` | The answer, 1 to 600 characters. |
| `changed` | IDs of the components and relationships this revision added or changed for the item. Up to 20. |

An ID in `changed` that is not on the board gives a warning and not an error.

Anatomy treats each answer in one of three ways:

- `adopted`, with every ID in `changed` on the board: the item moves to an archive.
  The map shows the version of the agent, and the user can restore the item.
- `adopted` with an empty `changed`, or with an ID that is missing: the item stays on the map with the answer next to it.
- `declined` and `answered`: the item stays with the answer next to it until the user dismisses it.

To adopt a moved connection, change `from` or `to` of the same relationship and keep its ID.
To adopt a link or a new part, add the relationship or component and list its new ID in `changed`.
Anatomy sends an item with no answer again with the next feedback of the user.

### The feedback file

Anatomy writes `.anatomy/feedback.json` when the user sends.
Its format is `anatomy-feedback`, version 1.
The file has these fields:

- `id`
- `boardId`
- `baseRevision`, which is the revision that the user marked
- `createdAt`
- `items`
- `withdrawn`, which lists items that the user deleted after an earlier send

Every item has an `id` and a `type`.
An item describes what the user meant in board terms and never in pixels.

| `type` | Fields |
| --- | --- |
| `note`, `question` | `text`, `about` (the board, a part, or a connection), `snapshot` (the target as the user saw it), and `status` when the target changed or left after the user wrote the note. |
| `link` | `from`, `to`, `label`: a connection the user drew. |
| `reconnect` | `connection`, and its `was` and `now` ends: the user moved one or both ends. |
| `new-part` | `label`, `summary`, its `links`, and the parts it sits `near`. |
| `drawing`, `shape` | `note`, what it `encloses`, and what it `touches`. |
| `arrow` | `note`, `from`, `to`. An end on a connection has `at`: where along it, from 0 at its start to 1 at its end. |
| `text`, `sticky` | `text`, `note`, and the parts it is `on`. |

A part is `{ "type": "component" }` for one of the components of the board.
A part is `{ "type": "new-part" }` for one that the user proposed.
The word `missing` names something that is no longer on the board.

## Text

The `explanation` fields accept a small Markdown subset: paragraphs, lists, bold, italics, and inline code.
Anatomy shows anything else, including HTML and links, as plain text.

## Limits

| Limit | Value |
| --- | --- |
| File size | 1,000,000 bytes |
| Components | 1 to 60 |
| Relationships | 200 |
| Groups | 12 |
| Items | 100 |
| Scenarios | 20 |
| Response items | 300 |
| Steps in a scenario | 1 to 50 |
| Highlights in a step | 30 |
| References in a source | 10 |
| Entries in `inputs`, `outputs`, `includes`, `excludes` | 20 |
| ID | 64 characters |
| `title` (board or scenario) | 120 characters |
| `label` | 60 characters |
| `summary`, `description`, reference `note`, list entries | 280 characters |
| `goal`, item `text`, step `caption`, reference `path` | 600 characters |
| `explanation` | 4000 characters |
| `revision` | a whole number from 1 to 9007199254740991 |
| Coordinates | -100000 to 100000 |

A text field must not be empty and must not contain only spaces.

## What Anatomy validates

Anatomy rejects a file and keeps the current board open if the file has one of these problems:

1. The file is not JSON, is larger than 1,000,000 bytes, or is not an Anatomy board.
2. The schema version is not 1.
3. A field is missing, misspelled, too long, or has the wrong type.
4. An ID is badly formed or is used twice.
5. A relationship, item, group membership, or scenario step points at something that does not exist.

The error list names the location of each problem, for example `relationships[2].to`.

The JSON Schema file validates the shape and the limits only.
It cannot validate unique IDs or references.
For this reason, Anatomy can reject a file that passes the JSON Schema.

## Check a board outside the app

Anatomy writes `.anatomy/anatomy.mjs` next to `.anatomy/README.md`.
It is the `anatomy` tool, bundled in one file from the same code that the app uses to open a board.
It needs Node.js 24 or later, and nothing to install.
In this repository, `npm run anatomy -- <command>` runs the same tool from the source.

| Command | What it does |
| --- | --- |
| `node .anatomy/anatomy.mjs validate [file]` | Checks the board the way Anatomy does. The file is `.anatomy/board.json` unless you name one. |
| `node .anatomy/anatomy.mjs fmt [file]` | Validates the board and, when it is valid, puts the keys in schema order and indents with two spaces. It writes only when the text changes. |
| `node .anatomy/anatomy.mjs help` | Shows the commands. |

`--json` prints the result as one JSON object, and `--strict` makes warnings count as problems.
The exit code is 0 when the board is valid, 1 when it has problems, and 2 when the file cannot be read or the command is wrong.

The output has one line for the file, then one line per problem:

```text
.anatomy/board.json: invalid, 2 errors
components[0]: Unrecognized key: "summery". Did you mean "summary"?
relationships[2].to: Relationship "api-to-payment" points to "paymnt", which is not a component on this board. Did you mean "payment"?
```

Each problem has the same path and message as in the app.
Many also have a hint: the nearest ID or value, a free ID, a valid ID, or the length of a text that is too long.
The checks run in steps, as in the app: the file, then the fields, then the references.
So fix the errors and run the tool again.

A valid board can still get warnings.
They do not stop the board from opening:

- A lesson that this version of Anatomy does not have.
- An ID in `changed` that is not on the board.
- A component with no connection.
- A phrase that promises what no explanation can know, such as "never fails", "foolproof", or "100% secure", in a claim.
  Words that honest text uses, such as "always" or "guarantees", are left alone.
- An adopted answer with an empty `changed` list, which keeps the user's mark on the map.
- When `feedback.json` is next to the board and is for the same board: a revision that should answer it but does not, an item with no answer, an answer to an unknown or withdrawn item, and a revision that is not higher than the feedback's `baseRevision`.

With `--json`, each problem has a `code` that stays the same when a message changes, for example `unknown-component`, `duplicate-id`, or `unanswered-feedback`.
The full list is the `ProblemCode` type in `src/board/validate.ts`.

The tool lists at most 25 errors and 25 warnings.
The text output ends with a line that counts the rest, and `--json` gives the counts as `omittedErrors` and `omittedWarnings`.
The feedback warnings come first, so the limit never hides them.
Hints are worked out only for the problems that are listed, so a huge file stays fast.

In the text output and in `--json`, a quoted value longer than 80 characters is cut and ends with its length, for example `"xxxx…" (900,000 characters)`.
A message or line longer than 1,000 characters is cut too.
So a huge key or ID cannot flood the output.
Characters here are Unicode code points, so a cut never splits an emoji.

The tool reads only the board and the `feedback.json` next to it, and only when each is a regular file of at most 16,000,000 bytes.
It writes only the board, and only for `fmt`.
`fmt` writes a new file next to the board and renames it over the board, so the board keeps its permissions and is never half written.
It leaves a read-only board alone.
When the board file itself is a link, `fmt` writes the file the link points to, if that file is in the board's folder or below it, and keeps the link.
It refuses a link to a file anywhere else.
Links among the folders of the path you name are followed, as for any path you name: the board's folder is the folder that path leads to.
It never runs anything from the board and makes no network calls.
