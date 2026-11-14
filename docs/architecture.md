# Architecture

Anatomy is a static browser app.
It has no server code, no accounts, and no network calls after the page loads.
All board processing happens in the browser tab.

## Two layers of data

A board has two layers that are stored separately:

| Layer | Written by | Contents |
| --- | --- | --- |
| Base board | An agent or a person, outside the app | Parts, connections, items, scenarios, and answers to feedback. See [board-format.md](board-format.md). |
| User layer | The user, inside the app | Moved cards, card sizes, notes, questions, links, drawings, proposed parts, moved connection ends, and resolved items. |

The app never edits the base board.
When a new revision arrives, the layer stays, and the app compares the layer with the new base.

## Modules

| Folder | Owns | Depends on |
| --- | --- | --- |
| `src/board/` | Board schema (including `responses`), validation, JSON Schema export. | `zod` |
| `src/layout/` | Geometry (point, size, rect), the layered layout, card sizes, push apart, and a rect per card from the user's positions and sizes. | `src/board/`, `@dagrejs/dagre` |
| `src/layer/` | User layer schema, version 1 upgrade, every edit as a pure function, fingerprints, board comparison, note status, export files. | `src/board/`, `src/layout/` |
| `src/feedback/` | The `anatomy-feedback` format and the pure builder that turns a layer into feedback. | `src/layer/`, `src/layout/` |
| `src/workspace/` | Where work is kept: the one IndexedDB database, the repository folder behind a small interface, the save queue, and the board watcher. | `src/board/`, `src/layer/` |
| `src/text/` | Safe renderer for the Markdown subset. | `react` |
| `src/lessons/` | Built-in lesson catalog and lesson components. | `react` |
| `src/app/` | App state (one pure reducer in a zustand store, with undo history), the screen state (sidebar, menus), the workspace provider, shell, top bar, empty states, dialogs. | all of the above |
| `src/commands/` | The one list of commands, their keys, the command menu, and the single key listener. | `src/app/`, `src/canvas/` |
| `src/canvas/` | React Flow map: cards, group areas, connections, user links. | `@xyflow/react`, `src/app/` |
| `src/inspector/` | The sidebar: the overview, a view for every kind of selection, the flow block, notes and the agent's answers, the Review tab, and the bottom sheet on a phone. | `src/app/`, `src/commands/`, `src/text/` |
| `src/scenarios/` | The walkthrough bar: step state, highlights, captions. | `src/app/`, `src/commands/` |
| `src/notes/` | Note targets in words, the review counts after an update, and the undo toast. | `src/layer/`, `src/app/` |
| `src/theme/` | Theme choice (system, light, dark), stored in `localStorage` and applied as `data-theme` on `<html>`. An inline script in `index.html` applies it before the first paint. | `react` |
| `src/styles/` | Design tokens: colors for both themes, type scale, spacing, radii, and the one shadow for floating surfaces. | none |

Logic lives in pure functions with unit tests.
React components read from the app state and dispatch actions.

## Cards and the map

Every card has a rect: its position and its size.
`placeCards` in `src/layout/cards.ts` gives the rect of every card.
A position the user set wins, then the board's position, then the layered layout.
A size the user set wins over the size of the card's text (`contentSize`: 240 wide, at least 112 tall, on an 8 px grid).
A resized card stays between 224 by 112 and 480 by 320.
Only the cards the user moved or resized are stored, so the other cards follow the layout each time a board opens.

The layout (`src/layout/autoLayout.ts`) is a left-to-right flow from the connections, made with dagre in two passes.
The members of each group are laid out first, then each group is one block among the loose cards.
Connections in both directions between two blocks count in the direction of the block the board lists first.
Pieces that no connection joins are packed in rows toward a screen-like shape.
The layout uses each card's text size, never a size the user set, so a resize never moves the other cards around.
When some cards have a board position, the rest are laid out as a block to their right.
A card the layout placed never stays under a card with a fixed position: `pushApart` in `src/layout/push.ts` moves it aside.

