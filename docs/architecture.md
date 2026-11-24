# Architecture

Anatomy is a static browser app.
It has no server code and no accounts.
It makes no network calls after the page loads.
All board processing happens in the browser tab.

## Two layers of data

A board has two layers of data.
The app stores the two layers separately.

| Layer | Written by | Contents |
| --- | --- | --- |
| Base board | An agent or a person, outside the app | Parts, connections, items, scenarios, and answers to feedback. See [board-format.md](board-format.md). |
| User layer | The user, inside the app | Moved cards, card sizes, notes, questions, links, drawings, proposed parts, moved connection ends, and resolved items. |

The app never edits the base board.
When a new revision of the base board arrives, the user layer stays.
The app then compares the user layer with the new base board.

## Modules

A pure function is a function that only turns its input into a result.
It changes nothing outside itself.
Logic lives in pure functions with unit tests.
React components read from the app state and dispatch actions.

| Folder | Owns | Depends on |
| --- | --- | --- |
| `src/board/` | Board schema (including `responses`), validation with problem codes and hints, the warnings only the `anatomy` tool shows, schema key order, JSON Schema export. | `zod` |
| `src/layout/` | Geometry (point, size, rect), the layered layout, card sizes, push apart, and a rect per card from the user's positions and sizes. | `src/board/`, `@dagrejs/dagre` |
| `src/layer/` | User layer schema, version 1 upgrade, every edit as a pure function, fingerprints, board comparison, note status, export files. | `src/board/`, `src/layout/` |
| `src/feedback/` | The `anatomy-feedback` format and the pure builder that turns a layer into feedback. | `src/layer/`, `src/layout/` |
| `src/cli/` | The `anatomy` tool without file access: commands, output, and the corpus of broken boards for its tests. `bin/anatomy.ts` connects it to Node. | `src/board/` |
| `src/workspace/` | Where work is kept: the one IndexedDB database, the repository folder behind a small interface, the save queue, and the board watcher. | `src/board/`, `src/layer/` |
| `src/text/` | Safe renderer for the Markdown subset. | `react` |
| `src/lessons/` | Built-in lesson catalog and lesson components. | `react` |
| `src/app/` | App state (one pure reducer in a zustand store, with undo history), the screen state (sidebar, menus), the workspace provider, shell, top bar, empty states, dialogs. | all of the above |
| `src/commands/` | The one list of commands, their keys, the command menu, and the single key listener. | `src/app/`, `src/canvas/` |
| `src/canvas/` | React Flow map: cards, group areas, connections, user links. | `@xyflow/react`, `src/app/` |
| `src/whiteboard/` | The tool bar, the draw surface, the ink layer, text and sticky notes, proposed parts, the in-place editor, and the end handles that move line ends. Arrow geometry and end drops are pure functions. | `@xyflow/react`, `perfect-freehand`, `src/app/`, `src/layer/` |
| `src/inspector/` | The sidebar: the overview, a view for every kind of selection, the flow block, notes and the agent's answers, the Review tab, and the bottom sheet on a phone. | `src/app/`, `src/commands/`, `src/text/` |
| `src/scenarios/` | The walkthrough bar: step state, highlights, captions. | `src/app/`, `src/commands/` |
| `src/notes/` | Note targets in words, the review counts after an update, and the undo toast. | `src/layer/`, `src/app/` |
| `src/theme/` | Theme choice (system, light, dark), stored in `localStorage` and applied as `data-theme` on `<html>`. An inline script in `index.html` applies it before the first paint. | `react` |
| `src/styles/` | Design tokens: colors for both themes (white cards on a cool low-chroma ground in light mode, clean amber for user marks, and a full contrast matrix checked in `tokens.test.ts`), type scale, spacing, radii, and the one shadow for floating surfaces. | none |

## Cards and the map

Every card has a rect, which is its position and its size.
The function `placeCards` in `src/layout/cards.ts` gives the rect of every card.
A position that the user set wins.
The position in the board comes next, and the layered layout comes last.

A size that the user set wins over the size of the text in the card.
That text size is `contentSize`: 240 wide, at least 112 tall, on an 8 px grid.
A resized card stays between 224 by 112 and 480 by 320.
The app stores only the cards that the user moved or resized.
The other cards follow the layout each time a board opens.

### The layout

