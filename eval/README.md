# Evaluation set

This folder holds six small tasks that check how well an agent writes a board.
A maintainer runs them by hand before a release, and when a change touches the README or the authoring guide.
The runner never calls an AI and never uses the network.
You drive the agent yourself. The runner only prints prompts and scores the result.

## The tasks

| Task | What it tests |
| --- | --- |
| `web-app` | A first board for a small web app: page, API, session, database. |
| `cli-plugins` | A first board for a command line tool with plugins. |
| `plan-only` | A first board from a written spec with no code. The board must label what is decided and what is open. |
| `monorepo` | A first board for three packages and one shared library. |
| `revision-clear` | A revision. The starting board has 8 feedback items of mixed types. |
| `revision-unclear` | A revision where most feedback is unclear. The agent must ask, not guess. |

Each task folder holds `task.md` (the prompt), `gold.json` (the facts a good board has), and `fixture/` (the material to read).
The revision tasks also hold `board.json` and `feedback.json`.
They use the code in `web-app/fixture`.

## Run a task

1. Run `npm run eval` to print every prompt. Run `npm run eval -- web-app` to print one.
2. Copy the fixture folder to a scratch folder outside this repository.
   For a revision task, copy `board.json` to `.anatomy/board.json` and `feedback.json` to `.anatomy/feedback.json` as well.
3. Start Anatomy for that folder, so it writes `.anatomy/README.md`.
4. Give your agent the prompt. Let it write `.anatomy/board.json`.
5. Score the file:

```
npm run eval -- web-app --board path/to/.anatomy/board.json
```

Keep the first file the agent wrote and pass it with `--first`, so the score shows whether it was valid on the first write.
Pass `--usage usage.json` to print the agent's own numbers next to the scores.
The file looks like this: `{ "tokensIn": 9000, "tokensOut": 6000, "toolCalls": 12, "turns": 5 }`.
Take the numbers from the usage report of your agent.

Agent output varies. Run each task three times and compare the spread, not one run.

## What the scores mean

- Valid on first write: the board passes the same check the app uses.
- Component recall: the share of gold components that the board has.
- Component precision: the share of board components that are in the gold list.
- Edge recall: the share of gold connections that the board has. Direction is ignored.
- Unknown or question items: the board must hold at least the number in the gold file.
- Guarantee words: words such as "always", "secure", and "guaranteed". The goal is zero.
- documented-intent without a reference: the goal is zero.
- Feedback answered: every feedback item has a response, `changed` lists only IDs on the board, and an unclear item is never adopted.

Labels match when their words are the same, or when every word of the shorter label is in the longer one.
The match ignores case, punctuation, plurals, and the words "the", "a", "an", "of", and "and".
Add an alias to `gold.json` when a good board uses another name for the same part.

## Token sizes

Run `npm run tokens` to print the size of the generated README, each guide section, and each example board.
The estimate is characters divided by 4 for prose and by 3 for JSON.
A unit test fails when the README grows more than 5 percent over `tokens.baseline.json`, or passes the hard cap in that file.
To let the README grow on purpose, edit the baseline in the same change.
