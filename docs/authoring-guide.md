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

## 2. Ask before you write

Before you write a board, ask the user a few questions.
A board built on guesses teaches the wrong thing.
Your aim is a shared understanding with the user.
Then you write the board once.

### The decision tree

A decision is a choice that the user must make.
Some decisions depend on others, so you ask them in order.
This list shows the order and the board field that each decision settles:

1. Audience and goal. Who will read the board, and what must they understand afterwards? This settles `goal`.
2. Scope. What is in, what is out, and does the board describe what is built, a plan, or both? This settles `scope.includes` and `scope.excludes`.
3. Material. Which files and notes can you read? This limits your reading, as section 3 explains.
4. Depth. How many parts, from 6 to 12, and how much detail in each? This settles the number of components and the length of the summaries.
5. Groups. How do the parts sort into groups, for example Frontend and Backend? This settles `groups`.
6. Journeys. Which journeys deserve a walkthrough? This settles `scenarios`.
7. Unknowns. What is already known to be uncertain or undecided? This settles the items of kind `unknown` and `question`.

A decision waits until the decisions that it depends on have answers.
For example, you cannot ask about groups before you know the depth.
The frontier is every decision that you can ask now, because the decisions that it depends on have answers.

### Rounds

A round is one message to the user that holds the whole frontier.
Number the questions Q1, Q2, and so on.
Give each question a short title and a plain question.
Give choices when they help.
On its own line, write your recommended answer, which starts with "Recommended:".
Word each question so that the answer "yes" accepts your recommendation.
After you send a round, wait for the answers.
The answers open the next frontier, and you send the next round.

This is an example round for a made-up project, a shop that sells plants:

```text
Q1. Audience and goal
Is this board for a new developer who must learn how an order moves through the shop?
Recommended: Yes, a new developer, with the goal "understand how an order moves through the shop".

Q2. Built or planned
Does the board describe only what is built today?
Recommended: Yes, only what is built today. I will mark anything else as planned.

Q3. Material
Can I read only the folder `src/orders` and the file `docs/shop.md`?
Recommended: Yes, only those two.
```

### Facts and decisions

A fact is something that the authorized material states.
Find each fact yourself and never ask the user for it.
If your harness can start a helper agent with a fresh context, you can use one for a lookup.
If it cannot, look yourself.
Do not wait for a lookup before you ask the questions that do not depend on it.
A decision is a choice about the board, and only the user can make it.

### Plain English for the user

The user can be a newcomer.
Do not use a technical word without a short definition.
Ask one idea in each question.
Ask at most 5 questions in a round.

### When to stop

Stop when the frontier is empty and the user says that the understanding is shared.
Then write the board.
If the user leaves a decision open, record it as an item of kind `question` or `unknown`.
Never fill the gap with a silent assumption.

### When to skip or shorten

If the user tells you to skip the questions, do not ask them.
If the request already settles every decision, do not ask them either.
In both cases, list your assumptions in one short list in your reply.
Also record each assumption as an item on the board.
Then write the board.
If you answer `feedback.json`, ask only about the feedback items that are unclear.

## 3. Before writing

Read only the material that the user authorized.
Do not search for other files and do not open them, even if they seem related.
If an unknown can change the result, ask the user before you write, as section 2 explains.
Record what you cannot confirm as items of kind `unknown` or `question`.
Do not guess.

## 4. Honesty rules

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

## 5. Writing rules

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

## 6. Scenarios

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

## 7. Updating a board and answering feedback

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

## 8. Checklist before you hand over the file

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

## 9. Prompt to paste into your agent

Copy this block, replace the placeholders, and send it to your agent.

```text
Write an Anatomy board file that explains: <WHAT TO EXPLAIN>.

Follow the guide at <PATH TO authoring-guide.md>.
Validate the file against <PATH TO board.v1.schema.json>.
Read only this material: <MATERIAL YOU AUTHORIZE>.
Before you write, ask me the questions that section 2 of the guide describes.
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

## 10. Minimal valid example

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