The layout in `src/layout/autoLayout.ts` is a left-to-right flow that follows the connections.
It uses dagre in two passes.
In the first pass, it lays out the members of each group.
In the second pass, it treats each group as one block among the loose cards.

Connections in both directions between two blocks count in the direction of the block that the board lists first.
The layout packs pieces that no connection joins in rows, toward the shape of a screen.
The layout uses the text size of each card and never a size that the user set.
For this reason, a resize never moves the other cards.

The layout is a pure function of the board and never reads the window size.
It aims at a fixed shape: the free map area of a 1440x900 and a 1280x800 window with the sidebar docked.
A gap between two stacked cards holds one track of lines and its margins, and a gap between columns opens to the room its lines and its widest label need.
A label that is too wide for one line counts at its two-line width.
The layout tries several shapes for the groups and for the whole, and lifts each box into room that a wrapped row leaves above it.
Inside a group the flow keeps its reading order: a branching flow is never wrapped into rows, and only a chain of single cards may become a stack.
The pieces of a group share one grid of columns, so the cards of a column line up, and a wrapped row of a group never rises beside the row before it.
A group keeps room above it for its name, which the far view draws larger.
On a board of up to 16 parts, the layouts that fit within 30 percent of the smallest one are drawn.
Of those that read about as clean as the cleanest, the smallest wins: clean means few crossings, few connections that run right to left, and every label placed.
A cleaner layout never costs a level of detail on the reference window.
Where a label still finds no place, the gap it needs opens a step.
A board of more than 16 parts is not drawn while it is laid out.
Instead, a gap between its columns holds a track for each line through it past four, so its labels have room.
A connection that closes a loop never counts in these choices, so closing a loop never moves its cards.
A board of more than 24 parts is read in the far view, so it keeps roomier gaps and group areas.

If some cards have a board position, the layout places the other cards as a block to their right.
A card that the layout placed never stays under a card with a fixed position.
The function `pushApart` in `src/layout/push.ts` moves it aside.

A drop or a resize can cover other cards.
The app then pushes the covered cards aside along the shorter way out.
It pushes them 40 units away, for at most three rounds.
A pushed card prefers a free spot and its own group area.
It never lands on a card that has settled.
The app saves the dropped card and every pushed card in one action, so one undo puts them all back.

### Connections

Routing, labels, group areas, and the camera all read the card rects and never a fixed card size.
Every connection has straight runs with rounded corners (`src/canvas/routing.ts`).
The router picks the first of three shapes that fits:

1. A straight run, when the two ends line up.
   Two ends on facing sides that are off by a short jog are lined up first.
2. An elbow on a free track of the gap between the cards.
3. A path that A* finds around the cards.

The search adds a cost for each of these:

- A turn.
- A run along or across a line that is already drawn.
- A run through a group area that neither end belongs to.

Tracks are 16 units apart.
A gap between cards holds as many lines as it has tracks, so parallel lines do not run on top of each other.

While the user drags or resizes a card, the app redraws only the connections of that card.
It draws them as plain elbows and hides their labels.
After the drop, one full layout pass routes the connections and places the labels.
The labels keep off every card, every line, and every other label, and stay inside the box that Fit frames.
A label that has no place on one line tries two lines.
A connection keeps its route and label when its cards did not move or change size and the route is still clear.

### The camera

The camera in `src/canvas/camera.ts` keeps the map inside limits.
The app works out the limits from the content: cards, group areas, marks, and proposed parts.
When a fit would land in the far view, the content also includes the routes of the far-view lines, which run around the outside of the cards.
In the far view a group's name sits just above its block, cut short of the next name and of the right edge of the content.
When another block sits too close above, the name sits just inside the top of its own block instead.
The fit asks for those routes only then.
The app solves them off the frame that commits a new layout, except in the far view and when a board opens.
Fit, every zoom out, the wheel, and framing a connection or a bundle solve them at once when they are not ready yet, so they never frame the last layout's lines.
The map zooms out only until the whole content fits, and never needs more than 100%.
It zooms in to 200%.
Panning stops a margin past the content.

React Flow applies the limits only to panning by the user.
For this reason, every camera move that the app makes goes through `clampViewport`.

When a board opens, the camera fits the whole board if the fit leaves text readable, which means a zoom of 75% or more.
If the fit is below 75%, the camera shows the start of the flow at 80%.
A board with more than 15 parts always opens fitted whole.
On a crowded map, connection labels show below 90% zoom only for the selection and for the card under the pointer.

