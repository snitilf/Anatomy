# Authoring an Anatomy board

This guide tells a coding agent how to write a valid Anatomy board file about a plan, feature, or project.
Before you write, read `schema/board.v1.schema.json`.
The schema lists every field and every length limit, so it is enough on its own.
The file `docs/board-format.md` explains the same fields for people.

A board uses two names for its content.
A part is a `component` in the file.
A connection is a `relationship` in the file.

## 1. What a board is for

A board turns a plan, feature, or project into 6 to 12 parts that a learner can explore.
Each part has a plain summary.
Each connection says what passes between two parts.
Open questions show what is unknown.
Scenarios show how a journey works.

## 2. Before writing

Read only the material that the user authorized.
Do not search for other files and do not open them, even if they seem related.
If an unknown can change the result, ask the user before you write.
Record what you cannot confirm as items of kind `unknown` or `question`.
Do not guess.

## 3. Honesty rules

A source kind says how you know a claim.
For each claim, choose the source kind that matches how you know it:

- `user-stated`: the user told you this.
- `agent-explanation`: you understood this from material that you read.
- `documented-intent`: a written plan or spec says this. It needs at least one reference.
- `agent-proposal`: a design that nobody decided yet.

Anatomy shows a reference path as "cited, not checked".
If you only cited a file, do not write that the code does something.
If the meaning of a connection is unclear, use the relationship kind `unknown`.
Mark anything that is not built yet as planned, either in `scope.excludes` or in the text.
If the whole board describes a plan, one statement in `scope` is enough.
Do not promise a guarantee that the material does not state, such as "never fails" or "is secure".

## 4. Writing rules

Write plain English with short, active sentences.
Keep each `label` at most 60 characters.
Keep each `summary` to one or two sentences.
In `explanation` fields, use only paragraphs, lists, bold, italics, and inline code.
Do not use links, HTML, or images anywhere in the board.

Write each ID with lowercase letters, digits, and single hyphens, for example `rule-check`.
Every ID must be unique across the whole board.
The board, the groups, the components, the relationships, the items, and the scenarios share one set of IDs.
Keep IDs stable across revisions.
A revision is one version of the board file, and the `revision` field counts them.
When the content changes, increase `revision`.
When you revise, keep the existing IDs, so that the notes of the user stay attached to the same parts.
Use the schema for every other length.

Put each component in at most one group, for example Frontend, Backend, or Infrastructure.
A group can have a short `description`.
Groups have one level only.
Give every relationship one `kind`: `calls`, `sends-data-to`, `stores-in`, `reads-from`, `depends-on`, `triggers`, or `unknown`.
Do not write the `lesson` field, unless the user names a built-in lesson.

## 5. Scenarios

A scenario is a teaching sequence.
It does not run anything.

Write 1 to 4 scenarios, each with a clear title.
A scenario can have a one-sentence `summary`.
Keep each scenario short, with 3 to 6 steps.
Give each step a one-sentence `caption` and a `highlight` list.
In a `highlight` list, write component IDs and relationship IDs only.
Never write the ID of an item, a group, or a scenario there.
If it helps the learner, show a failure path or an edge case.
Label any part of the path that is not built as planned.

## 6. Updating a board and answering feedback

A board lives in the repository at `.anatomy/board.json`.
Anatomy opens each new revision as soon as you write it.

To update a board, write the whole file again and do these steps:

- Raise `revision` by one.
- Keep the ID of every part, connection, item, and scenario that stays. The notes of the user stay attached by ID.
- If a connection moves to another part, change its `from` or `to` and keep its ID.
- Give new things new IDs. Never reuse the ID of something that you removed for something else.

When the user sends feedback, Anatomy writes `.anatomy/feedback.json`.
Then the user asks you to answer it.
Answer every item by its `id` in a `responses` block.
Give each answer the status `adopted`, `declined`, or `answered`, and set `respondsTo` to the feedback `id`.
For each adopted item, list in `changed` the IDs that you added or changed.
Do not edit `.anatomy/layer.json` or `.anatomy/feedback.json`.
See [Responses](board-format.md#responses).

## 7. Checklist before you hand over the file

Before you reply, make sure that every item in this list is true.

1. `format` is `anatomy-board`, `schemaVersion` is `1`, and `revision` is 1 or higher.
2. Every ID is lowercase and hyphenated, and no ID appears twice on the board.
3. Every `from` and `to` names a component. Every `group` names a group. Every `about` and `highlight` value names a component or relationship.
4. A real board has 6 to 12 components.
5. Every component and relationship has a `source` kind, and every `documented-intent` has a reference.
6. No text field is empty, and every field is within its limit.
7. Every part that is not built is marked as planned.
8. The file parses as JSON and passes `schema/board.v1.schema.json`.
9. No text promises a guarantee that the material does not state.
10. If you answer feedback, `revision` is higher than before and every feedback item has a response.

## 8. Prompt to paste into your agent

Copy this block, replace the placeholders, and send it to your agent.

```text
Write an Anatomy board file that explains: <WHAT TO EXPLAIN>.

Follow the guide at <PATH TO authoring-guide.md>.
Validate the file against <PATH TO board.v1.schema.json>.
Read only this material: <MATERIAL YOU AUTHORIZE>.
If a consequential detail is unknown, ask me before you write.
Record what you cannot confirm as "unknown" or "question" items instead of guessing.
Write the board to .anatomy/board.json in the repository, and do not edit any other file.
```

Anatomy writes `.anatomy/README.md` in a repository that it already opened.
That file holds this guide and the schema, so a shorter prompt is enough:

```text
Read .anatomy/README.md, then write .anatomy/board.json that explains: <WHAT TO EXPLAIN>.
```

After the user sends feedback, Anatomy copies this prompt:

```text
Read .anatomy/feedback.json and answer every item in the next revision of .anatomy/board.json. The format is in .anatomy/README.md.
```

## 9. Minimal valid example

This example is the smallest board that passes the schema, so it has 2 components.
A real board has 6 to 12 components.

```json
{
  "format": "anatomy-board",
  "schemaVersion": 1,
  "id": "example-checkout",
  "revision": 1,
  "title": "Example: checkout request",
  "goal": "Understand how a checkout request reaches the payment step.",
  "scope": {
    "includes": ["The path from the cart to the payment step"],
    "excludes": ["Refund handling, which is planned but not designed"]
  },
  "components": [
    {
      "id": "cart",
      "label": "Cart",
      "summary": "Holds the items the customer chose before checkout.",
      "source": { "kind": "user-stated" }
    },
    {
      "id": "payment-step",
      "label": "Payment step",
      "summary": "Sends the total to the payment provider after the customer confirms.",
      "source": { "kind": "agent-explanation" }
    }
  ],
  "relationships": [
    {
      "id": "cart-to-payment",
      "from": "cart",
      "to": "payment-step",
      "kind": "sends-data-to",
      "label": "cart total",
      "source": { "kind": "agent-explanation" }
    }
  ],
  "items": [
    {
      "id": "q-timeout",
      "kind": "question",
      "text": "What happens when the payment provider times out?",
      "about": "payment-step"
    }
  ],
  "scenarios": [
    {
      "id": "pay-once",
      "title": "Pay once",
      "steps": [
        { "caption": "The customer confirms the cart.", "highlight": ["cart"] },
        { "caption": "The payment step sends the total.", "highlight": ["cart-to-payment", "payment-step"] }
      ]
    }
  ]
}
```
