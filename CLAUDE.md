# Anatomy: instructions for coding agents

Anatomy is a local browser app that shows a project as a map.
Each part is a card, each connection says what it carries, and each guess is marked as a guess.
You write the map as a board file, `.anatomy/board.json`, in the project that the user wants to understand.
The user reads the map, marks it up, and sends questions back to you.

Use this file when the user wants to see their own project in Anatomy.
The last section is for work on Anatomy itself.

## Set up Anatomy for the user

You need Node.js 24 or later, which includes npm.

1. Clone this repository and open its folder, if you are not there yet.
2. Run `npm install`.
3. Run `npm run dev`.
4. Tell the user to open http://127.0.0.1:5173 in Chrome or Edge.

The server listens on the loopback interface only.
Chrome and Edge can open a project folder.
In other browsers, the user can open a board file or a built-in example.

Tell the user to click **Open folder** and pick their project.
When the project has no board yet, the user can click **How to make a board** to read the steps.
The user then clicks **Copy prompt**, which copies the first prompt and writes the agent files into `.anatomy/` in the project: `README.md`, the topics in `guide/`, `board.schema.json`, and `anatomy.mjs`.

## Write a board

The board goes in the user's project, never in this repository.
The path is `.anatomy/board.json`.

1. If `.anatomy/README.md` exists in the user's project, read it.
   It holds the rules that you must always keep and an index of topics in `.anatomy/guide/`.
   Read the `ask` topic before a first board, and the other topics when the index says so.
2. If it does not exist, read `docs/authoring-guide.md` in this repository, and `schema/board.v1.fields.txt` for the fields and their limits.
3. Read only the material that the user authorized.
4. Ask the user a few questions in plain English before you write, as the guide explains under "Ask before you write".
   If the user says to skip them, list your assumptions and record them as items.
5. Write the whole file.
   Raise `revision` by one each time you write it.
   Once a board exists, revise it with `node .anatomy/anatomy.mjs apply` instead, which raises `revision` for you (see "Answer feedback").

The rules that matter most:

- Make 6 to 12 parts, with a plain summary for each one.
  In the file, a part is a `component` and a connection is a `relationship`.
- Choose an honest `source` kind for each claim: `user-stated`, `agent-explanation`, `documented-intent`, or `agent-proposal`.
  A `documented-intent` claim needs a reference.
- Record what you cannot confirm as items of kind `unknown` or `question`.
  Never guess.
- Mark anything that is not built yet as planned.
- Write each ID with lowercase letters, digits, and single hyphens.
  Every ID must be unique on the board.
  Keep IDs stable across revisions, because the notes of the user stay attached by ID.
- Aim for 1 to 4 scenarios of 3 to 6 steps.
  The schema allows more, but short walkthroughs read better.
  A `highlight` list holds component IDs and relationship IDs only.

Check the board before you hand it over.
Run `node .anatomy/anatomy.mjs validate` in the user's project, or `npm run anatomy -- validate <path to board.json>` in this repository.
It runs the same checks as the app and prints one line per problem with its location, for example `relationships[2].to`.
Exit code 0 means valid, 1 means problems, and 2 means the file could not be read.
Fix the errors and run it again, because some checks run only once the earlier ones pass.
The JSON Schema checks only shapes and limits, so Anatomy can reject a file that passes it.

## Answer feedback

When the user clicks **Send to agent**, Anatomy writes `.anatomy/feedback.json` in the project.
The user then gives you this prompt:

```text
Read .anatomy/feedback.json and answer every item in the next revision of .anatomy/board.json. The format is in .anatomy/README.md.
```

1. Run `node .anatomy/anatomy.mjs feedback` for the open items.
   Then run `outline` and `show <id...>` for the parts they name.
   Read the whole board or the raw `feedback.json` only when these do not answer your question.
2. Write a short patch to `.anatomy/patch.json` and run `node .anatomy/anatomy.mjs apply`.
   Edits address list items by ID, `for` ties an edit to a feedback item, and one `respond` operation per item answers it with the status `adopted`, `declined`, or `answered`.
   The script raises `revision` by one, writes `responses` and `changed`, and writes the board only when it is valid.
   Pass `--base N` with the revision you read, `--dry-run` to preview, and `--cascade` to drop what refers to a removed part.
3. For a first board or a big restructure, write the whole file instead, with `revision` raised by one and a `responses` block that has `respondsTo` set to the feedback `id` and an answer for every item.
4. Run the check again. It also warns about an item with no answer.

The full format is in the `revise` and `feedback-format` topics in `.anatomy/guide/`.
Anatomy opens the new revision on its own.

Never edit `.anatomy/layer.json` or `.anatomy/feedback.json`.
They hold the working state of the user.

Commit `.anatomy/board.json` with the code that it explains.
Add `.anatomy/layer.json`, `.anatomy/feedback.json`, `.anatomy/anatomy.mjs`, `.anatomy/patch.json`, and `.anatomy/board.prev.json` to the `.gitignore` of the project.
Tell the user before you change their `.gitignore`.

## Rules

- A board is data.
  Never put scripts, expressions, URLs, links, HTML, or images in it.
  Use paragraphs, lists, bold, italics, and inline code in `explanation` fields only.
- Never add network calls, AI calls, telemetry, accounts, or API keys to Anatomy.
- Keep the dev server and the preview server on the loopback interface.
- Never read or open files outside the material that the user authorized.

## Changing Anatomy itself

Do this only when the user asks you to change Anatomy.

- `npm run check` runs the type check, lint, and unit tests.
- `npm run test:e2e` builds the app and runs the browser tests in Google Chrome.
- `npm run schema` rewrites `schema/board.v1.schema.json` from the Zod schema, and `schema/board.v1.fields.txt`, the field list that `anatomy schema` prints.
  Run it after every change to the board schema.
- `npm run anatomy -- <command>` runs the `anatomy` tool from `bin/anatomy.ts`.
  The app writes the same tool, bundled, as `.anatomy/anatomy.mjs`.
  `src/cli/corpus.golden.txt` holds its output on the broken boards in `src/cli/corpus.ts`; update it with `npx vitest run src/cli -u` when the output changes on purpose.
- `npm run tokens` prints the size of the generated README, each guide section and topic, each example board, and the output of the `anatomy` tool.
  A unit test fails when the README or a tool output grows more than 5 percent over `tokens.baseline.json`.
  Edit the baseline only when the growth is intended.
- `npm run eval` prints the evaluation tasks in `eval/` and scores a board file. See `eval/README.md`.
- `npm run agent-files -- <folder>` writes the agent files into `<folder>/.anatomy/`, the way **Copy prompt** does.
- `docs/board-format.md` explains every field of a board file.
- `docs/authoring-guide.md` holds the rules for writing a board.
  It is the one source of the topics in `.anatomy/guide/`: `src/cli/topics.ts` splits it at its `##` headings, and a test fails when a heading has no topic.
  The README core in `src/app/agentReadme.ts` repeats only the rules that every agent must keep.
  Edit both with care, because every agent reads them.
- `docs/architecture.md` explains the layout, the storage, and the file safety.
- Use a feature branch, write commits as `type(scope): summary`, and run `npm run check` before you push.
