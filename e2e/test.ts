import { test as base, expect } from '@playwright/test'

export interface Violation {
  directive: string
  blocked: string
  sample: string
  source: string
}

/** The policy violations a test has seen. `take` hands them to a test that provokes one on purpose and clears them. */
export interface Violations {
  list: Violation[]
  take: () => Violation[]
}

/**
 * The test of the whole browser suite.
 * Every page of the test records `securitypolicyviolation` events, and the test fails when any is left over at its end.
 * A test that breaks the policy on purpose reads them with `violations.take()`.
 */
export const test = base.extend<{ violations: Violations }>({
  violations: [
    async ({ context }, use) => {
      const list: Violation[] = []
      await context.exposeBinding('__anatomyViolation', (_source, v: Violation) => {
        list.push(v)
      })
      await context.addInitScript(() => {
        const w = window as unknown as { __anatomyViolation: (v: unknown) => Promise<void>; __anatomyFlush: () => Promise<void> }
        const pending: Promise<void>[] = []
        document.addEventListener('securitypolicyviolation', (e) => {
          pending.push(w.__anatomyViolation({ directive: e.violatedDirective, blocked: e.blockedURI, sample: e.sample, source: e.sourceFile }))
        })
        // The event is dispatched on a task of its own and the binding call crosses to the test process, so a test must wait for both.
        w.__anatomyFlush = async () => {
          await new Promise((resolve) => setTimeout(resolve, 0))
          await Promise.all(pending.splice(0))
        }
      })
      await use({
        list,
        take: () => list.splice(0, list.length),
      })
      // A violation can still be on its way when the test body ends, on any page and in any frame.
      for (const page of context.pages()) {
        if (page.isClosed()) continue
        for (const frame of page.frames()) {
          await frame.evaluate(() => (window as unknown as { __anatomyFlush?: () => Promise<void> }).__anatomyFlush?.()).catch(() => undefined)
        }
      }
      expect(list, 'the page broke its Content Security Policy').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
