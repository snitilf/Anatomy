import { test as base, expect } from '@playwright/test'
import { recordViolations, type Violation } from '../scripts/lib/violations.ts'

export type { Violation }

/** The policy violations a test has seen. `take` hands them to a test that provokes one on purpose and clears them. */
export interface Violations {
  list: Violation[]
  take: () => Violation[]
}

/**
 * The test of the whole browser suite.
 * Every page of the test records `securitypolicyviolation` events, and the test fails when any is left over at its end.
 * A test that breaks the policy on purpose reads them with `violations.take()`.
 * The recorder and its end-of-test check are in `scripts/lib/violations.ts`, where a unit test drives them with fakes.
 */
export const test = base.extend<{ violations: Violations }>({
  violations: [
    async ({ context }, use) => {
      const recorder = await recordViolations(context)
      await use({ list: recorder.list, take: recorder.take })
      await recorder.finish()
    },
    { auto: true },
  ],
})

export { expect }