A drop or a resize that covers other cards pushes them aside along the shorter way out, 40 units away, for at most three rounds.
A pushed card prefers a free spot and its own group area, and never lands on a card that has settled.
The dropped card and every pushed card are saved in one action, so one undo puts them all back.

Routing, labels, group areas, and the camera all read the card rects, never a fixed card size.
Every connection is made of straight runs with rounded corners (`src/canvas/routing.ts`).
A connection is a straight run when its ends line up, else an elbow on a free track of the gap between the cards, else a path found with A* around the cards.
The search charges for turns, for running along or across a line already drawn, and for passing through a group area neither end belongs to.
Each gap between cards has up to three tracks, so parallel lines do not run on top of each other.
While a card is dragged or resized, only its connections are redrawn, as plain elbows, and their labels hide.
After the drop, one full layout pass routes the connections and places the labels, which keep off every card, line, and other label.
Connections whose cards did not move or change size keep their route and label when those are still clear.

The camera (`src/canvas/camera.ts`) keeps the map inside limits worked out from the content: cards, group areas, marks, and proposed parts.
The map zooms out only until the whole content fits, never needing more than 100%, and in to 200%.
Panning stops a margin past the content.
Every camera move the app makes goes through `clampViewport`, because React Flow applies the limits only to the user's own panning.
Opening a board fits it when the fit leaves text readable (60% or more), else it shows the start of the flow at 80%.
On a crowded map, connection labels below 90% show only for the selection and for the card under the pointer.

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
  archive: ArchiveEntry[] // items the agent resolved, each with its answer, restorable
  sent?: Sent // what was sent to the agent so far, to send only what is new or changed
}
```

The Zod schema in `src/layer/model.ts` is the source of the types.
It caps every list, the points of a stroke (2000), text lengths, and coordinates.
IDs of the user's items have a prefix: `note-`, `link-`, `mark-`, `part-` (proposed part), `edit-` (reconnect), and `feedback-`.
A part is a component of the board or a proposed part, so links, arrows, and moved connection ends can join either.
A stroke is simplified to about 0.75 units before it is stored.

A version 1 overlay (`anatomy-overlay`) and a version 1 export file still open.
`readLayer` upgrades them: `manualLinks` become `links`, and a stored position that equals where the layout puts the card is dropped, because version 1 froze every position when a board opened.

Note status is computed, never stored:

- `current`: the target exists and its fingerprint matches.
- `possibly-outdated`: the target exists but its content changed since the note was written or confirmed.
- `needs-relinking`: the target no longer exists in the base board.

A link whose part is missing is also `needs-relinking`.
The app never deletes or moves a note or link by itself.

A fingerprint is a short hash of the meaning of a part or connection, without its position.
For a component it covers label, summary, explanation, group, inputs, outputs, and source.
For a relationship it covers from, to, kind, label, explanation, and source.
For the board it covers title, goal, and scope.

## Undo and redo

The app state keeps a history of earlier layers: up to 100 steps, in memory, for the open board.
Every change to the layer is one step: a drop (one or more cards), a run of arrow keys, a resize, and every note, link, mark, proposal, reconnect, or archive change.
Selection, tool, theme, camera, and walkthroughs are not part of the history.
Opening a revision and sending feedback are barriers: nothing before them can be undone.
After an undo or redo, an item that came back is selected, and a selection whose item went away is cleared.
Cmd or Ctrl with Z undoes; with Shift, or Ctrl+Y, it redoes.
Text fields and dialogs keep their own undo.

## Commands

Every user action with a name is one entry in `COMMANDS` in `src/commands/list.ts`: an ID, a group, a label, an icon, its keys, and when it shows and is enabled.
The command menu (Cmd or Ctrl with K), the top bar buttons, the tooltips, and the keys all read that one list, so a new action lands in one place.
`useCommand(id)` gives a button the label, the printed shortcut, the state, and a way to run it.
One `keydown` listener, in the capture phase on the document, runs the shortcuts.
A single key does nothing while a text field, a dialog, a menu, or a popover has focus, and Cmd or Ctrl shortcuts leave text fields to their own keys.
The single keys of the whiteboard tools (V, H, P, R, O, A, T, S, N) are kept free for them.
Commands made from what is open, such as one per example, walkthrough, part, and connection, come from `boardCommands`.

## The sidebar

The sidebar shows the overview or the selection under Details, and a Review tab while a new revision, a note, or an answer needs a look.
Its width (300 to 520) and whether it is open are kept per browser.
On a screen 760 px wide or less it is a bottom sheet with three stops, dragged by its header only.

## Feedback

`buildFeedback` in `src/feedback/build.ts` turns the layer into an `anatomy-feedback` file, version 1.
Each item says what the user meant in board terms: a note about a part, a link between parts, a connection with its old and new ends, a new part with its links and neighbors, and drawings as what they enclose, touch, or point at, measured against the card rects.
Only items that are new or changed since the last send go in; deleted items that were sent before are listed as withdrawn.
A drawing with no note that touches nothing is skipped, and the result says so.
The agent answers in the `responses` of the next board revision.

## Export file

```json
{ "format": "anatomy-export", "schemaVersion": 2, "exportedAt": "...", "board": { }, "layer": { } }
```

The app opens a bare board file (up to 1,000,000 bytes) or an export file (up to 2,000,000 bytes).
A version 1 export file holds an `overlay` instead of a `layer`, and is upgraded when it opens.
An export file is valid only if the layer's `boardId` matches the board's `id`.

## Where the work is kept

There is one workspace per repository, and two ways to keep it.

### Repository folder (Chrome and Edge)

The user opens the repository folder with the File System Access API.

| File | Written by | Purpose |
| --- | --- | --- |
| `.anatomy/board.json` | The agent | The board. The app only reads it. |
| `.anatomy/layer.json` | The app | The user layer, saved a moment after each change. |
| `.anatomy/layer.backup.json` | The app | A layer file that could not be read, kept before a new one starts. |
| `.anatomy/feedback.json` | The app | What the user sends to the agent. |
| `.anatomy/README.md` | The app | Format notes for agents. |

The folder handle is kept in IndexedDB.
After a reload the app opens the folder again when the browser still allows it, and otherwise shows "Reopen" with the folder name, because asking again needs a click.
If `board.json` is missing, the app says so and points to "How to make a board".

While the page is visible, the app checks `board.json` every 2 seconds and when the window gains focus.
It compares the modification time and size, reads the file only after it stayed the same for two checks, and opens it only when it is valid and its `revision` is higher.
A new revision goes through the update review.
A check never shows an error.

The folder sits behind the `Folder` interface in `src/workspace/folder.ts`.
Unit tests use the in-memory folder in `src/workspace/memoryFolder.ts`.
End-to-end tests build the app with `vite build --mode e2e`, which includes `src/workspace/testFolder.ts`: a folder kept in `localStorage` that stands in for the folder picker when a test sets the key `anatomy:test-folder`.
Every other build leaves it out.

### This browser (other browsers, examples, single files)

The user opens a board file or an example, and the board and its layer are kept in IndexedDB, keyed by board ID.
The Open menu lists the boards saved in this browser.

### Storage

IndexedDB holds one database, `anatomy`, with the stores `boards`, `layers`, and `meta` (what was opened last, and the folder handle).
The databases of earlier versions, `anatomy-home` and `anatomy-work`, are left as they are and not read.
The toolbar shows the save state: saved, saving, or not saved, with where the layer went as a tooltip.
If saving fails, the app keeps the work in memory and offers an export.

## Opening a board that is already open or saved

If a board with the same ID is open or saved in this browser:

1. The new base board replaces the old base board.
2. The layer stays.
3. The app compares the old and new base boards and shows what was added, removed, and changed.
4. Notes on changed parts show as possibly outdated, and notes on removed parts show in a needs-relinking list.

If the opened file is an export file, and this browser already has a different layer with work in it for that board, the app asks which layer to keep.
Neither choice merges the two layers.

## Safety

- Board text is rendered as React text nodes.
  The Markdown subset is parsed by a small local parser, never through `innerHTML`.
- Paths in references are shown as text and never opened.
- The app makes no network requests after the page loads.
  Inter is bundled with the app.
