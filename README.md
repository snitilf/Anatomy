# Anatomy

Anatomy is a local browser app that turns a plan, feature, or project into a visual explanation that you can explore, question, and annotate.
It opens a board file, which is a JSON document that describes the parts of a system, how they connect, and named scenarios that walk through a journey.
The app runs in the browser on your own machine and does not send board data to any server.

The project is at an early stage.
The current build shows an empty screen and no board features yet.

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

The dev and preview servers listen on the loopback interface only.

## Stack

All versions are exact.
`.npmrc` sets `save-exact=true`, so new dependencies are also pinned.

| Package | Version | Purpose |
| --- | --- | --- |
| `react`, `react-dom` | 19.3.1 | UI |
| `@xyflow/react` | 12.12.1 | Canvas for cards and connections (React Flow, MIT core) |
| `zod` | 4.6.7 | Runtime validation of board files |
| `typescript` | 7.0.2 | Type checking, strict mode |
| `vite` | 8.3.8 | Dev server and build |
| `@vitejs/plugin-react` | 6.3.0 | React support for Vite |
| `vitest` | 5.1.0 | Unit tests |
| `jsdom` | 31.0.1 | Browser environment for tests |
| `@testing-library/react` | 16.3.3 | Component tests |
| `@testing-library/jest-dom` | 7.0.1 | DOM assertions for tests |
| `oxlint` | 1.93.0 | Linting |

Versions recorded on November 13, 2026.

## Licenses

The production dependency tree is MIT, ISC, and BSD-3-Clause as of November 13, 2026.
Review the locked tree again before any public release.
