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
| `node .anatomy/anatomy.mjs apply [patch \| -]` | Edits the board with a list of operations. See [Revise a board with a patch](#revise-a-board-with-a-patch). |
| `node .anatomy/anatomy.mjs help` | Shows the commands. |

`--json` prints the result as one JSON object, and `--strict` makes warnings count as problems.
The exit code is 0 when the board is valid (or the patch was applied), 1 when it has problems (or the patch was not applied), and 2 when a file cannot be read or written or the command is wrong.

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
It writes only the board, for `fmt` and `apply`, and for `apply` also `board.prev.json` next to it.
`fmt` and `apply` write a new file next to the board and rename it over the board, so the board keeps its permissions and is never half written.
It leaves a read-only board alone.
When the board file itself is a link, they write the file the link points to, if that file is in the board's folder or below it, and keeps the link.
It refuses a link to a file anywhere else.
Links among the folders of the path you name are followed, as for any path you name: the board's folder is the folder that path leads to.
It never runs anything from the board and makes no network calls.

## Revise a board with a patch

`node .anatomy/anatomy.mjs apply [patch.json | -]` reads a JSON array of operations from a file or from stdin.
Without an argument it reads `patch.json` next to the board.
Use `--board <file>` to name another board.
A patch is data: nothing in it is run, and a patch of more than 500 operations or 1,000,000 bytes is refused.

```json
[
  { "op": "test", "path": "/revision", "value": 3 },
  { "op": "replace", "path": "/components/payment/summary", "value": "Charges the card and retries twice.", "for": "note-a1b2c3d4e5f6" },
  { "op": "add", "path": "/relationships", "value": { "id": "api-to-queue", "from": "api", "to": "queue", "kind": "sends-data-to", "label": "charge jobs", "source": { "kind": "agent-explanation" } }, "for": "edit-0p9o8i7u6y5t" },
  { "op": "remove", "path": "/relationships/api-to-payment" },
  { "op": "respond", "for": "note-a1b2c3d4e5f6", "status": "answered", "text": "It retries twice." }
]
```

### Paths

A path starts with `/`.
The lists `groups`, `components`, `relationships`, `items`, and `scenarios` hold items with an `id`, and a path names an item by that ID: `/components/payment`, `/components/payment/summary`.
A position is never a path part.
Every other list has no IDs (`inputs`, `outputs`, `scope.includes`, `steps`, `highlight`, `references`), so a patch can only replace such a list whole, for example `/scenarios/checkout/steps`.
`/` inside an ID would be written `~1`, and `~` as `~0`, as in JSON Pointer.
The parts `__proto__`, `constructor`, and `prototype` are refused anywhere in a path.

### Operations

| `op` | Path | What it does |
| --- | --- | --- |
| `test` | any | Stops the patch unless the value there equals `value`. |
| `add` | a list such as `/components` | Appends `value`, an item with a new `id`, or puts it before the item that `before` names. |
| `add` | a field such as `/components/payment/explanation` | Sets the field. |
| `replace` | an item, a field, or a whole list | Replaces what is there. The new item keeps its `id`. |
| `remove` | an item or a field | Removes it. A whole list cannot be removed this way. |
| `respond` | none; it takes `for`, `status`, and `text` | Answers one feedback item. |

Operations run in order, each on the result of the one before.
`format`, `schemaVersion`, `id`, `revision`, and `responses` cannot be edited, and no `id` ever changes, because the notes of the user stay attached by ID.

### Feedback

`for` on an edit names an item of `.anatomy/feedback.json`.
The components and relationships that edit touches go into `changed` of the answer to that item, and every `for` needs a `respond` for the same item, in the patch or from an earlier `apply` of the same feedback.
`respond` writes the `responses` block with `respondsTo` taken from `feedback.json`.
Answers to the same feedback that the board already has stay, and answers to older feedback are dropped when new feedback is answered.

### The revision and the result

`apply` raises `revision` by exactly one.
A `test` on `/revision`, or `--base N` with the revision you read, stops the patch when the board is at another revision.
The new board is checked with the same `parseBoard` as the app before anything is written, then written in the format of `fmt`, so a later `fmt` changes nothing.
The old board is kept first, byte for byte, as `board.prev.json` in the same folder (`<name>.prev.json` for a board with another name).
Anatomy reads only the files it knows in `.anatomy/`, so it ignores that file.
A board that does not validate can still be patched, so a patch can repair it, but the result must validate.
A patch that changes nothing is refused, so running the same patch twice changes the board once.

When a patch cannot be applied, nothing changes on disk.
The output lists each operation that cannot apply, then the problems of the patched board:

```text
.anatomy/board.json: not changed, 1 patch error, 1 board error
ops[1] not-found /components/paymnt/summary: There is no component with the ID "paymnt" in components. Did you mean "payment"?
relationships[2].to: Relationship "api-to-payment" points to "paymnt", which is not a component on this board. Did you mean "payment"?
```

With `--json`, each patch error has an `op` index, a `path`, a `code`, a `message`, and sometimes a `hint`.
The codes are the `OpCode` type in `src/cli/apply.ts`: `not-found`, `not-addressable`, `ambiguous-id`, `reserved-path`, `id-immutable`, `id-mismatch`, `duplicate-id`, `missing-id`, `unknown-sibling`, `bad-target`, `test-failed`, `stale-revision`, `dangling-reference`, `for-unanswered`, `unknown-feedback-item`, `withdrawn-item`, and more.
The tool lists at most 25 patch errors and 25 board errors, and counts the rest.

### Removing a part

Without `--cascade`, removing a component, a relationship, or a group that something still refers to is an error (`dangling-reference`).
With it, the tool also drops the relationships of a removed component, the items that are about a removed part, and the highlights that name it, and it takes a removed group off the components that were in it.
The output marks each of those lines with `(cascade, with <part>)`.

### Dry run

`--dry-run` prints the same lines and writes nothing.
Each line is one ID: `+` added, `-` removed, `~` changed with the field name, and `~ components (order)` when parts changed their order.

```text
.anatomy/board.json: dry run, nothing written, would raise revision 3 to 4
~ components/payment.summary
+ relationships/api-to-queue
- relationships/api-to-payment
```