## User layer, version 2

```ts
interface Layer {
  format: 'anatomy-layer'
  schemaVersion: 2
  boardId: string
  positions: Record<string, { x: number; y: number }> // only the cards the user moved, by component ID
  sizes: Record<string, { width: number; height: number }> // only the cards the user resized
  notes: Note[] // note or question about the board, a component, or a relationship
  links: Link[] // a line the user drew between two parts
  marks: Mark[] // whiteboard: stroke, rect, ellipse, arrow, text, sticky
  proposals: Proposal[] // a new part the user sketched: label, summary, rect
  reconnects: Reconnect[] // { relationshipId, from?, to? }: moved ends of an agent connection
  archive: ArchiveEntry[] // items the agent resolved or the user dismissed, each with its answer, restorable
  answers: Answer[] // { id, response }: the agent's latest answer to an item still on the map
  sent?: Sent // what was sent to the agent so far, with a fingerprint per item
}
```

The Zod schema in `src/layer/model.ts` is the source of the types.
It sets a cap on every list, on the points of a stroke (2000), on text lengths, and on coordinates.
The IDs of the items that the user makes have a prefix:

- `note-` for a note or question.
- `link-` for a link.
- `mark-` for a mark.
- `part-` for a proposed part.
- `edit-` for a reconnect.
- `feedback-` for a feedback file.

A part is a component of the board or a proposed part.
For this reason, links, arrows, and moved connection ends can join either kind.
The app simplifies a stroke to about 0.75 units before it stores the stroke.

A version 1 overlay (`anatomy-overlay`) and a version 1 export file still open.
The function `readLayer` upgrades them.
It changes `manualLinks` to `links`.
It also drops a stored position that equals the layout position of the card.
Version 1 froze every position when a board opened, so these positions are not real moves.

### Note status

The app computes the status of a note and never stores it.
A note has one of three statuses:

- `current`: the target exists and its fingerprint matches.
- `possibly-outdated`: the target exists, but its content changed since the user wrote or confirmed the note.
- `needs-relinking`: the target no longer exists in the base board.

A link whose part is missing also has the status `needs-relinking`.
The app never deletes or moves a note or link by itself.
The app moves only one kind of item on its own: an item that the agent adopted.
It moves that item into the archive, and the user can restore it from there.

A fingerprint is a short hash of the meaning of a part or connection, without its position.
For a component, it covers label, summary, explanation, group, inputs, outputs, and source.
For a relationship, it covers from, to, kind, label, explanation, and source.
For the board, it covers title, goal, and scope.

## Undo and redo

The app state keeps a history of earlier layers for the open board.
The history holds up to 100 steps, in memory.
Every change to the layer is one step.
A step is one of these changes:

- A drop of one or more cards.
- A run of arrow keys.
- A resize.
- A change to a note, link, mark, proposal, reconnect, or archive.

Selection, tool, theme, camera, and walkthroughs are not part of the history.
Opening a revision and sending feedback are barriers, so nothing before them can be undone.
After an undo or redo, the app selects an item that came back.
It clears a selection whose item went away.

Cmd or Ctrl with Z undoes.
Cmd or Ctrl with Shift and Z redoes, and so does Ctrl+Y.
Text fields and dialogs keep their own undo.

## Commands

Every user action with a name is one entry in `COMMANDS` in `src/commands/list.ts`.
An entry has an ID, a group, a label, an icon, and its keys.
It also says when the command shows and when it is enabled.
The command menu (Cmd or Ctrl with K), the top bar buttons, the tooltips, and the keys all read that one list.
For this reason, a new action needs a change in one place only.

The function `useCommand(id)` gives a button the label, the printed shortcut, the state, and a way to run the command.
One `keydown` listener, in the capture phase on the document, runs the shortcuts.

A single key does nothing while a text field, a dialog, a menu, or a popover has focus.
Cmd or Ctrl shortcuts leave text fields to their own keys.
The single keys of the whiteboard tools (V, H, P, R, O, A, T, S, N) belong to the tools alone.
Escape leaves a tool before it clears the selection.
The function `boardCommands` makes the commands that depend on what is open, such as one per example, walkthrough, part, and connection.

## The whiteboard

The tool bar at the bottom of the map holds these tools:

- Select (V).
- Hand (H, or hold Space).
- Pen (P).
- Rectangle (R).
- Ellipse (O).
- Arrow (A).
- Text (T).
- Sticky note (S).
- New part (N).

