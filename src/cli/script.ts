// The first lines of `.anatomy/anatomy.mjs`, the bundled `anatomy` tool that the app writes next to `.anatomy/README.md`.

/** The first line. A file that starts with it is Anatomy's, and Anatomy replaces it when the format changes. */
export const SCRIPT_MARK = '// Written by Anatomy, which replaces this file when the format changes. Delete this line to keep your own version.'

/**
 * The lines above the bundled code. The second line saves an agent from reading the minified code, and the last two
 * tell the project's linter and type checker to skip a file that the project did not write.
 */
export const SCRIPT_BANNER = `${SCRIPT_MARK}
// It checks and edits .anatomy/board.json the way Anatomy does. Run it, there is no need to read it: node .anatomy/anatomy.mjs help
/* eslint-disable */
// @ts-nocheck
`

/** True when an existing script must stay as it is: the user took it over, or it is already current. */
export function keepScript(existing: string, current: string): boolean {
  return existing === current || !existing.startsWith(SCRIPT_MARK)
}
