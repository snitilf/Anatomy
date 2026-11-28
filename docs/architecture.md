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
| User layer | The user, inside the app | Moved cards, card sizes, the places the map holds cards at, notes, questions, links, drawings, proposed parts, moved connection ends, and resolved items. |

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
| `src/scenarios/` | The walkthrough bar: step state, highlights, captions, its Previous, Next (Done on the last step), and Close controls, and its one line that says nothing runs. | `src/app/`, `src/commands/` |
| `src/notes/` | Note targets in words, the review counts after an update, and the undo toast. | `src/layer/`, `src/app/` |
| `src/theme/` | Theme choice (system, light, dark), stored in `localStorage` and applied as `data-theme` on `<html>`. An inline script in `index.html` applies it before the first paint. | `react` |
| `src/styles/` | Design tokens: colors for both themes (checked for contrast in `tokens.test.ts`, faded line labels on the group washes included), type scale, spacing, radii, the control and row sizes (each larger under a coarse pointer), and the one shadow for floating surfaces. | none |

## Controls

One file owns each kind of control, and every other style sheet reaches it through a shared class.
`src/app/buttons.module.css` owns the buttons.
`src/app/rows.module.css` owns the list rows.
`src/app/Segmented.tsx` and `Segmented.module.css` own the segmented control.

A button has a variant and a size.
The variants are the default (secondary), `primary` for the one main action of a surface, `quiet` for toolbars and icon buttons, and `link` for a word that acts, which is underlined at rest.
The sizes are `small`, the default, and `large`, and `icon` makes a button square.
Each size reads its height from `--control-sm`, `--control-md`, or `--control-lg` in `src/styles/tokens.css`: 24, 28, and 32 px with a fine pointer, and 32, 36, and 44 px with a coarse one.
The area that answers a press grows to `--hit` around the button without changing how it looks.
A row reads its height from `--row-sm` or `--row-md` in the same way.

A control answers a press at once: the fill changes on pointer-down with no transition, and a button also scales to 0.97, except with reduced motion.
Hover applies only to a fine pointer.
A disabled control is dimmed to half and has no hover or press.
A control that is off but must keep focus, such as Previous on the first step, uses `aria-disabled`.

`Segmented` is a tablist for views or a radiogroup for a choice.
It has one stop in the tab order.
The arrow keys move focus and the selection together, skip a disabled segment, and wrap.

`src/styles/controls.test.ts` counts the hand-written `appearance: none` rules and the hand-written 28 px heights outside the three owner files.
`src/styles/controls.baseline.json` holds the most that it allows, and each change that moves a control onto the shared classes lowers it.
The remaining menus, command palette, and popover controls read their row heights and button variants from the shared control tokens.
Rows and controls eliminate hover-in delay transitions so they respond immediately on pointer-enter, while retaining smooth hover-out exits.
Letter tracking tokens (`--tracking-title`, `--tracking-heading`, `--tracking-label`) apply to titles, section headings, and control labels.

## The top bar

The top bar (`src/app/TopBar.tsx`) is 40 px high and laid out as a three-zone grid (`minmax(0, 1fr) auto minmax(0, 1fr)`).
The left zone holds the brand mark and source name (which open the Open menu), the breadcrumb trail (`src/app/BoardCrumbs.tsx`), and the save status when it has something to say.
`measureCrumbRoom` in `src/app/crumbRoom.ts` measures the left zone alone so the trail folds before it crowds the center switch.
The center zone holds the segmented `Map | Overview` switch (`src/app/ViewTabs.tsx`), which stays fixed in the middle of the bar regardless of title, selection, or count.
The right zone holds Search, Send to agent (which reserves room for its count chip, and reads "Waiting for the agent" after a send until the agent writes back), the sidebar toggle (which keeps its 28 px slot hidden on the Overview so neighbors do not shift), and Settings.
On a phone, the left zone shows the mark and chevron as the Open menu trigger, the center holds the view switch, and the right holds Search, Send, and Settings.
The Open menu and the command menu both offer a Start screen action that closes the board and moves focus to the start screen's primary button.
The start screen's lead line is the page `h1`, and while the map is open a visually hidden `h1` holds the board title instead of the 13 px breadcrumb.

