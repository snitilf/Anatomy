# Board format, version 1

A board is a JSON file that explains a plan, feature, or project as parts, connections, open questions, and scenarios.
An agent or a person writes the file, and Anatomy opens it.
The file is data only.
Anatomy never runs, fetches, or evaluates anything in it, and it shows file paths as text.

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

## IDs

An ID uses lowercase letters, digits, and single hyphens, for example `rule-check`.
Every ID must be unique across the whole board, not only within its list.
Keep IDs stable across revisions, so that notes and card positions stay attached to the same part.

## Components

A component has an `id`, a short `label`, a `summary` of one or two sentences, and a `source`.
It can also have an `explanation`, a `group`, lists of `inputs` and `outputs`, and a starting `position` (`x`, `y`).

## Relationships

A relationship connects two components: `from` and `to` must be component IDs.
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

## Sources

Every component and relationship has a `source` that says where the claim comes from:

| Kind | Meaning |
| --- | --- |
| `agent-explanation` | An agent describes something as it understands it. |
| `agent-proposal` | An agent suggests a design that nobody decided yet. |
| `documented-intent` | A written plan or spec says this. Needs at least one reference. |
| `user-stated` | The user told the agent this. |

A reference has a `label` and an optional `path` and `note`.
Anatomy shows a path as cited, not as checked.
Version 1 has no source kind for facts derived from code or observed at runtime.

## Items

An item has a `kind` (`assumption`, `unknown`, or `question`) and a `text`.
If it has an `about` field, the item belongs to that component or relationship.
If it has no `about` field, it belongs to the whole board.

## Scenarios

A scenario has an `id`, a `title`, and a list of `steps`.
Each step has a `caption` and a `highlight` list of component and relationship IDs.
A scenario is a teaching sequence.
Playing it does not run anything.

## Text

The `explanation` fields accept a small Markdown subset: paragraphs, lists, bold, italics, and inline code.
Anatomy shows anything else, including HTML and links, as plain text.

## Limits

| Limit | Value |
| --- | --- |
| File size | 1,000,000 bytes |
| Components | 1 to 60 (Anatomy warns above 15) |
| Relationships | 200 |
| Groups | 12 |
| Items | 100 |
| Scenarios | 20 |
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

Text fields must not be empty or contain only spaces.

## What Anatomy checks

Anatomy rejects a file and keeps the current board open if any of these problems occur:

1. The file is not JSON, is larger than 1 MB, or is not an Anatomy board.
2. The schema version is not 1.
3. A field is missing, misspelled, too long, or has the wrong type.
4. An ID is badly formed or is used twice.
5. A relationship, item, group membership, or scenario step points at something that does not exist.

The error list names the location of each problem, for example `relationships[2].to`.

The JSON Schema file checks the shape and the limits only.
It cannot check unique IDs or references, so a file that passes the JSON Schema can still be rejected by Anatomy.
