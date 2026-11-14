# Authoring an Anatomy board

This guide tells a coding agent how to write a valid Anatomy board file about a plan, feature, or project.
Read `schema/board.v1.schema.json` before you write.
The schema lists every field and every length limit, so it is enough on its own.
`docs/board-format.md` explains the same fields for people.

## 1. What a board is for

A board turns a plan, feature, or project into 6 to 12 parts that a learner can explore.
Each part has a plain summary, and each connection says what passes between parts.
Open questions and scenarios show what is unknown and how a journey works.

## 2. Before writing

Read only the material the user authorized.
Do not search for or open other files, even when they seem related.
Ask the user about consequential unknowns before you write.
Record what you cannot confirm as items of kind `unknown` or `question` instead of guessing.

## 3. Honesty rules

Choose the source kind that matches how you know each claim.

- `user-stated`: the user told you this.
- `agent-explanation`: you understood this from material you read.
- `documented-intent`: a written plan or spec says this, with at least one reference.
- `agent-proposal`: a design that nobody decided yet.

A reference path is shown as "cited, not checked".
Do not write that code does something when you only cited the file.
Use the relationship kind `unknown` when the meaning of a connection is unclear.
Mark anything not built yet as planned, either in `scope.excludes` or in the text.
One statement in `scope` is enough when the whole board describes a plan.
Do not promise guarantees that the material does not state, such as "never fails" or "is secure".

## 4. Writing rules

Write plain English with short, active sentences.
Keep each `label` under 60 characters.
Keep each `summary` to one or two sentences.
Use only paragraphs, lists, bold, italics, and inline code in `explanation` fields.
Do not use links, HTML, or images anywhere in the board.
Write IDs in lowercase letters, digits, and single hyphens, such as `rule-check`.
Every ID must be unique across the whole board: the board, groups, components, relationships, items, and scenarios share one set of IDs.
Keep IDs stable across revisions.
Increase `revision` when the content changes.
Keep existing IDs when you revise, so the user's notes stay attached to the same parts.
Use the schema for every other length.

Put each component in at most one group, such as Frontend, Backend, or Infrastructure.
Groups have one level only.
Give every relationship one `kind`: `calls`, `sends-data-to`, `stores-in`, `reads-from`, `depends-on`, `triggers`, or `unknown`.
Leave out the `lesson` field unless the user names a built-in lesson.

## 5. Scenarios

Write 1 to 4 scenarios, each with a clear title.
Keep each scenario short, with 3 to 6 steps.
Each step has a one-sentence `caption` and a `highlight` list.
A `highlight` list names component and relationship IDs only, never items, groups, or scenarios.
A scenario is a teaching sequence, and it does not run anything.
Show a failure path or an edge case when it helps the learner.
Label any part of the path that is not built as planned.

## 6. Updating a board and answering feedback

A board lives in the repository at `.anatomy/board.json`, and Anatomy opens each new revision as soon as you write it.
To update a board, write the whole file again:

- Raise `revision` by one.
- Keep the IDs of every part, connection, item, and scenario that stays, so the user's notes stay attached.
- When a connection moves to another part, change its `from` or `to` and keep its ID.
- Give new things new IDs, and never reuse the ID of something you removed for something else.

When the user sends feedback, Anatomy writes `.anatomy/feedback.json` and the user asks you to answer it.
Answer every item by its `id` in a `responses` block, with `adopted`, `declined`, or `answered`, and set `respondsTo` to the feedback `id`.
List in `changed` the IDs you added or changed for each adopted item.
Do not edit `.anatomy/layer.json` or `.anatomy/feedback.json`.
See [Responses](board-format.md#responses).

## 7. Checklist before you hand over the file

Run every check before you reply.

1. `format` is `anatomy-board`, `schemaVersion` is `1`, and `revision` is 1 or higher.
2. Every ID is lowercase and hyphenated, and no ID appears twice on the board.
3. Every `from` and `to` names a component, every `group` names a group, and every `about` and `highlight` value names a component or relationship.
4. A real board has 6 to 12 components.
5. Every component and relationship has a `source` kind, and every `documented-intent` has a reference.
6. No text field is empty, and every field is within its limit.
7. Every unbuilt part is marked as planned.
8. The file parses as JSON and passes `schema/board.v1.schema.json`.
9. No text promises a guarantee that the material does not state.
10. When you answer feedback, `revision` is higher than before and every feedback item has a response.

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

In a repository that Anatomy already opened, `.anatomy/README.md` holds this guide and the schema, so a shorter prompt is enough:

```text
Read .anatomy/README.md, then write .anatomy/board.json that explains: <WHAT TO EXPLAIN>.
```

After the user sends feedback, Anatomy copies this prompt:

```text
Read .anatomy/feedback.json and answer every item in the next revision of .anatomy/board.json. The format is in .anatomy/README.md.
```

## 9. Minimal valid example

This example is the smallest board that passes the schema, so it has 2 components.
A real board has 6 to 12.

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