## Cards and the map

Every card has a rect, which is its position and its size.
The function `placeCards` in `src/layout/cards.ts` gives the rect of every card.
A position that the user set wins.
The position in the board comes next, then the place the map holds the card at (see [A new revision](#a-new-revision)), and the layered layout comes last.

A size that the user set wins over the size of the text in the card.
That text size is `contentSize`: 240 wide, at least 112 tall, on an 8 px grid.
A resized card stays between 224 by 112 and 480 by 320.
The app stores the cards that the user moved or resized.
Until the map has to hold still, the other cards follow the layout each time a board opens.

A card shows its summary in as many lines as fit (`summaryLinesFor`).
The count of the user's notes takes no row from the summary: at the full level it sits in the top right corner, beside the first line of the title.
A card with a lesson keeps one footer row for the lesson mark, and the count joins the mark there.
At the title level the count sits under the title.

### Where a walkthrough starts

A part where a walkthrough starts carries a small play mark inside its card.
A walkthrough starts at the first thing its first step is about: that part, or the part a connection runs from.
A first step about nothing is about the whole board, so that walkthrough marks no part.
When several walkthroughs start at one part, the part carries one mark.
`flowStarts` in `src/scenarios/starts.ts` works it out, and the description of the part for a screen reader says "Starts the walkthrough" and its title after the summary.

The mark is quiet and in the family of the lesson icon: an outlined circle, 14 px on screen, with a play shape, in `--fg-3`.
It is a shape and a border and has no fill, so it reads without color, and under forced colors it takes the text color of the system.
It keeps its size on screen at every detail level, the way a label does.
It sits inside the card, so it dims and lifts with the card, and nothing that keeps off the card can cover it.

A line label can still land on a card in a crowded gap, so the mark takes the first of the top right, the top left, and the bottom right corner that no line label covers at any zoom from 100 percent down to the far end of the title level (`startCorner`, from `freeCorner` in `src/canvas/startMarks.ts`).
A card whose count of notes sits in its top right corner (a card with notes and no lesson, at the full level) offers the mark only the top left and the bottom right (`cardCorners`), so the two never overlap.
A title that would run into a mark at the top leaves it 4 px of room at every zoom.
In the far view a tile has no text but its name, so the mark is drawn by the far layer inside the tile, at the bottom right or left, as large as fits from 14 px down to 11 px, clear of the names of the groups.
A tile too low for a mark has none.
`e2e/flow-start.spec.ts` checks that no mark leaves its card or touches a label, a group name, a count, a note dot, or a word of the card.

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

### A new revision

A new revision of the open board keeps the map still (D144).
When a revision adds, removes, or changes parts or connections, `placeRevision` in `src/layer/places.ts` stores where every card was drawn in the layer, as `placed`.
From then on `placeCards` does not run the layout: every card keeps its place, so no card that survives moves against the others.
The layout stays a pure function of the board and these places, and never reads the window size.

A part that the revision added has no place yet.
`placeBeside` in `src/layout/beside.ts` puts it next to a neighbor on the map: a part it is joined to, in its own group first, or else a part of its group.
It takes the nearest free spot along the flow, so a part that a line runs to sits to the right of where the line starts, with room for the label of that line, and never above it while a spot along the flow is free.
Beside its neighbor it may sit up to 64 units higher or lower, so a gap a few units short still takes it.
A spot is free when the card keeps 48 units from every card, from the places of the removed parts, and from the user's sticky notes, text, and proposed parts, stays out of the areas of other groups, and its own group's area, grown to take it in, covers no card that it did not cover before.
A part with no neighbor on the map goes to the right of everything.
A part that the revision moved to another group leaves its place, and any move the user made of it, and is placed like a new part, beside its new group, and its marks go with it.

The one exception to holding still: the board is tidied, with undo, when a new part has no room.
When a new or regrouped part finds no free spot in or beside its own group, its group's area would reach over another group.
The revision then lays the whole board out again, exactly as Tidy layout does, and marks and proposed parts go with the card they cover most.
The toast "Layout tidied to make room for new parts" says so and offers Undo, and one step of undo, from the toast or the keys, goes back to the still layout with the new part where it found a place.
The board is framed whole in both.
Its place is stored with the others when the revision opens, so it never moves later.
A card whose new text makes it taller pushes aside the held cards that it now covers.

Marks, text, sticky notes, and proposed parts are stored in board coordinates.
For this reason, the first mark or proposed part also stores where every card is drawn (`holdPlaces`), so a later change to the layout never slides a card out from under them.

The map marks what the revision did until the user marks it reviewed, from the Review tab or the command menu (`revisionMarks` in `src/canvas/revisionMarks.ts`).
A new or changed part carries a tab across the top edge of its card with the word New or Changed.
A new or changed connection carries the same tab against its label: above it, or below, left, or right when a card is in the way (`tabSide`).
New is solid ink and Changed is outlined, so the two differ without color, and the word says it in any case.
A part that the revision removed stays as a ghost where it was: a faint, hollow card with its name struck through and the tab Removed.
A ghost takes no pointer and no focus, and a fit frames it with the cards.
When the revision is marked reviewed, or the board opens again with no revision before it, the places of removed parts go too, from the layer and from its undo history, so they hold no new card off.
For a screen reader, the description of a part and the name of a connection start with the same words, for example "Changed in revision 2: summary."
The far view reads groups, so it shows no tabs and no ghosts.

When the revision arrives, what it added comes in where it lands (220 ms, from 96 percent size and no opacity), the tabs fade in with it, and the removed card fades into its ghost.
All of it starts at once, and nothing travels, because the map holds still.
With reduced motion, everything is at rest from the start.
A view that the reader left fitted stays fitted: when a revision brings a part or a ghost in beyond it, the whole board is framed again.
A view that the reader moved stays where it is.

### What arrived: the banner, the count, and the comparison

`revisionSummary(previous, current, feedback)` in `src/layer/revisionSummary.ts` is the one place that counts what a revision did.
It takes the added, changed, and removed parts and connections from `diffBoards`, the fields of the board's own words that changed from `changedFields`, and the answers from `responses`.
It counts only the answers to items in `layer.sent`, because the app drops the rest, and none when the revision does not rise.
`summaryLine` turns it into one sentence, such as "Revision 2: 5 answers, 1 new part, 1 changed part.", and `summaryTotal` into the count for the tab title.
The Review tab opens with the same sentence.
The map's markers and the Review list use `changes` from the same `diffBoards`, so nothing is compared twice.

When a revision opens over the same board, the reducer keeps the summary as `revisionNotice`.
`RevisionBanner` (`src/app/RevisionBanner.tsx`) shows it in the notices at the top of the map, until the user acts: **Review** opens the Review tab and the sidebar, **Dismiss** only closes the banner, and **Mark reviewed** closes it with the markers.
The banner stays away from the Overview, which says the same in Needs you.
It replaces the old toast, so the only toast that can come with a revision is the one that offers Undo for a tidied layout.
`useTabTitle` puts the count in front of the title of the tab, as "(4) Anatomy" and "(99+) Anatomy", for as long as the banner is there, so a revision that arrives in another tab shows in the tab strip.

After a send, the Send button reads **Waiting for the agent** while the revision that was sent is still the one open, some of the items sent have no answer, and the user has nothing new to send (`waitingForAgent` in `src/feedback/waiting.ts`).
A higher revision ends the wait, and a new note takes the button back as the primary action.
The wait comes from `layer.sent`, so a reload keeps it.

A changed part, connection, or the board shows what changed in its details, under "Changed in revision N" (`RevisionChange`; the word comparison in `RevisionFields` loads the first time one is opened).
`fieldChanges` in `src/inspector/fieldChanges.ts` lists the fields that differ in plain words, with the old words and the new.
`diffText` in `src/inspector/textDiff.ts` compares them by word, with no library, and marks the words that left (struck through) and the words that came (underlined), so the change reads without color.
It compares a text that has no spaces, such as Chinese or Japanese, by the words a reader sees, never splits an emoji, and marks two texts that share only a few scattered words as one change.
Long text that did not change is cut to about 80 characters around each change.

When the latest `board.json` cannot be opened, the board that is open stays, and a second quiet notice under the banner says why (`boardProblem`).
It is one of two: the file is not a valid board ("board.json has 2 problems, so revision 2 stays open", with the first problem), or it is valid and its revision is not higher ("board.json changed but is still revision 2").
A file that holds the open board unchanged says nothing.
The notice goes with Dismiss, or when a higher revision opens.

**Tidy layout** in the command menu lays the board out again, as if it opened for the first time (`tidyLayout`).
The cards that the user moved go back into the layout, and a card that the user resized keeps its size while the cards it covers step aside.
A mark or a proposed part over a card goes with the card that it covers most, and the other marks stay where they are.
The new places are stored, so the ghosts leave the map, and the whole board is framed once it is drawn.
It is one step of undo, and an undo or redo across it frames the board again.
Its toast closes once history moves, so its Undo never reaches a step before the tidy.
On a board that is laid out already, it says so and changes nothing.

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

Every connection ends in an arrowhead.
The head is the same size for every kind of line, so the kind shows in the dash and the width only.
It is 8 px long and 7 px across on screen, from the far end of the title level up to 100 percent, and above that it grows with the board as the lines do.
The marker is measured in board units and not in the width of the line, so a selected line does not grow its head.
The map's style scales it by `--label-scale`, the way it scales a label (`Canvas.module.css`).
`e2e/arrowheads.spec.ts` measures the heads from the page at 100 percent and at the title level.

While the user drags or resizes a card, the app redraws only the connections of that card.
It draws them as plain elbows and hides their labels.
After the drop, one full layout pass routes the connections and places the labels.
The labels keep off every card, every line, and every other label, and stay inside the box that Fit frames.
A label that has no place on one line tries two lines.
A connection keeps its route and label when its cards did not move or change size and the route is still clear.

A link that the user drags from the dot of a card is drawn in the dash and dot of the user's own links while it is dragged (`MANUAL_LINE` in `src/canvas/kinds.ts`), so it already looks like the link it becomes.

### The camera

The camera in `src/canvas/camera.ts` keeps the map inside limits.
The app works out the limits from the content: cards, group areas, marks, and proposed parts.
When a fit would land in the far view, the content also includes the routes of the far-view lines, which run around the outside of the cards.
In the far view a group's name never covers a tile, a bundled line, a count, another block, another name, or the name tag of a selected tile or of a tile in a walkthrough step (`farNames` in `src/canvas/farLabels.ts`).
It sits just above its block when that is free, cut short of the next name and of the right edge of the content.
When it is not, the name moves along the top edge, then down onto the edge and into the top of the block, and last just below the block.
At least half of it lies over its block, so it reads as the block's.
Where the block's edge runs across the name, the name is on the map's ground above the edge and on the block's wash below it.
A place for the whole name wins over a place where it is cut short, and a cut name keeps its count and a few letters.
A name with no free place is left off the map, like a count with no free place: it shows while it has focus, and a press on its block zooms in all the same.
The counts are placed after the names, so a count never sits under a name.
The far-view lines keep out of the room above each group where its name goes (`NAME_ROOM` and `NAME_SHARE` in `src/canvas/bundleRoutes.ts`), unless there is no other way through.
The fit asks for those routes only then.
The app solves them off the frame that commits a new layout, except in the far view and when a board opens.
Fit, every zoom out, the wheel, and framing a connection or a bundle solve them at once when they are not ready yet, so they never frame the last layout's lines.
After a drop or the release of a resize, the app solves the lines in slices of a frame, and a path search gives the frame back every 1,024 steps.
When the far view shows, the far-view lines are solved in the same slices, so the commit that ends the build has none left to solve.
The map zooms out only until the whole content fits, and never needs more than 100%.
It zooms in to 200%.
Panning stops a margin past the content.

React Flow applies the limits only to panning by the user.
For this reason, every camera move that the app makes goes through `clampViewport`.

When a board opens, the camera fits the whole board in the free part of the map: below the notices, and above the hint, the tool bars, and the line that says what is hidden.
The view stays fitted while the reader leaves it alone: a new size of the map frames the whole board again.
Until the reader first presses, types, or scrolls, any change frames it again, for example the hint coming in, or the fonts loading and the map being built again with its labels measured in them.
Once the reader has moved the view, a new size of the map keeps the middle of the view and the zoom.
The zoom limits keep the room that the hint took, so dismissing the hint never zooms the view in.

The room at the bottom also holds one toast, in the slot above the tool bars where the hint sits (`TOAST_ROOM` and `coveredBottom` in `src/canvas/camera.ts`).
The fit leaves the same room with the hint and without it, so a toast never lands on a card of a fitted view.
The map sets `--toast-base` (the toast's distance from the bottom of the window) and `--toast-x` (the middle of the map), and the toaster reads them.
A walkthrough bar sets `--toast-floor` instead, which puts the toast above the bar.
The map sets the two values only while the map is in front: under the Overview, and in the how-to dialog, a toast sits in the middle of the window.

The map has three detail levels, chosen from the zoom:
- `full`, at 75% and up: cards show their title, summary, and badges, with every line and label.
- `title`, from 45% to 75%: cards show their title alone, centred at 12 px on screen, and keep every line and label.
  A card holds as many lines of title as fit inside it, from one to three.
- `far`, below 45%: groups show as named blocks, and lines bundle per pair of groups.

Opening a board picks the level from its fit zoom alone.
After that, each boundary has a band: the map leaves the title level for full cards only at 79%, and leaves the far view only at 49%.
For this reason, a resize of a few pixels at a boundary does not flip the level back and forth.
At every level, card titles and line labels are drawn larger on the board so that they are never under 11 px on screen.
Label placement does not know the zoom, so each label keeps clear of the room that the labels around it grow into at the low end of the title level.
A label that finds no such place keeps clear of a smaller room, and takes the place that overlaps the others least.
On a crowded map, connection labels show below 90% zoom only for the selection and for the card under the pointer.
Whenever a view hides lines or labels, a quiet line in the bottom right of the map says what is hidden.

## User layer, version 2

```ts
interface Layer {
  format: 'anatomy-layer'
  schemaVersion: 2
  boardId: string
  positions: Record<string, { x: number; y: number }> // only the cards the user moved, by component ID
  sizes: Record<string, { width: number; height: number }> // only the cards the user resized
  placed?: Record<string, { x: number; y: number; width: number; height: number }> // where the map holds every card, once it must hold still
  notes: Note[] // note or question about the board, a component, or a relationship
  links: Link[] // a line the user drew between two parts
  marks: Mark[] // whiteboard: stroke, rect, ellipse, arrow, text, sticky
  proposals: Proposal[] // a new part the user sketched: label, summary, rect
  reconnects: Reconnect[] // { relationshipId, from?, to? }: moved ends of an agent connection
  archive: ArchiveEntry[] // items the agent resolved or the user dismissed, each with its answer, restorable
  answers: Answer[] // { id, response }: the agent's latest answer to an item still on the map
  kept: string[] // answers the user kept, by item ID: the item and its answer stay on the map, and the answer no longer waits in the Review tab
  sent?: Sent // what was sent to the agent so far, with a fingerprint per item
}
```

The Zod schema in `src/layer/model.ts` is the source of the types.
A field at the top of the layer that this version does not know, written by a later version, is left out when the layer is read, so the user's work still opens; every field it knows is checked as before.
In a repository folder, the whole file is then kept once as `layer.backup.json`, since the next save leaves those fields out, and a notice says so.
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
- A tidy of the layout.
- A change to a note, link, mark, proposal, reconnect, or archive.

Selection, tool, theme, camera, and walkthroughs are not part of the history.
Opening a revision and sending feedback are barriers, so nothing before them can be undone.
A revision that was tidied to make room for a new part keeps one step: the still layout before the tidy.
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
Navigation commands use unified naming under the Go to group, offering Go to Board and Go to Overview on the map, and Go to Map on the Overview page.
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
A tool that is on when the window narrows to a phone goes back to Select.
On a phone the command menu lists no tool, omits desktop-only View commands (sidebar toggle, zoom steps, and line key), and prints no shortcuts, and the tool keys do nothing.

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

The sidebar starts with a 40 px header row that stays pinned on desktop and on the phone sheet.
When a part, connection, bundle, or user item is selected, the left side of the header shows a quiet `Board` button that clears the selection; otherwise it shows `Board` (or `Review`).
The right side of the header renders the `Segmented` switch (`Details` and `Review`) only when Review has entries, so no disabled tab appears on boards with nothing to review and nothing shifts when a revision arrives.
The app keeps the width of the sidebar (300 to 520) and whether it is open, for each browser.
On a screen 760 px wide or less, the sidebar is a bottom sheet with three stops.
The user drags the sheet by its header only.

Every view in the sidebar aligns its content to two left edges (16 px and 38 px), uses 13 px semibold section headings with trailing chevrons and 20 px between sections, and drops hairlines between sections.
With nothing selected, the board view shows the title, full goal, one meta line (`boardMeta` in `src/inspector/boardMeta.ts`), the shared Start here section (`src/overview/StartHere.tsx`, showing walkthrough scenarios and interactive lessons), Yours, and Notes.
A selected part reads top to bottom: eyebrow (`Part` and its group button, which frames the group), title, summary, source line (always shown, including for the agent's own explanation), a raised Lesson row when the part has a lesson, Explanation (uncut up to 320 px, then cut cleanly between blocks when at least 40 px is hidden via `explanationCut` in `src/inspector/explanationClamp.ts`, followed by Takes in and Gives out), one Connections section (`connectionRows` in `src/inspector/flowRows.ts`, incoming first, with `Add link` in the heading), Open items, Cited (closed by default), and Notes directly above the pinned composer.
After adding a note by pointer or keyboard, the scroll area brings the new note fully above the composer and holds a 600 ms `--yours-tint` flash; under `prefers-reduced-motion: reduce`, it scrolls immediately without flashing.

A lesson dialog is not part of the sidebar, so resizing across that width keeps it open, with its run.
The open lesson is held in the screen state and drawn once, by the shell (`src/app/LessonHost.tsx`).
It closes when another board opens, when the board closes, or when a new revision of the same board no longer has the part that opened it with that lesson.
Closing it returns focus to the lesson row that stands on the screen then.
Inert, hidden, and below-the-screen places are skipped.
If no row can take it, focus goes to the panel heading, then the first control of the panel, then the Overview page, then the Show sidebar button, then Search (`src/app/lessonFocus.ts`).
Focus never falls to the page.
Once the user has made something, the Yours list on the board view has a Status key button.
It opens the seven status glyphs, each with its word and what it means (`src/status/StatusKey.tsx`).

## The Overview page

The Overview page (`src/overview/`) uses a container query (`@container overview (min-width: 960px)`) to choose between two columns and one column.
At 960 px or wider, the page shows a main column and a sticky 280 px rail inside a 1,040 px container.
The main column holds the head (`<h1>` title at 24/30, the goal capped to 68 ch and four lines with a "Show more" link only when a full line is hidden, and a quiet meta line of jump links), "Needs you" when something waits, "Start here" (`src/overview/StartHere.tsx`), Parts, Connections, and Open questions.
The rail holds Scope (Covers and Does not cover, each capped at five items with a "Show all N" link) and Details (Revision, Last sent, and Undecided).
Below 960 px, the page collapses to one 720 px column in the order: head, Needs you, Start here, Scope (capped at three items), Parts, Connections, Open questions, and Details.

"Needs you" is the only raised block on the page and appears only when answers, relinking, outdated notes, revision changes, or unsent items wait; its "Send to agent" button uses the primary fill.
The Parts section has a quiet filter input and a column header row ("Part", "What it does", "Lesson", "Open", "Yours") aligned with the fixed-width right slots of each row.
Part names align with their group label, connection counts ("N in, M out") live in the row's accessible name and tooltip, and the source icon appears on a row only for undecided agent proposals.

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
Declined and answered items keep their answer until the user settles them.
Each one shows in the Review tab with **Keep**, **Dismiss**, and **Reply**.
Keep records the answer in `layer.kept`: the item and its answer stay on the map, and the answer no longer waits for a decision.
The answer stays readable next to the item, and a later revision that answers the same item again clears the mark, so the new answer waits.
Dismissing archives the item and its answer as one step of undo.
Reply opens the note input on the item's target, holding the item's own words, so a follow-up question starts from what was asked.
For an item that is not a note, Reply opens the item's own view, where its words are edited.

**J** and **K** step through the answers that wait, one card at a time (`stepReview` in `src/commands/list.ts`).
The card in front holds the keyboard focus, so the step always starts from it, and its row is pressed the way a finger would: the map selects and frames the item, and the spotlight shows it.
When the selection is already on the item, the map does not move on its own, so the step frames it.
The keys work only while the Review tab is in front, and never while a text field has the focus.

The app never takes in an answer twice.
For this reason, an item restored from the archive stays restored when the same revision opens again.

The Review tab lists these things:

- The answers that wait for a decision, each with Keep, Dismiss, and Reply, and the adopted items of this revision under them.
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
While the page is hidden, it keeps looking, every 10 seconds, so a revision that arrives in another tab is found and counted in the tab title.
It also looks at once when the window gains focus or the page becomes visible.
Each look compares the modification time and the size of the file.
The app reads the file only after the file stayed the same for two looks in a row.
It opens the file only if the file is valid and its `revision` is higher.
A new revision goes through the update review.
A file that was read and not opened keeps the board that is open, and shows a quiet notice once for each change of the file (`onProblem` in `src/workspace/watch.ts`).
A look that cannot read the folder shows nothing and tries again.

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
- the map outlines of the examples and the code that draws them, right after the start screen first paints;
- the how-to dialog, on first use;
- the text of the files written into `.anatomy/` (the README, the guide, the schema), when the app writes them;
- a lesson, and the bundled `anatomy` tool, on first use.

`src/app/examples.ts` is the index of the examples: the title, the description, the file name, the board ID, and a `load` function for each.
`src/app/exampleOutlines.generated.ts` holds the packed map outlines generated by `npm run outlines` from `src/examples/*.board.json` using the real layout and edge router.
`src/app/examples.test.ts` checks the index against the real board files, and `src/app/emptyState.test.tsx` checks the generated outlines against them, so they cannot drift.
The generator calls `computeGeometry`, the same function the map uses, so the outlines follow any change to the layout or the line routing.
`src/app/ExamplePreview.tsx` reads the outlines and draws the miniature, and loads on its own script, so the first script stays small.
The start screen draws a miniature SVG preview of each example from its outline and shows three short steps for using your own agent, while loading no example board.
The steps follow the browser: where it cannot open folders, the last step opens a board file instead of a folder.
After the first paint (the load event, then two animation frames, then an idle moment), the app fetches the map and the example boards, so a board opens at once and still opens if the server has stopped.
If a script cannot load, the user sees a short notice, and the rest of the app keeps working.
Sending feedback to a folder still writes `feedback.json` when the text of the `.anatomy/` files cannot load.

`scripts/firstLoad.test.ts` builds the app and checks that the first script holds no example board, no part of the command line tool, and no map view, that it does not load any of them at start, and that it stays under a byte budget.

## The icon and the mark

The page has an SVG icon, `public/favicon.svg`, which `index.html` links by a path that Vite rewrites to a relative one, so the hosted copy finds it under `/Anatomy/` and the zip finds it in its folder.
The icon is the mark of Anatomy, Blade: an A cut from one solid form, one path in one flat ink with no tile behind it.
The file carries the two values of `--fg` itself, `#1a1b23` and `#e8e9ef`, and switches between them with `prefers-color-scheme` inside the SVG, because an icon cannot read the tokens of the page.
If `--fg` changes, change the icon to match.
The same path is `BrandMark` in `src/app/BrandMark.tsx`, filled with `var(--fg)` so it follows the theme with the text.
It sits 4 px from the word "Anatomy" on the start screen and stays in the Open menu trigger once a board is open, at 16 px in both places.
The drawing is fitted to 16 px on a 24 grid: its flat top, its baseline, and its feet fall on whole pixels at 16, 32, 48, and 64 px, and between pixels at 18, 20, and 24 px.
`src/app/BrandMark.test.tsx` holds the mark to one path and to the same drawing as the icon.
The page has two `theme-color` tags, one for each color scheme, in the color of the top bar (`--frame`).
`public/theme.js` and `src/theme/theme.ts` give both tags the color of the theme in use, so the browser bar follows a stored choice and the settings menu.
`scripts/identity.test.ts` holds the colors of the icon and of the tags to the tokens.

## The hosted copy

The hosted copy is the built app on GitHub Pages, at https://snitilf.github.io/Anatomy/.
It is the same app, and it has no server of its own.

There is one build, `npm run build`, with the Vite base path `./`.
Every file the built page asks for is addressed relative to the page, so the same build serves the hosted copy under `/Anatomy/`, the release zip from its folder, and the browser tests from the root.
The dev server serves from the root.
`.github/workflows/pages.yml` builds and deploys it on each push to `main` and when someone runs it by hand.
Its jobs run only while the repository is public.
Once, after the repository is public, set Source to GitHub Actions under Settings, Pages.

Nothing in the app assumes that it sits at the root of the site.
Vite writes relative addresses into `index.html`, the font addresses in the stylesheet, and the entry script's preload helper.
The map and the example boards load as scripts, by a path relative to the script that asks for them.
The app keeps the path of its own page when it changes the address.
The Content Security Policy is the same, so the page requests only its own files, and every one of them is under `/Anatomy/`.

`e2e/pages.spec.ts` builds the app with `npm run build` into `dist-pages/` and serves it under `/Anatomy/` on the loopback interface (`scripts/lib/subpathServer.ts`).
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

## The release zip

A tag that starts with `v` runs `.github/workflows/release.yml`.
It stops at once when the tag is not `v` plus `version` in `package.json`, or when `docs/release-notes/<version>.md` is missing.
Then it runs the same gates as CI, builds the app again without the `e2e` mode, and zips one folder, `anatomy-<version>`.
`scripts/package-release.ts` makes that folder from `dist/`, `scripts/release/serve.mjs`, and `scripts/release/README-run.txt`.
The workflow unzips the result, starts the server, and checks that the page loads, before it creates the GitHub Release with the notes file.

A page that uses ES modules does not run from `file://`, so the zip needs a server.
`serve.mjs` is one file with no packages, so the only requirement is Node.js.
It listens on `127.0.0.1` only, serves `GET` and `HEAD`, and answers 404 for any path that leaves the build folder.
`scripts/release.test.ts` tests it, and `e2e/release.spec.ts` stages the folder the same way, starts the server, and opens an example with no console error and no request outside the page's own origin.
`docs/release-checklist.md` lists what a person checks before tagging, including the real folder picker, which the browser tests replace with a stand-in.
`npm run test:browsers` runs `e2e/journey.spec.ts` in WebKit and Firefox by hand, and CI leaves them out.

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
