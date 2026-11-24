/// <reference types="vite/client" />
// The example list imports its boards with `?raw`, which these types describe.
import { parseArgs } from 'node:util'
import { EXAMPLES } from '../../src/app/examples.ts'

/** What to light up in the picture. */
export interface Shot {
  /** Matches the example's button on the start screen, which is named by its title and description. */
  example: RegExp
  /** The walkthrough's title as the command menu lists it. */
  walkthrough: string
  /** The step to stop on, counted from 1. */
  step: number
  /** Close the sidebar first, so the map gets the whole window. */
  hideSidebar?: boolean
  width?: number
  height?: number
}

/**
 * The picture the README shows.
 * The Claude Code harness is the example a reader of a coding-agent tool knows best, and at 1440x900 its whole map fits in view,
 * with its three groups and every line label readable. Step 2 of "Fix a failing test" lights the agent loop, the model, and the
 * lines between them, so the picture shows both a lit path and the dimmed rest of the map. The sidebar stays open: it lists the
 * four walkthroughs.
 */
export const README_SHOT: Shot = { example: /Claude Code harness/, walkthrough: 'Fix a failing test', step: 2 }

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** An example by its id (`claude-code`) or by a part of its title, in any case. The text is never read as a pattern. */
function findExample(name: string): RegExp {
  const wanted = name.trim().toLowerCase()
  const found = wanted === '' ? undefined : (EXAMPLES.find((e) => e.id === wanted) ?? EXAMPLES.find((e) => e.title.toLowerCase().includes(wanted)))
  if (!found) throw new Error(`No built-in example matches "${name}". Use an id (${EXAMPLES.map((e) => e.id).join(', ')}) or a part of a title.`)
  return new RegExp(escape(found.title))
}

function whole(name: string, text: string): number {
  if (!/^[1-9]\d*$/.test(text)) throw new Error(`--${name} must be a positive whole number, not "${text}".`)
  return Number(text)
}

/** Reads the command line of `scripts/readme-images.ts`. It throws a clear message for a value that cannot work. */
export function readShot(argv: readonly string[]): { shot: Shot; out: string | undefined } {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      example: { type: 'string' },
      walkthrough: { type: 'string' },
      step: { type: 'string' },
      out: { type: 'string' },
      'hide-sidebar': { type: 'boolean' },
      width: { type: 'string' },
      height: { type: 'string' },
    },
  })
  const shot: Shot = {
    example: values.example === undefined ? README_SHOT.example : findExample(values.example),
    walkthrough: values.walkthrough ?? README_SHOT.walkthrough,
    step: values.step === undefined ? README_SHOT.step : whole('step', values.step),
    ...(values['hide-sidebar'] ? { hideSidebar: true } : {}),
    ...(values.width === undefined ? {} : { width: whole('width', values.width) }),
    ...(values.height === undefined ? {} : { height: whole('height', values.height) }),
  }
  return { shot, out: values.out }
}
