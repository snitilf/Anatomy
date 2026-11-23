/**
 * The record of Content Security Policy violations for the browser tests.
 * It is written against small interfaces, so a unit test can drive it with fakes (see violations.test.ts).
 */
export interface Violation {
  directive: string
  blocked: string
  sample: string
  source: string
}

export interface FrameLike {
  evaluate(script: () => unknown): Promise<unknown>
}
export interface PageLike {
  isClosed(): boolean
  frames(): FrameLike[]
}
export interface ContextLike {
  exposeBinding(name: string, callback: (source: unknown, violation: Violation) => void): Promise<unknown>
  addInitScript(script: () => void): Promise<unknown>
  pages(): PageLike[]
}

export interface Recorder {
  /** The violations seen so far. */
  list: Violation[]
  /** Hands the violations to a test that breaks the policy on purpose, and clears them. */
  take: () => Violation[]
  /** Waits for every violation that is still on its way, on every open page and frame, then throws if any was seen. */
  finish: () => Promise<void>
}

const BINDING = '__anatomyViolation'

/**
 * Runs in the page before its own scripts. It sends every violation to the test process.
 * It must stay self-contained: the browser gets its source text only.
 */
export function installViolationRecorder(): void {
  const w = window as unknown as { __anatomyViolation: (v: unknown) => Promise<void>; __anatomyFlush: () => Promise<void> }
  const pending: Promise<void>[] = []
  document.addEventListener('securitypolicyviolation', (e) => {
    pending.push(w.__anatomyViolation({ directive: e.violatedDirective, blocked: e.blockedURI, sample: e.sample, source: e.sourceFile }))
  })
  // The event comes on a task of its own and the call crosses to the test process, so the flush waits for a task, then for every call.
  // It loops, because a violation can arrive while it waits for another.
  w.__anatomyFlush = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    while (pending.length > 0) await Promise.all(pending.splice(0))
  }
}

export async function recordViolations(context: ContextLike): Promise<Recorder> {
  const list: Violation[] = []
  await context.exposeBinding(BINDING, (_source, violation) => {
    list.push(violation)
  })
  await context.addInitScript(installViolationRecorder)
  return {
    list,
    take: () => list.splice(0, list.length),
    finish: async () => {
      for (const page of context.pages()) {
        if (page.isClosed()) continue
        for (const frame of page.frames()) {
          // A frame that is navigating or gone has nothing left to report.
          await frame.evaluate(() => (window as unknown as { __anatomyFlush?: () => Promise<void> }).__anatomyFlush?.()).catch(() => undefined)
        }
      }
      if (list.length > 0) throw new Error(`the page broke its Content Security Policy: ${JSON.stringify(list)}`)
    },
  }
}
