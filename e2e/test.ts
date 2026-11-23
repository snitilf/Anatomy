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
        document.addEventListener('securitypolicyviolation', (e) => {
          const report = (window as unknown as { __anatomyViolation: (v: unknown) => void }).__anatomyViolation
          report({ directive: e.violatedDirective, blocked: e.blockedURI, sample: e.sample, source: e.sourceFile })
        })
      })
      await use({
        list,
        take: () => list.splice(0, list.length),
      })
      expect(list, 'the page broke its Content Security Policy').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