The tool in use is screen state and is not part of the history.
Escape or V returns to Select.
Every tool except the pen returns to Select after one use.
In a walkthrough or on a phone screen, only Select is available.

Under Select, the map behaves as before.
Under Hand, the map pans from anywhere.
Under a drawing tool, nothing on the map moves or takes the pointer.

### Drawing

A drawing tool puts a surface over the map (`DrawSurface`) that captures the pointer.
The line or shape in progress lives in a ref.
The app draws it once per frame by changing SVG attributes and never through React state.

When the user lets go, the app saves one mark:

- A pen line, simplified to 0.75 screen pixels.
- A rectangle or an ellipse. Shift keeps it square, and a click with no drag makes a default size.
- An arrow.

A click with Text, Sticky note, or New part opens an editor in place.
The app saves what the user typed as one change when the editor loses focus, or when the user presses Escape.
If the user typed nothing, the app saves nothing.
The wheel and a pinch zoom over the surface, as on the map.

Pen lines, rectangles, ellipses, and arrows are one SVG in board coordinates, above the cards and the labels (`InkLayer`).
Only a wide invisible copy of each line takes the pointer, so the cards under a shape stay reachable.
Marks are never obstacles for the lines and are never pushed.

Text, sticky notes, and proposed parts are React Flow nodes.
The user selects, moves, and resizes them like cards, and they pass through the same cache.
A proposed part is a card in every way.
Links join it, and the lines route around it.
A drop or a resize pushes it and is pushed by it, in the same undo step.

### Arrow ends and moved connection ends

An arrow end attaches in one of three ways:

- To a part.
- To a connection, at a place along its drawn line (`t` from 0 to 1).
- To a free point.

The function `attachAt` in `src/whiteboard/geometry.ts` does this.
An attached end follows its part or line when that moves.
It stops at the edge of a part.

A selected connection, link, or arrow shows a handle at each drawn end.
The hook `useEndDrag` captures the pointer.
It draws a straight ghost from the end that stays, and it outlines the part under the pointer, all on the DOM.

When the user lets go, `endDropAction` turns the drop into one action.
The action is one of these:

- A connection end moved to another part (`reconnected`).
- A link end moved.
- An arrow end attached again.

The app draws a connection with a moved end where the user put it, in the color of the user.
The original connection stays under it at 60% opacity.
If the user drops the end back on its original part, the app removes the edit.
The connection view in the sidebar has the same moves as pickers, for the keyboard.

## The sidebar

Under Details, the sidebar shows the overview or the selection.
It shows a Review tab while a new revision, a note, or an answer needs a look.
The app keeps the width of the sidebar (300 to 520) and whether it is open, for each browser.
On a screen 760 px wide or less, the sidebar is a bottom sheet with three stops.
The user drags the sheet by its header only.

## Feedback and answers

Send to agent (`src/app/SendMenu.tsx`) is the primary action of the top bar.
Its keys are `Cmd+Enter` or `Ctrl+Enter`.
It opens a popover that shows what will go.
It then writes `.anatomy/feedback.json` and copies a short prompt.

