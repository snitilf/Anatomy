# Architecture

Anatomy is a static browser app.
It has no server code, no accounts, and no network calls after the page loads.
All board processing happens in the browser tab.

## Two layers of data

A board has two layers that are stored and exported separately:

| Layer | Written by | Contents |
| --- | --- | --- |
| Base board | An agent or a person, outside the app | Parts, connections, items, scenarios. See [board-format.md](board-format.md). |
| Human overlay | The user, inside the app | Card positions, notes, questions, manual links, review marks. |

The app never edits the base board.
When an updated base board arrives, the overlay stays, and the app compares the overlay with the new base.

## Modules

| Folder | Owns | Depends on |
| --- | --- | --- |
| `src/board/` | Board schema, validation, JSON Schema export. | `zod` |
| `src/overlay/` | Overlay schema, content fingerprints, board comparison, note status, placement of new cards, export files. | `src/board/` |
| `src/persistence/` | IndexedDB storage per namespace (home, work). | `src/board/`, `src/overlay/` |
| `src/text/` | Safe renderer for the Markdown subset. | `react` |
| `src/lessons/` | Built-in lesson catalog and lesson components. | `react` |
| `src/app/` | App state (one pure reducer in a zustand store, read through selectors), shell, toolbar, dialogs. | all of the above |
| `src/canvas/` | React Flow map: cards, group areas, connections, manual links. | `@xyflow/react`, `src/app/` |
| `src/inspector/` | Plain-English panel for the selection. | `src/app/`, `src/text/` |
| `src/scenarios/` | Walkthrough player: step state, highlights, captions. | `src/app/` |
| `src/notes/` | Notes, questions, manual links, and the review of notes after an update. | `src/overlay/`, `src/app/` |

Logic lives in pure functions with unit tests.
While a card is dragged, only the connections of that card are redrawn with simple curves.
After the drop, one full layout pass routes the connections and places the labels.
Connections whose cards did not move keep their route and label when those are still clear.
The default layout places groups in columns 440 units apart and cards in rows 240 units apart.
When a board opens, every card position is saved in the overlay, so a later revision never moves an existing card.
React components read from the app state and dispatch actions.

## Human overlay, version 1

```ts
interface Overlay {
  format: 'anatomy-overlay'
  schemaVersion: 1
  boardId: string
  positions: Record<string, { x: number; y: number }> // by component ID
  notes: Note[]
  manualLinks: ManualLink[]
}

type Target = { type: 'board' } | { type: 'component' | 'relationship'; id: string }

interface Note {
  id: string // "note-" + random
  kind: 'note' | 'question'
  text: string // 1 to 2000 characters, plain text
  target: Target
  targetFingerprint: string // fingerprint of the target when the note was written or last confirmed
  createdAt: string // ISO date
  updatedAt: string
}

interface ManualLink {
  id: string // "link-" + random
  from: string // component ID
  to: string // component ID
  label: string // 0 to 60 characters
  createdAt: string
}
```

Note status is computed, never stored:

- `current`: the target exists and its fingerprint matches.
- `possibly-outdated`: the target exists but its content changed since the note was written or confirmed.
- `needs-relinking`: the target no longer exists in the base board.

A manual link whose endpoint is missing is also `needs-relinking`.
The app never deletes or moves a note or link by itself.

A fingerprint is a short hash of the meaning of a part or connection, without its position.
For a component it covers label, summary, explanation, group, inputs, outputs, and source.
For a relationship it covers from, to, kind, label, explanation, and source.
For the board it covers title, goal, and scope.

## Export file

```json
{ "format": "anatomy-export", "schemaVersion": 1, "exportedAt": "...", "board": { }, "overlay": { } }
```

The app opens a bare board file (up to 1,000,000 bytes) or an export file (up to 2,000,000 bytes).
An export file is valid only if the overlay's `boardId` matches the board's `id`.

## Opening a board that is already saved

If the namespace already has a board with the same ID:

1. The new base board replaces the old base board.
2. The overlay stays.
3. The app compares the old and new base boards and shows what was added, removed, and changed.
4. Notes on changed parts show as possibly outdated, and notes on removed parts show in a needs-relinking list.
5. New cards get a free position. Existing cards do not move.

If the opened file is an export file, and the namespace already has a different overlay with notes, links, or moved cards for that board, the app asks which overlay to keep.
Neither choice merges the two overlays.

## Storage

Each namespace is a separate IndexedDB database: `anatomy-home` and `anatomy-work`.
A board saved in one namespace is never visible in the other.
Saving happens a short time after each change.
The toolbar shows the save state: saved in this browser, saving, or not saved, next to the Home and Work switch.
The Open menu lists the boards saved in the current space, the examples, and a file picker.
If saving fails, the app keeps the work in memory and offers an export.

## Safety

- Board text is rendered as React text nodes.
  The Markdown subset is parsed by a small local parser, never through `innerHTML`.
- Paths in references are shown as text and never opened.
- The app makes no network requests after the page loads.
  Fonts are system fonts.
