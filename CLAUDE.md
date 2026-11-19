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
The user then clicks **Copy prompt**, which copies the first prompt and writes `.anatomy/README.md` into the project.

## Write a board

The board goes in the user's project, never in this repository.
The path is `.anatomy/board.json`.

1. If `.anatomy/README.md` exists in the user's project, read it.
   It holds the authoring guide, the feedback format, and the schema.
2. If it does not exist, read `docs/authoring-guide.md` and `schema/board.v1.schema.json` in this repository.
3. Read only the material that the user authorized.
4. Ask the user a few questions in plain English before you write, as the guide explains under "Ask before you write".
   If the user says to skip them, list your assumptions and record them as items.
5. Write the whole file.
   Raise `revision` by one each time you write it.

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

This repository has no command that validates a board file outside the app.
Anatomy checks the file when it opens it, and it lists every problem with its location, for example `relationships[2].to`.
It keeps the previous board open when a file is invalid.
Ask the user to read the error list, or use the checklist in `docs/authoring-guide.md`.
The JSON Schema checks only shapes and limits, so Anatomy can reject a file that passes it.

## Answer feedback

When the user clicks **Send to agent**, Anatomy writes `.anatomy/feedback.json` in the project.
The user then gives you this prompt:

```text
Read .anatomy/feedback.json and answer every item in the next revision of .anatomy/board.json. The format is in .anatomy/README.md.
```

1. Read `.anatomy/feedback.json`.
2. Write the next revision of `.anatomy/board.json` with `revision` raised by one.
3. Add a `responses` block with `respondsTo` set to the feedback `id`.
4. Answer every item by its `id` with the status `adopted`, `declined`, or `answered`.
   List the IDs that you added or changed in `changed`.

The full format is in `.anatomy/README.md`.
Anatomy opens the new revision on its own.

Never edit `.anatomy/layer.json` or `.anatomy/feedback.json`.
They hold the working state of the user.

Commit `.anatomy/board.json` with the code that it explains.
Add `.anatomy/layer.json` and `.anatomy/feedback.json` to the `.gitignore` of the project.
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
- `npm run schema` rewrites `schema/board.v1.schema.json` from the Zod schema.
  Run it after every change to the board schema.
- `npm run tokens` prints the size of the generated README, each guide section, and each example board.
  A unit test fails when the README grows more than 5 percent over `tokens.baseline.json`.
  Edit the baseline only when the growth is intended.
- `npm run eval` prints the evaluation tasks in `eval/` and scores a board file. See `eval/README.md`.
- `docs/board-format.md` explains every field of a board file.
- `docs/authoring-guide.md` holds the rules for writing a board.
  Anatomy copies it into the `.anatomy/README.md` of each project, so edit it with care.
- `docs/architecture.md` explains the layout, the storage, and the file safety.
- Use a feature branch, write commits as `type(scope): summary`, and run `npm run check` before you push.