If the user opened the board as a file or as an example, the app downloads `feedback.json` instead.
The prompt then says that the file is in the Downloads folder.
The copy starts first, inside the press, because browsers allow a copy only there.
The app writes the agent files (see [Repository folder](#repository-folder-chrome-and-edge)) on the first send.
It replaces each one when the format changes, unless the user removed its mark.

### The feedback file

The function `buildFeedback` in `src/feedback/build.ts` turns the layer into an `anatomy-feedback` file, version 1.
Each item says what the user meant in board terms.
The items are of these kinds:

- A note or question about a target, with a snapshot of that target.
- A link between parts.
- A connection with its old and new ends.
- A new part with its links and neighbors.
- Drawings, described as what they enclose, touch, or point at.

Marks are read against the lines that the map draws, routed around the cards.
The map passes these lines in as its scene.
An arrow end on a connection says where along the connection it is (`at`, 0 to 1).

A send holds every item that is new or changed since the last send.
It also holds every item that was sent before and still has no answer.
For this reason, a second send never drops what the first send held.
The file lists deleted items that were sent before as withdrawn.
The app skips a drawing with no note that touches nothing, and the popover lists it with a way to select it.

### The answers

The agent answers in the `responses` of the next board revision.
When a revision opens, `receiveAnswers` in `src/layer/edits.ts` keeps each answer in the layer next to its item.
For this reason, a later revision without answers does not lose it.

An adopted item moves to the archive when the answer names what changed and every named ID is on the board.
Otherwise, it stays with its answer.
Declined and answered items keep their answer until the user dismisses them.
Dismissing them archives them as one step of undo.

The app never takes in an answer twice.
For this reason, an item restored from the archive stays restored when the same revision opens again.

The Review tab lists these things:

- The answers.
- The items that the agent adopted in this revision.
- Each moved connection with its old ends.
- The ends that the user asked for, and whether the board now has them.
- The rest of the archive, which the user can restore.

## Export file

```json
{ "format": "anatomy-export", "schemaVersion": 2, "exportedAt": "...", "board": { }, "layer": { } }
```

The app opens a bare board file of up to 1,000,000 bytes.
It also opens an export file of up to 2,000,000 bytes.
A version 1 export file holds an `overlay` instead of a `layer`, and the app upgrades it when it opens.
An export file is valid only if the `boardId` of the layer matches the `id` of the board.

The app checks the size of a file before it reads the file.
`readFileText` in `src/app/openFile.ts` refuses a picked or dropped file over 2,000,000 bytes without calling `text()`.
`read` in `src/workspace/folder.ts` does the same for the files in `.anatomy`, and throws a `FileTooLargeError` when a file is over its limit.
The limit is 1,000,000 bytes for `board.json`, 16,000,000 bytes for `layer.json`, and 2,000,000 bytes for every file Anatomy writes itself (the README, the guide topics, the schema, and `anatomy.mjs`).
A board that is too large is reported like any other board that cannot open, and the watcher does not look at it again until it changes.
A layer that is too large stops the board from opening and is left as it is.
A helper file that is too large is taken to be the user's own, and is kept.

## Where the work is kept

There is one workspace for each repository.
The app can keep the workspace in two ways.

### Repository folder (Chrome and Edge)

The user opens the repository folder with the File System Access API.
The app uses these files in the folder:

| File | Written by | Purpose |
| --- | --- | --- |
| `.anatomy/board.json` | The agent | The board. The app only reads it. |
| `.anatomy/layer.json` | The app | The user layer, saved a moment after each change. |
| `.anatomy/layer.backup.json` | The app | A layer file that the app cannot read, kept before a new one starts. |
| `.anatomy/feedback.json` | The app | What the user sends to the agent. |
| `.anatomy/README.md` | The app | The short core for agents: the files, the commands, the rules an agent must keep, and the topic index. |
| `.anatomy/guide/<topic>.md` | The app | One topic of the authoring guide, read on demand. |
| `.anatomy/board.schema.json` | The app | The JSON Schema of a board, with a `$comment` mark as its first key. |
| `.anatomy/anatomy.mjs` | The app | The `anatomy` tool that checks a board. See below. |

The app keeps the folder handle in IndexedDB.
After a reload, the app opens the folder again if the browser still allows it.
Otherwise, the app shows "Reopen" with the folder name, because the browser needs a click to ask again.
If `board.json` is missing, the app says so and points to "How to make a board".

While the page is visible, the app looks at `board.json` every 2 seconds.
It also looks at it when the window gains focus.
Each look compares the modification time and the size of the file.
The app reads the file only after the file stayed the same for two looks in a row.
It opens the file only if the file is valid and its `revision` is higher.
A new revision goes through the update review.
A look never shows an error.

The app writes `README.md`, the topics in `guide/`, `board.schema.json`, and `anatomy.mjs` when the user clicks **Copy prompt** or sends feedback.
It also writes them once each time a folder that has a `.anatomy` board opens, so a clone or an update of Anatomy does not leave them missing or old.
This runs in the background after the board shows, and only when the app has write permission for the folder.
A failure there is ignored and never stops the open.
A file without the marker is always the user's and is never replaced, even when its text equals Anatomy's.
A folder with no board is not written until the user clicks **Copy prompt**.
Each starts with a marker line, or for the JSON Schema a `$comment` key.
The app replaces a file that has the marker when its text changes, and leaves a file without the marker alone.
`src/app/agentReadme.ts` holds the README core and builds every one of these files except the script.
The README text never changes between writes, with no date and no counter, so an agent harness that caches a stable prompt prefix can reuse it.

The topics come from `docs/authoring-guide.md` and nowhere else.
`src/cli/topics.ts` maps each topic to one or more `##` sections of the guide and takes them word for word, without the section numbers.
A test fails when a section has no topic, so a new heading cannot drop out of the agent's text.
The section of prompts for people is the one part that no topic takes.

The folder layer writes only inside `.anatomy` and in one folder below it, `.anatomy/guide`.
`filePath` in `src/workspace/folder.ts` turns a file name into that place and refuses any other name, such as one with `..`, a slash in the wrong place, or a hidden file.
The browser folder, the in-memory folder, and the end-to-end test folder all call it.

`anatomy.mjs` is `bin/anatomy.ts` and everything it imports, bundled into one file of about 148 KB.
It also carries, as text, the guide sections that the topics use and the field list `schema/board.v1.fields.txt`, so `topic` and `schema` need no other file.
`bin/anatomy.test.ts` holds it under 150,000 bytes.
The Vite plugin in `scripts/lib/cliBundle.ts` builds it during the dev server, the build, and the tests, and serves the text as `virtual:anatomy-cli`.
The app loads that module only when it writes the file, so the tool adds nothing to the first load.
The tool and the app run the same `parseBoard`, and `bin/anatomy.test.ts` runs the bundle in Node on every board in the repository to prove that they agree.

The folder sits behind the `Folder` interface in `src/workspace/folder.ts`.
Unit tests use the in-memory folder in `src/workspace/memoryFolder.ts`.

End-to-end tests build the app with `vite build --mode e2e`.
That build includes `src/workspace/testFolder.ts`.
It is a folder kept in `localStorage`, and it stands in for the folder picker when a test sets the key `anatomy:test-folder`.
Every other build leaves it out.

### This browser (other browsers, examples, single files)

The user opens a board file or an example.
The app keeps the board and its layer in IndexedDB, with the board ID as the key.
The Open menu lists the boards saved in this browser.

### Storage

IndexedDB holds one database, `anatomy`.
It has three stores:

- `boards`.
- `layers`.
- `meta`, which holds what was opened last and the folder handle.

The app leaves the databases of earlier versions, `anatomy-home` and `anatomy-work`, as they are and does not read them.
The toolbar shows the save state: saved, saving, or not saved.
A tooltip says where the layer went.
If saving fails, the app keeps the work in memory and offers an export.

## Opening a board that is already open or saved

This section applies if a board with the same ID is open or saved in this browser.
The app does these steps:

1. The new base board replaces the old base board.
2. The layer stays.
3. The app compares the old and new base boards and shows what was added, removed, and changed.
4. Notes on changed parts show as possibly outdated, and notes on removed parts show in a needs-relinking list.

Sometimes the opened file is an export file, and this browser already has a different layer with work in it for that board.
In that case, the app asks which layer to keep.
Neither choice merges the two layers.

## What loads first

The first script holds React, Base UI, Zod, the app shell, the sidebar, the Overview, the layout and the line routing, and React Flow's core with its D3 helpers.
The sidebar, the command menu, and the Overview use the layout and routing code, so it stays here.
These load on their own scripts:

- the map view: React Flow's components, the cards and lines, and the whiteboard tools (drawing, notes, and the tool bar), when a board opens;
- each example board, when the user opens it;
- the how-to dialog, on first use;
- the text of the files written into `.anatomy/` (the README, the guide, the schema), when the app writes them;
- a lesson, and the bundled `anatomy` tool, on first use.

`src/app/examples.ts` is the index of the examples: the title, the description, the file name, the board ID, and a `load` function for each.
`src/app/examples.test.ts` checks it against the board files.
The start screen lists the examples from the index and loads no board.
After the first paint (the load event, then two animation frames, then an idle moment), the app fetches the map and the example boards, so a board opens at once and still opens if the server has stopped.
If a script cannot load, the user sees a short notice, and the rest of the app keeps working.
Sending feedback to a folder still writes `feedback.json` when the text of the `.anatomy/` files cannot load.

`scripts/firstLoad.test.ts` builds the app and checks that the first script holds no example board, no part of the command line tool, and no map view, that it does not load any of them at start, and that it stays under a byte budget.

## The hosted copy

The hosted copy is the built app on GitHub Pages, at https://snitilf.github.io/Anatomy/.
It is the same app, and it has no server of its own.

`npm run build:pages` builds it into `dist-pages/` with the Vite base path `/Anatomy/`.
Every other build, the dev server, and the browser tests keep the base path `/`.
`.github/workflows/pages.yml` builds and deploys it on each push to `main` and when someone runs it by hand.
Its jobs run only while the repository is public.
Once, after the repository is public, set Source to GitHub Actions under Settings, Pages.

Nothing in the app assumes that it sits at the root of the site.
Vite writes the base path into `index.html`, the font addresses in the stylesheet, and the entry script's preload helper.
The map and the example boards load as scripts, by a path relative to the script that asks for them.
The app keeps the path of its own page when it changes the address.
The Content Security Policy is the same, so the page requests only its own files, and every one of them is under `/Anatomy/`.

`e2e/pages.spec.ts` builds the app with `npm run build:pages` and serves it under `/Anatomy/` on the loopback interface (`scripts/lib/subpathServer.ts`).
That server answers 404 for anything outside the subpath, as GitHub Pages does.
For each example, the test fails on a console error, on a policy violation, on a response with an error status, and on a request outside the subpath.

What works on the hosted copy, checked in Chrome:

- **Examples and files.** Every example opens.
  So does a board file you pick.
  Notes, links, drawings, undo and redo, and your layer are kept in this browser, as with a local copy.
- **Open folder.** Chrome and Edge open the project folder from the https page.
  Anatomy reads the folder and writes only inside `.anatomy`.
  It watches `board.json`, and "Reopen" works after a reload.
- **Copy prompt and Send.** Both copy the prompt to the clipboard.
  With a folder open, Send writes `.anatomy/feedback.json` and the agent files.
  With an example or a file, Send downloads `feedback.json`.
- **Other browsers.** They open examples and files, and Send downloads `feedback.json`, as with a local copy.

The browser keeps work for each site, so work on the hosted copy is not in a copy that runs on `127.0.0.1`.
Your agent still runs on your machine.
It reads `.anatomy/` in your folder, or the file that Send downloaded, because the hosted page has no other way to reach it.

## Safety

The app has these safety rules:

- The app renders board text as React text nodes. A small local parser reads the Markdown subset and never uses `innerHTML`.
- The app shows paths in references as text and never opens them.
- The app makes no network requests after the page loads, except for its own files from the same origin: the map view, the example boards, the how-to dialog, the text of the `.anatomy/` files, a lesson, and the `anatomy` tool load on their own scripts. Inter is bundled with the app.
- The built app carries a Content Security Policy in a meta tag: `default-src 'self'; script-src 'self'; connect-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`.
  The build adds it (`scripts/lib/csp.ts`, applied only to `vite build`, including the `e2e` mode), and the dev server does not have it.
  No script can run unless it is a file from the same origin, no code can send a request, and the page cannot be given a plugin, a new base URL, or a form target.
  The theme script is `public/theme.js`, loaded in the head, so it still runs before the first paint.
  `style-src` keeps `'unsafe-inline'` on purpose.
  The toast library writes a style sheet at run time, and the map writes style rules for the card under the pointer and for a selected bundle, so an inline style cannot be avoided.
  Allowing the toast sheet by its hash would break when the library updates and would not cover the map rules.
  A style cannot reach the network under this policy, because `connect-src`, `img-src`, and `font-src` stop a `url()` in it from loading anything from another origin.
  `src/main.tsx` imports `src/cli/jitless.ts` first, which turns off the code generation of Zod, because the policy blocks `new Function`.
  Keep that import first and keep the file in the app.
  `frame-ancestors` is not in the policy, because a browser ignores it in a meta tag.
  The browser tests record every `securitypolicyviolation` event and fail on any (`e2e/test.ts`).
- The `anatomy` tool imports only `node:fs`, `node:path`, and `node:url`. It reads the board, the `feedback.json` next to it, and a patch, only as regular files and with a size cap, writes only the board and its `board.prev.json` (`fmt` and `apply`, each through a new file that must not exist yet, renamed over the old one), and never runs anything from them. A patch path may not contain `__proto__`, `constructor`, or `prototype`, and a patch is capped at 500 operations, 1,000,000 bytes, and 16 levels. Its first import, `src/cli/jitless.ts`, turns off the code generation of Zod before any schema loads, so it never calls `Function`. A test runs the bundle with `Function` trapped to prove it.
