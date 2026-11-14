# Anatomy

Anatomy is a local browser app that turns a plan, feature, or project into a visual explanation that you can explore, question, and annotate.
Your coding agent writes a board, a JSON document in `.anatomy/board.json` that describes the parts of a system, how they connect, and walkthroughs of a journey.
You mark the board up, send your marks back with Send to agent, and the agent answers them in its next revision.
The app runs in the browser on your own machine and does not send board data to any server.

## Documentation

- [Board format](docs/board-format.md): every field of a board file and what Anatomy checks.
- [Authoring guide](docs/authoring-guide.md): give this and the JSON Schema to your coding agent so it can write a board.
- [Architecture](docs/architecture.md): modules, the user layer, the repository folder, storage, undo, and safety.

## Requirements

- Node.js 24 or later (see `.nvmrc`).
- npm 11 or later.

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Installs the exact versions in `package-lock.json`. |
| `npm run dev` | Starts the dev server on `http://127.0.0.1:5173`. |
| `npm run build` | Type-checks and builds the static app into `dist/`. |
| `npm run preview` | Serves the built app on `127.0.0.1`. |
| `npm run typecheck` | Runs the TypeScript compiler in strict mode. |
| `npm run lint` | Runs oxlint. |
| `npm test` | Runs the unit tests once with Vitest. |
| `npm run check` | Runs type-check, lint, and tests in sequence. |
| `npm run test:e2e` | Builds the app in the `e2e` mode and runs the browser tests with the installed Google Chrome. |
| `npm run schema` | Writes `schema/board.v1.schema.json` from the Zod schema. Run it after a schema change. |

The dev and preview servers listen on the loopback interface only.

## Stack

All versions are exact.
`.npmrc` sets `save-exact=true`, so new dependencies are also pinned.

| Package | Version | Purpose |
| --- | --- | --- |
| `react`, `react-dom` | 19.3.1 | UI |
| `@xyflow/react` | 12.12.1 | Canvas for cards and connections (React Flow, MIT core) |
| `zod` | 4.6.7 | Runtime validation of board files |
| `zustand` | 5.1.0 | App state store, read through selectors |
| `@base-ui/react` | 1.9.0 | Accessible menus, popovers, tabs, and tooltips |
| `cmdk` | 1.1.1 | The command menu and the searchable part pickers |
| `sonner` | 2.0.8 | Short confirmations |
| `clsx` | 2.1.1 | Conditional class names |
| `lucide-react` | 1.72.0 | Icons |
| `@dagrejs/dagre` | 3.1.3 | Layered layout of the cards (MIT) |
| `perfect-freehand` | 1.2.3 | Smooth outlines for pen lines on the whiteboard (MIT) |
| `@fontsource-variable/inter` | 5.3.0 | Inter, bundled with the app so no font loads from the network |
| `typescript` | 7.0.2 | Type checking, strict mode |
| `vite` | 8.3.8 | Dev server and build |
| `@vitejs/plugin-react` | 6.3.0 | React support for Vite |
| `vitest` | 5.1.0 | Unit tests |
| `jsdom` | 31.0.1 | Browser environment for tests |
| `@testing-library/react` | 16.3.3 | Component tests |
| `@testing-library/jest-dom` | 7.0.1 | DOM assertions for tests |
| `oxlint` | 1.93.0 | Linting |
| `ajv` | 8.20.0 | Tests the exported JSON Schema with an independent validator |
| `fake-indexeddb` | 6.2.8 | IndexedDB in unit tests |
| `@playwright/test` | 1.65.0 | Browser journey test |

Versions recorded on November 13, 2026.

## Licenses

The approval-gate lesson uses the Anatomy kit by wheresryan22 (MIT).
Its license and source commit are in `src/lessons/kit/`.

The production dependency tree is MIT, ISC, and BSD-3-Clause as of November 13, 2026, plus the Inter font under the SIL Open Font License 1.1.
Review the locked tree again before any public release.
